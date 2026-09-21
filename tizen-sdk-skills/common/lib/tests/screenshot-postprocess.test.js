// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * tizen-screenshot control-panel post-processing.
 *
 * The Python block that strips the emulator's control panel from a host-side
 * window capture is embedded twice — in tizen-screenshot.sh (xwd path) and in
 * tizen-screenshot.ps1 (Win32 window capture) — and has to behave the same on
 * both platforms. Two checks:
 *
 *   1. Parity (always runs): the block between the
 *      `# --- Detect and crop the emulator control panel ---` marker and
 *      `img.save(` is byte-identical in both scripts and pins the
 *      `max_panel_fraction = 0.5` threshold.
 *   2. Behaviour (needs a Python with Pillow; skipped otherwise): the block is
 *      run against synthetic captures of the skins the emulator ships, at the
 *      geometry where the threshold matters (1/4x scale, the narrowest display
 *      the plugin's templates produce), so a real control panel is still
 *      removed while a light app screen is no longer mistaken for one.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPTS = path.join(__dirname, "..", "..", "scripts", "tizen-screenshot");
const SH = path.join(SCRIPTS, "tizen-screenshot.sh");
const PS1 = path.join(SCRIPTS, "tizen-screenshot.ps1");
const START_MARKER = "# --- Detect and crop the emulator control panel ---";

let failures = 0;
function check(name, condition, details = "") {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  if (!condition && details) console.log(`     ${details}`);
}

function extractBlock(file) {
  // The .ps1 is CRLF on disk (.gitattributes); compare content, not line endings.
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const start = lines.findIndex((l) => l === START_MARKER);
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("img.save("));
  if (end === -1) return null;
  return lines.slice(start, end).join("\n").replace(/\s+$/, "");
}

// --- 1. Parity ---------------------------------------------------------------

const shBlock = extractBlock(SH);
const ps1Block = extractBlock(PS1);
check("sh: post-processing block found", shBlock !== null);
check("ps1: post-processing block found", ps1Block !== null);

if (shBlock !== null && ps1Block !== null) {
  const same = shBlock === ps1Block;
  let firstDiff = "";
  if (!same) {
    const a = shBlock.split("\n");
    const b = ps1Block.split("\n");
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== b[i]) {
        firstDiff = `line ${i + 1}: sh=${JSON.stringify(a[i])} ps1=${JSON.stringify(b[i])}`;
        break;
      }
    }
  }
  check(
    "sh and ps1 post-processing blocks are byte-identical",
    same,
    firstDiff,
  );
  check(
    "threshold pinned at max_panel_fraction = 0.5",
    /^\s+max_panel_fraction = 0\.5$/m.test(shBlock) &&
      /^\s+max_panel_fraction = 0\.5$/m.test(ps1Block),
  );
  // PowerShell expands `$name` inside a double-quoted here-string, so a `$` in
  // the block would be rewritten before Python ever sees it.
  check(
    "block contains no `$` (ps1 here-string expansion)",
    !/\$/.test(ps1Block),
  );
}

// --- 2. Behaviour -------------------------------------------------------------

function findPythonWithPil() {
  for (const exe of ["python3", "python"]) {
    const probe = spawnSync(exe, ["-c", "import PIL"], { encoding: "utf8" });
    if (probe.status === 0) return exe;
  }
  return null;
}

