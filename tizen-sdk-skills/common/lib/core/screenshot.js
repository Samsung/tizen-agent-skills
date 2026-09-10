// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Screenshot domain: capture a screenshot from a Tizen emulator or device
 *
 * Delegates to the platform-specific script (tizen-screenshot.sh on Linux/macOS,
 * tizen-screenshot.ps1 on Windows) and returns a Standard JSON Envelope.
 */

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { formatError } = require("../envelope/response-formatter");
const { Envelope } = require("../envelope/envelope");
const { resolveSdb, resolveSerial } = require("./sdb");
const { resolveScript, execPluginScript } = require("./plugin-cache");

/**
 * Largest capture we will inline as base64.
 *
 * A screenshot the caller cannot see is not much use, so the image travels in
 * the envelope. Base64 costs ~4/3 of the raw bytes, and the envelope is read
 * as text, so a full-resolution TV capture would swamp it — past this size we
 * report the path only and let the caller open the file.
 */
const MAX_INLINE_BYTES = 512 * 1024;

/**
 * Largest *thumbnail* we will inline when the full image is too big.
 *
 * When the original capture exceeds MAX_INLINE_BYTES, we generate a downscaled
 * JPEG thumbnail and inline that instead. This ensures the caller always gets
 * a visible preview, even for multi-megabyte TV captures. The full file is
 * still available at image.path.
 */
const THUMBNAIL_MAX_WIDTH = 640; // Downscale to at most 640px wide

