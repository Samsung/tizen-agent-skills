# Changelog

All notable changes to the **tizen-agent-skills** unified release are documented
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

This changelog tracks the repository-wide release version (`tizen-agent-skills-vX.Y.Z`).
Each plugin also keeps its own `CHANGELOG.md` with its independent version history:

- [tizen-sdk-skills/CHANGELOG.md](tizen-sdk-skills/CHANGELOG.md)
- [tizen-action-skills/CHANGELOG.md](tizen-action-skills/CHANGELOG.md)

## [Unreleased]

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
