// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Aggregates the per-domain command specs into the single COMMAND_SPECS list
 * consumed by commands.ts. To add a command, append a spec to the matching
 * domain module (or add a new domain module and spread it here).
 *
 * Naming convention for NEW commands: domain-action — "<domain>-<action>"
 * (e.g. "project-create", "app-install"). Existing action-domain names
 * (create-project, build-project, list-templates, install-app,
 * update-package, ...) are part of the public interface — docs, SKILL.md
 * files, user scripts, and MCP tool names (derived from command names by
 * the schema generator) all depend on them — so they are kept as-is and
 * must not be renamed casually.
 */

import { CommandSpec } from "./types";
import { SDK_SPECS } from "./sdk";
import { CHECK_SPECS } from "./check";
import { PROJECT_SPECS } from "./project";
import { DEVICE_SPECS } from "./device";
import { DEBUG_SPECS } from "./debug";
import { TEST_SPECS } from "./test";
import { CERTIFICATE_SPECS } from "./certificate";
import { DLOG_ANALYZER_SPECS } from "./dlog-analyzer";

export type { CommandSpec, OptionSpec } from "./types";

export const COMMAND_SPECS: CommandSpec[] = [
  ...SDK_SPECS,
  ...CHECK_SPECS,
  ...PROJECT_SPECS,
  ...DEVICE_SPECS,
  ...DEBUG_SPECS,
  ...TEST_SPECS,
  ...CERTIFICATE_SPECS,
  ...DLOG_ANALYZER_SPECS,
];
