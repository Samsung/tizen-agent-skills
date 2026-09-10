// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/test/hooks.test.ts — integration tests for the settings.json merge.
//
// These run installClaudeHooks / removeClaudeHooks against a real temporary
// HOME and assert on the bytes actually written to disk. The concern being
// covered: the merge must never damage a user's own settings.json — their
// hooks, their other hook events, and their unrelated keys all have to survive,
// and the backup has to remain the *pristine* file across re-installs.
//
// Bundled to dist/hooks.test.js with `vscode` aliased to ./vscode-stub.
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  installClaudeHooks,
  removeClaudeHooks,
  claudeHooksDir,
} from "../install/hooks";
import { SCRIPT_MODE } from "../install/fsutil";
import {
  ClaudeSettings,
  HOOK_SPECS,
  HookEntry,
} from "../install/claudeSettings";
import { takeLog } from "./vscode-stub";

const SCRIPTS = HOOK_SPECS.map((s) => s.scriptName);

interface Fixture {
  root: string;
  home: string;
  assets: string;
  settingsFile: string;
  backupFile: string;
}

function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-hooks-"));
  const home = path.join(root, "home");
  const assets = path.join(root, "assets");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(assets, "hooks"), { recursive: true });
  for (const s of SCRIPTS) {
    // CRLF on purpose: normalizeExec has to strip it after VSIX extraction.
    fs.writeFileSync(
      path.join(assets, "hooks", s),
      "#!/usr/bin/env bash\r\nexit 0\r\n",
    );
  }
  const settingsFile = path.join(home, ".claude", "settings.json");
  return {
    root,
    home,
    assets,
    settingsFile,
    backupFile: settingsFile + ".tizen-backup",
  };
}

function readSettings(fx: Fixture): ClaudeSettings {
  return JSON.parse(
    fs.readFileSync(fx.settingsFile, "utf-8"),
  ) as ClaudeSettings;
}

function preToolUse(fx: Fixture): HookEntry[] {
  const list = readSettings(fx).hooks?.PreToolUse;
  assert.ok(Array.isArray(list), "hooks.PreToolUse must be an array");
  return list;
}

/** A hook entry the user added themselves — must always survive. */
const USER_ENTRY = {
  matcher: "Edit",
  hooks: [{ type: "command", command: "node /home/me/my-own-lint-hook.js" }],
};

const USER_POST_ENTRY = {
  matcher: "*",
  hooks: [{ type: "command", command: "echo done" }],
};

// ─── harness ────────────────────────────────────────────────────────────

/** An entry with no fn is a section header, printed verbatim. */
const tests: { name: string; fn?: () => Promise<void> | void }[] = [];
function test(name: string, fn: () => Promise<void> | void): void {
  tests.push({ name, fn });
}
function section(name: string): void {
  tests.push({ name });
}

// ─── 1. fresh install, no pre-existing settings.json ────────────────────

section("fresh install (no settings.json)");

test("creates settings.json with all three hooks and returns true", async () => {
  const fx = makeFixture();
  const merged = await installClaudeHooks(fx.assets, fx.home);
  assert.strictEqual(merged, true);

  const entries = preToolUse(fx);
  assert.strictEqual(entries.length, HOOK_SPECS.length);
  assert.deepStrictEqual(
    entries.map((e) => e.matcher),
    HOOK_SPECS.map((s) => s.matcher),
  );
});

test("writes no backup when there was no original file to preserve", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);
  assert.strictEqual(fs.existsSync(fx.backupFile), false);
});

test("hook commands are absolute, forward-slashed and inside our hook dir", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);

  for (const [i, entry] of preToolUse(fx).entries()) {
    const command: string = entry.hooks[0].command;
    assert.ok(
      !command.includes("\\"),
      `command must not contain a backslash: ${command}`,
    );
    assert.ok(
      command.includes("/.claude/hooks/tizen-sdk-skills/"),
      `command must point into our hook dir: ${command}`,
    );
    assert.ok(
      command.endsWith(`${SCRIPTS[i]}"`),
      `wrong script for entry ${i}: ${command}`,
    );
    assert.ok(
      command.startsWith('bash "'),
      `command must invoke bash: ${command}`,
    );
  }
});

