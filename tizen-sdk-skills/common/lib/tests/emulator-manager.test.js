// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * emulator manager tests — argument mapping and -d block parsing
 *
 * These cover the two places a silent wrong answer can enter the full em-cli
 * surface, both without needing an installed SDK:
 *
 *   1. buildEmulatorArgs(). Every new hardware flag has to land on the right
 *      letter. em-cli reuses letters across commands with different meanings
 *      (-c is custom-path on create but compress on create-image; -d is detail
 *      on list-* but output-dir on create-image; -p is profile in our script but
 *      platform in em-cli's own list-template), so a mis-mapped flag does not
 *      error — it quietly configures the wrong thing.
 *
 *   2. The VM_DETAIL / PLATFORM_DETAIL / MANAGER_DETAIL parsers. em-cli wraps
 *      long values onto a continuation line, and it reports failures as an
 *      unindented "Error:" line that looks exactly like a record header. The
 *      fixtures below are verbatim script output captured from a real SDK
 *      (em-cli 10.0, package 2.6.60).
 */

const fs = require("fs");
const path = require("path");

const {
  buildEmulatorArgs,
  manageEmulator,
  parseVmDetails,
  parsePlatformDetails,
  parseManagerDetails,
  parseTemplateDetails,
  MANAGE_ACTIONS,
} = require("../core/emulator");

console.log("=== Emulator Manager Test ===\n");

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

function checkTrue(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: buildEmulatorArgs flag mapping
// ---------------------------------------------------------------------------
console.log("--- buildEmulatorArgs ---");

const baseArgs = buildEmulatorArgs({ action: "list-vm", profile: "tizen" });
check("base unix args", baseArgs.unixArgs, ["-a list-vm", "-p tizen"]);
check("base win args", baseArgs.winArgs, ["-Action list-vm", "-Profile tizen"]);

const fullArgs = buildEmulatorArgs({
  action: "create",
  profile: "tv",
  vmName: "my-vm",
  platform: "tv-samsung-10.0-x86_64",
  template: "HD1080 TV",
  launch: true,
  skin: "2",
  ramSize: "1024",
  fileSharingPath: "/home/me/share",
  hwVirtualization: "no",
  hwGlAcceleration: "yes",
  customPath: "/img/base.x86_64",
  rawImagePath: "/img/raw",
});

// The letters here are the contract with tizen-emulator-manager.sh's getopts
// string. Note -P is platform while -p is profile: the case matters.
check("create unix args", fullArgs.unixArgs, [
  "-a create",
  "-p tv",
  '-n "my-vm"',
  '-P "tv-samsung-10.0-x86_64"',
  '-T "HD1080 TV"',
  "-l",
  "-s 2",
  "-r 1024",
  '-f "/home/me/share"',
  "-w no",
  "-g yes",
  '-c "/img/base.x86_64"',
  '-R "/img/raw"',
]);

check("create win args", fullArgs.winArgs, [
  "-Action create",
  "-Profile tv",
  '-VmName "my-vm"',
  '-Platform "tv-samsung-10.0-x86_64"',
  '-Template "HD1080 TV"',
  "-Launch",
  "-Skin 2",
  "-RamSize 1024",
  '-FileSharingPath "/home/me/share"',
  "-HwVirtualization no",
  "-HwGlAcceleration yes",
  '-CustomPath "/img/base.x86_64"',
  '-RawImagePath "/img/raw"',
]);

const imageArgs = buildEmulatorArgs({
  action: "create-image",
  profile: "tizen",
  vmName: "my-vm",
  outputDir: "/tmp/images",
  compress: true,
});
check("create-image unix args", imageArgs.unixArgs, [
  "-a create-image",
  "-p tizen",
  '-n "my-vm"',
  '-o "/tmp/images"',
  "-z",
]);

const listArgs = buildEmulatorArgs({
  action: "list-vm",
  profile: "tizen",
  detail: true,
  count: true,
});
check("list flags map to -d and -C", listArgs.unixArgs, [
  "-a list-vm",
  "-p tizen",
  "-d",
  "-C",
]);

const launchArgs = buildEmulatorArgs({
  action: "launch",
  profile: "tizen",
  vmName: "my-vm",
  timeoutSec: 120,
  emulatorPath: "/opt/emu/bin",
});
check("launch unix args", launchArgs.unixArgs, [
  "-a launch",
  "-p tizen",
  '-n "my-vm"',
  "-t 120",
  '-E "/opt/emu/bin"',
]);

// Falsy options must not emit a bare flag with no value.
const sparseArgs = buildEmulatorArgs({
  action: "detail",
  profile: "tizen",
  vmName: "",
  template: undefined,
  skin: "",
  ramSize: null,
  compress: false,
  detail: false,
});
check("falsy options are omitted entirely", sparseArgs.unixArgs, [
  "-a detail",
  "-p tizen",
]);

// ---------------------------------------------------------------------------
// Test 2: VM_DETAIL parsing
// ---------------------------------------------------------------------------
console.log("\n--- parseVmDetails ---");

// Verbatim script output. The skin path is the interesting part: em-cli wraps it
// across two lines at ~80 columns and the script rejoins it, so what arrives
// here is already a single value.
const VM_DETAIL_OUTPUT = [
  "[INFO]  Detected OS: linux",
  "VM_LIST=tizen-vm-1080,tizen-tv-vm",
  "VM_COUNT=2",
  "VM_DETAIL=tizen-vm-1080|tizen-10.0-x86_64|HD1080 Tizen|1920x1080|1024|x86_64|4|standard|/home/user/tizen-sdk/platforms/common/tizen/emulator-resources/skins/tizen-general-3btn",
  "VM_DETAIL=tizen-tv-vm|tv-samsung-10.0-x86_64|HD1080 TV|1920x1080|1024|x86_64|4|standard|/home/user/tizen-sdk/platforms/tizen-10.0/tv-samsung/emulator-resources/skins/tv-1920x1080",
].join("\n");

const vmDetails = parseVmDetails(VM_DETAIL_OUTPUT);

check("empty string returns []", parseVmDetails(""), []);
check("undefined returns []", parseVmDetails(undefined), []);
check(
  "output with no VM_DETAIL lines returns []",
  parseVmDetails("VM_LIST=a,b\n[OK] done"),
  [],
);
check("both records are parsed", vmDetails.length, 2);
check("first record fields", vmDetails[0], {
  name: "tizen-vm-1080",
  platform: "tizen-10.0-x86_64",
  template: "HD1080 Tizen",
  resolution: "1920x1080",
  ram: "1024",
  cpu_arch: "x86_64",
  cpu_count: "4",
  type: "standard",
  skin_path:
    "/home/user/tizen-sdk/platforms/common/tizen/emulator-resources/skins/tizen-general-3btn",
});

// A record the script emitted with trailing fields missing must not produce
// undefined properties — callers render these directly.
check(
  "missing trailing fields become empty strings, not undefined",
  parseVmDetails("VM_DETAIL=bare-vm|tizen-10.0-x86_64")[0],
  {
    name: "bare-vm",
    platform: "tizen-10.0-x86_64",
    template: "",
    resolution: "",
    ram: "",
    cpu_arch: "",
    cpu_count: "",
    type: "",
    skin_path: "",
  },
);

check(
  "a record with an empty header is dropped",
  parseVmDetails("VM_DETAIL=|tizen-10.0-x86_64|HD1080 Tizen"),
  [],
);

// ---------------------------------------------------------------------------
// Test 3: PLATFORM_DETAIL parsing
// ---------------------------------------------------------------------------
console.log("\n--- parsePlatformDetails ---");

// em-cli brackets the image path ("[/home/...]"); the script strips the
// brackets, so the caller never has to.
const PLATFORM_DETAIL_OUTPUT = [
  "PLATFORM_LIST=tizen-10.0-x86_64",
  "PROFILE=tizen",
  "PLATFORM_DETAIL=tizen-10.0-x86_64|tizen|10.0|x86_64|square|/home/user/tizen-sdk/platforms/tizen-10.0/tizen/emulator-images/tizen-10.0-x86_64/emulimg-10.0.x86_64",
].join("\n");

check("platform record fields", parsePlatformDetails(PLATFORM_DETAIL_OUTPUT), [
  {
    name: "tizen-10.0-x86_64",
    profile: "tizen",
    version: "10.0",
    cpu_arch: "x86_64",
    skin_shape: "square",
    image_path:
      "/home/user/tizen-sdk/platforms/tizen-10.0/tizen/emulator-images/tizen-10.0-x86_64/emulimg-10.0.x86_64",
  },
]);
check("no platform lines returns []", parsePlatformDetails("VM_LIST=a"), []);

// ---------------------------------------------------------------------------
// Test 4: MANAGER_DETAIL parsing
// ---------------------------------------------------------------------------
console.log("\n--- parseManagerDetails ---");

const MANAGER_DETAIL_OUTPUT = [
  "MANAGER_DETAIL=Version|10.0",
  "MANAGER_DETAIL=Build time|20251104-1312",
  "MANAGER_DETAIL=Workspace path|/home/user/tizen-sdk-data/emulator/vms",
  "MANAGER_DETAIL=Package version|2.6.60",
].join("\n");

check(
  "manager info is keyed by em-cli's labels",
  parseManagerDetails(MANAGER_DETAIL_OUTPUT),
  {
    Version: "10.0",
    "Build time": "20251104-1312",
    "Workspace path": "/home/user/tizen-sdk-data/emulator/vms",
    "Package version": "2.6.60",
  },
);
check("empty output returns {}", parseManagerDetails(""), {});
check(
  "a line with no pipe separator is skipped",
  parseManagerDetails("MANAGER_DETAIL=NoSeparator"),
  {},
);

// ---------------------------------------------------------------------------
// Test 5: TEMPLATE_DETAIL back-compat
// ---------------------------------------------------------------------------
console.log("\n--- TEMPLATE_DETAIL back-compat ---");

// The consolidated script replaced a bespoke awk parser with a generic one.
// TEMPLATE_DETAIL's field order is a contract that predates it, and
// createEmulator's whole size-resolution path depends on it.
const TEMPLATE_OUTPUT = [
  "TEMPLATE_LIST=HD1080 Tizen,HD720 Tizen",
  "TEMPLATE_DETAIL=HD1080 Tizen|tizen|1920x1080|512",
  "TEMPLATE_DETAIL=HD720 Tizen|tizen|1280x720|512",
].join("\n");

check(
  "template field order is unchanged",
  parseTemplateDetails(TEMPLATE_OUTPUT)[0],
  {
    name: "HD1080 Tizen",
    profile: "tizen",
    resolution: "1920x1080",
    size: "1080",
    ram: "512",
  },
);

// ---------------------------------------------------------------------------
// Test 6: script/spec surface agreement
// ---------------------------------------------------------------------------
console.log("\n--- surface agreement ---");

const SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/tizen-emulator-manager/tizen-emulator-manager.sh",
);
const PS_SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/tizen-emulator-manager/tizen-emulator-manager.ps1",
);
const SCRIPT = fs.readFileSync(SCRIPT_PATH, "utf8");
const PS_SCRIPT = fs.readFileSync(PS_SCRIPT_PATH, "utf8");

