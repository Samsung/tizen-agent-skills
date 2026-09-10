// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Response formatting helpers for each command
 * Requirements: REQ-SDK-OUT-001, REQ-SDK-OUT-002, REQ-SDK-OUT-003, REQ-SDK-OUT-004
 */

const { Envelope, ERROR_CODES } = require("./envelope");

/**
 * SDK initialization response formatting
 */
function formatSdkInit(sdkPath, configFile, command = "tizen-sdk sdk-init") {
  const envelope = new Envelope(command);
  return envelope.success({
    sdk_path: sdkPath,
    config_file: configFile,
  });
}

/**
 * SDK status query response formatting
 */
function formatSdkStatus(sdkPath, command = "tizen-sdk sdk-status") {
  const envelope = new Envelope(command);
  return envelope.success({
    sdk_path: sdkPath,
    configured: !!sdkPath,
  });
}

/**
 * SDK package installation response formatting
 *
 * @param {Array} packages - List of installed packages
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value).
 *   If passed, duration_ms reflects actual task time.
 *   If omitted, only formatting time (~0ms) is measured, so callers should always pass this value.
 */
function formatSdkInstall(
  packages,
  warnings = [],
  startTime,
  command = "tizen-sdk sdk-install",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Project creation response formatting
 */
function formatProjectCreate(
  projectPath,
  appType,
  profile,
  platformVersion,
  projectName,
  command = "tizen-sdk create-project",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    project_path: projectPath,
    app_type: appType,
    profile: profile,
    platform_version: platformVersion,
    project_name: projectName,
  });
}

/**
 * Project build response formatting
 *
 * @param {Array} artifacts - [{path, format, size}]
 * @param {Array} [warnings] - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value).
 *   If passed, duration_ms/build_time_ms reflects actual build time.
 */
function formatProjectBuild(
  artifacts,
  warnings = [],
  startTime,
  command = "tizen-sdk build-project",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      artifacts: artifacts.map((a) => ({
        path: a.path,
        format: a.format, // .tpk, .wgt
        size_bytes: a.size,
      })),
      build_time_ms: Date.now() - envelope.startTime,
    },
    { warnings },
  );
}

/**
 * Project install/run response formatting
 */
function formatProjectInstall(
  deviceId,
  appId,
  command = "tizen-sdk install-app",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    device_id: deviceId,
    app_id: appId,
    installation_status: "completed",
  });
}

function formatProjectRun(
  deviceId,
  appId,
  pid,
  command = "tizen-sdk install-app",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    device_id: deviceId,
    app_id: appId,
    process_id: pid,
  });
}

/**
 * Project template list response formatting
 */
function formatProjectList(templates, command = "tizen-sdk list-templates") {
  const envelope = new Envelope(command);
  return envelope.success({
    templates: templates || [],
  });
}

/**
 * Device list response formatting
 */
function formatDeviceList(devices, command = "tizen-sdk device-manager list") {
  const envelope = new Envelope(command);
  return envelope.success({
    devices: (devices || []).map((d) => ({
      device_id: d.device_id,
      device_name: d.device_name,
      status: d.status, // connected, disconnected, offline, online
      platform: d.platform,
      version: d.version,
      type: d.type, // emulator, usb
    })),
  });
}

/**
 * Device selection response formatting
 */
function formatDeviceSelect(
  deviceId,
  configFile,
  command = "tizen-sdk device-manager select",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    selected_device_id: deviceId,
    config_file: configFile,
  });
}

/**
 * Emulator list response formatting
 */
function formatEmulatorList(
  emulators,
  command = "tizen-sdk emulator-manager list",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    emulators: (emulators || []).map((e) => ({
      name: e.name,
      platform: e.platform,
      version: e.version,
      status: e.status, // stopped, running, error, launching
      resolution: e.resolution,
      ram_mb: e.ram_mb,
    })),
  });
}

/**
 * Emulator creation response formatting
 */
function formatEmulatorCreate(
  name,
  platform,
  version,
  command = "tizen-sdk create-emulator",
) {
  const envelope = new Envelope(command);
  return envelope.success({
    emulator_name: name,
    platform: platform,
    version: version,
    status: "created",
  });
}

/**
 * Emulator start/stop/delete response formatting
 */
function formatEmulatorAction(
  action,
  name,
  command = `tizen-sdk emulator-manager ${action}`,
) {
  const envelope = new Envelope(command);
  return envelope.success({
    emulator_name: name,
    action: action,
    status: "completed",
  });
}

