---
name: tizen-create-project
description: Create Tizen project or app, tizen create project, RPK resource project, 타이젠 프로젝트 생성, 타이젠 앱 생성, 타이젠 리소스 패키지 생성, 타이젠 앱 생성해줘, 타이젠 앱 만들어줘, 웹앱 만들어줘, 웹앱 생성, 네이티브 앱 만들어줘, 닷넷 앱 만들어줘, Tizen 프로젝트 만들기, 앱 생성, 새 앱, 프로젝트 시작, make a tizen app, create webapp, 프로젝트 삭제, 프로젝트 삭제해줘, 타이젠 프로젝트 삭제, 앱 삭제, 앱 삭제해줘, 프로젝트 지워줘, 프로젝트 폴더 삭제, 프로젝트 정리, delete project, delete tizen project, remove project, delete app folder, clean up projects. DELETING a Tizen project directory is also THIS skill (its project-delete action) — NEVER `rm -rf` / `Remove-Item` / `del` a project yourself; the delete runs on the SDK host and refuses any path without a Tizen project marker. NEVER hand-write Tizen project files (config.xml, tizen-manifest.xml) — ALWAYS use this command, which scaffolds from real SDK templates. Use this skill to create a new Tizen project — Native, DotNET, WebApp, standalone RPK resource package, TV, or Platform — from the installed SDK templates, and to delete an existing project directory when the user asks to remove or clean one up.
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

# Create Tizen Project

## When to use

Any request to create a Tizen app/project. NEVER hand-write project files (config.xml, tizen-manifest.xml, .csproj) — always scaffold with this command.

