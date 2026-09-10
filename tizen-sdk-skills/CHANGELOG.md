# Changelog

All notable changes to **tizen-sdk-skills** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Releases are tagged `tizen-sdk-skills-vX.Y.Z` on the
[tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills) repository.

## [Unreleased]

## [1.2.0] — 2026-09-10

Hooks auto-merge on install, `launch`-based .NET debugging, RPM parity for the PowerShell
installer, and Windows em-cli fixes. First release published from
[Samsung/tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills).

### Added

- Setup scripts now merge the PreToolUse guard hooks into the host's `settings.json`
  automatically (`common/lib/tools/merge-hooks-json.js`) instead of only printing a snippet
  to paste by hand. Foreign entries are preserved, this plugin's stale entries are replaced,
  the file's indentation and line endings are kept, and a pristine `settings.json.tizen-backup`
  is written once. Gemini CLI prints the manual snippet from the same generator.
- `remote_path_not_found` (`TIZEN_SDK_IO_E003`) — `sdb pull` of a file that does not exist on
  the device is reported with a do-not-retry fix and sdb's own "No such file" line.
- Guard rule 16 denies hunting for the `sdb` binary with `which` / `where` / `find`; the
  runners resolve it themselves.
- Emulator launch result fields `timeout_sec`, `waited_ms` and `emulator_keeps_running`.

### Changed

- **.NET remote debugging defaults to `launch` instead of `attach`.** Tizen has no CoreCLR
  debug transport, so attaching to a running process cannot work. A shared
  `resolve_app_id` / `Resolve-AppId` helper fails with the list of installed apps when the
  app id is unknown, `launch_app` output is captured, and the envelope leads with "suspended
  before Main(), no window until F5".
- `tizen-sdb-helper` is rewritten runner-first ("ROUTE HERE FIRST"); `tizen-remote-device`
  triggers on a bare "connect to <ip>"; `tizen-playwright-test` and `tizen-webapp-debug` gained
  an "Inputs — how to obtain (no sdb)" section.
- The emulator `--timeout` is documented as a wait cap, not a lifetime: the emulator keeps
  running after the runner returns.
- A certificate password passed on the command line now produces an exposure warning.
- Codex sandbox: project `list-templates` / `create` moved to the escalated list (a sandboxed
  run listed zero web templates for an SDK that had them), and `sandbox.js` recognises the
  runners' own symptom phrases so a sandbox-blocked call gets `sandbox_blocked` with
  `escalate: true`.

### Fixed

- Windows: `Invoke-EmCli` returned a `$null` exit code and wrote its output to the console
  instead of the pipeline, so **every healthy em-cli call was reported as a failure**
  ("produced no output at all"). This was a regression of the 1.1.2 em-cli hardening; the
  same fix is applied in `tizen-device-manager.ps1`.
- The PowerShell installer supports `.rpm` packages produced by GBS (Platform) builds like the
  Bash one: push, `sdb root on`, `rpm -ivh --force` (retry with `-Uvh`), launch
  `/usr/bin/<name>` as `owner` with the Wayland / XDG / DBus environment, verify with `rpm -q`.
  RPM platform apps now report `APP_RUNNING=yes|no`, so the envelope no longer shows
  `app_running: null`, and the docs state that `.rpm` is a launchable package.
- Detached jobs record the script `child_pid` in a wrapper-owned `<id>.child` sidecar that
  `readJobMeta()` merges, ending a read-modify-write race that lost the child pid and log
  file on fast hosts.
- `sdb pull` of a missing remote file no longer loops; Windows backslashes in remote paths
  are normalised instead of rejected (also in `screenshot`), and `push` checks the local path
  first.
- Hooks auto-merge follow-up: the pre-rename `hooks/tizen-sdk-agents` directory is deleted
  only after the `settings.json` merge succeeded (deleting it on snippet fallback broke hooks
  that worked before the upgrade); `claude validate` checks all three guard scripts; the
  `common/hooks/check-` marker matches only the exact guard names so an unrelated user hook is
  never claimed and removed; CRLF / LF line endings are preserved.

### Documentation

- The 29 paired SKILL.md files were audited against their runners: `--arch` default
  `x86_64`, GDB `--port` 5039, `--platform-version` required, screenshot default output and
  result fields, rootstrap metadata source, `sdb forward --remove` gate, device-manager
  `--vm-name`, build-failure diagnostics location. RPK parity added to four tizen-cli skills;
  a tizen-cli doc claiming GBS produces `.tpk` was corrected.
- Skill / agent / command counts synced with the tree (29 skills, 24 agents, 34 commands, 31
  tizen-cli skills); a "Project at a Glance" table with a re-measure command per row was
  added to both READMEs.

## [1.1.2] — 2026-09-10

Fixes for the Codex CLI host and for Windows 11 24H2.

### Added

- Codex sandbox awareness (`common/lib/core/sandbox.js`). Codex's default `workspace-write`
  sandbox blocks TCP sockets and writes outside the workspace and, on Linux, kills detached
  jobs when the exec call ends. `--background` and `job-cli.js run --script` are refused
  inside the sandbox with `sandbox_blocked` (`TIZEN_SDK_SANDBOX_E001`) and a
  `suggested_fix.command` to re-run with escalated permissions; a sandboxed job that vanishes
  is `sandbox_job_lost` (`TIZEN_SDK_SANDBOX_E002`); every other failure inside the sandbox
  gains a warning. Guard rule 12 and a Codex paragraph in every device / emulator /
  certificate / debug skill say what must run escalated. `TIZEN_SANDBOX=on|off` overrides
  detection.
- `permission_denied` (`TIZEN_SDK_IO_E002`) for certificate profile writes refused by the OS
  or the sandbox, naming the file and the escalated re-run.
