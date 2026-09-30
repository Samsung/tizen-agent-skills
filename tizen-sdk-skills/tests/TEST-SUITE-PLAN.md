# tizen-sdk Test Suite — 설계 문서

> 이 문서는 `tests/` 테스트 스위트의 설계 의도와 구조를 설명한다.
> 실행 방법, 옵션, 드라이버 스크립트의 세부 동작과 최신 통계는 [README.md](README.md)를 기준으로 한다.
> 두 문서가 어긋나면 README.md가 우선한다.

## 목표

`tizen-sdk-skills` 저장소 내부에 자체 완결형 테스트 스위트를 구축한다.

- 외부 저장소에 대한 의존성이 없다.
- `tizen-sdk` 플러그인의 34개 명령어가 올바른 JSON envelope를 출력하는지 검증한다 (**cli lane**).
- LLM 에이전트(Cline, Claude)가 자연어 프롬프트를 올바른 명령어 호출로 해석하는지 검증한다 (**prompt lane**).
- 부작용 크기에 따라 TC를 tier(`safe` / `mutating` / `device`)로 나누어, CI에서는 `safe`만 돌리고 나머지는 전용 드라이버로 순서를 보장해 실행한다.

현재 규모: **286 TC / 279 YAML 파일**, 8개 도메인, 34개 명령어 중 33개 + CLI 메타 인터페이스(`--capabilities`, `--doctor`, `--schema`) 커버. `tv-sdk-install-from-zip`은 `policy/tiers.yaml`에 분류만 되어 있고 TC는 아직 없다.

## 기존 Unit Test와의 차이

| 항목      | 기존 `common/lib/tests/`                 | `tests/` (본 스위트)                                     |
| --------- | ---------------------------------------- | -------------------------------------------------------- |
| 대상      | 개별 함수 (`initSdk`, `createProject` …) | 완성된 명령어 (`tizen-sdk check-node`)                   |
| 실행 방식 | `node test.js` (직접 require)            | `tizen-sdk <command>` 실제 실행                          |
| 검증 대상 | 함수 반환값의 envelope 구조              | 실제 envelope의 **내용** (jsonpath, error_code 등)       |
| 환경      | Node.js만 있으면 됨                      | `tizen-sdk` 런처 + (tier에 따라) SDK, 에뮬레이터 필요    |
| LLM 검증  | 없음                                     | **prompt lane** — LLM이 자연어 → 올바른 명령어 호출 검증 |
| 목적      | 리팩토링 시 회귀 방지                    | 릴리스 품질 게이트, LLM 호환성 보장                      |

## 구성 요소

| 구성 요소                    | 역할                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `tc/**/*.yaml`               | 테스트 케이스. 파일 하나에 여러 TC를 담을 수 있다 (`meta/` 등)       |
| `schema/tc-schema.json`      | TC YAML의 JSON Schema. `--dry-run`과 실제 실행 모두 이 스키마로 검증 |
| `policy/tiers.yaml`          | 34개 명령어의 tier 분류 (미분류 명령어는 `skip`)                     |
| `policy/*-run-order.yaml`    | device / mutating tier의 phase별 실행 순서                           |
| `runner.mjs`                 | cli lane 자동 실행 러너                                              |
| `scripts/run-*-tier.mjs`     | device / mutating tier 드라이버 (preflight, hook, teardown 포함)     |
| `scripts/prepare-device-fixtures.mjs` | fixture 앱 빌드/서명, scratch 디렉터리, `fixtures.generated.env` 생성 |
| `scripts/verify-doc-stats.mjs` | CI 게이트: README / CSV-YAML-MAPPING의 통계가 실제 TC 파일과 일치하는지 검사 |
| `scripts/runner-helpers.test.mjs` | runner 헬퍼 단위 테스트 + order 파일 정합성 검사                |
| `scripts/cdn-mirror-selection.test.mjs` | SDK 인스톨러 `.sh`/`.ps1`의 시간대 → CDN 미러 매핑이 서로 일치하는지 검사 |
| `fixtures/`                  | 커밋된 상태 파일(테스트 인증서, `profiles.xml`)과 `${NAME}` 플레이스홀더 값 |
| `skills/run-test-suite.md`   | Cline/Claude용 prompt lane 실행 가이드                               |

