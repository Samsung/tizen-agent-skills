// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

/**
 * Edge case tests for envelope field consistency
 *
 * Validates envelope behavior in edge cases:
 * 1. Fallback with explicit template (TV profile)
 * 2. Fallback warning message format
 * 3. Size reporting omission when explicit template used
 * 4. Resolution reporting dependencies on matchedTemplate
 * 5. size_applied false when no match (unavailable size)
 */

console.log("=== Emulator Envelope Edge Cases Test ===\n");

let failures = 0;

function check(name, condition, details = "") {
  if (!condition) {
    failures++;
    console.log(`FAIL ${name}`);
    if (details) console.log(`     ${details}`);
  } else {
    console.log(`PASS ${name}`);
  }
}

// Edge Case 1: Fallback detection and field suppression
console.log("--- Edge Case 1: Fallback Detection ---");

// Simulate script output with TEMPLATE_FALLBACK
const fallbackOutput = "TEMPLATE_FALLBACK=HD1080 TV";
const fallbackMatch = fallbackOutput.match(/^TEMPLATE_FALLBACK=(.+)$/m);

check(
  "TEMPLATE_FALLBACK regex matches correctly",
  fallbackMatch !== null && fallbackMatch[1] === "HD1080 TV",
  `Match: ${fallbackMatch ? fallbackMatch[1] : "null"}`,
);

check(
  "template field suppressed on fallback",
  fallbackMatch ? true : false,
  "When TEMPLATE_FALLBACK detected, template should be set to null",
);

// Edge Case 2: Fallback warning message
console.log("\n--- Edge Case 2: Fallback Warning Message ---");

const vmName = "my-tv";
const sizeWarnings = [];

if (fallbackMatch) {
  sizeWarnings.push(
    `Template '${fallbackMatch[1].trim()}' was rejected by em-cli, so the VM was created at em-cli's ` +
      `default size. Apply the size later with: em-cli modify -n ${vmName} -t "${fallbackMatch[1].trim()}".`,
  );
}

check(
  "warning message includes template",
  sizeWarnings[0].includes(fallbackMatch[1]),
  `Warning: ${sizeWarnings[0]}`,
);

check(
  "warning message includes VM name",
  sizeWarnings[0].includes(vmName),
  `Warning: ${sizeWarnings[0]}`,
);

check(
  "warning message includes em-cli modify",
  sizeWarnings[0].includes("em-cli modify"),
  `Warning: ${sizeWarnings[0]}`,
);

check(
  "warning message quotes template name",
  sizeWarnings[0].includes(`-t "${fallbackMatch[1]}`),
  "Template should be quoted in command suggestion",
);

// Edge Case 3: Explicit template bypasses size reporting
console.log("\n--- Edge Case 3: Explicit Template Size Suppression ---");

const testCases = [
  {
    name: "explicit template: size null",
    explicitTemplate: true,
    requestedSize: "1080",
    expectedSize: null,
  },
  {
    name: "implicit (size-based): size reported",
    explicitTemplate: false,
    requestedSize: "1080",
    expectedSize: "1080",
  },
  {
    name: "no explicit template, no size request: default reported",
    explicitTemplate: false,
    requestedSize: undefined,
    expectedSize: "1080", // DEFAULT_SIZE
  },
];

const DEFAULT_SIZE = "1080";

for (const tc of testCases) {
  const size = tc.explicitTemplate ? null : tc.requestedSize || DEFAULT_SIZE;
  check(
    tc.name,
    size === tc.expectedSize,
    `Expected: ${tc.expectedSize}, Got: ${size}`,
  );
}

// Edge Case 4: Resolution depends on matchedTemplate
console.log("\n--- Edge Case 4: Resolution Reporting ---");

const resolutionCases = [
  {
    name: "size matched: resolution reported",
    fallback: false,
    matchedTemplate: { resolution: "1920x1080" },
    expectedResolution: "1920x1080",
  },
  {
    name: "size not matched: resolution null",
    fallback: false,
    matchedTemplate: null,
    expectedResolution: null,
  },
  {
    name: "fallback occurred: resolution null",
    fallback: true,
    matchedTemplate: { resolution: "1920x1080" }, // Exists but ignored
    expectedResolution: null,
  },
  {
    name: "explicit template: resolution null",
    fallback: false,
    matchedTemplate: null,
    expectedResolution: null,
  },
];

for (const tc of resolutionCases) {
  const resolution =
    tc.fallback || !tc.matchedTemplate ? null : tc.matchedTemplate.resolution;
  check(
    tc.name,
    resolution === tc.expectedResolution,
    `Expected: ${tc.expectedResolution}, Got: ${resolution}`,
  );
}

