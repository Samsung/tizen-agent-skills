// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Keep the user's TIZEN_SDK_PATH in line with ~/.tizen.sdk.path.config.
 *
 * Every runner reads the SDK path from the config file only (readSdkPath), so
 * a TIZEN_SDK_PATH left over from an earlier install points shells — and the
 * user typing `sdb` — at a different SDK than the runners use. Whenever the
 * config is written, sync the persistent environment to it:
 *
 *   - Windows: the user-scope TIZEN_SDK_PATH, and the old SDK's
 *     bin / tools / tools\tizen-core entries of the user-scope Path are
 *     replaced with the new SDK's (other Path entries are left alone; nothing
 *     is added when no old SDK entry is there).
 *   - POSIX: an existing `export TIZEN_SDK_PATH=…` line in ~/.zshrc,
 *     ~/.bashrc, ~/.bash_profile or ~/.profile is rewritten. A profile without
 *     one is left alone — there is nothing to disagree with the config.
 *
 * A running shell keeps its old value either way (a child process cannot
 * change its parent's environment), so the caller tells the user to open a new
 * terminal. TIZEN_SDK_ENV_SYNC=0 turns the sync off (used by the unit tests so
 * they never touch the real user environment).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { shellUnsafeReason } = require("./shell-safety");

const PROFILE_FILES = [".zshrc", ".bashrc", ".bash_profile", ".profile"];
const WIN_SDK_SUBDIRS = ["bin", "tools", "tools\\tizen-core"];
const EXPORT_LINE = /^([ \t]*)export[ \t]+TIZEN_SDK_PATH=.*$/gm;

function winKey(p) {
  return path.win32.normalize(String(p)).replace(/\\+$/, "").toLowerCase();
}

/**
 * Rewrite every active `export TIZEN_SDK_PATH=…` line to sdkPath.
 *
 * @param {string} text - profile contents
 * @param {string} sdkPath
 * @returns {{text: string, changed: boolean}}
 */
function rewriteProfileExport(text, sdkPath) {
  let changed = false;
  const out = text.replace(EXPORT_LINE, (line, indent) => {
    const next = `${indent}export TIZEN_SDK_PATH="${sdkPath}"`;
    if (next !== line) changed = true;
    return next;
  });
  return { text: out, changed };
}

/**
 * Replace the old SDKs' bin / tools / tools\tizen-core entries of a Windows
 * Path value with newRoot's. Other entries keep their order and spelling; an
 * entry that would duplicate a new SDK entry already present is dropped.
 *
 * @param {string} pathValue - ';'-separated Path
 * @param {string[]} oldRoots - previous SDK roots
 * @param {string} newRoot
 * @returns {{value: string, changed: boolean}}
 */
function replaceSdkPathEntries(pathValue, oldRoots, newRoot) {
  const newKey = winKey(newRoot);
  const oldEntries = new Map();
  for (const root of oldRoots) {
    if (!root || winKey(root) === newKey) continue;
    for (const sub of WIN_SDK_SUBDIRS) {
      oldEntries.set(winKey(path.win32.join(root, sub)), sub);
    }
  }
  const newEntryKeys = new Set(
    WIN_SDK_SUBDIRS.map((sub) => winKey(path.win32.join(newRoot, sub))),
  );

  let changed = false;
  const seenNew = new Set();
  const out = [];
  for (const entry of String(pathValue || "").split(";")) {
    if (entry === "") continue;
    const sub = oldEntries.get(winKey(entry));
    const next = sub ? path.win32.join(newRoot, sub) : entry;
    const key = winKey(next);
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
  const current = JSON.parse(
    runPowerShell(
      "@{ path = [Environment]::GetEnvironmentVariable('Path','User'); " +
        "sdk = [Environment]::GetEnvironmentVariable('TIZEN_SDK_PATH','User') } " +
        "| ConvertTo-Json -Compress",
    ) || "{}",
  );
  const updated = [];
  const { value, changed } = replaceSdkPathEntries(
    current.path || "",
    [previousPath, current.sdk],
    sdkPath,
  );
  const sdkChanged = winKey(current.sdk || "") !== winKey(sdkPath);
  if (!sdkChanged && !changed) return updated;

  runPowerShell(
    "if ($env:TZ_SYNC_SDK_CHANGED -eq '1') { " +
      "[Environment]::SetEnvironmentVariable('TIZEN_SDK_PATH', $env:TZ_SYNC_SDK, 'User') }; " +
      "if ($env:TZ_SYNC_PATH_CHANGED -eq '1') { " +
      "[Environment]::SetEnvironmentVariable('Path', $env:TZ_SYNC_PATH, 'User') }",
    {
      TZ_SYNC_SDK: sdkPath,
      TZ_SYNC_SDK_CHANGED: sdkChanged ? "1" : "0",
      TZ_SYNC_PATH: value,
      TZ_SYNC_PATH_CHANGED: changed ? "1" : "0",
    },
  );
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
 * source every runner reads — has already been written.
 *
 * @param {string} sdkPath - the path just written to the config file
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
};
