// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Keep the user's TIZEN_SDK_PATH in line with ~/.tizen.sdk.path.config.
 *
 * Every runner reads the SDK path from the config file only (readSdkPath), so
 * a TIZEN_SDK_PATH left over from an earlier install points shells — and the
 * user typing `sdb` — at a different SDK than the runners use. sdk-init and
 * the install flows call syncSdkPathEnv() to bring the persistent environment
 * in line with the config:
 *
 *   - Windows: the user-scope TIZEN_SDK_PATH, and the old SDK's
 *     bin / tools / tools\tizen-core entries of the user-scope Path are
 *     replaced with the new SDK's (other Path entries are left alone; nothing
 *     is added when no old SDK entry is there). The Path is read and written
 *     unexpanded and keeps its registry value kind, so %VAR% entries survive.
 *   - POSIX: the value of an existing `export TIZEN_SDK_PATH=…` in ~/.zshrc,
 *     ~/.bashrc, ~/.bash_profile or ~/.profile is rewritten; the rest of the
 *     line is kept. A profile without one is left alone.
 *
 * A running shell keeps its old value either way (a child process cannot
 * change its parent's environment), so the caller tells the user to open a new
 * terminal. TIZEN_SDK_ENV_SYNC=0 turns the sync off (used by the unit tests and
 * the TC runner so they never touch the real user environment). It gates only
 * this module: the installer scripts write the environment themselves
 * (tizen-sdk-install.sh rewrites the profile export, tizen-sdk-install.ps1 the
 * user Path and TIZEN_SDK_PATH) whatever the variable says — a test that runs
 * an installer needs a scratch HOME / USERPROFILE instead, as the mutating
 * tier's installer phase does.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { shellUnsafeReason } = require("./shell-safety");

const PROFILE_FILES = [".zshrc", ".bashrc", ".bash_profile", ".profile"];
const WIN_SDK_SUBDIRS = ["bin", "tools", "tools\\tizen-core"];
// prefix (indent + `export TIZEN_SDK_PATH=`) and the value only: a quoted
// string, or an unquoted word up to whitespace or `;`.
const EXPORT_VALUE =
  /^([ \t]*export[ \t]+TIZEN_SDK_PATH=)("[^"\n]*"|'[^'\n]*'|[^\s;]*)/gm;

function winKey(p) {
  return path.win32.normalize(String(p)).replace(/\\+$/, "").toLowerCase();
}

/**
 * Expand %NAME% references the way the user environment would, for comparing
 * Path entries only (the stored value is never expanded).
 *
 * @param {string} entry
 * @param {object} env - variables to expand from (process.env by default)
 * @returns {string}
 */
function expandWinVars(entry, env = process.env) {
  const lookup = {};
  for (const [k, v] of Object.entries(env)) lookup[k.toLowerCase()] = v;
  return String(entry).replace(/%([^%;]+)%/g, (m, name) =>
    lookup[name.toLowerCase()] !== undefined ? lookup[name.toLowerCase()] : m,
  );
}

function trimSlash(p) {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

/**
 * Does an export value already name sdkPath once the shell expands it?
 * Handles quotes, a leading $HOME / ${HOME} (not inside single quotes) and a
 * leading ~ (unquoted only), the forms installers and users write.
 *
 * @param {string} value - the raw value as written in the profile
 * @param {string} sdkPath
 * @param {string} home
 * @returns {boolean}
 */
function exportValueMatches(value, sdkPath, home) {
  const single = value.startsWith("'");
  const double = value.startsWith('"');
  let v = single || double ? value.slice(1, -1) : value;
  if (!single) v = v.replace(/^(\$HOME(?![A-Za-z0-9_])|\$\{HOME\})/, home);
  if (!single && !double) v = v.replace(/^~(?=\/|$)/, home);
  return trimSlash(v) === trimSlash(sdkPath);
}

/**
 * Rewrite the value of every active `export TIZEN_SDK_PATH=…` to sdkPath,
 * keeping the rest of the line (`; export PATH=…`, comments). A value that
 * already expands to sdkPath (`$HOME/tizen-sdk`, `~/tizen-sdk`) is left as
 * written.
 *
 * @param {string} text - profile contents
 * @param {string} sdkPath
 * @param {string} [home] - for $HOME / ~ (os.homedir())
 * @returns {{text: string, changed: boolean}}
 */
function rewriteProfileExport(text, sdkPath, home = os.homedir()) {
  let changed = false;
  const out = text.replace(EXPORT_VALUE, (match, prefix, value) => {
    if (exportValueMatches(value, sdkPath, home)) return match;
    changed = true;
    return `${prefix}"${sdkPath}"`;
  });
  return { text: out, changed };
}

/**
 * Replace the old SDKs' bin / tools / tools\tizen-core entries of a Windows
 * Path value with newRoot's. Entries are compared after %VAR% expansion,
 * case- and trailing-backslash-insensitively; other entries keep their exact
 * text and order. An entry that would duplicate a new SDK entry already
 * present is dropped.
 *
 * @param {string} pathValue - ';'-separated, unexpanded Path
 * @param {string[]} oldRoots - previous SDK roots
 * @param {string} newRoot
 * @param {object} [env] - variables for %VAR% expansion (process.env)
 * @returns {{value: string, changed: boolean}}
 */
function replaceSdkPathEntries(
  pathValue,
  oldRoots,
  newRoot,
  env = process.env,
) {
  const keyOf = (p) => winKey(expandWinVars(p, env));
  const newKey = keyOf(newRoot);
  const oldEntries = new Map();
  for (const root of oldRoots) {
    if (!root || keyOf(root) === newKey) continue;
    for (const sub of WIN_SDK_SUBDIRS) {
      oldEntries.set(keyOf(path.win32.join(root, sub)), sub);
    }
  }
  const newEntryKeys = new Set(
    WIN_SDK_SUBDIRS.map((sub) => keyOf(path.win32.join(newRoot, sub))),
  );

  let changed = false;
  const seenNew = new Set();
  const out = [];
  for (const entry of String(pathValue || "").split(";")) {
    if (entry === "") continue;
    const sub = oldEntries.get(keyOf(entry));
    const next = sub ? path.win32.join(newRoot, sub) : entry;
    const key = keyOf(next);
    if (newEntryKeys.has(key)) {
      if (seenNew.has(key)) {
        changed = true;
        continue;
      }
      seenNew.add(key);
    }
    if (sub) changed = true;
    out.push(next);
  }
  return { value: out.join(";"), changed };
}

// Windows PowerShell 5.1 writes piped stdout in the console code page (CP949
// on Korean Windows), which would garble non-ASCII Path entries. The read
// script therefore prints Base64 of the UTF-8 JSON (pure ASCII); values going
// the other way travel in environment variables, which Windows passes as
// UTF-16.
const PS_READ =
  "$k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment'); " +
  "$o = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames; " +
  "$names = if ($k) { $k.GetValueNames() } else { @() }; " +
  "$r = @{ path = ''; kind = 'ExpandString'; sdk = '' }; " +
  "if ($names -contains 'Path') { $r.path = $k.GetValue('Path', '', $o); " +
  "$r.kind = $k.GetValueKind('Path').ToString() }; " +
  "if ($names -contains 'TIZEN_SDK_PATH') { $r.sdk = $k.GetValue('TIZEN_SDK_PATH', '', $o) }; " +
  "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($r | ConvertTo-Json -Compress)))";

// Path is written through the registry so its value kind (REG_EXPAND_SZ)
// and %VAR% entries are kept; TIZEN_SDK_PATH goes through
// SetEnvironmentVariable, which also broadcasts WM_SETTINGCHANGE so newly
// started terminals see both changes.
const PS_WRITE =
  "$ErrorActionPreference = 'Stop'; " +
  "if ($env:TZ_SYNC_PATH_CHANGED -eq '1') { " +
  "$k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment'); " +
  "$k.SetValue('Path', $env:TZ_SYNC_PATH, ([Microsoft.Win32.RegistryValueKind]$env:TZ_SYNC_PATH_KIND)); " +
  "$k.Close() }; " +
  "[Environment]::SetEnvironmentVariable('TIZEN_SDK_PATH', $env:TZ_SYNC_SDK, 'User')";

function runPowerShell(script, env) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", env: { ...process.env, ...env }, windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || "").trim() || `exit ${result.status}`);
  }
  return result.stdout;
}

