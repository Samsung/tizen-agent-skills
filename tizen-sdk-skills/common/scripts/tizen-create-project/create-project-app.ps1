#Requires -Version 5.0
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.


# Tizen Project Creation Agent
# Creates native, dotnet, webapp, rpk (resource package), tv (Samsung TV), or platform (GBS sample)
# projects using installed templates.
# Interactive by default. For non-interactive use (e.g. an agent), pass
# -Type/-Template/-Name (and optionally -Path), or -ListTemplates to print the
# available templates instead of prompting.
# A .code-workspace file is always generated; pass -Open to also open it in
# VS Code (default: create only, the current window/workspace is untouched).

param(
    [string]$Type,
    [string]$Template,
    [string]$Name,
    [string]$Path,
    [switch]$ListTemplates,
    [switch]$Open
)

# Configuration
# SDK location comes from the shared resolver (lib\common.ps1 Get-SdkPath):
# ~\.tizen.sdk.path.config (written by tizen-sdk-init) -> TIZEN_SDK_PATH ->
# %USERPROFILE%\tizen-sdk -> C:\tizen-sdk, each candidate validated. The previous
# hand-rolled lookup never read the config file, so an SDK anywhere but
# %USERPROFILE%\tizen-sdk made list-templates fail with "tz tool not found"
# (issue #41).
. (Join-Path $PSScriptRoot "..\lib\common.ps1")
$TIZEN_STUDIO_PATH = Get-SdkPath

# tz tool path - tz.exe on Windows, tz on Linux/Ubuntu
$_tzCoreDir = Join-Path (Join-Path $TIZEN_STUDIO_PATH 'tools') 'tizen-core'
if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    $TZ_TOOL = Join-Path $_tzCoreDir 'tz.exe'
} else {
    $TZ_TOOL = Join-Path $_tzCoreDir 'tz'
}
$TEMPLATES_PATH = Join-Path $_tzCoreDir 'templates'
$LOCAL_TEMPLATES_PATH = Join-Path $PSScriptRoot 'templates'


# Project types
$PROJECT_TYPES = @{
    native = @{ name = 'Native (C)'; templateDir = 'native' }
    dotnet = @{ name = 'DotNET (C#)'; templateDir = 'dotnet' }
    webapp = @{ name = 'WebApp'; templateDir = 'web' }
    rpk = @{ name = 'Resource Package (RPK)'; templateDir = 'rpk' }
}

$TZ_TYPE = @{
    native = 'native'
    dotnet = 'dotnet'
    webapp = 'web'
    rpk = 'rpk'
}

# Profile used to list and create projects. Templates and `tz new -p` are both
# scoped to it, so what we list is exactly what `tz new` can create. It is
# DETECTED from the installed SDK (issue #72: a hardcoded tizen-10.0 made an
# SDK that ships tizen-11.0 list zero templates, exit 0 - "webapp: []"):
#   TIZEN_TZ_PROFILE env override
#   -> highest tizen-X.Y section in `tz list templates`
#   -> highest platforms\tizen-* directory
#   -> tizen-10.0
# Resolved in the main block once $TZ_TOOL is known (Detect-TzProfile).
$TZ_PROFILE = if ($env:TIZEN_TZ_PROFILE) { $env:TIZEN_TZ_PROFILE } else { '' }

function Get-TzProfileSections {
    # Profile section headers of `tz list templates`, e.g. "tizen-10.0".
    $output = & $TZ_TOOL list templates 2>$null
    if ($LASTEXITCODE -ne 0) { return @() }
    $sections = @()
    foreach ($line in @($output)) {
        if ("$line" -match '^(\S.*):\s*$') { $sections += $matches[1].Trim() }
    }
    return $sections
}

