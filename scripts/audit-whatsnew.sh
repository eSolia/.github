#!/bin/bash
# audit-whatsnew.sh
# Checks SvelteKit repos against upstream SvelteKit patterns feed and
# Cloudflare changelog, reporting new features/patterns worth adopting.
#
# Usage:
#   ./scripts/audit-whatsnew.sh                  # Audit all repos
#   ./scripts/audit-whatsnew.sh pulse            # Audit a single repo
#   ./scripts/audit-whatsnew.sh --summary        # Compact summary only
#   ./scripts/audit-whatsnew.sh --cf-only        # Cloudflare changelog only
#   ./scripts/audit-whatsnew.sh --svelte-only    # SvelteKit patterns only
#   ./scripts/audit-whatsnew.sh --days 30        # Only entries from last 30 days (default: 90)
#
# Set REPOS_DIR to override the parent directory containing all repos.
#
# Centralized script from esolia.github — do not edit in consumer repos.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Feed URLs ─────────────────────────────────────────────────────
SVELTE_PATTERNS_FEED="https://svelte.cogley.jp/feeds/patterns.json"
CF_CHANGELOG_FEED="https://developers.cloudflare.com/changelog/rss/index.xml"

# ─── Cloudflare products relevant to our stack ─────────────────────
# Filter changelog to only these products
CF_RELEVANT_PRODUCTS=(
  "Workers"
  "Pages"
  "D1"
  "R2"
  "KV"
  "Queues"
  "Durable Objects"
  "Hyperdrive"
  "Vectorize"
  "AI Gateway"
  "Browser Rendering"
  "Cloudflare Images"
  "Stream"
  "Workers AI"
  "Wrangler"
)

# ─── Repos ─────────────────────────────────────────────────────────
if [ -n "$REPOS_DIR" ]; then
  PARENT_DIR="$REPOS_DIR"
elif [ -f "$SCRIPT_DIR/lib/common.sh" ]; then
  PARENT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
else
  PARENT_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"
fi

ALL_REPOS=("pulse" "periodic" "chocho" "codex" "pub-cogley" "courier" "jac-2026")

# ─── Colors ────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

NEW_ICON="${CYAN}★${NC}"
HIT_ICON="${YELLOW}→${NC}"
OK_ICON="${GREEN}✓${NC}"
MISS_ICON="${GRAY}·${NC}"

# ─── Parse arguments ──────────────────────────────────────────────
SUMMARY_MODE=false
CF_ONLY=false
SVELTE_ONLY=false
LOOKBACK_DAYS=90
REPOS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary|-s)   SUMMARY_MODE=true; shift ;;
    --cf-only)      CF_ONLY=true; shift ;;
    --svelte-only)  SVELTE_ONLY=true; shift ;;
    --days)         LOOKBACK_DAYS="$2"; shift 2 ;;
    *)              REPOS+=("$1"); shift ;;
  esac
done

if [[ ${#REPOS[@]} -eq 0 ]]; then
  REPOS=("${ALL_REPOS[@]}")
fi

# Cutoff date for filtering entries
if [[ "$(uname)" == "Darwin" ]]; then
  CUTOFF_DATE=$(date -v-${LOOKBACK_DAYS}d +%Y-%m-%d)
else
  CUTOFF_DATE=$(date -d "$LOOKBACK_DAYS days ago" +%Y-%m-%d)
fi

# ─── Temp directory ────────────────────────────────────────────────
TMPDIR_WN=$(mktemp -d)
trap 'rm -rf "$TMPDIR_WN"' EXIT

# ─── Helper: find package.json for a repo ─────────────────────────
find_package_json() {
  local repo_dir="$1" repo_name="$2"
  case "$repo_name" in
    chocho)     echo "$repo_dir/app/package.json" ;;
    codex)
      if [[ -f "$repo_dir/packages/hanawa-cms/package.json" ]]; then
        echo "$repo_dir/packages/hanawa-cms/package.json"
      else echo "$repo_dir/package.json"; fi ;;
    pub-cogley)
      if [[ -f "$repo_dir/apps/web/package.json" ]]; then
        echo "$repo_dir/apps/web/package.json"
      else echo "$repo_dir/package.json"; fi ;;
    *)          echo "$repo_dir/package.json" ;;
  esac
}

