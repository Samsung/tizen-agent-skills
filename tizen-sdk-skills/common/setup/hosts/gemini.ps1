# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts\gemini.ps1 - Gemini CLI specifics for common\setup\setup.ps1 (dot-sourced).
# See hosts\gemini.sh for the surfaces and rationale; keep the two in step.

function Initialize-HostConfig {
    $script:HostLabel = "Gemini CLI"
    $script:HostHome = Join-Path $script:UserHome ".gemini"
    $script:CacheSubDirs = @("skills", "agents", "scripts", "lib", "assets")
    $script:SkillsDir = Join-Path $script:HostHome "skills"
    $script:AgentsMode = "gemini-md"
    $script:AgentsDir = Join-Path $script:HostHome "agents"
    $script:SettingsFile = Join-Path $script:HostHome "settings.json"
    $script:HooksDir = Join-Path $script:HostHome "hooks\$script:PluginName"
    $script:AdapterSrc = Join-Path $script:CommonDir "..\gemini\hooks\BeforeTool"
    $script:AdapterDst = Join-Path $script:HooksDir "BeforeTool"
    $script:ContextFile = Join-Path $script:HostHome "GEMINI.md"
}

function Get-GeminiHookEntries {
    $adapter = $script:AdapterDst -replace '\\', '/'
    $name = $script:PluginName
    @'
[
  {
    "matcher": "run_shell_command|write_file|replace",
    "hooks": [{ "name": "__NAME__-guard", "type": "command",
      "command": "bash \"__ADAPTER__\"", "timeout": 5000 }]
  }
]
'@ -replace '__NAME__', $name -replace '__ADAPTER__', $adapter
}

function Install-HostExtras {
    Install-ShellScript $script:AdapterSrc $script:AdapterDst
    Install-ShellScript (Join-Path $script:CommonDir "hooks\check-tizen-commands.sh") (Join-Path $script:HooksDir "check-tizen-commands.sh")
    Install-ShellScript (Join-Path $script:CommonDir "hooks\check-project-writes.sh") (Join-Path $script:HooksDir "check-project-writes.sh")
    Write-Status "Gemini BeforeTool hook installed: $script:AdapterDst" "Success"

    # Register the BeforeTool entry in settings.json. The merge tool replaces our
    # previous entries (recognised by command path or the legacy _source tag)
    # instead of duplicating them, keeps everyone else's, and saves a one-time
    # pristine backup. It refuses to touch a file it cannot parse or whose hooks
    # section has the wrong shape - then the snippet below is the manual fallback.
    $merged = $false
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $tmp = [IO.Path]::GetTempFileName()
        try {
            [IO.File]::WriteAllText($tmp, (Get-GeminiHookEntries), (New-Object System.Text.UTF8Encoding $false))
            & node (Join-Path $script:CommonDir "lib\tools\merge-hooks-json.js") --file $script:SettingsFile --event BeforeTool --entries-file $tmp
            if ($LASTEXITCODE -eq 0) {
                Write-Status "BeforeTool hook registered in $script:SettingsFile (hooks.BeforeTool)" "Success"
                $merged = $true
            } else {
                Write-Status "Could not merge the hook into $script:SettingsFile - merge the snippet below by hand" "Warning"
                Write-Snippet
            }
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Status "node not found - cannot merge the hook into $script:SettingsFile automatically" "Warning"
        Write-Snippet
    }

    # Only once the settings entry points at HooksDir is a pre-rename adapter dir
    # dead. If the merge fell back to the snippet, settings.json may still
    # reference the old dir - deleting it would break the hook that works today.
    foreach ($legacy in $script:LegacyPluginNames) {
        $legacyDir = Join-Path $script:HostHome "hooks\$legacy"
        if ($merged) {
            Remove-LegacyPath $legacyDir "Gemini hook dir"
        } elseif (Test-Path $legacyDir) {
            Write-Status "Kept legacy hook dir $legacyDir - remove it after repointing the `"$legacy-guard`" entry in $script:SettingsFile" "Warning"
        }
    }

    Install-GuardSection $script:ContextFile (Join-Path $script:CommonDir "hooks\$script:PluginName-guard.md") "GEMINI.md guard"
}

# Same entry the merge tool receives, so the printed snippet can never drift
# from what the automatic path writes.
function Write-Snippet {
    Write-Host ""
    Write-Host "  Merge this into $script:SettingsFile -> `"hooks`":" -ForegroundColor Yellow
    Write-Host '  "BeforeTool": ' -ForegroundColor Gray
    Write-Host (Get-GeminiHookEntries) -ForegroundColor Gray
    Write-Host ""
}


function Test-HostExtras {
    $ok = $true
    foreach ($f in $script:AdapterDst, (Join-Path $script:HooksDir "check-tizen-commands.sh"), (Join-Path $script:HooksDir "check-project-writes.sh")) {
        if (-not (Test-Path $f)) { Write-Status "Gemini hooks : File missing - $f" "Warning"; $ok = $false }
    }
    if (Test-Path $script:SettingsFile) {
        $settings = Get-Content $script:SettingsFile -Raw
        if ($settings -notmatch "BeforeTool" -or $settings -notmatch [regex]::Escape(($script:AdapterDst -replace '\\', '/'))) {
            Write-Status "Gemini hooks : $script:SettingsFile does not reference the BeforeTool adapter" "Warning"; $ok = $false
        }
    } else {
        Write-Status "Gemini hooks : $script:SettingsFile not found" "Warning"; $ok = $false
    }
    if (-not ((Test-Path $script:ContextFile) -and (Select-String -Path $script:ContextFile -Pattern "tizen-sdk-skills:begin" -Quiet))) {
        Write-Status "GEMINI.md : guard section missing - $script:ContextFile" "Warning"; $ok = $false
    }
    if ($ok) { Write-Status "Gemini hooks/context : Validation passed" "Success" }
}

function Write-HostSummary {
    Write-Status "Gemini hooks: $script:HooksDir + entry in $script:SettingsFile (hooks.BeforeTool)" "Info"
    Write-Status "Gemini context: $script:ContextFile (tizen-sdk-skills section)" "Info"
}


function Write-HostNotes {
    Write-Host " - Restart Gemini CLI; check with /skills list and /agents." -ForegroundColor Yellow
    Write-Host " - Hooks run via bash - Git Bash must be on PATH on Windows." -ForegroundColor Yellow
    Write-Host " - Agent 'tools' names were mapped Claude->Gemini by agent-convert.js; if /agents rejects one, report the name." -ForegroundColor Yellow
}