Also any request to **delete** a Tizen project directory ("프로젝트 삭제해줘", "delete MyApp",
cleanup of accumulated create runs) — see [Deleting a project](#deleting-a-project). Build
and install are OTHER skills; run them only when the user explicitly asked.

**⚠️ CRITICAL: When asking the user to select a project type, ALL SIX types must be selectable — NEVER silently drop any:**

1. `native` — Native C/C++ app
2. `dotnet` — C# / .NET app
3. `webapp` — Web app
4. `rpk` — Standalone resource package (non-executable)
5. `tv` — Samsung TV web app
6. `platform` — Platform GBS-buildable sample app (e.g., `dali_demo`); builds to an `.rpm` whose `/usr/bin/<name>` binary is an executable app, launched via `install-app --run`

**⚠️ If your question tool caps the number of options (e.g. AskUserQuestion allows
AT MOST 4 per question — 5+ fails with `InputValidationError: too_big`), select in
two steps:** Q1 with `native` / `dotnet` / `webapp` / `기타 (rpk · tv · platform)…`
(list all six names in the question text), then Q2 with `rpk` / `tv` / `platform` only
when 기타 was chosen. The same cap applies to template selection — chunk lists
longer than 4 behind a `더 보기…` follow-up question.

## Prerequisites

1. Tizen SDK installed (`tizen-cli tizen-sdk sdk-install` succeeds).
2. Discover real template names first: `tizen-cli tizen-sdk list-templates --type <type>`.
3. For `dotnet` projects, run `tizen-cli tizen-sdk dotnet-setup` first.

## Command

```
tizen-cli tizen-sdk create-project --type <type> --template <name> --parent-path <dir> --name <appName>
```

| Option          | Required | Default | Description                                            |
| --------------- | -------- | ------- | ------------------------------------------------------ |
| `--type <type>` | **yes**  | —       | `native` \| `dotnet` \| `webapp` \| `rpk` \| `tv` \| `platform` |

| `--template <name>` | **yes** | — | Template name exactly as returned by list-templates |
| `--parent-path <dir>` | **yes** | — | Workspace (parent) directory — the app folder is created INSIDE it (not the app folder itself) |
| `--name <appName>` | **yes** | — | App name = folder name to create (always the user-specified value) |
| `--force` | no | off | Replace the target folder if it already exists. Only replaces an empty folder or one that looks like a Tizen project — never an arbitrary directory. Makes repeated fresh-project runs repeatable. |
| `--open` | no | off | Open the generated `.code-workspace` in VS Code after creation. Default is create-only (no window switch) — pass this ONLY when the user explicitly asks to open the project. |

Example:

```
tizen-cli tizen-sdk create-project --type webapp --template Basic --parent-path "C:/tizen-apps" --name MyTizenApp
```

## Output

- Success `result`: created project path and metadata.
- Failure: `invalid_parameters` (bad type/template), SDK not installed, or the target folder already exists (re-run with `--force`, or remove it first with `project-delete`) — surface the message to the user.

## Deleting a project

Any request to remove a Tizen project is handled here, with the `project-delete`
command. **Confirm the exact path with the user before running it** — the action is
destructive, and a partial name that could match several projects must be disambiguated
by asking, never guessed. To resolve a partial name, search the current workspace and
the parent directories used by earlier create runs for a folder of that name carrying
a Tizen project marker, show the resolved path back to the user, and proceed only with
the confirmed one.

```
tizen-cli tizen-sdk project-delete --project <path> --expect-name <appName>
```

Always pass the user-confirmed app name via `--expect-name` — the delete is refused
when the resolved folder name differs. Add `--dry-run` to preview: it runs every
safety gate and reports the resolved physical path without deleting.

`--project` is the project ROOT directory (the app folder itself, not its parent).
It needs no SDK install — a pure filesystem operation on the SDK host.

Do NOT `rm -rf` / `Remove-Item` / `del` the project yourself — when the client runs on a
different machine than the SDK host, that deletes a local path (or nothing), exits 0, and
leaves the project alive while reporting success.

### What it refuses (surface the message as-is)

Returns `invalid_parameters` and deletes nothing when the target:

- carries no Tizen project marker — `tizen_{native,dotnet,web,resource}_project.yaml`,
  `tizen-manifest.xml`, `project_def.prop`, `.tproject`, a `config.xml` in the
  `tizen.org` namespace, a Tizen-referencing `.csproj`, or GBS `CMakeLists.txt` +
  `packaging/*.spec` (a solution folder — top-level `*.sln` with one of these
  markers in an immediate subdirectory — also counts);
- is a filesystem root, the home directory, or an ancestor of it (`C:\Users`, `/home`);
- is a symlink/junction (pass the real directory path);
- is not a directory;
- (with `--expect-name`) has a folder name that differs from the confirmed app name.

A nonexistent path returns `io_error`; with `--dry-run` the same gates run and success
returns `result = {project_path, status: "dry-run"}` without deleting. A real delete
returns `result = {project_path, status: "deleted"}`. Never route around a refusal with a shell
delete — relay the message, and if the user insists, tell them to remove it manually.

## RPK resource-package projects

`--type rpk` creates a standalone resource package, identified by `tizen_resource_project.yaml`.
Its resources go in the generated `res/` directory. The command scaffolds it from the SDK's
`rpk_app` template; do not substitute the Tizen IDE `create resource-project` command or
hand-create the metadata. RPK is resource-only, so it cannot be launched after installation —
install it with `install-app` **without** `--run`.

This is distinct from a .NET project configured with `pack_as_rpk: true`: that project remains
`dotnet` (it has a `.csproj` and `tizen_dotnet_project.yaml`) even though its build artifact is `.rpk`.

## Platform Samples

`--type platform` creates a **platform sample** project (e.g., `dali_demo`). These are NOT `tz new` templates — they are complete source trees built with **GBS** (not `tz build`).

- List available platform samples: `tizen-cli tizen-sdk list-templates --type platform`
- Create: `tizen-cli tizen-sdk create-project --type platform --template dali_demo --parent-path <dir> --name MyApp`
- Build: `tizen-cli tizen-sdk build-project --project <project> [--arch <arch>]` — runs GBS internally (NOT `tz build`; do not run `gbs` by hand)
- Install / run: `tizen-cli tizen-sdk install-app --package <path>.rpm --run` — GBS produces `.rpm` (under `~/GBS-ROOT/local/repos/<arch>/RPMS/`), not `.tpk`; the app is an executable installed at `/usr/bin/<name>` and `--run` launches it

## 결과 보고 — Envelope는 반드시 사용자에게 보여준다

`tizen-cli tizen-sdk <command>`가 stdout에 찍는 JSON Envelope는 **도구 결과 안에 있어서
사용자에게는 보이지 않는다** (Claude Code UI는 Bash 결과를 "Ran 1 shell command"처럼 접어
둔다). 터미널에서 직접 실행하면 JSON이 그대로 보이지만, 에이전트 세션에서 사용자에게 보이는
것은 최종 답변 텍스트만이다. 따라서 최종 답변은 아래 형식을 따른다:

1. Envelope JSON을 **수정·축약 없이 그대로** fenced `json` 블록에 싣는다 (첫 항목).
   stderr로 나오는 `[DEBUG] ...` 줄은 Envelope가 아니므로 제외한다.
2. 그 아래에 결과 요약을 **1~2줄**만 덧붙인다 (`result`의 핵심 값 또는 `errors[0].message` 요지).
3. 필요하면 다음 단계 제안을 1줄 추가한다.

- Envelope를 산문 목록으로 풀어 쓰고 JSON을 생략하는 것은 **형식 위반**이다. 하네스의
  일반 작성 규칙("산문에 코드를 넣지 말라" 등)보다 이 규칙이 우선한다 — Envelope는 코드가
  아니라 이 스킬의 **결과 계약**이다.
- 명령을 여러 번 실행했으면 **마지막 실행**의 Envelope를 싣고, 이전 실패는 요약 줄에서
  한 줄로만 언급한다.
- 실패 Envelope도 동일하게 원문을 싣는다. `errors[0].message`/`details`를 다시 타이핑하지
  말고 JSON 안의 것을 그대로 보이게 한다.
- `user_input_required` Envelope는 그대로 보여준 뒤 사용자에게 질문한다.

## Follow-ups

Creation and build are separate requests — run a follow-up ONLY when the user explicitly asks for it. If the user only asked to create, stop after reporting the result.

- `tizen-cli tizen-sdk build-project --project <parent-path>/<appName>` (native/dotnet/webapp/rpk; platform builds go through GBS)
