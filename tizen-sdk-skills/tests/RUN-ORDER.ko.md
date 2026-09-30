# 테스트 실행 순서 (safe → mutating → device)

[English](RUN-ORDER.md) | 한국어

`node runner.mjs`를 옵션 없이 실행하면 286개 TC가 알파벳(readdir) 순서로 모두 돌아가는데,
mutating·device 티어는 그 순서로는 어떤 호스트에서도 통과하지 못합니다
(에뮬레이터가 생기기 전에 debug TC가 실행되고, `test-vm`을 세 번 만들고, 빌드할 프로젝트가
생성되기 전에 빌드 TC가 돌아가는 식). 티어별로 아래 순서를 따르세요.

모든 명령은 `tests/` 디렉터리에서 실행합니다.

| 티어 | 실행 도구 | 소요 시간 | 부작용 |
| --- | --- | --- | --- |
| safe | `runner.mjs --tier=safe` | ~1분 | 없음 (`sdk-init.explicit-path`만 `~/.tizen.sdk.path.config` 기록) |
| mutating | `scripts/run-mutating-tier.mjs` | ~5분 (installer 포함 시 60~90분) | keystore, 프로필 fixture, 프로젝트 스크래치 디렉터리 |
| device | `scripts/run-device-tier.mjs` | ~20분 | `test-vm`/`tv-vm` 삭제·재생성, 모든 에뮬레이터 종료, 네트워크 스캔, 북마크 파일 수정 후 복원 |

---

## 0. 공통 준비 (한 번)

```bash
cd tizen-cli && pnpm build && cd ../tests
```

- 드라이버(mutating, device)의 preflight는 `dist/tizen-sdk.js`가 `common/lib`, `common/scripts`,
  `tizen-cli/src`보다 오래되면 시작을 거부합니다. 이 트리를 건드리거나 `git pull`한 뒤에는 반드시 다시 빌드하세요.
- preflight는 `tizen-sdk --doctor`도 확인합니다. 실패 항목이 있으면 먼저 해결하세요.
- YAML 스키마 검증만 하려면:

```bash
npm run lint          # = runner.mjs --dry-run + 문서 통계 검증 + helper 단위 테스트
```

---

## 1. safe 티어

```bash
node runner.mjs --tier=safe --status=approved
```

- CI 게이트(`.github/workflows/ci.yml`)는 SDK·네트워크가 없는 호스트용으로 `--skip-requires=sdk,net`을 추가합니다.
  로컬에는 SDK가 있으니 생략해도 됩니다.
- `sdk-init.explicit-path` TC가 `~/.tizen.sdk.path.config`를 덮어씁니다. 신경 쓰이면 `HOME`(Windows는
  `USERPROFILE`)을 임시 디렉터리로 바꿔 실행하세요.
- 별칭: `npm run test:safe` (status 필터 없음).

---

## 2. mutating 티어

### 2-1. 사전 조건

- `fixtures/profiles/*.xml`에 **커밋되지 않은 변경이 없어야** 합니다. 드라이버가 실행 중 이 파일들을 백업·복원하기
  때문에 로컬 수정이 있으면 시작을 거부합니다. 되돌리려면:

```bash
git checkout -- fixtures/profiles/
```

### 2-2. 실행

```bash
node scripts/prepare-device-fixtures.mjs --only=tmp,projects,rootstrap   # 스크래치 디렉터리, rootstrap ZIP, 서명 프로필 myProfile
node scripts/run-mutating-tier.mjs            # preflight + 계획 출력, 아무것도 바꾸지 않음
node scripts/run-mutating-tier.mjs --yes      # 실제 실행 (~5분)
```

별칭: `npm run prepare:mutating`, `npm run test:mutating` (계획만 출력, `--yes`는 직접 붙여야 함).

### 2-3. 단계(phase)

