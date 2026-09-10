// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Device domain: detect connected device
 *
 * Executes scripts/tizen-device-manager and parses stdout DEVICE_SERIAL=... line
 * to return Standard JSON Envelope.
 *
 * NOTE: This function only finds connected devices via sdb. It does NOT create
 * or launch emulators. If no device is found, it returns a device_not_found
 * envelope directing the user to tizen-create-emulator and tizen-launch-emulator.
 */

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveScript, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");
// Shared Java/JNA crash detection + raw-output carry, so device-manager errors
// give the same headless-usable guidance as the emulator domain (issue #40).
const { javaJnaHint, rawOutputTail } = require("./emulator");

/**
 * Extract only key lines from device manager script stdout for envelope warnings
 *
 * Discard boot logs/info banners, keep only unique info not in result (warnings,
 * errors, em-cli/JNA issues, manual action guidance). Exclude DEVICE_SERIAL line
 * as it goes in result.
 *
 * @param {string} output - script stdout
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeDeviceManagerOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|manual|em-cli|jna|emulator manager/i,
    skip: /^DEVICE_SERIAL=/,
    max: 10,
  });
}

/**
 * Detect connected device via sdb, or stop running emulator VMs.
 * With action='stop', shuts down all running emulator VMs instead.
 *
 * Executes scripts/tizen-device-manager and parses stdout `DEVICE_SERIAL=...` line
 * (for start) or `EMULATOR_STOPPED=...` line (for stop) to return Standard JSON Envelope.
 *
 * NOTE: The 'start' action only finds connected devices. It does NOT create or launch
 * emulators. If no device is found, it returns a device_not_found envelope directing the
 * user to tizen-create-emulator (to create a VM) and tizen-launch-emulator (to launch one).
 *
 * @param {number|string} [timeoutSec=300] - emulator connection wait time (seconds, 1-540)
 * @param {string} [vmName='tizen-vm-default'] - name of emulator VM to look for
 * @param {string} [action='start'] - action: 'start' (find connected device) or 'stop' (shut down emulators)
 * @param {string} [profile='tizen'] - emulator profile: 'tizen' (standard) or 'tv' (Samsung TV)
 * @returns {object} Standard JSON Envelope
 */
async function manageDevice(
  timeoutSec = 300,
  vmName = "tizen-vm-default",
  action = "start",
  profile = "tizen",
  command = "tizen-sdk device-manager",
) {
  // If caller didn't override command, derive it from action
  if (command === "tizen-sdk device-manager" && action === "stop") {
    command = "tizen-sdk device-manager stop";
  }
  const startTime = Date.now();

  try {
    const timeout = parseInt(timeoutSec, 10);
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 540) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${timeoutSec}. Must be 1-540 seconds (Bash tool max is 600s; leave headroom).`,
        'manageDevice(300, "tizen-vm-default")',
      );
    }
    // Allow only safe characters in shell args (no spaces/quotes/metacharacters)
    if (!/^[A-Za-z0-9._-]+$/.test(vmName)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid VM name: ${vmName}. Use only letters, digits, dot, underscore, hyphen.`,
      );
    }
    // Validate action
    if (action !== "start" && action !== "stop") {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid action: ${action}. Must be 'start' or 'stop'.`,
      );
    }

    // Validate profile
    if (profile !== "tizen" && profile !== "tv") {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid profile: ${profile}. Must be 'tizen' or 'tv'.`,
      );
    }

    const resolved = resolveScript("tizen-device-manager");

    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    if (action === "stop") {
      console.error(`[tizen-device] Stopping running emulator VMs...`);
    } else {
      console.error(
        `[tizen-device] Detecting connected device (vmName: ${vmName}, profile: ${profile})`,
      );
    }

    let output;
    try {
      // captureViaTempFile required: long-lived processes spawned by script
      // (emulator qemu, sdb server) inherit stdout pipe, and execSync blocks
      // forever waiting for pipe close even after script exits.
      output = execPluginScript(
        resolved.scriptPath,
        `-Timeout ${timeout} -VmName "${vmName}" -Action ${action} -Profile ${profile}`,
        `-t ${timeout} -n "${vmName}" -a ${action} -p ${profile}`,
        { captureViaTempFile: true },
      );
    } catch (error) {
      // exit != 0: sdb not found, device not found, etc.
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      const noDeviceHint = /No connected Tizen device|device_not_found/i.test(
        combined,
      )
        ? " No connected device found. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it."
        : "";
      return formatError(
        command,
        action === "stop" ? "io_error" : "device_not_found",
        `${action === "stop" ? "Emulator stop" : "Device detection"} failed: ${error.message}.${javaJnaHint(combined)}${noDeviceHint}`,
        null,
        startTime,
        rawOutputTail(combined),
      );
    }

    // For stop action, parse EMULATOR_STOPPED=... line
    if (action === "stop") {
      const stoppedMatch = output.match(/^EMULATOR_STOPPED=(\d+)$/m);
      const stoppedCount = stoppedMatch ? parseInt(stoppedMatch[1], 10) : 0;

      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success(
        {
          emulators_stopped: stoppedCount,
          status: "stopped",
        },
        {
          warnings: summarizeDeviceManagerOutput(output),
        },
      );
    }

    // For start action, parse DEVICE_SERIAL=... line
    const serialMatch = output.match(/^DEVICE_SERIAL=(.+)$/m);
    if (!serialMatch) {
      return formatError(
        command,
        "device_not_found",
        "Script exited successfully but printed no DEVICE_SERIAL=... line.",
        null,
        startTime,
      );
    }
    const serial = serialMatch[1].trim();

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        device_serial: serial,
        device_type: /^emulator-/i.test(serial) ? "emulator" : "usb",
        emulator_launched: false,
        device_profile: profile,
        status: "connected",
      },

      {
        // Key lines only (warnings/errors/manual actions) instead of full boot log
        warnings: summarizeDeviceManagerOutput(output),
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to manage device: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  manageDevice,
};
