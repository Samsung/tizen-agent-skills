// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/extension.ts — VS Code extension entry point
//
// Activation flow:
//   1. On activation, check if the installed version (globalState) matches
//      the extension version. If not and autoSyncOnUpdate is true, auto-install.
//      The version is recorded only after a *successful* install, so a failed
//      sync is retried on the next start instead of being marked done.
//   2. Register four commands:
//      - Install / Re-sync (manual re-run)
//      - Show Install Status (validation results)
//      - Remove Installed Files (uninstall cleanup)
//      - Show Log (open the OutputChannel)
import * as vscode from "vscode";
import * as path from "path";
import { writeStatus, writeSection, show } from "./log";
import {
  detectHosts,
  resolveTargets,
  hasBash,
  getHome,
} from "./install/detect";
import { installClaude, removeClaude, claudeCacheBase } from "./install/claude";
import {
  installCline,
  removeCline,
  clineCacheBase,
  clineHooksDir,
} from "./install/cline";
import {
  installClaudeHooks,
  installClineHooks,
  removeClaudeHooks,
  removeClineHooks,
} from "./install/hooks";
import { needsSync, readManifest, writeManifest } from "./install/manifest";
import {
  validateClaudeInstall,
  validateClineInstall,
  summarizeResults,
  ValidationResult,
} from "./install/validate";

/** Delay before the on-startup sync, so activation itself stays snappy. */
const AUTO_SYNC_DELAY_MS = 1000;

/**
 * Single source of truth for the four commands exposed by this extension.
 * Both the command registration and the tree view items reference this array,
 * so the IDs can never drift apart.
 */
interface CommandDef {
  id: string;
  label: string;
}

const TREE_COMMANDS: readonly CommandDef[] = [
  { id: "tizenAiExtension.install", label: "Install / Re-sync" },
  { id: "tizenAiExtension.showStatus", label: "Show Install Status" },
  { id: "tizenAiExtension.remove", label: "Remove Installed Files" },
  { id: "tizenAiExtension.showLog", label: "Show Log" },
] as const;

let extensionContext: vscode.ExtensionContext;
let treeProvider: TizenAITreeDataProvider | undefined;

export function activate(ctx: vscode.ExtensionContext): void {
  extensionContext = ctx;

  // Register commands first — these must always succeed so the user can
  // manually trigger an install even if the auto-sync below fails.
  ctx.subscriptions.push(
    vscode.commands.registerCommand("tizenAiExtension.install", () =>
      runInstall(false),
    ),
    vscode.commands.registerCommand("tizenAiExtension.showStatus", () =>
      runShowStatus(),
    ),
    vscode.commands.registerCommand("tizenAiExtension.remove", () =>
      runRemove(),
    ),
    vscode.commands.registerCommand("tizenAiExtension.showLog", () => show()),
  );

  // Register the tree view provider for the Activity Bar sidebar panel.
  treeProvider = new TizenAITreeDataProvider();
  ctx.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "tizenAiExtension.main",
      treeProvider,
    ),
  );

  // Version-gated auto-install on activation.
  // Wrapped in try-catch: if globalState is not yet available (e.g. the
  // globalStorage directory does not exist), we still want the commands
  // above to be registered so the user can run "Tizen AI: Install / Re-sync"
  // manually.
  try {
    const installedVersion = ctx.globalState.get<string>("installedVersion");
    const extVersion = getVersion();
    const onDisk = installedManifestVersions();
    writeStatus(
      `activate(): installedVersion=${installedVersion || "none"}, extVersion=${extVersion}, ` +
        `onDisk=[${onDisk.map((v) => v || "none").join(", ") || "no target"}]`,
      "Info",
    );

    if (
      needsSync(extVersion, installedVersion, onDisk) &&
      getConfig().autoSyncOnUpdate
    ) {
      // Defer slightly so we don't block startup
      const timer = setTimeout(() => {
        writeStatus("Auto-sync: starting doInstall...", "Info");
        doInstall(true)
          .then((ok) => {
            writeStatus(`Auto-sync: doInstall returned ${ok}`, "Info");
            if (ok) {
              return ctx.globalState.update("installedVersion", extVersion);
            }
            writeStatus(
              "Auto-sync did not complete — it will be retried on the next start. " +
                'Run "Tizen AI: Install / Re-sync" to retry now.',
              "Warning",
            );
            return undefined;
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            writeStatus(
              `Auto-sync threw an unhandled error: ${message}`,
              "Error",
            );
          });
      }, AUTO_SYNC_DELAY_MS);
      ctx.subscriptions.push({ dispose: () => clearTimeout(timer) });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    writeStatus(`Auto-sync setup failed: ${message}`, "Error");
    writeStatus(
      'Run "Tizen AI: Install / Re-sync" manually to install skills and agents.',
      "Warning",
    );
  }
}

