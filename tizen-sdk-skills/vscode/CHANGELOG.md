# Changelog

All notable changes to the Tizen AI Extension will be documented in this file.

The extension ships the skill and agent asset tree, so entries below cover both the extension itself and the skills it installs into Claude Code / Cline. Changes to the skills are marked **(skills)**.

## [1.2.0] — 2026-09-10

First release published from [Samsung/tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills). No extension behaviour changed — the sources gained SPDX license headers, a `NOTICE` file listing the third-party material bundled into the `.vsix`, and `package.json` now points `repository` / `bugs` / `homepage` at the public repository. The release ships the updated skill and agent asset tree (29 skills, 24 agents).

### Added

- **(skills)** Setup scripts merge the PreToolUse guard hooks into the host's `settings.json` automatically (`lib/tools/merge-hooks-json.js`), preserving foreign entries, indentation and line endings, and writing a one-time `settings.json.tizen-backup`.
- **(skills)** `remote_path_not_found` (`TIZEN_SDK_IO_E003`) for `sdb pull` of a file missing on the device; guard rule 16 denies hunting for the `sdb` binary; emulator launch reports `timeout_sec`, `waited_ms` and `emulator_keeps_running`.

### Changed

- **(skills)** .NET remote debugging defaults to `launch` instead of `attach` (Tizen has no CoreCLR debug transport); `tizen-sdb-helper` is rewritten runner-first; a certificate password passed on the command line produces an exposure warning.

### Fixed

- **(skills)** Windows: `Invoke-EmCli` returned a `$null` exit code and wrote to the console instead of the pipeline, so every healthy em-cli call was reported as a failure — a regression of the 1.1.2 em-cli hardening.
- **(skills)** The PowerShell installer supports `.rpm` packages produced by GBS (Platform) builds like the Bash one; detached jobs no longer lose the child pid on fast hosts; `sdb pull` of a missing remote file no longer loops; the hooks auto-merge deletes the pre-rename `hooks/tizen-sdk-agents` directory only after a successful `settings.json` merge.

## [1.1.2] — 2026-09-10

Fixes for the Codex CLI host. No extension code changed — the release ships the updated skill and agent asset tree.

### Added

- **(skills)** Codex sandbox awareness (`lib/core/sandbox.js`). Codex's default `workspace-write` sandbox blocks TCP sockets, writes outside the workspace and, on Linux (bubblewrap PID namespace), kills detached jobs when the exec call ends — a build job "exited without writing its result" in milliseconds. `--background` and `job-cli.js run --script` are now refused inside the sandbox with `sandbox_blocked` (`TIZEN_SDK_SANDBOX_E001`) and a `suggested_fix.command` equal to the typed command (`escalate: true`); a sandboxed job that vanishes is `sandbox_job_lost` (`TIZEN_SDK_SANDBOX_E002`); every other failure inside the sandbox gains a "Running inside Codex's sandbox" warning and, when the error text is a permission/network block, an extra `sandbox_blocked` error. Guard rule 12 and a Codex paragraph in every device/emulator/certificate/debug skill say what must run with escalated permissions. `TIZEN_SANDBOX=on|off` overrides detection.
- **(skills)** `permission_denied` (`TIZEN_SDK_IO_E002`) for certificate profile writes refused by the OS or the sandbox, naming the file and the escalated re-run.

### Fixed

- **(skills)** `check-disk-space` / the SDK install pre-check no longer reports "0 GB free" on Windows 11 24H2, where `wmic` is gone. Probe chain: statfs → PowerShell `Get-PSDrive` → `fsutil volume diskfree` → `wmic` (df on POSIX); when nothing can measure the drive the check warns and proceeds (`source: "unknown"`) instead of blocking the install.
- **(skills)** `check-node` trusts the interpreter running the runner (`process.version` / `process.execPath`) instead of spawning `node --version` through a sandboxed shell PATH.
- **(skills)** The SDK installer receives the resolved install path explicitly (`--path` / `-Path`) and the shell resolver puts `~/.tizen.sdk.path.config` ahead of `TIZEN_SDK_PATH`; a `TIZEN_SDK_PATH` pointing at a Tizen Studio install is ignored, so tizen-sdk is no longer unpacked into `~/tizen-studio`.
- **(skills)** `list-templates` detects the installed `tizen-X.Y` profile instead of hardcoding tizen-10.0, and an empty list for the requested type is a `template_not_found` failure naming the profile and the fix rather than `{"webapp": []}` with status success.
- **(skills)** `generate-author` writes the `.pwd` password sidecar itself when `tz cert` does not; the build preflight rejects a profile whose author certificate has neither a sidecar nor a stored password. `samsung-login --background` with escalated permissions is the documented Codex path for the Samsung Account browser login, and the login URL is logged for `job-cli.js wait` to relay.
- **(skills)** Emulator manager: the scripts' own "may have a Java/JNA dependency issue" warning no longer makes every em-cli failure read as a JNA crash — the raw em-cli output is fenced (`EMCLI_OUTPUT_BEGIN/END`) and only that text is classified, an exit without output is explained as a blocked/hung JVM with its exit code, read-only em-cli calls are capped (`TIZEN_EMCLI_TIMEOUT` 120 s bash / `TIZEN_EMCLI_TIMEOUT_MS` PowerShell, exit 124) and on Windows every em-cli call runs with file-redirected stdin/stdout/stderr instead of an inherited console that hung `list-vm` for the runner's 30-minute ceiling; a failed `list-vm` on the launch path is a failure, not "no VMs".

