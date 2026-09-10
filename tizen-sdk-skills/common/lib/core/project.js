// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Project domain: create / build / list templates / install app
 *
 * Each function executes its corresponding script under scripts/, and instead of
 * extensive toolchain output, summarizes key lines and returns as Standard JSON Envelope.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");
const {
  formatProjectBuild,
  formatError,
} = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveScript, execPluginScript } = require("./plugin-cache");
const { rawOutputTail } = require("./emulator");
const {
  summarizeOutput,
  extractBuildDiagnostics,
} = require("./output-summary");
const { preflightSigningProfile } = require("./certificate");
const { readSdkPath, repairSdkInfo, describeSdkInfoRepair } = require("./sdk");

const VALID_PROJECT_TYPES = [
  "native",
  "dotnet",
  "webapp",
  "rpk",
  "tv",
  "platform",
];

function isPlatformProject(projectPath) {
  const packagingDir = path.join(projectPath, "packaging");
  return (
    fs.existsSync(path.join(projectPath, "CMakeLists.txt")) &&
    fs.existsSync(packagingDir) &&
    fs.readdirSync(packagingDir).some((entry) => entry.endsWith(".spec"))
  );
}

/**
 * Tizen package IDs must be exactly 10 alphanumeric characters.
 * If the app name produces a package ID shorter than 10 characters,
 * `tz install` will fail with "Load archive info fail" / "Operation not allowed [-4]".
 *
 * This function checks whether the app name will produce a valid 10-char package ID.
 * Tizen derives the package ID from the app name by taking the first 10 alphanumeric
 * characters (lowercased). If fewer than 10 alphanumeric characters are available,
 * the package ID will be shorter than 10 characters and installation will fail.
 *
 * @param {string} appName - the app name passed to createProject
 * @returns {{valid: boolean, packageId: string, message: string|null}}
 */
function validatePackageId(appName) {
  // Extract alphanumeric characters from the app name (Tizen lowercases them)
  const alphanumeric = appName.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  const packageId = alphanumeric.slice(0, 10);

  if (packageId.length < 10) {
    return {
      valid: false,
      packageId,
      message:
        `App name "${appName}" produces a package ID "${packageId}" that is only ${packageId.length} characters long. ` +
        "Tizen requires exactly 10 alphanumeric characters. " +
        'Installation will fail with "Load archive info fail" / "Operation not allowed [-4]". ' +
        'Please use an app name with at least 10 alphanumeric characters (e.g., "MyTizenApp01").',
    };
  }

  return { valid: true, packageId, message: null };
}

/**
 * Check whether a directory looks like a Tizen project.
 *
 * Guards the destructive paths (deleteProject, createProject --force): a
 * directory is only ever removed when it carries at least one well-known
 * Tizen project marker, so a mistyped path can never wipe an unrelated
 * directory.
 *
 * @param {string} dir - absolute directory path
 * @returns {boolean}
 */
