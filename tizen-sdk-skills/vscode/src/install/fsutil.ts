// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/fsutil.ts — port of the shell helper functions
// (copy_files_recursive / compare_directories) plus exec-bit & line-ending
// normalization for the VSIX context.
//
// Everything here is async: install runs on the extension host thread, and the
// asset tree (skills + agents + docs) is large enough that synchronous copying
// visibly freezes the VS Code UI during the on-startup sync.
import * as fsp from "fs/promises";
import * as path from "path";
import { writeStatus } from "../log";
import { isSafeName } from "./manifest";

/** Directories to skip during recursive copy (git objects are read-only → EPERM). */
const SKIP_DIRS = new Set([".git"]);

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror a directory: remove the destination (if it exists) and copy the
 * source contents into it. This is the "clean" variant of copy_files_recursive.
 *
 * Idempotent — re-running always produces the same state.
 */
export async function mirrorDir(
  src: string,
  dest: string,
  label: string,
): Promise<void> {
  if (!(await pathExists(src))) {
    writeStatus(`Source not found: ${src}`, "Warning");
    return;
  }

  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.mkdir(dest, { recursive: true });
  await copyDirRecursive(src, dest);
  writeStatus(`${label} copy complete: ${src} -> ${dest}`, "Success");
}

/**
 * Copy specific files (not recursive directory mirror) into a destination dir.
 * Used for agents: individual .md file copy.
 *
 * @returns the names of the files copied
 */
export async function copyFiles(
  srcDir: string,
  destDir: string,
  label: string,
  pattern: string = "*",
): Promise<string[]> {
  if (!(await pathExists(srcDir))) {
    writeStatus(`Source not found: ${srcDir}`, "Warning");
    return [];
  }

  await fsp.mkdir(destDir, { recursive: true });
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  const copied: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (pattern !== "*" && !entry.name.match(pattern)) continue;
    await fsp.copyFile(
      path.join(srcDir, entry.name),
      path.join(destDir, entry.name),
    );
    copied.push(entry.name);
  }
  writeStatus(
    `${label} copy complete: ${srcDir} -> ${destDir} (${copied.length} files)`,
    "Success",
  );
  return copied;
}

/**
 * Recursively copy a directory (no clean).  Used inside mirrorDir and for
 * non-destructive copies.  `excludes` applies at every level.
 */
export async function copyDirRecursive(
  src: string,
  dest: string,
  excludes?: Set<string>,
): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    if (excludes && excludes.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await copyDirRecursive(srcPath, destPath, excludes);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Delete named entries from a directory.
 *
 * Used for everything that lives in a namespace shared with the user
 * (~/.claude/skills, ~/.claude/agents, ~/.cline/skills): the caller supplies
 * the exact names, and anything that is not a bare file/folder name is refused
 * so a tampered install manifest cannot walk out of `dir`.
 *
 * @returns the names actually removed
 */
export async function removeNamedEntries(
  dir: string,
  names: string[],
  label: string,
): Promise<string[]> {
  const removed: string[] = [];
  for (const name of names) {
    if (!isSafeName(name)) {
      writeStatus(
        `Refusing to remove unsafe ${label} entry: ${String(name)}`,
        "Warning",
      );
      continue;
    }
    const target = path.join(dir, name);
    if (!(await pathExists(target))) continue;
    await fsp.rm(target, { recursive: true, force: true });
    writeStatus(`Removed ${label}: ${name}`, "Success");
    removed.push(name);
  }
  return removed;
}

/**
 * Remove every version directory under a versioned cache root except `keep`.
 *
 * The cache path embeds the plugin version, so without this each update leaves
 * a complete extra copy of the asset tree (skills + agents + scripts + lib +
 * assets + docs) behind for good — and `autoSyncOnUpdate` defaults to true, so
 * it accumulates unattended.
 */
export async function pruneCacheVersions(
  cacheRoot: string,
  keep: string,
  label: string,
): Promise<void> {
  for (const name of await listSubdirs(cacheRoot)) {
    if (name === keep) continue;
    await fsp.rm(path.join(cacheRoot, name), { recursive: true, force: true });
    writeStatus(`Removed stale ${label} cache version: ${name}`, "Success");
  }
}

/**
 * Remove directories a previous release owned under a name we no longer use
 * (legacy cache roots, hook directories). Each is namespaced to the plugin,
 * so nothing of the user's can live inside; missing ones are skipped silently.
 *
 * @returns the directories actually removed
 */
export async function removeLegacyDirs(
  dirs: string[],
  label: string,
): Promise<string[]> {
  const removed: string[] = [];
  for (const dir of dirs) {
    if (!(await pathExists(dir))) continue;
    await fsp.rm(dir, { recursive: true, force: true });
    writeStatus(`Removed legacy ${label}: ${dir}`, "Success");
    removed.push(dir);
  }
  return removed;
}

/**
 * Count all regular files under a directory (recursive).
 * Equivalent to `find dir -type f | wc -l`.
 */
export async function countFiles(dir: string): Promise<number> {
  if (!(await pathExists(dir))) return 0;
  let count = 0;
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fsp.readdir(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(d, entry.name));
      } else {
        count++;
      }
    }
  };
  await walk(dir);
  return count;
}

