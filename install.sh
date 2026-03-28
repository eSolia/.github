#!/bin/bash
# ============================================================================
# Svelte 5 Linting Setup Script — Two-Layer Architecture
# ============================================================================
#
# Usage:
#   ./install.sh                     # Current directory (single SvelteKit app)
#   ./install.sh apps/web            # Specific path (monorepo)
#   ./install.sh apps/web apps/admin # Multiple paths
#   ./install.sh --tailwind          # Include Tailwind CSS prettier plugin
#   ./install.sh --no-vitest         # Skip vitest in verify chain
#   ./install.sh --org YOUR_ORG      # Specify GitHub org (default: prompts)
#   ./install.sh --help              # Show help
#
# Lint architecture:
#   1. oxlint   — fast correctness/suspicious/perf pass (~50ms)
#   2. eslint   — Svelte-specific + TypeScript rules
#   eslint-plugin-oxlint disables ESLint rules that oxlint already covers.
#
# What this does:
#   1. Installs oxlint, ESLint, Prettier, svelte-check dependencies
#   2. Creates .oxlintrc.json (fast linter config)
#   3. Creates eslint.config.js (with oxlint compat — must be last)
#   4. Creates .prettierrc (JSON) with Svelte plugin
#   5. Sets up Husky pre-commit hooks (Prettier only — fast)
#   6. Adds Svelte 5 pattern checker script
#   7. Creates GitHub Actions workflow caller
#   8. Updates package.json scripts
#
# ============================================================================

set -e

# ════════════════════════════════════════════════════════════════════════════
# Configuration
# ════════════════════════════════════════════════════════════════════════════

GITHUB_ORG="esolia"
TARGETS=()
SKIP_GH_WORKFLOW=false
FORCE_OVERWRITE=false
DRY_RUN=false
INCLUDE_TAILWIND=false
INCLUDE_VITEST=true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ════════════════════════════════════════════════════════════════════════════

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }
print_info() { echo -e "${CYAN}ℹ${NC} $1"; }

show_help() {
  cat << 'EOF'
Svelte 5 Linting Setup Script — Two-Layer Architecture

USAGE:
    install.sh [OPTIONS] [PATHS...]

PATHS:
    Paths to SvelteKit projects. If omitted, uses current directory.
    For monorepos, specify each SvelteKit app path.

OPTIONS:
    --tailwind        Include prettier-plugin-tailwindcss
    --no-vitest       Exclude test:unit from verify chain
    --org NAME        GitHub organization name (for workflow caller)
    --skip-workflow   Don't create GitHub Actions workflow
    --force           Overwrite existing config files without prompting
    --dry-run         Show what would be done without making changes
    --help            Show this help message

LINT ARCHITECTURE:
    1. oxlint   — fast correctness/suspicious/perf pass (~50ms)
    2. eslint   — Svelte-specific + TypeScript rules
    eslint-plugin-oxlint disables ESLint rules that oxlint already covers.

EXAMPLES:
    # Single SvelteKit project
    ./install.sh

    # With Tailwind CSS
    ./install.sh --tailwind

    # Monorepo with multiple apps
    ./install.sh --tailwind apps/web apps/admin packages/ui

    # Without tests (early project)
    ./install.sh --tailwind --no-vitest

    # Preview changes without applying
    ./install.sh --dry-run apps/web
EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --org)
      GITHUB_ORG="$2"
      shift 2
      ;;
    --tailwind)
      INCLUDE_TAILWIND=true
      shift
      ;;
    --no-vitest)
      INCLUDE_VITEST=false
      shift
      ;;
    --skip-workflow)
      SKIP_GH_WORKFLOW=true
      shift
      ;;
    --force)
      FORCE_OVERWRITE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      show_help
      ;;
    -*)
      print_error "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
    *)
      TARGETS+=("$1")
      shift
      ;;
  esac
done

# Default to current directory if no targets specified
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(".")

# ════════════════════════════════════════════════════════════════════════════
# Pre-flight Checks
# ════════════════════════════════════════════════════════════════════════════

print_step "Running pre-flight checks..."

# Find repo root (for GitHub workflow)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
print_info "Repository root: $REPO_ROOT"

