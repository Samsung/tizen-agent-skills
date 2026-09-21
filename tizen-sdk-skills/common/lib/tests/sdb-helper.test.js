// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * sdb-helper tests
 *
 * Covers the pure (no-device) parts of the sdb-helper domain:
 *   - matchIntent: intent classification order (specific patterns must win
 *     over catch-alls like /\bshell\b/, /\bforward\b/ and the log catch-all),
 *     and the handoff contract — every log intent hands off to
 *     tizen-dlog-analyzer with a hint naming the action to run
 *   - parseDevices: `sdb devices` output parsing (incl. 3-column output)
 *   - buildCommand: screenshot fallback chain contract; no builder for log intents
 */

const {
  matchIntent,
  parseDevices,
  buildCommand,
} = require("../core/sdb-helper");

// Access extractShellCommand via buildCommand (it's internal but tested through buildCommand)

console.log("=== sdb-helper Test ===\n");

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

// Test 1: intent classification — specific patterns before catch-alls
console.log("Test 1: matchIntent ordering");
const intentCases = [
  ["list devices", "list-devices"],
  ["open an interactive shell", "shell-interactive"],
  ["log", "log-stream"],
  ["show dlog", "log-stream"],
  ["tail the logs", "log-stream"],
  ["clear logs", "log-clear"],
  ["save logs", "log-save"],
  ["whoami on the device", "whoami"],
  ["run shell command ls", "shell-command"],
  ["list forwards", "forward-list"],
  ["remove forward tcp:9999", "forward-remove"],
  ["forward port 9999 for me", "forward-add"],
  ["take a screenshot", "screenshot"],
  ["install this tpk", "install"],
  ["reboot the device", "reboot"],
];
for (const [request, expectedId] of intentCases) {
  const m = matchIntent(request);
  check(`  "${request}"`, m && m.id, expectedId);
}

// Gating / handoff flags
const installIntent = matchIntent("install this tpk");
check("  install is gated", installIntent.gated, true);
check(
  "  install hands off to tizen-install-app",
  installIntent.handoff,
  "tizen-install-app",
);

// Handoff intents: list-devices, connect, disconnect, screenshot
const listDevIntent = matchIntent("list devices");
check(
  "  list-devices hands off to tizen-device-manager",
  listDevIntent.handoff,
  "tizen-device-manager",
);

const connectIntent = matchIntent("connect 192.168.1.100");
check(
  "  connect hands off to tizen-remote-device",
  connectIntent.handoff,
  "tizen-remote-device",
);

const disconnectIntent = matchIntent("disconnect 192.168.1.100");
check(
  "  disconnect hands off to tizen-remote-device",
  disconnectIntent.handoff,
  "tizen-remote-device",
);

const screenshotIntent = matchIntent("take a screenshot");
check(
  "  screenshot hands off to tizen-screenshot",
  screenshotIntent.handoff,
  "tizen-screenshot",
);

// Every log intent (view/save/clear alike) hands off to tizen-dlog-analyzer —
// sdb-helper never runs `sdb dlog` itself.
for (const req of [
  "tail the logs",
  "show dlog",
  "log",
  "save logs",
  "clear logs",
]) {
  const m = matchIntent(req);
  check(
    `  "${req}" hands off to tizen-dlog-analyzer`,
    m.handoff,
    "tizen-dlog-analyzer",
  );
  check(`  "${req}" carries a handoff hint`, typeof m.handoffHint, "string");
}
check(
  "  log-clear keeps its gated flag",
  matchIntent("clear logs").gated,
  true,
);
check(
  "  log-clear hint names the --confirm re-run",
  matchIntent("clear logs").handoffHint.includes("--confirm"),
  true,
);
check(
  "  log-stream hint names log-dump",
  matchIntent("tail the logs").handoffHint.includes("log-dump"),
  true,
);
// An explicit shell request that merely mentions a log path / `tail` is still
// a shell command — the log catch-all sits after the shell block.
check(
  "  shell request with a log path stays shell-command",
  matchIntent("run shell command tail -n 20 /var/log/messages").id,
  "shell-command",
);
check(
  "  whoami is not stolen by the log catch-all",
  matchIntent("whoami and show me the log").id,
  "whoami",
);
// Non-handoff intents carry no hint key at all (envelope stays unchanged for them)
check(
  "  non-handoff intent has no handoffHint",
  Object.prototype.hasOwnProperty.call(
    matchIntent("reboot the device"),
    "handoffHint",
  ),
  false,
);
// Log intents have no sdb builder any more — the handoff short-circuits first
for (const id of ["log-stream", "log-save", "log-clear"]) {
  check(
    `  buildCommand(${id}) has no sdb command`,
    buildCommand(id, "S", "tail the logs").command,
    "",
  );
}

