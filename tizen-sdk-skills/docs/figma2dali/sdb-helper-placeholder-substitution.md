# sdb-helper 플레이스홀더 치환 버그 수정

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-02  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**대상:** `common/lib/core/sdb-helper.js`

---

## 개요

`sdb-helper`가 자연어 요청에서 값을 뽑아 sdb 명령을 조립하는 과정에 **두 개의 별개 결함**이 있었습니다.

1. **명령어 절단** — 셸 명령 추출 정규식이 명령어 앞부분을 삼켜, 사용자가 요청한 것과 **다른 명령이 디바이스에서 실행**됨
2. **플레이스홀더 미치환** — `<APPID>`, `<PKGID>`, `<port>`, `<KEYNAME>`, `<ip>` 가 리터럴 그대로 명령에 남고, 대부분 gated가 아니라 **그대로 실행**됨

두 결함 모두 오류 없이 조용히 잘못된 명령을 실행한다는 공통점이 있습니다.

---

## 버그 1 — `<CMD>` 추출이 명령어를 잘라먹음

### 원인

`extractShellCommand()`의 키워드 제거 정규식입니다.

```js
cmd = cmd.replace(/^(shell|command)\s*/i, "");
```

두 가지가 겹쳤습니다.

- **단어 경계가 없음** — `shell`이 단어 전체인지 확인하지 않습니다.
- **`\s*`가 공백 0개를 허용** — 키워드 뒤에 공백이 없어도 매칭됩니다.

결과적으로 `shell` 또는 `command`로 **시작하는 단어의 앞부분**이 잘려나갔습니다. 이 루프는 3회 반복되므로 첫 회에 `shell ` 를 정상 제거한 뒤, 두 번째 회차가 남은 명령어를 갉아먹습니다.

### 증상

| 요청 | 실제 실행된 명령 |
|------|------------------|
| `shell shellcheck script.sh` | `check script.sh` |
| `run shell commander --list` | `er --list` |
| `shell command commands.txt` | `s.txt` |

`shell-command` intent는 `gated: false` 이므로 확인 절차 없이 **변조된 명령이 디바이스에서 그대로 실행**됩니다. 문법 오류가 아니라 "다른 유효한 명령"이 되는 경우가 있어 조용히 실패한다는 점이 특히 위험합니다.

### 수정

```js
cmd = cmd.replace(/^(shell|command)(\s+|$)/i, "");
```

키워드가 **온전한 단어일 때만** 제거합니다. `(\s+|$)`는 뒤에 공백이 오거나 문자열이 끝나는 경우만 허용하므로 `shellcheck`의 `shell`은 매칭되지 않습니다. `shell shell ls` 같은 중복 키워드 처리는 기존대로 동작합니다.

> 참고: 앞쪽의 `/^(run|execute)\s+/i` 는 `\s+`(1개 이상)를 요구하고 있어 같은 문제가 없었습니다. `running`은 잘리지 않습니다.

---

## 버그 2 — 플레이스홀더 미치환

### 원인

`buildCommand()`의 여러 intent가 값을 추출하지 않고 플레이스홀더 문자열을 그대로 반환했습니다.

```js
case "launch":
  return { command: `${s} shell app_launcher -s "<APPID>"` };
case "package-info":
  return { command: `${s} shell pkginfo --pkg "<PKGID>"` };
```

`<CMD>`(셸 명령)만 `extractShellCommand()`로 처리되고 있었고, **같은 계열의 나머지 값은 추출 로직 자체가 없었습니다.**

### 증상

요청 안에 값이 **분명히 있는데도** 무시됩니다.

| 요청 | 조립된 명령 | 실행 여부 |
|------|-------------|-----------|
| `launch app org.tizen.dali-demo` | `sdb shell app_launcher -s "<APPID>"` | **실행됨** |
| `package info org.tizen.foo` | `sdb shell pkginfo --pkg "<PKGID>"` | **실행됨** |
| `forward port` | `sdb forward tcp:<port> tcp:<port>` | **실행됨** |
| `sendkey home` | `sdb shell sendkey <KEYNAME>` | **실행됨** |
| `connect to localhost` | `sdb connect <ip>:26101` | **실행됨** |
| `disconnect` | `sdb disconnect <ip>:26101` | **실행됨** |
| `kill app org.example.myapp` | `sdb shell app_launcher -k "<APPID>"` | gated (제시만) |
| `remove forward 8080` | `sdb forward --remove tcp:<port>` | gated (제시만) |

gated intent도 **사용자에게 제시되는 명령이 이미 깨져 있어서**, 그대로 승인해도 실패합니다.

부수적으로 `connect` intent의 정규식은 `localhost`를 받아주는데(`/\bconnect\b.*\b(\d+\.\d+\.\d+\.\d+|localhost)\b/i`) `buildCommand()`는 IPv4만 처리해서, `localhost` 요청은 반드시 `<ip>`로 새어 나갔습니다.

### 수정

추출 함수 4개를 추가하고 각 intent에 연결했습니다.

