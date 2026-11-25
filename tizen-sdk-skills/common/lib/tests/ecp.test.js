// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * ecp tests — the pure (no-SDK, no-emulator) parts of the ECP domain:
 *   - matchEcpIntent: intent classification order, version/profile/target
 *     extraction, and the pass-through contract — the unknown-command intent
 *     carries the request tokens verbatim so ecp-cli can reject what it does
 *     not know (regression: the tokens used to be dropped, running a bare
 *     `ecp-cli --target <t>`)
 *   - requestTokens: fillers, the version/profile/emulator/vm keywords and
 *     bare version numbers are dropped; command tokens are not
 *   - escapeCmdToken: cmd.exe metacharacters are caret-escaped, so a token
 *     from the natural-language request cannot inject a second command
 */

const {
  INTENTS,
  matchEcpIntent,
  requestTokens,
  escapeCmdToken,
} = require("../core/ecp");

console.log("=== ecp Test ===\n");

let failures = 0;
let checks = 0;

function check(name, actual, expected) {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Test 1: intent classification
console.log("Test 1: intent classification");
const intentCases = [
  // list-devices — English and Korean phrasings
  [
    "what devices are available for version 9.0, profile tv",
    INTENTS.LIST_DEVICES,
  ],
  ["which device types are supported", INTENTS.LIST_DEVICES],
  ["list platforms", INTENTS.LIST_DEVICES],
  ["지원 기기 목록 보여줘", INTENTS.LIST_DEVICES],
  ["어떤 디바이스를 쓸 수 있어?", INTENTS.LIST_DEVICES],
  // help — without a version/profile it stays help, not list-devices
  ["help", INTENTS.HELP],
  ["help battery", INTENTS.HELP],
  ["what commands are available", INTENTS.HELP],
  ["명령 목록 보여줘", INTENTS.HELP],
  // help + version/profile ⇒ list-devices
  ["help for version 9.0", INTENTS.LIST_DEVICES],
  // battery
  ["battery status", INTENTS.BATTERY],
  ["set the battery level to 50", INTENTS.BATTERY],
  ["배터리 상태", INTENTS.BATTERY],
  // anything else passes through as a command
  ["set resolution 1024x600", INTENTS.COMMAND],
  ["rotate left", INTENTS.COMMAND],
];
for (const [request, expected] of intentCases) {
  check(`"${request}" → ${expected}`, matchEcpIntent(request).intent, expected);
}

// Test 2: version / profile extraction
console.log("Test 2: version / profile extraction");
check(
  "explicit version and profile are extracted",
  matchEcpIntent("what devices are available for version 9.0, profile tv"),
  {
    intent: INTENTS.LIST_DEVICES,
    target: null,
    version: "9.0",
    profile: "tv",
    args: [],
  },
);
check(
  "bare version numbers are picked up",
  matchEcpIntent("list devices for 8.0").version,
  "8.0",
);
check(
  "wearable maps to a profile",
  matchEcpIntent("what devices for wearable").profile,
  "wearable",
);
check(
  "'tizen' names the unified profile",
  matchEcpIntent("tizen 10.0 devices").profile,
  "tizen",
);
check(
  "no version in the request → null",
  matchEcpIntent("battery status").version,
  null,
);

// Test 3: target extraction
console.log("Test 3: target extraction");
check(
  "an emulator-<port> serial is the target",
  matchEcpIntent("battery status on emulator-26101").target,
  "emulator-26101",
);
check(
  "'on <vm>' names the target",
  matchEcpIntent("battery status on my-vm").target,
  "my-vm",
);
check(
  "a stopword after on/for/to is skipped, a later vm is taken",
  matchEcpIntent("battery on the earphone on my-vm").target,
  "my-vm",
);
check(
  "'set the battery level to 50' never names a target",
  matchEcpIntent("set the battery level to 50").target,
  null,
);
check(
  "an explicit --target option wins over the request text",
  matchEcpIntent("battery status on my-vm", { target: "other-vm" }).target,
  "other-vm",
);

// Test 4: battery arguments — fillers dropped, values kept
console.log("Test 4: battery arguments");
check(
  "'set the battery level to 50' → battery level 50 (the ecp-cli battery grammar)",
  matchEcpIntent("set the battery level to 50").args,
  ["level", "50"],
);
check(
  "'battery level 75' passes the level subcommand through",
  matchEcpIntent("battery level 75").args,
  ["level", "75"],
);
check(
  "a bare number after 'battery' maps to the level subcommand",
  matchEcpIntent("battery 75").args,
  ["level", "75"],
);
check(
  "'battery charger off' keeps the charger state",
  matchEcpIntent("battery charger off").args,
  ["charger", "off"],
);
check(
  "'turn the battery charger on' keeps the charger state",
  matchEcpIntent("turn the battery charger on").args,
  ["charger", "on"],
);
check(
  "'battery status' ignores trailing tokens (status takes no arguments)",
  matchEcpIntent("battery status").args,
  ["status"],
);
check(
  "'battery version 9.0' does not map a version fragment to a level",
  matchEcpIntent("battery version 9.0").args,
  ["version", "9.0"],
);
check(
  "'help battery' keeps the device token for per-device help",
  matchEcpIntent("help battery").args,
  ["battery"],
);
check(
  "'help me with battery' skips prepositions before the device token",
  matchEcpIntent("help me with battery").args,
  ["battery"],
);
check("bare 'help' keeps no arguments", matchEcpIntent("help").args, []);
check("bare 'battery' keeps no arguments", matchEcpIntent("battery").args, []);

// Test 5: pass-through (unknown command) arguments — regression
console.log("Test 5: pass-through command arguments");
check(
  "the command text survives verbatim (used to be dropped)",
  matchEcpIntent("set resolution 1024x600").args,
  ["set", "resolution", "1024x600"],
);
check(
  "'restart the emulator' → restart (the emulator word itself is dropped)",
  matchEcpIntent("restart the emulator").args,
  ["restart"],
);
check(
  "fillers are dropped; the target token stays in args (buildArgs filters it)",
  matchEcpIntent("set rotation to landscape on my-vm please").args,
  ["set", "rotation", "landscape", "my-vm"],
);
check(
  "bare version numbers are not passed as command arguments",
  matchEcpIntent("set platform version 9.0").args,
  ["set", "platform"],
);

// Test 6: requestTokens
console.log("Test 6: requestTokens");
check(
  "quotes, fillers, keywords and version numbers are dropped",
  requestTokens('set the "brightness" to level 7 of version 9.0'),
  ["set", "brightness", "7"],
);
check(
  "numbers that are not version numbers survive",
  requestTokens("set resolution 1024x600"),
  ["set", "resolution", "1024x600"],
);

// Test 7: escapeCmdToken — host shell safety
console.log("Test 7: escapeCmdToken");
const escapeCases = [
  ["status", "status"],
  ["a&calc", "a^&calc"],
  ["a&&b", "a^&^&b"],
  ["a|b", "a^|b"],
  ["a;b", "a^;b"],
  ["a>b", "a^>b"],
  ["(x)", "^(x^)"],
  ["50%", "50^%"],
  ['say"hi', 'say^"hi'],
];
for (const [token, expected] of escapeCases) {
  check(
    `escapeCmdToken(${JSON.stringify(token)})`,
    escapeCmdToken(token),
    expected,
  );
}

console.log(`\n${checks} checks run, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
