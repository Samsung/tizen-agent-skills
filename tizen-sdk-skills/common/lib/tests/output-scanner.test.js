// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * output-scanner.js tests.
 *
 * Ported from output-scanner.ts (async-only, see
 * docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Part 6) — covers TargetFramework parsing,
 * placeholder substitution, the `read_file` strategy (native tpk_contents)
 * and the `watch_folder` strategy (web/dotnet), including the
 * missing-manifest / missing-tpkroot error paths.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  scanOutputFilesAsync,
  parseTargetFrameworkFromContent,
  resolvePlaceholdersWithCsproj,
  resolvePlaceholders,
} = require("../core/rds/output-scanner");
const { computeFileHash } = require("../core/rds/hash");
const { DEFAULT_IGNORE_LIST } = require("../core/rds/constants");

console.log("=== output-scanner Test ===\n");

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "tizen-output-scanner-test-"));
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
  // ─── parseTargetFrameworkFromContent (pure) ──────────────────────────────

  console.log("parseTargetFrameworkFromContent:");

  check(
    "extracts the TargetFramework value",
    parseTargetFrameworkFromContent(
      "<Project><PropertyGroup><TargetFramework>net6.0-tizen7.0</TargetFramework></PropertyGroup></Project>",
    ),
    "net6.0-tizen7.0",
  );
  check(
    "null when the element is absent",
    parseTargetFrameworkFromContent(
      "<Project><PropertyGroup></PropertyGroup></Project>",
    ),
    null,
  );

  // ─── resolvePlaceholdersWithCsproj (pure) ────────────────────────────────

  console.log("\nresolvePlaceholdersWithCsproj:");

  check(
    "substitutes all three placeholders",
    resolvePlaceholdersWithCsproj(
      "{csprojDir}/bin/Debug/{targetFramework}/tpkroot",
      "MyApp",
      ".",
      "net6.0-tizen7.0",
    ),
    "./bin/Debug/net6.0-tizen7.0/tpkroot",
  );
  check(
    "substitutes projectName",
    resolvePlaceholdersWithCsproj(
      "Debug/projects/{projectName}",
      "TetrisApp",
      "",
      "",
    ),
    "Debug/projects/TetrisApp",
  );

  // ─── resolvePlaceholders (I/O) ────────────────────────────────────────────

  console.log("\nresolvePlaceholders:");

  {
    const dir = makeSandbox();
    const resolved = resolvePlaceholders("Debug/projects/{projectName}", dir);
    check(
      "projectName resolves to the directory basename",
      resolved,
      `Debug/projects/${path.basename(dir)}`,
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(
      dir,
      "TizenNUIApp/TizenNUIApp.csproj",
      "<Project><PropertyGroup><TargetFramework>net7.0-tizen</TargetFramework></PropertyGroup></Project>",
    );
    const resolved = resolvePlaceholders(
      "{csprojDir}/bin/Debug/{targetFramework}/tpkroot",
      dir,
    );
    check(
      "csprojDir + targetFramework resolve from the found .csproj",
      resolved,
      "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot",
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    const resolved = resolvePlaceholders(
      "{csprojDir}/bin/Debug/{targetFramework}/tpkroot",
      dir,
    );
    check(
      "missing .csproj leaves csprojDir/targetFramework empty",
      resolved,
      "/bin/Debug//tpkroot",
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanOutputFilesAsync: native (read_file) ────────────────────────────

  console.log("\nscanOutputFilesAsync (native / read_file):");

  {
    const dir = makeSandbox();
    let threw = false;
    try {
      await scanOutputFilesAsync(dir, "native");
    } catch (err) {
      threw = /Manifest file not found/.test(err.message);
    }
    check("throws when tpk_contents is missing (not built yet)", threw, true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "Debug/tpk/bin/myapp", "binary-content");
    writeFile(dir, "Debug/author-signature.xml", "<sig/>");
    writeFile(
      dir,
      "Debug/tpk_contents",
      JSON.stringify([
        "tpk/bin/myapp || .tpk/bin/myapp",
        "author-signature.xml || .tpk/author-signature.xml",
      ]),
    );

    const result = await scanOutputFilesAsync(dir, "native");
    check(
      "hashes manifest entries, excluding ignored author-signature.xml",
      sortedKeys(result),
      ["Debug/tpk/bin/myapp"],
    );
    check(
      "hash matches computeFileHash directly",
      result["Debug/tpk/bin/myapp"].hash,
      await computeFileHash(path.join(dir, "Debug/tpk/bin/myapp")),
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    // Manifest lists a file that was deleted after the build — should be silently skipped.
    writeFile(
      dir,
      "Debug/tpk_contents",
      JSON.stringify(["tpk/bin/gone || .tpk/bin/gone"]),
    );
    const result = await scanOutputFilesAsync(dir, "native");
    check("skips manifest entries whose file no longer exists", result, {});
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanOutputFilesAsync: web (watch_folder) ────────────────────────────

  console.log("\nscanOutputFilesAsync (web / watch_folder):");

  {
    const dir = makeSandbox();
    const result = await scanOutputFilesAsync(dir, "web");
    check(
      "empty (not an error) when the projects/ dir doesn't exist yet",
      result,
      {},
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    const projectName = path.basename(dir);
    writeFile(dir, `Debug/projects/${projectName}/index.html`, "<html></html>");
    writeFile(dir, `Debug/projects/${projectName}/css/style.css`, "body{}");
    writeFile(
      dir,
      `Debug/projects/${projectName}/author-signature.xml`,
      "<sig/>",
    );

    const result = await scanOutputFilesAsync(dir, "web");
    check(
      "hashes files under the resolved projects/ dir, ignoring signature",
      sortedKeys(result),
      [
        `Debug/projects/${projectName}/css/style.css`,
        `Debug/projects/${projectName}/index.html`,
      ],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanOutputFilesAsync: dotnet (watch_folder) ─────────────────────────

  console.log("\nscanOutputFilesAsync (dotnet / watch_folder):");

  {
    const dir = makeSandbox();
    writeFile(
      dir,
      "TizenNUIApp/TizenNUIApp.csproj",
      "<Project><PropertyGroup><TargetFramework>net7.0-tizen</TargetFramework></PropertyGroup></Project>",
    );
    let threw = false;
    try {
      await scanOutputFilesAsync(dir, "dotnet");
    } catch (err) {
      threw = /tpkroot directory not found/.test(err.message);
    }
    check("throws when tpkroot doesn't exist (not published yet)", threw, true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(
      dir,
      "TizenNUIApp/TizenNUIApp.csproj",
      "<Project><PropertyGroup><TargetFramework>net7.0-tizen</TargetFramework></PropertyGroup></Project>",
    );
    writeFile(
      dir,
      "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot/bin/TizenNUIApp.dll",
      "binary",
    );
    writeFile(
      dir,
      "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot/shared/res/icon.png",
      "png",
    );
    writeFile(
      dir,
      "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot/foo.pdb",
      "debugsymbols",
    );

    const result = await scanOutputFilesAsync(dir, "dotnet");
    check(
      "hashes files under the resolved tpkroot dir, ignoring *.pdb",
      sortedKeys(result),
      [
        "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot/bin/TizenNUIApp.dll",
        "TizenNUIApp/bin/Debug/net7.0-tizen/tpkroot/shared/res/icon.png",
      ],
    );
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── scanOutputFilesAsync: dispatch ──────────────────────────────────────

  console.log("\nscanOutputFilesAsync (dispatch):");

  {
    const dir = makeSandbox();
    let threw = false;
    try {
      await scanOutputFilesAsync(dir, "rpk");
    } catch (err) {
      threw = /Unsupported app type/.test(err.message);
    }
    check("throws for an unsupported app type", threw, true);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  {
    const dir = makeSandbox();
    writeFile(dir, "Debug/tpk_contents", JSON.stringify([]));
    const result = await scanOutputFilesAsync(
      dir,
      "native",
      DEFAULT_IGNORE_LIST,
    );
    check("accepts an explicit ignoreList argument", result, {});
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(
    `\n=== ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