| 함수 | 대상 intent | 동작 |
|------|-------------|------|
| `extractAppId()` | launch, kill, package-info | 점 표기 식별자(`org.tizen.dali-demo`) 추출. 첫 세그먼트를 **문자로 시작**하도록 제한해 IPv4와 `emulator-26101` 형태의 시리얼을 자동 배제 |
| `extractKeyName()` | sendkey | `KEY_*` 토큰 또는 알려진 별칭(`home`, `back`, `menu`, `power`, `enter`, 방향키, 볼륨)만 허용 |
| `extractPorts()` | forward-add, forward-remove | 시리얼·IP의 숫자를 **먼저 제거**한 뒤 포트 스캔. 포트가 2개면 host/device로 구분 |
| `extractHostPort()` | connect, disconnect | IPv4 + **`localhost`** 지원. 포트 기본값 26101 |

### 값을 찾지 못하면 실행하지 않음

추출 실패 시 `missingValue()`가 **빈 command + 안내 note**를 반환합니다. `executeSdb()`는 빈 command를 보면 아무것도 실행하지 않고 `invalid_parameters` Envelope을 반환합니다.

```
launch the app
  → (실행 안 함) Could not find an app ID in the request.
    Include it, e.g. 'launch app org.tizen.dali-demo'.
```

추측해서 실행하는 것보다 무엇이 빠졌는지 알려주는 편이 안전합니다. 특히 `sendkey`는 잘못된 키 이벤트를 보내면 되돌릴 수 없어, 별칭 목록에 없는 단어는 추측하지 않습니다.

### `note`가 버려지던 문제

`executeSdb()`의 오류 경로가 `cmdInfo.note`를 무시하고 있었습니다.

```js
// 수정 전 — 무엇이 빠졌는지 알 수 없음
`Could not build sdb command for intent: ${intent.id}`
```

이 때문에 **기존에 정상 동작하던 `shell-command`의 안내조차 사라지고** 있었습니다. note를 메시지에 포함하도록 고쳤습니다.

### `disconnect` 예외 처리

대상 없는 `sdb disconnect`는 "모든 원격 디바이스 연결 해제"라는 **유효한 sdb 동작**입니다. 오류로 막지 않고 그대로 실행하되, 범위를 알리는 note를 붙였습니다.

```
disconnect
  → sdb disconnect
     note: No host given — this disconnects ALL remote devices.
```

---

## 수정 전/후

```
                                    수정 전                              수정 후
shell shellcheck script.sh    →  shell "check script.sh"          shell "shellcheck script.sh"
launch app org.tizen.dali-demo →  app_launcher -s "<APPID>"        app_launcher -s "org.tizen.dali-demo"
forward 8080 to 9090          →  forward tcp:8080 tcp:8080        forward tcp:8080 tcp:9090
sendkey home                  →  sendkey <KEYNAME>                sendkey KEY_HOME
connect to localhost          →  connect <ip>:26101               connect localhost:26101
launch the app                →  app_launcher -s "<APPID>" 실행    실행 안 함 + 안내
```

`forward 8080 to 9090`은 기존에 `/(\d+)/` 로 **첫 숫자 하나만** 잡아 양쪽에 같은 포트를 쓰던 것도 함께 고쳐졌습니다.

---

## 테스트

**파일:** `common/lib/tests/sdb-helper.test.js`

```bash
cd common/lib/tests
node sdb-helper.test.js
```

검증 32개를 추가해 총 61개가 되었습니다.

**Test 5 — 단어 경계**

- `shellcheck`, `commander`, `commands.txt` 가 잘리지 않는지
- `shell shell ls` 중복 키워드 처리 유지

**Test 6 — 플레이스홀더 치환**

- intent별 정상 치환 (launch, kill, package-info, forward, sendkey, connect, disconnect)
- 시리얼 숫자(`emulator-26101`)를 포트로 오인하지 않는지
- 값 누락 시 빈 command + note 반환 (실행되지 않음)
- 대상 없는 `disconnect`의 동작과 경고
- **sweep 검사** — 전체 intent를 훑어 `<PLACEHOLDER>`가 하나도 남지 않는지

sweep 검사는 앞으로 intent를 추가할 때 같은 실수를 잡아주는 안전망입니다.

기존 7개 테스트 파일 전부 통과를 확인했습니다.

---

## 배포

```bash
cd tizen-cli
pnpm build     # common/lib이 번들에 인라인됨 (dist/는 gitignore 대상)
```

플러그인 캐시 반영:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/core/sdb-helper.js
~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/core/sdb-helper.js
```

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `common/lib/core/sdb-helper.js` | 단어 경계 수정, 추출 함수 4개 + `missingValue()` 추가, 7개 intent 연결, 오류 경로에 note 포함 |
| `common/lib/tests/sdb-helper.test.js` | 회귀 테스트 32개 추가 |

2개 파일, +270 / -24

---

## 관련 문서

- [빌드 실패 진단 정보 개선](build-failure-diagnostics.md) — 같은 세션에서 수정한 빌드 Envelope 문제
