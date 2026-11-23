// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * ECP domain: Emulator Control Panel CLI (ecp-cli) intent matching and execution
 *
 * ecp-cli lives at `{TIZEN_SDK_PATH}/tools/emulator/bin/ecp-cli` and controls a
 * RUNNING emulator (battery, sensors, …). Two request shapes are supported:
 *
 *   - Device discovery for a platform/version:
 *       ecp-cli --version <VERSION> --profile <PROFILE> help
 *     (prints which devices are available for that platform version)
 *   - Per-device commands:
 *       ecp-cli [--target <VM name | serial>] battery [cmds]
 *     (`ecp-cli help` / `ecp-cli --target <t> help` list the commands)
 *
 * ECP commands must be run when at least one emulator is running — the runner
 * verifies this with `sdb devices` before every invocation and fails with a
 * launch-emulator suggestion otherwise.
 *
 * Design (mirrors sdb-helper):
 *   - The request is matched to ONE intent; the runner locates ecp-cli, checks
 *     for a running emulator, resolves the target, and prints a Standard JSON
 *     Envelope.
 *   - An unrecognized intent returns the `ecp-cli help` output in the error
 *     details, so the agent can see the command surface and re-ask.
 */

const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Envelope } = require("../envelope/envelope");
const { readSdkPath } = require("./sdk");
const {
  resolveSdbBinary,
  ensureSdbServer,
  runSdb,
  parseDevices,
} = require("./sdb");

const COMMAND = "tizen-sdk ecp";

const ECP_BIN_DIR_SEGMENTS = ["tools", "emulator", "bin"];

/** ecp-cli executable candidates per platform, in probe order. */
function ecpCliCandidates() {
  if (process.platform === "win32") {
    return ["ecp-cli.bat", "ecp-cli.cmd", "ecp-cli.exe", "ecp-cli"];
  }
  return ["ecp-cli"];
}

/**
 * Locate ecp-cli inside the configured Tizen SDK.
 *
 * @returns {{ecpCliPath: string}|{error: string, error_code: string, error_category: string}}
 */
function resolveEcpCli() {
  const sdkPath = readSdkPath();
  if (!sdkPath) {
    return {
      error:
        "Tizen SDK path is not configured. Run tizen-sdk-init first (the tizen-sdk-init skill).",
      error_code: "TIZEN_SDK_ECP_E001",
      error_category: "sdk_not_configured",
    };
  }
  const binDir = path.join(sdkPath, ...ECP_BIN_DIR_SEGMENTS);
  for (const name of ecpCliCandidates()) {
    const candidate = path.join(binDir, name);
    try {
      if (fs.existsSync(candidate)) return { ecpCliPath: candidate };
    } catch (_e) {
      // probe the next candidate
    }
  }
  return {
    error: `ecp-cli not found at ${binDir}. Reinstall the emulator package (the tizen-download-emulator-package skill) or re-run tizen-sdk-init with the correct SDK path.`,
    error_code: "TIZEN_SDK_ECP_E002",
    error_category: "binary_not_found",
  };
}

/**
 * List the running emulators (`sdb devices`, serials starting with
 * "emulator-", state "device").
 *
 * @returns {{emulators: Array<{serial: string, name?: string}>}|{error: string, error_code: string, error_category: string}}
 */
function listRunningEmulators() {
  const resolved = resolveSdbBinary();
  if (resolved.error) {
    return {
      error: resolved.error,
      error_code: "TIZEN_SDK_ECP_E001",
      error_category: "sdk_not_configured",
    };
  }
  ensureSdbServer(resolved.sdbPath);
  let output;
  try {
    output = runSdb(resolved.sdbPath, "devices");
  } catch (error) {
    return {
      error: `sdb devices failed: ${error.message}`,
      error_code: "TIZEN_SDK_ECP_E003",
      error_category: "io_error",
    };
  }
  const emulators = parseDevices(output)
    .filter((d) => d && /^emulator-/.test(d.serial) && d.state === "device")
    .map((d) =>
      d.name ? { serial: d.serial, name: d.name } : { serial: d.serial },
    );
  return { emulators };
}

const NO_EMULATOR_FIX = {
  command: "node <plugin>/lib/cli/emulator-manager-cli.js list-vm --detail",
  auto_fixable: false,
};

function noRunningEmulatorError() {
  return {
    error_code: "TIZEN_SDK_ECP_E004",
    error_category: "device_not_found",
    message:
      "No running emulator found. ECP commands control a RUNNING emulator — launch one first with the tizen-launch-emulator skill.",
    suggested_fix: NO_EMULATOR_FIX,
  };
}

