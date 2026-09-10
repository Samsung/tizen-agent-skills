// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK domain: initialization / status check / pre-install verification / TV SDK extension
 *
 * Manages SDK path config (~/.tizen.sdk.path.config) and determines installation status.
 * Does not execute actual installation (10-15 minutes) but performs pre-verification only,
 * and guides the agent to execute the installer script in background.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const {
  formatSdkInit,
  formatSdkStatus,
  formatSdkInstall,
  formatError,
  formatTvSdkInstall,
  formatPackageUpdate,
  formatRepoInfo,
  formatEmulatorPackageDownload,
  formatRepoUrlValidation,
  formatCustomRepoInstall,
  formatPlatformInstall,
  formatMobilePlatformDownload,
  formatRootstrapInstall,
} = require("../envelope/response-formatter");

const { resolveScript, execPluginScript } = require("./plugin-cache");
const { checkNode, checkDiskSpace } = require("./preflight");

const CONFIG_FILE = path.join(os.homedir(), ".tizen.sdk.path.config");
const DEFAULT_SDK_PATH = path.join(os.homedir(), "tizen-sdk");

/**
 * SDK initialization: set path and create config file
 *
 * @param {string} sdkPath - Tizen SDK installation path
 * @param {string} [command] - Command name for the envelope (default: 'tizen-sdk sdk-init')
 * @returns {object} Standard JSON Envelope
 */
