// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/test/install.test.ts — integration tests for the destructive parts of
// install and removal: the clean directory mirror and the manifest-driven
// delete.
//
// mirrorDir() removes its destination before copying, and removal deletes
// entries out of ~/.claude/skills, ~/.claude/agents and ~/.cline/skills —
// directories the user also keeps their own definitions in. These tests assert,
// against a real temporary HOME, that nothing outside the paths we own is ever
// touched.
//
// Bundled to dist/install.test.js with `vscode` aliased to ./vscode-stub.
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  installClaude,
  removeClaude,
  claudeCacheBase,
  claudeCacheRoot,
} from "../install/claude";
import {
  installCline,
  removeCline,
  clineCacheBase,
  clineCacheRoot,
} from "../install/cline";
import { installCodex, removeCodex } from "../install/codex";
import {
  codexAgentsDir,
  codexCacheBase,
  codexContextFile,
  codexHooksDir,
  codexHooksJsonPath,
  codexSkillsDir,
} from "../install/codexLayout";
import { mirrorDir } from "../install/fsutil";
import { guardMarkers } from "../install/guardSection";
import { installCodexHooks, removeCodexHooks } from "../install/hooks";
import { readManifest, writeManifest, manifestPath } from "../install/manifest";
import { takeLog } from "./vscode-stub";

const VERSION = "9.9.9";

/** Skills and agents the extension ships. */
const ASSET_SKILLS = ["tizen-build-project", "tizen-install-app"];
const ASSET_AGENTS = ["tizen-build-project.md", "tizen-install-app.md"];

/** Things the user owns. None of these may ever be removed or overwritten. */
const USER_SKILLS = [
  "my-own-skill", // unrelated name
  "code2spec-installer", // unrelated name
  "tizen-hand-written", // tizen-prefixed but NOT ours — the glob-removal trap
];
const USER_AGENTS = ["my-agent.md", "tizen-hand-written.md"];

interface Fixture {
  root: string;
  home: string;
  assets: string;
  outside: string;
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

function makeFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-install-"));
  const home = path.join(root, "home");
  const assets = path.join(root, "assets");
  const outside = path.join(root, "outside");

  // Bundled assets
  for (const s of ASSET_SKILLS) {
    write(path.join(assets, "skills", s, "SKILL.md"), `# ${s}\n`);
    write(path.join(assets, "skills", s, "scripts", "run.sh"), "#!/bin/bash\n");
  }
  for (const a of ASSET_AGENTS) {
    write(path.join(assets, "agents", a), `# ${a}\n`);
  }
  write(
    path.join(assets, "agents", "not-an-agent.txt"),
    "ignored by the .md filter\n",
  );
  for (const sub of ["scripts", "lib", "assets", "docs"]) {
    write(path.join(assets, sub, `${sub}.txt`), sub);
  }
  write(path.join(assets, "hooks", "check-tizen-commands.sh"), "#!/bin/bash\n");

  // Pre-existing user content in the shared namespaces
  for (const s of USER_SKILLS) {
    write(path.join(home, ".claude", "skills", s, "SKILL.md"), `user: ${s}\n`);
    write(path.join(home, ".cline", "skills", s, "SKILL.md"), `user: ${s}\n`);
  }
  for (const a of USER_AGENTS) {
    write(path.join(home, ".claude", "agents", a), `user: ${a}\n`);
  }
  write(path.join(home, ".claude", "settings.json"), "{}\n");
  write(path.join(home, ".claude", "CLAUDE.md"), "user memory\n");
  write(path.join(home, ".claude", "unrelated", "keep.txt"), "keep\n");
  write(
    path.join(
      home,
      ".claude",
      "plugins",
      "cache",
      "other-vendor",
      "x",
      "f.txt",
    ),
    "other\n",
  );

  // Something entirely outside HOME, to prove we never reach out of it
  write(path.join(outside, "precious.txt"), "precious\n");

  return { root, home, assets, outside };
}

