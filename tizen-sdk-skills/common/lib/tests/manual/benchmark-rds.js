// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Benchmark Script — compares RDS disabled vs enabled performance.
 *
 * Usage:
 *   node benchmark-rds.js --project <dir> [--device-serial <serial>] [--iterations <N>]
 *                         [--build | --no-build] [--package <path>]
 *
 * The script runs three phases with the same number of iterations each:
 *   Phase A (RDS Disabled): TIZEN_RDS_ENABLED=0, full install every time (build → install)
 *   Phase B (RDS Enabled): TIZEN_RDS_ENABLED=1, first is full, rest are fast-deploy (build → install)
 *   Phase C (RDS Enabled with Modification): TIZEN_RDS_ENABLED=1, simulates a developer loop:
 *     - Iteration 1: full deploy to establish the baseline (build → install)
 *     - Iterations 2..N: modify source files → rebuild → install (exercises the RDS delta path)
 *     Every source file touched in Phase C is restored to its original content when the
 *     phase ends (also on Ctrl+C). Phase C is skipped with --no-build because a source
 *     change that is never rebuilt cannot reach the package.
 *
 * TIZEN_BENCHMARK=1 is always set so timing instrumentation is collected in all phases.
 *
 * The package path is taken from --package, or from the build envelope's
 * `artifacts[0].path` (one build runs up front when --no-build is given without --package).
 * It is never guessed from the directory name.
 *
 * Flow (runBenchmark):
 *   1. findCliRunner()            locate project-manager-cli.js
 *   2. resolve the package        --package, or one build
 *   3. Phase A                    runPhase({ rdsEnabled: false })
 *   4. resetOrFail(), Phase B     runPhase({ rdsEnabled: true })
 *   5. resetOrFail(), Phase C     runPhase({ rdsEnabled: true, modify: true }) inside
 *                                 withSourceRestore(): every file modifyProject() touches is
 *                                 recorded in a ProjectSnapshot and written back afterwards,
 *                                 on the normal path and on SIGINT/SIGTERM
 *   6. summary tables             benchmark-results.json in the current directory
 *
 * Results are printed as comparison tables and saved to benchmark-results.json.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Directories never scanned for source files (build output, VCS, RDS state). */
const SKIP_DIRS = new Set([
  "Debug",
  "Release",
  "build",
  "bin",
  "obj",
  "node_modules",
  ".git",
  ".tizen-rds",
]);

/**
 * Source extensions Phase C may modify, mapped to the comment style that is
 * valid at the top of such a file.
 */
const SOURCE_COMMENT_STYLE = {
  ".c": "block",
  ".cpp": "block",
  ".h": "block",
  ".hpp": "block",
  ".cs": "block",
  ".js": "block",
  ".ts": "block",
  ".css": "block",
  ".html": "xml",
  ".xaml": "xml",
};