function Detect-TzProfile {
    if ($TZ_PROFILE) { return $TZ_PROFILE }
    $found = $null
    if (Test-Path $TZ_TOOL) {
        $found = @(Get-TzProfileSections | Where-Object { $_ -match '^tizen-\d+(\.\d+)*$' }) |
            Sort-Object { [version]($_ -replace '^tizen-', '') } | Select-Object -Last 1
    }
    if (-not $found) {
        $platformsDir = Join-Path $TIZEN_STUDIO_PATH 'platforms'
        if (Test-Path $platformsDir) {
            $found = @(Get-ChildItem $platformsDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^tizen-\d+(\.\d+)*$' } | Select-Object -ExpandProperty Name) |
                Sort-Object { [version]($_ -replace '^tizen-', '') } | Select-Object -Last 1
        }
    }
    if ($found) { return $found }
    return 'tizen-10.0'
}

# Machine lines for the Node runner (list mode only): which profile was used and
# which profile sections tz knows about, so an empty type list can be explained.
function Write-ProfileInfo {
    Write-Host "PROFILE=$TZ_PROFILE"
    Write-Host ("PROFILES=" + ((Get-TzProfileSections) -join ','))
}

# Why the custom-template sync could not write into the SDK ('' when it could).
# Set by Sync-CustomTemplates, read by Report-EmptyType: an empty type list from
# a shell that cannot write under the SDK is a permission problem, not a missing
# platform package (issue #72: Codex's sandbox). 1:1 with the .sh.
$script:SYNC_FAILURE_REASON = ''

# stderr diagnosis when a requested type has no templates under $TZ_PROFILE.
function Report-EmptyType {
    param([string]$TypeKey)
    $sections = (Get-TzProfileSections) -join ','
    if (-not $sections) { $sections = '(none)' }
    [Console]::Error.WriteLine("[WARN] No $TypeKey templates under profile $TZ_PROFILE in $TIZEN_STUDIO_PATH.")
    [Console]::Error.WriteLine("[WARN] Profiles in 'tz list templates': $sections")
    if ($script:SYNC_FAILURE_REASON) {
        # "not writable from this shell" is matched by lib/core/sandbox.js
        # (SANDBOX_SYMPTOM_PATTERN) - keep the phrase if you reword this.
        [Console]::Error.WriteLine("[WARN] The SDK directory is not writable from this shell ($script:SYNC_FAILURE_REASON), so what 'tz' listed from here may be incomplete.")
        [Console]::Error.WriteLine("[WARN] Under Codex CLI re-run this SAME command with escalated permissions (outside the sandbox) before installing anything.")
    } else {
        [Console]::Error.WriteLine("[WARN] Set TIZEN_TZ_PROFILE=<profile> to force a profile, or install the platform package for $TZ_PROFILE.")
    }
}

# tz project-type token (as shown in `tz list templates`, e.g. [dotnet_app]) -> our key.
$TOKEN_TO_KEY = @{
    native_app = 'native'
    dotnet_app = 'dotnet'
    web_app    = 'webapp'
    resource_app = 'rpk'
}

function Ask-Question {
    param([string]$Question)
    Write-Host -NoNewline $Question
    return (Read-Host).Trim()
}

function Detect-TvProfile {
    # Find the newest tv-samsung-* profile in `tz list templates` output.
    # Returns $null when no TV SDK is available. Mirrors detect_tv_profile in
    # create-project-app.sh.
    $output = & $TZ_TOOL list templates 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }

    $profiles = @()
    foreach ($line in $output) {
        if ($line -match '^(tv-samsung-[\d.]+):\s*$') { $profiles += $matches[1] }
    }
    if ($profiles.Count -eq 0) { return $null }

    $latest = $profiles |
        Sort-Object { [version]($_ -replace '^tv-samsung-', '') } |
        Select-Object -Last 1

    # `tz list templates` may list tv-samsung-* profiles from templates.yaml
    # metadata even when the TV SDK extension package is not installed -
    # verify the platform directory actually exists (phantom-template guard,
    # same as the bash script).
    $tvPlatformDir = Join-Path $TIZEN_STUDIO_PATH "platforms/$TZ_PROFILE/tv-samsung"
    if (-not (Test-Path $tvPlatformDir)) { return $null }

    return $latest
}

function Get-TvTemplates {
    # Template names (web_app + dotnet_app) under the newest tv-samsung-*
    # profile. Returns an empty array when no TV SDK is installed.
    $tvProfile = Detect-TvProfile
    if (-not $tvProfile) { return @() }

    $output = & $TZ_TOOL list templates 2>&1
    if ($LASTEXITCODE -ne 0) { return @() }

    $names = @()
    $inProfile = $false
    foreach ($line in $output) {
        if ($line -match '^\S.*:\s*$') {
            $p = ($line -replace ':\s*$', '').Trim()
            $inProfile = ($p -eq $tvProfile)
            continue
        }
        if ($inProfile -and $line -match '^\s+(\S+)\s+\[(web_app|dotnet_app)\]') {
            if ($names -notcontains $matches[1]) { $names += $matches[1] }
        }
    }
    return @($names | Sort-Object)
}

