# tizen-sdk Plugin Build & Install Guide

English | [한국어](build-and-install.md)

This document describes how to build the tizen-sdk plugin (tizen-cli harness) from source and install it into tizen-cli.

## Prerequisites

- **Node.js 18+** — Download from [https://nodejs.org](https://nodejs.org)
- **pnpm** — If not installed: `npm install -g pnpm`
- **tizen-cli** (optional) — the separately distributed tizen-cli host CLI (see its own installation guide). Without it, run the plugin through the standalone launcher described in step 5.

## 1. Clone the Repository

```bash
git clone https://github.com/Samsung/tizen-agent-skills.git
cd tizen-agent-skills/tizen-sdk-skills
```

## 2. Build

```bash
cd tizen-cli
pnpm install
pnpm build
```

After the build completes, the following files are generated in the `dist/` directory:

- `dist/tizen-sdk.js` — Bundled plugin entry point (via esbuild)
- `dist/plugin.json` — Plugin metadata (commands array auto-generated)
- `dist/scripts/` — Platform scripts (.ps1 / .sh)
- `dist/skills/` — SKILL.md files
- `dist/bin/tizen-sdk.js` — Standalone launcher (runs the bundle without the tizen-cli host)

## 3. Install the Plugin

### First-time Installation

```bash
tizen-cli plugin install ./dist
```

### Reinstall (Already Installed)

```bash
tizen-cli plugin uninstall tizen-sdk
tizen-cli plugin install ./dist
```

> **Note:** After modifying code, always run `pnpm build` first, then reinstall the plugin.

## 4. Verify Installation

```bash
tizen-cli tizen-sdk --capabilities
```

If installed successfully, the list of available commands is displayed:

```json
{
  "status": "success",
  "result": {
    "available": [
      "sdk-init",
      "sdk-install",
      "sdk-install-custom-repo",
      "validate-repo-url",
      "tv-sdk-install",
      "tv-sdk-install-from-zip",
      "update-package",
      "sdk-repo-info",
      "download-emulator-package",
      "dotnet-setup",
      "check-node",
      "check-disk-space",
      "project-delete",
      "create-project",
      "list-templates",
      "build-project",
      "create-emulator",
      "launch-emulator",
      "emulator-manager",
      "device-manager",
      "install-app",
      "sdb-helper",
      "screenshot",
      "file-transfer",
      "remote-device",
      "gdb-debug",
      "dotnet-debug",
      "webapp-debug",
      "playwright-test",
      "certificate-manager"
    ],
    "unavailable": []
  },
  "warnings": [],
  "errors": []
}
```

> On a machine where the Tizen SDK is not installed yet, SDK-dependent commands
> are listed under the `unavailable` array instead — only commands that work
> without the SDK (`sdk-init`, `check-node`, ...) appear in `available`.

## 5. Run Without the tizen-cli Host (Standalone)

If tizen-cli is not installed, the launcher in `bin/` runs the same bundle
directly. It calls the plugin's `run(args)` and exits `0` on success, `1` on
failure; the output is the same JSON envelope.

```bash
cd tizen-cli
node bin/tizen-sdk.js --capabilities        # same output as step 4
node bin/tizen-sdk.js check-node

pnpm add -g .                               # optional: `tizen-sdk` on PATH
tizen-sdk --doctor

node dist/bin/tizen-sdk.js --schema         # from a release ZIP (dist/ only)
```

Before `pnpm build` the launcher reports `PLUGIN_NOT_BUILT` with the build
command in `suggested_fix.command`. See
[tizen-cli/README.md](../../tizen-cli/README.md#standalone-use-without-the-tizen-cli-host).

## Troubleshooting

| Issue | Solution |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | Ensure `pnpm-workspace.yaml` exists (allows esbuild postinstall) |
| `pnpm: command not found` | Install with `npm install -g pnpm` |
| `ERR_PNPM_LINK_BAD_PARAMS` (from `pnpm link --global`) | Recent pnpm removed `pnpm link --global`. Run `pnpm add -g .` inside `tizen-cli/` (undo: `pnpm remove -g tizen-cli-plugin-tizen-sdk`) |
| `tizen-sdk: command not found` (after `pnpm add -g .`) | pnpm's global bin directory is not on PATH. Run `pnpm setup` and restart the shell |
| `tizen-cli: command not found` | Ensure tizen-cli is on PATH, or use the standalone launcher (`node bin/tizen-sdk.js …`) |
| `PLUGIN_NOT_BUILT` from the launcher | Run `pnpm build` in `tizen-cli/` first |
| Changes not reflected after rebuild | Run `tizen-cli plugin uninstall tizen-sdk` then reinstall |