/** Snapshot every file path + content under a directory. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, rel);
      else if (e.isFile()) out[rel] = fs.readFileSync(p, "utf-8");
      else out[rel] = "<non-regular>";
    }
  };
  walk(dir, "");
  return out;
}

function assertUserContentIntact(fx: Fixture, stage: string): void {
  for (const s of USER_SKILLS) {
    const p = path.join(fx.home, ".claude", "skills", s, "SKILL.md");
    assert.strictEqual(
      fs.existsSync(p),
      true,
      `${stage}: user skill ${s} must survive`,
    );
    assert.strictEqual(
      fs.readFileSync(p, "utf-8"),
      `user: ${s}\n`,
      `${stage}: ${s} unmodified`,
    );
  }
  for (const a of USER_AGENTS) {
    const p = path.join(fx.home, ".claude", "agents", a);
    assert.strictEqual(
      fs.existsSync(p),
      true,
      `${stage}: user agent ${a} must survive`,
    );
    assert.strictEqual(
      fs.readFileSync(p, "utf-8"),
      `user: ${a}\n`,
      `${stage}: ${a} unmodified`,
    );
  }
  assert.strictEqual(
    fs.readFileSync(path.join(fx.home, ".claude", "CLAUDE.md"), "utf-8"),
    "user memory\n",
    `${stage}: CLAUDE.md must survive`,
  );
  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "unrelated", "keep.txt")),
    true,
    `${stage}: unrelated dirs must survive`,
  );
  assert.strictEqual(
    fs.existsSync(
      path.join(
        fx.home,
        ".claude",
        "plugins",
        "cache",
        "other-vendor",
        "x",
        "f.txt",
      ),
    ),
    true,
    `${stage}: another vendor's plugin cache must survive`,
  );
  assert.strictEqual(
    fs.readFileSync(path.join(fx.outside, "precious.txt"), "utf-8"),
    "precious\n",
    `${stage}: nothing outside HOME may be touched`,
  );
}

// ─── harness ────────────────────────────────────────────────────────────

/** An entry with no fn is a section header, printed verbatim. */
const tests: { name: string; fn?: () => Promise<void> | void }[] = [];
function test(name: string, fn: () => Promise<void> | void): void {
  tests.push({ name, fn });
}
function section(name: string): void {
  tests.push({ name });
}

// ─── 1. install must not disturb the user's namespace ───────────────────

section("install into shared skill/agent directories");

test("installs our skills and agents without touching the user's", async () => {
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION);

  for (const s of ASSET_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(fx.home, ".claude", "skills", s, "SKILL.md")),
      `${s} should be installed`,
    );
  }
  for (const a of ASSET_AGENTS) {
    assert.ok(
      fs.existsSync(path.join(fx.home, ".claude", "agents", a)),
      `${a} should be installed`,
    );
  }
  assertUserContentIntact(fx, "after install");
});

test("the .md filter leaves non-agent files in assets behind", async () => {
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION);
  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "agents", "not-an-agent.txt")),
    false,
  );
});

test("the manifest records exactly what we wrote, and nothing of the user's", async () => {
  const fx = makeFixture();
  const result = await installClaude(fx.assets, fx.home, VERSION);

  const manifest = readManifest(path.join(fx.home, ".claude"));
  assert.ok(
    manifest === undefined,
    "installClaude itself does not write the manifest",
  );
  const sortedOwnedSkills = [...result.owned.skills].sort((a, b) =>
    a.localeCompare(b),
  );
  const sortedAssetSkills = [...ASSET_SKILLS].sort((a, b) =>
    a.localeCompare(b),
  );
  assert.deepStrictEqual(sortedOwnedSkills, sortedAssetSkills);
  const sortedOwnedAgents = [...result.owned.agents].sort((a, b) =>
    a.localeCompare(b),
  );
  const sortedAssetAgents = [...ASSET_AGENTS].sort((a, b) =>
    a.localeCompare(b),
  );
  assert.deepStrictEqual(sortedOwnedAgents, sortedAssetAgents);

  for (const u of [...USER_SKILLS, ...USER_AGENTS]) {
    assert.ok(!result.owned.skills.includes(u), `${u} must not be claimed`);
    assert.ok(!result.owned.agents.includes(u), `${u} must not be claimed`);
  }
});

test("re-installing is idempotent and prunes stale files inside our skills", async () => {
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION);

  // A stale file inside *our* skill must be pruned by the clean mirror.
  const stale = path.join(
    fx.home,
    ".claude",
    "skills",
    ASSET_SKILLS[0],
    "STALE.md",
  );
  fs.writeFileSync(stale, "left over from an older version\n");

  const before = snapshot(path.join(fx.home, ".claude"));
  await installClaude(fx.assets, fx.home, VERSION);
  const after = snapshot(path.join(fx.home, ".claude"));

  assert.strictEqual(
    fs.existsSync(stale),
    false,
    "stale file inside our skill must be pruned",
  );
  delete before[`skills/${ASSET_SKILLS[0]}/STALE.md`];
  assert.deepStrictEqual(
    after,
    before,
    "re-install must otherwise change nothing",
  );
  assertUserContentIntact(fx, "after re-install");
});

test("the Cline install leaves the Cline user namespace alone", async () => {
  const fx = makeFixture();
  await installCline(fx.assets, fx.home, VERSION);

  for (const s of USER_SKILLS) {
    const p = path.join(fx.home, ".cline", "skills", s, "SKILL.md");
    assert.strictEqual(
      fs.readFileSync(p, "utf-8"),
      `user: ${s}\n`,
      `${s} must survive`,
    );
  }
  for (const s of ASSET_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(fx.home, ".cline", "skills", s, "SKILL.md")),
    );
  }
  // Cline gets no agents and no skills in its cache
  assert.strictEqual(
    fs.existsSync(path.join(clineCacheBase(fx.home, VERSION), "skills")),
    false,
  );
  assert.strictEqual(
    fs.existsSync(path.join(clineCacheBase(fx.home, VERSION), "agents")),
    false,
  );
});

// ─── 2. mirrorDir target computation ────────────────────────────────────

section("mirrorDir target computation");

