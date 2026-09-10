# Scenario Guide: Tizen & Samsung Certificate Management End to End

This document walks you through the **complete Tizen certificate and Samsung online-CA certificate workflow** with the `tizen-sdk-skills` plugin: "SDK install → local Tizen certificate → Samsung certificates → signing profiles → use for builds".

Each step runs automatically when you **tell Claude in natural language** — no commands to memorize.

> Tizen apps are signed with **two types of certificates**: (1) **Local Tizen** — free, self-signed, bundled with the SDK for development/testing, or (2) **Samsung online-CA** — issued by Samsung Account, required for Samsung distribution. Both flow through **signing profiles**, which combine an author certificate with a distributor certificate. The responsible skill is `tizen-certificate-manager`.

---

## 0. Before You Start

- **Plugin installed**: the `tizen-sdk-skills` plugin must be installed. (If not, see "Cline plugin install" in [README.en.md](../README.en.md))
- **Tizen SDK installed**: the SDK must be installed and `~/.tizen.sdk.path.config` must point to it. (If not, see "Install the Tizen SDK" below)
- **OS**: Windows / Ubuntu (Linux) / macOS are all supported. Claude detects the current OS and runs the matching script.
- **Samsung Account** (optional): required only if you plan to use Samsung distribution certificates. A valid Samsung Account and at least one device DUID are prerequisites.
- **Example goal**:
  - Scenario A (Local only): Create a local Tizen certificate, use it to build and sign an app.
  - Scenario B (With Samsung): Generate a Samsung author certificate, add DUIDs for a Samsung distributor certificate, create a signing profile, and use it for distribution builds.

> 💡 Copy the "Say this" examples in each step as-is.

---

## The Whole Flow at a Glance

| Step | Task | When | Agent |
|------|------|------|-------|
| 1 | Install Tizen SDK | First time only | `tizen-sdk-install` |
| 2 | Generate local Tizen author certificate | Before creating a signing profile | `tizen-certificate-manager` |
| 2b (optional) | List bundled distributor certificates | To preview which types/versions exist | `tizen-certificate-manager` |
| 3 | Create a signing profile (local Tizen) | Before building with a signed profile | `tizen-certificate-manager` |
| 4 (optional) | Import or inspect certificates | If using external `.p12`/`.cer` files | `tizen-certificate-manager` |
| 5 (optional) | Generate Samsung author certificate | For Samsung distribution | `tizen-certificate-manager` |
| 6 (optional) | Collect device DUIDs | Needed for Samsung distributor cert | `tizen-certificate-manager` |
| 7 (optional) | Generate Samsung distributor certificate | For Samsung distribution | `tizen-certificate-manager` |
| 8 (optional) | Create a Samsung signing profile | To sign apps for Samsung distribution | `tizen-certificate-manager` |
| 9 | Use the signing profile to build | Build a signed Tizen app | `tizen-build-project` |

---

## Step 1 — Install the Tizen SDK

Set up the development environment first. Skip if already installed.

**Say this:**
```
Install the Tizen SDK
```

**Success check:** an "installation complete" message with the number of installed packages.

---

## Step 2 — Generate a Local Tizen Author Certificate

Create a self-signed certificate for development or testing. This is **free** and **immediately usable** — no account needed.

**Say this:**
```
Generate a Tizen author certificate named "My Dev"
```

When prompted, enter a password interactively (8+ characters, with uppercase, lowercase, and a digit). The password is masked — you won't see it as you type.

**Success check:** a Standard JSON Envelope is returned with a `result` like:

```json
{
  "status": "success",
  "result": {
    "name": "My Dev",
    "file_name": "My-Dev",
    "cert_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.p12",
    "pwd_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.pwd",
    "pwd_file_exists": false
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk certificate-manager generate-author",
  "duration_ms": 1655
}
```

The certificate is now stored at `cert_path` with a hidden password file at `pwd_path`. You can reuse this certificate to create multiple signing profiles.

**Optional: Add metadata**

If you want to embed organization, email, location, etc. into the certificate:

```
Generate a Tizen author certificate named "Jane Dev" with email "jane@acme.com", organization "Acme", city "Seoul", state "Seoul", country "KR"
```

