---
name: tizen-certificate-manager
description: Manage Tizen certificates (local self-signed and Samsung online-CA) and signing profiles, including generation, Samsung Account login, distributor selection, profile lifecycle, import, and inspection.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
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

# Tizen Certificate Manager

## When to use
Use this skill to manage Tizen certificates and signing profiles: generate or import certificates,
select bundled distributor assets, manage profile lifecycle, and inspect certificate metadata.

Two distinct kinds of author certificate are supported, and they are not interchangeable:

- **Local Tizen** (`generate-author`) — self-signed, offline, no account. Issued by
  `Tizen Developers CA`. Written to `<tizen-sdk-data>/keystore/author/`. On some SDK versions
  `tz cert` writes the `.p12` but not the companion `.pwd` password sidecar; the command writes the
  sidecar itself when that happens and reports `result.pwd_file_created: true` plus a warning (#75).
  If the write was denied (e.g. a sandbox blocking `<tizen-sdk-data>`), re-run `generate-author`
  with escalated permissions — the existing `.p12` is kept and only the sidecar is added.
- **Samsung online-CA** (`generate-samsung-author`) — issued by Samsung's CA, requires a Samsung
  Account browser login. Issued by `Samsung VD Author CA`. Written to
  `<tizen-sdk-data>/keystore/samsung/<profileName>/`.

When the user asks for a **Samsung** certificate, use `generate-samsung-author`. Do not substitute
the local action: a local self-signed certificate cannot sign an app for Samsung distribution.

## Prerequisites
- Needs the Tizen SDK — run `tizen-cli tizen-sdk sdk-init` first if the SDK path is not
  configured.

## Password handling

Use `--prompt-password` for `--password`, or the matching `--prompt-author-password`, `--prompt-distributor-password`, or `--prompt-distributor2-password` flag when the command has an interactive TTY. For non-interactive Claude Code Bash tool calls, offer the user a choice: run the interactive command personally, or use a protected password file. For the manual choice, give one copy-paste-ready `!`/terminal command with the resolved CLI path and all known non-secret arguments filled in; never include placeholders. For the file choice, offer to create the empty template and ask for the user's preferred absolute location. If approved, create and restrict access to a file containing only `TIZEN_CERTIFICATE_PASSWORD=`; the user enters the password locally after `=`, saves it, and says only that it is ready. Then use `--password-file <path>`. Once the user has filled the file, it is their responsibility: the agent must never read, inspect, edit, overwrite, or otherwise modify it. If the CLI reports a format error, tell the user the expected one-line variable format and wait for them to correct it locally. The corresponding author/distributor/distributor2 forms are `--author-password-file`, `--distributor-password-file`, and `--distributor2-password-file`, using `TIZEN_AUTHOR_CERTIFICATE_PASSWORD`, `TIZEN_DISTRIBUTOR_CERTIFICATE_PASSWORD`, and `TIZEN_DISTRIBUTOR2_CERTIFICATE_PASSWORD`. Never put the secret in chat or a command argument — even when the user already typed the password in the request: say once that it is now in the transcript and suggest a different one, offer both choices (interactive command / password file) and let the user pick, and use only the non-secret values from the prompt. This is intended behavior (issue #99).

## Command

```bash
# Create an author certificate
tizen-cli tizen-sdk certificate-manager [--action generate-author] --name <name> --password <password> [--file <fileName>] [--email <email>] [--department <dept>] [--organization <org>] [--city <city>] [--state <state>] [--country <country>]

# List SDK-bundled distributor certificates
tizen-cli tizen-sdk certificate-manager --action list-distributors [--type public|partner|platform] [--version legacy|new]

# In tizen-cli, prefer --distributor-version to avoid its global --version flag:
tizen-cli tizen-sdk certificate-manager --action list-distributors --type public --distributor-version new

# Create a signing profile
tizen-cli tizen-sdk certificate-manager --action create-profile --profile-name <name> --author-cert <path> --author-password <password> [--distributor-type public|partner|platform] [--distributor-version legacy|new] [--active]

# List signing profiles
tizen-cli tizen-sdk certificate-manager --action list-profiles

# Set the active signing profile
tizen-cli tizen-sdk certificate-manager --action set-active-profile --profile-name <name>

# Remove a signing profile
tizen-cli tizen-sdk certificate-manager --action remove-profile --profile-name <name>

# Add or replace distributor key 2
tizen-cli tizen-sdk certificate-manager --action set-distributor2 --profile-name <name> \
  --author-password <password> --distributor2-type partner --distributor2-version new

# Import a certificate
tizen-cli tizen-sdk certificate-manager --action import-certificate --source <path> \
  --password <password> --certificate-type author --target-file <name>

# Inspect certificate metadata
tizen-cli tizen-sdk certificate-manager --action inspect-certificate \
  --certificate <path> [--password <password>]

# Resolve certificate-manager SDK paths
tizen-cli tizen-sdk certificate-manager --action get-sdk-data-path

# Create a Samsung online-CA author certificate (opens the browser for Samsung Account login)
tizen-cli tizen-sdk certificate-manager --action generate-samsung-author --profile-name <name> --identity <identity> --password <password> [--department <dept>] [--organization <org>] [--city <city>] [--state <state>] [--country <country>]

# Create a Samsung online-CA distributor certificate (requires DUIDs)
tizen-cli tizen-sdk certificate-manager --action generate-samsung-distributor --profile-name <name> --password <password> --duid-list <duids> [--duid-file <path>] [--privilege Public|Partner]

# Import an existing Samsung .p12 certificate
tizen-cli tizen-sdk certificate-manager --action import-samsung-certificate --profile-name <name> --source <path> --password <password> [--certificate-type author|distributor] [--overwrite]

# Create a Samsung signing profile (uses Samsung-issued author + distributor certs)
tizen-cli tizen-sdk certificate-manager --action create-samsung-profile --profile-name <name> [--privilege Public|Partner] [--author-password <password>] [--distributor-password <password>] [--active]

# Cancel an in-progress Samsung certificate generation
tizen-cli tizen-sdk certificate-manager --action cancel-samsung-cert

# Samsung Account login only (caches the token for a profile)
tizen-cli tizen-sdk certificate-manager --action samsung-login --profile-name <name>

# Reveal the stored password for a Samsung profile
tizen-cli tizen-sdk certificate-manager --action samsung-reveal-password --profile-name <name>

# DUID utilities
tizen-cli tizen-sdk certificate-manager --action parse-duids --duid-list <duids>
tizen-cli tizen-sdk certificate-manager --action import-duids --duid-file <path>
tizen-cli tizen-sdk certificate-manager --action acquire-duid [--serial <serial>]
tizen-cli tizen-sdk certificate-manager --action acquire-duids-all
```

### Samsung online-CA notes

- `--identity` is required and becomes the certificate `CN`. `--name`/`--file` are for
  `generate-author` and are ignored here.
- **Browser login is expected.** The command opens the system browser and blocks until login
  completes, up to a 5-minute timeout. Do not treat the pause as a hang, and do not fall back to a
  local certificate. A cached, still-valid token is reused without prompting. On timeout the envelope
  reports `samsung_auth_timeout` — ask the user to retry and finish the login.
- The password is stored **encrypted** by the OS credential store as `author.pwd` beside
  `author.p12`. The plaintext `.pwd` sidecar that `generate-author` writes (see "When to use") must
  **not** be recreated by hand for a Samsung profile — overwriting that file with plaintext corrupts
  the stored password. Use `samsung-reveal-password` to read it back.
- Never overwrites: an existing `author.p12` for that profile name returns `cert_already_exists`.
- Verify success by checking `result.cert_path` is under `keystore/samsung/` and that the envelope
  contains `user_id` / `auth_source`.
- **Complete Samsung profile workflow:** Both Samsung author **and** distributor certificates are
  supported. A complete Samsung signing profile requires both:
  1. `generate-samsung-author` — creates `author.p12` + `author.pwd`
  2. `acquire-duid` or `acquire-duids-all` — get DUIDs from connected device(s)
  3. `generate-samsung-distributor` — creates `distributor.p12` + `distributor.pwd` using the DUIDs
  4. `create-samsung-profile` — registers the signing profile with `tz security-profiles add`
  Alternatively, use `import-samsung-certificate` to import existing Samsung `.p12` files, then
  `create-samsung-profile`. Never pair a Samsung author certificate with a bundled Tizen distributor
  certificate — always use `create-samsung-profile` (not `create-profile`) for Samsung profiles.

| Option | Required | Default | Description |
|---|---|---|---|
| `--action` | no | `generate-author` | Certificate/profile action; see command list above for all actions |
| `--name` | generate-author | — | Author's name (local `generate-author` only) |
| `--identity` | generate-samsung-author | — | Author identity, becomes the certificate `CN` |
| `--password` | **yes** | — | Certificate password — at least 8 characters, with an uppercase letter, a lowercase letter, and a digit |
| `--file` | no | sanitized `--name` | Output file name without extension |
| `--email` | no | — | Author's email |
| `--department` | no | — | Author's department |
| `--organization` | no | — | Author's organization |
| `--city` | no | — | Author's city |
| `--state` | no | — | Author's state |
| `--country` | no | — | Author's country |
| `--type` | no | all | Distributor certificate type for `list-distributors`: `public`, `partner`, or `platform` |
| `--version` | no | all | Distributor certificate version for `list-distributors`: `legacy` or `new` |
| `--profile-name` | Samsung cert / profile actions | — | Signing profile name |
| `--author-cert` | create-profile | — | Existing author `.p12` |
| `--author-password` | create-profile / create-samsung-profile | — | Author certificate password |
| `--distributor-type` | no | `public` | Bundled distributor type |
| `--distributor-version` | no | `new` | Bundled distributor version |
| `--distributor-password` | no | — | Distributor cert password (create-samsung-profile) |
| `--duid-list` | generate-samsung-distributor | — | Comma/newline separated DUIDs |
| `--duid-file` | no | — | File containing DUIDs (import-duids / generate-samsung-distributor) |
| `--privilege` | no | `Public` | `Public` or `Partner` (generate-samsung-distributor / create-samsung-profile) |
| `--source` | import-samsung-certificate | — | Path to existing `.p12` file |
| `--certificate-type` | no | `author` | `author` or `distributor` (import-samsung-certificate) |
| `--overwrite` | no | false | Overwrite existing certificate (import-samsung-certificate) |
| `--serial` | no | first device | Device serial for `acquire-duid` |
| `--active` | no | false | Set the created profile active |

## Output
- Success `result`: `name`, `file_name`, `cert_path` (the generated `.p12`), `pwd_path` (the
  expected `.pwd` sidecar path), `pwd_file_exists` (whether `tz cert` actually wrote one).

  `cert_path` is never hardcoded — it is derived at runtime: `<sdk-root>` comes from whatever path
  is stored in `~/.tizen.sdk.path.config` (written by `tizen-sdk-init`), and the SDK data directory
  comes from `TIZEN_SDK_DATA_PATH` in `<sdk-root>/sdk.info`. The certificate is written to
  `<sdk-data>/keystore/author/<fileName>.p12` — always read the actual `result.cert_path` from the
  envelope rather than assuming a location.
- A generated certificate is a **standalone author key** until it is attached with
  `create-profile`; `tizen-cli tizen-sdk build-project --sign-profile <profile>` requires that
  signing profile.
- Failure `cert_password_invalid`: password too weak — ask for one with 8+ chars, an uppercase
  letter, a lowercase letter, and a digit.
- Failure `cert_already_exists`: the target author `.p12` already exists. Do not overwrite or
  delete it automatically; use `list-profiles` to check references, then reuse it with
  `create-profile` or retry `generate-author` with a unique `--file`.
- Failure `cert_generation_failed`: `tz cert` did not produce the expected file — the message
  includes `tz`'s stdout/stderr verbatim.
- Failure `sdk_path_not_set`: run `tizen-cli tizen-sdk sdk-init` first.

- `list-distributors` success `result`: `sdk_root`, `distributors`, and `unavailable`.
  Each distributor entry has `type`, `version`, `ca_path`, and `signer_path`. The command checks
  assets under the configured `<sdk-root>` and returns only pairs where both files exist. Missing
  pairs appear in `unavailable`; an explicitly requested pair that does not exist returns
  `distributor_asset_not_found`.

- `create-profile` success `result`: `profile_name`, `active`, `profiles_xml`,
  `author_cert_path`, `distributor`, and optional `distributor2`.
- `list-profiles` success `result`: `profiles_xml`, `active_profile`, and password-free
  `profiles[]` entries. Each configured author/distributor path has a status; use
  `certificate_files_available` and `unavailable_certificate_paths` to identify stale or
  unreadable references instead of treating XML paths as available certificates.

## Examples

```bash
# Generate a local Tizen author certificate
tizen-cli tizen-sdk certificate-manager --name "Jane Dev" --password "<password>"

# With a specific output file name and optional metadata
tizen-cli tizen-sdk certificate-manager --name "Jane Dev" --password "<password>" \
  --file jane-dev --email jane@example.com --organization Acme --department Mobile \
  --city Seoul --state Seoul --country KR

# List all bundled distributor certificates
tizen-cli tizen-sdk certificate-manager --action list-distributors

# Select one available distributor type/version pair
tizen-cli tizen-sdk certificate-manager --action list-distributors --type public --version=new

# Create a signing profile
tizen-cli tizen-sdk certificate-manager --action create-profile --profile-name MyProfile \
  --author-cert "<author-p12>" --author-password "<author-password>"
```

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
- SDK not installed → `tizen-cli tizen-sdk sdk-install`, then `sdk-init`
- Samsung certificate requested → `--action generate-samsung-author` (see Samsung notes above)
- Samsung distributor certificate requested → `--action generate-samsung-distributor` (requires
  DUIDs — use `acquire-duid` or `acquire-duids-all` to get them from connected devices)
- Complete Samsung profile needed → run `generate-samsung-author` → `generate-samsung-distributor` →
  `create-samsung-profile` (or use `import-samsung-certificate` for existing `.p12` files)
- Cancel in-progress Samsung cert generation → `--action cancel-samsung-cert`
