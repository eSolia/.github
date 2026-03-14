#!/bin/bash
# sync.sh - Fetch centralized scripts from esolia.github
#
# Usage:
#   curl -sSfL https://raw.githubusercontent.com/esolia/esolia.github/main/scripts/sync.sh | bash
#   ./scripts/shared/sync.sh                  # Re-sync (after initial fetch)
#   ./scripts/shared/sync.sh --check          # Check if scripts are up-to-date
#   ./scripts/shared/sync.sh --ref v1.0.0     # Pin to a specific tag/SHA
#
# Downloads centralized bump-version.sh, update-wrangler.sh, and lib/common.sh
# into scripts/shared/ and creates thin wrappers at scripts/ level.

set -e

# ════════════════════════════════════════════════════════════════════════════
# Configuration
# ════════════════════════════════════════════════════════════════════════════

REPO_OWNER="eSolia"
REPO_NAME=".github"
DEFAULT_REF="main"
REF="$DEFAULT_REF"
CHECK_ONLY=false

# Files to sync (source path in esolia.github -> local path under scripts/shared/)
SYNC_FILES=(
  "scripts/lib/common.sh:lib/common.sh"
  "scripts/bump-version.sh:bump-version.sh"
  "scripts/update-wrangler.sh:update-wrangler.sh"
  "scripts/sync.sh:sync.sh"
)

# Colors (inline — can't source common.sh before it's downloaded)
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
# Parse Arguments
# ════════════════════════════════════════════════════════════════════════════

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)    REF="$2"; shift 2 ;;
    --check)  CHECK_ONLY=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--ref <tag-or-sha>] [--check]"
      echo ""
      echo "Options:"
      echo "  --ref <ref>   Git ref to fetch from (default: main)"
      echo "  --check       Check if local scripts match remote (exit 1 if stale)"
      echo "  --help        Show this help"
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ════════════════════════════════════════════════════════════════════════════
# Find project root
# ════════════════════════════════════════════════════════════════════════════

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
SHARED_DIR="$PROJECT_ROOT/scripts/shared"
SCRIPTVERSION_FILE="$SHARED_DIR/.scriptversion"

# ════════════════════════════════════════════════════════════════════════════
# Check mode
# ════════════════════════════════════════════════════════════════════════════

if [ "$CHECK_ONLY" = true ]; then
  if [ ! -f "$SCRIPTVERSION_FILE" ]; then
    print_error "No .scriptversion found — scripts have never been synced"
    exit 1
  fi

  LOCAL_COMMIT=$(grep '^commit=' "$SCRIPTVERSION_FILE" 2>/dev/null | cut -d= -f2)
  LOCAL_FETCHED=$(grep '^fetched=' "$SCRIPTVERSION_FILE" 2>/dev/null | cut -d= -f2)
  LOCAL_REF=$(grep '^ref=' "$SCRIPTVERSION_FILE" 2>/dev/null | cut -d= -f2)

  print_info "Local: commit=$LOCAL_COMMIT ref=$LOCAL_REF fetched=$LOCAL_FETCHED"

  # Fetch remote HEAD for the ref
  REMOTE_COMMIT=$(git ls-remote "https://github.com/$REPO_OWNER/$REPO_NAME.git" "$LOCAL_REF" 2>/dev/null | head -1 | cut -f1)

  if [ -z "$REMOTE_COMMIT" ]; then
    print_warning "Could not fetch remote HEAD (network issue?)"
    exit 1
  fi

  print_info "Remote: commit=$REMOTE_COMMIT ref=$LOCAL_REF"

  if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    print_success "Scripts are up-to-date"
    exit 0
  else
    print_warning "Scripts are stale — run sync.sh to update"
    exit 1
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Sync mode
# ════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  Sync Centralized Scripts                                   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_info "Source: $REPO_OWNER/$REPO_NAME@$REF"
print_info "Target: $SHARED_DIR"
echo ""

