// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * DotNET domain: .NET development environment setup (verify SDK + install Tizen workload)
 *
 * Executes scripts/tizen-dotnet-setup. Workload installation takes several minutes,
 * so calling agent must set Bash tool timeout to 600000ms.
 */

const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveScript, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");

/**
 * Script exit-code convention (see scripts/tizen-dotnet-setup/*):
 *   0 success / already installed
 *   1 install failed
 *   2 no .NET SDK found anywhere
 *   3 workload installed into a DIFFERENT SDK band / install dir than the one
 *     the script verifies against
 */
const EXIT_SDK_NOT_FOUND = 2;
const EXIT_TARGET_MISMATCH = 3;

/**
 * Wording only a TOOL emits when it truly could not write.
 *
 * Deliberately excludes bare "elevated", "administrator" and "sudo": those words
 * appear in this plugin's OWN guidance prose on failures that have nothing to do
 * with permissions — `tizen-dotnet-setup.sh` warns "the .NET SDK dir needs
 * elevated permissions" before EVERY sudo retry, whatever the real cause. Keying
 * on them re-creates the exact #258 mis-diagnosis this module exists to prevent.
 */
const PERMISSION_PATTERN =
  /access to the path .{0,200}? is denied|access is denied|access denied|permission denied|No permission to install|UnauthorizedAccess|requires elevation|must be run as root|\bEACCES\b|\bEPERM\b/i;

/**
 * Did this run really hit a permission problem?
 *
 * Prefer the script's own `[DIAG] permission_denied` verdict: it is computed at
 * the source, from the installer's output, and cannot be confused with the
 * guidance text the script prints around it. Only when the script died before
 * emitting the [DIAG] block do we fall back to sniffing the raw output.
 *
 * @param {string} combined - script stdout+stderr
 * @param {object} diag - parsed [DIAG] facts
 * @returns {boolean}
 */
function hasPermissionProblem(combined, diag) {
  const verdict = diag && diag.permission_denied;
  if (typeof verdict === "string" && verdict !== "") {
    return verdict.trim().toLowerCase() === "true";
  }
  return PERMISSION_PATTERN.test(combined);
}

/**
 * Extract only key lines from .NET setup script stdout for envelope warnings
 *
 * Discard installation logs/banners, keep only unique info not in result (warnings,
 * errors, admin privilege guidance, [DIAG] facts). Exclude ".NET SDK found"/"already
 * installed" lines as they're redundant with result field.
 *
 * @param {string} output - script stdout+stderr
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeDotnetSetupOutput(output) {
  if (!output) return [];

  // The [DIAG] block is printed LAST, but summarizeOutput() keeps the FIRST
  // `max` matches and stops. A real install failure emits well over `max` lines
  // matching warn/error/fail before the block is reached, so folding [DIAG] into
  // the same budget silently drops exactly the lines worth keeping. Collect them
  // separately and exempt them from the cut.
  const diagLines = String(output)
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => /\[DIAG\]/.test(line));

  const logLines = summarizeOutput(output, {
    keep: /warn|error|fail|denied|elevated|administrator|sudo|not found|retry/i,
    // [DIAG] is skipped here (skip wins over keep) because it is handled above.
    skip: /\[DIAG\]|\.NET SDK found|already installed|installed successfully/i,
    max: 16,
  });

  return [...logLines, ...diagLines];
}

/**
 * Was the workload already installed BEFORE this run, or installed BY it?
 *
 * Match only the scripts' own idempotency sentence ("Tizen workload is already
 * installed."). A loose /already installed/ match is wrong: the SAMSUNG
 * installer prints "Tizen Workload <ver> version is already installed." about
 * the MANIFEST while the workload itself can still be missing — observed on
 * Ubuntu, where that line put `already_installed` into an envelope for a run
 * whose fallback had just performed the actual install.
 *
 * @param {string} output - script stdout+stderr
 * @returns {'already_installed'|'installed'}
 */
function parseWorkloadStatus(output) {
  return /Tizen workload is already installed/i.test(String(output || ""))
    ? "already_installed"
    : "installed";
}

/**
 * Success-path warnings: same extraction as the failure path, plus a clarifier.
 *
 * A run can fail its way through Method 1 (Samsung installer, e.g. permission
 * denied on a root-owned SDK) and still SUCCEED via the fallback or the sudo
 * retry. The kept warn/error lines then read like something is still broken —
 * a real user asked exactly that. When the run succeeded but the log carries
 * those mid-run failures, say explicitly that they are historical.
 *
 * @param {string} output - script stdout+stderr of a SUCCESSFUL run
 * @returns {string[]}
 */
