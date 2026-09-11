# 스크린샷 enlightenment_info 폴백 추가 및 응답 이미지 포함

[English](screenshot-enlightenment-capture.en.md) | 한국어

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-02  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**대상:** `common/` (scripts/tizen-screenshot, lib/core, skills)  
**검증 환경:** `emulator-26101` (`tizen-vm-default`) 실기 검증 완료

---

## 개요

두 가지를 처리했습니다.

1. **`enlightenment_info` 캡처 방법 추가** — Tizen 윈도우 매니저를 통한 device-side 캡처
2. **응답에 이미지 포함** — envelope이 경로만 주던 것을 이미지 자체와 메타데이터까지 담도록 변경

작업 중 실기 검증에서 초기 구현의 **오류 세 건**이 드러나 모두 수정했습니다. 이 문서는 그 과정을 포함합니다.

---

## 1. enlightenment_info 캡처

### 왜 필요한가

검증에 쓴 에뮬레이터에는 기존 device-side 도구가 **하나도 없습니다.**

```
$ ls -l /usr/bin/screencapture /usr/bin/capture_screen
ls: cannot access '/usr/bin/screencapture': No such file or directory
ls: cannot access '/usr/bin/capture_screen': No such file or directory
```

Enlightenment는 Tizen의 윈도우 매니저이므로, 이런 플랫폼 이미지에서도 동작합니다. `/dev/fb0`와 달리 **합성된 화면**을 반환한다는 점이 중요합니다 — 프레임버퍼는 커널 콘솔만 잡히는 경우가 많습니다.

### 실기 검증에서 드러난 오류 3건

초기 구현은 문서에서 흔히 보이는 `-dump_topvwins` 표기를 썼는데, 실제로는 셋 다 틀렸습니다.

#### (1) 존재하지 않는 옵션

```
$ enlightenment_info -dump_topvwins /tmp/e_probe
unknown option: -dump_topvwins
exit=0
```

올바른 표기는 **띄어쓰기가 들어간** `-dump topvwins <DIR>` 입니다. 도구의 자체 도움말에도 이렇게 나옵니다.

```
enlightenment_info -dump [Option..] [DIR]
	topvwins     : Dump buffer commit on top visible clients
```

그리고 스크린샷 용도로는 더 적합한 별도 옵션이 있습니다.

```
enlightenment_info -dump_screen   winfo -dump_screen -p /tmp/ -n xxx.png   :make dump /tmp/xxx.png
```

#### (2) 종료 코드를 신뢰할 수 없음

위 출력에서 보듯 **잘못된 옵션에도 `exit=0`** 을 반환합니다. 성공 판정을 종료 코드로 하면 실패를 성공으로 오인합니다. **파일 생성 여부**로 판정해야 합니다.

#### (3) root 권한 필요

```
$ ls -l /usr/bin/enlightenment_info
-r-xr-x--- 1 root root 178048 /usr/bin/enlightenment_info

$ id
uid=5001(owner) gid=100(users) ... context="User::Shell"
→ Permission denied
```

기본 sdb 사용자는 `owner`(uid 5001)라 실행할 수 없습니다. `sdb root on`으로 승격이 필요하며, **작업 후 원래 상태로 복원**합니다.

### 구현

`try_enlightenment_info()`는 두 가지 형태를 순서대로 시도합니다.

**형태 1 — `-dump_screen` (우선)**

```bash
enlightenment_info -dump_screen -p /tmp/ -n <name>.png
```

단일 파일, 전체 화면, 경로가 정확히 정해집니다. `-p`는 디렉토리, `-n`은 파일명입니다.

**형태 2 — `-dump topvwins <DIR>` (구버전 이미지 대비)**

최상위 창별로 PNG를 만듭니다. 주의할 점은 지정한 디렉토리 **안에 타임스탬프 하위 디렉토리를 또 만든다**는 것입니다.