const python = ps1Block === null ? null : findPythonWithPil();
if (!python) {
  console.log("SKIP  behaviour cases need a Python with Pillow");
} else {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tizen-shot-pp-"));
  const runner = path.join(tmp, "postprocess.py");
  fs.writeFileSync(
    runner,
    [
      "import sys",
      "from PIL import Image",
      "img = Image.open(sys.argv[1])",
      "width, height = img.size",
      ps1Block,
      "img.save(sys.argv[2])",
      'print(f"RESULT {img.size[0]}x{img.size[1]}")',
      "",
    ].join("\n"),
  );

  // Every fixture is a list of vertical bands: [width, colour|"noise"].
  // "noise" is a colourful gradient no column of which passes the grayscale test;
  // colour tuples are flat fills. Heights are the captured window height.
  const LIGHT = [235, 235, 235]; // blank/light app screen (passes the grayscale test)
  const PANEL = [200, 200, 200]; // light-gray control panel
  const DARK = [40, 20, 60]; // TV remote body / dark buttons
  const BEZEL = [30, 30, 30]; // phone bezel of the tizen-*-3btn skins (below min_brightness)
  const cases = [
    {
      name: "TV skin, light app: 966px screen + 106px remote is kept whole (the reported bug)",
      height: 556,
      bands: [
        [966, LIGHT],
        [106, DARK],
      ],
      expectWidth: 1072,
      expectLog: /Skipped control panel removal/,
    },
    {
      name: "panel splitting the display is removed and the halves stitched",
      height: 300,
      bands: [
        [180, "noise"],
        [40, PANEL],
        [180, "noise"],
      ],
      expectWidth: 360,
      expectLog: /Stitched display/,
    },
    {
      name: "HD720 at 1/4x (320px) + 200px right-edge panel (38%) is still cropped",
      height: 220,
      bands: [
        [320, "noise"],
        [200, PANEL],
      ],
      expectWidth: 320,
      expectLog: /Cropped to display area/,
    },
    {
      name: "HD1080 at 1/4x (480px) + 200px right-edge panel (29%) is still cropped",
      height: 310,
      bands: [
        [480, "noise"],
        [200, PANEL],
      ],
      expectWidth: 480,
      expectLog: /Cropped to display area/,
    },
    {
      // A blank app next to a real panel makes one grayscale run across both; the
      // frame is kept as captured (before this rule the crop was 0 px wide).
      name: "light app + right-edge panel keeps the frame instead of a zero-width crop",
      height: 220,
      bands: [
        [320, LIGHT],
        [200, PANEL],
      ],
      expectWidth: 520,
      expectLog: /Skipped control panel removal/,
    },
    {
      name: "dark bezel skin (tizen-720x1280-3btn) is left untouched",
      height: 300,
      bands: [
        [30, BEZEL],
        [200, "noise"],
        [30, BEZEL],
      ],
      expectWidth: 260,
      expectLog: null,
    },
  ];

  const gen = path.join(tmp, "gen.py");
  fs.writeFileSync(
    gen,
    [
      "import json, sys",
      "from PIL import Image",
      "spec = json.loads(sys.argv[1])",
      "h = spec['height']",
      "w = sum(b[0] for b in spec['bands'])",
      "img = Image.new('RGB', (w, h))",
      "x0 = 0",
      "for bw, colour in spec['bands']:",
      "    for x in range(x0, x0 + bw):",
      "        for y in range(h):",
      "            if colour == 'noise':",
      "                img.putpixel((x, y), ((x * 3) % 255, (y * 5) % 255, 100))",
      "            else:",
      "                img.putpixel((x, y), tuple(colour))",
      "    x0 += bw",
      "img.save(sys.argv[2])",
      "",
    ].join("\n"),
  );

  cases.forEach((c, i) => {
    const input = path.join(tmp, `case${i}.png`);
    const output = path.join(tmp, `case${i}.out.png`);
    const g = spawnSync(python, [gen, JSON.stringify(c), input], {
      encoding: "utf8",
    });
    if (g.status !== 0) {
      check(c.name, false, `fixture generation failed: ${g.stderr}`);
      return;
    }
    const r = spawnSync(python, [runner, input, output], { encoding: "utf8" });
    const out = `${r.stdout}${r.stderr}`;
    const m = out.match(/^RESULT (\d+)x(\d+)$/m);
    const width = m ? Number(m[1]) : NaN;
    const logOk = c.expectLog
      ? c.expectLog.test(out)
      : !/Skipped|Stitched|Cropped/.test(out);
    check(
      c.name,
      r.status === 0 && width === c.expectWidth && logOk,
      `exit=${r.status} width=${width} (want ${c.expectWidth})\n     ${out.trim().replace(/\n/g, "\n     ")}`,
    );
  });

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(
  failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
