#!/bin/bash
# sync-all.sh — Run sync.sh in all eSolia consumer repos
#
# Usage:
#   ./scripts/sync-all.sh                  # Sync all repos
#   ./scripts/sync-all.sh --check          # Check staleness only
#   ./scripts/sync-all.sh pulse nexus      # Sync specific repos
#   REPOS_DIR=/path/to/repos ./scripts/sync-all.sh  # Override repos parent dir
#
# Centralized script — run from the esolia.github repo.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ESOLIA_GITHUB_ROOT="$(dirname "$SCRIPT_DIR")"

# All consumer repos
ALL_REPOS=(esolia-2025 jac-2026 nexus courier codex pulse periodic pub-cogley chocho)

# Repos parent directory — default to sibling of esolia.github
PARENT_DIR="${REPOS_DIR:-$(dirname "$ESOLIA_GITHUB_ROOT")}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Parse arguments
CHECK_FLAG=""
REPOS=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_FLAG="--check" ;;
    --help|-h)
      echo "Usage: $0 [--check] [repo1 repo2 ...]"
      echo ""
      echo "Runs sync.sh in each consumer repo. Without arguments, syncs all repos."
      echo ""
      echo "Options:"
      echo "  --check       Check staleness only (don't sync)"
      echo "  repo1 repo2   Sync only the specified repos"
      echo ""
      echo "Environment:"
      echo "  REPOS_DIR     Override the parent directory containing all repos"
      echo "                Default: sibling of esolia.github ($(dirname "$ESOLIA_GITHUB_ROOT"))"
      echo ""
      echo "All repos: ${ALL_REPOS[*]}"
      exit 0
      ;;
    *) REPOS+=("$arg") ;;
  esac
done

# Default to all repos if none specified
if [[ ${#REPOS[@]} -eq 0 ]]; then
  REPOS=("${ALL_REPOS[@]}")
fi

echo ""
echo -e "${BOLD}Syncing ${#REPOS[@]} repos from esolia.github${NC}"
echo -e "  Source: ${BLUE}$ESOLIA_GITHUB_ROOT/scripts/sync.sh${NC}"
echo -e "  Repos:  ${BLUE}$PARENT_DIR${NC}"
echo ""

PASS=0
FAIL=0
SKIP=0

for repo in "${REPOS[@]}"; do
  REPO_DIR="$PARENT_DIR/$repo"

  if [[ ! -d "$REPO_DIR" ]]; then
    echo -e "${YELLOW}  ⚠ $repo${NC} — not found at $REPO_DIR"
    SKIP=$((SKIP + 1))
    continue
  fi

  if cd "$REPO_DIR" && bash "$ESOLIA_GITHUB_ROOT/scripts/sync.sh" $CHECK_FLAG > /dev/null 2>&1; then
    if [[ -n "$CHECK_FLAG" ]]; then
      echo -e "${GREEN}  ✓ $repo${NC} — up-to-date"
    else
      echo -e "${GREEN}  ✓ $repo${NC} — synced"
    fi
    PASS=$((PASS + 1))
  else
    if [[ -n "$CHECK_FLAG" ]]; then
      echo -e "${RED}  ✗ $repo${NC} — stale"
    else
      echo -e "${RED}  ✗ $repo${NC} — sync failed"
    fi
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo -e "${BOLD}Results:${NC} ${GREEN}$PASS ok${NC}  ${RED}$FAIL failed${NC}  ${YELLOW}$SKIP skipped${NC}"
echo ""
