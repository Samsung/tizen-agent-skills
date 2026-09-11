# Build Failure Diagnostics Improvement

English | [한국어](build-failure-diagnostics.md)

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-02  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**Commit:** `b234bf9` (related: `52957cb`)

---

## Overview

Fixed a problem where the Standard JSON Envelope returned by a failed build **did not contain the actual compile errors**.

Previously the failure response carried only meaningless setup warnings plus a log file path, so finding the cause meant opening `/tmp/tizen-build-*.log` on the host. In an agent environment that required a separate workaround to read the file, and skipping that step left nothing to do but guess.

With this change, **the failure envelope alone tells you which file, which line, and why the build broke.**

---

## Problem

### Symptoms

During GBS (DALi) build work on 2026-08-01:

- The cause was **misattributed 3 times**
- The same build was **re-run 5 times**

With no cause in the response, the work proceeded by guesswork, and confirming each guess meant running the same build again — a loop that fed itself.

### Actual response before the fix

```
Build failed (exit 1). Key lines: [    0s] warning: repository metadata stale for repo-0 |
[    1s] warning: repository metadata stale for repo-1 | ... | [    9s] warning: repository
metadata stale for repo-9 | ... (more warning/error lines omitted). Full log:
/tmp/tizen-build-1785717621350.log
```

688 characters carrying essentially zero information. The one line that mattered had been cut:

```
main.cpp:42:10: fatal error: dali/dali.h: No such file or directory
```

---

## Root Cause

Not because the log was written to a file, but because **the summarizer picked the wrong lines**. Three factors compounded.

### 1. "First N lines" selection

The old `summarizeBuildOutput()` kept only the **first 10 lines** matching `/warning|error|fail/i`.

```js
summarizeOutput(output, {
  keep: /warning|error|fail/i,
  max: 10,
  overflowNote: "... (more warning/error lines omitted)",
});
```

A GBS build emits dozens of warnings during repo and rpm setup. The 10-line budget was therefore consumed entirely by setup warnings, and the compile error that came later was **always** cut. The longer the log, the more reliably it was lost.

### 2. GBS timestamp prefix

GBS prefixes every line of its build log with an elapsed-time stamp:

```
[   42s] main.cpp:42:10: fatal error: dali/dali.h: No such file or directory
```

That prefix made every anchored pattern targeting `^file:line:` **miss completely**. There was no way to recognize the line as a compiler diagnostic.

### 3. No deduplication

GBS repeats the same errors in its trailing summary block. Those duplicates ate further slots out of the 10-line budget.

> **Note:** The compile errors were **already captured** in `error.stdout` / `error.stderr`. The data was there — it was being discarded during selection.

---

## Changes

### 1. New `extractBuildDiagnostics()`

**File:** `common/lib/core/output-summary.js`

Ranks lines by diagnostic value instead of taking the first N.

