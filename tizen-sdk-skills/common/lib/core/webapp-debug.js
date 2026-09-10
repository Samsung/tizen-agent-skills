// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Webapp debug domain: Tizen Web app (.wgt) remote debugging setup via
 * RWI (Remote Web Inspector) / CDP (Chrome DevTools Protocol) — setup-only.
 *
 * Web apps run inside the web runtime (Chromium-based engine), so debugging
 * means CDP, not gdb/netcoredbg. The worker script launches the app in
 * web-debug mode (`app_launcher -w -s`), forwards a host port to the
 * device-side RWI port, and verifies /json/version + /json/list. The goal is
 * to hand the caller a live CDP endpoint plus ready-to-use connect snippets
 * (Playwright connectOverCDP / Chrome DevTools) in the envelope result.
 */

const fs = require("fs");
const path = require("path");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { findLatestVersionDir, execPluginScript } = require("./plugin-cache");
const { summarizeOutput } = require("./output-summary");

/**
 * Extract only key lines from webapp debug setup script output for envelope warnings
 *
 * Discard progress logs/markers/JSON payload lines — those are all redundant
 * with the parsed result fields.
 *
 * @param {string} output - script stdout+stderr
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeWebappDebugOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|not found|missing|not reachable|not support/i,
    skip: /^(App PID:|RWI device port:|Forwarded:|CDP endpoint:|CDP_(VERSION|PAGES)_JSON_(BEGIN|END)|[[{"])/i,
    max: 10,
  });
}

/**
 * Parse the launch markers from the worker script output.
 *
 * @param {string} output - script stdout+stderr
 * @returns {{appPid: number|null, devicePort: number|null}}
 */
function parseRwiLaunch(output) {
  const text = String(output || "");
  const pidMatch = text.match(/^App PID:\s*(\d+)\s*$/m);
  const portMatch = text.match(/^RWI device port:\s*(\d+)\s*$/m);
  return {
    appPid: pidMatch ? parseInt(pidMatch[1], 10) : null,
    devicePort: portMatch ? parseInt(portMatch[1], 10) : null,
  };
}

/**
 * Parse a fenced JSON block (CDP_<NAME>_JSON_BEGIN ... _END) from script output.
 *
 * Tolerant of CRLF and of log noise before/after the fences. Returns the
 * parsed value, or null when the fences are missing or the body is not JSON.
 *
 * @param {string} output - script stdout+stderr
 * @param {string} name - block name, e.g. "VERSION" or "PAGES"
 * @returns {object|Array|null}
 */
function parseCdpJsonBlock(output, name) {
  const text = String(output || "").replace(/\r\n/g, "\n");
  const fence = new RegExp(
    `^CDP_${name}_JSON_BEGIN\\s*$([\\s\\S]*?)^CDP_${name}_JSON_END\\s*$`,
    "m",
  );
  const match = text.match(fence);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch (_e) {
    return null;
  }
}

/**
 * Tizen Web app remote debugging setup via RWI/CDP (setup-only)
 *
 * Always executes scripts/tizen-webapp-debug: verify device → refuse non-wgt
 * apps → relaunch the app with `app_launcher -w -s` (RWI enabled) → forward a
 * host port to the device RWI port → verify the CDP endpoint answers
 * /json/version and /json/list → exit. The RWI session and the port forward
 * stay alive after setup (forward rules live in the host sdb server daemon).
 *
 * The script cannot drive a CDP client itself — the goal is to pass
 * result.cdp_endpoint / result.connect snippets to the user, who connects
 * Playwright (connectOverCDP) or Chrome DevTools.
 *
 * @param {string} appId - Tizen web app ID (required, e.g. "abcDEF1234.MyWebApp")
 * @param {object} [opts]
 * @param {string} [opts.serial=''] - device serial (default: first connected device)
 * @param {number|string} [opts.port=9222] - host port forwarded to the device RWI port
 * @param {number|string} [opts.timeout=30] - CDP endpoint readiness timeout (seconds)
 * @returns {object} Standard JSON Envelope
 */