test("writes no non-schema marker keys into settings.json", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);

  const raw = fs.readFileSync(fx.settingsFile, "utf-8");
  assert.ok(
    !raw.includes("_source"),
    "settings.json must not contain a _source key",
  );
  for (const entry of preToolUse(fx)) {
    assert.deepStrictEqual(
      Object.keys(entry).sort((a, b) => a.localeCompare(b)),
      ["hooks", "matcher"],
    );
    assert.deepStrictEqual(
      Object.keys(entry.hooks[0]).sort((a, b) => a.localeCompare(b)),
      ["command", "type"],
    );
  }
});

test("copies the scripts and strips CRLF, leaving no temp file behind", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);

  for (const s of SCRIPTS) {
    const p = path.join(claudeHooksDir(fx.home), s);
    assert.ok(fs.existsSync(p), `${s} should be installed`);
    assert.ok(
      !fs.readFileSync(p, "utf-8").includes("\r"),
      `${s} should have LF endings`,
    );
  }
  assert.strictEqual(
    fs.existsSync(fx.settingsFile + ".tizen-tmp"),
    false,
    "atomic write must not leave a .tizen-tmp file",
  );
});

test("installed scripts are executable by their owner and nobody else", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);

  // The mode itself is the security-relevant assertion (SONARTS S2612): the
  // scripts live in the user's own home and are run by Claude Code as that
  // user, so no group or "other" bit is warranted.
  assert.strictEqual(
    SCRIPT_MODE.toString(8),
    "700",
    "installed scripts must be owner-only rwx",
  );

  if (process.platform === "win32") {
    console.log(
      "       (on-disk mode check skipped: POSIX permissions not enforced on win32)",
    );
    return;
  }

  for (const s of SCRIPTS) {
    const mode =
      fs.statSync(path.join(claudeHooksDir(fx.home), s)).mode & 0o777;
    assert.strictEqual(
      mode.toString(8),
      "700",
      `${s} should be 0700, got 0${mode.toString(8)}`,
    );
  }
});

// ─── 2. merging into an existing settings.json ──────────────────────────

section("merge into an existing settings.json");

const ORIGINAL = {
  $schema: "https://json.schemastore.org/claude-code-settings.json",
  permissions: { allow: ["Bash(ls:*)"], deny: ["Bash(rm:*)"] },
  env: { FOO: "bar" },
  hooks: {
    PreToolUse: [USER_ENTRY],
    PostToolUse: [USER_POST_ENTRY],
  },
};

function seedOriginal(fx: Fixture): string {
  const raw = JSON.stringify(ORIGINAL, null, 4) + "\n";
  fs.writeFileSync(fx.settingsFile, raw, "utf-8");
  return raw;
}

test("the user's own PreToolUse entry survives and ours are appended", async () => {
  const fx = makeFixture();
  seedOriginal(fx);
  await installClaudeHooks(fx.assets, fx.home);

  const entries = preToolUse(fx);
  assert.strictEqual(entries.length, 1 + HOOK_SPECS.length);
  assert.deepStrictEqual(
    entries[0],
    USER_ENTRY,
    "the user's entry must be preserved verbatim",
  );
});

test("other hook events and unrelated top-level keys are untouched", async () => {
  const fx = makeFixture();
  seedOriginal(fx);
  await installClaudeHooks(fx.assets, fx.home);

  const settings = readSettings(fx);
  assert.deepStrictEqual(settings.hooks?.PostToolUse, [USER_POST_ENTRY]);
  assert.deepStrictEqual(settings.permissions, ORIGINAL.permissions);
  assert.deepStrictEqual(settings.env, ORIGINAL.env);
  assert.strictEqual(settings.$schema, ORIGINAL.$schema);
});

