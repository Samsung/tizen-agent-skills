---
name: tizen-create-project
description: Create Tizen project or app, tizen create project, RPK resource project, 타이젠 프로젝트 생성, 타이젠 앱 생성, 타이젠 리소스 패키지 생성, 타이젠 앱 생성해줘, 타이젠 앱 만들어줘, 웹앱 만들어줘, 웹앱 생성, 네이티브 앱 만들어줘, 닷넷 앱 만들어줘, Tizen 프로젝트 만들기, 앱 생성, 새 앱, 프로젝트 시작, make a tizen app, create webapp, 앱 템플릿, 타이젠 앱 템플릿, 앱 템플릿 알려줘, 프로젝트 템플릿, app templates, project templates, list app templates, show app templates, 프로젝트 삭제, 프로젝트 삭제해줘, 타이젠 프로젝트 삭제, 앱 삭제, 앱 삭제해줘, 프로젝트 지워줘, 프로젝트 폴더 삭제, 프로젝트 정리, delete project, delete tizen project, remove project, delete app folder, clean up projects. Listing/browsing APP project templates is also THIS skill (its list-templates action) — NEVER locate or run SDK tools directly for that. DELETING a Tizen project directory is also THIS skill (its delete action) — NEVER `rm -rf` / `Remove-Item` / `del` a project yourself, and never delegate that to a shell command; the delete runs on the SDK host and refuses any path without a Tizen project marker. For EMULATOR VM templates (screen sizes/resolutions), use tizen-create-emulator instead; if the user says just "템플릿" with no qualifier, ask whether they mean app project templates or emulator templates. NEVER hand-write Tizen project files (config.xml, tizen-manifest.xml) — ALWAYS use this agent, which scaffolds from real SDK templates. Use this skill to interactively create a new Tizen project — Native, DotNET, WebApp, standalone RPK resource package, TV, or Platform — by discovering templates from the installed SDK and generating a project scaffold, and to delete an existing project directory when the user asks to remove or clean one up.
metadata:
  author: Samsung Electronics
  last-updated: "2026-09-10"
  keywords:
    - Tizen project
    - create tizen project
    - Tizen Native
    - Tizen DotNET
    - Tizen WebApp
    - 타이젠 프로젝트 생성
    - tizen create native project
    - 프로젝트 삭제
    - 타이젠 프로젝트 삭제
    - delete tizen project
    - remove tizen project
---

## Actions

This skill owns the project-directory lifecycle. Three actions, all on the same CLI runner:

