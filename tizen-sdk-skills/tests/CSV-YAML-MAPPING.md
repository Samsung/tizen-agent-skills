# CSV ↔ YAML 매핑 테이블

`Updated_Tizen.AI.Plugins.-.Test.Suite.csv` 의 테스트 케이스 ID(`TC-CLI-*`, `TC-P-*`)와
`tests/tc/**/*.yaml` 테스트 케이스 파일의 대응 관계입니다.

> **연결 키**: 각 YAML 파일 최상단 주석의 `# TC-CLI-nnn: <제목>` / `# TC-P-nnn: <제목>` 라인이
> CSV 행의 TC ID와 1:1로 대응합니다. 이 주석이 CSV ↔ YAML 을 잇는 유일한 식별자입니다.

---

## 1. 요약

| 항목 | 값 |
| --- | --- |
| YAML 테스트 케이스 총 개수 | **283** |
| CSV TC ID 가 매핑된 케이스 | **254** |
| ├─ CLI 레인 (`TC-CLI-*`) | 136 |
| └─ Prompt 레인 (`TC-P-*`) | 118 |
| CSV TC ID 가 없는 케이스 (YAML 자체 추가분) | **29** |

### 도메인별 분포

| 도메인 (`tc/<group>/`) | 케이스 수 |
| --- | ---: |
| `device` | 103 |
| `sdk` | 64 |
| `debug` | 32 |
| `project` | 26 |
| `certificate` | 25 |
| `meta` | 16 |
| `test` | 15 |
| `dlog-analyzer` | 2 |

### 티어별 분포

| tier | 케이스 수 |
| --- | ---: |
| `device` | 141 |
| `mutating` | 79 |
| `safe` | 63 |

---

## 2. CLI 레인 매핑 (`TC-CLI-*` → YAML)

