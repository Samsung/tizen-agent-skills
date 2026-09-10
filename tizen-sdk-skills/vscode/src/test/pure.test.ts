// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/test/pure.test.ts — unit tests for the vscode-free install logic.
//
// Bundled to dist/tests.js by esbuild.config.js and run with `npm test`.
// Kept in the same style as the plain-node tests under common/lib/tests.
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { matchHostByExtensionId, resolveTargets } from "../install/targets";
import {
  HOOK_SPECS,
  HookEntry,
  buildHookEntry,
  describeHooksShapeError,
  detectIndent,
  hookCommandPath,
  hookCommandsOf,
  isOurHookEntry,
  preToolUseEntries,
  stripOurHooks,
} from "../install/claudeSettings";
import {
  isSafeName,
  needsSync,
  readManifest,
  removeManifest,
  staleEntries,
  writeManifest,
} from "../install/manifest";

let failures = 0;
let passes = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ok  ${name}`);
  } catch (e: unknown) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("targets.matchHostByExtensionId");

test("Cline's own id resolves to Cline, not Claude", () => {
  // The exact regression the substring matcher had: "saoudrizwan.claude-dev"
  // contains "claude" and does not contain "cline".
  assert.deepStrictEqual(matchHostByExtensionId("saoudrizwan.claude-dev"), {
    claude: false,
    cline: true,
  });
});

test("Cline nightly resolves to Cline", () => {
  assert.deepStrictEqual(
    matchHostByExtensionId("saoudrizwan.claude-dev-nightly"),
    {
      claude: false,
      cline: true,
    },
  );
});

test("a Cline fork under another publisher still resolves to Cline", () => {
  assert.deepStrictEqual(matchHostByExtensionId("samsung-sr.cline"), {
    claude: false,
    cline: true,
  });
  assert.deepStrictEqual(matchHostByExtensionId("samsung-sr.claude-dev"), {
    claude: false,
    cline: true,
  });
});

test("Claude Code resolves to Claude", () => {
  assert.deepStrictEqual(matchHostByExtensionId("anthropic.claude-code"), {
    claude: true,
    cline: false,
  });
});

test("id matching is case-insensitive", () => {
  assert.deepStrictEqual(matchHostByExtensionId("Anthropic.Claude-Code"), {
    claude: true,
    cline: false,
  });
});

test("unrelated extensions match nothing", () => {
  for (const id of [
    "ms-python.python",
    "acme.claudia-theme",
    "vendor.declineddiff",
  ]) {
    assert.deepStrictEqual(
      matchHostByExtensionId(id),
      { claude: false, cline: false },
      `${id} should not match a host`,
    );
  }
});

console.log("targets.resolveTargets");

test("explicit settings override detection", () => {
  const none = { claude: false, cline: false };
  assert.deepStrictEqual(resolveTargets("claude", none), {
    claude: true,
    cline: false,
  });
  assert.deepStrictEqual(resolveTargets("cline", none), {
    claude: false,
    cline: true,
  });
  assert.deepStrictEqual(resolveTargets("both", none), {
    claude: true,
    cline: true,
  });
});

test("auto and unknown values fall back to detection", () => {
  const detected = { claude: true, cline: false };
  assert.deepStrictEqual(resolveTargets("auto", detected), detected);
  assert.deepStrictEqual(resolveTargets("nonsense", detected), detected);
});

console.log("claudeSettings.hookCommandPath");

test("windows paths are emitted with forward slashes for bash", () => {
  assert.strictEqual(
    hookCommandPath(
      "C:\\Users\\me\\.claude\\hooks\\tizen-sdk-skills",
      "check-tizen-commands.sh",
    ),
    "C:/Users/me/.claude/hooks/tizen-sdk-skills/check-tizen-commands.sh",
  );
});

test("a trailing separator does not produce a doubled slash", () => {
  assert.strictEqual(
    hookCommandPath(
      "/home/me/.claude/hooks/tizen-sdk-skills/",
      "check-project-writes.sh",
    ),
    "/home/me/.claude/hooks/tizen-sdk-skills/check-project-writes.sh",
  );
});

test("entries we build carry no non-schema marker keys", () => {
  const entry = buildHookEntry(
    "/home/me/.claude/hooks/tizen-sdk-skills",
    HOOK_SPECS[0],
  );
  const entryKeys = Object.keys(entry).sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(entryKeys, ["hooks", "matcher"]);
  const hookKeys = Object.keys(entry.hooks[0]).sort((a, b) =>
    a.localeCompare(b),
  );
  assert.deepStrictEqual(hookKeys, ["command", "type"]);
});

console.log("claudeSettings.isOurHookEntry / stripOurHooks");

const OUR_DIR = "/home/me/.claude/hooks/tizen-sdk-skills";

test("an entry is recognised by its command path", () => {
  assert.strictEqual(
    isOurHookEntry(buildHookEntry(OUR_DIR, HOOK_SPECS[0])),
    true,
  );
});

test("a windows-style command path is recognised", () => {
  assert.strictEqual(
    isOurHookEntry({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command:
            'bash "C:\\Users\\me\\.claude\\hooks\\tizen-sdk-skills\\check-tizen-commands.sh"',
        },
      ],
    }),
    true,
  );
});

test("legacy _source-tagged entries are still recognised", () => {
  // Builds before the rename tagged their entries `tizen-sdk-agents`.
  for (const tag of ["tizen-sdk-agents", "tizen-sdk-skills"]) {
    assert.strictEqual(
      isOurHookEntry({
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: 'bash "/somewhere/else.sh"',
            _source: tag,
          },
        ],
      }),
      true,
      `hook-level _source ${tag}`,
    );
    assert.strictEqual(
      isOurHookEntry({ _source: tag, hooks: [] }),
      true,
      `entry-level _source ${tag}`,
    );
  }
  assert.strictEqual(
    isOurHookEntry({ _source: "someone-elses-plugin", hooks: [] }),
    false,
  );
});

test("entries pointing into the pre-rename hook directory are ours", () => {
  assert.strictEqual(
    isOurHookEntry({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command:
            'bash "/home/me/.claude/hooks/tizen-sdk-agents/check-tizen-commands.sh"',
        },
      ],
    }),
    true,
  );
});

test("foreign entries are not ours", () => {
  assert.strictEqual(
    isOurHookEntry({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: 'bash "/home/me/.claude/hooks/my-own-guard.sh"',
        },
      ],
    }),
    false,
  );
  assert.strictEqual(isOurHookEntry({ matcher: "Bash", hooks: [] }), false);
  assert.strictEqual(isOurHookEntry(null), false);
  assert.strictEqual(isOurHookEntry("nope"), false);
});

test("a mixed entry is left alone rather than half-deleted", () => {
  assert.strictEqual(
    isOurHookEntry({
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: `bash "${OUR_DIR}/check-tizen-commands.sh"`,
        },
        { type: "command", command: 'bash "/home/me/mine.sh"' },
      ],
    }),
    false,
  );
});

test("stripOurHooks removes only our entries and reports the count", () => {
  const foreign = {
    matcher: "Bash",
    hooks: [{ type: "command", command: 'bash "/home/me/mine.sh"' }],
  };
  const settings = {
    hooks: {
      PreToolUse: [
        foreign,
        ...HOOK_SPECS.map((s) => buildHookEntry(OUR_DIR, s)),
        {
          _source: "tizen-sdk-agents",
          hooks: [{ type: "command", command: "legacy" }],
        },
      ],
    },
    permissions: { allow: ["Bash"] },
  };

  const removed = stripOurHooks(settings);
  assert.strictEqual(removed, HOOK_SPECS.length + 1);
  assert.deepStrictEqual(settings.hooks.PreToolUse, [foreign]);
  assert.deepStrictEqual(settings.permissions, { allow: ["Bash"] });
});

test("re-installing twice does not accumulate entries", () => {
  const settings: { hooks: { PreToolUse: HookEntry[] } } = {
    hooks: { PreToolUse: [] },
  };
  for (let i = 0; i < 3; i++) {
    stripOurHooks(settings);
    for (const spec of HOOK_SPECS)
      settings.hooks.PreToolUse.push(buildHookEntry(OUR_DIR, spec));
  }
  assert.strictEqual(settings.hooks.PreToolUse.length, HOOK_SPECS.length);
});

test("stripOurHooks tolerates a settings file with no hooks", () => {
  assert.strictEqual(stripOurHooks({}), 0);
  assert.strictEqual(stripOurHooks({ hooks: {} }), 0);
  assert.strictEqual(
    stripOurHooks({ hooks: { PreToolUse: "not-an-array" } }),
    0,
  );
  // Not even an object — must not throw on uninstall.
  assert.strictEqual(stripOurHooks(null), 0);
  assert.strictEqual(stripOurHooks("nope"), 0);
  assert.strictEqual(stripOurHooks([1, 2]), 0);
});

console.log("claudeSettings.preToolUseEntries / hookCommandsOf");

test("preToolUseEntries returns the list only when it really is one", () => {
  const list = [buildHookEntry(OUR_DIR, HOOK_SPECS[0])];
  assert.strictEqual(preToolUseEntries({ hooks: { PreToolUse: list } }), list);
  assert.strictEqual(
    preToolUseEntries({ hooks: { PreToolUse: {} } }),
    undefined,
  );
  assert.strictEqual(preToolUseEntries({ hooks: [] }), undefined);
  assert.strictEqual(preToolUseEntries({}), undefined);
  assert.strictEqual(preToolUseEntries(null), undefined);
});

test("hookCommandsOf collects only string commands and tolerates junk", () => {
  assert.deepStrictEqual(
    hookCommandsOf({
      matcher: "Bash",
      hooks: [
        { type: "command", command: "a" },
        { type: "command" },
        null,
        "x",
        { type: "command", command: 42 },
        { type: "command", command: "b" },
      ],
    }),
    ["a", "b"],
  );
  assert.deepStrictEqual(hookCommandsOf({ hooks: "nope" }), []);
  assert.deepStrictEqual(hookCommandsOf(null), []);
});

console.log("claudeSettings.detectIndent");

test("the existing indent unit is detected", () => {
  assert.strictEqual(detectIndent('{\n  "a": 1\n}'), "  ");
  assert.strictEqual(detectIndent('{\n    "a": 1\n}'), "    ");
  assert.strictEqual(detectIndent('{\n\t"a": 1\n}'), "\t");
  assert.strictEqual(detectIndent('{\r\n    "a": 1\r\n}'), "    ");
});

test("nesting does not confuse the detected unit", () => {
  assert.strictEqual(
    detectIndent('{\n    "a": {\n        "b": 1\n    }\n}'),
    "    ",
  );
});

test("minified, mixed and implausible indents fall back to the default", () => {
  assert.strictEqual(detectIndent('{"a":1}'), "  ");
  assert.strictEqual(detectIndent(""), "  ");
  assert.strictEqual(detectIndent('{\n \t "a": 1\n}'), "  "); // mixed space+tab
  assert.strictEqual(detectIndent("{\n" + " ".repeat(12) + '"a": 1\n}'), "  "); // implausible
});

console.log("claudeSettings.describeHooksShapeError");

test("a mergeable settings object reports no error", () => {
  assert.strictEqual(describeHooksShapeError({}), undefined);
  assert.strictEqual(describeHooksShapeError({ permissions: {} }), undefined);
  assert.strictEqual(describeHooksShapeError({ hooks: {} }), undefined);
  assert.strictEqual(
    describeHooksShapeError({ hooks: { PreToolUse: [] } }),
    undefined,
  );
  // null is treated as absent, not as a shape error
  assert.strictEqual(describeHooksShapeError({ hooks: null }), undefined);
  assert.strictEqual(
    describeHooksShapeError({ hooks: { PreToolUse: null } }),
    undefined,
  );
  // sibling events of any shape are none of our business
  assert.strictEqual(
    describeHooksShapeError({ hooks: { PostToolUse: "weird" } }),
    undefined,
  );
});

test("a wrong-typed hooks section is described rather than coerced", () => {
  const assertMatch = (input: unknown, re: RegExp): void => {
    const msg = describeHooksShapeError(input);
    assert.ok(
      typeof msg === "string",
      `expected an error message for ${JSON.stringify(input)}`,
    );
    assert.match(msg, re);
  };
  assertMatch({ hooks: "x" }, /"hooks" is a string/);
  assertMatch({ hooks: 42 }, /"hooks" is a number/);
  assertMatch({ hooks: [] }, /"hooks" is an array/);
  assertMatch(
    { hooks: { PreToolUse: "x" } },
    /"hooks\.PreToolUse" is a string/,
  );
  assertMatch({ hooks: { PreToolUse: {} } }, /"hooks\.PreToolUse" is a object/);
  assertMatch([], /the top level is an array/);
  assertMatch(null, /the top level is null/);
  assertMatch("nope", /the top level is a string/);
});

console.log("manifest");

test("isSafeName rejects anything that could escape the skills directory", () => {
  for (const good of ["tizen-build-project", "my-skill", "agent.md"]) {
    assert.strictEqual(isSafeName(good), true, `${good} should be safe`);
  }
  for (const bad of [
    "..",
    ".",
    "",
    "../../etc/passwd",
    "a/b",
    "a\\b",
    42,
    null,
    undefined,
  ]) {
    assert.strictEqual(
      isSafeName(bad),
      false,
      `${String(bad)} should be rejected`,
    );
  }
});

test("needsSync re-syncs after an uninstall that left globalState behind", () => {
  // The regression this guards: VS Code keeps globalState in the shared
  // state.vscdb and does not clear it on uninstall, so `installedVersion` can
  // still say 1.0.0 while uninstall.js has deleted every installed file.
  // Trusting globalState alone leaves the user with nothing installed and no
  // notification.
  assert.strictEqual(needsSync("1.0.0", "1.0.0", [undefined]), true);
  assert.strictEqual(needsSync("1.0.0", "1.0.0", ["1.0.0", undefined]), true);

  // steady state: globalState and every targeted host agree → no work
  assert.strictEqual(needsSync("1.0.0", "1.0.0", ["1.0.0"]), false);
  assert.strictEqual(needsSync("1.0.0", "1.0.0", ["1.0.0", "1.0.0"]), false);

  // a genuine upgrade, and a stale manifest from an older version
  assert.strictEqual(needsSync("1.0.1", "1.0.0", ["1.0.0"]), true);
  assert.strictEqual(needsSync("1.0.1", "1.0.1", ["1.0.0"]), true);

  // first ever run: nothing recorded anywhere
  assert.strictEqual(needsSync("1.0.0", undefined, [undefined]), true);

  // no host targeted → nothing to install, so the version alone decides
  assert.strictEqual(needsSync("1.0.0", "1.0.0", []), false);
  assert.strictEqual(needsSync("1.0.0", undefined, []), true);
});

test("staleEntries finds what the previous version shipped and this one does not", () => {
  assert.deepStrictEqual(staleEntries(["a", "b", "c"], ["a", "c"]), ["b"]);
  assert.deepStrictEqual(staleEntries(["a"], ["a"]), []);
  assert.deepStrictEqual(staleEntries([], ["a"]), []);
  // a rename shows up as one stale entry
  assert.deepStrictEqual(staleEntries(["tizen-old"], ["tizen-new"]), [
    "tizen-old",
  ]);
  // no previous manifest → a first install must prune nothing
  assert.deepStrictEqual(staleEntries(undefined, ["a"]), []);
});

test("manifest round-trips and unsafe entries are dropped on read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-manifest-"));
  try {
    writeManifest(dir, {
      version: "1.0.0",
      installedAt: "2026-08-20T00:00:00.000Z",
      skills: ["tizen-build-project", "../escape"],
      agents: ["tizen-build-project.md"],
    });

    const read = readManifest(dir);
    assert.ok(read, "manifest should be readable");
    assert.strictEqual(read.version, "1.0.0");
    assert.deepStrictEqual(read.skills, ["tizen-build-project"]);
    assert.deepStrictEqual(read.agents, ["tizen-build-project.md"]);

    removeManifest(dir);
    assert.strictEqual(readManifest(dir), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing or malformed manifest reads as undefined", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-manifest-"));
  try {
    assert.strictEqual(readManifest(dir), undefined);

    fs.writeFileSync(
      path.join(dir, ".tizen-sdk-skills-manifest.json"),
      "{ not json",
      "utf-8",
    );
    assert.strictEqual(readManifest(dir), undefined);

    fs.writeFileSync(
      path.join(dir, ".tizen-sdk-skills-manifest.json"),
      '{"skills":"x"}',
      "utf-8",
    );
    assert.strictEqual(readManifest(dir), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a manifest written by a pre-rename release is read, then superseded", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-manifest-"));
  const legacyFile = path.join(dir, ".tizen-sdk-agents-manifest.json");
  const currentFile = path.join(dir, ".tizen-sdk-skills-manifest.json");
  try {
    fs.writeFileSync(
      legacyFile,
      JSON.stringify({
        version: "0.9.0",
        installedAt: "2026-07-01T00:00:00.000Z",
        skills: ["tizen-old-skill"],
        agents: ["tizen-old-agent.md"],
      }),
      "utf-8",
    );

    // Only the legacy file exists: it is what the previous install owns.
    const legacy = readManifest(dir);
    assert.ok(legacy, "legacy manifest should be readable");
    assert.strictEqual(legacy.version, "0.9.0");
    assert.deepStrictEqual(legacy.skills, ["tizen-old-skill"]);

    // Writing the current manifest retires the legacy file.
    writeManifest(dir, {
      version: "1.0.0",
      installedAt: "2026-09-03T00:00:00.000Z",
      skills: ["tizen-build-project"],
      agents: [],
    });
    assert.strictEqual(fs.existsSync(legacyFile), false);
    assert.strictEqual(fs.existsSync(currentFile), true);
    assert.strictEqual(readManifest(dir)?.version, "1.0.0");

    // removeManifest clears every name it may have been written under.
    fs.writeFileSync(legacyFile, '{"skills":[],"agents":[]}', "utf-8");
    removeManifest(dir);
    assert.strictEqual(fs.existsSync(legacyFile), false);
    assert.strictEqual(fs.existsSync(currentFile), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log("");
console.log(`${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
