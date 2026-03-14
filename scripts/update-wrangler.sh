#!/bin/bash
# update-wrangler.sh - Update wrangler to latest version in all packages
#
# Usage: ./scripts/update-wrangler.sh
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

PM=$(detect_pm "$PROJECT_ROOT")

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Update Wrangler                                           ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_info "Project root: $PROJECT_ROOT"
print_info "Package manager: $PM"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Discover packages with wrangler
# ════════════════════════════════════════════════════════════════════════════

PACKAGES=()
while IFS= read -r pkg; do
  PACKAGES+=("$pkg")
done < <(find_packages_with_wrangler .)

if [ ${#PACKAGES[@]} -eq 0 ]; then
  print_info "No packages with wrangler dependency found."
  exit 0
fi

print_step "Found wrangler in ${#PACKAGES[@]} package(s)"
echo ""

# Get current global version
GLOBAL_CURRENT=$(wrangler --version 2>/dev/null || echo "not installed")
print_info "Global wrangler: $GLOBAL_CURRENT"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Update each package
# ════════════════════════════════════════════════════════════════════════════

ANY_UPDATED=false

for pkg in "${PACKAGES[@]}"; do
  pkg_dir="$(dirname "$pkg")"
  rel="${pkg_dir#./}"
  label="${rel:-.}"

  CURRENT=$(pm_list_version "wrangler" "$pkg_dir")
  CURRENT="${CURRENT:-unknown}"

  print_step "$label (current: $CURRENT)"

  if pm_update "wrangler@latest" "$pkg_dir"; then
    NEW=$(pm_list_version "wrangler" "$pkg_dir")
    NEW="${NEW:-unknown}"

    if [ "$CURRENT" != "$NEW" ]; then
      print_success "Updated: $CURRENT -> $NEW"
      ANY_UPDATED=true
    else
      print_info "Already at latest ($NEW)"
    fi
  else
    print_warning "Update failed in $label (continuing)"
  fi
  echo ""
done

# ════════════════════════════════════════════════════════════════════════════
# Sync lockfile
# ════════════════════════════════════════════════════════════════════════════

print_step "Syncing lockfile"
if pm_lockfile_sync .; then
  print_success "Lockfile synced"
else
  print_warning "Lockfile sync had warnings (check manually)"
fi
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Update global wrangler (best-effort)
# ════════════════════════════════════════════════════════════════════════════

print_step "Updating global wrangler"
if pm_install_global "wrangler@latest"; then
  GLOBAL_NEW=$(wrangler --version 2>/dev/null || echo "not installed")
  if [ "$GLOBAL_CURRENT" != "$GLOBAL_NEW" ]; then
    print_success "Global: $GLOBAL_CURRENT -> $GLOBAL_NEW"
    ANY_UPDATED=true
  else
    print_info "Global already at latest ($GLOBAL_NEW)"
  fi
else
  print_warning "Global update failed (continuing)"
  GLOBAL_NEW="$GLOBAL_CURRENT"
fi
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}── Summary ────────────────────────────────────────────────────${NC}"
echo ""

if $ANY_UPDATED; then
  print_success "Wrangler updated"
  echo ""
  echo "Next steps:"
  echo "  1. Test: $PM run typecheck"
  echo "  2. Stage: git add -u"
  echo "  3. Commit: git commit -m 'chore: update wrangler to latest'"
else
  print_success "Wrangler is already at latest in all packages"
  print_info "Global: $GLOBAL_NEW"
fi
echo ""
