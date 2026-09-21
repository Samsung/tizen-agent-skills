// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Launch — launch an already-installed app on the device without rebuilding.
 *
 * Core responsibility:
 * - Invoke `tz run --proj-dir=<projectDir> --serial=<deviceSerial>` directly,
 *   bypassing the full build→install→launch chain (`tz run-chain`) a normal
 *   `install-app --run` goes through.
 *
 * This is what makes RDS/fast-deploy fast on the launch side: the app is
 * already on the device (installed, or just delta-pushed) — this only
 * (re)launches it, with no rebuild and no package reinstall.
 *
 * Reference: packages/server/src/features/project-manager/usecases/run-project-no-chain.ts
 *            (delegates to NoChainAppRunner in device-operations/no-chain-app-runner.ts,
 *            which runs `tz run` via TzExecutor — the extension's equivalent of the
 *            CLI's `resolveTzBinary()` + direct spawn)
 *
 * @module core/rds/launch
 */

const { execFile } = require("child_process");
const { resolveTzBinary } = require("../certificate");

/** Matches DeviceCommand.validate()'s messages in the reference for parity. */
const ERR_NO_PROJECT_DIR = "Project directory is not set";
const ERR_NO_DEVICE_SERIAL = "Device serial is not set";

/** tz run rarely takes long — this only launches an already-installed app. */
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Launch an app on the device without rebuilding, using `tz run` directly
 * (not `tz run-chain`, which builds, installs, and launches).
 *
 * Mirrors the reference's `NoChainAppRunner.run()`: never throws — both
 * validation and execution failures are returned as `{status: 'error',
 * output}`, so callers (`tryRdsDeploy`) can branch on the result without a
 * try/catch.
 *
 * @param {string} projectDir - absolute path to the project directory
 * @param {string} deviceSerial - device serial to launch on
 * @param {{tzPath?: string, timeoutMs?: number}} [opts] - `tzPath` overrides
 *   `resolveTzBinary()`'s result. Not present in the reference — added solely
 *   so tests can inject a fake `tz` binary instead of requiring a configured
 *   Tizen SDK (mirrors sdb-helper.js's `opts.sdbPath` convention).
 * @returns {Promise<{status: 'success' | 'error', output: string}>}
 */
async function runNoChain(projectDir, deviceSerial, opts = {}) {
  if (!projectDir) {
    return { status: "error", output: ERR_NO_PROJECT_DIR };
  }
  if (!deviceSerial) {
    return { status: "error", output: ERR_NO_DEVICE_SERIAL };
  }

  let tzPath = opts.tzPath;
  if (!tzPath) {
    const resolved = resolveTzBinary();
    if (resolved.error) {
      return { status: "error", output: resolved.error };
    }
    tzPath = resolved.tzPath;
  }

  const args = ["run", `--proj-dir=${projectDir}`, `--serial=${deviceSerial}`];

  return new Promise((resolve) => {
    execFile(
      tzPath,
      args,
      { encoding: "utf-8", timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ status: "error", output: stderr || err.message });
        } else {
          resolve({ status: "success", output: stdout });
        }
      },
    );
  });
}

module.exports = {
  runNoChain,
};
