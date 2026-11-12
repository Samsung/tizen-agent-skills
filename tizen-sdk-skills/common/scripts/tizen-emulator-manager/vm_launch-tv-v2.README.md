# vm_launch-tv-v2.template — Apple Silicon TV 에뮬레이터 conf 생성 절차

`vm_launch-tv-v2.template`은 Apple Silicon(ARM64) Mac에서 **TV 에뮬레이터(TV-Samsung
프로필, TV SDK 10.0, emulator-v2 스택)를 TCG 소프트웨어 가상화로 직접 기동**할 때 쓰는
`vm_launch.conf` 템플릿이다.

## 왜 em-cli를 거치지 않는가

em-cli(em-lib.jar)의 `checkVTProperty`는 이미지 버전 ≥ 3.0이면 macOS에서
`isVTSupported()==false`(HAXM 없음)일 때 무조건 `CPUVT.Invalid` 예외를 던진다.
HAXM은 Intel 전용이라 Apple Silicon에는 드라이버 자체가 없고, `hwVirtualization=false`
VM 설정으로도 우회되지 않는다(바이트코드 확인 완료). 따라서 SDK의 emulator-v2
(QEMU 9.x + VirGL) 바이너리를 **`-conf`로 직접 실행**한다. 템플릿 내용은 실제로
부팅에 성공한 em-cli 생성 conf(`T-samsung-10.0-x86_64`)에서 가져온 것이다.

## 템플릿 플레이스홀더

| 플레이스홀더 | 의미 | 예 |
| --- | --- | --- |
| `__VM_NAME__` | VM 이름 (이미지·로그 파일명에도 사용) | `TV-1080` |
| `__SDK_PATH__` | Tizen SDK 설치 경로 (`~/.tizen.sdk.path.config` 참조) | `/Users/<u>/tizen-sdk` |
| `__SDK_DATA_PATH__` | Tizen SDK 데이터 경로 | `/Users/<u>/tizen-sdk-data` |

## VM 생성·기동 절차 (conf 이외 필수 준비물)

템플릿만으로는 부족하다. 아래 파일들이 conf가 참조하는 경로에 존재해야 한다.

1. **conf 생성** (플레이스홀더 치환):

   ```bash
   mkdir -p "<SDK_DATA>/emulator/vms/<VM>/logs"
   sed -e "s/__VM_NAME__/<VM>/g" \
       -e "s|__SDK_PATH__|<SDK_PATH>|g" \
       -e "s|__SDK_DATA_PATH__|<SDK_DATA_PATH>|g" \
       vm_launch-tv-v2.template > "<SDK_DATA>/emulator/vms/<VM>/vm_launch.conf"
   ```

2. **자식 디스크 이미지** (부팅에 사용하는 베이스 이미지는 v2 디렉터리의 것 —
   `emulator-images-v2/` 이며, v1 `emulator-images/`가 아님):

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f qcow2 \
     -b "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-images-v2/tv-samsung-10.0-x86_64/emulimg-10.0.x86_64" \
     -F qcow2 "<SDK_DATA>/emulator/vms/<VM>/emulimg-<VM>.x86_64"
   ```

3. **swap 이미지** (raw):

   ```bash
   "<SDK_PATH>/tools/emulator/bin/qemu-img" create -f raw \
     "<SDK_DATA>/emulator/vms/<VM>/swap-<VM>.img" 512M
   ```

4. **tuner 테이블** — `maru-virtual-tuner` 디바이스가 참조한다. 없으면 QEMU가
   기동에 실패한다. 다른 VM의 `tuner_default.cfg`(또는 새 빈 파일)를 복사:

   ```bash
   cp <기존 VM>/tuner_default.cfg "<SDK_DATA>/emulator/vms/<VM>/tuner_default.cfg"
   ```

5. **quarantine 제거** — SDK/ZIP 재설치 후 첫 실행이면 필수 (남아 있으면
   `zsh: killed` 또는 `library load disallowed by system policy`):

   ```bash
   chmod -R u+w "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   xattr -dr com.apple.quarantine "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2"
   ```

6. **실행**:

   ```bash
   "<SDK_PATH>/platforms/tizen-10.0/tv-samsung/emulator-v2/bin/emulator-x86_64" \
     --conf "<SDK_DATA>/emulator/vms/<VM>/vm_launch.conf" > /tmp/tv-qemu.log 2>&1 &
   ```

   `emulator-x86_64`는 universal 바이너리이며 래퍼가 Apple Silicon에서 arm64
   네이티브로 재실행한다(Rosetta 이중 에뮬레이션 회피).

7. **부팅 판정** — TCG라 부팅 1~2분. `<SDK_PATH>/tools/sdb devices`에
   `emulator-NNNNN  device  <VM>`이 뜨면 완료. 게스트 커널 로그는
   `<SDK_DATA>/emulator/vms/<VM>/logs/emulator.klog`에 기록된다.

## 버전 격차 주의 (다른 SDK 버전에 적용할 때)

템플릿의 아래 값은 **TV SDK 10.0 기준**이며, 버전마다 확인해서 치환해야 한다:

- `platforms/tizen-10.0/tv-samsung/...` 경로 (`tizen-<X.Y>`로 변경)
- `image_ver=10.0.6`, `platform_version=tizen-10.0`
- 베이스 이미지 디렉터리 `emulator-images-v2/tv-samsung-10.0-x86_64`
- 스킨 `skins/tv-1920x1080` 존재 여부
- `append`의 `model=4ksero` (TV 모델명)

`-accel tcg,thread=multi`, `-cpu max`, `-display sdl,gl=on`,
`-device virtio-vga-gl`, `force_pat`는 Apple Silicon에서 반드시 필요한 옵션이다
(`-cpu max` 누락 시 qemu64 기본값이 최신 glibc 명령어를 못 찾아 커널 패닉 —
invalid opcode — 발생).
