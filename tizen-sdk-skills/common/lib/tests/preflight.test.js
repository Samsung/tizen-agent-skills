// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Pre-flight check tests (core/preflight.js) — issues #69 and #71.
 *
 *   #69  Windows disk check used only `wmic`, which Windows 11 24H2 removed, so
 *        the fallback reported "0 GB free" and blocked the install. The probe
 *        chain is now statfs → PowerShell → fsutil → wmic (df on POSIX), and an
 *        unmeasurable drive is a success-with-warning, never a 0 GB failure.
 *   #71  checkNode spawned `node --version` through a shell; a sandboxed child
 *        PATH without node reported node_not_found while the runner itself
 *        was running under Node. The running interpreter is now authoritative.
 *
 * Every probe is injected through the `deps` seam, so nothing here touches the
 * real host's disks or PATH — except the last case, which runs the real
 * check-node-cli.js with an empty PATH to prove the runner still succeeds.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  checkNode,
  checkDiskSpace,
  _getDiskSpaceViaCommand,
} = require("../core/preflight");
const {
  NODE_MIN_MAJOR,
  nodeVersionStatus,
  nodeFloorCheck,
  NODE_DOWNLOAD_URL,
  nodeInstallCommand,
} = require("../core/node-floor");

console.log("=== Pre-flight check tests (#69 disk, #71 node) ===\n");

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

const GB = 1024 * 1024 * 1024;
const statfsOf = (totalBytes, freeBytes) => () => ({
  bsize: 4096,
  blocks: totalBytes / 4096,
  bavail: freeBytes / 4096,
  bfree: freeBytes / 4096,
});
const throwing = (msg) => () => {
  throw new Error(msg);
};

/** execFileSync stub: `table[file]` is a string to return or an Error to throw. */
function execStub(table) {
  const calls = [];
  const fn = (file, args) => {
    calls.push(file);
    const entry = table[file];
    if (entry === undefined) throw new Error(`ENOENT: ${file} not found`);
    if (entry instanceof Error) throw entry;
    return typeof entry === "function" ? entry(args) : entry;
  };
  fn.calls = calls;
  return fn;
}

