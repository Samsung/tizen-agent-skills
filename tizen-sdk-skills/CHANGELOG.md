# Changelog

All notable changes to **tizen-sdk-skills** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Releases are tagged `tizen-sdk-skills-vX.Y.Z` on the
[tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills) repository.

## [Unreleased]

## [1.3.0] — 2026-09-18

### Added

- **RDS fast deploy in `tizen-install-app` / `tizen-build-project`** (`common/lib/core/rds/`,
  ported from the VS Code Tizen extension; no npm dependency on the plugin path — the XXH3-128
  hasher and `picomatch` are vendored, `fs-walk.js` replaces `glob`). After one full install of
  a project's Debug output on a device, `install` compares the host baseline
  (`.tizen-rds/*.json`, hashes byte-identical with the extension's state files) with the current
  build output and pushes only the changed files into the installed app (`sdb push` of a staged
  batch, batched `rm -f` for deletions), then relaunches it; when nothing changed it only
  relaunches. The envelope's `deploy_type` reports `"full"` (regular `tz install`), `"rds"` or
  `"fast-deploy"`; `build` records the build manifest after a successful build when the project
  was deployed before. Eligibility: native / web / .NET projects only (no platform/GBS, `.rpm`,
  `.rpk`), package inside the tracked Debug output tree (`Debug/`, `bin/Debug/<tfm>/`), and any
  change to `tizen-manifest.xml` / `config.xml` takes the full path. `TIZEN_RDS_ENABLED=0` is
  the kill switch; `install --reset-rds` removes the host-side `.tizen-rds/` directory
  (`result.rds_state: "reset"`, `io_error` when it cannot be removed) and cannot be combined
  with `--run`. Documented in both `tizen-install-app` SKILL.md variants and the agent; plan
  and Tizen 11 real-device verification notes in `docs/rds/RDS_FAST_DEPLOY_PLAN{.en,}.md`.
- **Parallel package downloads in every SDK installer.** `--download-jobs <1-8>`
  (default 4) on `tizen-sdk-install`, `tizen-sdk-install-custom-repo`, `tizen-platform-install`,
  `tizen-tv-sdk-install`, `tizen-download-emulator-package`, `tizen-download-mobile-platform`
  and `tizen-update-package` (CLI runners, `.sh` and `.ps1`, and the `.sh --detach` path):
  packages are fetched by a worker pool (`download_queue_parallel` in `lib/common.sh`,
  `Invoke-ParallelDownloads` Start-Job workers in `lib/common.ps1`) instead of one after
  another; extraction stays at 3 concurrent jobs because it is disk-bound. Each download goes
  to a `.tmp` file that is renamed only after the ZIP validates, transient failures are retried
  up to 3 times (the robocopy merge too, on exit 8/11/16, with `/FFT` and the log tail in the
  failure reason), a stalled PowerShell download times out (`TimeoutSec`), bash workers run in
  their own process group so INT/TERM/HUP kills the whole curl subtree, a mkdir-based lock keeps
  the progress counter race-free, and the scripts print timestamped per-package progress plus
  the total elapsed time (`format_duration` / `Format-Duration`).
- `dlog-analyzer` one-shot device-log actions, so every log request has a single owner:
  `log-dump [serial] [--filter "<spec> …"] [--lines <n>] [--output <file>]` dumps the current
  dlog buffer once (`sdb dlog -d -v threadtime`), returns the tail in the envelope and always
  writes the complete dump to a file; `log-clear [serial] --confirm` clears the buffer
  (`sdb dlog -c`) and refuses with `user_input_required` + `suggested_fix` when `--confirm` is
  missing. Filterspecs are screened (`<tag>[:<V|D|I|W|E|F|S>]`) before reaching the shell.
  Exposed in the plugin runner (`dlog-analyzer-cli.js`), the tizen-cli command
  (`--action log-dump|log-clear`, `--filter`, `--lines`, `--output`, `--confirm`), both
  SKILL.md variants and the agent, with unit tests and a `safe`-tier TC for the gate.
- Standalone launcher `tizen-cli/bin/tizen-sdk.js` (`tizen-sdk <command>`): runs the built
  plugin bundle without the tizen-cli host by calling its `run(args)` and mapping the result
  to the exit code (0 success, 1 failure). Registered as the package `bin`, copied to
  `dist/bin/` on build so a release ZIP runs via `node dist/bin/tizen-sdk.js`, and reports
  `PLUGIN_NOT_BUILT` when `dist/` is missing. `tests/runner.mjs` already falls back to a
  `tizen-sdk` binary on PATH. The envelope's `user_command` (and the no-argument `usage`
  line) now use the prefix the user typed — `tizen-sdk` standalone, `tizen-cli tizen-sdk`
  in the host — overridable via `TIZEN_SDK_USER_COMMAND_PREFIX`.