function Get-TvTemplateTzType {
    # TV templates can be either web_app or dotnet_app - resolve the tz -T
    # token for one template by checking it against the tv profile listing.
    param([string]$Template)

    $tvProfile = Detect-TvProfile
    if (-not $tvProfile) { return 'web' }

    $output = & $TZ_TOOL list templates 2>&1
    $inProfile = $false
    foreach ($line in $output) {
        if ($line -match '^\S.*:\s*$') {
            $p = ($line -replace ':\s*$', '').Trim()
            $inProfile = ($p -eq $tvProfile)
            continue
        }
        if ($inProfile -and $line -match "^\s+$([regex]::Escape($Template))\s+\[dotnet_app\]") {
            return 'dotnet'
        }
    }
    return 'web'
}

function Sync-CustomTemplates {
    # Sync custom templates from the plugin's templates/ directory into the SDK
    # so that `tz list templates` discovers them and `tz new` can create them.
    #
    # For each project type (native, dotnet, webapp), we look for template
    # folders under $LOCAL_TEMPLATES_PATH/<templateDir>/ that contain a
    # sample.xml (the marker file that identifies a Tizen template).
    # For each one found:
    #   1. Copy the folder into the SDK's sample template directory.
    #   2. Register it in templates.yaml (if not already present).

    if (-not (Test-Path $LOCAL_TEMPLATES_PATH)) { return }

    # SDK sample template directories (where tz new looks for the actual files)
    $sdkSampleBase = Join-Path $TIZEN_STUDIO_PATH "platforms/$TZ_PROFILE/tizen/samples/Template"
    $sdkTemplateYamlDir = Join-Path $TEMPLATES_PATH 'native'
    $sdkTemplateYaml = Join-Path $sdkTemplateYamlDir 'templates.yaml'

    # type key -> @{ sampleSubdir; yamlType }
    $typeMap = @{
        native = @{ sampleSubdir = 'Native'; yamlType = 'native_app' }
    }

    foreach ($typeKey in $typeMap.Keys) {
        $templateDir = $PROJECT_TYPES[$typeKey].templateDir
        $localTypePath = Join-Path $LOCAL_TEMPLATES_PATH $templateDir
        if (-not (Test-Path $localTypePath)) { continue }

        $sampleSubdir = $typeMap[$typeKey].sampleSubdir
        $yamlType = $typeMap[$typeKey].yamlType
        $sdkSampleTypePath = Join-Path $sdkSampleBase $sampleSubdir

        # Find all template folders with a sample.xml
        $templateFolders = Get-ChildItem $localTypePath -Directory -ErrorAction SilentlyContinue |
            Where-Object { Test-Path (Join-Path $_.FullName 'sample.xml') }

        foreach ($folder in $templateFolders) {
            $templateName = $folder.Name

            # 1. Copy template folder to SDK sample directory
            $destPath = Join-Path $sdkSampleTypePath $templateName
            if (Test-Path $destPath) {
                # Already exists - skip copy (don't overwrite SDK originals)
            } else {
                try {
                    # -ErrorAction Stop: a denied write must land in the catch
                    # below with its reason, not scroll past as a non-terminating
                    # error while the sync "succeeds".
                    if (-not (Test-Path $sdkSampleTypePath)) {
                        New-Item -ItemType Directory -Path $sdkSampleTypePath -Force -ErrorAction Stop | Out-Null
                    }
                    Copy-Item -Path $folder.FullName -Destination $destPath -Recurse -Force -ErrorAction Stop
                    Write-Host "[INFO] Synced custom template '$templateName' to SDK: $destPath"
                } catch {
                    # Keep the reason ("Access is denied"): it tells a read-only
                    # SDK / sandboxed shell apart from a broken template (issue #72).
                    $script:SYNC_FAILURE_REASON = "$($_.Exception.Message)".Trim()
                    if (-not $script:SYNC_FAILURE_REASON) { $script:SYNC_FAILURE_REASON = 'copy failed' }
                    Write-Host "[WARN] Could not sync custom template '$templateName' into the SDK ($script:SYNC_FAILURE_REASON) - listing continues."
                    continue
                }
            }

            # 2. Register in templates.yaml (native only for now)
            if ($typeKey -eq 'native' -and (Test-Path $sdkTemplateYaml)) {
                $yamlContent = Get-Content $sdkTemplateYaml -Raw -ErrorAction SilentlyContinue
                $entryName = "name: $templateName"
                if ($yamlContent -notmatch [regex]::Escape($entryName)) {
                    $newEntry = "    - name: $templateName`n      type: $yamlType`n      path: templates/native/$TZ_PROFILE/$templateName`n"
                    # Insert before the last entry or append
                    if ($yamlContent -match ([regex]::Escape($TZ_PROFILE) + ":")) {
                        # Insert after the profile header line
                        $yamlContent = $yamlContent -replace ("(" + [regex]::Escape($TZ_PROFILE) + ":\s*\n)"), "`$1$newEntry"
                        try {
                            Set-Content -Path $sdkTemplateYaml -Value $yamlContent -Encoding UTF8 -NoNewline -ErrorAction Stop
                            Write-Host "[INFO] Registered '$templateName' in templates.yaml"
                        } catch {
                            # Read-only SDK dir / sandboxed shell: listing must still work.
                            Write-Host "[WARN] Could not register '$templateName' in templates.yaml: $_"
                        }
                    }
                }
            }
        }
    }
}