test("the backup is a byte-for-byte copy of the pristine file", async () => {
  const fx = makeFixture();
  const raw = seedOriginal(fx);
  await installClaudeHooks(fx.assets, fx.home);

  assert.ok(fs.existsSync(fx.backupFile), "a backup must be written");
  assert.strictEqual(fs.readFileSync(fx.backupFile, "utf-8"), raw);
});

// ─── 3. idempotency across repeated installs ────────────────────────────

section("idempotency across re-installs");

test("three installs do not accumulate entries", async () => {
  const fx = makeFixture();
  seedOriginal(fx);
  for (let i = 0; i < 3; i++) {
    await installClaudeHooks(fx.assets, fx.home);
  }

  const entries = preToolUse(fx);
  assert.strictEqual(entries.length, 1 + HOOK_SPECS.length);
  assert.deepStrictEqual(entries[0], USER_ENTRY);
});

test("the backup still holds the pristine file after re-installs", async () => {
  const fx = makeFixture();
  const raw = seedOriginal(fx);
  for (let i = 0; i < 3; i++) {
    await installClaudeHooks(fx.assets, fx.home);
  }

  const backup = fs.readFileSync(fx.backupFile, "utf-8");
  assert.strictEqual(
    backup,
    raw,
    "the backup must not be overwritten with a merged copy",
  );
  assert.strictEqual(
    (JSON.parse(backup) as ClaudeSettings).hooks?.PreToolUse?.length,
    1,
    "the backup must not contain our hook entries",
  );
});

test("a legacy _source-tagged install is replaced, not duplicated", async () => {
  const fx = makeFixture();
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            USER_ENTRY,
            // what an earlier build of this extension wrote (pre-rename tag)
            ...HOOK_SPECS.map((s) => ({
              matcher: s.matcher,
              hooks: [
                {
                  type: "command",
                  command: `bash "/some/old/extension-1.0.0/hooks/${s.scriptName}"`,
                  _source: "tizen-sdk-agents",
                },
              ],
            })),
          ],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  await installClaudeHooks(fx.assets, fx.home);

  const entries = preToolUse(fx);
  assert.strictEqual(entries.length, 1 + HOOK_SPECS.length);
  assert.deepStrictEqual(entries[0], USER_ENTRY);
  assert.ok(
    !fs.readFileSync(fx.settingsFile, "utf-8").includes("extension-1.0.0"),
    "the stale versioned hook path must be gone",
  );
});

test("a pre-rename install (tizen-sdk-agents hook dir) is replaced and its scripts removed", async () => {
  const fx = makeFixture();
  const legacyDir = path.join(fx.home, ".claude", "hooks", "tizen-sdk-agents");
  fs.mkdirSync(legacyDir, { recursive: true });
  for (const s of SCRIPTS)
    fs.writeFileSync(path.join(legacyDir, s), "exit 0\n");
  const legacyPosix = legacyDir.replace(/\\/g, "/");
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            USER_ENTRY,
            ...HOOK_SPECS.map((s) => ({
              matcher: s.matcher,
              hooks: [
                {
                  type: "command",
                  command: `bash "${legacyPosix}/${s.scriptName}"`,
                },
              ],
            })),
          ],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  await installClaudeHooks(fx.assets, fx.home);

  const entries = preToolUse(fx);
  assert.strictEqual(
    entries.length,
    1 + HOOK_SPECS.length,
    "old entries must be replaced, not duplicated",
  );
  assert.deepStrictEqual(entries[0], USER_ENTRY);
  assert.ok(
    !fs.readFileSync(fx.settingsFile, "utf-8").includes("tizen-sdk-agents"),
    "no command may still point into the old hook dir",
  );
  assert.strictEqual(
    fs.existsSync(legacyDir),
    false,
    "the old hook script directory must be removed",
  );
  assert.ok(fs.existsSync(claudeHooksDir(fx.home)));
});

// ─── 3b. formatting is preserved ────────────────────────────────────────

section("the user's formatting survives the merge");

const INDENT_CASES: { name: string; indent: string }[] = [
  { name: "two spaces", indent: "  " },
  { name: "four spaces", indent: "    " },
  { name: "a tab", indent: "\t" },
];

