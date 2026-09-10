// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * SDK command entry point (aggregator)
 *
 * This file re-exports public functions from domain modules (sdk / project / device / dotnet / debug / preflight).
 * Existing call sites (CLI runners, tests, docs) can continue to require('../core/sdk-commands') to get the same functions.
 *
 * Domain modules:
 *   - core/sdk.js       : SDK init/status/install, TV SDK, installation status check, path config
 *   - core/project.js   : Project create/build/template list/app install
 *   - core/device.js    : Device connection/emulator fallback
 *   - core/dotnet.js    : .NET development environment setup
 *   - core/debug.js     : Native(GDB)/DotNET(netcoredbg) remote debugging setup
 *   - core/webapp-debug.js : Web app (wgt) RWI/CDP remote debugging setup
 *   - core/playwright-test.js : Web app (wgt) Playwright test run/scaffold over CDP
 *   - core/preflight.js : Node.js/disk space pre-flight checks
 *
 * Example usage:
 * ```
 * const sdkCmd = require('./sdk-commands');
 * const result = await sdkCmd.initSdk('/opt/tizen-studio');
 * console.log(JSON.stringify(result));
 * ```
 */

const sdk = require("./sdk");
const project = require("./project");
const device = require("./device");
const dotnet = require("./dotnet");
const debug = require("./debug");
const webappDebug = require("./webapp-debug");
const playwrightTest = require("./playwright-test");
const preflight = require("./preflight");
const sdbHelper = require("./sdb-helper");
const screenshot = require("./screenshot");
const fileTransfer = require("./file-transfer");
const remoteDevice = require("./remote-device");
const certificate = require("./certificate");
const samsungCert = require("./samsung-cert");
const samsungAuth = require("./samsung-auth");
const samsungPwdStore = require("./samsung-pwd-store");
const emulator = require("./emulator");
const dlogAnalyzer = require("./dlog-analyzer");
const { formatError, Envelope } = require("../envelope/response-formatter");

