// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * sdb-helper domain: intent-based sdb command resolution and execution
 *
 * Given a natural-language request, resolves the correct sdb command for the
 * attached Tizen device, executes it (or returns it for confirmation if gated),
 * and returns a Standard JSON Envelope.
 *
 * Design:
 *   - Read-only intents (pkgcmd -l, forward --list, shell commands, etc.) execute immediately.
 *   - Gated intents (install, uninstall, reboot, factoryreset, root on, etc.) return
 *     the command in suggested_fix for user confirmation, NOT executed.
 *   - Device logs (view/tail/save/clear, dlog) → hand off to tizen-dlog-analyzer
 *     (log-dump / log-clear / start …); sdb-helper never runs `sdb dlog`.
 *   - Package install/uninstall → hand off to tizen-install-app (not handled here).
 *   - Device discovery / emulator creation → hand off to tizen-device-manager.
 *   - File transfer (push/pull) → hand off to tizen-file-transfer.
 *   - Debug port forwarding → hand off to tizen-gdb-debug / tizen-dotnet-debug.
 */

const { execFile } = require("child_process");
const { promisify } = require("util");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const {
  resolveSdb,
  resolveSdbBinary,
  runSdb,
  ensureSdbServer,
  parseDevices,
  resolveSerial,
  describeSerialFailure,
} = require("./sdb");

const execFileAsync = promisify(execFile);

/**
 * Intent classification — maps natural-language keywords to intent IDs.
 * Order matters: first match wins.
 */
const INTENT_PATTERNS = [
  // Discovery — handoff to tizen-device-manager (richer: emulator fallback)
  {
    id: "list-devices",
    regex: /\b(list|show|find).*(devices?|connected)\b/i,
    gated: false,
    handoff: "tizen-device-manager",
  },
  {
    id: "device-info",
    regex: /\b(capability|device info|detailed info)\b/i,
    gated: false,
  },
  // Remote connect/disconnect — handoff to tizen-remote-device (richer: bookmarks)
  {
    id: "connect",
    regex: /\bconnect\b.*\b(\d+\.\d+\.\d+\.\d+|localhost)\b/i,
    gated: false,
    handoff: "tizen-remote-device",
  },
  {
    id: "disconnect",
    regex: /\bdisconnect\b/i,
    gated: false,
    handoff: "tizen-remote-device",
  },

  // Package lifecycle. Install is handed off to tizen-install-app (package
  // discovery, RPK/RPM handling, --run). Uninstall is handled HERE: no other
  // skill implements it, so the former handoff sent the user nowhere.
  // (\binstall\b does not match "uninstall" — no word boundary after "un".)
  {
    id: "install",
    regex: /\binstall\b/i,
    gated: true,
    handoff: "tizen-install-app",
  },
  {
    id: "uninstall",
    regex: /\b(uninstall|remove\s+(the\s+)?(app|package))\b/i,
    gated: true,
  },
  {
    id: "list-packages",
    // Both word orders: "list packages installed" and "list installed
    // packages" (the natural phrasing — the docs and the uninstall note use
    // it, and it used to fall through to "Could not match request"), plus
    // "which/what packages are installed" and "application(s)". "installed"
    // is required in every branch so "list running apps" (list-running) and
    // "install this tpk" (install — \binstall\b never matches "installed")
    // are untouched.
    regex:
      /\b(?:(?:list|show|which|what)\b.*\b(?:packages?|apps?|applications?)\b.*\binstalled\b|\binstalled\s+(?:packages?|apps?|applications?)\b)/i,
    gated: false,
  },
  { id: "package-info", regex: /\b(package info|pkginfo)\b/i, gated: false },

  // Launch / kill
  {
    id: "launch",
    regex: /\b(launch|start|run|open)\b.*\bapp\b/i,
    gated: false,
  },
  {
    id: "kill",
    regex: /\b(kill|stop|close|terminate)\b.*\bapp\b/i,
    gated: true,
  },
  {
    id: "list-running",
    regex: /\b(running apps?|list.*running)\b/i,
    gated: false,
  },

  // Screenshot — handoff to tizen-screenshot (dedicated skill with full pipeline)
  {
    id: "screenshot",
    regex: /\b(screenshot|screen capture|screen shot)\b/i,
    gated: false,
    handoff: "tizen-screenshot",
  },

  // Shell — specific patterns first: the bare /\bshell\b/ of shell-command
  // would otherwise shadow whoami ("shell user") and shell-interactive.
  { id: "whoami", regex: /\b(whoami|shell user|which user)\b/i, gated: false },
  {
    id: "shell-interactive",
    regex: /\b(interactive shell|open.*shell|drop.*shell)\b/i,
    gated: false,
  },
  { id: "shell-command", regex: /\bshell\b/i, gated: false },
  {
    id: "root-on",
    regex: /\b(root\s+on|enable root|gain root)\b/i,
    gated: true,
  },

  // Logs — every device-log request (view/tail/save/clear) is owned by
  // tizen-dlog-analyzer (log-dump / log-clear / start …). The intents stay so
  // matchIntent still classifies them and the caller gets a handoff envelope
  // instead of "Could not match request". Placed AFTER the shell block on
  // purpose: the bare /\b(logs?|dlog|tail)\b/ catch-all must not steal an
  // explicit shell request such as "run shell command tail -n 20 /var/log/x".
  {
    // Kernel log (dmesg / kmsg) — collected and analyzed by the dlog-analyzer
    // runner's `kernel collect` → `kernel stop` → `kernel analyze`; typed over
    // sdb shell it bypasses classification (issue #213). Before the generic log
    // catch-all so "kernel log" is not answered with a plain dlog dump.
    id: "kernel-log",
    regex: /\b(dmesg|kmsg|kernel[\s-]*logs?)\b/i,
    gated: false,
    handoff: "tizen-dlog-analyzer",
    handoffHint:
      "Run the dlog-analyzer runner: kernel collect [serial] starts the kernel-log collector in the background; ask the user to reproduce the issue, then kernel stop and kernel analyze for the deduplicated findings.",
  },
  {
    id: "log-clear",
    regex: /\b(clear|flush).*(logs?|dlog)\b/i,
    gated: true, // documentation only — the handoff short-circuits before the gate
    handoff: "tizen-dlog-analyzer",
    handoffHint:
      "Run the dlog-analyzer runner: log-clear [serial] — it refuses without --confirm; ask the user, then re-run with --confirm.",
  },
  {
    id: "log-save",
    regex: /\b(save|export|capture).*(logs?|dlog)\b/i,
    gated: false,
    handoff: "tizen-dlog-analyzer",
    handoffHint:
      "Run the dlog-analyzer runner: log-dump [serial] --output <file> (one-shot buffer dump to a file), or start dlog-collect for continuous collection.",
  },
  {
    id: "log-stream",
    regex: /\b(logs?|dlog|tail)\b/i,
    gated: false,
    handoff: "tizen-dlog-analyzer",
    handoffHint:
      'Run the dlog-analyzer runner: log-dump [serial] [--filter "*:E"] for a one-shot view, or start start-monitoring for continuous monitoring with crash detection.',
  },

  // Port forward — list/remove before the catch-all forward-add, whose bare
  // /\bforward\b/ would otherwise match "list forward" / "remove forward".
  {
    id: "forward-list",
    regex: /\b(list|show).*(forward|forwards)\b/i,
    gated: false,
  },
  {
    id: "forward-remove",
    regex: /\b(remove|delete).*(forward|forwards)\b/i,
    gated: true,
  },
  {
    id: "forward-add",
    regex: /\b(forward|port forward|port forwarding)\b/i,
    gated: false,
  },

  // Device power / state
  {
    // Restarting an EMULATOR is not a guest `reboot`: under WHPX (Windows
    // Hyper-V) the vCPU reset kills the QEMU process ("WHPX: Unexpected VP
    // exit code 4 / Failed to emulate MMIO access") and the VM never comes
    // back. The safe path is tizen-device-manager (stop the VM) followed by
    // tizen-launch-emulator (cold start). Before the bare /\breboot\b/ so
    // "reboot the emulator" is handed off instead of gated.
    id: "emulator-restart",
    regex:
      /\b(?:reboot|restart)\b.*\bemulator\b|\bemulator\b.*\b(?:reboot|restart)\b/i,
    gated: false,
    handoff: "tizen-device-manager",
    handoffHint:
      "Do not reboot the emulator from inside the guest — on Windows (WHPX) the vCPU reset crashes the QEMU VM. Restart it in two steps: tizen-device-manager (stop the emulator VM), then tizen-launch-emulator (cold start the same VM).",
  },
  { id: "reboot", regex: /\breboot\b/i, gated: true },
  { id: "shutdown", regex: /\b(shutdown|power off)\b/i, gated: true },
  { id: "factory-reset", regex: /\b(factory\s*reset)\b/i, gated: true },
  { id: "sendkey", regex: /\b(sendkey|send key|key event)\b/i, gated: false },
];

