# Scenario Guide: Web App Debugging (RWI/CDP) End to End

English | [한국어](scenario-webapp-debug-walkthrough.md)

This document walks you through the **full Tizen web app (.wgt) remote-debugging flow** with the `tizen-sdk-skills` plugin: "SDK install → emulator → web app creation → build → install → RWI/CDP debugging → Chrome DevTools connection".

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> Web apps run inside the web runtime (a Chromium-based engine), so they are debugged with **RWI (Remote Web Inspector) + CDP (Chrome DevTools Protocol)**, not gdb/netcoredbg. The responsible skill is `tizen-webapp-debug`.

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the matching script.
- **curl on the host**: used to verify the CDP endpoint (bundled with Windows 10+/macOS/most Linux distros).
- **Example goal**:
  - App type: **WebApp**
  - Template: **BasicUI (Web)**
  - App name: **MyWebApp** (any name works)

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create & launch an emulator | `tizen-device-manager` |
| 3 | Create a web app from a template | `tizen-create-project` |
| 4 | Build the app (`.wgt` packaging) | `tizen-build-project` |
| 5 | Install the app | `tizen-install-app` |
| 6 | Web app debug setup (RWI/CDP) | `tizen-webapp-debug` |
| 7 | Connect Chrome DevTools | (you) |

---

## Step 1 — Install the Tizen SDK

Install the development environment first. Skip if already installed.

**Say this:**
```
Install the Tizen SDK
```

**Success check:** an "installation complete" message with the number of installed packages.

---

## Step 2 — Create & Launch an Emulator

If you have no physical device, create and boot an emulator.

**Say this:**
```
Create an emulator and launch it
```

**Success check:** a connected device is printed as `DEVICE_SERIAL=...`.

> ⚠️ RWI is supported on emulator/dev images. Some production images may refuse the web-debug launch.

---

## Step 3 — Create a Web App from a Template

Create a new app from the WebApp **BasicUI** template with your chosen name.

**Say this:**
```
Create a web app named MyWebApp from the BasicUI template
```

**Success check:** a project folder is created containing `config.xml`, `index.html`, etc.
The `<tizen:application id="...">` value in `config.xml` is the **app ID** used later (e.g. `abcDEF1234.MyWebApp`).

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

**Success check:** an install-success message; the app appears in the emulator's app list.

---

## Step 6 — Web App Debug Setup (RWI/CDP)

Relaunch the installed web app in debug mode and prepare the CDP endpoint.
Internally this runs `app_launcher -w -s <app_id>` → parses the RWI port → `sdb forward tcp:9222 tcp:<rwi-port>` → verifies `/json/version` and `/json/list` — all automatically.

**Say this:**
```
Debug the web app I just installed
```

**Success check:** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "app_id": "abcDEF1234.MyWebApp",
    "app_pid": 1234,
    "device_port": 45678,
    "host_port": 9222,
    "port_forwarded": true,
    "cdp_endpoint": "http://127.0.0.1:9222",
    "browser": "Chrome/...",
    "pages": [
      {
        "id": "...",
        "type": "page",
        "title": "MyWebApp",
        "url": "file:///.../index.html",
        "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/...",
        "devtoolsFrontendUrl": "..."
      }
    ],
    "connect": {
      "devtools": "http://127.0.0.1:9222/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/..."
    }
  }
}
```

> 💡 The RWI session and the port forward stay alive after setup — connect/reconnect anytime while the app runs. If the app is restarted, run this step again.

---

## Step 7 — Connect Chrome DevTools

1. Open the `connect.devtools` link from the result envelope in Chrome.
   (e.g. `http://127.0.0.1:9222/devtools/inspector.html?ws=127.0.0.1:9222/devtools/page/<page-id>`)
2. Debug the web app live with the Elements/Console/Sources/Network panels.

**Success check:** the web app's DOM appears in the Elements panel, and you can run JavaScript from the Console.

---

## E2E Verification Checklist

Verify these items during a manual E2E test.

### Happy path

| # | Check | Expected |
|---|-------|----------|
| 1 | Step 6 envelope | `status: "success"`, `cdp_endpoint`/`pages[]`/`connect.devtools` present, exit code `0` |
| 2 | `curl http://127.0.0.1:9222/json/version` | JSON response with a `Browser` field |
| 3 | `curl http://127.0.0.1:9222/json/list` | JSON array containing the app's page |
| 4 | Reconnect after the script exits | forward persists — checks 2 & 3 keep succeeding |
| 5 | DevTools connection (step 7) | web app DOM visible in the Elements panel |
| 6 | DevTools Console | JavaScript evaluates and returns a result |

### Failure paths (error mapping)

| # | Scenario | Expected |
|---|----------|----------|
| 7 | No device/emulator | `error_category: "device_not_found"` — routed to `tizen-device-manager` |
| 8 | Native/.NET app ID (e.g. a `.tpk` app) | `error_category: "invalid_parameters"` — "is not a Web app", routed to `tizen-gdb-debug`/`tizen-dotnet-debug` |
| 9 | Host port busy (e.g. 9222 held by another process) | `error_category: "io_error"` — "Port forward failed", retry with another `--port` |
| 10 | Image without RWI support / app fails debug launch | `error_category: "inspector_not_available"` — "No RWI port in app_launcher output" |
| 11 | Forward OK but CDP silent (timeout) | `error_category: "inspector_not_available"` — "CDP endpoint not reachable" |
| 12 | App ID not installed | same as #8 (absent from `pkgcmd -l` → rejected by the wgt guard, with install guidance) |

### Running the CLI directly (verification without an agent)

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/webapp-debug-cli.js 2>/dev/null | sort -V | tail -1) || true
node "$CLI" --app-id abcDEF1234.MyWebApp --port 9222 --timeout 30
```

Exit code: `0` = success envelope, `1` = failure/error envelope.

---

## All at Once (copy-paste prompts)

Enter these in order:

```
1) Install the Tizen SDK
2) Create an emulator and launch it
3) Create a web app named MyWebApp from the BasicUI template
4) Build the app I just created
5) Install the app I just built
6) Debug the web app I just installed
```

Finally, open the returned `connect.devtools` direct link in Chrome — done.

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (12. tizen-webapp-debug)
- Native app scenario: [scenario-native-app-walkthrough.en.md](../project/scenario-native-app-walkthrough.en.md)

- Native app debugging (GDB) scenario: [scenario-native-debug-walkthrough.en.md](scenario-native-debug-walkthrough.en.md)
- .NET app debugging (netcoredbg) scenario: [scenario-dotnet-debug-walkthrough.en.md](scenario-dotnet-debug-walkthrough.en.md)