test("mirrorDir only ever deletes the destination it was given", async () => {
  const fx = makeFixture();
  const dest = path.join(fx.home, ".claude", "skills", ASSET_SKILLS[0]);
  const sibling = path.join(fx.home, ".claude", "skills", "my-own-skill");

  await mirrorDir(
    path.join(fx.assets, "skills", ASSET_SKILLS[0]),
    dest,
    "test",
  );

  assert.ok(fs.existsSync(path.join(dest, "SKILL.md")));
  assert.strictEqual(
    fs.readFileSync(path.join(sibling, "SKILL.md"), "utf-8"),
    "user: my-own-skill\n",
  );
});

test("a missing source is a warning, and the destination is left alone", async () => {
  const fx = makeFixture();
  const dest = path.join(fx.home, ".claude", "skills", "my-own-skill");
  takeLog();

  await mirrorDir(
    path.join(fx.assets, "skills", "does-not-exist"),
    dest,
    "test",
  );

  assert.strictEqual(
    fs.readFileSync(path.join(dest, "SKILL.md"), "utf-8"),
    "user: my-own-skill\n",
    "a missing source must not wipe the destination",
  );
  assert.ok(takeLog().join("\n").includes("Source not found"));
});

test("skill names come from readdir, so they are always single path segments", async () => {
  const fx = makeFixture();
  // readdir never yields "." or ".." — assert that so the invariant mirrorDir's
  // path.join(skillsDir, name) relies on is pinned down.
  for (const name of fs.readdirSync(path.join(fx.assets, "skills"))) {
    assert.strictEqual(name, path.basename(name));
    assert.ok(![".", ".."].includes(name));
  }
});

test("a .git directory in the source is not copied", async () => {
  const fx = makeFixture();
  write(
    path.join(fx.assets, "skills", ASSET_SKILLS[0], ".git", "HEAD"),
    "ref: x\n",
  );

  await installClaude(fx.assets, fx.home, VERSION);

  assert.strictEqual(
    fs.existsSync(
      path.join(fx.home, ".claude", "skills", ASSET_SKILLS[0], ".git"),
    ),
    false,
  );
});

// ─── 3. removal ─────────────────────────────────────────────────────────

section("manifest-driven removal");

async function installAndRecord(fx: Fixture): Promise<void> {
  const claude = await installClaude(fx.assets, fx.home, VERSION);
  writeManifest(path.join(fx.home, ".claude"), {
    version: VERSION,
    installedAt: "2026-08-20T00:00:00.000Z",
    skills: claude.owned.skills,
    agents: claude.owned.agents,
  });
  const cline = await installCline(fx.assets, fx.home, VERSION);
  writeManifest(path.join(fx.home, ".cline"), {
    version: VERSION,
    installedAt: "2026-08-20T00:00:00.000Z",
    skills: cline.owned.skills,
    agents: [],
  });
}

test("removal deletes ours and keeps every user file — including tizen-* ones", async () => {
  const fx = makeFixture();
  await installAndRecord(fx);
  await removeClaude(fx.home);
  await removeCline(fx.home);

  for (const s of ASSET_SKILLS) {
    assert.strictEqual(
      fs.existsSync(path.join(fx.home, ".claude", "skills", s)),
      false,
      `${s} should be removed`,
    );
    assert.strictEqual(
      fs.existsSync(path.join(fx.home, ".cline", "skills", s)),
      false,
    );
  }
  for (const a of ASSET_AGENTS) {
    assert.strictEqual(
      fs.existsSync(path.join(fx.home, ".claude", "agents", a)),
      false,
    );
  }
  assertUserContentIntact(fx, "after removal");
});

test("removal drops the whole plugin cache but not another vendor's", async () => {
  const fx = makeFixture();
  await installAndRecord(fx);
  assert.ok(fs.existsSync(claudeCacheBase(fx.home, VERSION)));

  await removeClaude(fx.home);

  assert.strictEqual(
    fs.existsSync(
      path.join(
        fx.home,
        ".claude",
        "plugins",
        "cache",
        "tizen-platform",
        "tizen-sdk-skills",
      ),
    ),
    false,
  );
  assert.ok(
    fs.existsSync(
      path.join(
        fx.home,
        ".claude",
        "plugins",
        "cache",
        "other-vendor",
        "x",
        "f.txt",
      ),
    ),
  );
});

test("removal consumes the manifest so a second run is a no-op", async () => {
  const fx = makeFixture();
  await installAndRecord(fx);
  await removeClaude(fx.home);

  assert.strictEqual(
    fs.existsSync(manifestPath(path.join(fx.home, ".claude"))),
    false,
  );

  const before = snapshot(path.join(fx.home, ".claude"));
  await removeClaude(fx.home);
  assert.deepStrictEqual(snapshot(path.join(fx.home, ".claude")), before);
});

test("with no manifest, the shared directories are left completely alone", async () => {
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION); // note: no manifest written
  const before = snapshot(path.join(fx.home, ".claude", "skills"));
  takeLog();

  await removeClaude(fx.home);

  assert.deepStrictEqual(
    snapshot(path.join(fx.home, ".claude", "skills")),
    before,
    "nothing in skills/ may be deleted without a manifest",
  );
  assert.ok(takeLog().join("\n").includes("No install manifest"));
});

