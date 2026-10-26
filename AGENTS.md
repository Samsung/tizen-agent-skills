# Working in tizen-agent-skills

This repository is Samsung's open-source collection of Tizen development
plugins for AI coding agents. Each top-level directory is one independently
versioned plugin (`tizen-sdk-skills/`, `tizen-action-skills/`, …).

Start with [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md). For
detailed authoring and review instructions, read each plugin's own
`CONTRIBUTING.md` (for example
[tizen-sdk-skills/CONTRIBUTING.md](tizen-sdk-skills/CONTRIBUTING.md)).

## Essential rules

### Plugin structure

- `common/` is the single source of truth for every plugin — skills, agents,
  hooks, `lib/`, `scripts/`, `setup/`. The host wrapper directories
  (`claude/`, `cline/`, `codex/`, `gemini/`) hold thin adapters only; never
  duplicate logic into them.
- Do not edit the mirrored copies under `~/.claude`, `~/.cline`, `~/.codex`
  or `~/.gemini`; re-run the plugin's setup script instead.
- After changing a runner-lookup snippet or `HOST_DOT_DIRS` in
  `common/lib/core/plugin-cache.js`, run
  `node scripts/rewrite-runner-snippets.js` and then `--check`.

### Versioning

- **Repository release version** — root `package.json` `version`, tracked in
  root `CHANGELOG.md`. Tags follow `tizen-agent-skills-vX.Y.Z`.
- **Plugin versions are independent** — each plugin's `package.json` and
  `common/.claude-plugin/plugin.json` carry the plugin's own version
  (for example `tizen-sdk-skills` is at 1.4.x, `tizen-action-skills` at 1.0.x).
  Bump them independently of the release version.
- Keep `plugin.json` `version` and `package.json` `version` in sync within a
  plugin.
- `marketplace.json` top-level `version` and `metadata.version` are the catalog
  version. They follow the `tizen-sdk-skills` plugin version: bump them together
  with every `tizen-sdk-skills` version bump.

### Adding a new plugin

Follow the checklist in
[CONTRIBUTING.md → Adding a new plugin](CONTRIBUTING.md#adding-a-new-plugin).
A new plugin must register in `marketplace.json`, `README.md`/`README.ko.md`
plugin table (between `<!-- plugins:start -->` / `<!-- plugins:end -->`),
`llms.txt`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, and `release.yml`.

### Documentation

- Write English first; provide a Korean mirror (`README.ko.md`,
  `CONTRIBUTING.ko.md`, `CHANGELOG.ko.md`).
- Give each hand-written document one H1 as its first content heading.
- Use lowercase kebab-case for new file and directory names.
- Keep `llms.txt` updated when adding significant new documentation.

### Security

- **Never commit** internal hostnames, private IP addresses, personal home
  paths, credentials, certificates (other than the documented throwaway test
  fixture) or captured session logs that contain them. The pull request
  template has a checklist item for this.

### Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) with the
  plugin name as scope, for example `fix(tizen-sdk-skills): ...`,
  `docs(tizen-action-skills): ...`.
- Keep pull requests focused on one plugin directory; CI workflows are scoped
  per project (`.github/workflows/*.yml` filter on `<project>/**`).
- Open an issue before starting large changes so the approach can be agreed
  first.

## Validating a change

### tizen-sdk-skills

```bash
# Lint and format (repo-wide)
pnpm install --frozen-lockfile && pnpm run lint && pnpm run format:check

# Unit tests
node common/lib/tests/run-all.js
bash common/hooks/hooks.test.sh

# Runner snippets and SPDX headers in sync
node scripts/rewrite-runner-snippets.js --check
node scripts/add-spdx-headers.js --check

# Rules on the files this change touches (authoring; add --format jsonl when reviewing,
# CI uses --format github to annotate the pull request's Files changed tab)
node scripts/check-pr.js --base origin/main

# Standalone CLI compiles
cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm run build

# Test-case schema lint (no SDK or device required)
cd tests && npm ci && node runner.mjs --dry-run
npm run lint        # TC schema dry-run + doc-stats + runner helper tests
npm run test:safe   # safe-tier TCs, no SDK or device required
```

`pnpm` is used at the plugin root and in `tizen-cli/`; `npm` is used in
`tests/`. Test tiers (safe / mutating / device) are defined in
[tizen-sdk-skills/tests/README.md](tizen-sdk-skills/tests/README.md#tier-classification).
Record which tiers you ran in the PR's Testing section.

`check-pr.js` reports each finding with a rule ID. `ERROR` blocks the pull
request; fix every one. `WARN` does not block, but each one must be fixed or
explained in the pull request description before approval. A run always ends
with a summary line such as `check-pr: 0 ERROR, 0 WARN (12 files, 0.05s)`; if
nothing is printed, the check did not run, so check the `--base` revision.

The check cannot judge these, so its silence is not approval:

- logic duplicated into a host wrapper instead of `common/`;
- a spawned process whose exit code is not checked;
- a `.sh` change without the matching `.ps1` change (or the reverse);
- personal information inside an added image or screenshot.

### tizen-action-skills

No build step or test suite yet. Verify that `plugin.json` and `package.json`
versions are in sync and that the skill README renders correctly.

## Reviewing a pull request

To review someone else's `tizen-sdk-skills` pull request, follow
[`.claude/skills/tizen-sdk-skills-review/SKILL.md`](.claude/skills/tizen-sdk-skills-review/SKILL.md).
It runs `check-pr.js` and the matching safe-tier checks, rechecks earlier
review findings, and posts one English review comment after the reviewer
confirms the draft. Agents never approve, request changes or merge.

That file is the single copy of the procedure. Codex and Cline load it
through thin entrypoints that only point back to it:

- Codex: [`.agents/skills/tizen-sdk-skills-review/SKILL.md`](.agents/skills/tizen-sdk-skills-review/SKILL.md)
- Cline: [`.cline/skills/tizen-sdk-skills-review/SKILL.md`](.cline/skills/tizen-sdk-skills-review/SKILL.md)

Change the procedure in `.claude/skills/` only; do not copy it into the
entrypoints.
