#!/bin/bash
# audit-backpressure.sh
# Audits SvelteKit repos against the backpressure quality enforcement guide.
# Checks deterministic criteria only — use /backpressure-review for judgment calls.
#
# Usage:
#   ./scripts/audit-backpressure.sh              # Audit all repos
#   ./scripts/audit-backpressure.sh pulse         # Audit a single repo
#   ./scripts/audit-backpressure.sh --summary     # Compact summary only
#
# Set REPOS_DIR to override the parent directory containing all repos.
# Default: sibling of this repo (../), or if run from a consumer repo, ../.
#
# Centralized script from esolia.github — do not edit in consumer repos.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine repos parent directory
# If run directly from esolia.github: parent of this repo
# If run from a consumer repo via shared/: parent of that repo
# Override with REPOS_DIR env var
if [ -n "$REPOS_DIR" ]; then
  PARENT_DIR="$REPOS_DIR"
elif [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
  # Running from esolia.github directly
  PARENT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
else
  # Running from a consumer repo (scripts/shared/audit-backpressure.sh)
  PARENT_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
fi

# SvelteKit repos to audit (nexus is Hono, excluded; esolia-2025 is Lume/Deno, excluded)
ALL_REPOS=("pulse" "periodic" "chocho" "codex" "pub-cogley" "courier" "jac-2026")

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASS_ICON="${GREEN}✓${NC}"
FAIL_ICON="${RED}✗${NC}"
WARN_ICON="${YELLOW}~${NC}"

SUMMARY_MODE=false
REPOS=()

# Parse arguments
for arg in "$@"; do
    if [[ "$arg" == "--summary" ]] || [[ "$arg" == "-s" ]]; then
        SUMMARY_MODE=true
    else
        REPOS+=("$arg")
    fi
done

# Default to all repos if none specified
if [[ ${#REPOS[@]} -eq 0 ]]; then
    REPOS=("${ALL_REPOS[@]}")
fi

# ─── Helper functions ───────────────────────────────────────────────

# Find the primary package.json for the SvelteKit app
find_package_json() {
    local repo_dir="$1"
    local repo_name="$2"

    # Special cases for monorepos/nested apps
    case "$repo_name" in
        chocho)
            echo "$repo_dir/app/package.json" ;;
        codex)
            # Try hanawa-cms first, fall back to root
            if [[ -f "$repo_dir/packages/hanawa-cms/package.json" ]]; then
                echo "$repo_dir/packages/hanawa-cms/package.json"
            else
                echo "$repo_dir/package.json"
            fi ;;
        pub-cogley)
            # Check apps/web as the primary SvelteKit app
            if [[ -f "$repo_dir/apps/web/package.json" ]]; then
                echo "$repo_dir/apps/web/package.json"
            else
                echo "$repo_dir/package.json"
            fi ;;
        *)
            echo "$repo_dir/package.json" ;;
    esac
}

# Find tsconfig.json for the SvelteKit app
find_tsconfig() {
    local repo_dir="$1"
    local repo_name="$2"

    case "$repo_name" in
        chocho)
            echo "$repo_dir/app/tsconfig.json" ;;
        codex)
            if [[ -f "$repo_dir/packages/hanawa-cms/tsconfig.json" ]]; then
                echo "$repo_dir/packages/hanawa-cms/tsconfig.json"
            else
                echo "$repo_dir/tsconfig.json"
            fi ;;
        pub-cogley)
            if [[ -f "$repo_dir/apps/web/tsconfig.json" ]]; then
                echo "$repo_dir/apps/web/tsconfig.json"
            else
                echo "$repo_dir/tsconfig.json"
            fi ;;
        *)
            echo "$repo_dir/tsconfig.json" ;;
    esac
}

# Find the src directory
find_src_dir() {
    local repo_dir="$1"
    local repo_name="$2"

    case "$repo_name" in
        chocho)
            echo "$repo_dir/app/src" ;;
        codex)
            echo "$repo_dir/packages/hanawa-cms/src" ;;
        pub-cogley)
            echo "$repo_dir/apps/web/src" ;;
        *)
            echo "$repo_dir/src" ;;
    esac
}

# Check if a JSON field exists and matches a value
json_has_field() {
    local file="$1"
    local field="$2"
    local expected="$3"

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    # Use node for reliable JSON parsing
    node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('$file', 'utf8'));
        const keys = '$field'.split('.');
        let val = data;
        for (const k of keys) { val = val?.[k]; }
        if ('$expected' === '') {
            process.exit(val !== undefined ? 0 : 1);
        } else {
            process.exit(String(val) === '$expected' ? 0 : 1);
        }
    " 2>/dev/null
}

# Count occurrences of a pattern in a directory
count_pattern() {
    local dir="$1"
    local pattern="$2"
    local glob="$3"

    if [[ ! -d "$dir" ]]; then
        echo "0"
        return
    fi

    local count
    if [[ -n "$glob" ]]; then
        count=$(grep -r --include="$glob" -l "$pattern" "$dir" 2>/dev/null | wc -l | tr -d ' ')
    else
        count=$(grep -r -l "$pattern" "$dir" 2>/dev/null | wc -l | tr -d ' ')
    fi
    echo "$count"
}