/**
 * Fillers dropped when extracting the arguments that follow a command word
 * (e.g. "set the battery level to 50" → battery set 50).
 */
const FILLER_WORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "please",
  "level",
  "of",
  "on",
  "for",
  "value",
  "me",
]);

/**
 * Tokenize the tail of the request after a command word, dropping filler
 * words. Numbers, quoted phrases and plain tokens are kept as-is.
 *
 * @param {string} request
 * @param {string} commandWord - e.g. "battery"
 * @returns {string[]}
 */
function commandArgsAfter(request, commandWord) {
  const lower = request.toLowerCase();
  const idx = lower.indexOf(commandWord);
  if (idx < 0) return [];
  const tail = request.slice(idx + commandWord.length).trim();
  if (!tail) return [];
  return tail
    .split(/\s+/)
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => t && !FILLER_WORDS.has(t.toLowerCase()));
}

/**
 * Extract a platform version ("version 9.0", "for 8.0", "tizen 10.0") from the
 * request text.
 *
 * @param {string} request
 * @returns {string|null}
 */
function extractVersion(request) {
  const explicit = request.match(/versions?\s*[:=]?\s*"?(\d+(?:\.\d+)+)"?/i);
  if (explicit) return explicit[1];
  const bare = request.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  return bare ? bare[1] : null;
}

/**
 * Extract an ECP profile ("tv", "tizen", "mobile", "wearable") from the
 * request text. "tizen" (the SDK's unified profile) is the default.
 *
 * @param {string} request
 * @returns {string|null}
 */
function extractProfile(request) {
  const explicit = request.match(
    /profiles?\s*[:=]?\s*(tv|tizen|mobile|wearable)\b/i,
  );
  if (explicit) return explicit[1].toLowerCase();
  const bare = request.match(/\b(tv|wearable|mobile)\b/i);
  if (bare) return bare[1].toLowerCase();
  if (/\btizen\b/i.test(request)) return "tizen";
  return null;
}

/**
 * Tokenize a whole request for the pass-through (unknown command) intent:
 * strip quotes, drop filler words, the "version"/"profile" keywords, bare
 * version numbers ("9.0") and the words that name the emulator itself
 * ("emulator", "vm"), so the remaining tokens are the ecp-cli command the
 * agent meant. The resolved --target token is filtered out later, in
 * buildArgs().
 *
 * @param {string} request
 * @returns {string[]}
 */
function requestTokens(request) {
  return request
    .split(/\s+/)
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter(
      (t) =>
        t &&
        !FILLER_WORDS.has(t.toLowerCase()) &&
        !/^(version|profile|emulator|vm)$/i.test(t) &&
        !/^\d+(\.\d+)+$/.test(t), // bare version numbers ("9.0", "10.0.0")
    );
}

/**
 * Extract a target from the request text: an sdb serial ("emulator-26101") or
 * an explicit "on/for/to <vm>" phrase. Returns null when nothing matches — the
 * caller then auto-selects the running emulator. Words that belong to other
 * parts of the request (version/profile names, numbers, "battery to 50") are
 * never taken as a target.
 *
 * @param {string} request
 * @returns {string|null}
 */
const TARGET_STOPWORDS =
  /^(version|profile|help|battery|me|it|this|that|tv|tizen|mobile|wearable|emulator|the|a|an|my|your|our)$/i;

function extractTargetFromRequest(request) {
  const serial = request.match(/\bemulator-\d+\b/i);
  if (serial) return serial[0];
  // Walk every "on/for/to <word>" occurrence — the first may be a stopword
  // ("on the earphone on my-vm") while a later one names the real target.
  for (const vm of request.matchAll(
    /\b(?:on|for|to)\s+(?:vm\s+|emulator\s+)?([a-z0-9][\w.-]*)\b/gi,
  )) {
    if (
      !TARGET_STOPWORDS.test(vm[1]) &&
      !/^\d+(\.\d+)*$/.test(vm[1]) && // "set the battery level to 50"
      !/^emulator-\d+$/i.test(vm[1])
    ) {
      return vm[1];
    }
  }
  return null;
}

/**
 * The intents runEcpCommand() resolves the request to.
 */
const INTENTS = {
  LIST_DEVICES: "list-devices",
  HELP: "help",
  BATTERY: "battery",
  COMMAND: "command",
};

/** Does the request ask which devices a platform/version supports? */
function asksForDeviceList(request) {
  return /(what|which|list|available|supported)\s+(emulator\s+)?(devices|device types|platforms|images|models)|devices?\s+(are\s+)?(available|supported|listed)|기기 목록|지원 (기기|디바이스)|어떤 (기기|디바이스)/i.test(
    request,
  );
}

