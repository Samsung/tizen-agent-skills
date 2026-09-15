# tizen-sdk 플러그인 빌드 및 설치 가이드

[English](build-and-install.en.md) | 한국어

이 문서는 tizen-cli용 tizen-sdk 플러그인을 소스에서 빌드하고 tizen-cli에 설치하는 방법을 설명합니다.

## 사전 요구사항

- **Node.js 18 이상** — [https://nodejs.org](https://nodejs.org)에서 다운로드
- **pnpm** — 설치되어 있지 않은 경우: `npm install -g pnpm`
- **tizen-cli** (선택) — 별도 배포되는 tizen-cli 호스트 CLI (설치 방법은 tizen-cli 배포 안내 참조). 없는 경우 5단계의 독립 런처로 플러그인을 실행할 수 있습니다.

## 1. 저장소 클론

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills
```

## 2. 빌드

```bash
cd tizen-cli
pnpm install
pnpm build
```

빌드가 완료되면 `dist/` 디렉토리에 다음 파일들이 생성됩니다:

- `dist/tizen-sdk.js` — esbuild로 번들링된 플러그인 본체
- `dist/plugin.json` — 플러그인 메타데이터 (commands 배열 자동 생성)
- `dist/scripts/` — 플랫폼 스크립트 (.ps1 / .sh)
- `dist/skills/` — SKILL.md 파일들
- `dist/bin/tizen-sdk.js` — 독립 런처 (tizen-cli 호스트 없이 번들 실행)

## 3. 플러그인 설치

### 최초 설치

```bash
tizen-cli plugin install ./dist
```

### 재설치 (이미 설치된 경우)

```bash
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install ./dist
```

> **참고:** 코드 수정 후에는 항상 `pnpm build`를 먼저 실행한 뒤 재설치해야 합니다.

## 4. 설치 확인

```bash
tizen-cli tizen-sdk --capabilities
```

정상적으로 설치되었다면 사용 가능한 커맨드 목록이 출력됩니다:

```json
{
  "status": "success",
  "result": {
    "available": [
      "sdk-init",
      "sdk-install",
      "sdk-install-custom-repo",
      "validate-repo-url",
      "tv-sdk-install",
      "tv-sdk-install-from-zip",
      "update-package",
      "sdk-repo-info",
      "download-emulator-package",
      "dotnet-setup",
      "check-node",
      "check-disk-space",
      "project-delete",
      "create-project",
      "list-templates",
      "build-project",
      "create-emulator",
      "launch-emulator",
      "emulator-manager",
      "device-manager",
      "install-app",
      "sdb-helper",
      "screenshot",
      "file-transfer",
      "remote-device",
      "gdb-debug",
      "dotnet-debug",
      "webapp-debug",
      "playwright-test",
      "certificate-manager"
    ],
    "unavailable": []
  },
  "warnings": [],
  "errors": []
}
```

> Tizen SDK가 아직 설치되지 않은 머신에서는 SDK가 필요한 커맨드들이
> `unavailable` 배열로 분류됩니다. `sdk-init`, `check-node` 등 SDK 없이
> 동작하는 커맨드만 `available`에 나타납니다.

## 5. tizen-cli 호스트 없이 실행 (독립 실행)

tizen-cli가 설치되어 있지 않다면 `bin/`의 런처가 같은 번들을 직접 실행합니다.
플러그인의 `run(args)`를 호출하고 성공 시 `0`, 실패 시 `1`로 종료하며,
출력은 동일한 JSON 엔벨로프입니다.

```bash
cd tizen-cli
node bin/tizen-sdk.js --capabilities        # 4단계와 같은 출력
node bin/tizen-sdk.js check-node

pnpm link --global                          # 선택: PATH에 `tizen-sdk` 등록
tizen-sdk --doctor

node dist/bin/tizen-sdk.js --schema         # 릴리스 ZIP(dist/만 있는 경우)
```

`pnpm build` 전에는 런처가 `PLUGIN_NOT_BUILT`를 출력하며
`suggested_fix.command`에 빌드 명령이 담깁니다. 자세한 내용은
[tizen-cli/README.ko.md](../../tizen-cli/README.ko.md#독립-실행-tizen-cli-호스트-없이)를 참고하세요.

## 문제 해결

| 문제 | 해결 방법 |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | `pnpm-workspace.yaml`이 있는지 확인 (esbuild postinstall 허용) |
| `pnpm: command not found` | `npm install -g pnpm`으로 설치 |
| `tizen-cli: command not found` | tizen-cli가 PATH에 있는지 확인, 또는 독립 런처(`node bin/tizen-sdk.js …`) 사용 |
| 런처가 `PLUGIN_NOT_BUILT` 출력 | `tizen-cli/`에서 `pnpm build`를 먼저 실행 |
| 빌드 후에도 변경사항 반영 안 됨 | `tizen-cli plugin uninstall tizen-sdk` 후 재설치 |
