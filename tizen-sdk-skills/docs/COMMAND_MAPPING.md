# Command-Spec ↔ Envelope `command` Label Mapping

This document describes the `command` label that core functions write into the
`command` field of the Standard JSON Envelope, and how it relates to the
tizen-cli command-spec names.

## Overview

Each tizen-cli command-spec passes a `command` label to the core function.
The core function sets it in the inner envelope's `command` field, and
`envelope-adapter.ts` (`toOuterEnvelope`) propagates it to the outer envelope.

The label follows one rule: **`tizen-sdk <command-spec name>`**, optionally
followed by a sub-action when a single command-spec fans out into several core
functions (`tizen-sdk certificate-manager list-profiles`,
`tizen-sdk emulator-manager list-vm`, `tizen-sdk dlog-analyzer start`). The
label therefore matches the tizen-cli dispatch path (`tizen-cli tizen-sdk
<command>`) token for token; it carries no option values.

> History: until the 2026-09 plugin rename the labels used the older nested
> vocabulary of the previous `tizen-sdk` plugin (`tizen-sdk sdk init`,
> `tizen-sdk project build`, `tizen-sdk cert list-profiles`). Those labels were
> migrated to the flat form documented here; nothing else about the field changed.

The command line the user actually typed is reported separately, in
`user_command` (e.g. `tizen-cli tizen-sdk create-emulator --vm-name
myEmul --size 1080`). It is built from argv at the two entry points — the
plugin (`envelope-adapter.ts`) and the standalone runners (`cli-runner.js`) —
with `--password`-style values redacted. See
`docs/envelope/ENVELOPE_USAGE_GUIDE.md`.

Labels used only inside the library, without a tizen-cli command-spec, keep the
same shape: `tizen-sdk sdk-status` (internal SDK status probe),
`tizen-sdk device-manager list` / `select` (device response formatters).

## Mapping Table