/** First lines that must stay first: shebang, XML declaration, HTML doctype. */
const KEEP_FIRST_LINE = /^(#!|<\?xml|<!doctype)/i;

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    project: null,
    deviceSerial: null,
    iterations: 5,
    build: true,
    package: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--project":
        args.project = argv[++i];
        break;
      case "--device-serial":
        args.deviceSerial = argv[++i];
        break;
      case "--iterations":
        args.iterations = parseInt(argv[++i], 10);
        break;
      case "--package":
        args.package = argv[++i];
        break;
      case "--build": {
        // Bare `--build` means true; an explicit `true` / `false` value is consumed,
        // anything else (e.g. the next option) is left for the next loop turn.
        const next = argv[i + 1];
        if (next === "true" || next === "false") {
          args.build = next === "true";
          i++;
        } else {
          args.build = true;
        }
        break;
      }
      case "--no-build":
        args.build = false;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Error: unknown option ${arg}`);
        printUsage();
        process.exit(1);
    }
  }
  if (!args.project) {
    console.error("Error: --project is required");
    printUsage();
    process.exit(1);
  }
  args.project = path.resolve(args.project);
  if (!fs.existsSync(args.project)) {
    fail(`Project directory not found: ${args.project}`);
  }
  if (!Number.isInteger(args.iterations) || args.iterations < 1) {
    fail("--iterations must be a positive integer");
  }
  if (args.package) {
    args.package = path.resolve(args.package);
    if (!fs.existsSync(args.package)) {
      fail(`Package not found: ${args.package}`);
    }
  }
  return args;
}

function printUsage() {
  console.log(`
RDS Benchmark — Compare RDS disabled vs enabled performance
Usage: node benchmark-rds.js --project <dir> [options]
Options:
  --project <dir>          Path to a Tizen project directory (required)
  --device-serial <serial> Target device/emulator serial (optional, auto-selects if omitted)
  --iterations <N>         Number of iterations per phase (default: 5)
  --build [true|false]     Rebuild before each install (default: true)
  --no-build               Install the same package every iteration; Phase C is skipped
  --package <path>         Package to install with --no-build (default: build once to find it)
`);
}

/**
 * Locate project-manager-cli.js: next to this script in a checkout or plugin
 * copy, otherwise via the plugin-cache resolver that every runner uses.
 */
function findCliRunner() {
  const repoRunner = path.join(
    __dirname,
    "..",
    "..",
    "cli",
    "project-manager-cli.js",
  );
  if (fs.existsSync(repoRunner)) return repoRunner;
  try {
    const { findLatestVersionDir } = require("../../core/plugin-cache");
    const root = findLatestVersionDir();
    if (root) {
      const candidate = path.join(root, "lib", "cli", "project-manager-cli.js");
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_e) {
    // plugin-cache is not reachable from a stray copy of this file; fall through
  }
  return null;
}

/**
 * Run a single install command and parse the result.
 */
function runInstall(
  cliPath,
  packagePath,
  deviceSerial,
  runAfterInstall,
  rdsEnabled,
) {
  const startTime = Date.now();
  const env = {
    ...process.env,
    TIZEN_BENCHMARK: "1",
    TIZEN_RDS_ENABLED: rdsEnabled ? "1" : "0",
  };
  const args = ["install", "--package", packagePath];
  if (deviceSerial) args.push("--device-serial", deviceSerial);
  if (runAfterInstall) args.push("--run");

  const result = spawnSync(process.execPath, [cliPath, ...args], {
    env,
    encoding: "utf8",
    timeout: 120000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const elapsed = Date.now() - startTime;

  if (result.status !== 0) {
    return {
      success: false,
      timeMs: elapsed,
      deployType: "error",
      error: result.stderr || result.stdout || "Unknown error",
    };
  }
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope.status === "success") {
      return {
        success: true,
        timeMs: elapsed,
        deployType: envelope.result?.deploy_type || "unknown",
        rdsTimings: envelope.result?.rds_timings || null,
      };
    }
    return {
      success: false,
      timeMs: elapsed,
      deployType: envelope.result?.deploy_type || "error",
      error: envelope.error?.message || "Install failed",
    };
  } catch (err) {
    return {
      success: false,
      timeMs: elapsed,
      deployType: "error",
      error: `Failed to parse envelope: ${err.message}`,
    };
  }
}

/**
 * Build the project.
 */
function buildProject(cliPath, projectDir) {
  const result = spawnSync(
    process.execPath,
    [cliPath, "build", "--project", projectDir],
    {
      encoding: "utf8",
      timeout: 180000,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    return {
      success: false,
      error: result.stderr || result.stdout || "Build failed",
    };
  }
  try {
    const envelope = JSON.parse(result.stdout);
    if (envelope.status === "success") {
      const packagePath = envelope.result?.artifacts?.[0]?.path;
      if (!packagePath) {
        return {
          success: false,
          error: "Build envelope has no artifacts[0].path",
        };
      }
      return { success: true, packagePath };
    }
    return { success: false, error: envelope.error?.message || "Build failed" };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse build envelope: ${err.message}`,
    };
  }
}

/**
 * Clear host-side RDS state for the package's project (`install --reset-rds`
 * does not install anything). Returns `{ success, error }` so the caller can
 * refuse to run a phase on a baseline it could not reset.
 */