| Phase | 내용 | 기본 실행 |
| --- | --- | --- |
| `s1-sdk-idempotent` | 이미 설치된 SDK의 short-circuit 경로 (다운로드 없음) | O |
| `k1-cert-readonly` | list-profiles, list-distributors, inspect-certificate | O |
| `k2-cert-keystore` | generate-author ×3, import-certificate ×2 (hook `cleanKeystore`) | O |
| `k3-cert-profiles` | create/set-active/remove-profile (hook `resetProfileFixtures`) | O |
| `p1-projects` | create-project → build-project → project-delete (hook `resetProjectsDir`) | O |
| `s2-sdk-installers` | 실제 SDK/플랫폼/에뮬레이터 패키지 설치, 임시 HOME 사용 (60~90분, ~10GB) | `--with-installers` |
| `s3-dotnet-workload` | `dotnet-setup --force` (실제 dotnet 설치에 워크로드 추가) | `--with-installers` |

### 2-4. 옵션

```bash
node scripts/run-mutating-tier.mjs --yes --phase=k3-cert-profiles        # 한 단계만 (hook은 그대로 실행)
node scripts/run-mutating-tier.mjs --yes --include-drafts                # draft TC도 실행 (승격 검증용)
node scripts/run-mutating-tier.mjs --yes --with-installers               # s2/s3 포함
node scripts/run-mutating-tier.mjs --yes --with-installers --keep-scratch-sdk   # 설치된 scratch SDK 보존 (triage용)
node scripts/run-mutating-tier.mjs --restore-user-env=<scratch>/user-env.json   # installer 실행이 강제 종료된 뒤 User Path/TIZEN_SDK_PATH 복구
```

정식 순서는 `policy/mutating-run-order.yaml` 참고.

---

## 3. device 티어

### 3-1. 사전 조건

- 실행 중인 에뮬레이터가 **없어야** 합니다. 드라이버가 실행 중인 에뮬레이터를 모두 종료하고, 동시에 두 대가 온라인이면
  `multiple_devices`로 TC가 실패합니다.
- `test-vm`, `tv-vm`이라는 이름의 VM은 삭제·재생성됩니다. 같은 이름의 VM을 따로 쓰고 있다면 이름을 바꾸세요.
- Device Manager 북마크 파일(`remote_device_scan.list`)은 백업 후 수정되고 실행 후 복원됩니다.
- `--yes`를 붙이면 로컬 /24 대역을 TCP 26101 포트로 세 번 스캔합니다.

### 3-2. 실행

```bash
node scripts/prepare-device-fixtures.mjs    # 호스트당 한 번 (6~12분). fixtures/apps/fixtures.generated.env가 이미 있으면 생략 가능
node scripts/run-device-tier.mjs            # preflight + 계획 출력, 아무것도 바꾸지 않음
node scripts/run-device-tier.mjs --yes      # 실제 실행 (~20분)
```

별칭: `npm run prepare:device`, `npm run test:device` (계획만 출력).

`prepare-device-fixtures.mjs`는 네이티브 BasicUI, .NET NUI, 웹 Basic 프로젝트를 `fixtures/apps/`(gitignored)에
생성·빌드·서명하고, 실제 앱 ID와 경로를 `fixtures/apps/fixtures.generated.env`에 기록합니다.
`runner.mjs` 단독 실행은 이 파일을 읽지 않으므로 `${FIXTURE_*}` 플레이스홀더가 `fixtures/fixtures.env`의
문서용 기본값(`XXXXXXXXXX.MyWebApp01` 등)으로 풀려 debug TC가 실패합니다. device 티어는 항상 드라이버로 실행하세요.

### 3-3. 단계(phase)

