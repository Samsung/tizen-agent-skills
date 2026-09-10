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
      throw new Error(`samsung_pwd_store_failed: ${msg}`);
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
      throw new Error(`samsung_pwd_store_failed: ${msg}`);
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
    proc.stderr.on("data", (data) => {
      stderr += data.toString("utf-8");
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
        ),
      );
    });
  });
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
    const proc = spawn(wincryptPath, ["--decrypt", pwdFilePath], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });

    let stdout = "";
    let stderr = "";
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

      // Parse stdout: "PASSWORD:<value>"
      const prefix = "PASSWORD:";
      const line = stdout.trim().split("\n")[0]; // first line only
      if (line.startsWith(prefix)) {
        const password = line.substring(prefix.length);
        resolve(password);
      } else {
        reject(
          new Error(
            `samsung_pwd_store_failed: wincrypt.exe returned unexpected output: ${line}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn wincrypt.exe: ${err.message}`,
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
        ),
      );
      return;
    }

    if (proc.status !== 0 || proc.stderr) {
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
    proc.stderr.on("data", (data) => {
      stderr += data.toString("utf-8");
    });

    proc.on("close", (code) => {
      if (code !== 0 || stderr) {
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
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `samsung_pwd_store_failed: failed to spawn secret-tool: ${err.message}`,
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

    proc.stdout.on("data", (data) => {
      stdout += data.toString("utf-8");
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString("utf-8");
    });

    proc.on("close", (code) => {
      if (code !== 0 || stderr) {
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
        ),
      );
    });
  });
}

module.exports = {
  encryptPassword,
  decryptPassword,
  // Exports for testing
  encryptPasswordWindows,
  decryptPasswordWindows,
  encryptPasswordMacOS,
  decryptPasswordMacOS,
  encryptPasswordLinux,
  decryptPasswordLinux,
};
