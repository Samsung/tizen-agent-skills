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
    // Same screen the other execPluginScript callers use (adds line breaks
    // and the trailing-backslash case to the old inline character list).
    const unsafeBinary = checkShellSafe(binaryPath, "binary path", command);
    if (unsafeBinary) return unsafeBinary;
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
    // Serial is spliced into the script argument string (`-Serial "<s>"` /
    // `-s "<s>"`) and ends up in `sdb -s <s>`: the shared SERIAL_PATTERN
    // (letters, digits, . _ : -, no leading "-", ≤ 64 chars) is the same
    // screen resolveSerial() applies for every other command.
    const serial = opts.serial ? String(opts.serial).trim() : "";
    if (serial && !isValidSerial(serial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device serial "${serial}": only letters, digits, '.', '_', ':' and '-' are allowed (no leading '-', at most 64 characters).`,
      );
    }

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
      (serial ? ` -Serial "${serial}"` : "") +
      (breakpoints ? ` -Breakpoints "${breakpoints}"` : "") +
      (launch ? " -Launch" : "") +
      " -SetupOnly";
    const unixArgs =
      `-a "${appId}" -b "${binaryPath}" -p ${port} -t ${timeout}` +
      (serial ? ` -s "${serial}"` : "") +
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
    const serialMatch = output.match(/Target device:\s*(\S+)/);
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
        // The device the scripts pinned every sdb call to (--serial, else the
        // first connected device as the script reported it).
        device_serial: serial || (serialMatch ? serialMatch[1].trim() : null),
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
    // Same screen as setupGdbDebug: the serial is spliced into the script
    // argument string, so it must be a plain identifier.
    const serial = opts.serial ? String(opts.serial).trim() : "";
    if (serial && !isValidSerial(serial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device serial "${serial}": only letters, digits, '.', '_', ':' and '-' are allowed (no leading '-', at most 64 characters).`,
      );
    }
    let projectPath = "";
    if (opts.projectPath !== undefined && opts.projectPath !== "") {
      projectPath = path.resolve(String(opts.projectPath).trim());
      let isDir = false;
      try {
        isDir = fs.statSync(projectPath).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) {
        return formatError(
          command,
          "invalid_parameters",
          `Project path does not exist or is not a directory: ${projectPath}`,
        );
      }
    }

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

    // launch mode + known project: write .vscode/launch.json so the user only presses F5.
    // A hand-written launch.json is where the placeholder template used to go wrong
    // (wrong debug type, wrong TFM); resolving it from the .csproj removes that step.
    let launchJson = null;
    let launchJsonWarning = null;
    let tasksJsonWarning = null;
    if (launch && projectPath) {
      try {
        launchJson = writeDotnetLaunchJson(projectPath, port, {
          appId,
          serial,
        });
        if (launchJson.action === "skipped") {
          launchJsonWarning = `launch.json not written: ${launchJson.reason}`;
        }
        if (launchJson.tasks_json_action === "skipped") {
          tasksJsonWarning = `tasks.json not written: ${launchJson.tasks_reason} Without the "${DOTNET_LAUNCH_TASK_LABEL}" preLaunchTask, re-run this runner before every F5.`;
        }
      } catch (e) {
        launchJsonWarning = `launch.json not written: ${e.message}`;
      }
    }
    const launchJsonReady = launchJson && launchJson.action !== "skipped";
    const relaunchWired = launchJsonReady && !!launchJson.pre_launch_task;
    // netcoredbg ends the app and itself when the client disconnects, so the
    // "reconnect" story is: relaunch. Say how, depending on what got written.
    const stopNote = relaunchWired
      ? `Stopping the session ends the app and the DAP server; pressing F5 again re-runs the "${DOTNET_LAUNCH_TASK_LABEL}" task, which relaunches the app under netcoredbg.`
      : "Stopping the session ends the app and the DAP server — re-run this runner before the next F5.";
    const csharpExtNote =
      "The coreclr debug type needs the C# extension (ms-dotnettools.csharp).";
    const launchConfig = launch
      ? launchJsonReady
        ? {
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
          }
        : {
            type: "coreclr",
            request: "launch",
            debug_server_port: port,
            workspace_placeholder: "<APP_FOLDER_NAME>",
            note: `${LAUNCH_SUSPENDED_NOTE} Create .vscode/launch.json in the workspace root with the netcoredbg DAP config. Replace <APP_FOLDER_NAME> with your app folder name. ${stopNote} ${csharpExtNote}`,
          }
      : null;
    const launchNote = launchJsonReady
      ? `${LAUNCH_SUSPENDED_NOTE} netcoredbg DAP server is listening on device port ${port}; host tcp:${port} is forwarded. ${launchJson.launch_json_path} is ready (${launchJson.action}) — open the project in VS Code, select "${DOTNET_LAUNCH_CONFIG_NAME}", set a breakpoint, and press F5. ${stopNote}`
      : `${LAUNCH_SUSPENDED_NOTE} netcoredbg DAP server is listening on device port ${port}; host tcp:${port} is forwarded. Create .vscode/launch.json, open the project in VS Code, set a breakpoint, and press F5. ${stopNote}`;

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
        launch_config: launchConfig,
        note: launch
          ? launchNote
          : debugCommand.powershell
            ? "Run ONE of the debug_command lines in an interactive terminal: powershell form (leading & is PowerShell-only) or cmd form. The app is running and netcoredbg is installed."
            : "Run the debug_command.shell line in an interactive terminal. The app is running and netcoredbg is installed.",
      },
      {
        // Key lines only (warnings/errors) instead of full setup log
        warnings: [
          ...(launchJsonWarning ? [launchJsonWarning] : []),
          ...(tasksJsonWarning ? [tasksJsonWarning] : []),
          ...summarizeDotnetDebugOutput(output),
        ],
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
