# Scenario Guide: Native App End-to-End Walkthrough

English | [한국어](scenario-native-app-walkthrough.md)

This document guides **first-time users** of the `tizen-sdk-skills` plugin through the complete flow: "SDK Install → Emulator → Native Template App Creation → Build → Install → Debugging", step by step.

Each step is triggered by **speaking natural language to Claude** — the corresponding agent handles the rest automatically. No need to memorize commands.

---

## 0. Before You Start

- **Plugin installation check**: The `tizen-sdk-skills` plugin must be installed. (If not, see "Cline Plugin Installation" in [README.en.md](../README.en.md))

- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the appropriate script.
- **Walkthrough target (example)**:
  - App type: **Native**
  - Template: **ServiceApp**
  - App name: **MyApp** (you can use any name)

> 💡 Copy and paste the "Say this:" examples at each step.

---

## Full Flow at a Glance

| Step | Task | Agent |
|------|------|-------|
| 1 | Install Tizen SDK | `tizen-sdk-install` |
| 2 | Create and launch emulator | `tizen-device-manager` |
| 3 | Create native template app (name it) | `tizen-create-project` |
| 4 | Build the app | `tizen-build-project` |
| 5 | Install the app | `tizen-install-app` |
| 6 | Debug the app | `tizen-gdb-debug` |

---

## Step 1 — Install Tizen SDK

First, install the development environment (SDK).

**Say this:**
```
Install the Tizen SDK
```

**Success check:** An "installation complete" message is displayed with the number of installed packages.

---

## Step 2 — Create and Launch Emulator

If you don't have a physical device, create and launch an emulator.

**Say this:**
```
Create and launch an emulator
```

**Success check:** A connected device is shown in `DEVICE_SERIAL=...` format.

---

## Step 3 — Create Native Template App (Name It)

Create a new app using the Native **ServiceApp** template and specify the app name.

**Say this:**
```
Create a native ServiceApp template app named MyApp
```

**Success check:** A project folder is created containing `tizen-manifest.xml`, source files, and build configuration.

---

## Step 4 — Build the App

Build the created project.

**Say this:**
```
Build the app I just created
```

**Success check:** A **`.tpk` package** (build artifact) is created in the project's build directory. The path is displayed.

---

## Step 5 — Install the App

Install the built `.tpk` on the emulator (or device).

**Say this:**
```
Install the built app
```

**Success check:** An installation success message is displayed, and the app appears in the emulator's app list.

---

## Step 6 — Debug the App

Remote-debug the installed native app using GDB.

**Say this:**
```
Debug the app I just installed
```

**Success check:** A GDB prompt appears on the host, connected to the app on the device.

---

## Quick Copy-Paste Prompts

Enter these in order:

```
1) Install the Tizen SDK
2) Create and launch an emulator
3) Create a native ServiceApp template app named MyApp
4) Build the app I just created
5) Install the built app
6) Debug the app I just installed
```

## Related Documents

- Full agent documentation: [README.en.md](../README.en.md)


