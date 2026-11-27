// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * sdk-env tests: keeping TIZEN_SDK_PATH in line with ~/.tizen.sdk.path.config
 *
 * Covers:
 *   - rewriteProfileExport: active export lines rewritten (indent kept),
 *     commented lines and other content untouched, no-op when already equal
 *   - replaceSdkPathEntries: old SDK bin / tools / tools\tizen-core entries
 *     replaced in place (case- and trailing-slash-insensitive), unrelated
 *     entries kept, duplicates of a new entry dropped, no change when the old
 *     root equals the new one or no old entry is present
 *   - syncSdkPathEnv (POSIX only): rewrites an export in a sandboxed HOME,
 *     leaves a profile without one alone, refuses a shell-unsafe path, and
 *     TIZEN_SDK_ENV_SYNC=0 turns everything off
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  rewriteProfileExport,
  replaceSdkPathEntries,
  syncSdkPathEnv,
  expandWinVars,
} = require("../core/sdk-env");

console.log("=== SDK Env Sync Test ===\n");

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

// --- 1. rewriteProfileExport ------------------------------------------------
console.log("--- rewriteProfileExport ---");
{
  const before = [
    "# Tizen SDK",
    "export TIZEN_SDK_PATH=/home/me/tizen-studio",
    '  export TIZEN_SDK_PATH="/home/me/tizen-sdk"',
    "#export TIZEN_SDK_PATH=/old/commented",
    'export PATH="$TIZEN_SDK_PATH/tools:$PATH"',
  ].join("\n");
  const { text, changed } = rewriteProfileExport(before, "/home/me/tizen-sdk2");
  check("changed", changed, true);
  check(
    "export lines rewritten, indent kept, others untouched",
    text.split("\n"),
    [
      "# Tizen SDK",
      'export TIZEN_SDK_PATH="/home/me/tizen-sdk2"',
      '  export TIZEN_SDK_PATH="/home/me/tizen-sdk2"',
      "#export TIZEN_SDK_PATH=/old/commented",
      'export PATH="$TIZEN_SDK_PATH/tools:$PATH"',
    ],
  );
  check(
    "already equal → unchanged",
    rewriteProfileExport(text, "/home/me/tizen-sdk2").changed,
    false,
  );
  check(
    "no export line → unchanged",
    rewriteProfileExport("alias ll='ls -l'\n", "/x").changed,
    false,
  );
  check(
    "same-line `; export PATH=…` kept",
    rewriteProfileExport(
      'export TIZEN_SDK_PATH=/old; export PATH="$TIZEN_SDK_PATH/tools:$PATH"',
      "/new",
    ).text,
    'export TIZEN_SDK_PATH="/new"; export PATH="$TIZEN_SDK_PATH/tools:$PATH"',
  );
  check(
    "single-quoted value and trailing comment",
    rewriteProfileExport("export TIZEN_SDK_PATH='/old dir' # sdk", "/new").text,
    'export TIZEN_SDK_PATH="/new" # sdk',
  );

  const home = "/home/me";
  const sdk = "/home/me/tizen-sdk2";
  for (const kept of [
    "export TIZEN_SDK_PATH=$HOME/tizen-sdk2",
    'export TIZEN_SDK_PATH="${HOME}/tizen-sdk2/"',
    "export TIZEN_SDK_PATH=~/tizen-sdk2",
    "export TIZEN_SDK_PATH=/home/me/tizen-sdk2",
  ]) {
    check(
      `already expands to the SDK → kept as written: ${kept}`,
      rewriteProfileExport(kept, sdk, home),
      { text: kept, changed: false },
    );
  }
  for (const [input, why] of [
    [
      "export TIZEN_SDK_PATH='$HOME/tizen-sdk2'",
      "no expansion in single quotes",
    ],
    ['export TIZEN_SDK_PATH="~/tizen-sdk2"', "no ~ expansion in double quotes"],
    ["export TIZEN_SDK_PATH=$HOMEDIR/tizen-sdk2", "$HOMEDIR is not $HOME"],
    ["export TIZEN_SDK_PATH=$HOME/tizen-sdk", "a different SDK"],
  ]) {
    check(
      `rewritten (${why})`,
      rewriteProfileExport(input, sdk, home).text,
      `export TIZEN_SDK_PATH="${sdk}"`,
    );
  }
}

