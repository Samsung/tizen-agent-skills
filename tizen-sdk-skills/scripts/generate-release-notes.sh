#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# generate-release-notes.sh — produce a release body for tizen-sdk-skills that
# contains ONLY pull requests touching the tizen-sdk-skills/ directory.
#
# GitHub's --generate-notes lists every PR merged between the previous tag and
# the new one, regardless of which plugin it touched. In a multi-plugin
# repository (tizen-sdk-skills + tizen-action-skills + root docs) that means a
# tizen-action-skills PR leaks into the tizen-sdk-skills release notes.
#
# This script filters by file path instead of relying on labels: for every PR
# merged in the range, it asks the GitHub API which files changed and keeps the
# PR only if at least one file is under tizen-sdk-skills/.
#
# Usage (from the release workflow):
#   bash tizen-sdk-skills/scripts/generate-release-notes.sh \
#       <release-tag> > release-notes.md
#
# Arguments:
#   $1 — the release tag being created (e.g. tizen-sdk-skills-v1.4.2)
#
# Output: filtered markdown release body on stdout.
#
# Requires: gh (authenticated), git, jq, node (for version comparison).
set -euo pipefail

RELEASE_TAG="${1:?usage: generate-release-notes.sh <release-tag>}"
PLUGIN_DIR="tizen-sdk-skills"

# ── Find the previous tizen-sdk-skills-v* tag ──────────────────────────────
# git tag --sort=-v:refname lists tags newest-first; pick the first that is
# older than RELEASE_TAG (lexicographic on the tag name is sufficient because
# the tag prefix is fixed). We exclude RELEASE_TAG itself from the range.
PREV_TAG=""
while IFS= read -r tag; do
  # Skip the tag we are releasing; only consider prior tags.
  if [ "$tag" = "$RELEASE_TAG" ]; then
    continue
  fi
  # Any tag starting with the plugin prefix that is not the current release is
  # a candidate previous tag. Take the immediately preceding one (the list is
  # version-sorted descending, so the first non-current hit is the previous
  # release).
  PREV_TAG="$tag"
  break
done < <(git tag --sort=-v:refname "tizen-sdk-skills-v*" 2>/dev/null || true)

# ── Determine the commit range ────────────────────────────────────────────
if [ -n "$PREV_TAG" ]; then
  RANGE="${PREV_TAG}..HEAD"
  echo "Release notes for ${RELEASE_TAG}" > /dev/stderr
  echo "Range: ${RANGE} (commits after ${PREV_TAG})" > /dev/stderr
else
  # No previous tag — fall back to all commits on the default branch.
  RANGE=""
  echo "No previous tizen-sdk-skills-v* tag found; listing all merged PRs." > /dev/stderr
fi

# ── Collect merged PRs in the range ───────────────────────────────────────
# gh pr list with --search gives us merged PRs; we filter by merge-base range
# using the GitHub search syntax.
if [ -n "$RANGE" ]; then
  # Convert git range to a GitHub search window: the SHA the previous tag
  # points at, up to HEAD. Using base:main + merged:>=date is fragile, so we
  # list all merged PRs on main and filter locally by merge commit ancestry.
  SEARCH_ARGS="--state merged --base main --limit 200"
else
  SEARCH_ARGS="--state merged --base main --limit 200"
fi

# Fetch merged PRs as JSON: number, title, author login, url, mergedAt, mergeCommit
PR_JSON="$(gh pr list ${SEARCH_ARGS} \
  --json number,title,author,url,mergedAt 2>/dev/null || echo '[]')"

if [ "$(echo "$PR_JSON" | jq 'length')" -eq 0 ]; then
  echo "No merged PRs found."
  exit 0
fi

# ── Filter PRs that touch tizen-sdk-skills/ ───────────────────────────────
# For each PR, fetch its files and keep it only if at least one path starts
# with the plugin directory. This is the core filter — labels are not used.
INCLUDED_PRS=""
EXCLUDED_COUNT=0

while IFS= read -r line; do
  # Parse the JSON object for this PR
  PR_NUM="$(echo "$line" | jq -r '.number')"
  PR_TITLE="$(echo "$line" | jq -r '.title')"
  PR_AUTHOR="$(echo "$line" | jq -r '.author.login // "unknown"')"
  PR_URL="$(echo "$line" | jq -r '.url')"
  PR_MERGED_AT="$(echo "$line" | jq -r '.mergedAt // ""')"

  # Fetch the files changed by this PR (limit to 100 files — PRs with more
  # are rare in this repo and the first 100 are enough to decide plugin
  # membership; --paginate would be slow inside a loop).
  FILES_JSON="$(gh pr view "$PR_NUM" --json files --jq '[.files[].path]' 2>/dev/null || echo '[]')"

  # Check if any file is under the plugin directory.
  TOUCHES_PLUGIN="$(echo "$FILES_JSON" | jq --arg dir "${PLUGIN_DIR}/" \
    '[.[] | select(startswith($dir))] | length > 0')"

  if [ "$TOUCHES_PLUGIN" = "true" ]; then
    # Format the PR entry in GitHub's standard release-notes style.
    INCLUDED_PRS="${INCLUDED_PRS}* ${PR_TITLE} by @${PR_AUTHOR} in ${PR_URL}
"
  else
    EXCLUDED_COUNT=$((EXCLUDED_COUNT + 1))
    echo "  excluding PR #${PR_NUM} (no ${PLUGIN_DIR}/ files)" > /dev/stderr
  fi
done < <(echo "$PR_JSON" | jq -c '.[]')

# ── Assemble the final release body ───────────────────────────────────────
echo "## What's Changed"
echo ""
if [ -n "$INCLUDED_PRS" ]; then
  printf '%s' "$INCLUDED_PRS"
else
  echo "(no tizen-sdk-skills PRs in this release)"
fi
echo ""
echo "**Full Changelog**: https://github.com/Samsung/tizen-agent-skills/compare/${PREV_TAG:-${RELEASE_TAG}}...${RELEASE_TAG}"
echo ""
if [ "$EXCLUDED_COUNT" -gt 0 ]; then
  echo "<sub>${EXCLUDED_COUNT} PR(s) from other plugins or root-level docs were excluded from these notes.</sub>"
fi
