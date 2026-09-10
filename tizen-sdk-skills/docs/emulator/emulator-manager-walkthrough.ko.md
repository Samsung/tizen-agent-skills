# 시나리오 가이드: Tizen 에뮬레이터 관리자 End to End

이 문서는 `tizen-sdk-skills` 플러그인을 사용한 **완전한 Tizen 에뮬레이터 VM 워크플로우**를 안내합니다: "SDK 설치 → 에뮬레이터 패키지 다운로드 → 템플릿/플랫폼 목록 → 에뮬레이터 VM 생성 → 부팅 → 앱 테스트".

각 단계는 **자연어로 말하기만 하면** 자동으로 실행됩니다 — 외울 명령어가 없습니다.

> Tizen 에뮬레이터 VM 은 `{TIZEN_SDK_PATH}/tools/emulator/bin/em-cli` 를 통해 관리됩니다. 다양한 화면 크기 (1080, 720, 3840 등) 로 여러 VM 을 생성하고, 하드웨어 (RAM, CPU, GL 가속) 를 커스터마이징하며, 프로필 (표준 Tizen 또는 Samsung TV) 을 선택할 수 있습니다. 책임 스킬은 생성용 `tizen-create-emulator` 와 부팅용 `tizen-launch-emulator` 입니다.

---

## 0. 시작 전

- **플러그인 설치됨**: `tizen-sdk-skills` 플러그인이 설치되어 있어야 합니다. (아니면 [README.md](../README.md) 의 "Cline 플러그인 설치" 참조)

- **Tizen SDK 설치됨**: SDK 가 설치되어 있고 `~/.tizen.sdk.path.config` 가 이를 가리켜야 합니다. (아니면 아래 "Tizen SDK 설치" 참조)
- **에뮬레이터 패키지 다운로드됨**: 에뮬레이터 런타임 패키지가 설치되어 있어야 합니다. (아니면 1 단계 참조)
- **OS**: Windows / Ubuntu (Linux) / macOS 모두 지원됩니다. Claude 는 현재 OS 를 감지하여 일치하는 스크립트를 실행합니다.
- **디스크 공간**: 에뮬레이터 VM 은 VM 당 수 GB 의 여유 공간이 필요합니다.
- **예시 목표**:
  - 시나리오 A (빠른 시작): 1080p 에뮬레이터 VM 을 생성하고 앱 테스트용으로 부팅합니다.
  - 시나리오 B (TV 개발): Samsung TV 앱 테스트용 4K TV 에뮬레이터 VM 을 생성합니다.
  - 시나리오 C (커스텀 하드웨어): 커스텀 RAM, GL 가속 없음, 파일 공유가 활성화된 에뮬레이터를 생성합니다.
  - 시나리오 D (원본 이미지): 커스텀 디스크 이미지 (스냅샷 복원 또는 사전 구성 이미지) 에서 VM 을 생성합니다.

> 💡 각 단계의 "이렇게 말하세요:" 예시를 그대로 복사하세요.

---

## 전체 플로우 한눈에 보기

| 단계 | 작업 | 시기 | 에이전트 |
|------|------|------|---------|
| 1 | 에뮬레이터 패키지 다운로드 | SDK 설치 후 | `tizen-download-emulator-package` |
| 2 | 사용 가능한 화면 크기 목록 | 에뮬레이터 생성 전 | `tizen-create-emulator` |
| 3 | 에뮬레이터 VM 생성 | 처음 또는 새 VM 추가 시 | `tizen-create-emulator` |
| 4 | 에뮬레이터 VM 부팅 | 앱 설치/테스트 전 | `tizen-launch-emulator` |
| 5 | sdb 연결 확인 | 부팅 후 | `tizen-device-manager` |
| 6 (선택) | VM 설정 수정 | 크기/RAM/하드웨어 변경 | `tizen-create-emulator` |
| 7 (선택) | 기존 VM 목록/관리 | VM 보기 또는 정리 | `tizen-create-emulator` |
| 8 | 앱 설치 및 테스트 | Tizen 앱 배포 | `tizen-install-app` |

---

## 1 단계 — 에뮬레이터 패키지 다운로드

Tizen SDK 설치 후 에뮬레이터 런타임 패키지를 다운로드합니다. 이미 설치된 경우 건너뜁니다.