When prompted, enter the certificate password interactively.

---

## Step 2b (Optional) — List Bundled Distributor Certificates

Before creating a signing profile, see what distributor certificates ship with the SDK.

**Say this:**
```
List all bundled Tizen distributor certificates
```

**Success check:** a result showing available types (`public`, `partner`, `platform`) and versions (`legacy`, `new`):

```json
{
  "status": "success",
  "result": {
    "sdk_root": "C:\\Users\\<username>\\tizen-sdk",
    "distributors": [
      {
        "type": "public",
        "version": "legacy",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-ca.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-signer.p12"
      },
      {
        "type": "public",
        "version": "new",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-ca-new.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-signer-new.p12"
      },
      {
        "type": "partner",
        "version": "legacy",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-partner\\tizen-distributor-ca.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-partner\\tizen-distributor-signer.p12"
      },
      {
        "type": "partner",
        "version": "new",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-partner\\tizen-distributor-ca-new.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-partner\\tizen-distributor-signer-new.p12"
      },
      {
        "type": "platform",
        "version": "new",
        "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-platform\\tizen-distributor-ca-new.cer",
        "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-platform\\tizen-distributor-signer-new.p12"
      }
    ],
    "unavailable": [
      {
        "type": "platform",
        "version": "legacy"
      }
    ]
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk certificate-manager list-distributors",
  "duration_ms": 13
}
```

The `unavailable` array shows combos that don't exist on this SDK install (in this case, `platform/legacy`). If you tried to create a profile with an unavailable type/version, this error would tell you which ones are valid.

**Optional: Filter by type or version**

```
List all bundled Tizen distributor certificates of type public
```

---

## Step 3 — Create a Signing Profile (Local Tizen)

Combine your author certificate with a bundled distributor certificate to form a **signing profile** that you can use to build signed apps.

**Say this:**
```
Create a signing profile named "MyLocalProfile" using my Tizen author certificate "My-Dev.p12", paired with the public/new bundled distributor
```

When prompted, enter the author certificate password interactively (masked input).

**Success check:** a Standard JSON Envelope with a `result` like:

```json
{
  "status": "success",
  "result": {
    "profile_name": "MyLocalProfile",
    "active": true,
    "profiles_xml": "C:\\Users\\<username>\\tizen-sdk-data\\profile\\profiles.xml",
    "author_cert_path": "C:\\Users\\<username>\\tizen-sdk-data\\keystore\\author\\My-Dev.p12",
    "distributor": {
      "type": "public",
      "version": "new",
      "ca_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-ca-new.cer",
      "signer_path": "C:\\Users\\<username>\\tizen-sdk\\tools\\certificate-generator\\certificates\\distributor\\sdk-public\\tizen-distributor-signer-new.p12"
    },
    "distributor2": null
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk certificate-manager create-profile",
  "duration_ms": 4122
}
```

**Use it to build:**

After this step, you can build a signed app. You'll see a result like:

```json
{
  "status": "success",
  "result": {
    "artifacts": [
      {
        "path": "C:\\Users\\<username>\\Desktop\\test_tizen_aiplugins\\tetris\\Debug\\tetris.wgt",
        "format": ".wgt",
        "size_bytes": 42949
      }
    ],
    "build_time_ms": 10400
  },
  "warnings": [],
  "errors": [],
  "command": "tizen-sdk build-project",
  "duration_ms": 10400
}
```

(See Step 9 for full details.)

---

## Step 4 (Optional) — Import or Inspect Certificates

### Option A — Import an existing certificate

If you have a `.p12` or `.cer` file (e.g., from a previous installation or external CA), import it into your keystore without overwriting existing files.

**Say this:**
```
Import the certificate at "/path/to/my-cert.p12" as a Tizen author certificate, target file name "my-imported-cert"
```

When prompted, enter the certificate password interactively (masked input).

**Success check:** the file is copied into the author keystore; a result shows the final path.

**Overwrite mode:**

If a file with that name already exists, import-certificate will reject it by default. To replace it:

