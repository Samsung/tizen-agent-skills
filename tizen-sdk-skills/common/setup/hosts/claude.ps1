# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts\claude.ps1 - Claude Code specifics for common\setup\setup.ps1 (dot-sourced).
# See hosts\claude.sh for the rationale; keep the two in step.

function Initialize-HostConfig {
    $script:HostLabel = "Claude Code"
    $script:HostHome = Join-Path $script:UserHome ".claude"
    $script:CacheSubDirs = @("skills", "agents", "scripts", "lib", "assets")
    $script:SkillsDir = Join-Path $script:HostHome "skills"
    $script:AgentsMode = "md"
    $script:AgentsDir = Join-Path $script:HostHome "agents"
    $script:SettingsFile = Join-Path $script:HostHome "settings.json"
    $script:HooksDir = Join-Path $script:HostHome "hooks\$script:PluginName"
}

# The three PreToolUse entries from common\hooks\hooks.json, pointing at the
# version-independent hook dir. Paths are POSIX: the command runs via bash.
function Get-ClaudeHookEntries {
    $dir = $script:HooksDir -replace '\\', '/'
    @'
  {
    "matcher": "Bash|PowerShell",
    "hooks": [{ "type": "command",
      "command": "bash \"__DIR__/check-tizen-commands.sh\"" }]
  },
  {
    "matcher": "Write|Bash|PowerShell",
    "hooks": [{ "type": "command",
      "command": "bash \"__DIR__/check-project-writes.sh\"" }]
  },
  {
    "matcher": "Skill|Agent|Task",
    "hooks": [{ "type": "command",
      "command": "bash \"__DIR__/check-skill-routing.sh\"" }]
  }
'@ -replace '__DIR__', $dir

}

# The SessionStart entry: check-update.js reports a newer release of an
# installed plugin. It runs via node, so it needs no bash on Windows.
# Timeout 20 s: the fetch itself is capped at 3 s, but node startup alone takes
# 4-6 s on Windows machines with on-access virus scanning, and behind a proxy
# the script re-runs itself once more — 11-12 s end to end was measured on such
# a machine. The old 5 s cap killed it before it could write its cache.
function Get-ClaudeSessionEntries {
    $dir = $script:HooksDir -replace '\\', '/'
    $cache = (Join-Path $script:HostHome (Split-Path $script:CacheTail -Parent)) -replace '\\', '/'
    @'
  {
    "matcher": "startup",
    "hooks": [{ "type": "command", "timeout": 20,
      "command": "node \"__DIR__/check-update.js\" --host claude --cache-root \"__CACHE__\"" }]
  }
'@ -replace '__DIR__', $dir -replace '__CACHE__', $cache
}

function Install-HostExtras {
    foreach ($h in "check-tizen-commands.sh", "check-project-writes.sh", "check-skill-routing.sh", "check-update.js") {
        Install-ShellScript (Join-Path $script:CommonDir "hooks\$h") (Join-Path $script:HooksDir $h)
    }
    Write-Status "Hook scripts installed (version-independent path): $script:HooksDir" "Success"

    # Register the entries in settings.json. The merge tool replaces our previous
    # entries (recognised by command path or the legacy _source tag) instead of
    # duplicating them, keeps everyone else's, and saves a one-time pristine
    # backup. It refuses to touch a file it cannot parse or whose hooks section
    # has the wrong shape - then the snippet below is the manual fallback.
    $merged = $false
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $entries = "[" + (Get-ClaudeHookEntries) + "]"
        $tmp = [IO.Path]::GetTempFileName()
        try {
            [IO.File]::WriteAllText($tmp, $entries, (New-Object System.Text.UTF8Encoding $false))
            & node (Join-Path $script:CommonDir "lib\tools\merge-hooks-json.js") --file $script:SettingsFile --event PreToolUse --entries-file $tmp
            if ($LASTEXITCODE -eq 0) {
                Write-Status "All 3 hooks registered in $script:SettingsFile (hooks.PreToolUse)" "Success"
                $merged = $true
                [IO.File]::WriteAllText($tmp, "[" + (Get-ClaudeSessionEntries) + "]", (New-Object System.Text.UTF8Encoding $false))
                & node (Join-Path $script:CommonDir "lib\tools\merge-hooks-json.js") --file $script:SettingsFile --event SessionStart --entries-file $tmp
                if ($LASTEXITCODE -eq 0) {
                    Write-Status "Update check registered in $script:SettingsFile (hooks.SessionStart)" "Success"
                } else {
                    Write-Status "Could not register the update check in $script:SettingsFile (hooks.SessionStart)" "Warning"
                }
            } else {
                Write-Status "Could not merge hooks into $script:SettingsFile - merge the snippet below by hand" "Warning"
                Write-Snippet
            }
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Status "node not found - cannot merge hooks into $script:SettingsFile automatically" "Warning"
        Write-Snippet
    }

    # Only once the settings entries point at HooksDir is a pre-rename hook dir
    # dead. If the merge fell back to the snippet, settings.json may still
    # reference the old dir - deleting it would break the hooks that work today.
    foreach ($legacy in $script:LegacyPluginNames) {
        $legacyDir = Join-Path $script:HostHome "hooks\$legacy"
        if ($merged) {
            Remove-LegacyPath $legacyDir "Claude Code hook dir"
        } elseif (Test-Path $legacyDir) {
            Write-Status "Kept legacy hook dir $legacyDir - remove it after repointing $script:SettingsFile to $script:HooksDir" "Warning"
        }
    }
}

function Write-Snippet {
    Write-Host ""
    Write-Host "  Merge this into $script:SettingsFile -> hooks.PreToolUse:" -ForegroundColor Yellow
    Write-Host (Get-ClaudeHookEntries) -ForegroundColor Gray
    Write-Host "  and this into $script:SettingsFile -> hooks.SessionStart:" -ForegroundColor Yellow
    Write-Host (Get-ClaudeSessionEntries) -ForegroundColor Gray
}

function Test-HostExtras {
    $ok = $true
    foreach ($h in "check-tizen-commands.sh", "check-project-writes.sh", "check-skill-routing.sh", "check-update.js") {
        if (-not (Test-Path (Join-Path $script:HooksDir $h))) {
            Write-Status "Claude hooks : File missing - $script:HooksDir\$h" "Warning"; $ok = $false
        }
    }
    if (Test-Path $script:SettingsFile) {
        $settings = Get-Content $script:SettingsFile -Raw
        foreach ($h in "check-tizen-commands.sh", "check-project-writes.sh", "check-skill-routing.sh", "check-update.js") {
            if ($settings -notmatch [regex]::Escape($h)) {
                Write-Status "Claude hooks : $script:SettingsFile does not reference $h" "Warning"; $ok = $false
            }
        }
    } else {
        Write-Status "Claude hooks : $script:SettingsFile not found" "Warning"; $ok = $false
    }
    if ($ok) { Write-Status "Claude hooks : Validation passed" "Success" }
}

function Write-HostSummary {
    Write-Status "Hooks: $script:HooksDir + entries in $script:SettingsFile (hooks.PreToolUse, hooks.SessionStart)" "Info"
}

function Write-HostNotes {
    Write-Host " - Restart the Claude Code session to load the new skill/agent definitions and hooks." -ForegroundColor Yellow
    Write-Host " - If marketplace policy blocks the plugin, the personal copies (Step 3) are used." -ForegroundColor Yellow
}
