// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/validate.ts — port of compare_directories
// Compares file counts between source and target, emitting [Success] /
// [Warning] lines to the OutputChannel in the same format as the scripts.
import * as fsp from "fs/promises";
import * as path from "path";
import {
  countFiles,
  listSubdirs,
  pathExists,
  getCurrentPlatform,
  listFiles,
} from "./fsutil";
import { writeStatus } from "../log";
import {
  HOOK_SPECS,
  hookCommandsOf,
  isOurHookEntry,
  preToolUseEntries,
} from "./claudeSettings";
import { claudeHooksDir, expectedHookCommand } from "./hooks";

export interface ValidationResult {
  label: string;
  passed: boolean;
  srcCount: number;
  targetCount: number;
}

function check(
  label: string,
  passed: boolean,
  detail?: string,
): ValidationResult {
  if (passed) {
    writeStatus(`${label} : ${detail ?? "present"}`, "Success");
  } else {
    writeStatus(`${label} : ${detail ?? "missing"}`, "Warning");
  }
  return {
    label,
    passed,
    srcCount: passed ? 1 : 0,
    targetCount: passed ? 1 : 0,
  };
}

/**
 * Compare file counts between source and target directories.
 * Mirrors the shell compare_directories function.
 */
export async function compareDirectories(
  source: string,
  target: string,
  label: string,
): Promise<ValidationResult> {
  if (!(await pathExists(source))) {
    writeStatus(`${label} : source missing - ${source}`, "Warning");
    return { label, passed: false, srcCount: 0, targetCount: 0 };
  }
  if (!(await pathExists(target))) {
    writeStatus(`${label} : target missing - ${target}`, "Warning");
    return { label, passed: false, srcCount: 0, targetCount: 0 };
  }

  const srcCount = await countFiles(source);
  const targetCount = await countFiles(target);

  if (srcCount !== targetCount) {
    writeStatus(
      `${label} : File count mismatch (source: ${srcCount}, target: ${targetCount})`,
      "Warning",
    );
    return { label, passed: false, srcCount, targetCount };
  }

  writeStatus(`${label} : Validation passed`, "Success");
  return { label, passed: true, srcCount, targetCount };
}

/**
 * Validate tools: check that the platform-specific binary exists in cache.
 * Compares file names and sizes (not just count) to detect corruption.
 * The assets dir contains all platforms, but only the current platform is copied.
 */
async function validateTools(
  assetsDir: string,
  cacheBase: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const platform = getCurrentPlatform();
  const srcToolsDir = path.join(assetsDir, "tools");
  const cacheToolsDir = path.join(cacheBase, "tools");

  if (!(await pathExists(srcToolsDir))) {
    results.push(check("Tools (assets)", false, "source directory missing"));
    return results;
  }

  const toolNames = await listSubdirs(srcToolsDir);
  for (const toolName of toolNames) {
    const cachePlatformDir = path.join(cacheToolsDir, toolName, platform);
    const srcPlatformDir = path.join(srcToolsDir, toolName, platform);

    // Check if platform binary exists in cache
    const hasCacheBinary = await pathExists(cachePlatformDir);
    const srcFiles = await listFiles(srcPlatformDir);

    if (!hasCacheBinary) {
      results.push(
        check(
          `Tools: ${toolName}/${platform}`,
          false,
          "platform binary missing in cache",
        ),
      );
      continue;
    }

    // Compare file names and sizes between source and cache
    const cacheFiles = await listFiles(cachePlatformDir);

    // Check file count first
    if (srcFiles.length !== cacheFiles.length) {
      results.push(
        check(
          `Tools: ${toolName}/${platform}`,
          false,
          `file count mismatch (source: ${srcFiles.length}, cache: ${cacheFiles.length})`,
        ),
      );
      continue;
    }

    // Check each file's size
    let allMatch = true;
    const mismatches: string[] = [];
    for (const fileName of srcFiles) {
      if (!cacheFiles.includes(fileName)) {
        allMatch = false;
        mismatches.push(`${fileName}: missing in cache`);
        continue;
      }
      const srcStat = await fsp.stat(path.join(srcPlatformDir, fileName));
      const cacheStat = await fsp.stat(path.join(cachePlatformDir, fileName));
      if (srcStat.size !== cacheStat.size) {
        allMatch = false;
        mismatches.push(
          `${fileName}: size mismatch (source: ${srcStat.size}, cache: ${cacheStat.size})`,
        );
      }
    }

    if (!allMatch) {
      results.push(
        check(
          `Tools: ${toolName}/${platform}`,
          false,
          `file mismatch: ${mismatches.join("; ")}`,
        ),
      );
    } else {
      results.push(
        check(
          `Tools: ${toolName}/${platform}`,
          true,
          `${cacheFiles.length} file(s) verified`,
        ),
      );
    }
  }

  return results;
}

