# SEO Report

Fetch live SEO dashboard data and act on findings. Queries the remote D1 database for content gaps, search performance issues, and 404s, then makes content changes to address them.

Arguments: $ARGUMENTS — Optional: "gaps" (content gaps only), "404s" (search 404s only), "targets" (target cluster performance only), "audit" (report only, no changes), or omit for full report + fixes.

## Instructions

### 1. Identify the site configuration

Read `src/lib/seo-targets.ts` to understand the keyword clusters and target pages. Read `wrangler.jsonc` to find the D1 database name (usually `search-intelligence`).

### 2. Fetch live data from D1

Run these queries against the remote D1 database using `wrangler d1 execute <database-name> --remote`. Execute them in parallel where possible.

**Content gaps (open):**
```sql
SELECT id, query_cluster, representative_query, total_impressions, avg_position, suggested_action, status FROM content_gaps WHERE status = 'open' ORDER BY total_impressions DESC LIMIT 20
```

**Top queries with no clicks (missed opportunities — last 30 days):**
```sql
SELECT query, page, SUM(impressions) AS impressions, SUM(clicks) AS clicks, ROUND(SUM(position * impressions) / SUM(impressions), 1) AS avg_pos FROM search_performance WHERE date >= date('now', '-30 days') AND clicks = 0 AND impressions >= 10 GROUP BY query, page ORDER BY impressions DESC LIMIT 20
```

**Search-referred 404s:**
```sql
SELECT path, count, referrer, last_seen FROM not_found_log WHERE referrer LIKE '%google%' OR referrer LIKE '%bing%' OR referrer LIKE '%yahoo%' ORDER BY count DESC LIMIT 20
```

**Recent SEO actions (last 30 days):**
```sql
SELECT id, action_type, target_url, target_query, content_gap_id, notes, commit_hash, status, created_at FROM seo_actions WHERE created_at >= datetime('now', '-30 days') ORDER BY created_at DESC LIMIT 50
```

**Target cluster performance (uses keywords from `src/lib/seo-targets.ts`):**
For each target in `SEO_TARGETS`, check if the target pages are ranking for the tracked keywords. Read `src/lib/seo-targets.ts` first, then query:
```sql
SELECT query, page, SUM(impressions) AS imp, SUM(clicks) AS clicks, ROUND(SUM(position * impressions) / SUM(impressions), 1) AS avg_pos FROM search_performance WHERE date >= date('now', '-30 days') AND (query LIKE '%keyword1%' OR query LIKE '%keyword2%') GROUP BY query, page ORDER BY imp DESC LIMIT 10
```

### 3. Cross-reference with recent actions

Compare each finding against `seo_actions` from the last 30 days:
- If a content gap has a matching `seo_actions` row (by `content_gap_id` or `target_url`), annotate it as **"Recently addressed"** with the action date and notes
- If a 404 path matches a `target_url` with `action_type = 'redirect_added'`, mark it as **"Redirect added"**
- If a meta rewrite was logged for a page with low CTR, mark it as **"Meta rewritten — monitoring"**

This prevents re-flagging items that were already fixed in a previous session.

### 4. Present findings

Summarise as a prioritised list:
- **Critical**: Content gaps with high impressions, search 404s with high hit counts, wrong-page rankings
- **Medium**: Position 4-10 with low CTR (needs meta rewrite), content quality violations
- **Low**: Healthy positions to monitor
- **Recently addressed**: Items with matching seo_actions entries (show action date + notes)

If `$ARGUMENTS` is "audit", stop here — present the report without making changes.

### 5. Address findings

For each finding, apply the appropriate fix:

**Content gaps → Create or enhance content:**
- Map the `representative_query` to the most relevant existing page
- If no page exists, note it and ask the user before creating new content
- If a page exists, strengthen it with the gap keywords naturally woven in

**Wrong page ranking → Fix internal linking:**
- Add internal links from the (wrongly) ranking page to the correct target page
- Ensure the target page has the keywords in its title, description, and H1/H2

**Low CTR → Rewrite meta:**
- Edit frontmatter `title` and `description` in the relevant content file
- Include exact search phrases from the query data
- Keep title 30-60 chars, description 120-160 chars

**Search 404s → Add redirects or content:**
- For pages that moved: add redirect in `hooks.server.ts` or create a redirect route
- For pages that never existed: consider creating content if the 404 has significant traffic

### 6. Log actions to D1

After each fix, log the action to `seo_actions` so future reports can cross-reference:

```bash
wrangler d1 execute <database-name> --remote --command "INSERT INTO seo_actions (action_type, target_url, target_query, notes) VALUES ('content_gap', '/en/services/example/', 'example keyword', 'Added keyword section')"
```

Valid `action_type` values: `content_gap`, `meta_rewrite`, `redirect_added`, `wrong_page_fix`, `content_strengthen`, `new_content`, `quality_fix`.

### 7. After changes

1. Run the project's verify command (`pnpm run verify` or `yarn verify`) to ensure all changes pass
2. Update gap status in D1 for addressed items:
   ```bash
   wrangler d1 execute <database-name> --remote --command "UPDATE content_gaps SET status = 'done', updated_at = datetime('now') WHERE id IN (x, y, z)"
   ```
3. Present a summary of all changes made

**Do not commit — let the user review first.**
