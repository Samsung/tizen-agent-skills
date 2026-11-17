// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * File layer of the handoff notes: which project a runner call belongs to,
 * where that project's notes live, who is writing, how an append is done, and
 * how the folder is first created.
 *
 * WHERE: ~/.tizen-sdk-skills/handoff/<project-name>-<id>/ — deliberately
 * OUTSIDE the project. A Tizen web project packages its WHOLE folder into the
 * .wgt (verified: a .tizen-handoff/ inside the project ended up, signed, inside
 * the app), and a notes folder in the project would also show up in git and in
 * the RDS input scan. Outside, it can never reach the app, git or a build.
 * <id> is a hash of the project's real path, so two projects with the same
 * folder name never share notes and both agents land on the same folder.
 *
 * Nothing here may ever throw into a runner — callers (record.js) wrap every
 * call, but these functions also avoid throwing for the common failures
 * (no project, read-only disk) by returning null / false.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { HOST_MARKERS, HOST_DETECT_ORDER } = require("../plugin-cache");
const { FILES, render } = require("./templates");

/** An append-only file is rotated into archive/ once it passes this size. */
const ROTATE_BYTES = 128 * 1024;
/** How far up the tree to look for the project root. */
const MAX_WALK = 8;
/** How much of LOG.md's end is read to find the last entry. */
const TAIL_BYTES = 8 * 1024;

/** Flags whose value is a path inside (or to) a project. */
const PATH_FLAGS = [
  "--project",
  "--project-dir",
  "--project-path",
  "--package",
  "--wgt-path",
  "--working-dir",
];

/**
 * TIZEN_HANDOFF:
 *   (unset / anything else)  "on"       record, and create a project's folder on first use
 *   existing                 "existing" record only where the folder already exists
 *   0 | off | false | no     "off"      record nothing
 */
function mode(env = process.env) {
  const v = String(env.TIZEN_HANDOFF === undefined ? "" : env.TIZEN_HANDOFF)
    .trim()
    .toLowerCase();
  if (["0", "off", "false", "no"].includes(v)) return "off";
  if (v === "existing") return "existing";
  return "on";
}

function enabled(env = process.env) {
  return mode(env) !== "off";
}

const HOST_BY_DOT_DIR = {
  ".claude": "claude",
  ".gemini": "gemini",
  ".codex": "codex",
};

const KNOWN_HOSTS = ["claude", "codex", "gemini", "cline"];

/**
 * Which agent is running this runner.
 *
 *   1. TIZEN_HANDOFF_HOST=claude|codex|gemini|cline — an explicit override.
 *   2. The marker each host puts in the shells it spawns (plugin-cache.js
 *      HOST_MARKERS), with the same precedence: a Codex started from inside
 *      Claude Code carries both sets of markers and counts as Claude.
 *   3. Otherwise cline. Cline sets no marker, and plugin-cache.js already
 *      treats "no marker" as Cline (DEFAULT_HOST_DOT_DIR = ".cline"), so this stays
 *      consistent with the rest of the plugin.
 *
 * The cost of (3): a plain terminal with no agent is also logged as cline.
 */
function hostName(env = process.env) {
  const forced = String(env.TIZEN_HANDOFF_HOST || "")
    .trim()
    .toLowerCase();
  if (KNOWN_HOSTS.includes(forced)) return forced;
  for (const dotDir of HOST_DETECT_ORDER) {
    if ((HOST_MARKERS[dotDir] || []).some((name) => env[name])) {
      return HOST_BY_DOT_DIR[dotDir] || "cline";
    }
  }
  return "cline";
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (_e) {
    return false;
  }
}

/** Parent of every project's notes folder. */
function handoffRoot(env = process.env) {
  return env.TIZEN_HANDOFF_HOME
    ? path.resolve(env.TIZEN_HANDOFF_HOME)
    : path.join(os.homedir(), ".tizen-sdk-skills", "handoff");
}

/**
 * The project's real path: junctions and symlinks resolved, and on Windows the
 * true on-disk spelling (`e:\app` and `E:\App` come back as the same string).
 */
function realProjectPath(projectRoot) {
  try {
    return fs.realpathSync.native(projectRoot);
  } catch (_e) {
    return path.resolve(projectRoot);
  }
}

/** The real path, case-folded on Windows (NTFS is case-insensitive). */
function projectKey(projectRoot) {
  const real = realProjectPath(projectRoot);
  const key = process.platform === "win32" ? real.toLowerCase() : real;
  return key.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Where a project's notes live (the folder need not exist yet). Both the name
 * and the id come from the REAL path, so two agents that spell the project
 * differently — another case, a junction, a trailing slash — get ONE folder.
 */
function notesDirFor(projectRoot, env = process.env) {
  const id = crypto
    .createHash("sha256")
    .update(projectKey(projectRoot))
    .digest("hex")
    .slice(0, 10);
  const name =
    path
      .basename(realProjectPath(projectRoot))
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 40) || "project";
  return path.join(handoffRoot(env), `${name}-${id}`);
}

/**
 * The outermost Tizen project root at or above `start`, or null.
 *
 * Uses project.js's isTizenProjectDir — the strict gate that guards project
 * deletion (a config.xml only counts with the Tizen namespace, a .csproj only
 * if it references Tizen). Outermost wins so a .NET solution folder and its
 * project subfolder are ONE project, whichever the agent is standing in.
 */
