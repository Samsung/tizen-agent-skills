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
const { checkShellSafe, isValidSerial } = require("./shell-safety");
const { summarizeOutput } = require("./output-summary");
const { findFirstFileByExtension } = require("./rds/yaml-reader");

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

/** Characters allowed in an app id spliced into the setup script arguments. */
const SAFE_APP_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
/** Characters allowed in a breakpoint list spliced into the setup script arguments. */
const SAFE_BREAKPOINTS_PATTERN = /^[A-Za-z0-9_:,. ]+$/;

/** Shared `device_not_found` message of both setup runners. */
const NO_DEVICE_MESSAGE =
  "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry.";

/**
 * Screen the app id: allow only safe characters in shell args.
 *
 * @returns {object|null} error envelope, or null when the id is safe
 */
function checkDebugAppId(appId, command) {
  if (SAFE_APP_ID_PATTERN.test(appId)) return null;
  return formatError(command, "invalid_parameters", `Invalid app id: ${appId}`);
}

/**
 * Validate the options both setup runners take (breakpoints, port, timeout,
 * launch, serial), in the order the runners have always checked them.
 *
 * @param {object} opts - caller options
 * @param {string} command - envelope command name
 * @param {{defaultPort: number, breakpointsHint: string}} spec
 * @returns {{error: object}|{values: {breakpoints: string, port: number,
 *   timeout: number, launch: boolean, serial: string}}}
 */
function validateDebugOpts(opts, command, { defaultPort, breakpointsHint }) {
  const invalid = (message) => ({
    error: formatError(command, "invalid_parameters", message),
  });
  const breakpoints = opts.breakpoints || "";
  if (breakpoints && !SAFE_BREAKPOINTS_PATTERN.test(breakpoints)) {
    return invalid(`Invalid breakpoints: ${breakpoints}. ${breakpointsHint}`);
  }
  const port = parseInt(opts.port === undefined ? defaultPort : opts.port, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return invalid(`Invalid port: ${opts.port}`);
  }
  const timeout = parseInt(opts.timeout === undefined ? 30 : opts.timeout, 10);
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
    return invalid(`Invalid timeout: ${opts.timeout}. Must be 1-300 seconds.`);
  }
  const launch = !!opts.launch;
  // Serial is spliced into the script argument string (`-Serial "<s>"` /
  // `-s "<s>"`) and ends up in `sdb -s <s>`: the shared SERIAL_PATTERN
  // (letters, digits, . _ : -, no leading "-", ≤ 64 chars) is the same
  // screen resolveSerial() applies for every other command.
  const serial = opts.serial ? String(opts.serial).trim() : "";
  if (serial && !isValidSerial(serial)) {
    return invalid(
      `Invalid device serial "${serial}": only letters, digits, '.', '_', ':' and '-' are allowed (no leading '-', at most 64 characters).`,
    );
  }
  return { values: { breakpoints, port, timeout, launch, serial } };
}

/**
 * Locate a setup script in the latest plugin version directory.
 *
 * resolveScript() assumes <group>/<group>.ps1 filename, but the debug scripts
 * have different base names — assemble directly from version directory.
 *
 * @param {string} group - scripts/ sub-directory
 * @param {string} baseName - script file name without extension
 * @param {string} command - envelope command name
 * @returns {{error: object}|{scriptPath: string}}
 */
function resolveDebugScript(group, baseName, command) {
  const versionDir = findLatestVersionDir();
  if (!versionDir) {
    return {
      error: formatError(
        command,
        "io_error",
        "No plugin version found in cache.",
      ),
    };
  }
  const ext = process.platform === "win32" ? ".ps1" : ".sh";
  const scriptPath = path.join(
    versionDir,
    "scripts",
    group,
    `${baseName}${ext}`,
  );
  if (!fs.existsSync(scriptPath)) {
    return {
      error: formatError(
        command,
        "io_error",
        `Script not found: ${scriptPath}`,
      ),
    };
  }
  return { scriptPath };
}

/**
 * Assemble the Windows (`-App ... -SetupOnly`) and Unix (`-a ... -N`) argument
 * strings for a setup script. `binary` (GDB only) is passed right after the
 * app id; `forceInstall` (DotNET only) right before the setup-only flag.
 *
 * @returns {{winArgs: string, unixArgs: string}}
 */
function buildDebugScriptArgs(p) {
  const win = [`-App "${p.appId}"`];
  const unix = [`-a "${p.appId}"`];
  if (p.binary) {
    // Pass forward slash paths to Windows script (script does own normalization)
    win.push(`-Binary "${p.binary.replace(/\\/g, "/")}"`);
    unix.push(`-b "${p.binary}"`);
  }
  win.push(`-Port ${p.port}`, `-Timeout ${p.timeout}`);
  unix.push(`-p ${p.port}`, `-t ${p.timeout}`);
  if (p.serial) {
    win.push(`-Serial "${p.serial}"`);
    unix.push(`-s "${p.serial}"`);
  }
  if (p.breakpoints) {
    win.push(`-Breakpoints "${p.breakpoints}"`);
    unix.push(`-x "${p.breakpoints}"`);
  }
  if (p.launch) {
    win.push("-Launch");
    unix.push("-l");
  }
  if (p.forceInstall) {
    win.push("-ForceInstall");
    unix.push("-f");
  }
  win.push("-SetupOnly");
  unix.push("-N");
  return { winArgs: win.join(" "), unixArgs: unix.join(" ") };
}

