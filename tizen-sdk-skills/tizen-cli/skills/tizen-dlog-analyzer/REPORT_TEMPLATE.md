---
name: tizen-dlog-analyzer-report
description: Structured, bilingual (English + Korean) report format for presenting a completed dlog analysis (check / error-analyze) result to the user.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-07"
  used-by: tizen-dlog-analyzer
  languages: [en, ko]
---

# DLog Analysis Report Format

Every report is rendered **twice**, in this order, separated by a `---` line:

1. the full **English** report (block A), then
2. the full **Korean (한국어)** report (block B) — a faithful translation of
   block A with the same sections, the same number of bullets, in the same
   order.

Always render both blocks, regardless of the language the user wrote in.

Technical identifiers stay **verbatim in both blocks** — never translate or
transliterate them: app IDs, package names, device serials, dlog tags, quoted
log messages, file paths, function names, error codes, and code snippets.

Use plain bullet lists (`-`) throughout — never tables.

## Severity guide (applies to both blocks)

- **Critical / 심각** — app crash, fatal signal, unhandled exception that
  terminates the process
- **High / 높음** — error-level (E) log repeated or blocking core functionality
- **Medium / 중간** — recoverable error, warning that precedes a later failure
- **Low / 낮음** — cosmetic / log-noise-adjacent issue unlikely to be
  user-visible

## Label mapping (English → Korean)

Use exactly these Korean labels in block B — do not improvise translations.

- Analysis Report → 분석 보고서
- Summary → 요약
- Date → 날짜
- Emulator/Device → 에뮬레이터/디바이스
- App → 앱
- system-wide → 시스템 전체
- Issue → 이슈
- Not specified — proactive scan → 미지정 — 사전 점검
- Root Cause → 근본 원인
- Severity → 심각도
- Critical / High / Medium / Low → 심각 / 높음 / 중간 / 낮음
- Evidence → 근거
- Occurrences → 발생 횟수
- Additional Findings → 추가 발견 사항
- Solution Suggestions → 해결 방안 제안
- Code available → 코드가 있는 경우
- Code not available → 코드가 없는 경우
- Workarounds → 임시 해결 방법

---

## Block A — `## Analysis Report (English)`

### 0. Summary

A `Label: value` block, four lines, in this order:

```
Date: <current date, e.g. September 7, 2026>
Emulator/Device: <human/VM name, if any> (<device_serial from the tool result, e.g. emulator-26101>)
App: <app_id analyzed, e.g. com.samsung.fh.youtube — or "system-wide" for a check not scoped to one app>
Issue: <the problem the user reported, in their own words>
```

- **Date** — current date, plus time if known.
- **Emulator/Device** — human-readable name (if known) plus `device_serial`
  in parentheses; serial alone if no name is known.
- **App** — the `app_id` from the tool result, or "system-wide" for a general
  `check`.
- **Issue** — the problem in the user's own words; "Not specified — proactive
  scan" if this was a health check rather than a reported symptom.

### 1. Root Cause

One bullet per distinct root cause, most severe first:

- **[Severity: Critical/High/Medium/Low] —** one-sentence plain-language
  statement of the cause
  - Evidence: the specific log tag/message/pattern that points to it (short
    quote, not the whole dump)
  - Occurrences: count, if the tool reported deduplication counts

If nothing was found: "No crashes or errors detected in the collected window."

### 2. Additional Findings

Bullets for log lines that aren't the root cause but are suspicious,
ambiguous, or worth noting (unfamiliar error codes, repeated warnings,
deprecation notices, unclassified messages) — quote plus short explanation.
If none: "No additional anomalies observed."

### 3. Solution Suggestions

- **Code available:** file(s)/function(s) most likely responsible plus the
  concrete code change, then a prompt to apply it and reproduce for another
  analysis pass.
- **Code not available:** which log lines/modules/components need developer
  attention, since a fix can't be authored without the source.

### 4. Workarounds

Bullets of temporary mitigations that sidestep the issue without fixing the
root cause (restart, clear cache, disable a feature, retry logic, avoid the
triggering action). If none: "No workaround identified — root-cause fix
required."

---

## Block B — `## 분석 보고서 (한국어)`

Block A의 내용을 아래 구조로 그대로 옮긴다. 섹션 수, 불릿 수, 순서는 Block A와
동일해야 한다.

### 0. 요약

`라벨: 값` 형식 네 줄, 이 순서로:

```
날짜: <현재 날짜, 예: 2026년 9월 7일>
에뮬레이터/디바이스: <VM/디바이스 이름(알 경우)> (<도구 결과의 device_serial, 예: emulator-26101>)
앱: <분석한 app_id, 예: com.samsung.fh.youtube — 특정 앱에 한정되지 않은 check면 "시스템 전체">
이슈: <사용자가 보고한 문제, 사용자의 표현 그대로>
```

- **날짜** — 현재 날짜, 시간을 알면 함께.
- **에뮬레이터/디바이스** — 이름(알 경우) + 괄호 안에 `device_serial`; 이름을
  모르면 serial만.
- **앱** — 도구 결과의 `app_id`, 일반 `check`면 "시스템 전체".
- **이슈** — 사용자의 표현 그대로; 증상 보고가 아닌 점검이었다면 "미지정 — 사전
  점검".

### 1. 근본 원인

서로 다른 근본 원인마다 불릿 하나, 심각한 것부터:

- **[심각도: 심각/높음/중간/낮음] —** 원인을 한 문장으로 쉽게 설명
  - 근거: 원인을 가리키는 구체적인 로그 태그/메시지/패턴 (짧은 인용, 전체 덤프
    금지)
  - 발생 횟수: 도구가 중복 제거 횟수를 보고했다면 그 수

발견된 것이 없으면: "수집 구간에서 크래시나 에러가 감지되지 않았습니다."

### 2. 추가 발견 사항

근본 원인은 아니지만 의심스럽거나 모호하거나 기록해 둘 가치가 있는 로그 라인
(낯선 에러 코드, 반복되는 경고, deprecation 안내, 미분류 메시지) — 인용 + 짧은
설명. 없으면: "추가로 관찰된 이상 징후가 없습니다."

### 3. 해결 방안 제안

- **코드가 있는 경우:** 원인일 가능성이 가장 높은 파일/함수와 구체적인 코드
  변경, 그리고 적용 후 재현하여 다시 분석하자는 안내.
- **코드가 없는 경우:** 소스 없이는 수정할 수 없으므로 개발자가 확인해야 할 로그
  라인/모듈/컴포넌트.

### 4. 임시 해결 방법

근본 원인을 고치지 않고 문제를 피해 가는 임시 조치 불릿 (재시작, 캐시 삭제,
기능 비활성화, 재시도 로직, 유발 동작 회피). 없으면: "임시 해결 방법이 확인되지
않았습니다 — 근본 원인 수정이 필요합니다."

---

## Closing prompt (after block B)

End with a short next-step prompt, English first, then Korean:

- "Next step? (a) keep monitoring, (b) apply the suggested fix and retest,
  (c) stop and clean up."
- "다음 단계를 선택해 주세요: (a) 모니터링 계속, (b) 제안된 수정 적용 후
  재테스트, (c) 종료 및 정리."