| Rank | Category | Matches |
|------|----------|---------|
| 1 | Compiler / linker / CMake diagnostics | `file:line:col: error:` (gcc/clang), `fatal error:`, `error CS####` (C#), `error MSB####` (MSBuild), `undefined reference to`, `collect2: error:`, `ld: ... cannot find`, `CMake Error`, `No rule to make target` |
| 2 | Build-system failure markers | `error: Bad exit status from`, `RPM build errors:`, `make[N]: ***`, `gbs:error`, `Local build failed`, `error: Failed build dependencies` |
| 3 | Generic error lines | contains `error` / `failed` / `failure` |

Additional handling:

- **Strips the GBS timestamp** — the `[   42s]` prefix has to come off before anchored patterns can work.
- **Deduplicates** — removes the identical lines GBS repeats in its summary block.
- **Excludes warnings** — in a failure diagnosis, warnings are noise. (Warning summaries on the success path remain the job of the existing `summarizeOutput()`.)
- **Caps size** — 12 lines by default, 300 characters per line, with an overflow note when truncated.

### 2. Envelope `details` field

**Files:** `common/lib/envelope/envelope.js`, `response-formatter.js`

`_normalizeError()` kept only known fields and dropped the rest. It now passes an array-valued `details` through.

```js
if (Array.isArray(error.details) && error.details.length > 0) {
  normalized.details = error.details;
}
```

`formatError()` gained an optional sixth parameter, `details`. Existing call sites are unaffected.

```js
formatError(command, errorCategory, message, suggestedCommand, startTime, details)
```

### 3. Failure message composition

**File:** `common/lib/core/project.js`

The diagnostics also go **into the message body**. The skill docs instruct agents to surface `errors[0].message`, so anything absent from the message never reaches the user.

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

Applied to **both failure paths** in `buildProject()`:

1. Script exits non-zero (GBS failures always take this path)
2. Script exits 0 but produces no artifact (`.tpk` / `.wgt` / `.rpm`)

The full log file is still saved.

### 4. Failure-triage rules in the skill doc

**File:** `common/skills/tizen-build-project/SKILL.md`

Rules added to stop the rebuild loop:

1. Report the actual diagnostic (file, line, message) — never just "build failed" or a bare log path
2. **Never re-run an identical build** — it only reproduces the same failure
3. Do not guess the cause when `details` names it — `Full log:` is for cases where the diagnostics are empty

---

## Before / After

Measured by running the same GBS failure log (14 setup warnings + the compile error + the rpm/make fallout + GBS repeating itself) through both versions of the code.

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

### Numbers

| Metric | Before | After |
|--------|--------|-------|
| Root cause (`main.cpp:42:10`) present | **No** | **Yes (first line)** |
| Share taken by setup warnings | 10 of 11 lines | 0 of 7 lines |
| Message length | 688 chars (1 line) | 466 chars (12 lines) |
| `errors[0].details` | field did not exist | 7-element array |
| Extra action needed to find the cause | open host log file | none |

**More information in 32% less text**, because the noise is gone.

---

## Envelope Shape

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

The same diagnostics array feeds **two places**:

- `message` — for humans. A single string containing `\n`, so it appears escaped in raw JSON and renders as multiple lines when printed.
- `details` — for machines. Readable line by line even in raw JSON output.

Both come from the same data, so they cannot disagree.

---

## API

### `extractBuildDiagnostics(output, opts?)`

```js
const { extractBuildDiagnostics } = require("../core/output-summary");
const diagnostics = extractBuildDiagnostics(fullOutput, { max: 12, maxLineLength: 300 });
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `output` | — | Combined stdout + stderr of the failed build |
| `opts.max` | `12` | Maximum diagnostic lines to return; an overflow note is appended when exceeded |
| `opts.maxLineLength` | `300` | Per-line cap — compiler command lines can run to several KB |

**Returns:** `string[]` — lines ordered by diagnostic value. `[]` when the input is empty or nothing matches.

---

## Tests

**File:** `common/lib/tests/output-summary.test.js` (new)

```bash
cd common/lib/tests
node output-summary.test.js
```

17 assertions covering:

- Empty input and error-free output
- **The GBS regression** — a compile error following 15 warnings (past the old cap of 10) must come out first
- Tier ordering (compiler > build-system > generic)
- Per-toolchain patterns (gcc, C#, linker, CMake)
- Deduplication, the `max` cap, the overflow note, line truncation
- No regression in existing `summarizeOutput()` behavior

The six existing test files (`certificate`, `envelope`, `remote-device`, `sdb-helper`, `sdk-check`, `sdk-commands`) were confirmed to still pass.

---

## Deployment

`tizen-cli` inlines `common/lib` into its bundle via esbuild, so a rebuild picks the change up automatically.

```bash
cd tizen-cli
pnpm build     # regenerates dist/tizen-sdk.js (dist/ is gitignored)
```

To deploy to the Cline / Claude plugin caches, use the setup script:

```bash
bash cline/setup/setup.sh
```

Affected locations:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/
~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/
~/.cline/skills/tizen-build-project/SKILL.md
```

---

## Known Limitation

`execPluginScript()` **discards stderr on a successful exit (exit 0)**.

The build script sends most of its own logging to stderr, so on the "exit 0 but no artifact" path that script stderr does not reach the diagnostics.

GBS **always exits non-zero** when a build fails, so this does not affect the problem addressed here (GBS compile errors). `execPluginScript()` is a helper shared by every domain, so it was left unchanged in this scope.

---

## Related Change: `tizen-create-project` Scope Fix

**Commit:** `52957cb` (PR #93, merged)

A separate problem fixed in the same session: asking only to create an app made the agent continue into build, certificate generation, and install.

The cause was documentation, not code. The CLI runner and envelope were clean (`project-manager-cli.js` exits after creation, and the envelope builder already strips the script's `Next steps:` guidance). What drove the chaining was the scope rule at the bottom of the skill doc reading *"Report envelope, suggest next steps"*, with `tizen-build-project` listed directly beneath it.

Changes:

- `common/skills/tizen-create-project/SKILL.md` — a `Scope — STOP after creation` section immediately after the frontmatter: on a create-only request, report the envelope and stop; do not build, generate certificates, or install; do not add those steps to a plan, todo list, or focus chain. `tizen-build-project` may be mentioned in text but never invoked.
- `tizen-cli/skills/tizen-create-project/SKILL.md` — the same rule in the Follow-ups section.

---

## Changed Files

| File | Change |
|------|--------|
| `common/lib/core/output-summary.js` | new `extractBuildDiagnostics()` |
| `common/lib/core/project.js` | diagnostics inline on both failure paths, new `formatBuildFailureMessage()` |
| `common/lib/envelope/envelope.js` | pass `details` through |
| `common/lib/envelope/response-formatter.js` | `formatError()` sixth parameter `details` |
| `common/lib/cli/project-manager-cli.js` | header comment updated |
| `common/lib/tests/output-summary.test.js` | new (17 assertions) |
| `common/skills/tizen-build-project/SKILL.md` | failure-triage rules |

7 files, +311 / -13
