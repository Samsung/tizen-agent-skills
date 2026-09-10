# Cline 설치 및 플러그인 동기화 통합 가이드

> **v0.1.0** — 2026-07-10
> 플러그인 캐시 동기화 + 개인 복사본 관리 + Cline 스킬 설치를 **한 스크립트**로 처리합니다.
> 아래의 Cline 스킬/훅 경로(`~/.cline/skills/`, `~/Documents/Cline/Hooks/`)는 스킬·훅을
> 지원하는 Cline 빌드 기준입니다 — 사용 중인 빌드를 확인하세요. upstream Cline은 다를 수 있습니다.

## 개요

통합 설치·동기화 스크립트(`setup.ps1` / `.sh` / `.bat`)는 다음 5가지 작업을
한 번에 처리합니다:

| 작업 | 대상 | 동기화 방식 |
|---|---|---|
| **① 플러그인 캐시 동기화** | `~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0/` | 리포 → 캐시, **미러** (skills/agents/scripts/lib/docs) |
| **② 개인 복사본 동기화** | `~/.claude/skills/`, `~/.claude/agents/` | 캐시 → 개인, **tizen 스킬 폴더별 미러** + agents `*.md` 복사 |
| **③ Cline 스킬 설치** | `~/.cline/skills/` | 리포 `skills/`의 스킬 폴더별 **미러** (스킬을 지원하는 Cline 빌드가 로드하는 경로) |
| **④ Cline 훅 설치** | `~/Documents/Cline/Hooks/`, `~/Documents/Cline/Rules/` | `PreToolUse` 어댑터 + 가드 스크립트 복사 — Claude Code와 동일 가드를 Cline에서 강제 (훅을 지원하는 Cline 빌드의 훅 프로토콜, **Windows 미지원**, 설정 UI에서 활성화 필요). **Windows 폴백**으로 같은 가드를 상시 주입 전역 Rule(`tizen-sdk-skills-guard.md`)로도 설치 |
| **⑤ Cline 서브에이전트 안내** | (설치 파일 없음) | 서브에이전트를 지원하는 Cline 빌드의 내장 기능 — 설정 → Feature Settings → Agent → Subagents 활성화. 읽기 전용 리서치 에이전트가 `use_skill`로 ③의 스킬을 로드해 탐색; 러너 실행은 메인 에이전트 |

> ⚠️ **미러 동기화 주의**: 미러 대상(캐시의 skills/agents/scripts/lib/docs,
> `~/.claude/skills` 및 `~/.cline/skills`의 `tizen-*` 스킬 폴더)은 복사 전에 기존 내용을
> **삭제 후 재복사**합니다. 리포에서 지운 파일이 대상에서도 사라집니다. 이 경로들의
> **tizen 외 스킬**(token-usage 등)은 건드리지 않습니다.

**이 스크립트 하나로** [HARNESS_SETUP.md](HARNESS_SETUP.md)(Cline 설치)와
[PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md)(캐시·개인 복사본 동기화)의
수동 절차를 대체하고 검증까지 자동화합니다.

---

## 전제 조건

- **Windows**: PowerShell 5.1 이상 (기본 제공) — cmd 사용자는 `.bat` 래퍼 사용 가능
- **macOS/Linux/Git Bash**: Bash 4.0 이상
- 플러그인 캐시 디렉토리는 **없으면 스크립트가 자동 생성**하므로 미리 준비할 필요 없음
- Cline 스킬을 실제로 실행하려면 `node`가 PATH에 있어야 함 (러너 실행용)

---

## 빠른 시작

스크립트 위치: `cline/setup/`

```powershell
# Windows — PowerShell
powershell -ExecutionPolicy Bypass -File "C:\path\to\tizen-sdk-skills\cline\setup\setup.ps1"
```

```cmd
:: Windows — cmd.exe (배치 래퍼, 인자는 그대로 ps1에 전달됨)
C:\path\to\tizen-sdk-skills\cline\setup\setup.bat
```

```bash
# macOS / Linux / Git Bash
bash ~/path/to/tizen-sdk-skills/cline/setup/setup.sh
```

실행 후 **Claude Code 세션을 재시작**해야 새 스킬 정의가 로드됩니다
(Cline은 `~/.cline/skills`를 매 세션 읽으므로 재시작 불필요).

---

## 옵션

### PowerShell (`setup.ps1`, `.bat` 동일)

| 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `-RepoPath` | string | 스크립트 위치에서 자동 계산 (리포 루트) | tizen-sdk-skills 리포 경로 |
| `-SkipValidation` | switch | off | 설치 후 검증 스킵 |
| `-NoRestart` | switch | off | 재시작 안내 메시지 미표시 |

```powershell
# 검증 생략 + 재시작 메시지 없이 (빠른 재동기화)
.\setup.ps1 -SkipValidation -NoRestart
```

### Bash (`setup.sh`)