/**
 * Match a natural-language request to an intent ID.
 * @param {string} request
 * @returns {{id: string, gated: boolean, handoff?: string, handoffHint?: string}|null}
 */
function matchIntent(request) {
  for (const pattern of INTENT_PATTERNS) {
    if (pattern.regex.test(request)) {
      const intent = {
        id: pattern.id,
        gated: pattern.gated,
        handoff: pattern.handoff,
      };
      if (pattern.handoffHint) intent.handoffHint = pattern.handoffHint;
      return intent;
    }
  }
  return null;
}

// A device clause the user tacks onto a shell request — "… on emulator-26101",
// "… on the device", "on my TV …". It names WHERE to run, not WHAT to run,
// and must never reach the device as extra arguments.
//
// Two serial shapes, by how much context backs them up:
//   - after a device noun ("on device R3CN30ABCDE", "on the tv 192.168.0.5")
//     the noun already says this is a device clause, so any serial-looking
//     token is accepted: emulator-<port>, IPv4[:port], or an 8+ char mix of
//     letters and digits (dots allowed — "host.local:26101").
//   - a BARE "on <token>" has no such backing, and "on" is a perfectly
//     ordinary command argument ("grep -i on file1.txt", "echo on
//     backup2024"). Only an unmistakable serial is stripped there:
//     emulator-<port>, IPv4[:port], or a hardware serial — 8+ letters and
//     digits with NO dot or underscore (file names have extensions and
//     underscores; serials such as R3CN30ABCDE do not) and not a word with a
//     number glued on one end ("backup2024", "2024report") — real serials
//     interleave letters and digits.
//   Plain words never qualify, so "grep -i on file.txt" and "echo on" are
//   left alone. The exact resolved serial is stripped separately, whatever
//   it looks like (see extractShellCommand).
const EMULATOR_OR_IP_TOKEN =
  "emulator-\\d+|\\d{1,3}(?:\\.\\d{1,3}){3}(?::\\d+)?";
const NOUN_SERIAL_TOKEN =
  "(?:" +
  EMULATOR_OR_IP_TOKEN +
  "|(?=[A-Za-z0-9._:-]*\\d)(?=[A-Za-z0-9._:-]*[A-Za-z])[A-Za-z0-9._:-]{8,})";
const BARE_SERIAL_TOKEN =
  "(?:" +
  EMULATOR_OR_IP_TOKEN +
  "|(?![A-Za-z]+\\d+(?![A-Za-z0-9:-]))(?!\\d+[A-Za-z]+(?![A-Za-z0-9:-]))" +
  "(?=[A-Za-z0-9:-]*\\d)(?=[A-Za-z0-9:-]*[A-Za-z])[A-Za-z0-9:-]{8,})";
const DEVICE_NOUN =
  "(?:(?:the|my|this|that)\\s+)?(?:device|emulator|target|tv|board)\\b";
const DEVICE_CLAUSE =
  "on\\s+(?:" +
  DEVICE_NOUN +
  "(?:\\s+" +
  NOUN_SERIAL_TOKEN +
  ")?|" +
  BARE_SERIAL_TOKEN +
  ")";
const LEADING_DEVICE_RE = new RegExp("^" + DEVICE_CLAUSE + "[,\\s]+", "i");
const TRAILING_DEVICE_RE = new RegExp(
  "(?:^|\\s+)" + DEVICE_CLAUSE + "\\s*[.!]?$",
  "i",
);
const LEADING_POLITE_RE = /^(?:please|pls|kindly)[,\s]+/i;
const TRAILING_POLITE_RE =
  /(?:^|[,\s]+)(?:please|pls|for me|thanks|thank you)\s*[.!]?$/i;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the actual shell command from a natural-language request.
 *
 * Strips common intent keywords ("shell", "command", "run", "execute"), a
 * leading/trailing device clause ("on emulator-26101", "on the device"), and
 * politeness ("please"), and returns the remainder as the command to run on
 * the device. The device clause used to be passed through verbatim, so
 * "run shell command ls -la on emulator-26101" ran 'ls -la on emulator-26101'
 * on the device — harmless, but it printed "ls: cannot access 'on'" noise and
 * could change the result.
 *
 * Examples:
 *   "run shell command ls -la"                       → "ls -la"
 *   "run shell command ls -la on emulator-26101"     → "ls -la"
 *   "shell df -h /opt on the device"                 → "df -h /opt"
 *   "on emulator-26101 run shell command ls"         → "ls"
 *   "please run shell command ls -la please"         → "ls -la"
 *   "run shell command grep -i on file.txt"          → "grep -i on file.txt"
 *   "run shell command grep -i on file1.txt"         → "grep -i on file1.txt"
 *   "run shell command echo on backup2024"           → "echo on backup2024"
 *   "shell"                                          → null (no command found)
 *
 * @param {string} request - natural-language request
 * @param {string} [serial] - resolved device serial; a trailing "on <serial>"
 *   is stripped even when the serial is not serial-shaped
 * @returns {string|null} the extracted command, or null if none found
 */
