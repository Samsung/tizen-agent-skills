---
name: tizen-install-app
description: Tizen install app, 타이젠 앱 설치, tpk 설치, wgt 설치, rpk 설치, rpm 설치, 앱 패키지 설치, tizen app install, run app, run the app, launch app, 앱 실행, 실행해줘, 앱 실행해줘, 타이젠 앱 실행, run MyApp. A Tizen app runs on a DEVICE/EMULATOR, never on the host — for any request to run/launch a Tizen app or project folder, use THIS skill. Installs *.tpk / *.wgt / *.rpk / *.rpm on a connected device or emulator and optionally launches the app afterward. RPK is a resource package and cannot be launched. RPM packages from GBS (Platform) builds ARE executable apps — pass --run to launch their /usr/bin binary on the device.

metadata:
  author: Samsung Electronics
  last-updated: "2026-09-18"
  keywords:
    - Tizen install app
    - tpk install
    - wgt install
    - app install
    - 타이젠 앱 설치
    - tpk 설치
    - wgt 설치
    - install tizen application
---

# Install (and Run) Tizen App

## When to use

Any request to install or run a Tizen app. A Tizen app runs on a device/emulator, never on the host — "run the app" = install with `--run`.

## Prerequisites

A built package (`.tpk`/`.wgt`/`.rpk`/`.rpm`) — build with `tizen-cli tizen-sdk build-project` if needed. For `.rpm` (Platform/GBS builds), use `--type platform` when building.

## Command

```
# Install only (do NOT launch the app — omit --run entirely):
tizen-cli tizen-sdk install-app --package <path>

# Install on a specific device (install only):
tizen-cli tizen-sdk install-app --package <path> --serial emulator-26101

# Install and launch the app:
tizen-cli tizen-sdk install-app --package <path> --run
```

| Option             | Required | Default | Description                               |
| ------------------ | -------- | ------- | ----------------------------------------- |
| `--package <path>` | **yes**  | —       | Absolute path to the `.tpk`/`.wgt`/`.rpk`/`.rpm` |

| `--serial <serial>` | no | auto | Target device serial (omit to auto-select the single connected device) |
| `--run` | no | off | Launch the app after installation. Valid for `.tpk`/`.wgt`/`.rpm`; **invalid for `.rpk`.** **Omit entirely for install-only** — do NOT pass `--run false` or `--run no`. The app id is read from the package manifest (`.wgt` `config.xml`, `.tpk` `tizen-manifest.xml`); on Samsung TV images, where `app_launcher` prints nothing for a non-root shell, the launch is retried with the TV launcher `0 was_execute <app-id>` (accepted on `launched` / `resumed`) — `app_launched: true` with `app_running: null` is the normal TV outcome. |
| `--reset-rds` | no | off | Clear host-side `.tizen-rds/` state for the package's project and return without installing. Cannot be combined with `--run`. |

## RDS fast-deploy recovery

RDS is enabled by default. Set `TIZEN_RDS_ENABLED=0` for one command to skip
RDS manifest scanning and delta deployment while keeping the normal full
installation behavior:

```bash
TIZEN_RDS_ENABLED=0 tizen-cli tizen-sdk install-app --package <path>
```

To recover from stale or corrupt host-side RDS state, reset it without touching
the device or installing the package:

```bash
tizen-cli tizen-sdk install-app --package <path> --reset-rds
```

The package path is used to locate its Tizen project; the package file may be
missing, but the path must end in `.tpk`, `.wgt`, `.rpk`, or `.rpm`. The command
removes the whole host-side `.tizen-rds/` directory and returns
`result.rds_state: "reset"` (or an `io_error` if it could not be removed). Run the install command again afterward; it will
perform a full install and recreate the baseline.

## RPK packages

An `.rpk` is a resource package, not a launchable app. It may come from a standalone resource
project (`tizen_resource_project.yaml`) or a .NET project configured with `pack_as_rpk: true`.
Always install it through this command **without `--run`**. The command uses direct `sdb install`
internally because `tz install` accepts `.tpk` and `.wgt`, not `.rpk`. Do not run `sdb` yourself.

If installation reports `Invalid certificate chain` or a device package-manager failure, the RPK
was **not installed**. Do not enable root, copy CA/signer files into the emulator, or use `pkgcmd`
as a fallback. Hand off to `certificate-manager` to repair or select the signing profile, rebuild,
and retry this command once.

