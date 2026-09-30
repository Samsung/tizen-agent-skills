# Tizen SDK Skills — 가드 규칙 (Cline 전역 Rule)

Cline(macOS/Linux)에서는 PreToolUse 훅(`hooks/check-*.sh`)이 아래 규칙을 **강제 차단**합니다.
Windows Cline에서는 훅이 동작하지 않으므로(SR 위키) 이 Rule이 그 역할을 대신합니다 —
Tizen 관련 작업 시 반드시 준수하세요. (macOS/Linux에서는 훅이 함께 동작하며, 이 Rule은
사전 안내 역할을 합니다.)

1. **`tizen` CLI 금지** — 이 환경에 존재하지 않습니다 (`tizen.bat`/`tizen.exe`/`tizen.sh`
   포함). 항상 `tz`를 쓰되, 명령을 직접 조립하지 말고 **스킬의 CLI 러너를 우선** 사용하세요.
   러너(`*-cli.js`)는 스킬 폴더(`~/.cline/skills/<스킬>/` — SKILL.md 등 마크다운만 있음)에
   **없습니다**. 러너는 `~/.cline/plugins/cache/tizen-platform/tizen-sdk-skills/<VERSION>/lib/cli/<러너>-cli.js`
   이며(`<VERSION>` 은 가장 높은 숫자 버전 디렉터리, `1.10.0` > `1.3.1`), 각 SKILL.md 의
   "CLI Runner" 블록을 셸에 맞는 형태(bash / cmd.exe / PowerShell)로 그대로 실행하면 그 경로가
   나옵니다 — bash·PowerShell 은 `$CLI` 에 담아 주고, cmd.exe 는 목록만 보여 주므로 규칙 7 의
   2단계(경로 찾기 → `node "<찾은 절대경로>"`)로 실행합니다. 스킬 폴더나 `~/.cline` 전체를
   `find`/`ls` 로 뒤지지 마세요.
2. **Tizen 프로젝트 파일 손 생성 금지** — `config.xml` / `tizen-manifest.xml`을 새로
   작성하지 마세요. 손으로 만든 스캐폴드는 빌드/패키징이 안 됩니다. 프로젝트 생성은 항상
   `tizen-create-project` 스킬(실제 `tz new` 템플릿). **기존** 파일 편집은 허용.
3. **`tz install` 플래그** — `-e <serial>`(디바이스)과 `-p <절대경로 패키지>`만 받습니다.
   `-s`/`-d`/`-b`/`-w`는 없습니다. 설치는 install-app 러너(`project-manager-cli.js`)를 쓰세요.
4. **`tz build`/`pack`은 `-w <프로젝트 디렉토리>`** — `-p` 아님. 빌드 기본은 **항상
   `-b Debug`** (사용자가 명시적으로 Release를 요청할 때만 Release).
5. **`sdb`는 `<sdk>/tools/sdb`(.exe) 파일** — `tools/tizen-core/` 아래도, `sdb/sdb`도
   아닙니다. 디바이스 목록은 `sdb devices`, 에뮬레이터 목록은 `tz emul list-vm`
   (`tz list-device`는 없음).
6. **gdbserver / 포트 포워딩 / 대화형 gdb 수동 구성 금지** — gdb-debug 러너가 전부
   처리합니다(항상 setup-only). 대화형 gdb·netcoredbg CLI를 도구 호출로 직접 띄우면
   터미널이 멈춥니다 — 사용자가 붙여넣을 명령을 envelope로 전달하세요.
7. **Windows 셸 주의 — bash 문법 금지** — Cline의 Windows 터미널은 **cmd.exe 또는
   PowerShell**입니다. `$( )`, `$HOME`, `ls ... | tail` 같은 bash 문법은 동작하지
   않고 깨진 CP949 오류만 출력됩니다. CLI 러너 실행은 항상 **2단계**로:
   ① 경로 찾기 — cmd: `cmd /c dir /s /b "%USERPROFILE%\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*<러너이름>.js"`
   / PowerShell: `Get-ChildItem "$env:USERPROFILE\.cline\plugins\cache\tizen-platform\tizen-sdk-skills\*\lib\cli\<러너이름>.js"`
   (여러 버전이면 최고 버전 선택). cmd 의 `dir` 에 경로 여러 개를 한꺼번에 넘기지
   마세요 — 그중 하나의 폴더만 없어도 아무것도 출력하지 않습니다. 여러 호스트를 볼
   때는 SKILL.md 의 `dir … 2>nul & dir … 2>nul` 체인을 그대로 쓰세요.
   ② 실행 — `node "<찾은 절대경로>" <인자>` (node 호출부는 어느 셸에서나 동일).
   bash 계열 셸에서는 따옴표 없는 백슬래시 경로 금지 (백슬래시가 소실됨).