/**
 * Run full validation of a Claude Code install: cache mirror, personal skills,
 * and — unlike the shell scripts — the hook install itself.
 */
export async function validateClaudeInstall(
  cacheBase: string,
  assetsDir: string,
  skillsDir: string,
  home: string,
  hooksExpected: boolean,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Cache vs assets (excluding tools - validated separately)
  for (const sub of ["skills", "agents", "lib", "assets"] as const) {
    const label = sub.charAt(0).toUpperCase() + sub.slice(1);
    results.push(
      await compareDirectories(
        path.join(assetsDir, sub),
        path.join(cacheBase, sub),
        `${label} (assets <-> cache)`,
      ),
    );
  }

  // Tools: validate platform-specific binary
  results.push(...(await validateTools(assetsDir, cacheBase)));

  // Personal skills: per-skill comparison
  for (const skillName of await listSubdirs(path.join(assetsDir, "skills"))) {
    results.push(
      await compareDirectories(
        path.join(cacheBase, "skills", skillName),
        path.join(skillsDir, skillName),
        `Skill (personal): ${skillName}`,
      ),
    );
  }

  if (hooksExpected) {
    results.push(...(await validateClaudeHooks(home)));
  }

  return results;
}

/**
 * Validate that the hook scripts are on disk *and* that settings.json actually
 * references them. A missing settings entry means the guards silently never run,
 * which is exactly the failure the shell scripts could not detect.
 */
export async function validateClaudeHooks(
  home: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const hooksDir = claudeHooksDir(home);

  for (const spec of HOOK_SPECS) {
    const scriptPath = path.join(hooksDir, spec.scriptName);
    const present = await pathExists(scriptPath);
    results.push(
      check(
        `Claude hooks: ${spec.scriptName}`,
        present,
        present ? "script present" : `script missing - ${scriptPath}`,
      ),
    );
  }

  const settingsFile = path.join(home, ".claude", "settings.json");
  if (!(await pathExists(settingsFile))) {
    results.push(
      check("Claude hooks: settings.json", false, `missing - ${settingsFile}`),
    );
    return results;
  }

  let settings: unknown;
  try {
    settings = JSON.parse(await fsp.readFile(settingsFile, "utf-8"));
  } catch {
    results.push(
      check("Claude hooks: settings.json", false, "could not be parsed"),
    );
    return results;
  }

  const entries = preToolUseEntries(settings) ?? [];
  const ourCommands = new Set(
    entries.filter(isOurHookEntry).flatMap(hookCommandsOf),
  );

  for (const spec of HOOK_SPECS) {
    const expected = expectedHookCommand(home, spec.scriptName);
    results.push(
      check(
        `Claude hooks: settings.json -> ${spec.scriptName}`,
        ourCommands.has(expected),
        ourCommands.has(expected)
          ? "registered"
          : "not registered in hooks.PreToolUse",
      ),
    );
  }

  return results;
}

/**
 * Run full validation of a Cline install.
 */
export async function validateClineInstall(
  cacheBase: string,
  assetsDir: string,
  clineSkillsDir: string,
  hooksDir: string,
  hooksExpected: boolean,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Cache vs assets (no skills/agents in Cline cache, tools validated separately)
  for (const sub of ["lib", "assets"] as const) {
    const label = sub.charAt(0).toUpperCase() + sub.slice(1);
    results.push(
      await compareDirectories(
        path.join(assetsDir, sub),
        path.join(cacheBase, sub),
        `${label} (assets <-> cache)`,
      ),
    );
  }

  // Tools: validate platform-specific binary
  results.push(...(await validateTools(assetsDir, cacheBase)));

  // Cline skills: per-skill comparison
  for (const skillName of await listSubdirs(path.join(assetsDir, "skills"))) {
    results.push(
      await compareDirectories(
        path.join(assetsDir, "skills", skillName),
        path.join(clineSkillsDir, skillName),
        `Cline skill: ${skillName}`,
      ),
    );
  }

  if (hooksExpected) {
    const preToolUse = path.join(hooksDir, "PreToolUse");
    const hasAdapter = await pathExists(preToolUse);
    results.push(
      check(
        "Cline hooks: PreToolUse",
        hasAdapter,
        hasAdapter ? "present" : `missing - ${preToolUse}`,
      ),
    );

    for (const g of ["check-tizen-commands.sh", "check-project-writes.sh"]) {
      const guardPath = path.join(hooksDir, "tizen-sdk-skills", g);
      const hasGuard = await pathExists(guardPath);
      results.push(
        check(
          `Cline hooks: ${g}`,
          hasGuard,
          hasGuard ? "present" : `missing - ${guardPath}`,
        ),
      );
    }
  }

  return results;
}

/**
 * Summarize validation results.
 */
export function summarizeResults(results: ValidationResult[]): {
  total: number;
  passed: number;
  failed: number;
} {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, failed: results.length - passed };
}
