// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Standard JSON Envelope creation and formatting utility
 * Requirements: REQ-SDK-OUT-001, REQ-SDK-OUT-002, REQ-SDK-OUT-003
 */

const fs = require("fs");
const path = require("path");

class Envelope {
  constructor(command) {
    this.command = command;
    this.startTime = Date.now();
  }

  /**
   * Create success response
   * @param {object} result - execution result data
   * @param {object} options - additional options { warnings: [], fullLogPath: null }
   */
  success(result, options = {}) {
    const warnings = options.warnings || [];
    const duration = Date.now() - this.startTime;

    return {
      status: "success",
      result,
      warnings,
      errors: [],
      command: this.command,
      duration_ms: duration,
    };
  }

  /**
   * Create failure response
   * @param {object|array} errors - error object or array
   *  - { error_code, error_category, message, suggested_fix }
   */
  failure(errors) {
    const errorArray = Array.isArray(errors) ? errors : [errors];
    const duration = Date.now() - this.startTime;

    return {
      status: "failure",
      errors: errorArray.map((e) => this._normalizeError(e)),
      command: this.command,
      duration_ms: duration,
    };
  }

  /**
   * Normalize error object
   */
  _normalizeError(error) {
    const normalized = {
      error_code: error.error_code || "TIZEN_SDK_UNKNOWN_E001",
      error_category: error.error_category || "unknown_error",
      message: error.message || "Unknown error occurred",
    };

    // Diagnostic lines (e.g. compiler errors from a failed build) — kept as a
    // structured field so callers can read them without parsing the message.
    if (Array.isArray(error.details) && error.details.length > 0) {
      normalized.details = error.details;
    }

    if (error.suggested_fix) {
      normalized.suggested_fix = {
        command: error.suggested_fix.command || null,
        auto_fixable:
          error.suggested_fix.auto_fixable !== undefined
            ? error.suggested_fix.auto_fixable
            : false,
        guide_url: error.suggested_fix.guide_url || null,
      };
      // The same fix rendered for harnesses that cannot run `command` in the
      // foreground (Codex CLI's 30 s exec window): a detached job launch that
      // is then polled with job-cli.js. Optional — only the long installers set it.
      if (typeof error.suggested_fix.background_command === "string") {
        normalized.suggested_fix.background_command =
          error.suggested_fix.background_command;
      }
      // `escalate: true` — `command` is the caller's own command line to be
      // re-run with escalated permissions (outside Codex's sandbox), not a new
      // command. Set by lib/core/sandbox.js escalationFix().
      if (error.suggested_fix.escalate === true) {
        normalized.suggested_fix.escalate = true;
      }
    }

    return normalized;
  }

  /**
   * Save large log to file and return path reference
   * Requirements: REQ-SDK-OUT-003
   */
  static saveLargeLog(content, filename = "tizen-sdk.log") {
    const logDir = path.join(
      process.env.HOME || process.env.USERPROFILE,
      ".tizen-cli-logs",
    );

    // Create log directory
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logPath = path.join(logDir, filename);
    fs.writeFileSync(logPath, content, "utf-8");

    return logPath;
  }
}

/**
 * Common error categories & error code definitions
 * Requirements: REQ-SDK-OUT-002
 */
