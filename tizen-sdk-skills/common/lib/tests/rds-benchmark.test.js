// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS Benchmark Test — CI-safe, platform-independent unit test of the timing
 * instrumentation in core/rds/deploy-service.js.
 *
 * Needs no device, no sdb and no fixtures: it exercises `isBenchmarkMode()`,
 * the `RdsDeployTimings` collector, and the argument-parsing / source-
 * modification helpers of manual/benchmark-rds.js on a temp directory, so it
 * runs on every platform run-all.js runs on, Windows included.
 */

const {
  isBenchmarkMode,
  RdsDeployTimings,
} = require("../core/rds/deploy-service");

console.log("=== rds-benchmark.test.js Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}`,
  );
}

/** Busy-wait so the measured phase has a known minimum duration. */
const sleep = (ms) => {
  const start = performance.now();
  while (performance.now() - start < ms);
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const origEnv = process.env.TIZEN_BENCHMARK;
const restoreEnv = () => {
  if (origEnv !== undefined) process.env.TIZEN_BENCHMARK = origEnv;
  else delete process.env.TIZEN_BENCHMARK;
};

// Test 1: Verify isBenchmarkMode() respects env var
console.log("--- Test 1: isBenchmarkMode() ---");
delete process.env.TIZEN_BENCHMARK;
check("isBenchmarkMode() false when unset", isBenchmarkMode() === false);

process.env.TIZEN_BENCHMARK = "1";
check(
  "isBenchmarkMode() true when TIZEN_BENCHMARK=1",
  isBenchmarkMode() === true,
);

process.env.TIZEN_BENCHMARK = "0";
check(
  "isBenchmarkMode() false when TIZEN_BENCHMARK=0",
  isBenchmarkMode() === false,
);

// Test 2: RdsDeployTimings class
console.log("\n--- Test 2: RdsDeployTimings ---");
process.env.TIZEN_BENCHMARK = "1";
const timings = new RdsDeployTimings();
check("RdsDeployTimings created", timings !== null);

timings.startPhase("test");
sleep(10);
timings.endPhase("test");
timings.endPhase("never-started");

const json = timings.toJSON();
check(
  "toJSON() returns total and phases",
  json.total !== undefined && json.phases.test !== undefined,
);
check(
  "Phase duration covers the 10ms busy-wait",
  json.phases.test >= 10,
  `got ${json.phases.test.toFixed(2)}ms`,
);
check(
  "Total is at least the phase duration",
  json.total >= json.phases.test,
  `total ${json.total.toFixed(2)}ms, phase ${json.phases.test.toFixed(2)}ms`,
);
check(
  "endPhase() without startPhase() records nothing",
  json.phases["never-started"] === undefined,
);
// `v * 100` is not an exact integer in floating point (10.13 * 100 =
// 1012.9999…), so re-apply the rounding and expect a fixed point instead.
const roundedTo2 = (v) => v === Math.round(v * 100) / 100;
check(
  "Durations and total are rounded to two decimals",
  roundedTo2(json.total) && Object.values(json.phases).every(roundedTo2),
  JSON.stringify(json),
);
console.log(`  Timings: ${JSON.stringify(json, null, 2)}`);

// Test 3: Overhead of the instrumentation itself.
//
// The phase body is empty, so `total` is exactly what construction plus one
// startPhase/endPhase pair costs. The median over 20 runs ignores GC pauses
// and scheduler noise that a single sample or a mean would pick up.
console.log("\n--- Test 3: Timing overhead measurement ---");
const overheadSamples = [];
for (let i = 0; i < 20; i++) {
  const t = new RdsDeployTimings();
  t.startPhase("empty");
  t.endPhase("empty");
  overheadSamples.push(t.total());
}
const overhead = median(overheadSamples);
check(
  "Timing overhead < 1ms per phase (median of 20 empty phases)",
  overhead < 1,
  `median ${overhead.toFixed(3)}ms, max ${Math.max(...overheadSamples).toFixed(3)}ms`,
);

restoreEnv();

// Test 4: helpers of the manual benchmark script (manual/benchmark-rds.js).
// Guards the argument parser and the Phase C source modification / restore
// logic; neither needs a device.
console.log("\n--- Test 4: benchmark-rds.js helpers ---");
const fs = require("fs");
const os = require("os");
const path = require("path");
const bench = require("./manual/benchmark-rds");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rds-bench-"));
try {
  // parseArgs: bare --build must not swallow the next option
  const parsed = bench.parseArgs([
    "--project",
    tmp,
    "--build",
    "--iterations",
    "3",
  ]);
  check(
    "bare --build keeps the next option intact",
    parsed.build === true && parsed.iterations === 3,
    `build=${parsed.build} iterations=${parsed.iterations}`,
  );
  check(
    "--build false and --no-build both disable rebuilds",
    bench.parseArgs(["--project", tmp, "--build", "false"]).build === false &&
      bench.parseArgs(["--project", tmp, "--no-build"]).build === false,
  );

  // parseArgs exits the process on usage errors, so those paths run as a child.
  const { spawnSync } = require("child_process");
  const script = require.resolve("./manual/benchmark-rds");
  const runScript = (...argv) =>
    spawnSync(process.execPath, [script, ...argv], { encoding: "utf8" });
  const unknown = runScript("--project", tmp, "--bogus");
  const zeroIter = runScript("--project", tmp, "--iterations", "0");
  const help = runScript("--help");
  check(
    "unknown option, --iterations 0 → exit 1; --help → exit 0",
    unknown.status === 1 &&
      unknown.stderr.includes("unknown option --bogus") &&
      zeroIter.status === 1 &&
      zeroIter.stderr.includes("--iterations must be a positive integer") &&
      help.status === 0 &&
      help.stdout.includes("--no-build"),
    `unknown=${unknown.status} zero=${zeroIter.status} help=${help.status}`,
  );

  // insertMarker: BOM and a must-stay-first line are kept, even without a newline.
  const BOM = "\uFEFF";
  const xmlMarker = "<!-- m -->\n";
  const bomXaml = bench.insertMarker(BOM + "<?xml v?>\n<Page />\n", xmlMarker);
  const bareShebang = bench.insertMarker("#!/usr/bin/env node", "/* m */\n");
  const plain = bench.insertMarker(BOM + "class P {}\n", "/* m */\n");
  check(
    "insertMarker() keeps the BOM first and the XML declaration second",
    bomXaml === BOM + "<?xml v?>\n" + xmlMarker + "<Page />\n",
    JSON.stringify(bomXaml),
  );
  check(
    "insertMarker() keeps a shebang without trailing newline on line 1",
    bareShebang === "#!/usr/bin/env node\n/* m */\n",
    JSON.stringify(bareShebang),
  );
  check(
    "insertMarker() puts the marker right after the BOM otherwise",
    plain === BOM + "/* m */\nclass P {}\n",
    JSON.stringify(plain),
  );

  // A small project: shebang script, doctype html, xml-declared xaml, plain .cs,
  // plus files in directories that must never be touched.
  const files = {
    "run.js": "#!/usr/bin/env node\nconsole.log(1);\n",
    "index.html": "<!DOCTYPE html>\n<html></html>\n",
    "MainPage.xaml": '<?xml version="1.0" encoding="utf-8"?>\n<Page />\n',
    "Program.cs": "class P {}\n",
    "Debug/out.js": "built\n",
    "obj/x.cs": "generated\n",
    ".tizen-rds/state.js": "state\n",
  };
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const collected = bench
    .collectSourceFiles(tmp)
    .map((f) => path.relative(tmp, f.fullPath))
    .sort();
  check(
    "collectSourceFiles() skips build output, obj/ and .tizen-rds/",
    JSON.stringify(collected) ===
      JSON.stringify(["MainPage.xaml", "Program.cs", "index.html", "run.js"]),
    collected.join(", "),
  );

  const snapshot = new bench.ProjectSnapshot();
  const modified = bench.modifyProject(tmp, 2, snapshot);
  check(
    "modifyProject() touches at most three distinct files",
    modified.length === 3 && new Set(modified).size === 3,
    modified.join(", "),
  );

  const firstLines = Object.fromEntries(
    ["run.js", "index.html", "MainPage.xaml"].map((rel) => [
      rel,
      fs.readFileSync(path.join(tmp, rel), "utf8").split("\n")[0],
    ]),
  );
  check(
    "shebang, doctype and XML declaration stay on line 1",
    firstLines["run.js"] === "#!/usr/bin/env node" &&
      firstLines["index.html"] === "<!DOCTYPE html>" &&
      firstLines["MainPage.xaml"] === '<?xml version="1.0" encoding="utf-8"?>',
    JSON.stringify(firstLines),
  );
  const modifiedContents = modified.map((rel) =>
    fs.readFileSync(path.join(tmp, rel), "utf8"),
  );
  check(
    "marker comment style matches the file type",
    modifiedContents.every((c, i) =>
      /\.(html|xaml)$/.test(modified[i])
        ? c.includes("<!-- RDS benchmark modification 2")
        : c.includes("/* RDS benchmark modification 2"),
    ),
  );

  // A second round on the same tree must not overwrite the remembered originals.
  bench.modifyProject(tmp, 3, snapshot);
  const isOriginal = () =>
    Object.entries(files).every(
      ([rel, content]) =>
        fs.readFileSync(path.join(tmp, rel), "utf8") === content,
    );
  const first = snapshot.restore();
  const second = snapshot.restore();
  check(
    "ProjectSnapshot.restore() brings every file back to its original content",
    isOriginal() && first.restored >= 3 && first.failed.length === 0,
    `restored ${first.restored} file(s), failed ${first.failed.length}`,
  );
  check(
    "a second restore() is a no-op",
    second.restored === 0 && second.failed.length === 0,
  );

  // withSourceRestore(): restores on normal return and when fn throws, and
  // leaves no signal listener behind.
  const sigintBefore = process.listenerCount("SIGINT");
  const value = bench.withSourceRestore("T", (snap) => {
    bench.modifyProject(tmp, 4, snap);
    return "done";
  });
  check(
    "withSourceRestore() returns fn's value and restores the files",
    value === "done" && isOriginal(),
  );
  let thrown = null;
  try {
    bench.withSourceRestore("T", (snap) => {
      bench.modifyProject(tmp, 5, snap);
      throw new Error("boom");
    });
  } catch (err) {
    thrown = err;
  }
  check(
    "withSourceRestore() restores the files when fn throws and rethrows",
    thrown?.message === "boom" && isOriginal(),
  );
  check(
    "withSourceRestore() removes its SIGINT/SIGTERM listeners",
    process.listenerCount("SIGINT") === sigintBefore,
    `listeners before=${sigintBefore} after=${process.listenerCount("SIGINT")}`,
  );

  // No modifiable source → nothing is created in the project.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "rds-bench-empty-"));
  try {
    const none = bench.modifyProject(empty, 2, new bench.ProjectSnapshot());
    check(
      "modifyProject() creates nothing when there is no source file",
      none.length === 0 && fs.readdirSync(empty).length === 0,
    );
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