for (const c of INDENT_CASES) {
  test(`${c.name} indentation is reused, not reflowed`, async () => {
    const fx = makeFixture();
    fs.writeFileSync(
      fx.settingsFile,
      JSON.stringify(ORIGINAL, null, c.indent) + "\n",
      "utf-8",
    );

    await installClaudeHooks(fx.assets, fx.home);

    const lines = fs.readFileSync(fx.settingsFile, "utf-8").split("\n");
    const firstIndented = lines.find((l) => /^[ \t]+\S/.test(l));
    assert.ok(firstIndented, "the file should still be pretty-printed");
    const indentMatch = /^([ \t]+)/.exec(firstIndented as string);
    assert.ok(indentMatch, "expected leading whitespace");
    assert.strictEqual(
      indentMatch?.[1],
      c.indent,
      `expected ${JSON.stringify(c.indent)} indentation, got ${JSON.stringify(firstIndented)}`,
    );
  });
}

test("only the hooks section changes — the rest of the file is byte-identical", async () => {
  const fx = makeFixture();
  const raw = JSON.stringify(ORIGINAL, null, 4) + "\n";
  fs.writeFileSync(fx.settingsFile, raw, "utf-8");

  await installClaudeHooks(fx.assets, fx.home);
  const after = fs.readFileSync(fx.settingsFile, "utf-8");

  // Everything before "hooks" must be untouched, character for character.
  const prefix = raw.slice(0, raw.indexOf('"hooks"'));
  assert.strictEqual(after.slice(0, prefix.length), prefix);
});

test("a minified settings.json falls back to the default indent", async () => {
  const fx = makeFixture();
  fs.writeFileSync(fx.settingsFile, JSON.stringify(ORIGINAL), "utf-8");

  await installClaudeHooks(fx.assets, fx.home);

  const lines = fs.readFileSync(fx.settingsFile, "utf-8").split("\n");
  assert.ok(lines.length > 10, "output should be pretty-printed");
  const firstIndented = lines.find((l) => /^[ \t]+\S/.test(l));
  assert.ok(firstIndented, "expected an indented line");
  const indentMatch = /^([ \t]+)/.exec(firstIndented as string);
  assert.ok(indentMatch, "expected leading whitespace");
  assert.strictEqual(indentMatch?.[1], "  ");
});

// ─── 4. hostile / malformed input ───────────────────────────────────────

section("malformed and hostile input");

test("a syntactically invalid settings.json is left completely untouched", async () => {
  const fx = makeFixture();
  const broken = '{\n  "hooks": {\n    "PreToolUse": [  // trailing junk\n';
  fs.writeFileSync(fx.settingsFile, broken, "utf-8");
  takeLog();

  const merged = await installClaudeHooks(fx.assets, fx.home);

  assert.strictEqual(merged, false, "merge must report failure");
  assert.strictEqual(
    fs.readFileSync(fx.settingsFile, "utf-8"),
    broken,
    "file must not be rewritten",
  );
  assert.strictEqual(
    fs.existsSync(fx.backupFile),
    false,
    "no backup of an unparsable file",
  );

  const log = takeLog().join("\n");
  assert.ok(
    log.includes("skipping automated merge"),
    "the fallback must be logged",
  );
  assert.ok(
    log.includes("check-tizen-commands.sh"),
    "the manual snippet must be printed",
  );
});

test("the scripts are still installed when the merge is skipped", async () => {
  const fx = makeFixture();
  fs.writeFileSync(fx.settingsFile, "{ not json", "utf-8");
  await installClaudeHooks(fx.assets, fx.home);

  for (const s of SCRIPTS) {
    assert.ok(
      fs.existsSync(path.join(claudeHooksDir(fx.home), s)),
      `${s} should still be copied`,
    );
  }
});