async function initSdk(sdkPath, command = "tizen-sdk sdk-init") {
  try {
    // Validate path
    if (!sdkPath || typeof sdkPath !== "string") {
      return formatError(
        command,
        "sdk_path_invalid",
        "SDK path must be a non-empty string",
        "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
      );
    }

    if (!fs.existsSync(sdkPath)) {
      return formatError(
        command,
        "sdk_path_invalid",
        `SDK path does not exist: ${sdkPath}`,
        `Verify that Tizen SDK is installed at ${sdkPath}`,
      );
    }

    // Check read/write permissions
    try {
      fs.accessSync(sdkPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (_e) {
      return formatError(
        command,
        "sdk_path_not_accessible",
        `No read/write permission for SDK path: ${sdkPath}`,
      );
    }

    fs.writeFileSync(CONFIG_FILE, sdkPath, "utf-8");

    // POSIX: user-only permissions (Windows does not support chmod, so just create)
    if (process.platform !== "win32") {
      fs.chmodSync(CONFIG_FILE, 0o600);
    }

    return formatSdkInit(sdkPath, CONFIG_FILE, command);
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to initialize SDK: ${error.message}`,
    );
  }
}

/**
 * Query SDK status
 *
 * @returns {object} Standard JSON Envelope
 */
async function getSdkStatus(command = "tizen-sdk sdk-status") {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return formatError(
        command,
        "sdk_path_not_set",
        "SDK path is not configured",
        "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
      );
    }

    const sdkPath = fs.readFileSync(CONFIG_FILE, "utf-8").trim();

    if (!sdkPath) {
      return formatError(
        command,
        "sdk_path_not_set",
        "SDK path configuration is empty",
      );
    }

    if (!fs.existsSync(sdkPath)) {
      return formatError(
        command,
        "sdk_path_invalid",
        `Configured SDK path does not exist: ${sdkPath}`,
        "tizen-cli tizen-sdk sdk-init --sdk-path /opt/tizen-studio",
      );
    }

    return formatSdkStatus(sdkPath, command);
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to read SDK status: ${error.message}`,
    );
  }
}

/**
 * Scan installed SDK components and generate package list
 *
 * @param {string} sdkPath - SDK installation path
 * @param {string} version - SDK version for display
 * @returns {Array<{name: string, status: string, version: string}>}
 */
function collectInstalledPackages(sdkPath, version) {
  const packages = [];

  const platformsDir = path.join(sdkPath, "platforms");
  if (fs.existsSync(platformsDir)) {
    const platformDirs = fs.readdirSync(platformsDir);
    if (platformDirs.length > 0) {
      packages.push({
        name: `Tizen Platforms (${platformDirs.length})`,
        status: "installed",
        version,
      });
    }
  }

  if (fs.existsSync(path.join(sdkPath, "tools"))) {
    packages.push({ name: "Tizen SDK Tools", status: "installed", version });
  }

  if (packages.length === 0) {
    packages.push({
      name: `Tizen SDK ${version}`,
      status: "installed",
      version,
    });
  }

  return packages;
}

/**
 * SDK installation pre-check (Phase 1)
 *
 * ⚠️ This function does not execute the installer script.
 * Actual installation (10-15 minutes) is performed by the agent via Bash run_in_background (Phase 2).
 * Here we only determine the path + validate installation status + return Standard JSON Envelope.
 *
 * @param {string} version - SDK version (default: '10.0')
 * @param {string} label - SDK label (default: 'tizen')
 * @param {boolean} force - Force reinstall (default: false)
 * @param {string} [repoUrl] - Custom package repository URL. When given, the
 *   whole call is handled by installSdkFromRepo(), which validates the URL
 *   (pkg_list_{OS}-{64,32} must be served) before installing from it instead of
 *   from the timezone-selected CDN mirror.
 * @returns {object} Standard JSON Envelope
 *   - Already installed: success + warnings (exit here)
 *   - Not installed: failure — guide agent to perform background installation
 */
async function installSdk(
  version = "10.0",
  _label = "tizen",
  force = false,
  repoUrl = "",
  command = "tizen-sdk sdk-install",
) {
  // A custom repository changes the package source, the validation step and the
  // installer script, so delegate wholesale instead of threading a flag through.
  if (repoUrl && String(repoUrl).trim()) {
    return installSdkFromRepo(repoUrl, "", force);
  }

  // Start time: pass to formatSdkInstall so duration_ms reflects actual work time
  const startTime = Date.now();
  try {
    // 1. Node.js check (first)
    console.error("[tizen-sdk] Checking Node.js installation...");
    const nodeCheck = await checkNode(command);

    if (nodeCheck.status !== "success") {
      console.error("[tizen-sdk] Node.js not found. Aborting installation.");
      return nodeCheck;
    }
    console.error(
      `[tizen-sdk] Node.js OK (${nodeCheck.result.version}). Continuing.`,
    );

    const sdkPath = readSdkPath();

    console.error("[tizen-sdk] Checking if SDK is already installed...");

    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);

    // Already installed = condition met = success (reinstall only via force)
    // Note: this branch executes in both "already installed when requesting install" and
    // "re-validation immediately after install" cases, so warning text uses neutral language
    // that works naturally in both situations.
    if (statusCheck.alreadyInstalled) {
      console.error(
        "[tizen-sdk] SDK installation verified (sdk.info found). Returning success status.",
      );

      // Auto-init: write SDK path to ~/.tizen.sdk.path.config so that all other
      // skills (build, create, device, debug, etc.) can locate the SDK via
      // readSdkPath().  Without this, the config file may be missing after a
      // fresh install, causing every downstream skill to fall back to the
      // default path — which breaks when a custom install path was used.
      const warnings = [
        `SDK installation verified at ${sdkPath} (sdk.info found). To force a reinstall, run with --force (script flag: -Force).`,
      ];
      // An SDK installed by an older version of this plugin may carry a
      // comment header / BOM in sdk.info that crashes Tizen CLI; fix it while
      // we are here so the next build does not fail on it.
      const repairNote = describeSdkInfoRepair(repairSdkInfo(sdkPath));
      if (repairNote) warnings.push(repairNote);
      const initResult = await initSdk(sdkPath, command);
      if (initResult.status === "success") {
        console.error("[tizen-sdk] SDK path config written automatically.");
        warnings.push(
          `SDK path configured automatically: ${sdkPath} → ${CONFIG_FILE}`,
        );
      } else {
        console.error(
          "[tizen-sdk] Auto-init failed. Config file may need manual setup.",
        );
        warnings.push(
          `SDK path config could not be written automatically: ${initResult.errors?.[0]?.message || "unknown error"}. Run "tizen-sdk sdk-init" manually.`,
        );
      }

      const packages = collectInstalledPackages(sdkPath, version);
      return formatSdkInstall(packages, warnings, startTime, command);
    }

    if (!statusCheck.shouldProceed) {
      return formatError(
        command,
        "build_failed",
        statusCheck.reason,
        null,
        startTime,
      );
    }

    // Not installed → auto-check disk space (user home drive, 15GB threshold)
    console.error(
      "[tizen-sdk] SDK not installed. Checking disk space (15 GB required)...",
    );
    const diskCheck = await checkDiskSpace(os.homedir(), 15, command);

    if (diskCheck.status !== "success") {
      // Insufficient disk space → abort installation
      console.error(
        "[tizen-sdk] Insufficient disk space. Aborting installation.",
      );
      return diskCheck;
    }
    console.error(
      `[tizen-sdk] Disk space OK (${diskCheck.result.free_gb} GB free). Proceeding to install.`,
    );

    // Resolve installer script
    const installer = resolveScript("tizen-sdk-install");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    if (isPkg) {
      // Direct execution: run installer script synchronously (10-15 min)
      console.error(`[tizen-sdk] Running installer: ${installer.scriptPath}`);
      try {
        const pathArgs = installerPathArgs(sdkPath);
        execPluginScript(
          installer.scriptPath,
          `${pathArgs.win}${force ? " -Force" : ""}`,
          `${pathArgs.unix}${force ? " --force" : ""}`,
        );
        console.error("[tizen-sdk] Installer completed.");

        // Verify installation: check sdk.info
        const sdkInfoPath = path.join(sdkPath, "sdk.info");
        if (fs.existsSync(sdkInfoPath)) {
          console.error(
            "[tizen-sdk] SDK installation verified (sdk.info found).",
          );

          // Auto-init: write SDK path to ~/.tizen.sdk.path.config so that all
          // other skills (build, create, device, debug, etc.) can locate the
          // SDK via readSdkPath().
          const warnings = [`SDK installed successfully at ${sdkPath}.`];
          const initResult = await initSdk(sdkPath, command);
          if (initResult.status === "success") {
            console.error("[tizen-sdk] SDK path config written automatically.");
            warnings.push(
              `SDK path configured automatically: ${sdkPath} → ${CONFIG_FILE}`,
            );
          } else {
            console.error(
              "[tizen-sdk] Auto-init failed. Config file may need manual setup.",
            );
            warnings.push(
              `SDK path config could not be written automatically: ${initResult.errors?.[0]?.message || "unknown error"}. Run "tizen-sdk sdk-init" manually.`,
            );
          }

          const packages = collectInstalledPackages(sdkPath, version);
          return formatSdkInstall(packages, warnings, startTime, command);
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but sdk.info not found at ${sdkInfoPath}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `SDK installation failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): hand the installer to the agent
      // as suggested_fix — foreground command plus its detached-job twin.
      // The install path is passed explicitly: the installer's own default
      // honoured a stray TIZEN_SDK_PATH (e.g. ~/tizen-studio from .zshrc) and
      // unpacked tizen-sdk into the Tizen Studio directory (issue #70).
      const pathArgs = installerPathArgs(sdkPath);
      const installerCommand = installerFix(
        "tizen-sdk-install",
        installer.scriptPath,
        `${pathArgs.win}${force ? " -Force" : ""}`,
        `${pathArgs.unix}${force ? " --force" : ""}`,
      );

      return formatError(
        command,
        "execution_error",
        "SDK is NOT installed. This pre-check CLI cannot install it (10-15 min job). " +
          harnessGuidance("detach") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/sdk.info exists. " +
          "If the run state is unknown, query it with the installer's -Status (Windows) / --status (bash) flag, " +
          "or node job-cli.js list for a job started via background_command. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install SDK: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Build the platform-appropriate shell command that runs a plugin script.
 * Used as suggested_fix when this pre-check CLI cannot run the script itself
 * (installSdk / installTvSdk / updatePackage share this shape).
 *
 * @param {string} scriptPath
 * @param {string} [winArgs] - arguments appended on Windows (PowerShell)
 * @param {string} [unixArgs] - arguments appended on Linux/macOS (bash)
 * @returns {string}
 */
function buildScriptCommand(scriptPath, winArgs = "", unixArgs = "") {
  if (process.platform === "win32") {
    const psPath = scriptPath.replace(/\\/g, "/");
    return `powershell -ExecutionPolicy Bypass -File "${psPath}"${winArgs ? ` ${winArgs}` : ""}`;
  }
  return `bash "${scriptPath}"${unixArgs ? ` ${unixArgs}` : ""}`;
}

/**
 * The same installer launch rendered as a detached job for harnesses whose
 * tool call cannot outlive the install (Codex CLI: 30 s per exec call, issue
 * #48): `node <lib/cli>/job-cli.js run --script <group> [-- <args>]`. The job
 * runner resolves <group> through the plugin's own resolveScript(), so it
 * launches the very file `buildScriptCommand` points at, and the caller polls
 * `job-cli.js wait --id <job_id>` for the exit code + log tail.
 *
 * @param {string} group - scripts/<group>/<group>.{ps1,sh}
 * @param {string} [winArgs] - arguments appended on Windows (PowerShell)
 * @param {string} [unixArgs] - arguments appended on Linux/macOS (bash)
 * @returns {string}
 */
function buildJobCommand(group, winArgs = "", unixArgs = "") {
  const jobCli = path.join(__dirname, "..", "cli", "job-cli.js");
  const cliPath =
    process.platform === "win32" ? jobCli.replace(/\\/g, "/") : jobCli;
  const args = (process.platform === "win32" ? winArgs : unixArgs).trim();
  return `node "${cliPath}" run --script ${group}${args ? ` -- ${args}` : ""}`;
}

/**
 * suggested_fix payload for a Phase-2 installer: the foreground command plus
 * its detached-job twin. Every long-running pre-check hands both back so each
 * harness can pick the one it can actually run (see harnessGuidance).
 *
 * @param {string} group - scripts/<group>
 * @param {string|null} scriptPath - resolved installer path (null → not found)
 * @param {string} [winArgs]
 * @param {string} [unixArgs]
 * @param {string} [notFound] - message used as `command` when scriptPath is null
 */
/**
 * The install-path argument for tizen-sdk-install(-custom-repo) in both script
 * dialects. The JS layer resolves the SDK path (config file → ~/tizen-sdk) and
 * must hand exactly that path to the installer; left implicit, the installer
 * fell back to TIZEN_SDK_PATH from the user's shell profile — issue #70 saw
 * tizen-sdk unpacked into an existing ~/tizen-studio.
 *
 * @param {string} sdkPath
 * @returns {{win: string, unix: string}}
 */
function installerPathArgs(sdkPath) {
  return {
    win: `-Path "${String(sdkPath).replace(/\\/g, "/")}"`,
    unix: `--path "${sdkPath}"`,
  };
}

function installerFix(
  group,
  scriptPath,
  winArgs = "",
  unixArgs = "",
  notFound,
) {
  if (!scriptPath) {
    return { command: notFound || `Installer script not found: ${group}` };
  }
  return {
    command: buildScriptCommand(scriptPath, winArgs, unixArgs),
    background_command: buildJobCommand(group, winArgs, unixArgs),
  };
}

/**
 * The per-harness instructions every Phase-1 pre-check puts in its "not
 * installed" message. One source so the Codex clause cannot drift between the
 * eight installers.
 *
 * @param {"detach"|"foreground"} clineMode - what Cline should do with the
 *   script: use its own --detach/--status (the two SDK installers implement
 *   them) or run it in the foreground (the other installers).
 * @returns {string} sentence(s) ending with a trailing space
 */
function harnessGuidance(clineMode) {
  const cline =
    clineMode === "foreground"
      ? "Cline / harnesses WITHOUT background completion notification — run in FOREGROUND " +
        "(Cline's execute_command has no 10-min timeout and streams progress logs). " +
        "Do NOT background it: no Start-Process, no start /b, no trailing &. "
      : "Cline / harnesses WITHOUT background completion notification — use --detach (Linux/macOS) " +
        "or -Detach (Windows) to launch a detached process, then poll --status / -Status every 60s " +
        "until STATUS=done. Do NOT use run_in_background (10-min timeout kills the process). " +
        "Do NOT run in foreground (the package log floods the context window). ";
  return (
    "Run the suggested_fix command per your harness: " +
    "Claude Code — Bash tool with run_in_background: true, END YOUR TURN, resume on <task-notification>. " +
    cline +
    "Codex CLI — one exec call waits at most 30 s, so do NOT run suggested_fix.command; run " +
    "suggested_fix.background_command instead (it detaches the same script as a job and returns a " +
    "job_id within a second; request escalated permissions — it downloads, and the default sandbox " +
    "sets CODEX_SANDBOX_NETWORK_DISABLED=1; inside the sandbox it is refused with sandbox_blocked, " +
    "guard rule 12), then poll node <same lib/cli dir>/job-cli.js wait " +
    "--id <job_id> (each call blocks at most 25 s) until job.state is done. "
  );
}

/**
 * Return currently configured SDK path or use default
 *
 * @returns {string} SDK path (configured value or default ~/tizen-sdk)
 */
function readSdkPath() {
  try {
    let resolved = null;
    if (fs.existsSync(CONFIG_FILE)) {
      const sdkPath = fs.readFileSync(CONFIG_FILE, "utf-8").trim();
      if (sdkPath) resolved = sdkPath;
    }
    if (!resolved) {
      console.error(`[tizen-sdk] Using default SDK path: ${DEFAULT_SDK_PATH}`);
      resolved = DEFAULT_SDK_PATH;
    }
    // TIZEN_SDK_PATH is deliberately NOT a source here: the config file written
    // by sdk-init is the one place every layer agrees on. Say so when the env
    // var disagrees, so a stale ~/tizen-studio export is visible (issue #70).
    const envPath = (process.env.TIZEN_SDK_PATH || "").trim();
    if (envPath && path.resolve(envPath) !== path.resolve(resolved)) {
      console.error(
        `[tizen-sdk] Ignoring TIZEN_SDK_PATH=${envPath}; the SDK path comes from ${CONFIG_FILE} (${resolved}). ` +
          "Run tizen-sdk-init to change it.",
      );
    }
    return resolved;
  } catch (_error) {
    console.error(
      `[tizen-sdk] Error reading config, using default: ${DEFAULT_SDK_PATH}`,
    );
    return DEFAULT_SDK_PATH;
  }
}

/**
 * Check SDK installation status (local)
 *
 * sdk.info is a completion marker created only when the installer script succeeds fully —
 * the existence of this file means "installation complete".
 *
 * @param {string} sdkPath - SDK path
 * @returns {{installed: boolean, sdkPath: string|null, sdkInfoPath: string|null, message: string}}
 */
function checkSdkInstallStatus(sdkPath) {
  try {
    if (!sdkPath) {
      return {
        installed: false,
        sdkPath: null,
        sdkInfoPath: null,
        message: "SDK path not configured",
      };
    }

    const sdkInfoPath = path.join(sdkPath, "sdk.info");
    const installed = fs.existsSync(sdkInfoPath);

    return {
      installed,
      sdkPath,
      sdkInfoPath,
      message: installed
        ? "SDK is already installed (sdk.info found)"
        : "SDK is not installed (sdk.info not found)",
    };
  } catch (error) {
    return {
      installed: false,
      sdkPath: null,
      sdkInfoPath: null,
      message: `Error checking SDK status: ${error.message}`,
    };
  }
}

/**
 * Make an existing `<sdkPath>/sdk.info` parseable by Tizen CLI.
 *
 * Tizen CLI's tpklib `PropertyParser.getKey()` is `line.substring(0,
 * line.indexOf("="))` with no comment/blank-line handling, so any line without
 * "=" throws StringIndexOutOfBoundsException(-1) inside SDKConstants.<clinit>
 * and the whole command dies — most visibly `tizen package -t rpk`
 * ("[ERROR] RPK package failed"). A UTF-8 BOM breaks it more quietly: the first
 * key becomes "<U+FEFF>TIZEN_SDK_INSTALLED_PATH" and is never found.
 *
 * Installers up to 1.1.1 wrote exactly that: a "# Tizen SDK Configuration"
 * header, and on Windows PowerShell 5.1 a BOM (`Set-Content -Encoding UTF8`).
 * New installs are clean, but every SDK installed earlier still carries the
 * bad file, so the runners that hand the SDK to Tizen CLI call this first.
 *
 * Rewrites the file only when it has to (BOM, or a line that is blank or has
 * no "="), keeping KEY=VALUE lines verbatim — including "#" inside a value —
 * and the file's own line-ending style. Never throws.
 *
 * @param {string} sdkPath - SDK root (the directory holding sdk.info)
 * @returns {{path: string|null, repaired: boolean, bom_removed: boolean,
 *   removed_lines: string[], error: string|null}}
 */
function repairSdkInfo(sdkPath) {
  const result = {
    path: null,
    repaired: false,
    bom_removed: false,
    removed_lines: [],
    error: null,
  };
  try {
    if (!sdkPath) return result;
    const sdkInfoPath = path.join(sdkPath, "sdk.info");
    result.path = sdkInfoPath;
    if (!fs.existsSync(sdkInfoPath)) return result;

    let text = fs.readFileSync(sdkInfoPath, "utf-8");
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
      result.bom_removed = true;
    }

    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    // The final newline yields one empty tail element; that is not a line.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const kept = [];
    for (const line of lines) {
      (line.includes("=") ? kept : result.removed_lines).push(line);
    }
    if (!result.bom_removed && result.removed_lines.length === 0) return result;

    fs.writeFileSync(sdkInfoPath, kept.join(eol) + eol, "utf-8");
    result.repaired = true;
    console.error(
      `[tizen-sdk] Repaired ${sdkInfoPath} for Tizen CLI` +
        (result.bom_removed ? " (removed UTF-8 BOM)" : "") +
        (result.removed_lines.length > 0
          ? ` (dropped ${result.removed_lines.length} comment/blank line(s))`
          : ""),
    );
    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

/**
 * Human-readable one-liner for a repairSdkInfo() result, or null when nothing
 * happened. Callers append it to the envelope's warnings so the user learns
 * that a file under their SDK was rewritten and why.
 *
 * @param {ReturnType<typeof repairSdkInfo>} repair
 * @returns {string|null}
 */
function describeSdkInfoRepair(repair) {
  if (!repair) return null;
  if (repair.error) {
    return `sdk.info at ${repair.path} could not be checked for Tizen CLI compatibility: ${repair.error}`;
  }
  if (!repair.repaired) return null;
  const parts = [];
  if (repair.bom_removed) parts.push("a UTF-8 BOM");
  if (repair.removed_lines.length > 0) {
    parts.push(
      `${repair.removed_lines.length} comment/blank line(s) (e.g. ${JSON.stringify(repair.removed_lines[0])})`,
    );
  }
  return (
    `Repaired ${repair.path}: removed ${parts.join(" and ")}. ` +
    "Tizen CLI reads sdk.info as strict KEY=VALUE lines and crashes on anything else " +
    "(StringIndexOutOfBoundsException in PropertyParser.getKey, e.g. during RPK packaging)."
  );
}

/**
 * Check SDK installation status via script check mode
 *
 * Query the installer script itself: Windows `-Check`, Linux/macOS `--check`.
 *
 * @param {string} sdkPath - SDK path
 * @returns {{status: string, exitCode: number, message: string, alreadyInstalled: boolean}}
 */
async function checkSdkInstallationViaScript(sdkPath) {
  try {
    if (!sdkPath) {
      return {
        status: "error",
        exitCode: 1,
        message: "SDK path is required",
        alreadyInstalled: false,
      };
    }

    console.error(
      `[tizen-sdk] Checking SDK installation status at ${sdkPath}...`,
    );

    const resolved = resolveScript("tizen-sdk-install");
    if (resolved.error) {
      return {
        status: "error",
        exitCode: 1,
        message: resolved.error,
        alreadyInstalled: false,
      };
    }

    let output;
    try {
      output = execPluginScript(
        resolved.scriptPath,
        `-Check -SdkPath "${sdkPath}"`,
        `--check --sdk-path="${sdkPath}"`,
      );
    } catch (error) {
      const errOutput = error.stderr || error.message;

      // Even if check mode exits abnormally, if output contains install signal, consider it installed
      if (
        errOutput.includes("already installed") ||
        errOutput.includes("sdk.info")
      ) {
        return {
          status: "done",
          exitCode: 0,
          message: "SDK is already installed",
          alreadyInstalled: true,
        };
      }

      return {
        status: "error",
        exitCode: error.status || 1,
        message: `Check mode failed: ${errOutput}`,
        alreadyInstalled: false,
      };
    }

    console.error(`[tizen-sdk] Check mode output: ${output}`);

    if (output.includes("already installed") || output.includes("sdk.info")) {
      return {
        status: "done",
        exitCode: 0,
        message: "SDK is already installed",
        alreadyInstalled: true,
      };
    }

    return {
      status: "done",
      exitCode: 0,
      message: "SDK is not yet installed. Ready to install.",
      alreadyInstalled: false,
    };
  } catch (error) {
    return {
      status: "error",
      exitCode: 1,
      message: `Check mode error: ${error.message}`,
      alreadyInstalled: false,
    };
  }
}

/**
 * Pre-installation status check (3 stages)
 *
 * Stage 1: local sdk.info check (fast, skip stage 2 if found)
 * Stage 2: run script check mode
 * Stage 3: make decision
 *
 * @param {string} sdkPath - SDK path
 * @param {boolean} force - if true, proceed even if already installed
 * @returns {{alreadyInstalled: boolean, shouldProceed: boolean, reason: string}}
 */
async function checkIfSdkAlreadyInstalled(sdkPath, force = false) {
  try {
    // Stage 1: local sdk.info check
    const localStatus = checkSdkInstallStatus(sdkPath);

    if (localStatus.installed && !force) {
      console.error("[tizen-sdk] SDK is already installed (sdk.info found)");
      return {
        alreadyInstalled: true,
        shouldProceed: false,
        reason: "SDK is already installed. Use -Force/--force to reinstall.",
      };
    }

    // Stage 2: script check mode
    const checkResult = await checkSdkInstallationViaScript(sdkPath);

    if (checkResult.alreadyInstalled && !force) {
      console.error("[tizen-sdk] SDK is already installed (via check mode)");
      return {
        alreadyInstalled: true,
        shouldProceed: false,
        reason: "SDK is already installed. Use -Force/--force to reinstall.",
      };
    }

    // Stage 3: proceed
    return {
      alreadyInstalled: false,
      shouldProceed: true,
      reason: "SDK is not installed. Ready to proceed.",
    };
  } catch (error) {
    return {
      alreadyInstalled: false,
      shouldProceed: true,
      reason: `Error checking status: ${error.message}. Proceeding with installation.`,
    };
  }
}

/**
 * TV SDK extension package installation pre-check (Phase 1)
 *
 * TV SDK is an extension package (TV-SAMSUNG-Public) of Tizen SDK, so Tizen SDK
 * must already be installed. This function performs pre-check only, not actual installation.
 *
 * Flow:
 * 1. Check if Tizen SDK is installed (sdk.info) — abort with interactive guidance if not
 * 2. Check if TV SDK is already installed (.tv-sdk-installed marker)
 * 3. Return TV SDK installer command (suggested_fix) — agent executes in Phase 2 background
 *
 * @param {boolean} force - force reinstall (default: false)
 * @returns {object} Standard JSON Envelope
 */
async function installTvSdk(
  force = false,
  command = "tizen-sdk tv-sdk-install",
) {
  const startTime = Date.now();
  try {
    // 1. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error("[tizen-tv-sdk] Checking if Tizen SDK is installed...");

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-tv-sdk] Tizen SDK is NOT installed. Aborting TV SDK installation.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. TV SDK is an extension that requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry TV SDK installation. " +
          'Ask the user: "Tizen SDK가 먼저 설치되어야 합니다. Tizen SDK 설치를 진행하시겠습니까?" ' +
          "If the user approves, run the tizen-sdk-install skill, then retry TV SDK installation. " +
          "If the user declines, abort.",
        null,
        startTime,
      );
    }
    console.error(`[tizen-tv-sdk] Tizen SDK found at ${sdkPath}. Continuing.`);

    // 2. Check if TV SDK is already installed
    const tvSdkMarker = path.join(sdkPath, ".tv-sdk-installed");
    if (fs.existsSync(tvSdkMarker) && !force) {
      console.error(
        "[tizen-tv-sdk] TV SDK is already installed (.tv-sdk-installed found).",
      );
      const packages = [
        {
          name: "TV-SAMSUNG-Public",
          status: "installed",
          version: "extension",
        },
      ];
      const warnings = [
        `TV SDK installation verified at ${sdkPath} (.tv-sdk-installed found). To force a reinstall, run with --force.`,
      ];
      return formatTvSdkInstall(packages, warnings, startTime, command);
    }

    // 3. Resolve TV SDK installer script
    const installer = resolveScript("tizen-tv-sdk-install");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    if (isPkg) {
      // Direct execution: run TV SDK installer script synchronously
      console.error(
        `[tizen-tv-sdk] Running installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = `-SdkPath "${sdkPath}"${force ? " -Force" : ""}`;
        const unixArgs = `--sdk-path="${sdkPath}"${force ? " --force" : ""}`;
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-tv-sdk] Installer completed.");

        // Verify installation: check .tv-sdk-installed marker
        if (fs.existsSync(tvSdkMarker)) {
          console.error(
            "[tizen-tv-sdk] TV SDK installation verified (.tv-sdk-installed found).",
          );
          const packages = [
            {
              name: "TV-SAMSUNG-Public",
              status: "installed",
              version: "extension",
            },
          ];
          const warnings = [`TV SDK installed successfully at ${sdkPath}.`];
          return formatTvSdkInstall(packages, warnings, startTime, command);
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .tv-sdk-installed not found at ${tvSdkMarker}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `TV SDK installation failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-tv-sdk-install",
        installer.scriptPath,
        `-SdkPath "${sdkPath.replace(/\\/g, "/")}"${force ? " -Force" : ""}`,
        `--sdk-path="${sdkPath}"${force ? " --force" : ""}`,
        `Installer script not found: ${installer.error}`,
      );

      return formatError(
        command,
        "execution_error",
        "TV SDK is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("detach") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.tv-sdk-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install TV SDK: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Package update pre-check (Phase 1)
 *
 * Checks for available updates to installed Tizen SDK packages.
 * Downloads the latest pkg_list, compares versions with installed manifests,
 * and either:
 *   - In pkg-compiled binary: executes the update script directly
 *   - In Claude Code / Cline: returns the update command as suggested_fix
 *     for the agent to run in background (Phase 2)
 *
 * Flow:
 * 1. Check if Tizen SDK is installed (sdk.info) — abort if not
 * 2. Resolve the update-package script
 * 3. If a fresh .package-update-result marker (written by the Phase 2 script)
 *    matches this request, return that run's success/failure envelope
 * 4. Otherwise return update command (suggested_fix) — agent executes in Phase 2 background
 *
 * @param {boolean} force - force update all installed packages regardless of version (default: false)
 * @param {boolean} dryRun - list outdated packages without updating (default: false)
 * @returns {object} Standard JSON Envelope
 */
async function updatePackage(
  force = false,
  dryRun = false,
  command = "tizen-sdk update-package",
) {
  const startTime = Date.now();
  try {
    // 1. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error(
      "[tizen-update-package] Checking if Tizen SDK is installed...",
    );

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-update-package] Tizen SDK is NOT installed. Aborting package update.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. Package update requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry package update.",
        null,
        startTime,
      );
    }
    console.error(
      `[tizen-update-package] Tizen SDK found at ${sdkPath}. Continuing.`,
    );

    // 2. Resolve update-package script
    const updater = resolveScript("tizen-update-package");

    if (!updater.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Update script not found: ${updater.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the updater directly.
    // In Claude Code / Cline (non-pkg), return the updater command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    const winFlags = [];
    const unixFlags = [];
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }
    if (dryRun) {
      winFlags.push("-DryRun");
      unixFlags.push("--dry-run");
    }
    const winFlagStr = winFlags.length > 0 ? " " + winFlags.join(" ") : "";
    const unixFlagStr = unixFlags.length > 0 ? " " + unixFlags.join(" ") : "";

    if (isPkg) {
      // Direct execution: run update script synchronously
      console.error(
        `[tizen-update-package] Running updater: ${updater.scriptPath}`,
      );
      try {
        const winArgs = `-SdkPath "${sdkPath}"${winFlagStr}`;
        const unixArgs = `--sdk-path="${sdkPath}"${unixFlagStr}`;

        const output = execPluginScript(updater.scriptPath, winArgs, unixArgs);
        console.error("[tizen-update-package] Updater completed.");

        // Parse output for summary and per-package detail.
        //
        // Two line shapes carry the package-level data:
        //   dry-run listing:  "    3. PkgName                                   1.0 -> 1.1"
        //   real update:      "[OK] [3/124] PkgName updated: 1.0 -> 1.1"
        // Neither regex matching is fatal if the script's wording ever drifts —
        // `packages` just stays [] like it always used to, so this only adds
        // detail, it never removes the summary counts callers already relied on.
        const packages = [];
        for (const m of output.matchAll(
          /^\s*\d+\.\s+(\S+)\s+(\S+)\s*->\s*(\S+)\s*$/gm,
        )) {
          packages.push({
            name: m[1],
            status: "outdated",
            installed_version: m[2],
            available_version: m[3],
          });
        }
        for (const m of output.matchAll(
          /^\[OK\]\s+\[\d+\/\d+\]\s+(\S+)\s+updated:\s+(\S+)\s*->\s*(\S+)\s*$/gm,
        )) {
          packages.push({
            name: m[1],
            status: "updated",
            installed_version: m[2],
            available_version: m[3],
          });
        }

        let summary = {
          total: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          up_to_date: 0,
        };

        // Try to parse the script output for structured data
        // The script outputs lines like: [OK] Update result: updated X / skipped Y / failed Z / up-to-date W (total N)
        const summaryMatch = output.match(
          /updated\s+(\d+)\s*\/\s*skipped\s+(\d+)\s*\/\s*failed\s+(\d+)\s*\/\s*up-to-date\s+(\d+)\s*\(total\s+(\d+)\)/i,
        );
        if (summaryMatch) {
          summary = {
            updated: parseInt(summaryMatch[1], 10),
            skipped: parseInt(summaryMatch[2], 10),
            failed: parseInt(summaryMatch[3], 10),
            up_to_date: parseInt(summaryMatch[4], 10),
            total: parseInt(summaryMatch[5], 10),
          };
        }

        const warnings = [];
        if (summary.failed > 0) {
          warnings.push(
            `${summary.failed} package(s) failed to update. Check the script output for details.`,
          );
        }
        if (summary.updated > 0) {
          warnings.push(`${summary.updated} package(s) updated successfully.`);
        } else if (dryRun) {
          warnings.push("Dry-run mode: no packages were actually updated.");
        } else {
          warnings.push("All installed packages are up-to-date.");
        }

        return formatPackageUpdate(
          packages,
          summary,
          warnings,
          startTime,
          command,
        );
      } catch (updateError) {
        const errOutput =
          updateError.stdout || updateError.stderr || updateError.message;
        return formatError(
          command,
          "execution_error",
          `Package update failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex). The Phase 2 script leaves
      // .package-update-result behind when it finishes; the agent's re-run of
      // this CLI turns that into the real success/failure envelope instead of
      // handing back the launcher envelope a second time.
      const markerPath = path.join(sdkPath, UPDATE_RESULT_MARKER);
      let staleNote = "";
      if (fs.existsSync(markerPath)) {
        const marker = parseUpdateResultMarker(
          fs.readFileSync(markerPath, "utf-8"),
        );
        if (
          marker.summary &&
          updateResultSatisfies(marker.mode, { force, dryRun })
        ) {
          if (isUpdateResultFresh(fs.statSync(markerPath).mtimeMs)) {
            console.error(
              `[tizen-update-package] Phase 2 result found at ${markerPath} (mode ${marker.mode}, exit ${marker.exit_code}).`,
            );
            const s = marker.summary;
            const verified = `Verified from ${markerPath} (Phase 2 finished at ${marker.finished_at}, mode ${marker.mode}).`;
            if (marker.exit_code !== 0 || s.failed > 0) {
              return formatError(
                command,
                "execution_error",
                `Package update finished with failures: ${s.failed} package(s) failed to update ` +
                  `(updated ${s.updated} / skipped ${s.skipped} / up-to-date ${s.up_to_date} / total ${s.total}). ` +
                  "Read the Phase 2 log for the failing packages, fix the cause (network, disk space, mirror), and run the update again. " +
                  verified,
                null,
                startTime,
              );
            }
            const warnings = [];
            if (s.updated > 0) {
              warnings.push(`${s.updated} package(s) updated successfully.`);
            } else if (marker.mode === "dry-run") {
              warnings.push(
                s.outdated > 0
                  ? `Dry-run mode: ${s.outdated} package(s) have updates available; nothing was changed.`
                  : "Dry-run mode: all installed packages are up-to-date; nothing was changed.",
              );
            } else {
              warnings.push("All installed packages are up-to-date.");
            }
            warnings.push(verified);
            return formatPackageUpdate([], s, warnings, startTime, command);
          }
          staleNote =
            `A previous run finished at ${marker.finished_at} (mode ${marker.mode}: ` +
            `updated ${marker.summary.updated} / failed ${marker.summary.failed} / up-to-date ${marker.summary.up_to_date}) ` +
            `but is older than ${UPDATE_RESULT_MAX_AGE_MS / 60000} minutes, so it is not used as verification. `;
        }
      }

      const updaterCommand = installerFix(
        "tizen-update-package",
        updater.scriptPath,
        `-SdkPath "${sdkPath.replace(/\\/g, "/")}"${winFlagStr}`,
        `--sdk-path="${sdkPath}"${unixFlagStr}`,
      );

      return formatError(
        command,
        "execution_error",
        "SDK found. Phase 1 is a launcher—it cannot check for updates directly. " +
          "Run the Phase 2 update script (in suggested_fix) to check for available updates. " +
          "This is the normal two-phase workflow, not an error. " +
          staleNote +
          harnessGuidance("detach") +
          `After Phase 2 completes, re-run this CLI within ${UPDATE_RESULT_MAX_AGE_MS / 60000} minutes: ` +
          `it reads <sdk-path>/${UPDATE_RESULT_MARKER}, which the updater writes on exit, and returns the real success/failure envelope. ` +
          (dryRun
            ? "Dry-run mode: Phase 2 will list outdated packages without updating. "
            : "") +
          (force
            ? "Force mode: Phase 2 will re-download and re-install all installed packages. "
            : ""),
        updaterCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to update packages: ${error.message}`,
      null,
      startTime,
    );
  }
}

const UPDATE_RESULT_MARKER = ".package-update-result";
// How long a finished Phase 2 run still counts as verification for a Phase 1
// re-run. Unlike the install markers, "up to date" decays with time, so the
// window is short: long enough for the agent's notify → re-run hop, too short
// to answer next week's request with last week's result.
const UPDATE_RESULT_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Parse a .package-update-result marker written by tizen-update-package.sh/.ps1.
 *
 * Marker shape (one field per line, CRLF tolerated):
 *   Package update finished at 2026-09-09T05:10:00-04:00
 *   Mode: update | force | dry-run
 *   Exit: 0 | 1
 *   Outdated: 3
 *   Result: updated 3 / skipped 0 / failed 0 / up-to-date 120 (total 123)
 *
 * Missing or malformed fields yield null rather than throwing — the caller
 * treats a marker without a summary as absent.
 *
 * Exported for unit testing.
 *
 * @param {string} markerBody - marker file content
 * @returns {{finished_at: string|null, mode: string|null, exit_code: number|null, summary: object|null}}
 */
function parseUpdateResultMarker(markerBody) {
  const text = String(markerBody || "");
  const grab = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  const exitRaw = grab(/^Exit:[ \t]*(\d+)[ \t]*\r?$/m);
  const outdatedRaw = grab(/^Outdated:[ \t]*(\d+)[ \t]*\r?$/m);
  const summaryMatch = text.match(
    /updated\s+(\d+)\s*\/\s*skipped\s+(\d+)\s*\/\s*failed\s+(\d+)\s*\/\s*up-to-date\s+(\d+)\s*\(total\s+(\d+)\)/i,
  );
  let summary = null;
  if (summaryMatch) {
    summary = {
      total: parseInt(summaryMatch[5], 10),
      updated: parseInt(summaryMatch[1], 10),
      skipped: parseInt(summaryMatch[2], 10),
      failed: parseInt(summaryMatch[3], 10),
      up_to_date: parseInt(summaryMatch[4], 10),
    };
    if (outdatedRaw !== null) summary.outdated = parseInt(outdatedRaw, 10);
  }
  return {
    finished_at: grab(/^Package update finished at[ \t]*(\S+)[ \t]*\r?$/m),
    mode: grab(/^Mode:[ \t]*(\S+)[ \t]*\r?$/m),
    exit_code: exitRaw === null ? null : parseInt(exitRaw, 10),
    summary,
  };
}

/**
 * Is a marker with this mtime recent enough to stand in for a fresh check?
 * A slightly future mtime (clock skew) counts as fresh; NaN never does.
 *
 * Exported for unit testing.
 */
function isUpdateResultFresh(
  mtimeMs,
  nowMs = Date.now(),
  maxAgeMs = UPDATE_RESULT_MAX_AGE_MS,
) {
  const age = nowMs - mtimeMs;
  return Number.isFinite(age) && age <= maxAgeMs;
}

/**
 * Can a run recorded with `markerMode` answer this request?
 *
 * A plain request is answered by any real update (plain or forced). --force
 * and --dry-run are answered only by a run of the same kind, so `--force`
 * right after a plain update still launches Phase 2 instead of reporting the
 * plain run's "up-to-date".
 *
 * Exported for unit testing.
 */
function updateResultSatisfies(
  markerMode,
  { force = false, dryRun = false } = {},
) {
  if (dryRun) return markerMode === "dry-run";
  if (force) return markerMode === "force";
  return markerMode === "update" || markerMode === "force";
}

/**
 * SDK repository information query
 *
 * Returns metadata about known Tizen SDK package repositories (official CDN and
 * its regional mirrors) and the currently configured repository (from
 * {SDK_PATH}/.package/repository.info, if available).
 *
 * This is a read-only information query — it does not install or modify anything.
 *
 * @returns {object} Standard JSON Envelope
 */
async function getRepoInfo(command = "tizen-sdk sdk-repo-info") {
  const startTime = Date.now();
  try {
    // Static repository metadata
    const repositories = [
      {
        url: "https://download.tizen.org/sdk/tizenstudio/official/",
        name: "Official CDN",
        type: "public",
        description:
          "Tizen official CDN repository. The default mirror selected by timezone-based auto-selection.",
        access: "Internet (public)",
        mirrors: [
          "https://usa.sdk-dl.tizen.org/sdk/tizenstudio/official",
          "https://brazil.sdk-dl.tizen.org/sdk/tizenstudio/official",
          "https://singapore.sdk-dl.tizen.org/sdk/tizenstudio/official",
        ],
      },
    ];
    // Private / in-house mirrors are not listed here: pass them explicitly via
    // `--repo-url <url>` (tizen-sdk-install-custom-repo). The URL must serve
    // pkg_list_{OS}-64 or pkg_list_{OS}-32 at its root.

    // Try to read current repository from repository.info
    let currentRepo = null;
    const sdkPath = readSdkPath();
    const repoInfoPath = path.join(sdkPath, ".package", "repository.info");

    if (fs.existsSync(repoInfoPath)) {
      try {
        const content = fs.readFileSync(repoInfoPath, "utf-8");
        const match = content.match(/^Repository=(.+)$/m);
        if (match) {
          currentRepo = match[1].trim();
        }
      } catch (e) {
        console.error(
          `[tizen-sdk] Could not read repository.info: ${e.message}`,
        );
      }
    }

    const warnings = [];
    if (!currentRepo) {
      warnings.push(
        "repository.info not found — SDK may not be installed yet, or the SDK was installed before the repository.info feature was added.",
      );
    }

    return formatRepoInfo(
      currentRepo,
      repositories,
      startTime,
      warnings,
      command,
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to get repository info: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Trim whitespace and trailing slashes from a repository URL so that
 * `${url}/pkg_list_...` never produces a double slash (some servers 404 on it).
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeRepoUrl(url) {
  if (typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

/**
 * Syntactic checks on a custom repository URL (no network access).
 *
 * Split out from validateRepoUrl so an obviously-bad URL fails instantly with a
 * precise message instead of spending a network round trip on it.
 *
 * @param {string} repoUrl
 * @returns {{ok: true, url: string}|{ok: false, message: string}}
 */
function checkRepoUrlSyntax(repoUrl) {
  if (!repoUrl || typeof repoUrl !== "string" || !repoUrl.trim()) {
    return {
      ok: false,
      message:
        "Repository URL is required. Pass the base URL of the package repository " +
        "(the directory that contains pkg_list_{OS}-{64,32}).",
    };
  }

  const url = normalizeRepoUrl(repoUrl);

  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      message: `Repository URL must start with http:// or https:// — got: ${url}`,
    };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.host) {
      return { ok: false, message: `Repository URL has no host: ${url}` };
    }
  } catch (_e) {
    return { ok: false, message: `Malformed repository URL: ${url}` };
  }

  if (/\/pkg_list_[^/]*$/i.test(url)) {
    return {
      ok: false,
      message:
        `Repository URL must point at the DIRECTORY containing the package list, ` +
        `not at the pkg_list file itself: ${url}. ` +
        `Drop the trailing "/pkg_list_..." segment.`,
    };
  }

  return { ok: true, url };
}

/**
 * Validate a custom package repository URL.
 *
 * A URL is a usable Tizen package repository only if it serves the package
 * index file `pkg_list_{OS}-{64,32}` for the current OS
 * (OS = windows | ubuntu | macos) at its root — that file is what the whole
 * install is driven from. Anything else is rejected here, before ~100 package
 * downloads fail and leave a half-installed SDK behind.
 *
 * The reachability probe is delegated to the installer script's
 * `--validate-repo-url` / `-ValidateRepoUrl` mode (curl / HttpWebRequest) rather
 * than re-implemented here, so it honours the machine's proxy and certificate
 * configuration — internal mirrors usually need both — and so script and
 * pre-check can never disagree on what counts as valid.
 *
 * @param {string} repoUrl - repository base URL
 * @param {string} [command] - envelope command name (overridden by callers that
 *   validate as one step of a larger command, e.g. install-custom-repo)
 * @returns {object} Standard JSON Envelope
 *   - success: result.valid = true, result.pkg_list_file, result.pkg_list_url
 *   - failure: repo_url_invalid (malformed) or repo_url_unreachable (no pkg_list)
 */
async function validateRepoUrl(
  repoUrl,
  command = "tizen-sdk validate-repo-url",
) {
  const startTime = Date.now();
  try {
    const syntax = checkRepoUrlSyntax(repoUrl);
    if (!syntax.ok) {
      console.error(
        `[tizen-sdk-repo] Invalid repository URL: ${syntax.message}`,
      );
      return formatError(
        command,
        "repo_url_invalid",
        syntax.message,
        null,
        startTime,
      );
    }

    const url = syntax.url;
    console.error(`[tizen-sdk-repo] Validating repository URL: ${url}`);

    const installer = resolveScript("tizen-sdk-install");
    if (!installer.scriptPath) {
      return formatError(
        command,
        "script_not_found",
        `Installer script not found, cannot validate the repository URL: ${installer.error}`,
        null,
        startTime,
      );
    }

    let output;
    try {
      output = execPluginScript(
        installer.scriptPath,
        `-RepoUrl "${url}" -ValidateRepoUrl`,
        `--repo-url="${url}" --validate-repo-url`,
      );
    } catch (error) {
      // Non-zero exit = no pkg_list_{OS}-{64,32} served (or the host is
      // unreachable). Surface the script's own diagnosis, which lists every
      // probed URL.
      const errOutput = (
        error.stdout ||
        error.stderr ||
        error.message ||
        ""
      ).toString();
      console.error(
        "[tizen-sdk-repo] Repository URL rejected by the validation probe.",
      );
      return formatError(
        command,
        "repo_url_unreachable",
        `Not a valid Tizen package repository: ${url}. ` +
          `Neither pkg_list_{OS}-64 nor pkg_list_{OS}-32 could be fetched from it ` +
          `(OS = windows | ubuntu | macos). A repository URL must be the directory that ` +
          `CONTAINS the package list, e.g. ${url}/pkg_list_ubuntu-64. ` +
          `If this is an internal mirror, check VPN/proxy access from this machine.`,
        null,
        startTime,
        errOutput ? errOutput.split(/\r?\n/).filter(Boolean).slice(-12) : null,
      );
    }

    // Machine-readable lines printed by the script's validate mode.
    const pkgListMatch = /^PKG_LIST=(.+)$/m.exec(output || "");
    const repoMatch = /^REPOSITORY=(.+)$/m.exec(output || "");
    const pkgListFile = pkgListMatch ? pkgListMatch[1].trim() : null;
    const resolvedUrl = repoMatch ? repoMatch[1].trim() : url;

    const warnings = [];
    if (!pkgListFile) {
      // Exit code said valid; only the label is missing. Report success but say
      // the arch could not be determined rather than inventing one.
      warnings.push(
        "Repository is valid, but the validation probe did not report which pkg_list file it found.",
      );
    }

    console.error(
      `[tizen-sdk-repo] Repository is valid: ${resolvedUrl} (${pkgListFile || "pkg_list found"})`,
    );

    return formatRepoUrlValidation(
      resolvedUrl,
      pkgListFile,
      pkgListFile ? `${resolvedUrl}/${pkgListFile}` : null,
      pkgListFile ? [`${resolvedUrl}/${pkgListFile}`] : [],
      startTime,
      warnings,
    );
  } catch (error) {
    return formatError(
      command,
      "execution_error",
      `Failed to validate repository URL: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Read the repository URL recorded in {SDK_PATH}/.package/repository.info.
 *
 * @param {string} sdkPath
 * @returns {string|null}
 */
function readInstalledRepository(sdkPath) {
  try {
    const repoInfoPath = path.join(sdkPath, ".package", "repository.info");
    if (!fs.existsSync(repoInfoPath)) return null;
    const match = /^Repository=(.+)$/m.exec(
      fs.readFileSync(repoInfoPath, "utf-8"),
    );
    return match ? match[1].trim() : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Custom-repository SDK installation pre-check (Phase 1)
 *
 * Same two-phase contract as installSdk(), with the package source switched from
 * the timezone-selected CDN mirror to a URL the user supplies. The repository is
 * validated FIRST: an install is never started against a URL that does not serve
 * pkg_list_{OS}-{64,32}.
 *
 * ⚠️ This function does not perform the installation (10-15 minutes). It
 * pre-checks and returns the installer command for the agent to run in
 * background (Phase 2) — except in the pkg-compiled tizen-cli binary, where it
 * runs the installer directly.
 *
 * Flow:
 *   1. Node.js check
 *   2. Repository URL validation (pkg_list_{OS}-{64,32} must be served)
 *   3. SDK already installed? → success (with a warning that --force is needed
 *      to re-point an existing install at a different repository)
 *   4. Disk space check (15 GB)
 *   5. Return the installer command (suggested_fix) for Phase 2
 *
 * @param {string} repoUrl - custom package repository base URL (required)
 * @param {string} [platformVersion] - Tizen platform version (e.g. "11.0").
 *   Empty = auto-select the highest version the repository offers.
 * @param {boolean} [force] - force reinstall even if already installed
 * @returns {object} Standard JSON Envelope
 */
async function installSdkFromRepo(
  repoUrl,
  platformVersion = "",
  force = false,
) {
  const startTime = Date.now();
  const command = "tizen-sdk sdk-install-custom-repo";
  try {
    // 1. Node.js check (first)
    console.error("[tizen-sdk-repo] Checking Node.js installation...");
    const nodeCheck = await checkNode();
    if (nodeCheck.status !== "success") {
      console.error(
        "[tizen-sdk-repo] Node.js not found. Aborting installation.",
      );
      return nodeCheck;
    }
    console.error(
      `[tizen-sdk-repo] Node.js OK (${nodeCheck.result.version}). Continuing.`,
    );

    // 2. Repository URL validation — must pass before anything else happens.
    const validation = await validateRepoUrl(repoUrl, command);
    if (validation.status !== "success") {
      return validation;
    }
    const normalizedUrl = validation.result.repository_url;
    const pkgListFile = validation.result.pkg_list_file;

    const sdkPath = readSdkPath();

    // 3. Already installed?
    console.error("[tizen-sdk-repo] Checking if SDK is already installed...");
    const statusCheck = await checkIfSdkAlreadyInstalled(sdkPath, force);

    if (statusCheck.alreadyInstalled) {
      console.error(
        "[tizen-sdk-repo] SDK installation verified (sdk.info found). Returning success status.",
      );

      const installedRepo = readInstalledRepository(sdkPath);
      const warnings = [
        `SDK installation verified at ${sdkPath} (sdk.info found). To force a reinstall, run with --force (script flag: -Force).`,
      ];
      const repairNote = describeSdkInfoRepair(repairSdkInfo(sdkPath));
      if (repairNote) warnings.push(repairNote);
      // Do not let the caller believe the custom repository was applied: an
      // existing install is NOT re-downloaded, so its packages still come from
      // whatever repository installed it.
      if (installedRepo && normalizeRepoUrl(installedRepo) !== normalizedUrl) {
        warnings.push(
          `The requested repository was NOT applied: the existing SDK was installed from ${installedRepo}. ` +
            `Re-run with --force to reinstall from ${normalizedUrl}.`,
        );
      } else if (!installedRepo) {
        warnings.push(
          `The existing SDK has no recorded repository (.package/repository.info missing), so it may not have come from ${normalizedUrl}. ` +
            `Re-run with --force to reinstall from the requested repository.`,
        );
      }

      const initResult = await initSdk(sdkPath);
      if (initResult.status === "success") {
        console.error(
          "[tizen-sdk-repo] SDK path config written automatically.",
        );
        warnings.push(
          `SDK path configured automatically: ${sdkPath} → ${CONFIG_FILE}`,
        );
      } else {
        warnings.push(
          `SDK path config could not be written automatically: ${initResult.errors?.[0]?.message || "unknown error"}. Run "tizen-sdk sdk-init" manually.`,
        );
      }

      const packages = collectInstalledPackages(
        sdkPath,
        platformVersion || "installed",
      );
      return formatCustomRepoInstall(
        packages,
        installedRepo || normalizedUrl,
        warnings,
        startTime,
      );
    }

    if (!statusCheck.shouldProceed) {
      return formatError(
        command,
        "build_failed",
        statusCheck.reason,
        null,
        startTime,
      );
    }

    // 4. Disk space (user home drive, 15 GB threshold)
    console.error(
      "[tizen-sdk-repo] SDK not installed. Checking disk space (15 GB required)...",
    );
    const diskCheck = await checkDiskSpace(os.homedir(), 15);
    if (diskCheck.status !== "success") {
      console.error(
        "[tizen-sdk-repo] Insufficient disk space. Aborting installation.",
      );
      return diskCheck;
    }
    console.error(
      `[tizen-sdk-repo] Disk space OK (${diskCheck.result.free_gb} GB free). Proceeding to install.`,
    );

    // 5. Resolve the custom-repository installer script
    const installer = resolveScript("tizen-sdk-install-custom-repo");
    if (!installer.scriptPath) {
      return formatError(
        command,
        "script_not_found",
        `Custom-repository installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // Explicit install path — see installSdk (issue #70).
    const pathArgs = installerPathArgs(sdkPath);
    const winFlags = [`-RepoUrl "${normalizedUrl}"`, pathArgs.win];
    const unixFlags = [`--repo-url="${normalizedUrl}"`, pathArgs.unix];
    if (platformVersion) {
      winFlags.push(`-Platform "${platformVersion}"`);
      unixFlags.push(`--platform="${platformVersion}"`);
    }
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    const isPkg = !!process.pkg;

    if (isPkg) {
      // Direct execution: run the installer synchronously (10-15 min)
      console.error(
        `[tizen-sdk-repo] Running installer: ${installer.scriptPath}`,
      );
      try {
        execPluginScript(
          installer.scriptPath,
          winFlags.join(" "),
          unixFlags.join(" "),
        );
        console.error("[tizen-sdk-repo] Installer completed.");

        const sdkInfoPath = path.join(sdkPath, "sdk.info");
        if (!fs.existsSync(sdkInfoPath)) {
          return formatError(
            command,
            "execution_error",
            `Installer completed but sdk.info not found at ${sdkInfoPath}. Installation may have failed.`,
            null,
            startTime,
          );
        }

        const warnings = [
          `SDK installed successfully at ${sdkPath} from ${normalizedUrl}${pkgListFile ? ` (${pkgListFile})` : ""}.`,
        ];
        const initResult = await initSdk(sdkPath);
        if (initResult.status === "success") {
          warnings.push(
            `SDK path configured automatically: ${sdkPath} → ${CONFIG_FILE}`,
          );
        } else {
          warnings.push(
            `SDK path config could not be written automatically: ${initResult.errors?.[0]?.message || "unknown error"}. Run "tizen-sdk sdk-init" manually.`,
          );
        }

        const packages = collectInstalledPackages(
          sdkPath,
          platformVersion || "installed",
        );
        return formatCustomRepoInstall(
          packages,
          readInstalledRepository(sdkPath) || normalizedUrl,
          warnings,
          startTime,
        );
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `SDK installation from ${normalizedUrl} failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    }

    // Non-pkg (Claude Code / Cline / Codex): hand the installer command to the agent.
    const installerCommand = installerFix(
      "tizen-sdk-install-custom-repo",
      installer.scriptPath,
      winFlags.join(" "),
      unixFlags.join(" "),
    );

    return formatError(
      command,
      "execution_error",
      `SDK is NOT installed. The repository ${normalizedUrl} is valid` +
        `${pkgListFile ? ` (${pkgListFile} found)` : ""}, but this pre-check CLI cannot install it (10-15 min job). ` +
        harnessGuidance("detach") +
        "Either way, afterwards re-run this CLI to verify <sdk-path>/sdk.info exists and that " +
        "<sdk-path>/.package/repository.info records the custom repository. " +
        "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
      installerCommand,
      startTime,
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install SDK from custom repository: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Emulator package download pre-check (Phase 1)
 *
 * Downloads the TIZEN-{platform_version}-Emulator package (and its dependencies)
 * from the Tizen package repository. The repository URL is read from
 * {SDK_PATH}/.package/repository.info (written during SDK install), falling
 * back to the official repo if the file is missing.
 *
 * This function performs pre-check only, not the actual download/install.
 * The actual download is performed by the agent via background script (Phase 2).
 *
 * Flow:
 * 1. Check if Tizen SDK is installed (sdk.info) — abort if not
 * 2. Check if the emulator package is already installed (.emulator-package-installed marker)
 * 3. Return the download script command (suggested_fix) — agent executes in Phase 2 background
 *
 * @param {string} platformVersion - Tizen platform version (e.g., "10.0", "11.0"). Auto-detects latest if empty.
 * @param {boolean} force - force reinstall (default: false)
 * @returns {object} Standard JSON Envelope
 */
/**
 * Parse the platform versions recorded in a .emulator-package-installed marker.
 *
 * The marker accumulates one "Platform version: X.Y" line per installed
 * platform. Legacy markers (written before per-version records) carry a single
 * last-write-wins line or none at all — both simply yield fewer entries.
 * Tolerates CRLF line endings (\s*$ eats the \r) and missing/extra spaces
 * around the value.
 *
 * Exported for unit testing.
 *
 * @param {string} markerBody - marker file content
 * @returns {string[]} recorded platform versions, e.g. ["10.0", "11.0"]
 */
function parseEmulatorMarkerPlatforms(markerBody) {
  return [
    ...String(markerBody || "").matchAll(
      /^Platform version:[ \t]*(\S+)[ \t]*\r?$/gm,
    ),
  ].map((m) => m[1]);
}

/**
 * Does the marker satisfy this request?
 *
 * - Explicit platformVersion: satisfied only when that exact version is
 *   recorded. A 10.0-era marker must NOT answer an 11.0 request — that is how
 *   the tizen-11.0 emulator resources ended up never being fetched.
 * - No platformVersion (auto-detect latest): any completed install satisfies
 *   the request. The pre-check runs without network access, so it cannot know
 *   what "latest" resolves to; the message lists the recorded platforms and
 *   how to request a specific one.
 *
 * Exported for unit testing.
 *
 * @param {string} markerBody - marker file content
 * @param {string} platformVersion - requested version, or "" for auto-detect
 * @returns {{satisfied: boolean, recorded: string[]}}
 */
function isEmulatorMarkerSatisfied(markerBody, platformVersion) {
  const recorded = parseEmulatorMarkerPlatforms(markerBody);
  const satisfied = platformVersion ? recorded.includes(platformVersion) : true;
  return { satisfied, recorded };
}

async function downloadEmulatorPackage(
  platformVersion = "",
  force = false,
  command = "tizen-sdk download-emulator-package",
) {
  const startTime = Date.now();
  try {
    // 1. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error("[tizen-emulator-pkg] Checking if Tizen SDK is installed...");

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-emulator-pkg] Tizen SDK is NOT installed. Aborting emulator package download.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. Emulator package download requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry emulator package download.",
        null,
        startTime,
      );
    }
    console.error(
      `[tizen-emulator-pkg] Tizen SDK found at ${sdkPath}. Continuing.`,
    );

    // 2. Check if emulator package is already installed — PER PLATFORM VERSION.
    // The marker accumulates one "Platform version: X.Y" line per installed
    // platform. A bare exists-check made a 10.0-era marker answer an 11.0
    // request with "already installed", so the 11.0 emulator resources were
    // never fetched. When a specific version is requested and the marker does
    // not record it, fall through to the install suggestion — the installer
    // itself is idempotent per package.
    const emulPkgMarker = path.join(sdkPath, ".emulator-package-installed");
    if (fs.existsSync(emulPkgMarker) && !force) {
      const markerBody = fs.readFileSync(emulPkgMarker, "utf-8");
      const { satisfied: versionSatisfied, recorded: recordedPlatforms } =
        isEmulatorMarkerSatisfied(markerBody, platformVersion);

      if (versionSatisfied) {
        console.error(
          "[tizen-emulator-pkg] Emulator package is already installed (.emulator-package-installed found).",
        );
        const packages = [
          {
            name: platformVersion
              ? `TIZEN-${platformVersion}-Emulator`
              : "TIZEN-Emulator",
            status: "installed",
            version: "emulator",
          },
        ];
        const recordedNote =
          recordedPlatforms.length > 0
            ? ` Recorded platform(s): ${recordedPlatforms.join(", ")}.`
            : "";
        const warnings = [
          `Emulator package installation verified at ${sdkPath} (.emulator-package-installed found).${recordedNote} ` +
            `To force a reinstall, run with --force. To install another platform's emulator package, pass --platform-version <X.Y>.`,
        ];
        return formatEmulatorPackageDownload(
          packages,
          warnings,
          startTime,
          command,
        );
      }

      console.error(
        `[tizen-emulator-pkg] Marker found, but platform ${platformVersion} is not recorded ` +
          `(recorded: ${recordedPlatforms.join(", ") || "none"}). Proceeding with install suggestion.`,
      );
    }

    // 3. Resolve emulator package download script
    const installer = resolveScript("tizen-download-emulator-package");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    // Build arguments
    const winFlags = [`-SdkPath "${sdkPath.replace(/\\/g, "/")}"`];
    const unixFlags = [`--sdk-path="${sdkPath}"`];
    if (platformVersion) {
      winFlags.push(`-PlatformVersion "${platformVersion}"`);
      unixFlags.push(`--platform-version="${platformVersion}"`);
    }
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    if (isPkg) {
      // Direct execution: run download script synchronously
      console.error(
        `[tizen-emulator-pkg] Running installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = winFlags.join(" ");
        const unixArgs = unixFlags.join(" ");
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-emulator-pkg] Installer completed.");

        // Verify installation: check .emulator-package-installed marker
        if (fs.existsSync(emulPkgMarker)) {
          console.error(
            "[tizen-emulator-pkg] Emulator package installation verified (.emulator-package-installed found).",
          );
          const packages = [
            {
              name: platformVersion
                ? `TIZEN-${platformVersion}-Emulator`
                : "TIZEN-Emulator",
              status: "installed",
              version: "emulator",
            },
          ];
          const warnings = [
            `Emulator package installed successfully at ${sdkPath}.`,
          ];
          return formatEmulatorPackageDownload(
            packages,
            warnings,
            startTime,
            command,
          );
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .emulator-package-installed not found at ${emulPkgMarker}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `Emulator package download failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-download-emulator-package",
        installer.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
      );

      return formatError(
        command,
        "execution_error",
        "Emulator package is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("foreground") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.emulator-package-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to download emulator package: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Platform package installation pre-check (Phase 1)
 *
 * Downloads the TIZEN-{platform_version} platform package (and its dependencies)
 * from the Tizen package repository. The repository URL is read from
 * {SDK_PATH}/.package/repository.info (written during SDK install), falling
 * back to the official repo if the file is missing.
 *
 * This function performs pre-check only, not the actual download/install.
 * The actual download is performed by the agent via background script (Phase 2).
 *
 * Flow:
 * 1. Check if Tizen SDK is installed (sdk.info) — abort if not
 * 2. Check if the platform package is already installed (.platform-installed marker)
 * 3. Return the download script command (suggested_fix) — agent executes in Phase 2 background
 *
 * @param {string} platformVersion - Tizen platform version (e.g., "10.0", "11.0"). Auto-detects latest if empty.
 * @param {boolean} force - force reinstall (default: false)
 * @returns {object} Standard JSON Envelope
 */
async function installPlatform(
  platformVersion = "",
  force = false,
  command = "tizen-sdk platform-install",
) {
  const startTime = Date.now();
  try {
    // 0. Validate that platformVersion is provided (required)
    if (!platformVersion) {
      console.error(
        "[tizen-platform-pkg] --platform-version is required but was not provided.",
      );
      return formatError(
        command,
        "invalid_argument",
        "Missing required option: --platform-version <version>. " +
          "Specify the Tizen platform version to install (e.g., 10.0, 11.0). " +
          "The target package is TIZEN-{version}.",
        null,
        startTime,
      );
    }

    // 1. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error("[tizen-platform-pkg] Checking if Tizen SDK is installed...");

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-platform-pkg] Tizen SDK is NOT installed. Aborting platform package installation.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. Platform package installation requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry platform package installation.",
        null,
        startTime,
      );
    }
    console.error(
      `[tizen-platform-pkg] Tizen SDK found at ${sdkPath}. Continuing.`,
    );

    // 2. Check if platform package is already installed
    const platformPkgMarker = path.join(sdkPath, ".platform-installed");
    if (fs.existsSync(platformPkgMarker) && !force) {
      // Read the marker to check which platform version was installed
      let markerVersion = "";
      try {
        const markerContent = fs.readFileSync(platformPkgMarker, "utf-8");
        const versionMatch = markerContent.match(/Platform version:\s*(.+)/);
        if (versionMatch) {
          markerVersion = versionMatch[1].trim();
        }
      } catch (_e) {
        // If we can't read the marker, proceed with installation
      }

      // Only skip if the marker version matches the requested version
      if (markerVersion === platformVersion) {
        console.error(
          `[tizen-platform-pkg] Platform package TIZEN-${platformVersion} is already installed (.platform-installed found, version ${markerVersion}).`,
        );
        const packages = [
          {
            name: `TIZEN-${platformVersion}`,
            status: "installed",
            version: platformVersion,
          },
        ];
        const warnings = [
          `Platform package installation verified at ${sdkPath} (.platform-installed found, version ${markerVersion}). To force a reinstall, run with --force.`,
        ];
        return formatPlatformInstall(packages, warnings, startTime, command);
      } else {
        console.error(
          `[tizen-platform-pkg] .platform-installed found but for version ${markerVersion || "unknown"}, requested ${platformVersion}. Proceeding with installation.`,
        );
      }
    }

    // 3. Resolve platform package install script
    const installer = resolveScript("tizen-platform-install");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    // Build arguments
    const winFlags = [`-SdkPath "${sdkPath.replace(/\\/g, "/")}"`];
    const unixFlags = [`--sdk-path="${sdkPath}"`];
    if (platformVersion) {
      winFlags.push(`-PlatformVersion "${platformVersion}"`);
      unixFlags.push(`--platform-version="${platformVersion}"`);
    }
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    if (isPkg) {
      // Direct execution: run install script synchronously
      console.error(
        `[tizen-platform-pkg] Running installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = winFlags.join(" ");
        const unixArgs = unixFlags.join(" ");
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-platform-pkg] Installer completed.");

        // Verify installation: check .platform-installed marker
        if (fs.existsSync(platformPkgMarker)) {
          console.error(
            "[tizen-platform-pkg] Platform package installation verified (.platform-installed found).",
          );
          const packages = [
            {
              name: platformVersion
                ? `TIZEN-${platformVersion}`
                : "TIZEN-Platform",
              status: "installed",
              version: platformVersion || "latest",
            },
          ];
          const warnings = [
            `Platform package installed successfully at ${sdkPath}.`,
          ];
          return formatPlatformInstall(packages, warnings, startTime, command);
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .platform-installed not found at ${platformPkgMarker}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `Platform package installation failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-platform-install",
        installer.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
      );

      return formatError(
        command,
        "execution_error",
        "Platform package is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("foreground") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.platform-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install platform package: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Mobile platform package download pre-check (Phase 1)
 *
 * Downloads the MOBILE-{platform_version} platform package (and its dependencies)
 * from the Tizen package repository. Optionally downloads and installs the
 * IOT-Headed extension by:
 *   1) Downloading extension_info.xml to get the IoT Headed repository URL
 *   2) Downloading pkg_list from the IoT repository
 *   3) Resolving and installing IOT-Headed-{version} package
 *
 * The repository URL is read from {SDK_PATH}/.package/repository.info, falling
 * back to the official repo if the file is missing.
 *
 * This function performs pre-check only, not the actual download/install.
 * The actual download is performed by the agent via background script (Phase 2).
 *
 * Flow:
 * 1. Check if Tizen SDK is installed (sdk.info) — abort if not
 * 2. Check if the mobile platform package is already installed (.mobile-platform-installed marker)
 * 3. Return the download script command (suggested_fix) — agent executes in Phase 2 background
 *
 * @param {string} platformVersion - Tizen Mobile platform version (e.g., "10.0", "11.0"). Auto-detects latest if empty.
 * @param {boolean} includeIotHeaded - Whether to also download IOT-Headed extension (default: false)
 * @param {string} iotHeadedVersion - Specific IOT-Headed version to install. Auto-detects latest if empty.
 * @param {boolean} force - force reinstall (default: false)
 * @returns {object} Standard JSON Envelope
 */
async function downloadMobilePlatform(
  platformVersion = "",
  includeIotHeaded = false,
  iotHeadedVersion = "",
  force = false,
  command = "tizen-sdk download-mobile-platform",
) {
  const startTime = Date.now();
  try {
    // 1. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error("[tizen-mobile-pkg] Checking if Tizen SDK is installed...");

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-mobile-pkg] Tizen SDK is NOT installed. Aborting mobile platform package download.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. Mobile platform package download requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry mobile platform package download.",
        null,
        startTime,
      );
    }
    console.error(
      `[tizen-mobile-pkg] Tizen SDK found at ${sdkPath}. Continuing.`,
    );

    // 2. Check if mobile platform package is already installed
    const mobilePkgMarker = path.join(sdkPath, ".mobile-platform-installed");
    if (fs.existsSync(mobilePkgMarker) && !force) {
      // Read the marker to check which platform version was installed
      let markerVersion = "";
      let markerIotHeaded = false;
      try {
        const markerContent = fs.readFileSync(mobilePkgMarker, "utf-8");
        const versionMatch = markerContent.match(/Platform version:\s*(.+)/);
        if (versionMatch) {
          markerVersion = versionMatch[1].trim();
        }
        markerIotHeaded = markerContent.includes("IOT-Headed:");
      } catch (_e) {
        // If we can't read the marker, proceed with installation
      }

      // Only skip if the marker version matches the requested version
      if (markerVersion === platformVersion) {
        if (!includeIotHeaded || markerIotHeaded) {
          console.error(
            `[tizen-mobile-pkg] Mobile platform package MOBILE-${platformVersion} is already installed (.mobile-platform-installed found, version ${markerVersion}).`,
          );
          const packages = [
            {
              name: `MOBILE-${platformVersion}`,
              status: "installed",
              version: platformVersion,
            },
          ];
          const warnings = [
            `Mobile platform package installation verified at ${sdkPath} (.mobile-platform-installed found, version ${markerVersion}). To force a reinstall, run with --force.`,
          ];
          return formatMobilePlatformDownload(
            packages,
            markerIotHeaded,
            warnings,
            startTime,
            command,
          );
        } else {
          console.error(
            `[tizen-mobile-pkg] Mobile platform installed but IOT-Headed extension not installed. Will install IOT-Headed only.`,
          );
        }
      } else {
        console.error(
          `[tizen-mobile-pkg] .mobile-platform-installed found but for version ${markerVersion || "unknown"}, requested ${platformVersion}. Proceeding with installation.`,
        );
      }
    }

    if (force) {
      console.error("[tizen-mobile-pkg] Force reinstall requested.");
      if (fs.existsSync(mobilePkgMarker)) {
        fs.unlinkSync(mobilePkgMarker);
      }
    }

    // 3. Resolve mobile platform package download script
    const installer = resolveScript("tizen-download-mobile-platform");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    // Build arguments
    const winFlags = [`-SdkPath "${sdkPath.replace(/\\/g, "/")}"`];
    const unixFlags = [`--sdk-path="${sdkPath}"`];
    if (platformVersion) {
      winFlags.push(`-PlatformVersion "${platformVersion}"`);
      unixFlags.push(`--platform-version="${platformVersion}"`);
    }
    if (includeIotHeaded) {
      winFlags.push("-IncludeIotHeaded");
      unixFlags.push("--include-iot-headed");
    }
    if (iotHeadedVersion) {
      winFlags.push(`-IotHeadedVersion "${iotHeadedVersion}"`);
      unixFlags.push(`--iot-headed-version="${iotHeadedVersion}"`);
    }
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    if (isPkg) {
      // Direct execution: run download script synchronously
      console.error(
        `[tizen-mobile-pkg] Running installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = winFlags.join(" ");
        const unixArgs = unixFlags.join(" ");
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-mobile-pkg] Installer completed.");

        // Verify installation: check .mobile-platform-installed marker
        if (fs.existsSync(mobilePkgMarker)) {
          console.error(
            "[tizen-mobile-pkg] Mobile platform package installation verified (.mobile-platform-installed found).",
          );
          const packages = [
            {
              name: platformVersion
                ? `MOBILE-${platformVersion}`
                : "MOBILE-Platform",
              status: "installed",
              version: platformVersion || "latest",
            },
          ];
          // Check if IOT-Headed was installed
          let iotHeadedInstalled = false;
          try {
            const markerContent = fs.readFileSync(mobilePkgMarker, "utf-8");
            iotHeadedInstalled = markerContent.includes("IOT-Headed:");
          } catch (_e) {
            // Ignore
          }
          const warnings = [
            `Mobile platform package installed successfully at ${sdkPath}.`,
          ];
          return formatMobilePlatformDownload(
            packages,
            iotHeadedInstalled,
            warnings,
            startTime,
            command,
          );
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .mobile-platform-installed not found at ${mobilePkgMarker}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `Mobile platform package download failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-download-mobile-platform",
        installer.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
      );

      return formatError(
        command,
        "execution_error",
        "Mobile platform package is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("foreground") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.mobile-platform-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to download mobile platform package: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Custom rootstrap installation pre-check (Phase 1)
 *
 * Validates ZIP file path, extracts to temporary location, detects structure,
 * parses XML metadata, and copies tools/platforms to SDK.
 *
 * Flow:
 * 1. Validate ZIP path (security checks)
 * 2. Verify Tizen SDK is installed
 * 3. Extract ZIP to temporary directory
 * 4. Detect ZIP structure (data/ or tizen-studio/)
 * 5. Parse rootstrap XML metadata
 * 6. Copy tools and platforms folders
 * 7. Create .rootstrap-installed marker
 *
 * @param {string} zipPath - Path to the rootstrap ZIP file (required)
 * @param {boolean} force - Force reinstall (default: false)
 * @param {string} [command] - Command name for envelope
 * @returns {object} Standard JSON Envelope
 */
async function installRootstrap(
  zipPath,
  force = false,
  command = "tizen-sdk install-rootstrap",
) {
  const startTime = Date.now();
  try {
    // Validate zipPath parameter
    if (!zipPath || typeof zipPath !== "string") {
      return formatError(
        command,
        "invalid_parameters",
        "ZipPath is required. Use --zip-path <path> to specify the rootstrap ZIP file.",
        null,
        startTime,
      );
    }

    const sdkPath = readSdkPath();

    // Verify Tizen SDK is installed
    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is NOT installed. Rootstrap installation requires Tizen SDK to be installed first.",
        null,
        startTime,
      );
    }

    // Resolve installer script
    const installer = resolveScript("tizen-install-rootstrap");
    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // Build installer command
    const winFlags = [`-ZipPath "${zipPath.replace(/"/g, '\\"')}"`];
    const unixFlags = [`--zip-path "${zipPath}"`];
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    const isPkg = !!process.pkg;

    if (isPkg) {
      // Direct execution: run installer script synchronously
      console.error(
        `[tizen-sdk] Running rootstrap installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = winFlags.join(" ");
        const unixArgs = unixFlags.join(" ");
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-sdk] Rootstrap installer completed.");

        // Verify installation: check .rootstrap-installed marker
        const rootstrapMarker = path.join(sdkPath, ".rootstrap-installed");
        if (fs.existsSync(rootstrapMarker)) {
          console.error(
            "[tizen-sdk] Rootstrap installation verified (.rootstrap-installed found).",
          );

          // Parse marker to extract rootstrap info
          const markerContent = fs.readFileSync(rootstrapMarker, "utf-8");
          const rootstraps = [];
          let structureType = "unknown";

          const structureMatch = markerContent.match(/Structure:\s*(\S+)/);
          if (structureMatch) {
            structureType = structureMatch[1];
          }

          // Parse installed rootstraps from marker
          const rootstrapLines = markerContent.match(/^\s*-\s*(.+)$/gm);
          if (rootstrapLines) {
            for (const line of rootstrapLines) {
              let displayName = line.replace(/^\s*-\s*/, "").trim();
              // Remove (XML: ...) suffix to extract clean profile-version-arch
              displayName = displayName.replace(/\s*\(XML:.*\)\s*$/, "").trim();
              // Try to parse profile-version-arch format
              const match = displayName.match(
                /^(.+)-([0-9]+\.[0-9]+)-([a-zA-Z0-9_]+)$/,
              );
              if (match) {
                rootstraps.push({
                  profile: match[1],
                  version: match[2],
                  architecture: match[3],
                  display_name: displayName,
                });
              } else {
                rootstraps.push({
                  display_name: displayName,
                });
              }
            }
          }

          const warnings = [`Rootstrap installed successfully at ${sdkPath}.`];
          return formatRootstrapInstall(
            rootstraps,
            structureType,
            warnings,
            startTime,
            command,
          );
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .rootstrap-installed not found. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `Rootstrap installation failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-install-rootstrap",
        installer.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
      );

      return formatError(
        command,
        "execution_error",
        "Rootstrap is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("foreground") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.rootstrap-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install rootstrap: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * TV SDK extension installation from a local ZIP file (offline) — pre-check (Phase 1)
 *
 * Similar to installTvSdk(), but instead of downloading packages from the online
 * TV extensions repository, all packages are already bundled in a local ZIP file.
 * The ZIP is expected to contain inner ZIPs (in binary/ or at root) that are
 * extracted directly into the SDK tools path.
 *
 * Flow:
 * 1. Validate zipPath parameter
 * 2. Check if Tizen SDK is installed (sdk.info) — abort with interactive guidance if not
 * 3. Check if TV SDK is already installed (.tv-sdk-installed marker)
 * 4. Return TV SDK ZIP installer command (suggested_fix) — agent executes in Phase 2
 *
 * @param {string} zipPath - Path to the TV SDK ZIP file (required)
 * @param {boolean} force - force reinstall (default: false)
 * @param {string} [command] - Command name for envelope
 * @returns {object} Standard JSON Envelope
 */
async function installTvSdkFromZip(
  zipPath,
  force = false,
  command = "tizen-sdk tv-sdk-install-from-zip",
) {
  const startTime = Date.now();
  try {
    // 1. Validate zipPath parameter
    if (!zipPath || typeof zipPath !== "string") {
      return formatError(
        command,
        "invalid_parameters",
        "ZipPath is required. Use --zip-path <path> to specify the TV SDK ZIP file.",
        null,
        startTime,
      );
    }

    // 2. Check if Tizen SDK is installed
    const sdkPath = readSdkPath();
    console.error("[tizen-tv-sdk-zip] Checking if Tizen SDK is installed...");

    const sdkStatus = checkSdkInstallStatus(sdkPath);
    if (!sdkStatus.installed) {
      console.error(
        "[tizen-tv-sdk-zip] Tizen SDK is NOT installed. Aborting TV SDK installation.",
      );
      return formatError(
        command,
        "sdk_path_invalid",
        "Tizen SDK is not installed. TV SDK is an extension that requires Tizen SDK to be installed first. " +
          "Please install Tizen SDK first (use the tizen-sdk-install skill), then retry TV SDK installation. " +
          'Ask the user: "Tizen SDK가 먼저 설치되어야 합니다. Tizen SDK 설치를 진행하시겠습니까?" ' +
          "If the user approves, run the tizen-sdk-install skill, then retry TV SDK installation. " +
          "If the user declines, abort.",
        null,
        startTime,
      );
    }
    console.error(
      `[tizen-tv-sdk-zip] Tizen SDK found at ${sdkPath}. Continuing.`,
    );

    // 3. Check if TV SDK is already installed
    const tvSdkMarker = path.join(sdkPath, ".tv-sdk-installed");
    if (fs.existsSync(tvSdkMarker) && !force) {
      console.error(
        "[tizen-tv-sdk-zip] TV SDK is already installed (.tv-sdk-installed found).",
      );
      const packages = [
        {
          name: "TV-SAMSUNG-Public",
          status: "installed",
          version: "extension",
        },
      ];
      const warnings = [
        `TV SDK installation verified at ${sdkPath} (.tv-sdk-installed found). To force a reinstall, run with --force.`,
      ];
      return formatTvSdkInstall(packages, warnings, startTime, command);
    }

    // 4. Resolve TV SDK ZIP installer script
    const installer = resolveScript("tizen-tv-sdk-install-from-zip");

    if (!installer.scriptPath) {
      return formatError(
        command,
        "execution_error",
        `Installer script not found: ${installer.error}`,
        null,
        startTime,
      );
    }

    // In pkg-compiled binary (tizen-cli), execute the installer directly.
    // In Claude Code / Cline (non-pkg), return the installer command as
    // suggested_fix so the agent can run it in background (Phase 2).
    const isPkg = !!process.pkg;

    // Build arguments
    const winFlags = [
      `-SdkPath "${sdkPath.replace(/\\/g, "/")}"`,
      `-ZipPath "${zipPath.replace(/"/g, '\\"')}"`,
    ];
    const unixFlags = [`--sdk-path="${sdkPath}"`, `--zip-path="${zipPath}"`];
    if (force) {
      winFlags.push("-Force");
      unixFlags.push("--force");
    }

    if (isPkg) {
      // Direct execution: run TV SDK ZIP installer script synchronously
      console.error(
        `[tizen-tv-sdk-zip] Running installer: ${installer.scriptPath}`,
      );
      try {
        const winArgs = winFlags.join(" ");
        const unixArgs = unixFlags.join(" ");
        execPluginScript(installer.scriptPath, winArgs, unixArgs);
        console.error("[tizen-tv-sdk-zip] Installer completed.");

        // Verify installation: check .tv-sdk-installed marker
        if (fs.existsSync(tvSdkMarker)) {
          console.error(
            "[tizen-tv-sdk-zip] TV SDK installation verified (.tv-sdk-installed found).",
          );
          const packages = [
            {
              name: "TV-SAMSUNG-Public",
              status: "installed",
              version: "extension",
            },
          ];
          const warnings = [
            `TV SDK installed successfully at ${sdkPath} from ${zipPath}.`,
          ];
          return formatTvSdkInstall(packages, warnings, startTime, command);
        } else {
          return formatError(
            command,
            "execution_error",
            `Installer completed but .tv-sdk-installed not found at ${tvSdkMarker}. Installation may have failed.`,
            null,
            startTime,
          );
        }
      } catch (installError) {
        const errOutput =
          installError.stdout || installError.stderr || installError.message;
        return formatError(
          command,
          "execution_error",
          `TV SDK installation from ZIP failed: ${errOutput}`,
          null,
          startTime,
        );
      }
    } else {
      // Non-pkg (Claude Code / Cline / Codex): return installer command as suggested_fix
      const installerCommand = installerFix(
        "tizen-tv-sdk-install-from-zip",
        installer.scriptPath,
        winFlags.join(" "),
        unixFlags.join(" "),
      );

      return formatError(
        command,
        "execution_error",
        "TV SDK is NOT installed. This pre-check CLI cannot install it. " +
          harnessGuidance("detach") +
          "Either way, afterwards re-run this CLI to verify <sdk-path>/.tv-sdk-installed exists. " +
          "Do NOT re-run this CLI to install — --force only skips the already-installed check.",
        installerCommand,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install TV SDK from ZIP: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  CONFIG_FILE,
  buildJobCommand,
  installerFix,
  installerPathArgs,
  harnessGuidance,
  DEFAULT_SDK_PATH,
  initSdk,
  getSdkStatus,
  collectInstalledPackages,
  installSdk,
  installSdkFromRepo,
  validateRepoUrl,
  normalizeRepoUrl,
  checkRepoUrlSyntax,
  readInstalledRepository,
  installTvSdk,
  updatePackage,
  UPDATE_RESULT_MARKER,
  UPDATE_RESULT_MAX_AGE_MS,
  parseUpdateResultMarker,
  isUpdateResultFresh,
  updateResultSatisfies,
  getRepoInfo,
  downloadEmulatorPackage,
  // Exported for tests
  parseEmulatorMarkerPlatforms,
  isEmulatorMarkerSatisfied,
  installPlatform,
  downloadMobilePlatform,
  installRootstrap,
  installTvSdkFromZip,
  readSdkPath,
  checkSdkInstallStatus,
  repairSdkInfo,
  describeSdkInfoRepair,
  checkSdkInstallationViaScript,
  checkIfSdkAlreadyInstalled,
};