/**
 * Turn a failed setup-script run into an error envelope: the first matching
 * entry of `spec.rules` wins, otherwise a generic "<label> setup failed".
 *
 * @param {Error} error - execPluginScript failure (carries stdout/stderr)
 * @param {{command: string, startTime: number, rules: Array<{pattern: RegExp,
 *   category: string, message: (ctx: object) => string}>, ctx: object,
 *   label: string, summarize: (output: string) => string[],
 *   withDetails: boolean}} spec - `withDetails` attaches the output tail
 *   as `errors[0].details`
 * @returns {object} error envelope
 */
function formatDebugSetupFailure(error, spec) {
  const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
  const tail = spec.withDetails ? dotnetDebugOutputTail(combined) : [];
  const details = tail.length ? tail : null;
  const rule = spec.rules.find((r) => r.pattern.test(combined));
  if (rule) {
    return formatError(
      spec.command,
      rule.category,
      rule.message({ ...spec.ctx, tail }),
      null,
      spec.startTime,
      details,
    );
  }
  const detail = spec.summarize(combined).join(" | ");
  return formatError(
    spec.command,
    "io_error",
    `${spec.label} setup failed: ${error.message}${detail ? ` — ${detail}` : ""}`,
    null,
    spec.startTime,
    details,
  );
}

/**
 * Resolve the setup script, log the mode, and run it in setup-only mode.
 *
 * @param {{command: string, scriptGroup: string, scriptBase: string,
 *   logTag: string, args: object, failure: object}} spec - `args` feeds
 *   {@link buildDebugScriptArgs}, `failure` feeds {@link formatDebugSetupFailure}
 * @returns {{error: object}|{output: string}}
 */
function runDebugSetupScript(spec) {
  const resolved = resolveDebugScript(
    spec.scriptGroup,
    spec.scriptBase,
    spec.command,
  );
  if (resolved.error) return resolved;
  const { appId, port, launch } = spec.args;
  console.error(
    `${spec.logTag} Setting up ${launch ? "launch" : "attach"}-mode debug for ${appId} (port ${port})`,
  );
  const { winArgs, unixArgs } = buildDebugScriptArgs(spec.args);
  try {
    // captureViaTempFile required: setup-only mode leaves a separate sdb client
    // (e.g. holding gdbserver), then exits — in pipe mode that process inherits
    // stdout handle and execSync blocks forever.
    return {
      output: execPluginScript(resolved.scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      }),
    };
  } catch (error) {
    return { error: formatDebugSetupFailure(error, spec.failure) };
  }
}

/** First capture group of `pattern` in `output`, trimmed; null when no match. */
function matchTrimmed(output, pattern) {
  const m = output.match(pattern);
  return m ? m[1].trim() : null;
}

