// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * input-scanner.js tests.
 *
 * Ported from input-scanner.ts (async-only, see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md
 * Part 6) — covers entry expansion (file/directory/glob-pattern entries,
 * ignore-pattern pruning), the native/web/dotnet interest-entry builders,
 * and the three per-app-type scanners + the `scanInputFilesAsync` dispatch.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  scanInputFilesAsync,
  expandEntriesToFiles,
  getNativeInputEntriesAsync,
  getDotnetInputEntriesAsync,
  scanNativeInputFilesAsync,
  scanWebInputFilesAsync,
  scanDotnetInputFilesAsync,
} = require("../core/rds/input-scanner");
const { computeFileHash } = require("../core/rds/hash");
const { DEFAULT_INPUT_IGNORE_PATTERNS } = require("../core/rds/constants");

console.log("=== input-scanner Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

function makeSandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tizen-input-scanner-test-"));
}

function writeFile(dir, relPath, content = "") {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function sortedKeys(record) {
  return Object.keys(record).sort();
}

(async () => {
  // ─── expandEntriesToFiles ────────────────────────────────────────────────

  console.log("expandEntriesToFiles:");

  {
    const dir = makeSandbox();
    writeFile(dir, "src/main.c", "int main(){}");
    writeFile(dir, "inc/main.h", "");
    writeFile(dir, "inc/nested/extra.h", "");
    writeFile(dir, "Debug/build-output.bin", "");

    const result = expandEntriesToFiles(
      dir,
      ["src/main.c", "inc"],
      [".tizen-rds/**", "Debug/**"],
    );
    check("file entry + directory entry (recursive)", [...result].sort(), [
      "inc/main.h",
      "inc/nested/extra.h",
      "src/main.c",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "shared/res/icon.png", "");
    writeFile(dir, "shared/res/icon.pdb", "");
    writeFile(dir, "shared/res/sub/nested.png", "");

    const result = expandEntriesToFiles(
      dir,
      ["shared/res/**/*.png"],
      ["*.pdb"],
    );
    check("glob-pattern entry matches nested files", [...result].sort(), [
      "shared/res/icon.png",
      "shared/res/sub/nested.png",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "author-signature.xml", "");
    const result = expandEntriesToFiles(
      dir,
      ["author-signature.xml"],
      ["**/author-signature.xml"],
    );
    check("ignored file entry is excluded", [...result], []);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    const result = expandEntriesToFiles(dir, ["does-not-exist.c", ""], []);
    check("missing entries and empty strings are skipped", [...result], []);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── getNativeInputEntriesAsync ──────────────────────────────────────────

  console.log("\ngetNativeInputEntriesAsync:");

  const NATIVE_YAML = `sources:
  - src/main.c
resources:
  - shared/res/icon.png
edc_files: []
edc_images_dirs: []
edc_sound_dirs: []
edc_font_dirs: []
po_files: []
lib_files: []
include_dirs: []
lib_dirs: []
deps: []
`;

  {
    const dir = makeSandbox();
    check(
      "empty when no yaml present",
      await getNativeInputEntriesAsync(dir),
      [],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML);
    const entries = await getNativeInputEntriesAsync(dir);
    check("yaml-only: sources + resources + yaml itself", entries, [
      "src/main.c",
      "shared/res/icon.png",
      "tizen_native_project.yaml",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML);
    writeFile(dir, "tizen-manifest.xml", "<manifest/>");
    writeFile(dir, "project_def.prop", "");
    const entries = await getNativeInputEntriesAsync(dir);
    check(
      "tizen-manifest.xml and project_def.prop appended when present",
      entries,
      [
        "src/main.c",
        "shared/res/icon.png",
        "tizen_native_project.yaml",
        "tizen-manifest.xml",
        "project_def.prop",
      ],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── getDotnetInputEntriesAsync ──────────────────────────────────────────

  console.log("\ngetDotnetInputEntriesAsync:");

  const DOTNET_YAML = `csproj_file: TizenNUIApp.csproj
files:
  - TizenNUIApp.cs
  - tizen-manifest.xml
resources: []
deps: []
`;

  {
    const dir = makeSandbox();
    writeFile(dir, "TizenNUIApp/tizen_dotnet_project.yaml", DOTNET_YAML);
    writeFile(dir, "TizenNUIApp/TizenNUIApp.csproj", "");
    const entries = await getDotnetInputEntriesAsync(dir);
    check("entries are prefixed with the csproj subdirectory", entries, [
      "TizenNUIApp/TizenNUIApp.cs",
      "TizenNUIApp/tizen-manifest.xml",
      "TizenNUIApp/TizenNUIApp.csproj",
      "TizenNUIApp/tizen_dotnet_project.yaml",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "TizenNUIApp/tizen_dotnet_project.yaml", DOTNET_YAML);
    writeFile(dir, "TizenNUIApp/TizenNUIApp.csproj", "");
    writeFile(dir, "TizenNUIApp/tizen-manifest.xml", "<manifest/>");
    const entries = await getDotnetInputEntriesAsync(dir);
    check(
      "tizen-manifest.xml alongside yaml is appended once more when it actually exists on disk",
      entries.filter((e) => e === "TizenNUIApp/tizen-manifest.xml").length,
      2, // once from `files:`, once from the existence check — matches upstream exactly
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    check(
      "empty when no .csproj present",
      await getDotnetInputEntriesAsync(dir),
      [],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanNativeInputFilesAsync ───────────────────────────────────────────

  console.log("\nscanNativeInputFilesAsync:");

  {
    const dir = makeSandbox();
    writeFile(dir, "tizen_native_project.yaml", NATIVE_YAML);
    writeFile(dir, "src/main.c", "int main(){ return 0; }");
    writeFile(dir, "shared/res/icon.png", "PNGDATA");

    const result = await scanNativeInputFilesAsync(dir, {
      patterns: DEFAULT_INPUT_IGNORE_PATTERNS,
    });

    check("hashes every discovered input file", sortedKeys(result), [
      "shared/res/icon.png",
      "src/main.c",
      "tizen_native_project.yaml",
    ]);
    check(
      "hash matches computeFileHash directly",
      result["src/main.c"].hash,
      await computeFileHash(path.join(dir, "src/main.c")),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    check(
      "empty result when no yaml present",
      await scanNativeInputFilesAsync(dir, {
        patterns: [],
      }),
      {},
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanWebInputFilesAsync ───────────────────────────────────────────────

  console.log("\nscanWebInputFilesAsync:");

  {
    const dir = makeSandbox();
    writeFile(dir, "index.html", "<html></html>");
    writeFile(dir, "css/style.css", "body{}");
    writeFile(dir, "Debug/build-output.wgt", "binary");
    writeFile(dir, ".tizen-rds/deploy-state.json", "{}");

    const result = await scanWebInputFilesAsync(dir, {
      patterns: DEFAULT_INPUT_IGNORE_PATTERNS,
    });

    check(
      "walks the tree and excludes Debug/ + .tizen-rds/",
      sortedKeys(result),
      ["css/style.css", "index.html"],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanDotnetInputFilesAsync ────────────────────────────────────────────

  console.log("\nscanDotnetInputFilesAsync:");

  {
    const dir = makeSandbox();
    writeFile(dir, "TizenNUIApp/tizen_dotnet_project.yaml", DOTNET_YAML);
    writeFile(dir, "TizenNUIApp/TizenNUIApp.csproj", "<Project/>");
    writeFile(dir, "TizenNUIApp/TizenNUIApp.cs", "class Program {}");
    writeFile(dir, "TizenNUIApp/tizen-manifest.xml", "<manifest/>");

    const result = await scanDotnetInputFilesAsync(dir, {
      patterns: DEFAULT_INPUT_IGNORE_PATTERNS,
    });

    check("hashes all resolved dotnet entries", sortedKeys(result), [
      "TizenNUIApp/TizenNUIApp.cs",
      "TizenNUIApp/TizenNUIApp.csproj",
      "TizenNUIApp/tizen-manifest.xml",
      "TizenNUIApp/tizen_dotnet_project.yaml",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanInputFilesAsync (dispatch) ──────────────────────────────────────

  console.log("\nscanInputFilesAsync:");

  {
    const dir = makeSandbox();
    writeFile(
      dir,
      "tizen_web_project.yaml",
      "files: []\nexcludes: []\ndeps: []\n",
    );
    writeFile(dir, "index.html", "<html></html>");
    const result = await scanInputFilesAsync(dir, "web");
    check("dispatches to the web scanner", sortedKeys(result), [
      "index.html",
      "tizen_web_project.yaml",
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    let threw = false;
    try {
      await scanInputFilesAsync(dir, "rpk");
    } catch {
      threw = true;
    }
    check("throws for an unsupported app type", threw, true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
