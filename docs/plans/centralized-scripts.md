# Plan: Centralized Release & Wrangler Scripts

**Date:** 2026-03-14
**Status:** Approved
**Repo:** esolia.github (org-level central repo)

---

## 1. Problem Statement

Nine repos (esolia-2025, jac-2026, nexus, courier, codex, pulse, periodic, pub-cogley, chocho) each maintain local copies of `bump-version.sh` and `update-wrangler.sh`. Seven of the nine are identical (pnpm-based discovery pattern). jac-2026 is a yarn-based variant with hardcoded paths. All are Cloudflare-hosted with multiple workers.

Current issues discovered during audit:

| Issue | Repos Affected |
|-------|---------------|
| Missing `account_id` in wrangler configs | nexus, courier, pulse, periodic, chocho, codex (hanawa-scheduler), pub-cogley (tmp/) |
| TOML configs instead of JSONC | nexus (archived), codex (hanawa-scheduler), periodic (periodic-cron) |
| Stale `compatibility_date` | nexus (2024-12-01, 2025-01-01), pub-cogley/tmp (2025-01-15) |
| No observability config | Several TOML configs, some JSONC configs |
| Scripts diverge across repos | jac-2026 uses yarn; rest use pnpm |

## 2. Goals

1. **Single source of truth** for `bump-version.sh` and `update-wrangler.sh` in this repo
2. **Package-manager agnostic** — auto-detect pnpm/yarn/npm/bun per repo
3. **QC checks** built into `bump-version.sh`:
   - Bump `compatibility_date` to today in all `wrangler.jsonc` files
   - Verify `account_id` is set in every wrangler config (warn if missing)
   - Flag any `wrangler.toml` / `wrangler.json` files (should be `.jsonc`)
   - Verify observability is configured
4. **Simple consumption** — each repo pulls scripts via curl or a thin sync script
5. **No submodules** — too much ceremony for shell scripts

## 3. Architecture

```
esolia.github/
├── scripts/
│   ├── bump-version.sh        # Centralized version bump + QC
│   ├── update-wrangler.sh     # Centralized wrangler updater
│   ├── lib/
│   │   └── common.sh          # Shared functions (colors, PM detection, wrangler discovery)
│   └── sync.sh                # Run in consumer repos to fetch latest scripts
├── .github/
│   └── workflows/
│       ├── qc-wrangler.yml    # Reusable workflow: QC checks on PRs (Phase 3)
│       └── ...                # Existing workflows
├── install.sh                 # (existing) Svelte lint setup
└── docs/
    └── plans/
        └── centralized-scripts.md  # This file
```

Consumer repos after sync:

```
any-repo/
├── scripts/
│   ├── shared/
│   │   ├── bump-version.sh     # Fetched from esolia.github
│   │   ├── update-wrangler.sh  # Fetched from esolia.github
│   │   └── lib/
│   │       └── common.sh       # Fetched from esolia.github
│   ├── bump-version.sh         # Thin wrapper → calls shared/bump-version.sh
│   ├── update-wrangler.sh      # Thin wrapper → calls shared/update-wrangler.sh
│   └── ... (repo-specific scripts unchanged)
```

## 4. Detailed Design

### 4.1 `scripts/lib/common.sh` — Shared Library

Provides:

```bash
# Colors and output helpers
print_step(), print_success(), print_warning(), print_error(), print_info()

# Package manager detection (returns: pnpm | yarn | npm | bun)
detect_pm()          # Inspects lockfiles at project root
pm_install()         # Wrapper: pnpm add -D / yarn add -D / npm install -D
pm_update()          # Wrapper: pnpm update X@latest / yarn upgrade X --latest / etc
pm_lockfile_sync()   # Wrapper: pnpm install --lockfile-only / yarn install / etc

# Wrangler config discovery
find_wrangler_configs()       # Returns all wrangler.* paths (excluding node_modules, .wrangler)
find_packages_with_wrangler() # Returns package.json paths that depend on wrangler

# Project root detection
find_project_root()  # git rev-parse --show-toplevel || pwd
```

### 4.2 `scripts/bump-version.sh` — Version Bump + QC

**Usage:**
```bash
./scripts/bump-version.sh <new-version>          # Full bump + QC
./scripts/bump-version.sh <new-version> --skip-qc  # Bump only, no QC
./scripts/bump-version.sh --qc-only              # QC checks only, no version bump
```

**Steps (in order):**