/** `App PID: <n>` marker as a number; null when absent. */
function parseAppPid(output) {
  const m = output.match(/App PID:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Debugger command lines the setup script printed: labelled PowerShell /
 * Command Prompt forms, else the unlabelled Unix single line (`shellPattern`).
 *
 * @returns {{powershell?: string, cmd?: string, shell?: string}}
 */
function parseDebuggerCommand(output, shellPattern) {
  const psMatch = output.match(/PowerShell:\s*(.+)$/m);
  const cmdMatch = output.match(/Command Prompt:\s*(.+)$/m);
  const shMatch = output.match(shellPattern);
  const debuggerCommand = {};
  if (psMatch) debuggerCommand.powershell = psMatch[1].trim();
  if (cmdMatch) debuggerCommand.cmd = cmdMatch[1].trim();
  if (!psMatch && !cmdMatch && shMatch)
    debuggerCommand.shell = shMatch[1].trim();
  return debuggerCommand;
}

/** Comma-separated breakpoint list as a trimmed, non-empty array. */
function splitBreakpoints(breakpoints) {
  return breakpoints
    ? breakpoints
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

/** Success envelope with the original start time and the given warnings. */
function debugSetupSuccess(command, startTime, result, warnings) {
  const envelope = new Envelope(command);
  envelope.startTime = startTime;
  // Key lines only (warnings/errors) instead of full setup log
  return envelope.success(result, { warnings });
}

/** Known GDB setup-script failures, checked in order. */
const GDB_SETUP_FAILURES = [
  {
    pattern: /No connected device/i,
    category: "device_not_found",
    message: () => NO_DEVICE_MESSAGE,
  },
  {
    pattern: /Could not find PID/i,
    category: "io_error",
    message: ({ timeout }) =>
      `Could not find the app PID within ${timeout}s (attach mode). Is the app installed and launchable? For breakpoints in main/service_app_create use launch mode instead.`,
  },
];

/**
 * Validate setupGdbDebug arguments.
 *
 * @returns {{error: object}|{values: object}}
 */
function validateGdbDebugArgs(appId, binaryPath, opts, command) {
  if (!appId || !binaryPath) {
    return {
      error: formatError(
        command,
        "invalid_parameters",
        "Missing required parameters: appId, binaryPath",
        'setupGdbDebug("org.example.myapp", "C:/ws/MyApp/Debug/tpk/bin/myapp", { breakpoints: "service_app_control" })',
      ),
    };
  }
  // Same screen the other execPluginScript callers use (adds line breaks
  // and the trailing-backslash case to the old inline character list).
  const error =
    checkDebugAppId(appId, command) ||
    checkShellSafe(binaryPath, "binary path", command);
  if (error) return { error };
  return validateDebugOpts(opts, command, {
    defaultPort: 5039,
    breakpointsHint:
      "Use comma-separated function names (letters, digits, underscore, colon).",
  });
}

/**
 * Build the setupGdbDebug success envelope from the setup script output.
 *
 * @returns {object} Standard JSON Envelope
 */
function buildGdbSetupResult(output, ctx) {
  const { command, startTime, appId, binaryPath, values } = ctx;
  const { serial, launch, port, breakpoints } = values;
  // Success marker parsing
  const initFile = matchTrimmed(output, /GDB init file:\s*(.+)$/m);
  // Unix script outputs single line without label: "<gdb>" -x "<init>"
  const gdbCommand = parseDebuggerCommand(
    output,
    /^\s*("[^"\n]+" -x "[^"\n]+")\s*$/m,
  );

  if (initFile === null || (!gdbCommand.powershell && !gdbCommand.shell)) {
    return formatError(
      command,
      "io_error",
      "Setup script exited successfully but printed no gdb command / init file markers.",
      null,
      startTime,
    );
  }

  return debugSetupSuccess(
    command,
    startTime,
    {
      app_id: appId,
      binary_path: binaryPath,
      // The device the scripts pinned every sdb call to (--serial, else the
      // first connected device as the script reported it).
      device_serial: serial || matchTrimmed(output, /Target device:\s*(\S+)/),
      mode: launch ? "launch" : "attach",
      port,
      breakpoints: splitBreakpoints(breakpoints),
      app_pid: parseAppPid(output),
      gdbserver_status: "running",
      port_forwarded: true,
      gdb_init_file: initFile,
      gdb_command: gdbCommand,
      note: gdbCommand.powershell
        ? "Run ONE of the gdb_command lines in an interactive terminal: powershell form (leading & is PowerShell-only) or cmd form. gdbserver, the port forward, and the init file stay in place for this session."
        : "Run the gdb_command.shell line in an interactive terminal. gdbserver, the port forward, and the init file stay in place for this session.",
    },
    summarizeGdbSetupOutput(output),
  );
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
 * @param {string} [opts.serial] - device serial (default: the first connected device)
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
    const validated = validateGdbDebugArgs(appId, binaryPath, opts, command);
    if (validated.error) return validated.error;
    const { values } = validated;

    const run = runDebugSetupScript({
      command,
      scriptGroup: "tizen-gdb-debug",
      scriptBase: "tizen-native-gdb-debug",
      logTag: "[tizen-gdb]",
      args: { ...values, appId, binary: binaryPath },
      failure: {
        command,
        startTime,
        rules: GDB_SETUP_FAILURES,
        ctx: { timeout: values.timeout },
        label: "GDB debug",
        summarize: summarizeGdbSetupOutput,
        withDetails: false,
      },
    });
    if (run.error) return run.error;

    return buildGdbSetupResult(run.output, {
      command,
      startTime,
      appId,
      binaryPath,
      values,
    });
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

/** Name of the launch.json configuration this runner owns (created or replaced in place). */
const DOTNET_LAUNCH_CONFIG_NAME = "Tizen .NET (netcoredbg)";
/** Label of the tasks.json task that re-runs this runner before every F5. */
const DOTNET_LAUNCH_TASK_LABEL = "tizen: netcoredbg launch";

/**
 * Pull the TargetFramework and `<AssemblyName>` out of raw .csproj text. Pure.
 *
 * Accepts `<TargetFramework>` and multi-targeting `<TargetFrameworks>` (with or
 * without attributes such as `Condition="..."`). A `;`-separated list yields the
 * Tizen TFM when there is one, else the first entry — that is the output
 * directory `dotnet build` produces for the Tizen target.
 *
 * @param {string} content
 * @returns {{targetFramework: string|null, assemblyName: string|null}}
 */
function parseCsprojProps(content) {
  const tfm = content.match(
    /<TargetFrameworks?(?:\s[^>]*)?>\s*([^<]+?)\s*<\/TargetFrameworks?>/,
  );
  let targetFramework = null;
  if (tfm) {
    const list = tfm[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    targetFramework = list.find((t) => /tizen/i.test(t)) || list[0] || null;
  }
  const asm = content.match(
    /<AssemblyName(?:\s[^>]*)?>\s*([^<]+?)\s*<\/AssemblyName>/,
  );
  return {
    targetFramework,
    assemblyName: asm ? asm[1].trim() : null,
  };
}

/**
 * Locate the app's .csproj under `projectPath` and derive the host-side
 * `program` / `cwd` VS Code needs for a Debug build.
 *
 * The .csproj may sit at the project root or one level down
 * (`<root>/<App>/<App>.csproj`, the layout `tz new` produces); the BFS lookup
 * returns the shallowest one. The output directory is always `bin/Debug/<tfm>`:
 * netcoredbg needs .pdb files, and the setup script already refuses Release builds.
 *
 * @param {string} projectPath - absolute project (workspace) directory
 * @returns {{csprojPath: string, csprojDirRel: string, targetFramework: string,
 *   assemblyName: string, program: string, cwd: string}}
 * @throws {Error} when no .csproj is found or it has no <TargetFramework>
 */
function resolveDotnetLaunchProgram(projectPath) {
  const csprojPath = findFirstFileByExtension(projectPath, ".csproj");
  if (!csprojPath) {
    throw new Error(`No .csproj found under ${projectPath}`);
  }
  const { targetFramework, assemblyName } = parseCsprojProps(
    fs.readFileSync(csprojPath, "utf-8"),
  );
  if (!targetFramework) {
    throw new Error(`${csprojPath} has no <TargetFramework>`);
  }
  const name = assemblyName || path.basename(csprojPath, ".csproj");
  const rel = path
    .relative(projectPath, path.dirname(csprojPath))
    .split(path.sep)
    .join("/");
  const csprojDirRel = rel || ".";
  const outDir =
    (csprojDirRel === "." ? "" : `${csprojDirRel}/`) +
    `bin/Debug/${targetFramework}`;
  return {
    csprojPath,
    csprojDirRel,
    targetFramework,
    assemblyName: name,
    program: `\${workspaceFolder}/${outDir}/${name}.dll`,
    cwd: `\${workspaceFolder}/${outDir}`,
  };
}

/**
 * The `coreclr` configuration VS Code needs to connect to the netcoredbg DAP
 * server the setup script left listening (via the sdb-forwarded host port).
 * `coreclr` is contributed by the C# extension (ms-dotnettools.csharp).
 *
 * @param {{program: string, cwd: string, port: number, preLaunchTask?: string}} p
 * @returns {object} one launch.json `configurations[]` entry
 */
function buildDotnetLaunchConfiguration({ program, cwd, port, preLaunchTask }) {
  return {
    name: DOTNET_LAUNCH_CONFIG_NAME,
    type: "coreclr",
    request: "launch",
    program,
    cwd,
    debugServer: port,
    stopAtEntry: false,
    ...(preLaunchTask ? { preLaunchTask } : {}),
  };
}

/**
 * The tasks.json task VS Code runs before every F5: this runner in launch mode.
 *
 * Needed because netcoredbg ends the app AND itself when the client disconnects
 * (Stop in VS Code sends terminate/disconnect), while the host-side sdb forward
 * keeps accepting connections — so a second F5 against the stale port "starts"
 * and dies at once. Relaunching on every F5 makes stop → F5 just work.
 *
 * @param {{appId: string, port: number, serial?: string, cliPath?: string}} p
 * @returns {object} one tasks.json `tasks[]` entry
 */
function buildDotnetLaunchTask({ appId, port, serial, cliPath }) {
  const cli =
    cliPath || path.resolve(__dirname, "..", "cli", "dotnet-debug-cli.js");
  const args = [cli, appId, "launch", "-", String(port)];
  if (serial) args.push(serial);
  args.push("--project", "${workspaceFolder}");
  return {
    label: DOTNET_LAUNCH_TASK_LABEL,
    type: "process",
    command: "node",
    args,
    presentation: { reveal: "silent", panel: "shared", clear: true },
    problemMatcher: [],
  };
}

/** Structural equality for JSON values — key order is irrelevant. */
function jsonDeepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => jsonDeepEqual(v, b[i]))
    );
  }
  if (typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return (
      ka.length === kb.length &&
      ka.every(
        (k) =>
          Object.prototype.hasOwnProperty.call(b, k) &&
          jsonDeepEqual(a[k], b[k]),
      )
    );
  }
  return false;
}

/** Indentation unit of an existing JSON file (tabs or spaces); two spaces when undetectable. */
function detectJsonIndent(text) {
  const m = text.match(/^([ \t]+)\S/m);
  return m ? m[1] : "  ";
}

/**
 * Plan the merge of one entry into a VS Code `.vscode/*.json` file that holds
 * an array of entries (launch.json `configurations`, tasks.json `tasks`) —
 * without writing. Only the entry selected by `match` is replaced; everything
 * else is preserved, the file's own indentation and trailing-newline style are
 * kept, and an entry that is structurally equal (key order ignored) counts as
 * unchanged so a user's file is never rewritten for nothing. A file that is
 * not strict JSON (comments, trailing commas) is reported as skipped.
 *
 * @param {string} filePath
 * @param {{defaults: object, key: string, match: (e: object) => boolean, entry: object}} p
 * @returns {{action: 'created'|'updated'|'unchanged'|'skipped', reason?: string, text?: string}}
 *   `text` is the content to write; absent when unchanged or skipped
 */
function planVscodeJsonMerge(filePath, { defaults, key, match, entry }) {
  let doc = { ...defaults, [key]: [] };
  let indent = "  ";
  let eol = "\n";
  let action = "created";
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return {
        action: "skipped",
        reason: `${filePath} exists but is not strict JSON (${e.message}); add the entry by hand.`,
      };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        action: "skipped",
        reason: `${filePath} exists but is not a JSON object; add the entry by hand.`,
      };
    }
    indent = detectJsonIndent(raw);
    eol = raw.endsWith("\n") ? "\n" : "";
    doc = parsed;
    if (!Array.isArray(doc[key])) doc[key] = [];
    for (const [k, v] of Object.entries(defaults)) {
      if (doc[k] === undefined) doc[k] = v;
    }
    const idx = doc[key].findIndex((e) => e && match(e));
    if (idx === -1) {
      doc[key].push(entry);
      action = "updated";
    } else if (jsonDeepEqual(doc[key][idx], entry)) {
      return { action: "unchanged" };
    } else {
      doc[key][idx] = entry;
      action = "updated";
    }
  } else {
    doc[key].push(entry);
  }
  return { action, text: `${JSON.stringify(doc, null, indent)}${eol}` };
}

