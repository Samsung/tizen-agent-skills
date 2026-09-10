// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Samsung Account OAuth authentication service.
 *
 * Handles real Samsung Account login flow:
 *   - Starts a local HTTP callback server on the first available port (4794-4813)
 *   - Opens the system browser to Samsung's OAuth endpoint
 *   - Captures the returned JSON token blob from the callback
 *   - Caches the token so repeated operations don't force re-login
 *   - Validates token expiry before reuse
 *
 * Error cases throw recognizable Error messages that map to envelope error codes.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const { resolveSdkDataPath } = require("./sdb");

// OAuth configuration constants (from reference extension)
const SAMSUNG_OAUTH_URL = "https://account.samsung.com/mobile/account/check.do";
const SERVICE_ID = "v285zxnl3h";
const ACTION_ID = "StartOAuth2";
const CALLBACK_PATH = "/signin/callback";
const DEFAULT_PORT = 4794;
const PORT_RANGE = 20; // scan 4794-4813
const AUTH_TIMEOUT_MS = 300000; // 5 minutes

// Cancellation support: when set, the active OAuth flow is aborted.
let activeCancellationController = null;

/**
 * Get a Samsung Account access token, from cache if valid, else via real OAuth flow.
 *
 * @param {string} profileName - signing profile name
 * @returns {Promise<{accessToken: string, userId: string, email: string, validityPeriod: number}>}
 * @throws {Error} with message "samsung_auth_timeout", "samsung_auth_port_unavailable",
 *         "samsung_auth_invalid_response", or generic auth error
 */
async function getSamsungAccessToken(profileName) {
  if (!profileName) {
    throw new Error("samsung_auth_failed: profileName is required");
  }

  // Resolve output directory for token cache
  const resolved = resolveSdkDataPath();
  if (resolved.error) {
    throw new Error(`samsung_auth_failed: ${resolved.error}`);
  }

  const authDir = path.join(
    resolved.dataPath,
    "keystore",
    "samsung",
    profileName,
  );
  const authDataFile = path.join(authDir, "samsung-auth-data.json");

  // Check if cached token exists and is valid
  if (fs.existsSync(authDataFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(authDataFile, "utf-8"));
      if (isTokenValid(cached)) {
        return {
          accessToken: cached.accessToken,
          userId: cached.userId,
          email: cached.email,
          validityPeriod: cached.validityPeriod,
          source: "cache",
        };
      }
    } catch (_e) {
      // Cached file malformed or expired — proceed to real login
    }
  }

  // Run real OAuth flow
  const token = await runOAuthFlow(profileName);

  // Write cache
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  // Contains a live access token — restrict to the owner (0600)
  fs.writeFileSync(
    authDataFile,
    JSON.stringify({
      accessToken: token.accessToken,
      userId: token.userId,
      email: token.email,
      validityStart: new Date().toISOString(),
      validityPeriod: token.validityPeriod,
    }),
    { encoding: "utf-8", mode: 0o600 },
  );
  try {
    fs.chmodSync(authDataFile, 0o600);
  } catch (_) {}

  return {
    accessToken: token.accessToken,
    userId: token.userId,
    email: token.email,
    validityPeriod: token.validityPeriod,
    source: "oauth-login",
  };
}

/**
 * Run the full OAuth flow: find port, open browser, listen for callback, parse token.
 *
 * @param {string} profileName
 * @returns {Promise<{accessToken: string, userId: string, email: string, validityPeriod: number}>}
 * @private
 */
