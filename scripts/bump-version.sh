#!/bin/bash
# bump-version.sh - Update version across all project files + QC checks
#
# Usage:
#   ./scripts/bump-version.sh <new-version>            # Full bump + QC
#   ./scripts/bump-version.sh <new-version> --skip-qc  # Bump only
#   ./scripts/bump-version.sh --qc-only                # QC checks only
#
# Centralized script from esolia.github — do not edit in consumer repos.
# Run scripts/shared/sync.sh to update.

set -e

# ════════════════════════════════════════════════════════════════════════════
# Resolve library path (works both from esolia.github and consumer repos)
# ════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
  source "$SCRIPT_DIR/lib/common.sh"
elif [ -f "$SCRIPT_DIR/shared/lib/common.sh" ]; then
  source "$SCRIPT_DIR/shared/lib/common.sh"
else
  echo "Error: Cannot find lib/common.sh"
  exit 1
fi

PROJECT_ROOT="$(find_project_root)"
cd "$PROJECT_ROOT"

# ════════════════════════════════════════════════════════════════════════════
# Parse Arguments
# ════════════════════════════════════════════════════════════════════════════

NEW_VERSION=""
SKIP_QC=false
QC_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-qc)  SKIP_QC=true; shift ;;
    --qc-only)  QC_ONLY=true; shift ;;
    --help|-h)
      echo "Usage: $0 <new-version> [--skip-qc] | --qc-only"
      echo ""
      echo "Options:"
      echo "  --skip-qc   Skip QC checks (version bump only)"
      echo "  --qc-only   Run QC checks only (no version bump)"
      echo "  --help      Show this help"
      exit 0
      ;;
    -*)
      print_error "Unknown option: $1"
      exit 1
      ;;
    *)
      NEW_VERSION="$1"; shift ;;
  esac
done

if [ "$QC_ONLY" = false ] && [ -z "$NEW_VERSION" ]; then
  print_error "Version argument required (or use --qc-only)"
  echo "Usage: $0 <new-version> [--skip-qc] | --qc-only"
  exit 1
fi

# Validate semver-ish format
if [ -n "$NEW_VERSION" ]; then
  if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'; then
    print_error "Version must be in X.Y.Z format (got: $NEW_VERSION)"
    exit 1
  fi
fi

# Detect environment
PM=$(detect_pm "$PROJECT_ROOT")

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
if [ "$QC_ONLY" = true ]; then
  echo -e "${BOLD}║  Wrangler QC Checks                                        ║${NC}"
else
  echo -e "${BOLD}║  Bump Version: $NEW_VERSION$(printf '%*s' $((41 - ${#NEW_VERSION})) '')║${NC}"
fi
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_info "Project root: $PROJECT_ROOT"
print_info "Package manager: $PM"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Version Bump (skip if --qc-only)
# ════════════════════════════════════════════════════════════════════════════

if [ "$QC_ONLY" = false ]; then

  # --- 1. Update "version" in package.json files ---
  print_step "Updating package.json version fields"
  FOUND_PKG=false
  while IFS= read -r pkg; do
    if grep -q '"version"' "$pkg"; then
      rel="${pkg#./}"
      print_success "$rel"
      sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$pkg"
      FOUND_PKG=true
    fi
  done < <(find . -maxdepth "$FIND_DEPTH" -name 'package.json' -not -path '*/node_modules/*' | sort)
  if ! $FOUND_PKG; then
    print_info "(no package.json with version field found)"
  fi
  echo ""

  # --- 2. Update APP_VERSION in wrangler.jsonc files ---
  print_step "Updating wrangler.jsonc APP_VERSION"
  FOUND_WRANGLER=false
  while IFS= read -r wrangler; do
    if grep -q 'APP_VERSION' "$wrangler"; then
      rel="${wrangler#./}"
      print_success "$rel"
      sed -i '' "s/\"APP_VERSION\": \"[^\"]*\"/\"APP_VERSION\": \"$NEW_VERSION\"/" "$wrangler"
      FOUND_WRANGLER=true
    fi
  done < <(find_wrangler_jsonc .)
  if ! $FOUND_WRANGLER; then
    print_info "(no wrangler.jsonc with APP_VERSION found)"
  fi
  echo ""

  # --- 3. Update version in openapi.yaml files ---
  print_step "Updating openapi.yaml version"
  FOUND_SPEC=false
  while IFS= read -r spec; do
    rel="${spec#./}"
    print_success "$rel"
    sed -E -i '' "s/version: [0-9]+\.[0-9]+\.[0-9]+/version: $NEW_VERSION/" "$spec"
    FOUND_SPEC=true
  done < <(find . -maxdepth "$FIND_DEPTH" -name 'openapi.yaml' -not -path '*/node_modules/*' | sort)
  if ! $FOUND_SPEC; then
    print_info "(no openapi.yaml found — skipping)"
  fi
  echo ""

  # --- 4. Update wrangler dependency to latest ---
  print_step "Updating wrangler dependency to latest"
  while IFS= read -r pkg; do
    pkg_dir="$(dirname "$pkg")"
    rel="${pkg_dir#./}"
    print_success "${rel:-.}/package.json"
    pm_update "wrangler@latest" "$pkg_dir" || print_warning "Update failed in $rel (continuing)"
  done < <(find_packages_with_wrangler .)
  echo ""

  # --- 5. Sync lockfile ---
  print_step "Syncing lockfile"
  if pm_lockfile_sync .; then
    print_success "Lockfile synced"
  else
    print_warning "Lockfile sync had warnings (check manually)"
  fi
  echo ""

