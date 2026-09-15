#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-sdk — standalone launcher for the tizen-sdk plugin bundle.
 *
 * The plugin (dist/tizen-sdk.js) exports a single run(args) function that the
 * tizen-cli host calls in-process. This launcher lets the same bundle run
 * WITHOUT the host:
 *
 *   node bin/tizen-sdk.js <command> [--options...]
 *   tizen-sdk <command> [--options...]          (after `pnpm link --global`)
 *   node dist/bin/tizen-sdk.js <command> ...    (release ZIP / dist-only layout)
 *
 * It re-implements nothing: it locates the bundle, forwards argv to run(),
 * and maps run()'s { status } to the process exit code (0 success, 1 failure).
 * stdout carries exactly one Standard JSON Envelope, as in the host.
 *
 * tests/runner.mjs already falls back to a `tizen-sdk` binary on PATH when
 * tizen-cli is not installed — this file is that binary.
 *
 * Never call process.exit(): on Windows stdout pipes are asynchronous, so a
 * forced exit right after the envelope write can truncate it. Setting
 * process.exitCode and letting Node drain is safe because the plugin itself
 * never exits the process either.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const PROGRAM = "tizen-sdk";

// Candidate bundle locations, in order:
//   1. <repo>/tizen-cli/bin/  → ../dist/tizen-sdk.js   (source checkout after `pnpm build`)
//   2. <dist>/bin/            → ../tizen-sdk.js        (copied into dist/ by esbuild.config.js)
const BUNDLE_CANDIDATES = [
  path.resolve(__dirname, "..", "dist", "tizen-sdk.js"),
  path.resolve(__dirname, "..", "tizen-sdk.js"),
];

function findBundle() {
  return BUNDLE_CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

/** Print one failure envelope to stdout — the only stdout write on this path. */
function printFailure(errorCode, errorCategory, message, suggestedFix) {
  const envelope = {
    status: "failure",
    result: null,
    warnings: [],
    errors: [
      {
        error_code: errorCode,
        message,
        error_category: errorCategory,
        ...(suggestedFix
          ? {
              suggested_fix: {
                command: suggestedFix,
                auto_fixable: false,
                guide_url: null,
              },
            }
          : {}),
      },
    ],
    command: [PROGRAM, ...process.argv.slice(2)].join(" ").trim(),
  };
  process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
}

function main() {
  const bundle = findBundle();
  if (!bundle) {
    printFailure(
      "PLUGIN_NOT_BUILT",
      "environment",
      `Plugin bundle not found (checked: ${BUNDLE_CANDIDATES.join(", ")}). ` +
        "Build it first, then re-run this command.",
      "cd tizen-cli && pnpm install && pnpm build",
    );
    process.exitCode = 1;
    return;
  }

  // The plugin renders `user_command` with the prefix the user typed. Inside
  // the tizen-cli host that is "tizen-cli tizen-sdk"; standalone it is just
  // "tizen-sdk". Respect an explicit override (wrapper scripts, aliases).
  if (!process.env.TIZEN_SDK_USER_COMMAND_PREFIX) {
    process.env.TIZEN_SDK_USER_COMMAND_PREFIX = PROGRAM;
  }

  let plugin;
  try {
    plugin = require(bundle);
  } catch (err) {
    printFailure(
      "PLUGIN_LOAD_ERROR",
      "plugin_error",
      `Failed to load plugin bundle ${bundle}: ${err && err.message ? err.message : String(err)}`,
      "cd tizen-cli && pnpm build",
    );
    process.exitCode = 1;
    return;
  }

  if (!plugin || typeof plugin.run !== "function") {
    printFailure(
      "PLUGIN_LOAD_ERROR",
      "plugin_error",
      `Plugin bundle ${bundle} does not export run(args)`,
      "cd tizen-cli && pnpm build",
    );
    process.exitCode = 1;
    return;
  }

  Promise.resolve()
    .then(() => plugin.run(process.argv.slice(2)))
    .then((res) => {
      process.exitCode = res && res.status === "success" ? 0 : 1;
    })
    .catch((err) => {
      // run() prints its own envelope for every error it knows about; this
      // path is reached only for a rejection that escaped it entirely.
      printFailure(
        "PLUGIN_ERROR",
        "plugin_error",
        `Plugin error: ${err && err.message ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    });
}

main();
