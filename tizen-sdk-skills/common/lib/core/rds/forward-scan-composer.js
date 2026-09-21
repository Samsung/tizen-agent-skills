// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Forward-scan composition algorithm for RDS delta computation.
 *
 * Pure functions — no I/O. Ported from
 * packages/server/src/features/rds/forward-scan-composer.ts; composition
 * rules must stay identical to the extension's since both sides resolve the
 * same changelist.json into the same delta.
 *
 * ─── Composition rules ──────────────────────────────────────────────────
 *
 * | Current map entry | Entry being applied | Composed result |
 * |--------------------|----------------------|------------------|
 * | (not in map)       | add                  | add              |
 * | (not in map)       | modify               | modify           |
 * | (not in map)       | delete               | delete           |
 * | add                | delete               | no-op            |
 * | add                | modify               | add              |
 * | delete             | add                  | modify           |
 * | modify             | modify               | modify           |
 * | modify             | delete               | delete           |
 * | no-op              | add                  | add              |
 *
 * All other combinations are invalid in a well-formed changelist.
 *
 * @module core/rds/forward-scan-composer
 */

/** Sentinel value representing a resolved no-op (add then delete = net zero change). */
const NO_OP = "no-op";

/**
 * Apply a single composition rule.
 *
 * @param {"add"|"modify"|"delete"|"no-op"|undefined} current - Current composed
 *   type for this path (undefined if not yet in the map)
 * @param {"add"|"modify"|"delete"} incoming - The change type being applied
 * @returns {"add"|"modify"|"delete"|"no-op"} the composed result
 */
function compose(current, incoming) {
  if (current === undefined) {
    // Not in map → incoming passes through
    return incoming;
  }

  switch (current) {
    case "add":
      return incoming === "delete" ? NO_OP : "add";

    case "delete":
      return incoming === "add" ? "modify" : "delete";

    case "modify":
      return incoming; // modify→modify = modify; modify→delete = delete

    case NO_OP:
      return incoming === "add" ? "add" : incoming;

    default:
      return incoming;
  }
}

/**
 * Compute the delta for a device by forward-scanning the changelist from
 * `lastDeployId + 1` through `"next"`.
 *
 * Algorithm:
 *   1. Iterate deploy groups from `lastDeployId + 1` through `"next"`, ascending
 *   2. Maintain a running map of `path -> type`
 *   3. For each file encountered, apply composition rules against the current
 *      map entry
 *   4. After processing all groups, omit `"no-op"` entries from the result
 *
 * @param {{projectDir: string, deploys: Record<string, Array<{path: string, type: string}>>}} changelist
 * @param {number} lastDeployId - the last deploy ID already applied to the target device
 * @returns {Array<{path: string, type: string}>} delta entries (no-op entries omitted)
 */
function computeDelta(changelist, lastDeployId) {
  const composed = new Map();

  // Build ordered list of group keys: numeric IDs > lastDeployId (ascending), then "next"
  const groupKeys = Object.keys(changelist.deploys)
    .filter((key) => key !== "next")
    .map(Number)
    .filter((id) => !isNaN(id) && id > lastDeployId)
    .sort((a, b) => a - b)
    .map(String);

  // Always include "next" group if present
  if ("next" in changelist.deploys) {
    groupKeys.push("next");
  }

  // Forward-scan: apply each group's changes through composition
  for (const key of groupKeys) {
    const changes = changelist.deploys[key];
    if (!changes) continue;

    for (const change of changes) {
      const current = composed.get(change.path);
      const result = compose(current, change.type);
      composed.set(change.path, result);
    }
  }

  // Build result, omitting no-op entries
  const result = [];
  for (const [path, type] of composed) {
    if (type !== NO_OP) {
      result.push({ path, type });
    }
  }

  return result;
}

/**
 * Compose a flat list of file changes into a deduplicated list.
 *
 * Applies the same composition rules as computeDelta() but operates on a
 * single flat array rather than traversing deploy groups. Used when adding
 * new changes to the changelist so overlapping changes to the same path are
 * resolved immediately — preventing duplicate entries and removing no-ops
 * (e.g., add then delete).
 *
 * @param {Array<{path: string, type: string}>} changes - may contain duplicate paths
 * @returns {Array<{path: string, type: string}>} one entry per path, no-ops omitted
 */
function composeChanges(changes) {
  const composed = new Map();

  for (const change of changes) {
    const current = composed.get(change.path);
    const result = compose(current, change.type);
    composed.set(change.path, result);
  }

  // Build result, omitting no-op entries
  const result = [];
  for (const [path, type] of composed) {
    if (type !== NO_OP) {
      result.push({ path, type });
    }
  }

  return result;
}

module.exports = {
  computeDelta,
  composeChanges,
};