### cli lane 흐름 (자동)

1. `tc/` 아래 YAML을 재귀적으로 로드하고 Ajv로 스키마 검증
2. `--tier`, `--tc`, `--domain`, `--status`, `--skip-requires`, `--order` 필터 적용
3. TC마다 `tizen-sdk <argv>`를 `execFileSync`로 실행 (argv의 `${NAME}` 플레이스홀더는 실행 시점에 `fixtures.env` → 프로세스 env → TC `env:` 순으로 확장)
4. stdout의 JSON envelope 파싱
5. `evalExpect` — `status`, `jsonpath[]`(matches / equals / min_length), `errors[]`(error_code / error_category / has_suggested_fix) 비교
6. Jest 스타일 요약 출력 (`✓ passed / ✗ failed / ⊘ skipped`, skip 사유별 집계)

### prompt lane 흐름 (LLM 에이전트)

1. 에이전트가 `skills/run-test-suite.md`를 읽고 prompt lane TC를 연다
2. `prompt.text`를 사용자 메시지로 보낸다
3. LLM이 MCP 도구를 호출해 명령어를 실행하고 envelope를 받는다
4. `must_call_tool`, `must_resolve_command`, `envelope_status`를 검증한다
5. 3회 반복, `pass_rate: 2/3` 이상이면 PASS

## 디렉터리 구조

```
tests/
  README.md               ← 실행 가이드 (기준 문서)
  TEST-SUITE-PLAN.md      ← 본 문서 (설계)
  CSV-YAML-MAPPING.md     ← CSV TC ID ↔ YAML 추적 표
  package.json            ← 의존성 (yaml, ajv)
  runner.mjs              ← cli lane 러너
  schema/
    tc-schema.json        ← TC YAML JSON Schema
  policy/
    tiers.yaml            ← 34개 명령어 tier 분류
    device-run-order.yaml    ← device tier phase별 실행 순서
    mutating-run-order.yaml  ← mutating tier phase별 실행 순서
  fixtures/               ← 커밋된 상태 파일 (테스트 인증서, profiles.xml)
    fixtures.env          ← ${NAME} 플레이스홀더 값 (비밀번호를 argv에서 분리)
    apps/                 ← (gitignored) fixture 앱, tmp/ + projects/ scratch 디렉터리,
                             fixtures.generated.env — prepare-device-fixtures.mjs가 생성
  scripts/
    verify-doc-stats.mjs         ← CI 게이트: 문서 통계 == 실제 TC 파일
    runner-helpers.test.mjs      ← runner 헬퍼 단위 테스트 + order 파일 정합성
    cdn-mirror-selection.test.mjs ← 인스톨러 .sh/.ps1 시간대 → CDN 미러 매핑 일치
    prepare-device-fixtures.mjs  ← fixture 앱 빌드/서명, scratch 디렉터리, playwright 프로젝트
    run-device-tier.mjs          ← device tier 순서 실행 + 자체 정리
    run-mutating-tier.mjs        ← mutating tier 순서 실행 + 자체 정리
    lib/driver-common.mjs        ← 위 세 스크립트의 공용 헬퍼 (FIXTURE_NEEDS 포함)
  tc/                     ← 286 TC / 279 YAML 파일
    device/               ← 103 TCs (create-emulator, launch-emulator, emulator-manager,
                                     device-manager, install-app, file-transfer,
                                     remote-device, screenshot, sdb-helper)
    sdk/                  ←  66 TCs (check-node, check-disk-space, sdk-init, sdk-install,
                                     sdk-install-custom-repo, tv-sdk-install, sdk-repo-info,
                                     validate-repo-url, update-package, platform-install,
                                     download-emulator-package, download-mobile-platform,
                                     install-rootstrap, dotnet-setup)
    debug/                ←  32 TCs (gdb-debug, dotnet-debug, webapp-debug)
    project/              ←  26 TCs (create-project, build-project, project-delete,
                                     list-templates)
    certificate/          ←  25 TCs (certificate-manager actions)
    meta/                 ←  16 TCs (--capabilities, --doctor, --schema, list-commands,
                                     no-args, guard-rules)
    test/                 ←  15 TCs (playwright-test)
    dlog-analyzer/        ←   3 TCs (dlog-analyzer)
  skills/
    run-test-suite.md     ← Cline/Claude prompt lane 실행 가이드
```

