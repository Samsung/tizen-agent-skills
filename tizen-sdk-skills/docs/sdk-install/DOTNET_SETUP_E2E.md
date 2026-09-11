# Tizen .NET 개발 환경 설정 (End-to-End 가이드)

[English](DOTNET_SETUP_E2E.en.md) | 한국어

이 문서는 Tizen 플랫폼에서 .NET 애플리케이션을 개발하기 위한 .NET SDK와 Tizen 워크로드 설치를 단계별로 안내합니다.

## 목차

1. [개요](#개요)
2. [사전 요구사항](#사전-요구사항)
3. [Windows 설치](#windows-설치)
4. [Linux 설치](#linux-설치)
5. [macOS 설치](#macos-설치)
6. [검증 및 문제 해결](#검증-및-문제-해결)
7. [다음 단계](#다음-단계)

## 개요

Tizen .NET 개발을 위해서는 두 가지가 필요합니다:

1. **.NET SDK** (8.0 이상 권장)
   - 마이크로소프트에서 제공하는 C# 및 .NET 개발 도구

2. **Tizen .NET 워크로드**
   - Samsung이 제공하는 Tizen 플랫폼용 확장 패키지
   - `.NET SDK의 같은 버전(밴드)에 설치되어야 함`

### 중요: SDK 버전 불일치 (Issue #258)

워크로드는 **설치한 .NET SDK 버전과 같은 밴드에 반드시 등록되어야 합니다.**

예를 들어:
- .NET 10.0.302 (밴드: 10.0.300)에 workload를 설치하면 → 10.0.300 밴드에 등록됨 ✅
- 그러나 환경변수 DOTNET_ROOT가 다른 설치를 가리키면 → 다른 밴드에 등록될 수 있음 ❌

Samsung의 `workload-install` 스크립트는 설치 대상을 스스로 정합니다(`DOTNET_ROOT`가 있으면 그 값, 없으면 `%ProgramFiles%\dotnet`). 반면 검증은 PATH의 `dotnet`으로 이루어지므로, 둘이 어긋나면 워크로드가 엉뚱한 밴드에 등록됩니다.

설정 스크립트는 이를 다음과 같이 처리합니다:

- 설치와 검증을 **같은 dotnet에 고정**합니다 (설치기에 `-d <dotnet-root>` 전달).
- `DOTNET_ROOT`는 **해당 실행에서만** 재정의하며, 사용자의 영구 설정값은 건드리지 않습니다.
- 그래도 밴드가 어긋나면 **종료 코드 3**과 함께 `[DIAG]` 정보로 원인을 특정합니다.

> **user-scope 설치**(Linux/macOS `~/.dotnet`, Windows `%LOCALAPPDATA%\Microsoft\dotnet`)에서는 `DOTNET_ROOT`가 그 디렉터리를 가리키는 것이 **정상**입니다 — 설정 스크립트가 바로 그 값을 영속화합니다. 불일치 문제는 `DOTNET_ROOT`가 PATH의 `dotnet`과 *다른* 설치를 가리킬 때만 발생합니다.

## 사전 요구사항

### 시스템 요구사항

.NET 8 SDK 기준입니다 (Microsoft 지원 OS 정책을 따릅니다).

| 요소 | 요구사항 |
|------|---------|
| Windows | 10 버전 1607 이상 / Server 2012 R2 이상 (user-scope 설치는 관리자 권한 불필요; `C:\Program Files` 시스템 설치는 UAC 팝업 1회) |
| Linux | Ubuntu 20.04 이상, Debian 11 이상, RHEL 8 이상 |
| macOS | 12 (Monterey) 이상 |
| 디스크 공간 | 최소 2GB |
| 인터넷 | 필수 (Proxy 환경 지원) |

> .NET 8부터 Windows 7/8.1, Ubuntu 18.04 이하, CentOS 7은 지원이 종료되었습니다. 더 오래된 OS라면 해당 OS를 지원하는 마지막 .NET 버전을 확인하세요.

### 설치 전 확인

현재 시스템에 .NET SDK가 설치되어 있는지 확인:

```bash
# 모든 플랫폼
dotnet --version

# 만약 설치되지 않았으면 "명령을 찾을 수 없음" 또는 "command not found" 오류 발생
```

---

## Windows 설치

### 1단계: .NET SDK 및 Tizen 워크로드 통합 설정 (권장)

#### 방법 A: Claude Code / Cline Agent 사용 (가장 편함)

**요청 예시:**

> "Setup .NET development environment for Tizen"
> 또는
> ".NET SDK 설정해줘"
> 또는
> "tizen dotnet setup"

이렇게 요청하면 `tizen-dotnet-setup` agent가 실행되어 자동으로:
1. .NET SDK 감지 — 어디에도 없으면 `%LOCALAPPDATA%\Microsoft\dotnet`에 **user-scope로 자동 설치** (공식 dotnet-install.ps1, **관리자 권한·UAC 팝업 불필요**)
2. Samsung workload-install.ps1 다운로드 및 실행
3. 워크로드 설치 검증
4. JSON Envelope 형태로 결과 반환

**추가 요청 예시** (Agent에는 플래그가 아니라 자연어로 말합니다):

> "Tizen 워크로드 강제로 재설치해줘" → 러너에 `--force` 전달
> "Tizen 워크로드 10.0.123 버전으로 설치해줘" → 러너에 `--workload-version 10.0.123` 전달
> "SDK는 자동으로 설치하지 말고 설정만 해줘" → 러너에 `--no-install-sdk` 전달

#### 방법 B: tizen-cli 명령어 사용

```bash
# Tizen .NET 환경 통합 설정
tizen-cli tizen-sdk dotnet-setup

# 옵션 포함
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --workload-version 10.0.123
tizen-cli tizen-sdk dotnet-setup --no-install-sdk    # SDK가 없어도 자동 설치하지 않음
tizen-cli tizen-sdk dotnet-setup --sdk-channel 9.0   # 자동 설치 채널 (기본 8.0)
```

#### 방법 C: 수동 설정 (단계별)

**1-1단계: .NET SDK 설치**

##### 방법 C1: 관리자 권한 없이 user-scope 설치 (권장)

`%LOCALAPPDATA%\Microsoft\dotnet`에 설치되며 **관리자 권한도 UAC 팝업도 필요 없습니다**. Agent의 자동 설치가 사용하는 것과 같은 경로입니다. (참고: `C:\Program Files`는 Windows가 보호하는 경로라 권한 상승 없이는 *어떤* 설치기도 쓸 수 없습니다 — 시스템 경로가 필요하면 방법 C2를 사용하세요.)

```powershell
# 공식 설치 스크립트 (일반 PowerShell, 권한 상승 없음)
Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile dotnet-install.ps1
./dotnet-install.ps1 -Channel 8.0 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet"

# 새 셸에서도 보이도록 User 환경변수 설정
[Environment]::SetEnvironmentVariable('DOTNET_ROOT', "$env:LOCALAPPDATA\Microsoft\dotnet", 'User')
[Environment]::SetEnvironmentVariable('PATH', "$env:LOCALAPPDATA\Microsoft\dotnet;" + [Environment]::GetEnvironmentVariable('PATH', 'User'), 'User')
```

##### 방법 C2: winget 사용 (시스템 설치 — `C:\Program Files\dotnet`)

관리자 터미널이 필요 없습니다 — **일반 PowerShell**에서 실행하면 설치 시점에 **UAC 팝업 1회**만 뜹니다.

```powershell
# 1. Proxy가 없는 경우
winget install Microsoft.DotNet.SDK.8

# 2. 기업 Proxy가 있는 경우
# 먼저 Proxy 지원 활성화 (이 단계만 Administrator PowerShell 필요)
winget settings --enable ProxyCommandLineOptions

# 그 후 설치 (IT에 Proxy 주소 문의)
winget install Microsoft.DotNet.SDK.8 --proxy http://[proxy-host]:[port]
```

##### 방법 C3: 수동 설치

1. [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) 방문
2. ".NET 8 SDK" 다운로드 (또는 최신 LTS 버전)
3. 설치 마법사 실행 (시스템 설치이므로 UAC 팝업이 뜸)
4. 설치 완료 후 새 PowerShell 창 열기

**1-2단계: Tizen .NET 워크로드 설치**

##### 수동 스크립트 실행

새 **PowerShell** 실행 (Administrator는 SDK가 `C:\Program Files\dotnet` 같은 보호된 경로에 있을 때만 필요 — user-scope SDK는 권한 상승 불필요):

```powershell
# 플러그인 스크립트 직접 실행
powershell -ExecutionPolicy Bypass -File `
  "C:\Users\[username]\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\1.0.0\scripts\tizen-dotnet-setup\tizen-dotnet-setup.ps1"

# 옵션 추가
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -Force
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -Version "10.0.123"
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -NoInstallSdk
powershell -ExecutionPolicy Bypass -File `
  "...\tizen-dotnet-setup.ps1" -SdkChannel "9.0"
```

**스크립트 자동 실행 내용:**
1. .NET SDK 감지 — 어디에도 없으면 `%LOCALAPPDATA%\Microsoft\dotnet`에 user-scope로 자동 설치 (관리자 권한 불필요; `-NoInstallSdk`로 건너뜀)
2. Samsung workload-install.ps1 실행
3. 워크로드 설치 검증
4. 문제가 있으면 `[DIAG]` 정보 출력

---

## Linux 설치

### 1단계: .NET SDK 및 Tizen 워크로드 통합 설정 (권장)

#### 방법 A: Claude Code / Cline Agent 사용 (가장 편함)

**요청 예시:**

> "Setup .NET development environment for Tizen"
> 또는
> ".NET SDK 설정해줘"
> 또는
> "tizen dotnet setup"

**추가 요청 예시** (Agent에는 플래그가 아니라 자연어로 말합니다):

> "Tizen 워크로드 강제로 재설치해줘" → 러너에 `--force` 전달
> "Tizen 워크로드 10.0.123 버전으로 설치해줘" → 러너에 `--workload-version 10.0.123` 전달

#### 방법 B: tizen-cli 명령어 사용

```bash
tizen-cli tizen-sdk dotnet-setup
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --no-install-sdk    # SDK가 없어도 자동 설치하지 않음
tizen-cli tizen-sdk dotnet-setup --sdk-channel 9.0   # 자동 설치 채널 (기본 8.0)
```

> .NET SDK가 어디에도 없으면 러너가 공식 dotnet-install.sh로 **`~/.dotnet`에 user-scope 자동 설치**(sudo 불필요)한 뒤 워크로드 설치를 계속합니다. `~/.dotnet`은 사용자 소유라 워크로드 단계에서도 sudo가 필요 없습니다.

#### 방법 C: 수동 설정 (단계별)

**1-1단계: .NET SDK 설치**

##### 방법 C1: 공식 설치 스크립트 (권장 — sudo 불필요, user-scope `~/.dotnet`)

sudo 없이 `~/.dotnet`에 설치되며, SDK 디렉터리가 사용자 소유이므로 이후 Tizen 워크로드 설치 단계에서도 sudo가 필요 없습니다. (참고: `/usr/bin`, `/usr/lib/dotnet` 같은 시스템 경로는 root 전용이라 sudo 없이는 *어떤* 설치기도 쓸 수 없습니다 — 시스템 설치가 필요하면 방법 C2를 사용하세요.)

```bash
# .NET 8 SDK 설치 (sudo 불필요)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0

# 환경 업데이트 (새 터미널에서 유효; 영구 적용은 ~/.bashrc에 추가)
export DOTNET_ROOT=$HOME/.dotnet
export PATH=$DOTNET_ROOT:$PATH
```

> 이미 열려 있던 셸에서 `dotnet`이 "No such file or directory"로 실패하면(예: 예전에 지운 `/usr/bin/dotnet`을 셸이 기억), 명령 경로 캐시가 낡은 것입니다 — `hash -r`(bash) / `rehash`(zsh)를 실행하거나 새 터미널을 여세요.

##### 방법 C2: 패키지 관리자 (시스템 설치 — sudo 필요)

root 소유의 `/usr/lib/dotnet`에 설치됩니다(`/usr/bin/dotnet` 링크 포함). 디렉터리가 root 소유이므로 **이후 Tizen 워크로드 설치 단계에서도 sudo가 필요**합니다(Issue 2 / `TIZEN_SDK_DOTNET_E003` 참고). 방법 C1은 둘 다 피할 수 있습니다.

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y dotnet-sdk-8.0

# RHEL/CentOS
sudo dnf install -y dotnet-sdk-8.0
```

##### 기업 Proxy가 있는 경우

```bash
export http_proxy=http://[proxy-host]:[port]
export https_proxy=http://[proxy-host]:[port]
export ftp_proxy=http://[proxy-host]:[port]

# 그 후 위의 설치 명령 실행
```

**1-2단계: Tizen .NET 워크로드 설치 (수동 스크립트)**

새 터미널 실행:

```bash
# 플러그인 스크립트 직접 실행
bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# sudo가 필요한 경우 — SDK가 root 소유(apt/dnf 설치)일 때만; ~/.dotnet SDK는 sudo 불필요
sudo bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# 옵션 추가
bash "...tizen-dotnet-setup.sh" --force
bash "...tizen-dotnet-setup.sh" --version "10.0.123"
bash "...tizen-dotnet-setup.sh" --no-install-sdk
bash "...tizen-dotnet-setup.sh" --sdk-channel "9.0"
```

**스크립트 자동 실행 내용:**
1. .NET SDK 감지 — 어디에도 없으면 `~/.dotnet`에 user-scope로 자동 설치 (sudo 불필요; `--no-install-sdk`로 건너뜀)
2. Samsung workload-install.sh 실행
3. 워크로드 설치 검증
4. 문제가 있으면 `[DIAG]` 정보 출력

---

## macOS 설치

### 1단계: .NET SDK 및 Tizen 워크로드 통합 설정 (권장)

#### 방법 A: Claude Code / Cline Agent 사용 (가장 편함)

**요청 예시:**

> "Setup .NET development environment for Tizen"
> 또는
> ".NET SDK 설정해줘"
> 또는
> "tizen dotnet setup"

**추가 요청 예시** (Agent에는 플래그가 아니라 자연어로 말합니다):

> "Tizen 워크로드 강제로 재설치해줘" → 러너에 `--force` 전달
> "Tizen 워크로드 10.0.123 버전으로 설치해줘" → 러너에 `--workload-version 10.0.123` 전달

#### 방법 B: tizen-cli 명령어 사용

```bash
tizen-cli tizen-sdk dotnet-setup
tizen-cli tizen-sdk dotnet-setup --force
tizen-cli tizen-sdk dotnet-setup --workload-version 10.0.123
```

#### 방법 C: 수동 설정 (단계별)

**1-1단계: .NET SDK 설치**

##### 방법 C1: Homebrew (권장)

```bash
# Homebrew 설치 (아직 없으면)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# .NET SDK 설치
brew install --cask dotnet-sdk

# 또는 특정 버전
brew install --cask dotnet-sdk@8
```

##### 기업 Proxy가 있는 경우

```bash
export ALL_PROXY=http://[proxy-host]:[port]

# 그 후 brew install 실행
brew install --cask dotnet-sdk
```

##### 방법 C2: 공식 설치 프로그램

1. [https://dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) 방문
2. macOS 버전 다운로드
3. `.pkg` 파일 실행

**1-2단계: Tizen .NET 워크로드 설치 (수동 스크립트)**

새 터미널 실행:

```bash
# 플러그인 스크립트 직접 실행
bash "$HOME/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# 옵션 추가
bash "...tizen-dotnet-setup.sh" --force
bash "...tizen-dotnet-setup.sh" --version "10.0.123"
```

**스크립트 자동 실행 내용:**
1. .NET SDK 감지
2. Samsung workload-install.sh 실행
3. 워크로드 설치 검증
4. 문제가 있으면 `[DIAG]` 정보 출력

---

## 검증 및 문제 해결

### 설치 확인

```bash
# .NET SDK 버전 확인
dotnet --version

# 설치된 SDK 목록
dotnet --list-sdks

# Tizen 워크로드 확인
dotnet workload list
```

성공하면 출력에 `tizen`이 보여야 합니다:

```
Installed Workload Id      Manifest Version      Installation Source
--------------------------------------------------------------------
tizen                      10.0.123/10.0.300    SDK 10.0.302
```

### 일반적인 문제

#### 문제 1: "Tizen workload not found after installation"

**원인**: 워크로드가 다른 .NET SDK 버전에 설치됨

**진단**: 스크립트 출력에서 `[DIAG]` 라인 확인 (종료 코드 3):

```
[DIAG] dotnet_version=10.0.302
[DIAG] sdk_band=10.0.300
[DIAG] installer_checked_bands=9.0.300
[DIAG] manifest_found_in_bands=9.0.300
[DIAG] permission_denied=false
```

사용 중인 dotnet은 `10.0.300` 밴드인데, 설치기는 `9.0.300` 밴드만 처리했고 매니페스트도 거기에만 있습니다.

**해결책**:

```powershell
# Windows: DOTNET_ROOT 환경변수 정리
$env:DOTNET_ROOT = ""

# Linux/macOS: DOTNET_ROOT 언셋
unset DOTNET_ROOT

# 그 후 다시 실행
```

> `[DIAG] permission_denied=true`이면 밴드 불일치가 아니라 **권한 문제**입니다. 이 경우 스크립트는 종료 코드 3이 아니라 1을 반환하며, 아래 "문제 2"의 해결책을 먼저 적용해야 합니다.

#### 문제 2: "Access Denied" 또는 "Permission Denied" (에러 코드 `TIZEN_SDK_DOTNET_E003`)

**원인**: .NET SDK 디렉터리에 쓰기 권한이 없음

**Ubuntu에서 특히 흔한 사례**: `apt`로 설치한 .NET SDK는 root 소유 `/usr/lib/dotnet`에 놓입니다. 워크로드 설치는 그 안에 파일을 써야 하므로 sudo가 필요합니다. 그런데 Agent/tizen-cli 러너는 **비대화형이라 sudo 비밀번호를 물을 수 없어**, 스크립트 내부의 sudo 재시도가 동작하지 않습니다. 이 경우 envelope의 `suggested_fix.command`에 실행할 정확한 명령이 담겨 나옵니다.

**해결책**:

```powershell
# Windows: Administrator PowerShell을 열고 (시작 메뉴 → PowerShell 우클릭 → 관리자 권한으로 실행)
# envelope의 suggested_fix.command 를 그대로 실행 — 예:
powershell -ExecutionPolicy Bypass -File "C:\Users\[username]\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\1.0.0\scripts\tizen-dotnet-setup\tizen-dotnet-setup.ps1"

# Linux/macOS: envelope의 suggested_fix.command 를 그대로 실행 (수동 스크립트를 sudo로)
sudo bash "$HOME/.tizen/plugins/tizen-sdk/scripts/tizen-dotnet-setup/tizen-dotnet-setup.sh"

# 완료 후 검증을 위해 원래 명령 재실행
tizen-cli tizen-sdk dotnet-setup
```

> **sudo 없는 대안**: `~/.dotnet`에 user-scope SDK를 설치하고(`curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0`) setup을 재실행하세요. `~/.dotnet`은 사용자 소유라 SDK도 워크로드 단계도 sudo가 전혀 필요 없습니다.

#### 문제 3: Proxy 오류

**진단**:

```bash
# Proxy 연결 테스트
curl -x http://[proxy-host]:[port] https://api.nuget.org/v3/index.json
```

**해결책**:

```powershell
# Windows
winget settings --enable ProxyCommandLineOptions
winget install Microsoft.DotNet.SDK.8 --proxy http://[proxy]:[port]

# Linux/macOS
export http_proxy=http://[proxy]:[port]
export https_proxy=http://[proxy]:[port]
```

#### 문제 4: ".NET SDK not found" (에러 코드 `TIZEN_SDK_DOTNET_E001`)

**원인**: .NET SDK가 어디에도 없고, **그리고** 스크립트 자체의 user-scope 자동 설치가 건너뛰어졌거나(`--no-install-sdk`) 실패함 — 자동 설치 실패는 보통 오프라인이거나 프록시 환경일 때 발생합니다(`http_proxy`/`https_proxy` 설정 후 재실행).

**해결책** — 이것은 **2단계 흐름**입니다:

```bash
# 1단계: SDK 설치 (envelope의 suggested_fix.command — sudo 불필요, ~/.dotnet에 설치)
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0

#   (시스템 설치 대안 — sudo 필요, 이후 워크로드 단계에서도 sudo 필요)
sudo apt-get update && sudo apt-get install -y dotnet-sdk-8.0

# 2단계: 같은 setup 을 재실행 — 이 재실행이 Tizen 워크로드를 설치합니다
tizen-cli tizen-sdk dotnet-setup
```

> **SDK 설치만으로는 끝나지 않습니다.** Tizen 워크로드는 재실행 시점에 설치됩니다. 또한 apt/dnf로 설치한 SDK는 root 소유라 재실행 시 "문제 2"의 권한 안내(`sudo bash <스크립트>`)가 나올 수 있습니다 — 그 명령을 그대로 실행하면 됩니다. user-scope `~/.dotnet` 경로는 이 문제를 아예 피할 수 있습니다.

### 스크립트 상세 진단

설치 스크립트가 실패하면 다음 정보를 출력합니다:

```
[DIAG] dotnet_path=...                    # 심볼릭 링크까지 해석한 실제 dotnet 경로
[DIAG] dotnet_version=...                 # .NET SDK 버전
[DIAG] dotnet_root=...                    # .NET 설치 디렉터리
[DIAG] sdk_band=...                       # SDK 기능 밴드 (예: 10.0.300)
[DIAG] env_dotnet_root=...                # DOTNET_ROOT 환경변수 값
[DIAG] installer_pinned_dir=...           # -d 로 고정한 설치 디렉터리 ((not pinned) 가능)
[DIAG] installer_update_all=...           # -u (모든 밴드 순회) 사용 여부
[DIAG] installer_checked_sdks=...         # Samsung installer가 실제로 처리한 SDK 전체
[DIAG] installer_checked_bands=...        # 위 SDK들의 기능 밴드 전체
[DIAG] manifest_expected=...              # 워크로드 매니페스트가 있어야 할 경로
[DIAG] manifest_found_in_bands=...        # 워크로드가 실제로 있는 밴드들
[DIAG] workload_version_line=...          # dotnet workload list 출력
[DIAG] permission_denied=...              # 권한 문제 여부
```

이 정보는 정확한 문제 진단에 도움이 됩니다.

**읽는 순서:**

1. `permission_denied=true` → 권한 문제입니다. 다른 항목은 결과일 뿐이므로 권한부터 해결하세요 (종료 코드 1).
2. `sdk_band`이 `installer_checked_bands` 또는 `manifest_found_in_bands`에 없음 → 밴드 불일치 (종료 코드 3). `DOTNET_ROOT`를 정리하고 재실행하세요.
3. `installer_pinned_dir=(not pinned)` → 해석한 dotnet 경로에 `sdk` 디렉터리가 없어 `-d` 고정을 건너뛴 상태입니다. `dotnet_path`가 올바른 설치 경로인지 확인하세요.

> `installer_checked_sdks`는 설치기가 **처리한 SDK 전체 목록**입니다. `-u`(`installer_update_all=true`)일 때 설치기는 설치된 모든 SDK를 순회하므로, 마지막 한 줄만 보고 "설치 대상"을 판단하면 안 됩니다.

### 종료 코드

| 코드 | 의미 |
|------|------|
| 0 | 성공 / 이미 설치됨 |
| 1 | 설치 실패 (권한 문제 포함) |
| 2 | .NET SDK를 어디에서도 찾지 못했고, user-scope 자동 설치도 건너뛰었거나(`--no-install-sdk`) 실패함 — 사용자가 직접 설치해야 함 |
| 3 | 워크로드가 사용 중인 dotnet과 **다른 SDK 밴드**에 등록됨 |

---

## 다음 단계

워크로드 설치가 완료되면:

### 1. Tizen .NET 프로젝트 생성

#### Claude Code / Cline Agent 사용

```
"Create a new .NET Tizen project"
또는
"Create DotNET Tizen project named MyApp"
또는
"Create a NUI app for Tizen"
```

#### tizen-cli 명령어 사용

`--template`은 SDK에 설치된 템플릿 이름이어야 하므로, 먼저 목록을 조회합니다:

```bash
# 1. 사용 가능한 DotNET 템플릿 조회
tizen-cli tizen-sdk list-templates --type dotnet

# 2. 조회된 템플릿 이름으로 생성
tizen-cli tizen-sdk create-project \
  --type dotnet \
  --template <위에서 조회한 템플릿 이름> \
  --parent-path ./projects \
  --name MyApp
```

`--type`, `--template`, `--parent-path`, `--name`은 모두 **필수**입니다. 앱 폴더는 `--parent-path` 안에 `--name` 이름으로 생성됩니다.

> 프로젝트 스캐폴딩은 반드시 이 스킬을 통해 수행하세요. `tizen-manifest.xml` 같은 파일을 손으로 작성하면 안 됩니다.

### 2. 프로젝트 빌드

#### Claude Code / Cline Agent 사용

```
"Build the Tizen project"
또는
"Build MyApp"
또는
"빌드해줘"
```

#### tizen-cli 명령어 사용

```bash
tizen-cli tizen-sdk build-project \
  --project ./projects/MyApp \
  --build-type Debug
```

`--build-type`은 `Debug`(기본) / `Release` / `Test` 중 하나입니다. 디버깅할 계획이라면 **반드시 `Debug`** 로 빌드하세요 — Release 바이너리에는 portable PDB가 없어 브레이크포인트가 걸리지 않습니다.

#### 수동 명령어

```bash
cd ./projects/MyApp
dotnet build
```

### 3. 에뮬레이터에 배포

#### Claude Code / Cline Agent 사용

```
"Install the app to emulator"
또는
"Launch the app"
또는
"앱을 설치해줘"
```

참고: 패키지 경로(.tpk) 또는 프로젝트 경로를 지정할 수 있습니다.

#### tizen-cli 명령어 사용

```bash
# 1. 에뮬레이터 연결 확인
sdb devices

# 2. 앱 설치 후 바로 실행 (--run)
tizen-cli tizen-sdk install-app \
  --package ./projects/MyApp/Debug/MyApp-1.0.0.tpk \
  --run
```

패키지 경로는 `--package`이며 **`.tpk` 파일**을 가리켜야 합니다(프로젝트 폴더가 아닙니다). 설치와 실행은 한 명령으로 처리되므로 별도의 실행 명령은 없습니다.

#### 수동 명령어

```bash
# 설치
sdb install ./projects/MyApp/Debug/MyApp-1.0.0.tpk

# 실행 (앱 ID는 tizen-manifest.xml 확인)
sdb shell app_launcher -s org.tizen.myapp
```

---

## 참고 자료

- [Tizen .NET 공식 가이드](https://docs.tizen.org/application/dotnet/)
- [.NET SDK 다운로드](https://dotnet.microsoft.com/download)
- [Tizen 에뮬레이터 설치](../emulator/)
- [SDK 검증](SDK_INSTALLATION_VERIFICATION.md)
- [Custom Repository 설치](CUSTOM_REPOSITORY_INSTALL.md)

---

## 문제 보고

설치 중 문제가 발생하면:

1. `[DIAG]` 라인 캡처
2. 정확한 오류 메시지 기록
3. 플랫폼 / OS 버전 기록
4. [이슈 보고](https://github.com/Samsung/tizen-agent-skills/issues)