# Detect package manager at repo root
detect_package_manager() {
  local dir="$1"
  if [ -f "$dir/pnpm-lock.yaml" ] || [ -f "$dir/pnpm-workspace.yaml" ]; then
    echo "pnpm"
  elif [ -f "$dir/yarn.lock" ]; then
    echo "yarn"
  elif [ -f "$dir/bun.lockb" ]; then
    echo "bun"
  else
    echo "npm"
  fi
}

PM=$(detect_package_manager "$REPO_ROOT")
print_success "Detected package manager: $PM"

case $PM in
  pnpm) PMX="pnpm dlx"; PMR="pnpm run"; PMI="pnpm add -D" ;;
  yarn) PMX="yarn dlx"; PMR="yarn"; PMI="yarn add -D" ;;
  bun)  PMX="bunx"; PMR="bun run"; PMI="bun add -D" ;;
  *)    PMX="npx"; PMR="npm run"; PMI="npm install -D" ;;
esac

# Show options
[ "$INCLUDE_TAILWIND" = true ] && print_info "Tailwind CSS: enabled"
[ "$INCLUDE_VITEST" = false ] && print_info "Vitest: disabled (verify will skip test:unit)"

# Prompt for GitHub org if not provided and workflow not skipped
if [ "$SKIP_GH_WORKFLOW" = false ] && [ -z "$GITHUB_ORG" ]; then
  # Try to detect from git remote
  DETECTED_ORG=$(git remote get-url origin 2>/dev/null | sed -n 's#.*github.com[:/]\([^/]*\)/.*#\1#p' || true)

  if [ -n "$DETECTED_ORG" ]; then
    echo -e "Detected GitHub org: ${BOLD}$DETECTED_ORG${NC}"
    read -p "Use this org? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      GITHUB_ORG="$DETECTED_ORG"
    fi
  fi

  if [ -z "$GITHUB_ORG" ]; then
    read -p "Enter your GitHub org/username: " GITHUB_ORG
  fi
fi

[ -n "$GITHUB_ORG" ] && print_success "GitHub org: $GITHUB_ORG"

# Validate targets
VALID_TARGETS=()
for target in "${TARGETS[@]}"; do
  if [ ! -f "$target/package.json" ]; then
    print_warning "No package.json in $target, skipping"
    continue
  fi

  if [ ! -f "$target/svelte.config.js" ] && [ ! -f "$target/svelte.config.ts" ]; then
    print_warning "No svelte.config.* in $target"
    if [ "$FORCE_OVERWRITE" = false ]; then
      read -p "  Continue anyway? (y/N) " -n 1 -r
      echo
      [[ ! $REPLY =~ ^[Yy]$ ]] && continue
    fi
  fi

  VALID_TARGETS+=("$target")
done

