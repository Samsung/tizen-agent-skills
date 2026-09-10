// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Tests for the list-templates path (issue #41):
 *
 *   1. common/scripts/tizen-create-project/create-project-app.sh — run against a
 *      temp SDK with a stub `tz`: resolves the SDK through lib/common.sh
 *      (TIZEN_SDK_PATH and ~/.tizen.sdk.path.config), lists the requested type,
 *      and — the bug — actually reaches its `tz list templates` error branch,
 *      which used to be dead code under `set -e`.
 *   2. common/lib/core/project.js listTemplates() — run against a stub plugin
 *      root: a failing script's stdout diagnostics must reach the envelope
 *      (message + details), not just "Command failed: <cmd>".
 *
 * The script layer needs bash, so it is skipped on win32 (the .ps1 twin is held
 * to the same behaviour by inspection below). The JS layer runs everywhere.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

console.log("=== list-templates Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

const SCRIPT_DIR = path.join(__dirname, "../../scripts/tizen-create-project");
const SH_APP = path.join(SCRIPT_DIR, "create-project-app.sh");
const PS_APP = path.join(SCRIPT_DIR, "create-project-app.ps1");

// ---------------------------------------------------------------------------
// Source inspection — both twins must use the shared SDK resolver and neither
// may capture `tz` with a bare `rc=$?` (dead under `set -e`).
// ---------------------------------------------------------------------------
console.log("--- Source inspection ---");
const SH_SRC = fs.readFileSync(SH_APP, "utf8");
const PS_SRC = fs.readFileSync(PS_APP, "utf8");

check(
  "create-project-app.sh sources lib/common.sh and uses get_sdk_path",
  SH_SRC.includes('source "$SCRIPT_DIR/../lib/common.sh"') &&
    SH_SRC.includes('TIZEN_STUDIO_PATH="$(get_sdk_path)"'),
);
check(
  "create-project-app.ps1 dot-sources lib\\common.ps1 and uses Get-SdkPath",
  PS_SRC.includes('. (Join-Path $PSScriptRoot "..\\lib\\common.ps1")') &&
    PS_SRC.includes("$TIZEN_STUDIO_PATH = Get-SdkPath"),
);
check(
  "no bare `tz_exit_code=$?` after a tz command substitution (dead under set -e)",
  !/tz_output="\$\("\$TZ_TOOL"[^\n]*\)"\s*\n\s*(?:\n\s*)?tz_exit_code=\$\?/.test(
    SH_SRC,
  ),
  "Use `tz_output=$(…) || tz_exit_code=$?` so the error branch is reachable",
);
check(
  "ps1 list mode survives a failed custom-template sync",
  /try\s*\{\s*Sync-CustomTemplates\s*\}\s*catch/.test(PS_SRC),
);

// ---------------------------------------------------------------------------
// Script layer (bash)
// ---------------------------------------------------------------------------
// Runs with the system bash on POSIX; on Windows only when TIZEN_TEST_BASH names
// a Git Bash executable (the .ps1 twin holds the same logic).
const BASH =
  process.env.TIZEN_TEST_BASH || (process.platform === "win32" ? null : "bash");
if (!BASH) {
  console.log(
    "\nSKIP: script-layer tests need bash (set TIZEN_TEST_BASH=<git-bash.exe> on Windows; see create-project-app.ps1 for the Windows path)",
  );
} else {
  console.log(
    "\n--- Script layer: create-project-app.sh against a stub tz ---",
  );

  try {
    execFileSync(BASH, ["-n", SH_APP], { stdio: "pipe" });
    check("create-project-app.sh passes `bash -n`", true);
  } catch (error) {
    check(
      "create-project-app.sh passes `bash -n`",
      false,
      String(error.stderr || error.message).trim(),
    );
  }

  const STUB_TZ = `#!/usr/bin/env bash
# Stub tz — see list-templates.test.js.
if [ "\${STUB_TZ_FAILS:-0}" = "1" ]; then
  echo 'Exception in thread "main" java.lang.UnsatisfiedLinkError: libtizen-core.so' >&2
  exit 1
fi
if [ "$1" = "list" ] && [ "$2" = "templates" ] && [ -n "\${STUB_TZ_ONLY_11:-}" ]; then
  echo "tizen-11.0:"
  echo "  Basic [web_app]"
  echo "  BasicUI [native_app]"
  exit 0
fi
if [ "$1" = "list" ] && [ "$2" = "templates" ]; then
  echo "tizen-10.0:"
  echo "  Basic [web_app]"
  echo "  BasicUI [native_app]"
  echo "  ServiceApp [native_app]"
  echo "tizen-9.0:"
  echo "  OldOnly [web_app]"
  exit 0
fi
exit 0
`;

  /** Temp HOME + SDK tree get_sdk_path() accepts, with the stub tz in place. */
  function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "list-templates-test-"));
    const sdk = path.join(root, "sdk");
    const core = path.join(sdk, "tools", "tizen-core");
    fs.mkdirSync(core, { recursive: true });
    fs.writeFileSync(path.join(sdk, "tools", "sdb"), "#!/bin/sh\n", {
      mode: 0o755,
    });
    fs.writeFileSync(path.join(core, "tz"), STUB_TZ, { mode: 0o755 });
    const home = path.join(root, "home");
    fs.mkdirSync(home);
    return { root, sdk, home };
  }

  function runApp(args, { sdkVia, stubEnv = {}, prepare = null }) {
    const fx = makeFixture();
    if (prepare) prepare(fx);
    const env = { ...process.env, HOME: fx.home, ...stubEnv };
    delete env.TIZEN_SDK_PATH;
    if (sdkVia === "env") env.TIZEN_SDK_PATH = fx.sdk;
    if (sdkVia === "config") {
      fs.writeFileSync(
        path.join(fx.home, ".tizen.sdk.path.config"),
        `${fx.sdk}\n`,
      );
    }
    const r = spawnSync(BASH, [SH_APP, ...args], {
      encoding: "utf8",
      timeout: 60000,
      env,
    });
    fs.rmSync(fx.root, { recursive: true, force: true });
    return {
      code: typeof r.status === "number" ? r.status : 1,
      stdout: r.stdout || "",
      stderr: r.stderr || "",
    };
  }

  const viaEnv = runApp(["--list-templates", "--type=webapp"], {
    sdkVia: "env",
  });
  check(
    "TIZEN_SDK_PATH: lists the webapp templates of the tizen-10.0 profile only",
    viaEnv.code === 0 &&
      /^webapp:\n {2}Basic\n?$/m.test(viaEnv.stdout) &&
      !viaEnv.stdout.includes("OldOnly"),
    `exit ${viaEnv.code}\n${viaEnv.stdout}\n${viaEnv.stderr}`.slice(-600),
  );

  const viaConfig = runApp(["--list-templates", "--type=native"], {
    sdkVia: "config",
  });
  check(
    "~/.tizen.sdk.path.config alone (no TIZEN_SDK_PATH) locates tz — the issue #41 case",
    viaConfig.code === 0 &&
      /^native:\n {2}BasicUI\n {2}ServiceApp/m.test(viaConfig.stdout),
    `exit ${viaConfig.code}\n${viaConfig.stdout}\n${viaConfig.stderr}`.slice(
      -600,
    ),
  );

  const noSdk = runApp(["--list-templates"], { sdkVia: "none" });
  check(
    "no SDK anywhere: exits 1 and names the path it resolved and how to fix it",
    noSdk.code === 1 &&
      /tz tool not found at/.test(noSdk.stderr) &&
      /Resolved SDK path:/.test(noSdk.stderr) &&
      /tizen-sdk-init/.test(noSdk.stderr),
    `exit ${noSdk.code}\n${noSdk.stderr}`.slice(-600),
  );

  const tzFails = runApp(["--list-templates", "--type=webapp"], {
    sdkVia: "env",
    stubEnv: { STUB_TZ_FAILS: "1" },
  });
  check(
    "a failing `tz list templates` reaches the diagnostic branch (was dead code under set -e)",
    tzFails.code === 1 &&
      /'tz list templates' failed \(exit 1\)/.test(tzFails.stderr) &&
      /Possible causes/.test(tzFails.stderr) &&
      /UnsatisfiedLinkError/.test(tzFails.stderr),
    `exit ${tzFails.code}\n${tzFails.stdout}\n${tzFails.stderr}`.slice(-800),
  );

  // Issue #72: the profile is detected, not hardcoded to tizen-10.0.
  const only11 = runApp(["--list-templates", "--type=webapp"], {
    sdkVia: "config",
    stubEnv: { STUB_TZ_ONLY_11: "1" },
  });
  check(
    "an SDK that ships only tizen-11.0 lists its templates (profile detected, not hardcoded)",
    only11.code === 0 &&
      /^PROFILE=tizen-11\.0$/m.test(only11.stdout) &&
      /^webapp:\n {2}Basic\n?$/m.test(only11.stdout) &&
      /Using profile: tizen-11\.0/.test(only11.stderr),
    `exit ${only11.code}\n${only11.stdout}\n${only11.stderr}`.slice(-600),
  );
  check(
    "the highest tizen-X.Y section wins when several are listed (10.0 over 9.0)",
    /^PROFILE=tizen-10\.0$/m.test(viaEnv.stdout) &&
      /^PROFILES=tizen-10\.0,tizen-9\.0$/m.test(viaEnv.stdout),
    viaEnv.stdout.slice(0, 200),
  );
  const forced = runApp(["--list-templates", "--type=webapp"], {
    sdkVia: "config",
    stubEnv: { TIZEN_TZ_PROFILE: "tizen-9.0" },
  });
  check(
    "TIZEN_TZ_PROFILE forces the profile",
    forced.code === 0 &&
      /^PROFILE=tizen-9\.0$/m.test(forced.stdout) &&
      /^webapp:\n {2}OldOnly/m.test(forced.stdout),
    `exit ${forced.code}\n${forced.stdout}`.slice(-400),
  );
  const emptyType = runApp(["--list-templates", "--type=rpk"], {
    sdkVia: "config",
  });
  check(
    "a type with no templates prints an empty section plus a stderr diagnosis (profile + known profiles)",
    emptyType.code === 0 &&
      /^rpk:\s*$/m.test(emptyType.stdout) &&
      /No rpk templates under profile tizen-10\.0/.test(emptyType.stderr) &&
      /Profiles in 'tz list templates': tizen-10\.0,tizen-9\.0/.test(
        emptyType.stderr,
      ),
    `exit ${emptyType.code}\n${emptyType.stdout}\n${emptyType.stderr}`.slice(
      -600,
    ),
  );

  // Issue #72 (Codex sandbox): the plugin's custom-template sync cannot write
  // into the SDK. The WARN must carry cp's own reason, and an empty type list
  // must then be explained as "SDK not writable from this shell", not as a
  // missing platform package. Simulated by making the SDK's platform dir a
  // plain FILE so `cp -r` into it fails with a reason of its own.
  const roSync = runApp(["--list-templates", "--type=rpk"], {
    sdkVia: "config",
    prepare: (fx) => {
      const platforms = path.join(fx.sdk, "platforms");
      fs.mkdirSync(platforms, { recursive: true });
      fs.writeFileSync(path.join(platforms, "tizen-10.0"), "not a dir\n");
    },
  });
  check(
    "a failed custom-template sync reports cp's reason and keeps listing (exit 0)",
    roSync.code === 0 &&
      /Could not sync custom template 'BasicUI' into the SDK \(cp: [^)]+\)/.test(
        roSync.stderr,
      ) &&
      !/Failed to sync custom template/.test(roSync.stderr),
    `exit ${roSync.code}\n${roSync.stderr}`.slice(-600),
  );
  check(
    "…and an empty type is then explained as 'SDK not writable from this shell' + escalated re-run, not as a missing platform package",
    /No rpk templates under profile tizen-10\.0/.test(roSync.stderr) &&
      /SDK directory is not writable from this shell \(cp: /.test(
        roSync.stderr,
      ) &&
      /re-run this SAME command with escalated permissions/.test(
        roSync.stderr,
      ) &&
      !/install the platform package/.test(roSync.stderr),
    roSync.stderr.slice(-600),
  );
  const okSync = runApp(["--list-templates", "--type=rpk"], {
    sdkVia: "config",
  });
  check(
    "with a writable SDK the empty-type hint still points at the platform package",
    /install the platform package for tizen-10\.0/.test(okSync.stderr) &&
      !/not writable from this shell/.test(okSync.stderr),
    okSync.stderr.slice(-400),
  );
}

