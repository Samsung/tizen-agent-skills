---
name: tizen-sdk-skills-review
description: Codex entrypoint for reviewing a pull request that touches tizen-sdk-skills/. Use when asked to review a pull request in this repository, for example "review PR 49" or "PR 49 리뷰해줘". The procedure itself lives in .claude/skills/tizen-sdk-skills-review/SKILL.md.
---

# Reviewing tizen-sdk-skills pull requests with Codex

This file is the Codex entrypoint only. The review procedure is kept in one
place so that the host entrypoints cannot drift apart.

Read and follow
[`.claude/skills/tizen-sdk-skills-review/SKILL.md`](../../../.claude/skills/tizen-sdk-skills-review/SKILL.md)
from start to finish. Every rule there applies unchanged, including:

- comment only — never approve, request changes, merge, push or edit the pull
  request branch;
- stop if the pull request does not touch `tizen-sdk-skills/`;
- stop if `git status --porcelain` is not empty;
- run only safe-tier checks;
- show the draft comment and post it only after the reviewer confirms.