# Create directories
mkdir -p "$SHARED_DIR/lib"

# Download files
BASE_URL="https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAME/$REF"

print_step "Downloading scripts"
for entry in "${SYNC_FILES[@]}"; do
  src="${entry%%:*}"
  dest="${entry##*:}"
  url="$BASE_URL/$src"
  target="$SHARED_DIR/$dest"

  if curl -sSfL "$url" -o "$target" 2>/dev/null; then
    chmod +x "$target"
    print_success "$dest"
  else
    print_error "Failed to download $src"
    exit 1
  fi
done
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Write .scriptversion
# ════════════════════════════════════════════════════════════════════════════

REMOTE_COMMIT=$(git ls-remote "https://github.com/$REPO_OWNER/$REPO_NAME.git" "$REF" 2>/dev/null | head -1 | cut -f1)
REMOTE_COMMIT="${REMOTE_COMMIT:-unknown}"
FETCH_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$SCRIPTVERSION_FILE" << EOF
commit=$REMOTE_COMMIT
fetched=$FETCH_TIME
ref=$REF
EOF

print_success "Wrote .scriptversion (commit=${REMOTE_COMMIT:0:12})"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Create thin wrappers (only if they don't already exist)
# ════════════════════════════════════════════════════════════════════════════

SCRIPTS_DIR="$PROJECT_ROOT/scripts"

create_wrapper() {
  local name="$1"
  local wrapper="$SCRIPTS_DIR/$name"

  if [ -f "$wrapper" ]; then
    # Check if it's already a wrapper (contains "shared/" reference)
    if grep -q 'shared/' "$wrapper" 2>/dev/null; then
      print_info "$name wrapper already exists"
      return
    fi
    # It's a local script — back it up
    local backup="${wrapper}.local-backup"
    cp "$wrapper" "$backup"
    print_warning "Backed up existing $name to ${name}.local-backup"
  fi

  cat > "$wrapper" << WRAPPER
#!/bin/bash
# Wrapper — delegates to centralized script from esolia.github
# To update: ./scripts/shared/sync.sh
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec "\$SCRIPT_DIR/shared/$name" "\$@"
WRAPPER

  chmod +x "$wrapper"
  print_success "Created wrapper: scripts/$name"
}

print_step "Setting up wrappers"
create_wrapper "bump-version.sh"
create_wrapper "update-wrangler.sh"
echo ""

# ════════════════════════════════════════════════════════════════════════════
# Add shared dir to .gitignore if not already there
# ════════════════════════════════════════════════════════════════════════════

GITIGNORE="$PROJECT_ROOT/.gitignore"
if [ -f "$GITIGNORE" ]; then
  if ! grep -qF 'scripts/shared/' "$GITIGNORE" 2>/dev/null; then
    print_step "Adding scripts/shared/ to .gitignore"
    echo "" >> "$GITIGNORE"
    echo "# Centralized scripts fetched from esolia.github" >> "$GITIGNORE"
    echo "scripts/shared/" >> "$GITIGNORE"
    print_success "Updated .gitignore"
    echo ""
  fi
else
  print_info "No .gitignore found — consider adding scripts/shared/ to it"
  echo ""
fi

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}── Sync Complete ──────────────────────────────────────────────${NC}"
echo ""
echo "  Synced from: $REPO_OWNER/$REPO_NAME@$REF"
echo "  Commit: ${REMOTE_COMMIT:0:12}"
echo ""
echo "  Available commands:"
echo "    ./scripts/bump-version.sh <version>   # Bump version + QC"
echo "    ./scripts/bump-version.sh --qc-only   # QC checks only"
echo "    ./scripts/update-wrangler.sh           # Update wrangler"
echo "    ./scripts/shared/sync.sh               # Re-sync scripts"
echo "    ./scripts/shared/sync.sh --check       # Check for updates"
echo ""