| CSV TC ID | CSV 제목 | YAML 파일 | YAML `id` | `command` | `tier` | 레인 |
| --- | --- | --- | --- | --- | --- | --- |
| `TC-CLI-001` | Init with explicit path | [tc/sdk/sdk-init.explicit-path.yaml](tc/sdk/sdk-init.explicit-path.yaml) | `tizen-sdk.sdk-init.explicit-path` | `sdk-init` | safe | CLI |
| `TC-CLI-002` | Init with default path (~/tizen-sdk) | [tc/sdk/sdk-init.happy.yaml](tc/sdk/sdk-init.happy.yaml) | `tizen-sdk.sdk-init.happy` | `sdk-init` | safe | CLI |
| `TC-CLI-003` | Bad flag → failure, invalid_argument | [tc/sdk/sdk-init.bad-flag.yaml](tc/sdk/sdk-init.bad-flag.yaml) | `tizen-sdk.sdk-init.bad-flag` | `sdk-init` | safe | CLI |
| `TC-CLI-004` | Install (default version 10.0) | [tc/sdk/sdk-install.happy.yaml](tc/sdk/sdk-install.happy.yaml) | `tizen-sdk.sdk-install.happy` | `sdk-install` | mutating | CLI |
| `TC-CLI-005` | Install specific version | [tc/sdk/sdk-install.specific-version.yaml](tc/sdk/sdk-install.specific-version.yaml) | `tizen-sdk.sdk-install.specific-version` | `sdk-install` | mutating | CLI |
| `TC-CLI-006` | Force reinstall | [tc/sdk/sdk-install.force.yaml](tc/sdk/sdk-install.force.yaml) | `tizen-sdk.sdk-install.force` | `sdk-install` | mutating | CLI |
| `TC-CLI-007` | Install from custom repo | [tc/sdk/sdk-install.custom-repo.yaml](tc/sdk/sdk-install.custom-repo.yaml) | `tizen-sdk.sdk-install.custom-repo` | `sdk-install` | mutating | CLI |
| `TC-CLI-008` | Install missing required (no version) | [tc/sdk/sdk-install.missing-required.yaml](tc/sdk/sdk-install.missing-required.yaml) | `tizen-sdk.sdk-install.missing-required` | `sdk-install` | safe | CLI |
| `TC-CLI-009` | Install invalid version | [tc/sdk/sdk-install.invalid-version.yaml](tc/sdk/sdk-install.invalid-version.yaml) | `tizen-sdk.sdk-install.invalid-version` | `sdk-install` | safe | CLI |
| `TC-CLI-010` | Install from non-existent repo | [tc/sdk/sdk-install.bad-repo.yaml](tc/sdk/sdk-install.bad-repo.yaml) | `tizen-sdk.sdk-install.bad-repo` | `sdk-install` | safe | CLI |
| `TC-CLI-011` | Disk space on specific path with custom requirement | [tc/sdk/check-disk-space.specific-path.yaml](tc/sdk/check-disk-space.specific-path.yaml) | `tizen-sdk.check-disk-space.specific-path` | `check-disk-space` | safe | CLI |
| `TC-CLI-012` | DotNET Setup | [tc/sdk/dotnet-setup.happy.yaml](tc/sdk/dotnet-setup.happy.yaml) | `tizen-sdk.dotnet-setup.happy` | `dotnet-setup` | mutating | CLI |
| `TC-CLI-013` | Force reinstall workload | [tc/sdk/dotnet-setup.force.yaml](tc/sdk/dotnet-setup.force.yaml) | `tizen-sdk.dotnet-setup.force` | `dotnet-setup` | mutating | CLI |
| `TC-CLI-014` | Specific workload version | [tc/sdk/dotnet-setup.specific-version.yaml](tc/sdk/dotnet-setup.specific-version.yaml) | `tizen-sdk.dotnet-setup.specific-version` | `dotnet-setup` | mutating | CLI |
| `TC-CLI-015` | List all templates | [tc/project/list-templates.happy.yaml](tc/project/list-templates.happy.yaml) | `tizen-sdk.list-templates.happy` | `list-templates` | safe | CLI |
| `TC-CLI-016` | List by type | [tc/project/list-templates.by-type.yaml](tc/project/list-templates.by-type.yaml) | `tizen-sdk.list-templates.by-type` | `list-templates` | safe | CLI |
| `TC-CLI-017` | Create webapp | [tc/project/create-project.webapp-happy.yaml](tc/project/create-project.webapp-happy.yaml) | `tizen-sdk.create-project.webapp-happy` | `create-project` | mutating | CLI |
| `TC-CLI-018` | Create native | [tc/project/create-project.native-happy.yaml](tc/project/create-project.native-happy.yaml) | `tizen-sdk.create-project.native-happy` | `create-project` | mutating | CLI |
| `TC-CLI-019` | Create dotnet | [tc/project/create-project.dotnet-happy.yaml](tc/project/create-project.dotnet-happy.yaml) | `tizen-sdk.create-project.dotnet-happy` | `create-project` | mutating | CLI |
| `TC-CLI-020` | Create with --force (overwrite existing) | [tc/project/create-project.force.yaml](tc/project/create-project.force.yaml) | `tizen-sdk.create-project.force` | `create-project` | mutating | CLI |
| `TC-CLI-021` | Delete project | [tc/project/project-delete.happy.yaml](tc/project/project-delete.happy.yaml) | `tizen-sdk.project-delete.happy` | `project-delete` | mutating | CLI |
| `TC-CLI-023` | Build (defaults to Debug) | [tc/project/build-project.happy.yaml](tc/project/build-project.happy.yaml) | `tizen-sdk.build-project.happy` | `build-project` | mutating | CLI |
| `TC-CLI-024` | Build with specific compiler flags | [tc/project/build-project.compiler-flags.yaml](tc/project/build-project.compiler-flags.yaml) | `tizen-sdk.build-project.compiler-flags` | `build-project` | mutating | CLI |
| `TC-CLI-025` | Build Release with signing | [tc/project/build-project.release.yaml](tc/project/build-project.release.yaml) | `tizen-sdk.build-project.release` | `build-project` | mutating | CLI |
| `TC-CLI-026` | Build with specific arch (GBS) | [tc/project/build-project.arch.yaml](tc/project/build-project.arch.yaml) | `tizen-sdk.build-project.arch` | `build-project` | mutating | CLI |
| `TC-CLI-027` | Clean rebuild | [tc/project/build-project.clean.yaml](tc/project/build-project.clean.yaml) | `tizen-sdk.build-project.clean` | `build-project` | mutating | CLI |
| `TC-CLI-028` | Build with GBS (platform build) | [tc/project/build-project.gbs.yaml](tc/project/build-project.gbs.yaml) | `tizen-sdk.build-project.gbs` | `build-project` | mutating | CLI |
| `TC-CLI-029` | Generate author certificate | [tc/certificate/certificate-manager.generate-author.yaml](tc/certificate/certificate-manager.generate-author.yaml) | `tizen-sdk.certificate-manager.generate-author` | `certificate-manager` | mutating | CLI |
| `TC-CLI-030` | Generate with full details | [tc/certificate/certificate-manager.generate-author-full.yaml](tc/certificate/certificate-manager.generate-author-full.yaml) | `tizen-sdk.certificate-manager.generate-author-full` | `certificate-manager` | mutating | CLI |
| `TC-CLI-031` | Generate author with existing cert (overwrite) | [tc/certificate/certificate-manager.generate-author-overwrite.yaml](tc/certificate/certificate-manager.generate-author-overwrite.yaml) | `tizen-sdk.certificate-manager.generate-author-overwrite` | `certificate-manager` | mutating | CLI |
| `TC-CLI-032` | Generate author missing required fields | [tc/certificate/certificate-manager.generate-author-missing-required.yaml](tc/certificate/certificate-manager.generate-author-missing-required.yaml) | `tizen-sdk.certificate-manager.generate-author-missing-required` | `certificate-manager` | safe | CLI |
| `TC-CLI-033` | List distributor certificates | [tc/certificate/certificate-manager.list-distributors.yaml](tc/certificate/certificate-manager.list-distributors.yaml) | `tizen-sdk.certificate-manager.list-distributors` | `certificate-manager` | mutating | CLI |
| `TC-CLI-034` | Create signing profile | [tc/certificate/certificate-manager.create-profile.yaml](tc/certificate/certificate-manager.create-profile.yaml) | `tizen-sdk.certificate-manager.create-profile` | `certificate-manager` | mutating | CLI |
| `TC-CLI-035` | List profiles | [tc/certificate/certificate-manager.list-profiles.yaml](tc/certificate/certificate-manager.list-profiles.yaml) | `tizen-sdk.certificate-manager.list-profiles` | `certificate-manager` | mutating | CLI |
| `TC-CLI-036` | Set active profile | [tc/certificate/certificate-manager.set-active-profile.yaml](tc/certificate/certificate-manager.set-active-profile.yaml) | `tizen-sdk.certificate-manager.set-active-profile` | `certificate-manager` | mutating | CLI |
| `TC-CLI-037` | Remove profile | [tc/certificate/certificate-manager.remove-profile.yaml](tc/certificate/certificate-manager.remove-profile.yaml) | `tizen-sdk.certificate-manager.remove-profile` | `certificate-manager` | mutating | CLI |
| `TC-CLI-038` | Import certificate | [tc/certificate/certificate-manager.import-certificate.yaml](tc/certificate/certificate-manager.import-certificate.yaml) | `tizen-sdk.certificate-manager.import-certificate` | `certificate-manager` | mutating | CLI |
| `TC-CLI-039` | Inspect certificate | [tc/certificate/certificate-manager.inspect-certificate.yaml](tc/certificate/certificate-manager.inspect-certificate.yaml) | `tizen-sdk.certificate-manager.inspect-certificate` | `certificate-manager` | mutating | CLI |
| `TC-CLI-040` | Samsung online-CA: login | [tc/certificate/certificate-manager.samsung-login.yaml](tc/certificate/certificate-manager.samsung-login.yaml) | `tizen-sdk.certificate-manager.samsung-login` | `certificate-manager` | mutating | CLI |
| `TC-CLI-041` | Samsung: generate author cert | [tc/certificate/certificate-manager.generate-samsung-author.yaml](tc/certificate/certificate-manager.generate-samsung-author.yaml) | `tizen-sdk.certificate-manager.generate-samsung-author` | `certificate-manager` | mutating | CLI |
| `TC-CLI-042` | Samsung: generate distributor cert | [tc/certificate/certificate-manager.generate-samsung-distributor.yaml](tc/certificate/certificate-manager.generate-samsung-distributor.yaml) | `tizen-sdk.certificate-manager.generate-samsung-distributor` | `certificate-manager` | mutating | CLI |
| `TC-CLI-043` | Import certificate from file | [tc/certificate/certificate-manager.import-certificate-from-file.yaml](tc/certificate/certificate-manager.import-certificate-from-file.yaml) | `tizen-sdk.certificate-manager.import-certificate-from-file` | `certificate-manager` | mutating | CLI |
| `TC-CLI-044` | Find connected device (default) | [tc/device/device-manager.happy.yaml](tc/device/device-manager.happy.yaml) | `tizen-sdk.device-manager.happy` | `device-manager` | device | CLI |
| `TC-CLI-045` | Stop emulators | [tc/device/device-manager.stop.yaml](tc/device/device-manager.stop.yaml) | `tizen-sdk.device-manager.stop` | `device-manager` | device | CLI |
| `TC-CLI-046` | Look for TV emulator | [tc/device/device-manager.tv.yaml](tc/device/device-manager.tv.yaml) | `tizen-sdk.device-manager.tv` | `device-manager` | device | CLI |
| `TC-CLI-047` | Custom timeout | [tc/device/device-manager.timeout.yaml](tc/device/device-manager.timeout.yaml) | `tizen-sdk.device-manager.timeout` | `device-manager` | device | CLI |
| `TC-CLI-048` | List VMs | [tc/device/emulator-manager.list-vm.yaml](tc/device/emulator-manager.list-vm.yaml) | `tizen-sdk.emulator-manager.list-vm` | `emulator-manager` | device | CLI |
| `TC-CLI-049` | List templates / platforms | [tc/device/emulator-manager.list-template.yaml](tc/device/emulator-manager.list-template.yaml) | `tizen-sdk.emulator-manager.list-template` | `emulator-manager` | device | CLI |
| `TC-CLI-050` | Emulator manager detail | [tc/device/emulator-manager.detail.yaml](tc/device/emulator-manager.detail.yaml) | `tizen-sdk.emulator-manager.detail` | `emulator-manager` | device | CLI |
| `TC-CLI-051` | Create VM (1080) | [tc/device/create-emulator.happy.yaml](tc/device/create-emulator.happy.yaml) | `tizen-sdk.create-emulator.happy` | `create-emulator` | device | CLI |
| `TC-CLI-052` | Create with defaults (no prompt) | [tc/device/create-emulator.assume-defaults.yaml](tc/device/create-emulator.assume-defaults.yaml) | `tizen-sdk.create-emulator.assume-defaults` | `create-emulator` | device | CLI |
| `TC-CLI-053` | Create TV emulator | [tc/device/create-emulator.tv.yaml](tc/device/create-emulator.tv.yaml) | `tizen-sdk.create-emulator.tv` | `create-emulator` | device | CLI |
| `TC-CLI-054` | Create and launch immediately | [tc/device/create-emulator.launch.yaml](tc/device/create-emulator.launch.yaml) | `tizen-sdk.create-emulator.launch` | `create-emulator` | device | CLI |
| `TC-CLI-055` | Launch VM | [tc/device/launch-emulator.happy.yaml](tc/device/launch-emulator.happy.yaml) | `tizen-sdk.launch-emulator.happy` | `launch-emulator` | device | CLI |
| `TC-CLI-056` | Launch first available VM | [tc/device/launch-emulator.first-available.yaml](tc/device/launch-emulator.first-available.yaml) | `tizen-sdk.launch-emulator.first-available` | `launch-emulator` | device | CLI |
| `TC-CLI-057` | Modify RAM | [tc/device/emulator-manager.modify-ram.yaml](tc/device/emulator-manager.modify-ram.yaml) | `tizen-sdk.emulator-manager.modify-ram` | `emulator-manager` | device | CLI |
| `TC-CLI-058` | Reset (requires --confirm) | [tc/device/emulator-manager.reset.yaml](tc/device/emulator-manager.reset.yaml) | `tizen-sdk.emulator-manager.reset` | `emulator-manager` | device | CLI |
| `TC-CLI-059` | Delete VM | [tc/device/emulator-manager.delete.yaml](tc/device/emulator-manager.delete.yaml) | `tizen-sdk.emulator-manager.delete` | `emulator-manager` | device | CLI |
| `TC-CLI-060` | Create image | [tc/device/emulator-manager.create-image.yaml](tc/device/emulator-manager.create-image.yaml) | `tizen-sdk.emulator-manager.create-image` | `emulator-manager` | device | CLI |
| `TC-CLI-061` | Emulator manager missing required | [tc/device/emulator-manager.missing-action.yaml](tc/device/emulator-manager.missing-action.yaml) | `tizen-sdk.emulator-manager.missing-action` | `emulator-manager` | safe | CLI |
| `TC-CLI-062` | Emulator manager invalid action | [tc/device/emulator-manager.invalid-action.yaml](tc/device/emulator-manager.invalid-action.yaml) | `tizen-sdk.emulator-manager.invalid-action` | `emulator-manager` | safe | CLI |
| `TC-CLI-063` | Missing --confirm on reset → failure | [tc/device/emulator-manager.reset-without-confirm.yaml](tc/device/emulator-manager.reset-without-confirm.yaml) | `tizen-sdk.emulator-manager.reset-without-confirm` | `emulator-manager` | safe | CLI |
| `TC-CLI-064` | Download (auto-detect version) | [tc/sdk/download-emulator-package.happy.yaml](tc/sdk/download-emulator-package.happy.yaml) | `tizen-sdk.download-emulator-package.happy` | `download-emulator-package` | mutating | CLI |
| `TC-CLI-065` | Specific version | [tc/sdk/download-emulator-package.specific-version.yaml](tc/sdk/download-emulator-package.specific-version.yaml) | `tizen-sdk.download-emulator-package.specific-version` | `download-emulator-package` | mutating | CLI |
| `TC-CLI-066` | Force reinstall | [tc/sdk/download-emulator-package.force.yaml](tc/sdk/download-emulator-package.force.yaml) | `tizen-sdk.download-emulator-package.force` | `download-emulator-package` | mutating | CLI |
| `TC-CLI-067` | Install platform package | [tc/sdk/platform-install.happy.yaml](tc/sdk/platform-install.happy.yaml) | `tizen-sdk.platform-install.happy` | `platform-install` | mutating | CLI |
| `TC-CLI-068` | Install mobile platform | [tc/sdk/download-mobile-platform.happy.yaml](tc/sdk/download-mobile-platform.happy.yaml) | `tizen-sdk.download-mobile-platform.happy` | `download-mobile-platform` | mutating | CLI |
| `TC-CLI-069` | Mobile platform with IOT-Headed extension | [tc/sdk/download-mobile-platform.iot-headed.yaml](tc/sdk/download-mobile-platform.iot-headed.yaml) | `tizen-sdk.download-mobile-platform.iot-headed` | `download-mobile-platform` | mutating | CLI |
| `TC-CLI-070` | Install custom rootstrap from ZIP | [tc/sdk/install-rootstrap.happy.yaml](tc/sdk/install-rootstrap.happy.yaml) | `tizen-sdk.install-rootstrap.happy` | `install-rootstrap` | mutating | CLI |
| `TC-CLI-071` | Install only | [tc/device/install-app.happy.yaml](tc/device/install-app.happy.yaml) | `tizen-sdk.install-app.happy` | `install-app` | device | CLI |
| `TC-CLI-072` | Install and run | [tc/device/install-app.run.yaml](tc/device/install-app.run.yaml) | `tizen-sdk.install-app.run` | `install-app` | device | CLI |
| `TC-CLI-073` | Install on specific device | [tc/device/install-app.serial.yaml](tc/device/install-app.serial.yaml) | `tizen-sdk.install-app.serial` | `install-app` | device | CLI |
| `TC-CLI-074` | Install app invalid package path | [tc/device/install-app.bad-package.yaml](tc/device/install-app.bad-package.yaml) | `tizen-sdk.install-app.bad-package` | `install-app` | safe | CLI |
| `TC-CLI-075` | Attach mode (default) | [tc/debug/gdb-debug.happy.yaml](tc/debug/gdb-debug.happy.yaml) | `tizen-sdk.gdb-debug.happy` | `gdb-debug` | device | CLI |
| `TC-CLI-076` | Launch mode | [tc/debug/gdb-debug.launch.yaml](tc/debug/gdb-debug.launch.yaml) | `tizen-sdk.gdb-debug.launch` | `gdb-debug` | device | CLI |
| `TC-CLI-077` | With breakpoints | [tc/debug/gdb-debug.breakpoints.yaml](tc/debug/gdb-debug.breakpoints.yaml) | `tizen-sdk.gdb-debug.breakpoints` | `gdb-debug` | device | CLI |
| `TC-CLI-078` | On specific device | [tc/debug/gdb-debug.serial.yaml](tc/debug/gdb-debug.serial.yaml) | `tizen-sdk.gdb-debug.serial` | `gdb-debug` | device | CLI |
| `TC-CLI-079` | GDB debug missing required | [tc/debug/gdb-debug.missing-required-explicit.yaml](tc/debug/gdb-debug.missing-required-explicit.yaml) | `tizen-sdk.gdb-debug.missing-required-explicit` | `gdb-debug` | safe | CLI |
| `TC-CLI-080` | Launch mode (default) | [tc/debug/dotnet-debug.happy.yaml](tc/debug/dotnet-debug.happy.yaml) | `tizen-sdk.dotnet-debug.happy` | `dotnet-debug` | device | CLI |
| `TC-CLI-081` | Launch mode | [tc/debug/dotnet-debug.launch.yaml](tc/debug/dotnet-debug.launch.yaml) | `tizen-sdk.dotnet-debug.launch` | `dotnet-debug` | device | CLI |
| `TC-CLI-082` | With breakpoints | [tc/debug/dotnet-debug.breakpoints.yaml](tc/debug/dotnet-debug.breakpoints.yaml) | `tizen-sdk.dotnet-debug.breakpoints` | `dotnet-debug` | device | CLI |
| `TC-CLI-083` | On specific device | [tc/debug/dotnet-debug.serial.yaml](tc/debug/dotnet-debug.serial.yaml) | `tizen-sdk.dotnet-debug.serial` | `dotnet-debug` | device | CLI |
| `TC-CLI-084` | Force reinstall netcoredbg | [tc/debug/dotnet-debug.force-install.yaml](tc/debug/dotnet-debug.force-install.yaml) | `tizen-sdk.dotnet-debug.force-install` | `dotnet-debug` | device | CLI |
| `TC-CLI-085` | Dotnet debug missing required | [tc/debug/dotnet-debug.missing-required-explicit.yaml](tc/debug/dotnet-debug.missing-required-explicit.yaml) | `tizen-sdk.dotnet-debug.missing-required-explicit` | `dotnet-debug` | safe | CLI |
| `TC-CLI-086` | Default port 9222 | [tc/debug/webapp-debug.happy.yaml](tc/debug/webapp-debug.happy.yaml) | `tizen-sdk.webapp-debug.happy` | `webapp-debug` | device | CLI |
| `TC-CLI-087` | Custom port | [tc/debug/webapp-debug.custom-port.yaml](tc/debug/webapp-debug.custom-port.yaml) | `tizen-sdk.webapp-debug.custom-port` | `webapp-debug` | device | CLI |
| `TC-CLI-088` | On specific device | [tc/debug/webapp-debug.serial.yaml](tc/debug/webapp-debug.serial.yaml) | `tizen-sdk.webapp-debug.serial` | `webapp-debug` | device | CLI |
| `TC-CLI-089` | Custom timeout | [tc/debug/webapp-debug.timeout.yaml](tc/debug/webapp-debug.timeout.yaml) | `tizen-sdk.webapp-debug.timeout` | `webapp-debug` | device | CLI |
| `TC-CLI-090` | Webapp debug missing required | [tc/debug/webapp-debug.missing-required-explicit.yaml](tc/debug/webapp-debug.missing-required-explicit.yaml) | `tizen-sdk.webapp-debug.missing-required-explicit` | `webapp-debug` | safe | CLI |
| `TC-CLI-091` | Screenshot default | [tc/device/screenshot.happy.yaml](tc/device/screenshot.happy.yaml) | `tizen-sdk.screenshot.happy` | `screenshot` | device | CLI |
| `TC-CLI-092` | Screenshot with output path | [tc/device/screenshot.output-path.yaml](tc/device/screenshot.output-path.yaml) | `tizen-sdk.screenshot.output-path` | `screenshot` | device | CLI |
| `TC-CLI-093` | Screenshot on specific device | [tc/device/screenshot.serial.yaml](tc/device/screenshot.serial.yaml) | `tizen-sdk.screenshot.serial` | `screenshot` | device | CLI |
| `TC-CLI-094` | TV SDK Install | [tc/sdk/tv-sdk-install.happy.yaml](tc/sdk/tv-sdk-install.happy.yaml) | `tizen-sdk.tv-sdk-install.happy` | `tv-sdk-install` | mutating | CLI |
| `TC-CLI-095` | Force reinstall | [tc/sdk/tv-sdk-install.force.yaml](tc/sdk/tv-sdk-install.force.yaml) | `tizen-sdk.tv-sdk-install.force` | `tv-sdk-install` | mutating | CLI |
| `TC-CLI-096` | Update | [tc/sdk/update-package.happy.yaml](tc/sdk/update-package.happy.yaml) | `tizen-sdk.update-package.happy` | `update-package` | mutating | CLI |
| `TC-CLI-097` | Dry run (list outdated, don't update) | [tc/sdk/update-package.dry-run.yaml](tc/sdk/update-package.dry-run.yaml) | `tizen-sdk.update-package.dry-run` | `update-package` | mutating | CLI |
| `TC-CLI-098` | Force update all | [tc/sdk/update-package.force.yaml](tc/sdk/update-package.force.yaml) | `tizen-sdk.update-package.force` | `update-package` | mutating | CLI |
| `TC-CLI-099` | List devices | [tc/device/sdb-helper.list-devices.yaml](tc/device/sdb-helper.list-devices.yaml) | `tizen-sdk.sdb-helper.list-devices` | `sdb-helper` | device | CLI |
| `TC-CLI-100` | Shell command | [tc/device/sdb-helper.shell.yaml](tc/device/sdb-helper.shell.yaml) | `tizen-sdk.sdb-helper.shell` | `sdb-helper` | device | CLI |
| `TC-CLI-101` | Forward port | [tc/device/sdb-helper.forward.yaml](tc/device/sdb-helper.forward.yaml) | `tizen-sdk.sdb-helper.forward` | `sdb-helper` | device | CLI |
| `TC-CLI-102` | Reboot | [tc/device/sdb-helper.reboot.yaml](tc/device/sdb-helper.reboot.yaml) | `tizen-sdk.sdb-helper.reboot` | `sdb-helper` | device | CLI |
| `TC-CLI-103` | Screenshot (hands off to tizen-screenshot) | [tc/device/sdb-helper.screenshot.yaml](tc/device/sdb-helper.screenshot.yaml) | `tizen-sdk.sdb-helper.screenshot` | `sdb-helper` | device | CLI |
| `TC-CLI-104` | On specific device | [tc/device/sdb-helper.serial.yaml](tc/device/sdb-helper.serial.yaml) | `tizen-sdk.sdb-helper.serial` | `sdb-helper` | device | CLI |
| `TC-CLI-105` | Push | [tc/device/file-transfer.push.yaml](tc/device/file-transfer.push.yaml) | `tizen-sdk.file-transfer.push` | `file-transfer` | device | CLI |
| `TC-CLI-106` | Pull | [tc/device/file-transfer.pull.yaml](tc/device/file-transfer.pull.yaml) | `tizen-sdk.file-transfer.pull` | `file-transfer` | device | CLI |
| `TC-CLI-107` | On specific device | [tc/device/file-transfer.serial.yaml](tc/device/file-transfer.serial.yaml) | `tizen-sdk.file-transfer.serial` | `file-transfer` | device | CLI |
| `TC-CLI-108` | With UTF-8 paths | [tc/device/file-transfer.utf8.yaml](tc/device/file-transfer.utf8.yaml) | `tizen-sdk.file-transfer.utf8` | `file-transfer` | device | CLI |
| `TC-CLI-109` | File transfer missing required | [tc/device/file-transfer.missing-required-explicit.yaml](tc/device/file-transfer.missing-required-explicit.yaml) | `tizen-sdk.file-transfer.missing-required-explicit` | `file-transfer` | safe | CLI |
| `TC-CLI-110` | Scan all local subnets | [tc/device/remote-device.scan-all.yaml](tc/device/remote-device.scan-all.yaml) | `tizen-sdk.remote-device.scan-all` | `remote-device` | device | CLI |
| `TC-CLI-111` | Scan specific subnet | [tc/device/remote-device.scan-subnet.yaml](tc/device/remote-device.scan-subnet.yaml) | `tizen-sdk.remote-device.scan-subnet` | `remote-device` | device | CLI |
| `TC-CLI-112` | Connect | [tc/device/remote-device.connect.yaml](tc/device/remote-device.connect.yaml) | `tizen-sdk.remote-device.connect` | `remote-device` | device | CLI |
| `TC-CLI-113` | Connect with custom port | [tc/device/remote-device.connect-custom-port.yaml](tc/device/remote-device.connect-custom-port.yaml) | `tizen-sdk.remote-device.connect-custom-port` | `remote-device` | device | CLI |
| `TC-CLI-114` | Disconnect | [tc/device/remote-device.disconnect.yaml](tc/device/remote-device.disconnect.yaml) | `tizen-sdk.remote-device.disconnect` | `remote-device` | device | CLI |
| `TC-CLI-115` | Add bookmark | [tc/device/remote-device.add-bookmark.yaml](tc/device/remote-device.add-bookmark.yaml) | `tizen-sdk.remote-device.add-bookmark` | `remote-device` | device | CLI |
| `TC-CLI-116` | List bookmarks | [tc/device/remote-device.list-bookmarks.yaml](tc/device/remote-device.list-bookmarks.yaml) | `tizen-sdk.remote-device.list-bookmarks` | `remote-device` | device | CLI |
| `TC-CLI-117` | List saved bookmarks | [tc/device/remote-device.list-saved.yaml](tc/device/remote-device.list-saved.yaml) | `tizen-sdk.remote-device.list-saved` | `remote-device` | device | CLI |
| `TC-CLI-118` | Remove bookmark | [tc/device/remote-device.remove-bookmark.yaml](tc/device/remote-device.remove-bookmark.yaml) | `tizen-sdk.remote-device.remove-bookmark` | `remote-device` | device | CLI |
| `TC-CLI-119` | Edit bookmark (rename) | [tc/device/remote-device.edit-rename.yaml](tc/device/remote-device.edit-rename.yaml) | `tizen-sdk.remote-device.edit-rename` | `remote-device` | device | CLI |
| `TC-CLI-120` | Edit bookmark (change IP) | [tc/device/remote-device.edit-ip.yaml](tc/device/remote-device.edit-ip.yaml) | `tizen-sdk.remote-device.edit-ip` | `remote-device` | device | CLI |
| `TC-CLI-121` | Remote device invalid action | [tc/device/remote-device.invalid-action.yaml](tc/device/remote-device.invalid-action.yaml) | `tizen-sdk.remote-device.invalid-action` | `remote-device` | safe | CLI |
| `TC-CLI-122` | Install from custom repo | [tc/sdk/sdk-install-custom-repo.happy.yaml](tc/sdk/sdk-install-custom-repo.happy.yaml) | `tizen-sdk.sdk-install-custom-repo.happy` | `sdk-install-custom-repo` | mutating | CLI |
| `TC-CLI-123` | Install with specific version | [tc/sdk/sdk-install-custom-repo.specific-version.yaml](tc/sdk/sdk-install-custom-repo.specific-version.yaml) | `tizen-sdk.sdk-install-custom-repo.specific-version` | `sdk-install-custom-repo` | mutating | CLI |
| `TC-CLI-124` | Force reinstall from different repo | [tc/sdk/sdk-install-custom-repo.force.yaml](tc/sdk/sdk-install-custom-repo.force.yaml) | `tizen-sdk.sdk-install-custom-repo.force` | `sdk-install-custom-repo` | mutating | CLI |
| `TC-CLI-125` | SDK install custom repo missing required | [tc/sdk/sdk-install-custom-repo.missing-required-explicit.yaml](tc/sdk/sdk-install-custom-repo.missing-required-explicit.yaml) | `tizen-sdk.sdk-install-custom-repo.missing-required-explicit` | `sdk-install-custom-repo` | safe | CLI |
| `TC-CLI-126` | Scaffold test file + package.json | [tc/test/playwright-test.scaffold.yaml](tc/test/playwright-test.scaffold.yaml) | `tizen-sdk.playwright-test.scaffold` | `playwright-test` | device | CLI |
| `TC-CLI-127` | Scaffold with --force (overwrite) | [tc/test/playwright-test.scaffold-force.yaml](tc/test/playwright-test.scaffold-force.yaml) | `tizen-sdk.playwright-test.scaffold-force` | `playwright-test` | device | CLI |
| `TC-CLI-128` | Run tests | [tc/test/playwright-test.run.yaml](tc/test/playwright-test.run.yaml) | `tizen-sdk.playwright-test.run` | `playwright-test` | device | CLI |
| `TC-CLI-129` | Run with --no-setup (reuse existing CDP) | [tc/test/playwright-test.no-setup.yaml](tc/test/playwright-test.no-setup.yaml) | `tizen-sdk.playwright-test.no-setup` | `playwright-test` | device | CLI |
| `TC-CLI-130` | Run with custom port + timeout | [tc/test/playwright-test.custom-port-timeout.yaml](tc/test/playwright-test.custom-port-timeout.yaml) | `tizen-sdk.playwright-test.custom-port-timeout` | `playwright-test` | device | CLI |
| `TC-CLI-131` | On specific device | [tc/test/playwright-test.serial.yaml](tc/test/playwright-test.serial.yaml) | `tizen-sdk.playwright-test.serial` | `playwright-test` | device | CLI |
| `TC-CLI-132` | Playwright test missing required | [tc/test/playwright-test.missing-required-explicit.yaml](tc/test/playwright-test.missing-required-explicit.yaml) | `tizen-sdk.playwright-test.missing-required-explicit` | `playwright-test` | safe | CLI |
| `TC-CLI-133` | Scaffold without --project-dir → failure | [tc/test/playwright-test.scaffold-missing-project-dir.yaml](tc/test/playwright-test.scaffold-missing-project-dir.yaml) | `tizen-sdk.playwright-test.scaffold-missing-project-dir` | `playwright-test` | safe | CLI |
| `TC-CLI-134` | Show plugin schema | [tc/meta/meta.schema.yaml](tc/meta/meta.schema.yaml) | `tizen-sdk.meta.schema` | `--schema` | safe | CLI |
| `TC-CLI-135` | Doctor (environment health check) | [tc/meta/meta.doctor.yaml](tc/meta/meta.doctor.yaml) | `tizen-sdk.meta.doctor` | `--doctor` | safe | CLI |
| `TC-CLI-136` | Capabilities | [tc/meta/meta.capabilities.yaml](tc/meta/meta.capabilities.yaml) | `tizen-sdk.meta.capabilities` | `--capabilities` | safe | CLI |
| `TC-CLI-137` | List available commands | [tc/meta/meta.list-commands.yaml](tc/meta/meta.list-commands.yaml) | `tizen-sdk.meta.list-commands` | `no-args` | safe | CLI |

---

## 3. Prompt 레인 매핑 (`TC-P-*` → YAML)

| CSV TC ID | CSV 제목 | YAML 파일 | YAML `id` | `command` | `tier` | 레인 |
| --- | --- | --- | --- | --- | --- | --- |
| `TC-P-001` | Prompt 1 — Set SDK path | [tc/sdk/sdk-init.prompt-happy.yaml](tc/sdk/sdk-init.prompt-happy.yaml) | `tizen-sdk.sdk-init.prompt-happy` | `sdk-init` | safe | Prompt |
| `TC-P-002` | Prompt — Check if Node.js is installed | [tc/sdk/check-node.prompt-happy.yaml](tc/sdk/check-node.prompt-happy.yaml) | `tizen-sdk.check-node.prompt-happy` | `check-node` | safe | Prompt |
| `TC-P-003` | Prompt — Check disk space | [tc/sdk/check-disk-space.prompt-happy.yaml](tc/sdk/check-disk-space.prompt-happy.yaml) | `tizen-sdk.check-disk-space.prompt-happy` | `check-disk-space` | safe | Prompt |
| `TC-P-004` | Prompt 1 — Install the Tizen SDK | [tc/sdk/sdk-install.prompt-happy.yaml](tc/sdk/sdk-install.prompt-happy.yaml) | `tizen-sdk.sdk-install.prompt-happy` | `sdk-install` | mutating | Prompt |
| `TC-P-005` | Prompt — Install SDK from custom repository | [tc/sdk/sdk-install-custom-repo.prompt-happy.yaml](tc/sdk/sdk-install-custom-repo.prompt-happy.yaml) | `tizen-sdk.sdk-install-custom-repo.prompt-happy` | `sdk-install-custom-repo` | mutating | Prompt |
| `TC-P-006` | Prompt — Install TV SDK | [tc/sdk/tv-sdk-install.prompt-happy.yaml](tc/sdk/tv-sdk-install.prompt-happy.yaml) | `tizen-sdk.tv-sdk-install.prompt-happy` | `tv-sdk-install` | mutating | Prompt |
| `TC-P-007` | Prompt — Update SDK packages | [tc/sdk/update-package.prompt-happy.yaml](tc/sdk/update-package.prompt-happy.yaml) | `tizen-sdk.update-package.prompt-happy` | `update-package` | mutating | Prompt |
| `TC-P-008` | Prompt — Download emulator package | [tc/sdk/download-emulator-package.prompt-happy.yaml](tc/sdk/download-emulator-package.prompt-happy.yaml) | `tizen-sdk.download-emulator-package.prompt-happy` | `download-emulator-package` | mutating | Prompt |
| `TC-P-009` | Prompt — Install Tizen platform package | [tc/sdk/platform-install.prompt-happy.yaml](tc/sdk/platform-install.prompt-happy.yaml) | `tizen-sdk.platform-install.prompt-happy` | `platform-install` | mutating | Prompt |
| `TC-P-010` | Prompt — Download Tizen mobile platform | [tc/sdk/download-mobile-platform.prompt-happy.yaml](tc/sdk/download-mobile-platform.prompt-happy.yaml) | `tizen-sdk.download-mobile-platform.prompt-happy` | `download-mobile-platform` | mutating | Prompt |
| `TC-P-011` | Prompt — Install custom rootstrap | [tc/sdk/install-rootstrap.prompt-happy.yaml](tc/sdk/install-rootstrap.prompt-happy.yaml) | `tizen-sdk.install-rootstrap.prompt-happy` | `install-rootstrap` | mutating | Prompt |
| `TC-P-012` | Prompt — Set up .NET development environment for Tizen | [tc/sdk/dotnet-setup.prompt-happy.yaml](tc/sdk/dotnet-setup.prompt-happy.yaml) | `tizen-sdk.dotnet-setup.prompt-happy` | `dotnet-setup` | mutating | Prompt |
| `TC-P-013` | Prompt 1 — Create a new Tizen web app | [tc/project/create-project.prompt-happy.yaml](tc/project/create-project.prompt-happy.yaml) | `tizen-sdk.create-project.prompt-happy` | `create-project` | mutating | Prompt |
| `TC-P-014` | Prompt — List available Tizen project templates | [tc/project/list-templates.prompt-happy.yaml](tc/project/list-templates.prompt-happy.yaml) | `tizen-sdk.list-templates.prompt-happy` | `list-templates` | safe | Prompt |
| `TC-P-015` | Prompt — Show Tizen SDK repository information | [tc/sdk/sdk-repo-info.prompt-happy.yaml](tc/sdk/sdk-repo-info.prompt-happy.yaml) | `tizen-sdk.sdk-repo-info.prompt-happy` | `sdk-repo-info` | safe | Prompt |
| `TC-P-016` | Prompt — Validate a repository URL | [tc/sdk/validate-repo-url.prompt-happy.yaml](tc/sdk/validate-repo-url.prompt-happy.yaml) | `tizen-sdk.validate-repo-url.prompt-happy` | `validate-repo-url` | safe | Prompt |
| `TC-P-017` | Prompt — Check Node.js version | [tc/sdk/check-node.prompt-variant1.yaml](tc/sdk/check-node.prompt-variant1.yaml) | `tizen-sdk.check-node.prompt-variant1` | `check-node` | safe | Prompt |
| `TC-P-018` | Prompt — Verify disk space for SDK | [tc/sdk/check-disk-space.prompt-variant1.yaml](tc/sdk/check-disk-space.prompt-variant1.yaml) | `tizen-sdk.check-disk-space.prompt-variant1` | `check-disk-space` | safe | Prompt |
| `TC-P-019` | Prompt — Delete a Tizen project | [tc/project/project-delete.prompt-happy.yaml](tc/project/project-delete.prompt-happy.yaml) | `tizen-sdk.project-delete.prompt-happy` | `project-delete` | mutating | Prompt |
| `TC-P-020` | Prompt 1 — Build my Tizen project in Debug mode | [tc/project/build-project.prompt-happy.yaml](tc/project/build-project.prompt-happy.yaml) | `tizen-sdk.build-project.prompt-happy` | `build-project` | mutating | Prompt |
| `TC-P-021` | Prompt — Create a native Tizen app | [tc/project/create-project.prompt-native.yaml](tc/project/create-project.prompt-native.yaml) | `tizen-sdk.create-project.prompt-native` | `create-project` | mutating | Prompt |
| `TC-P-022` | Prompt — Create a .NET Tizen app | [tc/project/create-project.prompt-dotnet.yaml](tc/project/create-project.prompt-dotnet.yaml) | `tizen-sdk.create-project.prompt-dotnet` | `create-project` | mutating | Prompt |
| `TC-P-023` | Prompt — Build project in Release mode | [tc/project/build-project.prompt-release.yaml](tc/project/build-project.prompt-release.yaml) | `tizen-sdk.build-project.prompt-release` | `build-project` | mutating | Prompt |
| `TC-P-024` | Prompt — Clean and rebuild project | [tc/project/build-project.prompt-clean.yaml](tc/project/build-project.prompt-clean.yaml) | `tizen-sdk.build-project.prompt-clean` | `build-project` | mutating | Prompt |
| `TC-P-025` | Prompt — Build with specific architecture | [tc/project/build-project.prompt-arch.yaml](tc/project/build-project.prompt-arch.yaml) | `tizen-sdk.build-project.prompt-arch` | `build-project` | mutating | Prompt |
| `TC-P-026` | Prompt 1 — Generate an author certificate | [tc/certificate/certificate-manager.prompt-happy.yaml](tc/certificate/certificate-manager.prompt-happy.yaml) | `tizen-sdk.certificate-manager.prompt-happy` | `certificate-manager` | mutating | Prompt |
| `TC-P-027` | Prompt — Generate author certificate with full details | [tc/certificate/certificate-manager.prompt-full-details.yaml](tc/certificate/certificate-manager.prompt-full-details.yaml) | `tizen-sdk.certificate-manager.prompt-full-details` | `certificate-manager` | mutating | Prompt |
| `TC-P-028` | Prompt — List distributor certificates | [tc/certificate/certificate-manager.prompt-list-distributors.yaml](tc/certificate/certificate-manager.prompt-list-distributors.yaml) | `tizen-sdk.certificate-manager.prompt-list-distributors` | `certificate-manager` | mutating | Prompt |
| `TC-P-029` | Prompt — Create a signing profile | [tc/certificate/certificate-manager.prompt-create-profile.yaml](tc/certificate/certificate-manager.prompt-create-profile.yaml) | `tizen-sdk.certificate-manager.prompt-create-profile` | `certificate-manager` | mutating | Prompt |
| `TC-P-030` | Prompt — List signing profiles | [tc/certificate/certificate-manager.prompt-list-profiles.yaml](tc/certificate/certificate-manager.prompt-list-profiles.yaml) | `tizen-sdk.certificate-manager.prompt-list-profiles` | `certificate-manager` | mutating | Prompt |
| `TC-P-031` | Prompt — Set active signing profile | [tc/certificate/certificate-manager.prompt-set-active.yaml](tc/certificate/certificate-manager.prompt-set-active.yaml) | `tizen-sdk.certificate-manager.prompt-set-active` | `certificate-manager` | mutating | Prompt |
| `TC-P-032` | Prompt — Remove a signing profile | [tc/certificate/certificate-manager.prompt-remove-profile.yaml](tc/certificate/certificate-manager.prompt-remove-profile.yaml) | `tizen-sdk.certificate-manager.prompt-remove-profile` | `certificate-manager` | mutating | Prompt |
| `TC-P-033` | Prompt 1 — List connected Tizen devices | [tc/device/device-manager.prompt-happy.yaml](tc/device/device-manager.prompt-happy.yaml) | `tizen-sdk.device-manager.prompt-happy` | `device-manager` | device | Prompt |
| `TC-P-034` | Prompt — Stop all emulators | [tc/device/device-manager.prompt-stop.yaml](tc/device/device-manager.prompt-stop.yaml) | `tizen-sdk.device-manager.prompt-stop` | `device-manager` | device | Prompt |
| `TC-P-035` | Prompt — Find Samsung TV emulator | [tc/device/device-manager.prompt-tv.yaml](tc/device/device-manager.prompt-tv.yaml) | `tizen-sdk.device-manager.prompt-tv` | `device-manager` | device | Prompt |
| `TC-P-036` | Prompt 1 — Create a Tizen emulator with 1080 resolution | [tc/device/create-emulator.prompt-happy.yaml](tc/device/create-emulator.prompt-happy.yaml) | `tizen-sdk.create-emulator.prompt-happy` | `create-emulator` | device | Prompt |
| `TC-P-037` | Prompt — Launch Tizen emulator | [tc/device/launch-emulator.prompt-happy.yaml](tc/device/launch-emulator.prompt-happy.yaml) | `tizen-sdk.launch-emulator.prompt-happy` | `launch-emulator` | device | Prompt |
| `TC-P-038` | Prompt — List Tizen emulator VMs | [tc/device/emulator-manager.prompt-happy.yaml](tc/device/emulator-manager.prompt-happy.yaml) | `tizen-sdk.emulator-manager.prompt-happy` | `emulator-manager` | device | Prompt |
| `TC-P-039` | Prompt — List emulator templates | [tc/device/emulator-manager.prompt-list-templates.yaml](tc/device/emulator-manager.prompt-list-templates.yaml) | `tizen-sdk.emulator-manager.prompt-list-templates` | `emulator-manager` | device | Prompt |
| `TC-P-040` | Prompt — Show emulator VM details | [tc/device/emulator-manager.prompt-detail.yaml](tc/device/emulator-manager.prompt-detail.yaml) | `tizen-sdk.emulator-manager.prompt-detail` | `emulator-manager` | device | Prompt |
| `TC-P-041` | Prompt — Create emulator with defaults | [tc/device/create-emulator.prompt-defaults.yaml](tc/device/create-emulator.prompt-defaults.yaml) | `tizen-sdk.create-emulator.prompt-defaults` | `create-emulator` | device | Prompt |
| `TC-P-042` | Prompt — Create TV emulator | [tc/device/create-emulator.prompt-tv.yaml](tc/device/create-emulator.prompt-tv.yaml) | `tizen-sdk.create-emulator.prompt-tv` | `create-emulator` | device | Prompt |
| `TC-P-043` | Prompt — Create and launch emulator | [tc/device/create-emulator.prompt-launch.yaml](tc/device/create-emulator.prompt-launch.yaml) | `tizen-sdk.create-emulator.prompt-launch` | `create-emulator` | device | Prompt |
| `TC-P-044` | Prompt — Launch first available emulator | [tc/device/launch-emulator.prompt-first.yaml](tc/device/launch-emulator.prompt-first.yaml) | `tizen-sdk.launch-emulator.prompt-first` | `launch-emulator` | device | Prompt |
| `TC-P-045` | Prompt — Modify emulator RAM | [tc/device/emulator-manager.prompt-modify-ram.yaml](tc/device/emulator-manager.prompt-modify-ram.yaml) | `tizen-sdk.emulator-manager.prompt-modify-ram` | `emulator-manager` | device | Prompt |
| `TC-P-046` | Prompt — Reset emulator | [tc/device/emulator-manager.prompt-reset.yaml](tc/device/emulator-manager.prompt-reset.yaml) | `tizen-sdk.emulator-manager.prompt-reset` | `emulator-manager` | device | Prompt |
| `TC-P-047` | Prompt — Delete emulator VM | [tc/device/emulator-manager.prompt-delete.yaml](tc/device/emulator-manager.prompt-delete.yaml) | `tizen-sdk.emulator-manager.prompt-delete` | `emulator-manager` | device | Prompt |
| `TC-P-048` | Prompt — Create emulator image | [tc/device/emulator-manager.prompt-create-image.yaml](tc/device/emulator-manager.prompt-create-image.yaml) | `tizen-sdk.emulator-manager.prompt-create-image` | `emulator-manager` | device | Prompt |
| `TC-P-049` | Prompt 1 — Install my app on the device | [tc/device/install-app.prompt-happy.yaml](tc/device/install-app.prompt-happy.yaml) | `tizen-sdk.install-app.prompt-happy` | `install-app` | device | Prompt |
| `TC-P-050` | Prompt — Install and run app | [tc/device/install-app.prompt-run.yaml](tc/device/install-app.prompt-run.yaml) | `tizen-sdk.install-app.prompt-run` | `install-app` | device | Prompt |
| `TC-P-051` | Prompt — Install app on specific device | [tc/device/install-app.prompt-serial.yaml](tc/device/install-app.prompt-serial.yaml) | `tizen-sdk.install-app.prompt-serial` | `install-app` | device | Prompt |
| `TC-P-052` | Prompt — Take a screenshot with custom path | [tc/device/screenshot.prompt-output-path.yaml](tc/device/screenshot.prompt-output-path.yaml) | `tizen-sdk.screenshot.prompt-output-path` | `screenshot` | device | Prompt |
| `TC-P-053` | Prompt — Take screenshot on specific device | [tc/device/screenshot.prompt-serial.yaml](tc/device/screenshot.prompt-serial.yaml) | `tizen-sdk.screenshot.prompt-serial` | `screenshot` | device | Prompt |
| `TC-P-054` | Prompt — Download emulator package | [tc/sdk/download-emulator-package.prompt-variant1.yaml](tc/sdk/download-emulator-package.prompt-variant1.yaml) | `tizen-sdk.download-emulator-package.prompt-variant1` | `download-emulator-package` | mutating | Prompt |
| `TC-P-055` | Prompt 1 — Debug my native Tizen app | [tc/debug/gdb-debug.prompt-happy.yaml](tc/debug/gdb-debug.prompt-happy.yaml) | `tizen-sdk.gdb-debug.prompt-happy` | `gdb-debug` | device | Prompt |
| `TC-P-056` | Prompt — Debug native app in launch mode | [tc/debug/gdb-debug.prompt-launch.yaml](tc/debug/gdb-debug.prompt-launch.yaml) | `tizen-sdk.gdb-debug.prompt-launch` | `gdb-debug` | device | Prompt |
| `TC-P-057` | Prompt — Debug native app with breakpoints | [tc/debug/gdb-debug.prompt-breakpoints.yaml](tc/debug/gdb-debug.prompt-breakpoints.yaml) | `tizen-sdk.gdb-debug.prompt-breakpoints` | `gdb-debug` | device | Prompt |
| `TC-P-058` | Prompt — Debug native app on specific device | [tc/debug/gdb-debug.prompt-serial.yaml](tc/debug/gdb-debug.prompt-serial.yaml) | `tizen-sdk.gdb-debug.prompt-serial` | `gdb-debug` | device | Prompt |
| `TC-P-059` | Prompt — Debug my Tizen .NET app | [tc/debug/dotnet-debug.prompt-happy.yaml](tc/debug/dotnet-debug.prompt-happy.yaml) | `tizen-sdk.dotnet-debug.prompt-happy` | `dotnet-debug` | device | Prompt |
| `TC-P-060` | Prompt — Debug .NET app in launch mode | [tc/debug/dotnet-debug.prompt-launch.yaml](tc/debug/dotnet-debug.prompt-launch.yaml) | `tizen-sdk.dotnet-debug.prompt-launch` | `dotnet-debug` | device | Prompt |
| `TC-P-061` | Prompt — Debug .NET app with breakpoints | [tc/debug/dotnet-debug.prompt-breakpoints.yaml](tc/debug/dotnet-debug.prompt-breakpoints.yaml) | `tizen-sdk.dotnet-debug.prompt-breakpoints` | `dotnet-debug` | device | Prompt |
| `TC-P-062` | Prompt — Debug .NET app on specific device | [tc/debug/dotnet-debug.prompt-serial.yaml](tc/debug/dotnet-debug.prompt-serial.yaml) | `tizen-sdk.dotnet-debug.prompt-serial` | `dotnet-debug` | device | Prompt |
| `TC-P-063` | Prompt — Force reinstall netcoredbg | [tc/debug/dotnet-debug.prompt-force.yaml](tc/debug/dotnet-debug.prompt-force.yaml) | `tizen-sdk.dotnet-debug.prompt-force` | `dotnet-debug` | device | Prompt |
| `TC-P-064` | Prompt 1 — Debug my Tizen web app | [tc/debug/webapp-debug.prompt-happy.yaml](tc/debug/webapp-debug.prompt-happy.yaml) | `tizen-sdk.webapp-debug.prompt-happy` | `webapp-debug` | device | Prompt |
| `TC-P-065` | Prompt — Debug web app with custom port | [tc/debug/webapp-debug.prompt-custom-port.yaml](tc/debug/webapp-debug.prompt-custom-port.yaml) | `tizen-sdk.webapp-debug.prompt-custom-port` | `webapp-debug` | device | Prompt |
| `TC-P-066` | Prompt — Debug web app on specific device | [tc/debug/webapp-debug.prompt-serial.yaml](tc/debug/webapp-debug.prompt-serial.yaml) | `tizen-sdk.webapp-debug.prompt-serial` | `webapp-debug` | device | Prompt |
| `TC-P-067` | Prompt — Debug web app with custom timeout | [tc/debug/webapp-debug.prompt-timeout.yaml](tc/debug/webapp-debug.prompt-timeout.yaml) | `tizen-sdk.webapp-debug.prompt-timeout` | `webapp-debug` | device | Prompt |
| `TC-P-068` | Prompt — Install platform package | [tc/sdk/platform-install.prompt-variant1.yaml](tc/sdk/platform-install.prompt-variant1.yaml) | `tizen-sdk.platform-install.prompt-variant1` | `platform-install` | mutating | Prompt |
| `TC-P-069` | Prompt — Install mobile platform with IOT-Headed | [tc/sdk/download-mobile-platform.prompt-iot-headed.yaml](tc/sdk/download-mobile-platform.prompt-iot-headed.yaml) | `tizen-sdk.download-mobile-platform.prompt-iot-headed` | `download-mobile-platform` | mutating | Prompt |
| `TC-P-070` | Prompt 1 — Take a screenshot of the emulator | [tc/device/screenshot.prompt-happy.yaml](tc/device/screenshot.prompt-happy.yaml) | `tizen-sdk.screenshot.prompt-happy` | `screenshot` | device | Prompt |
| `TC-P-071` | Prompt — List connected devices | [tc/device/sdb-helper.prompt-list-devices.yaml](tc/device/sdb-helper.prompt-list-devices.yaml) | `tizen-sdk.sdb-helper.prompt-list-devices` | `sdb-helper` | device | Prompt |
| `TC-P-072` | Prompt — Run shell command on device | [tc/device/sdb-helper.prompt-shell.yaml](tc/device/sdb-helper.prompt-shell.yaml) | `tizen-sdk.sdb-helper.prompt-shell` | `sdb-helper` | device | Prompt |
| `TC-P-073` | Prompt — Forward port on device | [tc/device/sdb-helper.prompt-forward.yaml](tc/device/sdb-helper.prompt-forward.yaml) | `tizen-sdk.sdb-helper.prompt-forward` | `sdb-helper` | device | Prompt |
| `TC-P-074` | Prompt — Reboot device | [tc/device/sdb-helper.prompt-reboot.yaml](tc/device/sdb-helper.prompt-reboot.yaml) | `tizen-sdk.sdb-helper.prompt-reboot` | `sdb-helper` | device | Prompt |
| `TC-P-075` | Prompt — Take screenshot via sdb | [tc/device/sdb-helper.prompt-screenshot.yaml](tc/device/sdb-helper.prompt-screenshot.yaml) | `tizen-sdk.sdb-helper.prompt-screenshot` | `sdb-helper` | device | Prompt |
| `TC-P-076` | Prompt — Run command on specific device | [tc/device/sdb-helper.prompt-serial.yaml](tc/device/sdb-helper.prompt-serial.yaml) | `tizen-sdk.sdb-helper.prompt-serial` | `sdb-helper` | device | Prompt |
| `TC-P-077` | Prompt — Install custom rootstrap | [tc/sdk/install-rootstrap.prompt-variant1.yaml](tc/sdk/install-rootstrap.prompt-variant1.yaml) | `tizen-sdk.install-rootstrap.prompt-variant1` | `install-rootstrap` | mutating | Prompt |
| `TC-P-078` | Prompt 1 — Run shell command on the device | [tc/device/sdb-helper.prompt-happy.yaml](tc/device/sdb-helper.prompt-happy.yaml) | `tizen-sdk.sdb-helper.prompt-happy` | `sdb-helper` | device | Prompt |
| `TC-P-079` | Prompt — Push file to device | [tc/device/file-transfer.prompt-push.yaml](tc/device/file-transfer.prompt-push.yaml) | `tizen-sdk.file-transfer.prompt-push` | `file-transfer` | device | Prompt |
| `TC-P-080` | Prompt — Pull file from device | [tc/device/file-transfer.prompt-pull.yaml](tc/device/file-transfer.prompt-pull.yaml) | `tizen-sdk.file-transfer.prompt-pull` | `file-transfer` | device | Prompt |
| `TC-P-081` | Prompt — Transfer file to specific device | [tc/device/file-transfer.prompt-serial.yaml](tc/device/file-transfer.prompt-serial.yaml) | `tizen-sdk.file-transfer.prompt-serial` | `file-transfer` | device | Prompt |
| `TC-P-082` | Prompt — Transfer file with UTF-8 path | [tc/device/file-transfer.prompt-utf8.yaml](tc/device/file-transfer.prompt-utf8.yaml) | `tizen-sdk.file-transfer.prompt-utf8` | `file-transfer` | device | Prompt |
| `TC-P-083` | Prompt — DotNET setup | [tc/sdk/dotnet-setup.prompt-variant1.yaml](tc/sdk/dotnet-setup.prompt-variant1.yaml) | `tizen-sdk.dotnet-setup.prompt-variant1` | `dotnet-setup` | mutating | Prompt |
| `TC-P-084` | Prompt — Force reinstall .NET workload | [tc/sdk/dotnet-setup.prompt-force.yaml](tc/sdk/dotnet-setup.prompt-force.yaml) | `tizen-sdk.dotnet-setup.prompt-force` | `dotnet-setup` | mutating | Prompt |
| `TC-P-085` | Prompt — Install specific .NET workload version | [tc/sdk/dotnet-setup.prompt-version.yaml](tc/sdk/dotnet-setup.prompt-version.yaml) | `tizen-sdk.dotnet-setup.prompt-version` | `dotnet-setup` | mutating | Prompt |
| `TC-P-086` | Prompt 1 — Push file to device | [tc/device/file-transfer.prompt-happy.yaml](tc/device/file-transfer.prompt-happy.yaml) | `tizen-sdk.file-transfer.prompt-happy` | `file-transfer` | device | Prompt |
| `TC-P-087` | Prompt — Scan all subnets for devices | [tc/device/remote-device.prompt-scan-all.yaml](tc/device/remote-device.prompt-scan-all.yaml) | `tizen-sdk.remote-device.prompt-scan-all` | `remote-device` | device | Prompt |
| `TC-P-088` | Prompt — Scan specific subnet | [tc/device/remote-device.prompt-scan-subnet.yaml](tc/device/remote-device.prompt-scan-subnet.yaml) | `tizen-sdk.remote-device.prompt-scan-subnet` | `remote-device` | device | Prompt |
| `TC-P-089` | Prompt 1 — Scan network for Tizen devices | [tc/device/remote-device.prompt-happy.yaml](tc/device/remote-device.prompt-happy.yaml) | `tizen-sdk.remote-device.prompt-happy` | `remote-device` | device | Prompt |
| `TC-P-090` | Prompt — Connect to remote device | [tc/device/remote-device.prompt-connect.yaml](tc/device/remote-device.prompt-connect.yaml) | `tizen-sdk.remote-device.prompt-connect` | `remote-device` | device | Prompt |
| `TC-P-091` | Prompt — Connect with custom port | [tc/device/remote-device.prompt-connect-custom-port.yaml](tc/device/remote-device.prompt-connect-custom-port.yaml) | `tizen-sdk.remote-device.prompt-connect-custom-port` | `remote-device` | device | Prompt |
| `TC-P-092` | Prompt — Disconnect from remote device | [tc/device/remote-device.prompt-disconnect.yaml](tc/device/remote-device.prompt-disconnect.yaml) | `tizen-sdk.remote-device.prompt-disconnect` | `remote-device` | device | Prompt |
| `TC-P-093` | Prompt — Add remote device bookmark | [tc/device/remote-device.prompt-add-bookmark.yaml](tc/device/remote-device.prompt-add-bookmark.yaml) | `tizen-sdk.remote-device.prompt-add-bookmark` | `remote-device` | device | Prompt |
| `TC-P-094` | Prompt — List remote device bookmarks | [tc/device/remote-device.prompt-list-bookmarks.yaml](tc/device/remote-device.prompt-list-bookmarks.yaml) | `tizen-sdk.remote-device.prompt-list-bookmarks` | `remote-device` | device | Prompt |
| `TC-P-095` | Prompt — Remove remote device bookmark | [tc/device/remote-device.prompt-remove-bookmark.yaml](tc/device/remote-device.prompt-remove-bookmark.yaml) | `tizen-sdk.remote-device.prompt-remove-bookmark` | `remote-device` | device | Prompt |
| `TC-P-096` | Prompt — Rename remote device bookmark | [tc/device/remote-device.prompt-edit-rename.yaml](tc/device/remote-device.prompt-edit-rename.yaml) | `tizen-sdk.remote-device.prompt-edit-rename` | `remote-device` | device | Prompt |
| `TC-P-097` | Prompt — Change IP of remote device bookmark | [tc/device/remote-device.prompt-edit-ip.yaml](tc/device/remote-device.prompt-edit-ip.yaml) | `tizen-sdk.remote-device.prompt-edit-ip` | `remote-device` | device | Prompt |
| `TC-P-098` | Prompt — Update SDK packages | [tc/sdk/update-package.prompt-variant1.yaml](tc/sdk/update-package.prompt-variant1.yaml) | `tizen-sdk.update-package.prompt-variant1` | `update-package` | mutating | Prompt |
| `TC-P-099` | Prompt — Dry-run SDK package update | [tc/sdk/update-package.prompt-dry-run.yaml](tc/sdk/update-package.prompt-dry-run.yaml) | `tizen-sdk.update-package.prompt-dry-run` | `update-package` | safe | Prompt |
| `TC-P-100` | Prompt 1 — Scaffold a new Playwright test | [tc/test/playwright-test.prompt-happy.yaml](tc/test/playwright-test.prompt-happy.yaml) | `tizen-sdk.playwright-test.prompt-happy` | `playwright-test` | device | Prompt |
| `TC-P-101` | Prompt — Start dlog monitoring for crash detection | [tc/dlog-analyzer/dlog-analyzer.prompt-happy.yaml](tc/dlog-analyzer/dlog-analyzer.prompt-happy.yaml) | `tizen-sdk.dlog-analyzer.prompt-happy` | `dlog-analyzer` | device | Prompt |
| `TC-P-102` | Prompt — Scaffold Playwright test with force | [tc/test/playwright-test.prompt-scaffold-force.yaml](tc/test/playwright-test.prompt-scaffold-force.yaml) | `tizen-sdk.playwright-test.prompt-scaffold-force` | `playwright-test` | device | Prompt |
| `TC-P-103` | Prompt — Run Playwright tests | [tc/test/playwright-test.prompt-run.yaml](tc/test/playwright-test.prompt-run.yaml) | `tizen-sdk.playwright-test.prompt-run` | `playwright-test` | device | Prompt |
| `TC-P-104` | Prompt — Run Playwright with no setup | [tc/test/playwright-test.prompt-no-setup.yaml](tc/test/playwright-test.prompt-no-setup.yaml) | `tizen-sdk.playwright-test.prompt-no-setup` | `playwright-test` | device | Prompt |
| `TC-P-105` | Prompt — Run Playwright with custom port and timeout | [tc/test/playwright-test.prompt-custom-port.yaml](tc/test/playwright-test.prompt-custom-port.yaml) | `tizen-sdk.playwright-test.prompt-custom-port` | `playwright-test` | device | Prompt |
| `TC-P-106` | Prompt — Run Playwright on specific device | [tc/test/playwright-test.prompt-serial.yaml](tc/test/playwright-test.prompt-serial.yaml) | `tizen-sdk.playwright-test.prompt-serial` | `playwright-test` | device | Prompt |
| `TC-P-107` | Prompt — Show plugin schema | [tc/meta/meta.prompt-schema.yaml](tc/meta/meta.prompt-schema.yaml) | `tizen-sdk.meta.prompt-schema` | `--schema` | safe | Prompt |
| `TC-P-108` | Prompt — Run doctor health check | [tc/meta/meta.prompt-doctor.yaml](tc/meta/meta.prompt-doctor.yaml) | `tizen-sdk.meta.prompt-doctor` | `--doctor` | safe | Prompt |
| `TC-P-109` | Prompt — Show capabilities | [tc/meta/meta.prompt-capabilities.yaml](tc/meta/meta.prompt-capabilities.yaml) | `tizen-sdk.meta.prompt-capabilities` | `--capabilities` | safe | Prompt |
| `TC-P-110` | Prompt — List available commands | [tc/meta/meta.prompt-list-commands.yaml](tc/meta/meta.prompt-list-commands.yaml) | `tizen-sdk.meta.prompt-list-commands` | `no-args` | safe | Prompt |
| `TC-P-111` | Run `tizen build` (guard rule #1 — tizen CLI forbidden) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 1)* | `tizen-sdk.guard.tizen-cli-forbidden` | `build-project` | safe | CLI + Prompt |
| `TC-P-112` | Hand-write config.xml (guard rule #2 — Tizen project files must not be hand-created) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 2)* | `tizen-sdk.guard.no-handwrite-manifest` | `create-project` | safe | CLI + Prompt |
| `TC-P-113` | Use invalid tz install flags (guard rule #3 — only -e and -p accepted) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 3)* | `tizen-sdk.guard.invalid-install-flags` | `install-app` | safe | CLI + Prompt |
| `TC-P-114` | Use tz build with -p instead of -w (guard rule #4 — build uses -w not -p) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 4)* | `tizen-sdk.guard.build-w-not-p` | `build-project` | safe | CLI + Prompt |
| `TC-P-115` | Use wrong sdb path (guard rule #5 — sdb is at <sdk>/tools/sdb) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 5)* | `tizen-sdk.guard.sdb-path` | `sdb-helper` | safe | CLI + Prompt |
| `TC-P-116` | Manually configure gdbserver (guard rule #6 — no manual gdb/port-forward setup) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 6)* | `tizen-sdk.guard.no-manual-gdb` | `gdb-debug` | safe | CLI + Prompt |
| `TC-P-117` | Use bash syntax on Windows (guard rule #7 — no bash syntax in cmd.exe) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 7)* | `tizen-sdk.guard.no-bash-on-windows` | `device-manager` | safe | CLI + Prompt |
| `TC-P-118` | Run native binary with node (guard rule #8 — native executables must not be run with node) | [tc/meta/guard-rules.prompt.yaml](tc/meta/guard-rules.prompt.yaml) *(doc 8)* | `tizen-sdk.guard.no-node-on-native` | `sdb-helper` | safe | CLI + Prompt |

> `tc/meta/guard-rules.prompt.yaml` 은 멀티 도큐먼트 YAML 입니다 — `TC-P-111`~`TC-P-118`
> 8건이 `---` 로 구분되어 한 파일 안에 들어 있으며, *(doc n)* 은 그 문서 순번입니다.

---

## 4. CSV TC ID 가 없는 YAML 케이스

CSV 원본에 대응 행이 없고, YAML 쪽에서 자체적으로 추가한 케이스입니다.
대부분 `missing-required` / `invalid-*` 계열의 음성(negative) 테스트입니다.

| YAML 파일 | YAML `id` | `command` | `tier` | 레인 | 설명 |
| --- | --- | --- | --- | --- | --- |
| [tc/certificate/certificate-manager.get-sdk-data-path.happy.yaml](tc/certificate/certificate-manager.get-sdk-data-path.happy.yaml) | `tizen-sdk.certificate-manager.get-sdk-data-path.happy` | `certificate-manager` | safe | CLI | certificate-manager get-sdk-data-path returns success with SDK data path |
| [tc/certificate/certificate-manager.list-profiles.happy.yaml](tc/certificate/certificate-manager.list-profiles.happy.yaml) | `tizen-sdk.certificate-manager.list-profiles.happy` | `certificate-manager` | safe | CLI | certificate-manager list-profiles returns success with profile list |
| [tc/certificate/certificate-manager.missing-required.yaml](tc/certificate/certificate-manager.missing-required.yaml) | `tizen-sdk.certificate-manager.missing-required` | `certificate-manager` | safe | CLI | certificate-manager generate-author fails when --name and --password are missing |
| [tc/debug/dotnet-debug.missing-required.yaml](tc/debug/dotnet-debug.missing-required.yaml) | `tizen-sdk.dotnet-debug.missing-required` | `dotnet-debug` | device | CLI | dotnet-debug fails with invalid_argument when --app-id is missing |
| [tc/debug/gdb-debug.missing-required.yaml](tc/debug/gdb-debug.missing-required.yaml) | `tizen-sdk.gdb-debug.missing-required` | `gdb-debug` | device | CLI | gdb-debug fails with invalid_argument when --app-id and --binary are missing |
| [tc/debug/webapp-debug.missing-required.yaml](tc/debug/webapp-debug.missing-required.yaml) | `tizen-sdk.webapp-debug.missing-required` | `webapp-debug` | device | CLI | webapp-debug fails with invalid_argument when --app-id is missing |
| [tc/device/create-emulator.missing-required.yaml](tc/device/create-emulator.missing-required.yaml) | `tizen-sdk.create-emulator.missing-required` | `create-emulator` | device | CLI | create-emulator fails with user_input_required when --size is missing for create action |
| [tc/device/emulator-manager.missing-required.yaml](tc/device/emulator-manager.missing-required.yaml) | `tizen-sdk.emulator-manager.missing-required` | `emulator-manager` | device | CLI | emulator-manager create fails with user_input_required when --size is missing |
| [tc/device/file-transfer.missing-required.yaml](tc/device/file-transfer.missing-required.yaml) | `tizen-sdk.file-transfer.missing-required` | `file-transfer` | device | CLI | file-transfer fails with invalid_argument when --direction and --remote are missing |
| [tc/device/file-transfer.pull-missing-remote.yaml](tc/device/file-transfer.pull-missing-remote.yaml) | `tizen-sdk.file-transfer.pull-missing-remote` | `file-transfer` | device | CLI | pull of a non-existent device path fails with remote_path_not_found (issue #95) |
| [tc/device/file-transfer.prompt-pull-missing.yaml](tc/device/file-transfer.prompt-pull-missing.yaml) | `tizen-sdk.file-transfer.prompt-pull-missing` | `file-transfer` | device | Prompt | issue #95 prompt — missing device path + Windows destination; LLM reports remote_path_not_found and stops (max_tool_calls 3) |
| [tc/device/install-app.missing-required.yaml](tc/device/install-app.missing-required.yaml) | `tizen-sdk.install-app.missing-required` | `install-app` | device | CLI | install-app fails with invalid_argument when --package is missing |
| [tc/device/remote-device.scan-happy.yaml](tc/device/remote-device.scan-happy.yaml) | `tizen-sdk.remote-device.scan-happy` | `remote-device` | device | CLI | remote-device scan returns success with scan results |
| [tc/device/sdb-helper.missing-required.yaml](tc/device/sdb-helper.missing-required.yaml) | `tizen-sdk.sdb-helper.missing-required` | `sdb-helper` | device | CLI | sdb-helper fails with invalid_argument when --request is missing |
| [tc/dlog-analyzer/dlog-analyzer.missing-required.yaml](tc/dlog-analyzer/dlog-analyzer.missing-required.yaml) | `tizen-sdk.dlog-analyzer.missing-required` | `dlog-analyzer` | device | CLI | dlog-analyzer fails with invalid_argument when --action is missing |
| [tc/project/build-project.missing-required.yaml](tc/project/build-project.missing-required.yaml) | `tizen-sdk.build-project.missing-required` | `build-project` | safe | CLI | build-project fails with invalid_argument when --project is missing |
| [tc/project/create-project.invalid-type.yaml](tc/project/create-project.invalid-type.yaml) | `tizen-sdk.create-project.invalid-type` | `create-project` | safe | CLI | create-project fails with invalid_argument when --type is not a valid choice |
| [tc/project/create-project.missing-required.yaml](tc/project/create-project.missing-required.yaml) | `tizen-sdk.create-project.missing-required` | `create-project` | safe | CLI | create-project fails with invalid_argument when all required options are missing |
| [tc/project/project-delete.missing-required.yaml](tc/project/project-delete.missing-required.yaml) | `tizen-sdk.project-delete.missing-required` | `project-delete` | safe | CLI | project-delete fails with invalid_argument when --project is missing |
| [tc/sdk/check-disk-space.happy.yaml](tc/sdk/check-disk-space.happy.yaml) | `tizen-sdk.check-disk-space.happy` | `check-disk-space` | safe | CLI | check-disk-space returns success with disk_free info |
| [tc/sdk/check-node.happy.yaml](tc/sdk/check-node.happy.yaml) | `tizen-sdk.check-node.happy` | `check-node` | safe | CLI | check-node returns success with node_version matching v<digits> |
| [tc/sdk/install-rootstrap.missing-required.yaml](tc/sdk/install-rootstrap.missing-required.yaml) | `tizen-sdk.install-rootstrap.missing-required` | `install-rootstrap` | safe | CLI | install-rootstrap fails with invalid_argument when --zip-path is missing |
| [tc/sdk/platform-install.missing-required.yaml](tc/sdk/platform-install.missing-required.yaml) | `tizen-sdk.platform-install.missing-required` | `platform-install` | safe | CLI | platform-install fails with invalid_argument when --platform-version is missing |
| [tc/sdk/sdk-init.invalid-path.yaml](tc/sdk/sdk-init.invalid-path.yaml) | `tizen-sdk.sdk-init.invalid-path` | `sdk-init` | safe | CLI | sdk-init fails when path does not exist |
| [tc/sdk/sdk-install-custom-repo.missing-required.yaml](tc/sdk/sdk-install-custom-repo.missing-required.yaml) | `tizen-sdk.sdk-install-custom-repo.missing-required` | `sdk-install-custom-repo` | safe | CLI | sdk-install-custom-repo fails with invalid_argument when --repo-url is missing |
| [tc/sdk/sdk-repo-info.happy.yaml](tc/sdk/sdk-repo-info.happy.yaml) | `tizen-sdk.sdk-repo-info.happy` | `sdk-repo-info` | safe | CLI | sdk-repo-info returns success with repository URL info |
| [tc/sdk/validate-repo-url.happy.yaml](tc/sdk/validate-repo-url.happy.yaml) | `tizen-sdk.validate-repo-url.happy` | `validate-repo-url` | safe | CLI | validate-repo-url returns success for the official Tizen SDK repository |
| [tc/sdk/validate-repo-url.missing-required.yaml](tc/sdk/validate-repo-url.missing-required.yaml) | `tizen-sdk.validate-repo-url.missing-required` | `validate-repo-url` | safe | CLI | validate-repo-url fails with invalid_argument when --repo-url is missing |
| [tc/test/playwright-test.missing-required.yaml](tc/test/playwright-test.missing-required.yaml) | `tizen-sdk.playwright-test.missing-required` | `playwright-test` | device | CLI | playwright-test fails with invalid_argument when --app-id is missing for a run |

---

## 5. 커버리지 갭

### `TC-CLI-*` — 확인 범위 1 ~ 137, 매핑 136건, 공백 1건

`TC-CLI-022`(List projects) 1건만 YAML 에 없고, 나머지는 모두 존재합니다.
이 공백은 **의도된 것**입니다 — `list-projects` 명령 자체가 플러그인에 존재하지
않아 해당 TC 를 삭제했습니다(커밋 `6d839ae`). 되살릴 대상이 아닙니다.

### `TC-P-*` — 확인 범위 1 ~ 118, 매핑 118건, 공백 0건

1 ~ 118 번호가 모두 YAML 로 존재합니다. 번호 공백 없음. ✓

> 번호 공백이 0건이라는 것은 **TC ID 가 빠짐없이 존재한다**는 뜻일 뿐입니다.
> CSV 본문이 DRM 으로 잠겨 있어(6장 참고) 각 YAML 의 내용이 CSV 원본 TC 의
> 전제조건·절차·기대결과와 일치하는지는 검증되지 않았습니다.

### 실행 검증 상태

TC ID 커버리지(위)와 **실제 실행 검증**은 별개입니다.
prompt 레인 118건은 모두 실행 완료입니다
— 최초 41건(커맨드 33 + 가드룰 8) + 2026-08-31 세션의 draft 77건(3회 시도, 77/77 승격).

| status | 케이스 수 |
| --- | ---: |
| `draft` | 163 |
| `approved` | 110 |
| `candidate` | 8 |

`draft` 163건은 대부분 cli 레인 TC 로, 아직 전 레인 실행 검증이 끝나지 않은 케이스입니다.

---

## 6. 제약 사항

- 첨부된 `Updated_Tizen.AI.Plugins.-.Test.Suite.csv` / `...Suite2.csv` 는 파일 선두가
  `## NASCA DRM FILE - VER1.00 ##` 인 **DRM 암호화 파일**이라 본문을 읽을 수 없었습니다.
- 따라서 이 매핑 테이블의 **CSV 측 정보(TC ID·제목)는 YAML 최상단 주석에 이미 기록된 값**을
  역추출한 것입니다. CSV 의 나머지 컬럼(전제조건, 실행 절차, 기대 결과 등)은 반영되지 않았습니다.
- CSV 원본 전체 컬럼까지 매핑하려면 DRM 이 해제된 CSV(또는 XLSX)를 다시 주시면
  각 TC 의 상세 컬럼까지 포함해 테이블을 확장할 수 있습니다.

## 7. 재생성 방법

이 문서는 `tests/tc/**/*.yaml` 을 스캔해 생성했습니다. YAML 을 추가·수정한 뒤에는
각 파일 첫 줄에 `# TC-CLI-nnn: <제목>` 형식의 주석을 유지해야 매핑이 깨지지 않습니다.
