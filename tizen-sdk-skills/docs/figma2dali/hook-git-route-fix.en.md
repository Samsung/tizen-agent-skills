# Hook git-route Rejection Fix

English | [한국어](hook-git-route-fix.md)

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-02  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**Target:** `common/hooks/`

---

## Overview

The **git route** in the PreToolUse hooks — the early exit that keeps a git/gh command out of the Tizen rule matching — only fired when the command **started** with `git`. Routine shapes such as `cd <project> && git commit ...` were therefore denied.

This surfaced most often during GBS build work: GBS requires a git repository inside the project directory, so `cd <project> && git init && git commit` is the natural form, and that is precisely the shape the route missed.

---

## What the git route is

`check-tizen-commands.sh` intercepts Bash/PowerShell tool calls and denies recurring Tizen command mistakes (`tz build -p`, `tools/sdb/sdb`, hand-rolled `gdbserver`, and so on). It decides by **pattern-matching the whole command string**.

The complication is that **a commit message quotes the commands it is about**:

```bash
git commit -m "fix tz build -p flag"
```

That command runs no Tizen tooling at all, yet the string contains `tz build` and `-p`, so Rule 1 matches. Hence the early exit that lets git/gh commands skip the rules — the git route.

---

## Problem

### Cause

The route's test was anchored to the start of the string:

```bash
grep -Eq '^[[:space:]]*(git|gh)[[:space:]]'
```

The git invocation is frequently not the first token, and none of those forms were recognized:

- `cd <project> && git commit ...` — starts with `cd`
- `GIT_EDITOR=true git commit ...` — starts with an environment assignment

When the route is missed, every rule below is applied to the commit message body.

### Symptoms (measured before the fix)

```
allowed | git commit -m "fix tz build -p flag"
DENIED  | cd /home/user/tizen-apps/dali-demo && git commit -m "fix tz build -p flag"
DENIED  | cd proj && git commit -m "document sdb forward tcp:8080 helper"
DENIED  | GIT_EDITOR=true git commit --amend -m "tz build -p"
```

The same commit succeeds or fails based only on a `cd` prefix.

### Why build work hit it so often

GBS platform builds require a git repository. `ensure_git_repo()` in `tizen-build-project.sh` runs `git init` / `git add` / `git commit` in the project directory, and anyone doing the same by hand writes it the same way:

```bash
cd /w/dali-demo && git init && git add -A && git commit -m "initial for gbs"
```

Commit messages for build work almost inevitably mention `tz build`, `sdb`, or `gdbserver` — so the moment the route is missed, a denial follows.

### Scope

The same defect had been **copied into three hooks**.

| Hook | Type | Impact |
|------|------|--------|
| `check-tizen-commands.sh` | PreToolUse | Tizen rules applied to the commit message → **denial** |
| `check-project-writes.sh` | PreToolUse | a `config.xml` mention plus a writer word → **denial** |
| `show-envelope.sh` | PostToolUse | no denial, but needless envelope processing on git commands |

---

## Fix

An `is_git_command()` helper strips leading prefixes before testing.

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

Prefixes handled:

- `cd <path> &&` / `cd <path>;` — including a JSON-escaped quoted path (`\"...\"`)
- `VAR=value` environment assignments

The loop is capped at four passes; real commands never stack more.

### Keeping the bypass narrow

The route is a **path around the rules**, so widening it too far disarms the guards. Two constraints keep it tight:

1. **The token immediately after the stripped prefix must be git/gh.** `cd /w/app && tz build -p` strips to `tz ...`, so it is not routed and is still denied.
2. **A trailing `([[:space:]]|$)` boundary.** `git-foo tz build -p x` is not mistaken for a git command.

The rule is not "git appears somewhere in the command" but "the command actually being run is git".

---

## Before / After

```
                                                       before    after
git commit -m "fix tz build -p flag"                   allow     allow
cd /w/dali-demo && git commit -m "fix tz build -p"     DENY      allow
cd proj && git commit -m "sdb forward tcp:8080"        DENY      allow
GIT_EDITOR=true git commit --amend -m "tz build -p"    DENY      allow
cd "/w/my app" && git commit -m "tz build -p"          DENY      allow
cd repo; git commit -m "tizen build notes"             DENY      allow

cd /w/app && tz build -p /w/app                        DENY      DENY   ← unchanged
cd /w/app && gdbserver :1234 ./app                     DENY      DENY   ← unchanged
git-foo tz build -p x                                  DENY      DENY   ← unchanged
```

---

## Tests

The hooks had no tests. One was added.

**File:** `common/hooks/hooks.test.sh` (new)

```bash
bash common/hooks/hooks.test.sh
```

23 cases, all passing, in four groups:

1. **git route allowed** — `cd &&`, `;`, environment prefixes, quoted paths, chained git commands, `gh pr create`
2. **real mistakes still denied** — `cd /w/app && tz build -p`, `gdbserver`, `tools/sdb/sdb`, `git-foo`
3. **`check-project-writes` both ways** — git commits allowed, `config.xml` shell writes denied
4. **`show-envelope` is PostToolUse** — denies nothing

Group 2 is the important one: it is the **safety net against the bypass growing too wide**, and it will catch a hole immediately the next time the route is touched.

---

## Known Limitations

The same `is_git_command()` helper is duplicated across three hooks.

Extracting it to a shared file and `source`-ing it was considered, but hooks also run under Windows Git Bash, and a failed path resolution would **break the hook itself and could block tool calls**. Inline copies were kept instead, each with a comment marking it as synchronized.

The route also still judges only the **head** of the command. A form like `tz build -p x && git status` is not routed — by design — and the leading `tz` rule applies.

---

## Deployment

Hooks are not bundled; they execute directly from the plugin cache.

```bash
bash cline/setup/setup.sh
```

Target location:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/hooks/
```

> The Cline cache currently has no `hooks/` directory. Cline uses a separate hook adapter (`~/Documents/Cline/Hooks`) that must be enabled in its settings UI.

---

## Changed Files

| File | Change |
|------|--------|
| `common/hooks/check-tizen-commands.sh` | added `is_git_command()`, replaced the route |
| `common/hooks/check-project-writes.sh` | same |
| `common/hooks/show-envelope.sh` | same (still untracked in the repo — applied locally only) |
| `common/hooks/hooks.test.sh` | new (23 cases; skips that group when `show-envelope.sh` is absent) |

---

## Related

- [Build Failure Diagnostics Improvement](build-failure-diagnostics.en.md)
- [sdb-helper Placeholder Substitution Fix](sdb-helper-placeholder-substitution.en.md)
