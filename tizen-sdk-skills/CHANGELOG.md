# Changelog

English | [한국어](CHANGELOG.ko.md)

All notable changes to **tizen-sdk-skills** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Releases are tagged `tizen-sdk-skills-vX.Y.Z` on the
[tizen-agent-skills](https://github.com/Samsung/tizen-agent-skills) repository.

## [Unreleased]

- **PowerShell `Sort-Object` `$_` expansion defense** — fixes the issue where wrapping the
  PowerShell lookup in `powershell -Command "…"` causes the outer shell to expand `$_` to an
  empty string, voiding the version sort and returning the wrong runner version
  (`scripts/rewrite-runner-snippets.js`, all `common/skills/*/SKILL.md` with Windows lookup blocks,
  `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/hooks/tizen-sdk-skills-guard.md`).
  `Sort-Object { [version]$_.Directory.Parent.Parent.Name }` now carries a `, FullName` secondary
  sort key: when `$_` works (direct terminal) the primary version sort returns the correct latest
  version; when `$_` is expanded (wrapped) the secondary `FullName` string sort returns the correct
  result for same-digit versions (e.g. 1.4.x). Wrapping must still be avoided for different-digit
  versions (1.10.0 vs 1.3.1).

## [1.4.2] — 2026-10-07

`tizen-dlog-analyzer` gains a `search` action — plain text or Python regex across every collected dlog
category at once (each app, `_general`, `_unparsed`; kernel excluded), so an agent that needs "which app
logged `connection refused`?" no longer falls back to a forbidden `grep` on the `.hot.log` files. The
bundled binaries were already at v0.2.7a0; the JS runner, the tizen-cli spec and both SKILL.md copies now
expose the binary's `search` subcommand with full parameter validation and a `no_logs` gate that lists every
missing category. The shared argv parser gains `repeatableFlags` so `--pattern`, `--category` / `--app-id`
and `--tag` collect into arrays. Three further **(skills)** fixes land for the CLI-runner lookup blocks:
`rewrite-runner-snippets.js` now parses sections by explicit boundaries, the Bash and PowerShell blocks lead
with the cmd.exe block last, and `tizen-screenshot`'s "do not wrap" note is folded into the shell-pick line.

### Added

- **`tizen-dlog-analyzer search` — text / regex search across every collected dlog category** (issue #254;
  `common/lib/core/dlog-analyzer.js`, `common/lib/cli/dlog-analyzer-cli.js`, `common/lib/core/sdk-commands.js`,
  `tizen-cli/src/command-specs/dlog-analyzer.ts`, `common/skills/tizen-dlog-analyzer/SKILL.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `common/lib/tests/dlog-analyzer.test.js`, the guard rule texts and the dlog-analyzer docs). TizenDLogAnalyzer
  v0.2.6 added a `search` subcommand that finds plain text or a Python regex in every collected category at
  once — each app, `_general`, `_unparsed` (kernel excluded) — without knowing which app wrote it, matching
  the whole raw line and the entry's stack-trace continuation lines so a match returns the whole entry. The
  bundled binaries were already at v0.2.7a0, but neither the JS runner, the tizen-cli spec nor the skill text
  exposed it, so an agent that needed "which app logged `connection refused`?" had only `app-log` (one app,
  whole log) or a hand-typed `grep` on the `.hot.log` files, which the rules forbid. The runner now has a
  `search` action: patterns are positional (`search "connection refused"`, several = any one matches, `--all`
  = every one) or `--pattern` (repeatable) for one that starts with `--`; `--category <app-id|_general|_unparsed>`
  (`--app-id` alias, repeatable or comma-separated) narrows the scope; `--regex`, `--case-sensitive`, `--invert`, `--context` /
  `--after-context` / `--before-context` (whole entries), `--since` / `--until`, `--priority`, `--tag`,
  `--count`, `--format text|json`, `--output`, `--max-matches` (default 100), `--max-lines` / `--max-chars`
  pass through to the binary — every pattern via `--pattern`, so a value like `-1 returned` is never parsed
  as an option, and the values are checked before anything runs (control characters in a pattern / tag /
  time / path, a tag with whitespace, a priority outside `V D I W E F`, a non-integer limit →
  `invalid_parameters`). The envelope gates on the SDK path first (`sdk_path_not_set`, like the other log
  readers), returns `no_logs` listing **every** missing category (`errors[0].missing_categories`) or the
  missing `app/` directory when nothing has been collected (instead of the binary's exit 1), and copies `total_matches` / `returned` / `truncated` out of the JSON or `--count` output so the
  agent can tell from the envelope alone whether to narrow the pattern; no match is still `success` with a
  `No entry matches …` message. tizen-cli gets `--action search --pattern <text...>` (variadic) plus the
  same switches. Both SKILL.md copies and the agent describe when to use it — the targeted step between
  `error-analyze … details` and the filtered `app-log` in the analysis order (Rule 12), the answer to "find
  X in the logs" / "which app logged X" / 로그에서 X 찾아줘, never the first analysis call, never `grep` on
  the collected files (Rule 2) — and the unit tests cover the argv builder, the parameter validation, the
  output summary, the `sdk_path_not_set` gate, the `no_logs` listing through the real CLI and the drift guard
  across both harnesses. The shared argv parser (`common/lib/cli/cli-runner.js` `parseArgs`) gains an
  optional `repeatableFlags` list so a runner can collect `--flag a --flag b` into an array instead of
  keeping the last value — dlog-analyzer uses it for `--pattern`, `--category` / `--app-id` and `--tag`
  (`app-log`'s `--tag` was documented as repeatable but kept only the last one); other runners are
  unchanged. The common skill version is bumped to 1.4.0.
- **`tizen-install-app` suggests `tizen-dlog-analyzer` as the next step after a successful install + run**
  (`common/skills/tizen-install-app/SKILL.md`, `common/agents/tizen-install-app.md`,
  `tizen-cli/skills/tizen-install-app/SKILL.md`). The "Suggested next steps" list only offered Playwright
  (web apps), a re-run, and the debuggers, so after a native BasicUI app was installed and launched on the
  emulator the model's summary had nowhere to point for "now watch what the app does". The list now opens
  with log collection and analysis for every executable package: with the app already running
  (`app_running: true`) start `dlog-collect <result.app_id>`, let the user exercise the app, then
  `stop-collect` → `error-analyze <app-id> summary`; or, to capture startup, `start start-monitoring`
  first, relaunch, then `stop` → `check` — i.e. the dlog-analyzer skill's existing "monitoring an app the
  user is about to test" workflow, reached from the install side. The two paths are presented as a
  choice (one dlog collector runs at a time), the agent ends its turn after starting a collector (that
  skill's Rule 3), the app ID is `result.app_id` from the install envelope with a fallback to asking the
  user when it is `null`, the tizen-cli copy uses its `--action … --app-id … --format …` syntax, a sample
  Korean prompt is included, and `sdb dlog` is never typed by hand.

### Fixed

- **`tizen-manifest.xml` + `CMakeLists.txt` no longer classifies a project as Platform (GBS)**
  (`common/scripts/tizen-build-project/tizen-build-project.{sh,ps1}`,
  `common/skills/tizen-build-project/SKILL.md`, `tizen-cli/skills/tizen-build-project/SKILL.md`,
  `docs/platform-gbs-build{,.en}.md`, `docs/figma2dali/dali-template-build-e2e{,.en}.md`). The GBS
  support commit (2026-07-22) detected Platform projects by `tizen-manifest.xml` + `CMakeLists.txt`;
  the follow-up that added the real marker, `CMakeLists.txt` + `packaging/*.spec` (2026-07-28), left the
  old rule in the Bash script's `has_project_config()` / `detect_project_type()`, in the PowerShell
  `Test-HasProjectConfig`, and in the tizen-cli SKILL.md detection table — while `isPlatformProject()`
  in `lib/core/project.js` only ever checked for `packaging/*.spec`. Every Native app carries a
  `tizen-manifest.xml`, so the table read as "native = GBS": in a Cline session the model, waiting on a
  50-second `tz build` of a BasicUI project, told the user "native builds use GBS, so this takes a while"
  although no `gbs` command ran. The three implementations now agree on `CMakeLists.txt` +
  `packaging/*.spec` only; a directory with just `tizen-manifest.xml` + `CMakeLists.txt` is rejected as
  "Project configuration not found" instead of being sent to GBS. While aligning them, the config
  check in both scripts gains `project_def.prop` (the Tizen Studio native marker that
  `detect_project_type()` / `Detect-ProjectType` already classified as Native but the config check
  did not accept), and the PowerShell `Test-HasProjectConfig` now returns an explicit `[bool]`
  instead of letting a bare `Get-ChildItem *.csproj` result (nothing, one `FileInfo`, or an array)
  be the function's value. Both SKILL.md files gain a build-method-by-type note that says GBS is
  used ONLY for Platform projects and that a slow native build is `tz build` compiling, not GBS.

### Changed

- **`tizen-dlog-analyzer` renders the final analysis report once, in the user's language, instead of
  always English then Korean** (#253 and its follow-up: `common/lib/core/dlog-analyzer.js`
  `REPORT_FORMAT_HINT`, `common/skills/tizen-dlog-analyzer/{SKILL.md,REPORT_TEMPLATE.md}`,
  `common/agents/tizen-dlog-analyzer.md`, `tizen-cli/skills/tizen-dlog-analyzer/{SKILL.md,REPORT_TEMPLATE.md}`,
  `docs/SKILLS_REFERENCE{,.en}.md`, `common/lib/tests/dlog-analyzer.test.js`). The report, the
  "collection is running — reproduce now" prompt and the closing next-step prompt are given in Korean when
  the user wrote in Korean and in English otherwise (including any third language); the one-shot
  `log-dump` / `log-clear` actions still produce no report. `REPORT_TEMPLATE.md` keeps both language blocks
  so the agent can pick one (Test 5 still checks both are present; Test 18 still checks the hint names both
  headings — the hint now says "once … OR"). The follow-up removes what the first pass left behind: the
  template's "Korean labels in block B" and its "copy the English block's content" instruction (there is no
  English block to copy when only the Korean one is rendered — the Korean block is now written directly, in
  the same structure), the skeleton annotations that sat *inside* the ```` ```markdown ```` fence in all
  three lanes (`## Analysis Report (English)            ← render this block when …` and
  `---  (Korean block below — …)`, which a literal copy would have emitted into the report; the skeleton is
  now two fences introduced by prose), and the anti-pattern wording "a bilingual report when the user wrote
  in one language", which two reviewers read as a condition for a bilingual report — it now says "a
  bilingual (English + Korean) report. Exactly one language block is rendered, never both." The label
  mapping is introduced as the fixed section and field names of the Korean block, so "write the Korean
  block directly" and "use these Korean labels" do not read as contradictory.
- **Runner lookup sections lead with Bash and PowerShell; cmd.exe comes last, behind a shell-pick line**
  (`scripts/rewrite-runner-snippets.js`, every `common/skills/*/SKILL.md` with a Windows lookup,
  `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`, `common/hooks/tizen-sdk-skills-guard.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/lib/tests/plugin-cache.test.js`). In a Cline PowerShell
  terminal the model took the FIRST block of the section — the cmd.exe `dir … 2>nul & dir …` chain
  (`AmpersandNotAllowed`) — and then wrapped the PowerShell block in `powershell -Command "…"` (the outer
  shell expanded `$h` / `$CLI` / `$env:…`, so the inner one received ` = '.cline'; if ( -or -or ) …`),
  although the 1.4.1 headings already said which shell each block is for. Every section now opens with one
  line that tells the shells apart by the prompt (`$` / `PS C:\…>` / `C:\…>`) and says to run that one block
  as-is, and the blocks follow in order of how many hosts they serve: Bash (Linux, macOS, Claude Code's Git
  Bash on Windows, Codex on Linux/macOS), PowerShell (Codex on Windows, Cline PowerShell terminal), then
  cmd.exe with its `node "<found-path>"` step and the "Runner not found?" note; the cmd.exe heading now
  points at the blocks *above*. The generator performs the reorder (a section parser over the headings, the
  three fences, the pick line and the note — anything else ends the section; hand-written Bash / cmd.exe
  headings are canonicalised; a section without a PowerShell block or a `node "<found-path>"` step gains
  one) and stays a fixed point (`--check` green). Section boundaries are explicit (review of #247): a
  heading moves with the fence right after it, the pick line / node step / note only follow their cmd.exe
  fence, the shell-pick line only opens a section, and a Bash / PowerShell fence naming another runner
  belongs to another section — so two touching sections never trade blocks; a multi-line paragraph under a
  heading is kept intact (it is not a heading), a cmd.exe fence naming no `*.js` without a PowerShell block
  is left alone instead of gaining a `\lib\cli\undefined` lookup, and generated lines keep the fence's
  indent inside list items. `tizen-screenshot`'s separate "do not wrap" note is
  folded into the shell-pick line. The drift-guard TC fails when a cmd.exe lookup is not preceded by the
  shell-pick line, the Bash block and the PowerShell block in that order, or when a Bash lookup fence sits
  under another heading. The agents' Cline 2-step list puts the PowerShell line before the cmd line, and
  the guard rules (Korean rule 7, English rule 8) say to pick by shell, never the first block by position.

## [1.4.1] — 2026-10-01

Cline on Windows (PowerShell terminal) could not find the CLI runner — the cmd.exe lookup block
was headed for both shells (`&` is reserved in PowerShell), and a `node "$CLI"` line pasted on its
own failed with a misleading `MODULE_NOT_FOUND` (Windows PowerShell 5.1 drops the empty `"$CLI"`
argument, so node died with `Cannot find module '<cwd>\list-templates'`). The skill headings now
name the shell each block is for, the generated `node` line guards against an empty `$CLI`, and the
guard rules (Korean rule 7 / 9, English rule 8 / 10) spell out both failure modes and limit the
encoding wrapper to commands without `$`.

Two `dlog-analyzer` fixes also land: a `start` refused by a live collector lock no longer reports
success and deletes the lock file (it returns `already_running` naming the holder), and the runner
picks the binary it was shipped with (newest cache version otherwise) instead of the first directory
it finds — and keeps a report the Windows cp949 code page crash cut short instead of returning only
the traceback.

### Changed

- **dlog-analyzer bundled binaries bumped from v0.2.3a0 to v0.2.5a0**
  (`common/tools/tizen-dlog-analyzer/linux/tizen-dlog-analyzer`,
  `common/tools/tizen-dlog-analyzer/windows/tizen-dlog-analyzer.exe`,
  `common/tools/tizen-dlog-analyzer/macos/tizen-dlog-analyzer`,
  `common/tools/tizen-dlog-analyzer/NOTICE.md`). Updated the per-platform
  PyInstaller one-file bundles for Linux, Windows, and macOS, and refreshed
  the file sizes and SHA-256 hashes in NOTICE.md to match the new builds.

### Fixed

- **dlog-analyzer `start` refused by a live collector lock reported success and then deleted the lock file**
  (`common/lib/core/dlog-analyzer.js`, `common/lib/tests/dlog-analyzer.test.js`, `common/agents/tizen-dlog-analyzer.md`,
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`). A `start` refused
  by the native binary's collector lock came back as `success`: the binary was still alive at the fixed 2 s check
  and exited a moment later, so the agent saw a dead PID on `stop` and went to delete `_meta/collector.lock` —
  which a live collector from an earlier session (one that had outlived its PID file) held open on the same dlog
  stream. The runner now polls the collector through a 3 s window and returns as soon as it exits or prints the
  refusal; on a refusal it returns `already_running` with the holder PID read from the lock file and the command
  that stops it (`stop`, `stop-collect`, or terminate the untracked PID). `start` also refuses up front while
  `dlog-collect` runs. The runner never touches the lock file. Review follow-up: a PID read from `collector.lock`
  may have been reused by an unrelated process once the real holder exited — the runner now reads its executable
  name (`tasklist` / `ps`) and only says "terminate PID" for a confirmed `tizen-dlog-analyzer`; a reused PID is
  reported as a stale lock ("do not terminate"), an unreadable name as "confirm before terminating".
  `awaitCollectorStartup` judges the new collector from the child-process exit state instead of signalling its
  PID (which a reused number would fake), and the refusal regex is anchored to the binary's own two lines so a
  device log line mentioning a lock, copied into the monitor's capture, cannot match.
- **dlog-analyzer ran the wrong binary version and lost the report on a Windows cp949 crash**
  (`common/lib/core/dlog-analyzer.js`, `common/lib/core/plugin-cache.js`, `common/lib/tests/dlog-analyzer.test.js`,
  `common/agents/tizen-dlog-analyzer.md`, `common/skills/tizen-dlog-analyzer/SKILL.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, `common/tools/tizen-dlog-analyzer/`). `resolveBinary()` walked
  the plugin caches in directory order and returned the first binary it found, so a cache holding 1.1.1 … 1.4.0
  ran 1.1.1's binary — which has no `investigate` ("No such command"). The runner's own `tools/` now comes first
  (an installed plugin always runs the binary it was shipped with) and a cache is searched newest version first,
  compared numerically. The native binary is frozen Python; piped to the runner on Windows it writes through the
  system ANSI code page (cp949) and dies with `UnicodeEncodeError` on the em dash in the investigate report's
  closing notes — after the whole report was already printed. Neither `chcp 65001` nor `PYTHONUTF8` /
  `PYTHONIOENCODING` reaches a PyInstaller binary (verified), so `runBinary()` and `error-analyze` keep the
  printed output and return it as a success with a warning that names the code page and rules out those retries,
  instead of returning only the traceback. Review follow-up: `resolveBinary()` imports `VERSION_DIR_RE` from
  `plugin-cache` (the rule `findLatestVersionDir` applies) instead of keeping its own copy, sorts with
  `compareVersions(b, a)` instead of `sort` + `reverse`; the `UnicodeEncodeError` matcher tolerates rich's
  line-wrapped traceback (tokens may be split across lines) and Buffer stdout/stderr; a recovered result carries
  `output_truncated: true` so callers can tell a cut-short report from a complete one without parsing the warning
  text.
- **PowerShell `node "$CLI" …` line run on its own failed with a misleading `MODULE_NOT_FOUND`**
  (`scripts/rewrite-runner-snippets.js`, every `common/skills/*/SKILL.md` with a PowerShell lookup block,
  `common/hooks/tizen-sdk-skills-guard.md`, `cline/hooks/tizen-sdk-skills-guard.md`,
  `common/lib/tests/plugin-cache.test.js`). With `$CLI` unset — the third line pasted without the two
  lookup lines, or in a fresh session — Windows PowerShell 5.1 drops the empty `"$CLI"` argument, so
  `node "$CLI" list-templates --type native` became `node list-templates --type native` and node died with
  `Cannot find module '<cwd>\list-templates'`, which points at nothing. The generated line now starts
  with `if (-not $CLI) { throw '… $CLI is empty. Run the two lookup lines above in THIS PowerShell
  session first …' }; ` on the same line as `node`, so it fires even when only that line is pasted; the
  block heading says to run all three lines in order in the same session; the generator adds the guard
  to existing blocks and regenerates an existing one (`--check` stays green); the drift-guard TC fails
  when a lookup is followed by a bare `node "$CLI"`; the guard rules (Korean rule 7, English rule 8)
  explain the symptom. Review follow-up: three fenced cmd.exe lookups (`tizen-webapp-debug`,
  `tizen-playwright-test`: "Cline on Windows ONLY (… cmd.exe / PowerShell …)"; `tizen-create-project`
  step 2: "Windows:") sat under headings the generator did not know, so they still said
  "cmd.exe / PowerShell" over the `&` chain — the generator now rewrites those two forms too, and the
  drift-guard TC requires every fenced cmd.exe lookup / PowerShell block to sit under the generated heading.
- **Cline on Windows (PowerShell terminal) could not find the CLI runner** (`scripts/rewrite-runner-snippets.js`,
  every `common/skills/*/SKILL.md` with a Windows lookup, `common/agents/tizen-{dotnet-debug,webapp-debug,playwright-test}.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`, `common/hooks/tizen-sdk-skills-guard.md`, the debug walkthroughs
  under `docs/debug/`). The cmd.exe lookup block was headed "Windows — Cline (cmd.exe / PowerShell)", so in
  a PowerShell terminal the model ran the `dir … 2>nul & dir …` chain there (`&` is reserved in PowerShell —
  `AmpersandNotAllowed`), then wrapped the PowerShell block in `powershell -Command "…"`, which let the
  outer shell expand `$h`, `$CLI`, `$d`, `$env:USERPROFILE` and `$_` first and handed the inner shell
  ` = ; foreach ( in @(…` ("foreach 뒤에 변수 이름이 없습니다"); guard rule 9's encoding wrapper was the
  pattern it copied. The headings now say the cmd chain is cmd.exe only and that the PowerShell lines run
  as-is in the terminal, never inside `powershell -Command "…"`; the generator rewrites the old headings
  in place (`--check` stays green); the guard rules (Korean rule 7 / 9, English rule 8 / 10) spell out the
  same two failure modes, tell the model to use the runner file name the skill gives instead of guessing
  one, and limit the encoding wrapper to commands without `$`.

## [1.4.0] — 2026-09-30

`dotnet-setup` picks the .NET SDK by where it lives and gains `--dotnet-root` / `--persist-env`;
`dotnet-debug --project` writes a working `.vscode/launch.json` + `tasks.json`; `sdk-install` sends
UTC+9 hosts to `download.tizen.org`; `dlog-analyzer` gains the analyzer's v0.1.3+ subcommands
(`investigate`, `probe`, `snapshot`, `timeline`, `kernel`, `app-log`, `device-profile`) with 0.2.1a0
binaries for Linux, Windows and macOS, and symptom reports ("CPU at 300 %, video does not play") now
reach it and follow its evidence flow (skill text, hook rules 17–19, prompt TC). Four security fixes
(installer version screens, certificate-password redaction, loopback-only OAuth callback, hook-adapter
path extraction), a publication toolchain that keeps internal-only features out of the public tree,
Cline-safe install polling, and fixes across `sdb-helper`, `file-transfer`, `install-rootstrap`,
`download-mobile-platform`, `download-emulator-package`, `create-project` and the Windows installer
path handling. Test suite: 290 TCs in 283 files (282 approved, 8 draft); the installer phases of the
mutating tier run against a throwaway home.

### Added

- **`dotnet-setup --dotnet-root <dir>` and `--persist-env`** (`tizen-dotnet-setup.ps1` `-DotnetRoot` /
  `-PersistEnv`, `.sh`, `dotnet-setup-cli.js`, `tizen-cli tizen-sdk dotnet-setup`). `--dotnet-root` pins the
  .NET SDK to use (the directory holding `dotnet` and `sdk/`) instead of discovering one; the runner
  rejects a root with no dotnet binary as `invalid_parameters` before the script runs. `--persist-env`
  opts a Tizen-extension-bundled dotnet into the persistent wiring described under Changed.
  The success envelope gains `result.dotnet_candidates` (every SDK found: tier, version, whether the
  Tizen workload is recorded, which one was used), `result.env_dotnet_root`, `result.dangling_dotnet_root`
  and `result.persisted_env` (what this run wrote, `null` when nothing).
- **`TIZEN_SDK_INLINE_INSTALLER=1`** (`runsInstallerInline()` in `common/lib/core/sdk.js`): the nine
  installer branches (`sdk-install`, `sdk-install-custom-repo`, `tv-sdk-install`, `tv-sdk-install-from-zip`,
  `update-package`, `platform-install`, `download-emulator-package`, `download-mobile-platform`,
  `install-rootstrap`) ran inline only inside the pkg-compiled tizen-cli and handed the installer back as
  `suggested_fix` everywhere else. The env toggle makes them run inline under `node tizen-sdk.js` too;
  the default behaviour is unchanged (`common/lib/tests/inline-installer.test.js`).
- **Integration suite: installer phases** `s2-sdk-installers` / `s3-dotnet-workload` in
  `tests/policy/mutating-run-order.yaml`, run by `scripts/run-mutating-tier.mjs --with-installers`
  (skipped by default). s2 installs a complete SDK into a throwaway home (`USERPROFILE`/`HOME`
  redirected, `TIZEN_SDK_PATH` dropped), snapshots and restores the Windows User `Path` /
  `TIZEN_SDK_PATH` that `tizen-sdk-install.ps1` rewrites (first teardown step, after stopping any
  installer PowerShell that outlived its runner; a snapshot missing either key is refused because
  `$null` would delete the variable; `--restore-user-env=<file>` redoes the restore after a killed
  run), refuses to start without `LongPathsEnabled=1` (the installer would block on a UAC prompt) or
  15 GB free, kills the runner's whole process tree on Ctrl+C, and deletes the scratch SDK afterwards
  (`--keep-scratch-sdk`) — only as exactly `<scratch>/home` carrying the ownership marker it wrote
  (`scratchHomeRemovable()`, unit-tested in `tests/scripts/runner-helpers.test.mjs`). `prepare-device-fixtures.mjs --only=rootstrap`
  builds the `${FIXTURE_ROOTSTRAP_ZIP}` fixture for `install-rootstrap.happy`.
  `build-project.compiler-flags` now asserts that an unsupported `--cflags` is rejected with
  `invalid_argument` instead of pretending a flag passthrough exists. First promotion run: 15 of
  the 22 remaining drafts approved (264 → 279 of 286); `download-mobile-platform.*` moved from
  7.5 to 7.0 because the mirror no longer lists MOBILE-7.5. The 7 left need a Samsung account,
  a Linux GBS host or a LAN device.

- **Internal-only content can be left out of the public tree** (`scripts/publication/`).
  Features that depend on Samsung-internal services now live behind three mechanisms so the
  publication runbook (`_repo-root/UPLOAD.md`) can drop them without hand edits: their files are
  listed in `internal-only-paths.txt` and the loaders tolerate their absence
  (`sdk-commands.js internalCommands()`, `envelope.js loadInternalErrorCodes()` merging the new
  `error-codes.internal.js`, and `tizen-cli/src/command-specs/internal-specs.ts`, which loads
  `command-specs/internal/` with `require()` while the esbuild `internal-only` plugin marks a
  missing directory — or every one under `TIZEN_PUBLIC_BUILD=1` — as external); prose about
  them in published files sits between `internal-only:begin` / `internal-only:end` markers;
  and `internal-only.js --check` (CI) fails when a listed path is missing, a fence is unbalanced
  or an internal term appears outside a fence. `assemble-public-tree.js <dest>` copies the tree
  without those paths, drops their command names from `tizen-cli/plugin.json`, strips the fences
  and refuses to finish while any term remains. `internal-only-gating.test.js` simulates the
  public tree by hiding the internal modules from `require()`.
- **`dotnet-debug --project <dir>` writes `.vscode/launch.json` and `tasks.json`**
  (`common/lib/core/debug.js`, `tizen-cli/src/command-specs/debug.ts`). Launch mode used to hand back a
  template with `<APP_FOLDER_NAME>` and leave `launch.json` to the user or agent, which is where a wrong
  debug type and a hard-coded TargetFramework crept in. With `--project` the runner reads `TargetFramework`
  / `TargetFrameworks` (the Tizen TFM out of a `;` list, attributes such as `Condition` tolerated) and
  `AssemblyName` from the `.csproj`, writes or merges the `Tizen .NET (netcoredbg)` coreclr configuration
  without touching other entries, and reports `launch_config.launch_json_path` / `launch_json_action`.
  Because netcoredbg ends the app and itself when VS Code sends terminate/disconnect — while the host
  sdb forward keeps accepting connections, so a second F5 "started" and died at once — it also writes a
  `tizen: netcoredbg launch` task (this runner, same app/port/serial, `--project ${workspaceFolder}`)
  and wires it in as the configuration's `preLaunchTask`, so stop → F5 relaunches the app first. Both
  files are planned before either is written (a non-strict-JSON `launch.json` skips `tasks.json` too;
  a non-strict `tasks.json` drops the `preLaunchTask` instead of leaving a dangling reference), entries
  are compared structurally so a user's file is not reformatted, and its indentation and trailing-newline
  style are kept. The setup scripts, agent, skill and walkthrough now state the real stop → relaunch
  behaviour instead of claiming the debugger server persists.
- **`sdk-install` routes UTC+9 hosts (Korea, Japan) to `download.tizen.org`**
  (`Select-CdnRepo` / `select_cdn_repo` in `tizen-sdk-install.ps1` / `.sh`). Every offset ≥ UTC+5 went to
  the `singapore` CloudFront mirror, but the official host is a single origin in AWS Seoul and measured
  faster from Korea (16 MB in 0.20–0.23 s vs 0.25–0.49 s). Exactly `+09:00` — checked on the raw offset,
  so `+08:30` / `+09:30` still round into the singapore range — now returns
  `https://download.tizen.org/sdk/tizenstudio/official`; both installers round half-hour zones the same
  way (bash truncated, PowerShell used banker's rounding; both now round the magnitude away from zero).
  `tests/scripts/cdn-mirror-selection.test.mjs` (part of `npm run lint` in `tests/`) extracts both
  functions, injects 23 `date +%z` offsets and asserts each against the documented table and that the two
  shells agree. Existing installs keep the mirror recorded in `repository.info`. Mirror tables in the
  `tizen-sdk-install` skill and the TV SDK / installation docs updated.
- **`dlog-analyzer`: the analyzer's v0.1.3+ subcommands, and 0.2.1a0 binaries for three platforms**
  (`common/lib/core/dlog-analyzer.js`, `common/tools/tizen-dlog-analyzer/`). The runner, skill and agent
  document and validate `app-log` (app-scoped log retrieval), `device-profile`, `investigate --symptoms`
  (one-shot symptom probes), `probe list|run`, `snapshot create|compare|delete`, `timeline` and
  `kernel collect|stop|analyze`; `snapshot compare` / `delete` validate their ids before the SDK-config
  pre-check so a missing id is `invalid_parameters`, not `sdk_path_not_set`. The bundled binaries move
  from v0.1.3.dev0 to **v0.2.1a0** for Linux and Windows and gain a **macOS (x86_64)** build; the
  per-platform sizes and SHA-256 hashes in `common/tools/tizen-dlog-analyzer/NOTICE.md` are refreshed and
  the macOS `shasum` verification command added.
- **`sdb-helper` accepts bare package ids, "list installed packages" in either word order, and an
  `emulator-restart` intent** (`common/lib/core/sdb-helper.js`). `package info dZEpxl2iAg` — the dotless
  pkgid `pkgcmd -l` prints for a TPK/WGT — was rejected with "Could not find a package ID" because only
  dotted app ids matched; `extractPackageId()` now prefers a dotted id, otherwise takes the token after the
  intent keyword when it looks like a pkgid (a digit, both letter cases or `-`/`_`; SDK pkgids are 10
  mixed-case alphanumerics) and refuses filler words, plain lowercase words, `emulator-<port>`, 12+-char
  hex serials and the passed-in serial, so nothing unvetted reaches `pkgcmd -u -n` / `pkginfo --pkg`.
  `list installed packages` / `applications` / "which packages are installed" all match `list-packages`.
  "Reboot/restart the emulator" is a new `emulator-restart` intent that hands off to
  `tizen-device-manager` (stop the VM) + `tizen-launch-emulator` (cold start): a guest `sdb shell reboot`
  of the Windows emulator resets the WHPX vCPU and kills the QEMU process (`WHPX: Unexpected VP exit
  code 4`), so the window dies and sdb never sees the device again. A gated `reboot` / `shutdown` whose
  resolved serial is `emulator-<port>` carries the same warning in `result.note`; hardware serials get
  none. Skill and agent intent tables updated (`common/lib/tests/sdb-helper.test.js` Tests 7b, 7b-2, 7c).
- **`file-transfer` restores remote paths that Git Bash's MSYS layer rewrote**
  (`normalizeRemotePath()` in `common/lib/core/file-transfer.js`). In Claude Code on Windows the Bash tool
  is Git Bash, and MSYS turns any argument starting with `/` into a path under the Git install root
  before node sees it: `/opt/usr/apps/x` arrives as `C:/Program Files/Git/opt/usr/apps/x` and sdb fails
  against a path the user never typed (the agents' workaround was `//opt/...`). When the remote slot holds
  a Windows drive path the runner strips the MSYS root — derived from `EXEPATH` (`bin` / `usr\bin` /
  `mingw64\bin` tails removed; a bare drive is not accepted as a root) with a fallback to the well-known
  Git / msys64 / cygwin roots — restores the device path and says so in `warnings`; `//opt/...` and
  `///opt/...` collapse to `/opt/...`; a genuine Windows path is refused with `invalid_parameters` naming
  `EXEPATH`. Local paths are untouched (MSYS converting `/c/Users/me/out` is exactly what a host-side
  `sdb pull` needs), and `MSYS_NO_PATHCONV=1` is deliberately not recommended because it would also stop
  the `/c/.../file-transfer-cli.js` runner path from being converted. Skill and agent now say: pass device
  paths as-is (`common/lib/tests/file-transfer.test.js`).
- **`install-rootstrap` honours `.rootstrap-installed` in the Phase-1 pre-check**
  (`common/lib/core/sdk.js` `parseRootstrapMarker()`). Outside the packaged CLI the runner cannot run the
  installer and tells the agent to re-run the pre-check afterwards to verify the marker — but the non-pkg
  branch never looked at it and always answered "Rootstrap is NOT installed" with a fresh `suggested_fix`,
  even right after a successful install. `<sdk>/.rootstrap-installed` is now read right after the SDK
  check (BOM- and CRLF-tolerant, since PowerShell writes both; entry lines split with the same regex the
  installer scripts use to build `DisplayName`) and, without `--force`, returns the success envelope built
  from it (installed rootstraps + structure type). With `--force` and a marker present the hand-off now
  says "already installed … but --force was given, so it will be reinstalled" instead of "NOT installed"
  (`common/lib/tests/install-rootstrap-precheck.test.js`).
- **`download-mobile-platform --include-iot-headed` falls back to the official repository for
  `extension_info.xml`** (`tizen-download-mobile-platform.ps1` / `.sh`). An SDK installed from a custom
  repository (`--repo-url`, e.g. an internal mirror) points `repository.info` at that mirror, which serves
  `pkg_list` and binaries but usually not the extension catalogue, so the IOT-Headed step gave up on a 404
  and the extension was never installed. Both scripts now retry the catalogue from
  `https://download.tizen.org/sdk/tizenstudio/official` when the configured repository (compared with
  trailing slashes stripped, CR-tolerant) fails and is not already the official one; only the catalogue
  comes from there — the IoT packages are still fetched from the repository the catalogue names. The
  outcome is tracked in one three-state flag in both shells, a partial file is removed before the retry,
  and the messages (per-attempt error naming the URL, one "IOT-Headed extension will NOT be installed"
  warning) are identical. Verified end to end on a host whose `repository.info` pointed at an internal
  mirror (IOT-Headed-7.0, 7 packages).

### Changed

- **`dotnet-setup` picks the .NET SDK by where it lives, and no longer persists a Tizen-extension-bundled
  dotnet by default** (`common/scripts/lib/common.ps1` `Get-DotnetCandidates`/`Select-DotnetCandidate`,
  `common.sh` `list_dotnet_candidates`/`select_dotnet_candidate`, `tizen-dotnet-setup.ps1/.sh`).
  Discovery used "already has the Tizen workload" as the primary rule, so the dotnet bundled under
  `~/.tizen-extension-platform/server/sdktools/dotnet` beat `C:\Program Files\dotnet` whenever it carried
  the workload — and `Enable-Dotnet`/`persist_dotnet` then wrote that path into the User `DOTNET_ROOT`/`PATH`
  (Windows) or `~/.bashrc` (Unix), where it went stale as soon as the extension updated. Candidates are
  now ranked PATH > `DOTNET_ROOT` > official install roots (Program Files, `%LOCALAPPDATA%\Microsoft\dotnet`,
  `~/.dotnet`, `/usr/share/dotnet`, brew libexec, …) > bundled, with the workload only as a tie-breaker
  inside a tier; the known bundled location is probed directly and the recursive walk of the profile
  (tens of seconds on a large one) runs only as a fallback; workload presence is read from dotnet's own
  install record (`metadata/workloads/<band>/InstalledWorkloads/tizen`) instead of a ~3 s
  `dotnet workload list` per candidate. Official roots (and `--dotnet-root`) are still wired up
  persistently; a bundled dotnet is used for the current run only, with a warning naming the two fixes
  (an official SDK, or `--persist-env`). A `DOTNET_ROOT` that points at a directory with no dotnet is
  reported as stale with the command that clears it, and is dropped from the User `PATH` when a new root
  is persisted. `persist_dotnet` now **replaces** an existing `~/.bashrc` export block instead of skipping
  it — skipping is how a stale `DOTNET_ROOT` survived every re-run. `tizen-build-project`'s "dotnet not on
  PATH" hint uses the same ranking. Two follow-ups: a persisted root is always moved to the **front** of
  the Windows User `PATH` (it used to be prepended only when absent, so a Program Files dotnet listed
  behind the bundled one kept losing the `dotnet` lookup), and the `~/.bashrc` rewrite only removes a
  block whose closing marker follows within a few lines — a block that had lost its marker used to take
  the rest of the file with it; such a block is now left verbatim, reported, and a fresh block appended.
  The candidate selection is implemented in both shells, and the tests run bash
  `select_dotnet_candidate` and PowerShell `Select-DotnetCandidate` on the same fixtures to pin that they
  agree.
- **Cline: the detached-installer skills poll at most four times per turn, and every poll is a
  different command** (`tizen-sdk-install`, `tizen-sdk-install-custom-repo`, `tizen-tv-sdk-install`,
  `tizen-tv-sdk-install-from-zip` skills and agents, `harnessGuidance()` in `common/lib/core/sdk.js`, the
  tizen-cli skill copy, TV setup docs). Cline aborts a tool after 5 consecutive identical calls and stops
  the task after 6 errors in a row; the previous recipe — `sleep 25 && --status`, "run the same command
  again" while `STATUS=running` — hit that guard on the fifth poll (~2 min into a 10–15 min install)
  while the detached installer kept running. Each poll now carries an increasing attempt number
  (`echo "poll #N"` / `Write-Host 'poll #N'`), and after four polls the agent ends the turn with a message
  that states the install continues in the background, that **no completion notice will arrive on its
  own** (Cline cannot notify), the `--status` / `-Status` command to check by hand, and the sentence to
  ask with (설치 진행 상태를 알려줘 / "tell me the install progress"); when the user asks, the agent runs
  `--status` and continues. `common/lib/tests/harness-guidance.test.js` pins the wording.
- **One mapper for "no device / several devices" across every device command**
  (`common/lib/core/sdb.js` `describeSerialFailure()` + `onlineDevices()`). `resolveSerial()`'s failure
  was turned into an envelope error by hand in every device module — `sdb-helper`, `screenshot`,
  `project` (install-app pre-check), `dlog-analyzer` — and the copies had drifted: only `sdb-helper`
  attached a `suggested_fix`, `dlog-analyzer` collapsed categories (fixed in the PR before this one).
  They all call the shared helper now, which keeps `resolveSerial()`'s category, lists only online
  (`state === "device"`) serials, builds the `multiple_devices` message and `suggested_fix` around the
  caller's own serial option (`--serial <serial>` by default; install-app and dlog-analyzer spell both
  harnesses' forms) and hands the online serials to `details` as `"<serial> (<state>)"` lines. Visible
  changes: `screenshot`, `install-app` and `dlog-analyzer` gain a `suggested_fix` naming the connected
  serials on `multiple_devices`; the `multiple_devices` message no longer says "Specify --serial" to
  the plugin dlog runner, which takes the serial positionally. `sdb-serial-failure.test.js` covers the
  helper and guards that every `resolveSerial()` caller goes through it.
- **`dlog-analyzer` follows the native CLI's SDK-resolved log directory** (`common/lib/core/dlog-analyzer.js`,
  `common/lib/cli/dlog-analyzer-cli.js`, `common/scripts/tizen-dlog-analyzer/tizen-dlog-analyzer.sh`,
  `tizen-cli/src/command-specs/dlog-analyzer.ts`). TizenDLogAnalyzer PR #155/#157 removed `--base-dir`
  from every binary command; against that build the runner failed immediately with "No such option"
  because `start`, `dlog-collect`, `error-analyze` and `app-log` all passed `--base-dir <tmp>/tizen-dlog-analyzer`
  and read the app logs from `<tmp>/tizen-dlog-analyzer/app/<app-id>/`. The flag is gone from every
  copy, and the new `resolveLogBaseDir()` applies the binary's own rule
  (`~/.tizen.sdk.path.config` → `TIZEN_SDK_DATA_PATH` in `<sdk>/sdk.info` or the `<sdk>-data` sibling →
  `<sdk-data>/dloganalyzer/`) so `error-analyze` / `app-log` look where the binary actually wrote.
  Envelopes report `result.log_base_dir` (and `result.log_file` for the app actions); a missing, empty or
  stale SDK config fails up front with `sdk_path_not_set` — checked before the binary and device lookups in
  every action whose binary command touches the log directory (`start`, `dlog-collect`, `error-analyze`,
  `app-log`, `device-profile`, `investigate`, `probe`, `snapshot`, `timeline`, `kernel`; `app-launch` /
  `app-terminate` are not gated), so it is the first and only error on a host without a device, whichever
  binary build is installed — instead of a binary exit buried in the captured output. The resolver reproduces the binary's string handling, not
  just its order: Python `strip()`/`splitlines()` semantics (a UTF-8 BOM in the config file is part of
  the path to the binary, so the runner reports the same "does not exist" and says it is the BOM; a
  `TIZEN_SDK_DATA_PATH=` line with an empty value is skipped and the scan continues). The `start` output-directory positional and the tizen-cli `--output-dir` for `start` are no
  longer accepted (the binary cannot be pointed elsewhere) — `start` returns `invalid_parameters` when
  one is given; `--output-dir` stays only as the second snapshot ID of `snapshot compare`. Only the
  runner's PID files, captured stdout and the `log-dump` file remain under `$TMPDIR/tizen-dlog-analyzer/`.
  **Requires a post-#155 `tizen-dlog-analyzer` binary**: the bundled `common/tools/tizen-dlog-analyzer/*`
  builds (v0.1.3.dev0 with `--base-dir`) default to `./logs` when the flag is absent and must be refreshed
  together with this change. New drift guards in `common/lib/tests/dlog-analyzer.test.js` fail if any
  copy passes `--base-dir` again.

### Security

- **`download-emulator-package` / `download-mobile-platform` validate `--platform-version` and
  `--iot-headed-version`** (`common/lib/core/sdk.js`). Both functions spliced the raw value into the
  installer command line (`-PlatformVersion "<v>"`) — a shell string in pkg mode, the `suggested_fix`
  command otherwise — without the `validateTizenVersion()` screen that `sdk-install` and
  `platform-install` already apply. A value such as `10.0"; rm -rf ~` is now rejected with
  `invalid_argument` before the SDK path is even read (`common/lib/tests/sdk-install-version.test.js`).
- **Certificate passwords no longer leak into envelope messages** (`common/lib/core/certificate.js`
  `describeKeytoolFailure()`). When keytool failed with an empty stderr (it reports a wrong password on
  stdout), `validateCertificateFile()` and `inspect-certificate` fell back to `execFileSync`'s
  `error.message`, which is the whole command line including `-storepass <password>`. The text is now
  passed through `redactSecrets()` in all three places (`common/lib/tests/certificate.test.js`).
- **The Samsung Account OAuth callback server listens on 127.0.0.1 only and answers 404 to any other
  path** (`common/lib/core/samsung-auth.js`). It listened on every interface, so any host on the LAN
  could POST a fabricated `code` to `/signin/callback`; requests for other paths (favicon probes) hung
  without a response.
- **Cline / Gemini hook adapters no longer let a write through when the body precedes the path**
  (`cline/hooks/PreToolUse`, `gemini/hooks/BeforeTool`). The adapters cut the payload at the first
  `"content"` / `"diff"` / `"old_string"` before extracting the path, so a tool call that emitted the
  file body first lost its path and was allowed — bypassing the config.xml / tizen-manifest.xml guard.
  They now take the first structural key (inside a JSON string every quote is `\"`, so a body cannot
  spoof it) and refuse a write whose path cannot be determined (`common/hooks/hooks.test.sh`).

### Fixed

- **Native projects created under `tizen-11.0` mixed API versions and failed to build**
  (`create-project-app.sh` / `.ps1` `sync_custom_templates` → new `align_synced_manifest_api_version` /
  `Align-SyncedManifestApiVersion`, `common/lib/tests/list-templates.test.js`). The plugin's custom
  `BasicUI` native template is one tree copied verbatim under every `platforms/tizen-X.Y/…/Template/Native`
  the runner selects, and its `tizen-manifest.xml` carried a fixed `api-version="10.0"`. `tz new -p tizen-11.0`
  writes `tizen_native_project.yaml` (`api_version: "11.0"`) and `.tproject` (`tizen-11.0`) from the profile
  but copies the manifest as-is, so the project came out with 11.0 next to 10.0 and `tz build` could not
  resolve a consistent rootstrap. The sync step now rewrites the copied manifest's `api-version` to the
  numeric part of the selected profile. Only a copy still byte-identical to the plugin's template is
  touched (`cmp -s` / byte-array compare) — SDK-shipped and user-edited manifests are left alone — which
  also repairs copies made by earlier plugin versions on their next `list-templates` / create run. The
  rewrite is anchored to the `api-version` attribute of the `<manifest …>` root element, first match only,
  with the same pattern in both twins; non-`tizen-X.Y` profiles (TV, wearable) are never rewritten. Seven
  script-layer TCs cover the fresh copy under 11.0 (attribute-only diff against the template), the
  unchanged 10.0 copy, the stale-copy repair, idempotence on a repaired copy, a `tv-samsung-*` profile and
  the untouched edited manifest; three source-inspection TCs hold the `.ps1` twin to the same anchor,
  guard and call site.
- **cmd.exe runner lookup printed nothing on any machine missing one of the four harnesses**
  (review of #227; `scripts/rewrite-runner-snippets.js`, 34 `common/skills/*/SKILL.md` and
  `common/agents/*.md`, 4 `docs/debug/*` walkthroughs, `common/lib/tests/plugin-cache.test.js`,
  `cline/hooks/tizen-sdk-skills-guard.md`). The generated cmd.exe line handed one `dir /s /b` all four
  `%USERPROFILE%\.<host>\plugins\cache\…` paths; `dir` aborts the whole listing (exit 1, no output) as
  soon as one path sits under a dot-dir that does not exist — and nobody has `.claude`, `.cline`,
  `.codex` and `.gemini` all installed. The generator now emits one `dir` per host chained with `&`,
  each with its own `2>nul`, and a trailing `ver >nul` so a missing last host does not leave exit code 1;
  the drift guard rejects the one-dir-many-paths form. Verified on Windows: bash, PowerShell and the new
  cmd.exe form resolve the same `…\1.3.1\lib\cli\dlog-analyzer-cli.js`.
- **`tizen-dlog-analyzer` — runner lookup section is structurally the same as every other skill**
  (review of #227; `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/hooks/tizen-sdk-skills-guard.md`,
  `cline/hooks/tizen-sdk-skills-guard.md`). The bash and PowerShell blocks end in the same `node "$CLI" …`
  call, the cmd.exe block is followed by the `node "<found-path>" …` step like elsewhere, the section
  states that all three resolve the same `<host-dot-dir>/…/<VERSION>/lib/cli/` file and how each picks
  the host and the version, and both guard rules use the same placeholders and the same "not in the skill
  folder — do not `find` there" wording.
- **`tizen-dlog-analyzer` — the live crash/exception analysis of `start-monitoring` is captured and
  survives `stop`** (issue #226; `common/lib/core/dlog-analyzer.js`, `common/lib/cli/dlog-analyzer-cli.js`,
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`). The native binary is a PyInstaller (Python) build and
  the runner redirects its stdout to `analyzer-output.log`, so Python block-buffered it: `check` showed
  nothing during the session, and `stop` sent SIGTERM first, which ends a Python process without
  flushing — the detections were lost. The three detached collectors now run with `PYTHONUNBUFFERED=1`,
  every stop path sends SIGINT → SIGTERM → SIGKILL (`terminateGracefully`), and `stop` returns the last
  200 captured lines (`result.output`, `total_lines`, `truncated`, `next_step`) — the file is only
  truncated by the next `start`, so `check` still returns all of it afterwards. `dlog-collect <app-id>`
  failing while the monitor runs (the binary allows one dlog collector) now says so and points at
  `check` instead of stopping the monitor mid-reproduction; `start stop` is answered with "run `stop` on
  its own". The skill/agent texts say `check` is never skipped when `start-monitoring` ran
  (`common/lib/tests/dlog-analyzer.test.js` Tests 16–17). Follow-up from review: the three collectors
  opened the capture file twice (`"w"` for stdout, `"a"` for stderr), so the two streams had independent
  offsets and stdout overwrote lines stderr had appended — they now share one descriptor
  (`openCollectorOutput`, the only place the file is truncated); `start` and `dlog-collect` remove their
  PID file when the collector exits in the 2 s grace window (only `kernel collect` did), so a reused PID
  can no longer make `stop` signal an unrelated process; and `stop` no longer advertises "last 0 of 0
  lines" for an empty capture.
- **`tizen-dlog-analyzer` — the final report follows `REPORT_TEMPLATE.md`** (issue #224; same skill/agent
  files, `common/lib/core/dlog-analyzer.js`). The template lived only in a separate file the agent had to
  `cat`; when it did not, the report came out as an improvised English-only "🔍 Investigation Report"
  with emoji headings and a findings table. Every lane's skill text now carries the exact skeleton
  (both blocks, all headings, the closing prompt) under "Final report — the only accepted shape", with
  the observed wrong shapes named, and the `check` / `error-analyze` / `kernel analyze` envelopes restate
  the shape in `result.report_format` so it travels with the data (Test 18).
- **`tizen-dlog-analyzer` — the runner is found on the first try in Cline** (issue #223;
  `common/skills/tizen-dlog-analyzer/SKILL.md`, `cline/hooks/tizen-sdk-skills-guard.md`,
  `common/hooks/tizen-sdk-skills-guard.md`). Cline loads the skill from `~/.cline/skills/<skill>/`, which
  holds only the markdown; the runner sits in the plugin cache. The skill's lookup snippet was buried
  after the Goal / Routing / Boundary prose (line 63), had no cmd.exe / PowerShell form, and never said
  the runner is not in the skill folder — so the agent spent two `find` calls over the skill directory
  and `~/.cline` before running it. The lookup now opens the skill body, states where the runner is and
  is not, and carries the same bash / cmd.exe / PowerShell trio as every other skill; the always-on Cline
  rule (rule 1) and the host-neutral guard (rule 8) say the same so it holds before any skill is loaded.
- **`tizen-dlog-analyzer` — symptom reports reach the analyzer and follow its evidence flow**
  (issues #211–#215; `common/skills/tizen-dlog-analyzer/SKILL.md`, `common/agents/tizen-dlog-analyzer.md`,
  `tizen-cli/skills/tizen-dlog-analyzer/SKILL.md`, the `tizen-device-manager` and `tizen-sdb-helper`
  skill/agent texts, `common/hooks/*`, `common/lib/core/dlog-analyzer.js`, `common/lib/core/sdb-helper.js`).
  Five behaviours were observed on prompts like "the emulator CPU went to 300% and the video does not
  play in com.samsung.fh.youtube — investigate": (#211) the request was delegated to
  `tizen-device-manager` unless the user named the analyzer; (#212) after `dlog-collect` the model
  slept on a timer and analyzed instead of asking the user to reproduce; (#213) the kernel log was
  fetched with `sdb shell dmesg`; (#214) CPU/memory evidence was gathered with `sdb shell top / ps`
  instead of the analyzer's probes; (#215) the unfiltered `app-log` was the first analysis call.
  Fixes: the analyzer's `description` / `when_to_use` now name the symptom vocabulary (high CPU,
  freeze, video not playing, 원인 분석 …) and state that a report mentioning the emulator is still its
  job, while `tizen-device-manager` declares itself discovery/stop-only; a new **Investigation
  workflow** (`investigate --symptoms` → collectors before reproduction → _end the turn and ask_ →
  `error-analyze summary` → `check` → `kernel analyze` → escalate to `details` / filtered `app-log` /
  `probe run`) plus Rules 10–13 (kernel via `kernel collect|stop|analyze`, evidence via
  `investigate`/`probe`, errors-first analysis order, routing). Hooks: `check-skill-routing.sh` now
  also guards `Agent`/`Task` and denies delegating symptom prompts to `tizen-device-manager`
  (`hooks.json` / `claude.sh` / `claude.ps1` matcher `Skill|Agent|Task`); `check-tizen-commands.sh`
  gains Rule 17 (raw `dmesg`/`kmsg` over sdb), Rule 18 (hand-typed `top`/`ps`/`free`/`/proc/*`
  diagnostics over `sdb shell`) and Rule 19 (`sleep`/`Start-Sleep` around the runner's stop/analyze
  actions, or a bare sleep ≥ 5 s while one of its collectors is alive — PID files under
  `<tmp>/tizen-dlog-analyzer/`, liveness via `kill -0` or `ps -W` on Git Bash). `tizen-sdb-helper`
  gains a `kernel-log` handoff intent (`dmesg` / `kmsg` / "kernel log" → dlog-analyzer). Runner:
  **`kernel collect` is now a detached background collector** with `kernel stop` — the binary's
  subcommand never terminates, so the previous synchronous `execFileSync` call always hit its 30 s
  timeout and returned `kernel_failed`, which is what pushed the model to `sdb shell dmesg`.
  `kernel analyze` is unchanged. Tests: `common/hooks/hooks.test.sh` (rules 17–19, Agent/Skill
  routing), `common/lib/tests/dlog-analyzer.test.js` (`kernel stop`), `sdb-helper.test.js`
  (`kernel-log` intent); new prompt-lane TC `tests/tc/dlog-analyzer/dlog-analyzer.prompt-symptom-routing.yaml`
  (TC-P-119, `draft` until three agent-session runs — the bare symptom report must resolve to
  `dlog-analyzer`, not `device-manager`; TC statistics in `tests/README*.md` / `CSV-YAML-MAPPING.md`
  updated to 290 TCs). Its pass criterion is machine-checkable: `tests/schema/tc-schema.json` gains two
  optional prompt-lane `expect` keys — `first_resolved_command` (the FIRST `must_call_tool` invocation
  must resolve to this command) and `must_not_resolve_commands` (never resolved at any point of the
  run) — since `must_resolve_command` alone passes a run that detours through `device-manager` first.
  `tests/skills/run-test-suite.md` documents both and asks the prompt-lane runner to list the resolved
  commands in order per attempt. Docs: dlog-analyzer walkthrough (EN/KO) Key Rules 3–7 + "Symptom
  Investigation" table, `SKILLS_REFERENCE*.md` §9/§28, guard rule 13 (Cline rule 11).

- **`download-emulator-package` reports the emulator images that are actually on disk**
  (`common/lib/core/sdk.js`, `common/lib/envelope/response-formatter.js`). The pre-check judged
  "what is installed" from the `.emulator-package-installed` marker alone, but that marker only
  records installs made by this skill — `tizen-sdk-install`, `tizen-tv-sdk-install` and
  `tizen-platform-install` also ship emulator images and never touch it. On a host whose 10.0 images
  came from the SDK / TV SDK installers, a later 11.0 run created the marker with a single
  `Platform version: 11.0` line and the envelope read as "only 11.0 installed". The envelope now
  scans `platforms/tizen-X.Y/<profile>/emulator-images/` and carries the result as
  `result.installed_images` (`[{platform, profile, image}]`, sorted by version) on both success paths
  and as one `errors[0].details` line per image on the not-installed path; the warning text
  distinguishes "Recorded by this skill: …" from "Emulator images on disk: 10.0 (tizen, tv-samsung),
  11.0 (tizen)". The marker-based already-installed decision is unchanged
  (`common/lib/tests/emulator-marker.test.js`).
- **`create-project --force` validates everything before it removes the existing project**
  (`common/lib/core/project.js`). The `fs.rmSync` ran before the app-name / template / parent-path
  shell screens and the script lookup, so a request that was then rejected as `invalid_parameters` had
  already deleted the project it was asked to replace. The removal now happens only after every
  check passes, and a failed scaffold names `project_creation_failed` (not `build_failed`)
  (`common/lib/tests/project-delete.test.js`).
- **`--schema` marks password options `sensitive: true` again** (`tizen-cli/src/lib/schema-generator.ts`,
  `tizen-cli/src/index.ts`). Two defects hid the marker MCP hosts use to mask secrets: the check
  received Commander's `option.flags` (`"--password <password>"`) and never matched, and the
  envelope's field-name masking then replaced the whole `"--password": {…}` schema object with
  `"***"`, dropping `type` and `description` too. The generator now uses `option.long`, and the
  `--schema` catalog (metadata only, no secret values) is written unmasked
  (`tests/tc/meta/meta.schema.yaml`).
- **`--help`, `--version` and `<command> --help` return a success envelope on stdout**
  (`tizen-cli/src/index.ts`, `tizen-cli/src/commands.ts`). They printed Commander's text to stderr and
  nothing to stdout, breaking the "exactly one JSON envelope" contract; the same text is now carried in
  `result.help_text` (`tests/tc/meta/meta.help.yaml`).
- **`sdb-helper` handles `uninstall` itself** (`common/lib/core/sdb-helper.js`). The intent was handed
  off to `tizen-install-app`, which has no uninstall, so "uninstall the app" went nowhere. It is now a
  gated `sdb shell pkgcmd -u -n "<pkgid>"` with a note about package id vs app id; the bare `launch app`
  / `앱 실행` triggers were removed from the skill so they no longer collide with `tizen-install-app`.
- **First sdb call of a session no longer hangs until the timeout** (`common/lib/core/sdb-helper.js`,
  `common/lib/core/remote-device.js`, `common/lib/core/samsung-duid.js`). A cold sdb client that has to
  start the daemon leaves it holding the stdout pipe; every entry point now calls `ensureSdbServer()`
  (or `runSdb(..., {viaTempFile: true})`) first. `samsung-duid` also uses the shared `parseDevices()` /
  `onlineDevices()` instead of taking the first line of `sdb devices` whatever its state, and runs sdb
  with argv arrays instead of interpolated shell strings.
- **`hidden-password` prompt no longer spins at 100 % CPU on EOF** and no longer closes the process's
  own stdin on the Windows raw-mode failure path (`common/lib/cli/hidden-password.js`).
- **`download-mobile-platform --force`** removes the install marker only when it actually runs the
  installer inline, not when it merely returns a `suggested_fix` (`common/lib/core/sdk.js`).
- **Skill descriptions fit the 1024-character host limit** (`tizen-create-project`, `tizen-sdb-helper`,
  `tizen-dlog-analyzer` skills and agents, `tizen-cli/skills/tizen-create-emulator`). Longer
  descriptions were truncated by the host, which is how the closing "NEVER hand-write config.xml" rule of
  `tizen-create-project` silently disappeared; the routing rules now live in a "Routing rules" body
  section and `tests/scripts/verify-skill-frontmatter.mjs` (part of `npm run lint` in `tests/`) fails on
  any description over the limit. The `tizen-dlog-analyzer` skill no longer documents a `--app-id` flag
  the node runner does not accept (the app id is positional).
- **Test suite:** `tests/policy/tiers.yaml` classifies `import-wgt` (mutating) — it shipped in 1.3.1
  without a tier, so its TCs would have defaulted to `skip` — and `verify-doc-stats.mjs` now fails when
  `tiers.yaml` and `tizen-cli/plugin.json` disagree (internal-only command groups excluded).
  `import-wgt` gets its first TCs (`import-wgt.missing-required`, `import-wgt.missing-archive`, both
  safe tier — they fail on input validation before the SDK is touched). The runner
  creates `<USERPROFILE>\AppData\Local` when the profile is redirected, so PowerShell 5.1 no longer drops
  its `ModuleAnalysisCache` into `tests/Microsoft/` (also gitignored). `vscode/package.json` drops the
  `icon` script that pointed at a file that does not exist.
- **`tizen-create-project` no longer suggests app names the runner rejects.** The agent and skill
  instructions (`common/agents/tizen-create-project.md`, `common/skills/tizen-create-project/SKILL.md`,
  `tizen-cli/skills/tizen-create-project/SKILL.md`) never mentioned that `createProject()` requires at
  least 10 letters/digits in the app name (Tizen's package ID is exactly 10 alphanumeric characters),
  so the app-name question offered names such as `MyApp`, the create failed with `invalid_parameters`,
  and the user was asked a second time. The rule is now stated where the name is asked, every example
  and option must already pass it (`MyTizenWebApp`, `MyTizenNativeApp`, `MyTizenDotnetApp`,
  `MyTizenApp01`, `MyDaliDemoApp`), and the remaining `--name MyApp` samples in the CLI help
  (`--name` description), `project.js` hint, `T-CLI.md`, `docs/platform-gbs-build*.md` and
  `docs/sdk-install/DOTNET_SETUP_E2E*.md` were replaced with names that pass. The two GBS
  walkthroughs (`docs/tizen-cli/dali-demo-e2e-walkthrough*.md`, `docs/figma2dali/dali-template-build-e2e*.md`)
  created the project as `dali-demo` (8 letters/digits — also rejected); they now use `MyDaliDemoApp`
  throughout (project path, RPM file names, `/usr/bin` binary, `/tmp/<name>.log`, `~/bin/run-<name>.sh`)
  and their template-substitution note explains why the template's default name cannot be used as-is.
  The wording everywhere says _ASCII_ letters/digits (`A-Za-z0-9`; `-`, `_`, spaces and non-ASCII
  characters such as 한글 are not counted), which is exactly what `validatePackageId()` checks;
  `common/lib/tests/app-name-examples.test.js` runs every listed ✅/❌ example, the `--name`
  description's example and the `createProject()` hint through `validatePackageId()` so the lists
  cannot drift from the validator.
- **`dlog-analyzer` device-resolution envelope keeps the real error category and lists only online
  devices** (`common/lib/core/dlog-analyzer.js`, follow-up to PR #192). `deviceErrorEnvelope()` collapsed
  every failure other than `multiple_devices` into `device_not_found`, so an `invalid_parameters`
  serial, an `io_error` from `sdb devices` or a missing sdb binary all told the agent to "launch an
  emulator". The category from `resolveSerial()` is now passed through unchanged (a missing binary,
  which carries none, still maps to `device_not_found`). The `errors[0].devices` listing is filtered
  to `state === "device"`, so `multiple_devices` no longer offers offline serials and
  `device_not_found` never carries a `devices` array, as the skill docs already claimed. The helper is
  exported and covered by `dlog-analyzer.test.js`. The agent prompt and both SKILL.md files now tell
  the agent to re-run with the chosen serial in the positional `[serial]` slot — the plugin runner has
  no `--serial` flag and rejected the retry PR #192 documented with `Unknown option` — and the
  `error-analyze` rows no longer recommend `details` "for token efficiency" (it is the larger output;
  `summary` is the compact one).
- **`install-rootstrap` passes `-SdkPath` / `--sdk-path`** to its script. It resolved the SDK in JS
  (`readSdkPath()`) but let the script re-resolve it through `Get-SdkPath`, whose candidates include
  `$env:TIZEN_SDK_PATH` — the two could disagree and the rootstrap land in a different SDK than the
  one the pre-check validated.
- **`sdb-helper` keeps the device clause out of shell-command arguments** (`extractShellCommand()` in
  `common/lib/core/sdb-helper.js`). "run shell command ls -la on emulator-26101" ran `ls -la on
  emulator-26101` on the device (`ls: cannot access 'on'`), and a leading clause ("on emulator-26101
  run shell command ls") defeated the keyword stripping and sent the whole sentence. A leading or
  trailing "on (the|my|this) (device|emulator|target|tv|board) [serial]" or "on <serial>" is now stripped,
  where a bare `<serial>` must be `emulator-<port>`, an IPv4[:port] or a hardware serial that interleaves
  letters and digits — so `grep -i on file1.txt`, `echo on`, `tail -n 20 on log2024.txt` and
  `ls /opt/on/the/device` are untouched — as is leading/trailing politeness (please, kindly, for me,
  thanks). A request that is only a device clause yields no command (`sdb-helper.test.js` Test 5b).
- **`sdk-install` on Windows wrote `C:/Users/me/tizen-sdk\bin` into the User `Path`**
  (`tizen-sdk-install.ps1`, `common/scripts/lib/common.ps1` `ConvertTo-CanonicalWindowsPath`). The JS
  layer passes `-Path` with forward slashes so a trailing backslash cannot escape the closing quote; the
  installer used the value verbatim, so `Path`, `TIZEN_SDK_PATH`, `sdk.info` and
  `~\.tizen.sdk.path.config` all stored the slash form, and the "already on Path" check never matched a
  backslash entry — duplicating the three entries on every run. The path is canonicalised once, right
  after it is resolved (anchored at PowerShell's `$PWD` for a relative path, drive root keeps its
  separator, whitespace trimmed, a value `GetFullPath` rejects falls back to slash replacement instead of
  aborting). `tizen-sdk-install-custom-repo` delegates to the same script and is covered
  (`common/lib/tests/sdk-install-windows-path.test.js` runs the real helper in PowerShell).
- **`remote-device` and `screenshot` verify the sdb binary exists before spawning it**
  (`common/lib/core/remote-device.js`, `common/lib/core/screenshot.js`). Both used `resolveSdb()`, which
  only joins `<sdk>/tools/sdb`; a missing binary went straight to the shell and, on a Korean Windows
  host, came back as an `io_error` whose message was CP949 "path not found" decoded as UTF-8 — replacement
  characters. They now use `resolveSdbBinary()` like the other sdb callers (configured path on disk, else
  sdb on `PATH`, else a clean `sdk_path_not_set` pointing at `sdk-init`).
- **Test suite:** the mutating tier's documented minimal prepare (`--only=tmp,projects,rootstrap`) never
  created the `myProfile` signing profile, so `build-project.release --sign-profile myProfile` failed with
  `TIZEN_SDK_CERT_E021` on any host without it; selecting `projects` now ensures the profile (same
  create / keep / `--replace-profile` rules; `--skip-build` skips the step for every part alike). The
  runner's no-launcher hint names the directory (`cd tizen-cli && pnpm build`). Suite status after this
  release: **290 TCs in 283 files, approved 282 / draft 8** (safe 69 / mutating 79 / device 142) — the
  new `import-wgt.*` and `meta.help` TCs are approved, TC-P-119 stays draft until three agent-session
  runs.

### Removed

- `CI_TEST_FIX.md` and `SECURITY_FIXES_SUMMARY.md` — working notes with personal paths that were
  committed to the repository root by mistake.

### Documentation

- **Repository-wide architecture diagrams** (`docs/ARCHITECTURE_DIAGRAMS.md` Korean,
  `docs/ARCHITECTURE_DIAGRAMS.en.md` English): ten Mermaid diagrams per file — the six harnesses sharing
  `common/`, the directory layout, the SKILL → runner → sdk-commands → plugin-cache → script call flow,
  the Standard JSON Envelope, the guard hooks, setup/sync, the standalone tizen-sdk CLI build, the
  commands by domain, a typical end-to-end flow, and the test/CI gates. Only flowchart and sequence
  diagram types are used (the mindmap type is not rendered by older previews). Both READMEs link the pair
  under "Architecture & reference". Every Mermaid `style` line here and in `tests/README.md` sets
  `color:#1a1a1a` and a stroke — the light fills were rendered with white text on dark themes.
- **Test-suite docs**: `tests/RUN-ORDER.md` collects the safe → mutating → device sequence (drivers,
  prerequisites, phases, options, common failures) in one place, with Korean `tests/README.ko.md` /
  `tests/RUN-ORDER.ko.md` linked from their English counterparts. `tests/README.md` puts the tizen-cli
  build (`cd tizen-cli && pnpm install && pnpm build`) in front of every runner workflow — `dist/` is
  gitignored, so a fresh checkout otherwise fails every cli-lane TC — warns that a bare `node runner.mjs`
  runs the mutating and device tiers, and states the runner's executor resolution (Windows:
  `TC_LAUNCHER_JS`, then `../tizen-cli/bin/tizen-sdk.js`; elsewhere `tizen-cli` / `tizen-sdk` on `PATH`)
  and which drivers check bundle staleness. `TEST-SUITE-PLAN.md` is rewritten to match the current suite
  and names `README.md` as the source of truth. `verify-doc-stats.mjs` now also checks the README
  diagram, the lane table, `tiers.yaml` and `README.ko.md`, and fails loudly on `tiers.yaml` key drift;
  the stale TC / lane counts it did not cover (281 → 286 at the time, cli 171 / prompt 118 → 167 / 119)
  are fixed.

## [1.3.1] — 2026-09-23

The integration suite's device and mutating tiers run end to end (ordered phases, host-built
fixture apps; approved TCs 199 → 264 of 286), its safe tier gates CI, and `gdb-debug` gains
`--serial`. Ten fixes from the TC-report follow-ups, among them `gdb-debug` on emulator images that ship no gdbserver, a `sdk-install`
that reported success for a platform it never installed, a `device-manager stop` that could
hang forever, and a Windows `launch-emulator` that tried to boot a VM named `t`.

### Added

- **`gdb-debug --serial <serial>`** (`tizen-cli/src/command-specs/debug.ts`, `common/lib/core/debug.js`,
  `common/lib/cli/gdb-debug-cli.js` 6th positional, `tizen-native-gdb-debug.ps1` `-Serial` / `.sh` `-s`).
  The gdb scripts used sdb's default target for every call; they now pin every `sdb` invocation to
  `--serial` when given (and refuse a serial that is not connected) or to the first connected device,
  the way `tizen-dotnet-debug` already does, and the envelope reports `result.device_serial`.
  `gdb-debug.serial` (draft since the TC was authored) runs and is approved. Both `gdb-debug` and
  `dotnet-debug` (which previously spliced `--serial` into the script arguments unchecked) now
  screen it with the shared `SERIAL_PATTERN`, tightened to forbid a leading `-` and cap the length
  at 64 (`common/lib/tests/debug-serial-validation.test.js`).
- **Ordered mutating-tier test run** (`tests/scripts/run-mutating-tier.mjs`,
  `tests/policy/mutating-run-order.yaml`, `npm run test:mutating` / `prepare:mutating`). A bare
  `node runner.mjs --tier=mutating` could never pass: readdir order builds a project before the TC that
  creates it and deletes it before the later builds, `remove-profile` consumes its fixture, and
  `generate-author` / `import-certificate` refuse to overwrite the previous run's certificates. The
  driver runs five phases with cwd = `tests/`, gates on `fixtures.generated.env` per phase (shared
  `FIXTURE_NEEDS`), and adds the hooks `cleanKeystore` (only the fixture-named certificates under
  `<sdk-data>/keystore`), `resetProfileFixtures` (backup/restore of `fixtures/profiles/*.xml`, scratch
  `profiles.xml` for `create-profile`) and `resetProjectsDir` (`${FIXTURE_PROJECTS_DIR}`), refusing to
  start while `fixtures/profiles` has uncommitted changes. It never installs or removes SDK packages:
  only the SDK-installer TCs whose already-installed short-circuit is idempotent are listed. Every
  directory a hook empties (both drivers) passes `guardedScratchDir()`: real path strictly inside
  `tests/fixtures/apps`, no symlink/junction, no other drive; a second Ctrl+C during a teardown is
  ignored and a failed teardown step (including the final `git status` self-check of the profile
  fixtures) fails the run.
  First run on Windows: 5/5 phases in 4 min; 27 mutating cli-lane TCs promoted draft → approved
  (`sdk-install` ×3, `sdk-install-custom-repo` ×2, `tv-sdk-install.happy`, `dotnet-setup` ×2,
  `certificate-manager` ×11, `create-project` ×4, `build-project` ×3, `project-delete.happy`).
- **`requires.capabilities` gains `samsung-account` and `gbs`** (`tests/schema/tc-schema.json`); the 22
  cli-lane TCs that stay `draft` now declare why (`[sdk, net]` for the installers that only execute under
  the packaged CLI or reinstall the SDK, `[sdk, samsung-account]` for the online-CA actions,
  `[net-device]` for `remote-device.connect*`, `[sdk, gbs]` for the GBS builds) and say so in a `NOTE`.
- **Ordered device-tier test run** (`tests/scripts/run-device-tier.mjs`,
  `tests/policy/device-run-order.yaml`, `tests/runner.mjs --order=<yaml> [--phase=<name>]`).
  A bare `node runner.mjs --tier=device` could never pass: readdir order ran the debug TCs
  before any emulator existed, created `test-vm` three times, and deleted it (and stopped every
  emulator) before the TCs that need it. The runner now accepts an explicit, phased run order
  (repeats allowed; misspelled, ambiguous or non-`approved` ids abort with exit 2), the order
  file encodes the sequence that works for the approved device TCs (44 at the time; 69 after the
  fixture entry below), and the driver adds the
  preflight (fresh `dist` bundle, `--doctor`, hypervisor probes, no emulator online), the
  Device Manager bookmark-list backup/restore, the `test-vm`/`tv-vm` pre-clean, the `tv-vm`
  boot needed by `device-manager --profile tv`, and a teardown that runs even after a failed
  phase. `npm run test:device` now prints that plan; `--yes` executes it. Documented in
  `tests/README.md` ("Device tier") and `tests/skills/run-test-suite.md`.
- **Safe-tier TC regression gate in CI** (`.github/workflows/ci.yml`, `_repo-root/.github/workflows/ci.yml`).
  The test job now runs `node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net`
  against the freshly built `tizen-sdk` launcher, with `HOME` redirected to a throwaway
  directory so `sdk-init.explicit-path` cannot touch the runner's real
  `~/.tizen.sdk.path.config`. The TC schema's `requires.capabilities` gains `sdk` (installed
  Tizen SDK) and `net` (outbound access to `download.tizen.org`); the seven safe TCs that
  need one of them (`list-templates.*`, `sdk-init.happy`, `sdk-install.unavailable-version`,
  `certificate-manager.get-sdk-data-path.happy` / `list-profiles.happy`,
  `validate-repo-url.happy`) declare it and are reported as skipped instead of failing.
  Because `--skip-requires` is a declaration rather than a probe, the CI step first fails if an
  SDK is actually reachable (`~/.tizen.sdk.path.config`, `~/tizen-sdk` or `sdb` on PATH), and
  the runner's summary line breaks skips down by reason.
  `tests/runner.mjs` gains `--skip-requires=<cap,...>` and `--help`, and now rejects unknown
  options (exit 2) instead of silently running every mutating and device TC. Documented in
  `tests/README.md` ("CI gate") and `tests/skills/run-test-suite.md`.
- **Device-tier fixtures and the promotion of the fixture-bound draft TCs**
  (`tests/scripts/prepare-device-fixtures.mjs`, `tests/scripts/run-device-tier.mjs --include-drafts`,
  `tests/policy/device-run-order.yaml`, `tests/scripts/lib/driver-common.mjs`). The 31 cli-lane device
  drafts pointed at Linux `/tmp/...` files and at apps (`org.tizen.myapp`, `org.tizen.example.MyApp`,
  `abcDEF1234.MyWebApp`) that no host had and that the plugin cannot create with a chosen id. Their argv
  now use `${FIXTURE_*}` placeholders; the new prepare script builds and signs a native, a .NET and a web
  fixture app under `tests/fixtures/apps/` (signing profile `myProfile` is created from the fixture
  cert, kept when it already uses it, and only replaced with `--replace-profile`), lays out the
  `tmp/` tree the push/pull/screenshot/`create-image` TCs use, installs Playwright in a test
  project, and writes `fixtures.generated.env`, which the driver merges into the runner's
  environment and gates per phase (`FIXTURE_NEEDS`, checked against the TC placeholders by
  `runner-helpers.test.mjs`). The order file gains the phases `c2-fixture-apps`, `c3-web-debug`,
  `c4-dotnet-debug`, `c5a/b/c-gdb-*` and `c6-stop` (test-vm now stays booted from `c-boot-1` to `c6`),
  `emulator-manager.create-image` joins `b-vm-lifecycle`, and the driver's inline hooks became a
  `PHASE_HOOKS` table with `resetImageDir`, `deviceFixtures` (installs the apps, writes `/tmp/log.txt`),
  `debugCleanup` (`sdb forward --remove-all`, kills netcoredbg/gdbserver/the fixture apps before every
  debug phase) and `resetTestProject`; a hook that cannot establish its precondition is listed in the
  summary and fails the run. The first promotion run passed all 14 phases (18 min) and promoted the 25
  fixture-bound drafts — file-transfer ×5, `screenshot.output-path`, `create-image`, webapp-debug ×4,
  playwright-test ×6, dotnet-debug ×5, gdb-debug ×3 — from `draft` to `approved` (suite: draft 79 → 54,
  approved 199 → 224; approved device TCs 44 → 69). Six drafts stay draft with the reason in their
  `NOTE`: `install-app.happy/.run/.serial` assert envelope fields that do not exist (`device_id`,
  `process_id`), `gdb-debug.serial` passes an option `gdb-debug` does not have, and
  `remote-device.connect*` need a network-reachable device. Documented in `tests/README.md`
  ("Device tier"), `tests/fixtures/README.md` and `tests/skills/run-test-suite.md`.

### Changed

- **Suite status after the second promotion pass: draft 22 / candidate 0 / approved 264 of 286.**
  The 8 guard-rule TCs (`tc/meta/guard-rules.prompt.yaml`) dropped their never-run cli lanes — they
  duplicated approved cli TCs, pointed at `/tmp` fixtures and were mis-tiered `safe` — and are approved
  on their recorded 41/41 prompt-lane run. `install-app.happy/.run/.serial` assert the fields the
  envelope really has (`device_serial`, `app_launched`) and run in device phase `c2-fixture-apps`
  (the driver's `deviceFixtures` hook now installs only the .NET and web packages);
  `gdb-debug.serial` runs in the new phase `c5d-gdb-serial`; `file-transfer.prompt-pull-missing` was
  run in an agent session. `build-project.compiler-flags` stays draft on purpose: the plugin has no
  compiler-flag passthrough and Commander 12 drops the trailing token silently.

### Fixed

- **`gdb-debug` failed on every emulator image with `gdbserver not found at /usr/bin/gdbserver`**
  (`common/scripts/tizen-gdb-debug/tizen-native-gdb-debug.ps1` / `.sh`). Emulator images since Tizen 8
  ship no gdbserver, but the SDK carries it as `<sdk>/tools/on-demand/gdbserver_<ver>_<arch>.tar`.
  Step 2 now looks for `which gdbserver`, `/usr/bin/gdbserver` or a previous on-demand copy and
  otherwise pushes and extracts that tar to `/home/owner/share/tmp/sdk_tools/` — the mechanism
  `tizen-dotnet-debug` already uses for netcoredbg — picking the tar by device arch (`armv7l` →
  `armel`) and newest version, and verifying with a `test -x … && echo ok` probe because sdb shell
  drops the remote exit code. Source guards in `common/lib/tests/gdb-ondemand-guards.test.js`;
  `SKILL.md`, the agent file and the native-debug walkthroughs mention the on-demand install.
- **`sdk-install --tizen-version 99.99` reported `success` / `installation_status: completed` for a
  platform that was never installed** (`common/lib/core/sdk.js`, `tizen-sdk-install.ps1` / `.sh`).
  The already-installed pre-check had been fixed earlier, but the branch where the packaged CLI runs the
  installer itself only checked that `sdk.info` existed afterwards, and the installer's own
  "already installed" short-circuit exits 0 before it looks at `-Platform`. Both `installSdk()` and
  `installSdkFromRepo()` now verify `platforms/tizen-<X.Y>` after the installer and return
  `platform_version_not_found` (with the `platform-install` suggested fix) when the requested platform is
  absent; both installer scripts exit 1 with the same hint when given a `--platform` the installed SDK
  lacks. Report follow-up (§4.2).
- **A failed `sdk-install` left nothing to diagnose** — the envelope said
  `SDK installation failed: \n\n\n\n\n\n\n` after 763 s, no log existed anywhere, and the same command
  passed 15 s later (§8.3). The message was `stdout || stderr || message`: a whitespace-only stdout is
  truthy, so stderr and the exit code were dropped. New `describeInstallerFailure()` (used by all eight
  installer runners) reports exit code / signal — a timeout is named as such (Node reports it as
  `code ETIMEDOUT`, never `killed`) and a leftover `.install-running` marker is explained — the last
  output lines of BOTH streams (each capped at 200 chars in the message, whole in `details`), says so when
  nothing was captured, writes the full captured output to `$TIZEN_LOGS_DIR` (default
  `<tmp>/tizen-sdk-skills-logs/<runner>-<timestamp>.log`) and names it, and points at the installer's
  `.install.log` / `.install-result`; `errors[0].details` carries the same lines. The installer scripts
  now keep their own log — `tizen-sdk-install.ps1` writes a transcript to `<install>\.install.log` and
  repeats the failure verdict on stderr, `tizen-sdk-install.sh` mirrors its stderr into
  `<install>/.install.log` — and print the path on success and failure.
- **`install-app` with several devices connected was classified as `io_error` (`TIZEN_SDK_IO_E001`) and
  exposed the shell command line** (`common/lib/core/project.js`, §4.2). Sibling commands return
  `multiple_devices` (`TIZEN_SDK_DEVICE_E002`). `installApp()` now resolves the target device in JS
  before the script runs (explicit serial, else exactly one online device) and returns
  `device_not_found` / `multiple_devices` with the serial list itself; a "Multiple devices found" script
  exit is mapped to `multiple_devices` too, and the generic install failure reports the script exit code
  and its key output lines instead of Node's `Command failed: <full command line>`. New
  `classifyInstallFailure()` holds the output→envelope mapping. Docs
  (`common/agents/tizen-install-app.md`, `tizen-cli/skills/tizen-install-app/SKILL.md`) updated.
- **"Is Node.js installed?" was routed to the generic `doctor` sweep in 1 of 3 prompt runs**
  (`tizen-sdk.check-node.prompt-*`, §4.2). Neither `check-node` description mentioned doctor, so the
  broader command won the tie. The `tizen-check-node` skill descriptions (common + tizen-cli), the
  `check-node` command description (`check.ts`) and the `tizen-sdk` routing table now carry the exact
  prompt phrasings, state that a Node.js-only question is answered by `check-node`, and say explicitly
  that `--doctor` / core `doctor` is a whole-setup sweep and not that answer.
- **`playwright-test` said "Node.js executable was not found on PATH" for two different failures**
  (`common/lib/core/playwright-test.js`, §4.2). `resolveNodeRuntime()` returned one string for a
  missing `node` (spawn ENOENT) and for a present `node` whose `--version` exited abnormally; only the
  parenthesised `exit N` told them apart, which led to a wrong diagnosis. It now returns a `reason`
  (`not_found` / `spawn_failed` / `timeout` / `exited`) with exit code, signal and stderr tail, and the
  new `describeNodeRuntimeFailure()` produces distinct envelopes: `node_not_found` ("install Node.js /
  fix PATH") for a missing executable, `execution_error` quoting the exit code and stderr ("Node.js is
  on PATH but does not run — repair/reinstall, do not install a second copy") for a broken one, and a
  timeout variant. Skill/agent docs list the two categories.
  Regression tests for all five in `common/lib/tests/tc-report-followups.test.js`.
- **`device-manager --action stop` could hang forever** (`tizen-device-manager.ps1` / `.sh`).
  Its last-resort `sdb shell poweroff` never returns when the guest's sdbd accepts the
  connection but does not answer — seen with a TV emulator whose guest had frozen, and with a
  row sdb kept after the emulator process was gone — so the action blocked past every caller's
  timeout (the device-tier TC, the run driver's teardown). The call is now bounded to 15 s per
  device, and a new Method 5 restarts the sdb server to drop phantom rows, naming any row that
  comes back instead of waiting on it. Worst case on Windows is now ~50 s; the
  `device-manager.stop` TC's `timeout_sec` goes 60 → 120 to leave margin.
- **`launch-emulator` without `--vm-name` tried to launch a VM named `t` on Windows**
  (`tizen-emulator-manager.ps1`). With exactly one VM, PowerShell unrolled the one-element array
  returned by the list helpers into a bare string, and `$vms[0]` returned its first character
  (`No emulator VM named 't' exists`). `ConvertTo-VmNames` / `Get-VmList` now return a real
  array and the call site wraps it in `@()`. Hardening added alongside in both `.ps1` and `.sh`:
  the already-running check waits (≤15 s) while an online emulator row still shows `<unknown>`
  as its name right after a boot, and when em-cli refuses a launch but sdb shows the VM online
  the action reports that serial as success. Source guards for both fixes in
  `common/lib/tests/emulator-stop-launch-guards.test.js`.
- **`pnpm link --global` fails on current pnpm** (`ERR_PNPM_LINK_BAD_PARAMS: You must provide a
parameter`). pnpm 10 removed the `--global` flag and pnpm 11 removed the no-argument
  `pnpm link` too; the documented way to put the standalone `tizen-sdk` launcher on PATH is now
  `pnpm add -g .` from `tizen-cli/` (undo with `pnpm remove -g tizen-cli-plugin-tizen-sdk`).
  Updated `tizen-cli/README*.md`, `docs/tizen-cli/build-and-install*.md` (troubleshooting rows
  for `ERR_PNPM_LINK_BAD_PARAMS`, `ERR_PNPM_NO_GLOBAL_BIN_DIR` and `command not found`),
  `tests/README.md`, the launcher header comment, and the CI workflow comment.
- **RDS benchmark script and docs** (`common/lib/tests/manual/benchmark-rds.js`,
  `docs/rds/RDS_BENCHMARK*.md`, follow-up to the timing instrumentation). Phase C now restores
  every source file it modified (also on Ctrl+C), never creates a marker file in the project,
  covers `.cs` / `.css` / `.html` / `.xaml` and keeps a UTF-8 BOM and shebang / XML declaration /
  doctype lines first; its baseline install no longer disappears with `--build false`, and the results table
  looks rows up by iteration number. A failed `install --reset-rds` aborts the run instead of
  being reported as complete; the package path comes from `--package` or the build envelope
  instead of a guessed `Debug/<dir>-1.0.0.tpk`; bare `--build` no longer swallows the next
  option (`--no-build` added); the plugin-cache fallback uses `plugin-cache.js`. The CI test
  runs on Windows too and measures the instrumentation overhead on an empty phase; the docs
  describe Phase C, the real env vars, the optional `--device-serial`, the quoted cmd.exe
  `set "TIZEN_BENCHMARK=1"` form, and what `rds_timings` on a full install covers.

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
  - A device marker _behind_ host state (emulator snapshot restore, re-flash, shared serial) is
    rejected like one ahead of it (`marker-behind`) instead of skipping every group the device
    never received. `getAppInstallPath` tiers 3/4 relied on `sdb shell test -d` failing, but
    sdb exits 0 regardless of the remote status, so tier 3 always "succeeded"; the probe is
    `test -d X && echo <marker>` with the marker checked on stdout.
  - RDS only engages when the package sits inside the Debug output tree the scanners track;
    installing a Release/Test package previously short-circuited to `fast-deploy` without
    installing it. A delta touching `tizen-manifest.xml` / `config.xml` is always `full`
    (pushing the file cannot re-register privileges, app-controls or app IDs).
  - `app_id` in the RDS success envelope was the manifest _package_ ID while the full-install
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

[Unreleased]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.2...HEAD
[1.4.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.1...tizen-sdk-skills-v1.4.2
[1.4.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.4.0...tizen-sdk-skills-v1.4.1
[1.4.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.3.1...tizen-sdk-skills-v1.4.0
[1.3.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.3.0...tizen-sdk-skills-v1.3.1
[1.3.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.2.0...tizen-sdk-skills-v1.3.0
[1.2.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.2...tizen-sdk-skills-v1.2.0
[1.1.2]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.1...tizen-sdk-skills-v1.1.2
[1.1.1]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.1.0...tizen-sdk-skills-v1.1.1
[1.1.0]: https://github.com/Samsung/tizen-agent-skills/compare/tizen-sdk-skills-v1.0.0...tizen-sdk-skills-v1.1.0
[1.0.0]: https://github.com/Samsung/tizen-agent-skills/releases/tag/tizen-sdk-skills-v1.0.0
