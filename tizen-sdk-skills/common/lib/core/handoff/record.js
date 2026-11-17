// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Automatic recording: after a runner prints its result, runCli() calls
 * applyHandoff() and — when the call belongs to a Tizen project — one line goes
 * into that project's LOG.md and a short block into the topic file (BUILDS /
 * DEVICES / DEBUG / ENVIRONMENT). The project's notes folder is created on the
 * first recorded call; there is no setup step.
 *
 * Why here: every skill's runner passes through runCli(), so one hook records
 * all of them. No agent has to remember to write, which is exactly the part
 * agents forget; they only have to READ.
 *
 * Hard rules:
 *   - it can never break a runner: everything is wrapped, nothing is printed,
 *     and a failure to write is swallowed;
 *   - it only sees the envelope AFTER secret masking, and for certificate
 *     commands it records the action and status only, never result data;
 *   - it never writes into the project (the notes live under
 *     ~/.tizen-sdk-skills/handoff/, see notes.js), and only for a folder that
 *     isTizenProjectDir() accepts;
 *   - TIZEN_HANDOFF=0 turns it off, =existing stops it creating folders.
 */

const path = require("path");
const notes = require("./notes");

/** Longest command line / message kept in a block. */
const MAX_COMMAND = 300;
const MAX_MESSAGE = 400;
const MAX_VALUE = 160;
const MAX_WARNINGS = 3;
const MAX_ARTIFACTS = 3;

/** Scalar result fields worth keeping, in the order they are listed. */
const SUMMARY_KEYS = [
  "package_path",
  "device_serial",
  "serial",
  "device_id",
  "app_id",
  "deploy_type",
  "installation_status",
  "app_launched",
  "app_running",
  "project_path",
  "template",
  "name",
  "vm_name",
  "vm",
  "platform",
  "profile",
  "profile_name",
  "sdk_path",
  "version",
  "endpoint",
  "cdp_endpoint",
  "port",
  "pid",
  "log_file",
  "report_file",
  "output_file",
  "state",
  "job_id",
];

const BUILDS = "BUILDS.md";
const DEVICES = "DEVICES.md";
const DEBUG = "DEBUG.md";
const ENVIRONMENT = "ENVIRONMENT.md";

/** First argv token that is one of `actions` (flag values never match). */
function firstOf(argv, actions) {
  return argv.find((token) => actions.includes(token)) || null;
}

const EMULATOR_ACTIONS = [
  "create",
  "delete",
  "launch",
  "modify",
  "reset",
  "create-image",
  "fix-homescreen",
];
const REMOTE_DEVICE_ACTIONS = [
  "connect",
  "disconnect",
  "add",
  "edit",
  "remove",
  "scan",
];
const DLOG_ACTIONS = [
  "start",
  "stop",
  "check",
  "status",
  "app-launch",
  "app-terminate",
  "dlog-collect",
  "stop-collect",
  "error-analyze",
  "app-log",
  "search",
  "device-profile",
  "investigate",
  "probe",
  "snapshot",
  "timeline",
  "kernel",
  "log-dump",
  "log-clear",
];
/** Certificate actions that change something. Everything else only reads. */
const CERT_MUTATING = new Set([
  "generate-author",
  "generate-samsung-author",
  "generate-samsung-distributor",
  "create-profile",
  "create-samsung-profile",
  "import-certificate",
  "import-samsung-certificate",
  "import-duids",
  "set-active-profile",
  "remove-profile",
  "set-distributor2",
  "samsung-login",
  "cancel-samsung-cert",
  "acquire-duid",
  "acquire-duids-all",
]);

/**
 * Which file a runner call belongs in — or null (not recorded). Read-only
 * calls (list, check, status) are skipped on purpose: they would bury the
 * entries that matter.
 *
 * @param {{runner: string, label: string, argv: string[]}} call
 * @returns {{file: string, action: string|null, detail: boolean}|null}
 */
