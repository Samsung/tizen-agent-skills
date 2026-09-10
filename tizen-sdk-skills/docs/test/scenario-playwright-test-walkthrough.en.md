# Scenario Guide: Automated Web App Testing with Playwright, End to End

This document walks you through **testing a Tizen Web app (.wgt) with Playwright in one complete flow** using the `tizen-sdk-skills` plugin: "SDK install → emulator → web app creation → build → install → test scaffolding → Playwright install → test run".

At each step, **just tell Claude in natural language** and the corresponding agent runs automatically. There is no need to memorize commands.

> Web apps run inside the web runtime (a Chromium-based engine), so Playwright **attaches over CDP (Chrome DevTools Protocol)** to test them. The skill in charge is `tizen-playwright-test`; the CDP setup internally reuses the `tizen-webapp-debug` flow. If your goal is interactive debugging (DevTools), see [scenario-webapp-debug-walkthrough.en.md](../debug/scenario-webapp-debug-walkthrough.en.md) instead.

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Installing the Cline plugin" in [README.en.md](../README.en.md).)
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs things the right way.
- **Node.js 20+ required**: needed to run Playwright (the test executes via `node <test-file>`).
- **Playwright is installed into the TEST PROJECT**: never into the plugin — one `npm install playwright` in the test project directory is all it takes (Step 7).
- **Goal for this walkthrough (example)**:
  - App type: **WebApp**
  - Template: **BasicUI (Web)**
  - App name: **MyWebApp** (feel free to use your own)
  - Test project: the **`~/tizen-playwright-test`** folder (a **fixed path** under the user home — Windows: `%USERPROFILE%\tizen-playwright-test`. Create the folder before scaffolding if it does not exist)

> 💡 Copy the "Say this" example at each step and paste it as-is.

---

## The Whole Flow at a Glance

| Step | Task | Agent in charge |
|------|------|-----------------|
| 1 | Install the Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch an emulator | `tizen-device-manager` |
| 3 | Create a web app from a template (pick a name) | `tizen-create-project` |
| 4 | Build the app (`.wgt` packaging) | `tizen-build-project` |
| 5 | Install the app | `tizen-install-app` |
| 6 | Scaffold the test file | `tizen-playwright-test` (`--scaffold`) |
| 7 | Install Playwright into the test project | (user or agent) |
| 8 | Run the test (CDP setup + node spawn) | `tizen-playwright-test` |

---

## Step 1 — Install the Tizen SDK

First, install the development environment (SDK). Skip if it is already installed.

**Say this:**
```
Install the Tizen SDK
```

**Success check:** an "installation complete" message with the number of installed packages.

---

## Step 2 — Create and Launch an Emulator

If you have no physical device, create and boot an emulator.

**Say this:**
```
Create an emulator and launch it
```

**Success check:** the connected device is printed as `DEVICE_SERIAL=...`.

> ⚠️ RWI (Remote Web Inspector) is supported on emulator/dev images. Some production images may refuse the web-debug launch.

---

## Step 3 — Create a Web App from a Template (Pick a Name)

Create a new app from the **BasicUI** WebApp template and give it a name.

**Say this:**
```
Create a web app named MyWebApp from the BasicUI template
```

**Success check:** the project folder is created with `config.xml`, `index.html`, etc.
The `<tizen:application id="...">` value in `config.xml` is the **app ID** used in later steps (e.g. `abcDEF1234.MyWebApp`).

> 💡 In the BasicUI template, clicking `#main` toggles `#content-text` between `Basic` and `Tizen` — Step 9 verifies exactly this behavior with a test.

---

## Step 4 — Build the App

Build the project into a `.wgt` package.

**Say this:**
```
Build the app I just created
```

**Success check:** the **`.wgt` package** appears in the project's build directory; the path is printed.

---

## Step 5 — Install the App

Install the built `.wgt` on the emulator (or device).

**Say this:**
```
Install the app I just built
```

**Success check:** an install-success message, and the app appears in the emulator's app list.