- **VS Code extension: Codex CLI as an install target.** `tizenAiExtension.targets` gains
  `codex` and `all` (`both` still means Claude Code + Cline); `auto` detects `~/.codex` (or
  `CODEX_HOME`) and OpenAI's Codex extension. The extension writes the same layout as
  `common/setup/setup.sh` does for Codex: the versioned runner cache under
  `~/.codex/plugins/cache/tizen-platform/tizen-sdk-skills/`, skills into the shared
  `~/.agents/skills/` (a cross-tool directory that also holds the user's own skills; the install
  manifest records what was written there, and removal deletes only those folders), agents
  converted to `~/.codex/agents/*.toml` with the bundled
  `lib/tools/agent-convert.js`, the two guard scripts plus `~/.codex/hooks.json` (written only
  when missing or tagged with our `_source`), and the shared guard document — followed by the
  Codex-specific cache-root, 30 s `--background` and sandbox-escalation notes — inserted into
  `~/.codex/AGENTS.md` between `<!-- tizen-sdk-skills:begin/end -->` markers. The marker
  handling is stricter than the shell twin's: a section is only the text between a begin line
  and its matching end line, so a begin with no end (a hand-truncated file), an end with no
  begin, or a marker that is indented or quoted inside a sentence is left as the user's text —
  nothing after a broken marker can be deleted, a complete section is still installed, and the
  stray line is named in the log; the file's own line endings (CRLF or LF) are kept; duplicate
  sections collapse into one. Show Install Status validates the cache, skills, one TOML per
  agent, hooks.json and the four AGENTS.md lines; Remove and `vscode:uninstall` strip exactly
  what was written. New vscode-free modules `codexLayout.ts` and `guardSection.ts` carry the
  paths and the marker logic, with unit tests for target resolution, hooks.json tagging,
  section insert/replace/strip (orphan markers, CRLF, duplicates), and the
  install/upgrade/remove paths against a temporary HOME.

### Changed

- **Every device/emulator log request now routes to `tizen-dlog-analyzer`.** The
  `sdb-helper` intents `log-stream` / `log-save` / `log-clear` no longer build or run
  `sdb dlog …`; they return a handoff envelope (`suggested_skill: tizen-dlog-analyzer`) whose
  new `result.note` names the dlog-analyzer action to run (`log-dump`, `log-clear --confirm`,
  `start start-monitoring`). Trigger phrases ("tail the logs", "show logs", "로그 보기",
  "clear logs", "dlog clear", …) moved from the sdb-helper skill/agent descriptions to the
  dlog-analyzer ones; the PreToolUse guard text, the tizen-cli `tizen-sdk` router table and
  the docs say the same. The dlog-analyzer skill documents the two layers — one-shot
  `log-dump` / `log-clear` vs. continuous collect/analyze — and its "never raw sdb" rule now
  covers dump and clear as well.
