---
name: tizen-guide
description: Tizen guide, Tizen docs, Tizen FAQ, how to use tizen-agent-skills, 타이젠 가이드, 사용법, 방법 알려줘, 어떻게 해, 문서 어디, 가이드 찾아줘, how do I, how to, where is the guide, what does this skill do, which skill should I use. Answers questions about HOW to use the tizen-agent-skills plugins (tizen-sdk-skills, tizen-action-skills and every plugin added later) and points to the right guide, using only the repository's published documents found through its llms.txt index, and cites each document it used. Read-only and never runs a Tizen command. A request to DO something — build, install, create or launch an emulator, debug, sign, collect logs — goes to the matching tizen-* skill instead (tizen-build-project, tizen-install-app, tizen-create-emulator, …).
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
do it themselves, this skill applies.

## 1. Find the documents

The index of every plugin's documents is the repository's `llms.txt`. Each plugin
registers its README and main guides there, so new plugins are covered without
changing this skill.

- **Inside a clone** — if the working directory or one of its parents holds both
  `llms.txt` and `tizen-sdk-skills/`, read the local files (Read / Grep). Map a
  link `https://github.com/Samsung/tizen-agent-skills/blob/main/<path>` to the
  local file `<repo-root>/<path>`.
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

## 3. Pick the language

Answer in the user's language and prefer documents in that language:

| Location                                   | English   | Korean    |
| ------------------------------------------ | --------- | --------- |
| Repository root, plugin root, `tizen-cli/` | `X.md`    | `X.ko.md` |
| `tizen-sdk-skills/docs/`                   | `X.en.md` | `X.md`    |

If only one language exists, use it and translate the answer.

## 4. Answer

- Base the answer only on what the documents say. Keep commands, paths and option
  names exactly as written there.
- End with a **References** list of the documents used, as GitHub blob URLs
  (`https://github.com/Samsung/tizen-agent-skills/blob/main/<path>`), even when
  you read them locally.
- If the documents do not cover the question, say that plainly, do not guess, and
  point to `https://github.com/Samsung/tizen-agent-skills/issues`.
- If the user then wants the step carried out, hand over to the matching
  `tizen-*` skill.