---

## Step 6 — Scaffold the Test File

Generate a starter test file into the test project folder. No device is needed for this step.

**Say this:**
```
Scaffold a playwright test for MyWebApp into the tizen-playwright-test folder under my home directory
```

**Success check:** the envelope's `result.created` lists two files:

- `~/tizen-playwright-test/tizen-playwright.test.js` — the starter test (attach-only pattern, failure screenshot, `TEST_RESULT:` marker)
- `~/tizen-playwright-test/package.json` — a minimal manifest declaring the `playwright` dependency (an existing package.json is left untouched)

**Rules the scaffolded template follows (keep them when you edit it):**

- **Attach-only**: `connectOverCDP` → `contexts()[0].pages()[0]` — it never calls `page.goto()`/`newPage()`. The Tizen web runtime owns the single page; navigating kills the app UI.
- **Listeners registered early**: `page.on('console')`/`pageerror` are attached before any interaction, so no log is missed.
- **Real exit codes**: a failure counter → `process.exit(1)` instead of `console.assert` — this is what the runner uses to decide pass/fail.
- **Endpoint from env**: it reads the `TIZEN_CDP_ENDPOINT` environment variable (injected by the runner), falling back to `http://127.0.0.1:9222` only when absent.

---

## Step 7 — Install Playwright into the Test Project

**Say this:**
```
Install playwright in the tizen-playwright-test folder under my home directory
```

Or directly:

```bash
cd ~/tizen-playwright-test && npm install playwright
```

**Success check:** `~/tizen-playwright-test/node_modules/playwright` exists. No browser download is needed — `connectOverCDP` talks to the device's web runtime, so Playwright's bundled Chromium is never used.

> 🔴 **Never install into the plugin cache (`~/.claude/plugins/...`).** Playwright always resolves from the test project's `node_modules`.

---

## Step 8 — Run the Test

Relaunch the app in debug mode, set up CDP, then execute the test file.
Internally this runs `app_launcher -w -s <appId>` → RWI port parsing → `sdb forward` → CDP verification → spawn `node ~/tizen-playwright-test/tizen-playwright.test.js` (with `TIZEN_CDP_ENDPOINT`/`TIZEN_CDP_PORT`/`TIZEN_APP_ID` in the environment), all automatically.

**Say this:**
```
Test MyWebApp with the playwright test in the tizen-playwright-test folder under my home directory
```

**Success check:** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "app_id": "abcDEF1234.MyWebApp",
    "test_file": ".../tizen-playwright-test/tizen-playwright.test.js",
    "project_dir": ".../tizen-playwright-test",
    "cdp_endpoint": "http://127.0.0.1:9222",
    "app_pid": 1234,
    "exit_code": 0,
    "passed": true,
    "summary": { "result": "pass", "total": 2, "failed": 0, "passed": 2 },
    "output_tail": [
      "PASS app page has a body",
      "PASS app title is not empty",
      "TEST_RESULT: pass total=2 failed=0"
    ],
    "note": "The RWI session and the port forward stay alive — rerun with --no-setup to skip the app relaunch while the app keeps running."
  }
}
```

> 💡 The RWI session and the port forward stay alive after the run — while the app keeps running, rerun with `--no-setup` to skip the app relaunch and just run the test again. If the app was **restarted**, the RWI port is invalidated — run WITHOUT `--no-setup`.

---

## Step 9 — Write App-Specific Tests (Optional)

Fill in the `── Your tests ──` section of `~/tizen-playwright-test/tizen-playwright.test.js` with the app's real selectors. For the BasicUI template:

```javascript
await page.locator('#main').click();
await expect('text toggled to Tizen', async () =>
  (await page.locator('#content-text').textContent()) === 'Tizen');
await page.locator('#main').click();
await expect('text toggled back to Basic', async () =>
  (await page.locator('#content-text').textContent()) === 'Basic');