function Discover-PlatformSamples {
    # Scan the plugin's templates/platform/ directory for GBS-buildable sample apps.
    # These are NOT tz new templates - they are complete source trees built with GBS.
    $samples = @()
    $platformPath = Join-Path $LOCAL_TEMPLATES_PATH 'platform'
    if (Test-Path $platformPath) {
        $dirs = Get-ChildItem $platformPath -Directory -ErrorAction SilentlyContinue
        foreach ($d in $dirs) {
            $samples += $d.Name
        }
    }
    return ($samples | Sort-Object)
}

function Discover-Templates {
    # Ask tz for the real, creatable templates and keep only those under the
    # detected $TZ_PROFILE. Listing anything else would let a user pick a template
    # `tz new -p $TZ_PROFILE` cannot actually create.
    $templates = @{ native = @(); dotnet = @(); webapp = @(); rpk = @(); platform_samples = @() }

    # Sync custom templates from plugin before listing. This writes into the SDK
    # dir, which a sandboxed shell (Codex workspace-write) may deny; a failed
    # sync must never turn a read-only "list templates" into an error.
    try {
        Sync-CustomTemplates
    } catch {
        Write-Host "[WARN] Custom template sync skipped: $_"
    }

    # Capture both stdout and stderr so we can detect 'tz list templates' failures.
    # The previous version used 2>$null which silently swallowed errors, causing
    # an empty template list that downstream code interpreted as "SDK not installed".
    $output = & $TZ_TOOL list templates 2>&1
    $tzExitCode = $LASTEXITCODE
    if ($tzExitCode -ne 0) {
        $errDetail = ($output | Out-String).Trim()
        Write-Host "Error: 'tz list templates' failed (exit $tzExitCode)."
        Write-Host "  tz output: $errDetail"
        Write-Host "  Possible causes:"
        Write-Host "    - Tizen SDK is not installed or tz tool is missing"
        Write-Host "    - SDK installation is incomplete or corrupted"
        Write-Host "    - TIZEN_STUDIO_PATH is incorrect: $TIZEN_STUDIO_PATH"
        Write-Host "  Run: tizen-cli tizen-sdk sdk-install"
        exit 1
    }

    $inProfile = $false
    foreach ($line in $output) {
        if ($line -match '^\S.*:\s*$') {
            $p = ($line -replace ':\s*$', '').Trim()
            $inProfile = ($p -eq $TZ_PROFILE)
            continue
        }
        if ($inProfile -and $line -match '^\s+(\S+)\s+\[([a-z_]+)\]') {
            $name = $matches[1]
            $tok = $matches[2]
            if ($TOKEN_TO_KEY.ContainsKey($tok)) {
                $key = $TOKEN_TO_KEY[$tok]
                if ($templates[$key] -notcontains $name) { $templates[$key] += $name }
            }
        }
    }

    foreach ($k in @('native', 'dotnet', 'webapp', 'rpk')) {
        $templates[$k] = @($templates[$k] | Sort-Object)
    }

    # Samsung TV templates (present only when the TV SDK extension is installed)
    $templates['tv'] = @(Get-TvTemplates)

    # Collect GBS-buildable platform sample apps (not tz new templates)
    $templates['platform'] = @(Discover-PlatformSamples)

    return $templates
}


