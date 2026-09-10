// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Common CLI runner execution function and argument parser
 *
 * Centralizes the pattern shared by all *-cli.js files:
 *   1. Execute async function → obtain Standard JSON Envelope
 *   2. Output envelope to stdout
 *   3. Return exit code: status === 'success' → 0, otherwise → 1
 *   4. On exception, output error envelope to stderr and exit 1
 *
 * cli-runner OWNS `--background`: requiring this module removes the flag from
 * process.argv (every runner requires it before reading argv), records the
 * request, and runCli() then re-spawns the runner detached and prints a job
 * receipt instead of running fn() — see lib/core/jobs.js. Option-style,
 * positional and hand-rolled parsers therefore all support it with no wiring
 * of their own. Only a `--background` before a bare `--` counts; the form
 * `--background=true` is not recognised.
 */

const path = require("path");
const { buildUserCommand } = require("../envelope/user-command");
const { maskEnvelopeSecrets } = require("../envelope/mask-secrets");
const {
  stripBackgroundFlag,
  spawnDetached,
  markJobDone,
  JOB_ID_ENV,
} = require("../core/jobs");
const {
  detectSandbox,
  escalationFix,
  decorateSandboxFailure,
} = require("../core/sandbox");
const { formatError } = require("../envelope/response-formatter");

/**
 * Set by parseArgsOrExit when the caller passed `--background`: the argv to
 * re-run detached (flag removed). runCli then spawns the job instead of
 * running fn() — see lib/core/jobs.js for why (Codex CLI's 30 s tool window).
 */
let backgroundArgv = null;

/**
 * The command line that started THIS runner, e.g.
 *   node emulator-manager-cli.js launch --vm-name my-vm
 *
 * Skills invoke these runners through `node "$CLI" <action>` where $CLI is a
 * machine- and version-specific absolute path
 * (~/.claude/plugins/cache/.../1.0.0/lib/cli/...), so only the basename is
 * rendered — the full path is noise, not something a reader would re-type.
 *
 * Computed once at require time: argv does not change during a run, and every
 * runner is a one-shot process.
 */
const USER_COMMAND = buildUserCommand(
  process.argv.slice(2),
  `node ${path.basename(process.argv[1] || "cli.js")}`,
);

// Take `--background` out of process.argv NOW — before the requiring CLI has
// read a single argument — so a positional or hand-rolled parser never sees
// it as data (device-manager read it as a timeout, file-transfer as a device
// serial, dotnet-setup as a workload version). USER_COMMAND above is computed
// from the original argv on purpose: the receipt should show what was typed.
{
  const stripped = stripBackgroundFlag(process.argv.slice(2));
  if (stripped.background) {
    backgroundArgv = stripped.argv;
    process.argv.splice(2, process.argv.length - 2, ...stripped.argv);
  }
}

/** True when this process was started with `--background` (before runCli ran). */
function backgroundRequested() {
  return backgroundArgv !== null;
}

/**
 * Attach `user_command` to an envelope without disturbing its key order:
 * it belongs next to `command` (the internal label), not after duration_ms.
 */
function withUserCommand(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return envelope;
  }
  // An envelope that already carries user_command is another runner's result
  // being relayed verbatim (job-cli.js returning a finished --background job):
  // keep the runner's own command line, not this relay's.
  const relayed = "user_command" in envelope;
  const out = {};
  for (const [key, value] of Object.entries(envelope)) {
    out[key] = value;
    if (key === "command" && !relayed) out.user_command = USER_COMMAND;
  }
  // Envelopes that carry no `command` key still get the field, at the end.
  if (!("user_command" in out)) out.user_command = USER_COMMAND;
  return out;
}

/**
 * Custom error class for usage/argument-parsing errors.
 *
 * Using a real Error subclass (instead of a plain { __usage: true, message }
 * object) ensures:
 *   - instanceof Error checks pass
 *   - Stack traces are preserved for debugging
 *   - The __usage flag lets callers distinguish usage errors from real bugs
 */
class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.__usage = true;
  }
}

/**
 * Parse process.argv into { options, positional }.
 *
 * Supports:
 *   --flag value        (space-separated)
 *   --flag=value        (equals-separated)
 *   --boolean-flag      (boolean, no value)
 *   --                  (everything after is positional)
 *   bare tokens         (positional)
 *
 * Values starting with -- are accepted as long as they are not a known flag
 * in optionFlags or booleanFlags. This avoids false "missing value" errors
 * when a path or name legitimately starts with --.
 *
 * Unknown --options consistently throw UsageError regardless of whether
 * they use space-separated or equals-separated syntax.
 *
 * @param {string[]} args               - process.argv.slice(2)
 * @param {Object<string, string>} optionFlags  - { "--flag": "propName" }
 * @param {Object<string, string>} booleanFlags  - { "--flag": "propName" }
 * @returns {{ options: Object, positional: string[] }}
 */
