# WSL(Windows Subsystem for Linux)에서 Tizen 에뮬레이터 실행

[English](WSL_EMULATOR_GUIDE.en.md) | 한국어

## 개요

Windows Subsystem for Linux (WSL2)에서 Tizen 에뮬레이터를 실행하려면 중첩된 가상화 제약으로 인해 특정 설정이 필요합니다. 이 가이드는 다양한 WSL 환경에서의 설정, 문제 해결 및 권장 프로필을 다룹니다.

## 필수 요구사항

### Windows 호스트 요구사항
- Windows 11 21H2 이상 (중첩 Hyper-V용)
- WSL2 (WSL1 아님 — 버전 확인: `wsl -l -v`)

### .wslconfig 설정

`%userprofile%\.wslconfig` 파일을 생성하거나 편집합니다 (예: `C:\Users\YourUsername\.wslconfig`):

```ini
[interop]
appendWindowsPath = true

[experimental]
nestedVirtualization = true
autoMemoryReclaim = gradual
```

**중요**: `.wslconfig`를 수정한 후 WSL을 완전히 재시작합니다:
```bash
# PowerShell(호스트)에서:
wsl --shutdown
# 그 다음 WSL 터미널을 다시 엽니다
```

## 에뮬레이터 프로필

### 표준 Tizen 프로필 (tizen)

**장점:**
- 완전한 Tizen 모바일 경험
- 표준 개발 워크플로우
- 홈 화면 앱(`org.tizen.homescreen`) + Enlightenment 컴포지터 기반 데스크톱 환경

