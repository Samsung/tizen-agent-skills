---
name: tizen-certificate-manager
description: Manage Tizen certificates (local self-signed and Samsung online-CA) and signing profiles, including generation, Samsung Account login, distributor selection, profile lifecycle, import, and inspection.
metadata:
  author: Samsung Electronics
  last-updated: "2026-08-04"
  keywords:
    - Tizen certificate
    - author certificate
    - tz cert
    - 인증서 생성
    - 타이젠 인증서
    - signing certificate
    - distributor certificate
    - 배포자 인증서
    - Samsung certificate
    - Samsung online-CA
    - Samsung author certificate
    - 삼성 인증서
    - Samsung Account login
---

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runner" 섹션으로 가세요.

1. Agent tool로 `tizen-certificate-manager` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-certificate-manager`)
2. 사용자의 요청을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

## Password handling — mandatory

Never ask a user to type, select, paste, or confirm a certificate password in Cline/Claude chat. When a certificate action needs a password, ask only for non-secret fields.

**If the user already wrote the password in the prompt** (e.g. "…with password Passw0rd1"), the rules do not relax: never forward it as `--password`, never write it into a file for them, and never echo it back. This is expected behavior, not a malfunction (issue #99). Do this instead, in order: (1) say in one sentence that the password is now in the chat transcript and recommend choosing a different one for the certificate; (2) present **both** choices below and let the user pick — do not jump straight to creating a password-file template; (3) proceed with the chosen option using only the non-secret values (name, file name, e-mail, …) from the prompt.

**Cline:** run the CLI with the matching hidden-terminal flag and wait for the user to enter it in the terminal.

**Claude Code:** its Bash tool and sub-agents have no interactive TTY. After collecting all non-secret inputs, offer exactly these two choices before running a password-protected action:

1. **Run a command personally.** Give the user one complete copy-paste-ready command with the actual resolved CLI path and every known non-secret value already filled in. Use the matching `--prompt-...` flag. Do **not** give the user `<name>`, `<path>`, `<file>`, or any other placeholder to fill in. Tell them to prefix that exact command with `!` in Claude Code, or run it in another terminal; they press Enter, type the hidden password, and the command completes.
2. **Use a protected environment file.** Ask: **“Would you like me to create an empty protected password-file template? If yes, what absolute file location do you prefer?”** If the user agrees, create and lock down the file at that exact location with the required variable name followed by `=` and **no password**. Tell the user to open it locally, enter the password after `=`, save it, and reply only that it is ready. **Once the user says it is ready, do not read, open, inspect, edit, overwrite, or otherwise modify that file for any reason.** The agent must never read, print, or ask for the file contents. It may receive and use only the file path with the matching `--...-password-file` option.

For a normal certificate password, the agent-created template is `TIZEN_CERTIFICATE_PASSWORD=` and the final file format is `TIZEN_CERTIFICATE_PASSWORD=<password>`. On Linux/macOS, create it with `umask 077` and apply `chmod 600 <file>`; on Windows, restrict the file ACL to the current user. The matching formats are:

- `TIZEN_AUTHOR_CERTIFICATE_PASSWORD=<password>` for `--author-password-file`
- `TIZEN_DISTRIBUTOR_CERTIFICATE_PASSWORD=<password>` for `--distributor-password-file`
- `TIZEN_DISTRIBUTOR2_CERTIFICATE_PASSWORD=<password>` for `--distributor2-password-file`

**Template completion guide:** after the agent creates the template at the chosen path, the user opens it in a local editor, enters the password after `=`, saves it, and replies only that the file is ready. Do not suggest `echo`, `printf`, or a command containing the password, because those may enter shell history. Do not ask the user to paste the line or password into chat.

**Ready-file rule:** after the user fills the password, the file is the user's responsibility. Never use a Read/Edit/Write tool on it. If the CLI reports an invalid password-file format, do not inspect or repair it: tell the user the required one-line format and ask them to correct the file locally, then reply only that it is ready again.

Use only one source for each password: visible argument, hidden prompt, or password file.

Hidden-terminal flags:

- `--prompt-password` for certificate generation, import, and inspection
- `--prompt-author-password` for an author certificate in a signing profile
- `--prompt-distributor-password` for a distributor certificate
- `--prompt-distributor2-password` for distributor key 2

For a local author certificate, ask for the author name only. In Cline, run `generate-author --name <name> --prompt-password`. In Claude Code, offer the two choices above. For option 1, supply the resolved CLI path and actual author name in the command (for example, `! node "/home/alex/.claude/plugins/cache/tizen-platform/tizen-sdk-skills/1.0.0/lib/cli/cert-manager-cli.js" generate-author --name "Eden" --prompt-password`), never placeholders. For option 2, offer to create the empty template, ask for the preferred absolute location, then run `generate-author --name <name> --password-file <path>` only after the user says the locally completed file is ready. The terminal input and password-file contents must never be written to chat, command arguments, or an agent response.

### CLI Runner (Cline / Claude Code)

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*cert-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*cert-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*cert-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*cert-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\cert-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" generate-author --name "Jane Dev" --prompt-password
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" generate-author --name "Jane Dev" --prompt-password
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" generate-author --name "Jane Dev" --prompt-password
node "$CLI" list-distributors
```