## TC YAML 형식

```yaml
id: tizen-sdk.check-node.happy
plugin: tizen-sdk
command: check-node
tier: safe
status: draft
since_cli: 1.0.0

# 선택: 이 호스트가 제공해야 하는 능력. --skip-requires 로 건너뛴다.
# requires:
#   capabilities: [sdk]   # 또는 [net], [net-device], [samsung-account], [gbs]

lanes:
  cli:
    argv: ["tizen-sdk", "check-node"]
    timeout_sec: 30
    expect:
      status: success
      jsonpath:
        - { path: "$.result.node_version", matches: "^v\\d+" }

  prompt:
    text: "Node.js가 설치되어 있는지 확인해줘"
    timeout_sec: 300
    max_tool_calls: 4
    expect:
      must_call_tool: tizen_cli_run_commands
      must_resolve_command: "tizen-sdk check-node"
      envelope_status: success
    pass_rate: "2/3"
```

### 파일 이름 패턴

| 패턴                      | 의미                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `*.happy.yaml`            | 정상 실행 → `status: success`                               |
| `*.missing-required.yaml` | 필수 옵션 누락 → `status: failure` + `invalid_argument`     |
| `*.invalid-type.yaml`     | 잘못된 선택값 → `status: failure`                           |
| `*.invalid-path.yaml`     | 존재하지 않는 경로 → `status: failure`                      |
| `*.prompt-happy.yaml`     | LLM 프롬프트 해석 → 도구 호출 + 명령어 검증                 |
| `*.scan-happy.yaml`       | 네트워크 스캔 → `status: success`                           |

### 규칙

- 비밀번호 등 자격 증명 형태의 값은 `argv`에 직접 쓰지 않는다. `${NAME}` 플레이스홀더를 쓰고 `fixtures/fixtures.env`에 `NAME_B64=` 로 정의한다 (러너가 디코드). 키 이름에도 `PASSWORD` 류 부분 문자열을 피한다.
- 8개 TC는 cli / prompt 두 lane을 모두 정의한다. 그래서 lane별 합계(cli 171 + prompt 118)는 TC 수(281)보다 크다.
- TC를 추가/삭제하면 README.md와 CSV-YAML-MAPPING.md의 통계를 갱신한다. `scripts/verify-doc-stats.mjs`가 CI에서 불일치를 잡는다.

## lane별 실행 방식

| 환경                       | cli lane                                                             | prompt lane                                                                      |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **runner.mjs**             | `tizen-sdk <command>` 실행 → envelope 파싱 → expect 비교 (자동)      | 실행하지 않음 (TC 정의만 검증)                                                   |
| **Cline**                  | Bash 도구로 `tizen-sdk <command>` 실행 → 결과를 Cline이 판정         | Cline이 `skills/run-test-suite.md`를 읽고 prompt lane TC를 직접 실행 (도구 호출) |
| **Claude**                 | 동일하게 Bash로 실행                                                 | 동일하게 prompt lane 직접 실행                                                   |

러너는 `tizen-sdk` 런처를 PATH에서 찾고, 없으면 소스 체크아웃의 빌드 산출물(`bin/tizen-sdk.js`) 또는 `TC_LAUNCHER_JS` 환경변수가 가리키는 런처로 대체한다. Windows에서는 pnpm/npm의 `.cmd` shim을 `execFileSync`가 실행하지 못하므로 런처 JS를 `node`로 직접 호출한다.

