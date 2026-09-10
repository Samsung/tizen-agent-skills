# 훅 git-route 거부 문제 수정

**버전:** 0.1.0  
**작성자:** Samsung Electronics  
**게시일:** 2026-08-02  
**라이선스:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**대상:** `common/hooks/`

---

## 개요

PreToolUse 훅의 **git-route**(git/gh 명령을 규칙 검사에서 제외하는 우회 분기)가 명령이 `git`으로 **시작할 때만** 동작해서, `cd <project> && git commit ...` 같은 일상적인 형태가 거부되던 문제를 수정했습니다.

GBS 빌드 작업에서 특히 자주 발생했습니다. GBS는 프로젝트 디렉토리에 git 저장소를 요구하므로 `cd <project> && git init && git commit` 이 자연스러운 형태인데, 정확히 route가 놓치는 모양이었기 때문입니다.

---

## git-route란

`check-tizen-commands.sh`는 Bash/PowerShell 도구 호출을 가로채 Tizen 명령 실수(`tz build -p`, `tools/sdb/sdb`, 수동 `gdbserver` 등)를 거부합니다. 판정은 **명령 문자열 전체를 패턴 매칭**해서 이뤄집니다.

문제는 **커밋 메시지가 자기가 다루는 명령을 인용한다**는 점입니다.

```bash
git commit -m "fix tz build -p flag"
```

이 명령은 Tizen 도구를 전혀 실행하지 않지만, 문자열에 `tz build` 와 `-p` 가 들어 있어 Rule 1에 걸립니다. 그래서 git/gh 명령은 규칙 검사를 건너뛰는 우회 분기를 둔 것입니다. 이 분기를 git-route라 부릅니다.

---

## 문제

### 원인

route의 판정 정규식이 **문자열 시작에 고정**돼 있었습니다.

```bash
grep -Eq '^[[:space:]]*(git|gh)[[:space:]]'
```

git 호출이 첫 토큰이 아닌 경우가 흔한데도 이를 인식하지 못했습니다.

- `cd <project> && git commit ...` — `cd`로 시작
- `GIT_EDITOR=true git commit ...` — 환경변수로 시작

route를 놓치면 아래의 모든 규칙이 커밋 메시지 본문에 적용됩니다.

### 증상 (수정 전 실측)

```
allowed | git commit -m "fix tz build -p flag"
DENIED  | cd /home/user/tizen-apps/dali-demo && git commit -m "fix tz build -p flag"
DENIED  | cd proj && git commit -m "document sdb forward tcp:8080 helper"
DENIED  | GIT_EDITOR=true git commit --amend -m "tz build -p"
```

같은 커밋인데 `cd` 접두사 하나로 결과가 갈립니다.

### 빌드 작업에서 자주 터진 이유

GBS 플랫폼 빌드는 git 저장소를 요구합니다. `tizen-build-project.sh`의 `ensure_git_repo()`가 프로젝트 디렉토리에서 `git init` / `git add` / `git commit`을 수행하고, 사용자나 에이전트가 같은 작업을 손으로 할 때도 자연히 이렇게 씁니다.

```bash
cd /w/dali-demo && git init && git add -A && git commit -m "initial for gbs"
```

빌드 관련 작업의 커밋 메시지는 거의 필연적으로 `tz build`, `sdb`, `gdbserver` 같은 단어를 포함하므로, route를 놓치는 순간 거부로 이어졌습니다.

### 영향 범위

동일한 결함이 **세 훅에 복사**돼 있었습니다.

| 훅 | 유형 | 영향 |
|----|------|------|
| `check-tizen-commands.sh` | PreToolUse | Tizen 규칙이 커밋 메시지에 적용되어 **거부** |
| `check-project-writes.sh` | PreToolUse | `config.xml` 언급 + writer 단어 조합으로 **거부** |
| `show-envelope.sh` | PostToolUse | 거부는 아니지만 git 명령에 불필요한 Envelope 처리 |

---

## 수정

테스트 전에 **선행 접두사를 벗겨내는** `is_git_command()` 헬퍼를 추가했습니다.

```bash
is_git_command() {
  route="$1"
  # Bounded: each pass removes one prefix, and real commands stack very few.
  for _ in 1 2 3 4; do
    before="$route"
    # VAR=value prefix, e.g. GIT_EDITOR=true git commit
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//')"
    # cd <path> && | ;  — the path may be JSON-escaped-quoted (\"...\")
    route="$(printf '%s' "$route" | sed -E 's/^[[:space:]]*cd[[:space:]]+(\\+"[^"\\]*\\+"|[^[:space:]&;|]+)[[:space:]]*(&&|;)[[:space:]]*//')"
    [ "$route" = "$before" ] && break
  done
  printf '%s' "$route" | grep -Eq '^[[:space:]]*(git|gh)([[:space:]]|$)'
}
```