function parseArgs(args, optionFlags, booleanFlags = {}) {
  const options = {};
  const positional = [];
  let onlyPositional = false;

  for (let i = 0; i < args.length; i++) {
    const token = args[i];

    // After `--`, everything is positional
    if (onlyPositional) {
      positional.push(token);
      continue;
    }

    // `--` separator: switch to positional-only mode
    if (token === "--") {
      onlyPositional = true;
      continue;
    }

    // Handle --key=value syntax
    if (token.startsWith("--") && token.includes("=")) {
      const eqIdx = token.indexOf("=");
      const flagPart = token.slice(0, eqIdx);
      const valuePart = token.slice(eqIdx + 1);
      const key = optionFlags[flagPart];
      const booleanKey = booleanFlags[flagPart];
      if (booleanKey) {
        // --boolean-flag=true|false
        options[booleanKey] = valuePart !== "false" && valuePart !== "0";
      } else if (key) {
        options[key] = valuePart;
      } else {
        // Unknown option in --key=value form — throw consistently with
        // the space-separated path (not silently push to positional).
        throw new UsageError(`Unknown option: ${flagPart}`);
      }
      continue;
    }

    const key = optionFlags[token];
    const booleanKey = booleanFlags[token];

    if (booleanKey) {
      options[booleanKey] = true;
    } else if (key) {
      const value = args[i + 1];
      if (value === undefined) {
        // No more tokens — missing value
        throw new UsageError(`Option ${token} requires a value`);
      }
      // Accept the value even if it starts with --, as long as it's not
      // a known flag. This allows paths/names like "--myApp".
      const isKnownFlag =
        optionFlags[value] !== undefined || booleanFlags[value] !== undefined;
      if (isKnownFlag) {
        throw new UsageError(`Option ${token} requires a value`);
      }
      options[key] = value;
      i++;
    } else if (token.startsWith("--")) {
      // Unknown option — throw to catch typos early.
      throw new UsageError(`Unknown option: ${token}`);
    } else {
      positional.push(token);
    }
  }

  return { options, positional };
}

/**
 * Print a usage-error envelope to stderr and exit 1.
 *
 * The shape (status "error", errors[].code) is the CLI-level usage-error
 * contract shared by every option-style *-cli.js runner. Domain errors keep
 * going through runCli/the Standard JSON Envelope on stdout.
 *
 * @param {string} command - Command name for the envelope (e.g., 'tizen-sdk sdb-helper')
 * @param {string} usage   - Usage string appended to the message
 * @param {string} message - What was wrong with the arguments
 */
function exitWithUsageError(command, usage, message) {
  console.error(
    JSON.stringify(
      withUserCommand({
        command,
        status: "error",
        errors: [
          { code: "invalid_parameters", message: `${message} — ${usage}` },
        ],
      }),
      null,
      2,
    ),
  );
  // A detached child must still close out its job, or job-cli would report
  // it as crashed instead of surfacing this usage envelope from its stderr.
  markJobDone(process.env[JOB_ID_ENV], 1);
  process.exit(1);
}

/**
 * parseArgs plus the exit-on-usage-error handling every option-style CLI
 * repeats: a UsageError becomes an invalid_parameters envelope on stderr and
 * exit 1; any other exception propagates as a real bug.
 *
 * @returns {{ options: Object, positional: string[] }}
 */
function parseArgsOrExit(command, usage, args, optionFlags, booleanFlags = {}) {
  // `--background` is already gone from process.argv (module load, above).
  try {
    return parseArgs(args, optionFlags, booleanFlags);
  } catch (e) {
    if (e instanceof UsageError) {
      exitWithUsageError(command, usage, e.message);
    }
    throw e;
  }
}

/**
 * @param {string} command - Command name for error envelope (e.g., 'tizen-sdk sdk-install')
 * @param {() => Promise<object>} fn - Async function that returns an envelope
 * @param {{maskSecrets?: boolean}} [opts] - maskSecrets: false skips secret
 *   masking, for commands whose entire purpose is returning a secret
 *   (e.g. samsung-reveal-password)
 */
