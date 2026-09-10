// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * user_command — reconstruct the command line the USER actually issued.
 *
 * The envelope's `command` field carries the internal core label
 * ("tizen-sdk create-emulator"), which is deliberately NOT the string the user
 * typed ("tizen-cli tizen-sdk create-emulator --vm-name myEmul ...") —
 * see docs/COMMAND_MAPPING.md. That leaves an envelope with no
 * way to answer "what do I re-run to reproduce this?", which matters most on a
 * failure envelope and in bug reports where the envelope is all that is pasted.
 *
 * This module rebuilds that string from argv. It is shared by the only two
 * places every envelope passes through:
 *   - tizen-cli/src/envelope-adapter.ts  (the in-process plugin path)
 *   - lib/cli/cli-runner.js              (the standalone runners skills use)
 *
 * REDACTION: certificate commands take `--password <value>` on the command
 * line, and the envelope is echoed into logs, terminals, and model context.
 * Reproducing argv verbatim would leak those credentials, so the value after a
 * sensitive flag is replaced with "***".
 */

"use strict";

/**
 * Flags whose VALUE is a secret.
 *
 * Matching is two-layered, because an exact list has already drifted once:
 * the certificate commands grew --author-password, --distributor-password and
 * --distributor2-password (command-specs/certificate.ts) long after this set
 * was written, and every one of them leaked in full until it was noticed.
 *
 *   1. SENSITIVE_FLAGS — exact names, for anything without a telltale suffix.
 *   2. SECRET_SUFFIX   — any --flag whose last dash-separated segment is a
 *      secret word, so the next --distributor3-password is covered the day it
 *      is added rather than the day someone audits this file again.
 *
 * NOT secrets, and excluded from both layers on purpose:
 *   --*-file    a path      (--password-file, --author-password-file)
 *   --prompt-*  a boolean   (--prompt-password, --prompt-author-password)
 * Redacting either would swallow the following token and hide useful context.
 *
 * Short forms are not matched: this CLI defines no single-dash options (every
 * option in command-specs/ is declared long-form only), so a `-p` entry could
 * only ever produce false positives on some future `-p, --project`.
 */
const SENSITIVE_FLAGS = new Set([
  "--password",
  "--passwd",
  "--pass",
  "--key-password",
  "--author-password",
  "--distributor-password",
  "--distributor2-password",
  "--token",
  "--secret",
  "--api-key",
]);

/**
 * Anchored on a segment boundary (start-of-name or a dash) so `--bypass`,
 * which merely ends in "pass", is not mistaken for a credential.
 */
const SECRET_SUFFIX = /(^|-)(password|passwd|pass|token|secret|api-key)$/;

/** True when the flag's VALUE must be replaced with the mask. */
function isSensitiveFlag(flag) {
  if (!flag.startsWith("--")) return false;
  if (flag.startsWith("--prompt-") || flag.endsWith("-file")) return false;
  return SENSITIVE_FLAGS.has(flag) || SECRET_SUFFIX.test(flag.slice(2));
}

const REDACTED = "***";

/**
 * Replace the value of every sensitive flag, in both argv forms:
 *   ["--password", "<value>"]  →  ["--password", "***"]
 *   ["--password=<value>"]     →  ["--password=***"]
 *
 * The examples use a placeholder on purpose: a realistic-looking literal next
 * to `--password` reads as a leaked credential to secret scanners.
 *
 * @param {string[]} argv
 * @returns {string[]} a new array; the input is not mutated
 */
function redactArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const token = String(argv[i]);

    const eq = token.indexOf("=");
    if (token.startsWith("--") && eq !== -1) {
      const flag = token.slice(0, eq);
      out.push(isSensitiveFlag(flag) ? `${flag}=${REDACTED}` : token);
      continue;
    }

    out.push(token);
    // Space-separated form: consume the next token as the (redacted) value.
    //
    // Only a `--` token counts as "the value is missing, leave it for the
    // parser to complain about". A single dash is treated as part of the
    // value, because a password may legitimately start with one and this CLI
    // has no short options for it to be confused with — so `-s3cret` after
    // --password is a credential, not a flag. The cost is that a malformed
    // `--password -x foo` renders as `--password *** foo`, dropping a token
    // the parser would have rejected anyway; leaking the value is the worse
    // of the two failures.
    if (isSensitiveFlag(token) && i + 1 < argv.length) {
      const value = String(argv[i + 1]);
      if (!value.startsWith("--")) {
        out.push(REDACTED);
        i++;
      }
    }
  }
  return out;
}

/**
 * Quote an argument so the rendered line can be pasted back into a shell.
 * Only wraps when needed; embedded double quotes are escaped.
 */
function quoteArg(arg) {
  const text = String(arg);
  if (text === "") return '""';
  if (!/[\s"'`$;&|<>(){}[\]*?!\\]/.test(text)) return text;
  return `"${text.replace(/(["\\$`])/g, "\\$1")}"`;
}

/**
 * True for a token redactArgv() already replaced, in either argv form.
 * The placeholder must not be quoted: quoteArg treats `*` as a glob character,
 * which would render the mask as `"***"` and read like a literal value.
 */
function isRedacted(token) {
  return token === REDACTED || token.endsWith(`=${REDACTED}`);
}

/**
 * Render the user-facing command line.
 *
 * @param {string[]} argv - user tokens WITHOUT the program prefix
 *   (e.g. ["create-emulator", "--vm-name", "myEmul"])
 * @param {string} prefix - how the user invoked the program
 *   (e.g. "tizen-cli tizen-sdk" or "node emulator-manager-cli.js")
 * @returns {string} e.g. `tizen-cli tizen-sdk create-emulator --vm-name myEmul`
 */
function buildUserCommand(argv, prefix) {
  const head = String(prefix || "").trim();
  const tail = redactArgv(Array.isArray(argv) ? argv : [])
    .map((token) => (isRedacted(token) ? token : quoteArg(token)))
    .join(" ");
  if (!head) return tail;
  return tail ? `${head} ${tail}` : head;
}

module.exports = {
  buildUserCommand,
  redactArgv,
  quoteArg,
  isSensitiveFlag,
  SENSITIVE_FLAGS,
  REDACTED,
};
