# tizen-sdk 플러그인 빌드 및 설치 가이드

이 문서는 tizen-cli용 tizen-sdk 플러그인을 소스에서 빌드하고 tizen-cli에 설치하는 방법을 설명합니다.

## 사전 요구사항

- **Node.js 18 이상** — [https://nodejs.org](https://nodejs.org)에서 다운로드
- **pnpm** — 설치되어 있지 않은 경우: `npm install -g pnpm`
- **tizen-cli** — 별도 배포되는 tizen-cli 호스트 CLI (설치 방법은 tizen-cli 배포 안내 참조)

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

## 문제 해결

| 문제 | 해결 방법 |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | `pnpm-workspace.yaml`이 있는지 확인 (esbuild postinstall 허용) |
| `pnpm: command not found` | `npm install -g pnpm`으로 설치 |
| `tizen-cli: command not found` | tizen-cli가 PATH에 있는지 확인 |
| 빌드 후에도 변경사항 반영 안 됨 | `tizen-cli plugin uninstall tizen-sdk` 후 재설치 |