function isTizenProjectDir(dir) {
  // These file NAMES only ever appear in Tizen projects, so their presence
  // alone is sufficient.
  const STRONG_MARKERS = [
    "tizen_native_project.yaml",
    "tizen_dotnet_project.yaml",
    "tizen_web_project.yaml",
    "tizen_resource_project.yaml",
    "tizen-manifest.xml",
    "project_def.prop",
    ".tproject",
  ];
  // First 64KB is plenty to find the Tizen namespace / TFM near the top of
  // config.xml or a .csproj without reading arbitrarily large files.
  const readHead = (p) => {
    try {
      const fd = fs.openSync(p, "r");
      try {
        const buf = Buffer.alloc(64 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        return buf.toString("utf-8", 0, n);
      } finally {
        fs.closeSync(fd);
      }
    } catch (_e) {
      return "";
    }
  };
  const hasMarker = (d) => {
    if (STRONG_MARKERS.some((f) => fs.existsSync(path.join(d, f)))) return true;
    // config.xml is a generic file name used by many tools — only count it
    // when it is actually a Tizen widget config (tizen.org namespace), so a
    // stray tool config can never qualify a directory for recursive deletion.
    const configXml = path.join(d, "config.xml");
    if (fs.existsSync(configXml) && /tizen\.org/i.test(readHead(configXml))) {
      return true;
    }
    const entries = fs.readdirSync(d);
    // Same for .csproj: only a project that actually references Tizen
    // (Tizen.NET package / net*-tizen TFM) counts. A bare .sln says nothing
    // about Tizen and is deliberately NOT accepted — a workspace folder whose
    // subfolder happens to hold a solution must never be deletable.
    if (
      entries.some(
        (e) => /\.csproj$/i.test(e) && /tizen/i.test(readHead(path.join(d, e))),
      )
    ) {
      return true;
    }
    // GBS platform project: CMakeLists.txt + packaging/*.spec
    return (
      entries.includes("CMakeLists.txt") &&
      fs.existsSync(path.join(d, "packaging")) &&
      fs.readdirSync(path.join(d, "packaging")).some((e) => e.endsWith(".spec"))
    );
  };
  try {
    if (hasMarker(dir)) return true;
    // DotNET solution layout (tz new scaffolds Solution/Solution.sln +
    // Solution/Project/Project.csproj): markers live one level down. Only
    // descend when the directory itself carries solution evidence (*.sln) —
    // without that requirement, a WORKSPACE folder that merely contains
    // Tizen projects (e.g. ~/tizen-apps, or a home dir with one project in
    // it) would qualify as "a Tizen project" and become deletable as a whole.
    if (!fs.readdirSync(dir).some((e) => /\.sln$/i.test(e))) return false;
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .some((e) => {
        try {
          return hasMarker(path.join(dir, e.name));
        } catch (_err) {
          return false;
        }
      });
  } catch (_e) {
    return false;
  }
}

/**
 * Paths deleteProject / createProject(force) must never remove, even when a
 * project marker matches: filesystem roots, the home directory, and any
 * ancestor of the home directory (C:\Users, /home, ...).
 *
 * Expects a PHYSICAL path (fs.realpathSync) — callers resolve symlinks first,
 * because path.resolve() alone is lexical and a symlinked parent would
 * otherwise dodge these comparisons.
 */
function isProtectedPath(realPath) {
  const realHome = fs.realpathSync.native(path.resolve(os.homedir()));
  // Windows paths are case-insensitive; the two sides may also disagree on
  // 8.3 short names, which realpathSync.native has already expanded.
  const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
  const withSep = (p) => (p.endsWith(path.sep) ? p : p + path.sep);
  return (
    path.dirname(realPath) === realPath ||
    norm(realPath) === norm(realHome) ||
    norm(withSep(realHome)).startsWith(norm(withSep(realPath)))
  );
}

/**
 * Extract only key lines from project create script stdout for envelope warnings
 *
 * Remove banners (====), creation info (name/template/path — already in result field),
 * and "Next steps:" guidance (redundant with agent Handoff docs), keeping only
 * unique info not in result (workspace files, warnings/errors).
 *
 * @param {string} output - script stdout
 * @returns {string[]} warnings array (key lines only, typically 0-3 lines)
 */
function summarizeCreateProjectOutput(output) {
  // "Next steps:" onwards is build/install guidance — redundant with agent Handoff docs, so discard
  return summarizeOutput(output, {
    keep: /\.code-workspace|workspace|warning|error|manual|unavailable|fail/i,
    stopAt: /^Next steps:/i,
  });
}

/**
 * Patch the tizen-manifest.xml of a newly created RPK project to use a unique
 * res-type, preventing device package-manager registration conflicts.
 *
 * The SDK's rpk_app template hardcodes res-type="tizen.sample.resource" and
 * res-version="1.5.0" for every project. The device's package_res_info table
 * has PRIMARY KEY(res_type, res_version), so a second RPK with the same
 * res-type/res-version fails with error -21 ("Register application error [-21]").
 *
 * This function replaces the template's res-type with the project's package ID
 * (e.g. "org.example.myapp"), making each RPK's resource type unique. It also
 * renames the res/ subdirectories to match the new res-type so the resource
 * layout stays consistent.
 *
 * @param {string} projectPath - the RPK project root directory
 */
function patchRpkManifestResType(projectPath) {
  const manifestPath = path.join(projectPath, "tizen-manifest.xml");
  if (!fs.existsSync(manifestPath)) return;

  let manifestContent = fs.readFileSync(manifestPath, "utf-8");

  // Extract the package ID from the manifest
  const pkgMatch = manifestContent.match(/package="([^"]+)"/);
  if (!pkgMatch) return;
  const packageId = pkgMatch[1];

  // Extract the current res-type
  const resTypeMatch = manifestContent.match(/res-type="([^"]+)"/);
  if (!resTypeMatch) return;
  const oldResType = resTypeMatch[1];

  // Already patched (res-type equals package ID) — nothing to do
  if (oldResType === packageId) return;

  // Replace res-type with the package ID to make it unique
  manifestContent = manifestContent.replace(
    /res-type="[^"]*"/,
    `res-type="${packageId}"`,
  );

  fs.writeFileSync(manifestPath, manifestContent, "utf-8");
  console.error(
    `[tizen-project] Patched RPK manifest: res-type "${oldResType}" -> "${packageId}" (prevents -21 registration conflict)`,
  );

  // Rename res/ subdirectories to match the new res-type.
  // The template creates res/allowed/<old-res-type>/ and res/global/<old-res-type>/
  // The device package-manager uses these paths to locate resources by res-type.
  const resDir = path.join(projectPath, "res");
  if (fs.existsSync(resDir)) {
    for (const scope of ["allowed", "global"]) {
      const oldDir = path.join(resDir, scope, oldResType);
      const newDir = path.join(resDir, scope, packageId);
      if (fs.existsSync(oldDir) && oldDir !== newDir) {
        fs.renameSync(oldDir, newDir);
        console.error(
          `[tizen-project] Renamed res/${scope}/${oldResType} -> res/${scope}/${packageId}`,
        );
      }
    }
  }

  // Also update tizen_resource_project.yaml if it references the old res-type
  // in its resources list (the res/ paths don't include res-type, but keep
  // the yaml consistent in case future templates add res-type references).
  const yamlPath = path.join(projectPath, "tizen_resource_project.yaml");
  if (fs.existsSync(yamlPath)) {
    let yamlContent = fs.readFileSync(yamlPath, "utf-8");
    if (yamlContent.includes(oldResType)) {
      yamlContent = yamlContent.split(oldResType).join(packageId);
      fs.writeFileSync(yamlPath, yamlContent, "utf-8");
    }
  }
}

/**
 * Create Tizen project
 *
 * Creates project at `<parentPath>/<appName>/` location.

 *
 * @param {string} type - project type (native, dotnet, webapp)
 * @param {string} template - template name selected by user from listTemplates() result
 * @param {string} parentPath - workspace (parent) directory — not the app folder itself!
 * @param {string} appName - app name = name of folder to be created
 * @param {boolean} [force] - if the target folder already exists, replace it
 *   (only when it is empty or looks like a Tizen project — never an arbitrary dir)
 * @returns {object} Standard JSON Envelope
 */