function syncWindows(sdkPath, previousPath) {
  const encoded = runPowerShell(PS_READ).trim();
  const current = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const kind = current.kind === "String" ? "String" : "ExpandString";
  const { value, changed } = replaceSdkPathEntries(
    current.path || "",
    [previousPath, current.sdk],
    sdkPath,
  );
  const sdkChanged = winKey(current.sdk || "") !== winKey(sdkPath);
  const updated = [];
  if (!sdkChanged && !changed) return updated;

  runPowerShell(PS_WRITE, {
    TZ_SYNC_SDK: sdkPath,
    TZ_SYNC_PATH: value,
    TZ_SYNC_PATH_KIND: kind,
    TZ_SYNC_PATH_CHANGED: changed ? "1" : "0",
  });
  if (sdkChanged) updated.push("TIZEN_SDK_PATH (user environment)");
  if (changed) updated.push("Path SDK entries (user environment)");
  return updated;
}

function syncPosix(sdkPath, warnings) {
  const unsafe = shellUnsafeReason(sdkPath);
  if (unsafe) {
    warnings.push(
      `TIZEN_SDK_PATH not updated in shell profiles: the SDK path ${unsafe}.`,
    );
    return [];
  }
  const updated = [];
  for (const name of PROFILE_FILES) {
    const file = path.join(os.homedir(), name);
    if (!fs.existsSync(file)) continue;
    const { text, changed } = rewriteProfileExport(
      fs.readFileSync(file, "utf8"),
      sdkPath,
    );
    if (!changed) continue;
    fs.writeFileSync(file, text, "utf8");
    updated.push(`TIZEN_SDK_PATH in ${file}`);
  }
  return updated;
}

/**
 * Sync the persistent TIZEN_SDK_PATH (and Windows Path SDK entries) to sdkPath.
 * Never throws: a failure becomes a warning, because the config file — the
 * source every runner reads — is already right.
 *
 * @param {string} sdkPath - the path in the config file
 * @param {string|null} previousPath - the config value it replaced, if any
 * @returns {{updated: string[], warnings: string[]}}
 */
function syncSdkPathEnv(sdkPath, previousPath = null) {
  const warnings = [];
  if (process.env.TIZEN_SDK_ENV_SYNC === "0") return { updated: [], warnings };

  process.env.TIZEN_SDK_PATH = sdkPath;
  try {
    const updated =
      process.platform === "win32"
        ? syncWindows(sdkPath, previousPath)
        : syncPosix(sdkPath, warnings);
    return { updated, warnings };
  } catch (error) {
    warnings.push(
      `Could not update TIZEN_SDK_PATH in the user environment: ${error.message}. ` +
        `Set it to ${sdkPath} by hand.`,
    );
    return { updated: [], warnings };
  }
}

module.exports = {
  syncSdkPathEnv,
  rewriteProfileExport,
  replaceSdkPathEntries,
  expandWinVars,
};
