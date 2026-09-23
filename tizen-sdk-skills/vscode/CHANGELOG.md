# Changelog

All notable changes to the Tizen AI Extension will be documented in this file.

The extension ships the skill and agent asset tree, so entries below cover both the extension itself and the skills it installs into Claude Code / Cline / Codex CLI. Changes to the skills are marked **(skills)**.

## [1.3.1] — 2026-09-23

No extension code changed — the release ships the updated skill and agent asset tree (29 skills, 24 agents) with `--serial` for `gdb-debug` and ten skill fixes from the TC-report follow-ups. The test-suite work of this release (ordered device-tier and mutating-tier runs, CI safe-tier gate, device fixtures, TC promotions) lives under `tests/`, is not part of the extension, and is recorded in the project CHANGELOG.

### Added

- **(skills)** `gdb-debug --serial <serial>` (`lib/core/debug.js`, `lib/cli/gdb-debug-cli.js` 6th positional, `scripts/tizen-gdb-debug/tizen-native-gdb-debug.ps1` `-Serial` / `.sh` `-s`). The gdb scripts used sdb's default target for every call; they now pin every `sdb` invocation to `--serial` when given (and refuse a serial that is not connected) or to the first connected device, the way `tizen-dotnet-debug` already does, and the envelope reports `result.device_serial`. Both `gdb-debug` and `dotnet-debug` (which previously spliced `--serial` into the script arguments unchecked) screen it with the shared `SERIAL_PATTERN`, tightened to forbid a leading `-` and cap the length at 64 (`lib/tests/debug-serial-validation.test.js`). The `tizen-gdb-debug` skill and agent document the option.

### Fixed

