// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Samsung online-CA API client.
 *
 * Handles HTTPS communication with Samsung's certificate authority:
 *   - POST CSR to /apis/v3/authors endpoint (author certificates)
 *   - POST CSR to /apis/v1/distributors endpoint (distributor certificates, v1)
 *   - POST CSR to /apis/v3/distributors endpoint (distributor certificates, VD mode)
 *   - Receive signed certificate (PEM format)
 *   - Handle errors and timeouts
 *   - Proxy support via HTTP_PROXY / HTTPS_PROXY / NO_PROXY env vars
 */

const https = require("https");
const { URL } = require("url");

// Samsung CA endpoints
const SAMSUNG_CA_BASE_URL = "https://svdca.samsungqbe.com";
const SAMSUNG_CA_AUTHOR_PATH = "/apis/v3/authors";
const SAMSUNG_CA_DISTRIBUTOR_V1_PATH = "/apis/v1/distributors";
const SAMSUNG_CA_DISTRIBUTOR_V3_PATH = "/apis/v3/distributors";

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 60000;

/**
 * Get the proxy URL from environment variables.
 *
 * Checks (in order): HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy.
 *
 * @returns {string|null}
 * @private
 */
function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

/**
 * Get the NO_PROXY bypass list from environment variables.
 *
 * @returns {string|null}
 * @private
 */
function getNoProxyUrl() {
  return process.env.NO_PROXY || process.env.no_proxy || null;
}

/**
 * Check if a URL should bypass the proxy based on the NO_PROXY list.
 *
 * @param {string} targetUrl - the URL being requested
 * @param {string|null} noProxy - the NO_PROXY env value
 * @returns {boolean}
 * @private
 */
function shouldBypassProxy(targetUrl, noProxy) {
  if (!noProxy) return false;

  let hostname;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch (_) {
    return false;
  }

  const entries = noProxy.split(",").map((e) => e.trim().toLowerCase());
  return entries.some((entry) => {
    if (!entry) return false;
    if (entry === "*") return true;
    // Support wildcard like "*.samsungqbe.com"
    if (entry.startsWith("*.")) {
      return hostname.endsWith(entry.slice(1));
    }
    return hostname === entry || hostname.endsWith("." + entry);
  });
}

/**
 * Create an HTTPS agent configured for proxy use.
 *
 * Uses the built-in https-proxy-agent if available, otherwise falls back
 * to a tunneling approach. The agent is configured to not reject
 * self-signed certificates, matching the reference implementation.
 *
 * @param {string} proxyUrl
 * @returns {object} https.Agent
 * @private
 */
function createProxyAgent(proxyUrl) {
  // Try to use https-proxy-agent if installed
  let HttpsProxyAgent;
  try {
    HttpsProxyAgent = require("https-proxy-agent");
    if (HttpsProxyAgent.HttpsProxyAgent) {
      HttpsProxyAgent = HttpsProxyAgent.HttpsProxyAgent;
    }
  } catch (_) {
    // https-proxy-agent not available — fall back to direct connection
    return null;
  }

  if (!HttpsProxyAgent) return null;

  return new HttpsProxyAgent(proxyUrl, {
    rejectUnauthorized: false,
  });
}

/**
 * Resolve the effective proxy for a target URL.
 *
 * Returns the proxy URL if one is set and the target is not in NO_PROXY.
 *
 * @param {string} targetUrl
 * @returns {string|undefined} proxy URL or undefined
 * @private
 */
function resolveEffectiveProxy(targetUrl) {
  const proxyUrl = getProxyUrl();
  const noProxy = getNoProxyUrl();
  if (!proxyUrl) return undefined;
  if (shouldBypassProxy(targetUrl, noProxy)) return undefined;
  return proxyUrl;
}

/**
 * Build the HTTPS request options for a given URL, including proxy support.
 *
 * @param {string} targetUrl - full URL to request
 * @param {object} headers - request headers
 * @param {object} [extra] - extra options
 * @returns {object} https.RequestOptions
 * @private
 */
function buildRequestOptions(targetUrl, headers, extra = {}) {
  const url = new URL(targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: "POST",
    headers,
    // TLS: ignore self-signed or invalid certs (matches reference implementation)
    rejectUnauthorized: false,
    timeout: REQUEST_TIMEOUT_MS,
    ...extra,
  };

  // Configure proxy agent if needed
  const effectiveProxy = resolveEffectiveProxy(targetUrl);
  if (effectiveProxy) {
    const agent = createProxyAgent(effectiveProxy);
    if (agent) {
      options.agent = agent;
    }
  } else {
    // Use a plain agent with keep-alive disabled to avoid stale connections
    options.agent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: false,
    });
  }

  return options;
}

/**
 * Sign a CSR with Samsung's online-CA service for an author certificate.
 *
 * @param {string} csrContent - PEM-formatted Certificate Signing Request
 * @param {string} accessToken - Samsung OAuth access token
 * @param {string} userId - Samsung user ID
 * @returns {Promise<string>} PEM-formatted signed certificate
 * @throws {Error} with message "samsung_api_error: ..." on failure
 */
async function signCsrWithSamsung(csrContent, accessToken, userId) {
  if (!csrContent || !accessToken || !userId) {
    throw new Error(
      "samsung_api_error: missing required parameters (csr, accessToken, userId)",
    );
  }

  // Build multipart/form-data body
  const boundary = `----${Date.now()}`;
  const parts = [
    buildFormField(boundary, "access_token", accessToken),
    buildFormField(boundary, "user_id", userId),
    buildFormField(boundary, "platform", "VD"),
    buildFormFile(boundary, "csr", "author.csr", csrContent),
  ];
  const finalBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([...parts, finalBoundary]);

  const url = new URL(SAMSUNG_CA_AUTHOR_PATH, SAMSUNG_CA_BASE_URL);
  const headers = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": body.length,
  };

  const options = buildRequestOptions(url.href, headers);

  return sendRequest(options, body, url.href);
}

