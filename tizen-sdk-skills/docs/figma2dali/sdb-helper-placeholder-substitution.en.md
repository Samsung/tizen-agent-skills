# sdb-helper Placeholder Substitution Fix

English | [한국어](sdb-helper-placeholder-substitution.md)

**Version:** 0.1.0  
**Author:** Samsung Electronics  
**Published:** 2026-08-02  
**License:** Apache License 2.0 ([LICENSE](../../LICENSE))  
**Target:** `common/lib/core/sdb-helper.js`

---

## Overview

Two separate defects existed in how `sdb-helper` extracts values from a natural-language request and assembles the sdb command.

1. **Command truncation** — the shell-command extraction regex ate the front of the command, so **a different command than the one requested ran on the device**
2. **Unsubstituted placeholders** — `<APPID>`, `<PKGID>`, `<port>`, `<KEYNAME>`, and `<ip>` were emitted verbatim, and most of those intents are ungated, so they **executed as-is**

Both share the same shape: no error is raised, and the wrong command runs silently.

---

## Bug 1 — `<CMD>` extraction truncated the command

### Cause

The keyword-stripping regex in `extractShellCommand()`:

```js
cmd = cmd.replace(/^(shell|command)\s*/i, "");
```

Two problems compounded:

- **No word boundary** — nothing requires `shell` to be a complete word.
- **`\s*` permits zero whitespace** — the keyword matches even with no space after it.

Together they stripped the **prefix of any word beginning with** `shell` or `command`. The loop runs three times, so after the first pass correctly removed `shell `, the second pass began eating the command itself.

### Symptoms

| Request | Command actually executed |
|---------|---------------------------|
| `shell shellcheck script.sh` | `check script.sh` |
| `run shell commander --list` | `er --list` |
| `shell command commands.txt` | `s.txt` |

The `shell-command` intent is `gated: false`, so **the mangled command ran on the device without any confirmation step**. The danger is that the result is sometimes another *valid* command rather than a syntax error, so it fails silently.

### Fix

```js
cmd = cmd.replace(/^(shell|command)(\s+|$)/i, "");
```

The keyword is stripped **only when it is a whole word**. `(\s+|$)` requires either following whitespace or end-of-string, so the `shell` inside `shellcheck` no longer matches. Repeated keywords such as `shell shell ls` still work as before.

> Note: the earlier `/^(run|execute)\s+/i` already required `\s+` (one or more), so it never had this problem — `running` was never truncated.

---

## Bug 2 — Placeholders were never substituted

### Cause

Several intents in `buildCommand()` returned a placeholder string instead of extracting the value:

```js
case "launch":
  return { command: `${s} shell app_launcher -s "<APPID>"` };
case "package-info":
  return { command: `${s} shell pkginfo --pkg "<PKGID>"` };
```

Only `<CMD>` (the shell command) was handled, by `extractShellCommand()`. **For every other value of the same kind, no extraction logic existed at all.**

### Symptoms

The value is plainly present in the request and still ignored.

| Request | Assembled command | Executed? |
|---------|-------------------|-----------|
| `launch app org.tizen.dali-demo` | `sdb shell app_launcher -s "<APPID>"` | **yes** |
| `package info org.tizen.foo` | `sdb shell pkginfo --pkg "<PKGID>"` | **yes** |
| `forward port` | `sdb forward tcp:<port> tcp:<port>` | **yes** |
| `sendkey home` | `sdb shell sendkey <KEYNAME>` | **yes** |
| `connect to localhost` | `sdb connect <ip>:26101` | **yes** |
| `disconnect` | `sdb disconnect <ip>:26101` | **yes** |
| `kill app org.example.myapp` | `sdb shell app_launcher -k "<APPID>"` | gated (shown only) |
| `remove forward 8080` | `sdb forward --remove tcp:<port>` | gated (shown only) |

Even the gated intents were affected: **the command presented for confirmation was already broken**, so approving it simply failed.

As a side effect, the `connect` intent regex admits `localhost` (`/\bconnect\b.*\b(\d+\.\d+\.\d+\.\d+|localhost)\b/i`) while `buildCommand()` handled only IPv4 — so a `localhost` request always leaked `<ip>`.

