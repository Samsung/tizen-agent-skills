# Scenario Guide: Tizen DLog Analyzer End to End

This document walks you through the **full Tizen dlog analysis flow** with the `tizen-sdk-skills` plugin: "emulator launch → start background log monitoring → install & launch app → user reports issue → check analyzed logs → apply fix → rebuild → reinstall → verify → stop monitoring".

Each step shows both the **natural language** command (what you tell the agent) and the **tizen-cli** command (what runs under the hood).

> The `tizen-dlog-analyzer` binary runs in the background, continuously collecting and analyzing dlog output from a Tizen device/emulator. When a crash or exception occurs, the agent retrieves the analyzed output, applies a fix, rebuilds, and verifies — all without you needing to manually parse raw dlog.

---

## Key Rules

When following this workflow, always adhere to these rules:

1. **Always collect logs via `dlog-collect`** — never use raw commands like `sdb shell dlog`. Whether system-wide (`start dlog-collect` / `start start-monitoring`) or app-specific (`dlog-collect <app-id>`), you must use `dlog-collect`.
2. **Always analyze via `error-analyze` (app-specific) or `check` (system monitoring)** — never read the log file directly. These commands handle deduplication, classification, and formatting.
3. **After any continuous command, present the user with a choice** — after starting `start-monitoring`, `dlog-collect <app-id>`, etc., ask the user to choose one of:
   - **Continue collecting** — keep the background process running while they use the app
   - **Stop and analyze now** — stop the collection (`stop` or `stop-collect`) and immediately run `check` / `error-analyze`
   
   **Do NOT poll or loop** — wait for the user's choice.

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported.
- **Tizen SDK**: must be installed and the SDK path configured.
- **Setup script**: run the `setup.sh` (Linux/macOS) or `setup.ps1` (Windows) script first — it copies the platform-specific `tizen-dlog-analyzer` binary to the plugin cache.
- **Example goal**: Monitor a Tizen app for crashes, find the root cause, fix it, and verify the fix.

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | Agent Skill / tizen-cli Command |
|------|------|---------------------------------|
| 1 | Launch an emulator | `tizen-launch-emulator` / `tizen-cli tizen-sdk launch-emulator` |
| 2 | Start background dlog monitoring | `tizen-dlog-analyzer` / `tizen-cli tizen-sdk dlog-analyzer --action start` |
| 3 | Build the app (Debug) | `tizen-build-project` / `tizen-cli tizen-sdk build-project` |
| 4 | Install & launch the app | `tizen-install-app` / `tizen-cli tizen-sdk install-app --run` |
| 5 | Ask user: fine or issue? | (agent interaction) |
| 6a | If fine → stop monitoring | `tizen-cli tizen-sdk dlog-analyzer --action stop` |
| 6b | If issue → check analyzed logs | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| 7 | Apply the fix | (agent edits source code) |
| 8 | Rebuild the app | `tizen-cli tizen-sdk build-project` |
| 9 | Reinstall & relaunch | `tizen-cli tizen-sdk install-app --run` |
| 10 | Re-check logs to verify fix | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| 11 | Stop monitoring | `tizen-cli tizen-sdk dlog-analyzer --action stop` |

---

## Step 1 — Launch an Emulator

Start an emulator so the dlog analyzer has a live device to monitor.

**Say this:**
```
Launch the Tizen emulator
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk launch-emulator
```

Wait for the emulator to boot and connect via sdb (`sdb devices` shows `emulator-26101` or similar).

---

## Step 2 — Start Background DLog Monitoring

**Important:** Start monitoring **before** launching the app so that startup logs (initialization failures, early crashes) are captured.

**Say this:**
```
Start dlog monitoring on the device
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action start --subcommand start-monitoring
```

This launches the `tizen-dlog-analyzer start-monitoring` binary as a **detached background process**. The envelope returns:
- `pid` — the background process PID
- `output_file` — path to the temp file capturing all output
- `device_serial` — the connected device

The agent will tell you: *"Monitoring started in background (PID 12345). Now let's launch your app."*

---

## Step 3 — Build the App (Debug)