**이렇게 말하세요:**
```
Tizen 에뮬레이터 패키지를 다운로드해줘
```

**성공 확인:** 다음과 같은 `result` 가 포함된 표준 JSON Envelope 가 반환됩니다:

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "packages_installed": [
      {
        "name": "TIZEN-10.0-Emulator",
        "version": "emulator",
        "status": "installed"
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk download-emulator-package",
  "duration_ms": 45000
}
```

> ⚠️ **예상 시간:** 이 단계는 네트워크 속도에 따라 2-5 분이 소요됩니다.

---

## 2 단계 — 사용 가능한 화면 크기 (템플릿) 목록

에뮬레이터 생성 전, SDK 가 지원하는 사용 가능한 화면 크기/템플릿을 확인합니다. **화면 크기는 사용자 선택** 이므로 이 단계가 **필수**입니다 — Claude 가 생성할 크기를 물어봅니다.

**이렇게 말하세요:**
```
사용 가능한 에뮬레이터 화면 크기를 목록으로 보여줘
```

**성공 확인:** 사용 가능한 템플릿을 보여주는 표준 JSON Envelope:

```json
{
  "status": "success",
  "result": {
    "templates": ["HD1080 Tizen", "HD720 Tizen", "HD3840 TV"],
    "template_details": [
      {
        "name": "HD1080 Tizen",
        "profile": "tizen",
        "resolution": "1920x1080",
        "size": "1080",
        "ram": "512"
      },
      {
        "name": "HD720 Tizen",
        "profile": "tizen",
        "resolution": "1280x720",
        "size": "720",
        "ram": "512"
      },
      {
        "name": "HD3840 TV",
        "profile": "tv",
        "resolution": "3840x1080",
        "size": "3840",
        "ram": "1024"
      }
    ],
    "available_sizes": ["1080", "720", "3840"],
    "default_size": "1080",
    "count": 3,
    "profile": "tizen"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-template",
  "duration_ms": 500
}
```

**어떤 크기를 선택할까요?**
- **1080 (1920x1080)** — 대부분의 개발에 권장됨; 표준 Full HD 디스플레이와 일치합니다.
- **720 (1280x720)** — 더 작고 부팅이 빠름; 리소스가 적은 호스트에 좋습니다.
- **3840 (3840x1080)** — 4K TV 해상도; TV SDK 확장 필요.

---

## 3 단계 — 에뮬레이터 VM 생성

선택한 화면 크기로 새 에뮬레이터 VM 을 생성합니다. 플랫폼, 프로필 및 하드웨어 옵션도 지정할 수 있습니다.

### 옵션 A — 1080p 에서 생성 (권장 기본값)

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 1080p 화면 크기로 생성해줘
```

**성공 확인:** 표준 JSON Envelope 가 반환됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD1080 Tizen",
    "size": "1080",
    "resolution": "1920x1080",
    "size_applied": true,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

### 옵션 B — 생성 후 즉시 부팅

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 1080p 로 생성하고 즉시 부팅해줘
```

**성공 확인:** VM 이 생성되고 부팅되며 `device_serial` 가 채워집니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD1080 Tizen",
    "size": "1080",
    "resolution": "1920x1080",
    "size_applied": true,
    "profile": "tizen",
    "launched": true,
    "device_serial": "emulator-26101",
    "status": "created_and_launched"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 180000
}
```

> ⚠️ **콜드 부팅 시간:** 첫 부팅은 5-7 분이 소요될 수 있습니다. 이후 부팅은 더 빠릅니다.

### 옵션 C — TV 에뮬레이터 생성 (4K)

**이렇게 말하세요:**
```
"tv-vm" 이라는 이름의 TV 에뮬레이터 VM 을 3840 화면 크기로 생성해줘
```

**성공 확인:** TV 프로필 VM 이 생성됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "tv-vm",
    "platform": "tv-samsung-7.0-x86_64",
    "template": "HD3840 TV",
    "size": "3840",
    "resolution": "3840x1080",
    "size_applied": true,
    "profile": "tv",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

> ⚠️ **TV SDK 필요:** TV SDK 확장이 없으면 먼저 `tizen-tv-sdk-install` 로 설치하세요.

### 옵션 D — 커스텀 하드웨어로 생성

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 720p, 1024MB RAM, GL 가속 없음으로 생성해줘
```

**성공 확인:** VM 이 커스텀 하드웨어로 생성됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "platform": "tizen-10.0-x86_64",
    "template": "HD720 Tizen",
    "size": "720",
    "resolution": "1280x720",
    "ram": "1024",
    "hw_gl_acceleration": "no",
    "size_applied": true,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 3500
}
```

**사용 가능한 하드웨어 옵션:**
- `--ram-size <512|768|1024>` — VM 메모리 (MiB)
- `--hw-gl-acceleration <yes|no>` — OpenGL 가속 (문제 해결용 비활성화)
- `--hw-virtualization <yes|no>` — CPU 가상화 (더 나은 성능을 위해 활성화)
- `--file-sharing-path <path>` — VM 과 공유할 호스트 디렉토리
- `--skin <1|2>` — 스킨 스타일 (1=일반, 2=프로필별)

### 옵션 E — 원본 디스크 이미지에서 커스텀 VM 생성

커스텀 디스크 이미지 (예: 사전 구성 VM 스냅샷 또는 생성한 플랫폼 이미지) 가 있는 경우, 템플릿 대신 이를 사용하여 새 VM 을 생성할 수 있습니다. **화면 크기와 템플릿 선택을 우회**합니다 — 디스크 이미지가 VM 의 구성을 결정합니다.

**선행 조건:**
- 원본 디스크 이미지 파일 (예: `.qcow2` 또는 `.img` 파일) 이 포함된 디렉토리
- 디스크 이미지와 일치하는 플랫폼 이미지 이름

**이렇게 말하세요:**
```
"custom-vm" 이라는 이름의 에뮬레이터 VM 을 "/path/to/custom-images" 의 원본 디스크 이미지에서 생성하고 플랫폼은 "tizen-10.0-x86_64" 를 사용해줘
```

**성공 확인:** VM 이 원본 디스크 이미지에서 생성됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "custom-vm",
    "platform": "tizen-10.0-x86_64",
    "template": null,
    "raw_image_path": "/path/to/custom-images",
    "size": null,
    "resolution": null,
    "size_applied": false,
    "profile": "tizen",
    "launched": false,
    "device_serial": null,
    "status": "created_from_raw_image"
  },
  "warnings": ["VM 이 원본 디스크 이미지에서 생성되었습니다 — 해상도와 크기는 이미지 내용에 따라 결정됩니다"],
  "errors": [],
  "command": "tizen-sdk create-emulator",
  "duration_ms": 5000
}
```

> ⚠️ **원본 이미지 생성 시 중요 참고:**
> - **크기/템플릿 선택 없음:** 디스크 이미지가 VM 의 해상도와 하드웨어를 결정합니다. 원본 이미지와 함께 `--size` 또는 `--template` 을 전달하지 마세요.
> - **플랫폼 일치 필요:** 디스크 이미지가 생성된 플랫폼과 일치하는지 확인하세요.
> - **확인 자동 응답:** em-cli 는 원본 이미지 사용 시 확인을 요청하며, 러너는 자동으로 "y" 로 응답합니다.
> - **사용 사례:** VM 스냅샷 복원, 사전 구성 개발 이미지 사용, `create-image` 로 생성한 플랫폼 이미지 재사용에 유용합니다.

**원본 디스크 이미지 얻는 방법:**
1. **기존 VM 에서:** `create-image` 를 사용하여 VM 디스크를 캡처:
   ```
   "my-vm" 의 디스크 이미지를 캡처하여 재사용 가능한 플랫폼 이미지로 "/path/to/images" 에 저장해줘
   ```
2. **백업에서:** 이전에 내보낸 VM 디스크 이미지를 복원합니다.
3. **외부 소스에서:** 팀이나 조직에서 제공한 디스크 이미지를 사용합니다.

**부팅과 함께 생성:**
```
"custom-vm" 이라는 이름의 에뮬레이터 VM 을 "/path/to/custom-images" 의 원본 디스크 이미지에서 생성하고 플랫폼은 "tizen-10.0-x86_64" 를 사용한 후 즉시 부팅해줘
```

**성공 확인:** VM 이 원본 이미지에서 생성되고 부팅됩니다.

---

## 4 단계 — 에뮬레이터 VM 부팅

기존 에뮬레이터 VM 을 부팅하고 sdb 를 통해 연결될 때까지 기다립니다.

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 부팅해줘
```