if [ ${#VALID_TARGETS[@]} -eq 0 ]; then
  print_error "No valid SvelteKit projects found"
  exit 1
fi

print_success "Found ${#VALID_TARGETS[@]} SvelteKit project(s)"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

# ════════════════════════════════════════════════════════════════════════════
# Config File Handlers
# ════════════════════════════════════════════════════════════════════════════

# Check for existing Prettier config
check_prettier_config() {
  local dir="$1"
  local configs=(".prettierrc" ".prettierrc.json" ".prettierrc.js" ".prettierrc.cjs" ".prettierrc.mjs" "prettier.config.js" "prettier.config.cjs" "prettier.config.mjs")

  for config in "${configs[@]}"; do
    if [ -f "$dir/$config" ]; then
      echo "$config"
      return 0
    fi
  done

  # Check package.json for prettier key
  if [ -f "$dir/package.json" ] && grep -q '"prettier"' "$dir/package.json"; then
    echo "package.json"
    return 0
  fi

  return 1
}

# Check for existing ESLint config
check_eslint_config() {
  local dir="$1"
  local configs=(".eslintrc" ".eslintrc.json" ".eslintrc.js" ".eslintrc.cjs" ".eslintrc.mjs" "eslint.config.js" "eslint.config.cjs" "eslint.config.mjs")

  for config in "${configs[@]}"; do
    if [ -f "$dir/$config" ]; then
      echo "$config"
      return 0
    fi
  done

  return 1
}

# Check for existing oxlint config
check_oxlint_config() {
  local dir="$1"
  local configs=(".oxlintrc.json" "oxlintrc.json")

  for config in "${configs[@]}"; do
    if [ -f "$dir/$config" ]; then
      echo "$config"
      return 0
    fi
  done

  return 1
}

# ════════════════════════════════════════════════════════════════════════════
# Install Dependencies (at appropriate level)
# ════════════════════════════════════════════════════════════════════════════

install_deps() {
  local dir="$1"

  print_step "Installing dependencies in $dir..."

  DEV_DEPS=(
    "eslint"
    "@eslint/js"
    "typescript-eslint"
    "eslint-plugin-svelte"
    "eslint-plugin-oxlint"
    "globals"
    "oxlint"
    "prettier"
    "prettier-plugin-svelte"
    "svelte-check"
    "husky"
    "lint-staged"
  )

  if [ "$INCLUDE_TAILWIND" = true ]; then
    DEV_DEPS+=("prettier-plugin-tailwindcss")
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "  Would install: ${DEV_DEPS[*]}"
    return
  fi

  pushd "$dir" > /dev/null
  $PMI "${DEV_DEPS[@]}" 2>/dev/null || {
    print_warning "Some packages may already be installed"
  }
  popd > /dev/null

  print_success "Dependencies installed"
}

# ════════════════════════════════════════════════════════════════════════════
# Create/Update Config Files
# ════════════════════════════════════════════════════════════════════════════

create_oxlint_config() {
  local dir="$1"
  local existing=$(check_oxlint_config "$dir" || true)

  if [ -n "$existing" ]; then
    print_warning "Found existing oxlint config: $existing"

    if [ "$FORCE_OVERWRITE" = false ]; then
      read -p "  Overwrite with standard config? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Keeping existing oxlint config"
        return
      fi
    fi

    # Backup existing
    [ "$DRY_RUN" = false ] && mv "$dir/$existing" "$dir/$existing.backup"
    print_info "Backed up to $existing.backup"
  fi

  print_step "Creating .oxlintrc.json..."

  [ "$DRY_RUN" = true ] && { echo "  Would create: $dir/.oxlintrc.json"; return; }

  cat > "$dir/.oxlintrc.json" << 'OXLINT_CONFIG'
{
  "$schema": "https://raw.githubusercontent.com/nicolo-ribaudo/oxlint-config-schema/main/schema.json",
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "plugins": ["typescript", "import", "unicorn", "promise"],
  "rules": {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "import/no-unused-modules": "off",
    "no-console": "off",
    "no-await-in-loop": "off",
    "no-control-regex": "off",
    "no-debugger": "error",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "promise/no-nesting": "warn",
    "promise/no-return-wrap": "error",
    "unicorn/no-array-for-each": "warn",
    "unicorn/no-empty-file": "off",
    "unicorn/prefer-node-protocol": "error",
    "import/no-unassigned-import": "off"
  },
  "ignorePatterns": [
    "build/",
    ".svelte-kit/",
    "dist/",
    "node_modules/",
    ".wrangler/",
    "scripts/",
    "docs/",
    "**/*.d.ts",
    "**/*.config.js",
    "**/*.config.ts"
  ],
  "overrides": [
    {
      "files": ["*.svelte"],
      "rules": {
        "no-undef": "off",
        "prefer-const": "off"
      }
    }
  ]
}
OXLINT_CONFIG

  print_success "Created .oxlintrc.json"
}

create_eslint_config() {
  local dir="$1"
  local existing=$(check_eslint_config "$dir" || true)

  if [ -n "$existing" ]; then
    print_warning "Found existing ESLint config: $existing"

    if [ "$FORCE_OVERWRITE" = false ]; then
      read -p "  Overwrite with standard config? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Keeping existing ESLint config"
        print_info "Ensure eslint-plugin-oxlint is LAST in your config"
        return
      fi
    fi

    # Backup existing
    [ "$DRY_RUN" = false ] && mv "$dir/$existing" "$dir/$existing.backup"
    print_info "Backed up to $existing.backup"
  fi

  print_step "Creating eslint.config.js..."

  [ "$DRY_RUN" = true ] && { echo "  Would create: $dir/eslint.config.js"; return; }

  cat > "$dir/eslint.config.js" << 'ESLINT_CONFIG'
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import oxlint from 'eslint-plugin-oxlint';

export default ts.config(
  // Base configs
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],

  // Global settings
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ]
    }
  },

  // Svelte file handling
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },

  // Server-only files: no browser globals
  {
    files: ['**/*.server.ts', '**/server/**/*.ts', '**/hooks.*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage']
    }
  },

  // Test files: relax some rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  // Ignores
  {
    ignores: ['build/', '.svelte-kit/', 'dist/', 'node_modules/', '.wrangler/', 'scripts/', 'docs/']
  },

  // Oxlint compat: MUST be last — disables rules oxlint already handles
  oxlint.configs['flat/recommended']
);
ESLINT_CONFIG

  print_success "Created eslint.config.js"
}