| 옵션 | 설명 |
|---|---|
| `--repo <path>` | 리포 경로 (기본: 스크립트 위치에서 자동 계산) |
| `--skip-validation` | 설치 후 검증 스킵 |
| `--no-restart` | 재시작 안내 메시지 미표시 |

```bash
bash setup.sh --repo /home/user/projects/tizen-sdk-skills
```

---

## 스크립트 동작 방식

```
┌──────────────────────────────────────────────────────────────┐
│ 리포지토리 (원본 — 소스 오브 트루스)                            │
│ <repo-root> (tizen-sdk-skills checkout)                  │
│   ├── common/{skills,agents,scripts,lib}/ │
│   ├── docs/                                                   │
│   └── common/hooks/  ← settings.json이 │
│       리포 절대경로를 직접 참조 (복사 안 함, 수정 즉시 반영)     │
└────────────┬──────────────────────────┬───────────────────────┘
             │ ① 미러                    │ ③ 스킬 폴더별 미러
             ▼                          ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│ 플러그인 캐시             │   │ ~/.cline/skills/ (Cline)   │
│ ~/.claude/plugins/cache/ │   │ ├── tizen-build-project/     │
│ .../0.1.0/               │   │ ├── tizen-create-project/    │
│ {skills,agents,scripts,  │   │ └── ... (스킬 폴더별)          │
│  lib,docs}/              │   │ (Cline이 매 세션 로드)         │
└────────────┬────────────┘   └──────────────────────────────┘
             │ ② 스킬 폴더별 미러 + agents *.md 복사
             ▼
┌─────────────────────────┐
│ Claude Code 개인 경로     │
│ ~/.claude/skills/tizen-* │  ← 현재 실제 로딩 경로
│ ~/.claude/agents/*.md    │    (마켓플레이스 정책 차단 우회)
└─────────────────────────┘
```

- **① 캐시**: SKILL.md가 CLI 러너를 캐시 경로 글롭(`*/lib/cli/*.js`)으로 참조하므로
  캐시가 항상 리포 최신이어야 합니다. Cline 스킬의 러너도 같은 캐시를 씁니다.
- **② 개인 경로**: 조직 정책이 마켓플레이스를 차단하는 동안의 실제 스킬 로딩 경로.
  정책 해제 시 제거 절차는 [PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md) 참고.
- **③ Cline 스킬**: `~/.cline/skills/` 에 스킬 폴더별로 설치됩니다. 스킬을 지원하는
  Cline 빌드는 이 경로에서 스킬을 로드하므로(Claude Code 의 `~/.claude/skills` 와 유사) 모든
  워크스페이스에 적용됩니다. 스킬만 다시 설치하려면 `install-cline-skills.ps1/.sh`를
  사용하세요 ([HARNESS_SETUP.md](HARNESS_SETUP.md) 참고).

---

## 출력 예시 (실제 출력 — 영문)

> 스크립트 메시지는 PowerShell 5.1의 인코딩 문제(한글 깨짐)를 피하기 위해 영문입니다.

```
=== tizen-sdk-skills Integrated Setup and Sync ===

[Step 1] Path validation
[Info] Repository: C:\path\to\tizen-sdk-skills
[Info] Claude user path: C:\Users\<user>\.claude

[Step 2] Plugin cache sync
[Success] Skills copy complete: ... -> ...
[Success] Agents copy complete: ... -> ...
[Success] Lib copy complete: ... -> ...

[Step 3] Personal copy sync (actual loading paths)
[Success] Skill (personal): tizen-build-project copy complete: ...
[Success] Agents copy complete: ...

[Step 4] Cline skills installation (~/.cline/skills)
[Success] Cline skill: tizen-build-project copy complete: ...
[Success] ... (스킬 10개 각각)

[Step 5] Cline hooks installation (~/Documents/Cline/Hooks)
[Success] Cline PreToolUse hook installed: .../Cline/Hooks/PreToolUse
[Info] Enable the hook in the Cline settings UI (requires a Cline build with hooks support; hooks do not run on Windows)

[Step 6] Cline subagents (built-in - nothing to install)
[Info] Subagents are built into Cline builds that support them (check your build) - enable: Settings > Feature Settings > Agent > Subagents
[Info] Subagents are read-only researchers and can load the installed tizen skills via use_skill

[Step 7] Validation
[Success] Skills (repo <-> cache) : Validation passed
[Success] Lib (repo <-> cache) : Validation passed
[Success] Skill (personal): tizen-build-project : Validation passed
[Success] ... (스킬 10개 각각)
[Success] Cline skill: tizen-build-project : Validation passed
[Success] ... (스킬 10개 각각)
[Success] Cline hooks : Validation passed

=== Installation complete ===
NOTE: Claude Code restart required to load new skills.
```

---

## 검증

### 자동 검증 (Step 7 내장)

