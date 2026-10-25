#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * check-update.js — session-start hook: tell the user when a newer release of
 * an installed tizen-agent-skills plugin is out.
 *
 * Installed copies never check for updates on their own. This hook compares the
 * installed plugin versions with the catalog on GitHub main (marketplace.json
 * lists every plugin's version, so one request covers them all).
 *
 * Usage (registered by common/setup/hosts/*):
 *   node check-update.js --host <claude|codex|gemini|cline> --cache-root <dir>
 *
 *   --cache-root  <HOST_HOME>/plugins/cache/tizen-platform; the installed
 *                 version of <plugin> is its highest <cache-root>/<plugin>/<X.Y.Z>/
 *
 * The catalog is fetched at most once a day; the result is cached in
 * ~/.tizen.agent.update.json. Any failure (offline, timeout, HTTP error,
 * malformed catalog, unreadable file) prints nothing — the session starts as
 * usual. A failed fetch is retried after 4 hours instead of a day, so a brief
 * outage is caught up soon while an offline machine does not wait for the
 * timeout on every session.
 *
 * The same notice is shown at most once a day (shared by every host); a new
 * release or a different installed version shows again at once.
 *
 * Output (only when an update exists; exit code is always 0):
 *   claude, codex, gemini: {"systemMessage", "hookSpecificOutput.additionalContext"}
 *   cline (TaskStart):     {"cancel": false, "contextModification"}
 * The model-facing text also asks the model to relay the notice once, since
 * the Claude Code VS Code extension does not display systemMessage.
 *
 * Behind a proxy (HTTPS_PROXY / https_proxy): Node's fetch ignores the proxy
 * unless NODE_USE_ENV_PROXY=1 was set at startup (Node 22.21+ / 24+), so the
 * script re-runs itself with it. On an older Node the check is skipped, since a
 * direct connection would only wait for the timeout.
 *
 * Built-in modules only: the file is copied on its own into each host's hook dir.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CATALOG_URL =
  "https://raw.githubusercontent.com/Samsung/tizen-agent-skills/main/.claude-plugin/marketplace.json";
const RELEASES_URL = "https://github.com/Samsung/tizen-agent-skills/releases";
const CACHE_FILE = path.join(os.homedir(), ".tizen.agent.update.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 4 * 60 * 60 * 1000;
const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const HOSTS = ["claude", "codex", "gemini", "cline"];
const VERSION_RE = /^\d+\.\d+\.\d+$/;

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === "--host") opts.host = argv[i + 1];
    else if (argv[i] === "--cache-root") opts.cacheRoot = argv[i + 1];
  }
  return opts;
}

const proxyConfigured = () =>
  Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
const proxyEnabled = () => process.env.NODE_USE_ENV_PROXY === "1";

function nodeSupportsEnvProxy() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  return major >= 24 || (major === 22 && minor >= 21);
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function installedVersion(cacheRoot, plugin) {
  let dirs;
  try {
    dirs = fs.readdirSync(path.join(cacheRoot, plugin));
  } catch {
    return null;
  }
  const versions = dirs.filter((d) => VERSION_RE.test(d));
  if (versions.length === 0) return null;
  return versions.sort(compareVersions).pop();
}

function readCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    if (typeof cache.checkedAt !== "number") return null;
    if (typeof cache.latest !== "object" || cache.latest === null) {
      cache.latest = {};
    }
    return cache;
  } catch {
    return null;
  }
}

function writeCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache) + "\n", "utf-8");
  } catch {
    // A read-only home only costs a re-check next session.
  }
}

/** { plugin: version } from the catalog, or null on any failure. */
async function fetchLatest() {
  if (proxyConfigured() && !proxyEnabled()) return null;
  try {
    const res = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const catalog = await res.json();
    if (!Array.isArray(catalog.plugins)) return null;
    const latest = {};
    for (const p of catalog.plugins) {
      if (typeof p.name === "string" && VERSION_RE.test(p.version)) {
        latest[p.name] = p.version;
      }
    }
    return Object.keys(latest).length > 0 ? latest : null;
  } catch {
    return null;
  }
}

function isFresh(cache) {
  if (!cache) return false;
  const interval = cache.failed ? RETRY_INTERVAL_MS : CHECK_INTERVAL_MS;
  return Date.now() - cache.checkedAt < interval;
}

async function latestVersions() {
  const cache = readCache();
  if (isFresh(cache)) return cache.latest;
  const fetched = await fetchLatest();
  const latest = fetched || (cache ? cache.latest : {});
  writeCache({ ...cache, checkedAt: Date.now(), failed: !fetched, latest });
  return latest;
}

/** Whether this exact notice was already shown within the last day. */
function shownToday(cache, notice) {
  return (
    cache?.notified === notice &&
    typeof cache.notifiedAt === "number" &&
    Date.now() - cache.notifiedAt < NOTIFY_INTERVAL_MS
  );
}

// Some UIs (the Claude Code VS Code extension, Cline) never show the notice
// itself, so the model is asked to relay it once. Phrased as a message from
// the plugin addressed to the user, which a model is more willing to pass on
// than a bare instruction found in injected context.
const RELAY_PREFIX =
  "Notice from the installed tizen-sdk-skills plugin, addressed to the user. " +
  "The user's chat UI may not display hook messages, so the user has not seen it. " +
  "Please begin your first reply with one short line passing it on, then answer as usual. " +
  "The notice:";

function formatOutput(host, message) {
  const context = message ? `${RELAY_PREFIX} ${message}` : "";
  if (host === "cline") {
    return context
      ? { cancel: false, contextModification: context }
      : { cancel: false };
  }
  if (!message) return null;
  return {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  };
}

async function main() {
  // The host sends the event JSON on stdin; it is not needed.
  process.stdin.resume();
  process.stdin.on("error", () => {});

  const { host, cacheRoot } = parseArgs(process.argv.slice(2));
  if (!HOSTS.includes(host) || !cacheRoot) return;

  // Re-run with proxy support only when a fetch is due; a fresh cache needs
  // no network, so this process answers from it directly.
  if (
    proxyConfigured() &&
    !proxyEnabled() &&
    nodeSupportsEnvProxy() &&
    !isFresh(readCache())
  ) {
    const r = spawnSync(process.execPath, process.argv.slice(1), {
      env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
      stdio: ["ignore", "inherit", "ignore"],
      timeout: FETCH_TIMEOUT_MS + 1000,
    });
    if (!r.error && r.status === 0) return;
    // Silent by design: a failed re-run prints nothing (Cline still gets
    // its {"cancel": false} below).
    const output = formatOutput(host, "");
    if (output) process.stdout.write(JSON.stringify(output) + "\n");
    return;
  }

  let message = "";
  try {
    const latest = await latestVersions();
    const updates = [];
    for (const [plugin, version] of Object.entries(latest)) {
      if (!VERSION_RE.test(version)) continue;
      const installed = installedVersion(cacheRoot, plugin);
      if (installed && compareVersions(version, installed) > 0) {
        updates.push(`${plugin} ${version} (installed ${installed})`);
      }
    }
    const notice = updates.join(", ");
    const cache = readCache();
    if (updates.length > 0 && !shownToday(cache, notice)) {
      if (cache) {
        writeCache({ ...cache, notified: notice, notifiedAt: Date.now() });
      }
      message =
        `New tizen-agent-skills release: ${notice}. ` +
        "To update: git pull in the clone you installed from, then re-run its setup script " +
        `(marketplace installs: /plugin marketplace update tizen-platform). ${RELEASES_URL}`;
    }
  } catch {
    message = "";
  }

  const output = formatOutput(host, message);
  if (output) process.stdout.write(JSON.stringify(output) + "\n");
}

// Let stdout drain instead of process.exit(): pipe writes are asynchronous on
// macOS, and an early exit could cut the JSON short.
main().finally(() => process.stdin.destroy());
