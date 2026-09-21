// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/detect.ts — host detection (Claude Code / Cline / Codex CLI)
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { writeStatus } from "../log";
import { codexHome } from "./codexLayout";
import { DetectedHosts, matchHostByExtensionId } from "./targets";

export { noTargets, resolveTargets, targetLabels } from "./targets";
export type { DetectedHosts } from "./targets";

/**
 * Detect which AI hosts are present.
 *
 * Claude: ~/.claude exists OR the Claude Code VS Code extension is present.
 * Cline:  ~/.cline exists OR a Cline build (incl. forks) is present.
 * Codex:  ~/.codex (or $CODEX_HOME) exists OR OpenAI's Codex extension is
 *         present. ~/.agents/skills is NOT a signal — Gemini CLI shares it.
 */
export function detectHosts(): DetectedHosts {
  const home = os.homedir();

  let claude = fs.existsSync(path.join(home, ".claude"));
  let cline = fs.existsSync(path.join(home, ".cline"));
  let codex = fs.existsSync(codexHome(home));

  // Also check installed VS Code extensions
  for (const ext of vscode.extensions.all) {
    const match = matchHostByExtensionId(ext.id);
    if (match.claude) claude = true;
    if (match.cline) cline = true;
    if (match.codex) codex = true;
  }

  writeStatus(
    `Host detection: Claude=${claude}, Cline=${cline}, Codex=${codex}`,
    "Info",
  );
  return { claude, cline, codex };
}

/**
 * Probe for bash on PATH (needed for Claude Code hooks).
 * Async so it does not block the extension host thread.
 */
export function hasBash(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("bash", ["--version"], { timeout: 5000 }, (err) => resolve(!err));
  });
}

/**
 * Get the home directory path.
 */
export function getHome(): string {
  return os.homedir();
}