- **Skills / Lib (repo ↔ cache)**: 파일 개수·존재 재귀 비교
- **개인 스킬**: 캐시의 tizen 스킬 **폴더별로** 개인 경로와 비교
  (개인 경로에 다른 스킬이 있어도 오탐 없음)
- **Cline 스킬**: `~/.cline/skills` 의 tizen 스킬 **폴더별로** 리포와 비교
  (다른 스킬이 있어도 오탐 없음)
- **Cline 훅**: `PreToolUse` 어댑터(bash에서는 실행 권한까지)와 가드 스크립트 2개 존재 확인

`[Warning]`이 하나라도 나오면 해당 항목의 소스·대상 경로를 확인한 뒤 재실행하세요.

### 수동 검증 (설치 후)

```bash
# 스킬 인식 확인 — tizen 스킬 10개가 나와야 함 (세션 재시작 후)
claude -p "Answer with ONLY a comma-separated list of skill names containing tizen, or NONE."

# 훅 발동 확인 — 거부 + 교정 메시지가 나와야 함
claude -p "Run exactly this bash command and report the outcome: tizen list templates"

# 플러그인 차단 상태 확인
claude plugin list
```

디렉토리 일치 수동 확인 (bash):

```bash
repo="$HOME/path/to/tizen-sdk-skills"
cache="$HOME/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/0.1.0"
diff -rq "$repo/common/skills" "$cache/skills"   # 출력 없으면 일치
```

---

## 트러블슈팅

### 스킬이 로드되지 않음

1. 스크립트 재실행 후 **Claude Code 세션 재시작** (필수)
2. 개인 경로 확인:
   ```powershell
   Get-ChildItem "$env:USERPROFILE\.claude\skills" -Directory | Where-Object Name -like "tizen*"
   ```

### `[Error] Repository path not found`

리포 위치가 기본 계산과 다른 경우 `-RepoPath`(PowerShell) / `--repo`(bash)로
리포 루트를 명시하세요.

### `cannot be loaded because running scripts is disabled` (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File "...\setup.ps1"
```
또는 `.bat` 래퍼를 사용하세요 (내부에서 Bypass 처리).

### 터미널 한글 깨짐

스크립트 출력은 영문이라 안전합니다. Windows 시스템 오류 메시지가 깨질 때는
`chcp 65001` 실행. Cline 터미널의 깨짐은 [HARNESS_SETUP.md](HARNESS_SETUP.md)
트러블슈팅 참고.

---

## 설치 결과 — Cline에서 사용

설치 후 `~/.cline/skills/` 구조:

```
~/.cline/skills/
├── tizen-sdk-install/       (SKILL.md — 스킬 정의 + 라우팅)
├── tizen-create-project/
├── tizen-build-project/
├── tizen-device-manager/
├── tizen-install-app/
├── tizen-dotnet-setup/
├── tizen-dotnet-debug/
└── tizen-gdb-debug/
```

- 자연어: "타이젠 웹앱 만들어줘" → 스킬 description 라우팅으로 해당 스킬 수행
- 직접 호출: 채팅에 `/tizen-create-project` 등 스킬 이름 입력
- 10개 스킬 전부 `~/.cline/skills` 에 설치됩니다 (tizen-dotnet-debug 포함)

---

## 참고: 배포 체제 개요

| 항목 | 위치 | 역할 | 동기화 |
|---|---|---|---|
| **소스** | `<repo>/` (tizen-sdk-skills 체크아웃) | 원본 (Git 추적) | 모든 수정의 시작점 |
| **캐시** | `~/.claude/plugins/cache/.../0.1.0/` | 러너 실행 경로 (SKILL.md 글롭 참조) | 이 스크립트 ① |
| **개인** | `~/.claude/skills/`, `~/.claude/agents/` | 현재 실제 스킬 로딩 경로 | 이 스크립트 ② |
| **Cline 스킬** | `~/.cline/skills/` | Cline 스킬 로딩 경로 (스킬을 지원하는 빌드) | 이 스크립트 ③ |
| **Cline 훅** | `~/Documents/Cline/Hooks/` | PreToolUse 가드 (훅을 지원하는 빌드; macOS/Linux, 설정 UI 활성화) | 이 스크립트 ④ |
| **Claude Code 훅** | 리포 절대경로 (`settings.json` 참조) | 즉시 적용 | 동기화 불필요 |

**정책 해제 시** 개인 복사본 제거 절차: [PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md)
"정책이 해제되면" 섹션 참고.

---

## 관련 문서

- [HARNESS_SETUP.md](HARNESS_SETUP.md) — Cline 포팅 구조·제약·다른 워크스페이스 설치
- [PLUGIN_DEPLOYMENT_SYNC.md](PLUGIN_DEPLOYMENT_SYNC.md) — 배포 정책 배경·수동 동기화·원상 복구
- [README.md](../README.md) — tizen-sdk-skills 문서 전체 개요