// Ten em-cli commands plus fix-homescreen (the WSL home screen repair, which is
// not an em-cli command but shares this action surface).
check(
  "MANAGE_ACTIONS covers all em-cli commands plus fix-homescreen",
  MANAGE_ACTIONS.length,
  11,
);

for (const action of MANAGE_ACTIONS) {
  checkTrue(
    `bash script handles action '${action}'`,
    SCRIPT.includes(`"$ACTION" = "${action}"`),
    `No dispatch block for ${action} in tizen-emulator-manager.sh`,
  );
}

// The .ps1 cannot be executed in CI on Linux, so hold it to the same surface
// by inspection — a missing action there is a Windows-only outage otherwise.
for (const action of MANAGE_ACTIONS) {
  checkTrue(
    `powershell script handles action '${action}'`,
    PS_SCRIPT.includes(`$Action -eq "${action}"`),
    `No dispatch block for ${action} in tizen-emulator-manager.ps1`,
  );
}

checkTrue(
  "powershell ValidateSet lists every action",
  MANAGE_ACTIONS.every((a) => PS_SCRIPT.includes(`"${a}"`)),
  "param() ValidateSet is missing an action the sh script accepts",
);

// list-vm must not turn a broken em-cli into "0 VMs" (issue #41). The bash
// twin is exercised for real in emulator-fallback.test.js; hold the .ps1 to the
// same contract by inspection: its list-vm block checks $LASTEXITCODE and does
// not swallow stderr with 2>$null.
{
  const start = PS_SCRIPT.indexOf('if ($Action -eq "list-vm")');
  const next = PS_SCRIPT.indexOf("# Action:", start + 1);
  const block =
    start >= 0 ? PS_SCRIPT.slice(start, next > start ? next : undefined) : "";
  checkTrue(
    "powershell list-vm block exists",
    block.length > 0,
    "No list-vm dispatch block in tizen-emulator-manager.ps1",
  );
  checkTrue(
    "powershell list-vm checks em-cli's exit code",
    /\$LASTEXITCODE/.test(block),
    "list-vm must fail when em-cli list-vm fails instead of reporting VM_COUNT=0",
  );
  checkTrue(
    "powershell list-vm captures the listing with 2>&1, not Get-VmList / 2>$null",
    /\$listRaw = Invoke-EmCli "list-vm" 2>&1/.test(block) &&
      /\$countRaw = Invoke-EmCli "list-vm", "-c" 2>&1/.test(block) &&
      !/Get-VmList/.test(block),
    "Capture with 2>&1 so the Java trace reaches the envelope",
  );
}

