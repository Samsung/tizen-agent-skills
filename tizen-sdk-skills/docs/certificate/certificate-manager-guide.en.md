# Tizen Certificate Manager Guide

This document describes the complete certificate management capabilities of the
`tizen-sdk-skills` plugin, covering both **local Tizen (self-signed)** certificates and
**Samsung online-CA** certificates. It includes usage examples for the CLI runner
(skill/agent path) and the `tizen-cli` command interface.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Overview](#architecture-overview)
- [Local Tizen Certificates](#local-tizen-certificates)
  - [Generate an Author Certificate](#generate-an-author-certificate)
  - [List Bundled Distributor Certificates](#list-bundled-distributor-certificates)
  - [Create a Signing Profile](#create-a-signing-profile)
  - [List / Set Active / Remove Profiles](#list--set-active--remove-profiles)
  - [Set Distributor Key 2](#set-distributor-key-2)
  - [Import a Certificate](#import-a-certificate)
  - [Inspect a Certificate](#inspect-a-certificate)
  - [Get SDK Data Path](#get-sdk-data-path)
- [Samsung Online-CA Certificates](#samsung-online-ca-certificates)
  - [Generate a Samsung Author Certificate](#generate-a-samsung-author-certificate)
  - [Generate a Samsung Distributor Certificate](#generate-a-samsung-distributor-certificate)
  - [Import an Existing Samsung .p12](#import-an-existing-samsung-p12)
  - [Create a Samsung Signing Profile](#create-a-samsung-signing-profile)
  - [Cancel Samsung Cert Generation](#cancel-samsung-cert-generation)
  - [Samsung Login (Standalone)](#samsung-login-standalone)
  - [Reveal a Stored Samsung Password](#reveal-a-stored-samsung-password)
- [DUID Utilities](#duid-utilities)
  - [Parse DUIDs](#parse-duids)
  - [Import DUIDs from File](#import-duids-from-file)
  - [Acquire DUID from a Device](#acquire-duid-from-a-device)
  - [Acquire DUIDs from All Devices](#acquire-duids-from-all-devices)
- [Complete Workflows](#complete-workflows)
  - [Local Tizen Profile (End-to-End)](#local-tizen-profile-end-to-end)
  - [Samsung Profile (End-to-End)](#samsung-profile-end-to-end)
- [Error Codes Reference](#error-codes-reference)
- [File Locations](#file-locations)

---

## Prerequisites

- **Tizen SDK** installed and initialized (`tizen-sdk-install` → `tizen-sdk-init`)
- **Node.js 18+** (for the CLI runner)
- For Samsung certificates: a **Samsung Account** and a connected Tizen device (for DUIDs)
- For local certificates: no network or Samsung account needed
- For Samsung certificates behind a proxy: set `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY`
  environment variables — the Samsung API client respects standard proxy conventions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User Request                             │
│         "Create a Samsung certificate" / "인증서 만들어줘"    │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
     ┌─────────▼──────────┐   ┌──────────▼──────────┐
     │  Skill / Agent     │   │  tizen-cli          │
     │  (SKILL.md)        │   │  (certificate.ts)   │
     └─────────┬──────────┘   └──────────┬──────────┘
               │                          │
               └──────────┬───────────────┘
                          │
              ┌───────────▼────────────┐
              │  cert-manager-cli.js   │
              │  (CLI Runner)          │
              └───────────┬────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
  ┌───────▼─────┐  ┌─────▼──────┐  ┌────▼──────────┐
  │ certificate  │  │ samsung-   │  │ samsung-      │
  │ .js (local)  │  │ cert.js    │  │ auth.js       │
  └─────────────┘  └─────┬──────┘  └───────────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
      ┌───────▼──┐  ┌───▼────┐  ┌─▼──────────────┐
      │ samsung- │  │ samsung│  │ samsung-       │
      │ api.js   │  │ duid.js│  │ pwd-store.js   │
      └──────────┘  └────────┘  └────────────────┘
```

| Module | Responsibility |
|--------|---------------|
| `certificate.js` | Local Tizen author certs, bundled distributors, signing profiles |
| `samsung-cert.js` | Samsung online-CA author & distributor cert generation, import, profile creation |
| `samsung-auth.js` | Samsung Account OAuth flow (browser-based login, token caching) |
| `samsung-api.js` | HTTPS communication with Samsung's CA endpoints (with proxy support) |
| `samsung-duid.js` | DUID parsing, validation, version detection, device acquisition |
| `samsung-pwd-store.js` | OS-level secure password storage (wincrypt / security / secret-tool) |

---

## Local Tizen Certificates

Local Tizen certificates are self-signed, free, and require no network access. They are
issued by the `Tizen Developers CA` and are suitable for development and testing.

### Generate an Author Certificate

Creates a local `.p12` author certificate under `<tizen-sdk-data>/keystore/author/`.

**Password rules:** ≥ 8 characters, at least one uppercase letter, one lowercase letter,
and one digit.

#### Via CLI Runner (Skill / Agent)

```bash
# Find the CLI runner
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/cert-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done

# Basic
node "$CLI" generate-author --name "Jane Dev" --password "<password>"

# With a custom file name (avoids cert_already_exists)
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev-20260731

# With full metadata
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev \
  --email jane@example.com --organization Acme --department Mobile \
  --city Seoul --state Seoul --country KR
```

#### Via tizen-cli

```bash
tizen-cli tizen-sdk certificate-manager \
  --action generate-author \
  --name "Jane Dev" \
  --password "<password>" \
  --file jane-dev
```

> **Note:** The tizen-cli command name is `certificate-manager` (not `certificate-management`).

**Success result:**

```json
{
  "status": "success",
  "result": {
    "name": "Jane Dev",
    "file_name": "jane-dev",
    "cert_path": "<tizen-sdk-data>/keystore/author/jane-dev.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/author/jane-dev.pwd",
    "pwd_file_exists": true
  }
}
```

> **Password sidecar:** On some SDK versions `tz cert` does not create the `.pwd` sidecar file.
> The runner now writes it itself (plain text, mode 600) and reports `pwd_file_created: true`
> with a warning (issue #75). Only if that write failed (e.g. Codex's sandbox denied it — re-run
> with escalated permissions) restore it manually with the same password:
> ```bash
> echo -n '<password>' > "<tizen-sdk-data>/keystore/author/jane-dev.pwd"
> chmod 600 "<tizen-sdk-data>/keystore/author/jane-dev.pwd"
> ```

### List Bundled Distributor Certificates

Resolves the SDK's pre-built distributor CA + signer `.p12` paths. Nothing is generated —
these ship with the SDK.

```bash
# List all
node "$CLI" list-distributors

# Filter by type
node "$CLI" list-distributors --type public

# Filter by type and version
node "$CLI" list-distributors --type public --version new
```

**Types:** `public`, `partner`, `platform`
**Versions:** `legacy`, `new`

> **tizen-cli note:** In tizen-cli, prefer `--distributor-version` over `--version` to
> avoid conflict with tizen-cli's global `--version` flag:
> ```bash
> tizen-cli tizen-sdk certificate-manager --action list-distributors --type public --distributor-version new
> ```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "<sdk-root>",
    "distributors": [
      { "type": "public", "version": "new", "ca_path": "...", "signer_path": "..." }
    ],
    "unavailable": [
      { "type": "platform", "version": "legacy" }
    ]
  }
}
```

### Create a Signing Profile

Combines an existing author `.p12` with a bundled distributor certificate and registers
the profile with `tz security-profiles add`.

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --distributor-type public \
  --distributor-version new \
  --active
```

**Optional distributor 2:** Add a second distributor certificate (custom `.p12` or bundled)
during profile creation:

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --distributor2-cert /path/to/dist2.p12 \
  --distributor2-password "<distributor2-password>" \
  --distributor2-ca /path/to/dist2-ca.cer \
  --active
```

**Optional custom profiles.xml:** Use `--profiles-xml` to specify a custom profiles.xml
path (default: `<tizen-sdk-data>/profile/profiles.xml`):

```bash
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<author-p12-path>" \
  --author-password "<author-password>" \
  --profiles-xml /custom/path/to/profiles.xml
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "active": true,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "author_cert_path": "<author-p12-path>",
    "distributor": {
      "type": "public",
      "version": "new",
      "ca_path": "...",
      "signer_path": "..."
    },
    "distributor2": null
  }
}
```

### List / Set Active / Remove Profiles

```bash
node "$CLI" list-profiles
node "$CLI" set-active-profile --profile-name MyProfile
node "$CLI" remove-profile --profile-name MyProfile
```

All three accept `--profiles-xml <path>` to operate on a custom profiles.xml.

**list-profiles result:**

```json
{
  "status": "success",
  "result": {
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "active_profile": "MyProfile",
    "profiles": [
      {
        "name": "MyProfile",
        "active": true,
        "author": { "key_path": "...", "ca_path": "", "rootca_path": "" },
        "distributor": { "key_path": "...", "ca_path": "...", "rootca_path": "" },
        "distributor2": null
      }
    ]
  }
}
```

**set-active-profile result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "previous_active_profile": "OldProfile",
    "active_profile": "MyProfile",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml"
  }
}
```

**remove-profile result:**

```json
{
  "status": "success",
  "result": {
    "removed_profile": "MyProfile",
    "previous_active_profile": "MyProfile",
    "active_profile": null,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "remaining_profiles": ["OtherProfile"]
  }
}
```

### Set Distributor Key 2

Adds or replaces the second distributor certificate in an existing profile. Uses a
verified temporary profiles.xml transaction — the original is replaced only after `tz`
succeeds.

```bash
node "$CLI" set-distributor2 \
  --profile-name MyProfile \
  --author-password "<author-password>" \
  --distributor2-type partner \
  --distributor2-version new
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyProfile",
    "active": true,
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "distributor2": {
      "type": "partner",
      "version": "new",
      "ca_path": "...",
      "signer_path": "..."
    },
    "replaced": false
  }
}
```

### Import a Certificate

Validates a `.p12` or `.cer` with SDK `keytool`, then copies it into the keystore.

```bash
node "$CLI" import-certificate \
  --source /path/to/existing.p12 \
  --password "<password>" \
  --certificate-type author \
  --target-file imported-author \
  --overwrite
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "certificate_type": "author",
    "source_path": "/path/to/existing.p12",
    "imported_path": "<tizen-sdk-data>/keystore/author/imported-author.p12",
    "format": "p12",
    "overwritten": false
  }
}
```

### Inspect a Certificate

Returns subject, issuer, validity, algorithms, serial number, and fingerprints.

```bash
node "$CLI" inspect-certificate \
  --certificate /path/to/cert.p12 \
  --password "<password>"
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "certificate_path": "/path/to/cert.p12",
    "format": "p12",
    "metadata": {
      "alias": "author",
      "entry_type": "PrivateKeyEntry",
      "certificate_chain_length": 1,
      "subject": "CN=Jane Dev, O=Acme, C=KR",
      "issuer": "CN=Tizen Developers CA",
      "serial_number": "1",
      "valid_from": "Mon Jan 01 00:00:00 KST 2024",
      "valid_until": "Thu Dec 31 23:59:59 KST 2026",
      "signature_algorithm": "SHA256withRSA",
      "public_key_algorithm": "RSA",
      "version": "3",
      "fingerprints": {
        "md5": "AB:CD:...",
        "sha1": "AB:CD:...",
        "sha256": "AB:CD:..."
      }
    }
  }
}
```

### Get SDK Data Path

Returns all dynamically resolved certificate-manager base paths.

```bash
node "$CLI" get-sdk-data-path
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "sdk_root": "<sdk-root>",
    "sdk_data_path": "<tizen-sdk-data>",
    "sdk_info_path": "<sdk-root>/sdk.info",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "author_keystore": "<tizen-sdk-data>/keystore/author"
  }
}
```

---

## Samsung Online-CA Certificates

Samsung online-CA certificates are issued by Samsung's certificate authority. They require
a Samsung Account login (browser-based OAuth) and are stored under
`<tizen-sdk-data>/keystore/samsung/<profileName>/`.

> **Do not substitute `generate-author` for Samsung certificates.** A local self-signed
> Tizen certificate cannot sign an app for Samsung distribution.

### Generate a Samsung Author Certificate

1. Generates an RSA key pair and PKCS#10 CSR with OpenSSL
2. Opens the system browser for Samsung Account login (5-minute timeout)
3. Submits the CSR to Samsung `/apis/v3/authors`
4. Packages the signed certificate + Samsung VD Author CA into `author.p12`
5. Stores the password via OS-level secure storage as `author.pwd`

```bash
node "$CLI" generate-samsung-author \
  --profile-name MySamsungProfile \
  --identity "Your Name" \
  --password "<password>" \
  --organization "Company" \
  --department "Mobile" \
  --city "Seoul" \
  --state "Seoul" \
  --country "KR"
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "identity": "Your Name",
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "sdk_data_path": "<tizen-sdk-data>",
    "auth_source": "oauth-login",
    "user_id": "...",
    "user_email": "you@example.com"
  }
}
```

> **Browser login is expected.** The command blocks until the user completes Samsung
> Account login. A cached valid token is reused without prompting. Use `cancel-samsung-cert`
> to abort an in-progress login.

### Generate a Samsung Distributor Certificate

1. Generates an RSA key pair and a distributor CSR with DUIDs as `subjectAltName` URN entries
2. Obtains a Samsung Account access token (reuses cache if valid)
3. Submits the CSR to Samsung `/apis/v1/distributors` (primary distributor certificate)
4. In VD mode (always enabled), also submits to `/apis/v3/distributors` for an additional VD certificate
5. Packages the result + appropriate Samsung VD CA (public2 or partner2) into `distributor.p12`
6. Stores the password via OS-level secure storage as `distributor.pwd`
7. Deletes the cached `samsung-auth-data.json` after successful generation

```bash
# With inline DUID list
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-list "1.0#DEV001,2.0#DEV002" \
  --privilege Public

# With DUIDs from a file
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-file /path/to/duids.txt \
  --privilege Partner
```

**Privilege levels:** `Public` (default) or `Partner`.

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "privilege": "Public",
    "duid_count": 2,
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.pwd",
    "sdk_data_path": "<tizen-sdk-data>",
    "auth_source": "oauth-login",
    "user_id": "...",
    "user_email": "you@example.com",
    "vd_mode": true,
    "device_version": 2
  }
}
```

> **VD mode is always enabled.** The distributor flow always fetches both the v1
> (device-profile XML) and v3 (PEM certificate) responses. The v3 certificate is used
> for packaging when available.

### Import an Existing Samsung .p12

Imports an existing Samsung-issued `.p12` file (from Tizen Studio or another machine)
into a Samsung profile directory. Validates with `keytool` before copying.

```bash
# Import as author certificate
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/author.p12 \
  --password "<password>" \
  --certificate-type author

# Import as distributor certificate (overwrite existing)
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/distributor.p12 \
  --password "<password>" \
  --certificate-type distributor \
  --overwrite
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "certificate_type": "author",
    "cert_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "source_path": "/path/to/author.p12",
    "sdk_data_path": "<tizen-sdk-data>"
  }
}
```

### Create a Samsung Signing Profile

Creates a signing profile that uses Samsung-issued `author.p12` and `distributor.p12`
(instead of bundled SDK distributor certs) via `tz security-profiles add`. Passwords are
decrypted from OS-level secure storage (`.pwd` files) unless explicitly provided.

```bash
# Passwords decrypted from .pwd files
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --active

# With explicit passwords
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --privilege Public \
  --author-password "<author-password>" \
  --distributor-password "<distributor-password>" \
  --active
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "privilege": "Public",
    "author_cert": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.p12",
    "distributor_cert": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/distributor.p12",
    "distributor_ca": "<plugin-assets>/samsung-tv-ca/vd_tizen_dev_public2.crt",
    "profiles_xml": "<tizen-sdk-data>/profile/profiles.xml",
    "active": true,
    "message": "Samsung signing profile \"MySamsungProfile\" created successfully with Samsung-issued distributor certificate."
  }
}
```

> **Never pair a Samsung author certificate with a bundled Tizen distributor certificate.**
> Always use `create-samsung-profile` (not `create-profile`) for Samsung profiles.

### Cancel Samsung Cert Generation

Aborts any active Samsung Account OAuth authentication flow.

```bash
node "$CLI" cancel-samsung-cert
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "cancelled": true,
    "message": "Active Samsung authentication was cancelled."
  }
}
```

### Samsung Login (Standalone)

Performs only the Samsung Account login and caches the token for a profile. Useful to
verify credentials separately from certificate generation.

```bash
node "$CLI" samsung-login --profile-name MySamsungProfile
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "user_id": "...",
    "user_email": "you@example.com",
    "auth_source": "oauth-login",
    "validity_period_s": 86400
  }
}
```

### Reveal a Stored Samsung Password

Decrypts and returns the stored password for a Samsung profile.

```bash
node "$CLI" samsung-reveal-password --profile-name MySamsungProfile
```

**Success result:**

```json
{
  "status": "success",
  "result": {
    "profile_name": "MySamsungProfile",
    "pwd_path": "<tizen-sdk-data>/keystore/samsung/MySamsungProfile/author.pwd",
    "password": "<decrypted-password>"
  }
}
```

---

## DUID Utilities

### Parse DUIDs

Parses and normalizes a raw DUID string: trims, uppercases, deduplicates, validates, and
caps at 50 entries.

```bash
node "$CLI" parse-duids --duid-list "1.0#DEV001,2.0#DEV002,#DEV003"
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "duids": ["1.0#DEV001", "2.0#DEV002", "#DEV003"],
    "skipped": [],
    "truncated": false
  }
}
```

### Import DUIDs from File

Reads a file and parses its contents as DUIDs (same normalization as `parse-duids`).

```bash
node "$CLI" import-duids --duid-file /path/to/duids.txt
```

### Acquire DUID from a Device

Uses `sdb capability` to extract the DUID from a connected Tizen device.

```bash
# First connected device
node "$CLI" acquire-duid

# Specific device by serial
node "$CLI" acquire-duid --serial emulator-26101
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "duid": "1.0#DEV001",
    "serial": "emulator-26101",
    "deviceName": "device"
  }
}
```

### Acquire DUIDs from All Devices

Iterates all connected Tizen devices and extracts DUIDs from each.

```bash
node "$CLI" acquire-duids-all
```

**Result:**

```json
{
  "status": "success",
  "result": {
    "duids": [
      { "duid": "1.0#DEV001", "serial": "emulator-26101", "deviceName": "device" }
    ],
    "errors": []
  }
}
```

---

## Complete Workflows

### Local Tizen Profile (End-to-End)

```bash
# 1. Generate author certificate
node "$CLI" generate-author --name "Jane Dev" --password "<password>" --file jane-dev

# 2. (Optional) List available distributors
node "$CLI" list-distributors

# 3. Create signing profile
node "$CLI" create-profile \
  --profile-name MyProfile \
  --author-cert "<cert_path from step 1>" \
  --author-password "<author-password>" \
  --distributor-type public \
  --distributor-version new \
  --active

# 4. Build with the profile
# tz build -w /path/to/project -s MyProfile -b Debug
```

### Samsung Profile (End-to-End)

```bash
# 1. Generate Samsung author certificate (opens browser for login)
node "$CLI" generate-samsung-author \
  --profile-name MySamsungProfile \
  --identity "Your Name" \
  --password "<password>" \
  --organization "Company" \
  --country "KR"

# 2. Acquire DUIDs from connected device(s)
node "$CLI" acquire-duid
# or: node "$CLI" acquire-duids-all

# 3. Generate Samsung distributor certificate using the DUIDs
node "$CLI" generate-samsung-distributor \
  --profile-name MySamsungProfile \
  --password "<password>" \
  --duid-list "1.0#DEV001" \
  --privilege Public

# 4. Create Samsung signing profile
node "$CLI" create-samsung-profile \
  --profile-name MySamsungProfile \
  --active

# 5. Build with the profile
# tz build -w /path/to/project -s MySamsungProfile -b Debug
```

**Alternative (import existing Samsung .p12 files):**

```bash
# 1. Import existing author .p12
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/author.p12 \
  --password "<password>" \
  --certificate-type author

# 2. Import existing distributor .p12
node "$CLI" import-samsung-certificate \
  --profile-name MySamsungProfile \
  --source /path/to/distributor.p12 \
  --password "<password>" \
  --certificate-type distributor

# 3. Create Samsung signing profile
node "$CLI" create-samsung-profile --profile-name MySamsungProfile --active
```

---

## Error Codes Reference

### Local Tizen Certificate Errors

| Code | Meaning | Action |
|------|---------|--------|
| `sdk_path_not_set` | SDK not configured or `tz` not found | Run `tizen-sdk-install` / `tizen-sdk-init` |
| `cert_password_invalid` | Password too weak | Use ≥ 8 chars with upper + lower + digit |
| `cert_already_exists` | Target `.p12` already exists | Use a unique `--file` or `--profile-name` |
| `cert_generation_failed` | `tz cert` did not produce the file | Surface the included `tz` stdout/stderr |
| `distributor_asset_not_found` | Type+version combo doesn't exist | Call `list-distributors` to see what's available |
| `profile_creation_failed` | `tz security-profiles add` rejected | Surface stdout/stderr |
| `profile_list_failed` | `tz security-profiles list` failed | Surface stdout/stderr |
| `profile_update_failed` | `tz security-profiles set-active` failed | Surface stdout/stderr |
| `profile_remove_failed` | `tz security-profiles remove` failed | Surface stdout/stderr |
| `distributor2_update_failed` | Distributor 2 add/replace transaction failed | Surface stdout/stderr; original profiles.xml is preserved |
| `cert_import_failed` | Importing `.p12`/`.cer` failed | Check password and file format |
| `cert_inspection_failed` | `keytool` could not inspect the certificate | Check password and file format |
| `invalid_parameters` | Required fields missing or invalid | Check required arguments |
| `io_error` | Filesystem operation failed | Check permissions and disk space |

### Samsung Online-CA Certificate Errors

| Code | Meaning | Action |
|------|---------|--------|
| `samsung_cert_generation_failed` | OpenSSL key/CSR or PKCS#12 packaging failed | Surface detailed error |
| `samsung_ca_not_found` | Bundled Samsung VD CA certificate missing | Plugin setup issue |
| `samsung_auth_failed` | Samsung Account authentication failed | Surface message to user |
| `samsung_auth_timeout` | User didn't complete browser login in 5 min | Retry and finish browser login |
| `samsung_auth_port_unavailable` | No free port in 4794–4813 | Close whatever holds those ports |
| `samsung_auth_invalid_response` | Callback payload couldn't be parsed | Retry login |
| `samsung_pwd_store_failed` | OS credential store failed | Check wincrypt.exe (Windows) / Keychain (macOS) / secret-tool (Linux) |
| `samsung_api_failed` | Samsung CA rejected the request | HTTP 401: delete `samsung-auth-data.json` and retry. HTTP 403: rate limited, wait. |
| `cert_import_failed` | Importing `.p12` failed | Check password and file format |
| `profile_not_found` | Required Samsung cert not found | Run `generate-samsung-author` / `generate-samsung-distributor` first |
| `profile_creation_failed` | `tz security-profiles add` rejected | Surface stdout/stderr |

---

## File Locations

All paths are resolved dynamically at runtime — never hardcoded.

| Artifact | Location |
|----------|----------|
| SDK root | From `~/.tizen.sdk.path.config` |
| SDK data path | From `TIZEN_SDK_DATA_PATH` in `<sdk-root>/sdk.info` |
| Local author certs | `<tizen-sdk-data>/keystore/author/<fileName>.p12` |
| Bundled distributors | `<sdk-root>/tools/certificate-generator/certificates/distributor/sdk-<type>/` |
| Signing profiles | `<tizen-sdk-data>/profile/profiles.xml` |
| Samsung author cert | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.p12` |
| Samsung author password | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.pwd` |
| Samsung distributor cert | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.p12` |
| Samsung distributor password | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.pwd` |
| Samsung auth cache | `<tizen-sdk-data>/keystore/samsung/<profileName>/samsung-auth-data.json` |
| Samsung CSR (author) | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.csr` |
| Samsung CSR (distributor) | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.csr` |
| Samsung signed cert (author) | `<tizen-sdk-data>/keystore/samsung/<profileName>/author.crt` |
| Samsung signed cert (distributor) | `<tizen-sdk-data>/keystore/samsung/<profileName>/distributor.crt` |
| Samsung device profile (v1) | `<tizen-sdk-data>/keystore/samsung/<profileName>/device-profile.xml` |
| Samsung VD CA certificates | Plugin assets: `assets/samsung-tv-ca/` |

> **Auth cache lifecycle:** The `samsung-auth-data.json` file is created by
> `generate-samsung-author` (or `samsung-login`) and is **automatically deleted** after
> successful `generate-samsung-distributor` execution. If you need to re-run distributor
> generation, you will be prompted to log in again unless the cache was created by a
> separate `samsung-login` call.

### DUID Format Reference

| Format | Version | Example |
|--------|---------|---------|
| `#DEVICE001` | V0 (Gear2) | `#ABC123` |
| `1.0#DEVICE001` | V1 | `1.0#DEV001` |
| `2.0#DEVICE001` | V2 (default) | `2.0#DEV001` |
| `-DEVICE001` | VD mode | `-DEV001` |

### Password Storage by Platform

| Platform | Backend | `.pwd` file content |
|----------|--------|---------------------|
| Windows | `wincrypt.exe` (DPAPI) | Encrypted blob |
| macOS | Keychain (`security` command) | JSON marker `{ "backend": "macos-keychain" }` |
| Linux | libsecret (`secret-tool` command) | JSON marker `{ "backend": "linux-secret-tool" }` |
