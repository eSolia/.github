#!/bin/bash
# sync.sh — Bootstrap wrapper for sync.ts
#
# This is a thin wrapper. The real logic and file lists live in sync.ts.
#
# Usage:
#   curl -sSfL https://raw.githubusercontent.com/eSolia/.github/main/scripts/sync.sh | bash
#   ./scripts/shared/sync.sh              # Re-sync (delegates to sync.ts)
#   ./scripts/shared/sync.sh --check      # Check for updates
#   ./scripts/shared/sync.sh --ref v1.0.0 # Pin to a specific tag/SHA

set -e

# ════════════════════════════════════════════════════════════════════════════
# Find project root and shared directory
# ════════════════════════════════════════════════════════════════════════════

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SHARED_DIR="$PROJECT_ROOT/scripts/shared"
SYNC_TS="$SHARED_DIR/sync.ts"

# ════════════════════════════════════════════════════════════════════════════
# Bootstrap: download sync.ts if it doesn't exist yet
# ════════════════════════════════════════════════════════════════════════════

if [ ! -f "$SYNC_TS" ]; then
  echo "Bootstrapping: downloading sync.ts from eSolia/.github ..."
  mkdir -p "$SHARED_DIR"
  curl -sSfL "https://raw.githubusercontent.com/eSolia/.github/main/scripts/sync.ts" -o "$SYNC_TS"
fi

# ════════════════════════════════════════════════════════════════════════════
# Require Node.js
# ════════════════════════════════════════════════════════════════════════════

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required. Install it from https://nodejs.org/" >&2
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════════
# Delegate to sync.ts
# ════════════════════════════════════════════════════════════════════════════

exec npx tsx "$SYNC_TS" "$@"