function summarizeSuccessWarnings(output) {
  const warnings = summarizeDotnetSetupOutput(output);
  const hadMidRunFailure =
    /Samsung installer failed|No permission to install|Fallback workload install completed/i.test(
      String(output || ""),
    );
  if (warnings.length > 0 && hadMidRunFailure) {
    warnings.unshift(
      "NOTE: setup SUCCEEDED — the lines below are from an earlier attempt inside this same run " +
        "(the Samsung installer failed and the fallback/sudo retry completed the install). No action is needed.",
    );
  }

  // The auto-install writes to a user-scope dir that already-open shells may not
  // resolve yet (stale bash command hash / Windows User PATH not inherited). The
  // scripts print this hint too, but as log_info it is filtered out of the
  // envelope — restate it here so envelope-only consumers relay it to the user.
  const out = String(output || "");
  if (/Installing the \.NET SDK \(user-scope, no sudo\)/i.test(out)) {
    warnings.push(
      "The .NET SDK was auto-installed user-scope to ~/.dotnet. New terminals pick it up " +
        'automatically; if an ALREADY-OPEN shell says "No such file or directory" for dotnet, ' +
        "its command-path cache is stale — run: hash -r (bash) / rehash (zsh).",
    );
  } else if (
    /Installing the \.NET SDK \(user-scope, no admin rights\)/i.test(out)
  ) {
    warnings.push(
      "The .NET SDK was auto-installed user-scope to %LOCALAPPDATA%\\Microsoft\\dotnet. " +
        "Open a new terminal (or restart the IDE) so it inherits the updated User PATH.",
    );
  }
  return warnings;
}

/**
 * Parse the `[DIAG] key=value` lines the setup scripts print when verification fails.
 *
 * The scripts collect every fact an operator would otherwise gather by hand
 * (dotnet path/version/band, DOTNET_ROOT, which SDKs the Samsung installer
 * actually walked, where the manifest landed) so the calling agent never has
 * to probe the machine itself.
 *
 * @param {string} output - script stdout+stderr
 * @returns {object} { key: value } — empty object when there are no [DIAG] lines
 */
function parseDiagLines(output) {
  const diag = {};
  if (!output) return diag;
  for (const line of String(output).split(/\r?\n/)) {
    const m = line.match(/\[DIAG\]\s+([a-z_]+)=(.*)$/i);
    if (!m) continue;
    diag[m[1]] = m[2].trim();
  }
  return diag;
}

/** A [DIAG] value the script prints when it has nothing to report. */
function diagHas(value) {
  return (
    Boolean(value) &&
    !["(none)", "(unknown)", "(unset)", "(not pinned)"].includes(value)
  );
}

/**
 * Build the human-readable message for a wrong-SDK-target failure (exit 3).
 */
