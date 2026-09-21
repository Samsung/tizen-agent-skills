#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Samsung Electronics Co., Ltd.

# Tests for lib/common.sh's download_queue_parallel.
#
# Every installer that calls it runs under `set -euo pipefail`, so this file
# does too: the regression guarded here is a bare `rmdir` of a lock directory
# that does not exist on a fresh run, which made errexit abort five installers
# before their first download. The other cases pin the contract the callers
# rely on: an empty queue is a no-op that still leaves a `results` file for
# download_queue_status, an invalid job count is `return 2` (not exit), the
# caller's own INT trap survives the call, and a second run over the same
# result dir works.
#
# Usage: bash common.test.sh   (exit 0 = all pass; needs curl and awk)

set -euo pipefail
cd "$(dirname "$0")" || exit 1
. ./common.sh

failures=0
check() {
  # check <name> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "PASS $1"
  else
    echo "FAIL $1 — got '$2', expected '$3'"
    failures=$((failures + 1))
  fi
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# file:// URLs for curl. Under Git Bash / MSYS curl is a native Windows binary
# that does not understand /tmp/... inside a URL, so hand it a C:/... path.
url_dir="$tmp"
if command -v cygpath >/dev/null 2>&1; then url_dir=$(cygpath -m "$tmp"); fi
case "$url_dir" in
  /*) file_base="file://$url_dir" ;;
  *)  file_base="file:///$url_dir" ;;
esac

printf 'hello' > "$tmp/src1.bin"
printf 'world' > "$tmp/src2.bin"
printf 'p1\t%s/src1.bin\t%s/dest1.bin\n' "$file_base" "$tmp" > "$tmp/queue.tsv"
printf 'p2\t%s/src2.bin\t%s/dest2.bin\n' "$file_base" "$tmp" >> "$tmp/queue.tsv"
printf 'p3\t%s/does-not-exist\t%s/dest3.bin\n' "$file_base" "$tmp" >> "$tmp/queue.tsv"

# 1. Fresh run under errexit: must complete and record OK/FAIL per item.
trap 'echo caller-int-trap' INT
rc=0
download_queue_parallel "$tmp/queue.tsv" 2 "$tmp/results" 2>/dev/null || rc=$?
check "fresh run returns 0 under set -e" "$rc" "0"
check "p1 OK" "$(download_queue_status p1 "$tmp/results")" "OK"
check "p2 OK" "$(download_queue_status p2 "$tmp/results")" "OK"
check "p3 FAIL (missing source)" "$(download_queue_status p3 "$tmp/results")" "FAIL"
check "dest1 content" "$(cat "$tmp/dest1.bin")" "hello"
check "no partial file left for p3" "$([ -e "$tmp/dest3.bin" ] || [ -e "$tmp/dest3.bin.tmp" ] && echo leftover || echo clean)" "clean"

# 2. The caller's INT trap is restored, not cleared.
check "caller INT trap preserved" "$(trap -p INT)" "trap -- 'echo caller-int-trap' SIGINT"
trap - INT

# 3. Empty queue: no workers, return 0, results file present and empty.
: > "$tmp/empty.tsv"
rc=0
download_queue_parallel "$tmp/empty.tsv" 4 "$tmp/results-empty" 2>/dev/null || rc=$?
check "empty queue returns 0" "$rc" "0"
check "empty queue leaves a results file" "$([ -f "$tmp/results-empty/results" ] && echo yes || echo no)" "yes"
check "status lookup on empty results is empty" "$(download_queue_status p1 "$tmp/results-empty")" ""

# 4. Second run over the same result dir (lock dir absent again).
rm -f "$tmp"/dest*.bin
rc=0
download_queue_parallel "$tmp/queue.tsv" 8 "$tmp/results" 2>/dev/null || rc=$?
check "repeat run returns 0" "$rc" "0"
check "repeat run p2 OK" "$(download_queue_status p2 "$tmp/results")" "OK"

# 5. Invalid job count and missing queue are reported with return 2, not exit.
rc=0
download_queue_parallel "$tmp/queue.tsv" 9 "$tmp/results" 2>/dev/null || rc=$?
check "jobs=9 returns 2" "$rc" "2"
rc=0
download_queue_parallel "$tmp/nope.tsv" 2 "$tmp/results" 2>/dev/null || rc=$?
check "missing queue returns 2" "$rc" "2"

# 6. format_duration units.
check "format_duration 45" "$(format_duration 45)" "45s"
check "format_duration 160" "$(format_duration 160)" "2m 40s"
check "format_duration 6300" "$(format_duration 6300)" "1h 45m 0s"

echo
if [ "$failures" -eq 0 ]; then
  echo "ALL PASSED"
else
  echo "$failures FAILED"
  exit 1
fi
