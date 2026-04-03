---
allowed-tools: Read, Glob, Grep, Bash, WebFetch, Write
description: Check for new SvelteKit patterns and Cloudflare updates relevant to this project
---

## Context
- Current directory: !`pwd`
- Svelte version: !`cat package.json 2>/dev/null | grep -E '"svelte"' | head -1 || echo "not found"`
- SvelteKit version: !`cat package.json 2>/dev/null | grep -E '"@sveltejs/kit"' | head -1 || echo "not found"`
- Wrangler config: !`ls wrangler.jsonc wrangler.json wrangler.toml 2>/dev/null | head -1 || echo "none"`

## Your task

Audit this project against upstream SvelteKit and Cloudflare updates, then produce a structured "What's New" report showing what the project could adopt.

### Step 1: Gather project context

1. Read `package.json` to get current Svelte, SvelteKit, and wrangler versions
2. Read `wrangler.jsonc` (or `.json`/`.toml`) to identify which Cloudflare bindings are in use (D1, R2, KV, Queues, Durable Objects, etc.)
3. Use Glob to get a sense of the project structure (`src/routes/**`, `src/lib/**`)

### Step 2: Fetch SvelteKit patterns feed

Use WebFetch to retrieve `https://svelte.cogley.jp/feeds/patterns.json`.

For each pattern in the feed:
- Check if the project's Svelte/SvelteKit version meets the pattern's `since` requirement
- If yes, use Grep to search `src/` for the pattern's `search_signatures`
- Classify each pattern as:
  - **Actionable** — project version qualifies AND legacy signatures found in code
  - **Available** — project version qualifies but no legacy code found (already adopted or not applicable)
  - **Blocked** — project version is too old for this pattern

Focus on **Actionable** patterns — these represent concrete modernization opportunities.

### Step 3: Fetch Cloudflare changelog

Use WebFetch to retrieve `https://developers.cloudflare.com/changelog/rss/index.xml`.

Filter entries from the last 90 days to only those matching the project's Cloudflare bindings. For each relevant entry:
- Summarize what changed
- Assess impact: **Breaking** (must act), **Opportunity** (should consider), or **Informational** (nice to know)
- Check if the project's `wrangler.jsonc` or code already reflects the change

### Step 4: Cross-check the patterns feed

The SvelteKit patterns feed at `https://svelte.cogley.jp/feeds/patterns.json` is maintained in the `pub-cogley/apps/migrate-to-svelte` app. When you discover new Svelte/SvelteKit features from the changelog or releases that are NOT yet in the patterns feed, flag them:

- Compare your findings from Steps 2-3 against the feed's pattern IDs and `since` versions
- For each new feature you found upstream that the feed doesn't cover yet, add it to a "Feed Gaps" section in the report
- This helps keep the reference feed current — the user can then update it via `/local:update-svelte-reference` in the pub-cogley repo

### Step 5: Check for deprecations


Search the codebase for known deprecation patterns:
- `compatibility_date` in wrangler config — is it older than 6 months?
- Deprecated Cloudflare APIs (e.g., `HTMLRewriter` constructor changes, old D1 session API)
- Deprecated SvelteKit APIs (e.g., old `load` function signatures, `goto` options)

### Step 6: Write the report

Create the report at `docs/plans/whatsnew-report-YYYY-MM-DD.md` (use today's date).

```markdown
# What's New Report — YYYY-MM-DD

**Project:** (name from package.json)
**Svelte:** X.Y.Z | **SvelteKit:** X.Y.Z | **Wrangler:** X.Y.Z
**Cloudflare bindings:** D1, R2, KV, ... (from wrangler config)

## Executive Summary

(2-3 sentences: how current is this project? any urgent items?)

## Urgency Tiers

### Must Act (Breaking changes / Deprecations)

| Source | Item | Impact | Action Required |
|--------|------|--------|-----------------|
| CF/SK  | ...  | ...    | ...             |

### Should Consider (Opportunities)

| Source | Item | Benefit | Effort |
|--------|------|---------|--------|
| CF/SK  | ...  | ...     | ...    |

### Informational (Nice to know)

- Bullet list of FYI items

## SvelteKit Patterns Detail

### Actionable Patterns

#### Pattern Title (`since`)
- **Category:** architecture/syntax/tooling
- **Legacy found in:** `src/path/file.svelte:42`, ...
- **Modern approach:** (from pattern's replacement field)
- **Docs:** [link](url)

(repeat for each actionable pattern)

### Already Adopted
- pattern-id-1: Title
- pattern-id-2: Title

## Cloudflare Updates Detail

### Relevant Changelog Entries (last 90 days)

#### [Date] Product: Title
- **Impact:** Breaking / Opportunity / Informational
- **Summary:** what changed
- **Project status:** Already adopted / Needs update / Not applicable
- **Link:** changelog URL

(repeat for each relevant entry)

## Patterns Feed Gaps

Features found upstream that are not yet in the `svelte.cogley.jp/feeds/patterns.json` feed:

| Feature | Version | Why it should be a pattern |
|---------|---------|---------------------------|
| ...     | ...     | ...                       |

To update the feed, work in `pub-cogley` and run `/local:update-svelte-reference`.

## Staleness Indicators

| Check | Status | Detail |
|-------|--------|--------|
| compatibility_date | current/stale | value and age |
| Svelte version | current/behind | latest vs installed |
| SvelteKit version | current/behind | latest vs installed |
| Wrangler version | current/behind | latest vs installed |
```

Create the `docs/plans/` directory if it does not exist.

### Step 7: Summarize for the user

After writing the report:
- Show the path to the report file
- Count: N actionable SvelteKit patterns, M relevant CF updates, K deprecation warnings
- Highlight the top 3 most impactful items to act on
- Note: for a quick cross-repo scan, run `./scripts/audit-whatsnew.sh`

Handle any arguments: $ARGUMENTS