async function createProject(
  type,
  template,
  parentPath,
  appName,
  force = false,
  command = "tizen-sdk create-project",
  open = false,
) {
  // Start time: pass to success/failure responses so duration_ms reflects actual work time
  const startTime = Date.now();
  try {
    if (!type || !template || !parentPath || !appName) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameters: type, template, parentPath, appName",
        'createProject("dotnet", "TizenNUITemplate", "/path/to", "MyApp")',
      );
    }

    if (!VALID_PROJECT_TYPES.includes(type.toLowerCase())) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid project type: ${type}. Must be one of: ${VALID_PROJECT_TYPES.join(", ")}`,
      );
    }

    // Validate that the app name will produce a valid 10-character package ID.
    // Tizen requires exactly 10 alphanumeric characters; shorter IDs cause
    // "Load archive info fail" / "Operation not allowed [-4]" at install time.
    const pkgIdCheck = validatePackageId(appName);
    if (!pkgIdCheck.valid) {
      return formatError(
        command,
        "invalid_parameters",
        pkgIdCheck.message,
        'Use an app name with at least 10 alphanumeric characters, e.g., "MyTizenApp01"',
      );
    }

    // Normalize path: avoid backslash being interpreted as escape in MSYS2/Git Bash

    const normalizedParentPath = path.resolve(parentPath);
    console.error(
      `[tizen-project] Using parent directory: ${normalizedParentPath}`,
    );

    if (!fs.existsSync(normalizedParentPath)) {
      return formatError(
        command,
        "io_error",
        `Parent directory does not exist: ${normalizedParentPath}\nPlease ensure the directory exists or use the current working directory.`,
        `createProject("${type}", "${template}", "${process.cwd()}", "${appName}")`,
      );
    }

    // Pre-check the target folder. Without this, an existing directory either
    // breaks `tz new` or silently merges — and a remote MCP client has no way
    // to delete it beforehand (a local rm -rf runs on the wrong machine).
    const targetPath = path.resolve(normalizedParentPath, appName);
    if (path.dirname(targetPath) !== normalizedParentPath) {
      // appName must be a plain folder name — a separator or ".." would make
      // the exists/replace logic (and tz new itself) act outside parentPath.
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app name "${appName}": it must be a plain folder name without path separators.`,
        null,
        startTime,
      );
    }
    if (fs.existsSync(targetPath)) {
      // A symlink here is ambiguous (replace the link? the target?) and rmSync
      // would only unlink the link anyway — make the caller resolve it.
      if (fs.lstatSync(targetPath).isSymbolicLink()) {
        return formatError(
          command,
          "invalid_parameters",
          `Refusing to replace ${targetPath}: it is a symbolic link. Remove it manually first.`,
          null,
          startTime,
        );
      }
      // Same protected-path rule as deleteProject: even with force, never
      // remove the home directory, an ancestor of it, or a filesystem root.
      // The replace gate must not rest on marker heuristics alone — e.g.
      // parentPath=C:\Users, appName=<username> must die HERE.
      const realTarget = fs.realpathSync.native(targetPath);
      if (isProtectedPath(realTarget)) {
        return formatError(
          command,
          "invalid_parameters",
          `Refusing to replace ${realTarget}: protected directory (home, ancestor of home, or filesystem root).`,
          null,
          startTime,
        );
      }
      const isEmpty = fs.readdirSync(targetPath).length === 0;
      if (!force && !isEmpty) {
        return formatError(
          command,
          "project_creation_failed",
          `Target folder already exists: ${targetPath}. Pass force=true (--force) to replace it, or delete it first with the delete-project command.`,
          null,
          startTime,
        );
      }
      if (force && !isEmpty && !isTizenProjectDir(targetPath)) {
        // force only replaces something we can positively identify as a Tizen
        // project (or an empty dir) — never an arbitrary non-empty directory.
        return formatError(
          command,
          "invalid_parameters",
          `Refusing to replace ${targetPath}: it exists but does not look like a Tizen project (no tizen_*_project.yaml / .tproject / tizen-manifest.xml / project_def.prop marker, no Tizen config.xml or Tizen .csproj). Delete it manually if replacement is really intended.`,
          null,
          startTime,
        );
      }
      console.error(
        `[tizen-project] ${force ? "--force: removing" : "Removing empty"} existing folder: ${targetPath}`,
      );
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    // These values are interpolated into a shell command line below — reject
    // shell metacharacters (template names may contain spaces/dots)
    if (!/^[A-Za-z0-9._-]+$/.test(appName)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app name "${appName}": only letters, digits, '.', '_' and '-' are allowed.`,
        null,
        startTime,
      );
    }
    if (!/^[A-Za-z0-9._\s-]+$/.test(template)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid template name "${template}".`,
        null,
        startTime,
      );
    }

    const resolved = resolveScript("tizen-create-project");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    console.error(
      `[tizen-project] Creating ${type} project: ${appName} at ${normalizedParentPath}`,
    );

    let output;
    try {
      // Pass forward slash paths to Windows script (Node.js compatible)
      const winPath = normalizedParentPath.replace(/\\/g, "/");
      // The scripts only launch `code` (workspace open) when explicitly asked.
      output = execPluginScript(
        resolved.scriptPath,
        `-Type "${type}" -Template "${template}" -Path "${winPath}" -Name "${appName}"${open ? " -Open" : ""}`,
        `--type="${type}" --template="${template}" --path="${normalizedParentPath}" --name="${appName}"${open ? " --open" : ""}`,
      );
    } catch (error) {
      return formatError(
        command,
        "build_failed",
        `Project creation failed: ${error.message}`,
        null,
        startTime,
      );
    }

    // Success validation: verify project folder exists (more reliable than parsing script output)
    const projectPath = path.join(normalizedParentPath, appName);
    if (!fs.existsSync(projectPath)) {
      return formatError(
        command,
        "build_failed",
        `Project folder was not created at: ${projectPath}`,
        null,
        startTime,
      );
    }

    // RPK fix: The SDK template hardcodes res-type="tizen.sample.resource" and
    // res-version="1.5.0" for all RPK projects. The device package-manager
    // database has PRIMARY KEY(res_type, res_version) on package_res_info, so
    // installing a second RPK with the same res-type/res-version fails with
    // error -21 ("Register application error [-21]"). Patch the manifest to
    // use the package ID as res-type, making each RPK's resource type unique.
    if (type.toLowerCase() === "rpk") {
      try {
        patchRpkManifestResType(projectPath);
      } catch (e) {
        // Non-fatal: the project is created, but installation may conflict
        // with another RPK that has the same res-type. Log a warning.
        console.error(
          `[tizen-project] Warning: could not patch RPK manifest res-type: ${e.message}`,
        );
      }
    }

    const envelope = new Envelope(command);

    envelope.startTime = startTime;
    return envelope.success(
      {
        project_name: appName,
        project_type: type,
        template_name: template,
        project_path: projectPath,
        status: "created",
      },
      {
        // Key lines only (workspace files, warnings) instead of full script banner/guidance (~30 lines)
        warnings: summarizeCreateProjectOutput(output),
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to create project: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Delete a Tizen project directory on the SDK host.
 *
 * Exists because a remote MCP client cannot clean up projects itself: its own
 * rm -rf targets the client machine, exits 0, and leaves the SDK host
 * accumulating one directory per create-project run.
 *
 * Pure fs operation — this code already runs on the SDK host, so no
 * platform script is needed. Refuses to delete anything that does not carry a
 * recognizable Tizen project marker (see isTizenProjectDir).
 *
 * @param {string} projectPath - project root directory (absolute path recommended)
 * @param {string} command - envelope command label
 * @param {object} [opts]
 * @param {string} [opts.expectName] - user-confirmed app name; the delete is
 *   refused when the resolved folder name differs (guards the "wrong sibling
 *   project" case the marker gate cannot catch)
 * @param {boolean} [opts.dryRun] - run every safety gate and report what WOULD
 *   be deleted (result.status = "dry-run") without touching the filesystem
 * @returns {object} Standard JSON Envelope — result = {project_path, status: "deleted"}
 */
async function deleteProject(
  projectPath,
  command = "tizen-sdk project-delete",
  opts = {},
) {
  const startTime = Date.now();
  try {
    if (!projectPath) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: projectPath",
        'deleteProject("/path/to/MyApp")',
      );
    }

    const normalizedPath = path.resolve(projectPath);

    if (!fs.existsSync(normalizedPath)) {
      return formatError(
        command,
        "io_error",
        `Project directory does not exist: ${normalizedPath}`,
        null,
        startTime,
      );
    }

    // Refuse symlinks/junctions outright: rmSync would only unlink the link
    // (reporting success while the project survives), and a link is also the
    // vehicle for pointing this command at directories it must never touch.
    if (fs.lstatSync(normalizedPath).isSymbolicLink()) {
      return formatError(
        command,
        "invalid_parameters",
        `Refusing to delete ${normalizedPath}: it is a symbolic link. Pass the real project directory path.`,
        null,
        startTime,
      );
    }

    // path.resolve() is purely lexical — a symlink in the MIDDLE of the path
    // would defeat the home/root guards below (the string differs while the
    // physical target sits inside a protected tree). Guard on the physical
    // path instead.
    const realPath = fs.realpathSync.native(normalizedPath);

    // Never operate on a filesystem root, the home directory itself, or any
    // ancestor of it (C:\Users, /home, ...).
    if (isProtectedPath(realPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Refusing to delete ${realPath}: not a project directory.`,
        null,
        startTime,
      );
    }

    if (!fs.statSync(realPath).isDirectory()) {
      return formatError(
        command,
        "invalid_parameters",
        `Not a directory: ${realPath}`,
        null,
        startTime,
      );
    }

    // Cross-check against the user-confirmed app name: a mistyped or guessed
    // path pointing at a DIFFERENT Tizen project would pass the marker gate,
    // so the folder name itself must match what the user confirmed.
    const { expectName, dryRun } = opts || {};
    if (expectName) {
      const actual = path.basename(realPath);
      const same =
        process.platform === "win32"
          ? actual.toLowerCase() === String(expectName).toLowerCase()
          : actual === String(expectName);
      if (!same) {
        return formatError(
          command,
          "invalid_parameters",
          `Refusing to delete ${realPath}: folder name "${actual}" does not match --expect-name "${expectName}". Confirm the target with the user and retry with the matching path/name.`,
          null,
          startTime,
        );
      }
    }

    if (!isTizenProjectDir(realPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Refusing to delete ${realPath}: it does not look like a Tizen project (no tizen_*_project.yaml / .tproject / tizen-manifest.xml / project_def.prop marker, no Tizen config.xml or Tizen .csproj, no GBS packaging). Delete it manually if this is really intended.`,
        null,
        startTime,
      );
    }

    // Dry run: every gate above has passed — report the resolved physical
    // path that WOULD be deleted, without touching the filesystem, so callers
    // can show it to the user for confirmation before the real delete.
    if (dryRun) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      return envelope.success({
        project_path: realPath,
        status: "dry-run",
      });
    }

    console.error(`[tizen-project] Deleting project: ${realPath}`);
    fs.rmSync(realPath, { recursive: true, force: true });

    if (fs.existsSync(realPath)) {
      return formatError(
        command,
        "io_error",
        `Failed to delete ${realPath} — some files could not be removed (locked by a running process?).`,
        null,
        startTime,
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success({
      project_path: realPath,
      status: "deleted",
    });
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to delete project: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Search for build artifacts (.tpk/.wgt/.rpk/.rpm) in project directory
 *
 * @param {string} rootDir - start search directory (project root)
 * @param {number} newerThan - only files modified after this time (Date.now() value)
 * @returns {Array<{path: string, format: string, size: number}>}
 */
function findBuildArtifacts(rootDir, newerThan) {
  const artifacts = [];
  const SKIP_DIRS = new Set(["node_modules", ".git", ".vs", "obj"]);
  const MAX_DEPTH = 6;

  function walk(dir, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(fullPath, depth + 1);
      } else if (/\.(tpk|wgt|rpk|rpm)$/i.test(entry.name)) {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs >= newerThan) {
          artifacts.push({
            path: fullPath,
            format: path.extname(fullPath).toLowerCase(),
            size: stat.size,
          });
        }
      }
    }
  }

  walk(rootDir, 0);
  return artifacts;
}

/**
 * Extract only key lines from build script stdout for envelope warnings
 * (warning/error lines only instead of hundreds-thousands of toolchain output, max 10 lines)
 */
function summarizeBuildOutput(output) {
  return summarizeOutput(output, {
    keep: /warning|error|fail/i,
    max: 10,
    overflowNote: "... (more warning/error lines omitted)",
  });
}

/**
 * Compose a build-failure message that carries the diagnostics inline.
 *
 * The skill docs tell agents to surface `errors[0].message`, so the compile
 * errors have to live in the message itself. A bare log path means the caller
 * has to go read a file on the host to learn why the build broke — which in
 * practice led to the cause being guessed at and the build retried unchanged.
 *
 * @param {string} headline - first line, e.g. "Build failed (exit 1)."
 * @param {string[]} diagnostics - output of extractBuildDiagnostics()
 * @param {string|null} logPath - full log location, if it could be saved
 */
function formatBuildFailureMessage(headline, diagnostics, logPath) {
  const parts = [headline];
  if (diagnostics.length) {
    parts.push("", "Build errors:", ...diagnostics.map((line) => `  ${line}`));
  }
  parts.push(
    "",
    logPath ? `Full log: ${logPath}` : "Full log could not be saved.",
  );
  return parts.join("\n");
}

/**
 * Save full output of failed build to log file and return path
 * (REQ-SDK-OUT-003: large logs returned as path reference)
 */
function saveBuildLog(output) {
  try {
    const logPath = path.join(os.tmpdir(), `tizen-build-${Date.now()}.log`);
    fs.writeFileSync(logPath, output || "(no output captured)", "utf-8");
    return logPath;
  } catch (_e) {
    return null;
  }
}

/**
 * Build Tizen project (tz build + tz pack)
 *
 * Synchronously executes build script and verifies artifacts (.tpk/.wgt/.rpk),
 * returning as Standard JSON Envelope. Large toolchain output is not included in envelope —
 * on success, only warning/error summary (max 10 lines). On failure the full log is saved
 * to a file AND the compile diagnostics are returned inline (message + errors[0].details),
 * so diagnosing a broken build never requires reading a file on the host.
 *
 * @param {string} projectPath - project root (absolute path recommended)
 * @param {string} buildType - Debug (default) | Release | Test
 * @param {string} [signProfile] - signing profile (optional)
 * @param {string} [arch] - target architecture for GBS/platform builds (default x86_64)
 * @param {boolean} [clean] - remove previous build output on the SDK host before
 *   building (forces a full, non-incremental rebuild — compiler warnings reappear)
 * @returns {object} Standard JSON Envelope — result.artifacts = [{path, format, size_bytes}]
 */
async function buildProject(
  projectPath,
  buildType = "Debug",
  signProfile,
  arch = "x86_64",
  clean = false,
  command = "tizen-sdk build-project",
) {
  const startTime = Date.now();
  const VALID_BUILD_TYPES = ["Debug", "Release", "Test"];
  try {
    if (!projectPath) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: projectPath",
        'buildProject("/path/to/MyApp", "Debug")',
      );
    }

    // Normalize case (debug → Debug)
    const normalizedType = VALID_BUILD_TYPES.find(
      (t) => t.toLowerCase() === String(buildType).toLowerCase(),
    );
    if (!normalizedType) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid build type: ${buildType}. Must be one of: ${VALID_BUILD_TYPES.join(", ")}`,
      );
    }

    const normalizedProjectPath = path.resolve(projectPath);
    if (!fs.existsSync(normalizedProjectPath)) {
      return formatError(
        command,
        "io_error",
        `Project directory does not exist: ${normalizedProjectPath}`,
        null,
        startTime,
      );
    }

    // The scripts intentionally run `tz build` and then `tz pack`. Compilation
    // does not need a certificate, but packaging always signs the archive; stop
    // before either SDK command when the selected (or active) profile cannot be
    // used because its author/distributor certificate files are unavailable.
    // Platform projects use GBS and produce RPMs, so they never reach tz pack.
    if (!isPlatformProject(normalizedProjectPath)) {
      const signingPreflight = preflightSigningProfile({
        profileName: signProfile,
      });
      if (!signingPreflight.valid) {
        return formatError(
          command,
          "signing_profile_invalid",
          signingPreflight.error,
          null,
          startTime,
        );
      }
    }

    // signProfile/arch are interpolated into a shell command line below
    if (signProfile && !/^[A-Za-z0-9._-]+$/.test(signProfile)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid signing profile name "${signProfile}".`,
        null,
        startTime,
      );
    }
    if (arch && !/^[A-Za-z0-9_-]+$/.test(arch)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid architecture "${arch}".`,
        null,
        startTime,
      );
    }

    const resolved = resolveScript("tizen-build-project");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error, null, startTime);
    }

    // The build scripts hand the SDK to Tizen CLI (`tizen package -t rpk`),
    // which parses <sdk>/sdk.info as strict KEY=VALUE lines and crashes on a
    // comment header or BOM. SDKs installed by older versions of this plugin
    // have exactly that, so repair the file before the script runs.
    const sdkInfoNote = describeSdkInfoRepair(repairSdkInfo(readSdkPath()));

    console.error(
      `[tizen-build] Building ${normalizedProjectPath} (-b ${normalizedType}${clean ? ", clean" : ""})...`,
    );

    let output;
    try {
      const winPath = normalizedProjectPath.replace(/\\/g, "/");
      const profileArgWin = signProfile ? ` -s "${signProfile}"` : "";
      const profileArgUnix = signProfile ? ` -s "${signProfile}"` : "";
      const archArgUnix = ` --arch="${arch}"`;
      const cleanArgWin = clean ? " -Clean" : "";
      const cleanArgUnix = clean ? " --clean" : "";
      output = execPluginScript(
        resolved.scriptPath,
        `-w "${winPath}" -b ${normalizedType}${profileArgWin}${cleanArgWin}`,
        `-w "${normalizedProjectPath}" -b ${normalizedType}${profileArgUnix}${archArgUnix}${cleanArgUnix}`,
      );
    } catch (error) {
      // Failure: the full log still goes to a file, but the envelope has to stand
      // on its own — the caller should never need to open a host file to find out
      // which file and line broke the build.
      const fullOutput = [error.stdout, error.stderr]
        .filter(Boolean)
        .join("\n");
      const logPath = saveBuildLog(fullOutput);
      const diagnostics = extractBuildDiagnostics(fullOutput);
      return formatError(
        command,
        "build_failed",
        formatBuildFailureMessage(
          `Build failed (exit ${error.status || "unknown"}).`,
          diagnostics,
          logPath,
        ),
        null,
        startTime,
        diagnostics,
      );
    }

    // Success validation: verify .tpk/.wgt/.rpk artifacts created/updated in this build
    // For platform (GBS) builds, also check ~/GBS-ROOT for output artifacts
    let artifacts = findBuildArtifacts(normalizedProjectPath, startTime);
    if (artifacts.length === 0) {
      // Check GBS output directory (~/GBS-ROOT) for platform builds
      const gbsRoot = path.join(os.homedir(), "GBS-ROOT");
      if (fs.existsSync(gbsRoot)) {
        artifacts = findBuildArtifacts(gbsRoot, startTime);
      }
    }
    if (artifacts.length === 0) {
      // Exit code 0 with no package usually means the toolchain reported the real
      // failure in its own log rather than through the exit status, so surface any
      // diagnostics here too instead of only pointing at the log file.
      const logPath = saveBuildLog(output);
      const diagnostics = extractBuildDiagnostics(output);
      return formatError(
        command,
        "build_failed",
        formatBuildFailureMessage(
          `Build script finished but no .tpk/.wgt/.rpk/.rpm artifact was produced under: ${normalizedProjectPath}.`,
          diagnostics,
          logPath,
        ),
        null,
        startTime,
        diagnostics,
      );
    }

    const warnings = summarizeBuildOutput(output);
    if (sdkInfoNote) warnings.push(sdkInfoNote);
    return formatProjectBuild(artifacts, warnings, startTime);
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to build project: ${error.message}`,
      null,
      startTime,
    );
  }
}

