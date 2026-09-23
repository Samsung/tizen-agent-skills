// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Regression tests for the five product defects surfaced by the 2026-09
 * mutating/device-tier TC run report (§4.2, §8.3):
 *
 *   1. `sdk-install --tizen-version 99.99` reported success / "completed" for
 *      a platform that was never installed — the packaged CLI checked only
 *      sdk.info after running the installer, and the installer's own
 *      "already installed" short-circuit exits 0 before it looks at -Platform.
 *   2. `install-app --run` with several devices connected came back as
 *      io_error (IO_E001) with the shell command line in the message, while
 *      every sibling returns multiple_devices (DEVICE_E002).
 *   3. "Is Node.js installed?" was routed to the generic doctor sweep in 1 of 3
 *      prompt runs — the check-node descriptions never said "not doctor".
 *   4. A failed sdk-install produced "SDK installation failed: \n\n\n" and no
 *      log anywhere (whitespace-only stdout is truthy, so stderr and the exit
 *      code were dropped).
 *   5. playwright-test's resolveNodeRuntime() reported "not found on PATH" for
 *      both a missing executable and a present one that exits abnormally.
 *
 * installSdk() reads ~/.tizen.sdk.path.config at require time, so HOME /
 * USERPROFILE are redirected to a sandbox BEFORE the modules are required.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const sandboxHome = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-tc-report-followups-"),
);
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;
// Keep the persisted installer logs inside the sandbox too.
process.env.TIZEN_LOGS_DIR = path.join(sandboxHome, "logs");

const {
  requestedPlatformMissing,
  describeInstallerFailure,
  describeChildExit,
  installerLogsDir,
  outputTailLines,
} = require("../core/sdk");
const { classifyInstallFailure } = require("../core/project");
const {
  resolveNodeRuntime,
  describeNodeRuntimeFailure,
} = require("../core/playwright-test");

console.log("=== TC report follow-ups ===\n");

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

