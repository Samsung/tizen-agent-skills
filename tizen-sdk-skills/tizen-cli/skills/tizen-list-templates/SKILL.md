---
name: tizen-list-templates
description: List Tizen templates, tizen list templates, 타이젠 템플릿 목록, 템플릿 확인, template list, available templates, 어떤 템플릿. Use this skill to list project templates available in the installed Tizen SDK, per project type (native, dotnet, webapp, rpk, tv, platform). Run before tizen-create-project so the user picks a real template name.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-18"
  keywords:
    - Tizen templates
    - template list
    - list templates
    - 타이젠 템플릿
    - 템플릿 목록
    - create project prerequisite
---

# List Tizen Project Templates

## When to use

Before `create-project`, or when the user asks which templates/app types are available. Requires the Tizen SDK to be installed.

## Command

```
tizen-cli tizen-sdk list-templates [--type <type>]
```

| Option          | Required | Default | Description                                            |
| --------------- | -------- | ------- | ------------------------------------------------------ |
| `--type <type>` | no       | all     | `native` \| `dotnet` \| `webapp` \| `rpk` \| `tv` \| `platform` |

## Output

- Success `result.templates`: map of type → template name array, e.g. `{ "webapp": ["Basic", "WebService"] }`.
  The untyped list always includes `platform` — the plugin's GBS-buildable sample apps
  (e.g. `dali-demo`); show them as their own "Platform 앱" group, created with
  `create-project --type platform`.
- Success `result.profile`: the `tizen-X.Y` profile the templates were listed under.
- Success `result.tv` — **only when the Samsung TV SDK extension is installed**, on typed
  calls too: `{ "profile": "tv-samsung-10.0", "web": ["Basic_Empty", …], "dotnet": ["TizenNUIApp", …] }`.
  This field is the only way to tell whether the TV SDK is installed. For a web-app request
  show `result.tv.web` next to `result.templates.webapp` (heading "Samsung TV 웹앱 템플릿");
  for a generic "어떤 템플릿 있어?" show the TV list next to the per-type lists. A TV
  template is created with `create-project --type tv`.
- Failure: SDK not installed → run `tizen-cli tizen-sdk sdk-install` first. `--type <type>`
  with no templates is a `template_not_found` failure whose message names the fix (for `tv`:
  install the TV SDK).

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

`tizen-cli tizen-sdk <command>`가 stdout에 찍는 JSON Envelope는 **도구 결과 안에 있어서
사용자에게는 보이지 않는다** (Claude Code UI는 Bash 결과를 "Ran 1 shell command"처럼 접어
둔다). 터미널에서 직접 실행하면 JSON이 그대로 보이지만, 에이전트 세션에서 사용자에게 보이는
것은 최종 답변 텍스트만이다. 따라서 최종 답변은 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
   stderr로 나오는 `[DEBUG] ...` 줄은 Envelope가 아니므로 제외한다.
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Follow-ups

- Pass an exact template name to `tizen-cli tizen-sdk create-project --template <name> ...`.
