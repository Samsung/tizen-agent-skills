// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * emulator size-resolution tests
 *
 * `em-cli create` has no width/height flag — resolution is a property of the
 * device template — so asking for a screen size means picking the template that
 * carries it. These are the pure functions that do that mapping, covered here
 * without needing an installed SDK or a real em-cli.
 *
 * The regression worth guarding: "HD3840 TV" is 3840x1080, so keying the size
 * off the resolution *height* makes 1080 ambiguous between it and "HD1080 TV" —
 * a user asking for 1080 could get an ultra-wide VM.
 */

const {
  parseTemplateDetails,
  normalizeSize,
  matchTemplateForSize,
  parsePlatformList,
  pickPlatform,
} = require("../core/emulator");

console.log("=== emulator size Test ===\n");

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

// Real script output: em-cli repeats the TV templates, so the same name arrives twice.
const SCRIPT_OUTPUT = [
  "[INFO]  Detected OS: linux",
  "[INFO]  Listing available templates...",
  "[OK]    Found templates: HD1080 TV,HD3840 TV",
  "TEMPLATE_LIST=HD1080 TV,HD3840 TV",
  "TEMPLATE_DETAIL=HD1080 TV|tv|1920x1080|512",
  "TEMPLATE_DETAIL=HD3840 TV|tv|3840x1080|512",
  "TEMPLATE_DETAIL=HD1080 TV|tv|1920x1080|512",
  "TEMPLATE_DETAIL=HD3840 TV|tv|3840x1080|512",
].join("\n");

const TIZEN_DETAILS = parseTemplateDetails(
  [
    "TEMPLATE_DETAIL=HD1080 Tizen|tizen|1920x1080|512",
    "TEMPLATE_DETAIL=HD720 Tizen|tizen|1280x720|512",
  ].join("\n"),
);
const TV_DETAILS = parseTemplateDetails(SCRIPT_OUTPUT);

// Test 1: parseTemplateDetails
console.log("--- parseTemplateDetails ---");
check("empty string returns []", parseTemplateDetails(""), []);
check("undefined returns []", parseTemplateDetails(undefined), []);
check(
  "output with no TEMPLATE_DETAIL lines returns []",
  parseTemplateDetails("TEMPLATE_LIST=HD1080 TV\n[OK] done"),
  [],
);
check("duplicate names are deduped", TV_DETAILS.length, 2);
check("fields are parsed off the pipe-delimited line", TV_DETAILS[0], {
  name: "HD1080 TV",
  profile: "tv",
  resolution: "1920x1080",
  size: "1080",
  ram: "512",
});
check(
  "size comes from the name, not the resolution height",
  TV_DETAILS.map((t) => t.size),
  ["1080", "3840"],
);
check(
  "a template named without a number falls back to resolution height",
  parseTemplateDetails("TEMPLATE_DETAIL=Wearable|tizen|360x360|512")[0].size,
  "360",
);

// em-cli prints errors as unindented lines, which the block parser cannot tell
// from a template name. Without the resolution guard, a bad --platform turned
// into a zero-size "template" and the caller was told "size 1080 is not
// available" instead of "nonexistent-platform does not match any platform".
check(
  "an em-cli error line is not mistaken for a template",
  parseTemplateDetails(
    "TEMPLATE_DETAIL=Error: nonexistent-platform does not match any platform|||",
  ),
  [],
);
check(
  "a real template survives alongside an error line",
  parseTemplateDetails(
    [
      "TEMPLATE_DETAIL=Error: something went wrong|||",
      "TEMPLATE_DETAIL=HD720 Tizen|tizen|1280x720|512",
    ].join("\n"),
  ).map((t) => t.name),
  ["HD720 Tizen"],
);

// Test 2: normalizeSize
console.log("\n--- normalizeSize ---");
check("plain height", normalizeSize("1080"), "1080");
check("trailing p", normalizeSize("1080p"), "1080");
check("HD prefix", normalizeSize("HD1080"), "1080");
check("surrounding whitespace", normalizeSize("  1080 "), "1080");
check("numeric input", normalizeSize(1080), "1080");
check(
  "full resolution passes through",
  normalizeSize("1920x1080"),
  "1920x1080",
);
check("uppercase X in resolution", normalizeSize("1920X1080"), "1920x1080");
check("undefined is unusable", normalizeSize(undefined), "");
check("empty string is unusable", normalizeSize(""), "");
check("non-numeric is unusable", normalizeSize("big"), "");
check("junk suffix is unusable", normalizeSize("1080xyz"), "");

