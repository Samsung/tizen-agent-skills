// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Platform-specific password storage for Samsung certificates.
 *
 * Handles encryption/decryption of certificate passwords using OS-level secure storage:
 *   - Windows: wincrypt.exe from Tizen SDK (wraps Windows DPAPI)
 *   - macOS: Keychain (via `security` command)
 *   - Linux: libsecret (via `secret-tool` command)
 *
 * Passwords are never stored in plaintext on disk. The .pwd file either contains:
 *   - Windows: encrypted blob (via wincrypt.exe)
 *   - macOS/Linux: JSON marker pointing to the Keychain/Secret Service backend
 */

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { readSdkPath } = require("./sdk");

/**
 * Find wincrypt.exe in the Tizen SDK installation.
 *
 * Resolves the SDK root from `~/.tizen.sdk.path.config` (via `readSdkPath()`)
 * rather than assuming `~/tizen-sdk`. Falls back to the legacy default path
 * and a PATH lookup.
 *
 * @private
 * @returns {string|null} path to wincrypt.exe, or null if not found
 */
function findWincrypt() {
  if (process.platform !== "win32") {
    return null;
  }

  // Resolve the SDK root from the config file (readSdkPath already falls back
  // to ~/tizen-sdk when the config is missing or empty).
  const sdkPath = readSdkPath();
  const possiblePaths = [
    // Standard Tizen SDK tools location (correct path)
    path.join(sdkPath, "tools", "certificate-encryptor", "wincrypt.exe"),
    // Fallback locations within the SDK root
    path.join(sdkPath, "tools", "certificate-manager", "wincrypt.exe"),
    path.join(sdkPath, "tools", "wincrypt.exe"),
    // Also check in PATH
    "wincrypt.exe",
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch (_) {
      // Ignore errors, try next path
    }
  }

  return null;
}

/**
 * Find secret-tool in the Tizen SDK installation.
 *
 * Resolves the SDK root from `~/.tizen.sdk.path.config` (via `readSdkPath()`).
 * The secret-tool is provided by the TV SDK extension at
 * {SDK_PATH}/tools/certificate-encryptor/secret-tool.
 *
 * @private
 * @returns {string} path to secret-tool
 * @throws {Error} if secret-tool is not found (TV SDK not installed)
 */
function findSecretTool() {
  if (process.platform !== "linux") {
    return null;
  }

  // Resolve the SDK root from the config file (readSdkPath already falls back
  // to ~/tizen-sdk when the config is missing or empty).
  const sdkPath = readSdkPath();
  const secretToolPath = path.join(
    sdkPath,
    "tools",
    "certificate-encryptor",
    "secret-tool",
  );

  if (fs.existsSync(secretToolPath)) {
    return secretToolPath;
  }

  throw new Error(
    "TV SDK not installed: secret-tool not found at " +
      secretToolPath +
      ". Please install the TV SDK extension.",
  );
}

/**
 * The caught error, safe to keep as `cause`.
 *
 * A spawn failure (ENOENT, EACCES, ...) carries `spawnargs`, the full argument
 * list. For these commands that list holds the plaintext password
 * (`wincrypt.exe --encrypt <pw>`, `security ... -w <pw>`,
 * `secret-tool store --password=<pw>`), and `util.inspect` / `console.error`
 * print a cause's own fields. So `spawnargs` is dropped; `code`, `errno`,
 * `syscall` and `path` stay.
 *
 * @param {unknown} err
 * @returns {unknown}
 */
function withoutSpawnArgs(err) {
  if (!err || typeof err !== "object" || !("spawnargs" in err)) return err;
  const { spawnargs: _spawnargs, ...rest } = err;
  return Object.assign(new Error(err.message), rest);
}

/**
 * Encrypt password using platform-specific secure storage.
 *
 * @param {string} password - the certificate password to encrypt
 * @param {string} pwdFilePath - where to write the encrypted/marker file
 * @returns {Promise<void>}
 * @throws {Error} with message "samsung_pwd_store_failed: ..."
 */
