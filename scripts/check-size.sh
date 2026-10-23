#!/usr/bin/env bash
# Preview the exact archive `liara deploy` would upload (respects .liaraignore) and print its compressed size.
#   scripts/check-size.sh            # summary + 12 largest files
#   scripts/check-size.sh --list     # every uploaded file
#   scripts/check-size.sh --strict   # exit 1 if artifacts are missing or it won't fit the free plan (128 MB)
#   scripts/check-size.sh --mode emulate --keep /tmp/upload.tar.gz
# Uses the installed Liara CLI's own archiver when available (byte-exact), else a faithful emulation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null 2>&1 || { echo "node (>= 22) is required" >&2; exit 2; }
exec node "$ROOT/scripts/check-size.mjs" --dir "$ROOT" "$@"