// Test 3: matchTemplateForSize
console.log("\n--- matchTemplateForSize ---");
check(
  "1080 + tizen picks HD1080 Tizen",
  matchTemplateForSize(TIZEN_DETAILS, "1080", "tizen").name,
  "HD1080 Tizen",
);
check(
  "720 + tizen picks HD720 Tizen",
  matchTemplateForSize(TIZEN_DETAILS, "720", "tizen").name,
  "HD720 Tizen",
);
check(
  "1080 + tv picks HD1080 TV, not the 3840x1080 ultra-wide",
  matchTemplateForSize(TV_DETAILS, "1080", "tv").name,
  "HD1080 TV",
);
check(
  "3840 + tv picks HD3840 TV",
  matchTemplateForSize(TV_DETAILS, "3840", "tv").name,
  "HD3840 TV",
);
check(
  "full resolution matches exactly",
  matchTemplateForSize(TIZEN_DETAILS, "1280x720", "tizen").name,
  "HD720 Tizen",
);
check(
  "unavailable size returns null",
  matchTemplateForSize(TIZEN_DETAILS, "1440", "tizen"),
  null,
);
check(
  "wrong profile has no candidates of its own, so nothing matches",
  matchTemplateForSize(TIZEN_DETAILS, "3840", "tizen"),
  null,
);
check(
  "empty size returns null",
  matchTemplateForSize(TIZEN_DETAILS, "", "tizen"),
  null,
);
check(
  "empty details returns null",
  matchTemplateForSize([], "1080", "tizen"),
  null,
);

// The platform-qualified duplicate is what `em-cli list-template` prints; em-cli
// resolves either form, but the plain name is what its own docs use.
const SUFFIXED = parseTemplateDetails(
  [
    "TEMPLATE_DETAIL=HD1080 TV (tv-samsung-10.0-x86_64)|tv|1920x1080|512",
    "TEMPLATE_DETAIL=HD1080 TV|tv|1920x1080|512",
  ].join("\n"),
);
check(
  "plain name is preferred over the platform-qualified duplicate",
  matchTemplateForSize(SUFFIXED, "1080", "tv").name,
  "HD1080 TV",
);

// A template that reports no profile is kept rather than dropped, so an older
// em-cli that omits the field does not leave the caller with zero choices.
const NO_PROFILE = parseTemplateDetails(
  "TEMPLATE_DETAIL=HD1080 Tizen||1920x1080|512",
);
check(
  "template with no profile field still matches",
  matchTemplateForSize(NO_PROFILE, "1080", "tizen").name,
  "HD1080 Tizen",
);

// Issue #48: a create without --platform used to skip the size→template lookup
// and silently produce em-cli's default 720x1280 VM. The platform is now
// resolved from list-platform with the scripts' own pick rule.
console.log("\n--- parsePlatformList / pickPlatform ---");
const PLATFORM_OUTPUT = [
  "[INFO]  Listing available emulator platforms (profile: tizen)...",
  "[OK]    Found platforms (tizen): tizen-10.0-x86_64,tizen-11.0-x86_64",
  "PLATFORM_LIST=tizen-10.0-x86_64, tizen-11.0-x86_64",
  "PROFILE=tizen",
].join("\n");
check(
  "PLATFORM_LIST csv is parsed and trimmed",
  parsePlatformList(PLATFORM_OUTPUT),
  ["tizen-10.0-x86_64", "tizen-11.0-x86_64"],
);
check("empty PLATFORM_LIST= is []", parsePlatformList("PLATFORM_LIST=\n"), []);
check("no PLATFORM_LIST line is []", parsePlatformList("[INFO] nothing"), []);
check(
  "tizen profile picks the first non-tv image",
  pickPlatform(
    ["tv-samsung-10.0-x86_64", "tizen-10.0-x86_64", "tizen-11.0-x86_64"],
    "tizen",
  ),
  "tizen-10.0-x86_64",
);
check(
  "tv profile picks the first tv image",
  pickPlatform(["tizen-10.0-x86_64", "tv-samsung-10.0-x86_64"], "tv"),
  "tv-samsung-10.0-x86_64",
);
check(
  "tizen profile with only tv images installed resolves to null (error, not a tv VM)",
  pickPlatform(["tv-samsung-10.0-x86_64"], "tizen"),
  null,
);
check(
  "tv profile with no tv image is null",
  pickPlatform(["tizen-10.0-x86_64"], "tv"),
  null,
);
check("empty list is null", pickPlatform([], "tizen"), null);

// Source-level guard for the create-path wiring: the platform is resolved when
// none was given, and the create envelope reports the OBSERVED launch state.
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(
  path.join(__dirname, "../core/emulator.js"),
  "utf8",
);
const createBody = source.slice(
  source.indexOf("async function createEmulator"),
  source.indexOf("async function launchEmulator"),
);
check(
  "createEmulator resolves a missing platform via list-platform + pickPlatform",
  /if \(!platform\) \{[\s\S]*?action: "list-platform"[\s\S]*?platform = pickPlatform\(listed, profile\)/.test(
    createBody,
  ),
  true,
);
check(
  "create envelope reports launched from the observed serial, not the request",
  /launched: Boolean\(launchedSerial\)/.test(createBody),
  true,
);
check(
  "a create --launch whose emulator never connected is status created_launch_timeout",
  /"created_launch_timeout"/.test(createBody) &&
    /const launchTimedOut = launch && !launchedSerial/.test(createBody),
  true,
);

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