## runner.mjs 설계

- `tests/tc/` 아래 TC YAML을 재귀 순회, Ajv로 스키마 검증
- `cli` lane만 자동 실행 (위 "cli lane 흐름")
- 필터: `--tier=<safe|mutating|device>`, `--tc=<id 부분 문자열>`, `--domain=<dir>`, `--status=<draft|candidate|approved|quarantined>`
- `--skip-requires=sdk,net` — 호스트에 없는 능력을 선언(프로브 아님). 해당 TC는 `⊘ … (requires sdk — skip)`으로 보고
- `--order=policy/<tier>-run-order.yaml [--phase=<name>]` — readdir 순서 대신 order 파일의 id 순서로 실행 (같은 id 반복 허용)
- `--dry-run` — 실행 없이 TC 검증만. 스키마 통과는 승격 근거가 아니다
- `quarantined` TC는 `--status=quarantined`로 명시할 때만 실행
- 알 수 없는 옵션(`--tier safe`처럼 `=` 누락 포함)은 exit 2로 중단 — 전체 TC가 조용히 도는 일을 막는다
- `--order` 없이 실행하면 디렉터리별 → 파일 알파벳순, 순차 실행, setup/teardown 없음. safe tier에는 충분하고 device / mutating tier에는 자기 파괴적이다 (아래 드라이버 참조)

## tier 드라이버 설계

readdir 순서로는 device / mutating tier가 어느 호스트에서도 통과할 수 없다 (예: debug TC가 에뮬레이터 생성 전에 실행, `build-project`가 `create-project`보다 먼저 정렬, `remove-profile`이 fixture를 소비). 그래서 각 tier에 **order 파일 + 드라이버 스크립트**를 둔다.

공통 구조:

- **Preflight** — 런처가 소스보다 최신인지, `tizen-sdk --doctor`가 실패 항목이 없는지, `fixtures.generated.env`와 그 산출물이 존재하는지 확인. 기본 실행은 계획만 출력하고 아무것도 바꾸지 않는다 (`--yes`로 실행).
- **Phase + hook** — order 파일의 phase마다 직전에 hook이 실행되어 전제 조건을 만든다 (`PHASE_HOOKS`). hook 실패는 phase의 TC가 통과해도 exit 1.
- **Fixture 게이트** — phase가 필요로 하는 `${FIXTURE_*}` 키가 비어 있거나 파일이 없으면 시작을 거부 (`FIXTURE_NEEDS`, `runner-helpers.test.mjs`가 TC의 실제 플레이스홀더와 대조).
- **Teardown** — 실패, 예외, Ctrl+C 모두에서 실행. 각 단계는 이전 단계가 실패해도 시도.
- **scratch 보호** — hook이 비우는 디렉터리는 `guardedScratchDir()`로 `tests/fixtures/apps` 내부, 심볼릭 링크 아님, 같은 드라이브임을 강제.

| tier     | 드라이버                        | 주요 phase                                                                                   | 소요 / 파괴 범위                                                                                     |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| device   | `scripts/run-device-tier.mjs`   | a-no-device → b-vm-lifecycle → c-boot-1 … c6-stop → d-boot-2 → e-network → f1/f2-tv          | ~20분. `test-vm`/`tv-vm` 삭제·재생성, 모든 에뮬레이터 정지, /24 스캔, 북마크 목록 재작성(복원)       |
| mutating | `scripts/run-mutating-tier.mjs` | s1-sdk-idempotent → k1/k2/k3-cert → p1-projects (+ 옵트인 s2-sdk-installers, s3-dotnet-workload) | ~5분 (+60–90분, ~10 GB with `--with-installers`). 지정된 keystore 파일과 fixture만 변경; s2는 scratch home |