| Command-Spec Name                                | Envelope `command` Label                            | Core Function                               |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------- |
| `sdk-init`                                       | `tizen-sdk sdk-init`                                | `sdk.initSdk`                               |
| `sdk-install`                                    | `tizen-sdk sdk-install`                             | `sdk.installSdk`                            |
| `sdk-install-custom-repo`                        | `tizen-sdk sdk-install-custom-repo`                 | `sdk.installSdkFromRepo`                    |
| `validate-repo-url`                              | `tizen-sdk validate-repo-url`                       | `sdk.validateRepoUrl`                       |
| `tv-sdk-install`                                 | `tizen-sdk tv-sdk-install`                          | `sdk.installTvSdk`                          |
| `tv-sdk-install-from-zip`                        | `tizen-sdk tv-sdk-install-from-zip`                 | `sdk.installTvSdkFromZip`                   |
| `update-package`                                 | `tizen-sdk update-package`                          | `sdk.updatePackage`                         |
| `sdk-repo-info`                                  | `tizen-sdk sdk-repo-info`                           | `sdk.getRepoInfo`                           |
| `download-emulator-package`                      | `tizen-sdk download-emulator-package`               | `sdk.downloadEmulatorPackage`               |
| `dotnet-setup`                                   | `tizen-sdk dotnet-setup`                            | `dotnet.setupDotnet`                        |
| `check-node`                                     | `tizen-sdk check-node`                              | `preflight.checkNode`                       |
| `check-disk-space`                               | `tizen-sdk check-disk-space`                        | `preflight.checkDiskSpace`                  |
| `create-project`                                 | `tizen-sdk create-project`                          | `project.createProject`                     |
| `project-delete`                                 | `tizen-sdk project-delete`                          | `project.deleteProject`                     |
| `list-templates`                                 | `tizen-sdk list-templates`                          | `project.listTemplates`                     |
| `build-project`                                  | `tizen-sdk build-project`                           | `project.buildProject`                      |
| `create-emulator`                                | `tizen-sdk create-emulator`                         | `emulator.createEmulator`                   |
| `launch-emulator`                                | `tizen-sdk launch-emulator`                         | `emulator.launchEmulator`                   |
| `emulator-manager`                               | `tizen-sdk emulator-manager <action>`               | `emulator.manageEmulator`                   |
| `device-manager`                                 | `tizen-sdk device-manager` (`stop` action appends ` stop`) | `device.manageDevice`                |
| `install-app`                                    | `tizen-sdk install-app`                             | `project.installApp`                        |
| `sdb-helper`                                     | `tizen-sdk sdb-helper`                              | `sdbHelper.runSdbCommand`                   |
| `screenshot`                                     | `tizen-sdk screenshot`                              | `screenshot.captureScreenshot`              |
| `file-transfer`                                  | `tizen-sdk file-transfer`                           | `fileTransfer.fileTransfer`                 |
| `remote-device` (scan)                           | `tizen-sdk remote-device scan`                      | `remoteDevice.scanRemoteDevices`            |
| `remote-device` (connect)                        | `tizen-sdk remote-device connect`                   | `remoteDevice.connectRemoteDevice`          |
| `remote-device` (disconnect)                     | `tizen-sdk remote-device disconnect`                | `remoteDevice.disconnectRemoteDevice`       |
| `remote-device` (list)                           | `tizen-sdk remote-device list`                      | `remoteDevice.listRemoteDevices`            |
| `remote-device` (add)                            | `tizen-sdk remote-device add`                       | `remoteDevice.addRemoteDeviceToList`        |
| `remote-device` (remove)                         | `tizen-sdk remote-device remove`                    | `remoteDevice.removeRemoteDeviceFromList`   |
| `remote-device` (edit)                           | `tizen-sdk remote-device edit`                      | `remoteDevice.editRemoteDeviceInList`       |
| `remote-device` (list-saved)                     | `tizen-sdk remote-device list-saved`                | `remoteDevice.listSavedRemoteDevices`       |
| `gdb-debug`                                      | `tizen-sdk gdb-debug`                               | `debug.setupGdbDebug`                       |
| `dotnet-debug`                                   | `tizen-sdk dotnet-debug`                            | `debug.setupDotnetDebug`                    |
| `webapp-debug`                                   | `tizen-sdk webapp-debug`                            | `webapp-debug.setupWebappDebug`             |
| `playwright-test` (run)                          | `tizen-sdk playwright-test run`                     | `playwright-test.runPlaywrightTest`         |
| `playwright-test` (--scaffold)                   | `tizen-sdk playwright-test scaffold`                | `playwright-test.scaffoldPlaywrightTest`    |
| `certificate-manager` (generate-author)          | `tizen-sdk certificate-manager generate-author`     | `certificate.generateAuthorCertificate`     |
| `certificate-manager` (list-distributors)        | `tizen-sdk certificate-manager list-distributors`   | `certificate.listDistributorCertificates`   |
| `certificate-manager` (create-profile)           | `tizen-sdk certificate-manager create-profile`      | `certificate.createSigningProfile`          |
| `certificate-manager` (list-profiles)            | `tizen-sdk certificate-manager list-profiles`       | `certificate.listSigningProfiles`           |
| `certificate-manager` (set-active-profile)       | `tizen-sdk certificate-manager set-active-profile`  | `certificate.setActiveSigningProfile`       |
| `certificate-manager` (remove-profile)           | `tizen-sdk certificate-manager remove-profile`      | `certificate.removeSigningProfile`          |
| `certificate-manager` (set-distributor2)         | `tizen-sdk certificate-manager set-distributor2`    | `certificate.setSigningProfileDistributor2` |
| `certificate-manager` (import-certificate)       | `tizen-sdk certificate-manager import-certificate`  | `certificate.importCertificate`             |
| `certificate-manager` (inspect-certificate)      | `tizen-sdk certificate-manager inspect-certificate` | `certificate.inspectCertificate`            |
| `certificate-manager` (get-sdk-data-path)        | `tizen-sdk certificate-manager get-sdk-data-path`   | `certificate.getCertificateSdkDataPath`     |
| `certificate-manager` (Samsung / DUID actions)   | `tizen-sdk certificate-manager <action>`            | `samsung-cert.*`, `certificate.*`           |
| `platform-install`                               | `tizen-sdk platform-install`                        | `sdk.installPlatform`                       |
| `download-mobile-platform`                       | `tizen-sdk download-mobile-platform`                | `sdk.downloadMobilePlatform`                |
| `install-rootstrap`                              | `tizen-sdk install-rootstrap`                       | `sdk.installRootstrap`                      |
| `dlog-analyzer` (start)                          | `tizen-sdk dlog-analyzer start`                     | `sdkCommands.startDlogAnalyzer`             |
| `dlog-analyzer` (stop)                           | `tizen-sdk dlog-analyzer stop`                      | `sdkCommands.stopDlogAnalyzer`              |
| `dlog-analyzer` (check)                          | `tizen-sdk dlog-analyzer check`                     | `sdkCommands.checkDlogAnalyzer`             |
| `dlog-analyzer` (status)                         | `tizen-sdk dlog-analyzer status`                    | `sdkCommands.statusDlogAnalyzer`            |
| `dlog-analyzer` (app-launch)                     | `tizen-sdk dlog-analyzer app-launch`                | `sdkCommands.launchApp`                     |
| `dlog-analyzer` (app-terminate)                  | `tizen-sdk dlog-analyzer app-terminate`             | `sdkCommands.terminateApp`                  |
| `dlog-analyzer` (dlog-collect)                   | `tizen-sdk dlog-analyzer dlog-collect`              | `sdkCommands.collectAppLogs`                |
| `dlog-analyzer` (stop-collect)                   | `tizen-sdk dlog-analyzer stop-collect`              | `sdkCommands.stopCollectAppLogs`            |
| `dlog-analyzer` (error-analyze)                  | `tizen-sdk dlog-analyzer error-analyze`             | `sdkCommands.analyzeErrors`                 |

## How It Works

1. **command-specs** (`src/command-specs/*.ts`): Each handler passes the
   label as the last argument to the core function.
2. **Core functions** (`common/lib/core/*.js`): Each function accepts a
   `command` parameter (default: the same label) and sets it in the inner
   envelope via `Envelope` or `formatError`.
3. **envelope-adapter.ts** (`toOuterEnvelope`): The inner envelope's `command`
   field takes priority over the synthesized `tizen-sdk <command>`. Because
   both now follow the same rule, the two agree for every command-spec; the
   inner label only adds the sub-action suffix where one exists.
4. **CLI runners** (`common/lib/cli/*-cli.js`): Pass the same label directly
   to the core function via `runCli()`.

When adding a command, name the label after the command-spec (`tizen-sdk
<command-spec>`), and append a sub-action only when the spec dispatches to
more than one core function. Do not reintroduce the old nested vocabulary.

## Example

```bash
$ tizen-cli tizen-sdk sdk-init --sdk-path /home/user/tizen-sdk
```

Output envelope:

```json
{
  "status": "success",
  "result": {
    "sdk_path": "/home/user/tizen-sdk",
    "config_file": "/home/user/.tizen.sdk.path.config"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk sdk-init",
  "user_command": "tizen-cli tizen-sdk sdk-init --sdk-path /home/user/tizen-sdk",
  "duration_ms": 0
}
```

`command` is the label (`tizen-sdk sdk-init`, no option values); `user_command`
is the reproducible command line the user typed.