function extractShellCommand(request, serial) {
  let cmd = request.trim();

  // Preamble: "on emulator-26101, run …", "please run …"
  cmd = cmd.replace(LEADING_DEVICE_RE, "").replace(LEADING_POLITE_RE, "");

  // Remove "run" / "execute" at the start
  cmd = cmd.replace(/^(run|execute)\s+/i, "");

  // Remove "shell" and "command" keywords (any order, any position at start)
  // Repeat to handle "shell command", "command shell", etc.
  //
  // The keyword must be a whole word: `\s*` would let "shell" match the prefix
  // of "shellcheck" and strip it, silently turning "shell shellcheck foo.sh"
  // into "check foo.sh" — a corrupted command that then runs on the device.
  for (let i = 0; i < 3; i++) {
    const before = cmd;
    cmd = cmd.replace(/^(shell|command)(\s+|$)/i, "");
    if (cmd === before) break;
  }

  // Tail: "… on the device", "… on emulator-26101", "… please". Politeness
  // comes off first so a trailing "please" cannot shield the device clause
  // ("ls on mytv please"); the exact resolved serial is stripped whatever it
  // looks like, then the generic clause, then any politeness that was
  // sitting in front of the clause ("ls please on emulator-26101").
  cmd = cmd.replace(TRAILING_POLITE_RE, "");
  if (serial) {
    const exact = new RegExp(
      "(?:^|\\s+)on\\s+(?:" +
        DEVICE_NOUN +
        "\\s+)?" +
        escapeRegExp(serial) +
        "\\s*[.!]?$",
      "i",
    );
    cmd = cmd.replace(exact, "");
  }
  cmd = cmd.replace(TRAILING_DEVICE_RE, "");
  cmd = cmd.replace(TRAILING_POLITE_RE, "");

  cmd = cmd.trim();

  // If nothing remains, or the remainder is just "shell"/"command", there's
  // no actual command to run
  if (!cmd || /^(shell|command)$/i.test(cmd)) {
    return null;
  }

  return cmd;
}

/**
 * Extract a Tizen application / package ID from a natural-language request.
 *
 * App IDs are dotted identifiers ("org.tizen.dali-demo", "abcdefghij.MyApp").
 * The leading segment must start with a letter, which keeps IPv4 addresses and
 * "emulator-26101"-style serials out of the match.
 *
 * Examples:
 *   "launch app org.tizen.dali-demo"  → "org.tizen.dali-demo"
 *   'kill app "org.example.myapp"'    → "org.example.myapp"
 *   "launch the app"                  → null
 *
 * @param {string} request
 * @returns {string|null}
 */
function extractAppId(request) {
  if (!request) return null;
  const match = request.match(/\b[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+/);
  return match ? match[0] : null;
}

/**
 * Extract a Tizen PACKAGE ID for `pkginfo --pkg` / `pkgcmd -u -n`.
 *
 * A package id is usually dotted like an app id ("org.tizen.dali-demo"), but
 * for TPK/WGT apps it is the bare generated prefix of the app id — the
 * `dZEpxl2iAg` in `dZEpxl2iAg.MyTizenWebApp` — which has no dot at all, so
 * extractAppId() alone rejected exactly the id `pkgcmd -l` prints.
 *
 * Dotted ids win (anywhere in the request). Otherwise take the first token
 * after the intent keyword, skipping filler words ("for", "the", "package"…).
 * The token is spliced into `pkginfo --pkg "<id>"` / `pkgcmd -u -n "<id>"`, so
 * the bare path is deliberately strict:
 *
 *   - the filler skip is guarded by a negative lookahead, so when nothing
 *     follows the fillers the regex cannot backtrack and hand back a filler
 *     ("uninstall app", "package info id" → null, not "app" / "id");
 *   - the token must LOOK like an id, not like an English word: a digit, or
 *     both cases, or `-`/`_` (the SDK's generated pkgids are 10 mixed-case
 *     alphanumerics such as `dZEpxl2iAg`). A plain lowercase word ("my",
 *     "from", "please") is refused whatever it is — a whitelist, not a list
 *     of words we happened to think of;
 *   - device serials are refused: `emulator-<port>`, the serial passed in,
 *     and long hex strings (hardware serials are 12+ hex chars; a pkgid is 10).
 *
 * Examples:
 *   "package info dZEpxl2iAg"                    → "dZEpxl2iAg"
 *   'uninstall "hQaMXc3Qbc"'                     → "hQaMXc3Qbc"
 *   "package info for the package org.tizen.x"   → "org.tizen.x"
 *   "package info on emulator-26101"             → null
 *   "package info on my device"                  → null
 *   "uninstall app"                              → null
 *
 * @param {string} request
 * @param {string} [serial] - device serial to exclude from bare matches
 * @returns {string|null}
 */
const PKG_FILLER_WORDS =
  "for|of|on|about|the|a|an|this|that|my|our|its|app|application|package|pkg|id";
const BARE_PKG_ID_RE = new RegExp(
  "\\b(?:package info|pkginfo|uninstall|remove\\s+(?:the\\s+)?(?:app|package))\\b" +
    `(?:\\s+(?:${PKG_FILLER_WORDS})\\b)*` +
    `\\s+["']?(?!(?:${PKG_FILLER_WORDS})\\b)([A-Za-z0-9][A-Za-z0-9_-]*)["']?`,
  "i",
);

function looksLikePackageId(token) {
  return (
    /\d/.test(token) ||
    /[-_]/.test(token) ||
    (/[a-z]/.test(token) && /[A-Z]/.test(token))
  );
}

function extractPackageId(request, serial) {
  if (!request) return null;
  const dotted = extractAppId(request);
  if (dotted) return dotted;

  const bare = request.match(BARE_PKG_ID_RE);
  if (!bare) return null;
  const token = bare[1];
  if (!looksLikePackageId(token)) return null;
  if (/^emulator-\d+$/i.test(token)) return null;
  if (/^[0-9a-f]{12,}$/i.test(token)) return null;
  if (serial && token.toLowerCase() === String(serial).toLowerCase()) {
    return null;
  }
  return token;
}

/** Bare key words we are willing to normalize to a Tizen KEY_* name. */
const KEY_ALIASES = {
  home: "KEY_HOME",
  back: "KEY_BACK",
  menu: "KEY_MENU",
  power: "KEY_POWER",
  enter: "KEY_ENTER",
  ok: "KEY_ENTER",
  up: "KEY_UP",
  down: "KEY_DOWN",
  left: "KEY_LEFT",
  right: "KEY_RIGHT",
  volumeup: "KEY_VOLUMEUP",
  volumedown: "KEY_VOLUMEDOWN",
};

/**
 * Extract a key name for `sdb shell sendkey`.
 *
 * Accepts an explicit KEY_* token, or one of the well-known bare aliases above.
 * Anything else returns null rather than guessing — sending the wrong key event
 * to a device is not a recoverable mistake.
 *
 * @param {string} request
 * @returns {string|null}
 */
function extractKeyName(request) {
  if (!request) return null;

  const explicit = request.match(/\bKEY_[A-Z0-9_]+\b/i);
  if (explicit) return explicit[0].toUpperCase();

  for (const word of request.toLowerCase().match(/[a-z]+/g) || []) {
    if (KEY_ALIASES[word]) return KEY_ALIASES[word];
  }
  return null;
}

/**
 * Extract host/device port numbers for `sdb forward`.
 *
 * Device serials ("emulator-26101") and host addresses ("192.168.0.5:26101")
 * carry digits that are not ports, so they are removed before scanning.
 * A single port is used for both ends, which is the common case.
 *
 * @param {string} request
 * @returns {{host: string, device: string}|null}
 */
function extractPorts(request) {
  if (!request) return null;

  const cleaned = request
    .replace(/\bemulator-\d+/gi, " ")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g, " ");

  const tcpPorts = [...cleaned.matchAll(/\btcp:(\d{1,5})\b/gi)].map(
    (m) => m[1],
  );
  const ports = tcpPorts.length
    ? tcpPorts
    : [...cleaned.matchAll(/\b(\d{1,5})\b/g)].map((m) => m[1]);

  if (!ports.length) return null;
  return { host: ports[0], device: ports[1] || ports[0] };
}

