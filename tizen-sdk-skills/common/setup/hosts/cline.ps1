# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts\cline.ps1 - Cline specifics for common\setup\setup.ps1 (dot-sourced).
# See hosts\cline.sh for the rationale; keep the two in step.

function Initialize-HostConfig {
    $script:HostLabel = "Cline"
    $script:HostHome = Join-Path $script:UserHome ".cline"
    $script:CacheSubDirs = @("scripts", "lib", "assets")
    $script:SkillsDir = Join-Path $script:HostHome "skills"
    $script:AgentsMode = "none"
    $script:AgentsDir = ""
    $docs = [Environment]::GetFolderPath('MyDocuments')
    $script:ClineHooks = Join-Path $docs "Cline\Hooks"
    $script:ClineRules = Join-Path $docs "Cline\Rules"
    $script:ClineSrc = Join-Path $script:CommonDir "..\cline\hooks"
    $script:AdapterDst = Join-Path $script:ClineHooks "PreToolUse"
    $script:GuardDir = Join-Path $script:ClineHooks $script:PluginName
    $script:GuardRuleDst = Join-Path $script:ClineRules "$script:PluginName-guard.md"
}

function Install-HostExtras {
    New-Item -ItemType Directory -Force $script:ClineHooks | Out-Null
    # An adapter from a pre-rename install carries the old marker and is ours.
    if ((Test-Path $script:AdapterDst) -and -not (Select-String -Path $script:AdapterDst -Pattern $script:MarkerRegex -Quiet)) {
        Write-Status "Existing PreToolUse hook (not ours) found - NOT overwriting: $script:AdapterDst. Merge the tizen guard manually from $script:ClineSrc\PreToolUse" "Warning"
    } else {
        Install-ShellScript (Join-Path $script:ClineSrc "PreToolUse") $script:AdapterDst
        Install-ShellScript (Join-Path $script:CommonDir "hooks\check-tizen-commands.sh") (Join-Path $script:GuardDir "check-tizen-commands.sh")
        Install-ShellScript (Join-Path $script:CommonDir "hooks\check-project-writes.sh") (Join-Path $script:GuardDir "check-project-writes.sh")
        Write-Status "Cline PreToolUse hook installed: $script:AdapterDst" "Success"
        Write-Status "Cline hooks do NOT run on Windows yet (and require a Cline build with hooks support) - this install takes effect on macOS/Linux. Enable the hook in Cline settings." "Warning"
        # The adapter now dispatches to GuardDir; the previous name's copy is dead.
        foreach ($legacy in $script:LegacyPluginNames) {
            Remove-LegacyPath (Join-Path $script:ClineHooks $legacy) "Cline guard dir"
        }
    }

    New-Item -ItemType Directory -Force $script:ClineRules | Out-Null
    Copy-Item (Join-Path $script:ClineSrc "$script:PluginName-guard.md") $script:GuardRuleDst -Force
    Write-Status "Cline guard rule installed (always-on; Windows fallback for the hook): $script:GuardRuleDst" "Success"
    # Rules are always-on: a leftover rule under the old name would keep telling
    # Cline to look for runners in the old cache path.
    foreach ($legacy in $script:LegacyPluginNames) {
        Remove-LegacyPath (Join-Path $script:ClineRules "$legacy-guard.md") "Cline guard rule"
    }

    Write-Status "Subagents are built into Cline builds that support them (check your build) - enable: Settings > Feature Settings > Agent > Subagents" "Info"
    Write-Status "Subagents are read-only researchers and can load the installed tizen skills via use_skill" "Info"
    Write-Status "State-changing runners (build/install/debug) run in the MAIN agent, not in subagents" "Info"
}

function Test-HostExtras {
    $files = @($script:AdapterDst,
               (Join-Path $script:GuardDir "check-tizen-commands.sh"),
               (Join-Path $script:GuardDir "check-project-writes.sh"),
               $script:GuardRuleDst)
    $missing = @($files | Where-Object { -not (Test-Path $_) })
    if ($missing.Count -gt 0) { $missing | ForEach-Object { Write-Status "Cline hooks : File missing - $_" "Warning" } }
    else { Write-Status "Cline hooks : Validation passed" "Success" }
}

function Write-HostSummary {
    Write-Status "Cline hooks: $script:ClineHooks - macOS/Linux ONLY (inert on Windows); enable in Cline settings" "Info"
    Write-Status "Cline guard rule (Windows fallback - always-on instructions): $script:GuardRuleDst" "Info"
}

function Write-HostNotes {
    Write-Host " - Cline: no restart needed (skills/rules are scanned per session);" -ForegroundColor Yellow
    Write-Host "   enable Hooks and Subagents once in the Cline settings UI." -ForegroundColor Yellow
}