/** Does the request ask for the ecp-cli command surface (help)? */
function asksForHelp(request) {
  return /\bhelp\b|what (commands|actions)|which (commands|actions)|command list|available commands|어떤 명령|명령 목록/i.test(
    request,
  );
}

/** "battery" in English or Korean — the command word ecp-cli knows. */
const BATTERY_WORD_RE = /\bbattery\b|배터리/i;

/**
 * Match a natural-language request to one intent. Pure string analysis — no
 * I/O — so tests can exercise it directly.
 *
 * @param {string} request - natural-language request
 * @param {object} opts - {target, version, profile} explicit option overrides
 * @returns {{intent: string, target: string|null, version: string|null, profile: string|null, args: string[]}}
 */
function matchEcpIntent(request, opts = {}) {
  const version = opts.version || extractVersion(request);
  const profile = opts.profile || extractProfile(request);
  const target = opts.target || extractTargetFromRequest(request);

  if (
    asksForDeviceList(request) ||
    (asksForHelp(request) && (version || profile))
  ) {
    return { intent: INTENTS.LIST_DEVICES, target, version, profile, args: [] };
  }
  if (asksForHelp(request)) {
    return { intent: INTENTS.HELP, target, version, profile, args: [] };
  }
  const batteryWord = request.match(BATTERY_WORD_RE);
  if (batteryWord) {
    return {
      intent: INTENTS.BATTERY,
      target,
      version,
      profile,
      args: commandArgsAfter(request, batteryWord[0].toLowerCase()),
    };
  }
  return {
    intent: INTENTS.COMMAND,
    target,
    version,
    profile,
    args: requestTokens(request),
  };
}

/**
 * Build the ecp-cli argument vector for an intent.
 *
 * @param {object} m - matchEcpIntent() result
 * @param {string|null} resolvedTarget - auto-selected or explicit target
 * @returns {string[]}
 */
function buildArgs(m, resolvedTarget) {
  // The target was pulled out of the request text, so it must not leak into
  // the pass-through arguments a second time ("battery set 50 on
  // emulator-26101" → --target emulator-26101 battery set 50).
  const commandArgs = m.args.filter(
    (t) =>
      !resolvedTarget ||
      t.toLowerCase() !== String(resolvedTarget).toLowerCase(),
  );
  const targetArgs = resolvedTarget ? ["--target", resolvedTarget] : [];
  switch (m.intent) {
    case INTENTS.LIST_DEVICES:
      // ecp-cli --version <VERSION> --profile <PROFILE> help
      return ["--version", m.version, "--profile", m.profile, "help"];
    case INTENTS.HELP:
      // ecp-cli [--target <t>] help — with a target it lists THAT device's commands
      return [...targetArgs, "help"];
    case INTENTS.BATTERY:
      // ecp-cli [--target <t>] battery [cmds]
      return [...targetArgs, "battery", ...commandArgs];
    default:
      // ecp-cli [--target <t>] <command> [args] — pass the unknown command
      // through verbatim; ecp-cli itself rejects what it does not know.
      return [...targetArgs, ...commandArgs];
  }
}

/**
 * Escape the characters cmd.exe treats as command separators, redirects or
 * variables, so a token extracted from the natural-language request can never
 * terminate the command and inject a second one.
 *
 * @param {string} token
 * @returns {string}
 */