function resetRdsState(cliPath, packagePath) {
  const result = spawnSync(
    process.execPath,
    [cliPath, "install", "--package", packagePath, "--reset-rds"],
    {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  if (result.status === 0) return { success: true };
  let error = result.stderr || result.stdout || "Unknown error";
  try {
    const envelope = JSON.parse(result.stdout);
    error = envelope.error?.message || error;
  } catch (_e) {
    // not an envelope; keep the raw output
  }
  return { success: false, error: error.trim() };
}

/**
 * Calculate statistics from results array.
 */
function calcStats(results) {
  const times = results.filter((r) => r.success).map((r) => r.timeMs);
  if (times.length === 0) return { count: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  return {
    count: times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: times.reduce((a, b) => a + b, 0) / times.length,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

/**
 * Remembers the original bytes of every file Phase C touches and writes them
 * back when the phase ends, so a benchmark run leaves the project unchanged.
 */
class ProjectSnapshot {
  constructor() {
    /** @type {Map<string, Buffer>} */
    this.originals = new Map();
  }

  /**
   * Record the file's current bytes — only the first time. Later iterations
   * modify an already-modified file, and that content must not replace the
   * original.
   */
  remember(filePath) {
    if (!this.originals.has(filePath)) {
      this.originals.set(filePath, fs.readFileSync(filePath));
    }
  }

  /**
   * Write every remembered original back. A failed write is reported and the
   * loop continues with the next file; the failed file's original stays in the
   * map so a later restore() (or the caller's message) can still act on it.
   * Restored files are dropped, which makes a second call a no-op for them.
   *
   * @returns {{restored: number, failed: string[]}}
   */
  restore() {
    let restored = 0;
    const failed = [];
    for (const [filePath, content] of this.originals) {
      try {
        fs.writeFileSync(filePath, content);
        this.originals.delete(filePath);
        restored++;
      } catch (err) {
        console.error(`  Could not restore ${filePath}: ${err.message}`);
        failed.push(filePath);
      }
    }
    return { restored, failed };
  }
}

/**
 * Run `fn(snapshot)` and restore every file recorded in the snapshot when it
 * returns or throws, and also when the process receives SIGINT/SIGTERM.
 *
 * The signal handlers are registered with `once` and removed in `finally`, so
 * they exist only while Phase C runs. A signal handler restores and then calls
 * `process.exit(130)`, which skips this function's `finally` — there is no
 * double restore. Note that `spawnSync` blocks the event loop, so a signal
 * arriving during a build/install is handled right after that child exits.
 */
function withSourceRestore(label, fn) {
  const snapshot = new ProjectSnapshot();
  const report = (prefix, { restored, failed }) => {
    console.error(`\n[${label}] ${prefix} ${restored} modified source file(s)`);
    if (failed.length > 0) {
      console.error(
        `[${label}] ${failed.length} file(s) could not be restored — revert the marker comments by hand:\n  ${failed.join("\n  ")}`,
      );
    }
  };
  const onSignal = () => {
    report("Interrupted; restored", snapshot.restore());
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    return fn(snapshot);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    report("Restored", snapshot.restore());
  }
}

/**
 * Collect every source file Phase C may modify (build output and VCS/RDS
 * directories skipped).
 */
function collectSourceFiles(projectDir) {
  const files = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_COMMENT_STYLE[ext]) files.push({ fullPath, ext });
      }
    }
  }
  walk(projectDir);
  return files;
}

/**
 * Insert `marker` at the top of `content`, keeping a UTF-8 BOM and a
 * shebang / XML declaration / doctype first line in place.
 *
 * Visual Studio writes .cs/.xaml files with a BOM; a marker in front of it
 * would move the BOM into the middle of the file and break the XML parser.
 * A first line that must stay first is kept even when the file has no
 * newline at all (a one-line file gets one).
 */
function insertMarker(content, marker) {
  let bom = "";
  if (content.charCodeAt(0) === 0xfeff) {
    bom = "\uFEFF";
    content = content.slice(1);
  }
  const newline = content.indexOf("\n");
  const firstLine = newline === -1 ? content : content.slice(0, newline);
  if (!KEEP_FIRST_LINE.test(firstLine)) {
    return bom + marker + content;
  }
  const head = newline === -1 ? content + "\n" : content.slice(0, newline + 1);
  const tail = newline === -1 ? "" : content.slice(newline + 1);
  return bom + head + marker + tail;
}

/**
 * Modify up to three distinct source files to simulate developer changes.
 * Originals are recorded in `snapshot` before the first write to each file.
 *
 * @returns {string[]} project-relative paths of the modified files (empty when
 *   the project has no modifiable source file; nothing is created in that case)
 */
function modifyProject(projectDir, iteration, snapshot) {
  const candidates = collectSourceFiles(projectDir);
  if (candidates.length === 0) return [];

  // Fisher-Yates shuffle, then take the first N — no duplicates possible.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const selected = candidates.slice(0, Math.min(3, candidates.length));

  const text = `RDS benchmark modification ${iteration} - ${Date.now()}`;
  for (const file of selected) {
    snapshot.remember(file.fullPath);
    const marker =
      SOURCE_COMMENT_STYLE[file.ext] === "xml"
        ? `<!-- ${text} -->\n`
        : `/* ${text} */\n`;
    const content = fs.readFileSync(file.fullPath, "utf8");
    fs.writeFileSync(file.fullPath, insertMarker(content, marker));
  }
  return selected.map((f) => path.relative(projectDir, f.fullPath));
}

function formatTiming(installResult) {
  const t = installResult.rdsTimings;
  if (!t) return "";
  const reconcile = t.phases?.reconcile;
  const parts = [];
  if (reconcile !== undefined)
    parts.push(`reconcile: ${reconcile.toFixed(1)}ms`);
  parts.push(`rds total: ${t.total.toFixed(1)}ms`);
  return ` (${parts.join(", ")})`;
}

function failedRow(iteration, error) {
  return { iteration, success: false, timeMs: 0, deployType: "error", error };
}

/**
 * Run one phase: `iterations` rounds of [modify →] [build →] install.
 *
 * @param {object} opts
 * @param {string} opts.label - log prefix, e.g. "Phase A"
 * @param {boolean} opts.rdsEnabled - value of TIZEN_RDS_ENABLED for the installs
 * @param {boolean} opts.modify - Phase C: modify source files before iterations 2..N
 * @param {ProjectSnapshot} [opts.snapshot] - required when `modify` is true
 */
function runPhase({ label, rdsEnabled, modify, snapshot, cliPath, args, pkg }) {
  const rows = [];
  for (let i = 1; i <= args.iterations; i++) {
    let step = "";
    if (modify) {
      step =
        i === 1 ? " (baseline - full deploy)" : " (modify -> build -> install)";
    }
    console.error(`\n[${label}] Iteration ${i}/${args.iterations}${step}`);

    if (modify && i > 1) {
      const changed = modifyProject(args.project, i, snapshot);
      if (changed.length === 0) {
        console.error(
          "  No modifiable source file found; this iteration measures fast-deploy, not a delta",
        );
      } else {
        console.error(`  Modified: ${changed.join(", ")}`);
      }
    }

    let packagePath = pkg;
    if (args.build) {
      console.error("  Building...");
      const buildResult = buildProject(cliPath, args.project);
      if (!buildResult.success) {
        console.error(`  Build failed: ${buildResult.error}`);
        rows.push(failedRow(i, buildResult.error));
        continue;
      }
      packagePath = buildResult.packagePath;
      console.error(`  Built: ${packagePath}`);
    }

    console.error(
      `  Installing (RDS ${rdsEnabled ? "enabled" : "disabled"})...`,
    );
    const installResult = runInstall(
      cliPath,
      packagePath,
      args.deviceSerial,
      true,
      rdsEnabled,
    );
    rows.push({ iteration: i, ...installResult });
    if (installResult.success) {
      console.error(
        `  ✓ ${installResult.deployType} in ${installResult.timeMs.toFixed(0)}ms${formatTiming(installResult)}`,
      );
    } else {
      console.error(`  ✗ Failed: ${installResult.error}`);
    }
  }
  return rows;
}

/** Reset RDS state before a phase; abort the run if the baseline cannot be trusted. */
function resetOrFail(label, cliPath, pkg) {
  console.error(`\n[${label}] Resetting RDS state...`);
  const reset = resetRdsState(cliPath, pkg);
  if (!reset.success) {
    fail(`[${label}] RDS state reset failed, aborting: ${reset.error}`, 2);
  }
  console.error("  RDS state reset complete");
}

function printStats(title, stats, iterations) {
  console.error(`\n${title}:`);
  console.error(`  Successful: ${stats.count}/${iterations}`);
  if (stats.count > 0) {
    console.error(
      `  Min: ${stats.min.toFixed(0)}ms, Max: ${stats.max.toFixed(0)}ms`,
    );
    console.error(
      `  Mean: ${stats.mean.toFixed(0)}ms, Median: ${stats.median.toFixed(0)}ms`,
    );
  }
}

function printSpeedup(title, baseline, other) {
  if (baseline.count === 0 || other.count === 0) return null;
  const speedup = baseline.mean / other.mean;
  console.error(
    `\n  Speedup (${title}): ${speedup.toFixed(2)}x (${((speedup - 1) * 100).toFixed(0)}% faster)`,
  );
  return speedup;
}

/**
 * Main benchmark flow.
 */
function runBenchmark(args) {
  const cliPath = findCliRunner();
  if (!cliPath) {
    fail("Could not find project-manager-cli.js runner");
  }
  console.error(`[Benchmark] Using CLI runner: ${cliPath}`);
  console.error(`[Benchmark] Project: ${args.project}`);
  console.error(`[Benchmark] Device: ${args.deviceSerial || "(auto-select)"}`);
  console.error(`[Benchmark] Iterations: ${args.iterations}`);
  console.error(`[Benchmark] Rebuild per iteration: ${args.build}\n`);

  // Resolve the package once: from --package, or from a build envelope.
  let pkg = args.package;
  if (!pkg) {
    console.error("[Benchmark] Initial build to locate the package...");
    const buildResult = buildProject(cliPath, args.project);
    if (!buildResult.success) {
      fail(`Initial build failed: ${buildResult.error}`);
    }
    pkg = buildResult.packagePath;
    console.error(`  Package: ${pkg}\n`);
  }

  const results = {
    timestamp: new Date().toISOString(),
    project: args.project,
    deviceSerial: args.deviceSerial,
    iterations: args.iterations,
    build: args.build,
    package: pkg,
    rdsDisabled: [],
    rdsEnabled: [],
    rdsEnabledWithModify: [],
    summary: {},
  };
  const common = { cliPath, args, pkg };

  // Phase A: RDS Disabled
  console.error("=== Phase A: RDS Disabled (TIZEN_RDS_ENABLED=0) ===");
  results.rdsDisabled = runPhase({
    label: "Phase A",
    rdsEnabled: false,
    modify: false,
    ...common,
  });

  // Phase B: RDS Enabled
  console.error("\n\n=== Phase B: RDS Enabled (TIZEN_RDS_ENABLED=1) ===");
  resetOrFail("Phase B", cliPath, pkg);
  results.rdsEnabled = runPhase({
    label: "Phase B",
    rdsEnabled: true,
    modify: false,
    ...common,
  });

  // Phase C: RDS Enabled with Modification (modify -> build -> install)
  console.error(
    "\n\n=== Phase C: RDS Enabled with Modification (TIZEN_RDS_ENABLED=1) ===",
  );
  if (!args.build) {
    console.error(
      "  Skipped: --no-build installs the same package every time, so a source modification cannot produce a delta",
    );
  } else {
    resetOrFail("Phase C", cliPath, pkg);
    results.rdsEnabledWithModify = withSourceRestore("Phase C", (snapshot) =>
      runPhase({
        label: "Phase C",
        rdsEnabled: true,
        modify: true,
        snapshot,
        ...common,
      }),
    );
  }

  // Summary
  console.error("\n\n=== Benchmark Summary ===");
  const disabledStats = calcStats(results.rdsDisabled);
  const enabledStats = calcStats(results.rdsEnabled);
  const enabledWithModifyStats = calcStats(results.rdsEnabledWithModify);

  printStats("RDS Disabled", disabledStats, args.iterations);
  printStats("RDS Enabled", enabledStats, args.iterations);
  const speedup = printSpeedup(
    "RDS enabled vs disabled",
    disabledStats,
    enabledStats,
  );
  printStats(
    "RDS Enabled with Modification",
    enabledWithModifyStats,
    args.build ? args.iterations : 0,
  );
  const speedupWithModify = printSpeedup(
    "RDS enabled+modify vs disabled",
    disabledStats,
    enabledWithModifyStats,
  );

  results.summary = {
    rdsDisabled: disabledStats,
    rdsEnabled: enabledStats,
    rdsEnabledWithModify: enabledWithModifyStats,
    speedup,
    speedupWithModify,
  };
  const outputFile = path.join(process.cwd(), "benchmark-results.json");
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.error(`\nResults saved to: ${outputFile}`);

  // Print table — rows are looked up by iteration number, never by array index,
  // so a failed or skipped iteration cannot shift the rows below it.
  const byIteration = (rows, n) => rows.find((r) => r.iteration === n);
  const cell = (row, width) =>
    (row?.success ? row.timeMs.toFixed(0) : "N/A").padStart(width);
  console.error("\n\n=== Detailed Results ===\n");
  console.error(
    "Iteration | RDS Disabled (ms) | RDS Enabled (ms) | RDS+Modify (ms) | Deploy Type (B / C)",
  );
  console.error(
    "----------|-------------------|------------------|-----------------|--------------------",
  );
  for (let i = 1; i <= args.iterations; i++) {
    const d = byIteration(results.rdsDisabled, i);
    const e = byIteration(results.rdsEnabled, i);
    const c = byIteration(results.rdsEnabledWithModify, i);
    console.error(
      `${String(i).padStart(9)} | ${cell(d, 17)} | ${cell(e, 16)} | ${cell(c, 15)} | ${e?.deployType || "N/A"} / ${c?.deployType || "N/A"}`,
    );
  }
}

// Entry point (helpers are exported so rds-benchmark.test.js can unit-test them)
if (require.main === module) {
  runBenchmark(parseArgs(process.argv.slice(2)));
}

module.exports = {
  parseArgs,
  collectSourceFiles,
  insertMarker,
  modifyProject,
  ProjectSnapshot,
  withSourceRestore,
  SOURCE_COMMENT_STYLE,
  SKIP_DIRS,
};