**성공 확인:** VM 이 실행 중임을 보여주는 표준 JSON Envelope:

```json
{
  "status": "success",
  "result": {
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "vm_name": "my-vm",
    "launch_time_ms": 120000,
    "sdb_connected": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk launch-emulator",
  "duration_ms": 120000
}
```

> ⚠️ **부팅 타임아웃:** 콜드 부팅은 5-7 분이 소요될 수 있습니다. 런처는 기본적으로 최대 300 초를 기다립니다. 부팅이 실패하면 10 단계 (문제 해결) 를 참조하세요.

### 첫 번째 사용 가능한 VM 부팅

VM 이 하나만 있거나 사용 가능한 첫 VM 을 부팅하려면:

**이렇게 말하세요:**
```
에뮬레이터를 부팅해줘
```

**성공 확인:** `list-vm` 의 첫 VM 이 부팅됩니다.

---

## 5 단계 — sdb 연결 확인

부팅 후, 에뮬레이터가 sdb 를 통해 연결되어 앱 설치 준비가 되었는지 확인합니다.

**이렇게 말하세요:**
```
연결된 Tizen 디바이스를 찾아줘
```

**성공 확인:** 연결된 디바이스를 보여주는 표준 JSON Envelope:

```json
{
  "status": "success",
  "result": {
    "devices": [
      {
        "serial": "emulator-26101",
        "type": "emulator",
        "model": "Tizen Emulator",
        "sdk_version": "10.0"
      }
    ],
    "device_serial": "emulator-26101",
    "device_type": "emulator",
    "status": "connected"
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk device-manager",
  "duration_ms": 2000
}
```