async function encryptPassword(password, pwdFilePath) {
  const platform = process.platform;

  try {
    if (platform === "win32") {
      await encryptPasswordWindows(password, pwdFilePath);
    } else if (platform === "darwin") {
      await encryptPasswordMacOS(password, pwdFilePath);
    } else if (platform === "linux") {
      await encryptPasswordLinux(password, pwdFilePath);
    } else {
      throw new Error(
        `samsung_pwd_store_failed: unsupported platform ${platform}`,
      );
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (!msg.includes("samsung_pwd_store_failed")) {
      // err is what the platform helper rejected with; it already holds its
      // spawn failure through withoutSpawnArgs().
      throw new Error(`samsung_pwd_store_failed: ${msg}`, { cause: err });
    }
    throw err;
  }
}

/**
 * Decrypt password using platform-specific secure storage.
 *
 * @param {string} pwdFilePath - path to the encrypted/marker file
 * @returns {Promise<string>} the decrypted password
 * @throws {Error} with message "samsung_pwd_store_failed: ..."
 */
async function decryptPassword(pwdFilePath) {
  const platform = process.platform;

  try {
    if (platform === "win32") {
      return await decryptPasswordWindows(pwdFilePath);
    } else if (platform === "darwin") {
      return await decryptPasswordMacOS(pwdFilePath);
    } else if (platform === "linux") {
      return await decryptPasswordLinux(pwdFilePath);
    } else {
      throw new Error(
        `samsung_pwd_store_failed: unsupported platform ${platform}`,
      );
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (!msg.includes("samsung_pwd_store_failed")) {
      // err is what the platform helper rejected with; it already holds its
      // spawn failure through withoutSpawnArgs().
      throw new Error(`samsung_pwd_store_failed: ${msg}`, { cause: err });
    }
    throw err;
  }
}

/**
 * Windows: encrypt password using wincrypt.exe from Tizen SDK.
 *
 * @private
 */
async function encryptPasswordWindows(password, pwdFilePath) {
  return new Promise((resolve, reject) => {
    // Find wincrypt.exe
    const wincryptPath = findWincrypt();
    if (!wincryptPath) {
      reject(
        new Error(
          "samsung_pwd_store_failed: wincrypt.exe not found in Tizen SDK",
        ),
      );
      return;
    }

    // wincrypt.exe --encrypt <password> <file>
    const proc = spawn(wincryptPath, ["--encrypt", password, pwdFilePath], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (_code) => {
      // Note: wincrypt.exe returns exit code 1 even on success; only check stderr for actual errors
      if (stderr) {
        reject(
          new Error(
            `samsung_pwd_store_failed: wincrypt.exe encrypt failed: ${stderr}`,
          ),
        );
        return;
      }
      resolve();
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn wincrypt.exe: ${err.message}`,
          { cause: withoutSpawnArgs(err) },
        ),
      );
    });
  });
}

/**
 * Parse `wincrypt.exe --decrypt` output: the first line is "PASSWORD:<value>".
 *
 * Lines are split on CRLF as well as LF — wincrypt is a Windows program, and
 * splitting on "\n" alone left a trailing "\r" in the password whenever more
 * than one line followed. Only leading whitespace before the first line is
 * dropped, so trailing spaces that belong to the password are kept.
 *
 * @private
 * @param {string} stdout
 * @returns {{password: string|null, line: string}} password null when the
 *   first line is not a PASSWORD: line
 */
function parseWincryptOutput(stdout) {
  const prefix = "PASSWORD:";
  const line = String(stdout).trimStart().split(/\r?\n/)[0];
  return {
    password: line.startsWith(prefix) ? line.slice(prefix.length) : null,
    line,
  };
}

/**
 * Windows: decrypt password using wincrypt.exe from Tizen SDK.
 *
 * @private
 */
async function decryptPasswordWindows(pwdFilePath) {
  return new Promise((resolve, reject) => {
    // Find wincrypt.exe
    const wincryptPath = findWincrypt();
    if (!wincryptPath) {
      reject(
        new Error(
          "samsung_pwd_store_failed: wincrypt.exe not found in Tizen SDK",
        ),
      );
      return;
    }

    // wincrypt.exe --decrypt <file>  → stdout: PASSWORD:<value>
    // spawn() has no `encoding` option; setEncoding() decodes each stream with
    // a StringDecoder, so a character split across chunks stays intact.
    const proc = spawn(wincryptPath, ["--decrypt", pwdFilePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (_code) => {
      // Note: wincrypt.exe returns exit code 1 even on success; check stderr and stdout
      if (stderr) {
        reject(
          new Error(
            `samsung_pwd_store_failed: wincrypt.exe decrypt failed: ${stderr}`,
          ),
        );
        return;
      }

      const parsed = parseWincryptOutput(stdout);
      if (parsed.password !== null) {
        resolve(parsed.password);
      } else {
        reject(
          new Error(
            `samsung_pwd_store_failed: wincrypt.exe returned unexpected output: ${parsed.line}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn wincrypt.exe: ${err.message}`,
          { cause: withoutSpawnArgs(err) },
        ),
      );
    });
  });
}

/**
 * macOS: encrypt password using Keychain (via `security` command).
 * The actual secret is stored in Keychain; the .pwd file is a marker.
 *
 * @private
 */
async function encryptPasswordMacOS(password, pwdFilePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "add-generic-password",
      "-a",
      pwdFilePath,
      "-s",
      "certificate-manager",
      "-w",
      password,
      "-U",
    ];

    const proc = spawnSync("security", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });

    if (proc.error) {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn security: ${proc.error.message}`,
          { cause: withoutSpawnArgs(proc.error) },
        ),
      );
      return;
    }

    // The exit code decides: `security` can print a warning on stderr and
    // still store the item, and treating that as failure skipped the marker.
    if (proc.status !== 0) {
      reject(
        new Error(
          `samsung_pwd_store_failed: Keychain encrypt failed: ${proc.stderr || `exit code ${proc.status}`}`,
        ),
      );
      return;
    }

    // Write marker file
    try {
      fs.writeFileSync(
        pwdFilePath,
        JSON.stringify({ backend: "macos-keychain" }),
        "utf-8",
      );
      resolve();
    } catch (err) {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to write marker file: ${err.message}`,
          { cause: err },
        ),
      );
    }
  });
}

/**
 * macOS: decrypt password using Keychain (via `security` command).
 *
 * @private
 */
async function decryptPasswordMacOS(pwdFilePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "find-generic-password",
      "-wa",
      pwdFilePath,
      "-s",
      "certificate-manager",
    ];

    const proc = spawnSync("security", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });

    if (proc.error) {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn security: ${proc.error.message}`,
          { cause: withoutSpawnArgs(proc.error) },
        ),
      );
      return;
    }

    if (proc.status !== 0) {
      reject(
        new Error(
          `samsung_pwd_store_failed: Keychain decrypt failed: ${proc.stderr || `exit code ${proc.status}`}`,
        ),
      );
      return;
    }

    const password = proc.stdout.trim();
    resolve(password);
  });
}

