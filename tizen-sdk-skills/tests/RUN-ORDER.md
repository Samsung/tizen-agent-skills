# Test Run Order (safe → mutating → device)

English | [한국어](RUN-ORDER.ko.md)

Running `node runner.mjs` with no options executes all 286 TCs in readdir (alphabetical)
order. The mutating and device tiers cannot pass in that order on any host: the debug TCs run
before any emulator exists, `test-vm` is created three times, and build TCs run before the
project they build has been created. Follow the per-tier order below.

Run every command from the `tests/` directory.

| Tier | Driver | Duration | Side effects |
| --- | --- | --- | --- |
| safe | `runner.mjs --tier=safe` | ~1 min | None (only `sdk-init.explicit-path` writes `~/.tizen.sdk.path.config`) |
| mutating | `scripts/run-mutating-tier.mjs` | ~5 min (60-90 min with installers) | keystore, profile fixtures, project scratch dir |
| device | `scripts/run-device-tier.mjs` | ~20 min | deletes/recreates `test-vm` and `tv-vm`, stops every emulator, network scan, rewrites and restores the bookmark file |

---

## 0. Common preparation (once)

```bash
cd tizen-cli && pnpm build && cd ../tests
```

- The preflight of both drivers (mutating, device) refuses to start when `dist/tizen-sdk.js` is
  older than `common/lib`, `common/scripts` or `tizen-cli/src`. Rebuild after touching those
  trees or after a `git pull`.
- The preflight also runs `tizen-sdk --doctor`. Fix any failing check first.
- To validate only the YAML schema:

```bash
npm run lint          # = runner.mjs --dry-run + doc statistics check + helper unit tests
```

---

## 1. safe tier

```bash
node runner.mjs --tier=safe --status=approved
```

- The CI gate (`.github/workflows/ci.yml`) adds `--skip-requires=sdk,net` for hosts without an
  SDK or network. Locally you have an SDK, so it can be omitted.
- The `sdk-init.explicit-path` TC overwrites `~/.tizen.sdk.path.config`. Redirect `HOME`
  (`USERPROFILE` on Windows) to a throwaway directory if that matters.
- Alias: `npm run test:safe` (no status filter).

---

## 2. mutating tier

### 2-1. Prerequisites

- `fixtures/profiles/*.xml` must have **no uncommitted changes**. The driver backs up and
  restores these files during the run and refuses to start if they are locally modified.
  To revert:

```bash
git checkout -- fixtures/profiles/
```

### 2-2. Run

```bash
node scripts/prepare-device-fixtures.mjs --only=tmp,projects,rootstrap   # scratch dirs, rootstrap ZIP, signing profile myProfile
node scripts/run-mutating-tier.mjs            # preflight + print the plan, change nothing
node scripts/run-mutating-tier.mjs --yes      # run (~5 min)
```

Aliases: `npm run prepare:mutating`, `npm run test:mutating` (plan only; add `--yes` yourself).

### 2-3. Phases

| Phase | Content | Default run |
| --- | --- | --- |
| `s1-sdk-idempotent` | Already-installed short-circuit of the SDK installers (no download) | yes |
| `k1-cert-readonly` | list-profiles, list-distributors, inspect-certificate | yes |
| `k2-cert-keystore` | generate-author ×3, import-certificate ×2 (hook `cleanKeystore`) | yes |
| `k3-cert-profiles` | create/set-active/remove-profile (hook `resetProfileFixtures`) | yes |
| `p1-projects` | create-project → build-project → project-delete (hook `resetProjectsDir`) | yes |
| `s2-sdk-installers` | Real SDK / platform / emulator package installs into a throwaway HOME (60-90 min, ~10 GB) | `--with-installers` |
| `s3-dotnet-workload` | `dotnet-setup --force` (adds the workload to the real dotnet install) | `--with-installers` |

### 2-4. Options

```bash
node scripts/run-mutating-tier.mjs --yes --phase=k3-cert-profiles        # one phase (its hooks still run)
node scripts/run-mutating-tier.mjs --yes --include-drafts                # also run draft TCs (promotion run)
node scripts/run-mutating-tier.mjs --yes --with-installers               # include s2/s3
node scripts/run-mutating-tier.mjs --yes --with-installers --keep-scratch-sdk   # keep the scratch SDK for triage
node scripts/run-mutating-tier.mjs --restore-user-env=<scratch>/user-env.json   # after a killed installer run: restore User Path/TIZEN_SDK_PATH only
```

The canonical order lives in `policy/mutating-run-order.yaml`.

---

## 3. device tier

### 3-1. Prerequisites

- **No emulator may be running.** The driver stops every running emulator, and with two
  online at once the TCs fail with `multiple_devices`.
- VMs named `test-vm` and `tv-vm` are deleted and recreated. Rename your own VM if it uses one
  of those names.
- The Device Manager bookmark file (`remote_device_scan.list`) is backed up, modified, and
  restored after the run.
- With `--yes` the driver sweeps the local /24 on TCP 26101 three times.

### 3-2. Run

