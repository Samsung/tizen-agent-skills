---
name: tizen-sdk-skills-review
description: Review a pull request that touches tizen-sdk-skills/ against AGENTS.md, CONTRIBUTING.md and scripts/check-pr.js, then post the review as a pull request comment. Use when asked to review a pull request in this repository, for example "review PR 49" or "PR 49 리뷰해줘".
---

# Reviewing tizen-sdk-skills pull requests

Review a pull request against the repository's own rules, run the automated
check, and post one review comment written in English. A reviewer runs this
from their own checkout; the comment is posted from their GitHub account.

Comment only. Never approve, request changes, merge, push, or edit the pull
request branch.

## Sources of truth

When a rule is ambiguous, use evidence in this order:

1. [`AGENTS.md`](../../../AGENTS.md) and
   [`tizen-sdk-skills/CONTRIBUTING.md`](../../../tizen-sdk-skills/CONTRIBUTING.md)
2. [`tizen-sdk-skills/GOVERNANCE.md`](../../../tizen-sdk-skills/GOVERNANCE.md)
   section 2.2 (code review) and the README's
   [Harness Separation Principle](../../../tizen-sdk-skills/README.md#harness-separation-principle)
3. Neighbouring code and documents in the area the pull request touches

## Workflow

### 1. Gather the pull request

```bash
gh pr view <N> --json number,title,body,author,baseRefName,headRefName,headRefOid,files,commits
gh pr view <N> --comments
gh pr diff <N>
```

Stop and tell the user if the pull request does not touch `tizen-sdk-skills/`.

### 2. Collect prior findings

Earlier review comments start with `## Review:`. List every blocking and
non-blocking finding they raised; each one is rechecked against the current
head in step 5. Read the author's replies too: a finding the author explained
is resolved if the explanation holds.

### 3. Check out the pull request

If `git status --porcelain` is not empty, stop and ask the user; do not stash
or discard their work. Note the current branch so you can return to it.

```bash
gh pr checkout <N>
git fetch origin <base>
```

### 4. Run the automated checks

```bash
cd tizen-sdk-skills
node scripts/check-pr.js --base origin/<base> --format jsonl
```

The run always ends with `check-pr: N ERROR, M WARN (K files, T s)`. If that
line is missing, the check did not run; fix the `--base` revision and rerun.
Every `ERROR` is blocking. Every `WARN` is blocking unless the pull request
description explains it.

Run the checks that match what the pull request changes. Safe tier only;
never run mutating or device-tier tests, and never run anything that needs a
Tizen SDK or device.

| Changed | Run |
|---|---|
| `common/lib/**` | `node common/lib/tests/run-all.js --filter <module>` |
| `common/hooks/**` | `bash common/hooks/hooks.test.sh` |
| any `SKILL.md`, `plugin-cache.js` | `node scripts/rewrite-runner-snippets.js --check` |
| any source file | `node scripts/add-spdx-headers.js --check` |
| `tizen-cli/**` | `cd tizen-cli && pnpm install --frozen-lockfile && pnpm exec tsc --noEmit` |
| `tests/**` | `cd tests && npm ci && npm run lint` |

Record every command you ran and its result for the comment. When a command
cannot run locally (missing tool, network), say so instead of guessing.

### 5. Review what the check cannot judge

Read the whole diff, then the surrounding code of each changed function. Check:

- **Harness separation.** Logic lives in `common/`; `claude/`, `cline/`,
  `codex/` and `gemini/` hold thin wrappers and hook adapters only.
  `tizen-cli/` and `vscode/` do not vendor copies of `common/`.
- **Process handling.** Every spawned process has its exit code checked, and
  failures produce a clear error in the Standard JSON Envelope.
- **Cross-platform parity.** A `.sh` change has the matching `.ps1` change
  (and the reverse); paths are built with `path` APIs, not string joins.
- **Behaviour change without a test.** New or changed behaviour in
  `common/lib/` comes with a `*.test.js` case; the Testing section of the
  pull request records which tiers were run.
- **Internal-only content.** Nothing that depends on Samsung-internal
  services appears outside `internal-only` fences or listed paths
  (CONTRIBUTING.md section 8).
- **Documentation.** Paired documents change together, and command or skill
  counts stay consistent across `README*.md`, `docs/SKILLS_REFERENCE*.md`
  and `tests/README.md`.
- **Publication safety.** No internal hostnames, private IP addresses,
  personal paths or credentials, including inside added images and
  screenshots. Look at every image the pull request adds.
- **Pull request hygiene.** The title follows Conventional Commits with the
  plugin as scope, the pull request covers one topic, and every template
  section is filled in.
- **Prior findings.** Each finding from step 2 is resolved, still open, or
  superseded; say which and why.

Cite every finding as `path:line` relative to the repository root, say why it
matters, and give a concrete fix. Do not report style that ESLint or Prettier
already enforce.

### 6. Draft the comment

Write the comment in English to a file in your scratch directory, using this
structure. Omit a section that would be empty, except **Automated checks**.

```markdown
## Review: <pull request title>

Reviewed PR #<N> (HEAD `<short sha>`) against `AGENTS.md`,
`tizen-sdk-skills/CONTRIBUTING.md` and `.claude/skills/tizen-sdk-skills-review/SKILL.md`.

### Change summary
<two to four bullets: what changes and where>

### Automated checks
- `node scripts/check-pr.js --base origin/<base>` → **N ERROR, M WARN (K files)** ✅/❌
- <each other command> → <result> ✅/❌

### Prior findings rechecked
**1. <finding> — RESOLVED ✅ / STILL OPEN ❌**
<one or two sentences>

### Blocking findings
**1. <title>** (`path:line`)
<what is wrong, why it matters, and the fix>

### Non-blocking suggestions
- <suggestion> (`path:line`)

### Verdict
<"Ready to merge once the blocking findings are fixed" or "No blocking findings">

---
_Reviewed with <model name> (`<model id>`) in <host>._
```

End every comment with that model line, including re-reviews, so readers can
tell which model produced each pass. Fill it from what the running agent was
told about itself, for example:

```markdown
_Reviewed with Opus 5.5 (`claude-opus-5-5`) in Claude Code._
```

If the agent was not given its model name or ID, write `unknown` for that part
rather than guessing.

### 7. Confirm, then post

Show the draft to the user and post it only after they confirm:

```bash
gh pr comment <N> --body-file <draft-file>
```

Then return to the branch noted in step 3 and report the comment URL.
