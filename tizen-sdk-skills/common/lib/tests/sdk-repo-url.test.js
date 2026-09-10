// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Custom package repository URL tests
 *
 * Covers the pure (no-network) parts of the custom-repository install feature:
 *   - normalizeRepoUrl: whitespace / trailing-slash normalization
 *   - checkRepoUrlSyntax: which URLs are rejected before a network probe
 *   - validateRepoUrl: syntactic rejections produce a repo_url_invalid envelope
 *
 * The reachability probe (pkg_list_{OS}-{64,32} must be served) is delegated to
 * the installer script, so it is NOT exercised here — that would need network.
 */

const {
  normalizeRepoUrl,
  checkRepoUrlSyntax,
  validateRepoUrl,
} = require("../core/sdk");

console.log("=== custom repository URL Test ===\n");

let failures = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok
        ? ""
        : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

// Test 1: normalizeRepoUrl
console.log("Test 1: normalizeRepoUrl");
check(
  "  trailing slash stripped",
  normalizeRepoUrl("https://example.com/repo/"),
  "https://example.com/repo",
);
check(
  "  multiple trailing slashes stripped",
  normalizeRepoUrl("https://example.com/repo///"),
  "https://example.com/repo",
);
check(
  "  surrounding whitespace trimmed",
  normalizeRepoUrl("  https://example.com/repo  "),
  "https://example.com/repo",
);
check(
  "  already normalized is unchanged",
  normalizeRepoUrl("http://a/b"),
  "http://a/b",
);
check("  non-string is empty", normalizeRepoUrl(undefined), "");

// Test 2: checkRepoUrlSyntax — accepted URLs
console.log("\nTest 2: checkRepoUrlSyntax accepts real repository URLs");
check(
  "  official CDN",
  checkRepoUrlSyntax("https://download.tizen.org/sdk/tizenstudio/official").ok,
  true,
);
check(
  "  internal mirror SDK 11.0",
  checkRepoUrlSyntax("http://mirror.example.com/packages/tizen_sdk_11.0").ok,
  true,
);
check(
  "  trailing slash normalized on the way through",
  checkRepoUrlSyntax("https://example.com/repo/").url,
  "https://example.com/repo",
);

// Test 3: checkRepoUrlSyntax — rejected URLs
console.log("\nTest 3: checkRepoUrlSyntax rejects unusable URLs");
check("  empty string", checkRepoUrlSyntax("").ok, false);
check("  whitespace only", checkRepoUrlSyntax("   ").ok, false);
check("  undefined", checkRepoUrlSyntax(undefined).ok, false);
check(
  "  non-http scheme (ftp)",
  checkRepoUrlSyntax("ftp://example.com/repo").ok,
  false,
);
check("  file:// scheme", checkRepoUrlSyntax("file:///tmp/repo").ok, false);
check("  scheme-less host", checkRepoUrlSyntax("example.com/repo").ok, false);
// Pointing at the pkg_list FILE instead of its directory is the most likely
// user mistake: every download URL would then be <...>/pkg_list_x/<path>.
check(
  "  points at the pkg_list file itself",
  checkRepoUrlSyntax("https://example.com/repo/pkg_list_ubuntu-64").ok,
  false,
);
check(
  "  pkg_list file rejection mentions the directory rule",
  /DIRECTORY/.test(
    checkRepoUrlSyntax("https://example.com/repo/pkg_list_windows-64").message,
  ),
  true,
);

// Test 4: validateRepoUrl envelopes for syntactic failures (no network)
(async () => {
  console.log("\nTest 4: validateRepoUrl envelope on syntactic failure");

  const empty = await validateRepoUrl("");
  check("  empty URL -> failure", empty.status, "failure");
  check(
    "  empty URL -> repo_url_invalid",
    empty.errors[0].error_category,
    "repo_url_invalid",
  );
  check(
    "  empty URL -> REPO error code",
    empty.errors[0].error_code,
    "TIZEN_SDK_REPO_E001",
  );
  check(
    "  command name preserved",
    empty.command,
    "tizen-sdk validate-repo-url",
  );

  const ftp = await validateRepoUrl("ftp://example.com/repo");
  check("  ftp URL -> failure", ftp.status, "failure");
  check(
    "  ftp URL -> repo_url_invalid",
    ftp.errors[0].error_category,
    "repo_url_invalid",
  );

  // Callers that validate as part of a bigger command pass their own name.
  const custom = await validateRepoUrl("", "tizen-sdk sdk-install-custom-repo");
  check(
    "  caller-supplied command name is used",
    custom.command,
    "tizen-sdk sdk-install-custom-repo",
  );

  console.log(
    `\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`} ===`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
