// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// eslint.config.mjs — repo-wide flat config (ESLint 9).
// Layers: ignores -> JS recommended -> CJS/.js -> ESM/.mjs -> TS -> per-package
// accommodations -> prettier (last, disables conflicting stylistic rules).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      // Sample Tizen app + its Debug build copy (browser/tizen globals)
      "usage/**",
      // SDK project templates scaffolded into user projects (browser/tizen globals)
      "common/scripts/tizen-create-project/templates/**",
      // Prebuilt binaries only, but keep it excluded defensively
      "common/tools/**",
      // Generated at build time by vscode/esbuild.config.js
      "vscode/assets/**",
      // Tool-generated dot-dirs (gitignored, but ESLint does not read .gitignore)
      ".workspace_rag/**",
      ".code2spec-tools/**",
      ".claude/**",
      ".codex/**",
      ".wolf/**",
    ],
  },

  js.configs.recommended,

  // All plain .js in this repo is CommonJS (common/lib/**, both esbuild.config.js).
  // Flat config defaults .js to sourceType "module", so this block is required.
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // True-ESM files (tests/runner.mjs, tests/scripts/*.mjs, this config file)
  {
    files: ["**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // TypeScript (tizen-cli/src, vscode/src) — non-type-aware on purpose
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.ts"] })),

  // Repo-wide rule adjustments
  {
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // tizen-cli: CJS-output bundle, tsconfig strict:false, uses
  // `import pkg = require(...)` intentionally — recommended's
  // no-require-imports would flag it.
  {
    files: ["tizen-cli/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // vscode: pre-existing `any` usage around JSON/settings plumbing — keep
  // visible as warnings without blocking the lint gate.
  {
    files: ["vscode/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Must be last: turn off rules that conflict with Prettier
  prettier,
);