module.exports = {
  // sdk
  initSdk: sdk.initSdk,
  getSdkStatus: sdk.getSdkStatus,
  installSdk: sdk.installSdk,
  installSdkFromRepo: sdk.installSdkFromRepo,
  validateRepoUrl: sdk.validateRepoUrl,
  normalizeRepoUrl: sdk.normalizeRepoUrl,
  readInstalledRepository: sdk.readInstalledRepository,
  installTvSdk: sdk.installTvSdk,
  installTvSdkFromZip: sdk.installTvSdkFromZip,
  updatePackage: sdk.updatePackage,
  downloadEmulatorPackage: sdk.downloadEmulatorPackage,
  installPlatform: sdk.installPlatform,
  readSdkPath: sdk.readSdkPath,
  getRepoInfo: sdk.getRepoInfo,
  downloadMobilePlatform: sdk.downloadMobilePlatform,
  installRootstrap: sdk.installRootstrap,

  checkSdkInstallStatus: sdk.checkSdkInstallStatus,
  repairSdkInfo: sdk.repairSdkInfo,
  describeSdkInfoRepair: sdk.describeSdkInfoRepair,
  checkSdkInstallationViaScript: sdk.checkSdkInstallationViaScript,
  checkIfSdkAlreadyInstalled: sdk.checkIfSdkAlreadyInstalled,
  CONFIG_FILE: sdk.CONFIG_FILE,
  DEFAULT_SDK_PATH: sdk.DEFAULT_SDK_PATH,

  // project
  createProject: project.createProject,
  deleteProject: project.deleteProject,
  buildProject: project.buildProject,
  listTemplates: project.listTemplates,
  installApp: project.installApp,

  // device
  manageDevice: device.manageDevice,

  // dotnet
  setupDotnet: dotnet.setupDotnet,

  // debug
  setupGdbDebug: debug.setupGdbDebug,
  setupDotnetDebug: debug.setupDotnetDebug,
  setupWebappDebug: webappDebug.setupWebappDebug,

  // test (Playwright over CDP, web apps only)
  runPlaywrightTest: playwrightTest.runPlaywrightTest,
  scaffoldPlaywrightTest: playwrightTest.scaffoldPlaywrightTest,

  // preflight
  checkDiskSpace: preflight.checkDiskSpace,
  checkNode: preflight.checkNode,

  // sdb-helper
  runSdbCommand: sdbHelper.runSdbCommand,

  // screenshot
  captureScreenshot: screenshot.captureScreenshot,

  // file transfer
  fileTransfer: fileTransfer.fileTransfer,

  // remote device (network scan / connect / disconnect / list)
  scanRemoteDevices: remoteDevice.scanRemoteDevices,
  connectRemoteDevice: remoteDevice.connectRemoteDevice,
  disconnectRemoteDevice: remoteDevice.disconnectRemoteDevice,
  listRemoteDevices: remoteDevice.listRemoteDevices,
  addRemoteDeviceToList: remoteDevice.addRemoteDeviceToList,
  removeRemoteDeviceFromList: remoteDevice.removeRemoteDeviceFromList,
  editRemoteDeviceInList: remoteDevice.editRemoteDeviceInList,
  listSavedRemoteDevices: remoteDevice.listSavedRemoteDevices,

  // certificate manager (Tizen local certs / signing profiles)
  generateAuthorCertificate: certificate.generateAuthorCertificate,
  listDistributorCertificates: certificate.listDistributorCertificates,
  createSigningProfile: certificate.createSigningProfile,
  listSigningProfiles: certificate.listSigningProfiles,
  setActiveSigningProfile: certificate.setActiveSigningProfile,
  removeSigningProfile: certificate.removeSigningProfile,
  setSigningProfileDistributor2: certificate.setSigningProfileDistributor2,
  importCertificate: certificate.importCertificate,
  inspectCertificate: certificate.inspectCertificate,
  getCertificateSdkDataPath: certificate.getCertificateSdkDataPath,

  // certificate manager (Samsung online-CA certs)
  generateSamsungAuthorCertificate:
    samsungCert.generateSamsungAuthorCertificate,
  generateSamsungDistributorCertificate:
    samsungCert.generateSamsungDistributorCertificate,
  importSamsungCertificate: samsungCert.importSamsungCertificate,
  createSamsungProfile: samsungCert.createSamsungProfile,
  cancelSamsungCertificateGeneration:
    samsungCert.cancelSamsungCertificateGeneration,
  parseDuidList: samsungCert.parseDuidList,
  importDuidsFromFile: samsungCert.importDuidsFromFile,
  acquireDuidFromDevice: samsungCert.acquireDuidFromDevice,
  acquireDuidsFromAllDevices: samsungCert.acquireDuidsFromAllDevices,

  // Standalone Samsung Account login. Wrapped so it returns a JSON Envelope like
  // every other command: the raw token object has no `status` field, which the
  // harness reports as a failure with no errors.
  getSamsungAccessToken: async (profileName) => {
    const COMMAND = "tizen-sdk certificate-manager samsung-login";
    const startTime = Date.now();
    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }
    try {
      const auth = await samsungAuth.getSamsungAccessToken(profileName);
      const envelope = new Envelope(COMMAND);
      envelope.startTime = startTime;
      return envelope.success({
        profile_name: profileName,
        user_id: auth.userId,
        user_email: auth.email,
        auth_source: auth.source,
        validity_period_s: auth.validityPeriod,
      });
    } catch (error) {
      const message = error.message || String(error);
      let category = "samsung_auth_failed";
      if (message.includes("samsung_auth_timeout"))
        category = "samsung_auth_timeout";
      else if (message.includes("samsung_auth_port_unavailable"))
        category = "samsung_auth_port_unavailable";
      else if (message.includes("samsung_auth_invalid_response"))
        category = "samsung_auth_invalid_response";
      return formatError(COMMAND, category, message, null, startTime);
    }
  },

  // Decrypt the stored certificate password for a Samsung profile.
  getSamsungCertificatePassword: async (profileName) => {
    const COMMAND = "tizen-sdk certificate-manager samsung-reveal-password";
    const startTime = Date.now();
    if (!profileName) {
      return formatError(
        COMMAND,
        "invalid_parameters",
        "Profile name is required (--profile-name).",
      );
    }

    const path = require("path");
    const fs = require("fs");
    const { resolveSdkDataPath } = require("./sdb");

    const resolved = resolveSdkDataPath();
    if (resolved.error) {
      return formatError(
        COMMAND,
        "sdk_path_not_set",
        resolved.error,
        null,
        startTime,
      );
    }

    const pwdPath = path.join(
      resolved.dataPath,
      "keystore",
      "samsung",
      profileName,
      "author.pwd",
    );
    if (!fs.existsSync(pwdPath)) {
      return formatError(
        COMMAND,
        "profile_not_found",
        `No stored password for Samsung profile "${profileName}" (expected "${pwdPath}").`,
        null,
        startTime,
      );
    }

    try {
      const password = await samsungPwdStore.decryptPassword(pwdPath);
      const envelope = new Envelope(COMMAND);
      envelope.startTime = startTime;
      return envelope.success({
        profile_name: profileName,
        pwd_path: pwdPath,
        password,
      });
    } catch (error) {
      return formatError(
        COMMAND,
        "samsung_pwd_store_failed",
        error.message || String(error),
        null,
        startTime,
      );
    }
  },

  // emulator (full em-cli surface: create/delete/launch/list/detail/modify/reset/create-image)
  manageEmulator: emulator.manageEmulator,
  createEmulator: emulator.createEmulator,
  launchEmulator: emulator.launchEmulator,

  // dlog analyzer (background dlog monitoring for crash/exception detection)
  startDlogAnalyzer: dlogAnalyzer.startDlogAnalyzer,
  stopDlogAnalyzer: dlogAnalyzer.stopDlogAnalyzer,
  checkDlogAnalyzer: dlogAnalyzer.checkDlogAnalyzer,
  statusDlogAnalyzer: dlogAnalyzer.statusDlogAnalyzer,
  launchApp: dlogAnalyzer.launchApp,
  terminateApp: dlogAnalyzer.terminateApp,
  collectAppLogs: dlogAnalyzer.collectAppLogs,
  stopCollectAppLogs: dlogAnalyzer.stopCollectAppLogs,
  analyzeErrors: dlogAnalyzer.analyzeErrors,
};