// ---------------------------------------------------------------------------
// JS layer: listTemplates() against a stub plugin root
// ---------------------------------------------------------------------------
console.log("\n--- JS layer: listTemplates() envelope on script failure ---");

const { listTemplates } = require("../core/project");

/**
 * Stub plugin root: <root>/scripts/tizen-create-project/tizen-create-project.{sh,ps1}
 * print `lines` and exit with `code`. execPluginScript picks the .ps1 on win32
 * and the .sh elsewhere, so both are written.
 */
function makePluginRoot(lines, code) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "list-templates-root-"));
  const dir = path.join(root, "scripts", "tizen-create-project");
  fs.mkdirSync(dir, { recursive: true });
  const sh = [
    "#!/usr/bin/env bash",
    ...lines.map((l) => `echo ${JSON.stringify(l)}`),
    `exit ${code}`,
  ].join("\n");
  const ps1 = [
    ...lines.map((l) => `Write-Host '${l.replace(/'/g, "''")}'`),
    `exit ${code}`,
  ].join("\n");
  fs.writeFileSync(path.join(dir, "tizen-create-project.sh"), `${sh}\n`, {
    mode: 0o755,
  });
  fs.writeFileSync(path.join(dir, "tizen-create-project.ps1"), `${ps1}\n`);
  return root;
}

