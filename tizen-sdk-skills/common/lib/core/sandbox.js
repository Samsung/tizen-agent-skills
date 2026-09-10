// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Codex CLI sandbox awareness.
 *
 * Codex's default `workspace-write` sandbox runs every exec call:
 *   Linux    bubblewrap with --unshare-pid (own PID namespace) and, with
 *            network disabled, --unshare-net; filesystem read-only except the
 *            workspace and /tmp.
 *   macOS    seatbelt (CODEX_SANDBOX=seatbelt): network + writes restricted.
 *   Windows  a write-restricted token and an offline sandbox user.
 *
 * Inside it the Tizen tools cannot work: sdb needs a localhost TCP socket,
 * em-cli/tz write under <sdk> and <sdk>-data, certificate actions write
 * profiles.xml and keystore/*.pwd, the Samsung CA and OAuth callback need
 * sockets — and on Linux a detached job (`--background`) dies the moment the
 * exec call ends because its PID namespace is torn down (issue #81: "exited
 * without writing its result" within milliseconds). Codex lets the agent
 * re-run the same command "with escalated permissions" (outside the sandbox);
 * this module detects the sandbox and phrases that re-run as a suggested_fix.
 *
 * Detection: CODEX_SANDBOX_NETWORK_DISABLED (set only inside the sandbox when
 * network is off — the default) and CODEX_SANDBOX (macOS) mark "sandboxed";
 * CODEX_THREAD_ID / CODEX_VERSION survive an escalated run and only mark the
 * host. TIZEN_SANDBOX=on|off overrides both (tests; hosts running with
 * `network_access = true`, where the marker is absent but bwrap still applies).
 */

const { HOST_MARKERS } = require("./plugin-cache");

/** Escalation marker on suggested_fix — kept by Envelope._normalizeError. */
const ESCALATE_KEY = "escalate";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [platform]
 * @returns {{host: "codex"|null, sandboxed: boolean, escalated: boolean,
 *   network_disabled: boolean, pid_namespace: boolean,
 *   kind: "bwrap"|"seatbelt"|"windows"|null}}
 */
function detectSandbox(env = process.env, platform = process.platform) {
  const host = HOST_MARKERS[".codex"].some((name) => env[name])
    ? "codex"
    : null;
  const networkDisabled = !!env.CODEX_SANDBOX_NETWORK_DISABLED;
  // `marked`: what the environment says. `sandboxed`: what the runners act on
  // (TIZEN_SANDBOX=off keeps the markers' truth in `marked` so a job started
  // under the override is still recorded as sandboxed for its post-mortem).
  const marked = networkDisabled || !!env.CODEX_SANDBOX;
  let sandboxed = marked;
  const override = String(env.TIZEN_SANDBOX || "")
    .trim()
    .toLowerCase();
  if (override === "off" || override === "0" || override === "false") {
    sandboxed = false;
  } else if (override === "on" || override === "1" || override === "true") {
    sandboxed = true;
  }
  const inSandbox = sandboxed || marked;
  let kind = null;
  if (inSandbox) {
    if (platform === "linux") kind = "bwrap";
    else if (platform === "darwin") kind = "seatbelt";
    else if (platform === "win32") kind = "windows";
    else kind = "bwrap";
  }
  return {
    host: host || (inSandbox ? "codex" : null),
    sandboxed,
    marked,
    escalated: !!host && !inSandbox,
    network_disabled: networkDisabled,
    pid_namespace: inSandbox && platform === "linux",
    kind,
  };
}

/**
 * One fixed sentence describing what the sandbox blocks and what to do.
 * @param {ReturnType<typeof detectSandbox>} sb
 */
function sandboxWarning(sb) {
  return (
    `Running inside Codex's sandbox (${sb.kind}): TCP sockets (sdb, em-cli, Samsung CA, RWI/CDP), ` +
    "writes outside the workspace (<sdk>, <sdk>-data profiles.xml/.pwd, ~/.tizen*) and detached " +
    "jobs are blocked there. If this is why the command failed, re-run the SAME command with " +
    "escalated permissions (outside the sandbox)."
  );
}

/**
 * suggested_fix that re-runs the caller's own command line outside the sandbox.
 * `escalate: true` tells the agent this is an approval request, not a new command.
 * @param {string} userCommand
 */
function escalationFix(userCommand) {
  return {
    command: userCommand,
    auto_fixable: false,
    [ESCALATE_KEY]: true,
  };
}