function runCli(command, fn, opts = {}) {
  const mask = opts.maskSecrets !== false;

  // When this process is a detached job, record completion AFTER the envelope
  // is flushed, so job-cli never sees "done" with an unfinished stdout file.
  const finish = (code) => {
    markJobDone(process.env[JOB_ID_ENV], code);
    process.exit(code);
  };

  // `--background`: do not run fn() here. Re-spawn this runner detached (flag
  // removed) and print the job receipt instead. The child prints the real
  // envelope into the job's stdout file; job-cli.js returns it verbatim.
  if (backgroundArgv) {
    const argv = backgroundArgv;
    backgroundArgv = null;
    // Inside Codex's sandbox a detached job is useless: on Linux it is killed
    // the moment this exec call ends (bubblewrap PID namespace — issue #81), and
    // everywhere it inherits the sandbox (no sockets, no <sdk>/<sdk>-data
    // writes) and fails late. Refuse up front and hand the agent the exact
    // same command line to re-run with escalated permissions.
    // TIZEN_SANDBOX=off restores the old warn-only behaviour.
    const sb = detectSandbox();
    if (sb.sandboxed) {
      const why = sb.pid_namespace
        ? "be killed when this exec call ends (Linux PID namespace)"
        : "inherit the sandbox (no TCP sockets, no writes under <sdk>/<sdk>-data)";
      const refused = formatError(
        command,
        "sandbox_blocked",
        `--background cannot run inside Codex's ${sb.kind} sandbox: the detached job would ${why}. ` +
          "Nothing was started. Re-run this exact command with escalated permissions (outside the " +
          "sandbox); set TIZEN_SANDBOX=off to override.",
        escalationFix(USER_COMMAND),
        Date.now(),
      );
      process.stdout.write(
        JSON.stringify(withUserCommand(refused), null, 2) + "\n",
        () => process.exit(1),
      );
      return;
    }
    const receipt = spawnDetached(
      process.argv[1],
      argv,
      command,
      buildUserCommand(
        argv,
        `node ${path.basename(process.argv[1] || "cli.js")}`,
      ),
    );
    process.stdout.write(
      JSON.stringify(withUserCommand(receipt), null, 2) + "\n",
      () => process.exit(receipt.status === "success" ? 0 : 1),
    );
    return;
  }

  // Failures produced inside Codex's sandbox get the sandbox warning and, when
  // the error text looks like a permission/network block, an extra
  // sandbox_blocked error whose suggested_fix re-runs THIS command line with
  // escalated permissions. Relayed envelopes (job-cli returning a finished
  // job's result, already carrying user_command) are left alone.
  const sandbox = detectSandbox();

  (async () => {
    try {
      const result = decorateSandboxFailure(await fn(), sandbox, USER_COMMAND);
      // Exit only after the write is flushed — on Windows a piped stdout is
      // asynchronous and process.exit() would truncate large envelopes
      process.stdout.write(
        JSON.stringify(
          withUserCommand(mask ? maskEnvelopeSecrets(result) : result),
          null,
          2,
        ) + "\n",
        () => finish(result && result.status === "success" ? 0 : 1),
      );
    } catch (error) {
      process.stderr.write(
        JSON.stringify(
          withUserCommand(
            decorateSandboxFailure(
              {
                command,
                status: "error",
                errors: [{ code: "execution_error", message: error.message }],
              },
              sandbox,
              USER_COMMAND,
            ),
          ),
          null,
          2,
        ) + "\n",
        () => finish(1),
      );
    }
  })();
}

/**
 * Read a single flag value from a raw argv array, supporting both
 * `--flag value` and `--flag=value`. Returns '' when the flag is absent or
 * its value is missing/another flag (so `--flag --force` is not silently
 * consumed as the value).
 *
 * For the simple index-based runners that don't use parseArgs().
 *
 * @param {string[]} args
 * @param {string} flag - e.g. '--platform-version'
 * @returns {string}
 */
function getFlagValue(args, flag) {
  const inline = args.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  if (
    idx !== -1 &&
    args[idx + 1] !== undefined &&
    !args[idx + 1].startsWith("-")
  ) {
    return args[idx + 1];
  }
  return "";
}

module.exports = {
  runCli,
  parseArgs,
  parseArgsOrExit,
  exitWithUsageError,
  UsageError,
  getFlagValue,
  backgroundRequested,
  // Exported for tests — key placement is a contract the envelope docs describe.
  withUserCommand,
  USER_COMMAND,
};
