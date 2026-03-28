# Svelte 5 Linting (Org-Wide) — Two-Layer Architecture

Consistent Svelte 5 linting across all repositories in this organization using a two-layer architecture: **oxlint** (fast correctness pass) then **ESLint** (Svelte-specific + TypeScript rules).

## Quick Start

Run this in any SvelteKit project:

```bash
# Single project
curl -fsSL https://raw.githubusercontent.com/esolia/.github/main/install.sh | bash

# With Tailwind CSS
curl -fsSL https://raw.githubusercontent.com/esolia/.github/main/install.sh | bash -s -- --tailwind

# Monorepo with multiple apps
curl -fsSL https://raw.githubusercontent.com/esolia/.github/main/install.sh | bash -s -- --tailwind apps/web apps/admin

# Without tests (early project)
curl -fsSL https://raw.githubusercontent.com/esolia/.github/main/install.sh | bash -s -- --tailwind --no-vitest
```

Or clone and run locally:

```bash
git clone https://github.com/esolia.github.git org-github
./org-github/install.sh --tailwind apps/web apps/admin
```

## Lint Architecture

```
oxlint (~50ms)              eslint (~2s)
┌──────────────────┐       ┌──────────────────┐
│ correctness: err │  →→→  │ Svelte rules     │
│ suspicious: warn │       │ TypeScript rules  │
│ perf: warn       │       │ Server-only rules │
│ + typescript     │       │                    │
│ + import         │       │ eslint-plugin-     │
│ + unicorn        │       │ oxlint (last)     │
│ + promise        │       │ disables overlap  │
└──────────────────┘       └──────────────────┘
```

`eslint-plugin-oxlint` must be the **last** entry in `eslint.config.js` — it disables ESLint rules that oxlint already handles, avoiding duplicate work.

## What Gets Installed

### Per Project
```
your-project/
├── .oxlintrc.json            ← Oxlint config (fast pass)
├── eslint.config.js          ← ESLint + oxlint compat (must be last)
├── .prettierrc               ← Prettier + Svelte plugin (+ Tailwind if --tailwind)
├── .prettierignore
├── scripts/
│   └── check-svelte5.sh      ← Legacy pattern detector
└── .vscode/
    ├── settings.json
    └── extensions.json
```

### At Repo Root
```
your-repo/
├── .husky/
│   └── pre-commit            ← Runs lint-staged (Prettier only — fast)
└── .github/workflows/
    └── lint.yml              ← Calls reusable workflow
```

## CLI Options

```
./install.sh [OPTIONS] [PATHS...]

Options:
  --tailwind        Include prettier-plugin-tailwindcss (must be last plugin)
  --no-vitest       Exclude test:unit from verify chain
  --org NAME        GitHub org (auto-detected from git remote)
  --skip-workflow   Don't create GitHub Actions workflow
  --force           Overwrite existing configs without prompting
  --dry-run         Preview changes without applying
  --help            Show help
```

## Package.json Scripts

The install script adds these scripts (won't override existing ones):

| Script | Command | Purpose |
|--------|---------|---------|
| `lint` | `oxlint --config .oxlintrc.json && eslint .` | Two-layer lint |
| `lint:fix` | `oxlint --fix ... && eslint --fix .` | Auto-fix with both |
| `format` | `prettier --write .` | Format all files |
| `check` | `svelte-kit sync && svelte-check ...` | Type checking |
| `verify` | `lint && check && test:unit` | Full verification chain |
| `svelte5:check` | `./scripts/check-svelte5.sh` | Legacy pattern detection |
| `prepare` | `husky` | Git hooks setup |

## Reusable Workflow

The install script creates a caller workflow that references:

```yaml
uses: esolia/.github/.github/workflows/svelte-lint.yml@main
```

### Workflow Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `node-version` | `'20'` | Node.js version |
| `package-manager` | `'npm'` | `npm`, `pnpm`, `yarn`, or `bun` |
| `sveltekit-paths` | auto-detect | Comma-separated paths to SvelteKit projects |
| `skip-svelte5-check` | `false` | Skip legacy pattern detection |
| `fail-on-warnings` | `false` | Treat warnings as errors |
| `install-command` | `''` | Custom install command override |

### Manual Workflow Setup

If you prefer to create the workflow manually:

```yaml
# .github/workflows/lint.yml
name: Lint

on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint:
    uses: YOUR_ORG/.github/.github/workflows/svelte-lint.yml@main
    with:
      package-manager: 'pnpm'
      sveltekit-paths: 'apps/web,apps/admin'
```

## Handling Existing Configs

The install script detects existing configurations:

| Scenario | Behavior |
|----------|----------|
| Existing `.oxlintrc.json` | Prompts to overwrite or skip (adds backup) |
| Existing `.prettierrc` | Prompts to overwrite or skip (adds backup) |
| Existing `eslint.config.js` | Prompts to overwrite or skip (adds backup) |
| Existing `.vscode/settings.json` | Skips (manual merge needed) |
| Existing `.github/workflows/lint.yml` | Prompts to overwrite |

Use `--force` to overwrite without prompting.

## What Gets Checked

### Oxlint (fast pass)

| Category | Level | What it catches |
|----------|-------|-----------------|
| `correctness` | error | Bugs, unreachable code, invalid regex |
| `suspicious` | warn | Likely mistakes, confusing constructs |
| `perf` | warn | Performance anti-patterns |

Plugins: `typescript`, `import`, `unicorn`, `promise`

### ESLint (second pass)

| Category | Rules |
|----------|-------|
| **Security** | `svelte/no-at-html-tags`, server-only `no-restricted-globals` |
| **Svelte** | Flat recommended config for Svelte 5 |
| **TypeScript** | Recommended rules via `typescript-eslint` |

### Svelte 5 Pattern Detection

Blocks commits/PRs containing:

| Legacy Pattern | Required Update |
|----------------|-----------------|
| `export let prop` | `let { prop } = $props()` |
| `$: derived = x * 2` | `let derived = $derived(x * 2)` |
| `on:click={handler}` | `onclick={handler}` |
| `<slot />` | `{@render children()}` |
| `createEventDispatcher()` | Callback props |

## Pre-commit Hook

The pre-commit hook runs **Prettier only** via `lint-staged` — this keeps commits fast. Full linting (oxlint + ESLint + svelte-check) runs in `verify` and CI.

## Monorepo Support

The system handles monorepos automatically:

```bash
# Specify each SvelteKit project
./install.sh --tailwind apps/web apps/admin packages/ui

# Or let CI auto-detect (finds all svelte.config.* files)
# In workflow, omit sveltekit-paths input
```

The CI workflow runs linting in parallel for each detected project.

## Troubleshooting

### "Permission denied" on install.sh
```bash
chmod +x install.sh
./install.sh
```

### Workflow not triggering
Ensure the reusable workflow file exists at:
```
YOUR_ORG/.github/.github/workflows/svelte-lint.yml
```

And that the `.github` repo's Actions settings allow access from other repos:
```
Settings → Actions → General → Access → Accessible from repositories in YOUR_ORG
```

### ESLint errors about oxlint
`eslint-plugin-oxlint` **must be last** in `eslint.config.js`. If you see duplicate rule errors, check the config order.

## Files in This Repo

```
.github/
├── profile/
│   └── README.md                    ← Org profile
├── .github/workflows/
│   └── svelte-lint.yml              ← Reusable workflow
├── install.sh                       ← Setup script
└── svelte-lint-README.md            ← This file
```
