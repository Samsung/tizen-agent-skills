// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * output-summary tests
 *
 * Focus is extractBuildDiagnostics(), which exists so a failed build's compile
 * errors reach the envelope instead of living only in a log file on the host.
 * The regression it guards: a GBS build emits a long run of setup warnings
 * before the real error, so a first-N-matches summary dropped the one line
 * naming the file and left the caller guessing at the cause.
 */

const {
  summarizeOutput,
  extractBuildDiagnostics,
} = require("../core/output-summary");

console.log("=== output-summary Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Test 1: empty / missing input
console.log("--- extractBuildDiagnostics: empty input ---");
check("empty string returns []", extractBuildDiagnostics(""), []);
check("undefined returns []", extractBuildDiagnostics(undefined), []);
check(
  "output with no errors returns []",
  extractBuildDiagnostics("compiling foo.c\nlinking\ndone"),
  [],
);

// Test 2: the GBS regression — compile error buried after a wall of warnings.
// 15 leading warning lines exceeds the old max of 10, so the real error was cut.
console.log(
  "\n--- extractBuildDiagnostics: GBS compile error after warning flood ---",
);
const gbsNoise = Array.from(
  { length: 15 },
  (_, i) => `[    ${i}s] warning: repo setup issue ${i}`,
).join("\n");
const gbsLog = [
  gbsNoise,
  "[   42s] dali-demo.cpp:12:5: error: 'Foo' was not declared in this scope",
  "[   43s] make[2]: *** [CMakeFiles/demo.dir/build.make:76: demo.o] Error 1",
  "[   44s] error: Bad exit status from /var/tmp/rpm-tmp.AbC123 (%build)",
  "[   44s] RPM build errors:",
  "[   45s] gbs:error: Local build failed",
].join("\n");
const gbsDiag = extractBuildDiagnostics(gbsLog);
check(
  "compiler diagnostic ranks first",
  gbsDiag[0],
  "dali-demo.cpp:12:5: error: 'Foo' was not declared in this scope",
);
check("GBS elapsed-time prefix stripped", /^\[/.test(gbsDiag[0]), false);
check(
  "build-system markers retained",
  gbsDiag.some((l) => l.startsWith("error: Bad exit status from")),
  true,
);
check(
  "plain warnings excluded",
  gbsDiag.some((l) => l.includes("repo setup issue")),
  false,
);

// Test 3: ranking across tiers
console.log("\n--- extractBuildDiagnostics: tier ordering ---");
const mixed = [
  "gbs:error: Local build failed",
  "something failed during setup",
  "main.c:3:1: error: expected declaration",
].join("\n");
check("compiler > build-system > generic", extractBuildDiagnostics(mixed), [
  "main.c:3:1: error: expected declaration",
  "gbs:error: Local build failed",
  "something failed during setup",
]);

// Test 4: toolchain-specific diagnostics
console.log("\n--- extractBuildDiagnostics: toolchain patterns ---");
check(
  "gcc fatal error (missing header)",
  extractBuildDiagnostics(
    "app.c:1:10: fatal error: dlog.h: No such file or directory",
  ),
  ["app.c:1:10: fatal error: dlog.h: No such file or directory"],
);
check(
  "C# compiler error",
  extractBuildDiagnostics("Program.cs(10,5): error CS1002: ; expected"),
  ["Program.cs(10,5): error CS1002: ; expected"],
);
check(
  "linker undefined reference",
  extractBuildDiagnostics("main.o: undefined reference to `helper'"),
  ["main.o: undefined reference to `helper'"],
);
check(
  "CMake error",
  extractBuildDiagnostics("CMake Error at CMakeLists.txt:5"),
  ["CMake Error at CMakeLists.txt:5"],
);

// Test 5: dedup — GBS repeats each error in its trailing summary block
console.log("\n--- extractBuildDiagnostics: dedup and caps ---");
const repeated = [
  "foo.c:1:1: error: boom",
  "foo.c:1:1: error: boom",
  "foo.c:1:1: error: boom",
].join("\n");
check("duplicate lines collapsed", extractBuildDiagnostics(repeated), [
  "foo.c:1:1: error: boom",
]);

const many = Array.from(
  { length: 20 },
  (_, i) => `f${i}.c:1:1: error: problem ${i}`,
).join("\n");
const capped = extractBuildDiagnostics(many, { max: 5 });
check("respects max", capped.length, 6); // 5 lines + overflow note
check(
  "overflow note appended",
  /15 more error line\(s\) omitted/.test(capped[5]),
  true,
);

const longLine = `x.c:1:1: error: ${"a".repeat(500)}`;
const truncated = extractBuildDiagnostics(longLine, { maxLineLength: 80 });
check("long line truncated", truncated[0].length, 84); // 80 + " ..."

// Test 6: the DALi C++17 hint.
// The raw diagnostic names a header under /usr/include/dali*, which reads as a
// broken SDK rather than a missing `set(CMAKE_CXX_STANDARD 17)`. The hint has to
// survive ahead of the diagnostics, and must not fire on unrelated failures.
console.log("\n--- extractBuildDiagnostics: DALi C++17 hint ---");

const daliLog = [
  "[    0s] warning: repository metadata stale for repo-0",
  "[   42s] /usr/include/dali/public-api/object/property-value.h:28:13: error: 'string_view' in namespace 'std' does not name a type",
  "[   42s] /usr/include/dali/public-api/object/property-value.h:28:8: note: '-std=c++17' or '-std=gnu++17'",
  "[   43s] make[2]: *** [CMakeFiles/dali-demo.dir/src/main.cpp.o] Error 1",
].join("\n");
const daliDiag = extractBuildDiagnostics(daliLog);
check(
  "hint is the first line",
  /^HINT: this compile is not running as C\+\+17/.test(daliDiag[0]),
  true,
);
check(
  "hint names the CMake remedy",
  /set\(CMAKE_CXX_STANDARD 17\)/.test(daliDiag[1]),
  true,
);
check(
  "hint rules out the optflags workaround",
  /optflags[^\n]*does NOT work/.test(daliDiag[2]),
  true,
);
check(
  "compiler diagnostic still present after the hints",
  daliDiag[3],
  "/usr/include/dali/public-api/object/property-value.h:28:13: error: 'string_view' in namespace 'std' does not name a type",
);

check(
  "std::any signature also triggers the hint",
  extractBuildDiagnostics(
    "foo.h:9:5: error: 'any' is not a member of 'std'",
  )[0].startsWith("HINT:"),
  true,
);
check(
  "libstdc++ ISO C++ 2017 guard triggers the hint",
  extractBuildDiagnostics(
    "/usr/include/c++/9/bits/c++0x_warning.h:32:2: error: #error This file requires compiler and library support for the ISO C++ 2017 standard.",
  )[0].startsWith("HINT:"),
  true,
);

// The preflight prints the remedy, but those lines contain no "error" so the
// diagnostic filter drops them. The hint has to restore the fix.
const preflightOut = [
  "[ERROR] DALi project does not select C++17 — the GBS build would fail inside the dali2 headers.",
  "  Fix — add to CMakeLists.txt, before add_executable():",
  "    set(CMAKE_CXX_STANDARD 17)",
].join("\n");
const preflightDiag = extractBuildDiagnostics(preflightOut);
check(
  "preflight exit-4 output triggers the hint",
  preflightDiag[0].startsWith("HINT:"),
  true,
);
check(
  "preflight headline kept alongside the hint",
  preflightDiag[3],
  "[ERROR] DALi project does not select C++17 — the GBS build would fail inside the dali2 headers.",
);

check(
  "unrelated failure gets no hint",
  extractBuildDiagnostics(
    "main.cpp:42:10: fatal error: dali/dali.h: No such file or directory",
  ),
  ["main.cpp:42:10: fatal error: dali/dali.h: No such file or directory"],
);

// Hints must not be eaten by the `max` cut — they are the actionable part.
const hintPlusMany = [
  "foo.h:1:1: error: 'string_view' in namespace 'std' does not name a type",
  ...Array.from({ length: 20 }, (_, i) => `f${i}.c:1:1: error: problem ${i}`),
].join("\n");
const hintCapped = extractBuildDiagnostics(hintPlusMany, { max: 5 });
check("hints exempt from max", hintCapped.length, 9); // 3 hints + 5 lines + overflow note
check("hints still first when capped", hintCapped[0].startsWith("HINT:"), true);

// Test 7: summarizeOutput still behaves as before (no regression)
console.log("\n--- summarizeOutput: unchanged behavior ---");
check(
  "keeps matching lines up to max",
  summarizeOutput("warning: a\ninfo: b\nerror: c", { keep: /warning|error/i }),
  ["warning: a", "error: c"],
);
check(
  "stopAt discards remainder",
  summarizeOutput("error: a\nNext steps:\nerror: b", {
    keep: /error/i,
    stopAt: /^Next steps:/i,
  }),
  ["error: a"],
);

console.log(
  `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