check("  unmatched request returns null", matchIntent("qwertyuiop"), null);

// Test 2: parseDevices — header skipped, state column matched, 3rd column ignored
console.log("\nTest 2: parseDevices");
const output = [
  "List of devices attached",
  "emulator-26101  device  tizen-vm-default",
  "1.2.3.4:26101   offline",
  "SERIAL9         unauthorized  some-name",
  "garbage line without state",
  "",
].join("\n");
check("  parses serial+state, skips header/garbage", parseDevices(output), [
  { serial: "emulator-26101", state: "device" },
  { serial: "1.2.3.4:26101", state: "offline" },
  { serial: "SERIAL9", state: "unauthorized" },
]);

// Test 3: buildCommand — screenshot returns a fallback chain
console.log("\nTest 3: buildCommand screenshot contract");
const sc = buildCommand("screenshot", "emulator-26101", "take a screenshot");
check("  has primary command", typeof sc.command, "string");
check(
  "  has 4 fallbacks",
  Array.isArray(sc.fallbacks) && sc.fallbacks.length,
  4,
);
// Verified against a live tizen-vm-default emulator: the option is
// `-dump_screen -p <dir> -n <name>`. `-dump_topvwins` does not exist — the
// tool answers "unknown option" and still exits 0.
check(
  "  enlightenment_info is in the chain",
  sc.fallbacks.some((f) => f.includes("enlightenment_info -dump_screen")),
  true,
);
check(
  "  does not use the non-existent -dump_topvwins spelling",
  sc.fallbacks.some((f) => f.includes("-dump_topvwins")),
  false,
);
check(
  "  serial is embedded in primary",
  sc.command.includes('-s "emulator-26101"'),
  true,
);

// Non-screenshot intents have no fallbacks
const dc = buildCommand("device-info", "emulator-26101", "show capability");
check("  device-info has no fallbacks", dc.fallbacks === undefined, true);

// Test 4: buildCommand shell-command — extracts actual command, no literal <CMD>
console.log("\nTest 4: buildCommand shell-command extracts real command");
// On unix hosts the $? marker is emitted escaped (\$?) so the HOST shell
// does not expand it before sdb runs — the device shell must expand it.
const EXIT_MARKER = process.platform === "win32" ? "$?" : "\\$?";
const shellCases = [
  ["run shell command ls -la", `ls -la; echo __SDB_EXIT:${EXIT_MARKER}`],
  [
    "shell command cat /etc/hosts",
    `cat /etc/hosts; echo __SDB_EXIT:${EXIT_MARKER}`,
  ],
  ["shell ls", `ls; echo __SDB_EXIT:${EXIT_MARKER}`],
  ["execute shell command pwd", `pwd; echo __SDB_EXIT:${EXIT_MARKER}`],
];
for (const [request, expectedCmd] of shellCases) {
  const result = buildCommand("shell-command", "emulator-26101", request);
  const expected = '-s "emulator-26101" shell "' + expectedCmd + '"';
  check(`  "${request}"`, result.command, expected);
}

// shell-command with no actual command returns empty command + note
const noCmd = buildCommand("shell-command", "emulator-26101", "shell");
check("  'shell' alone → empty command", noCmd.command, "");
check("  'shell' alone → has note", typeof noCmd.note, "string");

// shell-command must NOT contain literal <CMD>
const withCmd = buildCommand(
  "shell-command",
  "emulator-26101",
  "run shell command ls",
);
check(
  "  no literal <CMD> in command",
  withCmd.command.includes("<CMD>"),
  false,
);