function classify({ runner, label, argv }) {
  const rule = (file, action = null, detail = true) => ({
    file,
    action,
    detail,
  });
  switch (runner) {
    case "project-manager": {
      const action = firstOf(argv, [
        "build",
        "create",
        "import-wgt",
        "delete",
        "install",
      ]);
      if (!action) return null; // list-templates, or unknown
      return rule(action === "install" ? DEVICES : BUILDS, action);
    }
    // internal-only:begin
    case "vd-build":
      return rule(BUILDS);
    // internal-only:end
    case "emulator-manager": {
      const action = firstOf(argv, EMULATOR_ACTIONS);
      return action ? rule(DEVICES, action) : null;
    }
    case "device-manager":
      // `stop` and `--action stop` / `--action=stop` all mean the same thing
      return argv.includes("stop") || argv.includes("--action=stop")
        ? rule(DEVICES, "stop")
        : null;
    case "sdb-helper":
    case "file-transfer":
    case "screenshot":
      return rule(DEVICES, firstOf(argv, ["push", "pull"]));
    case "remote-device": {
      const action = firstOf(argv, REMOTE_DEVICE_ACTIONS);
      return action ? rule(DEVICES, action) : null;
    }
    case "dlog-analyzer": {
      const action = firstOf(argv, DLOG_ACTIONS);
      if (!action || action === "check" || action === "status") return null;
      if (["probe", "snapshot"].includes(action) && argv.includes("list")) {
        return null;
      }
      return rule(DEBUG, action);
    }
    case "gdb-debug":
    case "dotnet-debug":
    case "webapp-debug":
    case "playwright-test":
      return rule(DEBUG);
    case "cert-manager": {
      const action = String(label || "")
        .split(" ")
        .pop();
      // detail:false — never copy result data out of a certificate command
      return CERT_MUTATING.has(action)
        ? rule(ENVIRONMENT, action, false)
        : null;
    }
    case "sdk-init":
    case "sdk-install":
    case "sdk-install-custom-repo":
    case "tv-sdk-install":
    case "tv-sdk-install-from-zip":
    case "update-package":
    case "platform-install":
    case "download-emulator-package":
    case "download-mobile-platform":
    case "install-rootstrap":
    case "dotnet-setup":
      return rule(ENVIRONMENT);
    default:
      // check-node, check-disk-space, sdk-repo-info, validate-repo-url, job-cli
      // and anything new: not recorded until someone adds it here.
      return null;
  }
}