// Issue #82 — em-cli failure reporting and the Windows hang.
// (a) The scripts' own warning text must not contain JAVA_JNA_PATTERN tokens
//     ("jna", "NoClassDefFoundError", …): lib/core/emulator.js used to match
//     the pattern against the whole captured output, so every em-cli failure
//     read as a JNA crash. The raw em-cli output is now fenced by
//     EMCLI_OUTPUT_BEGIN/END and the exit code is a machine line.
// (b) The .ps1 runs EVERY em-cli call through Start-Process with file-based
//     stdin/stdout/stderr redirection and a wall-clock cap; the old inline
//     `& java …` inherited the console and hung for the runner's 30-minute
//     ceiling under Codex CLI.
{
  const { JAVA_JNA_PATTERN } = require("../core/emulator");
  const shReporter = SCRIPT.slice(
    SCRIPT.indexOf("report_emcli_failure() {"),
    SCRIPT.indexOf("emcli_ro() {"),
  );
  const psReporter = PS_SCRIPT.slice(
    PS_SCRIPT.indexOf("function Report-EmCliFailure {"),
    PS_SCRIPT.indexOf("function Test-EmCliFailed {"),
  );
  for (const [label, body] of [
    ["bash", shReporter],
    ["powershell", psReporter],
  ]) {
    checkTrue(
      `${label} report_emcli_failure exists`,
      body.length > 0,
      "reporter block not found",
    );
    // The unconditional wording ("Java/JNA dependency issue", the
    // 'com/sun/jna' / 'NoClassDefFoundError' guidance) is gone; the
    // NoSuchFieldError branch only prints when em-cli's output already
    // matched, and the markers keep it out of the classified text anyway.
    checkTrue(
      `${label} reporter's unconditional warnings carry no JAVA_JNA_PATTERN token`,
      !/Java\/JNA dependency issue/.test(body) &&
        !/com\/sun\/jna/.test(body) &&
        !/'NoClassDefFoundError'/.test(body) &&
        !JAVA_JNA_PATTERN.test(
          body
            .split(/\r?\n/)
            .filter((l) =>
              /em-cli failed on|produced no output|Java stack trace about/.test(
                l,
              ),
            )
            .join("\n"),
        ),
      "a warning line still matches JAVA_JNA_PATTERN",
    );
    checkTrue(
      `${label} reporter fences the em-cli output with EMCLI_OUTPUT_BEGIN/END`,
      /EMCLI_OUTPUT_BEGIN/.test(body) && /EMCLI_OUTPUT_END/.test(body),
      "markers missing",
    );
    checkTrue(
      `${label} reporter emits the EMCLI_EXIT= machine line`,
      /EMCLI_EXIT=/.test(body),
      "EMCLI_EXIT missing",
    );
  }
  const invoke = PS_SCRIPT.slice(
    PS_SCRIPT.indexOf("function Invoke-EmCli {"),
    PS_SCRIPT.indexOf("function Report-EmCliFailure {"),
  );
  checkTrue(
    "powershell Invoke-EmCli no longer runs java inline (inherited console)",
    !/&\s+"\$javaExe"\s+-cp/.test(invoke),
    "an inline & java call remains",
  );
  checkTrue(
    "powershell Invoke-EmCli redirects stdin/stdout/stderr through files for every call",
    /-RedirectStandardInput/.test(invoke) &&
      /-RedirectStandardOutput/.test(invoke) &&
      /-RedirectStandardError/.test(invoke) &&
      /\$proc = Start-Process/.test(invoke) &&
      !/else \{\s*\r?\n\s*& "\$javaExe" -cp/.test(invoke),
    "redirection must not be limited to the -Stdin branch",
  );
  checkTrue(
    "powershell Invoke-EmCli caps read-only calls with WaitForExit(timeout) and exit 124",
    /WaitForExit\(\$timeoutMs\)/.test(invoke) &&
      /\$rc = 124/.test(invoke) &&
      /\$global:LASTEXITCODE = \$rc/.test(invoke) &&
      /TIZEN_EMCLI_TIMEOUT_MS/.test(invoke) &&
      /"list-vm", "list-platform", "list-template", "detail"/.test(invoke),
    "timeout handling missing",
  );
  // (c) Issue #82 follow-up (Windows): the Start-Process rewrite above left two
  //     holes that made EVERY healthy em-cli call read as a failure —
  //     $proc.ExitCode is $null unless the handle was opened before the process
  //     exited (so `$null -ne 0` took the failure branch), and the output went
  //     to [Console]::Out instead of the pipeline (so `$raw = Invoke-EmCli …`
  //     was empty and the reporter said "produced no output at all").
  const DM_PS_SCRIPT = fs.readFileSync(
    path.join(
      __dirname,
      "../../scripts/tizen-device-manager/tizen-device-manager.ps1",
    ),
    "utf8",
  );
  const dmInvoke = DM_PS_SCRIPT.slice(
    DM_PS_SCRIPT.indexOf("function Invoke-EmCli {"),
    DM_PS_SCRIPT.indexOf('if ($Action -eq "stop")'),
  );
  for (const [label, body] of [
    ["emulator-manager", invoke],
    ["device-manager", dmInvoke],
  ]) {
    checkTrue(
      `${label}.ps1 Invoke-EmCli opens the process handle before waiting (ExitCode is otherwise $null)`,
      /\$null = \$proc\.Handle/.test(body) &&
        body.indexOf("$null = $proc.Handle") <
          body.indexOf("$proc.WaitForExit("),
      "add `$null = $proc.Handle` right after Start-Process",
    );
    checkTrue(
      `${label}.ps1 Invoke-EmCli never treats a $null exit code as a failure`,
      /if \(\$null -eq \$rc\)/.test(body),
      "a $null ExitCode must be inferred from the output, not compared with -ne 0",
    );
    checkTrue(
      `${label}.ps1 Invoke-EmCli returns em-cli output through the pipeline, not [Console]::Out`,
      /Write-Output \$line/.test(body) &&
        !/\[Console\]::Out\.Write\(\$stdout\)/.test(body),
      "callers capture `$raw = Invoke-EmCli …`; [Console]::Out.Write bypasses that",
    );
    checkTrue(
      `${label}.ps1 Invoke-EmCli puts stderr in the pipeline only on failure`,
      /if \(\$rc -ne 0\) \{ \$lines \+= @\("\$stderr" -split "\\r\?\\n"\) \}/.test(
        body,
      ) && /else \{ \[Console\]::Error\.Write\(\$stderr\) \}/.test(body),
      "a JVM warning on a successful run must not parse as a VM/template name",
    );
  }
  checkTrue(
    "bash read-only em-cli calls go through emcli_ro (timeout wrapper)",
    /emcli_ro list-vm/.test(SCRIPT) &&
      /emcli_ro list-template/.test(SCRIPT) &&
      /emcli_ro list-platform/.test(SCRIPT) &&
      /emcli_ro detail/.test(SCRIPT) &&
      /TIZEN_EMCLI_TIMEOUT/.test(SCRIPT),
    "emcli_ro not used everywhere",
  );
  checkTrue(
    "bash launch treats a failed list-vm as a failure, not as 'no VMs'",
    /if \[ "\$LIST_VM_RC" -ne 0 \]; then\s*\n\s*log_error "em-cli list-vm failed/.test(
      SCRIPT,
    ),
    "launch must not report emulator_not_found on a broken em-cli",
  );
  checkTrue(
    "bash VM-name extraction drops em-cli 'Error:' lines (parity with ConvertTo-VmNames)",
    /_vm_names_from_list\(\) \{[\s\S]*grep -v '\^Error:'/.test(SCRIPT),
    "_vm_names_from_list keeps Error: lines",
  );
}

// Every unix flag buildEmulatorArgs can emit must exist in the getopts string.
const getoptsMatch = SCRIPT.match(/while getopts "([^"]+)"/);
checkTrue("getopts string is present", getoptsMatch !== null);
if (getoptsMatch) {
  const getopts = getoptsMatch[1];
  const emittedFlags = [
    ...new Set(
      [
        ...fullArgs.unixArgs,
        ...imageArgs.unixArgs,
        ...listArgs.unixArgs,
        ...launchArgs.unixArgs,
      ]
        .map((arg) => arg.match(/^-([A-Za-z])/))
        .filter(Boolean)
        .map((m) => m[1]),
    ),
  ];
  for (const flag of emittedFlags) {
    checkTrue(
      `getopts accepts -${flag}`,
      getopts.includes(flag),
      `buildEmulatorArgs emits -${flag} but getopts "${getopts}" does not accept it`,
    );
  }
}

