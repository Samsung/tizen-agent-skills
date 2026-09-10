// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Debug domain: Native (GDB) / DotNET (netcoredbg) remote debugging setup (setup-only)
 *
 * Interactive debuggers block on prompts, so agent cannot launch them directly —
 * the goal is to execute script in setup-only mode and return debug commands/config
 * to pass to user in envelope result.
 */

const fs = require("fs");
const path = require("path");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { findLatestVersionDir, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");

/**
 * Extract only key lines from GDB debug setup script stdout for envelope warnings
 *
 * Discard progress logs/success markers, keep only unique info not in result (warnings,
 * errors). Exclude gdb command/init file lines as they're redundant with result field.
 *
 * @param {string} output - script stdout+stderr
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeGdbSetupOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|not found|missing|inconclusive/i,
    skip: /^(PowerShell:|Command Prompt:|GDB init file:)/i,
    max: 10,
  });
}

/**
 * Tizen Native app remote GDB debugging setup (setup-only)
 *
 * Always executes scripts/tizen-gdb-debug with -N/-SetupOnly: verify device →
 * (attach mode) launch app + acquire PID → start gdbserver → forward port → create gdb init
 * file → output gdb command for user to paste in interactive terminal, then exit.
 * Interactive gdb blocks on (gdb) prompt, so agent cannot launch it directly —
 * goal is to pass envelope result.gdb_command to user.
 *
 * gdbserver/forwarding/init file persists after setup (for user session).
 *
 * @param {string} appId - Tizen package ID (required)
 * @param {string} binaryPath - host binary path with debug symbols (required;
 *   script performs its own validation + auto-search nearby, so no existence check here)
 * @param {object} [opts]
 * @param {boolean} [opts.launch=false] - launch mode (pause before main); default attach
 * @param {string} [opts.breakpoints=''] - comma-separated breakpoint function names
 * @param {number|string} [opts.port=5039] - debug port
 * @param {number|string} [opts.timeout=30] - PID search wait time (seconds, attach mode)
 * @returns {object} Standard JSON Envelope
 */
async function setupGdbDebug(
  appId,
  binaryPath,
  opts = {},
  command = "tizen-sdk gdb-debug",
) {
  const startTime = Date.now();
  try {
    if (!appId || !binaryPath) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameters: appId, binaryPath",
        'setupGdbDebug("org.example.myapp", "C:/ws/MyApp/Debug/tpk/bin/myapp", { breakpoints: "service_app_control" })',
      );
    }
    // Allow only safe characters in shell args
    if (!/^[A-Za-z0-9._-]+$/.test(appId)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app id: ${appId}`,
      );
    }
    if (/["'`;|&<>$]/.test(binaryPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid binary path: ${binaryPath}`,
      );
    }
    const breakpoints = opts.breakpoints || "";
    if (breakpoints && !/^[A-Za-z0-9_:,. ]+$/.test(breakpoints)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid breakpoints: ${breakpoints}. Use comma-separated function names (letters, digits, underscore, colon).`,
      );
    }
    const port = parseInt(opts.port === undefined ? 5039 : opts.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${opts.port}`,
      );
    }
    const timeout = parseInt(
      opts.timeout === undefined ? 30 : opts.timeout,
      10,
    );
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${opts.timeout}. Must be 1-300 seconds.`,
      );
    }
    const launch = !!opts.launch;

    // resolveScript() assumes <group>/<group>.ps1 filename, but this script has a different
    // base name (tizen-native-gdb-debug) — assemble directly from version directory.
    const versionDir = findLatestVersionDir();
    if (!versionDir) {
      return formatError(
        command,
        "io_error",
        "No plugin version found in cache.",
      );
    }
    const ext = process.platform === "win32" ? ".ps1" : ".sh";
    const scriptPath = path.join(
      versionDir,
      "scripts",
      "tizen-gdb-debug",
      `tizen-native-gdb-debug${ext}`,
    );
    if (!fs.existsSync(scriptPath)) {
      return formatError(
        command,
        "io_error",
        `Script not found: ${scriptPath}`,
      );
    }

    console.error(
      `[tizen-gdb] Setting up ${launch ? "launch" : "attach"}-mode debug for ${appId} (port ${port})`,
    );

    // Pass forward slash paths to Windows script (script does own normalization)
    const winBin = binaryPath.replace(/\\/g, "/");
    const winArgs =
      `-App "${appId}" -Binary "${winBin}" -Port ${port} -Timeout ${timeout}` +
      (breakpoints ? ` -Breakpoints "${breakpoints}"` : "") +
      (launch ? " -Launch" : "") +
      " -SetupOnly";
    const unixArgs =
      `-a "${appId}" -b "${binaryPath}" -p ${port} -t ${timeout}` +
      (breakpoints ? ` -x "${breakpoints}"` : "") +
      (launch ? " -l" : "") +
      " -N";

    let output;
    try {
      // captureViaTempFile required: setup-only mode leaves a separate sdb client
      // holding gdbserver, then exits — in pipe mode that process inherits stdout
      // handle and execSync blocks forever.
      output = execPluginScript(scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      });
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      if (/No connected device/i.test(combined)) {
        return formatError(
          command,
          "device_not_found",
          "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry.",
          null,
          startTime,
        );
      }
      if (/Could not find PID/i.test(combined)) {
        return formatError(
          command,
          "io_error",
          `Could not find the app PID within ${timeout}s (attach mode). Is the app installed and launchable? For breakpoints in main/service_app_create use launch mode instead.`,
          null,
          startTime,
        );
      }
      const detail = summarizeGdbSetupOutput(combined).join(" | ");
      return formatError(
        command,
        "io_error",
        `GDB debug setup failed: ${error.message}${detail ? ` — ${detail}` : ""}`,
        null,
        startTime,
      );
    }

    // Success marker parsing
    const initMatch = output.match(/GDB init file:\s*(.+)$/m);
    const pidMatch = output.match(/App PID:\s*(\d+)/);
    const psMatch = output.match(/PowerShell:\s*(.+)$/m);
    const cmdMatch = output.match(/Command Prompt:\s*(.+)$/m);
    // Unix script outputs single line without label: "<gdb>" -x "<init>"
    const shMatch = output.match(/^\s*("[^"\n]+" -x "[^"\n]+")\s*$/m);

    const gdbCommand = {};
    if (psMatch) gdbCommand.powershell = psMatch[1].trim();
    if (cmdMatch) gdbCommand.cmd = cmdMatch[1].trim();
    if (!psMatch && !cmdMatch && shMatch) gdbCommand.shell = shMatch[1].trim();

    if (!initMatch || (!gdbCommand.powershell && !gdbCommand.shell)) {
      return formatError(
        command,
        "io_error",
        "Setup script exited successfully but printed no gdb command / init file markers.",
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        app_id: appId,
        binary_path: binaryPath,
        mode: launch ? "launch" : "attach",
        port,
        breakpoints: breakpoints
          ? breakpoints
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        app_pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
        gdbserver_status: "running",
        port_forwarded: true,
        gdb_init_file: initMatch[1].trim(),
        gdb_command: gdbCommand,
        note: gdbCommand.powershell
          ? "Run ONE of the gdb_command lines in an interactive terminal: powershell form (leading & is PowerShell-only) or cmd form. gdbserver, the port forward, and the init file stay in place for this session."
          : "Run the gdb_command.shell line in an interactive terminal. gdbserver, the port forward, and the init file stay in place for this session.",
      },
      {
        // Key lines only (warnings/errors) instead of full setup log
        warnings: summarizeGdbSetupOutput(output),
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to set up GDB debugging: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Extract only key lines from DotNET debug setup script stdout for envelope warnings
 *
 * Discard progress logs/success markers, keep only unique info not in result (warnings,
 * errors). Exclude netcoredbg command/launch.json lines as they're redundant with result field.
 *
 * @param {string} output - script stdout+stderr
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeDotnetDebugOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|not found|missing|inconclusive|unsupported|refused|launch_app:|app_launcher:/i,
    skip: /^(PowerShell:|Command Prompt:|STEP |CRITICAL:|STEP 1:|STEP 2:|STEP 3:|APP_LAUNCH_ID=|APP_STATE=)/i,
    max: 10,
  });
}

