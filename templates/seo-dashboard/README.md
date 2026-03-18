# SEO Dashboard Setup Guide

Add a per-site SEO intelligence dashboard to any eSolia-maintained SvelteKit site on Cloudflare Workers.

## Prerequisites

- SvelteKit site deployed on Cloudflare Workers via `adapter-cloudflare`
- Google Search Console property registered for the domain
- Shared Google service account with owner access to the GSC property
- (Optional) Bing Webmaster Tools API key

## Quick Start

### 1. Install the library

```bash
# pnpm
pnpm add @esolia/core@latest

# yarn
yarn add @esolia/core@latest
```

Ensure `.npmrc` has GitHub Packages registry configured:

```
@esolia:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

For Cloudflare Builds, set `NODE_AUTH_TOKEN` as a build environment variable (GitHub PAT with `read:packages` scope).

### 2. Create D1 database

Via Cloudflare dashboard: **Workers & Pages > D1 > Create database** named `search-intelligence`.

Apply the schema — paste each block into the D1 Console tab:
- See `schema.sql` in this directory (run block by block in the console)

### 3. Create KV namespace (optional)

Via Cloudflare dashboard: **Workers & Pages > Workers KV > Create namespace** named `{site}-cache`.

If skipped, the rate limiter degrades gracefully (allows all requests). Protect `/dash` via Cloudflare Access instead.

### 4. Add bindings to main site `wrangler.jsonc`

```jsonc
{
  // ... existing config ...

  "d1_databases": [
    {
      "binding": "SEARCH_INTEL_DB",
      "database_name": "search-intelligence",
      "database_id": "YOUR_D1_DATABASE_ID"
    }
  ],

  // Optional — only if KV namespace was created
  "kv_namespaces": [
    {
      "binding": "CACHE_KV",
      "id": "YOUR_KV_NAMESPACE_ID"
    }
  ]
}
```

### 5. Update `app.d.ts`

Add the bindings to your `App.Platform` interface:

```typescript
interface Platform {
  env: {
    // ... existing bindings ...
    SEARCH_INTEL_DB: D1Database;
    CACHE_KV: KVNamespace;  // omit if not using KV
  };
}
```

### 6. Create site files

Copy and customize from this template directory:

| Source | Destination | Customize |
|--------|-------------|-----------|
| `seo-targets.example.ts` | `src/lib/seo-targets.ts` | Keywords, audiences, landing pages |
| `ingest-worker/` | `workers/search-console-ingest/` | Account ID, site URLs, cron schedule |

Create the dashboard routes:
- `src/routes/dash/+page.ts` — `export const prerender = false;`
- `src/routes/dash/+page.server.ts` — Query D1 directly (NOT via fetch API — see Lessons Learned)
- `src/routes/dash/+page.svelte` — Dashboard UI

### 7. Deploy ingest worker

```bash
cd workers/search-console-ingest
yarn install  # or pnpm install
wrangler deploy
wrangler secret put GSC_SERVICE_ACCOUNT_KEY  # paste SA JSON
wrangler secret put BING_API_KEY             # paste Bing key
```

### 8. Trigger initial backfill

```bash
curl "https://YOUR-INGEST-WORKER.workers.dev/backfill?days=28"
```

### 9. Verify

- Hit `/health` on the ingest worker — should show row counts
- Visit `/dash` on the main site — should show data

### 10. Protect the dashboard

Add Cloudflare Access application for `/dash/*` and `/api/seo-dashboard/*`.

## Lessons Learned

Apply these to all new deployments:

1. **FTS5 trigram index required.** The schema includes `search_performance_fts` virtual table and `sp_fts_insert` trigger. Without them, target keyword queries fail.

2. **Target queries must run individually.** Don't batch all target LIKE queries in `db.batch()` — SQLite hits `LIKE pattern too complex` limits. Run each with `stmt.all()` in a loop, catching errors per-target.

3. **Query D1 directly from load functions.** Don't `fetch('/api/seo-dashboard')` from `+page.server.ts` — server-side fetches go through the public route and get blocked by WAF. Use `platform.env.SEARCH_INTEL_DB` directly.

4. **GitHub Packages auth for CI/CD.** Set `NODE_AUTH_TOKEN` as a build env var. Add `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` to `.npmrc`.

5. **Direnv tokens don't load in spawned shells.** Explicitly source tokens when deploying from scripts: `CLOUDFLARE_API_TOKEN=$(cat ~/.ssh/tokens/TOKEN_FILE) wrangler deploy`.