// reset is destructive; the guard rail is the point, so pin it.
checkTrue(
  "reset is gated on confirm in the core layer",
  /action === "reset" &&\s*opts\.confirm !== true/.test(
    fs.readFileSync(path.join(__dirname, "../core/emulator.js"), "utf8"),
  ),
  "reset must refuse to run without an explicit confirm",
);

// ---------------------------------------------------------------------------
// Option screening
//
// buildEmulatorArgs() renders every option into ONE shell command line that
// execPluginScript() hands to execSync. An unscreened value therefore executes
// before the script — and so before the script's own validation — ever runs.
// vmName/platform/template have always been checked; these cases cover the
// hardware, path, and timeout options that are passed through.
// ---------------------------------------------------------------------------
// [label, options (including the action that actually accepts them), substring
// the rejection must name].
//
// Both halves matter. Each option has to be exercised through an action that
// really passes it to the script — create for the base-image paths, create-image
// for outputDir, launch for emulatorPath — or the case never reaches the screen.
// And the expected substring keeps a case from passing for the wrong reason:
// without it, "modify needs at least one property to change" reads as a pass.
const INJECTION_CASES = [
  [
    "fileSharingPath",
    { action: "modify", fileSharingPath: '/tmp/x"; touch /tmp/pwned; #' },
    "fileSharingPath",
  ],
  ["customPath", { action: "create", customPath: "/tmp/$(id)" }, "customPath"],
  [
    "rawImagePath",
    { action: "create", rawImagePath: "/tmp/`id`" },
    "rawImagePath",
  ],
  [
    "outputDir",
    { action: "create-image", outputDir: "/tmp/a; rm -rf /tmp/b" },
    "outputDir",
  ],
  [
    "outputDir trailing backslash",
    { action: "create-image", outputDir: "C:\\images\\" },
    "outputDir",
  ],
  [
    "emulatorPath",
    { action: "launch", emulatorPath: "/tmp/x | id" },
    "emulatorPath",
  ],
  ["skin", { action: "modify", skin: "1; touch /tmp/pwned" }, "skin"],
  ["ramSize", { action: "modify", ramSize: "1024 && id" }, "ramSize"],
  [
    "hwVirtualization",
    { action: "modify", hwVirtualization: "yes; id" },
    "hwVirtualization",
  ],
  [
    "hwGlAcceleration",
    { action: "modify", hwGlAcceleration: "no|id" },
    "hwGlAcceleration",
  ],
  [
    "template",
    { action: "modify", template: 'HD1080"; id; #' },
    "template name",
  ],
  [
    "platform",
    {
      action: "modify",
      template: "HD1080 Tizen",
      platform: 'tizen-10.0"; id; #',
    },
    "platform name",
  ],
  ["vmName", { action: "modify", vmName: 'vm"; id; #' }, "VM name"],
];