/**
 * Extract the `host:port` target for `sdb connect` / `sdb disconnect`.
 *
 * Accepts an IPv4 address or "localhost" (the connect intent regex admits
 * both). Port defaults to the sdb default, 26101.
 *
 * @param {string} request
 * @returns {{host: string, port: string}|null}
 */
function extractHostPort(request) {
  if (!request) return null;

  const ipMatch = request.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/);
  if (ipMatch) return { host: ipMatch[1], port: ipMatch[2] || "26101" };

  const localMatch = request.match(/\blocalhost\b(?::(\d+))?/i);
  if (localMatch) return { host: "localhost", port: localMatch[1] || "26101" };

  return null;
}

/**
 * Build the "I could not find X in your request" response.
 *
 * An empty command makes executeSdb() return an invalid_parameters envelope
 * instead of running anything, and the note tells the caller what to supply.
 */
function missingValue(what, example) {
  return {
    command: "",
    note: `Could not find ${what} in the request. Include it, e.g. '${example}'.`,
  };
}

/** sdb names emulator instances `emulator-<port>`; anything else is hardware. */
function isEmulatorSerial(serial) {
  return /^emulator-\d+$/i.test(String(serial || ""));
}

/**
 * Note attached to a gated `reboot` / `shutdown` aimed at an emulator.
 *
 * A guest-side reboot of the Tizen emulator is not a restart: on Windows
 * hosts the QEMU VM runs under WHPX, and the vCPU reset makes QEMU exit with
 * "WHPX: Unexpected VP exit code 4 / Failed to emulate MMIO access" — the VM
 * window dies and sdb loses the device. `shutdown -P now` simply powers the
 * VM off. Either way the way back is a cold start, so point the user at the
 * emulator skills instead of the guest command.
 *
 * @param {"reboot"|"shutdown"} action
 * @returns {string}
 */
function emulatorPowerNote(action) {
  return (
    `The target is an emulator. A guest '${action}' is not a safe way to restart it: ` +
    'on Windows (WHPX) the vCPU reset crashes the QEMU VM ("WHPX: Unexpected VP exit code 4") and the emulator does not come back. ' +
    "Recommended instead: stop the VM with tizen-device-manager, then cold-start it with tizen-launch-emulator. " +
    "Run the gated command only if the user explicitly wants the guest-side " +
    action +
    "."
  );
}

/**
 * Build the sdb command string for a given intent.
 * @param {string} intentId
 * @param {string} serial
 * @param {string} request - original request (for extracting paths, ports, etc.)
 * @returns {{command: string, note?: string, fallbacks?: string[],
 *            accept?: (output: string) => boolean}}
 *   `fallbacks` (screenshot and launch intents) lists alternative sdb commands
 *   the caller tries in order after `command` fails. `accept` (launch intent)
 *   decides from the output whether an attempt succeeded — sdb exits 0 even
 *   when the remote command printed nothing useful.
 */