```
directory: /tmp/e_probe/topvwins-20260803.104653
/tmp/e_probe/topvwins-20260803.104653/0x56281fb57d30_0.png SAVED   ← 1099839 bytes (전체 화면)
/tmp/e_probe/topvwins-20260803.104653/0x56281fb3c740_0.png SAVED   ←    4847 bytes
/tmp/e_probe/topvwins-20260803.104653/0x56281f9edad0_0.png SAVED   ←    2759 bytes
/tmp/e_probe/topvwins-20260803.104653/0x56281fc1f510_0.png SAVED   ←     147 bytes
```

따라서 PNG 탐색은 **재귀**여야 하고, 전체 화면은 그중 **가장 큰 파일**입니다.

`sdb root on`이 거부되면 즉시 `1`을 반환해 다음 방법으로 넘어갑니다. 양산 기기에서는 이 경로를 타므로 기존 동작이 그대로 유지됩니다.

### 폴백 순서 변경

처음에는 기존 캡처 도구 뒤(프레임버퍼 앞)에 넣었습니다. 그런데 **에뮬레이터에서는 xwd가 먼저 성공해 enlightenment_info가 아예 실행되지 않았습니다.** 추가해도 죽은 코드였습니다.

같은 화면을 두 방식으로 캡처해 비교한 결과입니다.

| | host-side xwd | enlightenment_info |
|---|---|---|
| 해상도 | 960×581 (축소) | **1920×1080** (네이티브) |
| 창 크롬 | `tizen-vm-default` 타이틀바·테두리 혼입 | 없음 |
| 제어판 | 휴리스틱 스티칭, 이음새 잔존 | 불필요 |
| 호스트 의존성 | xwd, xwininfo, python3+PIL | 없음 |

품질 차이가 명확해 **두 체인 모두 1순위로 올렸습니다.**

```
에뮬레이터: enlightenment_info → xwd → screencapture → capture_screen → fb0
실제 기기:  enlightenment_info → fb0 → screencapture → capture_screen → xwd
```

root를 못 얻으면 건너뛰므로, **enlightenment_info가 실제로 동작하는 환경에서만 우선권을 갖습니다.** 그 외에는 종전 순서 그대로입니다.

---

## 2. 응답에 이미지 포함

기존 envelope은 `output_path`만 반환해, 호출자가 파일을 따로 열지 않으면 스크린샷을 볼 수 없었습니다.

### 추가된 필드

```json
"image": {
  "path": "/abs/path/shot.png",
  "size_bytes": 1102917,
  "mime_type": "image/png",
  "width": 1920,
  "height": 1080,
  "base64_omitted_reason": "Image is 1077 KB, over the 512 KB inline limit. Open ... to view it."
},
"capture_method": "enlightenment_info -dump_screen"
```

- **`base64`** — 512KB 이하일 때만 인라인. 초과하면 이 필드 대신 `base64_omitted_reason`이 들어가, 필드 부재가 **캡처 실패가 아니라 크기 판단**임을 알 수 있습니다.
- **`mime_type`** — 매직 넘버로 판별 (PNG/JPEG)
- **`width`/`height`** — PNG IHDR 청크에서 직접 파싱
- **`capture_method`** — 어느 폴백이 성공했는지. `/dev/fb0`로 잡힌 이미지는 앱 화면이 아니라 커널 콘솔일 수 있어, 사용자가 신뢰 여부를 판단하려면 출처를 알아야 합니다.

### 512KB 상한에 관하여

1920×1080 캡처는 약 1.1MB이므로 **실사용에서 base64는 사실상 항상 생략**되고 경로만 남습니다.

상한을 올리는 것은 답이 아닙니다. 1.1MB를 base64로 인코딩하면 약 1.5MB의 텍스트가 되어, 텍스트로 읽히는 envelope을 삼켜버립니다. 축소 썸네일을 넣는 방안도 검토했으나 호스트 PIL 의존성이 생겨 **현행 유지로 결정**했습니다.

파일을 읽을 수 있는 호출자에게는 `image.path`로 충분합니다.

---

## 사용법

### tizen-cli

```bash
tizen-cli tizen-sdk screenshot --serial emulator-26101 --output ./shot.png
```