/**
 * Disk space check response formatting
 *
 * @param {object} diskInfo - { path, total_bytes, free_bytes, used_bytes, total_gb, free_gb, required_gb, sufficient }
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatDiskSpace(
  diskInfo,
  startTime,
  command = "tizen-sdk check-disk-space",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success({
    path: diskInfo.path,
    total_bytes: diskInfo.total_bytes,
    free_bytes: diskInfo.free_bytes,
    used_bytes: diskInfo.used_bytes,
    total_gb: diskInfo.total_gb,
    free_gb: diskInfo.free_gb,
    required_gb: diskInfo.required_gb,
    sufficient: diskInfo.sufficient,
    // Which probe measured the drive (statfs / powershell / fsutil / wmic / df)
    ...(diskInfo.source ? { source: diskInfo.source } : {}),
  });
}

/**
 * TV SDK package installation response formatting
 *
 * @param {Array} packages - List of installed packages
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatTvSdkInstall(
  packages,
  warnings = [],
  startTime,
  command = "tizen-sdk tv-sdk-install",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Package update response formatting
 *
 * @param {Array} packages - List of package update results [{name, old_version, new_version, status}]
 * @param {object} summary - { total, updated, skipped, failed, up_to_date }
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatPackageUpdate(
  packages,
  summary,
  warnings = [],
  startTime,
  command = "tizen-sdk update-package",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      summary: summary || {
        total: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        up_to_date: 0,
      },
      update_status: "completed",
    },
    { warnings },
  );
}

/**
 * SDK repository information response formatting
 *
 * @param {string|null} currentRepo - Current repository URL from repository.info (null if not configured)
 * @param {Array} repositories - Array of repository metadata objects
 * @param {number} [startTime] - Task start time
 */
function formatRepoInfo(
  currentRepo,
  repositories,
  startTime,
  warnings = [],
  command = "tizen-sdk sdk-repo-info",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      current_repository: currentRepo,
      repositories: repositories || [],
    },
    { warnings },
  );
}

/**
 * Emulator package download response formatting
 *
 * @param {Array} packages - List of installed packages [{name, status, version}]
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatEmulatorPackageDownload(
  packages,
  warnings = [],
  startTime,
  command = "tizen-sdk download-emulator-package",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Custom package repository URL validation response formatting
 *
 * @param {string} repoUrl - normalized repository URL that was validated
 * @param {string} pkgListFile - the pkg_list file that was found (e.g. "pkg_list_ubuntu-64")
 * @param {string} pkgListUrl - full URL of the found pkg_list file
 * @param {Array} probed - every candidate URL that was probed, in order
 * @param {number} [startTime] - Task start time (Date.now() value)
 * @param {Array} [warnings] - Array of warning messages
 */
function formatRepoUrlValidation(
  repoUrl,
  pkgListFile,
  pkgListUrl,
  probed,
  startTime,
  warnings = [],
) {
  const envelope = new Envelope("tizen-sdk validate-repo-url");
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      repository_url: repoUrl,
      valid: true,
      pkg_list_file: pkgListFile,
      pkg_list_url: pkgListUrl,
      probed_urls: probed || [],
    },
    { warnings },
  );
}

/**
 * Platform package installation response formatting
 *
 * @param {Array} packages - List of installed packages [{name, status, version}]
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatPlatformInstall(
  packages,
  warnings = [],
  startTime,
  command = "tizen-sdk platform-install",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Mobile platform package download response formatting
 *
 * @param {Array} packages - List of installed packages [{name, status, version}]
 * @param {boolean} iotHeadedInstalled - Whether IOT-Headed extension was installed
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatMobilePlatformDownload(
  packages,
  iotHeadedInstalled = false,
  warnings = [],
  startTime,
  command = "tizen-sdk download-mobile-platform",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      iot_headed_installed: iotHeadedInstalled,
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Custom-repository SDK installation response formatting
 *
 * Same shape as formatSdkInstall plus the repository the packages came from, so
 * a caller can tell WHICH repository an install was served by.
 *
 * @param {Array} packages - List of installed packages
 * @param {string} repoUrl - repository URL the install used
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatCustomRepoInstall(packages, repoUrl, warnings = [], startTime) {
  const envelope = new Envelope("tizen-sdk sdk-install-custom-repo");
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      packages: packages || [],
      repository_url: repoUrl,
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * Custom rootstrap installation response formatting
 *
 * @param {Array} rootstraps - List of installed rootstraps [{profile, version, architecture, xml_file}]
 * @param {string} structureType - ZIP structure type (data/ or tizen-studio/)
 * @param {Array} warnings - Array of warning messages
 * @param {number} [startTime] - Task start time (Date.now() value)
 */
