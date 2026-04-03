# What's New Check Rule

When updating dependencies (package.json, wrangler.jsonc) or working on SvelteKit/Cloudflare Workers code, check if there are newer platform features the project could adopt.

## When this applies

- After running `npm update`, `pnpm update`, or modifying dependency versions
- When modifying `wrangler.jsonc` or Cloudflare bindings
- When adding new SvelteKit routes, load functions, or server endpoints

## What to check

1. **SvelteKit patterns feed:** Fetch `https://svelte.cogley.jp/feeds/patterns.json` and compare the project's Svelte/SvelteKit version against each pattern's `since` field. Flag patterns where the project's version is high enough to adopt the modern approach but the codebase still uses legacy signatures.

2. **Cloudflare changelog:** Check `https://developers.cloudflare.com/changelog/rss/index.xml` for entries in the last 90 days matching the project's Cloudflare bindings (D1, R2, KV, Workers, etc. — read from `wrangler.jsonc`). Flag entries that introduce new APIs, deprecations, or breaking changes relevant to the project.

## How to report

If you find relevant updates, mention them briefly after completing the primary task:

> **Platform updates available:** Found N SvelteKit pattern(s) and M Cloudflare update(s) relevant to this project. Run `/dev:whatsnew-report` for details.

If you discover upstream features that are NOT in the patterns feed, note them:

> **Patterns feed gap:** Found N feature(s) from recent Svelte/SvelteKit releases not yet in the svelte.cogley.jp patterns feed. Update the feed in `pub-cogley` with `/local:update-svelte-reference`.

Do not block the user's primary task for these checks. This is informational only.

## Deterministic companion

For a full cross-repo audit, the developer can run `./scripts/audit-whatsnew.sh` which performs the same checks deterministically across all eSolia repos.