test("a manifest naming user files still only deletes what it names", async () => {
  // Sanity check on the trust model: the manifest IS the authority, so a
  // manifest that names a user skill will delete it. It is written only by us,
  // from listSubdirs of our own asset tree — but pin the blast radius down.
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION);
  writeManifest(path.join(fx.home, ".claude"), {
    version: VERSION,
    installedAt: "2026-08-20T00:00:00.000Z",
    skills: ["my-own-skill"],
    agents: [],
  });

  await removeClaude(fx.home);

  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "skills", "my-own-skill")),
    false,
  );
  // everything NOT named survives
  assert.ok(
    fs.existsSync(
      path.join(fx.home, ".claude", "skills", "tizen-hand-written"),
    ),
  );
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "skills", ASSET_SKILLS[0])),
  );
  assert.ok(fs.existsSync(path.join(fx.home, ".claude", "CLAUDE.md")));
});

test("traversal entries in a tampered manifest are rejected, not followed", async () => {
  const fx = makeFixture();
  await installClaude(fx.assets, fx.home, VERSION);

  // Hand-craft a hostile manifest, bypassing writeManifest's typing.
  fs.writeFileSync(
    manifestPath(path.join(fx.home, ".claude")),
    JSON.stringify({
      version: VERSION,
      installedAt: "",
      skills: [
        "../../../outside",
        "../CLAUDE.md",
        "..",
        ".",
        "a/b",
        "a\\b",
        ASSET_SKILLS[0],
      ],
      agents: ["../CLAUDE.md", "../../outside/precious.txt"],
    }),
    "utf-8",
  );

  await removeClaude(fx.home);

  // The one legitimate entry was honoured...
  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "skills", ASSET_SKILLS[0])),
    false,
  );
  // ...and every traversal attempt was dropped.
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "CLAUDE.md")),
    "CLAUDE.md must survive",
  );
  assert.ok(fs.existsSync(fx.outside), "the outside directory must survive");
  assert.strictEqual(
    fs.readFileSync(path.join(fx.outside, "precious.txt"), "utf-8"),
    "precious\n",
  );
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "skills")),
    "skills/ itself must survive",
  );
  assertUserContentIntact(fx, "after hostile manifest");
});

// ─── 3b. version upgrades ───────────────────────────────────────────────

section("version upgrade");

/** Build an alternate asset tree shipping a different set of skills/agents. */
function makeAssets(
  fx: Fixture,
  tag: string,
  skills: string[],
  agents: string[],
): string {
  const dir = path.join(fx.root, `assets-${tag}`);
  for (const s of skills)
    write(path.join(dir, "skills", s, "SKILL.md"), `# ${s}\n`);
  for (const a of agents) write(path.join(dir, "agents", a), `# ${a}\n`);
  for (const sub of ["scripts", "lib", "assets", "docs"]) {
    write(path.join(dir, sub, `${sub}.txt`), sub);
  }
  return dir;
}

/** Install `assets` as `version` and record the manifest, as extension.ts does. */
async function installAs(
  fx: Fixture,
  assets: string,
  version: string,
): Promise<void> {
  const claude = await installClaude(assets, fx.home, version);
  writeManifest(path.join(fx.home, ".claude"), {
    version,
    installedAt: "2026-08-20T00:00:00.000Z",
    skills: claude.owned.skills,
    agents: claude.owned.agents,
  });
}

test("a skill dropped between versions is pruned, not orphaned", async () => {
  const fx = makeFixture();
  const v1 = makeAssets(fx, "v1", ["tizen-a", "tizen-dropped"], ["tizen-a.md"]);
  const v2 = makeAssets(fx, "v2", ["tizen-a"], ["tizen-a.md"]);

  await installAs(fx, v1, "1.0.0");
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "skills", "tizen-dropped")),
  );

  await installAs(fx, v2, "2.0.0");

  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "skills", "tizen-dropped")),
    false,
    "a skill no longer shipped must be removed",
  );
  assert.ok(fs.existsSync(path.join(fx.home, ".claude", "skills", "tizen-a")));
  assertUserContentIntact(fx, "after upgrade");
});

test("an agent dropped between versions is pruned, not orphaned", async () => {
  const fx = makeFixture();
  const v1 = makeAssets(
    fx,
    "v1",
    ["tizen-a"],
    ["tizen-a.md", "tizen-dropped.md"],
  );
  const v2 = makeAssets(fx, "v2", ["tizen-a"], ["tizen-a.md"]);

  await installAs(fx, v1, "1.0.0");
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "agents", "tizen-dropped.md")),
  );

  await installAs(fx, v2, "2.0.0");

  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "agents", "tizen-dropped.md")),
    false,
    "an agent no longer shipped must be removed",
  );
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "agents", "tizen-a.md")),
  );
  assertUserContentIntact(fx, "after upgrade");
});

