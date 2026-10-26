# Changelog

All notable changes to the **tizen-agent-skills** unified release are documented
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

This changelog tracks the repository-wide release version (`tizen-agent-skills-vX.Y.Z`).
Each plugin also keeps its own `CHANGELOG.md` with its independent version history:

- [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md)
- [tizen-action-skills/CHANGELOG.md](tizen-action-skills/CHANGELOG.md)

## [Unreleased]

## [1.3.1] — 2026-10-26

Repository-wide release that ships `tizen-sdk-skills` 1.6.1 and `tizen-action-skills` 1.0.0.

### Added

- **Codex and Cline entrypoints for the pull request review skill**
  (`.agents/skills/tizen-sdk-skills-review/SKILL.md`,
  `.cline/skills/tizen-sdk-skills-review/SKILL.md`). Each is a thin file that
  points to the canonical procedure in `.claude/skills/`, so the procedure is
  maintained in one place. `.gitignore` now tracks `.cline/skills/` while still
  ignoring the rest of `.cline/`.

### Changed

- **Review comments name the model that wrote them**
  (`.claude/skills/tizen-sdk-skills-review/SKILL.md`, plus the Codex and Cline
  entrypoints). Every review comment, re-reviews included, now ends with a line such as
  `Reviewed with Opus 5.5 (claude-opus-5-5) in Claude Code`, so readers can tell which
  model produced each pass. The agent fills it from what it was told about itself and
  writes `unknown` instead of guessing.
- `tizen-sdk-skills` plugin advanced from 1.6.0 to 1.6.1 (patch). Highlights: the update
  check records why a check failed and readable timestamps in `~/.tizen.agent.update.json`,
  works behind proxies that re-sign HTTPS and on slow machines, and is no longer killed by
  its own hook timeout; the bundled dlog analyzer moves to 0.2.9a0; a one-page quick guide
  (EN + KO) is added. See [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md)
  for details. The release assets stamped with the plugin version are therefore
  `tizen-sdk-v1.6.1.zip` and `tizen-ai-extension-v1.6.1.vsix`.
- The marketplace catalog version follows `tizen-sdk-skills` and is now 1.6.1.

## [1.3.0] — 2026-10-25

Repository-wide release that ships `tizen-sdk-skills` 1.6.0 and `tizen-action-skills` 1.0.0.

### Changed

- `tizen-sdk-skills` plugin advanced from 1.5.0 to 1.6.0. Highlight: the setup scripts now
  register a session-start hook for Claude Code, Codex CLI, Gemini CLI and Cline that tells
  the user when a newer release is out. It checks `.claude-plugin/marketplace.json` on
  `main` at most once a day, shows the same notice at most once a day, works behind
  `HTTPS_PROXY` on Node 22.21+ / 24+, and stays silent on any failure. The VS Code
  extension's uninstall also removes these entries. See
  [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md) for details. The release
  assets stamped with the plugin version are therefore `tizen-sdk-v1.6.0.zip` and
  `tizen-ai-extension-v1.6.0.vsix`.
- The marketplace catalog version follows `tizen-sdk-skills` and is now 1.6.0.

## [1.2.0] — 2026-10-25

Repository-wide release that ships `tizen-sdk-skills` 1.5.0 and `tizen-action-skills` 1.0.0.

### Changed

- `tizen-sdk-skills` plugin advanced from 1.4.5 to 1.5.0. Highlights: several Tizen
  platform versions can be managed side by side (`platform-install --list`, and
  `--platform-version` on `create` / `list-templates`), screenshots fall back for
  Wayland/HWC targets, dlog-analyzer gains a `crash-report` action, TV SDK hints offer
  the ZIP installer for any version, and `--force` reinstalls an installed SDK. See
  [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md) for the full list. The
  release assets stamped with the plugin version are therefore `tizen-sdk-v1.5.0.zip`
  and `tizen-ai-extension-v1.5.0.vsix`.
- Root `.claude-plugin/marketplace.json` catalog version follows the `tizen-sdk-skills`
  plugin (1.5.0). `AGENTS.md` and `CONTRIBUTING.md` now state this rule instead of
  "bump only when the catalog itself changes".

## [1.1.2] — 2026-10-21

Repository-wide release that ships `tizen-sdk-skills` 1.4.5 and `tizen-action-skills` 1.0.0.

### Added

- **Pull request review skill** (`.claude/skills/tizen-sdk-skills-review/SKILL.md`). A
  reviewer asks their coding agent to review a `tizen-sdk-skills` pull request; the agent
  runs `check-pr.js` and the matching safe-tier checks, rechecks earlier findings, and
  posts one English review comment after the reviewer confirms. `.gitignore` now tracks
  `.claude/skills/` while still ignoring the rest of `.claude/`.

### Changed