/** Write what {@link planVscodeJsonMerge} planned (no-op for unchanged/skipped). */
function commitVscodeJsonMerge(filePath, plan) {
  if (plan.text === undefined) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, plan.text, "utf-8");
}

/**
 * Plan + commit in one step. See {@link planVscodeJsonMerge}.
 *
 * @returns {{action: 'created'|'updated'|'unchanged'|'skipped', reason?: string}}
 */
function mergeVscodeJson(filePath, spec) {
  const plan = planVscodeJsonMerge(filePath, spec);
  commitVscodeJsonMerge(filePath, plan);
  return {
    action: plan.action,
    ...(plan.reason ? { reason: plan.reason } : {}),
  };
}

/**
 * Write `<projectPath>/.vscode/launch.json` (and, when `opts.appId` is given,
 * `.vscode/tasks.json` with the relaunch task wired in as `preLaunchTask`) for
 * the netcoredbg DAP server the setup script left listening.
 *
 * @param {string} projectPath - absolute project (workspace) directory
 * @param {number} port - DAP server port (host side, sdb-forwarded)
 * @param {{appId?: string, serial?: string, cliPath?: string}} [opts] - with
 *   `appId` the relaunch task is generated; `serial` pins the device; `cliPath`
 *   overrides the runner path (defaults to this plugin's dotnet-debug-cli.js)
 * @returns {{launch_json_path: string, action: 'created'|'updated'|'unchanged'|'skipped',
 *   reason?: string, configuration: object, program: string, cwd: string,
 *   target_framework: string, csproj_path: string, pre_launch_task?: string,
 *   tasks_json_path?: string, tasks_json_action?: string, tasks_reason?: string,
 *   task?: object}}
 * @throws {Error} from {@link resolveDotnetLaunchProgram}
 */