세부 hook 표, 불변 조건, 옵트인 installer phase의 환경 격리(`USERPROFILE`/`HOME` 리다이렉트, User `Path` 스냅샷/복원)는 README.md의 "Device tier" / "Mutating tier" 절을 따른다.

## policy/tiers.yaml (34개 명령어)

tier = 부작용 크기, requires = 필요한 권한. 두 축은 독립적이다. 미분류 명령어는 `skip`이 기본값이라 사람이 분류하기 전에는 아무것도 실행되지 않는다.

```yaml
defaults:
  tier: skip

commands:
  # safe — 부작용 없음, 인자 없이 실행 가능 (6)
  tizen-sdk.check-node: { tier: safe }
  tizen-sdk.check-disk-space: { tier: safe }
  tizen-sdk.sdk-init: { tier: safe }
  tizen-sdk.sdk-repo-info: { tier: safe }
  tizen-sdk.validate-repo-url: { tier: safe }
  tizen-sdk.list-templates: { tier: safe }

  # mutating — 설치/변경/삭제 부작용 (14)
  tizen-sdk.sdk-install: { tier: mutating }
  tizen-sdk.sdk-install-custom-repo: { tier: mutating }
  tizen-sdk.tv-sdk-install: { tier: mutating }
  tizen-sdk.tv-sdk-install-from-zip: { tier: mutating }
  tizen-sdk.update-package: { tier: mutating }
  tizen-sdk.download-emulator-package: { tier: mutating }
  tizen-sdk.platform-install: { tier: mutating }
  tizen-sdk.download-mobile-platform: { tier: mutating }
  tizen-sdk.install-rootstrap: { tier: mutating }
  tizen-sdk.dotnet-setup: { tier: mutating }
  tizen-sdk.create-project: { tier: mutating }
  tizen-sdk.project-delete: { tier: mutating }
  tizen-sdk.build-project: { tier: mutating }
  tizen-sdk.certificate-manager: { tier: mutating }

  # device — 에뮬레이터/기기 필요 (14)
  tizen-sdk.create-emulator: { tier: device, requires: [kvm] }
  tizen-sdk.launch-emulator: { tier: device, requires: [kvm] }
  tizen-sdk.emulator-manager: { tier: device, requires: [kvm] }
  tizen-sdk.device-manager: { tier: device, requires: [kvm] }
  tizen-sdk.install-app: { tier: device, requires: [kvm] }
  tizen-sdk.sdb-helper: { tier: device, requires: [kvm] }
  tizen-sdk.screenshot: { tier: device, requires: [kvm] }
  tizen-sdk.file-transfer: { tier: device, requires: [kvm] }
  tizen-sdk.remote-device: { tier: device, requires: [net-device] }
  tizen-sdk.gdb-debug: { tier: device, requires: [kvm] }
  tizen-sdk.dotnet-debug: { tier: device, requires: [kvm] }
  tizen-sdk.webapp-debug: { tier: device, requires: [kvm] }
  tizen-sdk.playwright-test: { tier: device, requires: [kvm] }
  tizen-sdk.dlog-analyzer: { tier: device, requires: [kvm] }
```

| Tier      | Commands | TCs     | CI-safe?      |
| --------- | -------- | ------- | ------------- |
| safe      | 6        | 66      | ✅ Yes        |
| mutating  | 14       | 79      | ⚠️ With setup |
| device    | 14       | 141     | ❌ Manual     |
| **Total** | **34**   | **286** |               |

## 상태 분류

`tier`는 TC가 실행에 무엇을 필요로 하는지, `status`는 얼마나 검증되었는지를 말한다.

| Status        | Count | 의미                                                          |
| ------------- | ----- | ------------------------------------------------------------- |
| `draft`       | 7     | 작성만 됨, 실행된 적 없음 — 단언 미검증                       |
| `candidate`   | 0     | 실행되어 통과했지만 모든 lane이 검증되지는 않음               |
| `approved`    | 279   | 모든 lane이 실행·통과. 회귀는 릴리스 차단 사유                |
| `quarantined` | 0     | 불안정하거나 환경 문제로 깨짐. 기본 제외                      |

