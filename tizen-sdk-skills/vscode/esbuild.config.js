// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// vscode/esbuild.config.js
//
// Bundles the VS Code extension entry points (extension.ts + uninstall.ts)
// and copies all tizen-sdk-skills assets into assets/ for runtime use.
//
// Reuses copyDirRecursive from tizen-cli/esbuild.config.js verbatim.
// The asset layout produced here is what install/fsutil.ts mirrors into
// ~/.claude and ~/.cline at runtime.
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

// ─── Single source of truth for version ─────────────────────────────────
const pkg = require("./package.json");
const VERSION = pkg.version;

const outDir = path.resolve(__dirname, "dist");
const assetsDir = path.join(outDir, "assets");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Files under common/scripts that are for humans, not the plugin — not shipped.
const SCRIPT_EXCLUDES = new Set(["t-cli.ps1", "t-cli.sh", "T-CLI.md"]);

// Directories to skip during recursive copy.
const SKIP_DIRS = new Set([".git"]);

/**
 * Recursively copy a directory, skipping excluded file names at every level.
 * (Adapted from tizen-cli/esbuild.config.js, which dropped `excludes` on
 * recursion — harmless there because its excludes are all top-level.)
 */
function copyDirRecursive(src, dest, excludes) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes && excludes.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyDirRecursive(srcPath, destPath, excludes);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Build both entry points ────────────────────────────────────────────
const commonDir = path.resolve(__dirname, "..", "common");
const clineHooksDir = path.resolve(__dirname, "..", "cline", "hooks");
const docsDir = path.resolve(__dirname, "..", "docs");

/** Shared options for every bundle we emit. */
function bundle(entry, outfile, extra = {}) {
  return esbuild.build({
    entryPoints: [path.join(__dirname, "src", entry)],
    outfile: path.join(outDir, outfile),
    bundle: true,
    platform: "node",
    format: "cjs",
    minify: true,
    target: "node18",
    sourcemap: false,
    logLevel: "info",
    external: ["vscode"],
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".node"],
    ...extra,
  });
}

Promise.all([
  bundle("extension.ts", "extension.js"),
  bundle("uninstall.ts", "uninstall.js"),
  // Unit tests for the vscode-free install logic. Excluded from the VSIX via
  // .vscodeignore; run with `npm test`.
  bundle(path.join("test", "pure.test.ts"), "tests.js", { minify: false }),
  // Integration tests that exercise the real settings.json merge and the
  // destructive mirror/remove paths against a temporary HOME. `vscode` is
  // aliased to a stub so log.ts can be imported.
  ...["hooks.test.ts", "install.test.ts"].map((entry) =>
    bundle(path.join("test", entry), entry.replace(/\.ts$/, ".js"), {
      minify: false,
      external: [],
      alias: { vscode: path.join(__dirname, "src", "test", "vscode-stub.ts") },
    }),
  ),
])
  .then(() => {
    // ─── Populate assets/ ─────────────────────────────────────────────
    fs.mkdirSync(assetsDir, { recursive: true });
    // common/{skills,agents,scripts,lib,assets,hooks,tools} → assets/
    for (const sub of [
      "skills",
      "agents",
      "scripts",
      "lib",
      "assets",
      "hooks",
      "tools",
    ]) {
      const src = path.join(commonDir, sub);
      if (fs.existsSync(src)) {
        const dest = path.join(assetsDir, sub);
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }
        copyDirRecursive(
          src,
          dest,
          sub === "scripts" ? SCRIPT_EXCLUDES : undefined,
        );
        console.log(`✅ Copied common/${sub}/ → assets/${sub}/`);
      }
    }

    // cline/hooks/{PreToolUse,tizen-sdk-skills-guard.md} → assets/cline-hooks/
    if (fs.existsSync(clineHooksDir)) {
      const clineHooksDest = path.join(assetsDir, "cline-hooks");
      if (fs.existsSync(clineHooksDest)) {
        fs.rmSync(clineHooksDest, { recursive: true, force: true });
      }
      copyDirRecursive(clineHooksDir, clineHooksDest);
      console.log("✅ Copied cline/hooks/ → assets/cline-hooks/");
    }

    // docs/ → assets/docs/
    if (fs.existsSync(docsDir)) {
      const docsDest = path.join(assetsDir, "docs");
      if (fs.existsSync(docsDest)) {
        fs.rmSync(docsDest, { recursive: true, force: true });
      }
      copyDirRecursive(docsDir, docsDest);
      console.log("✅ Copied docs/ → assets/docs/");
    }

    // common/.claude-plugin/plugin.json → assets/plugin.json, with the
    // extension version stamped in. The source manifest is deliberately NOT
    // rewritten: a build should not dirty tracked files in the working tree.
    const pluginJsonSrc = path.join(commonDir, ".claude-plugin", "plugin.json");
    if (fs.existsSync(pluginJsonSrc)) {
      const manifest = JSON.parse(fs.readFileSync(pluginJsonSrc, "utf-8"));
      manifest.version = VERSION;
      fs.writeFileSync(
        path.join(assetsDir, "plugin.json"),
        JSON.stringify(manifest, null, 2) + "\n",
        "utf-8",
      );
      console.log(`✅ Wrote assets/plugin.json (version ${VERSION})`);
    }

    console.log(
      "✅ VS Code extension built → dist/extension.js, dist/uninstall.js",
    );
  })
  .catch((e) => {
    console.error("❌ esbuild failed:", e);
    process.exit(1);
  });
