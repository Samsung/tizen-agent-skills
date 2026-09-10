// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Common helper to extract only key lines from script stdout/stderr for envelope warnings
 *
 * Each domain (create/build/install/device/dotnet/gdb/dotnet-debug) summarizes only
 * unique info (warnings, errors, etc.) instead of massive toolchain/boot/install logs in envelope.
 * What differs per domain is (1) line pattern to keep, (2) pattern to skip,
 * (3) pattern to stop at, (4) max line count — consolidated in this function.
 *
 * @param {string} output - script output
 * @param {object} opts
 * @param {RegExp} opts.keep - line pattern to keep (required)
 * @param {RegExp} [opts.skip] - skip lines matching this pattern (lines redundant with result field, etc.)
 * @param {RegExp} [opts.stopAt] - stop and discard remainder when matching this pattern
 * @param {number} [opts.max=Infinity] - max lines to preserve (stop when reached)
 * @param {string} [opts.overflowNote] - guidance line to append when cut off by max
 * @returns {string[]} array with key lines only
 */
function summarizeOutput(
  output,
  {
    keep,
    skip = null,
    stopAt = null,
    max = Infinity,
    overflowNote = null,
  } = {},
) {
  if (!output) return [];

  const kept = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line) continue;
    if (stopAt && stopAt.test(line)) break;
    if (skip && skip.test(line)) continue;
    if (keep.test(line)) {
      kept.push(line);
      if (kept.length >= max) {
        if (overflowNote) kept.push(overflowNote);
        break;
      }
    }
  }
  return kept;
}

/**
 * GBS prefixes every line of the build log with an elapsed-time stamp
 * ("[   42s] foo.cpp:12:5: error: ..."), which defeats anchored patterns.
 */
const GBS_TIMESTAMP = /^\[\s*\d+s\]\s*/;

/**
 * Tier 1 — the actual compiler/linker/CMake diagnostic. This is the line that
 * names the file and the mistake; everything else is downstream noise.
 */
const COMPILER_DIAGNOSTIC = [
  /^.+?:\d+:(?:\d+:)?\s*(?:fatal\s+)?error\s*:/i, // gcc/clang: foo.cpp:12:5: error:
  /\bfatal error\s*:/i,
  /\berror\s+CS\d{2,}\b/, // C# compiler
  /\berror\s+MSB\d{3,}\b/, // MSBuild
  /\bundefined reference to\b/i,
  /\bcollect2\s*:\s*error\b/i,
  /^ld(?:\.[\w-]+)?\s*:\s+.*\b(?:cannot find|no such file|undefined)\b/i,
  /\bCMake Error\b/i,
  /\bNo rule to make target\b/i,
];

/**
 * Tier 2 — build-system level failure markers. Worth reporting, but on their own
 * they only say "something failed", not what.
 */
const BUILD_FAILURE_MARKER = [
  /\berror\s*:\s*Bad exit status from\b/i, // rpmbuild %build section failed
  /^RPM build errors\s*:/i,
  /^make(?:\[\d+\])?\s*:\s*\*\*\*/,
  /^gbs\s*:\s*error/i,
  /\bLocal build failed\b/i,
  /\berror\s*:\s*Failed build dependencies\b/i,
];

/**
 * Tier 0 — signatures of a compile that is not running as C++17.
 *
 * Tizen 9.0 dali2 headers use std::string_view / std::any, so a DALi project
 * built at the compiler default (gnu++14 on the Tizen 9.0 toolchain) explodes
 * inside /usr/include/dali*, far away from the file the author wrote. The raw
 * diagnostic names a system header, so it reads as "the SDK is broken" rather
 * than "my CMakeLists is missing one line" — hence an explicit hint.
 */
const CXX17_REQUIRED = [
  /'(?:string_view|any|optional|variant|filesystem|byte)'\s+(?:is not a member of|in namespace)\s+'std'/i,
  /\bstd::(?:string_view|any)\b[^\n]*\b(?:has not been declared|does not name a type|is not a member)\b/i,
  /requires compiler and library support for the ISO C\+\+ 2017 standard/i,
  /-std=c\+\+17'?\s+or\s+'?-std=gnu\+\+17/i,
  // The build script's own preflight (exit 4). Only its headline survives the
  // diagnostic filter — the remedy it printed does not contain "error", so
  // without this the envelope would name the problem and drop the fix.
  /DALi project does not select C\+\+17/i,
];

const CXX17_HINT = [
  "HINT: this compile is not running as C++17 — Tizen 9.0 dali2 headers use std::string_view / std::any, so C++17 is mandatory.",
  "HINT: add `set(CMAKE_CXX_STANDARD 17)` and `set(CMAKE_CXX_STANDARD_REQUIRED ON)` to CMakeLists.txt, before add_executable().",
  'HINT: `gbs build --define "optflags ..."` does NOT work around this — the spec runs plain `cmake`, so rpm optflags never reach the compile.',
];

/**
 * Map a known failure signature to an actionable remedy.
 *
 * Hints are prepended to the diagnostics and are exempt from the `max` cut, so
 * the remedy is never the thing that gets truncated away.
 *
 * @param {string} output - combined stdout+stderr of the failed build
 * @returns {string[]} hint lines (empty when no signature matched)
 */
function buildFailureHints(output) {
  if (!output) return [];
  if (CXX17_REQUIRED.some((p) => p.test(output))) return CXX17_HINT;
  return [];
}

/**
 * Extract the compile/link diagnostics from a failed build's combined output.
 *
 * Unlike summarizeOutput(), which keeps the FIRST N lines matching a pattern,
 * this ranks lines by how diagnostic they actually are. A GBS build emits
 * hundreds of early "warning:"/"error:" lines from repo and rpm setup, so a
 * first-N-matches cut reliably dropped the one `foo.cpp:42: error:` line the
 * caller needed and left it reachable only by opening the host log file.
 *
 * @param {string} output - combined stdout+stderr of the failed build
 * @param {object} [opts]
 * @param {number} [opts.max=12] - max diagnostic lines to return
 * @param {number} [opts.maxLineLength=300] - per-line truncation (compiler command
 *   lines can run to several KB and would otherwise swamp the envelope)
 * @returns {string[]} hint lines (if any) followed by diagnostic lines, most useful first
 */
function extractBuildDiagnostics(
  output,
  { max = 12, maxLineLength = 300 } = {},
) {
  if (!output) return [];

  const compiler = [];
  const buildSystem = [];
  const generic = [];
  const seen = new Set();

  for (const rawLine of output.split("\n")) {
    let line = rawLine.replace(/\r$/, "").replace(GBS_TIMESTAMP, "").trim();
    if (!line) continue;

    let bucket;
    if (COMPILER_DIAGNOSTIC.some((p) => p.test(line))) bucket = compiler;
    else if (BUILD_FAILURE_MARKER.some((p) => p.test(line)))
      bucket = buildSystem;
    else if (/\b(?:error|failed|failure)\b/i.test(line)) bucket = generic;
    else continue;

    if (line.length > maxLineLength)
      line = `${line.slice(0, maxLineLength)} ...`;
    // GBS repeats each error in its trailing summary block
    if (seen.has(line)) continue;
    seen.add(line);
    bucket.push(line);
  }

  const hints = buildFailureHints(output);
  const all = [...compiler, ...buildSystem, ...generic];
  if (all.length <= max) return [...hints, ...all];
  return [
    ...hints,
    ...all.slice(0, max),
    `... (${all.length - max} more error line(s) omitted — see full log)`,
  ];
}

module.exports = {
  summarizeOutput,
  extractBuildDiagnostics,
  buildFailureHints,
};
