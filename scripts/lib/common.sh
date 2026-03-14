#!/bin/bash
# common.sh - Shared library for eSolia centralized scripts
# Source this file; do not execute directly.
#
# Provides: colors, output helpers, package manager detection,
#           wrangler config discovery, project root detection.

# Guard against direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Error: common.sh should be sourced, not executed directly."
  exit 1
fi

# ════════════════════════════════════════════════════════════════════════════
# Colors & Output Helpers
# ════════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_step()    { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}  ✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}  ⚠${NC} $1"; }
print_error()   { echo -e "${RED}  ✗${NC} $1"; }
print_info()    { echo -e "${CYAN}  ℹ${NC} $1"; }

# ════════════════════════════════════════════════════════════════════════════
# Project Root Detection
# ════════════════════════════════════════════════════════════════════════════

# find_project_root - returns the git repo root or pwd
find_project_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

# ════════════════════════════════════════════════════════════════════════════
# Package Manager Detection
# ════════════════════════════════════════════════════════════════════════════

# detect_pm [dir] - detect package manager from lockfiles
# Returns: pnpm | yarn | bun | npm
detect_pm() {
  local dir="${1:-.}"
  # 1. Check lockfiles first (most reliable)
  if [ -f "$dir/pnpm-lock.yaml" ] || [ -f "$dir/pnpm-workspace.yaml" ]; then
    echo "pnpm"
  elif [ -f "$dir/yarn.lock" ]; then
    echo "yarn"
  elif [ -f "$dir/bun.lockb" ] || [ -f "$dir/bun.lock" ]; then
    echo "bun"
  # 2. Fallback: check "packageManager" field in package.json (corepack convention)
  elif [ -f "$dir/package.json" ] && grep -q '"packageManager"' "$dir/package.json" 2>/dev/null; then
    local pm_field
    pm_field=$(grep '"packageManager"' "$dir/package.json" | sed 's/.*"packageManager"[^"]*"//;s/@.*//' | tr -d '"')
    case "$pm_field" in
      pnpm|yarn|bun|npm) echo "$pm_field" ;;
      *) echo "npm" ;;
    esac
  else
    echo "npm"
  fi
}

# pm_update <package@version> [dir] - update a dependency using detected PM
# Runs in the given directory (default: current dir)
pm_update() {
  local pkg="$1"
  local dir="${2:-.}"
  local pm
  pm=$(detect_pm "$(find_project_root)")

  case "$pm" in
    pnpm) (cd "$dir" && pnpm update "$pkg" --silent 2>/dev/null) ;;
    yarn) (cd "$dir" && yarn upgrade "${pkg%%@*}" --latest --silent 2>/dev/null) ;;
    bun)  (cd "$dir" && bun update "$pkg" 2>/dev/null) ;;
    *)    (cd "$dir" && npm update "$pkg" --silent 2>/dev/null) ;;
  esac
}

# pm_lockfile_sync [dir] - sync/regenerate the lockfile
# Returns 0 on success, 1 on failure (caller should handle gracefully)
pm_lockfile_sync() {
  local dir="${1:-.}"
  local pm
  pm=$(detect_pm "$(find_project_root)")

  case "$pm" in
    pnpm) (cd "$dir" && pnpm install --lockfile-only --silent 2>/dev/null) ;;
    yarn) (cd "$dir" && yarn install --silent 2>/dev/null) ;;
    bun)  (cd "$dir" && bun install 2>/dev/null) ;;
    *)    (cd "$dir" && npm install --package-lock-only --silent 2>/dev/null) ;;
  esac
}

# pm_list_version <package> [dir] - get installed version of a package
pm_list_version() {
  local pkg="$1"
  local dir="${2:-.}"
  local pm
  pm=$(detect_pm "$(find_project_root)")

  case "$pm" in
    pnpm) (cd "$dir" && pnpm list "$pkg" --depth=0 2>/dev/null | grep "$pkg" | awk '{print $2}') ;;
    yarn) (cd "$dir" && node -e "try{console.log(require('./package.json').devDependencies['$pkg']||require('./package.json').dependencies['$pkg']||'unknown')}catch(e){console.log('unknown')}") ;;
    bun)  (cd "$dir" && bun pm ls 2>/dev/null | grep "$pkg" | awk '{print $2}') ;;
    *)    (cd "$dir" && npm list "$pkg" --depth=0 2>/dev/null | grep "$pkg" | sed 's/.*@//') ;;
  esac
}

# pm_install_global <package@version> - install a package globally
pm_install_global() {
  local pkg="$1"
  local pm
  pm=$(detect_pm "$(find_project_root)")

  case "$pm" in
    pnpm) pnpm add -g "$pkg" 2>/dev/null ;;
    yarn) yarn global add "$pkg" 2>/dev/null ;;
    bun)  bun add -g "$pkg" 2>/dev/null ;;
    *)    npm install -g "$pkg" 2>/dev/null ;;
  esac
}

# ════════════════════════════════════════════════════════════════════════════
# Wrangler Config Discovery
# ════════════════════════════════════════════════════════════════════════════

# Default depth for find; override with FIND_DEPTH env var
FIND_DEPTH="${FIND_DEPTH:-3}"

# find_wrangler_jsonc [dir] - find all wrangler.jsonc files
# Excludes: node_modules, .wrangler, .svelte-kit
find_wrangler_jsonc() {
  local dir="${1:-.}"
  find "$dir" -maxdepth "$FIND_DEPTH" -name 'wrangler.jsonc' \
    -not -path '*/node_modules/*' \
    -not -path '*/.wrangler/*' \
    -not -path '*/.svelte-kit/*' | sort
}

# find_wrangler_non_jsonc [dir] - find wrangler.toml, wrangler.json, wrangler.yaml
# These are antipatterns — Cloudflare recommends wrangler.jsonc
find_wrangler_non_jsonc() {
  local dir="${1:-.}"
  find "$dir" -maxdepth "$FIND_DEPTH" \( -name 'wrangler.toml' -o -name 'wrangler.json' -o -name 'wrangler.yaml' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.wrangler/*' \
    -not -path '*/.svelte-kit/*' | sort
}

# find_packages_with_wrangler [dir] - find package.json files that depend on wrangler
find_packages_with_wrangler() {
  local dir="${1:-.}"
  while IFS= read -r pkg; do
    if grep -q '"wrangler"' "$pkg" 2>/dev/null; then
      echo "$pkg"
    fi
  done < <(find "$dir" -maxdepth "$FIND_DEPTH" -name 'package.json' \
    -not -path '*/node_modules/*' | sort)
}

# is_skippable_path <path> - returns 0 if path is under docs/, tmp/, _archive/
# Used to skip QC warnings for experimental/archived configs
is_skippable_path() {
  local path="$1"
  case "$path" in
    */docs/*|*/tmp/*|*/_archive/*) return 0 ;;
    *) return 1 ;;
  esac
}