function findProjectRoot(start) {
  const { isTizenProjectDir } = require("../project"); // lazy: large module
  let dir = path.resolve(start);
  let found = null;
  for (let i = 0; i < MAX_WALK; i++) {
    if (isDirectory(dir) && isTizenProjectDir(dir)) found = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

/** The directory to start from for a path argument (a file starts at its folder). */
function startDirFor(value) {
  const abs = path.resolve(value);
  return isDirectory(abs) ? abs : path.dirname(abs);
}

/** Values of PATH_FLAGS in argv, in both `--flag value` and `--flag=value` forms. */
function pathArgs(argv) {
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    for (const flag of PATH_FLAGS) {
      if (token === flag && argv[i + 1] && !argv[i + 1].startsWith("--")) {
        values.push(argv[i + 1]);
      } else if (token.startsWith(`${flag}=`)) {
        values.push(token.slice(flag.length + 1));
      }
    }
  }
  return values;
}

/**
 * The project a runner call belongs to, and where its notes live.
 *
 *   1. $TIZEN_HANDOFF_DIR, when set: exactly that existing folder (tests, odd layouts).
 *   2. The project the command names (--project / --package / …): ONLY those
 *      paths decide, so an action on project B is never written into project
 *      A's notes just because the shell happens to be in A.
 *   3. Otherwise the project the current directory is in.
 *
 * @param {{argv?: string[], cwd?: string, env?: NodeJS.ProcessEnv}} [ctx]
 * @returns {{projectRoot: string|null, dir: string}|null} null = not a Tizen
 *   project (or no such folder), so nothing is recorded
 */
function locate({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  if (env.TIZEN_HANDOFF_DIR) {
    const dir = path.resolve(env.TIZEN_HANDOFF_DIR);
    return isDirectory(dir) ? { projectRoot: null, dir } : null;
  }
  const named = pathArgs(argv);
  let root = null;
  if (named.length) {
    for (const value of named) {
      root = findProjectRoot(startDirFor(value));
      if (root) break;
    }
  } else {
    root = findProjectRoot(cwd);
  }
  return root ? { projectRoot: root, dir: notesDirFor(root, env) } : null;
}

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

/** Create `file` from its template if it is missing (never overwrites). */
function ensureFile(dir, file, projectRoot = null) {
  try {
    fs.writeFileSync(path.join(dir, file), render(file, projectRoot), {
      flag: "wx",
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

/**
 * Create a project's notes folder with every file from the templates.
 * Idempotent — existing files are kept, never overwritten.
 *
 * @param {string} projectRoot
 * @returns {{dir: string, created: string[], kept: string[]}}
 */
function initNotes(projectRoot, env = process.env) {
  const dir = notesDirFor(projectRoot, env);
  fs.mkdirSync(dir, { recursive: true });
  const created = [];
  const kept = [];
  for (const name of Object.keys(FILES)) {
    try {
      fs.writeFileSync(path.join(dir, name), render(name, projectRoot), {
        flag: "wx",
      });
      created.push(name);
    } catch (error) {
      if (error.code === "EEXIST") kept.push(name);
      else throw error;
    }
  }
  return { dir, created, kept };
}

/**
 * The folder to write into: the located one if it exists, else — in "on"
 * mode — create it for the project. null when there is nothing to write to.
 */
function ensure(located, env = process.env) {
  if (!located) return null;
  if (isDirectory(located.dir)) return located.dir;
  if (mode(env) !== "on" || !located.projectRoot) return null;
  return initNotes(located.projectRoot, env).dir;
}

/**
 * Move a file that grew past ROTATE_BYTES into archive/ so the live file stays
 * small enough to read. Two writers racing here is harmless: the loser's
 * rename fails and is ignored.
 */
function rotateIfLarge(dir, file) {
  const live = path.join(dir, file);
  let size;
  try {
    size = fs.statSync(live).size;
  } catch (_e) {
    return;
  }
  if (size <= ROTATE_BYTES) return;
  try {
    const archive = path.join(dir, "archive");
    fs.mkdirSync(archive, { recursive: true });
    fs.renameSync(live, path.join(archive, `${stamp()}-${file}`));
  } catch (_e) {
    return;
  }
}

/** Append text to one of the runner-written files. */
function append(dir, file, text) {
  rotateIfLarge(dir, file);
  ensureFile(dir, file);
  fs.appendFileSync(path.join(dir, file), text, "utf8");
}

/** The last `bytes` of a file as text ("" when unreadable). */
function readTail(file, bytes = TAIL_BYTES) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, size - length);
    return buf.toString("utf8");
  } catch (_e) {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

const LOG_LINE_RE = /^- (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) \| (\S+) \| /;

/** {ts, host} of the newest LOG.md entry, or null. */
function lastEntry(dir) {
  const lines = readTail(path.join(dir, "LOG.md")).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = LOG_LINE_RE.exec(lines[i]);
    if (m) return { ts: m[1], host: m[2] };
  }
  return null;
}

module.exports = {
  ROTATE_BYTES,
  PATH_FLAGS,
  mode,
  enabled,
  hostName,
  handoffRoot,
  notesDirFor,
  findProjectRoot,
  locate,
  ensure,
  initNotes,
  append,
  readTail,
  lastEntry,
  // exported for tests
  pathArgs,
  rotateIfLarge,
  projectKey,
};
