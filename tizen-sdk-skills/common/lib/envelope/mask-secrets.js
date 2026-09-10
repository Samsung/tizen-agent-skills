// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Mask sensitive fields in envelope objects (result, errors, warnings)
 *
 * Similar pattern to user-command.js redactArgv(): deep-clone the envelope,
 * recursively mask sensitive field names, return the masked copy.
 *
 * Two-layer matching ensures future password fields are covered:
 *   1. SENSITIVE_FIELDS — exact field names (catches renames and variants)
 *   2. SENSITIVE_SUFFIX — any field ending in -password, -token, etc.
 *
 * NOT masked: --*-file (paths), --prompt-* (booleans) — these are not secrets.
 */

"use strict";

/**
 * Exact field names that are always secrets.
 * Kept as a growing list so future audits find it easily.
 */
const SENSITIVE_FIELDS = new Set([
  "password",
  "passwd",
  "pass",
  "authorPassword",
  "author-password",
  "author_password",
  "distributorPassword",
  "distributor-password",
  "distributor_password",
  "distributor2Password",
  "distributor2-password",
  "distributor2_password",
  "token",
  "secret",
  "apiKey",
  "api-key",
  "api_key",
  "accessToken",
  "access-token",
  "access_token",
  "refreshToken",
  "refresh-token",
  "refresh_token",
  "privateKey",
  "private-key",
  "private_key",
  "secretKey",
  "secret-key",
  "secret_key",
]);

/**
 * Anchored suffix matching so "bypass" (ends in "pass" but not a password)
 * is not mistaken for a credential. Anchored on a segment boundary (start,
 * dash, or underscore) so author-password / AUTHOR_PASSWORD still match.
 * camelCase variants (e.g. authorPassword) are covered by SENSITIVE_FIELDS
 * above, not this suffix regex.
 */
const SENSITIVE_SUFFIX =
  /(^|[-_])(password|passwd|pass|token|secret|api[_-]?key)$/i;

/**
 * True if a field name is sensitive and should be masked.
 * Does NOT mask:
 *   - Falsy field names
 *   - Fields starting with "prompt" (boolean flags)
 *   - Fields ending with "File" (paths)
 */
function isSensitiveField(fieldName) {
  if (typeof fieldName !== "string" || !fieldName) return false;
  if (fieldName.startsWith("prompt") || fieldName.endsWith("File"))
    return false;
  return SENSITIVE_FIELDS.has(fieldName) || SENSITIVE_SUFFIX.test(fieldName);
}

const REDACTED = "***";

/**
 * Deep-clone an envelope object and mask all sensitive fields.
 * Recurses through nested objects and arrays to find and mask every sensitive field.
 *
 * @param {any} envelope - The envelope object to mask (or any value)
 * @returns {any} A new object with sensitive fields masked; original is not mutated
 */
function maskEnvelopeSecrets(envelope) {
  if (envelope === null || envelope === undefined) return envelope;
  if (typeof envelope !== "object") return envelope;

  // Deep clone to avoid mutating the input
  let masked;
  try {
    masked = JSON.parse(JSON.stringify(envelope));
  } catch {
    // If not JSON-serializable, return as-is (likely already contains non-serializable refs)
    return envelope;
  }

  /**
   * Recursively mask sensitive fields in an object.
   * Mutates obj in place (safe because it's a cloned copy).
   */
  function maskObject(obj) {
    if (obj === null || typeof obj !== "object") return;

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

      const value = obj[key];

      if (isSensitiveField(key)) {
        // Mask the field value
        obj[key] = REDACTED;
      } else if (Array.isArray(value)) {
        // Recurse into array elements
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === "object" && value[i] !== null) {
            maskObject(value[i]);
          }
        }
      } else if (typeof value === "object") {
        // Recurse into nested objects
        maskObject(value);
      }
    }
  }

  maskObject(masked);
  return masked;
}

module.exports = {
  maskEnvelopeSecrets,
  isSensitiveField,
  SENSITIVE_FIELDS,
  SENSITIVE_SUFFIX,
  REDACTED,
};