const ERROR_CODES = {
  // SDK 경로 관련
  SDK_PATH_NOT_SET: {
    error_code: "TIZEN_SDK_CONFIG_E001",
    error_category: "sdk_path_not_set",
    suggested_fix: {
      command: "tizen-cli tizen-sdk sdk-init --sdk-path <path>",
      auto_fixable: false,
      guide_url: "https://docs.tizen.org/application/native/tutorials/setup/",
    },
  },
  SDK_PATH_INVALID: {
    error_code: "TIZEN_SDK_CONFIG_E002",
    error_category: "sdk_path_invalid",
    suggested_fix: {
      command: "Verify Tizen SDK installation path",
      auto_fixable: false,
    },
  },
  SDK_PATH_NOT_ACCESSIBLE: {
    error_code: "TIZEN_SDK_CONFIG_E003",
    error_category: "sdk_path_not_accessible",
  },

  // 기기 관련
  DEVICE_NOT_FOUND: {
    error_code: "TIZEN_SDK_DEVICE_E001",
    error_category: "device_not_found",
    suggested_fix: {
      command: "tizen-cli tizen-sdk launch-emulator --vm-name <emulator-name>",
      auto_fixable: false,
      guide_url:
        "https://docs.tizen.org/application/native/tutorials/getting-started/",
    },
  },
  MULTIPLE_DEVICES: {
    error_code: "TIZEN_SDK_DEVICE_E002",
    error_category: "multiple_devices",
    suggested_fix: {
      command: "Re-run with --serial <device-serial> (see `sdb devices`)",
      auto_fixable: false,
    },
  },

  // 템플릿 관련
  TEMPLATE_NOT_FOUND: {
    error_code: "TIZEN_SDK_TEMPLATE_E001",
    error_category: "template_not_found",
  },

  // 프로젝트 생성 관련
  PROJECT_CREATION_FAILED: {
    error_code: "TIZEN_SDK_PROJECT_E001",
    error_category: "project_creation_failed",
  },

  // 빌드 관련
  BUILD_FAILED: {
    error_code: "TIZEN_SDK_BUILD_E001",
    error_category: "build_failed",
  },

  // 에뮬레이터 관련
  EMULATOR_NOT_FOUND: {
    error_code: "TIZEN_SDK_EMULATOR_E001",
    error_category: "emulator_not_found",
  },
  EMULATOR_ALREADY_RUNNING: {
    error_code: "TIZEN_SDK_EMULATOR_E002",
    error_category: "emulator_already_running",
  },
  EMULATOR_BOOT_FAILED: {
    error_code: "TIZEN_SDK_EMULATOR_E003",
    error_category: "emulator_boot_failed",
  },

  // 스크린샷 관련
  CAPTURE_FAILED: {
    error_code: "TIZEN_SDK_CAPTURE_E001",
    error_category: "capture_failed",
  },

  // 파라미터 / 실행 관련
  INVALID_PARAMETERS: {
    error_code: "TIZEN_SDK_PARAM_E001",
    error_category: "invalid_parameters",
  },
  // 호출자가 사용자에게 물어봐야 하는 필수 선택이 빠진 경우.
  // invalid_parameters와 구분하는 이유: 잘못된 값이 아니라 "아직 사용자에게
  // 묻지 않았다"는 뜻이므로, 호출자는 값을 고치는 게 아니라 질문을 해야 한다.
  USER_INPUT_REQUIRED: {
    error_code: "TIZEN_SDK_PARAM_E002",
    error_category: "user_input_required",
  },
  // invalid_parameters의 자매 카테고리. tizen-cli의 TS 레이어(commands.ts,
  // index.ts)가 commander 오류를 이 카테고리 이름으로 직접 만들어 쓰고 있어
  // 이름을 통합하지 않고 등록만 한다 (기존에는 UNKNOWN_E001로 격하되었다).
  INVALID_ARGUMENT: {
    error_code: "TIZEN_SDK_PARAM_E003",
    error_category: "invalid_argument",
  },
  SCRIPT_NOT_FOUND: {
    error_code: "TIZEN_SDK_SCRIPT_E001",
    error_category: "script_not_found",
  },
  EXECUTION_ERROR: {
    error_code: "TIZEN_SDK_EXEC_E001",
    error_category: "execution_error",
  },
  // em-cli (emulator-manager core)와 플랫폼 emulator 플러그인의 버전 불일치
  // (NoSuchFieldError/NoSuchMethodError, 실사례 isVirgl). 실행은 되었지만
  // 로드된 클래스 멤버가 어긋난 경우라 execution_error와 분리한다 — 해결책이
  // 재시도가 아니라 tizen-update-package로 정해져 있기 때문이다. suggested_fix는
  // lib/core/emulator.js versionMismatchFix()가 호출별로 채운다.
  PACKAGE_VERSION_MISMATCH: {
    error_code: "TIZEN_SDK_EXEC_E002",
    error_category: "package_version_mismatch",
  },

  // 디버깅 관련
  INSPECTOR_NOT_AVAILABLE: {
    error_code: "TIZEN_SDK_DEBUG_E001",
    error_category: "inspector_not_available",
    suggested_fix: {
      command:
        "Relaunch via tizen-webapp-debug; ensure the image supports RWI (emulator/dev images do)",
      auto_fixable: false,
    },
  },

  // 테스트 관련
  // dependency_missing = 실행 환경(테스트 프로젝트)에 필요한 패키지가 없다.
  // invalid_parameters와 구분하는 이유: 인자가 아니라 프로젝트 상태의 문제라서,
  // 호출자는 값을 고치는 게 아니라 프로젝트 디렉터리에서 설치를 실행해야 한다.
  DEPENDENCY_MISSING: {
    error_code: "TIZEN_SDK_TEST_E001",
    error_category: "dependency_missing",
    suggested_fix: {
      command: "npm install playwright  (run in the test project directory)",
      auto_fixable: false,
    },
  },
  TEST_FAILED: {
    error_code: "TIZEN_SDK_TEST_E002",
    error_category: "test_failed",
  },
  TEST_TIMEOUT: {
    error_code: "TIZEN_SDK_TEST_E003",
    error_category: "test_timeout",
  },

  // .NET 워크로드 관련
  // dotnet_sdk_not_found = 어디에도 .NET SDK가 없고, 셋업 스크립트의 user-scope
  //   자동 설치(dotnet-install → ~/.dotnet, %LOCALAPPDATA%\Microsoft\dotnet)마저
  //   건너뛰었거나(--no-install-sdk) 실패함(오프라인/프록시가 전형). 이때만
  //   사용자가 직접 설치해야 한다.
  // dotnet_workload_target_mismatch = 설치는 됐지만 우리가 검증하는 dotnet과
  //   다른 SDK 밴드/설치 디렉터리에 등록됨. 권한 문제가 아니므로 관리자 권한
  //   재시도를 유도하면 안 된다. errors[0].details 에 [DIAG] 사실들이 담긴다.
  // suggested_fix.command 는 플랫폼 중립 폴백이다. dotnet.js 가 실행 플랫폼에
  // 맞는 명령(dotnet-install.sh/winget/brew)을 formatError 의 suggestedCommand 로
  // 덮어쓰므로, 이 값은 카테고리만 알고 플랫폼을 모르는 호출 경로에서만 노출된다.
  // (예전엔 winget 하드코딩이라 Ubuntu 사용자에게 Windows 명령을 안내했다.)
  DOTNET_SDK_NOT_FOUND: {
    error_code: "TIZEN_SDK_DOTNET_E001",
    error_category: "dotnet_sdk_not_found",
    suggested_fix: {
      command:
        "Install the .NET 8 SDK for this OS — no sudo/admin: the official dotnet-install script " +
        "(Linux/macOS: curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 8.0 → ~/.dotnet) / " +
        "Windows: winget install Microsoft.DotNet.SDK.8 (one UAC prompt) / macOS: brew install --cask dotnet-sdk — " +
        "then re-run this setup (behind a proxy, set http_proxy/https_proxy first)",
      auto_fixable: false,
      guide_url: "https://dotnet.microsoft.com/download",
    },
  },
  DOTNET_WORKLOAD_TARGET_MISMATCH: {
    error_code: "TIZEN_SDK_DOTNET_E002",
    error_category: "dotnet_workload_target_mismatch",
    suggested_fix: {
      command:
        "Unset DOTNET_ROOT (or point it at the dotnet on PATH), then re-run this setup",
      auto_fixable: false,
    },
  },
  // dotnet_workload_permission_denied = SDK 디렉터리에 쓰기 권한이 없어 워크로드
  // 설치가 실패함 (apt/dnf 로 설치한 root 소유 SDK 가 전형). 러너는 비대화형이라
  // 스크립트 내부의 sudo 재시도가 비밀번호를 물을 수 없으므로, dotnet.js 가
  // 플랫폼에 맞는 승격 재실행 명령(sudo bash <script> / Administrator PowerShell)을
  // suggestedCommand 로 덮어쓴다. 아래 command 는 플랫폼 중립 폴백.
  DOTNET_WORKLOAD_PERMISSION_DENIED: {
    error_code: "TIZEN_SDK_DOTNET_E003",
    error_category: "dotnet_workload_permission_denied",
    suggested_fix: {
      command:
        "Re-run the setup script with elevated rights — Linux/macOS: sudo bash <path-to>/tizen-dotnet-setup.sh / " +
        "Windows: re-run from an Administrator PowerShell (or avoid elevation entirely: install a user-scope SDK " +
        "with the official dotnet-install script, then re-run this setup)",
      auto_fixable: false,
    },
  },

  // 환경 사전 점검 (preflight) 관련
  // node_not_found = SDK CLI 러너 실행에 필요한 Node.js가 없음. 호출자
  // (preflight.js)가 플랫폼별 설치 명령을 suggestedCommand로 덮어쓰며,
  // 레지스트리의 guide_url은 그때도 보존된다.
  NODE_NOT_FOUND: {
    error_code: "TIZEN_SDK_ENV_E001",
    error_category: "node_not_found",
    suggested_fix: {
      command:
        "Install Node.js 18+ — Windows: winget install OpenJS.NodeJS.LTS / Ubuntu: sudo apt install -y nodejs npm / macOS: brew install node",
      auto_fixable: false,
      guide_url: "https://nodejs.org/en/download",
    },
  },
  // insufficient_disk_space = 설치 대상 드라이브의 여유 공간 부족. 필요한
  // 용량이 상황마다 달라 구체적 해결 명령은 호출자가 메시지에 담는다.
  INSUFFICIENT_DISK_SPACE: {
    error_code: "TIZEN_SDK_ENV_E002",
    error_category: "insufficient_disk_space",
  },

  // Codex CLI 샌드박스 관련 (lib/core/sandbox.js). 두 경우 모두 해결책은 같은
  // 명령을 escalated permissions(샌드박스 밖)로 다시 실행하는 것이며,
  // suggested_fix.command 가 그 명령줄(= user_command), escalate: true 가 표식.
  // sandbox_blocked = 샌드박스 안에서 실행 불가한 요청(--background 분리 잡,
  // run --script)을 시작 전에 거부했거나, 실패 메시지가 권한/네트워크 차단 패턴.
  SANDBOX_BLOCKED: {
    error_code: "TIZEN_SDK_SANDBOX_E001",
    error_category: "sandbox_blocked",
  },
  // sandbox_job_lost = 샌드박스 안에서 시작된 분리 잡이 결과 없이 사라짐
  // (Linux PID 네임스페이스 해제로 종료, 또는 소켓/SDK 쓰기 차단).
  SANDBOX_JOB_LOST: {
    error_code: "TIZEN_SDK_SANDBOX_E002",
    error_category: "sandbox_job_lost",
  },

  // 앱 설치(install-app) 관련 — 셋 다 install 흐름에서만 발생한다.
  // certificate_error = 서명/인증서 문제로 설치 거부 (서명 프로필 없이 빌드된
  // 패키지가 전형). 인증서 '생성' 실패(CERT_E0xx)와 달리 설치 단계의 오류다.
  CERTIFICATE_ERROR: {
    error_code: "TIZEN_SDK_INSTALL_E001",
    error_category: "certificate_error",
  },
  // invalid_package_id = 패키지 ID 규칙 위반(10자 미만 등)으로 디바이스가
  // 설치를 거부. 해결은 재생성이므로 메시지가 절차를 안내한다.
  INVALID_PACKAGE_ID: {
    error_code: "TIZEN_SDK_INSTALL_E002",
    error_category: "invalid_package_id",
  },
  // rpk_res_type_conflict = 같은 res-type/res-version의 RPK가 이미 설치되어
  // 디바이스 package-manager가 등록을 거부 (-21).
  RPK_RES_TYPE_CONFLICT: {
    error_code: "TIZEN_SDK_INSTALL_E003",
    error_category: "rpk_res_type_conflict",
  },

  // dlog-analyzer 러너 관련
  RUNNER_NOT_FOUND: {
    error_code: "TIZEN_SDK_DLOG_E001",
    error_category: "runner_not_found",
  },
  RUNNER_FAILED: {
    error_code: "TIZEN_SDK_DLOG_E002",
    error_category: "runner_failed",
  },

  // 일반 에러
  IO_ERROR: {
    error_code: "TIZEN_SDK_IO_E001",
    error_category: "io_error",
  },
  // permission_denied = 쓰기 자체가 거부됨 (EACCES / Access is denied /
  // Read-only file system). 인증서 프로필 저장소(<sdk>-data)를 Codex 샌드박스나
  // root 소유 SDK 가 막는 경우가 전형 — 호출자(certificate.js profileWriteError)가
  // 대상 파일과 escalated-permissions 재실행 안내를 메시지에 담는다.
  PERMISSION_DENIED: {
    error_code: "TIZEN_SDK_IO_E002",
    error_category: "permission_denied",
  },
  // remote_path_not_found = the DEVICE-side path given to a pull does not
  // exist (sdb: "cannot stat '<path>': No such file or directory"). Distinct
  // from io_error on purpose: a wrong path is the user's to correct, and the
  // agent must NOT retry the same command (issue #95).
  REMOTE_PATH_NOT_FOUND: {
    error_code: "TIZEN_SDK_IO_E003",
    error_category: "remote_path_not_found",
    suggested_fix: {
      command:
        "Confirm the exact path on the device (case-sensitive), then re-run once with the corrected --remote path. Do not retry the same path.",
      auto_fixable: false,
    },
  },

  // 패키지 저장소 (custom repository URL) 관련
  // A repository URL is only usable when it serves pkg_list_{OS}-{64,32};
  // repo_url_invalid = malformed/unsupported URL,
  // repo_url_unreachable = URL is well-formed but serves no pkg_list for this OS.
  REPO_URL_INVALID: {
    error_code: "TIZEN_SDK_REPO_E001",
    error_category: "repo_url_invalid",
    suggested_fix: {
      command:
        "Pass the repository base URL that CONTAINS pkg_list_{OS}-{64,32}, e.g. --repo-url https://download.tizen.org/sdk/tizenstudio/official",
      auto_fixable: false,
    },
  },
  REPO_URL_UNREACHABLE: {
    error_code: "TIZEN_SDK_REPO_E002",
    error_category: "repo_url_unreachable",
    suggested_fix: {
      command:
        "Verify the URL is reachable from this machine (VPN/proxy for internal mirrors) and that it serves pkg_list_{OS}-64 or pkg_list_{OS}-32",
      auto_fixable: false,
    },
  },

  // 인증서 관련
  CERT_GENERATION_FAILED: {
    error_code: "TIZEN_SDK_CERT_E001",
    error_category: "cert_generation_failed",
  },
  CERT_PASSWORD_INVALID: {
    error_code: "TIZEN_SDK_CERT_E002",
    error_category: "cert_password_invalid",
  },
  DISTRIBUTOR_ASSET_NOT_FOUND: {
    error_code: "TIZEN_SDK_CERT_E003",
    error_category: "distributor_asset_not_found",
  },
  PROFILE_CREATION_FAILED: {
    error_code: "TIZEN_SDK_CERT_E004",
    error_category: "profile_creation_failed",
  },
  PROFILE_LIST_FAILED: {
    error_code: "TIZEN_SDK_CERT_E005",
    error_category: "profile_list_failed",
  },
  PROFILE_NOT_FOUND: {
    error_code: "TIZEN_SDK_CERT_E006",
    error_category: "profile_not_found",
  },
  PROFILE_UPDATE_FAILED: {
    error_code: "TIZEN_SDK_CERT_E007",
    error_category: "profile_update_failed",
  },
  PROFILE_REMOVE_FAILED: {
    error_code: "TIZEN_SDK_CERT_E008",
    error_category: "profile_remove_failed",
  },
  DISTRIBUTOR2_UPDATE_FAILED: {
    error_code: "TIZEN_SDK_CERT_E009",
    error_category: "distributor2_update_failed",
  },
  CERT_ALREADY_EXISTS: {
    error_code: "TIZEN_SDK_CERT_E010",
    error_category: "cert_already_exists",
  },
  CERT_IMPORT_FAILED: {
    error_code: "TIZEN_SDK_CERT_E011",
    error_category: "cert_import_failed",
  },
  CERT_INSPECTION_FAILED: {
    error_code: "TIZEN_SDK_CERT_E012",
    error_category: "cert_inspection_failed",
  },
  SIGNING_PROFILE_INVALID: {
    error_code: "TIZEN_SDK_CERT_E021",
    error_category: "signing_profile_invalid",
  },
  SAMSUNG_CERT_GENERATION_FAILED: {
    error_code: "TIZEN_SDK_CERT_E013",
    error_category: "samsung_cert_generation_failed",
  },
  SAMSUNG_AUTH_FAILED: {
    error_code: "TIZEN_SDK_CERT_E014",
    error_category: "samsung_auth_failed",
  },
  SAMSUNG_CA_NOT_FOUND: {
    error_code: "TIZEN_SDK_CERT_E015",
    error_category: "samsung_ca_not_found",
  },
  SAMSUNG_AUTH_TIMEOUT: {
    error_code: "TIZEN_SDK_CERT_E016",
    error_category: "samsung_auth_timeout",
  },
  SAMSUNG_AUTH_PORT_UNAVAILABLE: {
    error_code: "TIZEN_SDK_CERT_E017",
    error_category: "samsung_auth_port_unavailable",
  },
  SAMSUNG_AUTH_INVALID_RESPONSE: {
    error_code: "TIZEN_SDK_CERT_E018",
    error_category: "samsung_auth_invalid_response",
  },
  SAMSUNG_PWD_STORE_FAILED: {
    error_code: "TIZEN_SDK_CERT_E019",
    error_category: "samsung_pwd_store_failed",
  },
  SAMSUNG_API_FAILED: {
    error_code: "TIZEN_SDK_CERT_E020",
    error_category: "samsung_api_failed",
  },
};

module.exports = { Envelope, ERROR_CODES };