create_prettier_config() {
  local dir="$1"
  local existing=$(check_prettier_config "$dir" || true)

  if [ -n "$existing" ]; then
    print_warning "Found existing Prettier config: $existing"

    if [ "$FORCE_OVERWRITE" = false ]; then
      read -p "  Overwrite with standard config? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Keeping existing Prettier config"
        print_info "Ensure 'prettier-plugin-svelte' is in your plugins"
        [ "$INCLUDE_TAILWIND" = true ] && print_info "Ensure 'prettier-plugin-tailwindcss' is LAST in plugins"
        return
      fi
    fi

    [ "$DRY_RUN" = false ] && mv "$dir/$existing" "$dir/$existing.backup"
    print_info "Backed up to $existing.backup"
  fi

  print_step "Creating .prettierrc..."

  [ "$DRY_RUN" = true ] && {
    echo "  Would create: $dir/.prettierrc"
    [ "$INCLUDE_TAILWIND" = true ] && echo "  (with prettier-plugin-tailwindcss)"
    return
  }

  # Build plugins array — tailwind must be last
  local plugins='"prettier-plugin-svelte"'
  if [ "$INCLUDE_TAILWIND" = true ]; then
    plugins="$plugins, \"prettier-plugin-tailwindcss\""
  fi

  # Use variable expansion (non-quoted heredoc delimiter)
  cat > "$dir/.prettierrc" << PRETTIER_CONFIG
{
  "useTabs": false,
  "tabWidth": 2,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "semi": true,
  "plugins": [${plugins}],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
PRETTIER_CONFIG

  cat > "$dir/.prettierignore" << 'PRETTIER_IGNORE'
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lockb
.svelte-kit
build
dist
node_modules
*.min.js
PRETTIER_IGNORE

  if [ "$INCLUDE_TAILWIND" = true ]; then
    print_success "Created .prettierrc (with Tailwind) and .prettierignore"
  else
    print_success "Created .prettierrc and .prettierignore"
  fi
}

create_svelte5_checker() {
  local dir="$1"

  print_step "Creating Svelte 5 pattern checker..."

  [ "$DRY_RUN" = true ] && { echo "  Would create: $dir/scripts/check-svelte5.sh"; return; }

  mkdir -p "$dir/scripts"

  cat > "$dir/scripts/check-svelte5.sh" << 'SVELTE5_CHECK'
#!/bin/bash
# Svelte 5 Pattern Checker - Detects legacy Svelte 3/4 patterns

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0
SRC_DIR="${1:-src}"

echo "Checking for legacy Svelte 3/4 patterns in $SRC_DIR..."
echo ""

check_pattern() {
  local pattern="$1" message="$2" fix="$3"
  local results=$(grep -rn "$pattern" --include="*.svelte" "$SRC_DIR" 2>/dev/null | head -5 || true)

  if [ -n "$results" ]; then
    echo -e "${RED}  $message${NC}"
    echo -e "   Fix: $fix"
    echo "$results" | sed 's/^/   /'
    [ $(grep -rn "$pattern" --include="*.svelte" "$SRC_DIR" 2>/dev/null | wc -l) -gt 5 ] && echo "   ... and more"
    echo ""
    ERRORS=$((ERRORS + 1))
  fi
}

check_pattern "export let " "Found 'export let' (legacy props)" "Use 'let { prop } = \$props()'"
check_pattern "^\s*\$:" "Found '\$:' reactive statements" "Use '\$derived()' or '\$effect()'"
check_pattern " on:[a-z].*=" "Found 'on:event' syntax" "Use 'onevent={handler}' (onclick, oninput, etc.)"
check_pattern "<slot" "Found '<slot>' elements" "Use '{@render children()}' with snippets"
check_pattern "createEventDispatcher" "Found 'createEventDispatcher'" "Use callback props"

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}  No legacy Svelte patterns detected${NC}"
  exit 0
else
  echo -e "${RED}Found $ERRORS legacy pattern type(s)${NC}"
  echo "Migration guide: https://svelte.dev/docs/svelte/v5-migration-guide"
  exit 1
fi
SVELTE5_CHECK

  chmod +x "$dir/scripts/check-svelte5.sh"
  print_success "Created scripts/check-svelte5.sh"
}