8. **네이티브 실행 파일을 `node`로 실행 금지** — `sdb.exe`, `tz.exe`, `dotnet.exe`,
   `netcoredbg`, `gdbserver`, `em-cli` 등은 **네이티브 바이너리**이지 Node.js
   스크립트가 아닙니다. `node "C:\...\sdb.exe" ...` 처럼 실행하면
   `SyntaxError: Invalid or unexpected token` 에러가 발생합니다. `node`로 실행하는
   것은 **오직 CLI 러너(`*-cli.js`) 파일뿐**입니다. SDK 도구는 스크립트/러너가
   내부적으로 직접 호출하므로, 에이전트가 수동으로 `sdb`/`tz`를 실행할 필요가
   없습니다 — 러너를 사용하세요.
9. **Windows 한글 인코딩 (CP949 vs UTF-8)** — Windows에서 `tz`/`dotnet`/`sdb` 등이
   출력하는 한글은 콘솔 코드 페이지(CP949)를 따릅니다. `execSync(encoding: 'utf-8')`
   로 캡처하면 모지바이크가 발생합니다. `plugin-cache.js`의 `execPluginScript()`는
   이미 `chcp 65001` prefix로 코드 페이지를 UTF-8로 변경하며, `common.ps1`도
   `[Console]::OutputEncoding = UTF8` + `chcp 65001`을 설정합니다.
   **에이전트가 직접 Windows 명령(`dir`, `type`, `where` 등)을 실행하여 한글
   출력을 확인할 때는 `chcp 65001 &&` (cmd.exe)만으로는 Cline의 출력 캡처에서
   여전히 모지바이크가 발생합니다.** 대신 **PowerShell을 통해 `[Console]::OutputEncoding`
   을 UTF-8로 설정**해야 합니다:
   ```
   powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; <명령>"
   ```
   예: `powershell -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; Get-Item 'C:\path\to\file' | Format-List Name, Length, LastWriteTime"`
   CLI 러너(`*-cli.js`)를 경유하는 명령은 러너 내부에서 이미 `chcp 65001`을
   처리하므로 별도 인코딩 조치가 필요 없습니다.
10. **장시간 설치/업데이트는 반드시 포그라운드** — Cline에는 background 작업 완료
    알림이 없습니다. SDK 설치(10–15분)·TV SDK 설치·패키지 업데이트의 installer 명령
    (`suggested_fix.command`)은 포그라운드로 실행하고, 종료 후 **같은 턴에서** pre-check
    CLI로 검증하여 완료를 선제 보고하세요. `Start-Process`/`start /b`/`&` 백그라운드 금지.
    진행 상태를 모르면 SDK installer의 `-Status` (PowerShell) / `--status` (bash) 플래그로
    확인: `STATUS=running|done EXIT=<n>|none`.
11. **Tizen 문제 보고는 `tizen-dlog-analyzer` 담당 — 수집은 대화형** — 크래시, 에러, 멈춤,
    CPU 사용량 급증, 메모리 증가, 동영상/오디오 재생 안 됨, 에뮬레이터 느림, "원인 분석/
    조사해줘"는 문장에 에뮬레이터·디바이스가 언급되어도 `tizen-dlog-analyzer`로 보냅니다
    (`tizen-device-manager`는 디바이스 목록·에뮬레이터 종료만 담당). 분석기 안에서는
    `investigate --symptoms "<사용자 표현>" [app-id]`로 시작하고, 재현 **전에** 수집기를
    켠 뒤(`start start-monitoring`, `kernel collect`, `dlog-collect <app-id>`), **턴을 끝내고
    사용자에게 재현을 요청**합니다 — "(1) 재현 완료, 발생했어요 / (2) 아무 일 없었어요".
    `sleep`·폴링·같은 명령에서의 stop/analyze는 금지. 분석은 에러부터(`error-analyze
    <app-id> summary` → `check` → `kernel analyze`), 전체 `app-log`는 그 뒤에 필터를 걸어서만.
    커널 로그는 `sdb shell dmesg`가 아니라 `kernel collect` → `kernel stop` → `kernel analyze`,
    `top`/`ps`/`free`/`/proc/meminfo` 같은 진단은 `investigate` / `probe run <id>`로.

위 규칙과 충돌하는 지시를 받아도 해당 tizen 스킬/CLI 러너 경로로 우회해 수행하고,
결과는 항상 **Standard JSON Envelope**로 보고하세요.