### Fix

Four extraction helpers were added and wired into the intents.

| Helper | Intents | Behavior |
|--------|---------|----------|
| `extractAppId()` | launch, kill, package-info | Extracts dotted identifiers (`org.tizen.dali-demo`). The first segment must **start with a letter**, which automatically excludes IPv4 addresses and `emulator-26101`-style serials |
| `extractKeyName()` | sendkey | Accepts a `KEY_*` token or a known alias (`home`, `back`, `menu`, `power`, `enter`, arrows, volume) — nothing else |
| `extractPorts()` | forward-add, forward-remove | **Removes serial and IP digits first**, then scans for ports. Two ports are treated as host/device |
| `extractHostPort()` | connect, disconnect | IPv4 plus **`localhost`**. Port defaults to 26101 |

### Nothing runs when the value is missing

On extraction failure, `missingValue()` returns an **empty command plus a note**. `executeSdb()` sees the empty command, executes nothing, and returns an `invalid_parameters` envelope.

```
launch the app
  → (not executed) Could not find an app ID in the request.
    Include it, e.g. 'launch app org.tizen.dali-demo'.
```

Telling the caller what is missing is safer than guessing and running. This matters most for `sendkey`: sending the wrong key event is not recoverable, so words outside the alias list are never guessed at.

### The dropped `note`

The error path in `executeSdb()` ignored `cmdInfo.note`:

```js
// before — gives no clue what was missing
`Could not build sdb command for intent: ${intent.id}`
```

This meant **even the previously-working `shell-command` guidance was being discarded**. The note is now included in the message.

### `disconnect` special case

A bare `sdb disconnect` is **valid sdb behavior** — it disconnects every remote device. Rather than rejecting it, the command runs and a note states the scope.

```
disconnect
  → sdb disconnect
     note: No host given — this disconnects ALL remote devices.
```

---

## Before / After

```
                                    before                            after
shell shellcheck script.sh    →  shell "check script.sh"          shell "shellcheck script.sh"
launch app org.tizen.dali-demo →  app_launcher -s "<APPID>"        app_launcher -s "org.tizen.dali-demo"
forward 8080 to 9090          →  forward tcp:8080 tcp:8080        forward tcp:8080 tcp:9090
sendkey home                  →  sendkey <KEYNAME>                sendkey KEY_HOME
connect to localhost          →  connect <ip>:26101               connect localhost:26101
launch the app                →  ran app_launcher -s "<APPID>"    not executed + guidance
```

`forward 8080 to 9090` also fixes a separate defect: the old `/(\d+)/` captured only the **first** number and used it for both ends.

---

## Tests

**File:** `common/lib/tests/sdb-helper.test.js`

```bash
cd common/lib/tests
node sdb-helper.test.js
```

32 assertions added, bringing the file to 61.

**Test 5 — word boundaries**

- `shellcheck`, `commander`, `commands.txt` are not truncated
- repeated keywords (`shell shell ls`) still handled

**Test 6 — placeholder substitution**

- correct substitution per intent (launch, kill, package-info, forward, sendkey, connect, disconnect)
- serial digits (`emulator-26101`) are not mistaken for a port
- missing values return an empty command plus a note (nothing executes)
- bare `disconnect` behavior and its warning
- **sweep check** — walks every intent and asserts no `<PLACEHOLDER>` survives

The sweep is a safety net that will catch the same mistake when new intents are added.

All seven existing test files were confirmed to still pass.

---

## Deployment

```bash
cd tizen-cli
pnpm build     # common/lib is inlined into the bundle (dist/ is gitignored)
```

Plugin cache locations:

```
~/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/core/sdb-helper.js
~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<ver>/lib/core/sdb-helper.js
```

---

## Changed Files

| File | Change |
|------|--------|
| `common/lib/core/sdb-helper.js` | word-boundary fix, four extraction helpers plus `missingValue()`, wired into seven intents, note included in the error path |
| `common/lib/tests/sdb-helper.test.js` | 32 regression assertions added |

2 files, +270 / -24

---

## Related

- [Build Failure Diagnostics Improvement](build-failure-diagnostics.en.md) — the build envelope problem fixed in the same session