function escapeCmdToken(token) {
  return token.replace(/[&|<>()^%!"',;=\s]/g, (ch) => `^${ch}`);
}

/**
 * Run ecp-cli with the given arguments.
 *
 * .exe and POSIX binaries are spawned with an argv array — no host shell is
 * involved, so the request tokens cannot be interpreted as shell syntax. The
 * .bat/.cmd Windows candidates must go through cmd.exe; there every token is
 * caret-escaped and the code page is pinned to UTF-8 (otherwise ko-Windows
 * CP949 output is decoded as mojibake).
 *
 * @param {string} ecpCliPath - absolute ecp-cli path
 * @param {string[]} args - argument vector
 * @returns {{output: string}|{error: Error, output: string}}
 */
function execEcpCli(ecpCliPath, args) {
  const execOpts = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60000,
  };
  try {
    let output;
    if (process.platform === "win32" && /\.(bat|cmd)$/i.test(ecpCliPath)) {
      output = execSync(
        `chcp 65001 >nul & "${ecpCliPath}" ${args
          .map(escapeCmdToken)
          .join(" ")}`,
        execOpts,
      );
    } else {
      output = execFileSync(ecpCliPath, args, execOpts);
    }
    return { output: String(output || "") };
  } catch (error) {
    return {
      error,
      output: `${error.stdout || ""}${error.stderr || ""}`,
    };
  }
}

/**
 * Run one ECP request: match the intent, verify a running emulator, resolve
 * the target, execute ecp-cli, and return a Standard JSON Envelope.
 *
 * @param {string} request - natural-language ECP request (required)
 * @param {string|null|undefined} target - explicit VM name or serial (optional)
 * @param {string|null|undefined} version - explicit platform version (optional)
 * @param {string|null|undefined} profile - explicit profile (optional)
 * @param {string} [command] - envelope command label
 * @returns {object} Standard JSON Envelope
 */
async function runEcpCommand(
  request,
  target,
  version,
  profile,
  command = COMMAND,
) {
  const envelope = new Envelope(command);
  if (!request || typeof request !== "string" || !request.trim()) {
    return envelope.failure([
      {
        error_code: "TIZEN_SDK_ECP_E005",
        error_category: "invalid_parameters",
        message:
          'Missing the ECP request text. Pass --request "<what to do>", e.g. --request "battery status" or --request "what devices are available for version 9.0, profile tv".',
      },
    ]);
  }

  const matched = matchEcpIntent(request, { target, version, profile });

  // 1. ecp-cli must exist.
  const ecp = resolveEcpCli();
  if (ecp.error) {
    return envelope.failure([
      {
        error_code: ecp.error_code,
        error_category: ecp.error_category,
        message: ecp.error,
      },
    ]);
  }

  // 2. ECP commands control a RUNNING emulator — verify one is up.
  const running = listRunningEmulators();
  if (running.error) {
    return envelope.failure([
      {
        error_code: running.error_code,
        error_category: running.error_category,
        message: running.error,
      },
    ]);
  }
  if (!running.emulators.length) {
    return envelope.failure([noRunningEmulatorError()]);
  }

  // 3. Resolve the target: explicit > extracted from the request > auto-select.
  let resolvedTarget = matched.target;
  if (
    resolvedTarget &&
    !resolvedTarget.startsWith("emulator-") &&
    !running.emulators.some(
      (e) => e.serial === resolvedTarget || e.name === resolvedTarget,
    )
  ) {
    return envelope.failure([
      {
        error_code: "TIZEN_SDK_ECP_E007",
        error_category: "device_not_found",
        message: `Target "${resolvedTarget}" is not a running emulator. Running: ${running.emulators
          .map((e) => e.serial)
          .join(
            ", ",
          )}. Pass a VM name, an emulator-<port> serial, or omit --target to use the running emulator.`,
      },
    ]);
  }
  if (!resolvedTarget && matched.intent !== INTENTS.LIST_DEVICES) {
    resolvedTarget = running.emulators[0].serial;
  }

  // 4. Build the args; list-devices needs BOTH version and profile.
  const args = buildArgs(matched, resolvedTarget);
  if (
    matched.intent === INTENTS.LIST_DEVICES &&
    (!matched.version || !matched.profile)
  ) {
    return envelope.failure([
      {
        error_code: "TIZEN_SDK_ECP_E008",
        error_category: "missing_argument",
        message: `Listing the devices a platform supports needs BOTH a version and a profile — got version=${
          matched.version || "<missing>"
        }, profile=${matched.profile || "<missing>"}. Ask again naming both, e.g. "what devices are available for version 9.0, profile tv".`,
      },
    ]);
  }

  // 5. Run ecp-cli.
  const result = execEcpCli(ecp.ecpCliPath, args);
  if (result.error) {
    return envelope.failure([
      {
        error_code: "TIZEN_SDK_ECP_E009",
        error_category: "io_error",
        message: `ecp-cli failed (exit ${result.error.status ?? "?"}): ${
          (result.output || result.error.message || "").trim().split("\n")[0] ||
          "no output"
        }`,
        details: (result.output || result.error.message || "")
          .split("\n")
          .filter((l) => l.trim())
          .slice(0, 40),
      },
    ]);
  }

  return envelope.success({
    intent: matched.intent,
    ecp_cli: ecp.ecpCliPath,
    command_line: `ecp-cli ${args.join(" ")}`,
    target: resolvedTarget,
    version: matched.version || null,
    profile: matched.profile || null,
    output: result.output,
  });
}

module.exports = {
  COMMAND,
  INTENTS,
  matchEcpIntent,
  resolveEcpCli,
  listRunningEmulators,
  runEcpCommand,
  requestTokens,
  escapeCmdToken,
};
