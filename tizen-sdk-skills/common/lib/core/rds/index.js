// SPDX-FileCopyrightText: 2026 Samsung Electronics Co., Ltd.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * RDS core library — public entry point.
 *
 * `project.js` is the only consumer outside this folder, and it only ever
 * needs the functions below (see docs/rds/RDS_FAST_DEPLOY_PLAN.en.md Parts 1 & 2).
 * Everything else under `rds/` — hashing, scanning internals, state-file
 * plumbing, reconcile, path resolution, launch — is wiring consumed by
 * `deploy-service.js` and friends, not by `project.js` directly, so it is
 * deliberately left off this surface. Reach into the specific submodule if
 * a new caller ever needs one of those.
 *
 * @module core/rds
 */

const { detectAppType } = require("./app-type-detector");
const {
  rdsStateExists,
  saveBuildManifest,
  resetAllRdsState,
} = require("./state-manager");
const { scanInputFilesAsync } = require("./input-scanner");
const { scanOutputFilesAsync } = require("./output-scanner");
const { tryRdsDeploy, updateRdsState } = require("./deploy-service");
const { parseWebAppId, parseManifestAppId } = require("./app-install-path");

module.exports = {
  detectAppType,
  rdsStateExists,
  saveBuildManifest,
  resetAllRdsState,
  scanInputFilesAsync,
  scanOutputFilesAsync,
  tryRdsDeploy,
  updateRdsState,
  // Cheap (no device query) app-ID lookup for the RDS install path's
  // `app_id` field — the same launchable ID (`<pkgid>.<Name>` for web,
  // `appid` for native/dotnet) the full-install path reads back from
  // `app_launcher -l`, so consumers see one meaning regardless of
  // deploy_type. installApp() already has appType from detectAppType().
  parseWebAppId,
  parseManifestAppId,
};