function Select-ProjectType {
    param([hashtable]$Templates)

    Write-Host ""
    Write-Host "Tizen Project Creation Agent"
    Write-Host ""
    Write-Host "Select a project type:"
    Write-Host ""

    $availableTypes = @()
    foreach ($key in $PROJECT_TYPES.Keys) {
        if ($Templates[$key] -and $Templates[$key].Count -gt 0) {
            $availableTypes += $key
        }
    }

    for ($i = 0; $i -lt $availableTypes.Count; $i++) {
        $key = $availableTypes[$i]
        $typeName = $PROJECT_TYPES[$key].name
        $count = $Templates[$key].Count
        Write-Host "  $($i + 1). $typeName ($count)"
    }

    Write-Host ""

    while ($true) {
        $selection = Ask-Question "Enter your choice (1-$($availableTypes.Count)): "
        $num = 0
        if (-not [int]::TryParse($selection, [ref]$num)) {
            Write-Host "Invalid selection. Please try again."
            continue
        }
        if ($num -ge 1 -and $num -le $availableTypes.Count) {
            return $availableTypes[$num - 1]
        }
        Write-Host "Invalid selection. Please try again."
    }
}

function Select-Template {
    param([string]$ProjectType, [hashtable]$Templates)

    $typeTemplates = $Templates[$ProjectType]
    if ($typeTemplates.Count -eq 0) {
        Write-Host "No templates found"
        return $null
    }

    Write-Host ""
    Write-Host "Available templates:"
    Write-Host ""

    for ($i = 0; $i -lt $typeTemplates.Count; $i++) {
        Write-Host "  $($i + 1). $($typeTemplates[$i])"
    }

    Write-Host ""

    while ($true) {
        $selection = Ask-Question "Select a template (1-$($typeTemplates.Count)): "
        $num = 0
        if (-not [int]::TryParse($selection, [ref]$num)) {
            Write-Host "Invalid selection. Please try again."
            continue
        }
        if ($num -ge 1 -and $num -le $typeTemplates.Count) {
            return $typeTemplates[$num - 1]
        }
        Write-Host "Invalid selection. Please try again."
    }
}

function Get-DefaultAppsDirectory {
    # Priority 1: WORKSPACE_FOLDER env var (set by some VSCode / Cline setups).
    if ($env:WORKSPACE_FOLDER -and (Test-Path -Path $env:WORKSPACE_FOLDER -PathType Container)) {
        return $env:WORKSPACE_FOLDER
    }
    # Priority 2: the current working directory if it's an open folder (not the user
    # home). When an agent runs the script from the workspace, this is that folder.
    $cwd = (Get-Location).Path
    if ($cwd -and $cwd -ne $env:USERPROFILE -and (Test-Path -Path $cwd -PathType Container)) {
        return $cwd
    }
    # Priority 3: ~/tizen-apps fallback.
    $appsDir = Join-Path $env:USERPROFILE 'tizen-apps'
    if (-not (Test-Path $appsDir)) {
        New-Item -ItemType Directory -Path $appsDir -Force | Out-Null
    }
    return $appsDir
}

function Get-ProjectName {
    Write-Host ""
    Write-Host "Project Details"
    Write-Host ""
    $name = Ask-Question "Project name: "
    if (-not $name) {
        Write-Host "Project name cannot be empty"
        return $null
    }
    return $name
}

