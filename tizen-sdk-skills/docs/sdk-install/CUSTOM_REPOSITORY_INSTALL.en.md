# SDK Install from a Custom Repository URL

English | [한국어](CUSTOM_REPOSITORY_INSTALL.md)

Install the Tizen SDK from a **user-supplied package repository URL** instead of the
timezone-selected public CDN mirror — an internal Samsung mirror, a build-server output, a
team mirror, or a local HTTP server.

Everything else about the install is unchanged: same paths, same `sdk.info` completion
marker, same automatic `sdk-init`, same environment setup. Only the **package source**
differs.

- Skill: `tizen-sdk-install-custom-repo`
- Agent: `tizen-sdk-install-custom-repo`
- Reference: [../SKILLS_REFERENCE.en.md](../SKILLS_REFERENCE.en.md) § 18
- Korean version: [CUSTOM_REPOSITORY_INSTALL.md](CUSTOM_REPOSITORY_INSTALL.md)

---

## 1. What makes a repository URL valid

A Tizen package repository serves a **package list** file at its root:

```
{REPO_URL}/pkg_list_{OS}-{ARCH}

OS   = windows | ubuntu | macos      (derived from the machine running the install)
ARCH = 64 | 32
```

Examples: `pkg_list_windows-64`, `pkg_list_ubuntu-64`, `pkg_list_ubuntu-32`, `pkg_list_macos-64`.

That file is the index the **entire** install is driven from — package names, versions, the
`Path` of every zip, `Install-dependency`, `C-SelectedGroup`. Without it there is nothing to
install from, so:

| Condition                                                              | Result                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `{URL}/pkg_list_{OS}-64` is fetchable                                  | ✅ Valid — install proceeds with the 64-bit list |
| `-64` missing but `{URL}/pkg_list_{OS}-32` is fetchable                | ✅ Valid — install proceeds with the 32-bit list |
| Neither is fetchable                                                   | ❌ **Rejected — nothing is downloaded**          |
| URL is empty / not `http(s)` / malformed                               | ❌ Rejected (no network request made)            |
| URL points at the `pkg_list` file itself instead of its directory      | ❌ Rejected with an explicit message             |

`-64` is probed first, then `-32`, so a 32-bit-only mirror works without extra flags.

**Why reject up front:** a full install resolves and downloads ~121 package zips. Starting
against a URL with no package list means ~121 consecutive failures and a half-populated SDK
directory. The pre-flight probe turns that into a single clear error.

### How the probe works

1. `HEAD {URL}/pkg_list_{OS}-64`
2. If HEAD fails, `GET` the same URL with `Range: bytes=0-0` (a 1-byte read) — some servers
   reject HEAD (405/501) while serving GET perfectly well, and a HEAD-only probe would
   wrongly reject them
3. Repeat for `-32`
4. Redirects are followed; a 2xx on either candidate means valid

The probe is implemented **once**, in the shared script helpers
(`scripts/lib/common.sh` → `validate_pkg_repo_url`, `scripts/lib/common.ps1` →
`Test-PkgRepoUrl`), and the Node layer calls the installer script's validate mode rather
than re-implementing it. That way the shell and JS layers can never disagree on what counts
as valid, and the probe honours the machine's proxy/certificate configuration — which
internal mirrors normally require.

---

## 2. Usage

### Validate only (read-only, seconds)

```bash
# CLI runner
node <plugin>/lib/cli/validate-repo-url-cli.js "<repo-url>"

# tizen-cli
tizen-cli tizen-sdk validate-repo-url --repo-url "<repo-url>"

# scripts (no Node.js needed)
bash   scripts/tizen-sdk-install/tizen-sdk-install.sh  --repo-url "<url>" --validate-repo-url
powershell -File scripts\tizen-sdk-install\tizen-sdk-install.ps1 -RepoUrl "<url>" -ValidateRepoUrl
bash   scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh --repo-url "<url>" --validate-only
```

Exit code `0` = valid, `1` = invalid.

### Install