fi

# ════════════════════════════════════════════════════════════════════════════
# QC Checks (skip if --skip-qc)
# ════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_QC" = false ]; then

  QC_WARNINGS=0
  TODAY=$(date +%Y-%m-%d)

  echo -e "${BOLD}── QC Checks ──────────────────────────────────────────────────${NC}"
  echo ""

  # --- QC 1: Bump compatibility_date to today ---
  print_step "Updating compatibility_date to $TODAY"
  FOUND_COMPAT=false
  while IFS= read -r wrangler; do
    rel="${wrangler#./}"
    OLD_DATE=$(grep -o '"compatibility_date": "[^"]*"' "$wrangler" 2>/dev/null | head -1 | sed 's/.*: "//;s/"//')
    if [ -n "$OLD_DATE" ]; then
      if [ "$OLD_DATE" != "$TODAY" ]; then
        sed -i '' "s/\"compatibility_date\": \"[^\"]*\"/\"compatibility_date\": \"$TODAY\"/" "$wrangler"
        print_success "$rel ($OLD_DATE -> $TODAY)"
      else
        print_info "$rel (already $TODAY)"
      fi
      FOUND_COMPAT=true
    fi
  done < <(find_wrangler_jsonc .)
  if ! $FOUND_COMPAT; then
    print_info "(no wrangler.jsonc with compatibility_date found)"
  fi
  echo ""

  # --- QC 2: Check account_id ---
  print_step "Checking account_id"
  while IFS= read -r wrangler; do
    rel="${wrangler#./}"
    if is_skippable_path "$rel"; then
      continue
    fi
    # Check for account_id key with a non-empty value
    if ! grep -qE '"account_id"\s*:\s*"[^"]+"' "$wrangler" 2>/dev/null; then
      print_warning "$rel — missing or empty account_id"
      QC_WARNINGS=$((QC_WARNINGS + 1))
    else
      print_success "$rel"
    fi
  done < <(find_wrangler_jsonc .)
  echo ""

  # --- QC 3: Flag non-JSONC wrangler configs ---
  print_step "Checking for non-JSONC wrangler configs"
  NON_JSONC_FOUND=false
  while IFS= read -r config; do
    rel="${config#./}"
    if is_skippable_path "$rel"; then
      print_info "$rel (archived/experimental — skipping)"
      continue
    fi
    ext="${config##*.}"
    print_warning "$rel — wrangler.$ext detected, migrate to wrangler.jsonc"
    print_info "  Cloudflare recommends JSONC: https://developers.cloudflare.com/workers/wrangler/configuration/"
    NON_JSONC_FOUND=true
    QC_WARNINGS=$((QC_WARNINGS + 1))
  done < <(find_wrangler_non_jsonc .)
  if ! $NON_JSONC_FOUND; then
    print_success "All wrangler configs use JSONC format"
  fi
  echo ""

  # --- QC 4: Check observability ---
  print_step "Checking observability configuration"
  while IFS= read -r wrangler; do
    rel="${wrangler#./}"
    if is_skippable_path "$rel"; then
      continue
    fi
    if ! grep -q '"observability"' "$wrangler" 2>/dev/null; then
      print_warning "$rel — no observability config"
      QC_WARNINGS=$((QC_WARNINGS + 1))
    elif grep -q '"enabled"\s*:\s*false' "$wrangler" 2>/dev/null; then
      # Only flag if observability block has enabled: false
      # (crude check — good enough for JSONC structure)
      print_warning "$rel — observability disabled"
      QC_WARNINGS=$((QC_WARNINGS + 1))
    else
      print_success "$rel"
    fi
  done < <(find_wrangler_jsonc .)
  echo ""

  # --- QC Summary ---
  if [ $QC_WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}  $QC_WARNINGS QC warning(s) found — review above${NC}"
  else
    echo -e "${GREEN}  All QC checks passed${NC}"
  fi
  echo ""

fi

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}── Summary ────────────────────────────────────────────────────${NC}"
echo ""

if [ "$QC_ONLY" = false ]; then
  echo -e "  Version bumped to ${GREEN}$NEW_VERSION${NC}"
fi
if [ "$SKIP_QC" = false ]; then
  echo -e "  Compatibility date set to ${GREEN}$TODAY${NC}"
fi
echo ""
echo "Next steps:"
if [ "$QC_ONLY" = true ]; then
  echo "  1. Fix any QC warnings above"
  echo "  2. Commit fixes"
else
  echo "  1. Review changes: git diff"
  echo "  2. git add -u && git commit -m 'chore: bump version to $NEW_VERSION'"
  echo "  3. git tag -a v$NEW_VERSION -m 'v$NEW_VERSION'"
  echo "  4. git push origin main --tags"
  echo "  5. Create release WITH DETAILED NOTES (never use --generate-notes alone)"
fi
echo ""