/** PNG/JPEG magic numbers — the capture chain can yield either. */
function detectMimeType(buffer) {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504e47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

/**
 * Read a PNG's pixel dimensions from its IHDR chunk (bytes 16-23).
 * Returns null for anything that is not a PNG, which is not an error —
 * dimensions are supplementary.
 */
function readPngDimensions(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Recover which fallback produced the capture.
 *
 * The script prints "SUCCESS: <method>" on the winning branch. Knowing whether
 * the image came from enlightenment_info or a raw framebuffer read matters —
 * the framebuffer path often yields only the kernel console.
 *
 * @param {string} stdout - script output
 * @returns {string|null}
 */
function extractCaptureMethod(stdout) {
  const match = (stdout || "").match(/^\s*SUCCESS:\s*(.+?)\s*$/m);
  return match ? match[1] : null;
}

/**
 * Turn the script's CAPTURE_WARNING=<key> machine lines into envelope warnings.
 *
 * uniform_image: every capture method either failed or produced a single flat
 * color, and the script kept the flat capture as a last resort (see
 * accept_capture in tizen-screenshot.sh). The file is a real capture — the
 * screen just looks off/black — so the success envelope must say why the
 * image the caller is about to look at is blank.
 *
 * @param {string} stdout - script output
 * @returns {string[]} warnings, empty when nothing was flagged
 */
function extractCaptureWarnings(stdout) {
  const warnings = [];
  if (/^CAPTURE_WARNING=uniform_image$/m.test(stdout || "")) {
    warnings.push(
      "The capture is a single solid color — the screen may be off, showing a blank display, " +
        "or rendering may be broken on the host. Every capture method returned the same flat image.",
    );
  }
  return warnings;
}

/**
 * Generate a downscaled JPEG thumbnail of the captured image using Python PIL.
 *
 * When the original capture is too large to inline as base64, we create a
 * small JPEG preview so the caller can still see *something* without opening
 * the file. The thumbnail is written to a temp file and read back as a buffer.
 *
 * @param {string} filePath - absolute path to the full-resolution image
 * @param {number} maxWidth - maximum thumbnail width in pixels
 * @returns {Buffer|null} JPEG thumbnail buffer, or null if generation failed
 */
function generateThumbnail(filePath, maxWidth) {
  const script = `
import sys
from PIL import Image

img = Image.open(sys.argv[1])
w, h = img.size
if w > int(sys.argv[2]):
    ratio = int(sys.argv[2]) / w
    img = img.resize((int(sys.argv[2]), int(h * ratio)), Image.LANCZOS)
img = img.convert("RGB")
img.save(sys.argv[3], "JPEG", quality=70)
`;

  const tmpFile = filePath + ".thumb.jpg";
  try {
    execFileSync(
      "python3",
      ["-c", script, filePath, String(maxWidth), tmpFile],
      {
        timeout: 10000,
        stdio: "pipe",
      },
    );
    const thumbBuffer = fs.readFileSync(tmpFile);
    return thumbBuffer;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Build the `image` block for the success envelope.
 *
 * Always carries the absolute path, size and MIME type. When the file fits
 * under MAX_INLINE_BYTES, the full image is inlined as `base64`. When it is
 * too large, a downscaled JPEG thumbnail is generated and inlined as
 * `base64` (with `base64_is_thumbnail: true`), so the caller always gets a
 * visible preview. If thumbnail generation also fails, `base64_omitted_reason`
 * explains why.
 *
 * @param {string} filePath - absolute path to the captured image
 * @returns {object} image descriptor
 */
function buildImagePayload(filePath) {
  const stat = fs.statSync(filePath);
  const image = {
    path: filePath,
    size_bytes: stat.size,
    mime_type: "image/png",
  };

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    image.base64_omitted_reason = `Could not read the file back: ${error.message}`;
    return image;
  }

  image.mime_type = detectMimeType(buffer);

  const dimensions = readPngDimensions(buffer);
  if (dimensions) {
    image.width = dimensions.width;
    image.height = dimensions.height;
  }

  // Case 1: Full image fits inline — base64 the original
  if (stat.size <= MAX_INLINE_BYTES) {
    image.base64 = buffer.toString("base64");
    return image;
  }

  // Case 2: Image too large — generate a downscaled JPEG thumbnail
  const thumbBuffer = generateThumbnail(filePath, THUMBNAIL_MAX_WIDTH);
  if (thumbBuffer && thumbBuffer.length > 0) {
    image.base64 = thumbBuffer.toString("base64");
    image.base64_is_thumbnail = true;
    image.thumbnail_mime_type = "image/jpeg";
    image.thumbnail_width = THUMBNAIL_MAX_WIDTH;
    image.thumbnail_size_bytes = thumbBuffer.length;
    image.base64_omitted_reason =
      `Full image is ${Math.round(stat.size / 1024)} KB, over the ${MAX_INLINE_BYTES / 1024} KB inline limit. ` +
      `A ${Math.round(thumbBuffer.length / 1024)} KB JPEG thumbnail is inlined instead. ` +
      `Open ${filePath} for the full-resolution capture.`;
    return image;
  }

  // Case 3: Both full image and thumbnail failed — path only
  image.base64_omitted_reason =
    `Image is ${Math.round(stat.size / 1024)} KB, over the ${MAX_INLINE_BYTES / 1024} KB inline limit, ` +
    `and thumbnail generation failed. Open ${filePath} to view it.`;
  return image;
}

/**
 * Capture a screenshot from a Tizen emulator or device.
 *
 * @param {string|null} serial - Device serial (omit to auto-select)
 * @param {string|null} outputPath - Output PNG path (default: ./emulator_screenshot.png)
 * @returns {Promise<object>} Standard JSON Envelope
 */
async function captureScreenshot(
  serial = null,
  outputPath = null,
  command = "tizen-sdk screenshot",
) {
  const startTime = Date.now();

  try {
    // Resolve sdb
    const sdbResult = resolveSdb();
    if (sdbResult.error) {
      return formatError(
        command,
        "sdk_path_not_set",
        sdbResult.error,
        null,
        startTime,
      );
    }
    const { sdbPath } = sdbResult;

    // Resolve serial
    const serialResult = resolveSerial(sdbPath, serial);
    if (serialResult.errorCategory) {
      return formatError(
        command,
        serialResult.errorCategory,
        serialResult.message,
        null,
        startTime,
      );
    }
    const resolvedSerial = serialResult.serial;

    // Both values are interpolated into a shell command line below — reject
    // shell metacharacters up front (explicit serials arrive unvalidated).
    if (!/^[A-Za-z0-9._:-]+$/.test(resolvedSerial)) {
      return formatError(
        command,
        "invalid_parameters",
        `Invalid device serial: "${resolvedSerial}"`,
        null,
        startTime,
      );
    }

    // Resolve output path. Windows-style backslashes are normalized to forward
    // slashes (PowerShell and Git Bash both accept them) instead of rejected —
    // a backslash is a shell escape in the interpolated command line, and
    // rejecting it made every native Windows path fail (see file-transfer.js).
    const resolvedOutput = (outputPath || "./emulator_screenshot.png").replace(
      /\\/g,
      "/",
    );
    if (/["`$\\;|&<>\n\r]/.test(resolvedOutput)) {
      return formatError(
        command,
        "invalid_parameters",
        `Output path contains unsupported characters: "${resolvedOutput}"`,
        null,
        startTime,
      );
    }

    // Find the screenshot script via plugin-cache resolver
    const scriptResult = resolveScript("tizen-screenshot");
    if (scriptResult.error) {
      return formatError(
        command,
        "script_not_found",
        scriptResult.error,
        null,
        startTime,
      );
    }

    // Execute the screenshot script via plugin-cache executor
    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    const winArgs = `-Serial "${resolvedSerial}" -OutputPath "${resolvedOutput}"`;
    const unixArgs = `"${resolvedSerial}" "${resolvedOutput}"`;

    try {
      stdout = execPluginScript(scriptResult.scriptPath, winArgs, unixArgs, {
        timeout: 60000,
      });
    } catch (error) {
      exitCode = error.status || 1;
      stdout = error.stdout || "";
      stderr = error.stderr || "";
    }

    // Check if output file was created
    const outputExists =
      fs.existsSync(resolvedOutput) && fs.statSync(resolvedOutput).size > 0;

    if (exitCode === 0 && outputExists) {
      const envelope = new Envelope(command);
      envelope.startTime = startTime;
      const isEmulator = resolvedSerial.startsWith("emulator-");
      const absolutePath = path.resolve(resolvedOutput);
      // uniform_image and friends: the file exists but may be a flat color —
      // say so, or the caller stares at a black PNG with no explanation.
      const warnings = extractCaptureWarnings(stdout);
      return envelope.success(
        {
          device_serial: resolvedSerial,
          output_path: absolutePath,
          is_emulator: isEmulator,
          // The capture itself, so the caller does not have to go find the file.
          image: buildImagePayload(absolutePath),
          // Which fallback won — the chain is long and this is the only record.
          capture_method: extractCaptureMethod(stdout),
          stdout: stdout.trim(),
        },
        { warnings },
      );
    } else {
      return formatError(
        command,
        "capture_failed",
        `Screenshot capture failed (exit ${exitCode}).${stderr ? ` — ${stderr.trim()}` : ""}`,
        null,
        startTime,
      );
    }
  } catch (error) {
    return formatError(
      command,
      "io_error",
      `Screenshot failed: ${error.message}`,
      null,
      startTime,
    );
  }
}

module.exports = {
  captureScreenshot,
  // Re-exported from ./sdb for backward compatibility with existing callers/tests
  resolveSdb,
};