```
Import the certificate at "/path/to/my-cert.p12" as a Tizen author certificate, target file name "my-imported-cert", and overwrite any existing file
```

When prompted, enter the certificate password interactively.

### Option B — Inspect a certificate

View the details (subject, issuer, validity, algorithms, fingerprints) of a `.p12` or `.cer` without exposing the password.

**Say this:**
```
Inspect the certificate at "/path/to/my-cert.p12"
```

When prompted, enter the certificate password interactively (masked input).

**Success check:** a result showing certificate metadata (subject, issuer, validity dates, algorithms, fingerprints, etc.).

---

## Step 5 (Optional) — Generate a Samsung Author Certificate

If you plan to distribute on the Samsung Store or to Samsung devices, generate a **Samsung-issued** author certificate. This requires a **valid Samsung Account** and opens your browser for login (first time) or reuses a cached token (subsequent times).

**Say this:**
```
Generate a Samsung author certificate for profile "MySamsungProfile" with identity "Jane Dev", organization "Acme", city "Seoul", country "KR"
```

When prompted, enter a password interactively (8+ characters, with uppercase, lowercase, and a digit). The password is masked — you won't see it as you type.

Your browser will open for Samsung Account login (first time only). Subsequent Samsung operations reuse the cached token automatically.

**Success check:** after you log in, a Standard JSON Envelope is returned with a `result` showing the certificate paths and profile directory.

The certificate is stored under a **profile name** directory (`MySamsungProfile`), not as a standalone file. The password is stored securely via the OS credential system (DPAPI on Windows, Keychain on macOS, libsecret on Linux) — **not** in plaintext.

> ⚠️ **Login only happens once.** If you generate multiple Samsung certificates for the same Samsung Account, only the first generation prompts for login. Subsequent generations reuse the cached token automatically (no browser).

---

## Step 6 (Optional) — Collect Device DUIDs

To generate a **Samsung distributor certificate**, you need at least one **DUID** (Device Unique ID) from a real Tizen device or emulator. There are three ways to acquire DUIDs:

### Option A — Extract DUID from a single connected device

If a Tizen device or emulator is connected via USB/network:

**Say this:**
```
Get the DUID from my connected Tizen device
```

**Success check:** a result showing the device serial and DUID:

```json
{
  "status": "success",
  "result": {
    "duids": [
      { "serial": "emulator-26101", "duid": "1.0#EMULATOR01" }
    ]
  }
}
```

### Option B — Extract DUIDs from all connected devices

If you have multiple devices:

**Say this:**
```
Get DUIDs from all connected Tizen devices
```

**Success check:** a result with a DUID entry per device.

### Option C — Provide a manual list or file

