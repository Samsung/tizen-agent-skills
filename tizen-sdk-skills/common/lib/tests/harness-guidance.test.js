// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * harnessGuidance() — the per-harness sentence every Phase-1 pre-check puts in
 * its "not installed" envelope (common/lib/core/sdk.js), and the Cline polling
 * recipe the installer skills spell out.
 *
 * Cline aborts a tool after 5 consecutive identical calls and stops the task
 * after 6 errors in a row. A 10-15 min install polled every 25 s is 25-35
 * polls, so the recipe must (a) make every poll command distinct — an
 * increasing attempt number — and (b) stop after at most 4 polls per turn,
 * which is below the 5-call threshold on its own. The 25 s sleep must stay
 * under Cline's 30 s execute_command timeout.
 *
 * The string is built from many concatenated fragments; the checks below assert
 * phrases that span the joins, so a missing space at a boundary fails here
 * instead of reaching an agent.
 *
 * Run: node lib/tests/harness-guidance.test.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { harnessGuidance } = require("../core/sdk");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

const detach = harnessGuidance("detach");
const foreground = harnessGuidance("foreground");

console.log("harnessGuidance(): text shape");

test("returns one string per mode, ending with a trailing space", () => {
  for (const text of [detach, foreground]) {
    assert.strictEqual(typeof text, "string");
    assert.ok(text.endsWith(" "), "must end with a trailing space");
    assert.ok(!text.endsWith("  "), "exactly one trailing space");
  }
});

test("no fragment boundary lost its space (no run-together words, no double spaces)", () => {
  for (const text of [detach, foreground]) {
    assert.ok(!text.includes("  "), `double space in: ${text}`);
    // A lowercase letter or ')' immediately followed by an uppercase letter is
    // what a dropped space at a "... word" + "Word ..." join looks like.
    // Legitimate exceptions: "macOS" and the harness names themselves.
    const glued = text
      .replace(/macOS/g, "macos")
      .replace(/[A-Z_]{2,}/g, "X")
      .match(/[a-z)][A-Z]/g);
    assert.strictEqual(glued, null, `glued words: ${JSON.stringify(glued)}`);
  }
});

console.log("\nharnessGuidance('detach'): Cline polling recipe");

// The expected text, one entry per clause. Entries 2-8 are the whole Cline
// clause; the last entry is the start of the shared Codex clause that follows.
const detachPhrases = [
  "Run the suggested_fix command per your harness: ",
  "Claude Code — Bash tool with run_in_background: true, END YOUR TURN, resume on <task-notification>. ",
  "Cline / harnesses WITHOUT background completion notification — use --detach (Linux/macOS) or -Detach (Windows) to launch a detached process, ",
  "then poll --status / -Status after a 25 s sleep (execute_command times out at 30 s), ",
  "putting an increasing attempt number in every poll command (e.g. echo 'poll #N') so no two calls are identical — Cline aborts after 5 consecutive identical tool calls — ",
  "and at most 4 polls per turn: still STATUS=running after that, tell the user that the install keeps running in the background, ",
  "that no automatic completion notice will come (Cline cannot notify them when the install finishes) so when they want to know whether it finished they have to ask (e.g. 'tell me the install progress'), and give them the --status / -Status command for checking by hand; ",
  "then END YOUR TURN and, when they ask, run --status / -Status and continue from there, until STATUS=done. ",
  "Do NOT use run_in_background (10-min timeout kills the process). Do NOT run in foreground (the package log floods the context window). ",
  "Codex CLI — one exec call waits at most 30 s, so do NOT run suggested_fix.command; run suggested_fix.background_command instead ",
];
const CLINE_START = 2;
const CLINE_END = 9; // exclusive
const expectedClineClause = detachPhrases
  .slice(CLINE_START, CLINE_END)
  .join("");

test("the assembled Cline clause equals the expected text character for character", () => {
  const start = detach.indexOf("Cline / harnesses");
  const end = detach.indexOf("Codex CLI");
  assert.ok(
    start !== -1 && end > start,
    "Cline clause precedes the Codex clause",
  );
  assert.strictEqual(detach.slice(start, end), expectedClineClause);
});

test("the whole guidance starts with every clause verbatim, in order, with nothing in between", () => {
  const expectedPrefix = detachPhrases.join("");
  assert.ok(
    detach.startsWith(expectedPrefix),
    `guidance diverges from the expected text at index ${[...expectedPrefix].findIndex((ch, i) => detach[i] !== ch)}:\n  got:      ${detach.slice(0, 400)}\n  expected: ${expectedPrefix.slice(0, 400)}`,
  );
});

test("no embedded double quotes — every fragment can stay a double-quoted literal", () => {
  assert.ok(!detach.includes('"'), `double quote inside: ${detach}`);
  assert.ok(!foreground.includes('"'), `double quote inside: ${foreground}`);
});

test("the old unbounded loop instruction is gone", () => {
  assert.ok(!/every 60\s?s/.test(detach), "still says 'every 60s'");
  assert.ok(!/run the same command/i.test(detach));
});

test("numbers are consistent with Cline's limits: sleep < 30 s timeout, polls per turn < 5-call guard", () => {
  const sleep = Number(/after a (\d+) s sleep/.exec(detach)[1]);
  const timeout = Number(/times out at (\d+) s/.exec(detach)[1]);
  const polls = Number(/at most (\d+) polls per turn/.exec(detach)[1]);
  const guard = Number(
    /aborts after (\d+) consecutive identical/.exec(detach)[1],
  );
  assert.strictEqual(sleep, 25);
  assert.strictEqual(timeout, 30);
  assert.ok(
    sleep < timeout,
    `sleep ${sleep} must stay under the ${timeout} s timeout`,
  );
  assert.strictEqual(guard, 5);
  assert.ok(
    polls < guard,
    `polls per turn ${polls} must stay under the ${guard}-call guard`,
  );
});