function buildCommand(intentId, serial, request) {
  const s = serial ? `-s "${serial}"` : "";
  switch (intentId) {
    // Discovery
    case "list-devices":
      return { command: "devices" };
    case "device-info":
      return { command: `${s} capability` };
    case "connect": {
      const target = extractHostPort(request);
      if (!target) {
        return missingValue("a host address", "connect 192.168.0.5:26101");
      }
      return { command: `connect ${target.host}:${target.port}` };
    }
    case "disconnect": {
      const target = extractHostPort(request);
      // `sdb disconnect` with no target disconnects every remote device, which
      // is the natural reading of a bare "disconnect".
      if (!target) {
        return {
          command: "disconnect",
          note: "No host given — this disconnects ALL remote devices. Pass an address to target one, e.g. 'disconnect 192.168.0.5:26101'.",
        };
      }
      return { command: `disconnect ${target.host}:${target.port}` };
    }

    // Package lifecycle (handoff — should not reach here normally)
    case "list-packages":
      return { command: `${s} shell pkgcmd -l` };
    case "package-info": {
      const pkgId = extractPackageId(request, serial);
      if (!pkgId) {
        return missingValue(
          "a package ID",
          "package info org.tizen.dali-demo (or the bare pkgid, e.g. package info dZEpxl2iAg)",
        );
      }
      return { command: `${s} shell pkginfo --pkg "${pkgId}"` };
    }

    // Launch / kill
    case "launch": {
      const appId = extractAppId(request);
      if (!appId) {
        return missingValue("an app ID", "launch app org.tizen.dali-demo");
      }
      // Samsung TV images print nothing for app_launcher in a non-root shell
      // (exit 0, empty output); their own launcher answers "app_id[<id>] launched"
      // ("resumed" when the app was already running). Match on this app's id
      // so a "launch failed" / foreign-app line never counts as success.
      const tvLaunched = new RegExp(
        `app_id\\[${appId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\] (launched|resumed)`,
        "i",
      );
      return {
        command: `${s} shell app_launcher -s "${appId}"`,
        fallbacks: [`${s} shell 0 was_execute "${appId}"`],
        accept: (output) =>
          /successfully launched/i.test(output) || tvLaunched.test(output),
      };
    }
    case "kill": {
      const appId = extractAppId(request);
      if (!appId) {
        return missingValue("an app ID", "kill app org.tizen.dali-demo");
      }
      return { command: `${s} shell app_launcher -k "${appId}"` };
    }
    case "uninstall": {
      // pkgcmd takes the PACKAGE id. For TPK/WGT apps that is usually the
      // part of the app id before the last dot (pkgid `hQaMXc3Qbc`, app id
      // `hQaMXc3Qbc.MyApp`), so the note asks the user to confirm which one
      // they gave; the gated envelope never runs this without confirmation.
      const pkgId = extractPackageId(request, serial);
      if (!pkgId) {
        return missingValue("a package ID", "uninstall org.tizen.dali-demo");
      }
      return {
        command: `${s} shell pkgcmd -u -n "${pkgId}"`,
        note:
          "pkgcmd -u takes the package id (not the app id). For a TPK/WGT whose app id is <pkgid>.<name>, pass <pkgid>. " +
          "Check with 'list installed packages' or 'package info <id>' first if unsure.",
      };
    }
    case "list-running":
      return { command: `${s} shell app_launcher -S` };

    // Logs (log-stream / log-save / log-clear) — no sdb builder on purpose:
    // INTENT_PATTERNS hands them to tizen-dlog-analyzer (log-dump / log-clear)
    // before buildCommand is ever reached.

    // Screenshot — returns a fallback chain; the caller tries each in order
    // Order: device-side tools first, then host-side xwd (most reliable for
    // emulators), then framebuffer (last resort, may only get console).
    case "screenshot":
      return {
        command: `${s} shell screencapture /tmp/sshot.png`,
        fallbacks: [
          `${s} shell capture_screen /tmp/sshot.png`,
          // Enlightenment is the Tizen window manager, so this covers platform
          // images that ship neither capture tool. Needs `sdb root on` first —
          // the binary is root-only — and it exits 0 even on a bad option, so
          // judge success by the produced file.
          `${s} shell enlightenment_info -dump_screen -p /tmp/ -n sshot.png`,
          `__host_xwd__`, // sentinel: host-side xwd on emulator X11 window
          `${s} shell dd if=/dev/fb0 of=/tmp/fb0.raw`,
        ],
        note: "Try screencapture → capture_screen → enlightenment_info → host-side xwd → /dev/fb0. Stop at first success. enlightenment_info requires `sdb root on` (the binary is root-only) and exits 0 even for an unknown option, so verify the file rather than the exit code; it writes /tmp/sshot.png at native resolution — pull it. Older images use `enlightenment_info -dump topvwins <DIR>` (note the space) which creates its own timestamped subdirectory of per-window PNGs: pull the directory and keep the largest. Host-side xwd: find emulator window via xwininfo, capture with xwd, convert XWD→PNG with Python PIL. Framebuffer: read /sys/class/graphics/fb0/ for resolution/bpp/stride, convert raw→PNG with Python PIL. Standalone script: scripts/tizen-screenshot/tizen-screenshot.sh",
      };

    // Shell
    case "shell-command": {
      const cmd = extractShellCommand(request, serial);
      if (!cmd) {
        return {
          command: "",
          note: "Could not extract a shell command from the request. Include the command to run, e.g. 'run shell command ls -la'.",
        };
      }
      // Append exit-code marker so the caller can detect non-zero remote exits.
      // On unix hosts the whole string goes through /bin/sh, which would expand
      // $? (and any $/`/"/\ in cmd) BEFORE sdb runs — escape so the device shell
      // is the one that expands them.
      if (process.platform === "win32") {
        // On Windows the line goes through cmd.exe, which does NOT leave these
        // characters alone: every `"` toggles its quoting state, so a quote
        // inside cmd ends the argument and exposes the rest of the line (`&`,
        // `|`) to cmd itself, and `%` expands environment variables even
        // inside quotes. cmd.exe has no escape for either inside a quoted
        // argument, so refuse rather than guess.
        if (/["%]/.test(cmd)) {
          return {
            command: "",
            note:
              "The shell command contains a double quote or a percent sign, which cannot be passed " +
              "safely through cmd.exe on Windows. Use single quotes for the device-side quoting, or " +
              "run the command in an interactive `sdb shell`.",
          };
        }
        return { command: `${s} shell "${cmd}; echo __SDB_EXIT:$?"` };
      }
      const hostSafeCmd = cmd.replace(/[\\"`$]/g, (ch) => `\\${ch}`);
      return { command: `${s} shell "${hostSafeCmd}; echo __SDB_EXIT:\\$?"` };
    }
    case "shell-interactive":
      return { command: `${s} shell` };
    case "whoami":
      return { command: `${s} shell whoami` };
    case "root-on":
      return { command: `${s} root on` };

    // Port forward
    case "forward-add": {
      const ports = extractPorts(request);
      if (!ports) {
        return missingValue("a port number", "forward port 8080");
      }
      return {
        command: `${s} forward tcp:${ports.host} tcp:${ports.device}`,
      };
    }
    case "forward-list":
      return { command: `${s} forward --list` };
    case "forward-remove": {
      const ports = extractPorts(request);
      if (!ports) {
        return missingValue("a port number", "remove forward 8080");
      }
      return { command: `${s} forward --remove tcp:${ports.host}` };
    }

    // Device power / state
    case "reboot":
      return {
        command: `${s} shell reboot`,
        ...(isEmulatorSerial(serial)
          ? { note: emulatorPowerNote("reboot") }
          : {}),
      };
    case "shutdown":
      return {
        command: `${s} shell shutdown -P now`,
        ...(isEmulatorSerial(serial)
          ? { note: emulatorPowerNote("shutdown") }
          : {}),
      };
    case "factory-reset":
      return { command: `${s} shell factoryreset` };
    case "sendkey": {
      const key = extractKeyName(request);
      if (!key) {
        return missingValue("a key name", "sendkey KEY_HOME");
      }
      return { command: `${s} shell sendkey ${key}` };
    }

    default:
      return { command: "", note: "Unknown intent." };
  }
}

/**
 * Try the primary sdb command, then each fallback in order; stop at the
 * first success.
 *
 * @param {string} sdbPath
 * @param {string} primary - sdb argument string to try first
 * @param {string[]} [fallbacks] - alternative argument strings
 * @param {(output: string) => boolean} [accept] - when given, an attempt whose
 *   output it rejects counts as a failure (sdb exits 0 even when the remote
 *   command printed nothing useful)
 * @returns {{succeeded: boolean, output: string|null, usedCommand: string|null,
 *            triedCommands: string[], lastError: Error|null}}
 */
function runWithFallbacks(sdbPath, primary, fallbacks = [], accept = null) {
  const triedCommands = [`sdb ${primary}`];
  let lastError = null;
  const attempt = (args) => {
    const output = runSdb(sdbPath, args);
    if (accept && !accept(output)) {
      throw new Error(
        `output did not confirm success: ${output.trim() || "(empty)"}`,
      );
    }
    return output;
  };
  try {
    const output = attempt(primary);
    return {
      succeeded: true,
      output,
      usedCommand: `sdb ${primary}`,
      triedCommands,
      lastError: null,
    };
  } catch (primaryError) {
    lastError = primaryError;
  }
  for (const fallback of fallbacks) {
    // Sentinel entries (e.g. __host_xwd__) describe host-side procedures for
    // the caller/agent; they are not sdb argument strings — skip execution.
    if (fallback.startsWith("__")) continue;
    triedCommands.push(`sdb ${fallback}`);
    try {
      const output = attempt(fallback);
      return {
        succeeded: true,
        output,
        usedCommand: `sdb ${fallback}`,
        triedCommands,
        lastError: null,
      };
    } catch (fbError) {
      lastError = fbError;
    }
  }
  return {
    succeeded: false,
    output: null,
    usedCommand: null,
    triedCommands,
    lastError,
  };
}

/**
 * Main entry: resolve and execute (or preview) an sdb command.
 *
 * @param {string} request - Natural-language sdb request
 * @param {string} [serial] - Optional device serial (auto-detect if omitted)
 * @returns {object} Standard JSON Envelope
 */
async function runSdbCommand(
  request,
  serial,
  command = "tizen-sdk sdb-helper",
) {
  const startTime = Date.now();

  try {
    if (
      !request ||
      typeof request !== "string" ||
      request.trim().length === 0
    ) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: request (natural-language sdb request).",
        'tizen-cli tizen-sdk sdb-helper --request "run shell command ls -la"',
        startTime,
      );
    }

    // 1. Resolve sdb binary
    const sdbResolved = resolveSdb();
    if (sdbResolved.error) {
      return formatError(
        command,
        "sdk_path_not_set",
        sdbResolved.error,
        "tizen-cli tizen-sdk sdk-init --sdk-path <path>",
        startTime,
      );
    }
    const { sdbPath } = sdbResolved;

    // 2. Verify sdb exists
    const fs = require("fs");
    if (!fs.existsSync(sdbPath)) {
      return formatError(
        command,
        "io_error",
        `sdb binary not found at: ${sdbPath}. Ensure the Tizen SDK is properly installed.`,
        null,
        startTime,
      );
    }

    // The first sdb call of a session has to start the sdb server daemon,
    // which then keeps the stdout pipe open until the timeout (see sdb.js).
    // Start it once here so every runSdb / resolveSerial below is a plain,
    // fast call instead of a 30 s hang reported as a false io_error.
    ensureSdbServer(sdbPath);

    // 3. Match intent
    const intent = matchIntent(request);
    if (!intent) {
      return formatError(
        command,
        "invalid_parameters",
        `Could not match request to any sdb intent: "${request}". Supported: list devices, install, launch, kill, screenshot, shell, forward, reboot, etc. Device logs are handled by tizen-dlog-analyzer.`,
        null,
        startTime,
      );
    }

    // 4. Handle handoff intents (install/uninstall → tizen-install-app,
    //    logs → tizen-dlog-analyzer, screenshot → tizen-screenshot, …)
    if (intent.handoff) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        intent: intent.id,
        handoff: intent.handoff,
        message: `Intent "${intent.id}" is handled by the ${intent.handoff} skill. Use that skill instead.`,
        suggested_skill: intent.handoff,
        ...(intent.handoffHint ? { note: intent.handoffHint } : {}),
      });
    }

    // 5. For list-devices, no serial needed
    if (intent.id === "list-devices") {
      let output;
      try {
        // ensureSdbServer() above already started the daemon.
        output = runSdb(sdbPath, "devices");
      } catch (error) {
        return formatError(
          command,
          "io_error",
          `sdb devices failed: ${error.message}`,
          null,
          startTime,
        );
      }
      const devices = parseDevices(output);
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        intent: "list-devices",
        command: "sdb devices",
        devices: devices.map((d) => ({ serial: d.serial, state: d.state })),
        device_count: devices.length,
        output: output.trim(),
      });
    }

    // 6. Resolve serial if not provided
    const serialResult = resolveSerial(sdbPath, serial);
    if (serialResult.errorCategory) {
      const failure = describeSerialFailure(serialResult, {
        noDeviceFix: "tizen-cli tizen-sdk device-manager",
      });
      return formatError(
        command,
        failure.category,
        failure.message,
        failure.suggestedFix,
        startTime,
        failure.detailLines,
      );
    }
    const resolvedSerial = serialResult.serial;

    // 7. Build the sdb command
    const cmdInfo = buildCommand(intent.id, resolvedSerial, request);
    if (!cmdInfo.command) {
      // cmdInfo.note says which value was missing — without it the caller only
      // learns that something failed, not what to supply.
      return formatError(
        command,
        "invalid_parameters",
        `Could not build sdb command for intent: ${intent.id}.` +
          (cmdInfo.note ? ` ${cmdInfo.note}` : ""),
        null,
        startTime,
      );
    }

    // 8. Gated intents — return command for confirmation, do NOT execute
    if (intent.gated) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        intent: intent.id,
        gated: true,
        command: `sdb ${cmdInfo.command}`,
        device_serial: resolvedSerial,
        message: `This is a gated action. Confirm before running: sdb ${cmdInfo.command}`,
        note: cmdInfo.note || null,
      });
    }

    // 9. Read-only intents — execute immediately
    //    For screenshot intent, try captureScreenshot() first (control panel
    //    removal + display stitching), then fall back to sdb commands.
    if (intent.id === "screenshot") {
      // 1st priority: captureScreenshot() — full pipeline with control panel removal
      try {
        const { captureScreenshot } = require("./screenshot");
        const screenshotResult = await captureScreenshot(resolvedSerial, null);
        if (screenshotResult.status === "success") {
          const envelope = new Envelope(command);
          envelope.startTime = startTime;
          return envelope.success({
            intent: intent.id,
            command: "captureScreenshot()",
            device_serial: resolvedSerial,
            output: screenshotResult.result.stdout || "Screenshot captured",
            output_path: screenshotResult.result.output_path,
            gated: false,
            fallbacks_tried: ["captureScreenshot()"],
            note: "Used captureScreenshot() — control panel auto-removed, display stitched",
          });
        }
      } catch (_screenshotError) {
        // captureScreenshot() failed — fall through to sdb fallbacks
      }

      // 2nd priority: sdb fallback chain (screencapture → capture_screen → xwd → /dev/fb0)
      const run = runWithFallbacks(sdbPath, cmdInfo.command, cmdInfo.fallbacks);

      if (run.succeeded) {
        const envelope = new Envelope(command);
        envelope.startTime = startTime;
        return envelope.success({
          intent: intent.id,
          command: run.usedCommand,
          device_serial: resolvedSerial,
          output: run.output.trim(),
          gated: false,
          fallbacks_tried: [
            "captureScreenshot() (failed)",
            ...run.triedCommands,
          ],
          note: cmdInfo.note || null,
        });
      } else {
        const errOutput = run.lastError.stderr || run.lastError.stdout || "";
        return formatError(
          command,
          "io_error",
          `All screenshot methods failed. Tried: captureScreenshot() → ${run.triedCommands.join(" → ")}. Last error: ${run.lastError.message}${errOutput ? ` — ${errOutput.trim()}` : ""}`,
          'Try host-side screenshot: Linux: import -window "$(xdotool search --name emulator | head -1)" sshot.png',
          startTime,
        );
      }
    }

    // Other intents with fallbacks (non-screenshot)
    if (cmdInfo.fallbacks && cmdInfo.fallbacks.length > 0) {
      const run = runWithFallbacks(
        sdbPath,
        cmdInfo.command,
        cmdInfo.fallbacks,
        cmdInfo.accept,
      );

      if (run.succeeded) {
        const envelope = new Envelope(command);
        envelope.startTime = startTime;
        return envelope.success({
          intent: intent.id,
          command: run.usedCommand,
          device_serial: resolvedSerial,
          output: run.output.trim(),
          gated: false,
          fallbacks_tried: run.triedCommands,
          note: cmdInfo.note || null,
        });
      } else {
        const errOutput = run.lastError.stderr || run.lastError.stdout || "";
        return formatError(
          command,
          "io_error",
          `All methods failed. Tried: ${run.triedCommands.join(" → ")}. Last error: ${run.lastError.message}${errOutput ? ` — ${errOutput.trim()}` : ""}`,
          null,
          startTime,
        );
      }
    }

    // Non-fallback read-only intents — execute immediately
    let output;
    try {
      output = runSdb(sdbPath, cmdInfo.command);
    } catch (error) {
      const errOutput = error.stderr || error.stdout || "";
      return formatError(
        command,
        "io_error",
        `sdb command failed: ${error.message}${errOutput ? ` — ${errOutput.trim()}` : ""}`,
        null,
        startTime,
      );
    }

    // For shell-command, parse the __SDB_EXIT: marker to detect non-zero
    // remote exit codes. sdb itself exits 0 even when the remote command
    // fails, so without this the envelope would report success.
    if (intent.id === "shell-command") {
      const exitMatch = output.match(/__SDB_EXIT:(-?\d+)\s*$/);
      if (exitMatch) {
        const remoteExitCode = parseInt(exitMatch[1], 10);
        // Strip the marker line from the output
        const cleanOutput = output.replace(/__SDB_EXIT:-?\d+\s*$/, "").trim();

        if (remoteExitCode !== 0) {
          return formatError(
            command,
            "io_error",
            `Remote shell command exited with code ${remoteExitCode}.${cleanOutput ? ` Output: ${cleanOutput}` : ""}`,
            null,
            startTime,
          );
        }

        const envelope = new Envelope(command);
        envelope.startTime = startTime;
        return envelope.success({
          intent: intent.id,
          command: `sdb ${cmdInfo.command}`,
          device_serial: resolvedSerial,
          output: cleanOutput,
          exit_code: 0,
          gated: false,
        });
      }
      // Marker not found — sdb may not support the echo trick (older platform)
      // Fall through to normal success path
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      intent: intent.id,
      command: `sdb ${cmdInfo.command}`,
      device_serial: resolvedSerial,
      output: output.trim(),
      gated: false,
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `sdb-helper failed: ${error.message}`,
      null,
      startTime,
    );
  }
}

