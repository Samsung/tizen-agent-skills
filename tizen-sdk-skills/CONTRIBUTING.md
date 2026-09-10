# Contributing to tizen-sdk-skills

Thanks for helping improve the plugin. This guide covers the mechanics of a
contribution; roles, approval rules and decision-making are in
[GOVERNANCE.md](GOVERNANCE.md). [한국어](CONTRIBUTING.ko.md)

## 1. Before you start

- Read [GOVERNANCE.md](GOVERNANCE.md) — in particular 2.2 (code review).
- Prerequisites: Node.js 20 or later; `pnpm` at the repository root; `npm` in
  `tizen-cli/` and `tests/`. Running cli-lane test cases additionally needs
  tizen-cli with the built plugin installed.
- To use the plugin rather than develop it, follow
  [Quick Start](README.md#quick-start).

## 2. Where changes go (Harness Separation)

`common/` is the single source of truth — agents, skills, `lib/`, `scripts/`,
`hooks/`, `setup/`. Every harness mirrors it at install time.

- Put logic in `common/`. The `claude/`, `cline/`, `codex/` and `gemini/`
  directories hold thin wrappers and hook adapters only; do not duplicate
  logic into them.
- Never edit the mirrored copies under `~/.claude`, `~/.cline`, `~/.codex` or
  `~/.gemini`; re-run the setup script instead.
- After changing a runner-lookup snippet or `HOST_DOT_DIRS` in
  `common/lib/core/plugin-cache.js`, run
  `node scripts/rewrite-runner-snippets.js` and then `--check`.
- `tizen-cli/` and `vscode/` bundle `common/` at build time — do not vendor
  copies into them.
- Adding a harness = one `common/setup/hosts/<name>.{sh,ps1}`, one
  `HOST_DOT_DIRS` entry, and the rewrite script. See
  [Harness Separation Principle](README.md#harness-separation-principle).

## 3. Branch flow

- Branch from `dev`, named `<type>/<topic>` (for example `fix/sdb-stderr`,
  `docs/governance`).
- Open your pull request against **`dev`**.
- Maintainers periodically open a `dev` → `main` PR. `main` is release-only;
  `tizen-sdk-skills-v*` tags on `main` trigger the repository-root `release.yml`.
- **CI (the repository-root `ci.yml`) runs only on pull requests to `main`** that
  touch `tizen-sdk-skills/**`, so run the local checks in section 6 before opening
  a PR to `dev`.

## 4. Commit messages

Conventional Commits, as used throughout this repository:

```
<type>(<scope>)?: <imperative, lowercase subject, ≤ 72 chars>

<body: why, not what — the diff shows what>

Refs #NNN
```

- Types: `feat` `fix` `docs` `test` `refactor` `chore` `ci` `style` `build`
  `perf` `revert`.
- Scope is the module or sub-area: `lib` `setup` `scripts` `docs` `vscode`
  `tizen-cli` `tests` `agents` `skills` `hooks`. Omit it when the change is
  repo-wide.
- Real examples from the history:
  - `fix(build): empty dist/ before each tizen-cli build`
  - `fix(docs): replace example passwords with placeholders`
  - `chore: bump version to 1.1.0`

## 5. Pull requests

- Fill in every section of the template (Summary / Changes / Commits /
  Testing). It is loaded automatically from
  the repository-root `.github/PULL_REQUEST_TEMPLATE.md`.
- Discussion belongs in the PR review thread. Open a separate Issue only when a
  topic outgrows the PR and link it from the PR description.
- Reviewers are auto-requested from the repository-root `.github/CODEOWNERS`. Approval rules are in
  GOVERNANCE.md 2.2.1.
- One topic per PR. Update the branch by rebasing on `dev` rather than by
  merge commits.

## 6. Local checks

Run the command block in [README → Development](README.md#development) before
every PR. In addition, for the test suite:

```bash
cd tests && npm ci
npm run lint        # TC schema dry-run + doc-stats + runner helper tests (same as CI)
npm run test:safe   # safe-tier TCs, no SDK or device required
```

## 7. Test tiers

Tiers are defined in
[tests/README.md → Tier Classification](tests/README.md#tier-classification).

| Tier     | Needs                          | Run it when you touch                                                                                                |
| -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| safe     | nothing                        | anything — always run `npm run test:safe`                                                                            |
| mutating | a real Tizen SDK on the host   | SDK install/update, certificate, project create/delete/build, rootstrap, dotnet-setup                                |
| device   | a running emulator or a device | device-manager, emulator, install-app, screenshot, file-transfer, remote-device, gdb/dotnet/webapp debug, playwright |

Record which tiers you ran in the PR's "Testing" section.

Adding a TC: follow
[tests/README.md → Adding a New TC](tests/README.md#adding-a-new-tc) — file
naming, YAML schema, updating the counts in `tests/README.md` and
`CSV-YAML-MAPPING.md`, `${NAME}` placeholders instead of real credentials. New
TCs start with `status: draft`.

## 8. Documentation

- Documents ship in pairs and both files change in the same PR:
  - repository root: `X.md` (English) + `X.ko.md` (Korean);
  - `docs/`: `X.md` (Korean) + `X.en.md` (English);
  - `tizen-cli/README.md` + `tizen-cli/README.ko.md`.
- Keep the command and skill counts ("34 commands", "29 skills") consistent
  across `README*.md`, `docs/SKILLS_REFERENCE*.md`, `tests/README.md` and the
  "Project at a Glance" table in `README*.md`.
- New Markdown follows the repository Prettier settings (80 columns, LF line
  endings; `.gitattributes` enforces LF for `*.md`). CI does not lint
  Markdown, so run `npx prettier --check <file>` yourself.

## 9. Versioning and releases (Maintainers)

1. Bump the version in one `chore: bump version to X.Y.Z` commit. It lives in
   seven files: `package.json`, `tests/package.json`,
   `tizen-cli/package.json`, `tizen-cli/plugin.json`, `vscode/package.json`,
   `common/.claude-plugin/plugin.json`, `_repo-root/.claude-plugin/marketplace.json`
   (and the copy at the `tizen-agent-skills` repository root).
2. Merge `dev` into `main`.
3. Tag `tizen-sdk-skills-vX.Y.Z` on `main` of the `tizen-agent-skills`
   repository. The repository-root `release.yml` builds `tizen-sdk-vX.Y.Z.zip` and
   `tizen-ai-extension-vX.Y.Z.vsix` and attaches them to the GitHub Release —
   see [Releases](README.md#releases).
4. Record the release in `CHANGELOG.md` and announce it in an Issue titled
   `Release tizen-sdk-skills vX.Y.Z` linking the bump PR.

## 10. Becoming a Reviewer or Maintainer

Roles follow contribution. After roughly ten merged, non-trivial pull requests
in a module you (or any Reviewer/Maintainer) can open a `governance` Issue to
nominate you as a Reviewer of that module; the Maintainers accept by Lazy
Consensus. Details, including the Maintainer path and revocation, are in
GOVERNANCE.md 2.1.1.

## 11. Reporting bugs and security issues

- Bugs and feature requests: open a GitHub Issue in this
  repository with reproduction steps, host (Claude Code / Cline / Codex /
  Gemini / tizen-cli), OS, and the JSON envelope or log output.
- Leaked credentials, certificate material, or anything security-sensitive:
  **do not** open a public Issue. Follow the private reporting process in
  [SECURITY.md](../SECURITY.md) at the repository root.