function formatRootstrapInstall(
  rootstraps,
  structureType,
  warnings = [],
  startTime,
  command = "tizen-sdk install-rootstrap",
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  return envelope.success(
    {
      rootstraps: rootstraps || [],
      structure_type: structureType,
      installation_status: "completed",
    },
    { warnings },
  );
}

/**
 * SDK path not set error response
 */
function formatSdkPathNotSet(command = "tizen-sdk sdk-init") {
  const envelope = new Envelope(command);
  return envelope.failure({
    ...ERROR_CODES.SDK_PATH_NOT_SET,
    message:
      'Tizen SDK path is not configured. Run "tizen-sdk sdk-init --sdk-path <path>" first.',
  });
}

/**
 * Device not found error response
 */
function formatDeviceNotFound(command = "tizen-sdk install-app") {
  const envelope = new Envelope(command);
  return envelope.failure({
    ...ERROR_CODES.DEVICE_NOT_FOUND,
    message: "No connected device or emulator found.",
  });
}

/**
 * Generic error response (reusable)
 *
 * @param {string} command - Command name
 * @param {string} errorCategory - Error classification (for ERROR_CODES matching)
 * @param {string} message - Human-readable message
 * @param {string|{command: string, background_command?: string}} [suggestedCommand]
 *   Suggested recovery command. The object form carries a second rendering of
 *   the same fix for harnesses that cannot run it in the foreground (Codex CLI:
 *   `background_command` detaches it through job-cli.js and is polled).
 * @param {number} [startTime] - Task start time (Date.now() value).
 *   If passed, duration_ms reflects actual task time (same convention as formatSdkInstall).
 */
function formatError(
  command,
  errorCategory,
  message,
  suggestedCommand = null,
  startTime,
  details = null,
) {
  const envelope = new Envelope(command);
  if (typeof startTime === "number") {
    envelope.startTime = startTime;
  }
  const errorDef = ERROR_CODES[
    Object.keys(ERROR_CODES).find(
      (k) => ERROR_CODES[k].error_category === errorCategory,
    )
  ] || {
    error_code: "TIZEN_SDK_UNKNOWN_E001",
    error_category: errorCategory,
  };

  const fixFields =
    suggestedCommand && typeof suggestedCommand === "object"
      ? Object.fromEntries(
          Object.entries(suggestedCommand).filter(([, v]) => v != null),
        )
      : suggestedCommand
        ? { command: suggestedCommand }
        : null;

  return envelope.failure({
    error_code: errorDef.error_code,
    error_category: errorDef.error_category,
    message,
    details,
    suggested_fix:
      fixFields && fixFields.command
        ? {
            ...fixFields,
            auto_fixable: false,
            // A per-call command overrides the registry default, but the guide
            // URL registered for this error category still applies — keep it.
            ...(errorDef.suggested_fix && errorDef.suggested_fix.guide_url
              ? { guide_url: errorDef.suggested_fix.guide_url }
              : {}),
          }
        : errorDef.suggested_fix,
  });
}

module.exports = {
  // SDK commands
  formatSdkInit,
  formatSdkStatus,
  formatSdkInstall,
  formatRootstrapInstall,

  // Project commands
  formatProjectCreate,
  formatProjectBuild,
  formatProjectInstall,
  formatProjectRun,
  formatProjectList,

  // Device commands
  formatDeviceList,
  formatDeviceSelect,

  // Emulator commands
  formatEmulatorList,
  formatEmulatorCreate,
  formatEmulatorAction,

  // Error formatting
  formatSdkPathNotSet,
  formatDeviceNotFound,
  formatError,

  // Disk space
  formatDiskSpace,

  // TV SDK installation
  formatTvSdkInstall,

  // Package update
  formatPackageUpdate,

  // Repository info
  formatRepoInfo,

  // Emulator package download
  formatEmulatorPackageDownload,

  // Custom package repository
  formatRepoUrlValidation,
  formatCustomRepoInstall,

  // Platform package installation
  formatPlatformInstall,

  // Mobile platform package download
  formatMobilePlatformDownload,

  // Utilities
  Envelope,
  ERROR_CODES,
};
