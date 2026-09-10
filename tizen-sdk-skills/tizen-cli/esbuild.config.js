// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// tizen-cli/esbuild.config.js
// Bundles the tizen-cli harness of tizen-sdk-skills into a single pure-JS file
// (registered with tizen-cli as the `tizen-sdk` plugin).
//
// Unlike the copy that lives in the tizen-cli repo (which carries a vendor/
// snapshot), this harness bundles the SHARED sources directly:
//   - ../common/lib/**  → inlined into dist/tizen-sdk.js by esbuild
//   - ../common/scripts → copied to dist/scripts (minus the human t-cli wrapper)
//   - ./skills          → copied to dist/skills
// plugin-cache.js resolves scripts/ next to the bundle at runtime (__dirname),
// so the installed layout (~/.tizen/plugins/tizen-sdk/) works unchanged.
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

// ─── Single source of truth for version ─────────────────────────────────
// All version references are derived from package.json at build time.
const pkg = require("./package.json");
const VERSION = pkg.version;

const outDir = path.resolve(__dirname, "dist");

// Start from an empty dist/ every build. dist/ is gitignored, so a stale
// checkout keeps whatever an earlier build wrote there (e.g. the pre-rename
// bundle tizen-sdk-skills.js, or a script/skill that has since been deleted),
// and `tizen-cli plugin install dist/` copies the whole directory verbatim.
// Removing it first guarantees the installed plugin is exactly this build.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Files under common/scripts that are for humans, not the plugin — not shipped.
const SCRIPT_EXCLUDES = new Set(["t-cli.ps1", "t-cli.sh", "T-CLI.md"]);

// Directories to skip during recursive copy (git objects are read-only and cause EPERM).
const SKIP_DIRS = new Set([".git"]);

/**
 * Recursively copy a directory, skipping excluded top-level file names.
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @param {Set<string>} [excludes] - top-level entry names to skip
 */
function copyDirRecursive(src, dest, excludes) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes && excludes.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src", "index.ts")],
    outfile: path.join(outDir, "tizen-sdk.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    minify: true,
    target: "node18",
    sourcemap: false,
    logLevel: "info",
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".node"],
  })
  .then(() => {
    // ─── Sync version from package.json to all manifest files ───────────
    // package.json is the single source of truth; plugin.json and
    // .claude-plugin/plugin.json are updated automatically at build time.
    const pluginJsonSrc = path.join(__dirname, "plugin.json");
    const pluginJsonDest = path.join(outDir, "plugin.json");
    const claudePluginJsonSrc = path.resolve(
      __dirname,
      "..",
      "common",
      ".claude-plugin",
      "plugin.json",
    );

    // Sync version into plugin.json (source + dist copy)
    for (const jsonPath of [pluginJsonSrc, pluginJsonDest]) {
      if (fs.existsSync(jsonPath)) {
        const manifest = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        manifest.version = VERSION;
        fs.writeFileSync(
          jsonPath,
          JSON.stringify(manifest, null, 2) + "\n",
          "utf-8",
        );
      }
    }
    console.log(`✅ Synced version ${VERSION} → plugin.json`);

    // Sync version into common/.claude-plugin/plugin.json
    if (fs.existsSync(claudePluginJsonSrc)) {
      const claudeManifest = JSON.parse(
        fs.readFileSync(claudePluginJsonSrc, "utf-8"),
      );
      claudeManifest.version = VERSION;
      fs.writeFileSync(
        claudePluginJsonSrc,
        JSON.stringify(claudeManifest, null, 2) + "\n",
        "utf-8",
      );
      console.log(
        `✅ Synced version ${VERSION} → common/.claude-plugin/plugin.json`,
      );
    }

    // Copy plugin.json to dist so it can be installed from dist/
    if (fs.existsSync(pluginJsonSrc)) {
      fs.copyFileSync(pluginJsonSrc, pluginJsonDest);
      console.log("✅ Copied plugin.json to dist/");
    }

    // ─── Copy runtime assets next to the bundle ──────────────────────────
    const scriptsSrc = path.resolve(__dirname, "..", "common", "scripts");
    if (fs.existsSync(scriptsSrc)) {
      copyDirRecursive(
        scriptsSrc,
        path.join(outDir, "scripts"),
        SCRIPT_EXCLUDES,
      );
      console.log(
        "✅ Copied ../common/scripts/ to dist/scripts/ (t-cli wrapper excluded)",
      );
    }
    const skillsSrc = path.join(__dirname, "skills");
    if (fs.existsSync(skillsSrc)) {
      copyDirRecursive(skillsSrc, path.join(outDir, "skills"));
      console.log("✅ Copied skills/ to dist/skills/");
    }
    const assetsSrc = path.resolve(__dirname, "..", "common", "assets");
    if (fs.existsSync(assetsSrc)) {
      copyDirRecursive(assetsSrc, path.join(outDir, "assets"));
      console.log("✅ Copied ../common/assets/ to dist/assets/");
    }

    const toolsSrc = path.resolve(__dirname, "..", "common", "tools");
    if (fs.existsSync(toolsSrc)) {
      copyDirRecursive(toolsSrc, path.join(outDir, "tools"));
      console.log("✅ Copied ../common/tools/ to dist/tools/");
    }

    // ─── License texts ───────────────────────────────────────────────────
    // dist/ is what the release ZIP and `tizen-cli plugin install` ship, and
    // it redistributes third-party material (bundled `commander`, the TV CA
    // certificates, the dlog-analyzer binaries). Apache-2.0 §4 requires the
    // LICENSE and NOTICE to travel with it.
    for (const name of ["LICENSE", "NOTICE"]) {
      const src = path.resolve(__dirname, "..", name);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outDir, name));
        console.log(`✅ Copied ../${name} to dist/${name}`);
      } else {
        console.warn(`⚠️  ../${name} not found; dist/ ships without it`);
      }
    }

    console.log("✅ tizen-sdk plugin built -> dist/tizen-sdk.js");

    // ─── Auto-update plugin.json commands array ──────────────────────────
    // Run the built JS with --schema to extract the actual command names
    // from the auto-generated schema, then update plugin.json automatically.
    try {
      const { execSync } = require("child_process");
      const bundlePath = path.join(outDir, "tizen-sdk.js");
      const output = execSync(
        `node -e "const m=require('${bundlePath.replace(/\\/g, "\\\\")}'); m.run(['--schema']).then(()=>{})"`,
        {
          cwd: outDir,
          encoding: "utf-8",
          timeout: 10000,
        },
      );
      const envelope = JSON.parse(output);
      const commands = envelope.result?.commands
        ? Object.keys(envelope.result.commands)
        : null;

      if (Array.isArray(commands) && commands.length > 0) {
        // Update both the source plugin.json and the dist copy
        for (const jsonPath of [pluginJsonSrc, pluginJsonDest]) {
          if (fs.existsSync(jsonPath)) {
            const manifest = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
            manifest.commands = commands;
            fs.writeFileSync(
              jsonPath,
              JSON.stringify(manifest, null, 2) + "\n",
              "utf-8",
            );
          }
        }
        console.log(
          `✅ Auto-updated plugin.json commands: [${commands.join(", ")}]`,
        );
      }
    } catch (e) {
      console.warn(
        `⚠️  Could not auto-update plugin.json commands: ${e.message}`,
      );
      console.warn(
        '   The "commands" array in plugin.json may be out of date.',
      );
    }

    console.log("   Install with: tizen-cli plugin install dist/");
  })
  .catch((e) => {
    console.error("❌ esbuild failed:", e);
    process.exit(1);
  });