// A wrong-typed hooks section parses fine, so the parse-failure guard does not
// catch it. Coercing it to the expected type would silently discard whatever
// the user wrote — and on a re-install the backup no longer holds it either.
const SHAPE_ERRORS: { name: string; json: unknown; expect: string }[] = [
  {
    name: "hooks is a string",
    json: { permissions: { allow: ["Bash"] }, hooks: "nonsense" },
    expect: '"hooks" is a string',
  },
  {
    name: "hooks is an array",
    json: { hooks: [{ matcher: "Bash" }] },
    expect: '"hooks" is an array',
  },
  {
    name: "PreToolUse is an object",
    json: {
      hooks: {
        PreToolUse: { matcher: "Bash" },
        PostToolUse: [USER_POST_ENTRY],
      },
    },
    expect: '"hooks.PreToolUse" is a object',
  },
  {
    name: "PreToolUse is a string",
    json: { hooks: { PreToolUse: "nonsense", PostToolUse: [USER_POST_ENTRY] } },
    expect: '"hooks.PreToolUse" is a string',
  },
  {
    name: "the top level is an array",
    json: [1, 2, 3],
    expect: "the top level is an array",
  },
];

for (const c of SHAPE_ERRORS) {
  test(`a malformed shape is reported and preserved (${c.name})`, async () => {
    const fx = makeFixture();
    const raw = JSON.stringify(c.json, null, 2) + "\n";
    fs.writeFileSync(fx.settingsFile, raw, "utf-8");
    takeLog();

    const merged = await installClaudeHooks(fx.assets, fx.home);

    assert.strictEqual(merged, false, "merge must report failure");
    assert.strictEqual(
      fs.readFileSync(fx.settingsFile, "utf-8"),
      raw,
      "the malformed value must not be discarded",
    );

    const log = takeLog().join("\n");
    assert.ok(
      log.includes(c.expect),
      `log must explain the shape error, got:\n${log}`,
    );
    assert.ok(
      log.includes("check-tizen-commands.sh"),
      "the manual snippet must be printed",
    );
  });
}

test("an explicitly null hooks section is treated as absent, not as an error", async () => {
  const fx = makeFixture();
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify({ hooks: null }, null, 2),
    "utf-8",
  );

  assert.strictEqual(await installClaudeHooks(fx.assets, fx.home), true);
  assert.strictEqual(preToolUse(fx).length, HOOK_SPECS.length);
});

test("an explicitly null PreToolUse is treated as absent, not as an error", async () => {
  const fx = makeFixture();
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify(
      { hooks: { PreToolUse: null, PostToolUse: [USER_POST_ENTRY] } },
      null,
      2,
    ),
    "utf-8",
  );

  assert.strictEqual(await installClaudeHooks(fx.assets, fx.home), true);
  assert.strictEqual(preToolUse(fx).length, HOOK_SPECS.length);
  assert.deepStrictEqual(readSettings(fx).hooks?.PostToolUse, [
    USER_POST_ENTRY,
  ]);
});

test("an entry mixing our guard with the user's own command is left intact", async () => {
  const fx = makeFixture();
  const ourPath = `${claudeHooksDir(fx.home).replace(/\\/g, "/")}/check-tizen-commands.sh`;
  const mixed = {
    matcher: "Bash",
    hooks: [
      { type: "command", command: `bash "${ourPath}"` },
      { type: "command", command: "node /home/me/also-mine.js" },
    ],
  };
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify({ hooks: { PreToolUse: [mixed] } }),
    "utf-8",
  );

  await installClaudeHooks(fx.assets, fx.home);

  const entries = preToolUse(fx);
  assert.strictEqual(entries.length, 1 + HOOK_SPECS.length);
  assert.deepStrictEqual(
    entries[0],
    mixed,
    "a hand-edited mixed entry must not be half-deleted",
  );
});

test("missing hook sources are reported instead of silently skipped", async () => {
  const fx = makeFixture();
  fs.rmSync(path.join(fx.assets, "hooks", "check-skill-routing.sh"));
  takeLog();

  await installClaudeHooks(fx.assets, fx.home);

  const log = takeLog().join("\n");
  assert.ok(
    log.includes("Hook script missing from assets: check-skill-routing.sh"),
    "the missing script must be warned about",
  );
});