| 옵션 | 설명 |
|---|---|
| `--serial <serial>` | 생략 시 자동 선택 (기기 1대일 때) |
| `--output <path>` | 기본값 `./emulator_screenshot.png` |

**캡처 방법을 지정하는 옵션은 없습니다.** 폴백 체인이 자동 선택하며, 결과는 `capture_method`로 확인합니다.

### 스크립트 직접 실행

```bash
bash <plugin>/scripts/tizen-screenshot/tizen-screenshot.sh emulator-26101 ./shot.png
```

### CLI 러너

```bash
node <plugin>/lib/cli/screenshot-cli.js emulator-26101 ./shot.png
```

### 수동 sdb (참고)

```bash
sdb -s emulator-26101 root on
sdb -s emulator-26101 shell "enlightenment_info -dump_screen -p /tmp/ -n shot.png"
sdb -s emulator-26101 pull /tmp/shot.png ./shot.png
sdb -s emulator-26101 shell "rm -f /tmp/shot.png"
sdb -s emulator-26101 root off
```

---

## 검증 결과

`emulator-26101`(`tizen-vm-default`) 실기 검증입니다.

```
pre  uid: 5001
Detected: emulator target — after enlightenment_info, host-side xwd is preferred ...
Trying: device-side enlightenment_info...
SUCCESS: enlightenment_info -dump_screen
post uid: 5001          ← 권한 복원 확인

capture_method : enlightenment_info -dump_screen
dims           : 1920x1080
size           : 1102917 bytes
base64         : omitted (over limit)
```

확인 항목:

- `-dump_screen`으로 1920×1080 캡처, 이미지 육안 확인
- root 승격 후 uid 5001 **복원**
- 전체 체인에서 enlightenment_info가 1순위로 선택됨
- tizen-cli 커맨드 경로에서도 동일 결과
- envelope의 `capture_method`, 해상도, 크기, 생략 사유 정상

---

## tizen-cli 반영 시 주의

`tizen-cli`는 저장소의 `dist/`가 아니라 **`~/.tizen/plugins/`에 복사된 사본**을 실행합니다. `pnpm build`만으로는 반영되지 않습니다.

또한 `plugin install`은 같은 이름이 있으면 덮어쓰지 않고 거부합니다.

```
PLUGIN_ALREADY_INSTALLED: Plugin "tizen-sdk-skills" is already installed. Uninstall it first.
```

따라서 코드 수정 후 반영 절차는 다음과 같습니다.

```bash
cd <repo>/tizen-cli
pnpm build
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install <repo>/tizen-cli/dist
```

이 과정을 빠뜨리면 **구버전 플러그인이 조용히 실행됩니다.** 실제로 검증 중 이 문제로 xwd 캡처가 나왔고 `capture_method` 필드도 없었습니다.

플러그인 캐시(CLI 러너·스킬 경로)는 별개이며 setup 스크립트로 동기화합니다.

```bash
bash <repo>/cline/setup/setup.sh
```

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `scripts/tizen-screenshot/tizen-screenshot.sh` | `try_enlightenment_info()` 추가, 체인 1순위 배치, 감지 로그 수정 |
| `scripts/tizen-screenshot/tizen-screenshot.ps1` | 동일 (Windows) |
| `lib/core/screenshot.js` | `image` 블록, `capture_method`, MIME·IHDR 파싱, 512KB 상한 |
| `lib/core/sdb-helper.js` | 폴백 체인에 enlightenment_info 추가 |
| `lib/tests/sdb-helper.test.js` | 폴백 4개 검증, 잘못된 `-dump_topvwins` 표기 사용 금지 검증 |
| `skills/tizen-screenshot/SKILL.md` | 체인 표 2곳, 이미지 반환 규약 |

6개 파일, +345 / -23

---

## 관련 문서

- [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)
- [sdb-helper 플레이스홀더 치환 버그 수정](sdb-helper-placeholder-substitution.md)
- [훅 git-route 거부 문제 수정](hook-git-route-fix.md)
