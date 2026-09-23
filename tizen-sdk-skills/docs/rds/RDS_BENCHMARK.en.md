# RDS Benchmark Guide

English | [한국어](RDS_BENCHMARK.md)

## Overview

The RDS (Rapid Development Support) benchmark feature measures the performance difference between RDS disabled and enabled scenarios. Use `TIZEN_BENCHMARK=1` to enable timing instrumentation.

**Zero overhead when disabled** — the benchmark mode only activates when `TIZEN_BENCHMARK=1` is set. When unset or `0`, there are no `performance.now()` calls and no allocations.

## What Gets Measured

When `TIZEN_BENCHMARK=1` is enabled, the following RDS phases are timed:

| Phase | Description |
|-------|-------------|
| `getRdsInfoPath` | Resolves the device path for the app installation |
| `readDeviceMarker` | Reads the deploy marker from the device |
| `reconcile` | Compares current output against baseline manifest |
| `getDelta` | Computes which files changed |
| `resolveDevicePaths` | Maps host paths to device paths |
| `pushDelta` | Pushes changed files to device (RDS only) |
| `launch` | Launches the app via `runNoChain()` |
| `syncState` | Updates host-side state and device marker/snapshot |

The total time and per-phase breakdown are returned in the JSON envelope as `result.rds_timings` and printed to stderr.

## Usage

### Manual Benchmark Script

The manual benchmark script (`common/lib/tests/manual/benchmark-rds.js`) automates comparing RDS disabled vs enabled:

```bash
node common/lib/tests/manual/benchmark-rds.js \
  --project /path/to/MyApp \
  --device-serial emulator-26101 \
  --iterations 5
```

**Options:**
- `--project <dir>` — Path to a Tizen project directory (required)
- `--device-serial <serial>` — Target device/emulator serial (optional; the installer auto-selects when omitted)
- `--iterations <N>` — Number of iterations per phase (default: 5)
- `--build [true|false]` — Rebuild before each install (default: true). A bare `--build` means true.
- `--no-build` — Install the same package every iteration. Phase C is skipped, because a source change that is never rebuilt cannot reach the package.
- `--package <path>` — Package to install with `--no-build`. Without it the script builds once up front and takes `artifacts[0].path` from the build envelope; the package name is never guessed from the directory name.

**What it does** (`TIZEN_BENCHMARK=1` is set for every install, so all phases collect timings; `TIZEN_RDS_ENABLED` selects the mode):
1. **Phase A (RDS Disabled):** N installs with `TIZEN_RDS_ENABLED=0` — every install is a full `tz install`
2. **Phase B (RDS Enabled):** Resets RDS state (`install --reset-rds`; the run aborts if the reset fails), then N installs with `TIZEN_RDS_ENABLED=1`:
   - Iteration 1: full install (creates the baseline)
   - Iterations 2–N: fast-deploy (the package did not change)
3. **Phase C (RDS Enabled with Modification):** Resets RDS state again, then:
   - Iteration 1: full install (baseline)
   - Iterations 2–N: prepend a marker comment to up to three randomly chosen source files (`.c` `.cpp` `.h` `.hpp` `.cs` `.js` `.ts` `.css` `.html` `.xaml`; build output, `bin/`, `obj/`, `node_modules/`, `.git/` and `.tizen-rds/` are skipped), rebuild, install — this is the RDS delta path
   - Every modified file is restored to its original content when the phase ends, also on Ctrl+C. If the process is killed hard, revert the marker comments with your VCS.

**Output:**
- Real-time progress to stderr
- Summary statistics (min, max, mean, median) for each phase
- Speedup calculation
- Detailed iteration-by-iteration table
- JSON results saved to `benchmark-results.json`

### Direct CLI Usage

You can also run individual installs with benchmark mode enabled:

```bash
# Bash / Git Bash:
TIZEN_BENCHMARK=1 node "$CLI" install --package "/path/to/MyApp.tpk" --run

# PowerShell:
$env:TIZEN_BENCHMARK="1"; node "$CLI" install --package "C:\path\to\MyApp.tpk" --run

# cmd.exe (quote the assignment: without the quotes cmd stores "1 " with a trailing space and benchmark mode stays off):
set "TIZEN_BENCHMARK=1" && node "path\to\project-manager-cli.js" install --package "C:\path\to\MyApp.tpk" --run
```