async function setupWebappDebug(
  appId,
  opts = {},
  command = "tizen-sdk webapp-debug",
) {
  const startTime = Date.now();
  try {
    if (!appId) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: appId",
        'setupWebappDebug("abcDEF1234.MyWebApp", { port: 9222 })',
      );
    }
    // Allow only safe characters in shell args
    if (!/^[A-Za-z0-9._-]+$/.test(appId)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app id: ${appId}`,
      );
    }
    const serial = opts.serial || "";
    if (serial && !/^[A-Za-z0-9._:-]+$/.test(serial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid serial: ${serial}`,
      );
    }
    const port = parseInt(opts.port === undefined ? 9222 : opts.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid port: ${opts.port}`,
      );
    }
    const timeout = parseInt(
      opts.timeout === undefined ? 30 : opts.timeout,
      10,
    );
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 300) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid timeout: ${opts.timeout}. Must be 1-300 seconds.`,
      );
    }

    // resolveScript() assumes <group>/<group>.ps1 filename — matches here, but
    // assemble directly from the version directory like the other debug setups.
    const versionDir = findLatestVersionDir();
    if (!versionDir) {
      return formatError(
        command,
        "io_error",
        "No plugin version found in cache.",
      );
    }
    const ext = process.platform === "win32" ? ".ps1" : ".sh";
    const scriptPath = path.join(
      versionDir,
      "scripts",
      "tizen-webapp-debug",
      `tizen-webapp-debug${ext}`,
    );
    if (!fs.existsSync(scriptPath)) {
      return formatError(
        command,
        "io_error",
        `Script not found: ${scriptPath}`,
      );
    }

    console.error(
      `[tizen-webapp-debug] Setting up RWI/CDP debug for ${appId} (host port ${port})`,
    );

    const winArgs =
      `-App "${appId}" -Port ${port} -Timeout ${timeout}` +
      (serial ? ` -Serial "${serial}"` : "");
    const unixArgs =
      `-a "${appId}" -p ${port} -t ${timeout}` +
      (serial ? ` -s "${serial}"` : "");

    let output;
    try {
      // captureViaTempFile required: the script leaves the sdb port forward /
      // RWI session in place, then exits — in pipe mode a lingering child that
      // inherited the stdout handle would make execSync block forever.
      output = execPluginScript(scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      });
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      if (/No devices found|No connected device/i.test(combined)) {
        return formatError(
          command,
          "device_not_found",
          "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry.",
          null,
          startTime,
        );
      }
      if (/is not a Web app/i.test(combined)) {
        return formatError(
          command,
          "invalid_parameters",
          `'${appId}' is not a Web app (wgt). RWI/CDP debugging only works for Web apps — use tizen-gdb-debug for Native (.tpk C/C++) apps or tizen-dotnet-debug for .NET apps. If the app is not installed yet, install it first with tizen-install-app.`,
          null,
          startTime,
        );
      }
      if (/No RWI port in app_launcher output/i.test(combined)) {
        return formatError(
          command,
          "inspector_not_available",
          "The app launched but printed no RWI port — the image may not support the Remote Web Inspector (emulator/dev images do), or the app failed to enter debug launch. Verify the app is installed and launchable, then retry.",
          null,
          startTime,
        );
      }
      if (/CDP endpoint not reachable/i.test(combined)) {
        return formatError(
          command,
          "inspector_not_available",
          `The port forward is in place but http://127.0.0.1:${port}/json/version gave no answer within ${timeout}s. Retry (optionally with a longer timeout); if it persists, relaunch the app.`,
          null,
          startTime,
        );
      }
      if (/Port forward failed/i.test(combined)) {
        return formatError(
          command,
          "io_error",
          `Port forward failed — host tcp:${port} may be in use. Retry with a different --port.`,
          null,
          startTime,
        );
      }
      if (/App launch failed|not installed/i.test(combined)) {
        return formatError(
          command,
          "execution_error",
          `Could not launch ${appId}. Install the app first with tizen-install-app, then retry.`,
          null,
          startTime,
        );
      }
      const detail = summarizeWebappDebugOutput(combined).join(" | ");
      return formatError(
        command,
        "io_error",
        `Webapp debug setup failed: ${error.message}${detail ? ` — ${detail}` : ""}`,
        null,
        startTime,
      );
    }

    // Success marker parsing
    const { appPid, devicePort } = parseRwiLaunch(output);
    if (!devicePort) {
      return formatError(
        command,
        "io_error",
        "Setup script exited successfully but printed no RWI device port marker.",
        null,
        startTime,
      );
    }

    const version = parseCdpJsonBlock(output, "VERSION");
    const pages = parseCdpJsonBlock(output, "PAGES");
    const warnings = summarizeWebappDebugOutput(output);
    if (!Array.isArray(pages)) {
      warnings.push(
        "Could not parse the inspectable page list (/json/list) — the CDP endpoint is up, connect a client to enumerate pages.",
      );
    }

    const cdpEndpoint = `http://127.0.0.1:${port}`;
    const pageList = (Array.isArray(pages) ? pages : []).map((p) => ({
      id: p.id || null,
      type: p.type || null,
      title: p.title || null,
      url: p.url || null,
      webSocketDebuggerUrl: p.webSocketDebuggerUrl || null,
      devtoolsFrontendUrl: p.devtoolsFrontendUrl || null,
    }));
    const firstFrontendPath = pageList.length
      ? pageList[0].devtoolsFrontendUrl
      : null;
    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        app_id: appId,
        app_pid: appPid,
        device_port: devicePort,
        host_port: port,
        port_forwarded: true,
        cdp_endpoint: cdpEndpoint,
        browser: (version && version.Browser) || null,
        pages: pageList,
        connect: {
          playwright: `const browser = await chromium.connectOverCDP('${cdpEndpoint}');`,
          devtools: firstFrontendPath
            ? `${cdpEndpoint}${firstFrontendPath}`
            : `Open ${cdpEndpoint}/json/list and open a page's devtoolsFrontendUrl in Chrome.`,
        },
        note: "The RWI session and the port forward stay alive after setup — reconnect anytime while the app runs. If the app is restarted, run this setup again.",
      },
      {
        // Key lines only (warnings/errors) instead of full setup log
        warnings,
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to set up webapp debugging: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  setupWebappDebug,
  parseRwiLaunch,
  parseCdpJsonBlock,
};