function writeDotnetLaunchJson(projectPath, port, opts = {}) {
  const resolved = resolveDotnetLaunchProgram(projectPath);
  const launchJsonPath = path.join(projectPath, ".vscode", "launch.json");
  const tasksJsonPath = path.join(projectPath, ".vscode", "tasks.json");
  const launchSpec = (preLaunchTask) => ({
    defaults: { version: "0.2.0" },
    key: "configurations",
    match: (c) => c.name === DOTNET_LAUNCH_CONFIG_NAME,
    entry: buildDotnetLaunchConfiguration({
      program: resolved.program,
      cwd: resolved.cwd,
      port,
      preLaunchTask,
    }),
  });

  // Plan everything before writing anything: launch.json first, because a
  // relaunch task nobody references (launch.json unwritable) would be an
  // orphan, and a preLaunchTask pointing at a task that could not be written
  // would break F5. Nothing is committed unless launch.json is writable.
  let task = null;
  let tasksPlan = null;
  let preLaunchTask;
  let launchPlan;
  if (opts.appId) {
    task = buildDotnetLaunchTask({
      appId: opts.appId,
      port,
      serial: opts.serial,
      cliPath: opts.cliPath,
    });
    launchPlan = planVscodeJsonMerge(
      launchJsonPath,
      launchSpec(DOTNET_LAUNCH_TASK_LABEL),
    );
    if (launchPlan.action !== "skipped") {
      tasksPlan = planVscodeJsonMerge(tasksJsonPath, {
        defaults: { version: "2.0.0" },
        key: "tasks",
        match: (t) => t.label === DOTNET_LAUNCH_TASK_LABEL,
        entry: task,
      });
      if (tasksPlan.action === "skipped") {
        launchPlan = planVscodeJsonMerge(launchJsonPath, launchSpec(undefined));
      } else {
        preLaunchTask = DOTNET_LAUNCH_TASK_LABEL;
      }
    }
  } else {
    launchPlan = planVscodeJsonMerge(launchJsonPath, launchSpec(undefined));
  }

  const launchSkipped = launchPlan.action === "skipped";
  if (!launchSkipped) {
    // tasks.json first so launch.json never references a task that is not there yet.
    if (tasksPlan) commitVscodeJsonMerge(tasksJsonPath, tasksPlan);
    commitVscodeJsonMerge(launchJsonPath, launchPlan);
  }

  const tasksInfo = task
    ? {
        tasks_json_path: tasksJsonPath,
        task,
        ...(launchSkipped
          ? {
              tasks_json_action: "skipped",
              tasks_reason: `${launchJsonPath} could not be updated, so the relaunch task was not written either.`,
            }
          : {
              tasks_json_action: tasksPlan.action,
              ...(tasksPlan.reason ? { tasks_reason: tasksPlan.reason } : {}),
            }),
      }
    : {};

  return {
    configuration: launchSpec(preLaunchTask).entry,
    program: resolved.program,
    cwd: resolved.cwd,
    target_framework: resolved.targetFramework,
    csproj_path: resolved.csprojPath,
    launch_json_path: launchJsonPath,
    action: launchPlan.action,
    ...(launchPlan.reason ? { reason: launchPlan.reason } : {}),
    ...(preLaunchTask ? { pre_launch_task: preLaunchTask } : {}),
    ...tasksInfo,
  };
}

