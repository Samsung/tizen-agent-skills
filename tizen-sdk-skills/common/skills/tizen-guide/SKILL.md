---
name: tizen-guide
description: ANY "how do I … / …하는 방법 알려줘 / 어떻게 해 / 가이드 어디" question about USING Tizen development tools (emulator, build, install, certificate, debug, SDK, TV, Tizen Action, …) ROUTES HERE FIRST — before you grep the repository, read another skill's SKILL.md or answer from memory. Not for questions about this repository's own source code or implementation. "타이젠 에뮬 실행하는 방법 알려줘" → tizen-guide; "에뮬레이터 실행해줘" → tizen-launch-emulator. Tizen guide, Tizen docs, Tizen FAQ, 타이젠 가이드, 사용법, 방법 알려줘, how to, where is the guide, which skill should I use. Answers only from the tizen-agent-skills user guides indexed by the repository-root llms.txt (tizen-sdk-skills, tizen-action-skills and every plugin added later), cites each document used, and adds nothing the guides do not say. Read-only; never runs a Tizen command. A request to DO something — build, install, create or launch an emulator, debug, sign, collect logs — goes to the matching tizen-* skill instead.
metadata:
  author: Samsung Electronics
  last-updated: "2026-11-24"
  keywords:
    - Tizen guide
    - Tizen docs
    - FAQ
    - llms.txt
    - 가이드
    - 사용법
---

## What this is

A documentation guide for the `tizen-agent-skills` repository. It answers "how do
I…", "what is…" and "where is the guide for…" questions from the published
documents, and links the documents it used. It runs no command and changes
nothing.

**Scope boundary.** If the user asks you to _do_ something (build the app, create
an emulator, install a package, debug, sign, show logs), do not answer from the
docs — use the matching `tizen-*` skill. If they ask how something works or how to
do it themselves, this skill applies. Questions about this repository's own
source code or implementation (how a runner, hook or library works internally)
are not user-guide questions: read the code instead of using this skill.

## 1. Find the documents

The index of every plugin's documents is the repository's `llms.txt`. Each plugin
registers its README and main guides there, so new plugins are covered without
changing this skill.

- **Inside a clone on `main`** — if the working directory or one of its parents
  holds both `llms.txt` and `tizen-sdk-skills/`, and
  `git -C <repo-root> rev-parse --abbrev-ref HEAD` prints `main`, run
  `git -C <repo-root> fetch origin main` and compare
  `git -C <repo-root> rev-parse HEAD origin/main`. If the two hashes match (or
  the fetch fails because there is no network), read the local files
  (Read / Grep); if they differ, the clone lags behind GitHub, so treat it as
  "otherwise". Map a link
  `https://github.com/Samsung/tizen-agent-skills/blob/main/<path>` to the local
  file `<repo-root>/<path>`. A clone on any other branch may differ from `main`,
  so treat it as "otherwise" and read from GitHub; the cited links then match
  what you read.
- **Otherwise** — fetch
  `https://raw.githubusercontent.com/Samsung/tizen-agent-skills/main/llms.txt`.
  Read each linked document through its raw URL: replace
  `https://github.com/Samsung/tizen-agent-skills/blob/main/` with
  `https://raw.githubusercontent.com/Samsung/tizen-agent-skills/main/`.

If neither works (no clone and no network access), say so and give the user the
repository URL `https://github.com/Samsung/tizen-agent-skills`; do not answer from
memory.

## 2. Pick the documents

1. Choose from the `llms.txt` links the one or two documents closest to the
   question — a plugin README for overview and setup, the skills reference for
   what a skill does and its triggers, the quick guide for a one-page summary.
2. For a detailed topic, go one level down through the plugin's documentation
   index, for example `tizen-sdk-skills/docs/README.en.md`, which links the guides
   under `docs/` (certificate, debug, emulator, sdk-install, tv-setup, wsl,
   platform, …).
3. Read only what the question needs. Search a long document for the relevant
   heading instead of reading it whole.

**Sources are user guides only.** Use the documents linked from `llms.txt`, the
plugin documentation indexes and the guides under each plugin's `docs/` and
`usage/`. Do **not** answer from `common/skills/*/SKILL.md`, `common/agents/*.md`
or `common/hooks/*` — those are instructions for agents (their fallbacks and
troubleshooting asides are not user-facing methods).

## 3. Pick the language

Answer in the user's language and prefer documents in that language:

| Location                                   | English   | Korean              |
| ------------------------------------------ | --------- | ------------------- |
| Repository root, plugin root, `tizen-cli/` | `X.md`    | `X.ko.md`           |
| `tizen-sdk-skills/docs/`                   | `X.en.md` | `X.md` or `X.ko.md` |

If only one language exists, use it and translate the answer.

## 4. Answer

- Base the answer only on what the documents say. Keep commands, paths and option
  names exactly as written there.
- Do not add methods, tools, menus or alternatives from general knowledge (for
  example Tizen Studio GUI steps) when the guides do not describe them. Present
  only the ways the guides give.
- End with a **References** list of the documents used, as GitHub blob URLs
  (`https://github.com/Samsung/tizen-agent-skills/blob/main/<path>`), even when
  you read them locally.
- If the documents do not cover the question, say that plainly, do not guess, and
  point to `https://github.com/Samsung/tizen-agent-skills/issues`.
- If the user then wants the step carried out, hand over to the matching
  `tizen-*` skill.
