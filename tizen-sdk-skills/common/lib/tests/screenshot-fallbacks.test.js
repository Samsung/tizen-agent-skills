// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-screenshot Wayland/HWC fallbacks (DA appliance targets).
 *
 * On a target that composes through HWC the UI sits on overlay planes, so
 * every on-device dump comes back solid black. Two fallbacks cover that, and
 * both have to exist in tizen-screenshot.sh AND tizen-screenshot.ps1:
 *
 *   1. enlightenment_info / winfo: the e_info client is resolved on the device
 *      (`winfo` on some images), and a flat dump is retried with `-hwc 0`,
 *      always followed by `-hwc 1` (the client cannot report the old state).
 *   2. Host-side VNC: the vncdotool Python block (between the
 *      `# --- VNC capture (vncdotool) ---` marker and `os._exit(0)`) is
 *      byte-identical in both scripts, never takes the password from argv, and
 *      runs after every on-device method in both chains.
 *
 * Plus the envelope warnings screenshot.js builds from the script output.
 * No device, Python or VNC server needed.
 */

const fs = require("fs");
const path = require("path");
const { extractCaptureWarnings } = require("../core/screenshot");

const SCRIPTS = path.join(__dirname, "..", "..", "scripts", "tizen-screenshot");
const SH = path.join(SCRIPTS, "tizen-screenshot.sh");
const PS1 = path.join(SCRIPTS, "tizen-screenshot.ps1");
const VNC_MARKER = "# --- VNC capture (vncdotool) ---";

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

// The .ps1 is CRLF on disk (.gitattributes); compare content, not line endings.
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const sh = read(SH);
const ps1 = read(PS1);

function extractVncBlock(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === VNC_MARKER);
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l === "os._exit(0)");
  if (end === -1) return null;
  return lines.slice(start, end + 1).join("\n");
}

// --- 1. winfo + HWC ----------------------------------------------------------

for (const [name, text] of [
  ["sh", sh],
  ["ps1", ps1],
]) {
  check(
    `${name}: e_info client resolved on the device (enlightenment_info || winfo)`,
    text.includes("command -v enlightenment_info || command -v winfo"),
  );
  const tool = name === "sh" ? "${E_TOOL}" : "$eTool";
  const off = text.indexOf(`"${tool} -hwc 0"`);
  const restoreCmd = text.includes(`"${tool} -hwc 1 2>&1; echo HWC_RC=`);
  const restore =
    name === "sh"
      ? text.indexOf("if _e_hwc_on; then")
      : text.indexOf(`"${tool} -hwc 1 2>&1; echo HWC_RC=`);
  check(
    `${name}: HWC is switched off for the retry and switched back on, judged by the remote exit status`,
    off !== -1 && restoreCmd && restore > off,
  );
  check(
    `${name}: no -hwc 2 state query (it only logs to dlog)`,
    !text.includes(`${tool} -hwc 2"`),
  );
  check(
    `${name}: HWC retry is gated on an earlier uniform capture`,
    name === "sh"
      ? /if \[ -n "\$UNIFORM_FALLBACK" \]; then\n\s+echo " {2}Capture was a single solid color — retrying with HWC disabled/.test(
          text,
        )
      : /if \(\$script:UniformFallback\) \{\n\s+Write-Info "Capture was a single solid color - retrying with HWC disabled/.test(
          text,
        ),
  );
  check(
    `${name}: HWC retry reports its own capture_method`,
    text.includes("-dump_screen (hwc off)"),
  );
}

// ps1 restores HWC in a finally block so a throwing dump cannot leave it off,
// and bounds every HWC-path call: a timeout kill skips `finally` on Windows.
check(
  "ps1: HWC restore runs in a finally block",
  /\} finally \{[\s\S]*?Invoke-SdbShellBounded \$SdbPath \$DeviceSerial "\$eTool -hwc 1/.test(
    ps1,
  ),
);
check(
  "ps1: HWC toggle and the HWC-off dump are bounded",
  ps1.includes(
    'Invoke-SdbShellBounded $SdbPath $DeviceSerial "$eTool -hwc 0"',
  ) &&
    ps1.includes("Invoke-DumpScreen $tempPng -Bounded") &&
    /\$proc\.WaitForExit\(\$TimeoutMs\)/.test(ps1),
);