test("a renamed skill leaves nothing behind under the old name", async () => {
  const fx = makeFixture();
  const v1 = makeAssets(fx, "v1", ["tizen-old-name"], []);
  const v2 = makeAssets(fx, "v2", ["tizen-new-name"], []);

  await installAs(fx, v1, "1.0.0");
  await installAs(fx, v2, "2.0.0");

  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".claude", "skills", "tizen-old-name")),
    false,
  );
  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "skills", "tizen-new-name")),
  );
});

test("the post-upgrade manifest still covers everything on disk", async () => {
  const fx = makeFixture();
  await installAs(
    fx,
    makeAssets(fx, "v1", ["tizen-a", "tizen-dropped"], ["tizen-a.md"]),
    "1.0.0",
  );
  await installAs(
    fx,
    makeAssets(fx, "v2", ["tizen-a"], ["tizen-a.md"]),
    "2.0.0",
  );

  await removeClaude(fx.home);

  // Nothing of ours may be left stranded once the manifest is consumed.
  const remaining = fs
    .readdirSync(path.join(fx.home, ".claude", "skills"))
    .concat(fs.readdirSync(path.join(fx.home, ".claude", "agents")));
  assert.deepStrictEqual(
    remaining.filter(
      (n) => !USER_SKILLS.includes(n) && !USER_AGENTS.includes(n),
    ),
    [],
    "no file we ever installed may survive removal",
  );
  assertUserContentIntact(fx, "after upgrade then removal");
});

test("only the current version cache is kept", async () => {
  const fx = makeFixture();
  await installAs(fx, makeAssets(fx, "v1", ["tizen-a"], []), "1.0.0");
  await installAs(fx, makeAssets(fx, "v2", ["tizen-a"], []), "2.0.0");
  await installAs(fx, makeAssets(fx, "v3", ["tizen-a"], []), "3.0.0");

  assert.deepStrictEqual(fs.readdirSync(claudeCacheRoot(fx.home)), ["3.0.0"]);
});

test("Cline upgrades prune stale skills and old caches too", async () => {
  const fx = makeFixture();
  const v1 = makeAssets(fx, "cv1", ["tizen-a", "tizen-dropped"], []);
  const v2 = makeAssets(fx, "cv2", ["tizen-a"], []);

  let r = await installCline(v1, fx.home, "1.0.0");
  writeManifest(path.join(fx.home, ".cline"), {
    version: "1.0.0",
    installedAt: "",
    skills: r.owned.skills,
    agents: [],
  });
  assert.ok(
    fs.existsSync(path.join(fx.home, ".cline", "skills", "tizen-dropped")),
  );

  r = await installCline(v2, fx.home, "2.0.0");
  assert.strictEqual(
    fs.existsSync(path.join(fx.home, ".cline", "skills", "tizen-dropped")),
    false,
  );
  assert.deepStrictEqual(fs.readdirSync(clineCacheRoot(fx.home)), ["2.0.0"]);
  for (const s of USER_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(fx.home, ".cline", "skills", s)),
      `${s} must survive`,
    );
  }
});

test("a first install with no previous manifest prunes nothing", async () => {
  const fx = makeFixture();
  const before = snapshot(path.join(fx.home, ".claude", "skills"));

  await installClaude(fx.assets, fx.home, VERSION);

  for (const key of Object.keys(before)) {
    assert.ok(
      key in snapshot(path.join(fx.home, ".claude", "skills")),
      `${key} must survive`,
    );
  }
  assertUserContentIntact(fx, "first install");
});

test("a previous manifest naming a traversal path prunes nothing unsafe", async () => {
  const fx = makeFixture();
  fs.mkdirSync(path.join(fx.home, ".claude"), { recursive: true });
  fs.writeFileSync(
    manifestPath(path.join(fx.home, ".claude")),
    JSON.stringify({
      version: "1.0.0",
      installedAt: "",
      skills: ["../../../outside", "../CLAUDE.md", "my-own-skill"],
      agents: ["../CLAUDE.md"],
    }),
    "utf-8",
  );

  // 'my-own-skill' is not shipped by the current assets, so it counts as stale
  // — the manifest is the authority, and the traversal entries must be dropped.
  await installClaude(fx.assets, fx.home, VERSION);

  assert.ok(
    fs.existsSync(path.join(fx.home, ".claude", "CLAUDE.md")),
    "CLAUDE.md must survive",
  );
  assert.ok(fs.existsSync(fx.outside), "the outside directory must survive");
  assert.strictEqual(
    fs.readFileSync(path.join(fx.outside, "precious.txt"), "utf-8"),
    "precious\n",
  );
});

// ─── 4. symlinks ────────────────────────────────────────────────────────

section("symlinked skill directories");

/** Windows needs privileges for symlinks; junctions work for dirs. */
function trySymlinkDir(target: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(
      target,
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    return true;
  } catch {
    return false;
  }
}