const ROOT = path.join(__dirname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

const realConsoleError = console.error;
console.error = () => {};

try {
  // ---------------------------------------------------------------------------
  console.log(
    "--- 1. requested platform must exist after the installer ran ---",
  );
  {
    const sdkPath = path.join(sandboxHome, "tizen-sdk");
    fs.mkdirSync(path.join(sdkPath, "platforms", "tizen-10.0"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(sdkPath, "sdk.info"),
      "TIZEN_SDK_INSTALLED_PATH=x\n",
    );

    check(
      "installed version → null (no error)",
      requestedPlatformMissing(sdkPath, "10.0", "tizen-sdk sdk-install", 0, {
        afterInstall: true,
      }) === null,
    );
    check(
      "no version requested → null",
      requestedPlatformMissing(sdkPath, "", "tizen-sdk sdk-install", 0, {
        afterInstall: true,
      }) === null,
    );

    const env = requestedPlatformMissing(
      sdkPath,
      "99.99",
      "tizen-sdk sdk-install",
      Date.now(),
      { afterInstall: true },
    );
    check(
      "99.99 after install → failure envelope",
      env && env.status === "failure",
    );
    check(
      "  error_category platform_version_not_found",
      env.errors[0].error_category === "platform_version_not_found",
      env.errors[0].error_category,
    );
    check(
      "  message says the installer finished but the platform is absent",
      /installer finished/i.test(env.errors[0].message) &&
        /TIZEN-99\.99/.test(env.errors[0].message) &&
        /installed platforms: 10\.0/.test(env.errors[0].message),
      env.errors[0].message,
    );
    check(
      "  suggested_fix is platform-install for that version",
      env.errors[0].suggested_fix.command ===
        "tizen-cli tizen-sdk platform-install --platform-version 99.99",
      env.errors[0].suggested_fix.command,
    );
    check(
      "  no result (never installation_status: completed)",
      env.result === undefined || env.result === null,
    );

    // Source guards: both packaged-CLI branches run the check after the installer.
    const sdkSrc = read("common/lib/core/sdk.js");
    const afterInstallCalls = (
      sdkSrc.match(
        /requestedPlatformMissing\([\s\S]{0,200}?\{ afterInstall: true \}/g,
      ) || []
    ).length;
    check(
      "sdk.js: installSdk + installSdkFromRepo verify the platform after the installer",
      afterInstallCalls >= 2,
      `found ${afterInstallCalls}`,
    );
    const ps1 = read("common/scripts/tizen-sdk-install/tizen-sdk-install.ps1");
    const sh = read("common/scripts/tizen-sdk-install/tizen-sdk-install.sh");
    check(
      "installer.ps1: already-installed short-circuit rejects a -Platform that is not installed",
      /platforms\\tizen-\$Platform[\s\S]{0,400}exit 1/.test(ps1),
    );
    check(
      "installer.sh: already-installed short-circuit rejects a --platform that is not installed",
      /platforms\/tizen-\$PLATFORM_VERSION[\s\S]{0,400}exit 1/.test(sh),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- 4. installer failure is diagnosable ---");
  {
    const sdkPath = path.join(sandboxHome, "sdk-fail");
    fs.mkdirSync(sdkPath, { recursive: true });

    // The reported shape: whitespace-only stdout, the real error on stderr.
    const err = Object.assign(
      new Error("Command failed: powershell -File x.ps1 -Path y"),
      {
        stdout: "\n\n\n\n\n\n\n",
        stderr:
          "[ERROR] [37/121] tizen-10.0-rs-device.core: download failed (404)\n[ERROR] Tizen SDK installation did not complete\n",
        status: 1,
        signal: null,
      },
    );
    const f = describeInstallerFailure(err, {
      what: "SDK installation",
      sdkPath,
      logGroup: "sdk-install",
      resumes: true,
    });
    check(
      "exit code is in the message",
      /installer exit code 1/.test(f.message),
      f.message,
    );
    check(
      "stderr lines are in the message (not dropped behind blank stdout)",
      /download failed \(404\)/.test(f.message),
      f.message,
    );
    check(
      "the shell command line is NOT repeated",
      !/Command failed/.test(f.message) && !/powershell -File/.test(f.message),
      f.message,
    );
    check(
      "a log file was written under installerLogsDir()",
      f.log_file &&
        fs.existsSync(f.log_file) &&
        f.log_file.startsWith(installerLogsDir()),
      String(f.log_file),
    );
    check(
      "the log file holds both streams",
      f.log_file &&
        /===== stderr =====[\s\S]*download failed/.test(
          fs.readFileSync(f.log_file, "utf-8"),
        ),
    );
    check(
      "message names the log file",
      f.message.includes(f.log_file),
      f.message,
    );
    check(
      "details[] carries exit code, log file and the tail lines",
      Array.isArray(f.details) &&
        f.details[0] === "installer exit code 1" &&
        f.details.some((d) => d.startsWith("log_file: ")) &&
        f.details.some((d) => /404/.test(d)),
      JSON.stringify(f.details),
    );
    check(
      "resume hint present when resumes=true",
      /resumes the install/.test(f.message),
    );

    // Nothing captured at all: say so instead of printing an empty string.
    const silent = Object.assign(new Error("Command failed: x"), {
      stdout: "   \n",
      stderr: "",
      status: 1,
    });
    const g = describeInstallerFailure(silent, {
      what: "SDK installation",
      logGroup: "t",
    });
    check(
      "empty streams → explicit 'no output' sentence",
      /produced no output on the captured stdout\/stderr streams/.test(
        g.message,
      ),
      g.message,
    );
    check(
      "no resume hint without resumes",
      !/resumes the install/.test(g.message),
    );

    // Timeout kill, exactly as execSync reports it: code ETIMEDOUT, status
    // null, signal SIGTERM — and NO `killed` property.
    const killed = Object.assign(new Error("spawnSync powershell ETIMEDOUT"), {
      code: "ETIMEDOUT",
      stdout: "",
      stderr: "",
      status: null,
      signal: "SIGTERM",
    });
    const timeoutSdk = path.join(sandboxHome, "sdk-timeout");
    fs.mkdirSync(timeoutSdk, { recursive: true });
    fs.writeFileSync(path.join(timeoutSdk, ".install-running"), "running\n");
    const k = describeInstallerFailure(killed, {
      what: "SDK installation",
      sdkPath: timeoutSdk,
      logGroup: "t",
    });
    check(
      "ETIMEDOUT → 'timed out and was killed (SIGTERM)'",
      /installer timed out and was killed \(SIGTERM\)/.test(k.message),
      k.message,
    );
    check(
      "ETIMEDOUT → the leftover 'running' marker is explained as a mid-run kill",
      /running' marker .*\.install-running is still present because the installer was killed mid-run/.test(
        k.message,
      ),
      k.message,
    );
    check(
      "describeChildExit: plain signal without ETIMEDOUT is 'killed by'",
      describeChildExit({ status: null, signal: "SIGKILL" }, "installer")
        .text === "installer killed by SIGKILL",
    );
    check(
      "describeChildExit: legacy killed:true still counts as a timeout",
      describeChildExit({ status: null, signal: "SIGTERM", killed: true }, "x")
        .timedOut === true,
    );

    // Message lines are capped at 200 chars; details keep them whole.
    const wide = Object.assign(new Error("x"), {
      stdout: "",
      stderr: `[ERROR] ${"y".repeat(600)}\n`,
      status: 1,
    });
    const w = describeInstallerFailure(wide, {
      what: "SDK installation",
      logGroup: "t",
    });
    check(
      "a 600-char line is truncated to 200 chars in the message",
      !w.message.includes("y".repeat(201)) && /y{150,}…/.test(w.message),
    );
    check(
      "…but kept whole in details[]",
      w.details.some((d) => d.includes("y".repeat(600))),
    );

    // Script-side artefacts are referenced when present.
    fs.writeFileSync(path.join(sdkPath, ".install.log"), "log\n");
    fs.writeFileSync(path.join(sdkPath, ".install-result"), "EXIT=1\n");
    const h = describeInstallerFailure(err, {
      what: "SDK installation",
      sdkPath,
      logGroup: "t",
    });
    check(
      "references <sdk>/.install.log written by the script",
      h.message.includes(path.join(sdkPath, ".install.log")),
      h.message,
    );
    check(
      "references the .install-result marker and its EXIT value",
      h.message.includes(".install-result") &&
        /records "EXIT=1"/.test(h.message),
      h.message,
    );

    check(
      "outputTailLines keeps the last non-empty lines, CRLF-normalised",
      JSON.stringify(outputTailLines("a\r\n\r\nb\r\nc\n\n", 2)) ===
        JSON.stringify(["b", "c"]),
    );

    // Source guards: no installer catch site keeps the old stdout||stderr||message shape,
    // and both scripts keep their own log.
    const sdkSrc = read("common/lib/core/sdk.js");
    check(
      "sdk.js: no `stdout || stderr || message` installer catch left",
      !/installError\.stdout \|\| installError\.stderr \|\| installError\.message/.test(
        sdkSrc,
      ),
    );
    const ps1 = read("common/scripts/tizen-sdk-install/tizen-sdk-install.ps1");
    const sh = read("common/scripts/tizen-sdk-install/tizen-sdk-install.sh");
    check(
      "installer.ps1 writes a transcript to <install>\\.install.log",
      /Start-Transcript -Path \$InstallLog/.test(ps1) &&
        /\.install\.log/.test(ps1),
    );
    check(
      "installer.ps1 repeats the failure verdict on stderr",
      /\[Console\]::Error\.WriteLine\("\[ERROR\] Tizen SDK installation did not complete/.test(
        ps1,
      ),
    );
    check(
      "installer.sh mirrors stderr into <install>/.install.log",
      /exec 2> >\(tee -a "\$INSTALL_LOG" >&2\)/.test(sh),
    );
  }

  // ---------------------------------------------------------------------------
  console.log(
    "\n--- 2. install-app: several devices → multiple_devices, no command line ---",
  );
  {
    const scriptOut =
      "Found multiple devices:\n1. emulator-26101\n2. 192.168.0.10:26101\n[ERROR] Multiple devices found. Please specify device serial with -s parameter.\n";
    const err = Object.assign(
      new Error(
        'Command failed: bash "/x/tizen-install-app.sh" -p "/p/App.tpk" -r',
      ),
      { stdout: scriptOut, stderr: "", status: 1 },
    );
    const env = classifyInstallFailure(
      "tizen-sdk install-app",
      scriptOut,
      err,
      Date.now(),
    );
    check("status failure", env.status === "failure");
    check(
      "error_category multiple_devices",
      env.errors[0].error_category === "multiple_devices",
      env.errors[0].error_category,
    );
    check(
      "error_code TIZEN_SDK_DEVICE_E002",
      env.errors[0].error_code === "TIZEN_SDK_DEVICE_E002",
      env.errors[0].error_code,
    );
    check(
      "message lists the serials and the serial option",
      /emulator-26101, 192\.168\.0\.10:26101/.test(env.errors[0].message) &&
        /--serial/.test(env.errors[0].message),
      env.errors[0].message,
    );
    check(
      "message does not expose the shell command line",
      !/Command failed|tizen-install-app\.sh|-p "/.test(env.errors[0].message),
      env.errors[0].message,
    );

    // Generic failure: exit code + key lines, never "Command failed: <cmd>".
    const generic = Object.assign(
      new Error(
        'Command failed: bash "/x/tizen-install-app.sh" -p "/p/App.tpk"',
      ),
      {
        stdout: "[ERROR] Installation failed: pkgcmd returned 5\n",
        stderr: "",
        status: 1,
      },
    );
    const g = classifyInstallFailure(
      "tizen-sdk install-app",
      generic.stdout,
      generic,
      Date.now(),
    );
    check("generic → io_error", g.errors[0].error_category === "io_error");
    check(
      "generic message carries exit code and the diagnostic line",
      /install script exit code 1/.test(g.errors[0].message) &&
        /pkgcmd returned 5/.test(g.errors[0].message),
      g.errors[0].message,
    );
    check(
      "generic message does not expose the shell command line",
      !/Command failed|tizen-install-app\.sh/.test(g.errors[0].message),
      g.errors[0].message,
    );

    const timedOut = classifyInstallFailure(
      "tizen-sdk install-app",
      "",
      Object.assign(new Error("spawnSync bash ETIMEDOUT"), {
        code: "ETIMEDOUT",
        status: null,
        signal: "SIGTERM",
      }),
      Date.now(),
    );
    check(
      "install script timeout → io_error naming the timeout, not 'killed by'",
      timedOut.errors[0].error_category === "io_error" &&
        /install script timed out and was killed \(SIGTERM\)/.test(
          timedOut.errors[0].message,
        ) &&
        /printed no diagnostic line/.test(timedOut.errors[0].message),
      timedOut.errors[0].message,
    );

    const none = classifyInstallFailure(
      "tizen-sdk install-app",
      "No devices found. Device manager will be invoked to create/launch an emulator.\n",
      Object.assign(new Error("x"), { status: 1 }),
      Date.now(),
    );
    check(
      "no device → device_not_found",
      none.errors[0].error_category === "device_not_found",
    );

    // Source guard: the pre-check answers multiple devices before the script runs.
    const projectSrc = read("common/lib/core/project.js");
    check(
      "project.js: installApp maps the JS-side resolution to multiple_devices before running the script",
      /deviceResolution\.errorCategory === "multiple_devices"/.test(projectSrc),
    );
    check(
      "project.js: the generic install failure no longer embeds error.message",
      !/App installation failed: \$\{error\.message\}/.test(projectSrc),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- 5. playwright-test: missing node vs broken node ---");
  {
    const enoent = resolveNodeRuntime({
      executable: "node",
      spawn: () => ({
        error: Object.assign(new Error("spawnSync node ENOENT"), {
          code: "ENOENT",
        }),
      }),
    });
    check(
      "ENOENT → reason not_found",
      enoent.reason === "not_found",
      JSON.stringify(enoent),
    );

    const eacces = resolveNodeRuntime({
      executable: "node",
      spawn: () => ({
        error: Object.assign(new Error("spawnSync node EACCES"), {
          code: "EACCES",
        }),
      }),
    });
    check("EACCES → reason spawn_failed", eacces.reason === "spawn_failed");

    const exited = resolveNodeRuntime({
      executable: "node",
      spawn: () => ({
        status: 3221225781,
        signal: null,
        stdout: "",
        stderr:
          "The code execution cannot proceed because libnode.dll was not found.\n",
      }),
    });
    check(
      "non-zero exit → reason exited",
      exited.reason === "exited",
      JSON.stringify(exited),
    );
    check("  exit code kept", exited.exit_code === 3221225781);
    check("  stderr tail kept", /libnode\.dll/.test(exited.detail || ""));

    const timeout = resolveNodeRuntime({
      executable: "node",
      spawn: () => ({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      }),
    });
    check(
      "status null + SIGTERM → reason timeout",
      timeout.reason === "timeout",
    );

    const ok = resolveNodeRuntime({
      executable: "node",
      spawn: () => ({
        status: 0,
        signal: null,
        stdout: "v22.1.0\n",
        stderr: "",
      }),
    });
    check(
      "exit 0 → executable + version",
      ok.executable === "node" && ok.version === "v22.1.0",
    );

    const notFound = describeNodeRuntimeFailure(enoent, "node");
    const broken = describeNodeRuntimeFailure(exited, "node");
    const hung = describeNodeRuntimeFailure(timeout, "node");
    check(
      "missing executable → node_not_found, 'install Node' advice",
      notFound.category === "node_not_found" &&
        /was not found on PATH/.test(notFound.message) &&
        /Install Node\.js/.test(notFound.message),
      notFound.message,
    );
    check(
      "abnormal exit → execution_error, says node IS on PATH, quotes exit + stderr",
      broken.category === "execution_error" &&
        /is on PATH/.test(broken.message) &&
        /exit 3221225781/.test(broken.message) &&
        /libnode\.dll/.test(broken.message) &&
        !/was not found on PATH/.test(broken.message),
      broken.message,
    );
    check(
      "abnormal exit advice is repair/reinstall, not 'install'",
      /Repair or reinstall/.test(broken.message) &&
        /Do not install a second copy/.test(broken.message),
    );
    check(
      "timeout → execution_error mentioning the probe timeout",
      hung.category === "execution_error" &&
        /did not answer within 15 s/.test(hung.message),
      hung.message,
    );
    check(
      "the three messages are pairwise different",
      new Set([notFound.message, broken.message, hung.message]).size === 3,
    );

    const pwSrc = read("common/lib/core/playwright-test.js");
    check(
      "playwright-test.js: the run path uses describeNodeRuntimeFailure",
      /describeNodeRuntimeFailure\(nodeRuntime\)/.test(pwSrc),
    );
    check(
      "playwright-test.js: the single 'not found on PATH (exit N)' message is gone",
      !/Node\.js executable was not found on PATH \(\$\{nodeRuntime\.error\}\)/.test(
        pwSrc,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n--- 3. check-node routing text ---");
  {
    for (const rel of [
      "common/skills/tizen-check-node/SKILL.md",
      "tizen-cli/skills/tizen-check-node/SKILL.md",
    ]) {
      const md = read(rel);
      const fm = md.split("---")[1] || "";
      const desc = (fm.match(/^description:\s*(.*)$/m) || [])[1] || "";
      check(
        `${rel}: description carries the exact TC prompts`,
        /Node\.js가 설치되어 있는지 확인해줘/.test(desc) &&
          /Do I have Node\.js installed/.test(desc),
      );
      check(
        `${rel}: description says NOT doctor`,
        /doctor/i.test(desc) && /NOT|never|not the/i.test(desc),
      );
    }
    const checkTs = read("tizen-cli/src/command-specs/check.ts");
    check(
      "check.ts: check-node description steers Node questions away from --doctor",
      /check-node[\s\S]{0,600}doctor/.test(checkTs),
    );
    const routing = read("tizen-cli/skills/tizen-sdk/SKILL.md");
    check(
      "tizen-sdk SKILL: routing row for check-node names the Node.js question and excludes doctor",
      /Node\.js[^\n]*\|\s*`check-node`/.test(routing) &&
        /doctor[^\n]*check-node|check-node[^\n]*doctor/.test(routing),
    );
  }
} finally {
  console.error = realConsoleError;
  try {
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  } catch (_e) {
    // best effort
  }
}

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