## [1.1.1] — 2026-09-09

### Security

- Pinned `markdown-it` (^14.2.0), `linkify-it` (^5.0.2) and `qs` (^6.16.0) through pnpm overrides so the `@vscode/vsce` 2.x dependency tree no longer resolves the vulnerable markdown-it 12.3.2 / linkify-it 3.0.3 / qs 6.15.3 (GHSA-6v5v-wf23-fmfq, GHSA-v245-v573-v5vm, GHSA-22p9-wv53-3rq4, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). These are packaging-time dependencies only — no runtime code changed. `vsce package`, `npm run typecheck` and the extension unit tests all pass with the new resolution.

### Changed

- **(skills)** `--background` now works on *every* runner, not just the eight that parsed options through `parseArgsOrExit`. The flag is removed from `process.argv` at require time in `lib/cli/cli-runner.js` — every runner requires `cli-runner` before reading argv — so option-style, positional and hand-rolled parsers accept it with no per-runner wiring. Previously the positional parsers mis-read it as data (device-manager as a timeout, file-transfer as a device serial, dotnet-setup as a workload version). Only a `--background` before a bare `--` counts, so `job-cli.js run … -- <installer args>` is left alone. This brings app builds, app install, .NET setup, GDB/DotNET/WebApp debug setup, Playwright and file transfer under a host's short tool-call window; `tz build` + `tz pack` runs for minutes and used to return only the `[tizen-build] Building …` header while the build kept going.
- **(skills)** Backgrounded runners now report live progress. Inside a job, `execPluginScript` writes each call's output to `<id>.script-<n>.log` and keeps it, and `jobStatus`/`wait` return `progress_tail` and `log_file` from the newest script log. Pipe mode redirects stdout only and leaves stderr on the pipe, so return values and `error.stdout` / `error.stderr` stay byte-identical to a foreground run.
- **(skills)** `job-cli.js` refuses `--background` (it is the poller/launcher — nesting a receipt inside a receipt), and `cert-manager-cli.js` refuses `--prompt-*` together with `--background`, since a detached child has no terminal to prompt on.

### Fixed

- **(skills)** Background runners no longer flash console windows on Windows. `execSync` calls in `plugin-cache.js` now pass `windowsHide: true`; a detached runner has no console of its own, so every `cmd`/`powershell` it started opened a visible one.
- **(skills)** `tizen-tv-sdk-install-from-zip` (added in 1.1.0) returns its Phase-1 pre-check through `installerFix()` like the other installers, so it now carries a `background_command` and the Codex CLI guidance clause instead of a bare script command. Its job group joined `SCRIPT_JOB_GROUPS`, and the source guard in `job-script.test.js` derives the expected count from that list so a future installer cannot drift out of the allowlist in either direction.

## [1.1.0] — 2026-09-08

### Added

- Activity Bar sidebar tree view and an extension icon, so Install / Re-sync, Show Install Status, Remove Installed Files and Show Log are reachable without the Command Palette. The view refreshes after each command.
- `tools/` directory support in the build and installation pipeline, for skills that ship a helper binary. Only the binaries matching the current platform are copied, unsupported platforms raise an error instead of installing a broken tree, and installed binaries are set owner-only executable. Install validation compares file name *and* size, not just presence.
- **(skills)** `tizen-tv-sdk-install-from-zip` — offline TV SDK installation from a local ZIP file, for machines without access to the Samsung package repository. Brings the shipped skill set to 29.
- **(skills)** Codex CLI support. The runner detects a Codex CLI host and prefers its own runner cache, and the long installers (10 min+) run as detached jobs via `job-cli.js run --script` with `suggested_fix.background_command`, so they survive Codex CLI's 30 s exec window. The emulator flow drops the slow `em-cli` probe and resolves the platform directly for the same reason.
- **(skills)** `tizen-dlog-analyzer` gained a structured analysis report template with a bilingual (Korean/English) rendering and a confirm-gated fix workflow — the report is rendered only once analysis is fully done, and no fix is applied without explicit confirmation. The bundled analyzer executable was updated to v0.1.0.dev0 and now ships its LICENSE.

### Changed