/**
 * Query template list: list available project templates from installed SDK
 *
 * Script output format (section header + indented template names):
 *   webapp:
 *     Basic
 *     WebService
 *
 * @param {string} [type] - project type (native, dotnet, webapp) — omit for all
 * @returns {object} Standard JSON Envelope — result.templates = { <type>: [names...] }
 */
async function listTemplates(type, command = "tizen-sdk list-templates") {
  const envelope = new Envelope(command);
  try {
    if (type && !VALID_PROJECT_TYPES.includes(type.toLowerCase())) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid type: ${type} (use: ${VALID_PROJECT_TYPES.join(", ")})`,
      );
    }

    const resolved = resolveScript("tizen-create-project");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    const winArgs = `-ListTemplates${type ? ` -Type ${type.toLowerCase()}` : ""}`;
    const unixArgs = `--list-templates${type ? ` --type=${type.toLowerCase()}` : ""}`;
    const output = execPluginScript(resolved.scriptPath, winArgs, unixArgs);

    // Debug: log raw script output to stderr for troubleshooting parse failures
    console.error(`[list-templates] Script output:\n${output}`);

    // Parsing: section headers like "webapp:" + indented lines are template names
    // Also recognizes "tv:" for Samsung TV templates and "platform:" for GBS-buildable sample apps
    const templates = {};
    let currentSection = null;
    for (const rawLine of output.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      const sectionMatch = line.match(
        /^(native|dotnet|webapp|rpk|tv|platform):\s*$/,
      );

      if (sectionMatch) {
        currentSection = sectionMatch[1];
        templates[currentSection] = [];
        continue;
      }
      if (currentSection && /^\s+\S/.test(line)) {
        templates[currentSection].push(line.trim());
      }
    }

    // Machine lines the script prints in list mode: the tz profile it listed
    // under and every profile section `tz list templates` knows about.
    const profile = ((output.match(/^PROFILE=(.*)$/m) || [])[1] || "").trim();
    const profiles = ((output.match(/^PROFILES=(.*)$/m) || [])[1] || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const totalCount = Object.values(templates).reduce(
      (n, list) => n + list.length,
      0,
    );
    if (!type && totalCount === 0) {
      return formatError(
        command,
        "template_not_found",
        `No templates found. Is the Tizen SDK installed? Run tizen-sdk-install first.`,
        null,
        envelope.startTime,
      );
    }

    // A requested type with no templates is a FAILURE, not `{webapp: []}` with
    // status success (issue #72): the agent read that success as "no templates
    // exist" and gave up on creating the app. Say what was looked at and why it
    // may be empty, so the next step is a fix, not a guess.
    if (type) {
      const key = type.toLowerCase();
      if (!templates[key] || templates[key].length === 0) {
        const where = profile ? ` under profile ${profile}` : "";
        const known = profiles.length
          ? ` Profiles known to tz: ${profiles.join(", ")}.`
          : "";
        const hints = {
          dotnet:
            "The Tizen .NET workload may be missing — run tizen-dotnet-setup, then retry.",
          tv: "The Samsung TV SDK extension is not installed — run tizen-tv-sdk-install, then retry.",
          platform:
            "No GBS platform sample apps ship with this plugin version.",
        };
        const hint =
          hints[key] ||
          `The platform package for${where || " that profile"} may be missing or incomplete — run tizen-platform-install (or tizen-update-package), then retry. ` +
            "Set TIZEN_TZ_PROFILE=<profile> to list under a different installed profile.";
        return formatError(
          command,
          "template_not_found",
          `No ${key} templates found in the installed SDK${where}.${known} ${hint}`,
          null,
          envelope.startTime,
          rawOutputTail(output),
        );
      }
    }

    return envelope.success({
      templates,
      ...(profile ? { profile } : {}),
    });
  } catch (error) {
    // execSync's message is "Command failed: <cmd>" plus stderr only, while the
    // script's real diagnostics ("Error: tz tool not found at …", "Possible
    // causes: …") are on stdout. Surface them — an envelope that only echoes
    // the command line sends the caller off to run `tz list templates` by hand
    // and invent an answer (issue #41).
    const scriptOutput = `${error.stdout || ""}\n${error.stderr || ""}`;
    // Prefer a hard error line; the custom-template sync warning is non-fatal
    // by design (a read-only SDK dir / Codex sandbox) and used to be picked as
    // THE diagnosis because it contained the word "failed" (issue #72).
    const lines = scriptOutput.split(/\r?\n/).map((line) => line.trim());
    const firstDiag =
      lines.find((line) => /^(Error:|\[ERROR\])/i.test(line)) ||
      lines.find(
        (line) =>
          /error|not found|failed|cannot/i.test(line) &&
          !/sync custom template/i.test(line),
      );
    const tzMissing = /tz tool not found/i.test(scriptOutput);
    return formatError(
      command,
      "execution_error",
      `Failed to list templates: ${firstDiag || error.message}`,
      tzMissing
        ? "node sdk-init-cli.js <tizen-sdk path>   # or tizen-sdk-install if the SDK is not installed"
        : null,
      envelope.startTime,
      rawOutputTail(scriptOutput),
    );
  }
}

/**
 * Extract only key lines from app install script stdout for envelope warnings
 *
 * Discard banners/section headers/success lines, keep only unique info not in result
 * (warnings, errors, failure reasons). Exclude "Device Serial:"/"App Package:"/"Found app ID:"
 * lines as they're redundant with result fields.
 *
 * @param {string} output - script stdout+stderr
 * @returns {string[]} warnings array (key lines only)
 */
function summarizeInstallOutput(output) {
  return summarizeOutput(output, {
    keep: /warn|error|fail|not found|missing|invalid|storage|exited|crash|disk/i,
    // APP_RUNNING is the machine channel parsed into app_running — repeating
    // it here would duplicate the finding into warnings.
    skip: /^(Device Serial:|App Package:|Found app ID:|APP_RUNNING=|Could not find app in app_launcher)/i,
    max: 10,
  });
}

/**
 * Parse the tri-state APP_RUNNING marker run_app() emits after a launch.
 *
 * The install scripts poll `app_launcher -S` (3 x 1s) and print exactly one
 * `APP_RUNNING=yes|no|unknown` line; the .ps1 side emits CRLF endings, which
 * a multiline `$` tolerates (`\r` is a LineTerminator in JS regexes).
 *
 * @param {string} output - script stdout+stderr
 * @returns {boolean|null} true = app verified alive, false = launched but
 *   vanished (the /opt-full signature), null = not verified (install-only,
 *   RPM path, -S unusable on this profile, old script).
 */
function parseAppRunning(output) {
  const m = String(output || "").match(/^APP_RUNNING=(yes|no|unknown)$/m);
  if (!m) return null;
  return m[1] === "yes" ? true : m[1] === "no" ? false : null;
}

/**
 * Install Tizen app package (.tpk/.wgt/.rpk/.rpm) on connected device/emulator
 *
 * Executes scripts/tizen-install-app: verify package → install with
 * tz install (for .tpk/.wgt), direct `sdb install` (for .rpk — tz install
 * accepts only tpk/wgt, and sdb's protocol result is inspected because its
 * exit code can be 0 on a device-side rejection), or sdb push + `rpm -ivh`
 * after `sdb root on` (for .rpm) → verify installation →
 * (optional) run with app_launcher (.tpk/.wgt) or as user `owner` via a
 * launcher script under /home/owner (.rpm; platform apps are not registered
 * with app_launcher). RPK is never launched.
 * If no connected device, script signals exit 1 and returns device_not_found
 * envelope — caller creates+launches an emulator via tizen-create-emulator and
 * tizen-launch-emulator, then retries.
 *
 * @param {string} packagePath - .tpk/.wgt/.rpk/.rpm absolute path (relative paths are resolved)
 * @param {string} [deviceSerial] - target device serial (omit to auto-select single connected)
 * @param {boolean} [runAfterInstall=false] - whether to run app after installation
 * @returns {object} Standard JSON Envelope
 */
async function installApp(
  packagePath,
  deviceSerial,
  runAfterInstall = false,
  command = "tizen-sdk install-app",
) {
  const startTime = Date.now();
  try {
    if (!packagePath) {
      return formatError(
        command,
        "invalid_parameters",
        "Missing required parameter: packagePath (.tpk, .wgt, .rpk, or .rpm)",
        'installApp("/absolute/path/MyApp-1.0.0.tpk")',
      );
    }

    const resolvedPath = path.resolve(packagePath);
    if (!fs.existsSync(resolvedPath)) {
      return formatError(
        command,
        "io_error",
        `App package not found: ${resolvedPath}`,
      );
    }
    if (!/\.(tpk|wgt|rpk|rpm)$/i.test(resolvedPath)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid app package: ${resolvedPath}. Must be a .tpk, .wgt, .rpk, or .rpm file.`,
      );
    }
    if (/\.rpk$/i.test(resolvedPath) && runAfterInstall) {
      return formatError(
        command,
        "invalid_parameters",
        "RPK resource packages cannot be launched. Install the package without --run so the resource package chain can refresh its associated applications.",
      );
    }

    // Allow only safe characters in shell args
    if (deviceSerial && !/^[A-Za-z0-9._:-]+$/.test(deviceSerial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device serial: ${deviceSerial}`,
      );
    }

    const resolved = resolveScript("tizen-install-app");
    if (resolved.error) {
      return formatError(command, "io_error", resolved.error);
    }

    console.error(
      `[tizen-install] Installing ${resolvedPath}${deviceSerial ? ` on ${deviceSerial}` : ""}`,
    );

    // Pass forward slash paths to Windows script (Node.js compatible)
    const winPath = resolvedPath.replace(/\\/g, "/");
    const winArgs =
      `-PackagePath "${winPath}"` +
      (deviceSerial ? ` -DeviceSerial "${deviceSerial}"` : "") +
      (runAfterInstall ? " -RunAfterInstall" : "");
    const unixArgs =
      `-p "${resolvedPath}"` +
      (deviceSerial ? ` -s "${deviceSerial}"` : "") +
      (runAfterInstall ? " -r" : "");

    let output;
    try {
      // captureViaTempFile required: if script's sdb call starts new sdb server daemon,
      // daemon inherits stdout pipe and execSync blocks forever.
      output = execPluginScript(resolved.scriptPath, winArgs, unixArgs, {
        captureViaTempFile: true,
      });
    } catch (error) {
      const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
      // exit 1 + "No devices found" = no device signal (script convention)
      if (/No devices found/i.test(combined)) {
        return formatError(
          command,
          "device_not_found",
          "No connected device or emulator. Use tizen-create-emulator to create a VM, then tizen-launch-emulator to launch it, then retry the install with its device_serial.",
          null,
          startTime,
        );
      }
      // Certificate/signing errors — the package was built without a valid signing profile
      if (
        /Invalid certificate chain|Check certificate error|certificate.*signature/i.test(
          combined,
        )
      ) {
        const detail = summarizeInstallOutput(combined).join(" | ");
        return formatError(
          command,
          "certificate_error",
          `App installation failed due to a certificate/signing error${detail ? ` — ${detail}` : ""}. The package was likely built without a signing profile. Use tizen-certificate-manager to generate an author cert and create a signing profile, then rebuild with tizen-build-project passing the profile name, and retry install.`,
          null,
          startTime,
        );
      }
      // Package ID too short — Tizen requires exactly 10 alphanumeric characters.
      // Shorter IDs cause "Load archive info fail" / "Operation not allowed [-4]".
      if (
        /Load archive info fail|Operation not allowed \[-4\]/i.test(combined)
      ) {
        return formatError(
          command,
          "invalid_package_id",
          'App installation failed with "Load archive info fail" / "Operation not allowed [-4]". ' +
            "This typically means the package ID is shorter than 10 characters. " +
            "Tizen requires exactly 10 alphanumeric characters for the package ID. " +
            'Recreate the project with an app name containing at least 10 alphanumeric characters (e.g., "MyTizenApp01"), then rebuild and retry install.',
          null,
          startTime,
        );
      }
      // RPK registration conflict — error -21. The device package-manager's
      // package_res_info table has PRIMARY KEY(res_type, res_version). The SDK
      // template hardcodes res-type="tizen.sample.resource" and res-version="1.5.0"
      // for all RPK projects, so a second RPK with the same values collides.
      // This is now fixed at project creation time (patchRpkManifestResType),
      // but older projects created before the fix may still hit this.
      if (
        /Register application error \[-21\]|key\[error\] val\[-21\]/i.test(
          combined,
        )
      ) {
        return formatError(
          command,
          "rpk_res_type_conflict",
          "RPK installation failed with error -21 (Register application error). " +
            "The device package-manager rejected the package because another RPK with the same res-type/res-version is already installed. " +
            'The SDK template hardcodes res-type="tizen.sample.resource" and res-version="1.5.0" for all RPK projects, ' +
            "and the device's package_res_info table has PRIMARY KEY(res_type, res_version). " +
            "Fix: uninstall the conflicting RPK (sdb shell pkgcmd -u -n <pkgid>), or recreate this project with the tizen-create-project skill " +
            "(which now patches res-type to the package ID, making each RPK unique), then rebuild and retry install.",
          null,
          startTime,
        );
      }
      const detail = summarizeInstallOutput(combined).join(" | ");

      return formatError(
        command,
        "io_error",
        `App installation failed: ${error.message}${detail ? ` — ${detail}` : ""}`,
        null,
        startTime,
      );
    }

    // The script prints this marker only on the exit-0 path — if it is missing
    // (or an install error line is present) treat the run as failed even when
    // the process exit code was 0, so a script bug can't report a false success.
    if (
      !/Installation completed successfully/i.test(output) ||
      /failed to install the package|\[ERROR\] Installation failed/i.test(
        output,
      )
    ) {
      const detail = summarizeInstallOutput(output).join(" | ");
      return formatError(
        command,
        "io_error",
        `App installation failed${detail ? `: ${detail}` : ""}`,
        null,
        startTime,
      );
    }

    // Success marker parsing (script must output on success)
    const serialMatch = output.match(/^Device Serial:\s*(.+)$/m);
    const appIdMatch = output.match(/^Found app ID:\s*(.+)$/m);
    const launched = /App launched successfully/i.test(output);

    // app_launched only proves launchpad accepted the launch; APP_RUNNING is
    // the script's post-launch verdict — app_launcher -S for tpk/wgt, a pgrep
    // poll of /usr/bin/<name> for rpm platform apps. true/false when the check
    // gave a clear answer, null when it could not be verified (install-only,
    // -S unusable on this profile, old script).
    const appRunning = parseAppRunning(output);

    const warnings = summarizeInstallOutput(output);
    // The /opt crash-dump advice is for app_launcher-managed apps; for rpm the
    // script already surfaces /tmp/<name>.log lines plus a display/library hint.
    if (appRunning === false && !/\.rpm$/i.test(resolvedPath)) {
      warnings.unshift(
        "App launched but exited immediately — check /opt disk space (sdb shell df -h /opt) and crash dumps at /opt/usr/share/crash/dump (cleanup requires 'sdb root on'; see the tizen-sdb-helper skill).",
      );
    }

    const envelope = new Envelope(command);
    envelope.startTime = startTime;
    return envelope.success(
      {
        package_path: resolvedPath,
        device_serial: serialMatch
          ? serialMatch[1].trim()
          : deviceSerial || null,
        app_id: appIdMatch ? appIdMatch[1].trim() : null,
        installation_status: "completed",
        app_launched: launched,
        app_running: appRunning,
      },
      {
        // Key lines only (warnings/errors) instead of full installation log
        warnings,
      },
    );
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Failed to install app: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  VALID_PROJECT_TYPES,
  validatePackageId,
  isPlatformProject,
  createProject,
  deleteProject,
  buildProject,
  listTemplates,
  installApp,
  // Exported for tests — the safety gate for deleteProject / createProject --force.
  isTizenProjectDir,
  // Exported for tests — the APP_RUNNING contract with the install scripts.
  parseAppRunning,
  // Exported for tests — the RPK res-type uniqueness patch.
  patchRpkManifestResType,
};
