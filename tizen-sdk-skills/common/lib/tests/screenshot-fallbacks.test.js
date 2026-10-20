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
 *      always followed by `-hwc 1`.
 *   2. Host-side VNC: the vncdotool Python block (between the
 *      `# --- VNC capture (vncdotool) ---` marker and `os._exit(0)`) is
 *      byte-identical in both scripts, never takes the password from argv, and
 *      runs after every on-device method in both chains.
 *
 * Static checks only — no device, Python or VNC server needed.
 */

const fs = require("fs");
const path = require("path");

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
  const off = text.indexOf("-hwc 0");
  const on = text.indexOf("-hwc 1");
  check(
    `${name}: HWC is switched off for the retry and back on afterwards`,
    off !== -1 && on > off,
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

// ps1 restores HWC in a finally block so a throwing dump cannot leave it off.
check(
  "ps1: -hwc 1 runs in a finally block",
  /\} finally \{\n\s+Invoke-Sdb \$SdbPath \$DeviceSerial shell "\$eTool -hwc 1"/.test(
    ps1,
  ),
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

console.log(
  failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
