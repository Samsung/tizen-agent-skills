// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-install-rootstrap.sh — rootstrap XML filename handling.
 *
 * Runs the real installer script against a throwaway SDK root (a directory
 * holding only sdk.info) and synthetic rootstrap ZIPs, so nothing touches the
 * developer's SDK. Requires bash, zip and unzip: the whole file is skipped
 * (exit 0) on Windows or when either tool is missing.
 *
 * Regression: the script matched `*.core.*.*.xml` only, so a ZIP in the Tizen
 * SDK repository format — whose definition file is
 * tools/smart-build-interface/plugins/{profile}-{version}-{device}.core.xml,
 * exactly like the SDK's own plugins directory — failed with "No rootstrap XML
 * files found matching pattern *.core.*.xml". The timestamped custom format
 * {profile}-{version}-{device}.core.{public|private}.{timestamp}.xml must keep
 * working, and the marker line must still read "<name> (XML: <path>)" — the
 * marker writer used to read a 6-field record into 5 variables.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

console.log("=== install-rootstrap script Test ===\n");

const SCRIPT = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "tizen-install-rootstrap",
  "tizen-install-rootstrap.sh",
);

function has(tool) {
  return spawnSync("sh", ["-c", `command -v ${tool}`]).status === 0;
}

if (
  process.platform === "win32" ||
  !has("bash") ||
  !has("zip") ||
  !has("unzip")
) {
  console.log(
    "SKIP  needs bash, zip and unzip (POSIX host) — nothing to run here",
  );
  process.exit(0);
}

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-rootstrap-"));

/** Build a data/-layout rootstrap ZIP whose plugin XML has the given name. */
function makeZip(label, xmlName, rootstrapDirName) {
  const stage = path.join(workDir, `stage-${label}`);
  const plugins = path.join(
    stage,
    "data",
    "tools",
    "smart-build-interface",
    "plugins",
  );
  const rootstrap = path.join(
    stage,
    "data",
    "platforms",
    "tizen-10.0",
    "tizen",
    "rootstraps",
    rootstrapDirName,
  );
  fs.mkdirSync(plugins, { recursive: true });
  fs.mkdirSync(path.join(rootstrap, "usr", "include"), { recursive: true });
  fs.writeFileSync(
    path.join(plugins, xmlName),
    '<?xml version="1.0"?>\n<extension point="rootstrapDefinition"/>\n',
  );
  fs.writeFileSync(path.join(rootstrap, "usr", "include", "stdio.h"), "");
  const zipPath = path.join(workDir, `${label}.zip`);
  const r = spawnSync("zip", ["-qr", zipPath, "data"], {
    cwd: stage,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`zip failed: ${r.stderr}`);
  return zipPath;
}

/** A fresh fake SDK root: just sdk.info, which is all the script checks for. */
function makeSdk(label) {
  const sdk = path.join(workDir, `sdk-${label}`);
  fs.mkdirSync(sdk, { recursive: true });
  fs.writeFileSync(
    path.join(sdk, "sdk.info"),
    "TIZEN_SDK_INSTALLED_PATH=" + sdk + "\n",
  );
  return sdk;
}

function runInstaller(zipPath, sdk, extra = []) {
  const r = spawnSync(
    "bash",
    [SCRIPT, "--zip-path", zipPath, "--sdk-path", sdk, ...extra],
    { encoding: "utf8", timeout: 60000 },
  );
  return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

// -- 1: SDK repository format — the reported failure ------------------------
console.log(
  "--- {profile}-{version}-{device}.core.xml (SDK repository format) ---",
);
{
  const zip = makeZip(
    "repo",
    "tizen-10.0-device.core.xml",
    "tizen-10.0-device.core",
  );
  const sdk = makeSdk("repo");
  const { status, out } = runInstaller(zip, sdk);
  check("installer exits 0", status === 0, out.slice(-600));
  check(
    "no 'No rootstrap XML files found' error",
    !/No rootstrap XML files found/.test(out),
    out.slice(-600),
  );
  check(
    "parsed Profile=tizen, Version=10.0, Device=device",
    /Parsed: Profile=tizen, Version=10\.0, Device=device, Type=-, Timestamp=-/.test(
      out,
    ),
    out,
  );
  check(
    "plugin XML copied into the SDK",
    fs.existsSync(
      path.join(
        sdk,
        "tools",
        "smart-build-interface",
        "plugins",
        "tizen-10.0-device.core.xml",
      ),
    ),
  );
  check(
    "rootstrap tree copied into the SDK",
    fs.existsSync(
      path.join(
        sdk,
        "platforms",
        "tizen-10.0",
        "tizen",
        "rootstraps",
        "tizen-10.0-device.core",
        "usr",
        "include",
        "stdio.h",
      ),
    ),
  );
  const marker = path.join(sdk, ".rootstrap-installed");
  const markerText = fs.existsSync(marker)
    ? fs.readFileSync(marker, "utf8")
    : "";
  check(".rootstrap-installed marker created", markerText.length > 0);
  check(
    "marker line is '<name> (XML: <path>)' with no stray '|' field",
    /^ {2}- tizen-10\.0-device \(XML: \/[^|)]+tizen-10\.0-device\.core\.xml\)$/m.test(
      markerText,
    ),
    markerText,
  );

  // Second run: the marker short-circuits to "already installed", exit 0.
  const again = runInstaller(zip, sdk);
  check(
    "re-run reports already installed and exits 0",
    again.status === 0 && /already installed/.test(again.out),
    again.out.slice(-400),
  );
}

// -- 2: custom timestamped format keeps working ------------------------------
console.log(
  "\n--- {profile}-{version}-{device}.core.{type}.{timestamp}.xml (custom) ---",
);
{
  const zip = makeZip(
    "custom",
    "tv-samsung-8.0-device.core.private.20240101120000.xml",
    "tv-samsung-8.0-device.core.private.20240101120000",
  );
  const sdk = makeSdk("custom");
  const { status, out } = runInstaller(zip, sdk);
  check("installer exits 0", status === 0, out.slice(-600));
  check(
    "parsed profile with a hyphen, type and timestamp",
    /Parsed: Profile=tv-samsung, Version=8\.0, Device=device, Type=private, Timestamp=20240101120000/.test(
      out,
    ),
    out,
  );
  const markerText = fs.readFileSync(
    path.join(sdk, ".rootstrap-installed"),
    "utf8",
  );
  check(
    "marker names tv-samsung-8.0-device",
    /^ {2}- tv-samsung-8\.0-device \(XML: \/[^|)]+\.xml\)$/m.test(markerText),
    markerText,
  );
}

// -- 3: a plugins dir with no rootstrap definition still fails clearly --------
console.log("\n--- no *.core*.xml in plugins/ ---");
{
  const zip = makeZip("none", "README.txt", "tizen-10.0-device.core");
  const sdk = makeSdk("none");
  const { status, out } = runInstaller(zip, sdk);
  check("installer exits 1", status === 1, out.slice(-400));
  check(
    "error names both accepted filename formats",
    /\.core\.xml or .*\.core\.\{public\|private\}\.\{timestamp\}\.xml/.test(
      out,
    ),
    out.slice(-600),
  );
  check(
    "no marker written",
    !fs.existsSync(path.join(sdk, ".rootstrap-installed")),
  );
}

fs.rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
);
process.exit(failures === 0 ? 0 : 1);
