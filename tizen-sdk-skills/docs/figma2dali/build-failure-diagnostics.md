# 빌드 실패 진단 정보 개선

[English](build-failure-diagnostics.en.md) | 한국어

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-02  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**커밋:** `b234bf9` (관련: `52957cb`)

---

## 개요

빌드가 실패했을 때 반환되는 Standard JSON Envelope에 **실제 컴파일 에러가 포함되지 않던 문제**를 수정했습니다.

기존에는 실패 응답에 셋업 단계의 무의미한 warning과 로그 파일 경로만 남아, 원인을 알려면 호스트의 `/tmp/tizen-build-*.log`를 직접 열어야 했습니다. 에이전트 환경에서는 이 파일을 읽기 위한 별도 우회가 필요했고, 그 과정을 건너뛰면 원인을 추측할 수밖에 없었습니다.

이 변경으로 **실패 Envelope 하나만 보고도 어느 파일 몇 번째 줄이 왜 깨졌는지 알 수 있습니다.**

---

## 문제

### 증상

2026-08-01 GBS(DALi) 빌드 작업 중 다음이 발생했습니다.

- 실패 원인을 **3회 오귀인**
- 동일한 빌드를 **5회 반복 실행**

원인 정보가 응답에 없으니 추측으로 접근하고, 확인을 위해 같은 빌드를 다시 돌리는 악순환이 반복된 것입니다.

### 수정 전 실제 응답

```
Build failed (exit 1). Key lines: [    0s] warning: repository metadata stale for repo-0 |
[    1s] warning: repository metadata stale for repo-1 | ... | [    9s] warning: repository
metadata stale for repo-9 | ... (more warning/error lines omitted). Full log:
/tmp/tizen-build-1785717621350.log
```

688자를 쓰고도 정보량은 사실상 0입니다. 정작 필요한 다음 줄은 잘려 나갔습니다.

```
main.cpp:42:10: fatal error: dali/dali.h: No such file or directory
```

---

## 근본 원인

로그를 파일에만 쓰기 때문이 아니라, **요약 함수가 엉뚱한 줄을 골랐기** 때문입니다. 세 가지가 겹쳤습니다.

### 1. "앞에서부터 N줄" 방식의 선별

기존 `summarizeBuildOutput()`은 `/warning|error|fail/i`에 매칭되는 줄을 **앞에서부터 10줄**만 취했습니다.

```js
summarizeOutput(output, {
  keep: /warning|error|fail/i,
  max: 10,
  overflowNote: "... (more warning/error lines omitted)",
});
```

GBS 빌드는 repo·rpm 셋업 단계에서 warning을 수십 줄 쏟아냅니다. 그래서 상한 10줄이 전부 셋업 warning으로 채워지고, 뒤에 나오는 컴파일 에러는 **항상** 잘렸습니다. 로그가 길수록 더 확실하게 잘리는 구조였습니다.

### 2. GBS 타임스탬프 접두사

GBS는 빌드 로그 모든 줄에 경과 시간을 붙입니다.

```
[   42s] main.cpp:42:10: fatal error: dali/dali.h: No such file or directory
```

이 접두사 때문에 `^파일:줄:` 형태를 노리는 앵커 패턴이 **전부 빗나갔습니다.** 컴파일러 진단으로 인식할 방법 자체가 없었습니다.

### 3. 중복 미제거

GBS는 말미 요약 블록에 같은 에러를 한 번 더 출력합니다. 제한된 10줄을 중복이 또 잡아먹었습니다.

> **참고:** 컴파일 에러는 이미 `error.stdout` / `error.stderr`에 **잡혀 있었습니다.** 데이터가 없어서가 아니라, 선별 단계에서 버려지고 있었습니다.

---

## 변경 사항

### 1. `extractBuildDiagnostics()` 신규

**파일:** `common/lib/core/output-summary.js`

"앞에서부터 N줄"이 아니라 **진단 가치 순으로 우선순위화**합니다.