/** Known DotNET setup-script failures, checked in order. */
const DOTNET_SETUP_FAILURES = [
  {
    pattern: /No devices found|No connected device/i,
    category: "device_not_found",
    message: () => NO_DEVICE_MESSAGE,
  },
  {
    pattern: /No \.pdb files found|Release configuration/i,
    category: "build_failed",
    message: () =>
      "No .pdb files found — the app was built with Release configuration. Breakpoints WILL NOT WORK. Rebuild with Debug (tizen-build-project -b Debug), reinstall (tizen-install-app), then retry.",
  },
  {
    pattern: /is not installed on .* \(not listed by app_launcher -l\)/i,
    category: "invalid_parameters",
    message: ({ appId }) =>
      `App '${appId}' is not installed on the device (app_launcher -l does not list it), so it cannot be launched for debugging. Install it first (tizen-install-app) and pass the package id exactly as installed; see details for the apps the device does list.`,
  },
  {
    pattern: /netcoredbg DAP server did not start/i,
    category: "io_error",
    message: ({ appId, tail }) => {
      const said = tail.find((l) => /launch_app output:|launch_app:/i.test(l));
      return `Launch mode failed: the platform did not start '${appId}' under netcoredbg (no netcoredbg process appeared).${said ? ` ${said}` : ""} The device image must support the SDK debug-launch contract (__AUL_SDK__): emulator/dev images do, some production images refuse. Full launch_app output is in details.`;
    },
  },
  {
    pattern: /Could not find PID/i,
    category: "io_error",
    message: ({ timeout }) =>
      `Could not find the app PID within ${timeout}s (attach mode). Is the app installed and launchable? Use launch mode (the default) to catch Main().`,
  },
  {
    pattern: /no CoreCLR debug transport|cannot attach/i,
    category: "io_error",
    message: () =>
      `Attach mode not supported for this app (no CoreCLR debug transport). Use launch mode (the default) instead — the app restarts under a netcoredbg DAP server.`,
  },
  {
    pattern: /netcoredbg.*not found|package.*not found/i,
    category: "io_error",
    message: () =>
      `netcoredbg package not found in the SDK. Install the platform's on-demand tools (tizen-sdk-install), then retry.`,
  },
];

/**
 * Resolve `opts.projectPath` to an existing directory ("" when not given).
 *
 * @returns {{error: object}|{projectPath: string}}
 */
function resolveDotnetProjectPath(opts, command) {
  if (opts.projectPath === undefined || opts.projectPath === "") {
    return { projectPath: "" };
  }
  const projectPath = path.resolve(String(opts.projectPath).trim());
  let isDir = false;
  try {
    isDir = fs.statSync(projectPath).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    return {
      error: formatError(
        command,
        "invalid_parameters",
        `Project path does not exist or is not a directory: ${projectPath}`,
      ),
    };
  }
  return { projectPath };
}