async function withPluginRoot(lines, code, fn) {
  const root = makePluginRoot(lines, code);
  const prev = process.env.TIZEN_SDK_SKILLS_ROOT;
  process.env.TIZEN_SDK_SKILLS_ROOT = root;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.TIZEN_SDK_SKILLS_ROOT;
    else process.env.TIZEN_SDK_SKILLS_ROOT = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(async () => {
  const failing = await withPluginRoot(
    [
      "Error: tz tool not found at X:\\nowhere\\tools\\tizen-core\\tz.exe",
      "  Resolved SDK path: X:\\nowhere",
      "  Fix: run tizen-sdk-init with the SDK path, or tizen-sdk-install if the SDK is not installed.",
    ],
    1,
    () => listTemplates(undefined, "tizen-sdk list-templates"),
  );
  check(
    "script failure → status failure with execution_error",
    failing.status === "failure" &&
      failing.errors?.[0]?.error_category === "execution_error",
    JSON.stringify(failing).slice(0, 400),
  );
  check(
    "the script's stdout diagnostic is in the message, not just 'Command failed'",
    /tz tool not found at X:\\nowhere/.test(failing.errors?.[0]?.message || ""),
    failing.errors?.[0]?.message,
  );
  check(
    "details carry the raw script output tail",
    Array.isArray(failing.errors?.[0]?.details) &&
      failing.errors[0].details.some((l) => /Resolved SDK path/.test(l)),
    JSON.stringify(failing.errors?.[0]?.details),
  );
  check(
    "a missing tz suggests tizen-sdk-init",
    /sdk-init/.test(failing.errors?.[0]?.suggested_fix?.command || ""),
    JSON.stringify(failing.errors?.[0]?.suggested_fix),
  );

  // Issue #72: the non-fatal sync warning contains "failed"/"cannot" and used to
  // be reported as THE diagnosis ("Failed to list templates: [WARN] Failed to
  // sync custom template 'BasicUI'") while the real error sat two lines below.
  const syncNoise = await withPluginRoot(
    [
      "[WARN] Could not sync custom template 'BasicUI' into the SDK (cp: cannot create directory: Read-only file system) — listing continues.",
      "Error: 'tz list templates' failed (exit 1).",
      "  tz output: Exception in thread main java.lang.UnsatisfiedLinkError",
    ],
    1,
    () => listTemplates("webapp", "tizen-sdk list-templates"),
  );
  check(
    "a hard 'Error:' line beats the custom-template sync warning as the message",
    /Failed to list templates: Error: 'tz list templates' failed/.test(
      syncNoise.errors?.[0]?.message || "",
    ),
    syncNoise.errors?.[0]?.message,
  );
  const syncOnly = await withPluginRoot(
    [
      "[WARN] Could not sync custom template 'BasicUI' into the SDK (cp: cannot create directory: Read-only file system) — listing continues.",
      "something else went wrong: template index cannot be read",
    ],
    1,
    () => listTemplates("webapp", "tizen-sdk list-templates"),
  );
  check(
    "without a hard error line the sync warning is still skipped in favour of the next diagnostic",
    /Failed to list templates: something else went wrong/.test(
      syncOnly.errors?.[0]?.message || "",
    ),
    syncOnly.errors?.[0]?.message,
  );

  const ok = await withPluginRoot(
    ["webapp:", "  Basic", "  Basic2", "native:", "  BasicUI"],
    0,
    () => listTemplates(undefined, "tizen-sdk list-templates"),
  );
  check(
    "script success → templates grouped by section",
    ok.status === "success" &&
      JSON.stringify(ok.result?.templates?.webapp) === '["Basic","Basic2"]' &&
      JSON.stringify(ok.result?.templates?.native) === '["BasicUI"]',
    JSON.stringify(ok).slice(0, 400),
  );

  const withProfile = await withPluginRoot(
    [
      "PROFILE=tizen-11.0",
      "PROFILES=tizen-11.0,tv-samsung-9.0",
      "webapp:",
      "  Basic",
    ],
    0,
    () => listTemplates("webapp", "tizen-sdk list-templates"),
  );
  check(
    "PROFILE= machine line → result.profile, not a template",
    withProfile.status === "success" &&
      withProfile.result?.profile === "tizen-11.0" &&
      JSON.stringify(withProfile.result?.templates) === '{"webapp":["Basic"]}',
    JSON.stringify(withProfile).slice(0, 400),
  );

  // Issue #72: --type webapp with an empty section was a success envelope.
  const emptyTyped = await withPluginRoot(
    ["PROFILE=tizen-10.0", "PROFILES=tizen-11.0", "webapp:"],
    0,
    () => listTemplates("webapp", "tizen-sdk list-templates"),
  );
  check(
    "--type webapp with no templates → template_not_found failure, not {webapp: []} success",
    emptyTyped.status === "failure" &&
      emptyTyped.errors?.[0]?.error_category === "template_not_found",
    JSON.stringify(emptyTyped).slice(0, 400),
  );
  check(
    "the failure names the profile looked at and the profiles tz knows",
    /No webapp templates found in the installed SDK under profile tizen-10\.0/.test(
      emptyTyped.errors?.[0]?.message || "",
    ) &&
      /Profiles known to tz: tizen-11\.0/.test(
        emptyTyped.errors?.[0]?.message || "",
      ),
    emptyTyped.errors?.[0]?.message,
  );
  check(
    "the failure carries the raw script output tail",
    Array.isArray(emptyTyped.errors?.[0]?.details) &&
      emptyTyped.errors[0].details.some((l) => /PROFILE=tizen-10\.0/.test(l)),
    JSON.stringify(emptyTyped.errors?.[0]?.details),
  );
  const emptyDotnet = await withPluginRoot(["dotnet:"], 0, () =>
    listTemplates("dotnet", "tizen-sdk list-templates"),
  );
  check(
    "--type dotnet empty → hint points at tizen-dotnet-setup",
    emptyDotnet.status === "failure" &&
      /tizen-dotnet-setup/.test(emptyDotnet.errors?.[0]?.message || ""),
    emptyDotnet.errors?.[0]?.message,
  );

  const empty = await withPluginRoot(["webapp:", "native:"], 0, () =>
    listTemplates(undefined, "tizen-sdk list-templates"),
  );
  check(
    "no templates at all (no --type) → template_not_found, not success",
    empty.status === "failure" &&
      empty.errors?.[0]?.error_category === "template_not_found",
    JSON.stringify(empty).slice(0, 400),
  );

  console.log(
    `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
