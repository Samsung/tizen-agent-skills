# tizen-agent-skills

[English](README.md) | 한국어

**AI 코딩 에이전트를 위한 타이젠(Tizen) 개발 스킬 및 플러그인 모음입니다.**

`tizen-agent-skills`는 AI 코딩 어시스턴트에 **타이젠 플랫폼 개발 환경**을 가져다 주는
삼성전자의 오픈소스 에이전트 스킬·플러그인 모음입니다. 이 저장소의 플러그인은 각각 타이젠 개발의
한 영역을 담당하며 따로 설치할 수 있습니다. 첫 번째 플러그인인 `tizen-sdk-skills`를 설치하면 한국어나 영어로 요청하는 것만으로 에이전트가
타이젠 SDK를 설치하고, 타이젠 웹(.wgt), 네이티브(.tpk), .NET, RPK, RPM 패키지를 생성·빌드하고,
타이젠 및 삼성 TV 에뮬레이터를 실행하고, `sdb`로 디바이스를 관리하고, 패키지에 서명하고, 원격
디버깅하고, `dlog`를 분석합니다.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Samsung/tizen-agent-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Samsung/tizen-agent-skills/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/Samsung/tizen-agent-skills?style=social)](https://github.com/Samsung/tizen-agent-skills/stargazers)

## 이 저장소의 플러그인

최상위 디렉터리 하나가 독립적으로 버전 관리되는 플러그인 하나이며, 각자 README, 변경 이력,
릴리스 태그(`<plugin>-vX.Y.Z`)를 가집니다. 타이젠 플랫폼을 위한 플러그인이 앞으로 계속 추가될
예정입니다.

<!-- plugins:start -->
| 플러그인 | 하는 일 | 지원 호스트 | 버전 | 설치 및 문서 |
|---|---|---|---|---|
| [`tizen-sdk-skills/`](tizen-sdk-skills/) | 타이젠 SDK를 처음부터 끝까지 자동화: SDK 설치, 프로젝트 생성, 빌드, 에뮬레이터·디바이스 관리, 앱 설치, 원격 디버깅(GDB / netcoredbg / CDP), 인증서, dlog 분석, Playwright 테스트. 스킬 29개, 에이전트 24개, 독립 실행 `tizen-sdk` CLI, VS Code용 Tizen AI Extension 포함. | Claude Code, Cline, Codex CLI, Gemini CLI, VS Code, 독립 실행 CLI | 1.4.1 | [빠른 시작](tizen-sdk-skills/README.ko.md#빠른-시작) · [README](tizen-sdk-skills/README.ko.md) · [English](tizen-sdk-skills/README.md) · [스킬 레퍼런스](tizen-sdk-skills/docs/SKILLS_REFERENCE.md) |
| [`tizen-action-skills/`](tizen-action-skills/) | Tizen Action Framework provider 개발: 기본 Action 카테고리 선택 또는 custom `.action`/`.entity` 작성, C#·C++·JavaScript·Flutter-Tizen/Dart용 `actionc`/TIDL stub 생성, provider metadata 등록, `action-tool` 검증. 스킬 1개. | Claude Code | 1.0.0 | [README](tizen-action-skills/README.ko.md) · [English](tizen-action-skills/README.md) |
<!-- plugins:end -->

## 빠른 시작

사전 요구사항: **Node.js 20+** 와 **Git**.

1. 저장소를 클론합니다.

   ```bash
   git clone https://github.com/Samsung/tizen-agent-skills.git
   ```

2. 사용할 플러그인 디렉터리로 이동해 그 플러그인의 빠른 시작을 따릅니다. 모든 플러그인은
   호스트별 setup 스크립트(`claude/`, `cline/`, `codex/` 등)를 제공하며, 이 스크립트가 해당
   호스트에 스킬·에이전트·훅을 설치합니다.
3. AI 코딩 어시스턴트를 재시작하고 원하는 작업을 자연어로 요청합니다.

`tizen-sdk-skills`는 [tizen-sdk-skills 빠른 시작](tizen-sdk-skills/README.ko.md#빠른-시작)부터
보세요. 첫 요청은 "타이젠 SDK 설치해줘"입니다.

## 대표 플러그인: tizen-sdk-skills

| 영역 | 스킬 |
|---|---|
| SDK 설치·설정 (10) | `tizen-sdk-install`, `tizen-sdk-install-custom-repo`, `tizen-sdk-init`, `tizen-update-package`, `tizen-platform-install`, `tizen-download-emulator-package`, `tizen-download-mobile-platform`, `tizen-tv-sdk-install`, `tizen-tv-sdk-install-from-zip`, `tizen-install-rootstrap` |
| 환경 점검 (3) | `tizen-check-node`, `tizen-check-disk-space`, `tizen-dotnet-setup` |
| 프로젝트·빌드 (2) | `tizen-create-project` (웹, 네이티브, .NET, TV, RPK, Platform/GBS), `tizen-build-project` |
| 에뮬레이터·디바이스 (7) | `tizen-create-emulator`, `tizen-launch-emulator`, `tizen-device-manager`, `tizen-remote-device`, `tizen-sdb-helper`, `tizen-file-transfer`, `tizen-screenshot` |
| 설치·디버깅·테스트 (6) | `tizen-install-app`, `tizen-gdb-debug` (네이티브), `tizen-dotnet-debug` (.NET / netcoredbg), `tizen-webapp-debug` (웹 / RWI / CDP), `tizen-playwright-test`, `tizen-dlog-analyzer` |
| 인증서 (1) | `tizen-certificate-manager` (로컬 및 삼성 온라인 CA 프로파일) |

상세 설명, 트리거 문구, `tizen-sdk` CLI 명령 35개는 플러그인의
[README](tizen-sdk-skills/README.ko.md)와 [스킬 레퍼런스](tizen-sdk-skills/docs/SKILLS_REFERENCE.md)에
있습니다.

## 저장소 구조

```
tizen-agent-skills/
├── .claude-plugin/marketplace.json   # 이 저장소의 모든 플러그인 카탈로그
├── <plugin-name>/                    # 플러그인마다 디렉터리 하나
│   ├── common/                       #   AI 호스트가 로드하는 플러그인 루트 (skills/, agents/, hooks/, lib/)
│   ├── claude/ cline/ codex/ ...     #   호스트별 setup 래퍼
│   ├── docs/                         #   플러그인 문서
│   └── README.md · README.ko.md · CHANGELOG.md
├── tizen-sdk-skills/                 # 플러그인 1: 타이젠 SDK 자동화 (+ tizen-cli/, vscode/)
├── llms.txt                          # LLM 기반 도구를 위한 기계 판독용 요약
└── CONTRIBUTING.md                   # 저장소 공통 규칙 ("Adding a new plugin" 포함)
```

새 플러그인이 따라야 하는 디렉터리·등록 규칙은
[Adding a new plugin](CONTRIBUTING.md#adding-a-new-plugin)을 참고하세요.

## 관련 링크

- [Tizen](https://www.tizen.org/) · [타이젠 개발자 문서](https://docs.tizen.org/)
- [Samsung Developers: Smart TV](https://developer.samsung.com/smarttv)
- [Claude Code 플러그인](https://code.claude.com/docs/en/plugins)

## 기여

저장소 공통 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를, 브랜치 흐름·커밋 스타일·테스트 티어는
각 플러그인의 `CONTRIBUTING.md`를 참고하세요. 모든 참여자는
[행동 강령](CODE_OF_CONDUCT.md)을 따라야 합니다.

AI 코딩 에이전트는 저장소 작업 시 적용되는 기술 규칙 요약인 [AGENTS.md](AGENTS.md)도
참고하세요.

보안 문제는 공개 이슈 대신 [SECURITY.md](SECURITY.md)의 절차를 따라 주세요.

## 라이선스

Copyright 2026 Samsung Electronics Co., Ltd.

[Apache License, Version 2.0](LICENSE)에 따라 배포됩니다. 개별 플러그인이 번들하는 서드파티
구성 요소는 각 플러그인의 `NOTICE` 파일에 나열되어 있습니다.
