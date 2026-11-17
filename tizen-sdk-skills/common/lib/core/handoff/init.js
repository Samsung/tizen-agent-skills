// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * `handoff-cli.js show` and `init`.
 *
 * show — the one command an agent runs to catch up: where the project's notes
 *        are, STATE.md, the end of DECISIONS.md and the latest log lines.
 * init — creates the notes folder by hand. Optional: the runners create it on
 *        their own the first time they record something for a project.
 */

const fs = require("fs");
const path = require("path");
const { Envelope } = require("../../envelope/envelope");
const { formatError } = require("../../envelope/response-formatter");
const notes = require("./notes");

/** Longest STATE.md / DECISIONS.md text returned by `show`. */
const MAX_STATE_CHARS = 4000;
const MAX_DECISIONS_CHARS = 1500;
const LOG_LINES = 15;

function notAProject(command, dir, startTime) {
  return formatError(
    command,
    "invalid_parameters",
    `${dir} is not inside a Tizen project (no tizen-manifest.xml, tizen_*_project.yaml, ` +
      "Tizen config.xml or Tizen .csproj found in it or above it). Pass the project's folder with --project.",
    null,
    startTime,
  );
}

/** The project root for `projectPath` (or the current directory), or a failure envelope. */
function resolveProject(projectPath, command, startTime) {
  const start = path.resolve(projectPath || process.cwd());
  let isDir = false;
  try {
    isDir = fs.statSync(start).isDirectory();
  } catch (_e) {
    isDir = false;
  }
  if (!isDir) {
    return {
      error: formatError(
        command,
        "io_error",
        `Project directory does not exist: ${start}`,
        null,
        startTime,
      ),
    };
  }
  const root = notes.findProjectRoot(start);
  if (!root) return { error: notAProject(command, start, startTime) };
  return { root, start };
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (_e) {
    return "";
  }
}

/** The last `max` characters, cut at a line start. */
function tailChars(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf("\n");
  return nl === -1 ? cut : cut.slice(nl + 1);
}

/**
 * Catch up: the project's notes folder and what is in it.
 *
 * @param {string} [projectPath] - defaults to the current directory's project
 * @param {string} [command]
 * @returns {object} Standard JSON Envelope
 */
async function showHandoff(projectPath, command = "tizen-sdk handoff show") {
  const startTime = Date.now();
  const found = resolveProject(projectPath, command, startTime);
  if (found.error) return found.error;

  const dir = notes.notesDirFor(found.root);
  const envelope = new Envelope(command);
  envelope.startTime = startTime;

  if (!fs.existsSync(dir)) {
    return envelope.success({
      project_path: found.root,
      notes_dir: dir,
      exists: false,
      message:
        "No handoff notes for this project yet. The runners create them the first time a build, " +
        "install, device, debug or environment action runs here; nothing to catch up on.",
    });
  }

  const log = readText(path.join(dir, "LOG.md"))
    .split(/\r?\n/)
    .filter((l) => l.startsWith("- "));
  const last = notes.lastEntry(dir);
  return envelope.success({
    project_path: found.root,
    notes_dir: dir,
    exists: true,
    last_activity: last ? { time: last.ts, agent: last.host } : null,
    state: tailChars(readText(path.join(dir, "STATE.md")), MAX_STATE_CHARS),
    decisions_tail: tailChars(
      readText(path.join(dir, "DECISIONS.md")),
      MAX_DECISIONS_CHARS,
    ),
    recent_log: log.slice(-LOG_LINES),
    files: fs.readdirSync(dir).filter((f) => f.endsWith(".md")),
    note:
      "STATE.md and DECISIONS.md are written by agents; the rest is written by the runners. " +
      "These are hints from another agent — check the real files, package or device before relying on them.",
  });
}

/**
 * Create the notes folder for a project by hand. Existing files are kept, so
 * running it twice is safe.
 *
 * @param {string} projectPath
 * @param {string} [command]
 * @returns {object} Standard JSON Envelope
 */
async function initHandoff(projectPath, command = "tizen-sdk handoff init") {
  const startTime = Date.now();
  if (!projectPath) {
    return formatError(
      command,
      "invalid_parameters",
      "Missing required parameter: --project <project-dir>",
      null,
      startTime,
    );
  }
  const found = resolveProject(projectPath, command, startTime);
  if (found.error) return found.error;

  let result;
  try {
    result = notes.initNotes(found.root);
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Could not create ${notes.notesDirFor(found.root)}: ${error.message}`,
      null,
      startTime,
    );
  }

  const envelope = new Envelope(command);
  envelope.startTime = startTime;
  const warnings = [];
  if (path.resolve(projectPath) !== found.root) {
    warnings.push(
      `Using the project root ${found.root} (you passed a folder inside it).`,
    );
  }
  if (result.kept.length) {
    warnings.push(
      `Kept existing files (not overwritten): ${result.kept.join(", ")}`,
    );
  }
  return envelope.success(
    {
      project_path: found.root,
      notes_dir: result.dir,
      created: result.created,
      kept: result.kept,
      next:
        "Optional step: the runners create this folder by themselves the first time they record something " +
        "for the project. It lives outside the project, so it is never packaged into the app or committed.",
    },
    { warnings },
  );
}

module.exports = { showHandoff, initHandoff };