- **Renamed `tizen-sdk-agents` to `tizen-sdk-skills`** and flattened the repository layout. Installs made by an earlier version under the old name are recognised and replaced on update rather than left behind as a duplicate tree.
- Adopted Apache-2.0 across the repository, and added `GOVERNANCE`, `CONTRIBUTING` and per-module `CODEOWNERS`.
- `tizenAiExtension.targets` default reverted from `both` back to `auto` — `both` installed into a host the user had not set up.
- The install manifest is written *before* hooks, and a hook failure is no longer fatal. A host whose `settings.json` cannot be merged still gets its skills, and the manifest still records what was written so removal stays exact.
- The pnpm lockfile and workspace config are excluded from the VSIX.
- Replaced the remaining explicit `any` types in the extension with typed settings models, and applied Prettier + `eslint --fix` across the repository.
- **(skills)** Every skill and agent is required to surface the JSON envelope in its final message, so the result is visible to the user rather than only to the model.

### Fixed

- Replaced a backtracking-prone regex with string operations, and resolved the reported SonarQube defects in the extension and its test files (S2871, S2966, S4043, S4325, S5852).
- Removed credential-shaped literals from the tests and example passwords from the docs; the test fixture password is loaded through a shared helper.
- **(skills)** `list-templates` and `list-vm` report real failures instead of returning an empty list when the underlying SDK tool fails.
- CI: install Node.js/pnpm explicitly, target the self-hosted Linux runners, and pin `upload-artifact` to a version the CI server supports. Pull requests no longer auto-create a tracking issue.
- `tizen-cli`'s `dist/` is emptied before each build, so a renamed or removed output file cannot linger in the package.

## [1.0.0] — 2026-08-20

### Added

- Initial release of the Tizen AI Extension for VS Code.
- Automatic installation and sync of Tizen SDK Agents for both Claude Code and Cline.
- Auto-detection of installed AI hosts — `~/.claude` / `~/.cline`, or the host's VS Code extension matched by exact extension id.
- Automatic `settings.json` merge for Claude Code hooks (all 3 hooks, including `check-skill-routing.sh` which was missing from the shell scripts). Our entries are identified by their hook-directory path, so a re-install replaces them without touching hooks you added yourself, and no non-schema marker keys are written into `settings.json`.
- One-time `settings.json.tizen-backup` of the pristine file, and atomic (temp + rename) writes so an interrupted merge cannot truncate it.
- The merge reuses your file's own indentation (2-space, 4-space or tabs) instead of reflowing it to a fixed width. Inline arrays are still expanded — that is inherent to re-serialising JSON.
- A `hooks` section of the wrong *type* (e.g. `"PreToolUse": {}`) parses fine but cannot be merged into. Rather than coercing it and silently discarding what you wrote, the merge is skipped, the reason is logged, and the file is left byte-for-byte untouched — the same handling as a syntax error.
- Version-independent hook script path (`~/.claude/hooks/tizen-sdk-agents/`) so hooks survive extension updates. Paths are emitted with forward slashes for `bash`.
- Cline hook installation with non-clobber check for existing `PreToolUse`.
- Cline guard rule (`tizen-sdk-agents-guard.md`) as a Windows fallback.
- CRLF→LF normalization and `chmod 0o700` for VSIX-extracted shell scripts, skipping anything that looks binary. Owner-only: every script lands under your own home and is run by Claude Code or Cline as you, so no group or "other" bit is granted.
- Install manifest (`.tizen-sdk-agents-manifest.json`) recording what was written into the shared `skills/` and `agents/` directories, so removal deletes exactly those and never a skill you wrote yourself.
- Upgrades prune what the previous version installed and the new one no longer ships. A dropped or renamed skill/agent would otherwise linger forever — the skill mirror is per-name and the agent copy only overwrites — and the new manifest would no longer claim it, so even uninstall would leave it behind while the host kept loading the stale definition.
- Only the current version's plugin cache is kept. Each version holds a full copy of the asset tree, so without this every update left several more MB behind for good.
- Validation of the hook install itself — hook scripts on disk *and* registered in `settings.json` — reported by **Show Install Status**.
- Four commands: Install / Re-sync, Show Install Status, Remove Installed Files, Show Log.
- Three configuration settings: `targets`, `installHooks`, `autoSyncOnUpdate`.
- Clean uninstall via `vscode:uninstall`.
- bash dependency warning on Windows.
- Unit tests (`npm test`) for the host-detection, settings-merge and manifest logic; `npm run typecheck` gates packaging.

- The on-startup sync is gated on the on-disk install manifest, not only on the version kept in `globalState`. VS Code persists `globalState` in the shared `state.vscdb` and does **not** clear it on uninstall — it only removes the extension's `globalStorage/<id>/` directory. So uninstalling (which deletes every installed file) and re-installing the *same* version would otherwise leave the recorded version matching while nothing was on disk, and the sync would be skipped silently, leaving the user with no skills and no notification. **Show Install Status** now reports the `globalState` version and each host's manifest version separately, so a disagreement is visible.

### Notes

- Install is fully asynchronous and reported through `window.withProgress`, so the on-startup sync does not block the VS Code UI.
- The auto-sync records the installed version only after a successful run, so a failed sync is retried on the next start.