async function runOAuthFlow(_profileName) {
  // Find available port
  const port = await findAvailablePort(DEFAULT_PORT, PORT_RANGE);
  if (!port) {
    throw new Error(
      "samsung_auth_port_unavailable: no free ports in range 4794-4813",
    );
  }

  // Build OAuth URL
  const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;
  const oauthUrl = `${SAMSUNG_OAUTH_URL}?serviceID=${SERVICE_ID}&actionID=${ACTION_ID}&accessToken=Y&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // Set up cancellation controller for this flow
  const controller = {
    cancelled: false,
    server: null,
    timeoutHandle: null,
    onAbort: null,
    abort() {
      this.cancelled = true;
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
      if (this.server) {
        try {
          this.server.close();
        } catch (_) {}
        this.server = null;
      }
      if (this.onAbort) {
        const cb = this.onAbort;
        this.onAbort = null;
        cb();
      }
    },
  };
  activeCancellationController = controller;

  return new Promise((resolve, reject) => {
    let callbackReceived = false;

    // Settle the pending promise when cancelSamsungAuth() aborts this flow —
    // otherwise the awaiting caller hangs forever.
    controller.onAbort = () => {
      if (!callbackReceived) {
        reject(
          new Error("samsung_auth_cancelled: authentication cancelled by user"),
        );
      }
    };

    // Set up timeout (5 minutes)
    controller.timeoutHandle = setTimeout(() => {
      if (!callbackReceived && !controller.cancelled) {
        if (controller.server) controller.server.close();
        activeCancellationController = null;
        reject(
          new Error(
            "samsung_auth_timeout: no callback received within 5 minutes",
          ),
        );
      }
    }, AUTH_TIMEOUT_MS);

    // Create callback server
    controller.server = http.createServer((req, res) => {
      if (req.url && req.url.includes(CALLBACK_PATH)) {
        callbackReceived = true;
        clearTimeout(controller.timeoutHandle);

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const code = extractAuthCode(body, req.url);
            if (!code) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end("<h1>Error: No auth code received</h1>");
              controller.server.close();
              activeCancellationController = null;
              reject(
                new Error("samsung_auth_invalid_response: no code in callback"),
              );
              return;
            }

            // extractAuthCode already returns the value decoded exactly once
            const authData = JSON.parse(code);
            const token = {
              accessToken: authData.access_token,
              userId: authData.userId,
              email: authData.inputEmailID,
              validityPeriod: parseInt(authData.access_token_expires_in, 10),
            };

            // Send success page to browser
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head><title>Samsung Account Login</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>Login Successful</h1>
                <p>You can close this window and return to Tizen SDK.</p>
              </body>
              </html>
            `);

            controller.server.close(() => {
              activeCancellationController = null;
              resolve(token);
            });
          } catch (e) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<h1>Error: Failed to parse login response</h1>");
            controller.server.close();
            activeCancellationController = null;
            reject(new Error(`samsung_auth_invalid_response: ${e.message}`));
          }
        });
      }
    });

    controller.server.listen(port, () => {
      // Progress line for the caller (and for `job-cli.js wait` progress_tail
      // when this runs as a detached, escalated job under Codex CLI — the
      // agent relays the URL if the browser did not open on the user's side).
      console.error(
        `[tizen-sdk] Samsung Account login: opening the system browser (waiting up to ${Math.round(AUTH_TIMEOUT_MS / 60000)} min). ` +
          `If it did not open, visit: ${oauthUrl}`,
      );
      // Open browser
      try {
        openBrowser(oauthUrl);
      } catch (e) {
        clearTimeout(controller.timeoutHandle);
        controller.server.close();
        activeCancellationController = null;
        reject(
          new Error(
            `samsung_auth_failed: could not open browser: ${e.message}`,
          ),
        );
      }
    });

    controller.server.on("error", (e) => {
      clearTimeout(controller.timeoutHandle);
      activeCancellationController = null;
      reject(new Error(`samsung_auth_failed: server error: ${e.message}`));
    });
  });
}

/**
 * Cancel any active Samsung Account OAuth authentication flow.
 *
 * Closes the callback server and clears the timeout. The pending
 * getSamsungAccessToken() promise will reject with a cancellation error.
 *
 * @returns {boolean} true if an active flow was cancelled, false otherwise
 */
function cancelSamsungAuth() {
  if (activeCancellationController) {
    activeCancellationController.abort();
    activeCancellationController = null;
    return true;
  }
  return false;
}

/**
 * Find the first available port in the range [startPort, startPort + maxAttempts).
 *
 * @param {number} startPort
 * @param {number} maxAttempts
 * @returns {Promise<number|null>} the port number, or null if all are in use
 * @private
 */
async function findAvailablePort(startPort, maxAttempts) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    try {
      const srv = http.createServer();
      await new Promise((resolve, reject) => {
        srv.listen(port, () => {
          srv.close(resolve);
        });
        srv.on("error", reject);
      });
      return port;
    } catch (_e) {
      // Port is busy, try next
    }
  }
  return null;
}

/**
 * Extract the "code" (auth blob) from callback POST body or URL query string.
 *
 * @param {string} body - POST body content
 * @param {string} url - request URL (may contain query string)
 * @returns {string|null} the code value if found
 * @private
 */
function extractAuthCode(body, url) {
  // Check POST body first: "code=<url-encoded-json>".
  // Split the RAW body before decoding — decoding first would let '&'/'=' inside
  // the encoded value corrupt the split (e.g. base64 '=' padding in the token).
  if (body) {
    const pairs = body.split("&");
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (key === "code") {
        try {
          return decodeURIComponent(value);
        } catch (_e) {
          return value;
        }
      }
    }
  }

  // Fall back to query string (searchParams.get already decodes once)
  try {
    const urlObj = new URL(`http://localhost${url}`);
    return urlObj.searchParams.get("code");
  } catch (_e) {
    return null;
  }
}

/**
 * Check if a cached token is still valid (not expired).
 *
 * @param {object} cached - cached auth data with validityStart and validityPeriod
 * @returns {boolean}
 * @private
 */
function isTokenValid(cached) {
  if (!cached || !cached.validityStart || !cached.validityPeriod) {
    return false;
  }
  const startTime = new Date(cached.validityStart).getTime();
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  return elapsedSeconds < cached.validityPeriod;
}

/**
 * Open a URL in the system default browser (cross-platform).
 *
 * @param {string} url
 * @throws {Error} if browser could not be launched
 * @private
 */
function openBrowser(url) {
  const platform = process.platform;
  let cmd;

  if (platform === "win32") {
    // Windows: use 'start' with empty title arg
    cmd = `start "" "${url}"`;
    execSync(cmd, { stdio: "ignore" });
  } else if (platform === "darwin") {
    // macOS: use 'open'
    cmd = `open "${url}"`;
    execSync(cmd, { stdio: "ignore" });
  } else {
    // Linux: use 'xdg-open'
    cmd = `xdg-open "${url}"`;
    execSync(cmd, { stdio: "ignore" });
  }
}

module.exports = {
  getSamsungAccessToken,
  cancelSamsungAuth,
  // Exports for testing
  extractAuthCode,
  isTokenValid,
  findAvailablePort,
};