function describeTargetMismatch(diag) {
  const inUse = [
    diag.dotnet_version ? `SDK ${diag.dotnet_version}` : null,
    diag.sdk_band ? `band ${diag.sdk_band}` : null,
    diag.dotnet_root ? `at ${diag.dotnet_root}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const parts = [
    "The Tizen workload was installed, but registered for a DIFFERENT .NET SDK than the one in use.",
  ];
  if (inUse) parts.push(`In use: ${inUse}.`);
  if (diagHas(diag.installer_checked_bands)) {
    parts.push(
      `The Samsung installer only handled band(s): ${diag.installer_checked_bands}` +
        (diagHas(diag.installer_checked_sdks)
          ? ` (SDK ${diag.installer_checked_sdks}).`
          : "."),
    );
  }
  if (diagHas(diag.manifest_found_in_bands)) {
    parts.push(
      `Manifest present for band(s): ${diag.manifest_found_in_bands}.`,
    );
  }
  if (diagHas(diag.env_dotnet_root)) {
    parts.push(`DOTNET_ROOT is set to ${diag.env_dotnet_root}.`);
  }

  // Only claim this is not a permissions problem when the script actually said
  // so. The scripts report a permission failure as exit 1, so a stale/foreign
  // script reaching here with permission_denied=true is the one case where the
  // categorical wording would be a fresh mis-diagnosis.
  if (diag.permission_denied === "true") {
    parts.push(
      "NOTE: the installer ALSO reported a permission problem, so the band evidence above may " +
        "be a symptom rather than the cause — resolve the permission failure first " +
        "(Windows: Administrator PowerShell; Linux/macOS: sudo).",
    );
  } else {
    parts.push(
      "This is NOT a permissions problem — do not retry with elevated privileges.",
    );
  }

  parts.push(
    "Fix: unset DOTNET_ROOT (or point it at " +
      (diag.dotnet_root || "the dotnet on PATH") +
      "), then re-run this setup.",
  );
  return parts.join(" ");
}

/**
 * Parse the "Install target:" line both setup scripts print before installing.
 *
 * Format contract — `.ps1` via Write-Info, `.sh` via log_info:
 *   Install target: <root> (SDK <version>, band <band>)
 *
 * The line arrives prefixed ("[INFO]  ...") and, from `.sh` on a tty, wrapped in
 * ANSI colour codes, so the pattern is deliberately unanchored. `<root>` is
 * matched lazily because it may contain spaces ("C:\Program Files\dotnet").
 * A blank band (unparseable SDK version) simply yields nulls rather than a
 * half-filled result.
 *
 * Exported for unit testing: dotnet_root/sdk_band in the success envelope come
 * from here, so any drift in the scripts' wording must fail a test instead of
 * silently turning two envelope fields null.
 *
 * @param {string} output - script stdout+stderr
 * @returns {{dotnet_root: string|null, sdk_band: string|null}}
 */
function parseInstallTarget(output) {
  const m = String(output || "").match(
    /Install target:\s+(.+?)\s+\(SDK\s+(\S+),\s+band\s+(\S+?)\)/i,
  );
  if (!m) return { dotnet_root: null, sdk_band: null };
  return { dotnet_root: m[1].trim(), sdk_band: m[3].trim() };
}

/**
 * How to install the .NET SDK, per platform.
 *
 * The envelope's message/suggested_fix used to hardcode winget, so an Ubuntu
 * user whose setup exited 2 was told to run a Windows-only command — while the
 * setup script itself had just printed the correct apt/brew guidance to stderr.
 * `command` feeds suggested_fix (kept copy-pasteable); `how` feeds the prose.
 */
const SDK_INSTALL_GUIDANCE = {
  win32: {
    // winget stays the copy-pasteable command: it is the only route to the
    // system-wide C:\Program Files\dotnet install, and it works from a normal
    // PowerShell (one UAC prompt) — no Administrator terminal needed.
    command: "winget install Microsoft.DotNet.SDK.8",
    how:
      "user-scope with no admin rights via the official dotnet-install.ps1 (installs to " +
      "%LOCALAPPDATA%\\Microsoft\\dotnet), or system-wide to C:\\Program Files\\dotnet: " +
      "winget install Microsoft.DotNet.SDK.8 from any PowerShell (a one-time UAC prompt appears)",
  },
  linux: {
    command:
      "curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0",
    how:
      "the official script (user-scope, no sudo — installs to ~/.dotnet, and the workload " +
      "step will not need sudo either): curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0, " +
      "or system-wide (requires sudo): sudo apt-get install -y dotnet-sdk-8.0 (Ubuntu/Debian)",
  },
  darwin: {
    command: "brew install --cask dotnet-sdk",
    how: "brew install --cask dotnet-sdk",
  },
};

/**
 * Classify a failed setup-script run into an envelope-ready shape.
 *
 * Exported for unit testing — the mapping from exit code to error_category is
 * the part that used to be wrong (every non-zero exit was blamed on elevation,
 * which sent callers into blind `--force` retries; see issue #258).
 *
 * @param {Error} error - execSync error with .status / .stdout / .stderr / .message
 * @param {string} [platform] - process.platform override (for tests)
 * @param {object} [opts]
 * @param {string} [opts.scriptPath] - resolved path of the setup script; when a
 *   permission failure needs a sudo re-run, this makes the suggested command
 *   copy-pasteable instead of prose
 * @returns {{error_category: string, message: string, details: string[]|null, suggested_command?: string}}
 */
function classifyDotnetSetupFailure(
  error,
  platform = process.platform,
  opts = {},
) {
  const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
  const diag = parseDiagLines(combined);
  const diagLines = Object.keys(diag).map((k) => `${k}=${diag[k]}`);
  const details = diagLines.length > 0 ? diagLines : null;

  if (error.status === EXIT_SDK_NOT_FOUND) {
    // Unknown platforms get the linux guidance — the portable dotnet-install.sh
    // line is the one most likely to apply there. hasOwnProperty, not a bare
    // `[platform] ||`: a plain bracket lookup resolves prototype names
    // ("constructor", "toString") to inherited functions, which are truthy and
    // would put the literal string "undefined" into the guidance instead of
    // falling back. Unreachable from process.platform, but this function is
    // exported and takes arbitrary strings.
    const guide = Object.prototype.hasOwnProperty.call(
      SDK_INSTALL_GUIDANCE,
      platform,
    )
      ? SDK_INSTALL_GUIDANCE[platform]
      : SDK_INSTALL_GUIDANCE.linux;
    return {
      error_category: "dotnet_sdk_not_found",
      message:
        "No .NET SDK found anywhere (not on PATH, not in any known location — discovery already ran), " +
        "and the script could not auto-install one user-scope (it tries by default unless " +
        "--no-install-sdk was passed; a download failure usually means offline or a proxy — " +
        "set http_proxy/https_proxy and re-run). " +
        `The user can also install the .NET SDK manually (recommended: .NET 8 SDK — ${guide.how}, ` +
        "or download from https://dotnet.microsoft.com/download). " +
        // Installing the SDK is only step 1 of 2 — say so, or the user reads the
        // install command as the whole fix and never gets the workload.
        "IMPORTANT: installing the SDK does NOT install the Tizen workload — after the SDK is " +
        "installed, re-run this same setup command and it will install the Tizen workload. " +
        (platform === "win32"
          ? ""
          : "Note: a package-manager SDK install (apt/dnf) is root-owned, so the workload step will likely need sudo — the user-scope dotnet-install.sh route to ~/.dotnet needs no sudo at all. ") +
        "Do NOT hand-roll any other install method.",
      details: null,
      suggested_command: guide.command,
    };
  }

  if (error.status === EXIT_TARGET_MISMATCH) {
    return {
      error_category: "dotnet_workload_target_mismatch",
      message: describeTargetMismatch(diag),
      details,
    };
  }

  // A real permission failure gets its own category with a copy-pasteable fix.
  // The in-script sudo retry CANNOT work under this runner (no tty/stdin, so
  // sudo cannot prompt), so the only honest guidance is an elevated re-run of
  // the script itself.
  if (hasPermissionProblem(combined, diag)) {
    const sdkRoot = diag.dotnet_root || "the .NET SDK directory";
    if (platform === "win32") {
      // Give the exact command to paste into the elevated shell, like the
      // linux branch does with `sudo bash` — resolveScript returns the .ps1
      // on win32, so scriptPath is directly runnable here.
      const elevatedCommand = opts.scriptPath
        ? `powershell -ExecutionPolicy Bypass -File "${opts.scriptPath}"`
        : "Open an Administrator PowerShell, then re-run this setup command";
      return {
        error_category: "dotnet_workload_permission_denied",
        message:
          `The Tizen workload could not be installed because ${sdkRoot} is not writable ` +
          "(permission denied). Open an Administrator PowerShell (Start menu → right-click " +
          "PowerShell → Run as Administrator) and run: " +
          elevatedCommand +
          " — then re-run this setup to verify.",
        details,
        suggested_command: elevatedCommand,
      };
    }
    const sudoCommand = opts.scriptPath
      ? `sudo bash "${opts.scriptPath}"`
      : "sudo bash <path-to>/tizen-dotnet-setup.sh";
    return {
      error_category: "dotnet_workload_permission_denied",
      message:
        `The Tizen workload could not be installed because ${sdkRoot} is not writable ` +
        "(permission denied) — typical when the SDK was installed via a package manager (apt/dnf). " +
        "This non-interactive runner cannot prompt for a sudo password, so the in-script sudo " +
        `retry could not run. Fix: run the setup script directly with sudo — ${sudoCommand} — ` +
        `then re-run this setup to verify. (Alternatives: make ${sdkRoot} writable by your user, ` +
        "or install a user-scope SDK with dotnet-install.sh — it goes to ~/.dotnet, which is " +
        "user-owned, so neither the SDK nor the workload step ever needs sudo — then re-run this setup.)",
      details,
      suggested_command: sudoCommand,
    };
  }

  const summary = summarizeDotnetSetupOutput(combined).join(" | ");
  return {
    error_category: "io_error",
    message: `Tizen workload install failed: ${error.message}.${summary ? ` — ${summary}` : ""}`,
    details,
  };
}

/**
 * Tizen DotNET development environment setup: verify .NET SDK + install Tizen workload
 *
 * Executes scripts/tizen-dotnet-setup: if dotnet not on PATH, search installed SDK
 * and permanently link (Windows: User DOTNET_ROOT/PATH, Unix: ~/.local/bin symlink +
 * ~/.bashrc) → pin the Samsung installer to that same dotnet (-d) → install →
 * verify with that same dotnet. Workload installation takes several minutes, so
 * calling agent must set Bash tool timeout to 600000ms.
 *
 * Script exit convention: 0 = success/already installed, 1 = install failed,
 * 2 = .NET SDK not found anywhere AND the user-scope auto-install was skipped
 * (--no-install-sdk) or failed (user must then install the SDK manually),
 * 3 = workload registered for a different SDK band than the one in use.
 *
 * @param {boolean} [force=false] - reinstall even if workload exists
 * @param {string} [version] - Tizen workload version to pass to Samsung installer
 * @param {string} [command] - envelope command label
 * @param {object} [opts]
 * @param {boolean} [opts.noInstallSdk] - do NOT auto-install a missing .NET SDK
 * @param {string} [opts.sdkChannel] - .NET SDK channel for the auto-install (script default: 8.0)
 * @returns {object} Standard JSON Envelope
 */
async function setupDotnet(
  force = false,
  version,
  command = "tizen-sdk dotnet-setup",
  opts = {},
) {
  const startTime = Date.now();
  try {
    // Allow only safe characters in shell args
    if (version && !/^[A-Za-z0-9.-]+$/.test(version)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid workload version: ${version}. Use only letters, digits, dot, hyphen.`,
      );
    }
    // No leading hyphen: these args land in an execSync shell string, and a
    // hyphen-led value (e.g. a mistyped flag swallowed as the channel value)
    // should fail HERE as invalid_parameters, not reach the script.
    // != null (not truthiness): '' means the CLI saw --sdk-channel WITHOUT a
    // value — that must be rejected, not silently treated as "flag absent".
    if (
      opts.sdkChannel != null &&
      !/^[A-Za-z0-9.][A-Za-z0-9.-]*$/.test(opts.sdkChannel)
    ) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid SDK channel: "${opts.sdkChannel}". Use only letters, digits, dot, hyphen (must not start with a hyphen).`,
      );
    }

    const resolved = resolveScript("tizen-dotnet-setup");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    console.error(
      `[tizen-dotnet] Setting up .NET environment${force ? " (force reinstall)" : ""}${version ? ` (workload ${version})` : ""}`,
    );

    const winArgs = [
      force ? "-Force" : "",
      version ? `-Version "${version}"` : "",
      opts.noInstallSdk ? "-NoInstallSdk" : "",
      opts.sdkChannel ? `-SdkChannel "${opts.sdkChannel}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const unixArgs = [
      force ? "--force" : "",
      version ? `--version "${version}"` : "",
      opts.noInstallSdk ? "--no-install-sdk" : "",
      opts.sdkChannel ? `--sdk-channel "${opts.sdkChannel}"` : "",
    ]
      .filter(Boolean)
      .join(" ");

    let output;
    try {
      // captureViaTempFile required: long-lived process spawned by installer inherits
      // stdout pipe, and execSync blocks after script exits.
      output = execPluginScript(resolved.scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      });
    } catch (error) {
      const { error_category, message, details, suggested_command } =
        classifyDotnetSetupFailure(error, process.platform, {
          scriptPath: resolved.scriptPath,
        });
      return formatError(
        command,
        error_category,
        message,
        suggested_command || null,
        startTime,
        details,
      );
    }

    const versionMatch = output.match(/\.NET SDK found: dotnet\s+(\S+)/i);
    const { dotnet_root: dotnetRoot, sdk_band: sdkBand } =
      parseInstallTarget(output);

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        dotnet_version: versionMatch ? versionMatch[1].trim() : null,
        dotnet_root: dotnetRoot,
        sdk_band: sdkBand,
        workload: "tizen",
        workload_status: parseWorkloadStatus(output),
        status: "ready",
      },
      {
        // Key lines only (warnings/errors/privilege guidance/[DIAG]) instead of full
        // install log — with a clarifier when the run recovered from a mid-run failure.
        warnings: summarizeSuccessWarnings(output),
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to set up the .NET environment: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  setupDotnet,
  // Exported for tests
  parseDiagLines,
  parseInstallTarget,
  parseWorkloadStatus,
  summarizeSuccessWarnings,
  classifyDotnetSetupFailure,
  summarizeDotnetSetupOutput,
};