/**
 * Last few non-empty lines of a failed setup run, verbatim, for
 * `errors[0].details`. The summary above is a filter; this is the evidence —
 * in particular the `launch_app:` / `app_launcher:` echo lines that carry the
 * platform's own reason when a debug launch is refused (issue #97).
 */
function dotnetDebugOutputTail(
  output,
  { maxLines = 15, maxLineLength = 300 } = {},
) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(APP_LAUNCH_ID=|APP_STATE=)/.test(line))
    .slice(-maxLines)
    .map((line) =>
      line.length <= maxLineLength
        ? line
        : `${line.slice(0, maxLineLength)} ...`,
    );
}

/** The one sentence every launch-mode result must lead with (issue #97). */
const LAUNCH_SUSPENDED_NOTE =
  "The app is running under netcoredbg but SUSPENDED before Main(): it shows NO window until VS Code connects (F5). This is expected, not a failed launch.";

/**
 * Tizen DotNET app remote debugging setup (setup-only)
 *
 * Always executes scripts/tizen-dotnet-debug with -N/-SetupOnly (attach) or -l (launch):
 * verify device → install netcoredbg (on-demand package) → verify .pdb files →
 * (attach mode) launch app + acquire PID → output netcoredbg CLI command, then exit
 * (launch mode) start app with netcoredbg DAP server → forward port → provide launch.json guidance
 *
 * Interactive netcoredbg blocks on ncdb> prompt, so agent cannot launch it directly —
 * goal is to pass envelope result.debug_command (attach) or result.launch_config (launch) to user.
 *
 * @param {string} appId - Tizen package ID (required)
 * @param {object} [opts]
 * @param {boolean} [opts.launch=false] - launch mode (pause before Main). Callers
 *   (dotnet-debug-cli.js, tizen-cli --mode) default to launch: on Tizen a normally
 *   launched .NET app has no CoreCLR debug transport, so attach cannot work (issue #97)
 * @param {string} [opts.breakpoints=''] - comma-separated breakpoints (File.cs:line)
 * @param {number|string} [opts.port=4711] - DAP server port (launch mode)
 * @param {string} [opts.serial=''] - device serial (default: first connected device)
 * @param {number|string} [opts.timeout=30] - PID search wait time (seconds, attach mode)
 * @param {boolean} [opts.forceInstall=false] - reinstall netcoredbg
 * @returns {object} Standard JSON Envelope
 */
