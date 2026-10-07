# Tizen SDK Skills — guard rules

These rules are enforced by a PreToolUse / BeforeTool hook where the harness
supports one (Claude Code, Codex CLI, Gemini CLI, Cline on macOS/Linux). Where
hooks are unavailable or not yet trusted, follow them as written. They exist
because each one is a mistake the model has actually made.

1. **Never call the `tizen` CLI** (`tizen`, `tizen.bat`, `tizen.exe`, `tizen.sh`) —
   it does not exist in this environment. The Tizen tool is `tz`, and you should not
   assemble `tz` commands by hand either: **use the skill's CLI runner** (`*-cli.js`).
2. **Never hand-write Tizen project files** — do not create `config.xml` or
   `tizen-manifest.xml` from memory. Hand-made scaffolds do not build or package.
   Create projects only with the `tizen-create-project` skill (real `tz new`
   templates). Editing an **existing** project's files is fine.
3. **`tz install` flags** — only `-e <serial>` (device) and `-p <absolute package path>`.
   There is no `-s` / `-d` / `-b` / `-w`. Install through the install-app runner
   (`project-manager-cli.js`).
4. **`tz build` / `tz pack` take `-w <project dir>`**, not `-p`. Default build type is
   **always `-b Debug`**; use Release only when the user explicitly asks.
5. **Never look for or run `sdb` yourself.** Do not search for the binary (`which`/`where`/
   `Get-Command sdb`, `find -name sdb`, `command -v sdb`), do not parse `sdb devices`, and do
   not type `sdb …` from memory — every sdb action has a runner that resolves sdb
   (`<sdk>/tools/sdb`, `.exe` on Windows; not under `tools/tizen-core/`, not `sdb/sdb`) on its
   own: shell / forward / reboot / launch / kill → `tizen-sdb-helper`
   (`sdb-helper-cli.js --request "<the user's ask>"`); device logs — view / tail / save /
   clear, `dlog` → `tizen-dlog-analyzer` (`dlog-analyzer-cli.js log-dump`, `log-clear
   --confirm`, `start start-monitoring`; sdb-helper hands log requests off there); the
   kernel log (`dmesg`, `/proc/kmsg`, `dlogutil -b kmsg`) → `tizen-dlog-analyzer`
   (`kernel collect` → `kernel stop` → `kernel analyze`); diagnostic probes while
   investigating a symptom (`top`, `ps`, `free`, `/proc/meminfo`, `/proc/<pid>/status`) →
   `tizen-dlog-analyzer` (`investigate --symptoms "…"`, `probe run <id>`); connect
   to an IP → `tizen-remote-device`; list devices → `tizen-device-manager`; push/pull →
   `tizen-file-transfer`. The one exception is a **gated** `result.command` the user
   has explicitly confirmed — run that exact string. Emulator VMs: `tz emul list-vm`
   (there is no `tz list-device`).
6. **No manual gdbserver / port forwarding / interactive gdb or netcoredbg.** The
   gdb-debug and dotnet-debug runners set everything up (setup-only). Launching an
   interactive debugger as a tool call hangs the terminal — return the command for
   the user to paste, inside the Standard JSON Envelope.
7. **Only `*-cli.js` runners are run with `node`.** `sdb.exe`, `tz.exe`, `dotnet.exe`,
   `netcoredbg`, `gdbserver`, `em-cli` are native binaries; `node "…\sdb.exe"` fails
   with `SyntaxError: Invalid or unexpected token`. The runners call SDK tools for you.