- `sdb-helper` log intents are matched after the shell block, so an explicit shell request
  that merely mentions `tail` or a `.log` path ("run shell command tail -n 20
  /var/log/messages") stays `shell-command` instead of being classified as a log request.
- `list-templates` envelopes carry `result.tv = { profile, web: [...], dotnet: [...] }` whenever the
  TV SDK is installed — on typed calls such as `--type webapp` too (new `TV_PROFILE=` / `TV_WEB=` /
  `TV_DOTNET=` machine lines from the scripts). The `tizen-create-project` skill and agent now
  show the Samsung TV **web** templates next to the tizen webapp ones for a web-app request
  ("웹앱 만들어줘"), and the whole TV template list next to the per-type lists for a generic
  "타이젠 앱 만들어줘"; `result.tv` is the only evidence the TV SDK is installed, and a TV pick is
  created with `--type tv`. The generic listing shows `result.templates.platform` (GBS samples
  such as `dali-demo`) as its own "Platform 앱" group. The agent's type list also names all six
  types again (`rpk` was missing from its prompt).
- The PowerShell package-install worker (download-if-missing + entry-by-entry unzip +
  mutex-serialised robocopy merge + manifest) and its Start-Job driver loop live once in
  `lib/common.ps1` (`Get-PackageInstallWorker`, `Invoke-ParallelPackageInstall`,
  `ConvertTo-DownloadItems`) instead of seven near-identical copies across the installer
  scripts; the tizen-sdk-install 404 fallback and optional-RS handling are parameters of the
  shared worker. `-ExtractJobs` was removed from every `.ps1` (it was never reachable from the
  CLIs); extraction concurrency stays at the previous default of 3. `sdk.js` builds the
  `-DownloadJobs`/`--download-jobs` pair through one `downloadJobsFlags()` helper.
- Values spliced into a shell command line go through one shared screen,
  `common/lib/core/shell-safety.js`, instead of ad-hoc quoting at each call site (it rejects
  `"`, `` ` ``, `$`, `;`, `|`, `&`, `<`, `>`, line breaks and a trailing backslash, and leaves
  spaces, parentheses, apostrophes and non-ASCII alone), with unit tests for it,
  `envelope/mask-secrets.js` and `cli/password-file.js`, which had none.
- **Samsung certificates are documented as TV-target-only.** The `tizen-certificate-manager`
  skill (plugin and tizen-cli variants), its agent, the build-project skill/agent, the install-app
  skill and the certificate guides/walkthroughs (en/ko) state that a Samsung online-CA certificate
  and a `create-samsung-profile` profile are valid only for the TV emulator
  (`tizen-create-emulator --profile tv`, after `tizen-tv-sdk-install`) and real Samsung TVs whose
  DUID is in the distributor certificate. The agent must confirm the target before any
  `generate-samsung-*` action: Samsung flow for the TV emulator / Samsung TV, `generate-author` →
  `create-profile` (after saying so) for a standard Tizen emulator, and a question about the
  target when a Samsung certificate is requested without one. DUIDs come from the TV target, and a
  certificate error when installing a Samsung-signed package on a standard emulator is expected
  rather than something to work around.
- `tizen-dlog-analyzer` binaries (Linux, Windows) updated to v0.1.2.dev0.

### Security

- **Shell injection through model-chosen values.** An explicit `--serial` (every sdb command
  line), the project / parent / package paths of `create`, `build` and `install`, the
  `--zip-path` of `install-rootstrap` and `tv-sdk-install-from-zip` (also handed back as
  `suggested_fix.command`), and the GDB `--binary` path reached `execSync` inside nothing but
  a pair of double quotes. They are now screened with `shell-safety.js` and rejected as
  `invalid_parameters`; `resolveSerial()` checks the serial once for all callers.
- `sdb-helper` `shell-command` on Windows refuses a device command containing `"` or `%`:
  cmd.exe toggles quoting on every quote and expands `%VAR%` inside quotes, so the old
  unescaped interpolation let a quote in the request run the rest of the line on the host.
- **Certificate passwords in error text.** `tz cert` / `tz security-profiles add` failures
  copied tz's stdout/stderr — and execFileSync's `error.message`, which is the full argv with
  `-p <password>` — into the envelope. The password values are now masked in those messages
  (field-name masking cannot see inside a string).
- `mask-secrets.js` also recognises camelCase secret suffixes (`clientSecret`, `sessionToken`,
  `userPass`); before, a camelCase field was masked only if it had been added to the exact-name
  list by hand.
- Detached (`--background`) job stdout/stderr files are created 0600, and
  `samsung-reveal-password`, whose output is the password in clear, refuses `--background`.
- **PreToolUse guard hooks: git-prefix bypass.** `is_git_command` exempted the whole command
  line once its first token (after a `cd`/`VAR=` prefix) was `git`/`gh`, so
  `git --version && <anything>` skipped every rule. Both hooks now split on unquoted
  `&&`/`||`/`;`/`|`/newlines (quotes honoured, redirections excluded) and exempt only when every
  simple command is git/gh, `cd` or a bare assignment. Negative cases added to `hooks.test.sh`.

### Fixed

- **RDS fast-deploy hardening.**
  - Device-shell arguments: `sdb shell` re-parses its argv through the device's `/bin/sh`, so
    every device path RDS composes is validated against a strict allowlist
    (`rds/device-shell.js`) and single-quoted before it reaches `rm -f` or `cat`. Before, only
    `;`, `$` and backticks were rejected: a deleted `my icon.png` split into two words (the `rm -f`
    silently failed while state recorded the delete), `pages/[id].js` globbed, and `|` / `>`
    ran as root. Manifest package IDs are screened with the same `[A-Za-z0-9._-]` alphabet the
    install scripts now use for app ids.
  - Wi-Fi devices: staging directories were named after the serial, and a TCP serial
    (`192.168.0.10:26101`) contains `:`, which is illegal on Windows — `mkdirSync` failed and
    RDS silently never engaged. They are `mkdtempSync` directories now.
  - `[RDS] …` progress lines went to stdout in front of the JSON envelope and broke
    `JSON.parse` for every consumer; they go to stderr.
  - Multi-device state: a full install to device B regenerated the shared baseline without
    recording what changed, so device A's next install compared the new baseline against
    itself, saw zero drift and reported a no-op `fast-deploy` while running stale files.
    `updateRdsState()` reconciles first and promotes the drift into a numeric changelist group
    other devices still receive; reconcile replaces the pending `next` group instead of
    composing stale entries from an aborted attempt onto it; `deploy-state.json` is committed
    before the group is promoted so a crash cannot reuse a `deployId`; and state writes are
    atomic (tmp + rename), so a truncated `deploy-state.json` no longer reads back as `null`,
    re-initialises the project and wipes every other device's groups.
  - A device marker *behind* host state (emulator snapshot restore, re-flash, shared serial) is
    rejected like one ahead of it (`marker-behind`) instead of skipping every group the device
    never received. `getAppInstallPath` tiers 3/4 relied on `sdb shell test -d` failing, but
    sdb exits 0 regardless of the remote status, so tier 3 always "succeeded"; the probe is
    `test -d X && echo <marker>` with the marker checked on stdout.
  - RDS only engages when the package sits inside the Debug output tree the scanners track;
    installing a Release/Test package previously short-circuited to `fast-deploy` without
    installing it. A delta touching `tizen-manifest.xml` / `config.xml` is always `full`
    (pushing the file cannot re-register privileges, app-controls or app IDs).
  - `app_id` in the RDS success envelope was the manifest *package* ID while the full-install
    path reports the launchable app ID; both now read `<tizen:application id>` /
    `<ui-application appid>` (`parseWebAppId()` / `parseManifestAppId()`). With an explicit
    `--device-serial` the RDS primitives could be the first sdb call of the session and hang on
    a cold daemon that inherits the pipe; `installApp()` runs `sdb start-server`
    (`sdb.js ensureSdbServer`) first. Files pushed from a Windows host arrive `0777 root:root`
    on the device; `pushDeltaFiles()` runs `chmod go-w` while still rooted so they match the
    installer's `-rw-r--r--`. One BFS `findFiles` (shallowest match wins, `node_modules` /
    `bin` / `obj` pruned) replaces two depth-first walkers, so `MyApp.Tests/*.csproj` no longer
    beats `MyApp/MyApp.csproj` and a built .NET project's `tpkroot/tizen-manifest.xml` copy is
    never taken for the source manifest.
  - `--reset-rds` reports `io_error` when `.tizen-rds/` could not be removed (locked file)
    instead of claiming success. New `rds-device-shell.test.js`, deploy-service / sdb /
    app-install-path cases and a 5 MiB streaming-hash parity test; the tests that spawn the
    POSIX fake-sdb fixture skip on win32 (pinned to LF so a Windows checkout runs under WSL).
- **Parallel download/extract hardening.**
  - `download_queue_parallel` (lib/common.sh) ran a bare `rmdir` of a lock directory that
    does not exist on a fresh run; under the callers' `set -euo pipefail` this aborted
    `tizen-platform-install.sh`, `tizen-tv-sdk-install.sh`, `tizen-download-emulator-package.sh`,
    `tizen-download-mobile-platform.sh` and `tizen-update-package.sh` before a single worker
    started (only `tizen-sdk-install.sh` survived, because it calls the function inside `if !`).
    It also handles an empty queue, restores the caller's INT/TERM/HUP traps instead of clearing
    them, and no longer expands a possibly-empty array under `set -u` (bash < 4.4 / macOS).
  - `tizen-update-package.{sh,ps1}` lost the result line the marker records: bash died with
    `RESULT_LINE: unbound variable` after a successful update (no marker written), PowerShell
    wrote an empty `Result:` that `sdk.js` could not parse, so the update was re-launched forever.
  - Resume runs re-downloaded every package before skipping it: the download queue is now built
    from the packages that survive the resume / same-version / meta-package filter, in every
    installer (.ps1 and .sh).
  - `Invoke-ParallelDownloads` rejected an empty item list (`update-package` with everything
    current); `Format-Duration` rounded instead of truncating (2m40s printed as `3m 40s`);
    `tizen-download-mobile-platform.ps1` tested a never-assigned `$iotZip` around the 32-bit
    IOT pkg_list fallback; `tizen-sdk-install.sh --detach` did not forward `--download-jobs`.
  - An invalid `--download-jobs` in any sdk CLI runner produced a raw Node stack trace; it is
    now the `invalid_parameters` usage envelope on stderr (exit 1), and the custom-repo runner
    uses the same validator as the others. The shell scripts validate the value while parsing
    arguments rather than after the package list has been downloaded and resolved.
  - Start-Job download/extract workers now enable TLS 1.2 themselves (a child powershell.exe
    does not inherit the parent's `ServicePointManager` setting) and tolerate an abandoned
    merge mutex left by a timed-out worker instead of failing the next package.
- `create-project` / `list-templates`: the Samsung TV SDK was reported as "not installed"
  (`template_not_found` for `--type tv`, no `tv:` block in the untyped list) whenever the TV
  extension sat under a different `tizen-X.Y` platform than the newest one — e.g. tizen-11.0
  active, TV extension on tizen-10.0. Both script twins now verify each `tv-samsung-*` profile
  against `platforms/tizen-<ver>/tv-samsung` or `platforms/tv-samsung-<ver>` (newest first)
  instead of only the active profile's folder. TV template names are taken whole (a name with a
  space no longer loses its tail).
- `tizen-certificate-manager` (SKILL.md and agent): the "run a command personally" option
  handed Windows users the MSYS path the Bash locate block returns (`/c/Users/...`). Pasted
  into cmd.exe or PowerShell, Node resolved it as `C:\c\Users\...` and failed with
  `MODULE_NOT_FOUND`. The docs now require converting the resolved path with `cygpath -w`
  and handing over the double-quoted `C:\Users\...` form, which works in cmd.exe, PowerShell,
  and Git Bash alike, with a Windows example next to the existing Linux one.
- `emulator-manager-cli.js` / `manageEmulator()` accept the plural `list-vms`,
  `list-platforms` and `list-templates` as aliases of the singular em-cli actions. The
  project runner's action is the plural `list-templates`, so callers guessed `list-vms` here
  and got `Unknown action: list-vms`; `normalizeAction()` now maps the plural onto the em-cli
  spelling (the envelope's `command` reports the canonical action) and a made-up action is
  still refused. Unit tests cover the aliases and the pass-through of unknown values.
- `https-proxy-agent` is a declared runtime dependency of the root package. `samsung-api.js`
  loads it optionally to tunnel Samsung online-CA calls through `HTTPS_PROXY`; when it was
  absent the client silently fell back to a direct connection, so `samsung-login` and
  `generate-samsung-*` failed behind a corporate proxy.
- `check-project-writes.sh` denied any `touch`/`New-Item`/`tee`/`Set-Content` that merely
  co-occurred with `config.xml` in the same line (e.g. reading the manifest and touching a
  marker file); the writer now has to name the project file itself.
- `tizen-install-app --run` on Samsung TV images (TV emulator, real TVs): the install
  scripts read the launchable app id from the package manifest (`.wgt` `config.xml`
  `<tizen:application id>`, `.tpk` `tizen-manifest.xml` `appid`) instead of depending on
  `app_launcher -l`, which a non-root TV shell leaves empty — the envelope's `app_id` was
  `null` and the launch was never attempted. Every id, whichever source it came from, is
  checked against the Tizen ID alphabet (`[A-Za-z0-9._-]`) before it reaches a device shell
  command. When `app_launcher -s` prints no `successfully launched`, the launch is retried
  with the TV launcher `0 was_execute <app-id>` and accepted only on this app's own
  `app_id[<id>] launched` / `resumed` line;
  `app_running` stays `null` there (`-S` is silent too). The `tizen-sdb-helper` `launch`
  intent gains the same fallback (`fallbacks` + an `accept` predicate in
  `runWithFallbacks`), which the SKILL.md had documented but the runner never had. Both
  SKILL.md variants (`common/skills`, `tizen-cli/skills`) describe the fallback.
- `tizen-screenshot` control-panel removal cropped out the real screen on a Samsung TV
  emulator: the host-side capture's control-panel heuristic (`tizen-screenshot.ps1`/`.sh`)
  detects chrome to discard by scanning for a sustained run of grayscale-looking columns,
  which assumes any such run is a narrow sidebar. On the TV skin the app's own light
  background satisfied that test across most of the window width, so the heuristic
  discarded the real 16:9 display and kept only the narrow remote-control graphic beside
  it. The detected region is now only treated as a control panel when it is a minority of
  the window width (`max_panel_fraction = 0.5`); a wider match skips the crop and keeps the
  full capture instead of discarding the real screen. The bound comes from the shipped
  skins: at the smallest 1/4x scale the TV remote is 134 px beside a 480 px display and the
  general-skin key window sits beside a 320 px HD720 display, so a real panel stays well
  under half the window while a light app screen matched as "panel" spans most of it. The
  Python post-processing block is now byte-identical in `tizen-screenshot.sh` and `.ps1`,
  and `common/lib/tests/screenshot-postprocess.test.js` pins that parity and the threshold,
  and (when Python + Pillow are present) runs the block against synthetic TV, split-panel,
  1/4x right-edge-panel and dark-bezel captures. The skill's CLI-runner headers now route Windows Claude Code
  (Git Bash) to the Bash block like every other skill — wrapping the PowerShell block in
  `powershell -Command "..."` from bash let bash expand `$CLI`/`$env:USERPROFILE` first and
  PowerShell failed to parse the result.

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

[Unreleased]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.3.0...HEAD
[1.3.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.2.0...tizen-sdk-skills-v1.3.0
[1.2.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.2...tizen-sdk-skills-v1.2.0
[1.1.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.1...tizen-sdk-skills-v1.1.2
[1.1.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.0...tizen-sdk-skills-v1.1.1
[1.1.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.0.0...tizen-sdk-skills-v1.1.0
[1.0.0]: https://github.com/Samsung/tizen-agent-skills/releases/tag/tizen-sdk-skills-v1.0.0