// Test 5: keyword stripping must respect word boundaries.
// Regression: /^(shell|command)\s*/ matched the PREFIX of a word, so
// "shell shellcheck foo.sh" was silently mangled into "check foo.sh" and then
// executed on the device.
console.log("\nTest 5: shell keyword stripping respects word boundaries");
const boundaryCases = [
  ["shell shellcheck script.sh", "shellcheck script.sh"],
  ["run shell commander --list", "commander --list"],
  ["shell command commands.txt", "commands.txt"],
  ["shell shell ls", "ls"],
];
for (const [request, expectedCmd] of boundaryCases) {
  const result = buildCommand("shell-command", "emulator-26101", request);
  const expected = `-s "emulator-26101" shell "${expectedCmd}; echo __SDB_EXIT:${EXIT_MARKER}"`;
  check(`  "${request}"`, result.command, expected);
}

// Test 6: no intent may emit an unsubstituted <PLACEHOLDER>.
// Regression: launch/kill/package-info/forward/sendkey/connect returned tokens
// like <APPID> and <port> verbatim. Most of those intents are ungated, so the
// literal placeholder was executed against the device.
console.log("\nTest 6: placeholders are substituted, never emitted literally");
const substitutionCases = [
  [
    "launch",
    "launch app org.tizen.dali-demo",
    '-s "S" shell app_launcher -s "org.tizen.dali-demo"',
  ],
  [
    "kill",
    'kill app "org.example.myapp"',
    '-s "S" shell app_launcher -k "org.example.myapp"',
  ],
  [
    "package-info",
    "package info org.tizen.dali-demo",
    '-s "S" shell pkginfo --pkg "org.tizen.dali-demo"',
  ],
  ["forward-add", "forward port 8080", '-s "S" forward tcp:8080 tcp:8080'],
  ["forward-add", "forward 8080 to 9090", '-s "S" forward tcp:8080 tcp:9090'],
  ["forward-remove", "remove forward 8080", '-s "S" forward --remove tcp:8080'],
  ["sendkey", "sendkey KEY_HOME", '-s "S" shell sendkey KEY_HOME'],
  ["sendkey", "sendkey home", '-s "S" shell sendkey KEY_HOME'],
  ["connect", "connect to 192.168.0.5", "connect 192.168.0.5:26101"],
  ["connect", "connect to 192.168.0.5:26102", "connect 192.168.0.5:26102"],
  ["connect", "connect to localhost", "connect localhost:26101"],
  [
    "disconnect",
    "disconnect 192.168.0.5:26101",
    "disconnect 192.168.0.5:26101",
  ],
];
for (const [intentId, request, expected] of substitutionCases) {
  check(
    `  ${intentId}: "${request}"`,
    buildCommand(intentId, "S", request).command,
    expected,
  );
}

// Samsung TV images print nothing for `app_launcher -s` in a non-root shell, so
// the launch intent must carry the TV launcher as a fallback and accept only an
// output that actually confirms the launch (sdb exits 0 either way).
console.log("\nTest 6b: launch falls back to the Samsung TV launcher");
{
  const launch = buildCommand("launch", "S", "launch app org.tizen.dali-demo");
  check(
    "  launch: TV fallback is 0 was_execute",
    (launch.fallbacks || [])[0],
    '-s "S" shell 0 was_execute "org.tizen.dali-demo"',
  );
  check(
    "  launch: accepts app_launcher confirmation",
    launch.accept("... successfully launched pid = 4242 with debug 0"),
    true,
  );
  check(
    "  launch: accepts was_execute confirmation",
    launch.accept(
      "launch app org.tizen.dali-demo\napp_id[org.tizen.dali-demo] launched",
    ),
    true,
  );
  check(
    "  launch: accepts was_execute 'resumed' (app already running)",
    launch.accept("app_id[org.tizen.dali-demo] resumed"),
    true,
  );
  check("  launch: rejects silent output", launch.accept(""), false);
  check(
    "  launch: rejects 'launch start' without 'launched'",
    launch.accept("app_id[org.tizen.dali-demo] launch start"),
    false,
  );
  check(
    "  launch: rejects 'launch failed'",
    launch.accept("app_id[org.tizen.dali-demo] launch failed"),
    false,
  );
  check(
    "  launch: rejects a 'launched' line for a different app id",
    launch.accept("app_id[org.other.app] launched"),
    false,
  );
  check(
    "  launch: app id dots are literal in the confirmation match",
    launch.accept("app_id[orgXtizenXdali-demo] launched"),
    false,
  );
}