(async () => {
  // --- checkDiskSpace: statfs path --------------------------------------------
  console.log("--- checkDiskSpace: statfs ---");
  {
    const r = await checkDiskSpace("/some/dir", 15, "t", {
      statfsSync: statfsOf(500 * GB, 200 * GB),
      execFileSync: throwing("must not be called"),
      platform: "linux",
    });
    check("statfs ok → success", r.status, "success");
    check("free_gb from statfs", r.result.free_gb, 200);
    check("source statfs", r.result.source, "statfs");
    check("sufficient true", r.result.sufficient, true);
  }
  {
    const r = await checkDiskSpace("/some/dir", 15, "t", {
      statfsSync: statfsOf(500 * GB, 3 * GB),
      execFileSync: throwing("must not be called"),
      platform: "linux",
    });
    check("measured 3 GB → failure", r.status, "failure");
    check(
      "insufficient_disk_space category",
      r.errors[0].error_category,
      "insufficient_disk_space",
    );
    check(
      "TIZEN_SDK_ENV_E002 code",
      r.errors[0].error_code,
      "TIZEN_SDK_ENV_E002",
    );
    check(
      "message names the deficit",
      r.errors[0].message.includes("Need 12 GB more"),
      true,
    );
  }
  {
    // statfs fails on the path but works on the root (libuv quirk on some
    // Windows builds) — the root measurement is used, no command probe runs.
    let calls = 0;
    const r = await checkDiskSpace("C:\\Users\\someone", 15, "t", {
      statfsSync: (p) => {
        calls++;
        if (p === "C:\\") return statfsOf(500 * GB, 66 * GB)();
        throw new Error("ENOENT");
      },
      execFileSync: throwing("must not be called"),
      platform: "win32",
    });
    check("statfs(path) fails → statfs(root) used", r.status, "success");
    check("root statfs free_gb", r.result.free_gb, 66);
    check("two statfs attempts", calls, 2);
  }

  // --- checkDiskSpace: Windows command chain (#69) -----------------------------
  console.log("\n--- checkDiskSpace: Windows fallbacks (#69) ---");
  {
    const exec = execStub({
      powershell: `FREE=${66 * GB}\r\nTOTAL=${476 * GB}\r\n`,
    });
    const r = await checkDiskSpace("C:\\Users\\me", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: exec,
      platform: "win32",
    });
    check("statfs fails → PowerShell measures", r.status, "success");
    check("PowerShell free_gb 66", r.result.free_gb, 66);
    check("source powershell", r.result.source, "powershell");
    check("only powershell was called", exec.calls, ["powershell"]);
  }
  {
    // PowerShell blocked, fsutil answers (Korean-locale labels — only the
    // numbers and their order matter).
    const exec = execStub({
      powershell: new Error("blocked"),
      fsutil:
        `사용 가능한 바이트 총 수        : ${70 * GB} ( 70.0 GB)\r\n` +
        `바이트 총 수                    : ${476 * GB} (476.0 GB)\r\n` +
        `사용 가능한 할당량 바이트 총 수 : ${70 * GB} ( 70.0 GB)\r\n`,
    });
    const r = await checkDiskSpace("D:\\work", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: exec,
      platform: "win32",
    });
    check("fsutil fallback → success", r.status, "success");
    check("fsutil free_gb 70", r.result.free_gb, 70);
    check("fsutil total_gb 476", r.result.total_gb, 476);
    check("source fsutil", r.result.source, "fsutil");
    check("probe order powershell → fsutil", exec.calls, [
      "powershell",
      "fsutil",
    ]);
  }
  {
    // Only the legacy wmic works (old Windows 10 host).
    const exec = execStub({
      powershell: new Error("blocked"),
      fsutil: new Error("blocked"),
      wmic: `\r\n\r\nFreeSpace=${20 * GB}\r\nSize=${476 * GB}\r\n\r\n`,
    });
    const r = await checkDiskSpace("C:\\x", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: exec,
      platform: "win32",
    });
    check("wmic still honoured last", r.result.source, "wmic");
    check("wmic free_gb 20", r.result.free_gb, 20);
  }
  {
    // THE #69 case: statfs fails, wmic is gone, and (on this stub) so is
    // everything else → the check must not report 0 GB and block.
    const exec = execStub({});
    const r = await checkDiskSpace("C:\\Users\\me", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: exec,
      platform: "win32",
    });
    check("nothing measurable → success (not blocked)", r.status, "success");
    check("free_gb null, not 0", r.result.free_gb, null);
    check("sufficient null", r.result.sufficient, null);
    check("source unknown", r.result.source, "unknown");
    check(
      "warning explains the skipped check",
      r.warnings.length === 1 &&
        r.warnings[0].includes("could not be determined") &&
        r.warnings[0].includes("15 GB"),
      true,
    );
    check("all three Windows probes were tried", exec.calls, [
      "powershell",
      "fsutil",
      "wmic",
    ]);
  }
  {
    // UNC root: no drive letter → no command probe, unknown.
    const exec = execStub({ powershell: "FREE=1\r\nTOTAL=1\r\n" });
    const r = _getDiskSpaceViaCommand("\\\\server\\share\\dir", {
      execFileSync: exec,
      platform: "win32",
    });
    check("UNC path → null (no probe)", r, null);
    check("UNC path → no command run", exec.calls, []);
  }

  // --- checkDiskSpace: POSIX df ----------------------------------------------------
  console.log("\n--- checkDiskSpace: df ---");
  {
    const exec = execStub({
      df:
        "Filesystem 1024-blocks Used Available Capacity Mounted on\n" +
        `/dev/sda1 ${(500 * GB) / 1024} ${(300 * GB) / 1024} ${(200 * GB) / 1024} 60% /\n`,
    });
    const r = await checkDiskSpace("/home/u", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: exec,
      platform: "linux",
    });
    check("df fallback → success", r.status, "success");
    check("df free_gb 200", r.result.free_gb, 200);
    check("source df", r.result.source, "df");
    check("df called with -Pk", exec.calls, ["df"]);
  }
  {
    const r = await checkDiskSpace("/home/u", 15, "t", {
      statfsSync: throwing("statfs unsupported"),
      execFileSync: execStub({}),
      platform: "linux",
    });
    check("df missing → unknown success", r.result.source, "unknown");
  }

  // --- nodeVersionStatus (shared by check-node and tizen-sdk --doctor) ---------
  console.log("\n--- nodeVersionStatus ---");
  check("floor is 22", NODE_MIN_MAJOR, 22);
  check("node 24 → ok", nodeVersionStatus(24), "ok");
  check("node 22 → ok", nodeVersionStatus(22), "ok");
  check("node 21 → warn", nodeVersionStatus(21), "warn");
  check("node 20 → warn", nodeVersionStatus(20), "warn");
  check("node 18 → warn", nodeVersionStatus(18), "warn");
  check("node 17 → fail", nodeVersionStatus(17), "fail");
  check("NaN → fail", nodeVersionStatus(NaN), "fail");

  // --- nodeFloorCheck (check-node, sdk-install and doctor all use it) --------
  console.log("\n--- nodeFloorCheck ---");
  {
    const ok = nodeFloorCheck({ version: "v22.3.0", isPkg: false });
    check("v22 → ok, no message", [ok.status, ok.message], ["ok", null]);
    const warn = nodeFloorCheck({ version: "v20.19.0", isPkg: false });
    check("v20 → warn", warn.status, "warn");
    check(
      "warn message names the floor",
      warn.message.includes(`required v${NODE_MIN_MAJOR}+`) &&
        warn.message.includes(`Node.js ${NODE_MIN_MAJOR} LTS`),
      true,
    );
    const fail = nodeFloorCheck({ version: "v16.20.0", isPkg: false });
    check(
      "v16 → fail with message",
      [fail.status, !!fail.message],
      ["fail", true],
    );
    const pkg = nodeFloorCheck({ version: "v16.20.0", isPkg: true });
    check("pkg → ok, skipped", [pkg.status, pkg.skipped], ["ok", true]);
    check("major parsed", nodeFloorCheck({ version: "v20.1.0" }).major, 20);
  }
  {
    // .nvmrc is what CI and releases run; it must not drift below the floor.
    const nvmrc = fs
      .readFileSync(path.join(__dirname, "../../../.nvmrc"), "utf-8")
      .trim();
    // Leading major only: "22", "v22" and "22.11.0" are all valid pins.
    const m = nvmrc.match(/^v?(\d+)/);
    check(
      ".nvmrc major matches NODE_MIN_MAJOR",
      m ? parseInt(m[1], 10) : null,
      NODE_MIN_MAJOR,
    );
  }

  // --- checkNode (#71) ----------------------------------------------------------
  console.log("\n--- checkNode (#71) ---");
  {
    // PATH lookup fails (sandboxed child PATH) — the runner still succeeds
    // because the running interpreter is the proof.
    const r = await checkNode("t", {
      execPath: "/opt/nvm/versions/node/v22.11.0/bin/node",
      version: "v22.11.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ error: new Error("spawn which ENOENT"), status: 1 }),
    });
    check("node not on child PATH → still success", r.status, "success");
    check("version from process", r.result.version, "v22.11.0");
    check(
      "path is execPath",
      r.result.path,
      "/opt/nvm/versions/node/v22.11.0/bin/node",
    );
    check("major 22", r.result.major_version, 22);
    check("source process", r.result.source, "process");
    check("on_path false", r.result.on_path, false);
    check(
      "warning about PATH",
      r.warnings.length === 1 && r.warnings[0].includes("does not resolve"),
      true,
    );
  }
  {
    const r = await checkNode("t", {
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      version: "v22.1.0",
      isPkg: false,
      platform: "win32",
      spawnSync: (file, args) => ({
        status: 0,
        stdout:
          file === "where" && args[0] === "node"
            ? "C:\\Program Files\\nodejs\\node.exe\r\n"
            : "",
      }),
    });
    check("on PATH → no warnings", r.warnings, []);
    check("on_path true", r.result.on_path, true);
    check(
      "path_on_path omitted when identical",
      "path_on_path" in r.result,
      false,
    );
  }
  {
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "v16.20.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    // Below NODE_HARD_MIN_MAJOR the runners do not work: check-node fails
    // (and so does the sdk-install preflight), matching tizen-sdk --doctor.
    check("node 16 → failure", r.status, "failure");
    check(
      "node 16 → node_version_unsupported / TIZEN_SDK_ENV_E003",
      [r.errors[0].error_category, r.errors[0].error_code],
      ["node_version_unsupported", "TIZEN_SDK_ENV_E003"],
    );
    // A Linux system Node has no safe one-line install: no command, the
    // download page instead.
    check(
      "node 16, Linux system Node → no command, guide_url download page",
      [r.errors[0].suggested_fix.command, r.errors[0].suggested_fix.guide_url],
      [null, NODE_DOWNLOAD_URL],
    );
  }
  {
    // A pkg binary embedding Node 16 is not the user's to upgrade either.
    const r = await checkNode("t", {
      execPath: "/opt/tizen-cli",
      version: "v16.20.0",
      isPkg: true,
      platform: "linux",
      spawnSync: throwing("pkg must not spawn"),
    });
    check("pkg with embedded node 16 → success", r.status, "success");
  }
  {
    // Node 20 is end-of-life: below the v22 floor it still runs, with a warning.
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "v20.19.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check("node 20 → success", r.status, "success");
    check(
      "node 20 → v22+ upgrade warning",
      r.warnings.length === 1 && r.warnings[0].includes("required v22+"),
      true,
    );
    check(
      "node 20, Linux system Node → warning has no install command",
      r.warnings[0].includes("Install command"),
      false,
    );
  }
  {
    // Under nvm a system-wide install would not replace the Node on PATH:
    // the warning carries nvm's own command.
    const r = await checkNode("t", {
      execPath: "/home/user/.nvm/versions/node/v20.19.0/bin/node",
      version: "v20.19.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check(
      "node 20 under nvm → warning ends with the nvm command",
      r.warnings[0].endsWith(
        `Install command (run it yourself in a terminal): nvm install ${NODE_MIN_MAJOR} && nvm alias default ${NODE_MIN_MAJOR}`,
      ),
      true,
    );
  }
  {
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "v22.0.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check("node 22.0.0 → no version warning", r.warnings, []);
  }
  {
    const r = await checkNode("t", {
      execPath: "/opt/tizen-cli",
      version: "v22.0.0",
      isPkg: true,
      platform: "linux",
      spawnSync: throwing("pkg must not spawn"),
    });
    check("pkg binary → source pkg, no spawn", r.result.source, "pkg");
    check("pkg → no on_path field", "on_path" in r.result, false);
  }
  {
    // The Node embedded in a pkg binary cannot be upgraded by the user, so a
    // below-floor version there must not produce an "upgrade Node.js" warning.
    const r = await checkNode("t", {
      execPath: "/opt/tizen-cli",
      version: "v18.20.0",
      isPkg: true,
      platform: "linux",
      spawnSync: throwing("pkg must not spawn"),
    });
    check("pkg with embedded node 18 → success", r.status, "success");
    check("pkg with embedded node 18 → no upgrade warning", r.warnings, []);
  }
  // --- Node.js install command --------------------------------------------------
  // Only non-destructive commands: a version manager's own install, winget,
  // Homebrew. A Linux system Node gets none (the download page instead).
  console.log("\n--- Node.js install command ---");
  {
    // env is explicit so the host's own NVM_DIR / ProgramFiles do not leak in.
    const cmd = (platform, execPath, env = {}) =>
      nodeInstallCommand({ platform, execPath, env });
    const NVM = `nvm install ${NODE_MIN_MAJOR} && nvm alias default ${NODE_MIN_MAJOR}`;
    const FNM = `fnm install ${NODE_MIN_MAJOR} && fnm default ${NODE_MIN_MAJOR}`;
    const VOLTA = `volta install node@${NODE_MIN_MAJOR}`;
    const WINGET = "winget install OpenJS.NodeJS.LTS";
    const msi = "C:\\Program Files\\nodejs\\node.exe";

    // version managers: standard layout, or the directory their env names
    check(
      "nvm (~/.nvm)",
      cmd("linux", "/home/user/.nvm/versions/node/v20.1.0/bin/node"),
      NVM,
    );
    check(
      "nvm ($XDG_CONFIG_HOME/nvm)",
      cmd("darwin", "/Users/user/.config/nvm/versions/node/v20.1.0/bin/node"),
      NVM,
    );
    check(
      "nvm (custom NVM_DIR)",
      cmd("linux", "/opt/tools/nodes/versions/node/v20.1.0/bin/node", {
        NVM_DIR: "/opt/tools/nodes",
      }),
      NVM,
    );
    check(
      "fnm (multishell)",
      cmd("linux", "/run/user/1000/fnm_multishells/123_456/bin/node"),
      FNM,
    );
    check(
      "fnm (node-versions)",
      cmd(
        "darwin",
        "/Users/user/.local/share/fnm/node-versions/v20.1.0/installation/bin/node",
      ),
      FNM,
    );
    check(
      "volta on Windows",
      cmd(
        "win32",
        "C:\\Users\\user\\AppData\\Local\\Volta\\tools\\image\\node\\20.1.0\\node.exe",
      ),
      VOLTA,
    );
    check(
      "a folder merely named volta is not Volta",
      cmd("linux", "/opt/volta/node-20/bin/node"),
      null,
    );

    // nvm-windows runs node through its symlink, by default the MSI folder
    const nvmWin = {
      NVM_HOME: "C:\\Users\\user\\AppData\\Roaming\\nvm",
      NVM_SYMLINK: "C:\\Program Files\\nodejs",
    };
    check(
      "nvm-windows (node via NVM_SYMLINK)",
      cmd("win32", msi, nvmWin),
      `nvm install ${NODE_MIN_MAJOR} && nvm use ${NODE_MIN_MAJOR}`,
    );
    check(
      "nvm-windows installed, other node → none (winget would hit its symlink)",
      cmd("win32", "D:\\tools\\node\\node.exe", nvmWin),
      null,
    );

    // system installs: only where the command is certain to replace this node
    check(
      "Windows MSI node → winget",
      cmd("win32", msi, { ProgramFiles: "C:\\Program Files" }),
      WINGET,
    );
    check(
      "Windows MSI node, case and slashes differ → winget",
      cmd("win32", "c:/program files/NodeJS/node.exe", {}),
      WINGET,
    );
    check(
      "Windows scoop node → none",
      cmd("win32", "C:\\Users\\user\\scoop\\apps\\nodejs\\current\\node.exe", {
        ProgramFiles: "C:\\Program Files",
      }),
      null,
    );
    check(
      "macOS Homebrew node formula → brew",
      cmd("darwin", "/opt/homebrew/Cellar/node/25.1.0/bin/node"),
      "brew upgrade node",
    );
    check(
      "macOS keg-only node@20 → none",
      cmd("darwin", "/opt/homebrew/Cellar/node@20/20.19.0/bin/node"),
      null,
    );
    check(
      "macOS nodejs.org .pkg (/usr/local/bin) → none",
      cmd("darwin", "/usr/local/bin/node"),
      null,
    );
    check(
      "asdf → none",
      cmd("darwin", "/Users/user/.asdf/installs/nodejs/20.1.0/bin/node"),
      null,
    );
    check("Linux system Node → none", cmd("linux", "/usr/bin/node"), null);
  }
  {
    // A failure keeps the warnings already found (node not on the PATH of
    // spawned shells), which sdk-install then carries too.
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "v16.20.0",
      isPkg: false,
      platform: "linux",
      env: {},
      spawnSync: () => ({ status: 1, stdout: "" }),
    });
    check("node 16, not on PATH → failure", r.status, "failure");
    check(
      "node 16, not on PATH → PATH warning kept",
      (r.warnings || []).some((w) => w.includes("does not resolve")),
      true,
    );
  }
  {
    const r = await checkNode("t", {
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      version: "garbage",
      isPkg: false,
      platform: "win32",
      env: { ProgramFiles: "C:\\Program Files" },
      spawnSync: () => ({ status: 0, stdout: "" }),
    });
    check(
      "broken version → node_not_found",
      r.errors[0].error_category,
      "node_not_found",
    );
    check(
      "Windows → winget in suggested_fix, guide_url kept",
      [r.errors[0].suggested_fix.command, r.errors[0].suggested_fix.guide_url],
      ["winget install OpenJS.NodeJS.LTS", NODE_DOWNLOAD_URL],
    );
  }
  {
    // A version without the "v" prefix is parsed the same way as by doctor.
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "22.1.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check("22.1.0 (no v) → success", r.status, "success");
    check("22.1.0 (no v) → major 22", r.result.major_version, 22);
  }
  {
    // The registry has no command to fall back on — only the download page —
    // so a host without a safe command never gets a prose "command".
    const { ERROR_CODES } = require("../envelope/envelope");
    for (const key of ["NODE_NOT_FOUND", "NODE_VERSION_UNSUPPORTED"]) {
      const fix = ERROR_CODES[key].suggested_fix;
      check(
        `${key} registry → guide_url only`,
        [fix.command, fix.guide_url],
        [undefined, NODE_DOWNLOAD_URL],
      );
    }
  }

  // --- real runner with an empty PATH (the #71 reproduction) --------------------
  console.log("\n--- check-node-cli.js with empty PATH ---");
  {
    const cli = path.resolve(__dirname, "../cli/check-node-cli.js");
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
      if (k.toLowerCase() === "path") delete env[k];
    }
    env.PATH = "";
    const r = spawnSync(process.execPath, [cli], {
      encoding: "utf-8",
      env,
      timeout: 30000,
    });
    let json = null;
    try {
      json = JSON.parse(r.stdout);
    } catch (_e) {
      /* handled below */
    }
    check("exit 0 with empty PATH", r.status, 0);
    check("status success", json && json.status, "success");
    check(
      "version is this node's version",
      json && json.result.version,
      process.version,
    );
  }

  console.log(
    `\n${failures === 0 ? "All preflight tests passed" : `${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
