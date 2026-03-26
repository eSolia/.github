---
allowed-tools: Read, Glob, Grep, Bash, WebFetch, Write
description: Check codebase against svelte.cogley.jp patterns feed and report modernization opportunities
---

## Context
- Current directory: !`pwd`
- Svelte version: !`cat package.json 2>/dev/null | grep -E '"svelte"' | head -1 || echo "not found"`
- SvelteKit version: !`cat package.json 2>/dev/null | grep -E '"@sveltejs/kit"' | head -1 || echo "not found"`

## Your task

Audit this codebase against the Svelte 5 migration patterns feed and produce a report of modernization opportunities.

### Step 1: Fetch the patterns feed

Use WebFetch to retrieve the JSON feed from `https://svelte.cogley.jp/feeds/patterns.json`. Extract every item's `_svelte_pattern` object — you need `id`, `title`, `since`, `category`, `search_signatures`, `replacement`, `notes`, `release_url`, and `docs`.

### Step 2: Identify Svelte/SvelteKit files

Use Glob to find all `.svelte`, `.svelte.ts`, `.svelte.js`, `.ts`, and `.js` files under `src/`. Also check `svelte.config.js`, `svelte.config.ts`, and `vite.config.ts` in the project root.

### Step 3: Search for each pattern

For each pattern in the feed, use Grep to search the codebase for its `search_signatures`. A pattern is a "hit" if **any** of its search signatures match in the codebase.

For each hit, record:
- The pattern id, title, and `since` version
- The file(s) and line number(s) where the signature matched
- The matched line content

Skip patterns where no signatures match — only report actual hits.

### Step 4: Filter by relevance

Compare each hit against the pattern's `replacement` and `notes` to determine if the match is genuinely outdated or just uses the same keyword in a modern way. For example, `from 'svelte/motion'` appearing in an import that already uses the modern API is not a finding. Use your judgement — when in doubt, include it with a note.

### Step 5: Write the report

Create the report file at `docs/plans/svelte-patterns-audit-YYYY-MM-DD.md` (use today's date).

Use this format:

```markdown
# Svelte Patterns Audit — YYYY-MM-DD

**Feed:** https://svelte.cogley.jp/feeds/patterns.json
**Patterns checked:** N
**Hits found:** N
**Project:** (project name from package.json)
**Svelte version:** X.Y.Z
**SvelteKit version:** X.Y.Z

## Summary

(2-3 sentence overview of findings)

## Findings

### 1. Pattern Title (`since`)

**Category:** category
**Pattern ID:** id
**Release:** [release_url](release_url)
**Docs:** [label](url)

| File | Line | Matched Signature |
|------|------|-------------------|
| `src/path/file.svelte` | 42 | `matched text` |

**Current code:**
```svelte
// snippet of what exists
```

**Modern replacement:**
```svelte
// from the pattern's replacement field
```

**Notes:** pattern notes

---

(repeat for each finding)

## No Hits

The following patterns were checked but had no matches:
- pattern-id-1 (Title)
- pattern-id-2 (Title)
- ...
```

Create the `docs/plans/` directory if it does not exist.

### Step 6: Show the user

After writing the report, tell the user:
- The path to the report file
- A count summary: patterns checked, hits found, files affected
- The top 3 most impactful findings (by number of matches or severity)

Handle any arguments: $ARGUMENTS
