# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# hosts\codex.ps1 - OpenAI Codex CLI specifics for common\setup\setup.ps1 (dot-sourced).
# See hosts\codex.sh for the surfaces and rationale; keep the two in step.

function Initialize-HostConfig {
    $script:HostLabel = "Codex CLI"
    $script:HostHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $script:UserHome ".codex" }
    $script:CacheSubDirs = @("skills", "agents", "scripts", "lib", "assets")
    $script:SkillsDir = Join-Path $script:UserHome ".agents\skills"
    $script:AgentsMode = "toml"
    $script:AgentsDir = Join-Path $script:HostHome "agents"
    $script:HooksDir = Join-Path $script:HostHome "hooks\$script:PluginName"
    $script:HooksJson = Join-Path $script:HostHome "hooks.json"
    $script:ContextFile = Join-Path $script:HostHome "AGENTS.md"
}

function Get-CodexHooksJson {
    $dir = $script:HooksDir -replace '\\', '/'
    $name = $script:PluginName
    return @"
{
  "_source": "$name",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command",
          "command": "bash \"$dir/check-tizen-commands.sh\"" }]
      },
      {
        "matcher": "Write|Bash|apply_patch",
        "hooks": [{ "type": "command",
          "command": "bash \"$dir/check-project-writes.sh\"" }]
      }
    ]
  }
}
"@
}

function Install-HostExtras {
    Install-ShellScript (Join-Path $script:CommonDir "hooks\check-tizen-commands.sh") (Join-Path $script:HooksDir "check-tizen-commands.sh")
    Install-ShellScript (Join-Path $script:CommonDir "hooks\check-project-writes.sh") (Join-Path $script:HooksDir "check-project-writes.sh")
    Write-Status "Guard scripts installed: $script:HooksDir" "Success"

    $utf8 = New-Object System.Text.UTF8Encoding $false
    # A hooks.json tagged with the pre-rename "_source" is ours too: rewrite it,
    # then drop the guard-script dir it pointed at.
    if (-not (Test-Path $script:HooksJson) -or (Select-String -Path $script:HooksJson -Pattern "`"($script:MarkerRegex)`"" -Quiet)) {
        [IO.File]::WriteAllText($script:HooksJson, (Get-CodexHooksJson), $utf8)
        Write-Status "Codex hooks written: $script:HooksJson" "Success"
        foreach ($legacy in $script:LegacyPluginNames) {
            Remove-LegacyPath (Join-Path $script:HostHome "hooks\$legacy") "Codex guard dir"
        }
    } else {
        Write-Status "Existing $script:HooksJson (not ours) found - NOT overwriting. Merge the PreToolUse entries below into it:" "Warning"
        Write-Host (Get-CodexHooksJson) -ForegroundColor Gray
    }

    # The shared guard rules name every host's cache; only the installer knows
    # which one is THIS host's (CODEX_HOME may be non-default), so pin it here.
    Install-GuardSection $script:ContextFile (Join-Path $script:CommonDir "hooks\$script:PluginName-guard.md") "AGENTS.md guard" (Get-CodexGuardExtra)
}

function Get-CodexGuardExtra {
    $cacheRoot = "$script:HostHome\$script:CacheTail\<version>\lib\cli\"
    return @"
**This host is Codex CLI.** Its tizen-sdk-skills runner cache is
``$cacheRoot`` - look there first (rule 8); use
another host's ``~/.claude``, ``~/.cline`` or ``~/.gemini`` copy only if this one is
missing. Codex spawns PowerShell on Windows: use the skill's PowerShell lookup
snippet there, and the bash one elsewhere.

**Codex exec waits at most 30 s per call.** Pass ``yield_time_ms: 30000`` on every runner
call; run ``launch``, ``create --launch``, builds, app installs, dotnet-setup, debug setup,
Playwright runs and large file transfers with ``--background`` (every runner accepts it;
``status`` shows the live script log); for installs and
updates run the pre-check's ``suggested_fix.background_command`` (with escalated
permissions - it downloads). Then poll ``node <same lib/cli dir>/job-cli.js wait --id <job_id>``
until ``job.state`` is ``done`` (guard rule 11). A result that is only a ``[tizen-...]`` progress
line is not a result - the runner is still running.

**Codex sandbox (guard rule 12).** The default workspace-write sandbox blocks TCP sockets,
writes outside the workspace (``<sdk>``, ``<sdk>-data``) and, on Linux, kills detached jobs
when the call ends. Run sdb / em-cli / certificate actions, project ``list-templates`` and
``create`` (they read and sync templates under ``<sdk>`` - sandboxed, they list nothing),
dotnet-setup and EVERY ``--background`` job or ``job-cli.js run --script`` **with escalated
permissions**, keeping the command line unchanged. A ``sandbox_blocked`` / ``sandbox_job_lost``
envelope is not a tool failure - re-run its ``suggested_fix.command`` (your own command,
``escalate: true``) escalated.
"@
}

function Test-HostExtras {
    $ok = $true
    foreach ($g in "check-tizen-commands.sh", "check-project-writes.sh") {
        if (-not (Test-Path (Join-Path $script:HooksDir $g))) { Write-Status "Codex hooks : File missing - $script:HooksDir\$g" "Warning"; $ok = $false }
    }
    if (-not ((Test-Path $script:HooksJson) -and (Select-String -Path $script:HooksJson -Pattern "check-tizen-commands.sh" -Quiet))) {
        Write-Status "Codex hooks : $script:HooksJson does not reference the guard" "Warning"; $ok = $false
    }
    if (-not ((Test-Path $script:ContextFile) -and (Select-String -Path $script:ContextFile -Pattern "tizen-sdk-skills:begin" -Quiet))) {
        Write-Status "AGENTS.md : guard section missing - $script:ContextFile" "Warning"; $ok = $false
    }
    if (-not ((Test-Path $script:ContextFile) -and (Select-String -Path $script:ContextFile -Pattern "This host is Codex CLI" -Quiet))) {
        Write-Status "AGENTS.md : Codex cache-root line missing - $script:ContextFile" "Warning"; $ok = $false
    }
    if (-not ((Test-Path $script:ContextFile) -and (Select-String -Path $script:ContextFile -Pattern "job-cli.js wait" -SimpleMatch -Quiet))) {
        Write-Status "AGENTS.md : Codex 30 s / --background guidance missing - $script:ContextFile" "Warning"; $ok = $false
    }
    if (-not ((Test-Path $script:ContextFile) -and (Select-String -Path $script:ContextFile -Pattern "sandbox_blocked" -SimpleMatch -Quiet))) {
        Write-Status "AGENTS.md : Codex sandbox/escalation guidance (rule 12) missing - $script:ContextFile" "Warning"; $ok = $false
    }
    if ($ok) { Write-Status "Codex hooks/context : Validation passed" "Success" }
}

function Write-HostSummary {
    Write-Status "Codex hooks: $script:HooksJson -> $script:HooksDir" "Info"
    Write-Status "Codex context: $script:ContextFile (tizen-sdk-skills section)" "Info"
}

function Write-HostNotes {
    Write-Host " - Restart Codex; run /hooks once to TRUST the new hooks (untrusted hooks are skipped)." -ForegroundColor Yellow
    Write-Host " - If hooks stay inert, add to ~/.codex/config.toml:  [features]  hooks = true" -ForegroundColor Yellow
    Write-Host " - Hooks run via bash - Git Bash must be on PATH on Windows." -ForegroundColor Yellow
    Write-Host " - Check with /skills and /agent; skills are read from ~/.agents/skills." -ForegroundColor Yellow
}