- **(skills)** `gdb-debug` failed on every emulator image with `gdbserver not found at /usr/bin/gdbserver` (`scripts/tizen-gdb-debug/tizen-native-gdb-debug.ps1` / `.sh`). Emulator images since Tizen 8 ship no gdbserver, but the SDK carries it as `<sdk>/tools/on-demand/gdbserver_<ver>_<arch>.tar`. Step 2 now looks for `which gdbserver`, `/usr/bin/gdbserver` or a previous on-demand copy and otherwise pushes and extracts that tar to `/home/owner/share/tmp/sdk_tools/` — the mechanism `tizen-dotnet-debug` already uses for netcoredbg — picking the tar by device arch (`armv7l` → `armel`) and newest version, and verifying with a `test -x … && echo ok` probe because sdb shell drops the remote exit code. Source guards in `lib/tests/gdb-ondemand-guards.test.js`; the `tizen-gdb-debug` skill, agent and the native-debug walkthroughs mention the on-demand install.
- **(skills)** `sdk-install --tizen-version 99.99` reported `success` / `installation_status: completed` for a platform that was never installed (`lib/core/sdk.js`, `scripts/tizen-sdk-install/tizen-sdk-install.ps1` / `.sh`). The already-installed pre-check had been fixed earlier, but the branch where the packaged CLI runs the installer itself only checked that `sdk.info` existed afterwards, and the installer's own "already installed" short-circuit exits 0 before it looks at `-Platform`. Both `installSdk()` and `installSdkFromRepo()` now verify `platforms/tizen-<X.Y>` after the installer and return `platform_version_not_found` (with the `platform-install` suggested fix) when the requested platform is absent; both installer scripts exit 1 with the same hint when given a `--platform` the installed SDK lacks.
- **(skills)** A failed `sdk-install` left nothing to diagnose — the envelope said `SDK installation failed: \n\n\n\n\n\n\n` after 763 s, no log existed anywhere, and the same command passed 15 s later. The message was `stdout || stderr || message`: a whitespace-only stdout is truthy, so stderr and the exit code were dropped. New `describeInstallerFailure()` (used by all eight installer runners) reports exit code / signal — a timeout is named as such (Node reports it as `code ETIMEDOUT`, never `killed`) and a leftover `.install-running` marker is explained — the last output lines of BOTH streams (each capped at 200 chars in the message, whole in `details`), says so when nothing was captured, writes the full captured output to `$TIZEN_LOGS_DIR` (default `<tmp>/tizen-sdk-skills-logs/<runner>-<timestamp>.log`) and names it, and points at the installer's `.install.log` / `.install-result`; `errors[0].details` carries the same lines. The installer scripts now keep their own log — `tizen-sdk-install.ps1` writes a transcript to `<install>\.install.log` and repeats the failure verdict on stderr, `tizen-sdk-install.sh` mirrors its stderr into `<install>/.install.log` — and print the path on success and failure. The `tizen-sdk-install` skill documents both files.
- **(skills)** `install-app` with several devices connected was classified as `io_error` (`TIZEN_SDK_IO_E001`) and exposed the shell command line (`lib/core/project.js`). Sibling commands return `multiple_devices` (`TIZEN_SDK_DEVICE_E002`). `installApp()` now resolves the target device in JS before the script runs (explicit serial, else exactly one online device) and returns `device_not_found` / `multiple_devices` with the serial list itself; a "Multiple devices found" script exit is mapped to `multiple_devices` too, and the generic install failure reports the script exit code and its key output lines instead of Node's `Command failed: <full command line>`. New `classifyInstallFailure()` holds the output→envelope mapping; the `tizen-install-app` agent's error table names the new category.
- **(skills)** "Is Node.js installed?" was routed to the generic `doctor` sweep in 1 of 3 prompt runs. The `tizen-check-node` skill description never mentioned doctor, so the broader command won the tie. It now carries the exact prompt phrasings ("Node.js가 설치되어 있는지 확인해줘", "Do I have Node.js installed? Check the version."), states that a Node.js-only question is answered by `check-node`, and says explicitly that `--doctor` / core `doctor` is a whole-setup sweep and not that answer. The matching tizen-cli command description and routing table are not part of the extension; those changes are recorded in the project CHANGELOG.
- **(skills)** `playwright-test` said "Node.js executable was not found on PATH" for two different failures (`lib/core/playwright-test.js`). `resolveNodeRuntime()` returned one string for a missing `node` (spawn ENOENT) and for a present `node` whose `--version` exited abnormally; only the parenthesised `exit N` told them apart, which led to a wrong diagnosis. It now returns a `reason` (`not_found` / `spawn_failed` / `timeout` / `exited`) with exit code, signal and stderr tail, and the new `describeNodeRuntimeFailure()` produces distinct envelopes: `node_not_found` ("install Node.js / fix PATH") for a missing executable, `execution_error` quoting the exit code and stderr ("Node.js is on PATH but does not run — repair/reinstall, do not install a second copy") for a broken one, and a timeout variant. The `tizen-playwright-test` skill and agent list the two categories. Regression tests for all five fixes in `lib/tests/tc-report-followups.test.js`.
- **(skills)** `device-manager --action stop` could hang forever (`scripts/tizen-device-manager/tizen-device-manager.ps1` / `.sh`). Its last-resort `sdb shell poweroff` never returns when the guest's sdbd accepts the connection but does not answer — seen with a TV emulator whose guest had frozen, and with a row sdb kept after the emulator process was gone — so the action blocked past every caller's timeout. The call is now bounded to 15 s per device, and a new Method 5 restarts the sdb server to drop phantom rows, naming any row that comes back instead of waiting on it. Worst case on Windows is now ~50 s.
- **(skills)** `launch-emulator` without `--vm-name` tried to launch a VM named `t` on Windows (`scripts/tizen-emulator-manager/tizen-emulator-manager.ps1`). With exactly one VM, PowerShell unrolled the one-element array returned by the list helpers into a bare string, and `$vms[0]` returned its first character (`No emulator VM named 't' exists`). `ConvertTo-VmNames` / `Get-VmList` now return a real array and the call site wraps it in `@()`. Hardening added alongside in both `.ps1` and `.sh`: the already-running check waits (≤15 s) while an online emulator row still shows `<unknown>` as its name right after a boot, and when em-cli refuses a launch but sdb shows the VM online the action reports that serial as success. Source guards for both fixes in `lib/tests/emulator-stop-launch-guards.test.js`.
- **(skills)** `pnpm link --global` fails on current pnpm (`ERR_PNPM_LINK_BAD_PARAMS`): pnpm 10 removed the `--global` flag and pnpm 11 the no-argument `pnpm link` too. The bundled `docs/tizen-cli/build-and-install*.md` now put the standalone `tizen-sdk` launcher on PATH with `pnpm add -g .` from `tizen-cli/` (undo with `pnpm remove -g tizen-cli-plugin-tizen-sdk`) and gain troubleshooting rows for `ERR_PNPM_LINK_BAD_PARAMS`, `ERR_PNPM_NO_GLOBAL_BIN_DIR` and `tizen-sdk: command not found`. The launcher itself is not part of the extension; its README and CI comment changes are recorded in the project CHANGELOG.
- **(skills)** RDS benchmark script and docs (`lib/tests/manual/benchmark-rds.js`, `docs/rds/RDS_BENCHMARK*.md`, follow-up to the `TIZEN_BENCHMARK=1` timing instrumentation). Phase C now restores every source file it modified when the phase ends (also on Ctrl+C), never creates a marker file in the project, covers `.cs` / `.css` / `.html` / `.xaml` and keeps a UTF-8 BOM and shebang / XML declaration / doctype lines first; its baseline install no longer disappears with `--build false`, and the results table looks rows up by iteration number. A failed `install --reset-rds` aborts the run instead of being reported as complete; the package path comes from `--package` or the build envelope instead of a guessed `Debug/<dir>-1.0.0.tpk`; bare `--build` no longer swallows the next option (`--no-build` added); the plugin-cache fallback uses `plugin-cache.js`. The CI test runs on Windows too and measures the instrumentation overhead on an empty phase. The docs describe Phase C, the real env vars (`TIZEN_RDS_ENABLED` selects the mode; benchmark mode is always on in the script), the optional `--device-serial`, the quoted cmd.exe `set "TIZEN_BENCHMARK=1"` form (unquoted, cmd stores `"1 "` and benchmark mode stays off), and what `rds_timings` on a full install covers.

