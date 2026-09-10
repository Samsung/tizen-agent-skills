// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Standard JSON Envelope tests
 * Requirements: REQ-SDK-OUT-001, REQ-SDK-OUT-002, REQ-SDK-OUT-003
 *
 * Covers the pure envelope layer (no I/O):
 *   - wrapEnvelope: success / failure shape, error-code lookup by category
 *   - CommonErrors: the canned failures resolve to the registered error codes
 *   - Envelope.success / Envelope.failure: field set, warnings passthrough,
 *     error normalization (defaults, details, suggested_fix), duration_ms
 */

const {
  wrapEnvelope,
  CommonErrors,
  Envelope,
  ERROR_CODES,
} = require("../envelope/envelope-wrapper");

console.log("=== Envelope Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Every envelope — success or failure — must carry exactly these top-level
// keys so agents can branch on `status` without probing for optional fields.
const SUCCESS_KEYS = [
  "status",
  "result",
  "warnings",
  "errors",
  "command",
  "duration_ms",
];
const FAILURE_KEYS = ["status", "errors", "command", "duration_ms"];

// --- 1. wrapEnvelope: success --------------------------------------------
console.log("--- wrapEnvelope success ---");
{
  const result = {
    sdk_path: "/opt/tizen-studio",
    config_file: "/home/user/.tizen.sdk.path.config",
  };
  const env = wrapEnvelope("tizen-sdk sdk-init", result);
  check("status is success", env.status, "success");
  check("command echoed", env.command, "tizen-sdk sdk-init");
  check("result passed through untouched", env.result, result);
  check("warnings default to []", env.warnings, []);
  check("errors is [] on success", env.errors, []);
  check("top-level keys", Object.keys(env).sort(), SUCCESS_KEYS.slice().sort());
  check("duration_ms is a number", typeof env.duration_ms, "number");
  check("duration_ms is non-negative", env.duration_ms >= 0, true);
}

// --- 2. wrapEnvelope: failure --------------------------------------------
console.log("\n--- wrapEnvelope failure ---");
{
  const env = wrapEnvelope(
    "tizen-sdk build-project",
    null,
    "sdk_path_not_set",
    "SDK path missing",
    {
      command: "tizen-cli tizen-sdk sdk-init --sdk-path <path>",
      guide_url: "https://example.invalid/guide",
    },
  );
  check("status is failure", env.status, "failure");
  check("top-level keys", Object.keys(env).sort(), FAILURE_KEYS.slice().sort());
  check("no result key on failure", "result" in env, false);
  check("exactly one error", env.errors.length, 1);
  check(
    "error_code resolved from category",
    env.errors[0].error_code,
    "TIZEN_SDK_CONFIG_E001",
  );
  check(
    "error_category kept",
    env.errors[0].error_category,
    "sdk_path_not_set",
  );
  check("message kept", env.errors[0].message, "SDK path missing");
  check(
    "suggested_fix normalized (auto_fixable defaults to false)",
    env.errors[0].suggested_fix,
    {
      command: "tizen-cli tizen-sdk sdk-init --sdk-path <path>",
      auto_fixable: false,
      guide_url: "https://example.invalid/guide",
    },
  );
}
{
  const env = wrapEnvelope("x", null, "no_such_category", "boom");
  check(
    "unknown category → UNKNOWN_E001",
    env.errors[0].error_code,
    "TIZEN_SDK_UNKNOWN_E001",
  );
  check(
    "unknown category name preserved",
    env.errors[0].error_category,
    "no_such_category",
  );
  check(
    "no suggested_fix when none given",
    "suggested_fix" in env.errors[0],
    false,
  );
}
{
  const env = wrapEnvelope("x", null);
  check(
    "missing category → unknown_error",
    env.errors[0].error_category,
    "unknown_error",
  );
  check(
    "missing message → default text",
    env.errors[0].message,
    "Unknown error occurred",
  );
}

// --- 3. CommonErrors resolve to registered codes --------------------------
console.log("\n--- CommonErrors ---");
{
  const e = CommonErrors.sdkPathNotSet("tizen-sdk build-project");
  check("sdkPathNotSet: status", e.status, "failure");
  check("sdkPathNotSet: command", e.command, "tizen-sdk build-project");
  check(
    "sdkPathNotSet: code",
    e.errors[0].error_code,
    ERROR_CODES.SDK_PATH_NOT_SET.error_code,
  );
  check(
    "sdkPathNotSet: has init command in fix",
    e.errors[0].suggested_fix.command.includes("sdk-init"),
    true,
  );
  check(
    "sdkPathNotSet: guide_url kept",
    e.errors[0].suggested_fix.guide_url,
    ERROR_CODES.SDK_PATH_NOT_SET.suggested_fix.guide_url,
  );
}
{
  const e = CommonErrors.deviceNotFound("tizen-sdk install-app");
  check(
    "deviceNotFound: code",
    e.errors[0].error_code,
    ERROR_CODES.DEVICE_NOT_FOUND.error_code,
  );
  check(
    "deviceNotFound: category",
    e.errors[0].error_category,
    "device_not_found",
  );
  check(
    "deviceNotFound: fix points at emulator",
    e.errors[0].suggested_fix.command.includes("emulator"),
    true,
  );
}
{
  const e = CommonErrors.buildFailed(
    "tizen-sdk build-project",
    "Compilation error in main.c:42",
  );
  check(
    "buildFailed: code",
    e.errors[0].error_code,
    ERROR_CODES.BUILD_FAILED.error_code,
  );
  check(
    "buildFailed: reason is the message",
    e.errors[0].message,
    "Compilation error in main.c:42",
  );
  check(
    "buildFailed: no suggested_fix (none registered)",
    "suggested_fix" in e.errors[0],
    false,
  );
}
{
  const e = CommonErrors.templateNotFound(
    "tizen-sdk create-project",
    "web-basic",
  );
  check(
    "templateNotFound: code",
    e.errors[0].error_code,
    ERROR_CODES.TEMPLATE_NOT_FOUND.error_code,
  );
  check(
    "templateNotFound: names the template",
    e.errors[0].message.includes("'web-basic'"),
    true,
  );
}
{
  const e = CommonErrors.emulatorNotFound("tizen-sdk launch-emulator", "my-vm");
  check(
    "emulatorNotFound: code",
    e.errors[0].error_code,
    ERROR_CODES.EMULATOR_NOT_FOUND.error_code,
  );
  const r = CommonErrors.emulatorAlreadyRunning(
    "tizen-sdk launch-emulator",
    "my-vm",
  );
  check(
    "emulatorAlreadyRunning: code",
    r.errors[0].error_code,
    ERROR_CODES.EMULATOR_ALREADY_RUNNING.error_code,
  );
}
{
  // Defaults must be usable without arguments.
  check(
    "sdkPathNotSet default command",
    CommonErrors.sdkPathNotSet().command,
    "tizen-sdk command",
  );
  check(
    "deviceNotFound default command",
    CommonErrors.deviceNotFound().command,
    "tizen-sdk install-app",
  );
}

// --- 4. Envelope class: success options -----------------------------------
console.log("\n--- Envelope.success ---");
{
  const env = new Envelope("tizen-sdk device-manager list").success(
    { devices: [{ device_id: "emulator-26101" }] },
    { warnings: ["sdb server restarted"] },
  );
  check("warnings passed through", env.warnings, ["sdb server restarted"]);
  check("result passed through", env.result, {
    devices: [{ device_id: "emulator-26101" }],
  });
  check("errors empty", env.errors, []);
}

// --- 5. Envelope class: failure normalization -----------------------------
console.log("\n--- Envelope.failure ---");
{
  const env = new Envelope("x").failure({});
  check(
    "empty error → UNKNOWN_E001",
    env.errors[0].error_code,
    "TIZEN_SDK_UNKNOWN_E001",
  );
  check(
    "empty error → unknown_error",
    env.errors[0].error_category,
    "unknown_error",
  );
  check(
    "empty error → default message",
    env.errors[0].message,
    "Unknown error occurred",
  );
  check("empty error → no details key", "details" in env.errors[0], false);
  check(
    "empty error → no suggested_fix key",
    "suggested_fix" in env.errors[0],
    false,
  );
}
{
  const env = new Envelope("x").failure([
    { error_code: "A", error_category: "a", message: "first" },
    { error_code: "B", error_category: "b", message: "second" },
  ]);
  check(
    "array of errors kept in order",
    env.errors.map((e) => e.error_code),
    ["A", "B"],
  );
}
{
  const env = new Envelope("x").failure({
    message: "m",
    details: ["main.c:42: error", "main.c:43: error"],
  });
  check("non-empty details kept", env.errors[0].details, [
    "main.c:42: error",
    "main.c:43: error",
  ]);
  const empty = new Envelope("x").failure({ message: "m", details: [] });
  check("empty details dropped", "details" in empty.errors[0], false);
  const notArray = new Envelope("x").failure({
    message: "m",
    details: "not an array",
  });
  check("non-array details dropped", "details" in notArray.errors[0], false);
}
{
  const env = new Envelope("x").failure({
    message: "m",
    suggested_fix: { command: "do this", auto_fixable: true },
  });
  check(
    "suggested_fix.auto_fixable=true preserved",
    env.errors[0].suggested_fix.auto_fixable,
    true,
  );
  check(
    "suggested_fix.guide_url defaults to null",
    env.errors[0].suggested_fix.guide_url,
    null,
  );
  const noCmd = new Envelope("x").failure({
    message: "m",
    suggested_fix: { guide_url: "u" },
  });
  check(
    "suggested_fix.command defaults to null",
    noCmd.errors[0].suggested_fix.command,
    null,
  );
  check(
    "suggested_fix.auto_fixable defaults to false",
    noCmd.errors[0].suggested_fix.auto_fixable,
    false,
  );
}

// --- 6. ERROR_CODES registry sanity ---------------------------------------
console.log("\n--- ERROR_CODES registry ---");
{
  const entries = Object.values(ERROR_CODES);
  const codes = entries.map((e) => e.error_code);
  const categories = entries.map((e) => e.error_category);
  check(
    "every entry has error_code and error_category",
    entries.every((e) => e.error_code && e.error_category),
    true,
  );
  check("error codes are unique", new Set(codes).size, codes.length);
  check(
    "error categories are unique",
    new Set(categories).size,
    categories.length,
  );
  check(
    "error codes follow TIZEN_SDK_<DOMAIN>_E<NNN>",
    codes.every((c) => /^TIZEN_SDK_[A-Z]+_E\d{3}$/.test(c)),
    true,
  );
}

// --- 7. duration_ms measures elapsed time (async) -------------------------
console.log("\n--- duration_ms ---");
const timed = new Envelope("tizen-sdk sdk-status");
setTimeout(() => {
  const env = timed.success({ sdk_path: "/opt/tizen-studio" });
  check(
    "duration_ms reflects elapsed time (>= 50ms after 100ms wait)",
    env.duration_ms >= 50,
    true,
  );
  check("duration_ms is an integer", Number.isInteger(env.duration_ms), true);

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}, 100);