find_src_dir() {
  local repo_dir="$1" repo_name="$2"
  case "$repo_name" in
    chocho)     echo "$repo_dir/app/src" ;;
    codex)      echo "$repo_dir/packages/hanawa-cms/src" ;;
    pub-cogley) echo "$repo_dir/apps/web/src" ;;
    *)          echo "$repo_dir/src" ;;
  esac
}

# ─── Helper: extract version from package.json ────────────────────
get_dep_version() {
  local pkg_json="$1" dep_name="$2"
  if [[ ! -f "$pkg_json" ]]; then echo "n/a"; return; fi
  node -e "
    const pkg = JSON.parse(require('fs').readFileSync('$pkg_json','utf8'));
    const v = pkg.dependencies?.['$dep_name'] || pkg.devDependencies?.['$dep_name'] || 'n/a';
    console.log(v.replace(/^[\^~]/,''));
  " 2>/dev/null || echo "n/a"
}

# ─── Fetch SvelteKit patterns feed ────────────────────────────────
fetch_svelte_patterns() {
  echo -e "${BLUE}==> Fetching SvelteKit patterns feed${NC}"
  if curl -sf "$SVELTE_PATTERNS_FEED" -o "$TMPDIR_WN/patterns.json" 2>/dev/null; then
    local count
    count=$(node -e "
      const d = JSON.parse(require('fs').readFileSync('$TMPDIR_WN/patterns.json','utf8'));
      console.log(d.items?.length || 0);
    " 2>/dev/null || echo "0")
    echo -e "  ${OK_ICON} Loaded $count patterns (filtering to last ${LOOKBACK_DAYS} days)"
  else
    echo -e "  ${RED}✗ Failed to fetch patterns feed${NC}"
    return 1
  fi
}

# ─── Fetch Cloudflare changelog ───────────────────────────────────
fetch_cf_changelog() {
  echo -e "${BLUE}==> Fetching Cloudflare changelog${NC}"
  if curl -sf "$CF_CHANGELOG_FEED" -o "$TMPDIR_WN/cf-changelog.xml" 2>/dev/null; then
    echo -e "  ${OK_ICON} Loaded Cloudflare changelog (filtering to last ${LOOKBACK_DAYS} days)"
  else
    echo -e "  ${RED}✗ Failed to fetch Cloudflare changelog${NC}"
    return 1
  fi
}

# ─── Check SvelteKit patterns against a repo ──────────────────────
check_svelte_patterns() {
  local repo_name="$1" repo_dir="$2" pkg_json="$3" src_dir="$4"
  local svelte_ver sveltekit_ver hits=0 checked=0

  svelte_ver=$(get_dep_version "$pkg_json" "svelte")
  sveltekit_ver=$(get_dep_version "$pkg_json" "@sveltejs/kit")

  if [[ "$svelte_ver" == "n/a" ]]; then
    echo -e "  ${GRAY}Skipped (not a Svelte project)${NC}"
    return
  fi

  echo -e "  Svelte ${BOLD}$svelte_ver${NC} / SvelteKit ${BOLD}$sveltekit_ver${NC}"

  # Process patterns with node — outputs lines like:
  #   HIT|pattern-id|title|since|signature_count
  #   NEW|pattern-id|title|since|description
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$TMPDIR_WN/patterns.json','utf8'));
    const cutoff = '$CUTOFF_DATE';

    for (const item of data.items || []) {
      const p = item._svelte_pattern;
      if (!p) continue;

      // Filter by date
      const pubDate = (item.date_published || '').slice(0, 10);
      if (pubDate < cutoff) continue;

      // Output pattern info for the shell to check search signatures
      const sigs = (p.search_signatures || []).join('|||');
      console.log('PATTERN|' + p.id + '|' + (item.title||'').replace(/\|/g,'-') + '|' + (p.since||'') + '|' + sigs);
    }
  " 2>/dev/null | while IFS='|' read -r type pid title since sigs; do
    if [[ "$type" != "PATTERN" ]]; then continue; fi
    checked=$((checked + 1))

    if [[ -z "$sigs" || ! -d "$src_dir" ]]; then
      if [[ "$SUMMARY_MODE" != "true" ]]; then
        echo -e "    ${NEW_ICON} ${BOLD}$title${NC} (${since}) — no search signatures to check"
      fi
      continue
    fi

    # Split signatures by ||| and grep for each
    local found=false match_count=0
    IFS='|||' read -ra sig_array <<< "$sigs"
    for sig in "${sig_array[@]}"; do
      if [[ -z "$sig" ]]; then continue; fi
      local grep_count
      grep_count=$(grep -rl "$sig" "$src_dir" --include='*.svelte' --include='*.ts' --include='*.js' 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$grep_count" -gt 0 ]]; then
        found=true
        match_count=$((match_count + grep_count))
      fi
    done

    if [[ "$found" == "true" ]]; then
      hits=$((hits + 1))
      echo -e "    ${HIT_ICON} ${BOLD}$title${NC} (${since}) — ${YELLOW}$match_count file(s) have legacy pattern${NC}"
    elif [[ "$SUMMARY_MODE" != "true" ]]; then
      echo -e "    ${NEW_ICON} ${BOLD}$title${NC} (${since}) — new feature available"
    fi
  done

  return 0
}

# ─── Check Cloudflare changelog against a repo ────────────────────
check_cf_changelog() {
  local repo_name="$1" repo_dir="$2" pkg_json="$3"

  # Check which CF products this repo uses (from wrangler config or package.json)
  local wrangler_file=""
  for f in "$repo_dir/wrangler.jsonc" "$repo_dir/wrangler.json" "$repo_dir/wrangler.toml"; do
    if [[ -f "$f" ]]; then wrangler_file="$f"; break; fi
  done

  if [[ -z "$wrangler_file" ]]; then
    echo -e "  ${GRAY}Skipped (no wrangler config)${NC}"
    return
  fi

  # Detect which bindings are in use
  local used_products=()
  local wrangler_content
  wrangler_content=$(cat "$wrangler_file" 2>/dev/null || echo "")

  # Workers is always relevant if wrangler exists
  used_products+=("Workers")

  # Check for specific bindings
  if echo "$wrangler_content" | grep -qi "d1_databases\|d1Database"; then used_products+=("D1"); fi
  if echo "$wrangler_content" | grep -qi "r2_buckets\|r2Bucket"; then used_products+=("R2"); fi
  if echo "$wrangler_content" | grep -qi "kv_namespaces\|kvNamespace"; then used_products+=("KV"); fi
  if echo "$wrangler_content" | grep -qi "queues\|queue"; then used_products+=("Queues"); fi
  if echo "$wrangler_content" | grep -qi "durable_objects\|durableObject"; then used_products+=("Durable Objects"); fi
  if echo "$wrangler_content" | grep -qi "hyperdrive"; then used_products+=("Hyperdrive"); fi
  if echo "$wrangler_content" | grep -qi "vectorize"; then used_products+=("Vectorize"); fi
  if echo "$wrangler_content" | grep -qi "ai\b"; then used_products+=("Workers AI"); fi
  if echo "$wrangler_content" | grep -qi "browser"; then used_products+=("Browser Rendering"); fi
  if echo "$wrangler_content" | grep -qi "images"; then used_products+=("Cloudflare Images"); fi

  # Also always include Wrangler and Pages
  used_products+=("Wrangler" "Pages")

  local bindings_str
  bindings_str=$(printf '%s, ' "${used_products[@]}")
  bindings_str="${bindings_str%, }"
  echo -e "  Bindings: ${BOLD}${bindings_str}${NC}"

  # Parse CF changelog XML with node and filter by product + date
  node -e "
    const fs = require('fs');
    const xml = fs.readFileSync('$TMPDIR_WN/cf-changelog.xml', 'utf8');
    const cutoff = '$CUTOFF_DATE';
    const products = $(printf '%s\n' "${used_products[@]}" | node -e "
      const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n');
      console.log(JSON.stringify(lines));
    ");

    // Simple XML parsing — extract items between <item> tags
    const items = xml.split('<item>').slice(1);
    let count = 0;

    for (const item of items) {
      // Extract fields
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]>/s) || item.match(/<title>(.*?)<\/title>/s) || ['',''])[1].trim();
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || ['',''])[1].trim();
      const link = (item.match(/<link>(.*?)<\/link>/) || ['',''])[1].trim();
      const product = (item.match(/<product>(.*?)<\/product>/) || ['',''])[1].trim();

      // Filter by date
      if (pubDate) {
        const d = new Date(pubDate);
        const dateStr = d.toISOString().slice(0,10);
        if (dateStr < cutoff) continue;
      }

      // Filter by product relevance
      const isRelevant = products.some(p =>
        product.toLowerCase().includes(p.toLowerCase()) ||
        title.toLowerCase().includes(p.toLowerCase())
      );
      if (!isRelevant) continue;

      count++;
      const dateShort = pubDate ? new Date(pubDate).toISOString().slice(0,10) : '?';
      console.log('CF_ENTRY|' + dateShort + '|' + product + '|' + title.replace(/\|/g,'-').slice(0,80) + '|' + link);
    }

    if (count === 0) {
      console.log('CF_NONE|No relevant changelog entries in the last $LOOKBACK_DAYS days');
    }
  " 2>/dev/null | while IFS='|' read -r type date product title link; do
    case "$type" in
      CF_ENTRY)
        if [[ "$SUMMARY_MODE" == "true" ]]; then
          echo -e "    ${NEW_ICON} [${date}] ${product}: ${title}"
        else
          echo -e "    ${NEW_ICON} [${date}] ${BOLD}${product}${NC}: ${title}"
          echo -e "       ${GRAY}${link}${NC}"
        fi
        ;;
      CF_NONE)
        echo -e "    ${OK_ICON} ${date}"
        ;;
    esac
  done

  return 0
}