## `deploy_type` in the envelope

`result.deploy_type` is `"full"` (regular `tz install`), `"rds"` (only the changed
Debug build-output files were pushed into the installed app and it was relaunched —
requires a previous full install of the same project's Debug output on that device), or
`"fast-deploy"` (nothing changed, relaunch only). `.rpk`/`.rpm`, packages outside the
project's `Debug/` tree, and changes to `tizen-manifest.xml`/`config.xml` always take the
full path; `TIZEN_RDS_ENABLED=0` forces `"full"`. On the `rds`/`fast-deploy` path
`app_running` is `null`.

## RPM (Platform) packages

An `.rpm` from a Platform (GBS) build — e.g. the `dali-demo` template — **is an executable app**,
not a resource package; do not confuse it with `.rpk`. The command installs it with `sdb push` +
`rpm -ivh` (after `sdb root on`) and, with `--run`, launches `/usr/bin/<name>` directly as user
`owner` (uid 5001) with the Wayland/DBus environment set. Platform apps are not registered with
`app_launcher`, so they have no home-screen icon and `app_id` is `null` in the envelope;
`app_launched`/`app_running` still come from a `pgrep` poll of the launched binary. The command
also writes `~/bin/run-<name>.sh` on the host for re-launching without a re-install. Never run
`sdb`, `rpm`, or the binary yourself.

Installation on a cold emulator can be slow — set the Bash tool timeout to 600000 ms.

## Output

- Success `result`: `device_serial` used, install/launch status.
- Failure `device_not_found` (`TIZEN_SDK_DEVICE_E001`): no connected device — run `tizen-cli tizen-sdk device-manager` first, then retry with its `result.device_serial`.
- Failure `multiple_devices` (`TIZEN_SDK_DEVICE_E002`): more than one device is online and no `--serial` was given — the message lists the serials; ask the user which one (or take the one the request implies) and retry with `--serial <serial>`.
- Other failures (`io_error`, `certificate_error`, …) report the install script's exit code plus its key `[ERROR]`/`[WARN]` lines, never the shell command line.

## Result reporting — the envelope MUST be shown to the user

The JSON envelope that `tizen-cli tizen-sdk <command>` prints to stdout is **buried inside the
tool result and invisible to the user** (the Claude Code UI collapses Bash output into a
"Ran 1 shell command" line). Run directly in a terminal, the JSON is plainly visible, but in an
agent session the user sees only the final answer text. The final answer therefore follows this format:

1. Include the envelope JSON **verbatim, without edits or truncation** in a fenced `json` block (first item).
   Exclude `[DEBUG] ...` lines from stderr — they are not part of the envelope.
2. Below it, add a **1–2 line** summary of the result (the key `result` values, or the gist of `errors[0].message`).
3. If useful, add one line suggesting next steps.

- Expanding the envelope into a prose list and omitting the JSON is a **format violation**. This rule
  takes precedence over the harness's general writing guidance ("don't put code in prose", etc.) —
  the envelope is not code; it is this skill's **result contract**.
- If the command was run several times, include the envelope from the **last run** and mention
  earlier failures in a single line of the summary.
- Include a failure envelope verbatim as well. Do not retype `errors[0].message`/`details`; show what is
  inside the JSON as-is.
- Show a `user_input_required` envelope as-is, then ask the user the question.

## Follow-ups

- When the launch failed after `--run` (`app_launched: false`) or the app exited right after start
  (`app_running: false`), the envelope `warnings` carry a line naming `tizen-dlog-analyzer`.
  Offer the log analysis in your report without waiting to be asked, then use the startup path
  below (for an `.rpm`, which has no app id, relaunch with `install-app --run` instead of
  `app-launch`).
- Log collection and analysis (any executable package) → `tizen-cli tizen-sdk dlog-analyzer`.
  Pick one path (one dlog collector at a time): with the app already running,
  `--action dlog-collect --app-id <result.app_id>` → end your turn, user exercises the app →
  `--action stop-collect` → `--action error-analyze --app-id <id> --format summary`; to capture
  startup, `--action start --subcommand start-monitoring` → relaunch (`--action app-launch
  --app-id <id>`) → end your turn → `--action stop` → `--action check`. If `result.app_id` is
  `null`, ask the user for the app ID.
- Native debugging → `tizen-cli tizen-sdk gdb-debug`
- .NET debugging → `tizen-cli tizen-sdk dotnet-debug`