```bash
# CLI runner (pre-check → returns the installer command)
node <plugin>/lib/cli/sdk-install-custom-repo-cli.js "<repo-url>" [platform-version] [--force]

# tizen-cli
tizen-cli tizen-sdk sdk-install-custom-repo --repo-url "<url>" [--platform-version 11.0] [--force]
tizen-cli tizen-sdk sdk-install --repo-url "<url>"     # equivalent shorthand

# scripts (perform the real 10-15 min install)
bash scripts/tizen-sdk-install-custom-repo/tizen-sdk-install-custom-repo.sh --repo-url "<url>"
powershell -File scripts\tizen-sdk-install-custom-repo\tizen-sdk-install-custom-repo.ps1 -RepoUrl "<url>"
```

### Options

| Option (bash / PowerShell / tizen-cli)                          | Description                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `--repo-url <url>` / `-RepoUrl <url>` / `--repo-url <url>`      | **Required.** Repository base URL serving `pkg_list_{OS}-{64,32}`            |
| `--platform <ver>` / `-Platform <ver>` / `--platform-version`   | Tizen platform version; default = highest `TIZEN-X.Y` the repository offers |
| `--path <path>` / `-Path <path>`                                | Install path; default `~/tizen-sdk`                                         |
| `--force` / `-Force` / `--force`                                | Reinstall even if installed — **required to switch an existing install's repository** |
| `--validate-only` / `-ValidateOnly`                             | Validate the URL and exit                                                   |
| `--dry-run` / `-DryRun`                                         | Resolve and list the packages without downloading                           |
| `--detach` / `-Detach`                                          | Launch detached; poll with `--status` / `-Status`                            |
| `--status` / `-Status`, `--wait` / `-Wait`                       | Query / poll the durable on-disk run state                                  |

---

## 3. Flow

```
installSdkFromRepo(repoUrl, platformVersion, force)
  │
  ├─ 1. Node.js check (18+)                     ── fail → abort with OS-specific guide
  │
  ├─ 2. Repository URL validation               ── fail → abort, NOTHING downloaded
  │       ├─ syntax (in JS: non-empty, http(s), not the pkg_list file itself)
  │       └─ reachability (delegated to the installer script's validate mode)
  │             probe {URL}/pkg_list_{OS}-64 → then -32
  │
  ├─ 3. SDK already installed? (sdk.info)
  │       └─ yes → SUCCESS + warning: nothing was downloaded, the existing packages
  │                still come from the repository recorded in repository.info;
  │                re-run with --force to reinstall from the requested URL
  │
  ├─ 4. Disk space check (15 GB, home drive)    ── fail → abort with the deficit
  │
  └─ 5. Return the installer command in suggested_fix  (Phase 2 — background, 10-15 min)
           │
           └─ tizen-sdk-install-custom-repo.{sh,ps1} --repo-url <url>
                 ├─ re-validate the URL
                 └─ delegate to tizen-sdk-install.{sh,ps1} --repo-url <url>
                       ├─ download & parse {URL}/pkg_list_{OS}-{64,32}
                       ├─ pick the target platform (--platform, else the highest TIZEN-X.Y)
                       ├─ resolve Install-dependency + C-SelectedGroup + extra packages
                       ├─ download each zip from {URL}{Path}, merge data/ into the SDK root
                       ├─ write sdk.info and ~/.tizen.sdk.path.config (auto sdk-init)
                       ├─ write .package/repository.info  ← the CUSTOM url
                       └─ set TIZEN_SDK_PATH / PATH
```

The two-phase contract, the durable run markers (`.install-running` / `.install-result`),
and the resume-on-rerun behaviour (already-downloaded packages are skipped via
`.package/*.manifest`) are exactly the same as a normal install — see
[INSTALLATION_FLOW.en.md](INSTALLATION_FLOW.en.md).

---

## 4. Already installed ≠ installed from this repository

Step 3 short-circuits on an existing SDK **without downloading anything**, so its packages
still come from whichever repository installed it. The envelope says so explicitly:

```json
"warnings": [
  "SDK installation verified at /home/user/tizen-sdk (sdk.info found). To force a reinstall, run with --force (script flag: -Force).",
  "The requested repository was NOT applied: the existing SDK was installed from https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official. Re-run with --force to reinstall from http://mirror.example.com/packages/tizen_sdk_11.0."
]
```

The installer scripts print the same warning when their own already-installed early exit
fires with a repository URL given. To actually switch repositories, pass `--force`.

---

## 5. Downstream effect: repository.info