| Action           | Request examples                                     | Section                                     |
| ---------------- | ---------------------------------------------------- | ------------------------------------------- |
| `list-templates` | "앱 템플릿 알려줘", "project templates"               | [Step 1](#step-1-list-templates-for-the-user-selected-type) |
| `create`         | "앱 만들어줘", "create a webapp"                      | [Step 2](#step-2-create-the-project-all-4-arguments-required) |
| `delete`         | "프로젝트 삭제해줘", "delete that project", cleanup    | [Deleting a project](#deleting-a-project)   |

Build, install, and certificates are OTHER skills — never run them from here.

## Scope — STOP after the requested action

**This skill's job ends when the project is created (or deleted).** Creation and build are SEPARATE requests:

- User asked only to create (e.g., "앱 만들어줘", "TV 앱 생성해줘") → report the success envelope, then **STOP**. Do NOT build, do NOT create certificates, do NOT install/run the app — and do NOT add build/install steps to any plan, todo list, or focus chain.
- Proceed to build ONLY when the user's request explicitly includes it (e.g., "앱 만들어서 빌드까지 해줘").
- User asked only to delete → run the `delete` action, report the envelope, then **STOP**. Never re-create the project afterwards unless the user asked for that too (e.g., "지우고 다시 만들어줘").

### Claude Code (서브에이전트 위임)

> Agent tool이 없으면 (예: Cline) 아래 "CLI Runners" 섹션으로 가세요.

1. Agent tool로 `tizen-create-project` 에이전트 호출 (개인 배포 또는 `tizen-sdk-skills:tizen-create-project`)
2. 수집된 입력(프로젝트 타입, 템플릿, 이름, 경로)을 프롬프트로 전달
3. 서브에이전트의 JSON Envelope를 그대로 사용자에게 전달 — 아래 "결과 보고" 규칙을 따른다
   (fenced `json` 블록으로 원문을 싣고, 그 아래 요약은 1~2줄만)

**delete 요청은 위임 전에 경로 확인부터**: 서브에이전트는 사용자에게 질문할 수 없습니다.
[Deleting a project](#deleting-a-project)의 Step 1(경로 확인)을 이 대화에서 먼저 마친 뒤,
사용자가 확정한 절대 경로만 프롬프트로 전달하세요 — 부분 이름을 그대로 넘기지 마세요.

### CLI Runners (Cline / Claude Code, ALL platforms)

Use the shipped CLI runners. Find the runner path, then run `node` on it.

#### Step 1: List templates for the user-selected type

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" list-templates --type <type>
```

> **Runner not found?** If none of the `~/.claude`, `~/.cline`, `~/.codex`, `~/.gemini` caches contains the runner, the tizen-sdk-skills plugin is NOT installed on this machine — install it first; do not improvise with other tools. (Contributors working inside the tizen-sdk-skills source repository can use the in-repo runner instead: `node common/lib/cli/<runner>.js`.)

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" list-templates --type <type>
```

**Bash — Linux / macOS / Ubuntu, and Windows Git Bash (Claude Code):**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" list-templates --type <type>
```

→ Show the returned template list to the user; they MUST pick one.

> **Where templates come from.** The `plugins/cache/...` path in the snippets above is only where the
> **runner** lives; templates are read from the **installed Tizen SDK** (`tz list templates`, under the
> highest installed `tizen-X.Y` profile — `result.profile` says which). The runner never returns an
> empty list as a success: `--type <type>` with no templates is a `template_not_found` **failure** whose
> message names the profile it looked at, the profiles `tz` knows, and the fix (platform package /
> .NET workload / TV SDK missing, or `TIZEN_TZ_PROFILE=<profile>` to list under another installed
> profile). Report that envelope — never conclude "no templates" from the cache, and never hand-write
> a project instead (issue #72).

**Codex sandbox (guard rule 12).** Run this runner's `list-templates` and `create` **with escalated
permissions**: the runner syncs the plugin's templates into `<sdk>/platforms/...` and `tz` works
inside the SDK tree, and Codex's default `workspace-write` sandbox blocks writes outside the
workspace. Inside the sandbox the runner has listed **zero** templates for an SDK that had them
(issue #72: `[WARN] Could not sync custom template 'BasicUI' into the SDK (... Read-only file
system)` followed by `No webapp templates under profile tizen-10.0`) — that answer is a sandbox
artefact, not a fact about the SDK. An envelope with `error_category: sandbox_blocked`, a
`template_not_found` whose details say the SDK directory "is not writable from this shell", or a
warning starting "Running inside Codex's sandbox", means exactly that — re-run
`suggested_fix.command` (the same command line, `escalate: true`) with escalated permissions;
do not retry inside the sandbox, do not install platform packages on that evidence, and do not
fall back to raw `tz`.

### Step 2: Create the project (all 4 arguments required)

**Windows:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" create --type <type> --template <template> --parent-path "<PARENT>" --name <APP>
```

```
node "<found-path>" create --type <type> --template <template> --parent-path "<PARENT>" --name <APP>
```

**Linux / macOS / Ubuntu:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
node "$CLI" create --type <type> --template <template> --parent-path "$PARENT" --name <APP>
```

Exit code: `0` = success envelope, `1` = failure/error envelope (JSON on stdout).

## Parameters

- **type** — `native` | `dotnet` | `webapp` | `rpk` | `tv` | `platform` (required)

**⚠️ CRITICAL: When asking the user to select a project type, ALL SIX types must be selectable — NEVER silently drop any:**

1. `native` — Native C/C++ app
2. `dotnet` — C# / .NET app
3. `webapp` — Web app
4. `rpk` — Standalone resource package (non-executable)
5. `tv` — Samsung TV web app
6. `platform` — Platform GBS-buildable sample app (e.g., `dali_demo`); builds to an `.rpm` whose `/usr/bin/<name>` binary is an executable app, launched via `tizen-install-app --run`

**⚠️ AskUserQuestion accepts AT MOST 4 options per question** — passing 5 or more
fails with `InputValidationError: too_big`. Never put all six types in one
question. Select the type in TWO steps instead:

- **Q1 (exactly 4 options):** `native` / `dotnet` / `webapp` / `기타 (rpk · tv · platform)…`
  — list all six type names in the question TEXT so nothing is hidden.
- **Q2 (only if 기타 was chosen, 3 options):** `rpk` / `tv` / `platform`

The 4-option cap applies to EVERY AskUserQuestion in this flow. When a template
list has more than 4 entries, show the full list as markdown text first, then ask
with the 3 most relevant templates plus a final `더 보기…` option that leads to a
follow-up question with the remaining ones.

- **template** — exact name from list-templates output (required; never auto-pick)
- **PARENT** — parent directory where `<APP>/` folder is created (required)
- **APP** — app name = folder name (required; ALWAYS from user via AskUserQuestion)
- **`--force`** — optional flag: replace `<PARENT>/<APP>/` if it already exists.
  Only replaces an empty folder or one that looks like a Tizen project — never an
  arbitrary directory. Without it, creation fails when the target folder exists.

## Deleting a project

Any request to remove a Tizen project ("프로젝트 삭제해줘", "delete MyApp", cleaning up
repeated fresh-project runs) is handled HERE, with the runner's `delete` action.

**NEVER `rm -rf` / `Remove-Item` / `del` a project yourself.** The deletion must run on
the SDK host: when the client runs on a different machine, a local `rm -rf` deletes a
client-side path (or nothing at all), exits 0, and leaves the project untouched on the
host while reporting success.

### Step 1: Confirm the exact path with the user (destructive — required)

Resolve the project path first and show it back to the user for confirmation before
running the delete. When you only have a partial name, find the candidates yourself:
search (Glob) the current workspace and the parent directories used by earlier create
runs for a folder of that name that carries a Tizen project marker. Do NOT infer the
target from a partial name when more than one project could match — ask which one
(e.g., via AskUserQuestion) and proceed only with the user-confirmed path.

This confirmation happens HERE in the main conversation, BEFORE any delegation — a
subagent cannot ask the user. When delegating to the `tizen-create-project` agent,
pass the confirmed absolute project path in the prompt, never a partial name.

### Step 2: Run the delete action

**Linux / macOS / Ubuntu (Bash), and Windows via Git Bash:**

```bash
BASE="$HOME/.cline"; [ -z "${CODEX_THREAD_ID:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SANDBOX:-}${CODEX_VERSION:-}" ] || BASE="$HOME/.codex"; [ -z "${GEMINI_CLI:-}" ] || BASE="$HOME/.gemini"; [ -z "${CLAUDECODE:-}" ] || BASE="$HOME/.claude"
CLI=$(ls "$BASE"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true
[ -n "$CLI" ] || for d in .claude .cline .codex .gemini; do CLI=$(ls "$HOME/$d"/plugins/cache/tizen-platform/tizen-sdk-skills/*/lib/cli/project-manager-cli.js 2>/dev/null | sort -V | tail -1) || true; [ -z "$CLI" ] || break; done
# ALWAYS pass the user-confirmed app name — the runner refuses the delete when
# the resolved folder name differs. Add --dry-run to preview: it runs every
# safety gate and reports the resolved physical path without deleting.
node "$CLI" delete --project "<PARENT>/<APP>" --expect-name "<APP>" --dry-run
node "$CLI" delete --project "<PARENT>/<APP>" --expect-name "<APP>"
```

**Windows — Cline (cmd.exe / PowerShell). Claude Code on Windows runs Git Bash — use the Bash block below:**

```
cmd /c dir /s /b "%USERPROFILE%\.claude\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.codex\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" "%USERPROFILE%\.gemini\plugins\cache\tizen-platform\tizen-sdk-skills\*project-manager-cli.js" 2>nul
```

**PowerShell (Codex CLI on Windows, Cline PowerShell terminal) — prefers this harness's own cache, then the newest version:**

```powershell
$h = ".cline"; if ($env:CODEX_THREAD_ID -or $env:CODEX_SANDBOX_NETWORK_DISABLED -or $env:CODEX_SANDBOX -or $env:CODEX_VERSION) { $h = ".codex" }; if ($env:GEMINI_CLI) { $h = ".gemini" }; if ($env:CLAUDECODE) { $h = ".claude" }
$CLI = $null; foreach ($d in @($h, ".claude", ".cline", ".codex", ".gemini")) { $CLI = Get-ChildItem "$env:USERPROFILE\$d\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\project-manager-cli.js" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Parent.Name } | Select-Object -Last 1 -ExpandProperty FullName; if ($CLI) { break } }
node "$CLI" delete --project "<PARENT>/<APP>" --expect-name "<APP>"
```

Pick the highest-version path (the PowerShell form above already resolved `$CLI`), then:

```
node "<found-path>" delete --project "<PARENT>/<APP>" --expect-name "<APP>"
```

(Same optional flags as above: `--expect-name <APP>` refuses a delete whose resolved
folder name differs; `--dry-run` runs the gates and previews without deleting.)

`--project` is the project ROOT directory (the `<APP>` folder itself, not its parent).
The action needs no Tizen SDK install — it is a pure filesystem operation on the host.

### What the runner refuses (surface the message as-is)

The delete is gated, so a mistyped path cannot wipe an unrelated directory. It returns
`invalid_parameters` and deletes nothing when the target:

- carries no Tizen project marker — `tizen_{native,dotnet,web,resource}_project.yaml`,
  `tizen-manifest.xml`, `project_def.prop`, `.tproject`, a `config.xml` in the
  `tizen.org` namespace, a Tizen-referencing `.csproj`, or GBS `CMakeLists.txt` +
  `packaging/*.spec` (a solution folder — top-level `*.sln` with one of these
  markers in an immediate subdirectory — also counts);
- is a filesystem root, the home directory, or any ancestor of it (`C:\Users`, `/home`);
- is a symbolic link / junction (pass the real directory path instead);
- is not a directory;
- (with `--expect-name`) has a folder name that differs from the confirmed app name.

A missing directory returns `io_error`. With `--dry-run` the same gates run and success
returns `{project_path, status: "dry-run"}` without deleting. On a real delete, `result`
is `{project_path, status: "deleted"}`.

**Do not work around a refusal with a shell delete.** If the user insists a non-project
directory must go, tell them to remove it manually — that decision is theirs, not a
retry with different tooling.

## RPK resource-package projects

`rpk` creates a standalone resource package, identified by `tizen_resource_project.yaml`.
Its resources go in the generated `res/` directory. The runner creates it with
`tz new -t rpk_app -T rpk -p tizen-10.0`; do not substitute the Tizen IDE
`create resource-project` command or hand-create the metadata. RPK is resource-only, so
it cannot be launched after installation.

This is distinct from a .NET project configured with `pack_as_rpk: true`: that project
remains `dotnet` (it has a `.csproj` and `tizen_dotnet_project.yaml`) even though its
build artifact is `.rpk`.

## Path Determination

**APP is ALWAYS the user-provided name.** PARENT depends on whether a folder is open:

- **Folder open in VS Code / Cline** (DEFAULT): PARENT = current working directory → creates `<cwd>/<APP>/`
- **No folder open**: PARENT = `~/tizen-apps` → creates `~/tizen-apps/<APP>/`

Example: open folder `C:/ws`, user names app `MyTizenWebApp`
→ `node "$CLI" create --type webapp --template Basic --parent-path "C:/ws" --name "MyTizenWebApp"` → creates `C:/ws/MyTizenWebApp/`

**AskUserQuestion JSON safety:** paths in question/option text must use forward slashes only (e.g., `~/tizen-apps`, `C:/Users/...`). Raw backslashes break JSON parsing.

## What createProject() handles internally

1. Parameter validation (type, template, paths, app name)
2. OS detection (Windows/Linux/macOS)
3. Script location and execution (`tizen-create-project.ps1` or `.sh`)
4. Directory validation (parent path exists)
5. Project creation via `tz new`
6. Success verification (project folder created)
7. Standard JSON Envelope response with project info
8. VS Code workspace file creation (not opened; pass `--open` to also open it in VS Code)

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

러너의 stdout JSON Envelope는 **도구 결과 안에 있어서 사용자에게는 보이지 않는다**
(Claude Code UI는 Bash/Agent 결과를 "Ran 1 shell command"처럼 접어 둔다). 사용자에게
보이는 것은 최종 답변 텍스트만이므로, 최종 답변은 **어느 실행 경로(서브에이전트 위임 /
CLI Runner 직접 실행)든** 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 러너를 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Handoff

**Scope check:**

- **Single-task request** (e.g., "프로젝트 만들어줘") → DONE. Report the envelope and stop. You may mention `tizen-build-project` as a possible next step **in text only — never invoke it yourself**.
- **Multi-step request** (e.g., "앱 만들어서 빌드해줘") → Continue to next step.

- If templates are missing, direct user to `tizen-sdk-install` first.
- For DotNET projects, ensure `tizen-dotnet-setup` has run first.

**Suggested next steps (only when user asks):**

- `tizen-build-project` to build the project
- For debugging: Native → `tizen-gdb-debug`, DotNET → `tizen-dotnet-debug`
