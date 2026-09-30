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
  // Both word orders of the package listing (the first one used to fall
  // through to "Could not match request").
  ["list installed packages", "list-packages"],
  ["list packages installed", "list-packages"],
  ["show all installed apps", "list-packages"],
  ["list running apps", "list-running"],
  ["package info dZEpxl2iAg", "package-info"],
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
// Kernel log requests (dmesg / kmsg) hand off to the analyzer's kernel
// commands, not to a plain dlog dump (issue #213).
for (const req of ["dmesg", "show the kernel log", "collect kmsg"]) {
  const m = matchIntent(req);
  check(`  "${req}" is the kernel-log intent`, m.id, "kernel-log");
  check(
    `  "${req}" hands off to tizen-dlog-analyzer`,
    m.handoff,
    "tizen-dlog-analyzer",
  );
  check(
    `  "${req}" hint names kernel collect`,
    m.handoffHint.includes("kernel collect"),
    true,
  );
}
// …while an explicit shell request that merely mentions dmesg stays a shell
// command (the shell block precedes the log block on purpose).
check(
  '  "run shell command dmesg" stays shell-command',
  matchIntent("run shell command dmesg").id,
  "shell-command",
);
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

// Test 5b: a device clause / politeness in a free-form request is WHERE to
// run, not WHAT to run. "run shell command ls -la on emulator-26101" used to
// execute 'ls -la on emulator-26101' on the device (harmless, but "ls: cannot
// access 'on'" noise and a different result). Words that merely look like
// "on" inside the command must survive.
console.log(
  "\nTest 5b: device clause and politeness are not command arguments",
);
{
  const strip = [
    ["run shell command ls -la on emulator-26101", "ls -la"],
    ["run shell command ls -la on the device", "ls -la"],
    ["run shell command ls -la on the device emulator-26101", "ls -la"],
    ["shell df -h /opt on my TV", "df -h /opt"],
    ["run shell command cat /proc/version on the target.", "cat /proc/version"],
    ["run shell command whoami on 192.168.0.5:26101", "whoami"],
    ["run shell command whoami on R3CN30ABCDE", "whoami"],
    ["run shell command whoami on 0000d1b2c3d4e5f6", "whoami"],
    // After a device noun the serial may look like anything serial-ish.
    ["run shell command whoami on device host1.local:26101", "whoami"],
    ["on emulator-26101 run shell command ls", "ls"],
    ["on the device, run shell command ls", "ls"],
    ["please run shell command ls -la please", "ls -la"],
    ["run shell command ls -la, please", "ls -la"],
    ["run shell command ls -la for me", "ls -la"],
    ["run shell command ls -la on emulator-26101 please", "ls -la"],
    ["run shell command ls -la please on emulator-26101", "ls -la"],
  ];
  for (const [request, expectedCmd] of strip) {
    const result = buildCommand("shell-command", "emulator-26101", request);
    const expected = `-s "emulator-26101" shell "${expectedCmd}; echo __SDB_EXIT:${EXIT_MARKER}"`;
    check(`  "${request}"`, result.command, expected);
  }
  // The exact resolved serial is stripped even when it is not serial-shaped,
  // also behind a trailing "please" and behind any device noun.
  for (const [request, expectedCmd] of [
    ["run shell command ls on abc", "ls"],
    ["run shell command ls on abc please", "ls"],
    ["run shell command ls on my target abc", "ls"],
  ]) {
    check(
      `  resolved serial 'abc': "${request}"`,
      buildCommand("shell-command", "abc", request).command,
      `-s "abc" shell "${expectedCmd}; echo __SDB_EXIT:${EXIT_MARKER}"`,
    );
  }
  // Command text that happens to contain "on" / "please" stays intact. A
  // bare "on <token>" is only a device clause for an unmistakable serial:
  // file names (dots, underscores) and word+number tokens are arguments.
  // "grep -i on file1.txt" used to lose "on file1.txt" and run a bare
  // "grep -i" on the device, which blocks on stdin.
  const keep = [
    ["run shell command grep -i on file.txt", "grep -i on file.txt"],
    ["run shell command grep -i on file1.txt", "grep -i on file1.txt"],
    [
      "run shell command tail -n 20 on log2024.txt",
      "tail -n 20 on log2024.txt",
    ],
    ["run shell command cat on app_v2-final", "cat on app_v2-final"],
    ["run shell command echo on backup2024", "echo on backup2024"],
    ["run shell command echo on 2024report", "echo on 2024report"],
    ["run shell command echo on", "echo on"],
    ["run shell command ls on", "ls on"],
    ["run shell command cat please.txt", "cat please.txt"],
    ["run shell command ls /opt/on/the/device", "ls /opt/on/the/device"],
    ["run shell command echo device", "echo device"],
    ["run shell command ls -la on tmp", "ls -la on tmp"],
  ];
  for (const [request, expectedCmd] of keep) {
    const result = buildCommand("shell-command", "emulator-26101", request);
    const expected = `-s "emulator-26101" shell "${expectedCmd}; echo __SDB_EXIT:${EXIT_MARKER}"`;
    check(`  "${request}" is kept`, result.command, expected);
  }
  // Only a device clause → no command.
  const onlyDevice = buildCommand(
    "shell-command",
    "emulator-26101",
    "run shell command on emulator-26101",
  );
  check(
    "  'run shell command on emulator-26101' → empty",
    onlyDevice.command,
    "",
  );
  check("  … → has note", typeof onlyDevice.note, "string");
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

// Test 7: uninstall is handled here, gated, and never handed off
// (the former handoff pointed at tizen-install-app, which has no uninstall).
console.log("\nTest 7: uninstall intent");
{
  const m = matchIntent("uninstall org.example.myapp");
  check("  uninstall → 'uninstall'", m && m.id, "uninstall");
  check("  uninstall is gated", m && m.gated, true);
  check("  uninstall has no handoff", m && m.handoff, undefined);
  check(
    "  'remove the app X' → 'uninstall'",
    matchIntent("remove the app org.example.myapp")?.id,
    "uninstall",
  );
  check(
    "  'install' still hands off to tizen-install-app",
    matchIntent("install this tpk")?.handoff,
    "tizen-install-app",
  );
  const cmd = buildCommand("uninstall", "S", "uninstall org.example.myapp");
  check(
    "  builds pkgcmd -u -n <pkgid>",
    cmd.command,
    '-s "S" shell pkgcmd -u -n "org.example.myapp"',
  );
  check(
    "  note explains package id vs app id",
    /package id/.test(cmd.note),
    true,
  );
  const missing = buildCommand("uninstall", "S", "uninstall");
  check("  missing id → empty command", missing.command, "");
  check(
    "  missing id → note asks for it",
    /package ID/.test(missing.note),
    true,
  );
}

// Test 7b: bare (dotless) package ids — the pkgid `pkgcmd -l` prints for a
// TPK/WGT app (`dZEpxl2iAg` of `dZEpxl2iAg.MyTizenWebApp`) has no dot, so the
// dotted-only app-id extractor rejected exactly the id the user copied.
console.log("\nTest 7b: bare package ids for package-info / uninstall");
{
  const cases = [
    [
      "package-info",
      "package info dZEpxl2iAg",
      '-s "emulator-26101" shell pkginfo --pkg "dZEpxl2iAg"',
    ],
    [
      "package-info",
      'package info "hQaMXc3Qbc" on emulator-26101',
      '-s "emulator-26101" shell pkginfo --pkg "hQaMXc3Qbc"',
    ],
    [
      "package-info",
      "package info for the package org.tizen.dali-demo",
      '-s "emulator-26101" shell pkginfo --pkg "org.tizen.dali-demo"',
    ],
    [
      "uninstall",
      "uninstall dZEpxl2iAg",
      '-s "emulator-26101" shell pkgcmd -u -n "dZEpxl2iAg"',
    ],
    [
      "uninstall",
      "remove the package hQaMXc3Qbc",
      '-s "emulator-26101" shell pkgcmd -u -n "hQaMXc3Qbc"',
    ],
    // Fillers are skipped, quotes and a trailing period are tolerated, and
    // a dotted id anywhere in the request still wins.
    [
      "package-info",
      "package info for the id dZEpxl2iAg",
      '-s "emulator-26101" shell pkginfo --pkg "dZEpxl2iAg"',
    ],
    [
      "uninstall",
      "uninstall 'hQaMXc3Qbc'.",
      '-s "emulator-26101" shell pkgcmd -u -n "hQaMXc3Qbc"',
    ],
    [
      "package-info",
      "package info my_pkg-2",
      '-s "emulator-26101" shell pkginfo --pkg "my_pkg-2"',
    ],
    [
      "package-info",
      "package info MyPackage",
      '-s "emulator-26101" shell pkginfo --pkg "MyPackage"',
    ],
    [
      "package-info",
      "Package Info DZEPXL2IAG",
      '-s "emulator-26101" shell pkginfo --pkg "DZEPXL2IAG"',
    ],
  ];
  for (const [intentId, request, expected] of cases) {
    check(
      `  ${intentId}: "${request}"`,
      buildCommand(intentId, "emulator-26101", request).command,
      expected,
    );
  }
  // Never mistaken for a package id: a serial (emulator-<port>, the passed-in
  // serial, a long hex hardware serial), a filler left over when nothing
  // follows it (the regex must not backtrack onto "app"/"id"/"the"), or any
  // plain lowercase word ("my", "from", "please") — the token is spliced into
  // pkginfo / pkgcmd, so only id-shaped tokens get through.
  for (const request of [
    "package info on emulator-26101",
    "package info on 0000d8a5f1c2ab",
    "package info please",
    "package info",
    "package info id",
    "package info the",
    "package info app",
    "package info on my device",
    "package info mypkg",
    "package info of installed",
    "uninstall it",
    "uninstall app",
    "uninstall now",
    "uninstall the package from the device",
    "remove the app",
  ]) {
    const intentId = /^(uninstall|remove)/.test(request)
      ? "uninstall"
      : "package-info";
    const r = buildCommand(intentId, "emulator-26101", request);
    check(`  "${request}" → empty command`, r.command, "");
    check(
      `  "${request}" → asks for a package ID`,
      /package ID/.test(r.note),
      true,
    );
  }
  // The serial passed to buildCommand is refused even when it is not
  // emulator-shaped.
  check(
    "  the resolved hardware serial is not a package id",
    buildCommand("package-info", "R3CN30ABCDE", "package info R3CN30ABCDE")
      .command,
    "",
  );
}

// list-packages: both word orders and "application(s)", without stealing
// list-running or install.
console.log("\nTest 7b-2: list-packages phrasing");
for (const [request, expectedId] of [
  ["list installed packages", "list-packages"],
  ["list packages installed", "list-packages"],
  ["show all installed apps", "list-packages"],
  ["show me which apps are installed", "list-packages"],
  ["which packages are installed", "list-packages"],
  ["list installed applications", "list-packages"],
  ["installed packages", "list-packages"],
  ["list running apps", "list-running"],
  ["show running apps", "list-running"],
  ["install this tpk", "install"],
  ["uninstall dZEpxl2iAg", "uninstall"],
]) {
  check(`  "${request}"`, matchIntent(request)?.id, expectedId);
}
check(
  "  'list apps' (no 'installed') is not list-packages",
  matchIntent("list apps")?.id !== "list-packages",
  true,
);

// Test 7c: restarting an emulator is never a guest reboot. Under WHPX (Windows)
// the vCPU reset kills the QEMU process ("WHPX: Unexpected VP exit code 4") and
// the VM never comes back, so "reboot the emulator" hands off to the emulator
// skills, and a gated reboot/shutdown aimed at an emulator serial carries a note
// naming the stop → cold-start path.
console.log("\nTest 7c: emulator restart guidance");
{
  for (const req of [
    "reboot the emulator",
    "restart the emulator",
    "emulator restart please",
    "please reboot my emulator now",
  ]) {
    const m = matchIntent(req);
    check(`  "${req}" → emulator-restart`, m && m.id, "emulator-restart");
    check(
      `  "${req}" hands off to tizen-device-manager`,
      m && m.handoff,
      "tizen-device-manager",
    );
    check(
      `  "${req}" hint names tizen-launch-emulator`,
      /tizen-launch-emulator/.test((m && m.handoffHint) || ""),
      true,
    );
  }
  // Plain device wording keeps the gated intents; "restart the app" is not a
  // reboot; "factory reset the emulator" stays a factory reset.
  check(
    "  'reboot the device' → reboot",
    matchIntent("reboot the device")?.id,
    "reboot",
  );
  check("  'reboot' → reboot", matchIntent("reboot")?.id, "reboot");
  check(
    "  'power off the device' → shutdown",
    matchIntent("power off the device")?.id,
    "shutdown",
  );
  check(
    "  'restart the app org.x.y' is not a reboot",
    matchIntent("restart the app org.x.y")?.id !== "reboot" &&
      matchIntent("restart the app org.x.y")?.id !== "emulator-restart",
    true,
  );
  check(
    "  'factory reset the emulator' → factory-reset",
    matchIntent("factory reset the emulator")?.id,
    "factory-reset",
  );

  const emuReboot = buildCommand(
    "reboot",
    "emulator-26101",
    "reboot the device",
  );
  check(
    "  reboot on emulator serial keeps the gated command",
    emuReboot.command,
    '-s "emulator-26101" shell reboot',
  );
  check(
    "  reboot on emulator serial carries the WHPX note",
    /WHPX/.test(emuReboot.note || "") &&
      /tizen-device-manager/.test(emuReboot.note || "") &&
      /tizen-launch-emulator/.test(emuReboot.note || ""),
    true,
  );
  const emuShutdown = buildCommand("shutdown", "emulator-26101", "shutdown");
  check(
    "  shutdown on emulator serial carries the note",
    /tizen-launch-emulator/.test(emuShutdown.note || ""),
    true,
  );
  const hwReboot = buildCommand("reboot", "0000d8a5f1c2", "reboot the device");
  check("  reboot on hardware serial has no note", hwReboot.note, undefined);
  check(
    "  reboot on hardware serial keeps the command",
    hwReboot.command,
    '-s "0000d8a5f1c2" shell reboot',
  );
}

// Test 8: source guard — the sdb server is started once (ensureSdbServer)
// before any piped runSdb / resolveSerial call. A cold daemon holds the pipe
// open until the timeout, which surfaced as a false io_error on the first
// call of a session (see sdb.js ensureSdbServer).
console.log("\nTest 8: cold-sdb source guard");
{
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "../core/sdb-helper.js"),
    "utf-8",
  );
  const body = src.slice(src.indexOf("async function runSdbCommand("));
  const ensureAt = body.indexOf("ensureSdbServer(sdbPath)");
  const firstRun = body.indexOf("runSdb(sdbPath");
  const firstResolve = body.indexOf("resolveSerial(sdbPath");
  check("  runSdbCommand calls ensureSdbServer", ensureAt !== -1, true);
  check("  ...before the first runSdb", ensureAt < firstRun, true);
  check("  ...before resolveSerial", ensureAt < firstResolve, true);
  check(
    "  no hand-rolled start-server retry remains",
    /runSdb\(sdbPath, "start-server"\)/.test(body),
    false,
  );
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