// runWithFallbacks: callers that pass no accept predicate (screenshot chain)
// keep the exit-code-only behaviour; with a predicate, a rejected output moves
// on to the next fallback and a rejection of every attempt is a failure.
// `node -e` stands in for sdb so the test runs on every host.
console.log("\nTest 6c: runWithFallbacks accept predicate");
{
  const { runWithFallbacks } = require("../core/sdb-helper");
  const node = process.execPath;

  const silent = runWithFallbacks(node, '-e "process.exit(0)"', [
    '-e "process.exit(1)"',
  ]);
  check(
    "  silent exit-0 output is accepted when no predicate is given",
    silent.succeeded && silent.triedCommands.length === 1,
    true,
  );

  const moved = runWithFallbacks(
    node,
    '-e "console.log(1)"',
    ['-e "console.log(2)"'],
    (out) => out.includes("2"),
  );
  check(
    "  rejected primary output moves on to the fallback",
    moved.succeeded &&
      moved.output.trim() === "2" &&
      moved.triedCommands.length === 2,
    true,
  );

  const none = runWithFallbacks(node, '-e "console.log(1)"', [], () => false);
  check(
    "  rejecting every attempt reports a failure naming the output",
    none.succeeded === false &&
      /did not confirm success: 1/.test(none.lastError.message),
    true,
  );
}

// A serial's digits must not be mistaken for a port
check(
  "  forward ignores serial digits",
  buildCommand(
    "forward-add",
    "emulator-26101",
    "forward port 8080 on emulator-26101",
  ).command,
  '-s "emulator-26101" forward tcp:8080 tcp:8080',
);

// Missing values return an empty command + a note, rather than a literal placeholder
console.log("\n  missing values → empty command + note (never executed)");
const missingCases = [
  ["launch", "launch the app"],
  ["kill", "kill the app"],
  ["package-info", "package info"],
  ["forward-add", "forward port"],
  ["sendkey", "send key please"],
  ["connect", "connect to device"],
];
for (const [intentId, request] of missingCases) {
  const result = buildCommand(intentId, "S", request);
  check(`  ${intentId}: "${request}" → empty`, result.command, "");
  check(`  ${intentId}: "${request}" → note`, typeof result.note, "string");
}

// A bare "disconnect" is valid sdb (drops all remote devices) — command, plus a
// note that it is not scoped to one device.
const bareDisconnect = buildCommand("disconnect", "S", "disconnect");
check("  bare disconnect → 'disconnect'", bareDisconnect.command, "disconnect");
check(
  "  bare disconnect → warns it affects all",
  typeof bareDisconnect.note,
  "string",
);

// Sweep: no intent leaks an unsubstituted <TOKEN> for a fully-specified request
const sweep = [
  ["launch", "launch app org.tizen.dali-demo"],
  ["kill", "kill app org.tizen.dali-demo"],
  ["package-info", "package info org.tizen.dali-demo"],
  ["forward-add", "forward port 8080"],
  ["forward-remove", "remove forward 8080"],
  ["sendkey", "sendkey KEY_HOME"],
  ["connect", "connect 192.168.0.5"],
  ["disconnect", "disconnect 192.168.0.5"],
  ["shell-command", "run shell command ls -la"],
  ["device-info", "show capability"],
  ["list-running", "list running apps"],
];
const leaked = sweep
  .map(([id, req]) => [id, buildCommand(id, "S", req).command])
  .filter(([, cmd]) => /<[A-Za-z]+>/.test(cmd));
check("  no intent leaks <PLACEHOLDER>", leaked, []);

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