test("mirroring over a symlinked skill unlinks it without emptying the target", async () => {
  const fx = makeFixture();
  const target = path.join(fx.outside, "linked-skill");
  write(path.join(target, "SKILL.md"), "live-edited source\n");
  const link = path.join(fx.home, ".claude", "skills", ASSET_SKILLS[0]);

  if (!trySymlinkDir(target, link)) {
    console.log(
      "       (skipped: symlink/junction creation not permitted here)",
    );
    return;
  }

  await installClaude(fx.assets, fx.home, VERSION);

  assert.ok(
    fs.existsSync(path.join(target, "SKILL.md")),
    "the symlink target's contents must not be deleted",
  );
  assert.strictEqual(
    fs.readFileSync(path.join(target, "SKILL.md"), "utf-8"),
    "live-edited source\n",
  );
  assert.strictEqual(
    fs.lstatSync(link).isSymbolicLink() || fs.lstatSync(link).isDirectory(),
    true,
  );
  assert.strictEqual(
    fs.readFileSync(path.join(link, "SKILL.md"), "utf-8"),
    `# ${ASSET_SKILLS[0]}\n`,
    "the link must have been replaced by a real directory holding our content",
  );
});

test("removal of a symlinked skill does not empty the target either", async () => {
  const fx = makeFixture();
  const target = path.join(fx.outside, "linked-skill");
  write(path.join(target, "SKILL.md"), "live-edited source\n");
  const link = path.join(fx.home, ".claude", "skills", "tizen-linked");

  if (!trySymlinkDir(target, link)) {
    console.log(
      "       (skipped: symlink/junction creation not permitted here)",
    );
    return;
  }

  writeManifest(path.join(fx.home, ".claude"), {
    version: VERSION,
    installedAt: "",
    skills: ["tizen-linked"],
    agents: [],
  });
  await removeClaude(fx.home);

  assert.strictEqual(
    fs.existsSync(link),
    false,
    "the link itself should be gone",
  );
  assert.ok(
    fs.existsSync(path.join(target, "SKILL.md")),
    "the symlink target's contents must survive",
  );
});

// ─── 5. Codex CLI ───────────────────────────────────────────────────────

section("Codex CLI install (shared ~/.agents/skills, TOML agents)");

// The tests below resolve ~/.codex from the fixture HOME; a CODEX_HOME in the
// environment of whoever runs `npm test` must not redirect them.
delete process.env.CODEX_HOME;

/** The bundled converter, so the TOML the test sees is what the user gets. */
function realAgentConverter(): string {
  const candidates = [
    path.resolve(
      __dirname,
      "..",
      "..",
      "common",
      "lib",
      "tools",
      "agent-convert.js",
    ),
    path.resolve(__dirname, "assets", "lib", "tools", "agent-convert.js"),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found)
    throw new Error(`agent-convert.js not found in ${candidates.join(", ")}`);
  return found;
}

function agentMd(name: string): string {
  return `---\nname: ${name}\ndescription: ${name} agent\ntools: Bash, Read\nmodel: sonnet\n---\nDo the ${name} thing.\nPaths like C:\\Tizen\\sdb.exe must survive.\n`;
}

/**
 * makeFixture() plus what Codex needs: agents with real frontmatter (the
 * converter rejects a bare heading), the converter itself, the guard scripts and
 * document, and pre-existing user content in ~/.agents/skills, ~/.codex/agents
 * and ~/.codex/AGENTS.md.
 */
function makeCodexFixture(): Fixture {
  const fx = makeFixture();
  for (const a of ASSET_AGENTS) {
    write(path.join(fx.assets, "agents", a), agentMd(a.replace(/\.md$/, "")));
  }
  fs.mkdirSync(path.join(fx.assets, "lib", "tools"), { recursive: true });
  fs.copyFileSync(
    realAgentConverter(),
    path.join(fx.assets, "lib", "tools", "agent-convert.js"),
  );
  write(
    path.join(fx.assets, "hooks", "check-project-writes.sh"),
    "#!/bin/bash\n",
  );
  write(
    path.join(fx.assets, "hooks", "tizen-sdk-skills-guard.md"),
    "# Tizen SDK Skills — guard rules\n\n1. never hunt for sdb\n",
  );

  for (const s of USER_SKILLS) {
    write(path.join(codexSkillsDir(fx.home), s, "SKILL.md"), `user: ${s}\n`);
  }
  // A Gemini-installed neighbour in the shared namespace
  write(
    path.join(codexSkillsDir(fx.home), "gemini-thing", "SKILL.md"),
    "gemini\n",
  );
  write(path.join(codexAgentsDir(fx.home), "my-agent.toml"), 'name = "mine"\n');
  write(
    path.join(codexAgentsDir(fx.home), "tizen-hand-written.toml"),
    'name = "hand"\n',
  );
  write(
    codexContextFile(fx.home),
    "# My Codex rules\n\nAlways answer in Korean.\n",
  );
  return fx;
}