A successful install writes:

```
{SDK_PATH}/.package/repository.info
    # Tizen SDK Package Repository (custom repository supplied via --repo-url)
    Repository=http://mirror.example.com/packages/tizen_sdk_11.0
```

`tizen-update-package` and `tizen-download-emulator-package` read this file, so **package
updates and emulator packages come from the same custom repository** — no extra
configuration. Inspect the recorded value at any time:

```bash
node <plugin>/lib/cli/sdk-repo-info-cli.js          # result.current_repository
tizen-cli tizen-sdk sdk-repo-info
```

---

## 6. Error reference

| `error_code`          | `error_category`       | Cause                                                                       | Fix                                                            |
| --------------------- | ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `TIZEN_SDK_REPO_E001` | `repo_url_invalid`     | Missing/empty URL, non-`http(s)` scheme, malformed URL, or the URL points at the `pkg_list` file | Pass the **directory** URL that contains the pkg_list           |
| `TIZEN_SDK_REPO_E002` | `repo_url_unreachable` | Well-formed URL, but no `pkg_list_{OS}-{64,32}` could be fetched            | Wrong URL, or an internal mirror unreachable without VPN/proxy   |
| `TIZEN_SDK_SCRIPT_E001` | `script_not_found`   | Installer script missing from the plugin cache                               | Re-run the setup script to sync `scripts/`                       |
| `TIZEN_SDK_EXEC_E001` | `execution_error`      | URL valid, SDK not installed (this is the normal Phase-1 result)             | Run `errors[0].suggested_fix.command` (Phase 2)                  |

`errors[0].details` carries the last lines of the validation probe, including every URL it
tried — quote those when reporting a rejection to the user.

### Common mistakes

| Given URL                                        | Problem                                | Correct URL                        |
| ------------------------------------------------ | -------------------------------------- | ---------------------------------- |
| `https://host/repo/pkg_list_ubuntu-64`           | Points at the file, not the directory  | `https://host/repo`                |
| `https://host/repo/binary`                       | `binary/` holds the zips, not the list | `https://host/repo`                |
| `mirror.example.com/packages/tizen_sdk_11.0`    | No scheme                              | `http://mirror.example.com/packages/tizen_sdk_11.0` |
| An internal mirror while off-VPN                 | Not reachable from this machine        | Connect to VPN / configure a proxy |

---

## 7. Files

| File                                                                         | Role                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `common/lib/core/sdk.js`                                                     | `validateRepoUrl()`, `installSdkFromRepo()`, `normalizeRepoUrl()`, `checkRepoUrlSyntax()`, `readInstalledRepository()` |
| `common/lib/cli/sdk-install-custom-repo-cli.js`                              | Install pre-check CLI runner                                          |
| `common/lib/cli/validate-repo-url-cli.js`                                    | Validation-only CLI runner                                            |
| `common/lib/envelope/response-formatter.js`                                   | `formatRepoUrlValidation()`, `formatCustomRepoInstall()`               |
| `common/lib/envelope/envelope.js`                                            | `REPO_URL_INVALID`, `REPO_URL_UNREACHABLE` error codes                 |
| `common/scripts/lib/common.sh` / `common.ps1`                                | `validate_pkg_repo_url` / `Test-PkgRepoUrl` (the single probe impl.)   |
| `common/scripts/tizen-sdk-install-custom-repo/*.{sh,ps1}`                     | Validating front-end that delegates to the base installer             |
| `common/scripts/tizen-sdk-install/*.{sh,ps1}`                                 | `--repo-url` / `-RepoUrl`, `--validate-repo-url` / `-ValidateRepoUrl`  |
| `common/skills/tizen-sdk-install-custom-repo/SKILL.md`                        | Skill (Claude Code / Cline)                                           |
| `common/agents/tizen-sdk-install-custom-repo.md`                              | Agent (Claude Code)                                                   |
| `tizen-cli/skills/tizen-sdk-install-custom-repo/SKILL.md`                     | Skill (tizen-cli harness)                                             |
| `tizen-cli/src/command-specs/sdk.ts`                                          | `sdk-install-custom-repo`, `validate-repo-url` commands                |
| `common/lib/tests/sdk-repo-url.test.js`                                       | Tests for URL normalization / syntax rejection                        |