/**
 * List immediate subdirectory names (used for per-skill mirroring).
 */
export async function listSubdirs(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * List immediate file names matching an extension (used for per-agent copy).
 */
export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (!ext || e.name.endsWith(ext)))
    .map((e) => e.name);
}

/**
 * Mode for the shell scripts we install: owner-only read/write/execute.
 *
 * Every script goes somewhere under the user's own home — ~/.claude/hooks/,
 * the plugin cache, ~/Documents/Cline/Hooks/ — and is executed by Claude Code
 * or Cline running as that same user. No group or "other" principal exists in
 * this design, so neither gets a bit (SONARTS S2612).
 *
 * This is deliberately tighter than the `chmod +x` in the setup scripts, which
 * is masked by umask and so typically lands on 0o755.
 */
export const SCRIPT_MODE = 0o700;

/**
 * Normalize a shell script for cross-platform use after VSIX extraction:
 *   1. Strip CRLF → LF (Windows checkout leaves \r in files)
 *   2. chmod to SCRIPT_MODE on non-Windows platforms
 *
 * A VSIX is a zip, so the executable bit is NOT preserved on extraction.
 * This replaces the `sed -i 's/\r$//'` + `chmod +x` from the shell scripts.
 */
export async function normalizeExec(filePath: string): Promise<void> {
  // CRLF → LF. Read as a Buffer and bail on anything containing a NUL byte:
  // decoding a binary as utf-8 does not throw, it silently mangles the bytes,
  // and writing that back would corrupt the file.
  try {
    const buf = await fsp.readFile(filePath);
    if (!buf.includes(0)) {
      const content = buf.toString("utf-8");
      const normalized = content.replace(/\r\n/g, "\n");
      if (normalized !== content) {
        await fsp.writeFile(filePath, normalized, "utf-8");
      }
    }
  } catch {
    // unreadable — leave it alone
  }

  // Make it executable by its owner (non-Windows only)
  if (process.platform !== "win32") {
    try {
      await fsp.chmod(filePath, SCRIPT_MODE);
    } catch {
      // ignore — may be on a filesystem that doesn't support chmod
    }
  }
}

/** Recursively normalize all .sh files (and the Cline PreToolUse adapter) under a directory. */
export async function normalizeExecDir(dir: string): Promise<void> {
  if (!(await pathExists(dir))) return;
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fsp.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(p);
      } else if (entry.name.endsWith(".sh") || entry.name === "PreToolUse") {
        await normalizeExec(p);
      }
    }
  };
  await walk(dir);
}

/**
 * Get the current platform name (linux, macos, or windows).
 * Throws an error for unsupported platforms.
 */
export function getCurrentPlatform(): string {
  const platform = process.platform;
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  throw new Error(
    `Unsupported platform: ${platform}. Only linux, macos, and windows are supported.`,
  );
}

/**
 * Copy only the platform-specific binary from the tools directory.
 * The tools directory structure is: tools/<tool-name>/<platform>/<binary>
 * Only the binary for the current platform is copied.
 *
 * @param srcToolsDir Source tools directory (e.g., assets/tools)
 * @param destToolsDir Destination tools directory (e.g., cache/tools)
 * @param label Label for logging
 */
export async function copyPlatformBinary(
  srcToolsDir: string,
  destToolsDir: string,
  label: string,
): Promise<void> {
  if (!(await pathExists(srcToolsDir))) {
    writeStatus(`Source tools directory not found: ${srcToolsDir}`, "Warning");
    return;
  }

  let platform: string;
  try {
    platform = getCurrentPlatform();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    writeStatus(`Skipping tools copy: ${message}`, "Warning");
    return;
  }

  const toolNames = await listSubdirs(srcToolsDir);

  for (const toolName of toolNames) {
    const srcPlatformDir = path.join(srcToolsDir, toolName, platform);
    const destPlatformDir = path.join(destToolsDir, toolName, platform);

    if (!(await pathExists(srcPlatformDir))) {
      writeStatus(
        `Platform binary not found for ${toolName}/${platform}`,
        "Warning",
      );
      continue;
    }

    // Create destination directory
    await fsp.mkdir(destPlatformDir, { recursive: true });

    // Copy only files from the platform-specific directory
    const files = await listFiles(srcPlatformDir);
    for (const fileName of files) {
      const srcFile = path.join(srcPlatformDir, fileName);
      const destFile = path.join(destPlatformDir, fileName);
      await fsp.copyFile(srcFile, destFile);

      // Set executable permission on non-Windows platforms.
      // Use SCRIPT_MODE (0o700) — owner-only — so group/other never gain
      // execute access (SONARTS S2612).  This matches normalizeExec().
      if (process.platform !== "win32") {
        try {
          await fsp.chmod(destFile, SCRIPT_MODE);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          writeStatus(
            `Warning: Could not set executable permission on ${destFile}: ${message}`,
            "Warning",
          );
        }
      }
    }

    writeStatus(
      `${label}: ${toolName}/${platform} (${files.length} file(s))`,
      "Success",
    );
  }
}