The success envelope will include:
```json
{
  "status": "success",
  "result": {
    "deploy_type": "rds",
    "rds_timings": {
      "total": 234.56,
      "phases": {
        "reconcile": 145.23,
        "getDelta": 12.45,
        "resolveDevicePaths": 8.12,
        "pushDelta": 45.67,
        "launch": 15.34,
        "syncState": 7.75
      }
    }
  }
}
```

### CI-Safe Test

The automated test (`common/lib/tests/rds-benchmark.test.js`) validates the timing instrumentation without needing a real device:

```bash
cd common/lib/tests
node rds-benchmark.test.js
```

This test:
- Verifies `isBenchmarkMode()` respects the env var (unset / `1` / `0`)
- Tests the `RdsDeployTimings` class: phase durations, total, rounding, `endPhase()` without a matching `startPhase()`
- Asserts that an empty `startPhase()`/`endPhase()` pair costs under 1 ms (median of 20 runs)

It needs no device, no `sdb` and no fixtures, so it runs on every platform `run-all.js` runs on, Windows included.

## Interpreting Results

### Expected Timings

| Scenario | Expected Time | Notes |
|----------|---------------|-------|
| Full install (RDS disabled) | 5–30s | Depends on app size, device speed |
| First RDS install | 5–30s | Same as full + baseline creation |
| RDS delta deploy | 1–5s | Mostly push time for changed files |
| RDS fast-deploy | <2s | Launch only, no file changes |

### Key Metrics

1. **Speedup ratio:** `mean(RDS disabled) / mean(RDS enabled)` over all N iterations of each phase (the first RDS iteration is a full install, so the ratio understates the steady-state gain)
   - Typical: 5–10x for small changes
   - Higher for large apps with minimal changes

2. **Reconcile time:** Time to scan and compare files
   - Scales linearly with file count
   - Typically 50–200ms for 100 files
   - Dominant cost for .NET apps with large publish directories

3. **Push time:** Time to transfer changed files
   - Depends on delta size and device connection speed
   - USB is faster than network-connected devices

4. **Launch time:** Time to relaunch the app
   - Usually 10–50ms
   - Can be longer for complex apps

### Troubleshooting

**No `rds_timings` in envelope:**
- Ensure `TIZEN_BENCHMARK=1` is set
- Check that RDS is eligible (Debug build, tpk/wgt, not GBS/platform)
- A full install (`deploy_type: "full"`) also returns `rds_timings`, but they cover only the post-install `reconcile` and `syncState` phases (baseline creation), not the install itself — do not compare that `total` with RDS or fast-deploy totals

**RDS not being used:**
- Check `deploy_type` in envelope — should be `"rds"` or `"fast-deploy"`
- If `"full"`, check warnings for RDS ineligibility reasons
- Common causes: Release build, RPM/RPK, platform project, no prior baseline

**High reconcile time:**
- Expected for large file counts (.NET publish directories)
- Consider reducing output files or using ignore patterns

## Implementation Details

### Environment Variable

- `TIZEN_BENCHMARK=1` — Enable benchmark mode
- `TIZEN_BENCHMARK=0` or unset — Disable (zero overhead)

### Code Locations

- `common/lib/core/rds/deploy-service.js` — `isBenchmarkMode()`, `RdsDeployTimings`, instrumented `tryRdsDeploy()` and `updateRdsState()`
- `common/lib/core/project.js` — Threads `rds_timings` through to envelope
- `common/lib/tests/manual/benchmark-rds.js` — Manual benchmark script
- `common/lib/tests/rds-benchmark.test.js` — CI-safe test

### Overhead

When `TIZEN_BENCHMARK` is unset or `0`:
- No `performance.now()` calls
- No `RdsDeployTimings` allocations
- Single `process.env` check per deploy (negligible)

When enabled:
- ~8 `performance.now()` calls per RDS deploy
- One small object allocation (`RdsDeployTimings`)
- JSON serialization for envelope (minimal)

## Related Documentation

- [RDS Fast Deploy Plan](RDS_FAST_DEPLOY_PLAN.en.md) — Original RDS implementation plan
- [tizen-install-app Skill](../../common/skills/tizen-install-app/SKILL.md) — Usage guide for install command