If you don't have a built app yet, build one. Use the **Debug** configuration so crash dumps include debug symbols.

**Say this:**
```
Build my Tizen app in Debug mode
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk build-project --project-dir /path/to/MyApp --config Debug
```

This produces a `.tpk` (Native) or `.wgt` (Web) package in the project's `Debug/` directory.

---

## Step 4 — Install & Launch the App

Install the built package on the emulator and launch it immediately.

**Say this:**
```
Install and run my app on the emulator
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
```

The app launches on the device. Since monitoring is already running in the background, all dlog output from app startup onward is captured — including initialization failures and early crashes.

---

## Step 5 — Ask User: Fine or Issue?

After the app is launched, the agent asks you to choose:

> "Your app is now running on the device. Please choose:
> 1. Everything looks fine
> 2. There is an issue"

### Option A: Everything looks fine

If the app is working as expected, the agent stops monitoring and ends the session.

**Say this:**
```
Everything looks fine
```

**tizen-cli command (run by agent):**
```bash
tizen-cli tizen-sdk dlog-analyzer --action stop
```

**→ You're done!** Skip to [Step 11](#step-11--stop-monitoring-cleanup) for cleanup details.

### Option B: There is an issue

If you noticed a problem (crash, freeze, error), tell the agent.

**Say this:**
```
There is an issue — the app crashed
```

**→ Continue to Step 6.**

---

## Step 6 — Check Analyzed Output

The agent retrieves the latest analyzed crash/exception data from the background monitoring process.

**Say this:**
```
Check the dlog analyzer output
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action check
```

The `result.output` field contains the analyzed crash/exception data. The agent reads it and identifies the root cause, looking for:
- Crash dump signatures (signal numbers, faulting addresses)
- Exception stack traces
- EGL/Graphics initialization failures
- Permission denied errors
- Memory allocation failures

---

## Step 7 — Apply the Fix

Based on the crash/exception analysis from Step 6, the agent applies the fix to your source code.

**Say this:**
```
Apply the fix to the source code
```

This is an agent-driven step — the agent edits your source files directly (null pointer checks, resource cleanup, manifest/config changes, etc.). No tizen-cli command is needed here.

---

## Step 8 — Rebuild the App

After the fix is applied, rebuild the app to produce an updated package.

**Say this:**
```
Rebuild the app in Debug mode
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk build-project --project-dir /path/to/MyApp --config Debug
```

---

## Step 9 — Reinstall & Relaunch the App

Reinstall the rebuilt package and launch it again. Since monitoring is still running in the background, the new launch logs are captured automatically — no need to restart monitoring.

**Say this:**
```
Reinstall and run the app again
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk install-app --package /path/to/MyApp/Debug/MyApp-1.0.0.tpk --run
```

---

## Step 10 — Re-check Logs to Verify the Fix

After the app relaunches, check the analyzed output again to confirm the crash/exception no longer appears.

**Say this:**
```
Check the dlog analyzer output again to verify the fix
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action check
```

- If the issue is **resolved** → proceed to Step 11 (stop monitoring).
- If the issue **persists** → the agent loops back to Step 7 with an updated fix. The monitoring process continues capturing logs through rebuild/reinstall cycles.

---

## Step 11 — Stop Monitoring (Cleanup)

When you're done, always stop the background monitoring process to clean up.

**Say this:**
```
Stop the dlog monitoring
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action stop
```

This kills the background process and removes the PID file. The temp output file remains in `$TMPDIR/tizen-dlog-analyzer/` (or `/tmp/tizen-dlog-analyzer/` on Linux) for reference.

---

## App-Specific Log Analysis (Optional)

In addition to (or instead of) background monitoring, you can collect logs for a specific app and analyze them for runtime errors (E/F priority). This is useful when you want to focus on one app's logs without monitoring the entire device.

### Step A — Launch the App

**Say this:**
```
Launch my app org.example.myapp on the device
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action app-launch --app-id org.example.myapp
```

This launches the app via `sdb shell app_launcher -s <app_id>` and returns the app's PID.

### Step B — Start Background Log Collection

**Say this:**
```
Start collecting logs for my app org.example.myapp
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action dlog-collect --app-id org.example.myapp
```