```

Then run the Step 8 prompt again. If an assertion fails, the envelope becomes `test_failed`, the FAIL lines show up in `output_tail`, and a `test-failure.png` screenshot lands in the project folder.

---

## E2E Verification Checklist

Verify the items below during manual E2E testing.

### Happy paths

| # | Check | Expected result |
|---|-------|-----------------|
| 1 | Step 6 scaffold envelope | `status: "success"`, `created[]` has the test file + package.json, exit code `0` |
| 2 | Re-run the scaffold (without `--force`) | `invalid_parameters` — mentions "--force to overwrite" |
| 3 | Step 8 run envelope | `status: "success"`, `passed: true`, `summary.failed: 0`, exit code `0` |
| 4 | Test child receives the env | app console logs (`[app console:...]`) appear in `output_tail` (proof the attach worked) |
| 5 | Rerun with `--no-setup` while the app keeps running | test runs immediately without an app relaunch, succeeds |
| 6 | Add a deliberately wrong assertion and run | `error_category: "test_failed"`, FAIL lines in `output_tail`, `test-failure.png` created |

### Failure paths (error mapping)

| # | Scenario | Expected result |
|---|----------|-----------------|
| 7 | Playwright not installed in the test project | `error_category: "dependency_missing"` — suggested_fix says `npm install playwright` |
| 8 | No test file (run before scaffolding) | `error_category: "invalid_parameters"` — suggests `--scaffold` |
| 9 | No device/emulator | `error_category: "device_not_found"` — routes to `tizen-device-manager` (the setup envelope is propagated as-is) |
| 10 | Run with a Native/.NET app ID (e.g. a `.tpk` app) | `error_category: "invalid_parameters"` — "is not a Web app", routes to `tizen-gdb-debug`/`tizen-dotnet-debug` |
| 11 | Run with `--no-setup` after the app restarted | `error_category: "inspector_not_available"` — endpoint not answering, advises dropping `--no-setup` |
| 12 | Test never exits (missing `process.exit`, etc.) | killed at `--timeout` — `error_category: "test_timeout"` |
| 13 | Image without RWI support | `error_category: "inspector_not_available"` — "No RWI port in app_launcher output" (from the setup phase) |

### Running the CLI directly (verifying without the agent)

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/playwright-test-cli.js 2>/dev/null | sort -V | tail -1) || true

# 0) Create the fixed test project folder (once)
mkdir -p "$HOME/tizen-playwright-test"

# 1) Scaffold (no device needed)
node "$CLI" --scaffold --project-dir "$HOME/tizen-playwright-test" --app-id abcDEF1234.MyWebApp

# 2) Install the dependency
cd "$HOME/tizen-playwright-test" && npm install playwright && cd -

# 3) Run (CDP setup + test)
node "$CLI" --app-id abcDEF1234.MyWebApp --project-dir "$HOME/tizen-playwright-test"

# 4) Quick rerun while the app keeps running
node "$CLI" --app-id abcDEF1234.MyWebApp --project-dir "$HOME/tizen-playwright-test" --no-setup
```

From the tizen-cli harness:

```
tizen-cli tizen-sdk playwright-test --app-id abcDEF1234.MyWebApp --project-dir ~/tizen-playwright-test
```

Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## Follow Along in One Go (Copy-Paste Prompts)

Enter these in order:

```
1) Install the Tizen SDK
2) Create an emulator and launch it
3) Create a web app named MyWebApp from the BasicUI template
4) Build the app I just created
5) Install the app I just built
6) Scaffold a playwright test for MyWebApp into the tizen-playwright-test folder under my home directory
7) Install playwright in the tizen-playwright-test folder under my home directory
8) Test MyWebApp with the playwright test in the tizen-playwright-test folder under my home directory
```

You are done when the final envelope has `result.passed` = `true` and `summary.failed` = `0`.

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (19. tizen-playwright-test)
- Interactive web app debugging scenario: [scenario-webapp-debug-walkthrough.en.md](../debug/scenario-webapp-debug-walkthrough.en.md)
