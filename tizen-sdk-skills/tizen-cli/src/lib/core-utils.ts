// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * core-utils — Inlined Plugin SDK for tizen-cli
 *
 * This is a local copy of @tizen/cli-plugin-core-utils so that the plugin
 * is self-contained and does NOT require an npm install of the SDK package.
 *
 * Core Functions:
 *   outputEnvelope(obj)        — The ONLY function that writes to stdout
 *   outputSuccess(data)         — Wrapper: outputEnvelope({ status: "success", result: data })
 *   outputError(message, code) — Wrapper: outputEnvelope({ status: "failure", errors: [...] })
 *   debugLog(msg)               — Writes to stderr (never stdout)
 *   parseArgs(args)             — Helper to parse CLI flags/positionals
 *   defineSchema(spec)          — Helper to define schema structure
 *   resolveNativeModule(name)   — Resolves native module paths
 */

"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");

// Mask sensitive fields in envelope outputs (shared from common lib)

const {
  maskEnvelopeSecrets,
} = require("../../../common/lib/envelope/mask-secrets");

// ─── Output Functions ───────────────────────────────────────────────────────

function outputEnvelope(obj: any): void {
  process.stdout.write(
    JSON.stringify(maskEnvelopeSecrets(obj), null, 2) + "\n",
  );
}

function outputSuccess(data: any): void {
  outputEnvelope({
    status: "success",
    result: data,
    warnings: [],
    errors: [],
  });
}

function outputError(message: string, code?: string, extra?: any): void {
  const error = {
    error_code: code || "ERROR",
    message: message,
    ...(extra ? extra : {}),
  };
  outputEnvelope({
    status: "failure",
    result: null,
    warnings: [],
    errors: [error],
  });
}

// ─── Debugging ──────────────────────────────────────────────────────────────

function debugLog(msg: string): void {
  process.stderr.write("[DEBUG] " + msg + "\n");
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function parseArgs(args: string[]): any {
  const result: any = { _: [] };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        // --key=value: split only on the first '=' so values can contain '='
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        const key = arg.slice(2);
        result[key] = args[i + 1];
        i++; // consume the value token
      } else {
        const key = arg.slice(2);
        result[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        // -k=value: split only on the first '=' so values can contain '='
        const key = arg.slice(1, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result[key] = value;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        const key = arg.slice(1);
        result[key] = args[i + 1];
        i++; // consume the value token
      } else {
        const key = arg.slice(1);
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
    i++;
  }

  return result;
}

function defineSchema(spec: any): any {
  return spec;
}

function resolveNativeModule(name: string): string {
  const tizenHome = path.join(os.homedir(), ".tizen");

  const pluginNativeDir = path.join(__dirname, "native");
  const pluginNativePath = path.join(pluginNativeDir, name + ".node");
  if (fs.existsSync(pluginNativePath)) {
    return pluginNativePath;
  }

  const coreNativeDir = path.join(tizenHome, "native");
  const coreNativePath = path.join(coreNativeDir, name + ".node");
  if (fs.existsSync(coreNativePath)) {
    return coreNativePath;
  }

  try {
    return require.resolve(name);
  } catch {
    throw new Error(
      'Native module "' +
        name +
        '" not found. Checked: ' +
        pluginNativePath +
        ", " +
        coreNativePath,
    );
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  outputEnvelope,
  outputSuccess,
  outputError,
  debugLog,
  parseArgs,
  defineSchema,
  resolveNativeModule,
};
