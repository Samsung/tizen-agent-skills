// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * repairSdkInfo() / describeSdkInfoRepair() tests
 *
 * Tizen CLI's PropertyParser.getKey() is `line.substring(0, line.indexOf("="))`
 * with no comment/blank/BOM handling, so an sdk.info written by an older
 * installer ("# Tizen SDK Configuration" header, UTF-8 BOM from Windows
 * PowerShell 5.1) makes `tizen package -t rpk` die with
 * StringIndexOutOfBoundsException. repairSdkInfo() rewrites such a file to
 * strict KEY=VALUE lines and leaves a clean file untouched.
 *
 * Everything runs against a temp sandbox; nothing outside it is read or written.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { repairSdkInfo, describeSdkInfoRepair } = require("../core/sdk");

console.log("=== sdk.info repair test ===\n");

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

const sandbox = fs.mkdtempSync(
  path.join(os.tmpdir(), "tizen-sdk-info-repair-"),
);
let counter = 0;

/** A fake SDK root whose sdk.info holds exactly `bytes` (Buffer or string). */
function makeSdk(bytes) {
  const root = path.join(sandbox, `sdk-${counter++}`);
  fs.mkdirSync(root);
  if (bytes !== null) fs.writeFileSync(path.join(root, "sdk.info"), bytes);
  return root;
}

function readBytes(root) {
  return fs.readFileSync(path.join(root, "sdk.info"));
}