## [1.3.0] — 2026-09-18

Codex CLI becomes a third install target, and the release ships the updated skill and agent asset tree (29 skills, 24 agents).

### Added

- **(skills)** RDS fast deploy (Rapid Development Support) in `tizen-install-app` / `tizen-build-project`: after one full install of a project's Debug output, `install` pushes only the changed build-output files into the installed app and relaunches it (`deploy_type`: `full` / `rds` / `fast-deploy`); state lives in `.tizen-rds/` with hashes byte-identical to this extension's own RDS state files. `TIZEN_RDS_ENABLED=0` forces a full install, `install --reset-rds` clears the host-side state. Platform/GBS, `.rpm`, `.rpk`, non-Debug packages and manifest changes always take the full path.
- **(skills)** Parallel package downloads in every SDK installer: `--download-jobs <1-8>` (default 4) on the sdk-install, custom-repo, platform-install, tv-sdk-install, emulator-package, mobile-platform and update-package runners and scripts. Downloads write to a `.tmp` file renamed after the ZIP validates, retry transient failures (robocopy merge too), time out when stalled, kill the whole curl subtree on interrupt, and print per-package progress and the total elapsed time.
- **(skills)** `tizen-dlog-analyzer` one-shot device-log actions: `log-dump` dumps the current dlog buffer once (tail in the envelope, full dump always written to a file) and `log-clear --confirm` clears it, refusing with `user_input_required` when `--confirm` is missing. Filterspecs are screened before reaching the shell.
- **(skills)** Standalone `tizen-sdk` launcher (`tizen-cli/bin/tizen-sdk.js`) runs the built plugin bundle without the tizen-cli host; envelopes print the command prefix the user actually typed.
- **Codex CLI as an install target.** `tizenAiExtension.targets` gains `codex` and `all` (`both` still means Claude Code + Cline); `auto` detects `~/.codex` (or `CODEX_HOME`) and OpenAI's Codex extension. The extension writes the same layout as `setup.sh` does for Codex: the versioned runner cache under `~/.codex/plugins/cache/…`, skills into the shared `~/.agents/skills/` (a cross-tool directory that also holds your own skills — the install manifest records what was written and removal deletes only those folders), agents converted to `~/.codex/agents/*.toml` with the bundled `agent-convert.js`, the two guard scripts plus `~/.codex/hooks.json` (written only when missing or already ours), and the guard section — with the Codex cache-root, 30 s `--background` and sandbox-escalation notes — inserted into `~/.codex/AGENTS.md` between `<!-- tizen-sdk-skills:begin/end -->` markers so your own instructions survive: a begin marker with no end, or a marker that is indented or quoted in a sentence, is left as your text (nothing after it is ever deleted, and the log names the stray line), and the file keeps its own CRLF or LF line endings. **Show Install Status** validates all of it; **Remove** and `vscode:uninstall` strip exactly what was written.

### Changed