- `tizen-sdk-skills` plugin advanced from 1.4.4 to 1.4.5 (#47). Highlights: the command
  guard hook is scoped to Tizen work — its Tizen tooling rules apply only once an SDK is
  configured through the plugin (`~/.tizen.sdk.path.config`), it no longer forbids the
  `tizen` CLI or looking up where sdb is, and a hand-typed sdb must be the configured
  SDK's `tools/sdb`. See [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md)
  for the full list. The release assets stamped with the plugin version are therefore
  `tizen-sdk-v1.4.5.zip` and `tizen-ai-extension-v1.4.5.vsix`.
- Root `.claude-plugin/marketplace.json` catalog version follows the `tizen-sdk-skills`
  plugin (1.4.5).

## [1.1.1] — 2026-10-16

Repository-wide release that ships `tizen-sdk-skills` 1.4.4 and `tizen-action-skills` 1.0.0.

### Changed

- `tizen-sdk-skills` plugin advanced from 1.4.3 to 1.4.4 (#45, sync of internal main
  `d11bef68`). Highlights: the test runner executes the locally built `tizen-sdk` launcher
  exclusively instead of looking up global `tizen-cli` / `tizen-sdk` binaries on PATH
  (fixes #282); the "list the available emulators" ask routes to `emulator-manager list-vm`
  and each VM's `profile` is reported on `list-vm --detail`; the bundled `tizen-dlog-analyzer`
  runner exposes the 0.2.8a0 feature set (`rules`, the expanded `investigate` options and
  conclusions, consent-gated `probe run` options, file mode for offline analysis); every
  CLI-runner lookup section carries a "run the node line as-is" note; launch-emulator VM
  auto-selection compares platform versions segment-wise and filters by profile, and the WSL
  home-screen fix also covers headless Linux hosts. See
  [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md) for the full list. The
  release assets stamped with the plugin version are therefore `tizen-sdk-v1.4.4.zip` and
  `tizen-ai-extension-v1.4.4.vsix`.
- Root `.claude-plugin/marketplace.json` catalog version follows the `tizen-sdk-skills` plugin
  (1.4.4).
- `.github/workflows/ci.yml` runs the standalone launcher directly
  (`node tizen-sdk-skills/tizen-cli/bin/tizen-sdk.js --capabilities`) instead of symlinking it
  onto PATH, matching the new test-runner executor resolution.

## [1.1.0] — 2026-10-14

Repository-wide release that ships `tizen-sdk-skills` 1.4.3 and `tizen-action-skills` 1.0.0.

### Changed

- `tizen-sdk-skills` plugin advanced from 1.4.2 to 1.4.3 (#40, #41, and the direct sync of
  internal PR #260). Highlights: the standalone `tizen-sdk` CLI becomes the sole usage mode
  (the `tizen-cli` host commands are gone from the READMEs and every `suggested_fix.command`),
  the PowerShell CLI-runner lookup gains a `, FullName` secondary sort key as a mitigation for
  `$_` expansion when the block is wrapped in `powershell -Command "…"`, and the guard hooks
  document the limits of that fallback. See [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md)
  for the full list. The release assets stamped with the plugin version are therefore
  `tizen-sdk-v1.4.3.zip` and `tizen-ai-extension-v1.4.3.vsix`.
- Root `.claude-plugin/marketplace.json` catalog version follows the `tizen-sdk-skills` plugin
  (1.4.3).

### Added

- Repository-level `AGENTS.md` (#39): a concise summary of the technical rules for AI coding
  agents (plugin structure, versioning model, documentation conventions, security, commit/PR
  style, validation commands per plugin), cross-linked from the READMEs, `CONTRIBUTING.md` and
  `llms.txt`.

## [1.0.0]

### Added

- Unified release model: the repository now releases as a whole under the
  `tizen-agent-skills-v*` tag prefix. A single GitHub Release publishes assets
  from every plugin — `tizen-sdk-skills` (CLI zip, VSIX, source zip) and
  `tizen-action-skills` (source zip) — together.
- Root `package.json` as the single source of truth for the unified release
  version, separate from each plugin's own version in its `package.json` and
  `common/.claude-plugin/plugin.json`.
- Root `CHANGELOG.md` to track repository-wide release history.

### Changed

- `.github/workflows/release.yml` now triggers on `tizen-agent-skills-v*` tags
  instead of `tizen-sdk-skills-v*`. It builds and packages all plugin assets
  in one run and uses GitHub's `--generate-notes` (no per-plugin filtering)
  because a unified release legitimately includes every PR.
- `.github/release.yml` updated for the unified release: no plugin-specific
  exclusions.
- `CONTRIBUTING.md` updated to describe the unified release model: plugins
  keep their own versions for their manifests; the repository releases as a
  whole under `tizen-agent-skills-v*`.

### Removed

- `tizen-sdk-skills/scripts/generate-release-notes.sh` — no longer needed;
  the unified release uses GitHub's built-in `--generate-notes`.