// The screen must not reject real paths: spaces, drive letters, and non-ASCII
// directory names are all legitimate.
const SAFE_CASES = [
  ["a POSIX path with a space", { fileSharingPath: "/home/me/shared files" }],
  ["a non-ASCII path", { fileSharingPath: "/home/사용자/공유" }],
  ["a Windows path", { fileSharingPath: "C:\\Users\\me\\share" }],
  ["a valid ramSize", { ramSize: "1024" }],
  ["a valid skin", { skin: "2" }],
  ["a template name with spaces", { template: "HD1080 Tizen" }],
];

function isParameterRejection(envelope) {
  return (
    envelope.status === "failure" &&
    envelope.errors &&
    envelope.errors[0] &&
    envelope.errors[0].error_category === "invalid_parameters"
  );
}

async function checkOptionScreening() {
  console.log("\n--- option screening (shell safety) ---");

  for (const [label, unsafe, mustName] of INJECTION_CASES) {
    const envelope = await manageEmulator(
      { vmName: "test-vm", ...unsafe },
      "test",
    );
    checkTrue(
      `${label} is refused before reaching the shell`,
      isParameterRejection(envelope) &&
        envelope.errors[0].message.includes(mustName),
      `Got ${envelope.status}: ${JSON.stringify(envelope.errors)}`,
    );
  }

  for (const [label, safe] of SAFE_CASES) {
    const envelope = await manageEmulator(
      { action: "modify", vmName: "test-vm", ...safe },
      "test",
    );
    // Anything past the screen is fine — without an installed SDK these get as
    // far as an io_error/execution_error, which is exactly the point.
    checkTrue(
      `${label} passes the screen`,
      !isParameterRejection(envelope),
      `Wrongly rejected: ${JSON.stringify(envelope.errors)}`,
    );
  }
}

checkOptionScreening().then(() => {
  console.log(
    `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
});