```bash
node scripts/prepare-device-fixtures.mjs    # once per host (6-12 min); skip if fixtures/apps/fixtures.generated.env already exists
node scripts/run-device-tier.mjs            # preflight + print the plan, change nothing
node scripts/run-device-tier.mjs --yes      # run (~20 min)
```

Aliases: `npm run prepare:device`, `npm run test:device` (plan only).

`prepare-device-fixtures.mjs` creates, builds and signs a native BasicUI, a .NET NUI and a web
Basic project under `fixtures/apps/` (gitignored) and writes the real app ids and paths to
`fixtures/apps/fixtures.generated.env`. A bare `runner.mjs` run does not read that file, so the
`${FIXTURE_*}` placeholders resolve to the documentation defaults in `fixtures/fixtures.env`
(`XXXXXXXXXX.MyWebApp01` and so on) and the debug TCs fail. Always run the device tier through
the driver.

### 3-3. Phases

| Phase | Content | Precondition / hook |
| --- | --- | --- |
| `a-no-device` | missing-required, list-*, handoff envelopes | nothing booted |
| `b-vm-lifecycle` | `test-vm` create/detail/modify-ram/reset/delete, create-image | VM stopped; hook `resetImageDir` |
| `c-boot-1` | `create-emulator.launch`, device-manager, screenshot, sdb-helper | boots `test-vm`, kept running through c6 |
| `c2-fixture-apps` | install-app ×3, file-transfer push/pull, screenshot.output-path | hook `deviceFixtures`: root on, install the .NET/web fixture apps |
| `c3-web-debug` | webapp-debug ×4, playwright-test ×6 (RWI/CDP 9222, 9223) | hooks `debugCleanup`, `resetTestProject` |
| `c4-dotnet-debug` | dotnet-debug ×5 (netcoredbg DAP 4711) | hook `debugCleanup` |
| `c5a` – `c5d` | gdb-debug launch / attach / breakpoints / serial, one per phase | hook `debugCleanup` before each |
| `c6-stop` | `device-manager.stop` | hook `debugCleanup` |
| `d-boot-2` | launch-emulator happy / first-available, stop, delete | only `test-vm` exists |
| `e-network` | remote-device bookmark chain, network scans | hook: strip .50/.51 bookmarks |
| `f1-tv-create` | `create-emulator.tv` (`tv-vm`, 3840, `--profile tv`) | — |
| (script step) | `launch-emulator --vm-name tv-vm --timeout 480` | hook `bootTvVm` |
| `f2-tv-detect` | `device-manager.tv`, `device-manager.stop` | needs an online tv-* VM |

### 3-4. Options

```bash
node scripts/run-device-tier.mjs --yes --skip-tv-boot        # skip the tv-vm boot (device-manager.tv is an expected failure)
node scripts/run-device-tier.mjs --yes --keep-test-vm        # do not delete test-vm in the teardown
node scripts/run-device-tier.mjs --yes --phase=c4-dotnet-debug   # one phase (no VM pre-clean/teardown; hooks still run)
node scripts/run-device-tier.mjs --yes --include-drafts      # also run draft TCs (promotion run)
node scripts/run-device-tier.mjs --yes --scratch=<dir>       # scratch directory (the screenshot TCs write a PNG into the cwd)
```

- A lone `--phase=c-boot-1` leaves the emulator running (by design, so c2–c6 can use it).
- Ctrl+C stops after the current TC and still runs the teardown.

The canonical order lives in `policy/device-run-order.yaml`.

---

## 4. Everything in one go

```bash
cd tizen-cli && pnpm build && cd ../tests
node runner.mjs --tier=safe --status=approved
git checkout -- fixtures/profiles/                                        # only if locally modified
node scripts/prepare-device-fixtures.mjs                                  # includes tmp/projects/rootstrap; first time only
node scripts/run-mutating-tier.mjs --yes
node scripts/run-device-tier.mjs --yes
```

Running `prepare-device-fixtures.mjs` once without options also produces the `tmp,projects,rootstrap`
fixtures the mutating tier needs, so the separate `--only=...` step is unnecessary.

## 5. Common failures and their causes

| Message | Cause | Action |
| --- | --- | --- |
| `TIZEN_SDK_DEVICE_E001: No connected device or emulator` | device-tier TC executed with no emulator (bare `runner.mjs`) | use `run-device-tier.mjs --yes` |
| `An emulator VM named 'test-vm' already exists` | the three create-emulator TCs create the same name | the canonical order has `emulator-manager.delete` between them |
| `'XXXXXXXXXX.MyWebApp01' is not a Web app` | `fixtures.generated.env` not loaded, documentation default app id used | run through the driver |
| `dist/ is older than ...` (preflight refusal) | sources changed without a rebuild | `cd tizen-cli && pnpm build` |
| `fixtures/profiles has uncommitted changes` | fixtures the mutating driver backs up/restores are modified | `git checkout -- fixtures/profiles/` or commit |
| `multiple_devices` | two or more emulators online | stop the other emulator and rerun |