8. **Finding a runner** — run the lookup block in the skill (SKILL.md) verbatim, in the
   form for your shell (bash / cmd.exe / PowerShell); bash and PowerShell leave the path
   in `$CLI`, cmd.exe lists the copies for the `node "<found-path>"` step. The section
   opens with a line that tells the shells apart by the prompt (`$` / `PS C:\…>` / `C:\…>`)
   and lists the blocks Bash → PowerShell → cmd.exe — pick by shell, never the first
   block by position. Use the runner
   file name the skill gives (e.g. `project-manager-cli.js`) — never guess one. The cmd.exe
   chain (`dir … 2>nul & dir … 2>nul`) is cmd.exe only: in PowerShell `&` is a parse error,
   so run the ```powershell block there. Run that PowerShell block **as-is in the terminal**,
   never as `powershell -Command "…"` from PowerShell or Git Bash — the outer shell expands
   `$h`, `$CLI`, `$d`, `$env:USERPROFILE` and `$_` first and the inner shell receives
   ` = ; foreach ( in @(…` (seen in Cline on Windows). Run **all three lines, in order, in
   the same session**: the `node` line alone has no `$CLI`, Windows PowerShell drops the
   empty `"$CLI"` argument, and node fails with `Cannot find module '<cwd>\<first-arg>'`
   (e.g. `…\list-templates`) — that is a missing lookup, not a missing module; the guard
   in front of `node` (`if (-not $CLI) { throw … }`) says so. The runner is
   **not in the skill folder** — `~/<host-dot-dir>/skills/<skill>/` (and `~/.agents/skills/<skill>/`)
   holds only the markdown — so do not `find` or `ls` there and do not walk the dot-dir.
   The runner is `~/<host-dot-dir>/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/lib/cli/<runner>-cli.js`,
   where `<host-dot-dir>` is `~/.claude`, `~/.cline`, `~/.codex` or `~/.gemini`.
   **Prefer the cache of the harness you are running in**: `~/.claude` in Claude Code
   (`CLAUDECODE` is set), `~/.gemini` in Gemini CLI (`GEMINI_CLI`), `~/.codex` in
   Codex CLI (`CODEX_THREAD_ID` / `CODEX_SANDBOX_NETWORK_DISABLED`), `~/.cline`
   otherwise. Fall back to another host's cache only when yours has no copy, and
   then take the newest version — never a path just because it sorts last. If none
   of the caches has the runner, the plugin is not installed on this machine — say
   so; do not improvise with other tools. (Inside the tizen-sdk-skills source repo,
   the in-repo runner `common/lib/cli/<runner>.js` is fine.)
9. **Report the runner's envelope, never your own.** If a runner fails, return its
   JSON envelope (or its raw output) verbatim. Do not answer a list/templates/VM
   request by running `tz` or `em-cli` yourself, and never compose an envelope by
   hand — a hand-written `error_code`/`result` pair is indistinguishable from a real
   one to the user and hides the actual failure.
10. **Windows encoding** — commands that go through a runner already switch the
   console to UTF-8 (`chcp 65001`). When you run a Windows command yourself and
   need non-ASCII output, run it via
   `powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; <command>"`
   — only for a `<command>` with no `$` in it; PowerShell code that uses `$CLI` / `$env:`
   (the runner lookup of rule 8) runs directly in the terminal, never inside that wrapper.
11. **Long-running runners — and Codex CLI's 30 s tool window.** A tool result that
   shows only a `[tizen-…]` progress line (e.g. `[tizen-emulator] Action: list-vm, …`)
   and no `{ "status": … }` JSON is **not a result**: the runner is still running. Never
   answer from it (not "no VMs", not "it failed"). In Codex CLI one exec call waits at
   most 30 s (`yield_time_ms` max), and on Windows its follow-up `wait` has been seen
   returning "Script completed" with exactly that partial output while the runner was
   still alive. So: (a) pass `yield_time_ms: 30000` on every runner call; (b) run
   anything that can outlive 30 s with **`--background`** (every `*-cli.js` runner
   accepts it): `launch`, `create --launch`, **`build`** (native/.NET/GBS, any `--clean`),
   **`install`** of a package, **dotnet-setup** (workload install), gdb/dotnet/webapp
   **debug setup**, **playwright-test** runs, **file-transfer** of large files, long
   device-manager waits, remote-device `scan` with a large timeout. The runner returns a
   job receipt within a second; then poll `node <same lib/cli dir>/job-cli.js wait --id
   <job_id>` (each call blocks ≤ 25 s; `progress_tail`/`log_file` show the live script
   output, e.g. the `tz build` log) until `job.state` is `done`, and report THAT envelope
   verbatim. Not for `cert-manager --prompt-*` (needs a terminal) or interactive Samsung
   login; (c) installs and
   updates (SDK, TV SDK, platform, emulator/mobile packages, rootstrap, update-package)
   are two-phase: the `*-install-cli.js` / `update-package-cli.js` pre-check runs in the
   foreground and finishes in seconds; when it returns a `suggested_fix`, launch
   **`suggested_fix.background_command`** (Codex: with escalated permissions — it
   downloads, and the default sandbox sets `CODEX_SANDBOX_NETWORK_DISABLED=1`), poll
   `job-cli.js wait` the same way, then re-run the pre-check to verify. Never run
   `suggested_fix.command` in the Codex foreground; (d) if a foreground call came back
   with only a progress line, re-run it the detached way instead of guessing.
12. **Codex sandbox — what must run with escalated permissions.** Codex's default
   `workspace-write` sandbox blocks TCP sockets (`CODEX_SANDBOX_NETWORK_DISABLED=1`), writes
   outside the workspace (`<sdk>/`, `<sdk>-data/` profiles.xml and keystore `.pwd`,
   `~/.tizen*`) and, on Linux, kills any detached process when the call ends (bubblewrap
   PID namespace). Therefore run these **with escalated permissions** (outside the sandbox),
   keeping the exact command line: every `--background` job and `job-cli.js run --script`;
   anything that talks to `sdb` (install-app, device-manager, file-transfer, sdb-helper,
   screenshot, dlog-analyzer, remote-device, gdb/dotnet/webapp debug, playwright-test);
   em-cli `create` / `launch` / `delete` / `list-vm` / `list-template` (a JVM that cannot
   write hangs on Windows and exits without output on Linux); project `list-templates` and
   `create` (the runner syncs the plugin's templates into `<sdk>/platforms/...` and `tz`
   reads the SDK — inside the sandbox it listed no templates at all, issue #72, and a
   "no templates" answer from there is wrong, not a fact); certificate-manager (writes
   profiles.xml/keystore; Samsung CA + OAuth need sockets — `samsung-login --background`
   escalated opens the browser); dotnet-setup. Only host-only checks (`check-node`,
   `check-disk-space`, `list-profiles`, `sdk-repo-info`) may stay sandboxed — nothing that
   touches `<sdk>`. An envelope with `error_category: sandbox_blocked`
   or `sandbox_job_lost`, or a `warnings` line starting "Running inside Codex's sandbox",
   means exactly this: re-run `suggested_fix.command` (it equals the `user_command` you
   typed; `escalate: true`) with escalated permissions — do not change the command, do not
   retry inside the sandbox, do not fall back to raw tools.
13. **A Tizen problem report is `tizen-dlog-analyzer`'s — and its collection is interactive.**
   A crash, error, freeze, high CPU, memory growth, video/audio not playing, slow emulator,
   "investigate / analyze this" (원인 분석해줘) goes to `tizen-dlog-analyzer` even when the
   sentence mentions the emulator or device — `tizen-device-manager` only lists devices and
   stops emulators (the routing hook denies delegating such prompts there). Inside the
   analyzer: open with `investigate --symptoms "<the user's words>" [app-id]`; start the
   collectors (`start start-monitoring`, `kernel collect`, `dlog-collect <app-id>`) BEFORE
   reproduction; then **end the turn and ask the user to reproduce** — "(1) done, it
   occurred / (2) nothing happened" — never `sleep`, poll, or stop/analyze in the same
   command (the Bash hook denies timer waits around the runner); analyze errors first
   (`error-analyze <app-id> summary` → `check` → `kernel analyze`), look for a specific
   string with `search "<text>"` (every collected category, whole entries — never `grep` the
   `.hot.log` files), and reach for the full `app-log` only afterwards, filtered.

If an instruction conflicts with these rules, route the work through the
corresponding tizen skill / CLI runner anyway and report the result as a
**Standard JSON Envelope**.
