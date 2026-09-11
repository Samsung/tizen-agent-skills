# 중간 계층 소개

[English](SDK_LAYERS_OVERVIEW.en.md) | 한국어

> 호출 흐름에는 여러 중간 계층(CLI 러너 → sdk-commands.js → plugin-cache.js → .ps1)이 있습니다. 아래는 각 계층의 소개와 존재 이유입니다.

---

## 1. 하네스의 명령 실행 도구는 동기 블록 + stdout 캡처 방식

Cline의 `execute_command`와 Claude Code의 `Bash` 도구는 모두 명령이 끝날 때까지 기다렸다가 stdout을 캡처합니다. 하지만:

- **에뮬레이터 실행**(`manageDevice`) → qemu 프로세스가 백그라운드에서 계속 살아있음
- **앱 설치**(`installApp`) → sdb 서버 데몬이 stdout 파이프를 상속
- **GDB 디버그**(`setupGdbDebug`) → gdbserver가 분리된 프로세스로 남음

이런 경우 `.ps1`을 직접 실행하면 **자식 프로세스가 파이프 핸들을 물고 있어서 `execSync`가 영원히 블록**됩니다.

`sdk-commands.js` → `plugin-cache.js`의 `execPluginScript()`는 `captureViaTempFile: true` 옵션으로 stdout을 임시 파일로 리다이렉트하여 이 문제를 해결합니다. 이는 .ps1 스크립트 자체에서 처리할 수 없는 Node.js `execSync` 레벨의 문제입니다.

---

## 2. 파라미터 검증 + 에러 코드 매핑

`.ps1` 스크립트는 범용 도구입니다. 잘못된 경로, 잘못된 포트, 잘못된 앱 ID가 들어와도 일단 실행됩니다. `sdk-commands.js`는:

- **사전 검증**: 경로 존재, 포트 범위(1–65535), 타임아웃 범위, 셸 안전 문자 필터링
- **에러 코드 매핑**: 스크립트 exit code + stdout 패턴을 분석해서 `device_not_found`, `build_failed`, `dotnet_sdk_not_found` 등의 구조화된 에러 코드로 변환
- **다음 단계 제안**: `suggested_fix` 필드로 "디바이스를 먼저 연결하세요" 같은 안내 제공

이걸 .ps1에서 하려면 PowerShell 스크립트가 엄청나게 비대해지고, 에이전트가 파싱하기 어려운 텍스트 출력만 나옵니다.

---

## 3. Standard JSON Envelope 포장

에이전트는 **구조화된 JSON**을 받아야 다음 행동을 결정할 수 있습니다. `.ps1`의 텍스트 출력을 그대로 받으면:

```
# .ps1 직접 호출 시 (에이전트가 파싱해야 함):
Building project...
[100%] Linking target
Created: C:\...\MyApp-1.0.0-x86_64.tpk (188889 bytes)
```

```
# sdk-commands.js 경유 시 (에이전트가 바로 사용):
{
  "status": "success",
  "result": {
    "artifacts": [{ "path": "C:\\...\\MyApp-1.0.0-x86_64.tpk", "size_bytes": 188889 }]
  }
}
```

에이전트가 "빌드 성공, 다음은 설치"라고 판단하려면 JSON이 필요합니다.

---

## 4. 크로스 플랫폼 추상화

같은 기능이 Windows에서는 `.ps1`, Linux/macOS에서는 `.sh`입니다:

```js
// sdk-commands.js가 처리:
const ext = process.platform === 'win32' ? '.ps1' : '.sh';
const scriptPath = path.join(versionDir, 'scripts', 'tizen-build-project', `tizen-build-project${ext}`);
```

에이전트가 직접 .ps1을 호출하면 Linux/macOS에서 동작하지 않습니다.

---

## 5. 플러그인 캐시 경로 해석

스크립트는 `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/scripts/...`에 있습니다 (Claude Code 하네스에서는 `~/.claude/plugins/cache/...`도 탐색 — `CLAUDECODE` 환경 변수에 따라 탐색 순서가 바뀜). 버전이 바뀌면 경로도 바뀝니다. `plugin-cache.js`의 `findLatestVersionDir()` + `resolveScript()`가 이를 자동으로 해석합니다. 에이전트가 경로를 직접 조립하면 버전 업데이트 시 깨집니다.

---

## 6. 컨텍스트 윈도우 절약

`.ps1`을 직접 실행하면 수천 줄의 툴체인 출력이 에이전트의 컨텍스트 윈도우를 소모합니다. `sdk-commands.js`는:

- `summarize*Output()` 함수로 핵심 경고/에러만 최대 10줄 추출
- 전체 로그는 임시 파일로 저장 (필요 시 참조)
- 성공 시에는 artifacts 정보만 envelope에 포함

이렇게 하지 않으면 빌드 한 번에 컨텍스트 윈도우가 수만 토큰 소모됩니다.

---

## 요약: 각 계층의 역할

| 계층 | 역할 | 없으면? |
|---|---|---|
| **CLI 러너** (`*-cli.js`) | argv 파싱, 비동기 실행, exit code | 에이전트가 직접 require/호출해야 함 |
| **sdk-commands.js** | 파라미터 검증, 출력 파싱, Envelope 생성, 에러 매핑 | .ps1 텍스트 출력을 에이전트가 직접 파싱해야 함 |
| **plugin-cache.js** | 캐시 경로 해석, `captureViaTempFile` | execSync 블록, 크로스 플랫폼 미지원, 경로 하드코딩 |
| **.ps1 / .sh** | 실제 `tz`/`sdb`/`dotnet` 명령 실행 | — |

**핵심**: 에이전트(LLM)는 텍스트를 읽고 판단하지만, 시스템은 구조화된 JSON과 안전한 프로세스 관리가 필요합니다. 중간 계층들이 이 간극을 메웁니다.

---

## 관련 문서

- [Tizen SDK 커맨드 계층 아키텍처](SDK_COMMANDS_ARCHITECTURE.md) — 전체 호출 흐름, CLI 러너-함수 매핑, 내보낸 함수 목록