function New-PlatformProject {
    # Platform samples are NOT tz new templates - they are complete GBS-buildable
    # source trees copied from the plugin's templates/platform/ directory.
    # Mirrors create_platform_project in create-project-app.sh.
    param([string]$Template, [string]$ProjectName, [string]$ProjectPath)

    $srcPath = Join-Path (Join-Path $LOCAL_TEMPLATES_PATH 'platform') $Template
    if (-not (Test-Path $srcPath -PathType Container)) {
        Write-Host "Error: platform sample '$Template' not found at $srcPath"
        Write-Host "Available: $((Discover-PlatformSamples) -join ', ')"
        exit 1
    }

    $actualProjectPath = Join-Path $ProjectPath $ProjectName

    Write-Host ""
    Write-Host "Creating platform sample project: $ProjectName"
    Write-Host "  Template: $Template"
    Write-Host "  Path: $actualProjectPath"
    Write-Host ""

    if (-not (Test-Path $ProjectPath)) {
        New-Item -ItemType Directory -Path $ProjectPath -Force | Out-Null
    }

    Copy-Item -Path $srcPath -Destination $actualProjectPath -Recurse

    if (-not (Test-Path $actualProjectPath)) {
        Write-Host ""
        Write-Host "Failed to create project at $actualProjectPath"
        return $false
    }

    # Substitute the template app name with the user-provided project name -
    # the dali-demo template has "dali-demo" hardcoded in CMakeLists.txt and
    # the .spec file (binary, RPM package, and CMake target names).
    $templateName = 'dali-demo'
    if ($ProjectName -ne $templateName) {
        Write-Host "Customizing project name: $templateName -> $ProjectName"

        $cmakeFile = Join-Path $actualProjectPath 'CMakeLists.txt'
        if (Test-Path $cmakeFile) {
            (Get-Content $cmakeFile -Raw) -replace [regex]::Escape($templateName), $ProjectName |
                Set-Content $cmakeFile -Encoding UTF8 -NoNewline
            Write-Host "  Updated: CMakeLists.txt"
        }

        $oldSpec = Join-Path (Join-Path $actualProjectPath 'packaging') "$templateName.spec"
        $newSpec = Join-Path (Join-Path $actualProjectPath 'packaging') "$ProjectName.spec"
        if (Test-Path $oldSpec) {
            (Get-Content $oldSpec -Raw) -replace [regex]::Escape($templateName), $ProjectName |
                Set-Content $oldSpec -Encoding UTF8 -NoNewline
            Move-Item $oldSpec $newSpec
            Write-Host "  Updated: packaging/$ProjectName.spec (renamed from $templateName.spec)"
        }
    }

    Write-Host ""
    Write-Host "Project created successfully!"
    Write-Host "  Location: $actualProjectPath"
    Write-Host "  App name: $ProjectName"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  - This is a platform sample - build with GBS (not tz build):"
    Write-Host "    cd `"$actualProjectPath`"; gbs build -A armv7l"
    Write-Host "  - Install: use the tizen-install-app skill after GBS build produces an RPM"
    return $true
}

function New-TizenProject {
    param([string]$ProjectType, [string]$Template, [string]$ProjectName, [string]$ProjectPath)

    $tzType = $TZ_TYPE[$ProjectType]
    $tzProfile = $TZ_PROFILE
    $typeDisplayName = if ($PROJECT_TYPES.ContainsKey($ProjectType)) { $PROJECT_TYPES[$ProjectType].name } else { $ProjectType }

    # TV projects build against the newest tv-samsung-* profile; the template
    # itself decides whether it is a web or a dotnet app.
    if ($ProjectType -eq 'tv') {
        $tzProfile = Detect-TvProfile
        if (-not $tzProfile) {
            Write-Host "Error: No TV SDK (tv-samsung-*) profile found. Install TV SDK extension first."
            exit 1
        }
        $tzType = Get-TvTemplateTzType -Template $Template
        $typeDisplayName = 'Samsung TV'
    }

    Write-Host ""
    Write-Host "Creating $typeDisplayName project: $ProjectName"
    Write-Host "  Template: $Template"
    Write-Host "  Profile: $tzProfile"
    Write-Host "  Path: $ProjectPath"
    Write-Host ""

    # When -Path is passed, it's the PARENT folder where the app folder will be created.
    # tz new creates: <Path>/<ProjectName>/
    # So if user opened /path/to/MyApp/, we need:
    #   -Path /path/to  -Name MyApp  (NOT -Path /path/to/MyApp)
    $wsDir = $ProjectPath
    if (-not (Test-Path $wsDir)) {
        New-Item -ItemType Directory -Path $wsDir -Force | Out-Null
    }

    $env:TIZEN_STUDIO_DIR = $TIZEN_STUDIO_PATH
    $env:TIZEN_STUDIO = $TIZEN_STUDIO_PATH

    Write-Host "Creating project..."
    Write-Host ""

    # tz new creates the complete standalone RPK layout, including
    # tizen_resource_project.yaml and res/. The Tizen IDE `resource-project`
    # command creates an incompatible layout for this SDK installation.
    # tz new -w expects the PARENT workspace, creates <workspace>/<name>/ inside.
    & $TZ_TOOL new -n $ProjectName -t $Template -T $tzType -p $tzProfile -w $wsDir

    # Compute actual project location: <ParentPath>/<ProjectName>/
    $actualProjectPath = Join-Path $ProjectPath $ProjectName

    if (Test-Path $actualProjectPath) {
        Write-Host ""
        Write-Host "Project created successfully!"
        Write-Host "  Location: $actualProjectPath"
        Write-Host ""

        # Create and open VS Code workspace file
        # This registers the project in the Explorer and sets primary working directory automatically
        $workspaceName = $ProjectName
        $workspaceFile = Join-Path $actualProjectPath "$workspaceName.code-workspace"

        $workspaceContent = @{
            folders = @(
                @{ path = "." }
            )
            settings = @{}
        }

        $workspaceContent | ConvertTo-Json -Depth 10 | Set-Content $workspaceFile -Encoding UTF8

        # Open the workspace only on explicit request (-Open). Default is
        # create-only: launching `code` here switches the user's VS Code
        # window to a new workspace, which most callers don't want.
        if ($Open) {
            Write-Host "Opening project in VS Code..."
            Write-Host ""

            # Open the workspace file (registers in current window, updates primary working directory automatically)
            # On Windows, prefer 'code.cmd' to avoid conflicts with Node.js 'code' module.
            # On Linux/Ubuntu, 'code' is the standard command.
            $codeOpened = $false
            $codeCmd = $null
            if ($IsWindows -or $env:OS -eq 'Windows_NT') {
                # Windows: try code.cmd first (the real VS Code launcher), then fall back to code
                if (Get-Command code.cmd -ErrorAction SilentlyContinue) {
                    $codeCmd = 'code.cmd'
                } elseif (Get-Command code -ErrorAction SilentlyContinue) {
                    $codeCmd = 'code'
                }
            } else {
                # Linux/Ubuntu: use 'code' directly
                if (Get-Command code -ErrorAction SilentlyContinue) {
                    $codeCmd = 'code'
                }
            }

            if ($codeCmd) {
                try {
                    & $codeCmd "$workspaceFile" 2>$null
                    $codeOpened = $true
                    Write-Host "Project registered in VS Code Explorer"
                    Write-Host "  Workspace: $workspaceFile"
                    Write-Host "  Primary working directory: $actualProjectPath"
                } catch {
                    Write-Host "Could not open workspace file with $codeCmd command"
                }
            } else {
                Write-Host "VS Code 'code' command not found in PATH"
            }

            if (-not $codeOpened) {
                Write-Host ""
                Write-Host "Manual steps to register project in VS Code:"
                Write-Host "  1. In VS Code: File -> Open Workspace from File"
                Write-Host "  2. Select: $workspaceFile"
                Write-Host "  3. Click 'Open'"
                Write-Host "  4. Project will appear in Explorer, primary working directory updates automatically"
            }
        } else {
            Write-Host "Workspace file created (not opened): $workspaceFile"
            Write-Host "  To open it: code `"$workspaceFile`"  (or pass -Open at creation time)"
        }

        Write-Host ""
        Write-Host "Next steps:"
        Write-Host "  - Build:   use the tizen-build-project skill (runs tz build + tz pack with -w)"
        Write-Host "             manual: tz build -b Debug -w `"$actualProjectPath`"  then  tz pack -w `"$actualProjectPath`""
        Write-Host "  - Install: use the tizen-install-app skill (handles device + absolute path)"
        Write-Host "             manual: tz install -e <device-serial> -p <absolute-package-path>"
        return $true
    } else {
        Write-Host ""
        Write-Host "Failed to create project at $actualProjectPath"
        return $false
    }
}

