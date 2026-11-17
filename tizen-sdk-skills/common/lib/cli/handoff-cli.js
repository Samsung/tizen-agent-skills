#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * CLI runner for the handoff notes.
 *
 *   node handoff-cli.js show [--project <project-dir>]
 *   node handoff-cli.js init --project <project-dir>
 *
 * The notes need no setup: every runner call that matters — build, install,
 * emulator and device actions, debugging, SDK and certificate changes — is
 * appended to the project's notes automatically (lib/core/handoff/record.js),
 * and the folder is created the first time. They live OUTSIDE the project, in
 * ~/.tizen-sdk-skills/handoff/<project>-<id>/, so a web project's package never
 * contains them and git never sees them.
 *
 *   show  Catch up: prints the notes folder, STATE.md, the end of DECISIONS.md
 *         and the latest log lines. Without --project it uses the project the
 *         current directory is in. Run it first when you pick up a project.
 *   init  Creates the folder by hand (optional). Existing files are kept.
 *
 * TIZEN_HANDOFF=0 turns recording off; =existing writes only where the folder
 * already exists; TIZEN_HANDOFF_HOME moves the parent folder.
 *
 * Exit code: success=0, failure/error=1
 */

const { showHandoff, initHandoff } = require("../core/handoff/init");
const { runCli, parseArgsOrExit, exitWithUsageError } = require("./cli-runner");

const COMMAND = "tizen-sdk handoff";

const USAGE =
  "Usage: node handoff-cli.js <show|init> [--project <project-dir>]. " +
  "show catches you up on the project's handoff notes (default: the project the current directory is in); " +
  "init creates the notes folder by hand (optional — the runners create it on their own).";

const usageError = (message) => exitWithUsageError(COMMAND, USAGE, message);

const { options, positional } = parseArgsOrExit(
  COMMAND,
  USAGE,
  process.argv.slice(2),
  { "--project": "project" },
  {},
);

const [action, ...extra] = positional;
if (extra.length > 0) usageError(`Unexpected argument(s): ${extra.join(" ")}`);

switch (action) {
  case "show":
    runCli(`${COMMAND} show`, () =>
      showHandoff(options.project, `${COMMAND} show`),
    );
    break;
  case "init":
    if (!options.project) usageError("init requires --project <project-dir>");
    runCli(`${COMMAND} init`, () =>
      initHandoff(options.project, `${COMMAND} init`),
    );
    break;
  default:
    usageError(action ? `Unknown action: ${action}` : "Missing action");
}