### Codex CLI — Samsung online flows and password prompts (one exec call waits ≤ 30 s)

Codex's exec tool returns after at most 30 s. Local actions (`generate-author`, `list-*`,
`create-profile`, …) finish inside that. The Samsung online actions (`samsung-login`,
`generate-samsung-*`, `create-samsung-profile`, `acquire-duids-all`) are network-bound, and
`samsung-login` opens the system browser and waits **up to 5 minutes** for the human. **The
browser login works under Codex** — as a detached, escalated job (issue #76):

1. `node "$CLI" samsung-login --profile-name <p> --background` **with escalated permissions**
   (the sandbox has no network and would kill the job; inside it the runner refuses with
   `sandbox_blocked`). The receipt returns within a second.
2. Tell the user a Samsung Account browser window opened. Poll
   `node "<same lib/cli dir>/job-cli.js" wait --id <job_id>`; its `progress_tail` carries the
   line `Samsung Account login: opening the system browser … If it did not open, visit: <url>` —
   relay that URL if the user sees no window. Keep polling (≤ 25 s per call, up to 5 min) until
   `job.state` is `done`; the token is cached under `<tizen-sdk-data>/keystore/samsung/<p>/`.
3. Continue with `generate-samsung-author`, `generate-samsung-distributor`,
   `create-samsung-profile`, `acquire-duids-all` — each with `--background`, escalated, polled the
   same way; a valid cached token is reused without another login.

`--prompt-*` flags read the terminal and are refused together with `--background` — use
`--password-file` / `--*-password-file`. Never fall back to a local certificate, and do not
send the user to Tizen Studio or another harness: the flow above is the supported path.

**Codex sandbox (guard rule 12).** Run this runner — and its `--background` form — **with escalated
permissions**: it writes `profiles.xml` and keystore `.pwd` files under `<sdk>-data`, and the Samsung CA / OAuth callback need TCP sockets (the browser login is `samsung-login --background`, escalated), and Codex's default `workspace-write` sandbox blocks TCP sockets, writes
outside the workspace and (Linux) kills detached jobs when the call ends. An envelope with
`error_category: sandbox_blocked` / `sandbox_job_lost`, or a warning starting "Running inside Codex's
sandbox", means exactly that — re-run `suggested_fix.command` (the same command line, `escalate: true`)
with escalated permissions; do not retry inside the sandbox and do not fall back to raw tools.

## Actions

```
node "$CLI" generate-author --name <name> (--prompt-password|--password-file <path>) [--file <fileName>] \
  [--email <email>] [--department <dept>] [--organization <org>] \
  [--city <city>] [--state <state>] [--country <country>]

node "$CLI" list-distributors [--type public|partner|platform] [--version legacy|new]

node "$CLI" create-profile --profile-name <name> --author-cert <path> \
  (--prompt-author-password|--author-password-file <path>) [--distributor-type public|partner|platform] \
  [--distributor-version legacy|new] [--active]

node "$CLI" list-profiles [--profiles-xml <path>]
node "$CLI" set-active-profile --profile-name <name> [--profiles-xml <path>]
node "$CLI" remove-profile --profile-name <name> [--profiles-xml <path>]
node "$CLI" set-distributor2 --profile-name <name> (--prompt-author-password|--author-password-file <path>) \
  [--distributor2-type public|partner|platform] [--distributor2-version legacy|new]
node "$CLI" import-certificate --source <path> [--prompt-password] \
  [--certificate-type author|distributor] [--target-file <name>] [--overwrite]
node "$CLI" inspect-certificate --certificate <path> [--prompt-password]
node "$CLI" get-sdk-data-path

node "$CLI" generate-samsung-author --profile-name <name> --identity <identity> \
  --prompt-password [--department <dept>] [--organization <org>] \
  [--city <city>] [--state <state>] [--country <country>]

node "$CLI" generate-samsung-distributor --profile-name <name> --prompt-password \
  --duid-list <duids> [--duid-file <path>] [--privilege Public|Partner]

node "$CLI" import-samsung-certificate --profile-name <name> --source <path> \
  --prompt-password [--certificate-type author|distributor] [--overwrite]

node "$CLI" create-samsung-profile --profile-name <name> [--privilege Public|Partner] \
  [--prompt-author-password] [--prompt-distributor-password] [--active]

node "$CLI" cancel-samsung-cert

node "$CLI" samsung-login --profile-name <name>
node "$CLI" samsung-reveal-password --profile-name <name>

# DUID utilities
node "$CLI" parse-duids --duid-list <duids>
node "$CLI" import-duids --duid-file <path>
node "$CLI" acquire-duid [--serial <serial>]
node "$CLI" acquire-duids-all
```

1. **generate-author** — runs `tz cert -n <name> -p <password> -f <fileName> [...]` to create a
   local, self-signed Tizen author certificate. No network call, no Samsung account. Password must
   be at least 8 characters with an uppercase letter, a lowercase letter, and a digit — validated
   before `tz` is invoked. `--file` defaults to a sanitized version of `--name` (spaces become `-`,
   path-unsafe characters stripped) and must not already exist. On `cert_already_exists`, do not
   delete or overwrite the certificate: use `list-profiles` to check references, then reuse the
   `.p12` with `create-profile` or retry with a unique `--file`. Output `.p12` is written to
   `<tizen-sdk-data>/keystore/author/<fileName>.p12` regardless of current working directory.
2. **list-distributors** — resolves the SDK's **bundled, pre-built** distributor CA + signer `.p12`
   paths. Nothing is generated, no `tz` call — a pure filesystem read under
   `<sdk-root>/tools/certificate-generator/certificates/distributor/sdk-<type>/`. `--type` is one of
   `public`/`partner`/`platform`; `--version` is `legacy`/`new`. Omit either/both to list all
   matching combos. Not every combo is guaranteed to exist (e.g. `platform` typically has no
   `legacy` variant) — checked via real file existence, not a hardcoded matrix. If both `--type`
   and `--version` are given and that exact combo doesn't exist, returns a
   `distributor_asset_not_found` failure instead of an empty success.
3. **create-profile** — initializes the dynamic SDK-data `profiles.xml` when needed and wraps
   `tz security-profiles add`. It combines an existing author `.p12` with the selected bundled
   distributor certificate (default `public/new`) and can optionally set the profile active.
4. **list-profiles** — lists configured profiles and returns password-free author/distributor
   certificate paths with per-path availability (`available`, `missing`, `unreadable`, or
   `not_file`). Treat `certificate_files_available: false` and
   `unavailable_certificate_paths` as stale/incomplete profile state; do not describe those
   paths as available certificates.
5. **set-active-profile** — sets one existing signing profile active.
6. **remove-profile** — removes one existing profile and reports the remaining profile names.
7. **set-distributor2** — adds or replaces bundled distributor key 2 through a verified temporary
   profiles.xml transaction; the original is replaced only after `tz` succeeds.
8. **import-certificate** — validates `.p12`/`.cer` using the SDK JDK's `keytool`, then copies it
   into the dynamically resolved SDK-data keystore. Existing files require `--overwrite`.
9. **inspect-certificate** — reports parsed X.509 metadata and fingerprints using SDK `keytool`;
   `.p12` requires its password while `.cer` does not.
10. **get-sdk-data-path** — returns all dynamically resolved certificate-manager base paths.

### Samsung online-CA certificates

These are **supported**. They are a different thing from `generate-author`: the certificate is issued
by Samsung's online CA, requires a Samsung Account, and lands under
`<tizen-sdk-data>/keystore/samsung/<profileName>/` — never under `keystore/author/`.

11. **generate-samsung-author** — generates an RSA key pair and PKCS#10 CSR with OpenSSL, obtains a
    Samsung Account access token (opens the system browser for login; reuses a cached token while it
    is still valid), submits the CSR to Samsung `/apis/v3/authors`, and packages the returned
    certificate plus the bundled Samsung VD Author CA into
    `<tizen-sdk-data>/keystore/samsung/<profileName>/author.p12`. The password is stored encrypted
    via the OS credential store as `author.pwd` in the same directory — the flow writes this file
    itself, so the `.pwd` workaround below does **not** apply. Password rules match
    `generate-author`. Requires `--identity` (becomes the certificate `CN`). Never overwrites: an
    existing `author.p12` for that profile name returns `cert_already_exists`.
12. **generate-samsung-distributor** — generates an RSA key pair and a distributor CSR that includes
    DUIDs as subjectAltName URN entries, obtains a Samsung Account access token, submits the CSR to
    Samsung `/apis/v1/distributors` (and `/apis/v3/distributors` for VD mode), and packages the
    returned certificate plus the appropriate Samsung VD CA (public2 or partner2 based on privilege)
    into `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.p12`. Requires `--duid-list`
    (comma/newline separated DUIDs) or `--duid-file` (path to a file containing DUIDs). `--privilege`
    defaults to `Public`; use `Partner` for partner-level distribution. Password rules match
    `generate-author`. Never overwrites: an existing `distributor.p12` returns `cert_already_exists`.
13. **import-samsung-certificate** — imports an existing Samsung-issued `.p12` file (author or
    distributor) into a Samsung profile directory. Validates the file with SDK `keytool` before
    copying. Stores the password via OS-level secure storage. Use `--certificate-type` to specify
    `author` (default) or `distributor`. Use `--overwrite` to replace an existing certificate.
14. **create-samsung-profile** — creates a signing profile that uses Samsung-issued `author.p12`
    and `distributor.p12` (instead of bundled SDK distributor certs) via `tz security-profiles add`.
    Passwords are decrypted from OS-level secure storage (`.pwd` files) unless `--author-password`
    or `--distributor-password` is provided. Requires that `generate-samsung-author` and
    `generate-samsung-distributor` (or `import-samsung-certificate`) have been run first for the
    profile. Use `--active` to set the profile as active.
15. **cancel-samsung-cert** — aborts any active Samsung Account OAuth authentication flow, closing
    the callback server and clearing the timeout. Use when the user wants to cancel an in-progress
    `generate-samsung-author` or `generate-samsung-distributor` that is waiting for browser login.
16. **samsung-login** — performs only the Samsung Account login and caches the token for a profile.
    Useful to verify credentials separately from certificate generation.
17. **samsung-reveal-password** — decrypts and returns the stored password for a Samsung profile.

### DUID utilities

18. **parse-duids** — parses and normalizes a raw DUID string (comma/newline/whitespace separated):
    trims, uppercases, deduplicates, validates, and caps at 50 entries. Returns `{ duids, skipped,
    truncated }` — `skipped` lists invalid entries, `truncated` is `true` if the 50-DUID cap was hit.
19. **import-duids** — reads a file and parses its contents as DUIDs (same normalization as
    `parse-duids`). Returns the same `{ duids, skipped, truncated }` structure.
20. **acquire-duid** — uses `sdb capability` to extract the DUID from a connected Tizen device. If
    `--serial` is omitted, uses the first connected device. Returns `{ duid, serial, deviceName }`.
21. **acquire-duids-all** — iterates all connected Tizen devices and extracts DUIDs from each.
    Returns `{ duids: [{ duid, serial, deviceName }], errors: [{ serial, error }] }`.

**Do not substitute `generate-author` when the user asks for a Samsung certificate.** A local
self-signed Tizen certificate cannot sign an app for Samsung distribution: it is issued by
`Tizen Developers CA`, not `Samsung VD Author CA`. If the user asks for a Samsung certificate, run
`generate-samsung-author`. Confirm the result by checking that `result.cert_path` is under
`keystore/samsung/` and that the envelope contains `user_id` / `auth_source`.

**Browser login is expected.** `generate-samsung-author`, `generate-samsung-distributor`, and
`samsung-login` open the system browser and block until the user completes Samsung Account login, up
to a 5-minute timeout. This is normal — do not treat the pause as a hang, and do not fall back to a
local certificate. On timeout the envelope reports `samsung_auth_timeout`; tell the user to retry and
finish the browser login. Use `cancel-samsung-cert` to abort an in-progress login.

**Complete Samsung profile workflow:** A complete Samsung signing profile requires both an author
and a distributor certificate. The typical workflow is:
1. `generate-samsung-author` — creates `author.p12` + `author.pwd`
2. `acquire-duid` or `acquire-duids-all` — get DUIDs from connected device(s)
3. `generate-samsung-distributor` — creates `distributor.p12` + `distributor.pwd` using the DUIDs
4. `create-samsung-profile` — registers the signing profile with `tz security-profiles add`

Alternatively, if the user already has Samsung-issued `.p12` files (e.g., from Tizen Studio), use
`import-samsung-certificate` for each, then `create-samsung-profile`. Never pair a Samsung author
certificate with a bundled Tizen distributor certificate — always use `create-samsung-profile`
(not `create-profile`) for Samsung profiles.

Exit code: `0` = success envelope, `1` = failure/error envelope (JSON on stdout).

**Success result (generate-author):** `result.cert_path` = the generated `.p12` path,
`result.pwd_path` = the expected `.pwd` sidecar path, `result.pwd_file_exists` = whether `tz cert`
wrote it. This certificate is a **standalone author key** until it is attached with
`create-profile`; `tz build -s <profile>` requires that signing profile.

**Success result (list-distributors):** `result.sdk_root` = the resolved SDK root,
`result.distributors` = `[{ type, version, ca_path, signer_path }]` for every combo that exists on
disk, `result.unavailable` = `[{ type, version }]` for combos that were checked but don't exist
(informational, not an error) — narrower when `--type`/`--version` filters were given.

**Where files are written/read:** `<tizen-sdk-data>/keystore/author/<fileName>.p12` and
`<sdk-root>/tools/certificate-generator/certificates/distributor/...` — but neither
`<tizen-sdk-data>` nor `<sdk-root>` is ever a fixed or hardcoded path. Both are resolved dynamically
at runtime: `<sdk-root>` comes from whatever path is stored in `~/.tizen.sdk.path.config` (written by
`tizen-sdk-init`) — **not** from any `TIZEN_SDK_PATH` / `TIZEN_SDK_ROOT` environment variable — and
`<tizen-sdk-data>` comes from `TIZEN_SDK_DATA_PATH` in `<sdk-root>/sdk.info`. This can resolve to any
drive or directory layout depending entirely on how the specific user installed the SDK — always
read `result.cert_path` / `result.sdk_root` / `result.distributors[].ca_path` from the envelope
rather than assuming a location.

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

- **Single-task** (e.g., "타이젠 인증서 만들어줘") → DONE. Report envelope, mention `result.cert_path`.
- **Single-task** (e.g., "배포자 인증서 목록 보여줘") → DONE. Report `result.distributors`
  (and `result.unavailable` if relevant).
- **Single-task** (e.g., "삼성 인증서 만들어줘", "create a Samsung certificate") → `generate-samsung-author`.
  Report `result.cert_path` (under `keystore/samsung/`) and `result.user_email`.
- SDK not installed → `tizen-sdk-install`, then `tizen-sdk-init`

## The `.pwd` password sidecar (`generate-author`)

**Applies to `generate-author` only — never to `generate-samsung-author`.**

On some SDK versions `tz cert` generates the `.p12` author certificate but **does not** create
the companion `.pwd` file (the password sidecar). Without it, `tz security-profiles add` and
`tz build -s <profile>` cannot resolve the author password and packaging fails with an opaque
decryption error (issue #75). The runner now **writes the sidecar itself** when `tz cert` did
not (plain text, mode 600, same content the old manual step wrote) and reports
`result.pwd_file_created: true` plus a warning; `result.pwd_file_exists` is true either way.
Nothing to do by hand.

If the write itself failed (a `warnings` entry says so — typically Codex's sandbox denying
writes under `<tizen-sdk-data>`), re-run `generate-author` **with escalated permissions**; the
existing `.p12` is detected and only the sidecar is added. Restoring it manually is still
possible with the same password:

```bash
echo -n '<password>' > "<tizen-sdk-data>/keystore/author/<fileName>.pwd"
chmod 600 "<tizen-sdk-data>/keystore/author/<fileName>.pwd"
```

The build pre-check (`tizen-build-project`) now refuses to package with a profile whose author
`.p12` has neither a `.pwd` sidecar nor a password stored in `profiles.xml`
(`signing_profile_invalid`, message names the missing file) instead of failing inside `tz`.

Do **not** apply this to a Samsung profile. `generate-samsung-author` writes its own `author.pwd`
containing an OS-encrypted blob, not plaintext; overwriting it with `echo` would corrupt the stored
password. Use `samsung-reveal-password` to check a Samsung profile's password instead.