/**
 * Validate setupDotnetDebug arguments.
 *
 * @returns {{error: object}|{values: object}}
 */
function validateDotnetDebugArgs(appId, opts, command) {
  if (!appId) {
    return {
      error: formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: appId",
        'setupDotnetDebug("org.tizen.example.MyApp", { launch: true, breakpoints: "Program.cs:25" })',
      ),
    };
  }
  const badAppId = checkDebugAppId(appId, command);
  if (badAppId) return { error: badAppId };
  const validated = validateDebugOpts(opts, command, {
    defaultPort: 4711,
    breakpointsHint: "Use comma-separated File.cs:line entries.",
  });
  if (validated.error) return validated;
  const project = resolveDotnetProjectPath(opts, command);
  if (project.error) return project;
  return {
    values: {
      ...validated.values,
      forceInstall: !!opts.forceInstall,
      projectPath: project.projectPath,
    },
  };
}

/**
 * Launch mode + known project: write .vscode/launch.json so the user only presses F5.
 * A hand-written launch.json is where the placeholder template used to go wrong
 * (wrong debug type, wrong TFM); resolving it from the .csproj removes that step.
 *
 * @returns {{launchJson: object|null, launchJsonWarning: string|null,
 *   tasksJsonWarning: string|null}}
 */
function writeDotnetLaunchJsonForSetup({
  launch,
  projectPath,
  port,
  appId,
  serial,
}) {
  const out = {
    launchJson: null,
    launchJsonWarning: null,
    tasksJsonWarning: null,
  };
  if (!launch || !projectPath) return out;
  try {
    const launchJson = writeDotnetLaunchJson(projectPath, port, {
      appId,
      serial,
    });
    out.launchJson = launchJson;
    if (launchJson.action === "skipped") {
      out.launchJsonWarning = `launch.json not written: ${launchJson.reason}`;
    }
    if (launchJson.tasks_json_action === "skipped") {
      out.tasksJsonWarning = `tasks.json not written: ${launchJson.tasks_reason} Without the "${DOTNET_LAUNCH_TASK_LABEL}" preLaunchTask, re-run this runner before every F5.`;
    }
  } catch (e) {
    out.launchJsonWarning = `launch.json not written: ${e.message}`;
  }
  return out;
}

/**
 * Launch-mode `launch_config` + `note`: the written launch.json when it is
 * ready, else the placeholder template guidance.
 *
 * @param {object|null} launchJson - {@link writeDotnetLaunchJson} result
 * @param {{port: number, projectPath: string}} p
 * @returns {{launchConfig: object, launchNote: string}}
 */
function buildDotnetLaunchGuidance(launchJson, { port, projectPath }) {
  const launchJsonReady = launchJson && launchJson.action !== "skipped";
  const relaunchWired = launchJsonReady && !!launchJson.pre_launch_task;
  // netcoredbg ends the app and itself when the client disconnects, so the
  // "reconnect" story is: relaunch. Say how, depending on what got written.
  const stopNote = relaunchWired
    ? `Stopping the session ends the app and the DAP server; pressing F5 again re-runs the "${DOTNET_LAUNCH_TASK_LABEL}" task, which relaunches the app under netcoredbg.`
    : "Stopping the session ends the app and the DAP server — re-run this runner before the next F5.";
  const csharpExtNote =
    "The coreclr debug type needs the C# extension (ms-dotnettools.csharp).";
  const listening = `${LAUNCH_SUSPENDED_NOTE} netcoredbg DAP server is listening on device port ${port}; host tcp:${port} is forwarded.`;
  if (!launchJsonReady) {
    return {
      launchConfig: {
        type: "coreclr",
        request: "launch",
        debug_server_port: port,
        workspace_placeholder: "<APP_FOLDER_NAME>",
        note: `${LAUNCH_SUSPENDED_NOTE} Create .vscode/launch.json in the workspace root with the netcoredbg DAP config. Replace <APP_FOLDER_NAME> with your app folder name. ${stopNote} ${csharpExtNote}`,
      },
      launchNote: `${listening} Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5. ${stopNote}`,
    };
  }
  return {
    launchConfig: {
      ...launchJson.configuration,
      debug_server_port: port,
      launch_json_path: launchJson.launch_json_path,
      launch_json_action: launchJson.action,
      ...(launchJson.tasks_json_path
        ? {
            tasks_json_path: launchJson.tasks_json_path,
            tasks_json_action: launchJson.tasks_json_action,
          }
        : {}),
      ...(launchJson.pre_launch_task
        ? { pre_launch_task: launchJson.pre_launch_task }
        : {}),
      csproj_path: launchJson.csproj_path,
      target_framework: launchJson.target_framework,
      note: `${LAUNCH_SUSPENDED_NOTE} .vscode/launch.json is ready (${launchJson.action}${relaunchWired ? `; tasks.json ${launchJson.tasks_json_action}` : ""}): open ${projectPath} in VS Code, pick "${DOTNET_LAUNCH_CONFIG_NAME}", set a breakpoint, press F5. ${stopNote} ${csharpExtNote}`,
    },
    launchNote: `${listening} ${launchJson.launch_json_path} is ready (${launchJson.action}) — open the project in VS Code, select "${DOTNET_LAUNCH_CONFIG_NAME}", set a breakpoint, and press F5. ${stopNote}`,
  };
}