console.log("\nharnessGuidance('foreground'): unchanged");

test("foreground mode tells Cline to run in the foreground and never mentions polling", () => {
  assert.ok(detach !== foreground);
  assert.ok(foreground.includes("run in FOREGROUND"));
  assert.ok(
    foreground.includes(
      "Do NOT background it: no Start-Process, no start /b, no trailing &. ",
    ),
  );
  // Only the Cline clause must be free of polling talk — the shared Codex tail
  // legitimately says "poll node .../job-cli.js wait".
  const clineClause = foreground.slice(
    foreground.indexOf("Cline / harnesses"),
    foreground.indexOf("Codex CLI"),
  );
  assert.ok(clineClause.length > 0, "Cline clause precedes the Codex clause");
  assert.ok(!/poll/.test(clineClause), `Cline clause polls: ${clineClause}`);
  assert.ok(
    foreground.includes("Codex CLI — one exec call waits at most 30 s"),
  );
});

console.log(
  "\nInstaller skills and agents: the same recipe, no leftover loop wording",
);

const commonDir = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(commonDir, "..");
const skillDocs = [
  "tizen-sdk-install",
  "tizen-sdk-install-custom-repo",
  "tizen-tv-sdk-install",
  "tizen-tv-sdk-install-from-zip",
].map((name) => path.join(commonDir, "skills", name, "SKILL.md"));
const agentDocs = [
  "tizen-sdk-install.md",
  "tizen-sdk-install-custom-repo.md",
].map((name) => path.join(commonDir, "agents", name));

for (const file of skillDocs) {
  const rel = path.relative(commonDir, file);
  test(`${rel}: numbered polls, 4-per-turn cap, stop rule, no verbatim-repeat instruction`, () => {
    // Markdown wraps sentences across lines; compare on collapsed whitespace.
    const text = fs.readFileSync(file, "utf-8").replace(/\s+/g, " ");
    assert.ok(
      text.includes('echo "poll #1"'),
      "bash poll carries an attempt number",
    );
    assert.ok(
      text.includes("Write-Host 'poll #1'"),
      "PowerShell poll carries an attempt number",
    );
    assert.ok(text.includes("최대 4번"), "caps polling at 4 per turn");
    assert.ok(
      text.includes("4번째 폴링 후에도"),
      "says what to do after the 4th poll",
    );
    assert.ok(text.includes("턴을 종료"), "ends the turn instead of looping");
    assert.ok(text.includes("연속 5번"), "explains the 5-identical-call guard");
    assert.ok(
      text.includes("계속 진행됩니다"),
      "says the detached install keeps running",
    );
    assert.ok(
      text.includes("같은 폴링 명령을 그대로 다시 실행하지 마세요"),
      "warns against repeating the poll verbatim",
    );
    assert.ok(
      text.includes("설치 완료의 자동 알림은 제공되지 않으므로"),
      "turn-ending message says no automatic completion notice comes",
    );
    assert.ok(
      text.includes(
        '설치 완료 확인이 필요하시면 "설치 진행 상태를 알려줘"라고 물어봐 주시면 상태를 확인해 이어갑니다',
      ),
      "turn-ending message tells the user how to ask for the progress",
    );
    assert.ok(
      !text.includes("다시 동일 명령 실행"),
      "old loop wording (Windows) removed",
    );
    assert.ok(
      !text.includes("다시 `sleep 25 && --status` 실행"),
      "old loop wording (bash) removed",
    );
  });
}

for (const file of agentDocs) {
  const rel = path.relative(commonDir, file);
  test(`${rel}: attempt number and 4-per-turn cap`, () => {
    // Markdown wraps sentences across lines; compare on collapsed whitespace.
    const text = fs.readFileSync(file, "utf-8").replace(/\s+/g, " ");
    assert.ok(text.includes("poll #N"), "poll carries an attempt number");
    assert.ok(text.includes("4 polls per turn"), "caps polling at 4 per turn");
    assert.ok(text.includes("5 consecutive identical"), "explains the guard");
    assert.ok(
      text.includes("Cline cannot notify them when the install finishes"),
      "turn-ending message says Cline cannot notify on completion",
    );
    assert.ok(
      text.includes("END YOUR TURN"),
      "ends the turn instead of looping",
    );
  });
}

// The tizen-cli skill copy is not part of the assembled public common/ tree,
// so it is checked only when present in this checkout.
const cliSkill = path.join(
  repoRoot,
  "tizen-cli",
  "skills",
  "tizen-sdk-install",
  "SKILL.md",
);
if (fs.existsSync(cliSkill)) {
  test("tizen-cli/skills/tizen-sdk-install/SKILL.md: same recipe", () => {
    const text = fs.readFileSync(cliSkill, "utf-8");
    assert.ok(text.includes("poll #N"));
    assert.ok(text.includes("at most 4 polls per turn"));
    assert.ok(
      text.includes("Cline cannot notify them when the install finishes"),
    );
    assert.ok(!/every 60 seconds/.test(text));
  });
} else {
  console.log(
    "  skip tizen-cli/skills/tizen-sdk-install/SKILL.md (not in this tree)",
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
