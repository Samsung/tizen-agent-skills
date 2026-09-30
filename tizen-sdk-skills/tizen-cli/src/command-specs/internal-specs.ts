// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Command groups that exist only in the internal repository.
 *
 * They live under ./internal/, a directory the public tree does not carry
 * (scripts/publication/internal-only-paths.txt), so they are loaded with a
 * require() inside try/catch instead of a static import:
 *
 * - tsc does not resolve the target of a require() call, so the type check
 *   passes with the directory missing;
 * - esbuild.config.js marks ./internal as external when the directory is
 *   missing (or always, under TIZEN_PUBLIC_BUILD=1), so the bundle still
 *   builds; at runtime that require() then fails with MODULE_NOT_FOUND and
 *   the groups are simply absent — no command, no schema entry, no
 *   plugin.json entry.
 *
 * Only MODULE_NOT_FOUND for the directory itself is swallowed; a module that
 * is present but broken still fails loudly.
 */

import { CommandSpec } from "./types";

const INTERNAL_MODULE = "./internal";

function isMissingModule(e: unknown, id: string): boolean {
  const err = e as { code?: string; message?: string } | null;
  return (
    !!err &&
    err.code === "MODULE_NOT_FOUND" &&
    typeof err.message === "string" &&
    err.message.includes(`'${id}'`)
  );
}

export function loadInternalSpecs(): CommandSpec[] {
  try {
    // The literal string keeps esbuild able to bundle the directory when it
    // exists; see the internal-only plugin in esbuild.config.js.
    const mod = require("./internal") as { INTERNAL_SPECS?: CommandSpec[] };
    return mod.INTERNAL_SPECS ?? [];
  } catch (e) {
    if (isMissingModule(e, INTERNAL_MODULE)) return [];
    throw e;
  }
}
