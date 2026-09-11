# tizen-sdk Plugin Build & Install Guide

English | [한국어](build-and-install.md)

This document describes how to build the tizen-sdk plugin (tizen-cli harness) from source and install it into tizen-cli.

## Prerequisites

- **Node.js 18+** — Download from [https://nodejs.org](https://nodejs.org)
- **pnpm** — If not installed: `npm install -g pnpm`
- **tizen-cli** — the separately distributed tizen-cli host CLI (see its own installation guide)

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

## Troubleshooting

| Issue | Solution |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | Ensure `pnpm-workspace.yaml` exists (allows esbuild postinstall) |
| `pnpm: command not found` | Install with `npm install -g pnpm` |
| `tizen-cli: command not found` | Ensure tizen-cli is on PATH |
| Changes not reflected after rebuild | Run `tizen-cli plugin uninstall tizen-sdk` then reinstall |