If you already have DUIDs (e.g., from Samsung's partner portal), provide them directly:

**Say this (inline list):**
```
Parse these DUIDs: "1.0#DEVICE001,1.0#DEVICE002,1.0#DEVICE003"
```

**Say this (from a file):**
```
Parse DUIDs from the file "/path/to/duids.txt"
```

**Success check:** a result showing the validated, deduplicated, uppercased DUIDs and any parsing notes.

---

## Step 7 (Optional) — Generate a Samsung Distributor Certificate

After you have a Samsung author certificate (Step 5) and at least one DUID (Step 6), generate a **Samsung distributor certificate** for your profile.

**Say this (with inline DUIDs):**
```
Generate a Samsung distributor certificate for profile "MySamsungProfile", DUIDs "1.0#DEVICE001,1.0#DEVICE002", and privilege Public
```

**Say this (with a file):**
```
Generate a Samsung distributor certificate for profile "MySamsungProfile", DUIDs from "/path/to/duids.txt", and privilege Partner
```

When prompted, enter the certificate password interactively (masked input).

**Success check:** a Standard JSON Envelope with a `result` showing the distributor cert path and validity.

**What privilege level to choose?**
- **Public** — your app can run on any Tizen device.
- **Partner** — your app is restricted to partner/vendor devices (more selective distribution).

---

## Step 8 (Optional) — Create a Samsung Signing Profile

After you have both a Samsung author certificate (Step 5) and a Samsung distributor certificate (Step 7), combine them into a **signing profile** for Samsung distribution builds.

**Say this:**
```
Create a Samsung signing profile named "MySamsungProfile" and make it active
```

When prompted (if needed), enter the author and/or distributor certificate passwords interactively (masked input). Most of the time, passwords are decrypted automatically from OS-level secure storage.

**Success check:** a Standard JSON Envelope showing the profile is registered and ready to use.

> ✅ This is different from Step 3. Here you are **not** using bundled Tizen distributor certs — you are using **Samsung-issued** certificates, which are required for Samsung Store distribution.

**Use it to build:**

After this step, you can build a Samsung-signed app by telling Claude:

```
Build my Tizen app with the signing profile "MySamsungProfile"
```

---

## Step 9 — Use the Signing Profile to Build

Now that you have a signing profile (either local Tizen from Step 3 or Samsung from Step 8), use it to build a signed Tizen app.

**Say this:**
```
Build my Tizen app with the signing profile "MyLocalProfile"
```

Or (for Samsung):

```
Build my Tizen app with the signing profile "MySamsungProfile"
```

**Success check:** the build completes and produces a signed `.tpk` (native) or `.wgt` (web app) package. The artifact path is printed.

---

## Full E2E Paths

### Path 1: Local Tizen Certificate Only (Development/Testing)

Use this if you're building for testing or internal distribution:

```
1) Install the Tizen SDK
2) Generate a Tizen author certificate named "My Dev"
   → Enter password when prompted
3) Create a signing profile named "MyProfile" using my Tizen author certificate "My-Dev.p12", paired with the public/new bundled distributor
   → Enter author password when prompted
4) Build my Tizen app with the signing profile "MyProfile"
```

**Time estimate:** ~5–10 minutes (Step 1 is the longest; Step 2–4 are quick).

### Path 2: Samsung Certificates (Full Distribution Workflow)

Use this if you're distributing on the Samsung Store:

```
1) Install the Tizen SDK
2) Generate a Samsung author certificate for profile "MySamsungProfile" with identity "Jane Dev", organization "Acme", city "Seoul", country "KR"
   → Enter password when prompted
   → (your browser opens for Samsung Account login on first run)
3) Get the DUID from my connected Tizen device
4) Generate a Samsung distributor certificate for profile "MySamsungProfile", DUIDs from the device, and privilege Public
   → Enter password when prompted
5) Create a Samsung signing profile named "MySamsungProfile" and make it active
6) Build my Tizen app with the signing profile "MySamsungProfile"
```

**Time estimate:** ~15–20 minutes (Step 2 includes browser login if it's your first time; subsequent builds reuse the cached login).

### Path 3: Hybrid (Local + Samsung)

If you maintain both development and distribution profiles:

```
1) Install the Tizen SDK
2) Generate a Tizen author certificate named "My Dev"
   → Enter password when prompted
3) Create a local signing profile named "LocalProfile" using my Tizen author certificate "My-Dev.p12", paired with the public/new bundled distributor
   → Enter author password when prompted
4) Generate a Samsung author certificate for profile "SamsungProfile" with identity "Jane Dev", organization "Acme", city "Seoul", country "KR"
   → Enter password when prompted
   → (your browser opens for Samsung Account login on first run)
5) Get DUIDs from my connected Tizen device
6) Generate a Samsung distributor certificate for profile "SamsungProfile", DUIDs from the device, and privilege Public
   → Enter password when prompted
7) Create a Samsung signing profile named "SamsungProfile" and make it active
8) Build my Tizen app with the signing profile "LocalProfile" (for testing)
9) Build my Tizen app with the signing profile "SamsungProfile" (for Samsung distribution)
```

---

## Management & Troubleshooting

### View all signing profiles and active profile

**Say this:**
```
List all my Tizen signing profiles
```

**Result:** shows all profiles, the active one, and the associated author/distributor certificate paths.

### Change the active profile

**Say this:**
```
Set the active signing profile to "MyProfile"
```

### Remove a profile (cannot be undone)

**Say this:**
```
Remove the signing profile named "MyProfile"
```

> ⚠️ This deletes the profile from `profiles.xml`. You can still use the underlying author/distributor certificates to create a new profile.


### Distributor certificate update or special cases

#### Set distributor 2 (advanced)

If your signing profile needs a **second distributor certificate** (rare, used for special Samsung configurations):

**Say this:**
```
Set distributor 2 for profile "MyProfile" to partner/new
```

When prompted, enter the author password and distributor 2 password interactively (masked input).

#### Get the SDK data path

If you need to know where certificates and profiles are stored on your system:

**Say this:**
```
Show me the Tizen SDK data path and certificate locations
```

**Result:** a JSON envelope showing `sdk_root`, `sdk_data_path`, `profiles_xml`, `keystore_author`, and `keystore_samsung` paths on your system.

---

## E2E Verification Checklist

Verify these items during a manual E2E test.

### Local Tizen path

| # | Check | Expected |
|---|-------|----------|
| 1 | Step 2 envelope | `status: "success"`, `cert_path` and `pwd_path` present, exit code `0` |
| 2 | Certificate file exists | `.p12` file visible at `cert_path` on disk |
| 3 | Step 3 envelope | `status: "success"`, profile name is returned |
| 4 | Profile is active | `list-profiles` shows the profile with `active: true` |
| 5 | Build with profile | `tizen-build-project` completes and produces a signed `.tpk`/`.wgt` |

### Samsung path

| # | Check | Expected |
|---|-------|----------|
| 6 | Step 5 envelope | `status: "success"`, `cert_path` under `keystore/samsung/<profile-name>/` |
| 7 | Browser login succeeds | Samsung Account login completes; no timeout after 5 minutes |
| 8 | Token cached | Subsequent Samsung operations do not re-prompt for login |
| 9 | Step 7 envelope | `status: "success"`, distributor cert path returned |
| 10 | Step 8 profile | Profile is registered and active |
| 11 | Build with Samsung profile | `tizen-build-project` completes with a Samsung-signed `.tpk`/`.wgt` |
| 12 | Password reveal works | `samsung-reveal-password` returns the plaintext password (if OS credential store is available) |

### Failure paths (error mapping)

| # | Scenario | Expected |
|---|----------|----------|
| 13 | Weak password (e.g., "pass") | `error_category: "invalid_parameters"` — "password must be at least 8 characters..." |
| 14 | Certificate already exists | `error_category: "cert_already_exists"` — choose a unique `--file` or `--profile-name` |
| 15 | Samsung login timeout | `error_category: "samsung_auth_timeout"` — retry and complete login within 5 minutes |
| 16 | DUID list is empty | `error_category: "invalid_parameters"` — at least one DUID is required for distributor cert |
| 17 | Profile name not found (distributor2, remove) | `error_category: "profile_not_found"` — use `list-profiles` to verify the name |
| 18 | SDK not installed | `error_category: "sdk_path_not_set"` — run `tizen-sdk-install` first |

---

## Keyboard Shortcuts & Tips

- **Natural language:** just describe what you want in plain English (or Korean). Claude understands "Generate a Samsung author cert for my phone" and "Create a profile called Testing with my dev cert".
- **Password entry:** when prompted for a password, it's entered interactively in a **masked terminal prompt** — you won't see characters as you type. This is secure and keeps passwords out of chat, command history, and process listings.
- **Copy-paste profile names:** signing profile names are case-sensitive. If you created `MyProfile`, use exactly `MyProfile` in subsequent commands, not `myprofile`.
- **Reuse author certificates:** a single author certificate can be used in multiple signing profiles. No need to regenerate.
- **Test both paths:** create a local profile first (fast), test your build, then add Samsung certificates for distribution (requires login).
- **No visible passwords:** passwords are never passed as command-line arguments or printed to logs. Always use interactive prompts.

---

## Related Documents

- Full agent overview: [README.en.md](../README.en.md)
- Skill reference: [SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) (tizen-certificate-manager)
- Web app debugging scenario: [scenario-webapp-debug-walkthrough.en.md](../debug/scenario-webapp-debug-walkthrough.en.md)

- Native app debugging scenario: [scenario-native-app-walkthrough.en.md](../project/scenario-native-app-walkthrough.en.md)