test("the Codex install fills the cache, mirrors skills into ~/.agents/skills and converts agents to TOML", async () => {
  const fx = makeCodexFixture();
  const r = await installCodex(fx.assets, fx.home, VERSION);

  assert.strictEqual(r.skillsDir, codexSkillsDir(fx.home));
  assert.deepStrictEqual(r.owned.skills, ASSET_SKILLS);
  assert.deepStrictEqual(
    r.owned.agents,
    ASSET_AGENTS.map((a) => a.replace(/\.md$/, ".toml")),
  );

  for (const s of ASSET_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(codexSkillsDir(fx.home), s, "SKILL.md")),
      s,
    );
  }
  for (const s of USER_SKILLS) {
    assert.strictEqual(
      fs.readFileSync(
        path.join(codexSkillsDir(fx.home), s, "SKILL.md"),
        "utf-8",
      ),
      `user: ${s}\n`,
      `${s} must survive`,
    );
  }
  assert.ok(
    fs.existsSync(
      path.join(codexSkillsDir(fx.home), "gemini-thing", "SKILL.md"),
    ),
  );

  const toml = fs.readFileSync(
    path.join(codexAgentsDir(fx.home), "tizen-build-project.toml"),
    "utf-8",
  );
  assert.ok(toml.includes('name = "tizen-build-project"'));
  assert.ok(toml.includes("developer_instructions = '''"));
  assert.ok(
    toml.includes("C:\\Tizen\\sdb.exe"),
    "backslashes survive the literal string",
  );
  assert.ok(!toml.includes("tools ="), "tools has no Codex equivalent");
  assert.ok(
    !fs.existsSync(
      path.join(codexAgentsDir(fx.home), "tizen-build-project.md"),
    ),
  );

  const cache = codexCacheBase(fx.home, VERSION);
  for (const sub of ["skills", "agents", "scripts", "lib", "assets"]) {
    assert.ok(fs.existsSync(path.join(cache, sub)), `cache/${sub}`);
  }
  assert.strictEqual(
    fs.existsSync(path.join(cache, "docs")),
    false,
    "codex cache has no docs",
  );
  assert.ok(fs.existsSync(path.join(fx.outside, "precious.txt")));
});

test("Codex removal deletes ours and keeps the user's and Gemini's files", async () => {
  const fx = makeCodexFixture();
  const r = await installCodex(fx.assets, fx.home, VERSION);
  writeManifest(path.join(fx.home, ".codex"), {
    version: VERSION,
    installedAt: "2026-08-20T00:00:00.000Z",
    skills: r.owned.skills,
    agents: r.owned.agents,
  });
  await removeCodex(fx.home);

  for (const s of ASSET_SKILLS) {
    assert.strictEqual(
      fs.existsSync(path.join(codexSkillsDir(fx.home), s)),
      false,
      s,
    );
  }
  for (const a of r.owned.agents) {
    assert.strictEqual(
      fs.existsSync(path.join(codexAgentsDir(fx.home), a)),
      false,
      a,
    );
  }
  for (const s of USER_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(codexSkillsDir(fx.home), s, "SKILL.md")),
      s,
    );
  }
  assert.ok(
    fs.existsSync(
      path.join(codexSkillsDir(fx.home), "gemini-thing", "SKILL.md"),
    ),
  );
  assert.ok(fs.existsSync(path.join(codexAgentsDir(fx.home), "my-agent.toml")));
  assert.ok(
    fs.existsSync(
      path.join(codexAgentsDir(fx.home), "tizen-hand-written.toml"),
    ),
  );
  assert.strictEqual(fs.existsSync(codexCacheBase(fx.home, VERSION)), false);
  assert.strictEqual(
    fs.existsSync(manifestPath(path.join(fx.home, ".codex"))),
    false,
  );
});

test("without a manifest, Codex removal drops only the cache and says why", async () => {
  const fx = makeCodexFixture();
  await installCodex(fx.assets, fx.home, VERSION);
  takeLog();
  await removeCodex(fx.home);
  assert.ok(takeLog().some((l) => l.includes("No install manifest")));
  for (const s of ASSET_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(codexSkillsDir(fx.home), s)),
      `${s} kept without manifest`,
    );
  }
  assert.strictEqual(fs.existsSync(codexCacheBase(fx.home, VERSION)), false);
});

test("a Codex upgrade prunes the skill and agent the new version no longer ships", async () => {
  const fx = makeCodexFixture();
  const v1 = await installCodex(fx.assets, fx.home, "1.0.0");
  writeManifest(path.join(fx.home, ".codex"), {
    version: "1.0.0",
    installedAt: "x",
    skills: v1.owned.skills,
    agents: v1.owned.agents,
  });

  // v2 drops the second skill and agent
  fs.rmSync(path.join(fx.assets, "skills", ASSET_SKILLS[1]), {
    recursive: true,
  });
  fs.rmSync(path.join(fx.assets, "agents", ASSET_AGENTS[1]));
  const v2 = await installCodex(fx.assets, fx.home, "2.0.0");

  assert.deepStrictEqual(v2.owned.skills, [ASSET_SKILLS[0]]);
  assert.strictEqual(
    fs.existsSync(path.join(codexSkillsDir(fx.home), ASSET_SKILLS[1])),
    false,
  );
  assert.strictEqual(
    fs.existsSync(
      path.join(
        codexAgentsDir(fx.home),
        ASSET_AGENTS[1].replace(/\.md$/, ".toml"),
      ),
    ),
    false,
  );
  assert.strictEqual(
    fs.existsSync(codexCacheBase(fx.home, "1.0.0")),
    false,
    "old cache pruned",
  );
  assert.ok(fs.existsSync(codexCacheBase(fx.home, "2.0.0")));
  assert.ok(fs.existsSync(path.join(codexAgentsDir(fx.home), "my-agent.toml")));
});