처리하는 접두사:

- `cd <path> &&` / `cd <path>;` — 경로가 JSON escape된 따옴표(`\"...\"`)여도 인식
- `VAR=value` 환경변수 할당

반복은 4회로 제한했습니다. 실제 명령에서 접두사가 이보다 많이 쌓이는 경우는 없습니다.

### 우회가 넓어지지 않도록 한 부분

route는 **규칙을 건너뛰는 통로**이므로 과도하게 넓히면 가드가 무력화됩니다. 두 가지로 제한했습니다.

1. **접두사를 벗긴 직후 토큰이 git/gh여야 함** — `cd /w/app && tz build -p` 는 `cd`를 벗기면 `tz`가 나오므로 우회되지 않고 그대로 거부됩니다.
2. **끝에 `([[:space:]]|$)` 경계** — `git-foo tz build -p x` 처럼 `git`으로 시작하는 다른 단어를 git 명령으로 오인하지 않습니다.

즉 "명령 어딘가에 git이 있으면 통과"가 아니라, "실제로 실행되는 명령이 git이면 통과"입니다.

---

## 수정 전/후

```
                                                       수정 전    수정 후
git commit -m "fix tz build -p flag"                   allow      allow
cd /w/dali-demo && git commit -m "fix tz build -p"     DENY       allow
cd proj && git commit -m "sdb forward tcp:8080"        DENY       allow
GIT_EDITOR=true git commit --amend -m "tz build -p"    DENY       allow
cd "/w/my app" && git commit -m "tz build -p"          DENY       allow
cd repo; git commit -m "tizen build notes"             DENY       allow

cd /w/app && tz build -p /w/app                        DENY       DENY   ← 유지
cd /w/app && gdbserver :1234 ./app                     DENY       DENY   ← 유지
git-foo tz build -p x                                  DENY       DENY   ← 유지
```

---

## 테스트

훅에는 테스트가 없었습니다. 이번에 새로 추가했습니다.

**파일:** `common/hooks/hooks.test.sh` (신규)

```bash
bash common/hooks/hooks.test.sh
```

23개 케이스 전부 통과합니다. 구성은 네 묶음입니다.

1. **git route 허용** — `cd &&`, `;`, 환경변수, 따옴표 있는 경로, 다중 git 체인, `gh pr create`
2. **실제 실수는 여전히 거부** — `cd /w/app && tz build -p`, `gdbserver`, `tools/sdb/sdb`, `git-foo`
3. **`check-project-writes` 양쪽** — git 커밋은 허용, `config.xml` 쉘 쓰기는 거부
4. **`show-envelope`은 PostToolUse** — 어떤 것도 거부하지 않음

2번 묶음이 이 테스트의 핵심입니다. **우회가 과도해지는 것을 막는 안전망**이라, 앞으로 route를 손볼 때 가드가 뚫리는지 바로 잡아줍니다.

---

## 알려진 제약

같은 `is_git_command()` 헬퍼가 세 훅에 중복돼 있습니다.

공용 파일로 분리해 `source` 하는 방법을 검토했으나, 훅은 Windows Git Bash에서도 실행되고 경로 해석이 실패하면 **훅 자체가 깨져 도구 호출을 막을 수 있어** 인라인 유지를 택했습니다. 대신 각 사본에 동기화 대상임을 주석으로 명시했습니다.

또한 route는 여전히 **명령 선두만** 판단합니다. `tz build -p x && git status` 처럼 git이 뒤에 오는 경우는 (의도대로) 우회되지 않고 앞의 `tz` 규칙이 적용됩니다.

---

## 배포

훅은 번들에 포함되지 않고 플러그인 캐시에서 직접 실행됩니다.

```bash
bash cline/setup/setup.sh
```

반영 위치:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/hooks/
```

> Cline 캐시에는 현재 `hooks/` 디렉토리가 없습니다. Cline은 별도의 훅 어댑터(`~/Documents/Cline/Hooks`)를 사용하며, 설정 UI에서 활성화해야 합니다.

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `common/hooks/check-tizen-commands.sh` | `is_git_command()` 추가, route 교체 |
| `common/hooks/check-project-writes.sh` | 동일 |
| `common/hooks/show-envelope.sh` | 동일 (저장소에 아직 untracked — 로컬에만 적용) |
| `common/hooks/hooks.test.sh` | 신규 (23개 케이스, `show-envelope.sh`가 없으면 해당 묶음 skip) |

---

## 관련 문서

- [빌드 실패 진단 정보 개선](build-failure-diagnostics.md)
- [sdb-helper 플레이스홀더 치환 버그 수정](sdb-helper-placeholder-substitution.md)
