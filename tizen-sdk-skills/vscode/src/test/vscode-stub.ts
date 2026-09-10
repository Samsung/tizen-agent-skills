// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/test/vscode-stub.ts — minimal stand-in for the `vscode` module.
//
// esbuild aliases `vscode` to this file when bundling the integration tests, so
// the install modules (which reach the OutputChannel through log.ts) can run in
// a plain Node process. Only the surface log.ts actually touches is provided.
const lines: string[] = [];

export const window = {
  createOutputChannel(_name: string) {
    return {
      appendLine(line: string): void {
        lines.push(line);
      },
      append(line: string): void {
        lines.push(line);
      },
      show(): void {
        /* no-op */
      },
      clear(): void {
        lines.length = 0;
      },
      dispose(): void {
        /* no-op */
      },
    };
  },
};

/** Drain the captured log lines (used to assert on warnings). */
export function takeLog(): string[] {
  return lines.splice(0, lines.length);
}
