// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Follow-ups to the debug.js refactor (#50), run against a stubbed
 * plugin-cache so no SDK, script or device is touched:
 *   - an empty `GDB init file:` marker is not success and does not borrow
 *     the next line (#63)
 *   - only netcoredbg-specific "not found" output means netcoredbg is missing (#64)
 *   - port_forwarded keys on the "Port <N> forwarded" marker, and GDB
 *     recognises "No devices found" like DotNET does (#65)
 *   - both runners classify both no-device messages as device_not_found (#79)
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

console.log("=== debug follow-ups Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

// A fake plugin version dir: resolveDebugScript() only checks that the
// script file exists; execPluginScript below never runs it.
const versionDir = fs.mkdtempSync(path.join(os.tmpdir(), "debug-followups-"));
for (const [group, base] of [
  ["tizen-gdb-debug", "tizen-native-gdb-debug"],
  ["tizen-dotnet-debug", "tizen-dotnet-debug"],
]) {
  fs.mkdirSync(path.join(versionDir, "scripts", group), { recursive: true });
  for (const ext of [".sh", ".ps1"]) {
    fs.writeFileSync(path.join(versionDir, "scripts", group, base + ext), "");
  }
}

// Each case sets what the "script" prints, or the error it fails with.
let scriptResult = { output: "" };
let mockApplied = false;

const debugPath = require.resolve("../core/debug");
const originalLoad = Module._load;
Module._load = function mockPluginCache(request, parent, isMain) {
  if (request === "./plugin-cache" && parent?.filename === debugPath) {
    mockApplied = true;
    return {
      findLatestVersionDir: () => versionDir,
      execPluginScript: () => {
        if (scriptResult.error) throw scriptResult.error;
        return scriptResult.output;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
delete require.cache[debugPath];
const { setupGdbDebug, setupDotnetDebug } = require("../core/debug");
Module._load = originalLoad;

check("plugin-cache mock applied to debug.js", mockApplied);
if (!mockApplied) process.exit(1);

const failWith = (stdout) =>
  Object.assign(new Error("Command failed"), { stdout, stderr: "" });
const firstError = (envelope) => (envelope.errors && envelope.errors[0]) || {};
const GDB_LINE = '"/usr/bin/gdb" -x "/tmp/app.gdb"';

(async () => {
  // --- #63: GDB init file marker -----------------------------------------
  scriptResult = { output: `GDB init file: /tmp/app.gdb\n${GDB_LINE}\n` };
  let r = await setupGdbDebug("org.example.app", "/tmp/app");
  check(
    "a marker with a path succeeds",
    r.status === "success" && r.result.gdb_init_file === "/tmp/app.gdb",
    JSON.stringify(r.result || firstError(r)),
  );

  scriptResult = { output: `GDB init file:   \n${GDB_LINE}\n` };
  r = await setupGdbDebug("org.example.app", "/tmp/app");
  check(
    "an empty marker fails instead of borrowing the next line",
    r.status === "failure" &&
      /no gdb command \/ init file markers/.test(firstError(r).message),
    JSON.stringify(r.result || firstError(r)),
  );

  scriptResult = { output: `GDB init file: C:/tmp/app.gdb\r\n${GDB_LINE}\r\n` };
  r = await setupGdbDebug("org.example.app", "/tmp/app");
  check(
    "a CRLF marker line still yields the path",
    r.status === "success" && r.result.gdb_init_file === "C:/tmp/app.gdb",
    JSON.stringify(r.result || firstError(r)),
  );

  // --- #65 / #79: no-device message, both runners -------------------------
  for (const [runner, setup] of [
    ["GDB", () => setupGdbDebug("org.example.app", "/tmp/app")],
    ["DotNET", () => setupDotnetDebug("org.example.app", { launch: true })],
  ]) {
    for (const text of ["No devices found.", "No connected device"]) {
      scriptResult = { error: failWith(text) };
      r = await setup();
      check(
        `${runner} recognises '${text}'`,
        firstError(r).error_category === "device_not_found",
        JSON.stringify(firstError(r)),
      );
    }
  }

  // --- #64: netcoredbg not found -----------------------------------------
  scriptResult = {
    error: failWith(
      "netcoredbg package for 'x86_64' not found under /sdk/platforms/tizen-*/common/on-demand/",
    ),
  };
  r = await setupDotnetDebug("org.example.app", { launch: true });
  check(
    "the script's netcoredbg message is still classified",
    /netcoredbg package not found/.test(firstError(r).message || ""),
    JSON.stringify(firstError(r)),
  );

  scriptResult = { error: failWith("pkgcmd: package org.other not found") };
  r = await setupDotnetDebug("org.example.app", { launch: true });
  check(
    "an unrelated 'package … not found' falls through to the generic error",
    /dotnet|DotNET|setup failed/i.test(firstError(r).message || "") &&
      !/netcoredbg package not found/.test(firstError(r).message || ""),
    JSON.stringify(firstError(r)),
  );

  // --- #65: port_forwarded -----------------------------------------------
  scriptResult = {
    output:
      "5/6 Forwarding port 4711...\nPort 4711 forwarded (host -> device)\n",
  };
  r = await setupDotnetDebug("org.example.app", { launch: true });
  check(
    "the forward marker sets port_forwarded",
    r.status === "success" && r.result.port_forwarded === true,
    JSON.stringify(r.result || firstError(r)),
  );

  scriptResult = { output: "5/6 Forwarding port 4711...\n" };
  r = await setupDotnetDebug("org.example.app", { launch: true });
  check(
    "a progress line alone does not set port_forwarded",
    r.status === "success" && r.result.port_forwarded === false,
    JSON.stringify(r.result || firstError(r)),
  );

  fs.rmSync(versionDir, { recursive: true, force: true });
  console.log(`\n${failures ? `${failures} FAILED` : "All tests passed"}`);
  process.exit(failures ? 1 : 0);
})();