남은 7개 draft는 CI나 개발 호스트가 제공하지 못하는 것을 필요로 한다.

- Samsung 계정(online CA): `certificate-manager.samsung-login`, `.generate-samsung-author`, `.generate-samsung-distributor` — 운영자 승인 아래 수동 실행
- Linux GBS 툴체인: `build-project.arch`, `.gbs`
- LAN 상의 Tizen 기기: `remote-device.connect`, `.connect-custom-port`

## 호스트 능력 선언 (`requires.capabilities`)

| Capability        | 의미                                                         |
| ----------------- | ------------------------------------------------------------ |
| `sdk`             | 설치된 Tizen SDK (템플릿, `sdk.info`, keystore, 기본 경로)   |
| `net`             | `download.tizen.org`로의 아웃바운드 접근                     |
| `net-device`      | LAN에서 `sdb connect` 가능한 Tizen 기기                      |
| `samsung-account` | online CA용 로그인된 Samsung 계정                            |
| `gbs`             | GBS 툴체인과 `~/GBS-ROOT`가 있는 Linux 호스트                |

`--skip-requires`는 호스트에 대한 **선언**이지 프로브가 아니다. CI 단계가 대신 검사한다: throwaway `HOME` 아래에 `~/.tizen.sdk.path.config`, `~/tizen-sdk`, PATH의 `sdb`가 있으면 실행 전에 실패시켜, SDK를 돌릴 수 있는 호스트에서 `sdk` TC가 건너뛰어지는 일을 막는다.

## CI 게이트

`.github/workflows/ci.yml`이 모든 PR에서 실행한다.

```bash
(cd tizen-cli && pnpm install --frozen-lockfile && pnpm run build)   # runner가 실행하는 dist/tizen-sdk.js — CI는 런처를 PATH에 심볼릭 링크
HOME=<throwaway dir> node runner.mjs --tier=safe --status=approved --skip-requires=sdk,net
node runner.mjs --dry-run
node scripts/verify-doc-stats.mjs
node scripts/runner-helpers.test.mjs
```

Windows에서는 Node의 `os.homedir()`가 `HOME`이 아니라 `USERPROFILE`을 읽으므로 그쪽을 리다이렉트한다. `HOME`만 바꾸면 `sdk-init.explicit-path`가 실제 `~/.tizen.sdk.path.config`를 덮어쓴다.

safe TC를 `approved`로 승격하기 전에는 위 게이트 명령을 빈 `HOME`(`USERPROFILE`)으로 로컬에서 돌려, SDK 없이 통과하게 만들거나 `requires` 블록을 추가한다.

## 새 TC 추가 절차

1. `tc/<domain>/`에 `<command>.<variant>.yaml` 생성
2. `schema/tc-schema.json` 준수
3. `node runner.mjs --dry-run`으로 검증. safe TC면 CI 게이트 명령도 빈 홈으로 실행
4. SDK나 네트워크 없이 통과할 수 없으면 `requires.capabilities` 선언
5. README.md와 CSV-YAML-MAPPING.md의 통계 갱신 (`verify-doc-stats.mjs`가 검사)
6. device / mutating TC는 해당 `policy/<tier>-run-order.yaml`에 위치를 정하고 `node runner.mjs --dry-run --tier=<tier> --order=…`로 id를 검증 (`runner-helpers.test.mjs`가 approved TC 누락을 잡는다)
7. 실행·통과 확인 후 `status`를 `draft` → `approved`로 승격

## 사전 요구 사항

- Node.js >= 20 (`.nvmrc`)
- cli lane 실행: `tizen-sdk` 런처가 PATH에 있거나, 소스 체크아웃의 빌드 산출물 또는 `TC_LAUNCHER_JS`로 런처 지정 (빌드 방법은 README.md "Prerequisites")
- `--dry-run`: Node.js + `npm install`로 받은 의존성(yaml, ajv)만 필요