export function deactivate(): void {
  // nothing to do
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getConfig(): {
  targets: string;
  installHooks: boolean;
  autoSyncOnUpdate: boolean;
} {
  const cfg = vscode.workspace.getConfiguration("tizenAiExtension");
  return {
    targets: cfg.get<string>("targets", "auto"),
    installHooks: cfg.get<boolean>("installHooks", true),
    autoSyncOnUpdate: cfg.get<boolean>("autoSyncOnUpdate", true),
  };
}

function getAssetsDir(): string {
  return path.join(extensionContext.extensionPath, "dist", "assets");
}

function getVersion(): string {
  return extensionContext.extension.packageJSON.version;
}

/**
 * Manifest version recorded on disk for each targeted host, in target order.
 * `undefined` means that host has no manifest — nothing of ours is installed
 * there, regardless of what `globalState` claims. See `needsSync`.
 */
function installedManifestVersions(): (string | undefined)[] {
  const home = getHome();
  const targets = resolveTargets(getConfig().targets, detectHosts());
  const versions: (string | undefined)[] = [];
  if (targets.claude)
    versions.push(readManifest(path.join(home, ".claude"))?.version);
  if (targets.cline)
    versions.push(readManifest(path.join(home, ".cline"))?.version);
  return versions;
}

// ─── Install ───────────────────────────────────────────────────────────

/**
 * @param silent true for the on-startup auto-sync: progress is reported in the
 *               status bar and the log is not brought to the front.
 * @returns true if the install ran to completion
 */
function runInstall(silent: boolean): Thenable<boolean> {
  return vscode.window.withProgress(
    {
      location: silent
        ? vscode.ProgressLocation.Window
        : vscode.ProgressLocation.Notification,
      title: "Tizen AI Extension: syncing skills and agents…",
    },
    () => doInstall(silent),
  );
}

async function doInstall(silent: boolean): Promise<boolean> {
  try {
    const config = getConfig();
    const assetsDir = getAssetsDir();
    const home = getHome();
    const version = getVersion();
    const targets = resolveTargets(config.targets, detectHosts());

    writeSection("Tizen AI Extension — Install / Re-sync");
    writeStatus(`Extension version: ${version}`, "Info");
    writeStatus(`Assets directory: ${assetsDir}`, "Info");

    if (!targets.claude && !targets.cline) {
      writeStatus(
        'No AI host detected. Set tizenAiExtension.targets to "claude", "cline", or "both" to force installation.',
        "Warning",
      );
      if (!silent) show();
      return false;
    }

    // Check for bash if hooks are being installed
    if (config.installHooks && !(await hasBash())) {
      writeStatus(
        "bash not found on PATH — Claude Code hooks will not work. " +
          "Install Git Bash or WSL and add it to PATH. Installation continues without hook enforcement.",
        "Warning",
      );
    }

    const installedAt = new Date().toISOString();
    let allSucceeded = true;

    // Install for Claude Code (independent try-catch so a failure here
    // does not prevent the Cline install below from running)
    if (targets.claude) {
      try {
        const result = await installClaude(assetsDir, home, version);
        // Record what we wrote into the shared skills/agents namespaces so that
        // removal can delete exactly those and nothing the user owns.
        //
        // The manifest is written BEFORE hooks because it tracks skills/agents
        // (shared namespaces), not hooks (namespaced locations).  If hooks
        // throw, the skills/agents are already on disk and must be tracked so
        // that staleEntries() can prune renamed/removed entries on the next
        // version — without the manifest, stale skills linger forever.
        writeManifest(path.join(home, ".claude"), {
          version,
          installedAt,
          skills: result.owned.skills,
          agents: result.owned.agents,
        });
        if (config.installHooks) {
          try {
            await installClaudeHooks(assetsDir, home);
          } catch (hookErr: unknown) {
            // Hook failure is non-fatal: skills/agents are installed and the
            // manifest is recorded.  Hooks live in namespaced locations and are
            // idempotent (stripOurHooks + re-add), so they are retried on the
            // next sync without duplicating or corrupting the skills/agents.
            const msg =
              hookErr instanceof Error ? hookErr.message : String(hookErr);
            writeStatus(
              `Claude Code hooks install failed (non-fatal): ${msg}`,
              "Warning",
            );
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        writeStatus(`Claude Code install failed: ${message}`, "Error");
        allSucceeded = false;
      }
    }

    // Install for Cline (independent try-catch so a failure here
    // does not prevent the Claude install above from running)
    if (targets.cline) {
      try {
        const result = await installCline(assetsDir, home, version);
        // Manifest written before hooks — same rationale as Claude above.
        writeManifest(path.join(home, ".cline"), {
          version,
          installedAt,
          skills: result.owned.skills,
          agents: [],
        });
        if (config.installHooks) {
          try {
            await installClineHooks(assetsDir, home);
          } catch (hookErr: unknown) {
            const msg =
              hookErr instanceof Error ? hookErr.message : String(hookErr);
            writeStatus(
              `Cline hooks install failed (non-fatal): ${msg}`,
              "Warning",
            );
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        writeStatus(`Cline install failed: ${message}`, "Error");
        allSucceeded = false;
      }
    }

    if (!allSucceeded) {
      writeSection("Installation Completed with Errors");
      writeStatus(
        "One or more targets failed. Check the log above for details. " +
          'Re-run "Tizen AI: Install / Re-sync" to retry.',
        "Warning",
      );
      show();
      return false;
    }

    writeSection("Installation Complete");
    writeStatus(
      "Restart your Claude Code / Cline session to load the new skill/agent definitions.",
      "Info",
    );

    // Refresh the sidebar tree view to reflect the updated install state.
    treeProvider?.refresh();

    if (!silent) show();
    void vscode.window
      .showInformationMessage(
        `Tizen AI Extension v${version} installed. Restart your Claude Code / Cline session.`,
        "Show Log",
      )
      .then((action) => {
        if (action === "Show Log") show();
      });

    return true;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    writeStatus(`Installation failed: ${message}`, "Error");
    show();
    void vscode.window.showErrorMessage(
      `Tizen AI Extension installation failed: ${message}`,
    );
    return false;
  }
}

// ─── Show Status ────────────────────────────────────────────────────────

async function runShowStatus(): Promise<void> {
  const config = getConfig();
  const assetsDir = getAssetsDir();
  const home = getHome();
  const version = getVersion();
  const targets = resolveTargets(config.targets, detectHosts());

  writeSection("Tizen AI Extension — Install Status");
  writeStatus(`Extension version: ${version}`, "Info");
  const installedVersion =
    extensionContext.globalState.get<string>("installedVersion");
  writeStatus(
    `Installed version (globalState): ${installedVersion || "none"}`,
    "Info",
  );

  // The manifest is the on-disk witness. globalState survives an uninstall,
  // so the two can disagree — report both rather than trusting globalState.
  const hostDirs: [string, string][] = [];
  if (targets.claude) hostDirs.push(["Claude", path.join(home, ".claude")]);
  if (targets.cline) hostDirs.push(["Cline", path.join(home, ".cline")]);
  for (const [label, hostDir] of hostDirs) {
    const onDisk = readManifest(hostDir)?.version;
    writeStatus(
      `Installed version (${label} manifest): ${onDisk || "none — nothing installed there"}`,
      onDisk === version ? "Info" : "Warning",
    );
  }

  if (installedVersion && installedVersion !== version) {
    writeStatus(
      `Validating against the v${version} cache path — the install on disk is v${installedVersion}, ` +
        "so mismatches below are expected until you re-sync.",
      "Warning",
    );
  }

  const allResults: ValidationResult[] = [];

  if (targets.claude) {
    writeSection("Claude Code Validation");
    allResults.push(
      ...(await validateClaudeInstall(
        claudeCacheBase(home, version),
        assetsDir,
        path.join(home, ".claude", "skills"),
        home,
        config.installHooks,
      )),
    );
  }

  if (targets.cline) {
    writeSection("Cline Validation");
    allResults.push(
      ...(await validateClineInstall(
        clineCacheBase(home, version),
        assetsDir,
        path.join(home, ".cline", "skills"),
        clineHooksDir(home),
        config.installHooks,
      )),
    );
  }

  const summary = summarizeResults(allResults);
  writeSection("Validation Summary");
  writeStatus(
    `Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}`,
    summary.failed > 0 ? "Warning" : "Success",
  );

  show();
}

// ─── Remove ─────────────────────────────────────────────────────────────

async function runRemove(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "This will remove the Tizen SDK Skills files this extension installed " +
      "(plugin cache, hooks, and the skills/agents listed in its install manifest). Continue?",
    { modal: true },
    "Remove",
  );
  if (confirm !== "Remove") return;

  const config = getConfig();
  const home = getHome();
  const targets = resolveTargets(config.targets, detectHosts());

  writeSection("Tizen AI Extension — Remove Installed Files");

  try {
    if (targets.claude) {
      await removeClaude(home);
      await removeClaudeHooks(home);
    }

    if (targets.cline) {
      await removeCline(home);
      await removeClineHooks(home);
    }

    await extensionContext.globalState.update("installedVersion", undefined);

    writeStatus("Removal complete", "Success");

    // Refresh the sidebar tree view to reflect the removal.
    treeProvider?.refresh();

    show();
    void vscode.window.showInformationMessage(
      "Tizen AI Extension files removed.",
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    writeStatus(`Removal failed: ${message}`, "Error");
    show();
    void vscode.window.showErrorMessage(
      `Tizen AI Extension removal failed: ${message}`,
    );
  }
}

// ─── Tree View Provider ─────────────────────────────────────────────────

/**
 * A minimal TreeDataProvider that shows the four Tizen AI commands as
 * clickable items in the Activity Bar sidebar panel.
 */
class TizenAITreeDataProvider implements vscode.TreeDataProvider<TizenAITreeItem> {
  private _onDidChange = new vscode.EventEmitter<TizenAITreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  getTreeItem(element: TizenAITreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TizenAITreeItem): Thenable<TizenAITreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    // Build tree items from the shared TREE_COMMANDS array so that the
    // command IDs always match the ones registered in activate().
    return Promise.resolve(
      TREE_COMMANDS.map(
        (cmd) =>
          new TizenAITreeItem(
            cmd.label,
            cmd.id,
            vscode.TreeItemCollapsibleState.None,
          ),
      ),
    );
  }

  /**
   * Fire the onDidChangeTreeData event so VS Code re-queries getChildren().
   * Call this after install/remove operations to keep the tree view in sync.
   */
  refresh(): void {
    this._onDidChange.fire(undefined);
  }
}

class TizenAITreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    commandId: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.command = {
      title: label,
      command: commandId,
    };
  }
}
