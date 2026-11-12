# Apple Silicon Mac용 TV 에뮬레이터 실행 설정

[English](vm-launch-tv-v2.md) | 한국어

`vm-launch-tv-v2.conf.template`은 Apple Silicon(ARM64) Mac에서 **TV 에뮬레이터(`tv-samsung`
프로필, Tizen 10.0, emulator-v2 스택)를 TCG 소프트웨어 에뮬레이션으로 부팅**할 때 쓰는 실행
설정 템플릿입니다.
[`tizen-launch-emulator` skill](../../skills/tizen-launch-emulator/SKILL.md#apple-silicon-arm64-macs-tv-emulator-launch)이
이 템플릿을 사용하며, 이 문서는 같은 절차를 더 자세히 설명합니다.

## em-cli를 거치지 않는 이유

이미지 버전 3.0 이상에서 em-cli의 `checkVTProperty`(`em-lib.jar`)는 macOS에서
`isVTSupported()`가 false일 때, 즉 HAXM이 없을 때 항상 `CPUVT.Invalid`를 던집니다. HAXM은
Intel 전용이라 Apple Silicon에는 없고, VM 설정의 `hwVirtualization=false`로도 이 검사를 피할 수
없습니다. 그래서 SDK의 emulator-v2 바이너리(QEMU 9.x, VirGL)를 `--conf`로 직접 실행합니다.
템플릿은 실제로 부팅에 성공한 em-cli 생성 설정에서 가져왔습니다.

## 자리 표시

| 자리 표시 | 의미 | 예 |
| --- | --- | --- |
| `__VM_NAME__` | VM 이름. 이미지와 로그 파일 이름에도 쓰입니다 | `TV-1080` |
| `__SDK_PATH__` | Tizen SDK 경로 (`~/.tizen.sdk.path.config`에 적혀 있음) | `/Users/<u>/tizen-sdk` |
| `__SDK_DATA_PATH__` | Tizen SDK 데이터 경로 | `/Users/<u>/tizen-sdk-data` |

아래 명령의 `<SDK_PATH>`, `<SDK_DATA_PATH>`, `<VM>`은 같은 값이고, `<VM_DIR>`은
`<SDK_DATA_PATH>/emulator/vms/<VM>`입니다. 명령을 실행하거나 보여 주기 전에 모든 자리 표시를
실제 경로로 바꾸세요.

## 절차

먼저 em-cli로 VM을 `--launch` 없이 만듭니다(`tizen-create-emulator`). 그러면 em-cli가 VM 폴더,
swap 이미지, `tuner_default.cfg`를 만들어 두므로, 3·4단계는 해당 파일이 없을 때만 필요합니다.

1. **설정 생성.** `vm_launch-v2.conf`로 만들고 em-cli가 만든 `vm_launch.conf`는 그대로 둡니다.

   ```bash
   mkdir -p "<VM_DIR>/logs"
   sed -e "s/__VM_NAME__/<VM>/g" \
       -e "s|__SDK_PATH__|<SDK_PATH>|g" \
       -e "s|__SDK_DATA_PATH__|<SDK_DATA_PATH>|g" \
       vm-launch-tv-v2.conf.template > "<VM_DIR>/vm_launch-v2.conf"
   ```

2. **자식 디스크 이미지.** v1 `emulator-images/`가 아니라 `emulator-images-v2/`의 기본
   이미지로 부팅합니다. **이 명령은 VM 디스크를 빈 디스크로 바꾸므로** 그 VM에 설치한 앱과
   데이터가 사라집니다. 방금 만든 VM이라면 잃을 것이 없지만, 기존 VM이라면 실행 전에 사용자에게
   확인받으세요.

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f qcow2 \
     -b "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-images-v2/tv-samsung-10.0-x86_64/emulimg-10.0.x86_64" \
     -F qcow2 "<VM_DIR>/emulimg-<VM>.x86_64"
   ```

3. **swap 이미지**(raw). `<VM_DIR>/swap-<VM>.img`가 없을 때만 만듭니다.

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f raw "<VM_DIR>/swap-<VM>.img" 512M
   ```

4. **tuner 테이블.** `<VM_DIR>/tuner_default.cfg`가 없을 때만 필요합니다. `maru-virtual-tuner`
   디바이스가 이 파일을 읽으며, 없으면 QEMU가 시작하지 못합니다. 플랫폼에 들어 있는 템플릿을
   복사합니다.

   ```bash
   cp "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-resources/tuner-template/tuner_default_template.cfg" \
     "<VM_DIR>/tuner_default.cfg"
   ```

5. **Gatekeeper 격리 해제(필요할 때만, 사용자 동의를 받은 뒤에만).** SDK나 ZIP을 새로 설치한
   직후에는 emulator-v2 바이너리에 macOS의 다운로드 격리 표시가 남아 있어, 실행이
   `zsh: killed`나 `library load disallowed by system policy`로 끝날 수 있습니다. 먼저
   확인합니다.

   ```bash
   xattr -l "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2/bin/emulator-x86_64.bin"
   ```

   `com.apple.quarantine`이 보이면, 이를 지우면 SDK의 `emulator-v2` 폴더에서 macOS 보안 표시가
   제거된다는 점을 사용자에게 설명하고, 동의를 받은 뒤에만 실행합니다.

   ```bash
   chmod -R u+w "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   xattr -dr com.apple.quarantine "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   ```

6. **실행.** `emulator-x86_64`는 universal 바이너리이고, 래퍼가 Apple Silicon에서 arm64 부분을
   네이티브로 다시 실행하므로 Rosetta 아래 이중 에뮬레이션이 일어나지 않습니다.

   ```bash
   nohup "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2/bin/emulator-x86_64" \
     --conf "<VM_DIR>/vm_launch-v2.conf" > "<VM_DIR>/logs/qemu-v2.log" 2>&1 &
   ```

7. **부팅 확인.** TCG라서 부팅에 1~2분 걸립니다. `tizen-device-manager`
   목록에 `<VM>`의 `emulator-NNNNN` 디바이스가 보이면 부팅된 것입니다(직접 확인:
   `<SDK_PATH>/tools/sdb devices`). 게스트 커널 로그는
   `<VM_DIR>/logs/emulator.klog`에, QEMU 출력은 `<VM_DIR>/logs/qemu-v2.log`에 기록됩니다.

## 다른 Tizen 버전에 쓸 때

템플릿의 다음 값은 **Tizen 10.0** 기준입니다. 다른 버전에서는 하나씩 확인해서 바꾸세요.

- `platforms/tizen-10.0/tv-samsung/...` 경로 (`tizen-<X.Y>`로 변경)
- `image_ver=10.0.6`, `platform_version=tizen-10.0`
- 기본 이미지 폴더 `emulator-images-v2/tv-samsung-10.0-x86_64`
- `skins/tv-1920x1080` 스킨이 있는지
- `append`의 `model=4ksero` (TV 모델 이름)

`platforms/tizen-<X.Y>/tv-samsung/emulator-v2/`가 없으면 그 버전에서는 이 방법을 쓸 수 없습니다.

Apple Silicon에서는 `-accel tcg,thread=multi`, `-cpu max`, `-display sdl,gl=on`,
`-device virtio-vga-gl`, 그리고 `append`의 `force_pat`가 반드시 필요합니다. `-cpu max`가 없으면
기본 CPU 모델 `qemu64`에 최신 glibc가 쓰는 명령어가 없어, 게스트 커널이 "invalid opcode"로
패닉합니다.