/** One line, at most `max` characters. Text is otherwise kept exactly as given. */
function oneLine(text, max) {
  const s = String(text)
    .replace(/\s*\r?\n\s*/g, " / ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function formatValue(value) {
  return oneLine(String(value), MAX_VALUE);
}

/** [["key", "value"], …] — the facts worth keeping from a success result. */
function resultFacts(result) {
  const facts = [];
  if (!result || typeof result !== "object") return facts;
  if (Array.isArray(result.artifacts)) {
    for (const a of result.artifacts.slice(0, MAX_ARTIFACTS)) {
      if (!a || !a.path) continue;
      const extra = [a.format, a.size_bytes != null && `${a.size_bytes} B`]
        .filter(Boolean)
        .join(", ");
      facts.push([
        "package",
        `${formatValue(a.path)}${extra ? ` (${extra})` : ""}`,
      ]);
    }
  }
  for (const key of SUMMARY_KEYS) {
    const v = scalar(result[key]);
    if (v !== null) facts.push([key, formatValue(v)]);
  }
  return facts;
}

function firstError(envelope) {
  const e = Array.isArray(envelope.errors) ? envelope.errors[0] : null;
  if (!e) return null;
  return {
    code: e.error_code || e.code || null,
    message: oneLine(e.message || "", MAX_MESSAGE),
  };
}

/** Display name: "build-project", "emulator launch", "certificate-manager create-profile". */
function displayName(label, action) {
  const base = String(label || "").replace(/^tizen-sdk /, "") || "runner";
  // "build-project" already says build; "emulator" does not say launch.
  return action && !base.includes(action) ? `${base} ${action}` : base;
}

function seconds(ms) {
  return typeof ms === "number" ? `${(ms / 1000).toFixed(1)}` : "-";
}

/**
 * `- ts | host | name | status | secs | summary`. Pipes inside the summary would
 * look like extra columns, so only here they become "/"; the topic-file blocks
 * keep a command line exactly as it was run.
 */
function formatLogLine({ ts, host, name, status, durationMs, summary }) {
  const cell = String(summary).replace(/\|/g, "/");
  return `- ${ts} | ${host} | ${name} | ${status} | ${seconds(durationMs)}s | ${cell}\n`;
}

/** The longer block in the topic file. */
function formatBlock({
  ts,
  host,
  name,
  status,
  userCommand,
  facts,
  warnings,
  error,
}) {
  const lines = [`### ${ts} — ${host} — ${name} — ${status}`];
  if (userCommand) {
    const cmd = oneLine(userCommand, MAX_COMMAND).replace(/`/g, "'");
    lines.push(`- command: \`${cmd}\``);
  }
  for (const [key, value] of facts) lines.push(`- ${key}: ${value}`);
  for (const w of warnings) lines.push(`- warning: ${w}`);
  if (error) {
    lines.push(
      `- error${error.code ? ` [${error.code}]` : ""}: ${error.message}`,
    );
  }
  return `${lines.join("\n")}\n\n`;
}

/** The one-line summary for LOG.md. */
function summaryLine(status, facts, error) {
  if (error) return error.message || "(no message)";
  return (
    facts
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "-"
  );
}

/**
 * Called by runCli() with the envelope it is about to print. Records it when
 * the project opted in, and returns nothing; the only change to `printable` is
 * one extra warning when the last entry in this project came from a DIFFERENT
 * agent — the moment someone has switched.
 *
 * @param {object} printable - the (masked) envelope about to be printed
 * @param {{label: string, argv: string[], script: string,
 *   userCommand: string, mask: boolean}} ctx
 */
function applyHandoff(printable, ctx) {
  try {
    if (!notes.enabled()) return;
    if (!printable || typeof printable !== "object") return;
    if (Array.isArray(printable)) return;
    // A relayed envelope (job-cli returning a finished background job) already
    // carries user_command: the detached child recorded it when it finished.
    if ("user_command" in printable) return;
    // A runner whose whole purpose is returning a secret.
    if (ctx.mask === false) return;

    const runner = path.basename(ctx.script || "").replace(/-cli\.js$/, "");
    const rule = classify({ runner, label: ctx.label, argv: ctx.argv });
    if (!rule) return;
    const dir = notes.ensure(notes.locate({ argv: ctx.argv }));
    if (!dir) return;

    const host = notes.hostName();
    const previous = notes.lastEntry(dir);
    const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const name = displayName(ctx.label, rule.action);
    const status = printable.status || "unknown";
    const failed = status !== "success";
    const error = failed ? firstError(printable) : null;
    const facts = rule.detail && !failed ? resultFacts(printable.result) : [];
    const warnings = rule.detail
      ? (Array.isArray(printable.warnings) ? printable.warnings : [])
          .filter((w) => typeof w === "string")
          .slice(0, MAX_WARNINGS)
          .map((w) => oneLine(w, 200))
      : [];

    notes.append(
      dir,
      "LOG.md",
      formatLogLine({
        ts,
        host,
        name,
        status,
        durationMs: printable.duration_ms,
        summary: oneLine(summaryLine(status, facts, error), MAX_MESSAGE),
      }),
    );
    notes.append(
      dir,
      rule.file,
      formatBlock({
        ts,
        host,
        name,
        status,
        userCommand: ctx.userCommand,
        facts,
        warnings,
        error,
      }),
    );

    if (previous && previous.host !== host) {
      const message =
        `Handoff notes: ${previous.host} last worked in this project at ${previous.ts}. ` +
        `Read ${path.join(dir, "STATE.md")} (and ${rule.file}) before you continue.`;
      printable.warnings = [
        ...(Array.isArray(printable.warnings) ? printable.warnings : []),
        message,
      ];
    }
  } catch (_e) {
    /* the notes must never break a runner */
  }
}

module.exports = {
  classify,
  oneLine,
  resultFacts,
  displayName,
  formatLogLine,
  formatBlock,
  applyHandoff,
};
