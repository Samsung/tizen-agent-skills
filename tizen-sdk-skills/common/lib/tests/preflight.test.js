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
  linuxDistroFamily,
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
      osRelease: "ID=ubuntu\nID_LIKE=debian\n",
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
    check(
      "node 16 → linux install command in suggested_fix",
      r.errors[0].suggested_fix.command.includes(`setup_${NODE_MIN_MAJOR}.x`),
      true,
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
      osRelease: 'ID=debian\nVERSION_ID="12"\n',
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check("node 20 → success", r.status, "success");
    check(
      "node 20 → v22+ upgrade warning",
      r.warnings.length === 1 && r.warnings[0].includes("required v22+"),
      true,
    );
    // Debian 12 / Ubuntu 24.04 ship Node 18: the hosts that most need the
    // distribution-specific command get it with the warning, not only on failure.
    check(
      "node 20 on Debian → warning carries the NodeSource command",
      r.warnings[0].endsWith(
        `Install command for this host: ${nodeInstallCommand("linux", "ID=debian\n")}`,
      ),
      true,
    );
  }
  {
    // A supported Node never shows the install command, so /etc/os-release
    // is not read on that path.
    let reads = 0;
    const deps = {
      execPath: "/usr/bin/node",
      version: "v22.0.0",
      isPkg: false,
      platform: "linux",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    };
    Object.defineProperty(deps, "osRelease", {
      get() {
        reads++;
        return "ID=debian\n";
      },
    });
    const r = await checkNode("t", deps);
    check("node 22.0.0 → no version warning", r.warnings, []);
    check("node 22.0.0 → os-release not read", reads, 0);
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
  // --- Node.js install command by OS / Linux distribution ---------------------
  console.log("\n--- Node.js install command ---");
  check(
    "os-release: ubuntu → debian",
    linuxDistroFamily("ID=ubuntu\nID_LIKE=debian\n"),
    "debian",
  );
  check(
    "os-release: linuxmint (ID_LIKE ubuntu) → debian",
    linuxDistroFamily('ID=linuxmint\nID_LIKE="ubuntu debian"\n'),
    "debian",
  );
  check("os-release: fedora → rhel", linuxDistroFamily("ID=fedora\n"), "rhel");
  check(
    "os-release: rocky 9 (ID_LIKE rhel) → rhel",
    linuxDistroFamily(
      'ID="rocky"\nID_LIKE="rhel centos fedora"\nVERSION_ID="9.4"\n',
    ),
    "rhel",
  );
  // yum-only hosts NodeSource no longer builds for (el7, glibc 2.17): a dnf
  // command would fail there, so they get the download page instead.
  check(
    "os-release: centos 7 → other",
    linuxDistroFamily('ID="centos"\nID_LIKE="rhel fedora"\nVERSION_ID="7"\n'),
    "other",
  );
  check(
    "os-release: Amazon Linux 2 → other",
    linuxDistroFamily(
      'ID="amzn"\nID_LIKE="centos rhel fedora"\nVERSION_ID="2"\n',
    ),
    "other",
  );
  check(
    "os-release: Amazon Linux 2023 → rhel",
    linuxDistroFamily('ID="amzn"\nID_LIKE="fedora"\nVERSION_ID="2023"\n'),
    "rhel",
  );
  check("os-release: arch → other", linuxDistroFamily("ID=arch\n"), "other");
  check("os-release: unreadable → other", linuxDistroFamily(""), "other");
  {
    const deb = nodeInstallCommand("linux", "ID=debian\n");
    check(
      `debian → NodeSource deb setup_${NODE_MIN_MAJOR}.x`,
      deb.includes(`deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x`),
      true,
    );
    // The distro packages NodeSource's nodejs collides with (libnode-dev,
    // and the versioned libnodeNN runtime) are removed first: only the ones
    // dpkg reports installed (apt aborts on an unknown name), without -y so
    // apt asks, and with && so declining stops before the conflicting install.
    check(
      "debian → removes installed nodejs/npm/libnode* first",
      deb.startsWith("sudo apt-get remove $(dpkg-query -W ") &&
        deb.includes("nodejs npm 'libnode*'") &&
        deb.includes("awk '/^ii/{print $2}')"),
      true,
    );
    check(
      "debian → apt asks before removing (no -y on remove)",
      /apt-get remove -y/.test(deb),
      false,
    );
    check(
      "debian → declining the removal stops the install",
      /\) && curl -fsSL https:\/\/deb\.nodesource\.com/.test(deb),
      true,
    );
    check(
      "debian → not the distro nodejs npm install",
      deb.includes("install -y nodejs npm"),
      false,
    );
    const rpm = nodeInstallCommand("linux", "ID=fedora\n");
    check(
      `rhel → NodeSource rpm setup_${NODE_MIN_MAJOR}.x + dnf`,
      rpm.includes(`rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x`) &&
        rpm.includes("dnf install -y nodejs"),
      true,
    );
    const other = nodeInstallCommand("linux", "ID=arch\n");
    check(
      "other Linux → nodejs.org, no apt/dnf",
      other.includes("https://nodejs.org/en/download") &&
        !/apt-get|dnf/.test(other),
      true,
    );
    check(
      "win32 / darwin unchanged",
      [nodeInstallCommand("win32"), nodeInstallCommand("darwin")],
      ["winget install OpenJS.NodeJS.LTS", "brew install node"],
    );
  }
  {
    // checkNode puts the host's command (not an all-OS list) in suggested_fix.
    const r = await checkNode("t", {
      execPath: "/usr/bin/node",
      version: "garbage",
      isPkg: false,
      platform: "linux",
      osRelease: "ID=fedora\n",
      spawnSync: () => ({ status: 0, stdout: "/usr/bin/node\n" }),
    });
    check(
      "broken version → node_not_found",
      r.errors[0].error_category,
      "node_not_found",
    );
    check(
      "fedora host → rpm command only",
      r.errors[0].suggested_fix.command,
      nodeInstallCommand("linux", "ID=fedora\n"),
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
    const { ERROR_CODES } = require("../envelope/envelope");
    for (const key of ["NODE_NOT_FOUND", "NODE_VERSION_UNSUPPORTED"]) {
      const fallback = ERROR_CODES[key].suggested_fix.command;
      check(
        `${key} fallback → debian, rhel and other-Linux commands`,
        fallback.includes(nodeInstallCommand("linux", "ID=debian\n")) &&
          fallback.includes(nodeInstallCommand("linux", "ID=fedora\n")) &&
          fallback.includes("https://nodejs.org/en/download"),
        true,
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
