# Tizen AI Plugins — Test Suite Plan

## 목표

`tizen-sdk-skills` 저장소 내부에 자체 완결형 테스트 스위트를 구축한다.
외부 저장소(`tizen-cli-testbed`, `tizen-cli-test-agent`)에 대한 의존성이 없으며,
`tizen-cli`, `Cline`, `Claude` 세 환경에서 모두 활용할 수 있는 구조다.

## 기존 Unit Test와의 차이

| 항목      | 기존 `common/lib/tests/`                 | 새 `tests/`                                              |
| --------- | ---------------------------------------- | -------------------------------------------------------- |
| 대상      | 개별 함수 (`initSdk`, `createProject` …) | 완성된 명령어 (`tizen-sdk check-node`)            |
| 실행 방식 | `node test.js` (직접 require)            | `tizen-cli tizen-sdk <command>` 실제 실행         |
| 검증 대상 | 함수 반환값의 envelope 구조              | 실제 envelope의 **내용** (jsonpath, error_code 등)       |
| 환경      | Node.js만 있으면 됨                      | tizen-cli + 플러그인 설치 필요                           |
| LLM 검증  | 없음                                     | **prompt lane** — LLM이 자연어 → 올바른 명령어 호출 검증 |
| 목적      | 리팩토링 시 회귀 방지                    | 릴리스 품질 게이트, LLM 호환성 보장                      |

## 디렉터리 구조

```
tizen-sdk-skills/
  tests/
    README.md                       ← 테스트 스위트 가이드
    TEST-SUITE-PLAN.md              ← 본 문서
    package.json                    ← 테스트 의존성 (yaml, ajv)
    schema/
      tc-schema.json                ← TC YAML 스키마 (자체 정의)
    policy/
      tiers.yaml                    ← 33개 명령어 tier 분류
    tc/                             ← 테스트 케이스
      sdk/
        check-node.happy.yaml
        check-node.prompt-happy.yaml
        check-disk-space.happy.yaml
        sdk-init.happy.yaml
        sdk-init.invalid-path.yaml
        sdk-install-custom-repo.missing-required.yaml
        validate-repo-url.happy.yaml
        validate-repo-url.missing-required.yaml
        sdk-repo-info.happy.yaml
        list-templates.happy.yaml
        download-emulator-package.happy.yaml
        platform-install.missing-required.yaml
        install-rootstrap.missing-required.yaml
        dotnet-setup.happy.yaml
        update-package.happy.yaml
        tv-sdk-install.happy.yaml
        sdk-install.happy.yaml
      project/
        create-project.missing-required.yaml
        create-project.invalid-type.yaml
        list-templates.happy.yaml
        build-project.missing-required.yaml
        project-delete.missing-required.yaml
      device/
        create-emulator.missing-required.yaml
        launch-emulator.happy.yaml
        emulator-manager.missing-required.yaml
        device-manager.happy.yaml
        install-app.missing-required.yaml
        sdb-helper.missing-required.yaml
        screenshot.happy.yaml
        file-transfer.missing-required.yaml
        remote-device.scan-happy.yaml
      debug/
        gdb-debug.missing-required.yaml
        dotnet-debug.missing-required.yaml
        webapp-debug.missing-required.yaml
      certificate/
        certificate-manager.missing-required.yaml
        certificate-manager.generate-author.happy.yaml
        certificate-manager.list-profiles.happy.yaml
      test/
        playwright-test.missing-required.yaml
      dlog-analyzer/
        dlog-analyzer.missing-required.yaml
    runner.mjs                      ← cli lane 자동 실행 러너
    skills/
      run-test-suite.md             ← Cline/Claude용 prompt lane 실행 가이드
```

## TC YAML 형식

```yaml
id: tizen-sdk.check-node.happy
plugin: tizen-sdk
command: check-node
tier: safe
status: draft
since_cli: 1.0.0

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

## lane별 실행 방식

| 환경                       | cli lane                                                                         | prompt lane                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **tizen-cli + runner.mjs** | `tizen-cli tizen-sdk <command>` 실행 → envelope 파싱 → expect 비교 (자동) | TC 정의만 하고, 수동 실행 가이드 제공                                            |
| **Cline**                  | Bash 도구로 `tizen-cli tizen-sdk <command>` 실행 → 결과를 Cline이 판정    | Cline이 `skills/run-test-suite.md`를 읽고 prompt lane TC를 직접 실행 (도구 호출) |
| **Claude**                 | 동일하게 Bash로 실행                                                             | 동일하게 prompt lane 직접 실행                                                   |

## runner.mjs 설계

- `tests/` 디렉터리의 TC YAML 파일을 순회
- `cli` lane만 자동 실행:
  1. `tizen-cli tizen-sdk <argv>` 실행
  2. stdout JSON envelope 파싱
  3. `expect.status` 비교 (success/failure)
  4. `expect.jsonpath` 매처 검증 (정규식 매칭)
  5. `expect.errors` 매처 검증 (error_category, has_suggested_fix)
- `--tier=safe` 등 필터 옵션
- `--dry-run` 모드 (명령어 실행 없이 TC 검증만)
- 결과를 Jest 스타일로 출력: `✓ check-node.happy`, `✗ sdk-init.invalid-path`
- 기존 `common/lib/envelope/envelope.js`의 구조를 참고하여 envelope 파싱

## policy/tiers.yaml (33개 명령어)

```yaml
defaults:
  tier: skip

commands:
  # safe — 부작용 없음, 인자 없이 실행 가능
  tizen-sdk.check-node: { tier: safe }
  tizen-sdk.check-disk-space: { tier: safe }
  tizen-sdk.sdk-init: { tier: safe }
  tizen-sdk.sdk-repo-info: { tier: safe }
  tizen-sdk.validate-repo-url: { tier: safe }
  tizen-sdk.list-templates: { tier: safe }

  # mutating — 설치/변경/삭제 부작용
  tizen-sdk.sdk-install: { tier: mutating }
  tizen-sdk.sdk-install-custom-repo:{ tier: mutating }
  tizen-sdk.tv-sdk-install: { tier: mutating }
  tizen-sdk.update-package: { tier: mutating }
  tizen-sdk.download-emulator-package:{ tier: mutating }
  tizen-sdk.platform-install: { tier: mutating }
  tizen-sdk.download-mobile-platform:{ tier: mutating }
  tizen-sdk.install-rootstrap: { tier: mutating }
  tizen-sdk.dotnet-setup: { tier: mutating }
  tizen-sdk.create-project: { tier: mutating }
  tizen-sdk.project-delete: { tier: mutating }
  tizen-sdk.build-project: { tier: mutating }
  tizen-sdk.certificate-manager: { tier: mutating }

  # device — 에뮬레이터/기기 필요
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

## 작업 순서

1. `tests/` 디렉터리 + `package.json` 생성
2. `schema/tc-schema.json` 작성
3. `policy/tiers.yaml` 작성
4. `runner.mjs` 작성
5. TC YAML 파일 작성 (~35개, command-specs 기반)
6. `skills/run-test-suite.md` 작성 (Cline/Claude용)
7. `README.md` 작성