// ─── RDS: argv-based sdb primitives ──────────────────────────────────────
//
// Everything above builds shell-string commands for execSync (runSdb), which
// is right for sdb-helper's own natural-language dispatch (it needs a real
// shell for the "; echo __SDB_EXIT:$?" trick). RDS pushes/reads paths that
// come from the filesystem, not from a fixed set of hand-quoted templates, so
// these mirror the extension's SdbExecutor instead: argv arrays through
// execFile (shell: false), never string-concatenated. See
// docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 5.

const DEFAULT_SDB_TIMEOUT_MS = 30000;
// Delta pushes can carry a full .NET publish output — the interactive-command
// timeout above would be too tight for that.
const PUSH_TIMEOUT_MS = 120000;

const APP_INSTALL_PATH_PATTERN = /Tizen Application Installation Path:\s*(.*)/;
const PUSH_DIR_RESULT_PATTERN =
  /(\d+)\s+file\(s\)\s+pushed\.\s*(\d+)\s+file\(s\)\s+skipped\./;

/**
 * Parse `sdb push`'s directory-push summary line.
 * @param {string} output
 * @returns {{pushed: number, skipped: number}|null} null if the line wasn't found
 */
function parsePushDirectoryResult(output) {
  const match = output.match(PUSH_DIR_RESULT_PATTERN);
  if (!match) return null;
  return { pushed: Number(match[1]), skipped: Number(match[2]) };
}