| 순위 | 분류 | 매칭 대상 |
|------|------|-----------|
| 1 | 컴파일러/링커/CMake 진단 | `file:line:col: error:` (gcc/clang), `fatal error:`, `error CS####` (C#), `error MSB####` (MSBuild), `undefined reference to`, `collect2: error:`, `ld: ... cannot find`, `CMake Error`, `No rule to make target` |
| 2 | 빌드 시스템 실패 마커 | `error: Bad exit status from`, `RPM build errors:`, `make[N]: ***`, `gbs:error`, `Local build failed`, `error: Failed build dependencies` |
| 3 | 일반 error 줄 | `error` / `failed` / `failure` 포함 |

추가 처리:

- **GBS 타임스탬프 제거** — `[   42s]` 접두사를 벗겨야 앵커 패턴이 동작합니다.
- **중복 제거** — GBS가 말미에 반복하는 동일 줄 제거.
- **warning 제외** — 실패 진단에서 warning은 노이즈입니다. (성공 경로의 warning 요약은 기존 `summarizeOutput()`이 그대로 담당)
- **길이 제한** — 기본 12줄, 줄당 300자. 초과 시 생략 안내 추가.

### 2. Envelope `details` 필드

**파일:** `common/lib/envelope/envelope.js`, `response-formatter.js`

`_normalizeError()`가 알려진 필드만 남기고 나머지를 버리고 있었습니다. 배열 형태의 `details`를 통과시키도록 했습니다.

```js
if (Array.isArray(error.details) && error.details.length > 0) {
  normalized.details = error.details;
}
```

`formatError()`에는 선택적 6번째 인자 `details`를 추가했습니다. 기존 호출부는 영향을 받지 않습니다.

```js
formatError(command, errorCategory, message, suggestedCommand, startTime, details)
```

### 3. 실패 메시지 조립

**파일:** `common/lib/core/project.js`

진단을 **메시지 본문에도** 넣습니다. 스킬 문서가 에이전트에게 `errors[0].message`를 출력하라고 지시하기 때문에, 여기 없으면 사용자에게 끝내 보이지 않습니다.

```js
function formatBuildFailureMessage(headline, diagnostics, logPath) {
  const parts = [headline];
  if (diagnostics.length) {
    parts.push("", "Build errors:", ...diagnostics.map((line) => `  ${line}`));
  }
  parts.push("", logPath ? `Full log: ${logPath}` : "Full log could not be saved.");
  return parts.join("\n");
}
```

`buildProject()`의 **두 실패 경로 모두**에 적용했습니다.

1. 스크립트 비정상 종료 (GBS 실패는 항상 이 경로)
2. 정상 종료했으나 산출물(`.tpk`/`.wgt`/`.rpm`) 없음

전체 로그 파일 저장은 그대로 유지됩니다.

### 4. 스킬 문서 실패 처리 지침

**파일:** `common/skills/tizen-build-project/SKILL.md`

재빌드 반복을 막기 위한 규칙을 명시했습니다.

1. 실제 진단(파일·줄·메시지)을 보고할 것 — "빌드 실패"나 로그 경로만 던지지 말 것
2. **동일한 빌드를 그대로 재실행하지 말 것** — 같은 실패만 반복됨
3. `details`에 원인이 있으면 추측하지 말 것 — `Full log:`는 진단이 비었을 때만

---

## 수정 전/후 비교

동일한 GBS 실패 로그(셋업 warning 14줄 + 컴파일 에러 + rpm/make 후폭풍 + GBS 요약 반복)를 양쪽 코드에 넣은 실측 결과입니다.

### Before

```
Build failed (exit 1). Key lines: [    0s] warning: repository metadata stale for repo-0 |
[    1s] warning: ... | ... (more warning/error lines omitted). Full log: /tmp/tizen-build-...log
```

### After

```
Build failed (exit 1).

Build errors:
  /home/abuild/rpmbuild/BUILD/dali-demo/shared/main.cpp:42:10: fatal error: dali/dali.h: No such file or directory
  make[2]: *** [CMakeFiles/dali-demo.dir/build.make:76: main.o] Error 1
  make[1]: *** [CMakeFiles/Makefile2:85: all] Error 2
  error: Bad exit status from /var/tmp/rpm-tmp.k3Jd91 (%build)
  RPM build errors:
  gbs:error: Local build failed

Full log: /tmp/tizen-build-1785717621350.log
```

### 수치

| 항목 | Before | After |
|------|--------|-------|
| 근본 원인(`main.cpp:42:10`) 포함 | **없음** | **있음 (첫 줄)** |
| 셋업 warning 비율 | 10/11줄 | 0/7줄 |
| 메시지 길이 | 688자 (1줄) | 466자 (12줄) |
| `errors[0].details` | 필드 없음 | 7개 배열 |
| 원인 파악에 필요한 추가 동작 | 호스트 로그 파일 열기 | 없음 |

**정보량은 늘었는데 길이는 32% 줄었습니다.** 노이즈를 걷어낸 결과입니다.

---

## Envelope 형태

```json
{
  "status": "failure",
  "errors": [
    {
      "error_code": "TIZEN_SDK_BUILD_E001",
      "error_category": "build_failed",
      "message": "Build failed (exit 1).\n\nBuild errors:\n  .../main.cpp:42:10: fatal error: dali/dali.h: No such file or directory\n  ...\n\nFull log: /tmp/tizen-build-1785717621350.log",
      "details": [
        "/home/abuild/rpmbuild/BUILD/dali-demo/shared/main.cpp:42:10: fatal error: dali/dali.h: No such file or directory",
        "make[2]: *** [CMakeFiles/dali-demo.dir/build.make:76: main.o] Error 1",
        "error: Bad exit status from /var/tmp/rpm-tmp.k3Jd91 (%build)",
        "gbs:error: Local build failed"
      ]
    }
  ],
  "command": "tizen-sdk build-project",
  "duration_ms": 6
}
```

같은 진단 배열이 **두 군데로** 들어갑니다.

- `message` — 사람이 읽는 용도. `\n`이 포함된 단일 문자열이라 raw JSON에서는 escape되어 보이고, 출력하면 여러 줄로 렌더링됩니다.
- `details` — 기계 판독 용도. JSON 출력에서도 한 줄씩 그대로 읽힙니다.

같은 데이터를 쓰므로 둘 사이 불일치가 생기지 않습니다.

---

## API

### `extractBuildDiagnostics(output, opts?)`

```js
const { extractBuildDiagnostics } = require("../core/output-summary");
const diagnostics = extractBuildDiagnostics(fullOutput, { max: 12, maxLineLength: 300 });
```

| 인자 | 기본값 | 설명 |
|------|--------|------|
| `output` | — | 실패한 빌드의 stdout + stderr 결합 문자열 |
| `opts.max` | `12` | 반환할 최대 진단 줄 수. 초과 시 생략 안내 한 줄 추가 |
| `opts.maxLineLength` | `300` | 줄당 최대 길이. 컴파일러 커맨드라인은 수 KB에 달할 수 있음 |

**반환:** `string[]` — 진단 가치 순으로 정렬된 줄 배열. 입력이 비었거나 매칭이 없으면 `[]`.

---

## 테스트

**파일:** `common/lib/tests/output-summary.test.js` (신규)

```bash
cd common/lib/tests
node output-summary.test.js
```

검증 항목 17개:

- 빈 입력 / 에러 없는 출력 처리
- **GBS 회귀 케이스** — warning 15줄(기존 상한 10 초과) 뒤의 컴파일 에러가 첫 줄로 나오는지
- 티어 정렬 (컴파일러 > 빌드시스템 > 일반)
- 툴체인별 패턴 (gcc, C#, 링커, CMake)
- 중복 제거, `max` 상한, 생략 안내, 줄 길이 절단
- `summarizeOutput()` 기존 동작 무회귀

기존 6개 테스트 파일(`certificate`, `envelope`, `remote-device`, `sdb-helper`, `sdk-check`, `sdk-commands`) 모두 통과를 확인했습니다.

---

## 배포

`tizen-cli`는 esbuild로 `common/lib`를 번들에 인라인하므로 재빌드하면 자동 반영됩니다.

```bash
cd tizen-cli
pnpm build     # dist/tizen-sdk.js 재생성 (dist/는 gitignore 대상)
```

Cline / Claude 플러그인 캐시에 배포하려면 setup 스크립트를 사용합니다.

```bash
bash cline/setup/setup.sh
```

영향 받는 파일:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/
~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/
~/.cline/skills/tizen-build-project/SKILL.md
```

---

## 알려진 제약

`execPluginScript()`는 **정상 종료(exit 0) 시 stderr를 버립니다.**

빌드 스크립트는 자체 로그 대부분을 stderr로 내보내므로, "exit 0인데 산출물 없음" 경로에서는 스크립트가 남긴 stderr가 진단에 포함되지 않습니다.

GBS는 빌드 실패 시 **항상 non-zero로 종료**하므로 이번 문제(GBS 컴파일 에러)에는 영향이 없습니다. `execPluginScript()`는 모든 도메인이 공유하는 헬퍼라 이번 범위에서는 변경하지 않았습니다.

---

## 관련 변경: `tizen-create-project` 스코프 고정

**커밋:** `52957cb` (PR #93, 머지됨)

같은 세션에서 수정한 별개 문제입니다. "앱 생성만" 요청했는데 에이전트가 빌드·인증서 생성·설치까지 이어서 수행하던 문제입니다.

원인은 코드가 아니라 문서였습니다. CLI 러너와 Envelope는 깨끗했고(`project-manager-cli.js`는 생성 후 종료, Envelope 생성부는 스크립트의 `Next steps:` 안내를 이미 제거), 스킬 문서 맨 아래의 스코프 규칙이 *"Report envelope, suggest next steps"* 라고 쓰여 있고 바로 아래에 `tizen-build-project`가 나열돼 있던 것이 원인이었습니다.

수정 내용:

- `common/skills/tizen-create-project/SKILL.md` — frontmatter 직후에 `Scope — STOP after creation` 섹션 추가. 생성만 요청받으면 Envelope 보고 후 종료하고, 빌드·인증서·설치를 하지 말며, 계획(todo·focus chain)에 그 단계를 넣지도 말 것. `tizen-build-project`는 텍스트로 언급만 가능하고 직접 호출은 금지.
- `tizen-cli/skills/tizen-create-project/SKILL.md` — Follow-ups에 동일 취지 명시.

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `common/lib/core/output-summary.js` | `extractBuildDiagnostics()` 신규 |
| `common/lib/core/project.js` | 두 실패 경로에 진단 인라인, `formatBuildFailureMessage()` 추가 |
| `common/lib/envelope/envelope.js` | `details` 필드 통과 |
| `common/lib/envelope/response-formatter.js` | `formatError()` 6번째 인자 `details` |
| `common/lib/cli/project-manager-cli.js` | 헤더 주석 갱신 |
| `common/lib/tests/output-summary.test.js` | 신규 (검증 17개) |
| `common/skills/tizen-build-project/SKILL.md` | 실패 처리 지침 |

7개 파일, +311 / -13
