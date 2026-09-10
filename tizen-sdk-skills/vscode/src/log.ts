// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/log.ts — OutputChannel wrapper (mirrors write_status from setup.sh)
import * as vscode from "vscode";

export type StatusType = "Success" | "Warning" | "Error" | "Info";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Tizen AI Extension");
  }
  return channel;
}

export function writeStatus(message: string, type: StatusType = "Info"): void {
  const ch = getOutputChannel();
  const now = new Date().toLocaleTimeString();
  ch.appendLine(`[${now}] [${type}] ${message}`);
}

export function writeRaw(message: string): void {
  const ch = getOutputChannel();
  ch.appendLine(message);
}

export function writeSection(title: string): void {
  const ch = getOutputChannel();
  ch.appendLine("");
  ch.appendLine(`=== ${title} ===`);
}

export function show(): void {
  getOutputChannel().show(true);
}