try {
  // 1. The real-world file from installers <= 1.1.1 on Windows: BOM + comment
  //    header + CRLF. This is exactly what issue #80 reported.
  console.log("--- legacy Windows sdk.info (BOM + comment + CRLF) ---");
  {
    const root = makeSdk(
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(
          "# Tizen SDK Configuration\r\n" +
            "TIZEN_SDK_INSTALLED_PATH=C:\\Users\\me\\tizen-sdk\r\n" +
            "TIZEN_SDK_DATA_PATH=C:\\Users\\me\\tizen-sdk-data\r\n",
        ),
      ]),
    );
    const r = repairSdkInfo(root);
    check("repaired", r.repaired, true);
    check("bom_removed", r.bom_removed, true);
    check("removed_lines", r.removed_lines, ["# Tizen SDK Configuration"]);
    check("error null", r.error, null);
    check("path", r.path, path.join(root, "sdk.info"));
    const after = readBytes(root);
    check(
      "no BOM left",
      after.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
      false,
    );
    check(
      "only KEY=VALUE lines, CRLF preserved",
      after.toString("utf-8"),
      "TIZEN_SDK_INSTALLED_PATH=C:\\Users\\me\\tizen-sdk\r\n" +
        "TIZEN_SDK_DATA_PATH=C:\\Users\\me\\tizen-sdk-data\r\n",
    );
    const note = describeSdkInfoRepair(r);
    check("note mentions the file", note.includes(r.path), true);
    check("note mentions BOM", note.includes("UTF-8 BOM"), true);
    check(
      "note quotes the dropped line",
      note.includes('"# Tizen SDK Configuration"'),
      true,
    );
    check("note explains why", note.includes("PropertyParser.getKey"), true);
  }

  // 2. Linux/macOS file from the same installers: comment header, LF, no BOM.
  console.log("\n--- legacy Unix sdk.info (comment + LF) ---");
  {
    const root = makeSdk(
      "# Tizen SDK Configuration\n" +
        "TIZEN_SDK_INSTALLED_PATH=/home/me/tizen-sdk\n" +
        "TIZEN_SDK_DATA_PATH=/home/me/tizen-sdk-data\n",
    );
    const r = repairSdkInfo(root);
    check("repaired", r.repaired, true);
    check("bom_removed false", r.bom_removed, false);
    check("removed_lines", r.removed_lines, ["# Tizen SDK Configuration"]);
    check(
      "LF preserved",
      readBytes(root).toString("utf-8"),
      "TIZEN_SDK_INSTALLED_PATH=/home/me/tizen-sdk\n" +
        "TIZEN_SDK_DATA_PATH=/home/me/tizen-sdk-data\n",
    );
    check(
      "note has no BOM clause",
      describeSdkInfoRepair(r).includes("UTF-8 BOM"),
      false,
    );
  }

  // 3. A clean file must not be rewritten at all (byte-identical, mtime kept).
  console.log("\n--- clean sdk.info is left alone ---");
  {
    const content =
      "TIZEN_SDK_INSTALLED_PATH=/opt/tizen-studio\nTIZEN_SDK_DATA_PATH=/opt/tizen-studio-data\n";
    const root = makeSdk(content);
    const before = fs.statSync(path.join(root, "sdk.info")).mtimeMs;
    const r = repairSdkInfo(root);
    check("repaired false", r.repaired, false);
    check("bom_removed false", r.bom_removed, false);
    check("removed_lines empty", r.removed_lines, []);
    check("content untouched", readBytes(root).toString("utf-8"), content);
    check(
      "mtime untouched",
      fs.statSync(path.join(root, "sdk.info")).mtimeMs,
      before,
    );
    check("no note for a clean file", describeSdkInfoRepair(r), null);
  }

  // 4. A clean file without a trailing newline is also left alone.
  console.log("\n--- clean sdk.info without final newline ---");
  {
    const content = "TIZEN_SDK_INSTALLED_PATH=/opt/tizen-studio";
    const root = makeSdk(content);
    const r = repairSdkInfo(root);
    check("repaired false", r.repaired, false);
    check("content untouched", readBytes(root).toString("utf-8"), content);
  }

  // 5. Blank lines anywhere are removed; "#" inside a value is not a comment.
  console.log("\n--- blank lines and '#' inside a value ---");
  {
    const root = makeSdk(
      "\nTIZEN_SDK_INSTALLED_PATH=/srv/tizen#1\n\n# note\nTIZEN_SDK_DATA_PATH=/srv/tizen#1-data\n\n",
    );
    const r = repairSdkInfo(root);
    check("repaired", r.repaired, true);
    check("removed_lines (blank, blank, comment, blank)", r.removed_lines, [
      "",
      "",
      "# note",
      "",
    ]);
    check(
      "values with '#' kept verbatim",
      readBytes(root).toString("utf-8"),
      "TIZEN_SDK_INSTALLED_PATH=/srv/tizen#1\nTIZEN_SDK_DATA_PATH=/srv/tizen#1-data\n",
    );
  }

  // 6. A BOM alone (no comment) is enough to trigger a rewrite.
  console.log("\n--- BOM only ---");
  {
    const root = makeSdk(
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("TIZEN_SDK_INSTALLED_PATH=C:\\tizen-sdk\r\n"),
      ]),
    );
    const r = repairSdkInfo(root);
    check("repaired", r.repaired, true);
    check("bom_removed", r.bom_removed, true);
    check("removed_lines empty", r.removed_lines, []);
    check(
      "BOM stripped, rest verbatim",
      readBytes(root).toString("utf-8"),
      "TIZEN_SDK_INSTALLED_PATH=C:\\tizen-sdk\r\n",
    );
    const note = describeSdkInfoRepair(r);
    check(
      "note mentions BOM only",
      note.includes("removed a UTF-8 BOM."),
      true,
    );
  }

  // 7. Mixed line endings: CRLF wins when present anywhere.
  console.log("\n--- mixed line endings ---");
  {
    const root = makeSdk(
      "# hdr\nTIZEN_SDK_INSTALLED_PATH=/a\r\nTIZEN_SDK_DATA_PATH=/b\n",
    );
    const r = repairSdkInfo(root);
    check("repaired", r.repaired, true);
    check(
      "normalised to CRLF",
      readBytes(root).toString("utf-8"),
      "TIZEN_SDK_INSTALLED_PATH=/a\r\nTIZEN_SDK_DATA_PATH=/b\r\n",
    );
  }

  // 8. Missing file / missing dir / no path: nothing happens, nothing throws.
  console.log("\n--- nothing to repair ---");
  {
    const root = makeSdk(null);
    const r = repairSdkInfo(root);
    check("no sdk.info → repaired false", r.repaired, false);
    check(
      "no sdk.info → path still reported",
      r.path,
      path.join(root, "sdk.info"),
    );
    check("no sdk.info → error null", r.error, null);
    check("no sdk.info → file not created", fs.existsSync(r.path), false);
    check("no sdk.info → no note", describeSdkInfoRepair(r), null);
  }
  {
    const r = repairSdkInfo(path.join(sandbox, "does-not-exist"));
    check("missing dir → repaired false", r.repaired, false);
    check("missing dir → error null", r.error, null);
  }
  {
    const r = repairSdkInfo(null);
    check("null path → repaired false", r.repaired, false);
    check("null path → path null", r.path, null);
    check("empty path → repaired false", repairSdkInfo("").repaired, false);
    check("null result → no note", describeSdkInfoRepair(null), null);
  }

  // 9. An unreadable sdk.info (a directory by that name) reports an error
  //    instead of throwing, and the note says the check failed.
  console.log("\n--- unreadable sdk.info ---");
  {
    const root = path.join(sandbox, "dir-as-sdk-info");
    fs.mkdirSync(path.join(root, "sdk.info"), { recursive: true });
    const r = repairSdkInfo(root);
    check("repaired false", r.repaired, false);
    check("error reported", typeof r.error, "string");
    const note = describeSdkInfoRepair(r);
    check(
      "note says the check failed",
      note.includes("could not be checked"),
      true,
    );
  }
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