// sh: SIGINT/SIGTERM between -hwc 0 and the restore re-enables HWC, drops
// root and ends the script instead of resuming the capture chain.
const hwcOff = sh.indexOf('"${E_TOOL} -hwc 0"');
for (const [sig, code] of [
  ["INT", 130],
  ["TERM", 143],
]) {
  const trap = sh.indexOf(
    `trap '_e_hwc_on || true; _e_restore_root; exit ${code}' ${sig}`,
  );
  check(
    `sh: ${sig} trap restores HWC and exits ${code}, registered before -hwc 0`,
    trap !== -1 && trap < hwcOff,
  );
}
// sh: the dump and restore calls are bounded.
check(
  "sh: HWC toggle/restore calls are bounded by a timeout",
  /HWC_RUN=\(timeout 15\)/.test(sh),
);
check(
  "sh: the HWC-off dump is also bounded (timeout passed to _e_dump_screen)",
  /_e_dump_screen "\$OUT_TMP" 15/.test(sh),
);
check(
  "sh: emits hwc_recovery_unverified when the restore cannot be confirmed",
  /CAPTURE_WARNING=hwc_recovery_unverified/.test(sh),
);
check(
  "ps1: emits hwc_recovery_unverified when the restore cannot be confirmed",
  /CAPTURE_WARNING=hwc_recovery_unverified/.test(ps1),
);

// --- 2. VNC ------------------------------------------------------------------

const shBlock = extractVncBlock(sh);
const ps1Block = extractVncBlock(ps1);
check("sh: VNC block found", shBlock !== null);
check("ps1: VNC block found", ps1Block !== null);
if (shBlock !== null && ps1Block !== null) {
  let firstDiff = "";
  if (shBlock !== ps1Block) {
    const a = shBlock.split("\n");
    const b = ps1Block.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        firstDiff = `line ${i + 1}: sh=${JSON.stringify(a[i])} ps1=${JSON.stringify(b[i])}`;
        break;
      }
    }
  }
  check(
    "sh and ps1 VNC blocks are byte-identical",
    shBlock === ps1Block,
    firstDiff,
  );
  check(
    "VNC password comes from the environment, not argv",
    /os\.environ\.get\("TIZEN_VNC_PASSWORD"\)/.test(shBlock) &&
      !/password\s*=\s*sys\.argv/.test(shBlock),
  );
  check(
    "VNC connect is bounded by a timeout",
    /worker\.join\(timeout\)/.test(shBlock),
  );
  check(
    "VNC block classifies the failure (VNC_RESULT) with the server tried",
    /VNC_RESULT=failed/.test(shBlock) &&
      /cat = "timeout"/.test(shBlock) &&
      /cat = "connection_refused"/.test(shBlock) &&
      /cat = "connection_failed"/.test(shBlock) &&
      /cat = "auth_failed"/.test(shBlock),
  );
  // os._exit skips the flush, and stdout is a pipe under execSync.
  check(
    "VNC block flushes stdout before every os._exit",
    (shBlock.match(/sys\.stdout\.flush\(\)\n\s*os\._exit/g) || []).length ===
      (shBlock.match(/os\._exit\(/g) || []).length,
  );
}