/**
 * Extract the device path from a "Tizen Application Installation Path: <path>"
 * response line (produced by both `0 getappinstallpath` and `pkgcmd -a`).
 * @param {string} output
 * @returns {string|null}
 */
function extractAppInstallPath(output) {
  const match = output.match(APP_INSTALL_PATH_PATTERN);
  const path = match && match[1] ? match[1].trim() : "";
  return path || null;
}

/**
 * Run `sdb -s <serial> <args...>` with no shell involved, and return stdout.
 * @param {string} serial
 * @param {string[]} args
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts] - `sdbPath` bypasses
 *   resolveSdbBinary() (injectable for tests — see rds-sdb.test.js)
 * @returns {Promise<string>}
 * @throws {Error} if the sdb binary can't be resolved, or the command fails
 */
async function runSdbArgs(serial, args, opts = {}) {
  let sdbPath = opts.sdbPath;
  if (!sdbPath) {
    const resolved = resolveSdbBinary();
    if (resolved.error) throw new Error(resolved.error);
    sdbPath = resolved.sdbPath;
  }
  try {
    const { stdout } = await execFileAsync(sdbPath, ["-s", serial, ...args], {
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: opts.timeoutMs || DEFAULT_SDB_TIMEOUT_MS,
    });
    return stdout;
  } catch (error) {
    const detail = (error.stderr || error.stdout || error.message || "")
      .toString()
      .trim();
    throw new Error(`sdb -s ${serial} ${args.join(" ")} failed: ${detail}`);
  }
}