1. **Parse args & detect environment**
   - If `--qc-only`: skip to step 4 (no version arg required)
   - Otherwise: require version arg (validate semver-ish: `X.Y.Z`)
   - Source `lib/common.sh`
   - Detect package manager
   - Find project root

2. **Update version strings**
   - `package.json` — find all within maxdepth 3 (supports monorepos like codex `packages/*/package.json` and pub-cogley `apps/*/package.json`)
   - `wrangler.jsonc` — update `APP_VERSION` env var in all found configs
   - `openapi.yaml` — update `version:` field if present (skip if none found)

3. **Update wrangler dependency**
   - For each `package.json` containing `"wrangler"`, run PM-appropriate update to latest
   - Sync lockfile

4. **QC: Bump compatibility_date** (NEW)
   - Get today's date (`date +%Y-%m-%d`)
   - Find all `wrangler.jsonc` files
   - Update `"compatibility_date": "YYYY-MM-DD"` to today
   - Report what was changed

5. **QC: Check account_id** (NEW)
   - For each `wrangler.jsonc`, check if `"account_id"` key exists and has a non-empty value
   - **WARN** (don't fail) if missing — print the file path and a reminder
   - Skip files under `docs/`, `tmp/`, `_archive/` (experimental/archived configs)

6. **QC: Flag non-JSONC wrangler configs** (NEW)
   - Find any `wrangler.toml`, `wrangler.json`, `wrangler.yaml` files
   - **WARN** for each, recommending migration to `wrangler.jsonc`
   - Print path and a one-liner on how to convert

7. **QC: Check observability** (NEW)
   - For each `wrangler.jsonc`, check for `"observability"` key
   - **WARN** if missing or if `"enabled": false`

8. **Print summary**
   - Version updated to X.Y.Z
   - Compatibility date set to YYYY-MM-DD
   - QC warnings (if any)
   - Next steps (commit, tag, push, release notes reminder)

### 4.3 `scripts/update-wrangler.sh` — Wrangler Updater

**Usage:** `./scripts/update-wrangler.sh`

**Steps:**

1. Source `lib/common.sh`, detect PM, find root
2. Discover all `package.json` files with wrangler dependency
3. For each, report current version, run PM update, report new version
4. Update global wrangler (best-effort, don't fail)
5. Print summary with next steps

### 4.4 `scripts/sync.sh` — Fetcher for Consumer Repos

**Usage (run from any consumer repo):**
```bash
curl -sSfL https://raw.githubusercontent.com/esolia/esolia.github/main/scripts/sync.sh | bash
```

Or if already synced:
```bash
./scripts/shared/sync.sh
```

**What it does:**

1. Determine the consumer repo root (git root)
2. Create `scripts/shared/` and `scripts/shared/lib/` directories
3. Download from GitHub raw:
   - `scripts/bump-version.sh` → `scripts/shared/bump-version.sh`
   - `scripts/update-wrangler.sh` → `scripts/shared/update-wrangler.sh`
   - `scripts/lib/common.sh` → `scripts/shared/lib/common.sh`
   - `scripts/sync.sh` → `scripts/shared/sync.sh` (self-update)
4. `chmod +x` all `.sh` files
5. Create thin wrapper scripts at `scripts/bump-version.sh` and `scripts/update-wrangler.sh` **only if they don't exist** (won't overwrite repo-specific wrappers)
6. Print what was updated

**Thin wrapper template:**
```bash
#!/bin/bash
# Wrapper — delegates to centralized script from esolia.github
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/shared/bump-version.sh" "$@"
```

**Pinning:** By default, fetches from `main` branch. Accept an optional `--ref <tag-or-sha>` arg for pinning to a release.

**Version tracking:** After sync, writes `scripts/shared/.scriptversion`:
```
commit=abc123def456
fetched=2026-03-14T09:30:00Z
ref=main
```

**Staleness check:** `sync.sh --check` compares local `.scriptversion` commit against remote HEAD without downloading. Exits 0 if up-to-date, 1 if stale (useful for CI).

### 4.5 Handling the jac-2026 Yarn Variant

The PM-agnostic design in `common.sh` handles this automatically:
- `detect_pm()` sees `yarn.lock` → returns `yarn`
- `pm_update("wrangler@latest")` runs `yarn upgrade wrangler --latest`
- No hardcoded paths needed — discovery finds `workers/indexing/package.json`

The jac-2026-specific Node.js hack for updating indexing worker's `package.json` directly becomes unnecessary once the PM abstraction handles `yarn` properly in each subdirectory.

**Migration note:** jac-2026's indexing worker has no separate lockfile. The centralized script should handle this gracefully — if `pm_lockfile_sync()` fails in a subdirectory, warn and continue (the root lockfile governs).

## 5. QC Checks Summary

| Check | Severity | Action |
|-------|----------|--------|
| `wrangler.toml` / `.json` exists | WARN | Print path, recommend `.jsonc` migration |
| `account_id` missing in wrangler config | WARN | Print path, remind to set it |
| `compatibility_date` outdated | AUTO-FIX | Update to today's date |
| `observability` missing or disabled | WARN | Print path, show recommended config snippet |
| `APP_VERSION` missing in wrangler config | INFO | Only update if already present, don't add |

## 6. Current State Audit (Reference)

### Workers per Repo

| Repo | Workers | PM | Config Format | Notes |
|------|---------|-----|--------------|-------|
| esolia-2025 | 8 (root + 6 workers/ + 1 docs/) | pnpm | All JSONC | Cleanest setup, model to follow |
| jac-2026 | 2 (root + indexing) | yarn | All JSONC | Different account_id (JAC account) |
| nexus | 3 (root + m365-audit + archived) | pnpm | JSONC + 1 TOML (archived) | Missing account_id; stale compat dates |
| courier | 1 (root) | pnpm | JSONC | Missing account_id |
| codex | 7 (6 packages/ + 1 CI variant) | pnpm | JSONC + 1 TOML (hanawa-scheduler) | hanawa-scheduler TOML missing account_id |
| pulse | 3 (root + 2 workers/) | pnpm | JSONC + 1 scripts/ copy | Root missing account_id |
| periodic | 5 (root + 3 workers/ + 1 docs/) | pnpm | JSONC + 1 TOML (periodic-cron) | Multiple missing account_id |
| pub-cogley | 8 (6 apps/ + 2 tmp/) | pnpm | All JSONC | tmp/ configs missing account_id |
| chocho | 1 (app/) | pnpm | JSONC | Missing account_id |

### Package Manager Distribution
- **pnpm**: 8 repos (esolia-2025, nexus, courier, codex, pulse, periodic, pub-cogley, chocho)
- **yarn**: 1 repo (jac-2026)

## 8. Resolved Decisions

1. **asvs-check.ts** — NOT centralized here. `@esolia/shared-types` CLAUDE.md explicitly excludes CI/CD scripts. If TS dev tooling accumulates, create a separate `@esolia/dev-scripts` package later.

2. **QC checks** — Stay in `bump-version.sh` with `--skip-qc` and `--qc-only` flags. No separate script.

3. **CI integration** — Yes. Add reusable workflow `.github/workflows/qc-wrangler.yml` in Phase 3. Consumer repos call it on PRs.

4. **maxdepth** — Use `maxdepth 3`. Covers all known monorepo layouts (codex `packages/*/`, pub-cogley `apps/*/`). Overridable via `FIND_DEPTH` env var.

5. **Distribution model** — `sync.sh` + thin wrappers (not curl-at-runtime). Works offline, reproducible, auditable via git diff.

6. **Version tracking** — `scripts/shared/.scriptversion` records commit SHA and fetch timestamp. `sync.sh --check` compares local vs remote without updating. Useful for CI staleness warnings.

## 9. Implementation Sequence (Updated)

### Phase 1: Core scripts in esolia.github
1. Create `scripts/lib/common.sh` — shared library
2. Create `scripts/bump-version.sh` — version bump + QC checks + `--skip-qc` / `--qc-only` flags
3. Create `scripts/update-wrangler.sh` — PM-agnostic wrangler updater
4. Create `scripts/sync.sh` — fetcher with `--ref` pinning, `--check` mode, `.scriptversion` tracking
5. Test locally against esolia-2025 (pnpm) and jac-2026 (yarn)

### Phase 2: Roll out to repos
6. Run `sync.sh` in each of the 9 repos
7. Replace existing `bump-version.sh` / `update-wrangler.sh` with thin wrappers
8. Verify each repo: run `./scripts/bump-version.sh --qc-only` to validate
9. Commit changes in each repo

### Phase 3: CI + ongoing maintenance
10. Create `.github/workflows/qc-wrangler.yml` reusable workflow in this repo
11. Add workflow callers in consumer repos (runs on PRs)
12. Tag releases in esolia.github; consumer repos re-run `sync.sh` to update
13. Optionally add CI step: `sync.sh --check` warns if scripts are stale