/**
 * Linux: encrypt password using libsecret (via `secret-tool` command).
 *
 * SECURITY NOTE: The SDK's secret-tool only supports --password flag.
 * Password exposure via process list (ps, /proc/pid/cmdline) is a known
 * limitation that cannot be mitigated without modifying the SDK tool itself.
 * The secret-tool binary would need to be updated to support stdin (-p -)
 * like the standard libsecret secret-tool.
 *
 * The actual secret is stored in Secret Service; the .pwd file is a marker.
 *
 * @private
 */
async function encryptPasswordLinux(password, pwdFilePath) {
  return new Promise((resolve, reject) => {
    // Find secret-tool from Tizen SDK
    let secretToolPath;
    try {
      secretToolPath = findSecretTool();
    } catch (err) {
      reject(err);
      return;
    }

    // SDK's secret-tool only supports --password flag (no stdin support).
    // This is a known security limitation - the password is visible in process
    // listings (ps, /proc/pid/cmdline) during the brief execution window.
    const args = [
      "store",
      "--label=tizen-studio",
      "--password=" + password,
      "keyfile",
      pwdFilePath,
      "tool",
      "certificate-manager",
    ];

    const proc = spawn(secretToolPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });

    let stderr = "";
    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (code) => {
      // The exit code decides (a libsecret / GLib warning on stderr does not
      // mean the store failed); null — killed, e.g. by the timeout — fails.
      if (code !== 0) {
        reject(
          new Error(
            `samsung_pwd_store_failed: secret-tool store failed: ${stderr || `exit code ${code}`}`,
          ),
        );
        return;
      }

      // Write marker file
      try {
        fs.writeFileSync(
          pwdFilePath,
          JSON.stringify({ backend: "linux-secret-tool" }),
          "utf-8",
        );
        resolve();
      } catch (err) {
        reject(
          new Error(
            `samsung_pwd_store_failed: failed to write marker file: ${err.message}`,
            { cause: err },
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn secret-tool: ${err.message}`,
          { cause: withoutSpawnArgs(err) },
        ),
      );
    });
  });
}

/**
 * Linux: decrypt password using libsecret (via `secret-tool` command).
 *
 * @private
 */
async function decryptPasswordLinux(pwdFilePath) {
  return new Promise((resolve, reject) => {
    // Find secret-tool from Tizen SDK
    let secretToolPath;
    try {
      secretToolPath = findSecretTool();
    } catch (err) {
      reject(err);
      return;
    }

    const args = [
      "lookup",
      "--label=tizen-studio",
      "keyfile",
      pwdFilePath,
      "tool",
      "certificate-manager",
    ];

    const proc = spawn(secretToolPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (code) => {
      // Same rule as store: exit code, not the presence of stderr output.
      if (code !== 0) {
        reject(
          new Error(
            `samsung_pwd_store_failed: secret-tool lookup failed: ${stderr || `exit code ${code}`}`,
          ),
        );
        return;
      }

      const password = stdout.trim();
      resolve(password);
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn secret-tool: ${err.message}`,
          { cause: withoutSpawnArgs(err) },
        ),
      );
    });
  });
}

module.exports = {
  encryptPassword,
  decryptPassword,
  // Exports for testing
  withoutSpawnArgs,
  parseWincryptOutput,
  encryptPasswordWindows,
  decryptPasswordWindows,
  encryptPasswordMacOS,
  decryptPasswordMacOS,
  encryptPasswordLinux,
  decryptPasswordLinux,
};
