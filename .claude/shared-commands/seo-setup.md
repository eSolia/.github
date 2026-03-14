# SEO Setup

Apply the SEO checklist to this project. Works with SvelteKit, Hono, and generic web projects. Checks trailing slashes, meta tags, JSON-LD, sitemap, robots.txt, and optionally installs a CI workflow.

## Instructions

Fetch the SEO checklist from the eSolia standards MCP before starting:

1. Use `mcp__esolia-standards__get_standard` with slug `sveltekit-seo-checklist` — the full checklist (framework-agnostic despite the name)
2. Check locally for `docs/shared/guides/seo-check.test.ts` and `docs/shared/guides/seo-check.yml` — reusable test file and CI workflow

If the MCP is not available, check `docs/shared/guides/SVELTEKIT_SEO_CHECKLIST.md` locally.

Arguments: $ARGUMENTS — Optional: "audit" (report only, no changes) or "ci" (only install the CI workflow).

### 1. Detect the framework

Read `package.json` and determine the project type:

- **SvelteKit**: has `@sveltejs/kit` in dependencies
- **Hono**: has `hono` in dependencies
- **Generic**: anything else (Astro, plain HTML, etc.)

Report which framework was detected and proceed with framework-appropriate steps.

### 2. Understand the project

**All frameworks:**

- Read `package.json` for dependencies and scripts
- Check for `content/` directory (markdown content pipeline)
- Check for existing `static/sitemap.xml`, `static/robots.txt`
- Check for existing security headers configuration

**SvelteKit additionally:**

- Read `svelte.config.js` for adapter and config
- Read `src/routes/+layout.server.ts` (or `+layout.ts`) for trailingSlash setting
- Scan `src/routes/` for route structure and language setup

**Hono additionally:**

- Read `src/index.ts` (or main entry) for route definitions and middleware
- Identify which routes render public-facing HTML (look for template strings with `<html`, `<!DOCTYPE`, `<head>`)
- Check for `secureHeaders()` middleware
- Note routes that should be exempt from SEO (API, admin, auth, share tokens)

### 3. Audit current SEO state

Check each item and report:

| Check              | Status | Notes                                                        |
| ------------------ | ------ | ------------------------------------------------------------ |
| Trailing slashes   | ?      | Consistent URL style enforced? All internal links correct?   |
| Meta tags          | ?      | Public pages have title, description?                        |
| Canonical URL      | ?      | Present on public pages?                                     |
| OG tags            | ?      | Title, description, image, url?                              |
| Title/desc lengths | ?      | Hardcoded strings within limits?                             |
| JSON-LD            | ?      | At least Organization schema on homepage?                    |
| Sitemap            | ?      | Static or dynamic sitemap exists?                            |
| robots.txt         | ?      | Exists with Sitemap directive? Non-public routes disallowed? |
| Security headers   | ?      | HSTS, X-Frame-Options, nosniff, Referrer-Policy?             |
| hreflang           | ?      | Present if site is bilingual?                                |

If `$ARGUMENTS` is "audit", stop here and present findings.

### 4. Install the SEO test suite

1. Create the test directory:
   - SvelteKit: `src/lib/seo/`
   - Hono/generic: `src/lib/seo/` or `tests/`
2. Copy `docs/shared/guides/seo-check.test.ts` to the test directory
3. Edit `SITE_CONFIG` for this project:
   - `framework`: `'sveltekit'`, `'hono'`, or `'generic'`
   - `sourceDir`: path to source files
   - `routesDir`: SvelteKit routes path (SvelteKit only)
   - `contentDirs`: add `['content']` if markdown content exists
   - `primaryLang`: `'ja'` or `'en'`
   - `exemptRoutes`: auth pages, API routes, admin, utility pages
   - `htmlRenderFiles` (Hono/generic): list specific `.ts` files that return public HTML
4. Verify vitest is in devDependencies
5. Run: `pnpm vitest run <path-to-test-file>`

### 5. Fix violations

For each failing test:

- **Trailing slashes**: Add `/` to internal hrefs in templates, markdown, and data files
- **Meta tags**: Add missing title, description, canonical, OG to public page templates
- **Title/description lengths**: Adjust to fit limits
- **JSON-LD**: Add Organization schema to homepage/landing page

Re-run until all tests pass.

### 6. Set up CI workflow

If `$ARGUMENTS` is "ci", start from this step.

1. Copy `docs/shared/guides/seo-check.yml` to `.github/workflows/seo-check.yml`
2. For SvelteKit: uncomment the `svelte-kit sync` step
3. For non-SvelteKit: ensure the `svelte-kit sync` step stays commented out
4. Adjust the test file path in the workflow if you placed it somewhere other than `src/lib/seo/`
5. Adjust if the project uses npm or bun instead of pnpm

### 7. Remaining checklist items

These need manual setup — check and advise:

**Sitemap:**

- SvelteKit: `src/routes/sitemap.xml/+server.ts` route
- Hono: `app.get('/sitemap.xml', ...)` route handler
- Or: static `static/sitemap.xml` file

**robots.txt:**

- SvelteKit: `src/routes/robots.txt/+server.ts` route
- Hono: `app.get('/robots.txt', ...)` route handler
- Or: static `static/robots.txt` file
- Must include `Sitemap:` directive
- Must disallow non-public routes (`/api/`, `/admin/`, `/auth/`, `/s/`, etc.)

**Security headers:**

- SvelteKit: add to `hooks.server.ts`
- Hono: use `secureHeaders()` middleware

**hreflang:**

- Add if the site serves multiple languages

### 8. Final verification

1. Run `pnpm vitest run <path-to-test-file>` — all pass
2. Run `pnpm run verify` if available
3. Present summary of changes made

**Do not commit — let the user review first.**
