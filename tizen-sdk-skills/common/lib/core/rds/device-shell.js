// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Device-shell argument safety for RDS.
 *
 * The RDS primitives in sdb-helper.js spawn `sdb` with an argv array (no host
 * shell), but `sdb shell a b c` re-joins its arguments with spaces and hands
 * the resulting string to the *device's* `/bin/sh`. Anything that reaches
 * `execute()` is therefore parsed by a shell once more on the device — a path
 * with a space is split into two words, `[id].js` becomes a glob, and `|`,
 * `&`, `>` or `$(...)` are interpreted. shell-safety.js screens host-side
 * interpolation and deliberately permits spaces and `*`, so it is not the
 * right filter here.
 *
 * Two layers, both applied to every device path RDS composes:
 *   1. {@link assertDevicePathSafe} — a strict allowlist. Device paths RDS
 *      handles are app-install roots plus build-output relative paths, which
 *      never legitimately contain shell-significant characters.
 *   2. {@link quoteDeviceArg} — POSIX single-quoting, so even an allowed
 *      character set is delivered to the device shell as one literal word.
 *
 * @module core/rds/device-shell
 */

/**
 * Characters permitted in a device path RDS composes. Deliberately narrow:
 * letters, digits, `.`, `_`, `-`, `+`, `@`, `=`, `,` and the `/` separator.
 */
const SAFE_DEVICE_PATH = /^[A-Za-z0-9._+@=,/-]+$/;

/**
 * Tizen package IDs are alphanumeric with `.`/`_`/`-` (e.g. `org.example.app`
 * or a generated 10-char ID). Anything else came from a malformed manifest.
 */
const SAFE_PACKAGE_ID = /^[A-Za-z0-9._-]+$/;

/**
 * @param {string} value
 * @returns {boolean}
 */
function isSafeDevicePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    SAFE_DEVICE_PATH.test(value) &&
    !value.split("/").includes("..")
  );
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isSafePackageId(value) {
  return typeof value === "string" && SAFE_PACKAGE_ID.test(value);
}

/**
 * Throw unless `value` is a device path RDS may splice into a remote command.
 *
 * @param {string} value
 * @param {string} [what="device path"] - noun for the error message
 * @throws {Error}
 */
function assertDevicePathSafe(value, what = "device path") {
  if (!isSafeDevicePath(value)) {
    throw new Error(
      `${what} contains characters unsafe for the device shell: ${JSON.stringify(value)}`,
    );
  }
}

/**
 * Single-quote a string for a POSIX shell: wraps in `'…'` and turns every
 * embedded `'` into `'\''`. The result is always exactly one word on the
 * device, regardless of spaces, globs or metacharacters.
 *
 * @param {string} value
 * @returns {string}
 */
function quoteDeviceArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

module.exports = {
  isSafeDevicePath,
  isSafePackageId,
  assertDevicePathSafe,
  quoteDeviceArg,
};