- `tizen-sdb-helper` agent definition (single sdb actions: launch / kill, log tail, shell,
  port forward, reboot), bringing the agent set to 24.

### Fixed

- `check-disk-space` and the SDK install pre-check no longer report "0 GB free" on Windows 11
  24H2, where `wmic` is gone. Probe chain: statfs → PowerShell `Get-PSDrive` →
  `fsutil volume diskfree` → `wmic` (`df` on POSIX); when nothing can measure the drive the
  check warns and proceeds instead of blocking the install. `check-node` trusts the
  interpreter running the runner instead of spawning `node --version` through a sandboxed
  shell PATH.
- The SDK installer receives the resolved install path explicitly (`--path` / `-Path`). The
  resolver order is `~/.tizen.sdk.path.config` → `TIZEN_SDK_PATH` → `~/tizen-sdk` → OS
  default, and a `TIZEN_SDK_PATH` pointing at a Tizen Studio tree is ignored, so tizen-sdk
  is no longer unpacked into `~/tizen-studio`.
- `list-templates` detects the installed `tizen-X.Y` profile instead of hardcoding
  tizen-10.0, and an empty list for the requested type is a `template_not_found` failure
  naming the profile and the fix rather than `{"webapp": []}` with status success.
- `generate-author` writes the `.pwd` password sidecar itself (mode 0600, never overwriting)
  when `tz cert` does not; the build preflight rejects a profile whose author certificate has
  neither a sidecar nor a stored password. Under Codex the Samsung Account browser login is
  documented as an escalated detached job, and the login URL is relayed as progress.
- Emulator manager: em-cli failures are no longer all reported as Java / JNA crashes — the raw
  em-cli output is fenced and only that text is classified, an exit without output is
  explained as a blocked or hung JVM with its exit code, read-only em-cli calls are capped at
  120 s (`TIZEN_EMCLI_TIMEOUT` / `TIZEN_EMCLI_TIMEOUT_MS`, exit 124), and on Windows every
  em-cli call runs with file-redirected stdio instead of an inherited console that hung
  `list-vm` for the runner's 30-minute ceiling. A failed `list-vm` on the launch path is a
  failure, not "no VMs".
- Installers no longer write a `# Tizen SDK Configuration` comment header into `sdk.info`,
  which crashed Tizen CLI's property parser and broke `tizen package -t rpk`. Existing
  installs with the header or a UTF-8 BOM are repaired by `repairSdkInfo()` before a build
  and on `sdk-install` re-run.
- Guard rule 9 denies only debugger port forwarding; plain `sdb forward`, `--list` and
  `--remove` are allowed again.
- `device-manager-cli.js stop` (`--action stop`) works instead of failing with
  "Invalid timeout: stop".
- `install-rootstrap` accepts SDK-repository rootstrap definition names (`*.core.xml`), not
  only the timestamped form.
- `update-package` writes a `.package-update-result` marker so the Phase 1 re-run reports the
  real outcome instead of always returning the launcher envelope.
- `resolveSdkDataPath()` verifies that the configured directory is an SDK before using it. A
  machine without an SDK used to resolve to a phantom `~/tizen-sdk-data` and report success;
  a stale config now recovers through the `sdb` on PATH.

### Changed

- The certificate module resolves the SDK root from `~/.tizen.sdk.path.config` instead of the
  location of the `sdb` binary, so an SDK on a non-default drive or directory works.
- `tizen-screenshot` follows the shared "always show the envelope" rule, with the base64
  image replaced by a placeholder.

## [1.1.1] — 2026-09-09

### Changed

- First public release under `Samsung/tizen-agent-skills`. Internal mirror URLs, hostnames and
  personal paths were removed from code, docs and fixtures; private SDK mirrors are now passed
  explicitly with `--repo-url`.
- CI / release workflows, issue templates and the Claude Code marketplace manifest moved to the
  repository root (staged here under `_repo-root/`). Release tags are prefixed with
  `tizen-sdk-skills-`.

### Added

- `NOTICE` with third-party attributions, including the bundled `tizen-dlog-analyzer` binaries
  (see `common/tools/tizen-dlog-analyzer/NOTICE.md`).
- SPDX license headers on source files.

## [1.1.0]

### Added

- Codex CLI and Gemini CLI harnesses sharing the same `common/` setup implementation.
- `tizen-sdk-install-custom-repo` — install the SDK from a user-supplied package repository URL
  (validated against `pkg_list_{OS}-{64,32}` before anything is downloaded).
- `tizen-dlog-analyzer` skill and agent backed by prebuilt analyzer binaries (Linux / Windows).
- `tizen-playwright-test`, `tizen-remote-device`, `tizen-screenshot`, `tizen-sdb-helper` skills.
- Standard JSON Envelope required in every agent's final message.

### Changed

- Renamed from `tizen-sdk-agents` (inside the `tizen-ai-plugins` monorepo) to
  `tizen-sdk-skills`; plugin id, cache path, tizen-cli command and environment variable were
  all renamed — see the migration table in `README.md`.

## [1.0.0]

- Initial release of the VS Code extension (`vscode/CHANGELOG.md`) and the Claude Code / Cline /
  tizen-cli harnesses.

[Unreleased]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.2.0...HEAD
[1.2.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.2...tizen-sdk-skills-v1.2.0
[1.1.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.1...tizen-sdk-skills-v1.1.2
[1.1.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.0...tizen-sdk-skills-v1.1.1
[1.1.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.0.0...tizen-sdk-skills-v1.1.0
[1.0.0]: https://github.com/Samsung/tizen-agent-skills/releases/tag/tizen-sdk-skills-v1.0.0