# ─── Audit a single repo ───────────────────────────────────────────

audit_repo() {
    local repo_name="$1"
    local repo_dir="$PARENT_DIR/$repo_name"
    local pass=0
    local fail=0
    local warn=0

    if [[ ! -d "$repo_dir" ]]; then
        echo -e "${RED}Repo not found: $repo_dir${NC}"
        return
    fi

    local pkg_json=$(find_package_json "$repo_dir" "$repo_name")
    local tsconfig=$(find_tsconfig "$repo_dir" "$repo_name")
    local src_dir=$(find_src_dir "$repo_dir" "$repo_name")

    if ! $SUMMARY_MODE; then
        echo -e "${BOLD}${BLUE}═══ $repo_name ═══${NC}"
        echo ""
        echo -e "${GRAY}Phase 1: Foundation${NC}"
    fi

    # ── Phase 1: Foundation ──

    # 1a. tsconfig strict
    if [[ -f "$tsconfig" ]]; then
        if json_has_field "$tsconfig" "compilerOptions.strict" "true"; then
            check_result "strict: true" "pass"
            pass=$((pass + 1))
        else
            check_result "strict: true" "fail"
            fail=$((fail + 1))
        fi

        # 1b. noUncheckedIndexedAccess
        if json_has_field "$tsconfig" "compilerOptions.noUncheckedIndexedAccess" "true"; then
            check_result "noUncheckedIndexedAccess" "pass"
            pass=$((pass + 1))
        else
            check_result "noUncheckedIndexedAccess" "warn" "recommended by backpressure guide"
            warn=$((warn + 1))
        fi

        # 1c. exactOptionalPropertyTypes
        if json_has_field "$tsconfig" "compilerOptions.exactOptionalPropertyTypes" "true"; then
            check_result "exactOptionalPropertyTypes" "pass"
            pass=$((pass + 1))
        else
            check_result "exactOptionalPropertyTypes" "warn" "recommended by backpressure guide"
            warn=$((warn + 1))
        fi
    else
        check_result "tsconfig.json exists" "fail"
        fail=$((fail + 1))
    fi

    # 1d. verify script
    if [[ -f "$pkg_json" ]]; then
        if json_has_field "$pkg_json" "scripts.verify" ""; then
            check_result "verify script in package.json" "pass"
            pass=$((pass + 1))
        else
            check_result "verify script in package.json" "fail" "add: \"verify\": \"npm run check && npm run lint && npm run test:unit\""
            fail=$((fail + 1))
        fi
    fi

    # 1e. eslint-plugin-svelte
    if [[ -f "$pkg_json" ]]; then
        if grep -q '"eslint-plugin-svelte"' "$pkg_json" 2>/dev/null; then
            check_result "eslint-plugin-svelte installed" "pass"
            pass=$((pass + 1))
        else
            check_result "eslint-plugin-svelte installed" "warn" "check devDependencies"
            warn=$((warn + 1))
        fi
    fi

    if ! $SUMMARY_MODE; then
        echo ""
        echo -e "${GRAY}Phase 2: Custom Rules & Patterns${NC}"
    fi

    # ── Phase 2: Custom Rules ──

    # 2a. sanitize.ts exists
    if [[ -f "$src_dir/lib/sanitize.ts" ]]; then
        check_result "src/lib/sanitize.ts exists" "pass"
        pass=$((pass + 1))
    else
        check_result "src/lib/sanitize.ts exists" "fail" "XSS prevention module required"
        fail=$((fail + 1))
    fi

    # 2b. bare {@html without sanitize
    if [[ -d "$src_dir" ]]; then
        local raw_html_count=$(grep -r '{@html' "$src_dir" --include="*.svelte" 2>/dev/null | grep -v 'sanitize' | wc -l | tr -d ' ')
        if [[ "$raw_html_count" -eq 0 ]]; then
            check_result "no bare {@html} (all sanitized)" "pass"
            pass=$((pass + 1))
        else
            check_result "bare {@html} without sanitize" "fail" "$raw_html_count file(s) — wrap with sanitizeHtml()"
            fail=$((fail + 1))
        fi
    fi

    # 2c. .parse() vs .safeParse()
    if [[ -d "$src_dir" ]]; then
        local parse_count=$(grep -r '\.parse(' "$src_dir" --include="*.ts" 2>/dev/null | grep -v 'safeParse\|unsafeParse\|JSON.parse\|url.parse\|parseInt\|parseFloat\|parse(row)\|DOMParser\|\.d\.ts' | wc -l | tr -d ' ')
        if [[ "$parse_count" -eq 0 ]]; then
            check_result "no raw .parse() (use safeParse)" "pass"
            pass=$((pass + 1))
        else
            check_result "raw .parse() calls found" "warn" "$parse_count call(s) — consider safeParse()"
            warn=$((warn + 1))
        fi
    fi

    # 2d. Zod schemas exist
    if [[ -d "$src_dir" ]]; then
        local zod_count=$(count_pattern "$src_dir" "z\.object\|z\.string\|z\.enum" "*.ts")
        if [[ "$zod_count" -gt 0 ]]; then
            check_result "Zod schemas present" "pass" "$zod_count file(s)"
            pass=$((pass + 1))
        else
            check_result "Zod schemas for validation" "warn" "none found — validate at data boundaries"
            warn=$((warn + 1))
        fi
    fi

    if ! $SUMMARY_MODE; then
        echo ""
        echo -e "${GRAY}Phase 3: Testing${NC}"
    fi

    # ── Phase 3: Tests ──

    # 3a. vitest installed
    if [[ -f "$pkg_json" ]]; then
        if grep -q '"vitest"' "$pkg_json" 2>/dev/null; then
            check_result "vitest installed" "pass"
            pass=$((pass + 1))
        else
            check_result "vitest installed" "warn" "needed for unit/contract tests"
            warn=$((warn + 1))
        fi
    fi

    # 3b. test files exist
    local test_count=0
    if [[ -d "$src_dir" ]]; then
        test_count=$(find "$src_dir" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
    fi
    # Also check top-level tests/ dir
    local app_root=$(dirname "$pkg_json")
    if [[ -d "$app_root/tests" ]]; then
        local extra=$(find "$app_root/tests" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
        test_count=$((test_count + extra))
    fi
    if [[ "$test_count" -gt 0 ]]; then
        check_result "test files exist" "pass" "$test_count file(s)"
        pass=$((pass + 1))
    else
        check_result "test files exist" "fail" "no .test.ts or .spec.ts found"
        fail=$((fail + 1))
    fi

    if ! $SUMMARY_MODE; then
        echo ""
        echo -e "${GRAY}Phase 4: Architecture${NC}"
    fi

    # ── Phase 4: Architecture ──

    # 4a. Required Reading in CLAUDE.md
    if grep -q "SVELTEKIT_BACKPRESSURE" "$repo_dir/CLAUDE.md" 2>/dev/null; then
        check_result "Required Reading (backpressure)" "pass"
        pass=$((pass + 1))
    else
        check_result "Required Reading (backpressure)" "fail" "add to CLAUDE.md"
        fail=$((fail + 1))
    fi

    # 4b. Shared rule synced
    if [[ -d "$repo_dir/.claude/rules" ]] && ls "$repo_dir/.claude/rules/"*backpressure* >/dev/null 2>&1; then
        check_result "backpressure rule in .claude/rules/" "pass"
        pass=$((pass + 1))
    else
        check_result "backpressure rule in .claude/rules/" "warn" "run sync-shared-docs.sh"
        warn=$((warn + 1))
    fi

    # 4c. TenantContext or scoped query pattern
    if [[ -d "$src_dir" ]]; then
        local tenant_pattern=$(count_pattern "$src_dir" "TenantContext\|tenantFirst\|tenantAll\|tenantCtx\|clientDb\|locals.centralDb" "*.ts")
        if [[ "$tenant_pattern" -gt 0 ]]; then
            check_result "tenant isolation pattern" "pass" "found in $tenant_pattern file(s)"
            pass=$((pass + 1))
        else
            check_result "tenant isolation pattern" "warn" "consider TenantContext helpers"
            warn=$((warn + 1))
        fi
    fi

    # ── Summary ──
    local total=$((pass + fail + warn))
    if ! $SUMMARY_MODE; then
        echo ""
        echo -e "${BLUE}───────────────────────────────────────${NC}"
    fi
    echo -e "${BOLD}$repo_name${NC}: ${GREEN}$pass pass${NC}  ${RED}$fail fail${NC}  ${YELLOW}$warn warn${NC}  (${total} checks)"
    if ! $SUMMARY_MODE; then
        echo ""
    fi
}

# Print a check result line
check_result() {
    local label="$1"
    local status="$2"
    local detail="$3"

    if $SUMMARY_MODE; then
        return
    fi

    case "$status" in
        pass) echo -e "  ${PASS_ICON} ${label}" ;;
        fail)
            if [[ -n "$detail" ]]; then
                echo -e "  ${FAIL_ICON} ${label} ${GRAY}— ${detail}${NC}"
            else
                echo -e "  ${FAIL_ICON} ${label}"
            fi ;;
        warn)
            if [[ -n "$detail" ]]; then
                echo -e "  ${WARN_ICON} ${label} ${GRAY}— ${detail}${NC}"
            else
                echo -e "  ${WARN_ICON} ${label}"
            fi ;;
    esac
}

# ─── Main ───────────────────────────────────────────────────────────

echo -e "${BOLD}Backpressure Audit${NC}"
echo -e "${GRAY}Checks against: docs/shared/guides/SVELTEKIT_BACKPRESSURE.md${NC}"
echo ""

for repo in "${REPOS[@]}"; do
    audit_repo "$repo"
done

echo ""
echo -e "${GRAY}For judgment-based review (types, CLAUDE.md audit, architecture),${NC}"
echo -e "${GRAY}use: /backpressure-review in Claude Code${NC}"
echo -e "${GRAY}Standards via MCP: mcp__esolia-standards__get_standard slug=sveltekit-backpressure${NC}"