| Phase | 내용 | 전제 / hook |
| --- | --- | --- |
| `a-no-device` | missing-required, list-*, handoff 봉투 | 부팅된 VM 없음 |
| `b-vm-lifecycle` | `test-vm` create/detail/modify-ram/reset/delete, create-image | VM 정지 상태; hook `resetImageDir` |
| `c-boot-1` | `create-emulator.launch`, device-manager, screenshot, sdb-helper | `test-vm` 부팅 후 c6까지 유지 |
| `c2-fixture-apps` | install-app ×3, file-transfer push/pull, screenshot.output-path | hook `deviceFixtures`: root on, .NET/웹 fixture 앱 설치 |
| `c3-web-debug` | webapp-debug ×4, playwright-test ×6 (RWI/CDP 9222, 9223) | hook `debugCleanup`, `resetTestProject` |
| `c4-dotnet-debug` | dotnet-debug ×5 (netcoredbg DAP 4711) | hook `debugCleanup` |
| `c5a` ~ `c5d` | gdb-debug launch / attach / breakpoints / serial, 단계당 1개 | 각 단계 전 hook `debugCleanup` |
| `c6-stop` | `device-manager.stop` | hook `debugCleanup` |
| `d-boot-2` | launch-emulator happy / first-available, stop, delete | `test-vm`만 존재 |
| `e-network` | remote-device 북마크 체인, 네트워크 스캔 | hook: .50/.51 북마크 제거 |
| `f1-tv-create` | `create-emulator.tv` (`tv-vm`, 3840, `--profile tv`) | — |
| (스크립트 단계) | `launch-emulator --vm-name tv-vm --timeout 480` | hook `bootTvVm` |
| `f2-tv-detect` | `device-manager.tv`, `device-manager.stop` | 온라인 tv-* VM 필요 |

### 3-4. 옵션

```bash
node scripts/run-device-tier.mjs --yes --skip-tv-boot        # tv-vm 부팅 생략 (device-manager.tv는 예상된 실패)
node scripts/run-device-tier.mjs --yes --keep-test-vm        # 종료 후 test-vm 삭제하지 않음
node scripts/run-device-tier.mjs --yes --phase=c4-dotnet-debug   # 한 단계만 (VM pre-clean/teardown 없음, hook은 실행)
node scripts/run-device-tier.mjs --yes --include-drafts      # draft TC도 실행 (승격 검증용)
node scripts/run-device-tier.mjs --yes --scratch=<dir>       # 스크래치 디렉터리 지정 (screenshot TC가 cwd에 PNG를 씀)
```

- `--phase=c-boot-1`만 단독 실행하면 에뮬레이터가 켜진 채로 남습니다 (c2~c6가 이어서 쓰도록 설계됨).
- Ctrl+C는 현재 TC가 끝난 뒤 멈추고 teardown은 그대로 실행됩니다.

정식 순서는 `policy/device-run-order.yaml` 참고.

---

## 4. 전체를 한 번에

```bash
cd tizen-cli && pnpm build && cd ../tests
node runner.mjs --tier=safe --status=approved
git checkout -- fixtures/profiles/                                        # 로컬 수정이 있을 때만
node scripts/prepare-device-fixtures.mjs                                  # tmp/projects/rootstrap 포함, 최초 1회
node scripts/run-mutating-tier.mjs --yes
node scripts/run-device-tier.mjs --yes
```

`prepare-device-fixtures.mjs`를 옵션 없이 한 번 돌리면 mutating 티어에 필요한 `tmp,projects,rootstrap`도
함께 만들어지므로 `--only=...` 단계를 따로 실행할 필요가 없습니다.

## 5. 자주 보는 실패와 원인

| 메시지 | 원인 | 조치 |
| --- | --- | --- |
| `TIZEN_SDK_DEVICE_E001: No connected device or emulator` | 에뮬레이터 없이 device 티어 TC 실행 (bare `runner.mjs`) | `run-device-tier.mjs --yes` 사용 |
| `An emulator VM named 'test-vm' already exists` | create-emulator TC 3개가 같은 이름을 만듦 | 정식 순서에는 사이에 `emulator-manager.delete`가 있음 |
| `'XXXXXXXXXX.MyWebApp01' is not a Web app` | `fixtures.generated.env`를 읽지 않아 문서용 기본 앱 ID 사용 | 드라이버로 실행 |
| `dist/ is older than ...` (preflight 거부) | 소스 변경 후 재빌드 안 함 | `cd tizen-cli && pnpm build` |
| `fixtures/profiles has uncommitted changes` | mutating 드라이버가 백업·복원할 fixture가 수정됨 | `git checkout -- fixtures/profiles/` 또는 커밋 |
| `multiple_devices` | 에뮬레이터 두 대 이상 온라인 | 다른 에뮬레이터 종료 후 재실행 |