- **(skills)** Every device/emulator log request routes to `tizen-dlog-analyzer`; the `sdb-helper` `log-stream` / `log-save` / `log-clear` intents return a handoff envelope naming the dlog-analyzer action instead of running `sdb dlog`. Trigger phrases moved accordingly in the skill/agent descriptions, guard text and docs.
- **(skills)** `list-templates` envelopes carry `result.tv` (profile, web and dotnet TV templates) whenever the TV SDK is installed; `tizen-create-project` shows the Samsung TV web templates next to the tizen webapp ones for a web-app request and the whole TV list for a generic app request.
- **(skills)** The PowerShell package-install worker (download, unzip, robocopy merge, manifest) and its Start-Job driver live once in `lib/common.ps1` instead of seven copies across the installer scripts.
- **(skills)** Values spliced into a shell command line go through one shared screen, `lib/core/shell-safety.js`, instead of ad-hoc quoting at each call site, with unit tests for it, `mask-secrets.js` and `password-file.js`.
- **(skills)** Samsung certificates and `create-samsung-profile` profiles are documented as valid only for the TV emulator and real Samsung TVs; the certificate-manager agent confirms the target before any `generate-samsung-*` action.
- **(skills)** `tizen-dlog-analyzer` binaries (Linux, Windows) updated to v0.1.2.dev0.

### Security

- **(skills)** Shell injection through model-chosen values: `--serial`, project/parent/package paths, `--zip-path` and the GDB `--binary` path are screened with `shell-safety.js` and rejected as `invalid_parameters`; `sdb-helper` `shell-command` on Windows refuses `"` and `%`.
- **(skills)** Certificate passwords are masked in `tz cert` / `tz security-profiles` error text; `mask-secrets.js` also recognises camelCase secret suffixes; detached job output files are created 0600 and `samsung-reveal-password` refuses `--background`.
- **(skills)** PreToolUse guard hooks no longer exempt a whole command line because its first token is `git`/`gh`; every simple command split on unquoted `&&`/`||`/`;`/`|` must be git/gh, `cd` or a bare assignment.

### Fixed

- **(skills)** RDS fast-deploy hardening: every device path is allowlisted and single-quoted before `rm -f` / `cat` on the device shell; TCP serials (`ip:port`) no longer break the Windows staging directory so RDS engages for Wi-Fi devices; progress lines go to stderr instead of corrupting the JSON envelope; a full install to one device no longer makes another device report a no-op `fast-deploy` over stale files; state writes are atomic; a device marker behind host state is rejected; Release/Test packages take the full path; the RDS envelope's `app_id` is the launchable app id like the full path; a cold sdb server is started before the first RDS call; pushed files get `chmod go-w`; `--reset-rds` reports `io_error` instead of claiming success.
- **(skills)** Parallel download/extract hardening: `download_queue_parallel` no longer aborts fresh runs under `set -e`, `tizen-update-package.{sh,ps1}` record their result line again, resume runs skip already-downloaded packages before downloading, Start-Job workers enable TLS 1.2 themselves and tolerate an abandoned merge mutex, and an invalid `--download-jobs` is a usage envelope instead of a stack trace.
- **(skills)** `tizen-install-app --run` on Samsung TV images: the app id is read from the package manifest (`app_launcher -l` is empty in a non-root TV shell) and the launch is retried with the TV launcher `0 was_execute <app-id>`; every id is checked against `[A-Za-z0-9._-]` before it reaches a device shell. `tizen-sdb-helper` `launch` gains the same fallback.
- **(skills)** `tizen-screenshot` discarded the real 16:9 display of a Samsung TV emulator as a "control panel" when a light app background matched its grayscale-column heuristic; a match wider than half the window now skips the crop. The Python post-processing block is byte-identical in the `.sh` and `.ps1` runners and pinned by a unit test.
- **(skills)** `create-project` / `list-templates` reported the Samsung TV SDK as not installed whenever the TV extension sat under an older `tizen-X.Y` platform than the active one; every `tv-samsung-*` profile is now verified against its own platform folder.
- **(skills)** `tizen-certificate-manager` hands Windows users a double-quoted `C:\Users\...` path (via `cygpath -w`) instead of the MSYS `/c/Users/...` form that fails in cmd.exe / PowerShell; `emulator-manager-cli.js` accepts the plural `list-vms` / `list-platforms` / `list-templates` aliases; `https-proxy-agent` is a declared runtime dependency so Samsung online-CA calls tunnel through `HTTPS_PROXY` behind a corporate proxy.
- **(skills)** `check-project-writes.sh` denied any write that merely co-occurred with `config.xml` on the same line; the writer now has to name the project file itself.

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
