// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * --doctor and --capabilities handlers for the tizen-sdk plugin.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { outputEnvelope } from "./lib/core-utils";
import { withUserCommand } from "./envelope-adapter";
import { COMMAND_SPECS } from "./command-specs";

const sdkCommands = require("../../common/lib/core/sdk-commands");

const pluginCache = require("../../common/lib/core/plugin-cache");
// Single source for Java/JNA crash detection — the same constant the emulator
// domain uses to add its hint, so doctor and launch classify a failure alike.

const {
  JAVA_JNA_PATTERN,
  JAVA_VERSION_MISMATCH_PATTERN,
} = require("../../common/lib/core/emulator");

// Derive capability lists dynamically from COMMAND_SPECS.
// Commands with requiresSdk === false are always available;
// all others require the Tizen SDK to be installed.
const ALWAYS_AVAILABLE = COMMAND_SPECS.filter(
  (s) => s.requiresSdk === false,
).map((s) => s.name);

const SDK_DEPENDENT = COMMAND_SPECS.filter((s) => s.requiresSdk !== false).map(
  (s) => s.name,
);

function commandExists(cmd: string): boolean {
  // Allow only safe characters: letters, digits, hyphens, underscores
  // Prevents command injection via the cmd parameter
  if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    // Use execFileSync (no shell) to avoid shell injection — S4721
    if (process.platform === "win32") {
      execFileSync("where", [cmd], { stdio: ["ignore", "ignore", "ignore"] });
    } else {
      execFileSync("command", ["-v", cmd], {
        stdio: ["ignore", "ignore", "ignore"],
        shell: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

function sdkInstalled(): boolean {
  try {
    return !!sdkCommands.checkSdkInstallStatus(sdkCommands.readSdkPath())
      .installed;
  } catch {
    return false;
  }
}

interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

/**
 * em-cli (the emulator manager CLI) is a Java tool and can be broken while
 * every other check passes — issue #40: doctor reported the plugin healthy
 * while every launch-emulator call died on a Java/JNA error. Probe it with
 * the same read-only command the plugin scripts use, and surface the first
 * error line so a remote client can tell a missing JNA jar from a broken JVM.
 */
function emCliCheck(sdkOk: boolean): DoctorCheck {
  const name = "Emulator CLI (em-cli) responds";
  if (!sdkOk) {
    return {
      name,
      status: "warn",
      message: "skipped — Tizen SDK not installed",
    };
  }

  let sdkPath = "";
  try {
    sdkPath = String(sdkCommands.readSdkPath() || "");
  } catch {
    return {
      name,
      status: "warn",
      message: "skipped — SDK path could not be read",
    };
  }

  const emCli = path.join(
    sdkPath,
    "tools",
    "emulator",
    "bin",
    process.platform === "win32" ? "em-cli.bat" : "em-cli",
  );
  if (!fs.existsSync(emCli)) {
    return {
      name,
      status: "warn",
      message:
        `em-cli not found at ${emCli} — emulator package not installed, so create-emulator/launch-emulator ` +
        "are unavailable. Run: download-emulator-package",
    };
  }

  // em-cli boots a JVM (~4s warm on a typical dev machine). Keep the probe
  // budget small: doctor is a quick status sweep, and execFileSync blocks it
  // for the full timeout when em-cli hangs. 15s is ~3-4x the observed warm
  // boot; slow hosts can raise it via TIZEN_DOCTOR_EMCLI_TIMEOUT_MS.
  const timeoutMs =
    parseInt(process.env.TIZEN_DOCTOR_EMCLI_TIMEOUT_MS || "", 10) || 15000;

  try {
    const opts: import("child_process").ExecFileSyncOptionsWithStringEncoding =
      {
        encoding: "utf8",
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
      };
    if (process.platform === "win32") {
      // .bat files cannot be execFile'd directly (EINVAL since Node 18.18).
      execFileSync("cmd.exe", ["/c", emCli, "list-vm"], opts);
    } else {
      execFileSync(emCli, ["list-vm"], opts);
    }
    return {
      name,
      status: "ok",
      message: `em-cli list-vm responds (${emCli})`,
    };
  } catch (e) {
    const err = e as {
      stdout?: string;
      stderr?: string;
      message?: string;
      code?: string | number;
      signal?: string;
    };

    // A timeout means "unresponsive within the budget", not a confirmed crash
    // — a slow host and a hung JVM look identical here. Report warn with the
    // knob to raise, instead of a misleading crash message.
    if (err.code === "ETIMEDOUT" || err.signal === "SIGTERM") {
      return {
        name,
        status: "warn",
        message:
          `em-cli did not respond to 'list-vm' within ${timeoutMs}ms — the host may be slow, or em-cli may hang. ` +
          "Re-run doctor with a larger budget (TIZEN_DOCTOR_EMCLI_TIMEOUT_MS=60000); if it never responds, emulator launch will hang the same way.",
      };
    }

    const output = `${err.stderr || ""}\n${err.stdout || ""}`;
    const firstLine =
      output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ||
      err.message ||
      "no output";
    // NoSuchFieldError/NoSuchMethodError is a loaded-but-mismatched class —
    // an emulator-manager core vs platform plugin version skew, fixed by the
    // update-package flow, not by a JNA reinstall.
    const jnaHint = JAVA_VERSION_MISMATCH_PATTERN.test(output)
      ? " This is an emulator-manager vs platform-plugin version mismatch — update the SDK packages (tizen-update-package)."
      : JAVA_JNA_PATTERN.test(output)
        ? " This is a Java/JNA runtime problem — reinstall the emulator package (download-emulator-package) and verify the SDK's bundled JRE runs."
        : "";
    return {
      name,
      status: "fail",
      message:
        `em-cli failed its 'list-vm' probe: ${firstLine.slice(0, 200)} — ` +
        `create-emulator/launch-emulator will not work until this is fixed.${jnaHint}`,
    };
  }
}

export function handleDoctor(): { status: "success" | "failure" } {
  const nodeMajor = parseInt(process.version.slice(1).split(".")[0], 10);
  const scriptsRoot = pluginCache.findLatestVersionDir();
  const installerResolved = scriptsRoot
    ? !("error" in pluginCache.resolveScript("tizen-sdk-install"))
    : false;
  const shell = process.platform === "win32" ? "powershell" : "bash";
  const shellOk = commandExists(shell);
  const sdkOk = sdkInstalled();
  const sdbOk = commandExists("sdb");

  const checks = [
    {
      name: "Node.js version (18+)",
      status: nodeMajor >= 18 ? ("ok" as const) : ("fail" as const),
      message: `Node.js ${process.version} detected`,
    },
    {
      name: "Plugin scripts directory",
      status:
        scriptsRoot && installerResolved ? ("ok" as const) : ("fail" as const),
      message: scriptsRoot
        ? installerResolved
          ? `scripts/ found at ${scriptsRoot}`
          : `scripts/ found at ${scriptsRoot} but tizen-sdk-install script is missing`
        : "scripts/ directory not found next to the plugin binary — reinstall the plugin",
    },
    {
      name: `Shell available (${shell})`,
      status: shellOk ? ("ok" as const) : ("fail" as const),
      message: shellOk
        ? `${shell} is on PATH`
        : `${shell} not found on PATH — plugin scripts cannot run`,
    },
    {
      name: "Tizen SDK installed",
      status: sdkOk ? ("ok" as const) : ("warn" as const),
      message: sdkOk
        ? `Tizen SDK found at ${sdkCommands.readSdkPath()}`
        : "Tizen SDK not installed — run: tizen-cli tizen-sdk sdk-install",
    },
    {
      name: "sdb reachable",
      status: sdbOk ? ("ok" as const) : ("warn" as const),
      message: sdbOk
        ? "sdb is on PATH"
        : "sdb not on PATH — device-manager/install-app/debug commands locate it via the SDK path at runtime",
    },
    emCliCheck(sdkOk),
  ];

  const failed = checks.some((c) => c.status === "fail");

  outputEnvelope(
    withUserCommand({
      status: "success",
      result: {
        plugin: "tizen-sdk",
        checks,
      },
      warnings: failed ? ["One or more environment checks failed"] : [],
      errors: [],
    }),
  );

  return { status: "success" };
}

export function handleCapabilities(): { status: "success" | "failure" } {
  const sdkOk = sdkInstalled();

  outputEnvelope(
    withUserCommand({
      status: "success",
      result: {
        available: sdkOk
          ? [...ALWAYS_AVAILABLE, ...SDK_DEPENDENT]
          : [...ALWAYS_AVAILABLE],
        unavailable: sdkOk
          ? []
          : SDK_DEPENDENT.map((cmd) => ({
              command: cmd,
              reason: "Tizen SDK not installed — run sdk-install first",
            })),
      },
      warnings: [],
      errors: [],
    }),
  );

  return { status: "success" };
}