# Main
try {
    if (-not (Test-Path $TZ_TOOL)) {
        # stdout on purpose: the Node runner captures stdout+stderr of this
        # script on failure and puts the tail into the envelope details.
        Write-Host "Error: tz tool not found at $TZ_TOOL"
        Write-Host "  Resolved SDK path: $TIZEN_STUDIO_PATH"
        Write-Host "  Checked, in order: $env:USERPROFILE\.tizen.sdk.path.config (tizen-sdk-init), TIZEN_SDK_PATH, $env:USERPROFILE\tizen-sdk, C:\tizen-sdk"
        Write-Host "  Fix: run tizen-sdk-init with the SDK path, or tizen-sdk-install if the SDK is not installed."
        exit 1
    }

    $TZ_PROFILE = Detect-TzProfile
    [Console]::Error.WriteLine("[INFO] Using profile: $TZ_PROFILE")

    $templates = Discover-Templates

    # Non-interactive: list templates (for agents - avoids guessing tz subcommands).
    # Honour -Type to list a single type, so callers get exactly the templates
    # they asked for instead of all three sections.
    if ($ListTemplates) {
        Write-ProfileInfo
        if ($Type) {
            $typeKey = $Type.ToLower()
            if (@('native','dotnet','webapp','rpk','tv','platform') -notcontains $typeKey) {
                Write-Host "Error: invalid -Type '$Type' (use: native, dotnet, webapp, rpk, tv, platform)"
                exit 1
            }
            Write-Host "${typeKey}:"
            foreach ($t in $templates[$typeKey]) { Write-Host "  $t" }
            if (@($templates[$typeKey]).Count -eq 0 -and @('native','dotnet','webapp','rpk') -contains $typeKey) {
                Report-EmptyType $typeKey
            }
        } else {
            foreach ($k in @('native','dotnet','webapp','rpk')) {
                Write-Host "${k}:"
                foreach ($t in $templates[$k]) { Write-Host "  $t" }
            }
            # Include TV templates only when the TV SDK extension is installed
            if ($templates['tv'].Count -gt 0) {
                Write-Host "tv:"
                foreach ($t in $templates['tv']) { Write-Host "  $t" }
            }
            # Always include platform samples (GBS-buildable sample apps)
            Write-Host "platform:"
            foreach ($t in $templates['platform']) { Write-Host "  $t" }
        }
        exit 0
    }


    # Non-interactive: create directly when -Type/-Template/-Name are all provided.
    if ($Type -and $Template -and $Name) {
        $typeKey = $Type.ToLower()
        if (@('native','dotnet','webapp','rpk','tv','platform') -notcontains $typeKey) {
            Write-Host "Error: invalid -Type '$Type' (use: native, dotnet, webapp, rpk, tv, platform)"
            exit 1
        }
        if ($templates[$typeKey] -notcontains $Template) {
            if ($typeKey -eq 'tv' -and $templates['tv'].Count -eq 0) {
                Write-Host "Error: No TV SDK (tv-samsung-*) profile found. Install TV SDK extension first."
            } else {
                Write-Host "Error: template '$Template' not found for type '$typeKey'. Available: $($templates[$typeKey] -join ', ')"
            }
            exit 1
        }
        # Non-interactive: -Path is the PARENT directory where the app folder will be created
        # If -Path is omitted, default to ~/tizen-apps and use $Name as the project name
        # The actual project path will be <ParentPath>/<ProjectName>/
        $parentPath = if ($Path) { $Path } else { Get-DefaultAppsDirectory }
        if ($typeKey -eq 'platform') {
            $ok = New-PlatformProject -Template $Template -ProjectName $Name -ProjectPath $parentPath
        } else {
            $ok = New-TizenProject -ProjectType $typeKey -Template $Template -ProjectName $Name -ProjectPath $parentPath
        }
        if (-not $ok) { exit 1 }
        exit 0
    }

    Write-Host "Discovering templates..."
    Write-Host "Found: Native=$($templates.native.Count) DotNET=$($templates.dotnet.Count) WebApp=$($templates.webapp.Count) RPK=$($templates.rpk.Count)"
    Write-Host ""

    $projectType = Select-ProjectType -Templates $templates
    $template = Select-Template -ProjectType $projectType -Templates $templates

    if (-not $template) {
        Write-Host "Operation cancelled"
        exit 0
    }

    $projectName = Get-ProjectName
    if (-not $projectName) {
        exit 1
    }

    $defaultAppsDir = Get-DefaultAppsDirectory
    $projectPath = Join-Path $defaultAppsDir $projectName

    Write-Host ""
    Write-Host "Confirm:"
    Write-Host "  Type: $($PROJECT_TYPES[$projectType].name)"
    Write-Host "  Template: $template"
    Write-Host "  Name: $projectName"
    Write-Host "  Path: $projectPath"
    Write-Host ""

    $confirm = Ask-Question "Create project? (yes/no): "
    if ($confirm -notmatch '^(yes|y)$') {
        Write-Host "Cancelled"
        exit 0
    }

    $success = New-TizenProject -ProjectType $projectType -Template $template -ProjectName $projectName -ProjectPath $projectPath

    if (-not $success) {
        exit 1
    }

} catch {
    Write-Host "Error: $_"
    exit 1
}