# ─── Main ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  What's New Audit                                          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Lookback: ${BOLD}${LOOKBACK_DAYS} days${NC} (since ${CUTOFF_DATE})"
echo -e "  Repos:    ${BOLD}${REPOS[*]}${NC}"
echo ""

# Fetch feeds
if [[ "$CF_ONLY" != "true" ]]; then
  fetch_svelte_patterns || true
fi
if [[ "$SVELTE_ONLY" != "true" ]]; then
  fetch_cf_changelog || true
fi
echo ""

# Process each repo
for repo_name in "${REPOS[@]}"; do
  repo_dir="$PARENT_DIR/$repo_name"

  if [[ ! -d "$repo_dir" ]]; then
    echo -e "${RED}✗ $repo_name — directory not found: $repo_dir${NC}"
    echo ""
    continue
  fi

  echo -e "${BOLD}── $repo_name ──────────────────────────────────────────${NC}"

  pkg_json=$(find_package_json "$repo_dir" "$repo_name")
  src_dir=$(find_src_dir "$repo_dir" "$repo_name")

  if [[ "$CF_ONLY" != "true" ]]; then
    echo -e "  ${BLUE}SvelteKit Patterns:${NC}"
    check_svelte_patterns "$repo_name" "$repo_dir" "$pkg_json" "$src_dir"
  fi

  if [[ "$SVELTE_ONLY" != "true" ]]; then
    echo -e "  ${BLUE}Cloudflare Changelog:${NC}"
    check_cf_changelog "$repo_name" "$repo_dir" "$pkg_json"
  fi

  echo ""
done

echo -e "${BOLD}── Done ──────────────────────────────────────────────────────${NC}"
echo ""
echo -e "  Run ${CYAN}/dev:whatsnew-report${NC} for a deep AI-assisted review"
echo -e "  Run ${CYAN}/dev:svelte-patterns${NC} for detailed pattern matching"
echo ""