/**
 * Error text that typically means "the sandbox blocked it": permission /
 * read-only filesystem errors and refused or unresolvable connections.
 */
const SANDBOX_ERROR_PATTERN =
  /\b(EACCES|EPERM|EROFS|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND)\b|Permission denied|Access is denied|Read-only file system|Operation not permitted|connection refused|cannot connect to (the )?sdb|could not connect|failed to connect|access[- ]denied/i;

/**
 * Symptoms the runners' own diagnostics report when a tool was blocked without
 * leaving an OS error token behind: em-cli (a JVM) that exited without printing
 * anything or hit the wall-clock cap (lib/core/emulator.js emcliExitHint, the
 * emulator scripts' report_emcli_failure), and a template sync that could not
 * write into the SDK (create-project-app.sh report_empty_type). Issue #82: a
 * sandboxed em-cli on Linux and Windows produced exactly this, and the envelope
 * carried no escalation fix because SANDBOX_ERROR_PATTERN saw nothing to match.
 */
const SANDBOX_SYMPTOM_PATTERN =
  /without printing anything|produced no output at all|did not finish within \d+ ?s|hung JVM|blocked before it could run|not writable from this shell/i;

/**
 * First sandbox-looking token in an envelope's errors (message + details), or null.
 * OS error tokens win over the softer symptom phrases so the sandbox_blocked
 * message names the most concrete evidence available.
 * @param {object} envelope
 * @returns {string|null}
 */
function sandboxBlockToken(envelope) {
  if (!envelope || !Array.isArray(envelope.errors)) return null;
  const texts = [];
  for (const err of envelope.errors) {
    if (err && typeof err.message === "string") texts.push(err.message);
    if (err && Array.isArray(err.details)) {
      texts.push(...err.details.filter((d) => typeof d === "string"));
    }
  }
  for (const pattern of [SANDBOX_ERROR_PATTERN, SANDBOX_SYMPTOM_PATTERN]) {
    for (const text of texts) {
      const m = text.match(pattern);
      if (m) return m[0];
    }
  }
  return null;
}

function looksSandboxBlocked(envelope) {
  return sandboxBlockToken(envelope) !== null;
}

/**
 * Decorate a runner's FAILURE envelope produced inside the sandbox:
 *   - always append the sandbox warning to `warnings`;
 *   - when the error text looks like a permission/network block, append an
 *     ADDITIONAL errors[] entry (sandbox_blocked) whose suggested_fix re-runs
 *     `userCommand` with escalated permissions. errors[0] is never touched.
 * Relayed envelopes (already carrying user_command — job-cli returning a
 * finished job's result verbatim) and success envelopes are returned as-is.
 *
 * @param {object} envelope
 * @param {ReturnType<typeof detectSandbox>} sb
 * @param {string} userCommand
 * @returns {object} the same envelope object, possibly extended
 */
function decorateSandboxFailure(envelope, sb, userCommand) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return envelope;
  }
  if (!sb || !sb.sandboxed) return envelope;
  if (envelope.status === "success") return envelope;
  if ("user_command" in envelope) return envelope;

  const warning = sandboxWarning(sb);
  const warnings = Array.isArray(envelope.warnings) ? envelope.warnings : [];
  if (!warnings.includes(warning)) envelope.warnings = [...warnings, warning];

  const token = sandboxBlockToken(envelope);
  const alreadyFlagged = (envelope.errors || []).some(
    (e) => e && e.error_category === "sandbox_blocked",
  );
  if (token && !alreadyFlagged) {
    // Lazy require: response-formatter depends on the envelope layer only, but
    // keep this module free of a top-level import cycle with cli-runner users.
    const { ERROR_CODES } = require("../envelope/envelope");
    envelope.errors = [
      ...(envelope.errors || []),
      {
        ...ERROR_CODES.SANDBOX_BLOCKED,
        message:
          `Likely blocked by Codex's ${sb.kind} sandbox (matched "${token}"). ` +
          "Re-run the same command with escalated permissions.",
        suggested_fix: escalationFix(userCommand),
      },
    ];
  }
  return envelope;
}

module.exports = {
  detectSandbox,
  sandboxWarning,
  escalationFix,
  SANDBOX_ERROR_PATTERN,
  SANDBOX_SYMPTOM_PATTERN,
  sandboxBlockToken,
  looksSandboxBlocked,
  decorateSandboxFailure,
  ESCALATE_KEY,
};