async function setupDotnetDebug(
  appId,
  opts = {},
  command = "tizen-sdk dotnet-debug",
) {
  const startTime = Date.now();
  try {
    if (!appId) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: appId",
        'setupDotnetDebug("org.tizen.example.MyApp", { launch: true, breakpoints: "Program.cs:25" })',
      );
    }
    // Allow only safe characters in shell args
    if (!/^[A-Za-z0-9._-]+$/.test(appId)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app id: ${appId}`,
      );
    }
    const breakpoints = opts.breakpoints || "";
    if (breakpoints && !/^[A-Za-z0-9_:,. ]+$/.test(breakpoints)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid breakpoints: ${breakpoints}. Use comma-separated File.cs:line entries.`,
      );
    }
    const port = parseInt(opts.port === undefined ? 4711 : opts.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${opts.port}`,
      );
    }
    const timeout = parseInt(
      opts.timeout === undefined ? 30 : opts.timeout,
      10,
    );
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${opts.timeout}. Must be 1-300 seconds.`,
      );
    }
    const launch = !!opts.launch;
    const forceInstall = !!opts.forceInstall;
    const serial = opts.serial || "";

    // resolveScript() assumes <group>/<group>.ps1 filename, but this script has a different
    // base name (tizen-dotnet-debug) — assemble directly from version directory.
    const versionDir = findLatestVersionDir();
    if (!versionDir) {
      return formatError(
        command,
        "io_error",
        "No plugin version found in cache.",
      );
    }
    const ext = process.platform === "win32" ? ".ps1" : ".sh";
    const scriptPath = path.join(
      versionDir,
      "scripts",
      "tizen-dotnet-debug",
      `tizen-dotnet-debug${ext}`,
    );
    if (!fs.existsSync(scriptPath)) {
      return formatError(
        command,
        "io_error",
        `Script not found: ${scriptPath}`,
      );
    }

    console.error(
      `[tizen-dotnet-debug] Setting up ${launch ? "launch" : "attach"}-mode debug for ${appId} (port ${port})`,
    );

    const winArgs =
      `-App "${appId}" -Port ${port} -Timeout ${timeout}` +
      (serial ? ` -Serial "${serial}"` : "") +
      (breakpoints ? ` -Breakpoints "${breakpoints}"` : "") +
      (launch ? " -Launch" : "") +
      (forceInstall ? " -ForceInstall" : "") +
      " -SetupOnly";
    const unixArgs =
      `-a "${appId}" -p ${port} -t ${timeout}` +
      (serial ? ` -s "${serial}"` : "") +
      (breakpoints ? ` -x "${breakpoints}"` : "") +
      (launch ? " -l" : "") +
      (forceInstall ? " -f" : "") +
      " -N";

    let output;
    try {
      // captureViaTempFile required: setup-only mode leaves sdb client,
      // then exits — in pipe mode that process inherits stdout handle and execSync blocks forever.
      output = execPluginScript(scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      });
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      const tail = dotnetDebugOutputTail(combined);
      const details = tail.length ? tail : null;
      if (/No devices found|No connected device/i.test(combined)) {
        return formatError(
          command,
          "device_not_found",
          "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry.",
          null,
          startTime,
          details,
        );
      }
      if (/No \.pdb files found|Release configuration/i.test(combined)) {
        return formatError(
          command,
          "build_failed",
          "No .pdb files found — the app was built with Release configuration. Breakpoints WILL NOT WORK. Rebuild with Debug (tizen-build-project -b Debug), reinstall (tizen-install-app), then retry.",
          null,
          startTime,
          details,
        );
      }
      if (
        /is not installed on .* \(not listed by app_launcher -l\)/i.test(
          combined,
        )
      ) {
        return formatError(
          command,
          "invalid_parameters",
          `App '${appId}' is not installed on the device (app_launcher -l does not list it), so it cannot be launched for debugging. Install it first (tizen-install-app) and pass the package id exactly as installed; see details for the apps the device does list.`,
          null,
          startTime,
          details,
        );
      }
      if (/netcoredbg DAP server did not start/i.test(combined)) {
        const said = tail.find((l) =>
          /launch_app output:|launch_app:/i.test(l),
        );
        return formatError(
          command,
          "io_error",
          `Launch mode failed: the platform did not start '${appId}' under netcoredbg (no netcoredbg process appeared).${said ? ` ${said}` : ""} The device image must support the SDK debug-launch contract (__AUL_SDK__): emulator/dev images do, some production images refuse. Full launch_app output is in details.`,
          null,
          startTime,
          details,
        );
      }
      if (/Could not find PID/i.test(combined)) {
        return formatError(
          command,
          "io_error",
          `Could not find the app PID within ${timeout}s (attach mode). Is the app installed and launchable? Use launch mode (the default) to catch Main().`,
          null,
          startTime,
          details,
        );
      }
      if (/no CoreCLR debug transport|cannot attach/i.test(combined)) {
        return formatError(
          command,
          "io_error",
          `Attach mode not supported for this app (no CoreCLR debug transport). Use launch mode (the default) instead — the app restarts under a netcoredbg DAP server.`,
          null,
          startTime,
          details,
        );
      }
      if (/netcoredbg.*not found|package.*not found/i.test(combined)) {
        return formatError(
          command,
          "io_error",
          `netcoredbg package not found in the SDK. Install the platform's on-demand tools (tizen-sdk-install), then retry.`,
          null,
          startTime,
          details,
        );
      }
      const detail = summarizeDotnetDebugOutput(combined).join(" | ");
      return formatError(
        command,
        "io_error",
        `DotNET debug setup failed: ${error.message}${detail ? ` — ${detail}` : ""}`,
        null,
        startTime,
        details,
      );
    }

    // Success marker parsing
    const pidMatch = output.match(/App PID:\s*(\d+)/);
    const launchIdMatch = output.match(/^APP_LAUNCH_ID=(.+)$/m);
    const appStateMatch = output.match(/^APP_STATE=(.+)$/m);
    const psMatch = output.match(/PowerShell:\s*(.+)$/m);
    const cmdMatch = output.match(/Command Prompt:\s*(.+)$/m);
    // Unix script can output single line without label
    const shMatch = output.match(
      /^\s*("[^"\n]+" -s [^"]+ shell "[^"\n]+")\s*$/m,
    );

    const debugCommand = {};
    if (psMatch) debugCommand.powershell = psMatch[1].trim();
    if (cmdMatch) debugCommand.cmd = cmdMatch[1].trim();
    if (!psMatch && !cmdMatch && shMatch)
      debugCommand.shell = shMatch[1].trim();

    // launch mode: extract launch.json config
    const portForwarded = /forward/i.test(output) && launch;

    // Validation: attach mode must have debug_command
    if (!launch && !debugCommand.powershell && !debugCommand.shell) {
      return formatError(
        command,
        "io_error",
        "Setup script exited successfully but printed no netcoredbg command markers.",
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        app_id: appId,
        // the id app_launcher actually launched (may differ from the package id)
        launch_app_id: launchIdMatch ? launchIdMatch[1].trim() : appId,
        mode: launch ? "launch" : "attach",
        // launch: "suspended_under_debugger" — no UI until VS Code connects
        app_state: appStateMatch
          ? appStateMatch[1].trim()
          : launch
            ? "suspended_under_debugger"
            : "running",
        port: launch ? port : null,
        breakpoints: breakpoints
          ? breakpoints
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        app_pid: pidMatch ? parseInt(pidMatch[1], 10) : null,
        netcoredbg_status: "installed",
        port_forwarded: launch ? portForwarded : false,
        debug_command: !launch ? debugCommand : null,
        launch_config: launch
          ? {
              type: "coreclr",
              request: "launch",
              debug_server_port: port,
              workspace_placeholder: "<APP_FOLDER_NAME>",
              note: `${LAUNCH_SUSPENDED_NOTE} Create .vscode/launch.json in the workspace root with the netcoredbg DAP config. Replace <APP_FOLDER_NAME> with your app folder name.`,
            }
          : null,
        note: launch
          ? `${LAUNCH_SUSPENDED_NOTE} netcoredbg DAP server is listening on device port ${port}; host tcp:${port} is forwarded. Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5.`
          : debugCommand.powershell
            ? "Run ONE of the debug_command lines in an interactive terminal: powershell form (leading & is PowerShell-only) or cmd form. The app is running and netcoredbg is installed."
            : "Run the debug_command.shell line in an interactive terminal. The app is running and netcoredbg is installed.",
      },
      {
        // Key lines only (warnings/errors) instead of full setup log
        warnings: summarizeDotnetDebugOutput(output),
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to set up DotNET debugging: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  setupGdbDebug,
  setupDotnetDebug,
};