---

## 6 단계 (선택) — VM 설정 수정

기존 VM 의 설정을 다시 생성하지 않고 변경합니다.

### 화면 크기 변경

**이렇게 말하세요:**
```
"my-vm" 의 화면 크기를 720p 로 변경해줘
```

**성공 확인:** VM 의 템플릿이 교체됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "template": "HD720 Tizen",
    "resolution": "1280x720",
    "size": "720",
    "template_changed": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager modify",
  "duration_ms": 2000
}
```

### CPU 가상화 활성화 (부팅 문제 해결)

**이렇게 말하세요:**
```
"my-vm" 에서 CPU 가상화를 활성화해줘
```

**성공 확인:** 하드웨어 가상화가 활성화됩니다:

```json
{
  "status": "success",
  "result": {
    "vm_name": "my-vm",
    "hw_virtualization": "yes",
    "changed": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager modify",
  "duration_ms": 2000
}
```

### RAM 변경

**이렇게 말하세요:**
```
"my-vm" 의 RAM 을 1024MB 로 변경해줘
```

**성공 확인:** RAM 이 업데이트됩니다.

### 파일 공유 설정

**이렇게 말하세요:**
```
"my-vm" 의 파일 공유 경로를 "/home/user/share" 로 설정해줘
```

**성공 확인:** 호스트 디렉토리가 VM 과 공유됩니다.

---

## 7 단계 (선택) — 기존 VM 목록 및 관리

### 모든 VM 목록

**이렇게 말하세요:**
```
모든 에뮬레이터 VM 을 목록으로 보여줘
```

**성공 확인:** VM 이름 목록:

```json
{
  "status": "success",
  "result": {
    "vms": ["my-vm", "tv-vm", "tizen-vm-default"],
    "count": 3
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-vm",
  "duration_ms": 500
}
```

### 세부 정보와 함께 VM 목록

**이렇게 말하세요:**
```
모든 에뮬레이터 VM 을 세부 정보와 함께 목록으로 보여줘
```

**성공 확인:** VM 당 전체 구성:

```json
{
  "status": "success",
  "result": {
    "vm_details": [
      {
        "name": "my-vm",
        "platform": "tizen-10.0-x86_64",
        "template": "HD1080 Tizen",
        "resolution": "1920x1080",
        "ram": "512",
        "cpu_arch": "x86_64",
        "cpu_count": "2"
      }
    ],
    "count": 1
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk emulator-manager list-vm",
  "duration_ms": 500
}
```

### VM 삭제

**이렇게 말하세요:**
```
"old-vm" 이라는 이름의 에뮬레이터 VM 을 삭제해줘
```

**성공 확인:** VM 이 제거됩니다.

---

## 8 단계 — 앱 설치 및 테스트

에뮬레이터가 실행 중일 때, Tizen 앱을 설치하고 테스트합니다.

**이렇게 말하세요:**
```
에뮬레이터에 내 Tizen 앱을 설치해줘
```

**성공 확인:** 앱이 설치되고 선택적으로 부팅됩니다:

```json
{
  "status": "success",
  "result": {
    "package_path": "C:\\ws\\MyApp\\MyApp-1.0.0.wgt",
    "device_serial": "emulator-26101",
    "app_id": "org.example.myapp",
    "installed": true,
    "launched": true
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk install-app",
  "duration_ms": 15000
}
```

---

## 전체 E2E 경로

### 경로 1: 빠른 시작 (1080p 에뮬레이터)

표준 앱 개발 및 테스트에 사용합니다:

```
1) Tizen 에뮬레이터 패키지를 다운로드해줘
2) 사용 가능한 에뮬레이터 화면 크기를 목록으로 보여줘
3) "my-vm" 이라는 이름의 에뮬레이터 VM 을 1080p 화면 크기로 생성해줘
4) "my-vm" 이라는 이름의 에뮬레이터 VM 을 부팅해줘
5) 연결된 Tizen 디바이스를 찾아줘
6) 에뮬레이터에 내 Tizen 앱을 설치해줘
```

**예상 시간:** ~10-15 분 (1 단계가 가장 김; 4 단계 콜드 부팅은 5-7 분 소요).

### 경로 2: TV 에뮬레이터 (4K Samsung TV)

Samsung TV 앱 개발에 사용합니다:

```
1) TV SDK 확장을 설치해줘 (tizen-tv-sdk-install)
2) Tizen 에뮬레이터 패키지를 다운로드해줘
3) 사용 가능한 TV 에뮬레이터 화면 크기를 목록으로 보여줘
4) "tv-vm" 이라는 이름의 TV 에뮬레이터 VM 을 3840 화면 크기로 생성해줘
5) "tv-vm" 이라는 이름의 에뮬레이터 VM 을 부팅해줘
6) 에뮬레이터에 내 Tizen TV 앱을 설치해줘
```

**예상 시간:** ~15-20 분 (TV SDK 설치 + 에뮬레이터 패키지 + 콜드 부팅).

### 경로 3: 커스텀 하드웨어 구성

리소스가 적은 호스트 또는 특정 테스트 시나리오에 사용합니다:

```
1) Tizen 에뮬레이터 패키지를 다운로드해줘
2) "my-vm" 이라는 이름의 에뮬레이터 VM 을 720p, 512MB RAM, GL 가속 없음으로 생성해줘
3) "my-vm" 이라는 이름의 에뮬레이터 VM 을 부팅해줘
4) 연결된 Tizen 디바이스를 찾아줘
5) 에뮬레이터에 내 Tizen 앱을 설치해줘
```

**예상 시간:** ~10-15 분 (720p 가 1080p 보다 빠르게 부팅됨).

### 경로 4: 한 단계로 생성 및 부팅

신속한 반복 작업을 위해:

```
1) Tizen 에뮬레이터 패키지를 다운로드해줘
2) "my-vm" 이라는 이름의 에뮬레이터 VM 을 1080p 로 생성하고 즉시 부팅해줘
3) 에뮬레이터에 내 Tizen 앱을 설치해줘
```

**예상 시간:** ~10-15 분 (단일 생성 + 부팅 단계).

---

## 관리 및 문제 해결

### 에뮬레이터 관리자 정보 보기

**이렇게 말하세요:**
```
에뮬레이터 관리자 버전과 워크스페이스 경로를 보여줘
```

**결과:** 에뮬레이터 관리자 버전, 워크스페이스 경로 및 패키지 버전이 표시됩니다.

### 단일 VM 세부 정보 보기

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 의 세부 정보를 보여줘
```