// try_vnc / Try-Vnc must follow every on-device method in both chains.
function chainOrder(text, re) {
  const order = [];
  for (const m of text.matchAll(re)) order.push(m[1]);
  return order;
}
const shCalls = chainOrder(
  sh.slice(sh.indexOf('if [ "$IS_EMULATOR" = true ]; then\n  try_')),
  /^\s+(try_\w+(?: \w+)?)\s+&& exit 0$/gm,
);
const ps1Calls = chainOrder(
  ps1.slice(ps1.indexOf("if ($isEmulator) {")),
  /^\s+if \((Try-\w+)[^\n]*?(?:-Tool "(\w+)")?\) \{ exit 0 \}$/gm,
);
const onDeviceSh = ["try_enlightenment_info", "try_framebuffer"];
for (const branch of [shCalls.slice(0, 6), shCalls.slice(6, 12)]) {
  const vnc = branch.indexOf("try_vnc");
  check(
    `sh: try_vnc runs after the on-device methods (${branch.join(" → ")})`,
    vnc !== -1 &&
      onDeviceSh.every((m) => branch.indexOf(m) < vnc) &&
      branch.lastIndexOf("try_device_capture capture_screen") < vnc,
  );
}
for (const branch of [ps1Calls.slice(0, 6), ps1Calls.slice(6, 12)]) {
  const vnc = branch.indexOf("Try-Vnc");
  check(
    `ps1: Try-Vnc runs after the on-device methods (${branch.join(" → ")})`,
    vnc !== -1 &&
      ["Try-EnlightenmentInfo", "Try-Framebuffer"].every(
        (m) => branch.indexOf(m) < vnc,
      ) &&
      branch.lastIndexOf("Try-DeviceCapture") < vnc,
  );
}
check(
  "sh: forwarded VNC port is removed afterwards",
  /forward --remove "tcp:\$\{FWD_PORT\}"/.test(sh),
);
check(
  "ps1: forwarded VNC port is removed afterwards",
  /forward '--remove' "tcp:\$fwdPort"/.test(ps1),
);

check(
  "sh: a signal during the VNC attempt still removes the forward",
  /trap '"\$SDB" -s "\$SERIAL" forward --remove "tcp:\$\{FWD_PORT\}" >\/dev\/null 2>&1; exit 143' TERM/.test(
    sh,
  ),
);

// --- 3. Envelope warnings (screenshot.js) -------------------------------------

const UNIFORM = "CAPTURE_WARNING=uniform_image";
let w = extractCaptureWarnings(
  `  No VNC client on host (pip install vncdotool) - skipping\n${UNIFORM}\n`,
);
check(
  "warnings: uniform + no VNC client adds the install hint",
  w.length === 2 && /pip install vncdotool/.test(w[1]),
  JSON.stringify(w),
);
w = extractCaptureWarnings(`${UNIFORM}\n`);
check("warnings: uniform alone gives one warning", w.length === 1);
w = extractCaptureWarnings(
  `VNC_RESULT=failed\tconnection_refused\tforward\t127.0.0.1::15900\t[Errno 111] Connection refused\r\n${UNIFORM}\r\n`,
);
check(
  "warnings: forwarded VNC failure names the server and the sdb forward (CRLF output)",
  w.length === 2 &&
    w[1].includes("(connection_refused): [Errno 111] Connection refused.") &&
    w[1].includes("Attempted server: 127.0.0.1::15900.") &&
    w[1].includes("forwarded over sdb"),
  JSON.stringify(w),
);
w = extractCaptureWarnings(
  `VNC_RESULT=failed\ttimeout\tenv\t127.0.0.1::5901\ttimed out after 15s\n${UNIFORM}\n`,
);
check(
  "warnings: a TIZEN_VNC_SERVER failure is attributed by source, not by address",
  w.length === 2 && w[1].includes("the server named by TIZEN_VNC_SERVER"),
  JSON.stringify(w),
);
w = extractCaptureWarnings(
  "VNC_RESULT=failed\ttimeout\tforward\t127.0.0.1::15900\ttimed out after 15s\nSUCCESS: host-side xwd\n",
);
check(
  "warnings: no VNC warning when a later method captured a real image",
  w.length === 0,
  JSON.stringify(w),
);
w = extractCaptureWarnings("CAPTURE_WARNING=hwc_recovery_unverified\r\n");
check(
  "warnings: hwc_recovery_unverified is reported",
  w.length === 1 && /re-enable HWC/.test(w[0]),
  JSON.stringify(w),
);

console.log(
  failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