/**
 * Sign a CSR with Samsung's online-CA service for a distributor certificate.
 *
 * The distributor endpoint supports two API versions:
 *   - v1 (/apis/v1/distributors): primary distributor certificate
 *   - v3 (/apis/v3/distributors): VD mode additional certificate
 *
 * The form data includes:
 *   - access_token
 *   - user_id
 *   - privilege_level (Public or Partner)
 *   - developer_type (Individual)
 *   - platform (VD for VD mode, Gear2 for V0 devices)
 *   - csr file
 *
 * @param {object} params
 * @param {string} params.csrContent - PEM-formatted CSR
 * @param {string} params.accessToken - Samsung OAuth access token
 * @param {string} params.userId - Samsung user ID
 * @param {string} params.privilege - 'Public' or 'Partner'
 * @param {boolean} [params.bVDMode=true] - whether VD platform field should be included
 * @param {boolean} [params.isV0=false] - whether to include Gear2 platform for V0 devices
 * @param {string} [params.apiVersion='v1'] - 'v1' or 'v3' (VD mode second fetch)
 * @param {string} [params.csrFileName='distributor.csr'] - filename for the CSR field
 * @returns {Promise<string>} PEM-formatted signed certificate or device-profile XML
 * @throws {Error} with message "samsung_api_error: ..." on failure
 */
async function signDistributorCsrWithSamsung(params) {
  const {
    csrContent,
    accessToken,
    userId,
    privilege,
    bVDMode = true,
    isV0 = false,
    apiVersion = "v1",
    csrFileName = "distributor.csr",
  } = params;

  if (!csrContent || !accessToken || !userId) {
    throw new Error(
      "samsung_api_error: missing required parameters (csr, accessToken, userId)",
    );
  }
  if (!privilege) {
    throw new Error(
      "samsung_api_error: privilege is required for distributor certificate",
    );
  }

  // Build multipart/form-data body
  const boundary = `----${Date.now()}`;
  const parts = [
    buildFormField(boundary, "access_token", accessToken),
    buildFormField(boundary, "user_id", userId),
    buildFormField(boundary, "privilege_level", privilege),
    buildFormField(boundary, "developer_type", "Individual"),
  ];

  // Platform for V0 devices (Gear2)
  if (isV0) {
    parts.push(buildFormField(boundary, "platform", "Gear2"));
  }

  // VD mode platform
  if (bVDMode) {
    parts.push(buildFormField(boundary, "platform", "VD"));
  }

  // CSR file
  parts.push(buildFormFile(boundary, "csr", csrFileName, csrContent));

  const finalBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([...parts, finalBoundary]);

  // Select endpoint based on API version
  const apiPath =
    apiVersion === "v3"
      ? SAMSUNG_CA_DISTRIBUTOR_V3_PATH
      : SAMSUNG_CA_DISTRIBUTOR_V1_PATH;
  const url = new URL(apiPath, SAMSUNG_CA_BASE_URL);
  const headers = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": body.length,
  };

  const options = buildRequestOptions(url.href, headers);

  return sendRequest(options, body, url.href);
}

/**
 * Send an HTTPS request and return the response body as a string.
 *
 * @param {object} options - https.RequestOptions
 * @param {Buffer} body - request body
 * @param {string} targetUrl - for error messages
 * @returns {Promise<string>}
 * @private
 */
function sendRequest(options, body, _targetUrl) {
  return new Promise((resolve, reject) => {
    try {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 403) {
            reject(new Error("samsung_api_error: rate limited (HTTP 403)"));
          } else if (res.statusCode !== 200) {
            reject(
              new Error(
                `samsung_api_error: server returned HTTP ${res.statusCode}, body: ${data}`,
              ),
            );
          } else if (!data || data.trim().length === 0) {
            reject(new Error("samsung_api_error: empty response from Samsung"));
          } else {
            // Response is raw PEM certificate (or device-profile XML for v1 distributor)
            resolve(data);
          }
        });
      });

      req.on("timeout", () => {
        req.abort();
        reject(
          new Error(
            `samsung_api_error: request timeout (${REQUEST_TIMEOUT_MS / 1000}s)`,
          ),
        );
      });

      req.on("error", (err) => {
        reject(new Error(`samsung_api_error: ${err.message}`));
      });

      req.write(body);
      req.end();
    } catch (err) {
      reject(new Error(`samsung_api_error: ${err.message}`));
    }
  });
}

/**
 * Build a form field for multipart/form-data.
 *
 * @private
 */
function buildFormField(boundary, name, value) {
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`;
  const footer = "\r\n";
  return Buffer.concat([
    Buffer.from(header),
    Buffer.from(String(value)),
    Buffer.from(footer),
  ]);
}

/**
 * Build a file field for multipart/form-data.
 *
 * @private
 */
function buildFormFile(boundary, name, filename, content) {
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  const footer = "\r\n";
  return Buffer.concat([
    Buffer.from(header),
    Buffer.from(content),
    Buffer.from(footer),
  ]);
}

module.exports = {
  signCsrWithSamsung,
  signDistributorCsrWithSamsung,
  // Exports for testing
  getProxyUrl,
  getNoProxyUrl,
  shouldBypassProxy,
  resolveEffectiveProxy,
  buildRequestOptions,
  SAMSUNG_CA_BASE_URL,
  SAMSUNG_CA_AUTHOR_PATH,
  SAMSUNG_CA_DISTRIBUTOR_V1_PATH,
  SAMSUNG_CA_DISTRIBUTOR_V3_PATH,
  REQUEST_TIMEOUT_MS,
};