create_vscode_settings() {
  local dir="$1"

  print_step "Creating VS Code settings..."

  [ "$DRY_RUN" = true ] && { echo "  Would create: $dir/.vscode/settings.json"; return; }

  mkdir -p "$dir/.vscode"

  # Don't overwrite if exists, merge would be complex
  if [ -f "$dir/.vscode/settings.json" ]; then
    print_warning "VS Code settings already exist, skipping"
    return
  fi

  cat > "$dir/.vscode/settings.json" << 'VSCODE_SETTINGS'
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" },
  "eslint.validate": ["javascript", "typescript", "svelte"],
  "eslint.useFlatConfig": true,
  "svelte.enable-ts-plugin": true,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" }
}
VSCODE_SETTINGS

  cat > "$dir/.vscode/extensions.json" << 'VSCODE_EXT'
{
  "recommendations": [
    "svelte.svelte-vscode",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "nicolo-ribaudo.vscode-oxlint"
  ]
}
VSCODE_EXT

  print_success "Created .vscode/settings.json and extensions.json"
}

update_package_json() {
  local dir="$1"

  print_step "Updating package.json scripts..."

  [ "$DRY_RUN" = true ] && { echo "  Would update: $dir/package.json"; return; }

  # Pass options as environment variables to the node script
  INCLUDE_VITEST_VAL="$INCLUDE_VITEST" PMR_VAL="$PMR" node << 'UPDATE_PKG'
const fs = require('fs');
const dir = process.argv[1] || '.';
const pkgPath = dir + '/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const includeVitest = process.env.INCLUDE_VITEST_VAL === 'true';
const pmr = process.env.PMR_VAL || 'npm run';

pkg.scripts = pkg.scripts || {};

// Only add if not already present (don't override custom scripts)
const defaults = {
  "lint": "oxlint --config .oxlintrc.json && eslint .",
  "lint:fix": "oxlint --fix --config .oxlintrc.json && eslint --fix .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "svelte5:check": "./scripts/check-svelte5.sh",
  "prepare": "husky"
};

// Verify chain depends on --no-vitest flag
if (includeVitest) {
  defaults["verify"] = pmr + " lint && " + pmr + " check && " + pmr + " test:unit";
} else {
  defaults["verify"] = pmr + " lint && " + pmr + " check";
}

for (const [key, value] of Object.entries(defaults)) {
  if (!pkg.scripts[key]) {
    pkg.scripts[key] = value;
  }
}

// Lint-staged: Prettier only (fast) — ESLint runs in verify/CI
pkg['lint-staged'] = {
  "*.{js,ts,svelte,json,md,css,html,yaml,yml}": "prettier --write"
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
UPDATE_PKG

  print_success "Updated package.json"
}

# ════════════════════════════════════════════════════════════════════════════
# Setup Husky (at repo root)
# ════════════════════════════════════════════════════════════════════════════

setup_husky() {
  print_step "Setting up Husky pre-commit hooks..."

  [ "$DRY_RUN" = true ] && { echo "  Would create: $REPO_ROOT/.husky/pre-commit"; return; }

  pushd "$REPO_ROOT" > /dev/null

  # Ensure husky directory exists
  mkdir -p .husky

  # Pre-commit hook: run lint-staged (Prettier only — fast)
  echo "npx lint-staged" > .husky/pre-commit
  chmod +x .husky/pre-commit

  popd > /dev/null

  print_success "Created .husky/pre-commit (runs lint-staged / Prettier only)"
}

# ════════════════════════════════════════════════════════════════════════════
# Create GitHub Workflow
# ════════════════════════════════════════════════════════════════════════════

create_github_workflow() {
  if [ "$SKIP_GH_WORKFLOW" = true ]; then
    print_info "Skipping GitHub workflow creation (--skip-workflow)"
    return
  fi

  print_step "Creating GitHub Actions workflow..."

  local workflow_dir="$REPO_ROOT/.github/workflows"
  local workflow_file="$workflow_dir/lint.yml"

  [ "$DRY_RUN" = true ] && { echo "  Would create: $workflow_file"; return; }

  mkdir -p "$workflow_dir"

  if [ -f "$workflow_file" ]; then
    print_warning "Workflow already exists: $workflow_file"
    if [ "$FORCE_OVERWRITE" = false ]; then
      read -p "  Overwrite? (y/N) " -n 1 -r
      echo
      [[ ! $REPLY =~ ^[Yy]$ ]] && return
    fi
  fi

  # Build paths string
  PATHS_STR=""
  for target in "${VALID_TARGETS[@]}"; do
    [ -n "$PATHS_STR" ] && PATHS_STR+=","
    PATHS_STR+="$target"
  done

  cat > "$workflow_file" << WORKFLOW
# ============================================================================
# Svelte 5 Lint Workflow (two-layer: oxlint + ESLint)
# Generated by install.sh
# ============================================================================

name: Lint

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    uses: ${GITHUB_ORG}/.github/.github/workflows/svelte-lint.yml@main
    with:
      node-version: '20'
      package-manager: '${PM}'
      sveltekit-paths: '${PATHS_STR}'
WORKFLOW

  print_success "Created $workflow_file"
  print_info "Workflow calls: ${GITHUB_ORG}/.github/.github/workflows/svelte-lint.yml"
}

# ════════════════════════════════════════════════════════════════════════════
# Main Execution
# ════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              Svelte 5 Linting Setup (oxlint + ESLint)                  ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Process each target
for target in "${VALID_TARGETS[@]}"; do
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  Setting up: $target${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  install_deps "$target"
  create_oxlint_config "$target"
  create_eslint_config "$target"
  create_prettier_config "$target"
  create_svelte5_checker "$target"
  create_vscode_settings "$target"
  update_package_json "$target"
done

# Repo-level setup
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Repository-level setup${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

setup_husky
create_github_workflow

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Setup Complete!                                           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Configured projects:"
for target in "${VALID_TARGETS[@]}"; do
  echo "  $target"
done
echo ""
echo "Lint architecture:"
echo "  1. oxlint    fast correctness/suspicious/perf pass"
echo "  2. eslint    Svelte-specific + TypeScript rules"
echo "  eslint-plugin-oxlint disables rules oxlint already covers"
echo ""
echo "Available commands (in each project):"
echo "  $PMR lint           # Oxlint (fast) then ESLint"
echo "  $PMR lint:fix       # Auto-fix with both"
echo "  $PMR format         # Format with Prettier"
echo "  $PMR check          # svelte-check (types)"
echo "  $PMR svelte5:check  # Check for legacy patterns"
if [ "$INCLUDE_VITEST" = true ]; then
  echo "  $PMR verify         # lint + check + test:unit"
else
  echo "  $PMR verify         # lint + check (no tests)"
fi
echo ""
echo "Pre-commit hook:"
echo "  Runs Prettier via lint-staged (fast)"
echo "  Full lint + svelte5 check runs in CI/verify"
echo ""
if [ "$SKIP_GH_WORKFLOW" = false ]; then
  echo "GitHub Actions:"
  echo "  Workflow created at .github/workflows/lint.yml"
  echo "  Calls reusable workflow from ${GITHUB_ORG}/.github"
  echo ""
  echo -e "${YELLOW}  Make sure the reusable workflow exists at:${NC}"
  echo "  ${GITHUB_ORG}/.github/.github/workflows/svelte-lint.yml"
  echo ""
fi
echo -e "${CYAN}Next step:${NC} Run '$PMR verify' to check current state"
echo ""