test("CODEX_HOME redirects the config side but not the shared skills directory", async () => {
  const fx = makeCodexFixture();
  const override = path.join(fx.root, "codex-elsewhere");
  process.env.CODEX_HOME = override;
  try {
    const r = await installCodex(fx.assets, fx.home, VERSION);
    assert.ok(r.cacheBase.startsWith(override), r.cacheBase);
    assert.strictEqual(r.agentsDir, path.join(override, "agents"));
    assert.strictEqual(r.skillsDir, path.join(fx.home, ".agents", "skills"));
    assert.strictEqual(
      fs.existsSync(path.join(fx.home, ".codex", "plugins")),
      false,
    );
  } finally {
    delete process.env.CODEX_HOME;
  }
});

test("Codex hooks: scripts, a tagged hooks.json, and a guard section appended after the user's AGENTS.md text", async () => {
  const fx = makeCodexFixture();
  await installCodexHooks(fx.assets, fx.home);

  for (const g of ["check-tizen-commands.sh", "check-project-writes.sh"]) {
    assert.ok(fs.existsSync(path.join(codexHooksDir(fx.home), g)), g);
  }
  const hooks = JSON.parse(
    fs.readFileSync(codexHooksJsonPath(fx.home), "utf-8"),
  );
  assert.strictEqual(hooks._source, "tizen-sdk-skills");
  assert.strictEqual(hooks.hooks.PreToolUse.length, 2);

  const ctx = fs.readFileSync(codexContextFile(fx.home), "utf-8");
  const { begin, end } = guardMarkers();
  assert.ok(
    ctx.startsWith(
      "# My Codex rules\n\nAlways answer in Korean.\n\n" + begin + "\n",
    ),
  );
  assert.ok(ctx.includes("never hunt for sdb"));
  assert.ok(ctx.includes("This host is Codex CLI"));
  assert.ok(
    ctx.includes(path.join(fx.home, ".codex", "plugins", "cache")),
    "this host's cache root is pinned",
  );
  assert.ok(ctx.trimEnd().endsWith(end));

  // Re-running changes nothing
  await installCodexHooks(fx.assets, fx.home);
  assert.strictEqual(fs.readFileSync(codexContextFile(fx.home), "utf-8"), ctx);
  assert.strictEqual((ctx.match(/tizen-sdk-skills:begin/g) || []).length, 1);
});

test("a hooks.json that is not ours is kept, and the merge snippet is logged", async () => {
  const fx = makeCodexFixture();
  const theirs = '{\n  "hooks": { "PreToolUse": [] }\n}\n';
  write(codexHooksJsonPath(fx.home), theirs);
  takeLog();
  await installCodexHooks(fx.assets, fx.home);

  assert.strictEqual(
    fs.readFileSync(codexHooksJsonPath(fx.home), "utf-8"),
    theirs,
  );
  const log = takeLog();
  assert.ok(log.some((l) => l.includes("NOT overwriting")));
  assert.ok(
    log.some((l) => l.includes("check-tizen-commands.sh")),
    "snippet printed",
  );
  // Guard scripts and the AGENTS.md section still go in
  assert.ok(
    fs.existsSync(path.join(codexHooksDir(fx.home), "check-tizen-commands.sh")),
  );
  assert.ok(
    fs
      .readFileSync(codexContextFile(fx.home), "utf-8")
      .includes(guardMarkers().begin),
  );

  // …and removal leaves their file alone
  await removeCodexHooks(fx.home);
  assert.strictEqual(
    fs.readFileSync(codexHooksJsonPath(fx.home), "utf-8"),
    theirs,
  );
});

test("removing Codex hooks cuts our section out of AGENTS.md and keeps the rest", async () => {
  const fx = makeCodexFixture();
  await installCodexHooks(fx.assets, fx.home);
  await removeCodexHooks(fx.home);

  assert.strictEqual(
    fs.existsSync(codexHooksJsonPath(fx.home)),
    false,
    "ours → removed",
  );
  assert.strictEqual(fs.existsSync(codexHooksDir(fx.home)), false);
  assert.strictEqual(
    fs.readFileSync(codexContextFile(fx.home), "utf-8"),
    "# My Codex rules\n\nAlways answer in Korean.\n",
  );
});

test("an AGENTS.md we created from nothing is removed with the section", async () => {
  const fx = makeCodexFixture();
  fs.rmSync(codexContextFile(fx.home));
  await installCodexHooks(fx.assets, fx.home);
  assert.ok(fs.existsSync(codexContextFile(fx.home)));
  await removeCodexHooks(fx.home);
  assert.strictEqual(fs.existsSync(codexContextFile(fx.home)), false);
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
