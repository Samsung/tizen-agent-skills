# 스킬 ↔ 커맨드 맵핑 — 왜 스킬은 29개인데 커맨드는 34개인가

> **범위**: `common/skills/`(스킬)과 `tizen-cli/src/command-specs/`(커맨드)의 대응 관계
>
> **English version**: [SKILLS_COMMANDS_MAPPING.en.md](SKILLS_COMMANDS_MAPPING.en.md)

---

## 요약

| 단위 | 개수 | 기준 위치 |
|---|---|---|
| **스킬** (Cline/Claude Code 자연어 트리거 단위) | **29** | `common/skills/*/SKILL.md` |
| **커맨드** (`tizen-cli tizen-sdk <command>`) | **34** | `tizen-cli/src/command-specs/*.ts` |
| tizen-cli용 SKILL.md (참고) | 31 | `tizen-cli/skills/*/SKILL.md` — 아래 [스킬 집합이 두 개인 이유](#스킬-집합이-두-개인-이유) 참조 |

숫자가 다른 것은 **설계상 의도된 것**입니다. 스킬은 사용자 의도(intent) 단위이고 커맨드는 실행 단위이므로, **스킬 하나가 커맨드 여러 개를 소유할 수 있습니다**. 예를 들어 "프로젝트 생성" 스킬(`tizen-create-project`)은 `create-project`, `project-delete`, `list-templates` 세 커맨드를 소유합니다.

---

## 차이 나는 5개 커맨드

34 − 29 = 5개의 "추가" 커맨드는 모두 기존 스킬에 얹힌 보조 커맨드입니다:

| 추가 커맨드 | 소속 스킬 | 비고 |
|---|---|---|
| `sdk-repo-info` | `tizen-sdk-install` | `sdk-install`과 같은 스킬의 저장소 정보 조회 액션 |
| `validate-repo-url` | `tizen-sdk-install-custom-repo` | 설치 없이 저장소 URL 검증만 단독 실행 |
| `project-delete` | `tizen-create-project` | 생성 스킬의 delete 액션 |
| `list-templates` | `tizen-create-project` | 생성 스킬의 list-templates 액션 (tizen-cli에서는 별도 SKILL.md 존재 — 아래 참조) |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | em-cli 전체 표면(수정·초기화·이미지 캡처)을 두 스킬이 공유 |

나머지 29개 커맨드는 스킬과 1:1로 대응합니다.

---

## 전체 맵핑 표 (34개 커맨드 → 29개 스킬)

그룹 구분은 [tizen-cli 우산 스킬의 라우팅 테이블](../tizen-cli/skills/tizen-sdk/SKILL.md)과 동일합니다.

### SDK / 플랫폼 / 패키지 (커맨드 12 → 스킬 10)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `sdk-init` | `tizen-sdk-init` | 1:1 |
| `sdk-install` | `tizen-sdk-install` | 공유 |
| `sdk-repo-info` | `tizen-sdk-install` | 공유 (repo-info 액션) |
| `sdk-install-custom-repo` | `tizen-sdk-install-custom-repo` | 공유 |
| `validate-repo-url` | `tizen-sdk-install-custom-repo` | 공유 (검증 전용 액션) |
| `tv-sdk-install` | `tizen-tv-sdk-install` | 1:1 |
| `tv-sdk-install-from-zip` | `tizen-tv-sdk-install-from-zip` | 1:1 |
| `update-package` | `tizen-update-package` | 1:1 |
| `platform-install` | `tizen-platform-install` | 1:1 |
| `download-emulator-package` | `tizen-download-emulator-package` | 1:1 |
| `download-mobile-platform` | `tizen-download-mobile-platform` | 1:1 |
| `install-rootstrap` | `tizen-install-rootstrap` | 1:1 |

### 사전 확인 / 툴체인 (커맨드 3 → 스킬 3)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `check-node` | `tizen-check-node` | 1:1 |
| `check-disk-space` | `tizen-check-disk-space` | 1:1 |
| `dotnet-setup` | `tizen-dotnet-setup` | 1:1 |

### 프로젝트 (커맨드 4 → 스킬 2)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `create-project` | `tizen-create-project` | 공유 |
| `project-delete` | `tizen-create-project` | 공유 (delete 액션) |
| `list-templates` | `tizen-create-project` | 공유 (list-templates 액션)¹ |
| `build-project` | `tizen-build-project` | 1:1 |

¹ tizen-cli 스킬 집합에는 이 커맨드 전용 `tizen-list-templates` SKILL.md가 별도로 존재합니다 (아래 참조).

### 에뮬레이터 / 디바이스 (커맨드 7 → 스킬 6)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `create-emulator` | `tizen-create-emulator` | 공유 |
| `launch-emulator` | `tizen-launch-emulator` | 공유 |
| `emulator-manager` | `tizen-create-emulator` + `tizen-launch-emulator` | 두 스킬이 공유 |
| `device-manager` | `tizen-device-manager` | 1:1 |
| `remote-device` | `tizen-remote-device` | 1:1 (scan/connect/… 8개 액션 내장) |
| `sdb-helper` | `tizen-sdb-helper` | 1:1 |
| `file-transfer` | `tizen-file-transfer` | 1:1 |

### 앱 / 디버깅 / 테스트 (커맨드 6 → 스킬 6)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `install-app` | `tizen-install-app` | 1:1 |
| `gdb-debug` | `tizen-gdb-debug` | 1:1 (Native 전용) |
| `dotnet-debug` | `tizen-dotnet-debug` | 1:1 (DotNET 전용) |
| `webapp-debug` | `tizen-webapp-debug` | 1:1 (WebApp 전용) |
| `playwright-test` | `tizen-playwright-test` | 1:1 (WebApp 전용, run/--scaffold 액션 내장) |
| `screenshot` | `tizen-screenshot` | 1:1 |

### 인증서 / 진단 (커맨드 2 → 스킬 2)

| 커맨드 | 스킬 | 대응 |
|---|---|---|
| `certificate-manager` | `tizen-certificate-manager` | 1:1 (프로파일/배포자/Samsung 온라인 CA 액션 내장) |
| `dlog-analyzer` | `tizen-dlog-analyzer` | 1:1 (start/stop/check/status/app-launch/app-terminate/dlog-collect/stop-collect/error-analyze 액션 내장) |

**검증**: 커맨드 12+3+4+7+6+2 = 34, 스킬 10+3+2+6+6+2 = 29.

---

## 스킬 집합이 두 개인 이유

스킬 디렉터리는 하네스별로 두 벌 존재하며 개수가 다릅니다:

| 위치 | SKILL.md 수 | 용도 | 구성 |
|---|---|---|---|
| `common/skills/` | **29** | Cline/Claude Code — 에이전트가 `node <cli-runner>`를 직접 실행 | 위 표의 29개 스킬 |
| `tizen-cli/skills/` | **31** | tizen-cli 구동 에이전트 — `tizen-cli tizen-sdk <command>` 호출 | 위 29개 + 2개 추가 (아래) |

`tizen-cli/skills/`에만 있는 2개:

1. **`tizen-sdk`** (우산 라우터) — 34개 커맨드 전체의 라우팅 테이블을 담은 진입점 스킬. common 쪽에는 대응물이 없습니다 (Cline/Claude Code는 스킬 설명 자체로 라우팅).
2. **`tizen-list-templates`** — tizen-cli에서는 `list-templates`가 독립 커맨드이므로 전용 스킬로 분리. common 쪽에서는 `tizen-create-project` 스킬의 list-templates 액션으로 처리됩니다.

즉 문서에서 "29개 스킬"은 **common/skills 기준**, "34개 커맨드"는 **tizen-cli 커맨드 표면 기준**입니다. 두 숫자를 비교할 때는 이 기준 차이를 유의하세요.

---

## 관련 문서

- [SDK_COMMANDS_ARCHITECTURE.md](SDK_COMMANDS_ARCHITECTURE.md) — CLI 러너 → sdk-commands.js → 도메인 모듈 호출 흐름
- [COMMAND_MAPPING.md](COMMAND_MAPPING.md) — 커맨드 스펙 ↔ envelope `command` 필드 문자열 매핑
- [SKILLS_REFERENCE.md](SKILLS_REFERENCE.md) — 29개 스킬 상세 레퍼런스 (파라미터, CLI 러너, 응답 형식)
- [tizen-cli 우산 스킬 라우팅 테이블](../tizen-cli/skills/tizen-sdk/SKILL.md)