**결과:** 해상도, RAM, CPU, 스킨 경로 및 기타 구성이 표시됩니다.

### VM 을 공장 상태로 초기화 (파괴적)

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 공장 상태로 초기화해줘
```

> ⚠️ **경고:** 이는 VM 의 디스크 이미지를 포맷하고 설치된 모든 앱을 삭제합니다. 명시적으로 확인해야 합니다.

**결과:** VM 이 완전히 지워지며 모든 데이터가 손실됩니다.

### VM 에서 플랫폼 이미지 생성

**이렇게 말하세요:**
```
"my-vm" 의 디스크 이미지를 캡처하여 재사용 가능한 플랫폼 이미지로 "/tmp/images" 에 저장해줘
```

**결과:** VM 의 디스크가 재사용 가능한 플랫폼 이미지로 저장됩니다.

---

## 문제 해결

### 에뮬레이터가 부팅되지 않음

**증상:** `emulator_boot_failed` 오류, sdb 대기 타임아웃.

**이렇게 말하세요:**
```
에뮬레이터 "my-vm" 이 부팅되지 않았습니다 — 문제를 진단해줘
```

**일반적인 원인과 해결 방법:**

| 원인 | 진단 | 해결 방법 |
|------|------|----------|
| CPU 가상화 비활성화 | 진단의 `hw_virtualization: "no"` | `"my-vm" 에서 CPU 가상화를 활성화해줘` |
| KVM 누락 (Linux) | `/dev/kvm: missing` | `qemu-kvm` 설치; 사용자를 `kvm` 그룹에 추가 |
| 라이브러리 누락 | `missing_libs: ["libasound2", "libsdl1.2"]` | 호스트 패키지 설치 |
| Qt xcb 실패 | `qt_xcb: failed` | `libxcb-*` 패키지 설치 |
| Java/JNA 충돌 | `java_jna: failed` | 에뮬레이터 패키지 재설치 |
| 디스플레이 없음 (WSL/SSH) | `display: "missing"` | WSLg 활성화 또는 DISPLAY 설정 |

### Java/JNA 종속성 오류

**증상:** em-cli 가 `NoClassDefFoundError` 또는 `UnsatisfiedLinkError` 로 충돌합니다.

**이렇게 말하세요:**
```
에뮬레이터 패키지를 재설치해줘
```

**결과:** 에뮬레이터 패키지가 재설치되어 JNA 네이티브 라이브러리가 복원됩니다.

### VM 이 이미 존재함

**증상:** `An emulator VM named 'my-vm' already exists.`

**이렇게 말하세요:**
```
"my-vm" 이라는 이름의 에뮬레이터 VM 을 삭제해줘
```

그런 다음 같은 이름으로 다시 생성합니다.

### 템플릿을 찾을 수 없음

**증상:** `em-cli reported no templates`.

**이렇게 말하세요:**
```
사용 가능한 에뮬레이터 화면 크기를 목록으로 보여줘
```

비어 있으면 에뮬레이터 패키지가 설치되지 않았을 수 있습니다 — 1 단계를 실행하세요.

### TV 에뮬레이터를 사용할 수 없음

**증상:** `profile 'tv' not found` 또는 TV 템플릿이 없습니다.

**이렇게 말하세요:**
```
TV SDK 확장을 설치해줘
```

그런 다음 TV 에뮬레이터 생성을 다시 시도하세요.

---

## E2E 확인 체크리스트

수동 E2E 테스트 중 다음 항목을 확인하세요.

### 기본 에뮬레이터 경로

| # | 확인 | 예상 |
|---|------|------|
| 1 | 1 단계 Envelope | `status: "success"`, 에뮬레이터 패키지가 설치됨으로 나열됨 |
| 2 | 2 단계 Envelope | 템플릿당 해상도/RAM 이 포함된 `template_details` 배열 |
| 3 | 3 단계 Envelope | `status: "success"`, `vm_name` 이 요청과 일치, `size_applied: true` |
| 4 | VM 파일 존재 | `{SDK_DATA}/emulator/vm/` 에 VM 디렉토리가 보임 |
| 5 | 4 단계 Envelope | `device_serial` 채워짐 (예: `emulator-26101`) |
| 6 | sdb 연결 | `sdb devices` 가 에뮬레이터를 표시 |
| 7 | 앱 설치 | `tizen-install-app` 이 성공적으로 완료 |

### TV 에뮬레이터 경로

| # | 확인 | 예상 |
|---|------|------|
| 8 | TV SDK 설치됨 | `list-platform` 에 `tv-samsung-7.0-x86_64` 플랫폼이 보임 |
| 9 | 3 단계 Envelope | `profile: "tv"`, `size: "3840"`, `resolution: "3840x1080"` |
| 10 | 부팅 성공 | 콜드 부팅 후 `device_serial` 채워짐 |

### 문제 해결 경로

| # | 확인 | 예상 |
|---|------|------|
| 11 | 부팅 진단 | 오류 세부 정보에 `LAUNCH_DIAG` 줄이 존재 |
| 12 | 가상화 해결 | `modify --hw-virtualization yes` 가 부팅 실패 해결 |
| 13 | Java/JNA 해결 | 에뮬레이터 패키지 재설치가 `NoClassDefFoundError` 해결 |

### 실패 경로 (오류 매핑)

| # | 시나리오 | 예상 |
|---|----------|------|
| 14 | VM 이름 충돌 | `error_category: "invalid_parameters"` — "VM already exists" |
| 15 | 크기 지정 안 됨 | `error_category: "user_input_required"` — 사용자에게 크기 문의 |
| 16 | 잘못된 크기 | `error_category: "invalid_parameters"` — 지원되는 크기 표시 |
| 17 | SDK 설치 안 됨 | `error_category: "sdk_path_not_set"` — `tizen-sdk-install` 먼저 실행 |
| 18 | VM 없음 (부팅) | `error_category: "emulator_not_found"` — 먼저 `create` 실행 |
| 19 | TV SDK 누락 | `error_category: "tv_sdk_not_installed"` — `tizen-tv-sdk-install` 실행 |

---

## 키보드 단축키 및 팁

- **자연어:** plain English 로 원하는 것을 설명하기만 하면 됩니다. Claude 는 "1080p 에뮬레이터 만들어줘", "4K TV 에뮬레이터 생성해줘", "my-vm 을 720p 로 크기 변경해줘"를 이해합니다.
- **화면 크기는 사용자 선택:** Claude 는 생성하기 전에 항상 원하는 크기를 물어봅니다 — 이는 의도적입니다. 기본값 (1080) 이 미리 선택되지만, 사용자가 결정합니다.
- **콜드 부팅은 느림:** 첫 부팅은 5-7 분이 소요됩니다; 이후 부팅은 더 빠릅니다. 인내심을 가지세요.
- **VM 이름 복사 - 붙여넣기:** VM 이름은 대소문자를 구분합니다. `my-vm` 을 생성했다면, 후속 명령에서 정확히 `my-vm` 을 사용하세요.
- **문제 해결에 `--detail` 사용:** `list-vm --detail` 및 `detail --vm-name` 액션은 요청된 내용과 실제 적용된 내용을 보여줍니다.
- **성능을 위한 가상화 활성화:** 호스트가 KVM/VT-x 를 지원하면, 더 나은 에뮬레이터 성능을 위해 `hw-virtualization` 을 활성화하세요.
- **문제 해결을 위한 GL 가속 비활성화:** 에뮬레이터가 부팅 시 충돌하면, `--hw-gl-acceleration no` 를 시도하세요.
- **TV 에뮬레이터는 TV SDK 필요:** TV 프로필 VM 을 생성하기 전에 TV SDK 확장을 설치하세요.
- **오래된 VM 정리:** `delete` 를 사용하여 사용하지 않는 VM 을 제거하고 디스크 공간을 확보하세요.

---

## 관련 문서

- 전체 에이전트 개요: [README.md](../README.md)

- 스킬 참조: [SKILLS_REFERENCE.md](../SKILLS_REFERENCE.md) (tizen-create-emulator, tizen-launch-emulator)
- 인증서 관리 시나리오: [certificate-manager-walkthrough.md](../certificate/certificate-manager-walkthrough.md)

- 웹 앱 디버깅 시나리오: [scenario-webapp-debug-walkthrough.md](../debug/scenario-webapp-debug-walkthrough.md)
- 네이티브 앱 디버깅 시나리오: [scenario-native-app-walkthrough.md](../project/scenario-native-app-walkthrough.md)