**단점:**
- WSL에서 홈 화면 앱이 시작 직후 종료됨. 원인은 **Flutter 홈 화면의 EGL config 선택
  실패**이며, 함께 보이는 Buxton 권한 오류는 그 부산물입니다
  ([실제 원인](#실제-원인--flutter-홈-화면의-egl-설정-실패-실측-확인) 참고).
  chmod 워크어라운드와 GL 옵션 변경 모두 **홈 화면을 되살리지 못하는 것이 실측 결과**입니다.
  (Enlightenment는 컴포지터/윈도우 매니저이고 홈 화면은 그 위에서 도는 별도 앱 —
  실측상 컴포지터와 사용자가 설치한 앱 실행·표시는 정상 동작함)
- 더 많은 리소스 소비
- hwVirtualization 활성화 필요

**사용 시점:** Linux 호스트 또는 중첩 가상화를 지원하는 macOS의 VMware Fusion.

### TV 프로필 (tv)

**장점:**
- WSL 환경에서 더 가볍고 안정적
- 모바일 홈 화면 대신 TV 런처
- WSL 호환성이 뛰어남
- 더 낮은 시스템 리소스 요구

**단점:**
- TV 특화 UI (큰 버튼, TV 원격 제어 패러다임)
- 모바일 앱 테스트에는 적합하지 않음

**WSL용으로 권장됨.**

### 하이브리드 접근 방식: 둘 다 생성

```bash
# 표준 Tizen (Linux/네이티브 개발용)
em-cli create -n tizen-vm -P <platform> -T "HD1080" -p tizen -w yes

# TV (WSL 테스트용)
em-cli create -n tv-vm -P <platform> -T "HD1080" -p tv -w yes
```

실행 환경에 따라 전환합니다:
- Linux 호스트 → `tizen-vm` 사용
- WSL 호스트 → `tv-vm` 사용

## TV 프로필이 WSL에서 작동하는 이유 (기술 심화)

아키텍처 차이를 이해하면 TV 프로필이 WSL 호환성이 있는 반면 표준 Tizen이 권한 오류를 만나는 이유를 설명할 수 있습니다.

### 부팅 아키텍처 비교

#### 표준 Tizen 프로필 (`tizen-10.0-x86_64`)

**스택:**
```
┌──────────────────────────────────┐
│    Enlightenment 윈도우 매니저    │  ← 완전한 데스크톱 환경
│  ┌─────────────────────────────┐  │
│  │  모바일 홈 화면 (UI)        │  │
│  │  - 앱 아이콘, 알림           │  │
│  │  - 완전한 모바일 경험       │  │
│  └─────────────────────────────┘  │
│                                   │
│  홈 화면 = Flutter 앱             │  ← launchpad가 실행
│  - flutter_tizen_engine           │
│  - EGL config 선택 필요           │
│                                   │
│  starter                          │  ← 홈 화면을 띄우고 감시
│  - 실패 시 무한 재시작            │
└──────────────────────────────────┘
        ↓
    Linux에서 부팅 순서:
    - Enlightenment 시작 ✓
    - 홈 화면 EGL config 선택 ✓
    - 홈 화면 표시 ✓

        ↓
    WSL에서 부팅 순서:
    - Enlightenment 시작 ✓
    - ChooseEGLConfiguration 실패 ✗ (No matching configuration found)
    - app_create_cb() false → assertion → SIGABRT
    - starter 재시작 루프 → 크래시 덤프가 /opt를 채움
    - 그 부산물로 dlog에 BUXTON "Failed to set permissions"
    - 홈 화면 시작 실패 ✗
```

**관측된 실패:** 홈 화면(Flutter 앱)이 EGL config 선택에 실패해 `app_create_cb()`가 false를 반환하고 종료 경로에서 assertion으로 abort합니다. dlog에 함께 보이는 BUXTON 권한 오류는 크래시 덤프 수집 과정의 부산물입니다 — 아래 [실제 원인](#실제-원인--flutter-홈-화면의-egl-설정-실패-실측-확인)을 참고하세요.

---

#### TV 프로필 (`tv-samsung-10.0-x86_64`)

**스택:**
```
┌──────────────────────────────────┐
│      TV 런처 (직접)               │  ← Enlightenment 없음
│  ┌─────────────────────────────┐  │
│  │  TV 원격 UI                 │  │
│  │  - 채널 선택                 │  │
│  │  - TV용 앱 그리드            │  │
│  │  - 고정된 설정               │  │
│  └─────────────────────────────┘  │
│                                   │
│  Flutter 런처 아님 → 크래시 없음  │  ← 핵심 차이점!
│  - 하드코딩된 설정 사용           │
│  - 권한 변경 필요 없음            │
│  - chown/chmod 호출 없음          │
└──────────────────────────────────┘
        ↓
    Linux에서 부팅 순서:
    - TV 런처 시작 ✓
    - 설정 로드 (chown 없음) ✓
    
        ↓
    WSL에서 부팅 순서:
    - TV 런처 시작 ✓
    - 설정 로드 (chown 없음) ✓
    - TV UI 표시 ✓ (Linux와 동일)
```

**작동 이유(추정):** TV 런처는 Flutter 앱이 아니므로 표준 프로필의 홈 화면을 죽이는
EGL config 선택 경로를 타지 않습니다. 크래시 루프도, 그에 딸린 크래시 덤프/디스크
고갈/BUXTON 오류도 발생하지 않습니다. (TV 이미지의 그래픽 스택을 직접 계측해 확인한
것은 아니며, "WSL에서 정상 동작한다"는 결과만 실측입니다.)

---

### 파일시스템 계층 — 흔한 오해 정리

> **정정 안내:** 이 문서의 이전 버전은 "WSL의 9p 파일시스템이 chown을 거부해서"라고
> 설명했습니다. 아래 두 가지 이유로 그 설명은 성립하지 않아 삭제했습니다.
> 증상 자체(WSL에서만 홈 화면이 죽는다)는 실측이며 여전히 유효합니다.

**1. 리눅스 루트는 9p가 아닙니다 — 9p는 Windows 드라이브 쪽입니다**

WSL2의 리눅스 루트(`/`, `/home/...`)는 가상 디스크(VHDX) 위의 **ext4**입니다. 여기서는
`chown`/`chmod`가 네이티브 리눅스와 동일하게 동작하고 재부팅 후에도 유지됩니다.
9p(drvfs) 브릿지는 `/mnt/c`, `/mnt/d`처럼 Windows 드라이브를 볼 때 개입합니다
(`/usr/lib/wsl/drivers` 같은 WSL 내부 마운트도 9p이지만 개발 작업과는 무관합니다).

| 경로 | 실제 파일시스템 | chmod / chown |
|---|---|---|
| `/`, `/home/...`, `~/tizen-sdk-data` | ext4 (가상 디스크) | ✓ 동작, 영속 |
| `/mnt/c/...` | 9p (`aname=drvfs`) → NTFS | ✗ chmod 무시, chown EPERM (기본 설정) |

> **`/mnt/c` 행의 단서:** 이는 `metadata` 마운트 옵션이 **없는 기본 설정**에서의 동작입니다.
> `/etc/wsl.conf`에 `[automount] options="metadata"`를 주면 drvfs가 POSIX 소유권·권한을
> NTFS 확장 속성에 저장하므로 `chmod`/`chown`이 동작하고 유지됩니다. 즉 "9p는 chown을
> 절대 못 한다"는 명제는 성립하지 않습니다.
>
> 실측(WSL2 커널 6.18, 기본 자동 마운트): `/mnt/c`는 `type 9p ... aname=drvfs`이고
> `metadata` 옵션 없음 → `chmod 700` 후에도 모드가 `777`로 유지되고 `chown`은
> `Operation not permitted`. 같은 조작이 ext4에서는 `700`으로 정상 반영됩니다.

이 플러그인은 SDK와 VM을 `~/tizen-sdk-data`(= ext4)에 설치합니다. 즉 **기본 구성에서는
9p 경로가 전혀 개입하지 않는데도** BUXTON 오류가 재현됩니다.

**2. `/etc/buxton2/user.db`는 호스트 경로가 아닙니다**

이 경로는 **에뮬레이터 게스트 이미지(`emulimg-*.x86_64`) 내부**의 파일입니다.
게스트 커널이 자기 가상 블록 디바이스 위의 파일시스템에 쓰는 것이고, 호스트는 그
이미지 파일 하나를 바이트 단위로 읽고 쓸 뿐입니다. 게스트 안의 `chown`이 호스트
파일시스템의 의미론까지 내려가 거부당하는 구조가 아니며, 이미지 파일이 `/mnt/c`에
있든 `~`에 있든 게스트 내부의 UID/GID와는 무관합니다.

```
게스트(Tizen)  chown /etc/buxton2/user.db
      ↓        게스트 커널이 처리 — 여기서 끝
  가상 블록 디바이스 (emulimg 이미지)
      ↓        호스트는 이미지 "파일"만 읽고 씀
  호스트 FS (ext4 또는 NTFS) ← 게스트의 UID/GID를 볼 일이 없음
```

---

### BUXTON(buxton2)이란?

Buxton(buxton2)은 Tizen의 **시스템 설정 저장 데몬**입니다. 안드로이드의 Settings
Provider나 Windows의 레지스트리처럼, 시스템 전역의 키-값 설정(화면 밝기, 언어,
벨소리 등 vconf 값들)을 중앙에서 저장·조회·변경 통지해 주는 서비스입니다.
이름은 Intel이 만든 오픈소스 설정 관리 데몬 "Buxton"에서 왔고, Tizen이 개량한
2세대 구현이라 buxton2라고 부릅니다.

핵심 특징:

- **SQLite DB에 저장** — 설정값을 `/etc/buxton2/*.db`(시스템 기본값)와
  `/var/lib/buxton2/*.db`(런타임 변경값)에 저장합니다. dlog 오류에 나오는
  `user.db`, `user_memory.db`가 바로 이 파일들입니다.
- **보안 계층 역할** — 어떤 앱/프로세스가 어떤 설정을 읽고 쓸 수 있는지 Smack
  라벨과 파일 권한으로 통제합니다. 그래서 데몬이 기동하거나 DB를 열 때마다
  `set_sqlite_related_file_perms()`로 파일 소유권/권한을 **스스로 강제**합니다.
- **상위 API의 백엔드** — 앱이 쓰는 `vconf`/`system-settings` API가 내부적으로
  buxton2를 통해 값을 읽고 씁니다.

> **중요:** dlog에 보이는 `E/BUXTON ... Failed to set permissions`는 홈 화면
> 실패의 **원인이 아니라 부산물**입니다. 아래 실측 근거를 보세요.

### 실제 원인 — Flutter 홈 화면의 EGL 설정 실패 (실측 확인)

`tizen-10.0-x86_64` VM(WSL2, 중첩 가상화, `hwGLAcceleration=true`)에서 크래시 덤프를
직접 열어 확인한 결과입니다.

**1. 홈 화면은 Flutter 앱이고, EGL config 선택에서 죽습니다**

Tizen 10의 `org.tizen.homescreen`은 Flutter 앱입니다. 첫 부팅 시 dlog:

```
E/ConsoleMessage: Failed to initialize ecore_wl2
E/ConsoleMessage: tizen_renderer_egl.cc: ChooseEGLConfiguration(265) > No matching configuration found.
E/ConsoleMessage: tizen_renderer_egl.cc: CreateSurface(82) > Could not choose an EGL configuration.
E/ConsoleMessage: flutter_tizen_engine.cc: RunEngine(111) > The display was not valid.
E/ConsoleMessage: Could not launch a Flutter application.
E/CAPI_APPFW_APPLICATION: [OnCreate] INVALID_CONTEXT : app_create_cb() returns false
E/ConsoleMessage: flutter_app.cc:64 FlutterApp::OnTerminate(): Assertion `IsRunning()' failed.   ← SIGABRT
```

크래시 덤프(`/opt/usr/share/crash/dump/org.tizen.homescreen_*.zip`)의 콜스택도
일치합니다 — `runner` → app-core create 콜백 → libc abort, Signal 6 (SIGABRT).

같은 시각 DALI 기반 앱은 EGL 초기화에 **성공**합니다. 즉 GL 스택 전체가 죽은 게
아니라 **Flutter 엔진이 요구하는 EGL config 조합만 없는** 상태이고, 이것이
"컴포지터와 일반 앱은 정상, 홈 화면만 종료"라는 증상과 정확히 맞습니다.

**2. 크래시 루프가 `/opt`를 가득 채웁니다**

starter가 홈 화면을 무한 재시작하고 crash-manager가 매번 코어 덤프를 남깁니다.
실측 사례에서 **15초 만에 크래시 zip 3620개, 2.85GB**가 쌓여 3GB짜리 `/opt`
파티션의 여유 공간이 **0바이트**가 되었습니다.

**3. 그 다음에야 BUXTON 오류가 나옵니다 — 두 경로 모두 부산물입니다**

- `/var`는 `opt/var` 심볼릭 링크라 buxton2의 런타임 DB가 꽉 찬 `/opt` 위에 있습니다.
  디스크가 차면 sqlite WAL 쓰기부터 실패합니다(`send_res: error -2` = ENOENT 반복).
- 더 결정적으로, 크래시 덤프 로그 안에 이런 줄이 있습니다:

  ```
  ==== System configuration ( /usr/libexec/dump_systemstate/buxton-wait dump memory)
  ==== System configuration ( /usr/libexec/dump_systemstate/buxton-wait dump system)
  ```

  `Failed to set permissions` 오류는 크래시 **1초 뒤에**, 홈 화면과 무관한 단명
  PID에서 찍혔고 같은 PID가 `direct_dump: RO DB ... does not exist`도 남겼습니다.
  즉 crash-manager가 `dump_systemstate` → `buxton-wait dump`를 돌릴 때 나는
  로그입니다. 홈 화면이 크래시할 때마다 나오므로 상관관계는 완벽했지만,
  **인과는 반대 방향**이었습니다.

**결론:** 홈 화면 EGL 실패 → 크래시 루프 → `/opt` 고갈 → buxton2/sqlite 실패.
`chmod`가 아무 효과가 없던 이유가 이것입니다. 권한 문제가 아니었습니다.
(실측 VM에서 `/etc/buxton2`와 `/var/lib/buxton2`는 **이미 777**이었는데도 홈 화면은
계속 죽었습니다.)

### 시도했으나 효과가 없던 것

| 시도 | 결과 |
|---|---|
| `chmod 777` + 홈 화면 재시작 | ✗ 홈 화면 복구 안 됨 |
| `em-cli modify -g no` (HW GL 가속 끄기) | ✗ `No matching configuration found` 재발, 부팅만 크게 느려짐 (load average 34) |
| 호스트 GL을 llvmpipe로 강제 (`LIBGL_ALWAYS_SOFTWARE=1`) | ✗ 동일 오류 40회 재발 |

WSL의 호스트 GL은 WSLg의 Mesa **d3d12** 드라이버(`/usr/lib/wsl/lib/libd3d12.so`)인데,
이를 llvmpipe로 바꿔도 결과가 같았습니다. 따라서 "WSL의 호스트 GL 드라이버 때문"이라는
설명도 아직 입증되지 않았습니다.

### 남은 미확정 사항

- **이 문제가 정말 WSL 고유인가.** 동일 이미지를 네이티브 리눅스 호스트에서 띄워
  비교해 봐야 합니다. 호스트 GL 백엔드를 둘 다 바꿔도 증상이 같았다는 점은,
  실제 GPU 패스스루가 없는 환경 전반의 문제이거나 Tizen 10 이미지 자체의 문제일
  가능성을 남깁니다.
- **Flutter 엔진이 정확히 어떤 EGL 속성을 요구하는가.** `ChooseEGLConfiguration`이
  거르는 속성(멀티샘플, depth/stencil, alpha 등)과 게스트 yagl 드라이버가 노출하는
  config 목록을 대조하면 빠진 항목이 특정됩니다.

### 진단 방법 (홈 화면이 안 뜰 때)

BUXTON 태그를 보지 말고 **크래시 덤프**를 보세요. 훨씬 빠릅니다.

```bash
S=emulator-26101
sdb -s $S root on

# (1) 홈 화면이 크래시 루프 중인가 — 개수가 수천이면 확정
sdb -s $S shell "ls /opt/usr/share/crash/dump | wc -l"
sdb -s $S shell "ls /opt/usr/share/crash/dump | head -3"

# (2) /opt이 크래시 덤프로 꽉 찼는가 (Avail 0이면 2차 피해 진행 중)
sdb -s $S shell "df -h /opt"

# (3) 진짜 원인 — 덤프를 꺼내 콜스택과 직전 로그를 확인
sdb -s $S pull /opt/usr/share/crash/dump/<덤프이름>.zip .
unzip -q <덤프이름>.zip && cd <덤프이름>
sed -n '/Callstack Information/,/^$/p' ./*.info
grep -aiE "EGL|Flutter|app_create_cb|Assertion" ./*.log | tail -20

# (4) 디스크가 찼다면 회수 (덤프는 전부 홈 화면 크래시 기록)
sdb -s $S shell "rm -rf /opt/usr/share/crash/dump/* /opt/usr/share/crash/temp/*"
```

실효성이 확인된 대응은 여전히 **TV 프로필 사용** 또는 **홈 화면 없이 앱을 직접
실행**하는 두 가지입니다.

---

### 플랫폼 이미지 구성

**표준 Tizen 플랫폼 포함:**
```
tizen-10.0-x86_64/
├── emulator-resources/
│   ├── skins/tizen-general-3btn/
│   │   └── layout.xml (Enlightenment)
│   ├── system/bin/
│   │   └── enlightenment (WM 바이너리)
│   └── system/lib/
│       └── libecore.so (Enlightenment 라이브러리)
├── emulimg-10.0.x86_64 (부팅 가능한 이미지)
└── emulator.conf
    ├── [DESKTOP]
    │   launcher = enlightenment
    └── [BUXTON]
        manager = enabled
```

**TV 프로필 플랫폼 포함:**
```
tv-samsung-10.0-x86_64/
├── emulator-resources/
│   ├── skins/tv-1920x1080/
│   │   └── layout.xml (TV 런처)
│   └── system/bin/
│       └── tv-launcher (TV 바이너리, Enlightenment 없음)
├── emulimg-10.0.x86_64 (부팅 가능한 이미지)
└── emulator.conf
    ├── [DISPLAY]
    │   launcher = tv-launcher
    └── [SETTINGS]
        manager = simple  # BUXTON 없음
```

이들은 **별도로 설치되는 다른 SDK 패키지**입니다:
```bash
# 표준 Tizen
tizen-emulator-manager-resources (Enlightenment 포함)

# TV
tv-samsung-emulator-manager-resources (Enlightenment 제외)
```

---

### dlog 증거

**WSL의 표준 Tizen — dlog 출력:**
```
E/BUXTON  (1234): sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /etc/buxton2/user.db
E/BUXTON  (1234): sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /var/lib/buxton2/user.db
E/ENLIGHTENMENT(1256): system.c: Could not set up configuration database
```

이 오류는 BUXTON이 호출되고 권한 설정 단계에서 실패함을 보여줍니다.

**WSL의 TV 프로필 — dlog 출력:**
```
I/TV-LAUNCHER(1234): Initializing display...
I/TV-LAUNCHER(1234): Loading app grid...
I/TV-LAUNCHER(1234): Ready for input...
```

BUXTON도 없고, 권한 오류도 없고, Enlightenment도 없습니다.

---

## 문제 해결

### 증상: "Error: Failed to start this VM"

**확인 1: VM 프로필에서 KVM 비활성화**

> 플러그인의 launch 동작은 이 경우를 자동으로 복구합니다: 프로필이
> `<hwVirtualization>false</hwVirtualization>`인데 `/dev/kvm`을 사용할 수 있으면,
> VM을 부팅하기 전에 `em-cli modify -n <vm-name> -w yes`를 스스로 실행합니다
> (`HW_VIRT_AUTOFIX` warning으로 보고됨). 아래 수동 수정은 플러그인 밖에서
> 실행하거나, `/dev/kvm`에 아직 접근할 수 없을 때만 필요합니다
> (호스트를 먼저 수정 — kvm 그룹, `.wslconfig`).

```bash
# 설정 확인
cat ~/tizen-sdk-data/emulator/vms/<vm-name>/vm_config.xml | grep hwVirtualization
# 다음과 같이 표시되어야 함: <hwVirtualization>true</hwVirtualization>

# false인 경우 수정:
em-cli modify -n <vm-name> -w yes
```

**확인 2: .wslconfig 미설정**

위에 표시된 대로 `.wslconfig`에 `nestedVirtualization = true`가 있는지 확인합니다.

### 증상: "dlog의 BUXTON 권한 오류"

```bash
# 에뮬레이터 부팅 후 dlog 확인:
sdb -s emulator-26101 dlog -d -t 20 | grep -i buxton
```

오류 예:
```
E/BUXTON: sqlite.c: set_sqlite_related_file_perms(183) > Failed to set permissions for /etc/buxton2/user.db
```

**이것은 홈 화면 앱(`org.tizen.homescreen`)에 대한 알려진 WSL 제한입니다.** (Enlightenment 컴포지터 자체와 사용자가 설치한 앱의 실행·표시는 정상 동작합니다 — 홈 화면 없이도 앱 개발은 가능합니다.)

#### 자동 감지 및 자동 수정 (WSL) — 플러그인에 내장됨

에뮬레이터 시작 흐름(`tizen-emulator-manager.sh` → `emulator.js`)이 WSL에서 이 문제를
자동으로 처리합니다. 에뮬레이터가 sdb에 연결된 후:

1. **감지** — 크래시 덤프(`/opt/usr/share/crash/dump`의 `org.tizen.homescreen_*`)와
   dlog의 EGL 실패를 최대 30초간 폴링합니다. 두 신호 중 하나면 충분합니다.
2. **재시도 루프 정지** — starter의 사용자 유닛을 마스킹하고(재부팅 후에도 유지),
   **실행 중인 세션에서도 정지**시킨 뒤(아래 참고), 쌓인 크래시 덤프를 삭제해 `/opt`을
   회수합니다. 이것이 `Unable to launch` 팝업을 없애는 부분입니다.
3. **홈 화면 직접 실행** — launchpad를 우회해 앱 바이너리를 직접 실행하고, 최대 20초간
   폴링하며 살아남았는지 확인합니다.
4. **보고** — `homescreen_fix: ok | fixed | popup_fixed | fix_failed`가 결과에 실립니다.
   적용 대상이 아니면 필드 자체가 없습니다.

> **왜 마스킹만으로는 부족한가:** `systemctl --global mask`는 이미 로드된 유닛을 멈추지
> 않고, `pkill starter`만 하면 systemd가 몇 초 뒤 되살려 크래시 루프가 재개됩니다
> (실측: 덤프가 계속 쌓이고 launchpad가 띄운 홈 화면이 다시 나타남). `systemctl --user`는
> root로 접근할 수 없으므로(`Cannot access user instance remotely`, 사용자 버스는 root를
> EPERM으로 거부) **세션 사용자로 `su`해서 사용자 버스에 접속해 정지**시켜야 합니다.
> `starter.path`도 함께 멈춰야 서비스가 재활성화되지 않습니다.

**적용 대상은 WSL의 표준 `tizen` 프로필 에뮬레이터뿐입니다.** 실기기, TV·wearable
이미지, 비-WSL 호스트에서는 아무것도 하지 않고 상태 라인도 내보내지 않습니다.

이미 떠 있는 에뮬레이터에 적용하려면 (재기동 불필요):

```bash
node <plugin>/lib/cli/emulator-manager-cli.js fix-homescreen [--vm-name <name>]
```

> ⚠️ **`fixed`의 두 가지 단서:** 홈 화면이 세션 사용자가 아니라 **root로 돕니다**(사용자
> 세션에 의존하는 동작은 다를 수 있음). 그리고 **게스트 재부팅 시 사라집니다** — 매
> launch마다 자동 재적용됩니다. 원래 동작으로 되돌리려면
> `sdb -s <serial> shell "systemctl --global unmask starter.service starter.path"` 후
> 게스트를 재부팅하세요.

환경 변수를 통한 조정:

| 변수 | 기본값 | 의미 |
|---|---|---|
| `TIZEN_HOMESCREEN_CHECK` | `auto` | `auto` = WSL + tizen 에뮬레이터만, `force` = 어디서나(미검증), `off` = 절대 |
| `TIZEN_HOMESCREEN_LAUNCH` | `1` | `0` = 재시도 루프만 멈추고 홈 화면은 띄우지 않음 |
| `TIZEN_HOMESCREEN_MASK_STARTER` | `1` | `0` = starter를 건드리지 않음 |
| `TIZEN_HOMESCREEN_CHECK_TIMEOUT` | `30` | 연결 후 크래시 시그니처를 폴링하는 시간(초) |
| `TIZEN_HOMESCREEN_VERIFY_DELAY` | `20` | 직접 실행 후 생존을 폴링하는 시간(초) |

**폐기된 `TIZEN_BUXTON_*`에서 옮겨오기**

기존의 `TIZEN_BUXTON_CHECK` / `_AUTOFIX` / `_CHECK_TIMEOUT` / `_VERIFY_DELAY`와
결과 필드 `buxton_check`는 제거되었습니다. 다만 **조용히 무시되지는 않습니다** —
이 훅은 예전 buxton 프로브보다 게스트를 더 많이 건드리므로(starter 마스킹, 홈 화면
재시작), 일부러 껐던 설정이 업그레이드로 되살아나면 안 됩니다.

| 예전 설정 | 지금 동작 |
|---|---|
| `TIZEN_BUXTON_CHECK=off` | 경고 후 **검사 자체를 끔** (`TIZEN_HOMESCREEN_CHECK=off`와 동일) |
| `TIZEN_BUXTON_AUTOFIX=0` | 경고 후 **보고 전용**으로 취급 (`_LAUNCH=0`, `_MASK_STARTER=0`) |
| 그 외 `TIZEN_BUXTON_*` | 경고만 하고 무시 |
| 결과 필드 `buxton_check` | `homescreen_fix`로 교체 (상태값도 다름 — 파싱하는 쪽은 수정 필요) |

`TIZEN_HOMESCREEN_*`을 명시하면 항상 그 값이 이깁니다.

`fix_failed`가 보고되면 아래의 수동 해결책을 사용합니다.

**해결책 1: TV 프로필로 전환 (권장)**
```bash
em-cli delete -n <vm-name>
em-cli create -n <vm-name> -P <platform> -T "HD1080" -p tv -w yes
```

**해결책 2: Tizen 프로필 유지하되 홈 화면 스킵**
1. Enlightenment 자동 시작 비활성화
2. `app_launcher`를 사용하여 앱 직접 실행:
   ```bash
   sdb -s emulator-26101 shell app_launcher -S "org.example.myapp"
   ```

**해결책 3: BUXTON 권한 수동으로 수정 (효과 없음 — 진단 목적으로만)**

⚠️ **실측 결과 이 방법으로 홈 화면은 복구되지 않습니다.** 원인 조사 과정을 손으로
재현할 때만 의미가 있습니다. **플러그인의 자동 수정은 더 이상 이 명령을 실행하지
않습니다** — starter 정지와 홈 화면 직접 실행으로 대체되었습니다
([자동 감지 및 자동 수정](#자동-감지-및-자동-수정-wsl--플러그인에-내장됨) 참고).

```bash
sdb -s emulator-26101 root on
sdb -s emulator-26101 shell "chmod 777 /etc/buxton2 /var/lib/buxton2 2>/dev/null || true"
# Tizen 10 이미지에는 enlightenment.service가 없으므로 홈스크린 앱 재실행으로 폴백
sdb -s emulator-26101 shell "systemctl restart enlightenment || app_launcher -s org.tizen.homescreen" || true
```

**실제로 관측되는 것:**

- `chmod` 명령 자체는 통과하고, 경우에 따라 dlog의 BUXTON 오류도 더 이상 찍히지
  않습니다.
- **그럼에도 `org.tizen.homescreen`은 여전히 뜨지 않습니다.**
- 게스트를 재부팅하면 권한은 원상 복구됩니다.

즉 chmod는 로그에 보이는 증상 하나를 지울 뿐, 홈 화면이 죽는 원인을 건드리지
못합니다. **BUXTON 오류는 홈 화면 크래시의 결과이지 원인이 아닙니다** — 근거는
[실제 원인](#실제-원인--flutter-홈-화면의-egl-설정-실패-실측-확인)에 정리되어 있습니다.

원인을 직접 확인하려면 BUXTON 태그가 아니라 크래시 덤프를 보세요:

```bash
sdb -s emulator-26101 shell "ls /opt/usr/share/crash/dump | wc -l"   # 수천 개면 크래시 루프
sdb -s emulator-26101 shell "dlogutil -d | grep -aiE 'EGL|Flutter|app_create_cb'" | tail -20
```

자세한 절차는 [진단 방법](#진단-방법-홈-화면이-안-뜰-때)에 있습니다.

---

**실질적인 결과:**

| 시나리오 | 결과 |
|---|---|
| chmod 777 + 홈 화면 재시작 | ✗ 홈 화면 복구되지 않음 |
| dlog의 BUXTON 오류 | 사라질 수 있으나 홈 화면과는 별개 (부산물) |
| 게스트 재부팅 후 | ✗ 권한 원복, 원상태로 |
| `em-cli modify -g no` (HW GL 끄기) | ✗ EGL 오류 재발, 부팅만 느려짐 |
| 호스트 GL을 llvmpipe로 강제 | ✗ EGL 오류 재발 |
| 크래시 덤프 정리 (`/opt` 회수) | △ 2차 피해만 해소, 홈 화면은 그대로 |
| 홈 화면 없이 앱 설치·실행·디버깅 | ✓ 정상 동작 |
| TV 프로필 | ✓ 정상 동작 |

---

**권장사항:**

- **홈 화면 UI가 필요하다** → TV 프로필 (해결책 1). WSL에서 실효성이 확인된
  유일한 방법입니다.
- **앱 개발·테스트만 하면 된다** → 표준 `tizen` 프로필을 그대로 두고 홈 화면 없이
  `app_launcher`로 직접 실행 (해결책 2). 설치·실행·디버깅은 홈 화면과 무관하게
  동작합니다.
- **CI/자동화** → TV 프로필 (수동 개입 없음).
- **홈 화면이 필요하지만 표준 프로필을 쓰고 싶다** → 플러그인의 자동 수정을 그대로
  두세요 (WSL에서 기본 동작). 재시도 루프와 팝업을 멈추고 홈 화면을 직접 띄웁니다.
  이미 떠 있는 에뮬레이터에는 `emulator-manager --action fix-homescreen`.
  단 홈 화면이 root로 돌고 게스트 재부팅 시 사라진다는 점을 감안하세요.
- **표준 프로필 VM을 오래 켜 두었다면 `/opt`을 확인하세요.** 홈 화면 크래시 루프가
  코어 덤프를 쌓아 파티션을 채우면 앱 설치·설정 저장 등 다른 기능까지 전부
  실패합니다. `sdb shell df -h /opt`로 확인하고 `rm -rf
  /opt/usr/share/crash/dump/*`로 회수하세요.

### 증상: 낮은 성능 / 지연

**VM 리소스 확인:**
```bash
em-cli list-vm -n <vm-name> -d
```

**WSL 권장사항:**
- RAM: 최소 768 MiB (부드러운 성능을 위해 1024 MiB)
- vCPU: 2–4 코어 (확인: `cat /proc/cpuinfo`)
- 지연이 있으면 하드웨어 GL 가속 비활성화:
  ```bash
  em-cli modify -n <vm-name> -g no
  ```

### 증상: sdb 연결 시간 초과 (>300초)

1. 에뮬레이터가 완전히 부팅되었는지 확인합니다:
   ```bash
   # 부팅 진행 상황 모니터링:
   tail -f ~/tizen-sdk-data/emulator/vms/<vm-name>/logs/emulator.log
   ```

2. 호스트 시스템 로드 확인 (Windows 작업 관리자: 리소스 모니터)

3. 대기 시간 초과 증가 시도:
   ```bash
   # tizen-cli 또는 직접 em-cli 호출에서:
   em-cli launch -n <vm-name> -t 600  # 5분 대신 10분
   ```

## 성능 팁

### WSL 특화 최적화

1. **사용하지 않는 그래픽 비활성화** (시각적 서비스 테스트하지 않는 경우):
   ```bash
   em-cli modify -n <vm-name> -g no
   ```

2. **공유 파일 시스템** (WSL에서 느림):
   - Windows 경로를 VM 내부에 마운트하지 않습니다
   - 파일 전송을 위해 `sdb push` / `sdb pull` 대신 사용합니다

3. **CPU 가상화**:
   - 항상 활성화: `em-cli modify -n <vm-name> -w yes`
   - 테스트에서 명시적으로 필요한 경우에만 비활성화

4. **메모리 할당**:
   - 768 MiB부터 시작, 지연이 있으면 1024 MiB로 증가
   ```bash
   em-cli modify -n <vm-name> -r 1024
   ```

## 에뮬레이터 플랫폼 선택

사용 가능한 플랫폼 나열:
```bash
em-cli list-platform -P tizen -d  # 표준 Tizen
em-cli list-platform -P tv -d     # TV 프로필
```

명명 규칙: `{profile}-{version}-{arch}`
예: `tizen-10.0-x86_64`, `tv-samsung-10.0-x86_64`

## 에뮬레이터 시작 실패 디버깅

`tizen-emulator-manager.sh` 스크립트는 실패 시 구조화된 진단(LAUNCH_DIAG 라인)을 내보냅니다:

```bash
# 오류 출력에 캡처됨:
LAUNCH_DIAG=phase|launch_failed
LAUNCH_DIAG=wsl|yes
LAUNCH_DIAG=hw_virtualization|false
LAUNCH_DIAG=kvm|present
LAUNCH_DIAG=kvm_writable|yes
```

**WSL의 핵심 필드:**
- `wsl|yes` — WSL 환경 감지됨
- `hw_virtualization|{true|false}` — VM 프로필 설정
- `kvm|present|missing` — 호스트 커널 지원
- `kvm_writable|yes|no` — 권한 문제

모든 진단은 `tizen-cli` 또는 CLI 실행기의 오류 메시지에 자동으로 포함됩니다.

## 추가 읽기

- [Tizen 에뮬레이터 공식 문서](https://docs.tizen.org/application/tizen-studio/setup/emulator/)
- [WSL 중첩 가상화 (Microsoft 문서)](https://learn.microsoft.com/en-us/windows/wsl/nested-virtualization)
- [Tizen TV 개발 가이드](https://docs.tizen.org/application/tizen-studio/develop/tv-app)