// --- 2. replaceSdkPathEntries ----------------------------------------------
console.log("\n--- replaceSdkPathEntries ---");
{
  const oldRoot = "C:\\Users\\me\\tizen-sdk";
  const newRoot = "C:\\Users\\me\\tizen-sdk2";
  const pathValue = [
    "C:\\Windows\\system32",
    "c:\\users\\me\\TIZEN-SDK\\bin\\",
    "C:\\Users\\me\\tizen-sdk\\tools",
    "C:\\Users\\me\\tizen-sdk\\tools\\tizen-core",
    "C:\\Users\\me\\tizen-sdk-extra\\tools",
    "C:\\Program Files\\Git\\cmd",
  ].join(";");
  const r = replaceSdkPathEntries(pathValue, [oldRoot], newRoot);
  check("changed", r.changed, true);
  check("old entries replaced in place, others kept", r.value.split(";"), [
    "C:\\Windows\\system32",
    "C:\\Users\\me\\tizen-sdk2\\bin",
    "C:\\Users\\me\\tizen-sdk2\\tools",
    "C:\\Users\\me\\tizen-sdk2\\tools\\tizen-core",
    "C:\\Users\\me\\tizen-sdk-extra\\tools",
    "C:\\Program Files\\Git\\cmd",
  ]);

  const dup = replaceSdkPathEntries(
    `${oldRoot}\\tools;C:\\Users\\me\\tizen-sdk2\\tools;C:\\a;C:\\a`,
    [oldRoot],
    newRoot,
  );
  check(
    "duplicate of a new entry dropped, unrelated duplicates kept",
    dup.value.split(";"),
    ["C:\\Users\\me\\tizen-sdk2\\tools", "C:\\a", "C:\\a"],
  );

  check(
    "old root equals new root → unchanged",
    replaceSdkPathEntries(pathValue, [`${newRoot}\\`], newRoot).changed,
    false,
  );
  check(
    "no old entry present → unchanged",
    replaceSdkPathEntries("C:\\Windows;C:\\Git", [oldRoot], newRoot),
    { value: "C:\\Windows;C:\\Git", changed: false },
  );
  check(
    "null / empty old roots ignored",
    replaceSdkPathEntries("C:\\Windows", [null, ""], newRoot).changed,
    false,
  );

  const korean = replaceSdkPathEntries(
    "C:\\Users\\user\\문서\\bin;C:\\Users\\user\\도구\\tizen-sdk\\tools;D:\\도구",
    ["C:\\Users\\user\\도구\\tizen-sdk"],
    "C:\\Users\\user\\도구\\tizen-sdk2",
  );
  check("non-ASCII entries kept byte for byte", korean.value.split(";"), [
    "C:\\Users\\user\\문서\\bin",
    "C:\\Users\\user\\도구\\tizen-sdk2\\tools",
    "D:\\도구",
  ]);

  const env = { USERPROFILE: "C:\\Users\\me" };
  const vars = replaceSdkPathEntries(
    "%USERPROFILE%\\tizen-sdk\\tools;%USERPROFILE%\\bin;%SystemRoot%\\system32",
    [oldRoot],
    newRoot,
    env,
  );
  check("%VAR% entry matched after expansion and replaced", vars.changed, true);
  check("other %VAR% entries kept unexpanded", vars.value.split(";"), [
    "C:\\Users\\me\\tizen-sdk2\\tools",
    "%USERPROFILE%\\bin",
    "%SystemRoot%\\system32",
  ]);
  check(
    "expandWinVars: case-insensitive, unknown names left as is",
    expandWinVars("%userprofile%\\x;%NOPE%\\y", env),
    "C:\\Users\\me\\x;%NOPE%\\y",
  );
}

// --- 3. syncSdkPathEnv (POSIX, sandboxed HOME) -------------------------------
if (process.platform === "win32") {
  console.log("\n--- syncSdkPathEnv: skipped on Windows (user registry) ---");
} else {
  console.log("\n--- syncSdkPathEnv (sandboxed HOME) ---");
  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-sdk-env-"));
  const saved = {
    HOME: process.env.HOME,
    TIZEN_SDK_PATH: process.env.TIZEN_SDK_PATH,
    TIZEN_SDK_ENV_SYNC: process.env.TIZEN_SDK_ENV_SYNC,
  };
  const restore = (key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  };
  try {
    process.env.HOME = sandboxHome;
    delete process.env.TIZEN_SDK_ENV_SYNC;
    check("os.homedir() follows the sandbox", os.homedir(), sandboxHome);

    const zshrc = path.join(sandboxHome, ".zshrc");
    const bashrc = path.join(sandboxHome, ".bashrc");
    fs.writeFileSync(zshrc, "export TIZEN_SDK_PATH=/old/tizen-sdk\n");
    fs.writeFileSync(bashrc, "alias ll='ls -l'\n");

    const r = syncSdkPathEnv("/new/tizen-sdk2", "/old/tizen-sdk");
    check("updated lists only the profile with an export", r.updated, [
      `TIZEN_SDK_PATH in ${zshrc}`,
    ]);
    check("no warnings", r.warnings, []);
    check(
      ".zshrc export rewritten",
      fs.readFileSync(zshrc, "utf8"),
      'export TIZEN_SDK_PATH="/new/tizen-sdk2"\n',
    );
    check(
      ".bashrc left alone",
      fs.readFileSync(bashrc, "utf8"),
      "alias ll='ls -l'\n",
    );
    check(
      "process.env.TIZEN_SDK_PATH updated",
      process.env.TIZEN_SDK_PATH,
      "/new/tizen-sdk2",
    );

    check(
      "second sync → nothing to update",
      syncSdkPathEnv("/new/tizen-sdk2", "/new/tizen-sdk2").updated,
      [],
    );

    const unsafe = syncSdkPathEnv('/new/"quoted"', "/new/tizen-sdk2");
    check("shell-unsafe path → no update", unsafe.updated, []);
    check("shell-unsafe path → one warning", unsafe.warnings.length, 1);
    check(
      "shell-unsafe path → profile untouched",
      fs.readFileSync(zshrc, "utf8"),
      'export TIZEN_SDK_PATH="/new/tizen-sdk2"\n',
    );

    process.env.TIZEN_SDK_ENV_SYNC = "0";
    const off = syncSdkPathEnv("/other/sdk", "/new/tizen-sdk2");
    check("TIZEN_SDK_ENV_SYNC=0 → nothing updated", off, {
      updated: [],
      warnings: [],
    });
    check(
      "TIZEN_SDK_ENV_SYNC=0 → profile untouched",
      fs.readFileSync(zshrc, "utf8"),
      'export TIZEN_SDK_PATH="/new/tizen-sdk2"\n',
    );
  } finally {
    restore("HOME");
    restore("TIZEN_SDK_PATH");
    restore("TIZEN_SDK_ENV_SYNC");
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  }
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
