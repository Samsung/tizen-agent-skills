// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Envelope wrapper - automatically convert existing agent/skill responses to standard format
 *
 * Usage:
 * ```javascript
 * const { wrapEnvelope } = require('./envelope-wrapper');
 *
 * // Success response
 * console.log(JSON.stringify(
 *   wrapEnvelope('sdk init', { sdk_path: '/opt/tizen' })
 * ));
 *
 * // Failure response
 * console.log(JSON.stringify(
 *   wrapEnvelope('project run', null, 'device_not_found', 'No device found')
 * ));
 * ```
 */

const { Envelope, ERROR_CODES } = require("./envelope");

/**
 * Wrap response as Standard JSON Envelope
 *
 * @param {string} command - command (example: 'sdk init', 'project build')
 * @param {object|null} resultData - result data on success, null on failure
 * @param {string|null} errorCategory - error category on failure
 * @param {string|null} errorMessage - error message on failure
 * @param {object|null} suggestedFix - suggestion on failure (command, auto_fixable, guide_url)
 * @returns {object} Standard JSON Envelope
 */
function wrapEnvelope(
  command,
  resultData = null,
  errorCategory = null,
  errorMessage = null,
  suggestedFix = null,
) {
  const envelope = new Envelope(command);

  if (resultData) {
    // Success response
    return envelope.success(resultData);
  } else {
    // Failure response
    const errorCode = findErrorCodeByCategory(errorCategory);
    const error = {
      error_code: errorCode || "TIZEN_SDK_UNKNOWN_E001",
      error_category: errorCategory || "unknown_error",
      message: errorMessage || "Unknown error occurred",
    };

    if (suggestedFix) {
      error.suggested_fix = {
        command: suggestedFix.command || null,
        auto_fixable: suggestedFix.auto_fixable || false,
        guide_url: suggestedFix.guide_url || null,
      };
    }

    return envelope.failure(error);
  }
}

/**
 * Find error code from error category
 */
function findErrorCodeByCategory(category) {
  for (const key of Object.keys(ERROR_CODES)) {
    if (ERROR_CODES[key].error_category === category) {
      return ERROR_CODES[key].error_code;
    }
  }
  return null;
}

/**
 * Middleware to wrap agent response as Envelope
 * Use by wrapping agent's final output with this function
 *
 * Example:
 * ```markdown
 * User runs `tizen-cli tizen-sdk create-project`
 * → executes tizen-create-project agent
 * → agent response: "Project created at /path/to/project"
 * → call wrapAgentResponse('project create', result)
 * → return Standard Envelope
 * ```
 */
function wrapAgentResponse(
  command,
  agentOutput,
  isSuccess = true,
  errorDetails = null,
) {
  if (isSuccess) {
    // Process agent's plain text response
    // Agent should actually return structured data, but
    // if only text response received, apply generic wrapping
    return wrapEnvelope(command, {
      message: agentOutput,
      status: "completed",
    });
  } else {
    return wrapEnvelope(
      command,
      null,
      errorDetails?.category || "unknown_error",
      errorDetails?.message || agentOutput,
    );
  }
}

/**
 * 표준 에러 응답 생성 (공통 에러 패턴)
 */
const CommonErrors = {
  sdkPathNotSet: (command = "tizen-sdk command") =>
    wrapEnvelope(
      command,
      null,
      "sdk_path_not_set",
      'Tizen SDK path is not configured. Run "tizen-cli tizen-sdk sdk-init --sdk-path <path>" first.',
      {
        command: "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
        auto_fixable: false,
        guide_url: "https://docs.tizen.org/application/native/tutorials/setup/",
      },
    ),

  deviceNotFound: (command = "tizen-sdk install-app") =>
    wrapEnvelope(
      command,
      null,
      "device_not_found",
      "No connected device or emulator found.",
      {
        command:
          "tizen-cli tizen-sdk create-emulator --vm-name myEmul --size 1080 --launch",
        auto_fixable: false,
        guide_url:
          "https://docs.tizen.org/application/native/tutorials/getting-started/",
      },
    ),

  templateNotFound: (
    command = "tizen-sdk create-project",
    templateName = "unknown",
  ) =>
    wrapEnvelope(
      command,
      null,
      "template_not_found",
      `Template '${templateName}' not found.`,
      {
        command: "tizen-cli tizen-sdk list-templates",
        auto_fixable: false,
      },
    ),

  buildFailed: (
    command = "tizen-sdk build-project",
    reason = "Build compilation failed",
  ) => wrapEnvelope(command, null, "build_failed", reason),

  emulatorNotFound: (
    command = "tizen-sdk launch-emulator",
    emulatorName = "unknown",
  ) =>
    wrapEnvelope(
      command,
      null,
      "emulator_not_found",
      `Emulator '${emulatorName}' not found.`,
      {
        command: "tizen-cli tizen-sdk emulator-manager --action list-vm",
        auto_fixable: false,
      },
    ),

  emulatorAlreadyRunning: (
    command = "tizen-sdk launch-emulator",
    emulatorName = "unknown",
  ) =>
    wrapEnvelope(
      command,
      null,
      "emulator_already_running",
      `Emulator '${emulatorName}' is already running.`,
    ),
};

module.exports = {
  wrapEnvelope,
  wrapAgentResponse,
  CommonErrors,
  Envelope,
  ERROR_CODES,
};