/** Attach-mode `note`, depending on which debug_command forms were printed. */
function dotnetAttachNote(debugCommand) {
  return debugCommand.powershell
    ? "Run ONE of the debug_command lines in an interactive terminal: powershell form (leading & is PowerShell-only) or cmd form. The app is running and netcoredbg is installed."
    : "Run the debug_command.shell line in an interactive terminal. The app is running and netcoredbg is installed.";
}

/**
 * Build the setupDotnetDebug success envelope from the setup script output
 * (writing .vscode/launch.json first in launch mode with a project path).
 *
 * @returns {object} Standard JSON Envelope
 */
function buildDotnetSetupResult(output, ctx) {
  const { command, startTime, appId, values } = ctx;
  const { launch, port, breakpoints } = values;
  // Success marker parsing
  const launchAppId = matchTrimmed(output, /^APP_LAUNCH_ID=(.+)$/m);
  const appState = matchTrimmed(output, /^APP_STATE=(.+)$/m);
  // Unix script can output single line without label
  const debugCommand = parseDebuggerCommand(
    output,
    /^\s*("[^"\n]+" -s [^"]+ shell "[^"\n]+")\s*$/m,
  );

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

  const { launchJson, launchJsonWarning, tasksJsonWarning } =
    writeDotnetLaunchJsonForSetup({ ...values, appId });
  const guidance = launch
    ? buildDotnetLaunchGuidance(launchJson, values)
    : { launchConfig: null, launchNote: null };

  return debugSetupSuccess(
    command,
    startTime,
    {
      app_id: appId,
      // the id app_launcher actually launched (may differ from the package id)
      launch_app_id: launchAppId !== null ? launchAppId : appId,
      mode: launch ? "launch" : "attach",
      // launch: "suspended_under_debugger" — no UI until VS Code connects
      app_state:
        appState !== null
          ? appState
          : launch
            ? "suspended_under_debugger"
            : "running",
      port: launch ? port : null,
      breakpoints: splitBreakpoints(breakpoints),
      app_pid: parseAppPid(output),
      netcoredbg_status: "installed",
      // launch mode: the script forwarded the DAP port
      port_forwarded: launch ? /forward/i.test(output) : false,
      debug_command: !launch ? debugCommand : null,
      launch_config: guidance.launchConfig,
      note: launch ? guidance.launchNote : dotnetAttachNote(debugCommand),
    },
    [
      ...(launchJsonWarning ? [launchJsonWarning] : []),
      ...(tasksJsonWarning ? [tasksJsonWarning] : []),
      ...summarizeDotnetDebugOutput(output),
    ],
  );
}

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
 * @param {string} [opts.projectPath] - host project (workspace) directory. Launch mode
 *   only: when given, `<projectPath>/.vscode/launch.json` is created/updated with a
 *   ready-to-run `coreclr` configuration (program/cwd resolved from the .csproj), so
 *   the user just presses F5 instead of copying a placeholder template.
 * @returns {object} Standard JSON Envelope
 */
async function setupDotnetDebug(
  appId,
  opts = {},
  command = "tizen-sdk dotnet-debug",
) {
  const startTime = Date.now();
  try {
    const validated = validateDotnetDebugArgs(appId, opts, command);
    if (validated.error) return validated.error;
    const { values } = validated;

    const run = runDebugSetupScript({
      command,
      scriptGroup: "tizen-dotnet-debug",
      scriptBase: "tizen-dotnet-debug",
      logTag: "[tizen-dotnet-debug]",
      args: { ...values, appId },
      failure: {
        command,
        startTime,
        rules: DOTNET_SETUP_FAILURES,
        ctx: { appId, timeout: values.timeout },
        label: "DotNET debug",
        summarize: summarizeDotnetDebugOutput,
        withDetails: true,
      },
    });
    if (run.error) return run.error;

    return buildDotnetSetupResult(run.output, {
      command,
      startTime,
      appId,
      values,
    });
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
  DOTNET_LAUNCH_CONFIG_NAME,
  DOTNET_LAUNCH_TASK_LABEL,
  parseCsprojProps,
  resolveDotnetLaunchProgram,
  buildDotnetLaunchConfiguration,
  buildDotnetLaunchTask,
  jsonDeepEqual,
  planVscodeJsonMerge,
  mergeVscodeJson,
  writeDotnetLaunchJson,
};