This starts collecting dlog filtered by the app's PID as a **background process**. The app **must be running** — the tool looks up the PID via `pgrep`. Logs are continuously written to `$TMPDIR/tizen-dlog-analyzer/app/<app-id>/<app-id>.hot.log`.

### Step C — Ask User to Choose: Continue Collecting or Analyze Now

The agent tells the user: *"Log collection has started in the background. Please browse the app and try to reproduce the issue."*

After the user has tested the app enough, the agent presents two options:
1. **Continue collecting** — keep the background collection running while the user continues testing the app
2. **Stop and analyze now** — stop the collection (`stop-collect`) and immediately run `error-analyze` to analyze the logs collected so far

**Do NOT poll or loop.** Wait for the user's choice.

### Step D — Proceed Based on User's Choice

**If the user selects "Stop and analyze now":**

**Say this:**
```
Stop collecting and analyze my app's logs for errors
```

**tizen-cli commands:**
```bash
# Stop the background collection
tizen-cli tizen-sdk dlog-analyzer --action stop-collect

# Analyze the collected logs for E/F priority errors
tizen-cli tizen-sdk dlog-analyzer --action error-analyze --app-id org.example.myapp
# Or: --format summary (summary lines only)
# Or: --format details (detail entries only)
# Or: omit --format for both
```

This analyzes the collected logs for Error (E) and Fatal (F) priority entries. It deduplicates errors by tag+message with an occurrence count. Output is plain text (token-efficient, no Rich tables): the summary shows one line per finding (`N. Module=TAG | Repeated=X | Message: ...`), and the details section shows `[Error N]` blocks with `Full log:` lines.

The agent reads the `error-analyze` output and identifies the root cause, then applies a fix.

**If the user selects "Continue collecting":**

The background collection continues running. Wait for the user to complete additional testing and request "Stop and analyze now" again.

**If the user didn't find any problems:**

```bash
# Stop the background collection and clean up
tizen-cli tizen-sdk dlog-analyzer --action stop-collect
```

### Step E — Terminate the App

**Say this:**
```
Terminate my app org.example.myapp
```

**tizen-cli command:**
```bash
tizen-cli tizen-sdk dlog-analyzer --action app-terminate --app-id org.example.myapp
```

---

## Quick Reference: All tizen-cli Commands

| Step | Command |
|------|---------|
| Launch emulator | `tizen-cli tizen-sdk launch-emulator` |
| Start monitoring | `tizen-cli tizen-sdk dlog-analyzer --action start --subcommand start-monitoring` |
| Build app | `tizen-cli tizen-sdk build-project --project-dir <path> --config Debug` |
| Install & run app | `tizen-cli tizen-sdk install-app --package <path> --run` |
| Check logs | `tizen-cli tizen-sdk dlog-analyzer --action check` |
| Check status | `tizen-cli tizen-sdk dlog-analyzer --action status` |
| Stop monitoring | `tizen-cli tizen-sdk dlog-analyzer --action stop` |
| Launch app | `tizen-cli tizen-sdk dlog-analyzer --action app-launch --app-id <id>` |
| Collect app logs | `tizen-cli tizen-sdk dlog-analyzer --action dlog-collect --app-id <id>` |
| Stop app log collection | `tizen-cli tizen-sdk dlog-analyzer --action stop-collect` |
| Analyze app errors | `tizen-cli tizen-sdk dlog-analyzer --action error-analyze --app-id <id> [--format summary\|details]` |
| Terminate app | `tizen-cli tizen-sdk dlog-analyzer --action app-terminate --app-id <id>` |


---

## Tips

- **Start monitoring before launching the app** — this ensures startup logs are captured.
- **Only one instance at a time** — if already running, `start` returns an `already_running` error. Stop first.
- **The background process is detached** — it survives even if the agent session ends. Always `stop` when done.
- **The binary is platform-specific** — the setup script copies only the matching `linux/`, `macos/`, or `windows/` binary.
- **Loop as many times as needed** — the apply-fix → rebuild → reinstall → re-check cycle can repeat until the crash is resolved.