test("an absent hooks asset directory aborts before touching settings.json", async () => {
  const fx = makeFixture();
  seedOriginal(fx);
  fs.rmSync(path.join(fx.assets, "hooks"), { recursive: true, force: true });
  const before = fs.readFileSync(fx.settingsFile, "utf-8");

  const merged = await installClaudeHooks(fx.assets, fx.home);

  assert.strictEqual(merged, false);
  assert.strictEqual(fs.readFileSync(fx.settingsFile, "utf-8"), before);
});

// ─── 5. removal ─────────────────────────────────────────────────────────

section("removal");

test("removal strips only our entries and keeps the rest of the file", async () => {
  const fx = makeFixture();
  seedOriginal(fx);
  await installClaudeHooks(fx.assets, fx.home);
  await removeClaudeHooks(fx.home);

  const settings = readSettings(fx);
  assert.deepStrictEqual(settings.hooks?.PreToolUse, [USER_ENTRY]);
  assert.deepStrictEqual(settings.hooks?.PostToolUse, [USER_POST_ENTRY]);
  assert.deepStrictEqual(settings.permissions, ORIGINAL.permissions);
  assert.deepStrictEqual(settings.env, ORIGINAL.env);
});

test("removal preserves the file indentation too", async () => {
  const fx = makeFixture();
  fs.writeFileSync(
    fx.settingsFile,
    JSON.stringify(ORIGINAL, null, "\t") + "\n",
    "utf-8",
  );
  await installClaudeHooks(fx.assets, fx.home);
  await removeClaudeHooks(fx.home);

  const lines = fs.readFileSync(fx.settingsFile, "utf-8").split("\n");
  const firstIndented = lines.find((l) => /^[ \t]+\S/.test(l));
  assert.ok(firstIndented, "expected an indented line");
  const indentMatch = /^([ \t]+)/.exec(firstIndented as string);
  assert.ok(indentMatch, "expected leading whitespace");
  assert.strictEqual(indentMatch?.[1], "\t");
});

test("removal deletes the hook script directory", async () => {
  const fx = makeFixture();
  await installClaudeHooks(fx.assets, fx.home);
  await removeClaudeHooks(fx.home);
  assert.strictEqual(fs.existsSync(claudeHooksDir(fx.home)), false);
});

test("install → remove → install returns to the same state (round trip)", async () => {
  const fx = makeFixture();
  seedOriginal(fx);

  await installClaudeHooks(fx.assets, fx.home);
  const afterFirst = fs.readFileSync(fx.settingsFile, "utf-8");

  await removeClaudeHooks(fx.home);
  await installClaudeHooks(fx.assets, fx.home);

  assert.strictEqual(fs.readFileSync(fx.settingsFile, "utf-8"), afterFirst);
});

test("removing when nothing is installed is a no-op, not a crash", async () => {
  const fx = makeFixture();
  const raw = seedOriginal(fx);
  await removeClaudeHooks(fx.home);
  assert.strictEqual(fs.readFileSync(fx.settingsFile, "utf-8"), raw);
});

test("removal tolerates an unparsable settings.json", async () => {
  const fx = makeFixture();
  fs.writeFileSync(fx.settingsFile, "{ broken", "utf-8");
  takeLog();
  await removeClaudeHooks(fx.home);
  assert.strictEqual(fs.readFileSync(fx.settingsFile, "utf-8"), "{ broken");
  assert.ok(takeLog().join("\n").includes("Could not parse"));
});

// ─── run ────────────────────────────────────────────────────────────────

(async () => {
  let passes = 0;
  let failures = 0;

  for (const t of tests) {
    if (!t.fn) {
      console.log(t.name);
      continue;
    }
    try {
      await t.fn();
      takeLog();
      passes++;
      console.log(`  ok  ${t.name}`);
    } catch (e: unknown) {
      failures++;
      console.error(`  FAIL ${t.name}`);
      console.error(`       ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("");
  console.log(`${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