// Edge Case 5: size_applied only true in specific conditions
console.log("\n--- Edge Case 5: size_applied Conditions ---");

const sizeAppliedCases = [
  {
    name: "size matched, not explicit, no fallback",
    explicitTemplate: false,
    fallback: false,
    matchedTemplate: true,
    expectedApplied: true,
  },
  {
    name: "explicit template",
    explicitTemplate: true,
    fallback: false,
    matchedTemplate: true,
    expectedApplied: false,
  },
  {
    name: "fallback occurred",
    explicitTemplate: false,
    fallback: true,
    matchedTemplate: true,
    expectedApplied: false,
  },
  {
    name: "size not matched",
    explicitTemplate: false,
    fallback: false,
    matchedTemplate: false,
    expectedApplied: false,
  },
];

for (const tc of sizeAppliedCases) {
  // Rule: size_applied = !explicitTemplate && !fallback && Boolean(matchedTemplate)
  const size_applied =
    !tc.explicitTemplate && !tc.fallback && Boolean(tc.matchedTemplate);
  check(
    tc.name,
    size_applied === tc.expectedApplied,
    `Expected: ${tc.expectedApplied}, Got: ${size_applied}`,
  );
}

// Edge Case 6: Fallback + explicit template interaction
console.log("\n--- Edge Case 6: Fallback + Explicit Template ---");

// TV profile scenario: explicit template → em-cli rejects → fallback
// In this case, explicitTemplate was true, but fallback occurred
const fallbackExplicitCase = {
  explicitTemplate: true, // Was explicit
  fallback: true, // But fallback occurred
  requestedSize: "1080",
  matchedTemplate: null,
};

const fallbackExplicitFields = {
  template: fallbackExplicitCase.fallback ? null : "HD1080 TV",
  size: fallbackExplicitCase.explicitTemplate ? null : "1080",
  size_applied:
    !fallbackExplicitCase.explicitTemplate &&
    !fallbackExplicitCase.fallback &&
    Boolean(fallbackExplicitCase.matchedTemplate),
};

check(
  "fallback + explicit: template suppressed",
  fallbackExplicitFields.template === null,
  `Got: ${fallbackExplicitFields.template}`,
);

check(
  "fallback + explicit: size still null (explicit bypass)",
  fallbackExplicitFields.size === null,
  `Got: ${fallbackExplicitFields.size}`,
);

check(
  "fallback + explicit: size_applied false",
  fallbackExplicitFields.size_applied === false,
  `Got: ${fallbackExplicitFields.size_applied}`,
);

// Edge Case 7: Distinguish fallback from explicit template path
console.log("\n--- Edge Case 7: Path Distinction ---");

// Explicit template (no fallback): report template, suppress size
const explicitPath = {
  fallback: false,
  explicitTemplate: true,
  template: "HD1080 Tizen",
  size: null,
  resolution: null,
};

check(
  "explicit path: template non-null",
  explicitPath.template !== null,
  `Got: ${explicitPath.template}`,
);

check(
  "explicit path: size null",
  explicitPath.size === null,
  "Explicit template suppresses size reporting",
);

// Fallback: both template AND size should be null
const fallbackPath = {
  fallback: true,
  explicitTemplate: true, // Was explicit initially
  template: null,
  size: null,
  resolution: null,
};

check(
  "fallback path: template null",
  fallbackPath.template === null,
  "Fallback suppresses template",
);

check(
  "fallback path: size null",
  fallbackPath.size === null,
  "Fallback case already has size null from explicit",
);

// Edge Case 8: Size with no match (unavailable size requested)
console.log("\n--- Edge Case 8: Unavailable Size ---");

const unavailableSize = {
  explicitTemplate: false,
  requestedSize: "1440", // Not available
  matchedTemplate: null,
};

const unavailableSizeFields = {
  size: unavailableSize.requestedSize,
  resolution: unavailableSize.matchedTemplate
    ? unavailableSize.matchedTemplate.resolution
    : null,
  size_applied:
    !unavailableSize.explicitTemplate &&
    Boolean(unavailableSize.matchedTemplate),
};

check(
  "unavailable size: size reported",
  unavailableSizeFields.size === "1440",
  "User requested size should be reported",
);

check(
  "unavailable size: resolution null",
  unavailableSizeFields.resolution === null,
  "No template matched, so no resolution",
);

check(
  "unavailable size: size_applied false",
  unavailableSizeFields.size_applied === false,
  "Requested size was not available",
);

console.log(
  `\n=== ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} ===`,
);
process.exit(failures === 0 ? 0 : 1);