/**
 * Run a command in the device's shell: `sdb -s <serial> shell <args...>`.
 * @param {string} serial
 * @param {string[]} args
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts]
 * @returns {Promise<string>} stdout
 */
async function execute(serial, args, opts = {}) {
  return runSdbArgs(serial, ["shell", ...args], opts);
}

/**
 * Push a local directory's *contents* (not the directory itself) into a
 * remote directory in one sdb sync session — the batched delta push.
 *
 * `sdb` merges into `remoteDir`: it overwrites matching paths, creates
 * missing subdirectories, and never deletes files already present there.
 *
 * @param {string} serial
 * @param {string} localDir - contents are pushed, not the directory itself
 * @param {string} remoteDir - destination directory on the device
 * @param {number} expectedFileCount - validated against sdb's own count
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts]
 * @returns {Promise<string>} stdout
 * @throws {Error} if sdb's summary line is missing, reports any skipped
 *   files, or the pushed count doesn't match `expectedFileCount`
 */
async function pushDirectory(
  serial,
  localDir,
  remoteDir,
  expectedFileCount,
  opts = {},
) {
  // "localDir/." so sdb merges contents into remoteDir rather than creating
  // a nested directory named after localDir.
  const output = await runSdbArgs(
    serial,
    ["push", `${localDir}/.`, remoteDir],
    {
      timeoutMs: PUSH_TIMEOUT_MS,
      ...opts,
    },
  );
  const result = parsePushDirectoryResult(output);
  if (!result) {
    throw new Error(`unexpected sdb push output: ${output.trim()}`);
  }
  if (result.skipped > 0) {
    throw new Error(
      `${result.skipped} file(s) skipped during directory push to ${remoteDir}`,
    );
  }
  if (result.pushed !== expectedFileCount) {
    throw new Error(
      `file count mismatch: expected ${expectedFileCount}, got ${result.pushed} pushed`,
    );
  }
  return output;
}

/**
 * Toggle root shell access: `sdb -s <serial> root on|off`.
 *
 * Needed around delta pushes/deletes into app-private device paths that a
 * non-root sdb session can't reach.
 *
 * @param {string} serial
 * @param {"on"|"off"} onOrOff
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts]
 * @returns {Promise<string>} stdout
 */
async function root(serial, onOrOff, opts = {}) {
  if (onOrOff !== "on" && onOrOff !== "off") {
    throw new Error(
      `root: onOrOff must be "on" or "off", got ${JSON.stringify(onOrOff)}`,
    );
  }
  return runSdbArgs(serial, ["root", onOrOff], opts);
}

/** Marker echoed by the device when a `test -d` probe succeeds. */
const DEVICE_DIR_OK_MARKER = "__RDS_DIR_OK__";

/**
 * Whether a directory exists on the device. The `&&`/`echo` are joined into
 * one command line by `sdb shell` and interpreted by the device's `/bin/sh`;
 * the host spawns sdb with an argv array, so no host shell is involved.
 *
 * @param {string} serial
 * @param {string} devicePath - absolute device path; must be a literal
 *   constant (this helper does not quote it)
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts]
 * @returns {Promise<boolean>} false on any sdb failure as well
 */
async function deviceDirExists(serial, devicePath, opts = {}) {
  try {
    const output = await execute(
      serial,
      ["test", "-d", devicePath, "&&", "echo", DEVICE_DIR_OK_MARKER],
      opts,
    );
    return output.includes(DEVICE_DIR_OK_MARKER);
  } catch {
    return false;
  }
}

/**
 * Resolve the application installation base path on the device.
 *
 * Multi-tier fallback, tried in order, matching the extension's SdbExecutor:
 *   1. `0 getappinstallpath` (secure protocol command)
 *   2. `/usr/bin/pkgcmd -a` (standard command)
 *   3. `/home/owner/apps_rw` existence check (Tizen 3.0+)
 *   4. `/opt/usr/apps` existence check (Tizen 2.x)
 *
 * @param {string} serial
 * @param {{timeoutMs?: number, sdbPath?: string}} [opts]
 * @returns {Promise<string>}
 * @throws {Error} if none of the four tiers resolve a path
 */
async function getAppInstallPath(serial, opts = {}) {
  try {
    const output = await execute(serial, ["0", "getappinstallpath"], opts);
    const path = extractAppInstallPath(output);
    if (path) return path;
  } catch {
    // fall through to the next tier
  }

  try {
    const output = await execute(serial, ["/usr/bin/pkgcmd", "-a"], opts);
    const path = extractAppInstallPath(output);
    if (path) return path;
  } catch {
    // fall through to the next tier
  }

  // Tiers 3/4: `sdb shell` exits 0 regardless of the remote command's status,
  // so a bare `test -d` can never fail from the host's point of view. Chain an
  // echo on the device instead and look for the marker in stdout (same trick
  // as the `; echo __SDB_EXIT:$?` probe used by the shell intents above).
  if (await deviceDirExists(serial, "/home/owner/apps_rw", opts)) {
    return "/home/owner/apps_rw";
  }
  if (await deviceDirExists(serial, "/opt/usr/apps", opts)) {
    return "/opt/usr/apps";
  }

  throw new Error(
    "Cannot determine app install path: no device response and no known install directory found",
  );
}

module.exports = {
  runSdbCommand,
  // Exported for testing (resolveSdb/parseDevices re-exported from ./sdb
  // for backward compatibility)
  matchIntent,
  parseDevices,
  buildCommand,
  resolveSdb,
  runWithFallbacks,
  // RDS argv-based sdb primitives (Part 5). There is deliberately no
  // single-file push: RDS batches every delta into one pushDirectory() call.
  execute,
  pushDirectory,
  root,
  getAppInstallPath,
  // Exported for testing
  parsePushDirectoryResult,
  extractAppInstallPath,
};
