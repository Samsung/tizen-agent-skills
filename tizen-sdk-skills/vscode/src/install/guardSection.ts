// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Samsung Electronics Co., Ltd.

// src/install/guardSection.ts — marker-delimited section in a file the USER owns
// (Codex CLI's ~/.codex/AGENTS.md). Port of install_guard_section() in
// common/setup/setup-lib.sh: never clobbers the user's other content, idempotent,
// and a section left by a pre-rename release is dropped so the file cannot end
// up with two contradictory guard sections.
//
// Where this port is stricter than the shell twin:
//   - A section is only the text between a begin line and the NEXT marker line
//     when that marker is the matching end. A begin with no end after it (a
//     hand-truncated file), an end with no begin, or a marker that is indented
//     or quoted inside a sentence is ordinary user text: it is neither replaced
//     nor skipped, so nothing after a broken marker can be deleted. Callers can
//     surface those lines with findOrphanGuardMarkers().
//   - The file's own line endings are kept. A CRLF AGENTS.md stays CRLF, and
//     the section we insert uses the same ending, instead of the whole file
//     silently becoming LF on the first refresh.
//   - Duplicate well-formed sections collapse into one on refresh.
//
// Deliberately free of any `vscode` import: the standalone uninstall process and
// the plain-node unit tests use this too.
import { ALL_PLUGIN_NAMES, PLUGIN_NAME } from "./claudeSettings";

export interface GuardMarkers {
  begin: string;
  end: string;
}

/** The HTML-comment pair that brackets one plugin's section. */
export function guardMarkers(pluginName: string = PLUGIN_NAME): GuardMarkers {
  return {
    begin: `<!-- ${pluginName}:begin -->`,
    end: `<!-- ${pluginName}:end -->`,
  };
}

type Eol = "\n" | "\r\n";

/** A well-formed section: inclusive line indices of its begin and end marker. */
interface Span {
  begin: number;
  end: number;
}

interface Scan {
  spans: Span[];
  /** Line indices of marker lines that do not form a section. */
  orphans: number[];
}

/**
 * The line ending the file predominantly uses. Counted with split() rather
 * than a regex so there is no quantifier for an analyser to worry about.
 */
function detectEol(text: string): Eol {
  const crlf = text.split("\r\n").length - 1;
  const lf = text.split("\n").length - 1 - crlf;
  return crlf > 0 && crlf >= lf ? "\r\n" : "\n";
}

/** Split on LF or CRLF. Marker matching below ignores trailing blanks. */
function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Pair marker lines into sections. Scanning forward, a begin is only closed by
 * the very next marker line when that line is the end; if the next marker is
 * another begin, the earlier one is an orphan. This is what keeps a truncated
 * section from swallowing a later, intact one (and the user text in between).
 */
function scanSections(lines: string[], markers: GuardMarkers): Scan {
  const spans: Span[] = [];
  const orphans: number[] = [];
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trimEnd();
    if (bare === markers.begin) {
      if (open !== -1) orphans.push(open);
      open = i;
    } else if (bare === markers.end) {
      if (open === -1) {
        orphans.push(i);
      } else {
        spans.push({ begin: open, end: i });
        open = -1;
      }
    }
  }
  if (open !== -1) orphans.push(open);
  return { spans, orphans };
}

/** `lines` without the given spans (inclusive), in order. */
function removeSpans(lines: string[], spans: Span[]): string[] {
  if (spans.length === 0) return lines;
  const drop = new Set<number>();
  for (const { begin, end } of spans) {
    for (let i = begin; i <= end; i++) drop.add(i);
  }
  return lines.filter((_, i) => !drop.has(i));
}

/** The lines of a fresh section: markers, shared body, optional extra. */
function sectionLines(
  body: string,
  extra: string | undefined,
  markers: GuardMarkers,
): string[] {
  let text = body.replace(/\r\n/g, "\n").trimEnd();
  if (extra) text += `\n\n${extra.replace(/\r\n/g, "\n").trimEnd()}`;
  return [markers.begin, ...text.split("\n"), markers.end];
}

/**
 * Remove every well-formed section bracketed by `pluginName`'s markers. Text
 * outside them — including any orphan marker line — is returned line for line
 * with the file's own line endings. Returns the input untouched when there is
 * no such section.
 */
export function stripGuardSection(
  text: string,
  pluginName: string = PLUGIN_NAME,
): string {
  const lines = splitLines(text);
  const { spans } = scanSections(lines, guardMarkers(pluginName));
  if (spans.length === 0) return text;
  return removeSpans(lines, spans).join(detectEol(text));
}

/** Whether `text` holds a well-formed section under the current or any legacy name. */
export function hasGuardSection(text: string): boolean {
  const lines = splitLines(text);
  return ALL_PLUGIN_NAMES.some(
    (name) => scanSections(lines, guardMarkers(name)).spans.length > 0,
  );
}

export interface OrphanGuardMarker {
  pluginName: string;
  /** 1-based line number, for a log message. */
  line: number;
  text: string;
}

/**
 * Marker lines that do not form a section — a begin with no end, an end with
 * no begin — under the current or any legacy name. upsertGuardSection() leaves
 * these alone as user text; callers use this to say so in the log.
 */
export function findOrphanGuardMarkers(text: string): OrphanGuardMarker[] {
  const lines = splitLines(text);
  const out: OrphanGuardMarker[] = [];
  for (const pluginName of ALL_PLUGIN_NAMES) {
    for (const i of scanSections(lines, guardMarkers(pluginName)).orphans) {
      out.push({ pluginName, line: i + 1, text: lines[i] });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/**
 * Insert or refresh our section in `text`.
 *
 *  - Well-formed sections under a legacy plugin name are removed first.
 *  - An existing well-formed current-name section is replaced in place; any
 *    further duplicates are removed.
 *  - Otherwise the section is appended, separated from existing content by one
 *    blank line.
 *
 * Orphan marker lines are treated as user text (see findOrphanGuardMarkers).
 * Line endings follow the file. `body` is the shared guard document; `extra`,
 * when given, is appended inside the markers after a blank line (host-specific
 * lines such as this host's runner cache root).
 */
export function upsertGuardSection(
  text: string,
  body: string,
  extra?: string,
  pluginName: string = PLUGIN_NAME,
): string {
  const eol = detectEol(text);
  let lines = splitLines(text);

  for (const legacy of ALL_PLUGIN_NAMES) {
    if (legacy === pluginName) continue;
    lines = removeSpans(lines, scanSections(lines, guardMarkers(legacy)).spans);
  }

  const markers = guardMarkers(pluginName);
  const section = sectionLines(body, extra, markers);
  const { spans } = scanSections(lines, markers);

  if (spans.length > 0) {
    const [first, ...duplicates] = spans;
    const kept = removeSpans(lines, duplicates);
    // Indices shift only for lines after a removed span; the first span is by
    // construction before every duplicate, so its indices are unchanged.
    const before = kept.slice(0, first.begin);
    const after = kept.slice(first.end + 1);
    return [...before, ...section, ...after].join(eol);
  }

  // Append: drop trailing blank lines, keep everything else as written.
  let last = lines.length;
  while (last > 0 && lines[last - 1].trim().length === 0) last--;
  const content = lines.slice(0, last);
  const out = content.length > 0 ? [...content, "", ...section] : section;
  return out.join(eol) + eol;
}
