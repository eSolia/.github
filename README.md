# eSolia `.github`

This is eSolia's [organization `.github` repository](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile). Its sole purpose is to generate and serve the organization profile README shown on [github.com/eSolia](https://github.com/eSolia).

## What's here

| Path | Purpose |
|---|---|
| `profile/README.md` | Generated output displayed on the org profile page. Do not edit by hand — regenerated daily by CI. |
| `_config.ts`, `plugins.ts`, `deno.json`, `src/` | [Lume](https://lume.land) site that builds `profile/README.md`. |
| `_site/` | Build output. |
| `.github/workflows/update-profile-readme.yml` | Daily cron that runs `deno task build` and commits the regenerated profile. |
| `.github/ISSUE_TEMPLATE/`, `.github/CODEOWNERS` | Org-wide defaults inherited by public eSolia repos. |
| `SECURITY.md` | Public security policy. |

## Local development

```bash
deno task serve   # Preview the profile README locally
deno task build   # One-shot build → writes profile/README.md
```

## Where the rest of eSolia's shared infrastructure lives

Everything operational — shared workflows, scripts, Claude Code commands and rules, project templates, security-assessment docs, the CI/CD evidence pipeline — lives in the private **[eSolia/devkit](https://github.com/eSolia/devkit)** repo. Consumer repos fan out from there via `scripts/shared/sync.ts`.

This repo used to host all of that content. It was migrated to `devkit` in April 2026 to separate **public org metadata** (this repo) from **internal developer infrastructure** (devkit).
