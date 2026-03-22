#!/usr/bin/env -S npx tsx
// sync.ts - Cross-platform sync from eSolia/.github
//
// Usage:
//   npx tsx scripts/sync.ts                # Sync everything
//   npx tsx scripts/sync.ts --check        # Check if scripts are up-to-date
//   npx tsx scripts/sync.ts --ref v1.0.0   # Pin to a specific tag/SHA
//   npx tsx scripts/sync.ts --scripts-only # Only sync scripts (skip commands/rules)
//
// Also works with Deno:
//   deno run --allow-read --allow-write --allow-net --allow-run scripts/sync.ts
//
// Downloads centralized scripts into scripts/shared/, shared Claude commands
// into .claude/commands/, and shared rules into .claude/rules/.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

// ════════════════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════════════════

const REPO_OWNER = "eSolia";
const REPO_NAME = ".github";
const DEFAULT_REF = "main";

interface SyncEntry {
  src: string;
  dest: string;
}

const SYNC_SCRIPTS: SyncEntry[] = [
  { src: "scripts/lib/common.sh", dest: "lib/common.sh" },
  { src: "scripts/bump-version.sh", dest: "bump-version.sh" },
  { src: "scripts/update-wrangler.sh", dest: "update-wrangler.sh" },
  { src: "scripts/audit-backpressure.sh", dest: "audit-backpressure.sh" },
  { src: "scripts/sync.sh", dest: "sync.sh" },
  { src: "scripts/sync.ts", dest: "sync.ts" },
  { src: "scripts/submit-bing.mts", dest: "submit-bing.mts" },
  { src: "scripts/cross-post-devto.mts", dest: "cross-post-devto.mts" },
  { src: "scripts/cross-post-qiita.mts", dest: "cross-post-qiita.mts" },
];

const SYNC_COMMANDS: SyncEntry[] = [
  {
    src: ".claude/shared-commands/backpressure-review.md",
    dest: "backpressure-review.md",
  },
  { src: ".claude/shared-commands/seo-setup.md", dest: "seo-setup.md" },
  { src: ".claude/shared-commands/seo-report.md", dest: "seo-report.md" },
  { src: ".claude/shared-commands/checkpoint.md", dest: "checkpoint.md" },
  { src: ".claude/shared-commands/commit-style.md", dest: "commit-style.md" },
  { src: ".claude/shared-commands/dev/d1-health.md", dest: "dev/d1-health.md" },
  { src: ".claude/shared-commands/dev/preflight.md", dest: "dev/preflight.md" },
  {
    src: ".claude/shared-commands/dev/svelte-review.md",
    dest: "dev/svelte-review.md",
  },
  {
    src: ".claude/shared-commands/security/audit-github-actions.md",
    dest: "security/audit-github-actions.md",
  },
  {
    src: ".claude/shared-commands/security/harden-github-org.md",
    dest: "security/harden-github-org.md",
  },
  {
    src: ".claude/shared-commands/standards/check.md",
    dest: "standards/check.md",
  },
  {
    src: ".claude/shared-commands/standards/list.md",
    dest: "standards/list.md",
  },
  {
    src: ".claude/shared-commands/standards/search.md",
    dest: "standards/search.md",
  },
  {
    src: ".claude/shared-commands/standards/writing.md",
    dest: "standards/writing.md",
  },
];

const SYNC_RULES: SyncEntry[] = [
  {
    src: ".claude/shared-rules/backpressure-verify.md",
    dest: "backpressure-verify.md",
  },
  { src: ".claude/shared-rules/d1-maintenance.md", dest: "d1-maintenance.md" },
  {
    src: ".claude/shared-rules/mermaid-diagrams.md",
    dest: "mermaid-diagrams.md",
  },
];

const WRAPPER_SCRIPTS = [
  "bump-version.sh",
  "update-wrangler.sh",
  "audit-backpressure.sh",
];

// ════════════════════════════════════════════════════════════════════════════
// Output helpers
// ════════════════════════════════════════════════════════════════════════════

const isWindows = process.platform === "win32";

const color = {
  red: (s: string) => (isWindows ? s : `\x1b[0;31m${s}\x1b[0m`),
  green: (s: string) => (isWindows ? s : `\x1b[0;32m${s}\x1b[0m`),
  yellow: (s: string) => (isWindows ? s : `\x1b[1;33m${s}\x1b[0m`),
  blue: (s: string) => (isWindows ? s : `\x1b[0;34m${s}\x1b[0m`),
  cyan: (s: string) => (isWindows ? s : `\x1b[0;36m${s}\x1b[0m`),
  bold: (s: string) => (isWindows ? s : `\x1b[1m${s}\x1b[0m`),
};

const step = (msg: string) => console.log(color.blue("==>") + " " + msg);
const success = (msg: string) => console.log(color.green("  ✓") + " " + msg);
const warning = (msg: string) => console.log(color.yellow("  ⚠") + " " + msg);
const error = (msg: string) => console.log(color.red("  ✗") + " " + msg);
const info = (msg: string) => console.log(color.cyan("  ℹ") + " " + msg);

// ════════════════════════════════════════════════════════════════════════════
// Parse arguments
// ════════════════════════════════════════════════════════════════════════════

let ref = DEFAULT_REF;
let checkOnly = false;
let scriptsOnly = false;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--ref":
      ref = args[++i];
      break;
    case "--check":
      checkOnly = true;
      break;
    case "--scripts-only":
      scriptsOnly = true;
      break;
    case "--help":
    case "-h":
      console.log(
        "Usage: sync.ts [--ref <tag-or-sha>] [--check] [--scripts-only]",
      );
      console.log("");
      console.log("Options:");
      console.log("  --ref <ref>      Git ref to fetch from (default: main)");
      console.log(
        "  --check          Check if local scripts match remote (exit 1 if stale)",
      );
      console.log(
        "  --scripts-only   Only sync scripts (skip commands and rules)",
      );
      console.log("  --help           Show this help");
      process.exit(0);
    default:
      error(`Unknown option: ${args[i]}`);
      process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Find project root
// ════════════════════════════════════════════════════════════════════════════

function findProjectRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" })
      .trim();
  } catch {
    return process.cwd();
  }
}

const PROJECT_ROOT = findProjectRoot();
const SHARED_DIR = join(PROJECT_ROOT, "scripts", "shared");
const SCRIPTVERSION_FILE = join(SHARED_DIR, ".scriptversion");

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════

function getRemoteCommit(gitRef: string): string {
  try {
    const output = execSync(
      `git ls-remote "https://github.com/${REPO_OWNER}/${REPO_NAME}.git" "${gitRef}"`,
      { encoding: "utf-8" },
    );
    const match = output.match(/^([0-9a-f]+)/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

async function downloadFile(url: string, targetPath: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const content = await response.text();
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
    // Make .sh files executable on non-Windows
    if (!isWindows && targetPath.endsWith(".sh")) {
      chmodSync(targetPath, 0o755);
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadFiles(
  entries: SyncEntry[],
  targetDir: string,
): Promise<void> {
  const baseUrl =
    `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}`;
  for (const entry of entries) {
    const url = `${baseUrl}/${entry.src}`;
    const target = join(targetDir, entry.dest);
    if (await downloadFile(url, target)) {
      success(entry.dest);
    } else {
      error(`Failed to download ${entry.src}`);
      process.exit(1);
    }
  }
}

function createWrapper(name: string, scriptsDir: string): void {
  const wrapperPath = join(scriptsDir, name);

  if (existsSync(wrapperPath)) {
    const content = readFileSync(wrapperPath, "utf-8");
    if (content.includes("shared/")) {
      info(`${name} wrapper already exists`);
      return;
    }
    // Back up existing non-wrapper script
    const backupPath = `${wrapperPath}.local-backup`;
    writeFileSync(backupPath, content);
    warning(`Backed up existing ${name} to ${name}.local-backup`);
  }

  // Write platform-appropriate wrapper
  if (isWindows) {
    // Create a .cmd wrapper for Windows
    const cmdPath = wrapperPath.replace(/\.sh$/, ".cmd");
    const cmdContent =
      `@echo off\r\nREM Wrapper — delegates to centralized script from esolia.github\r\nREM To update: npx tsx scripts/shared/sync.ts\r\nset "SCRIPT_DIR=%~dp0"\r\nbash "%SCRIPT_DIR%shared\\${name}" %*\r\n`;
    writeFileSync(cmdPath, cmdContent);
    success(`Created wrapper: scripts/${name.replace(/\.sh$/, ".cmd")}`);
  }

  // Always create the bash wrapper (works on all platforms including WSL/Git Bash on Windows)
  const bashContent = `#!/bin/bash
# Wrapper — delegates to centralized script from esolia.github
# To update: ./scripts/shared/sync.sh
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/shared/${name}" "$@"
`;
  writeFileSync(wrapperPath, bashContent);
  if (!isWindows) {
    chmodSync(wrapperPath, 0o755);
  }
  success(`Created wrapper: scripts/${name}`);
}

function addToGitignore(): void {
  const gitignorePath = join(PROJECT_ROOT, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes("scripts/shared/")) {
      step("Adding scripts/shared/ to .gitignore");
      const addition =
        "\n# Centralized scripts fetched from esolia.github\nscripts/shared/\n";
      writeFileSync(gitignorePath, content + addition);
      success("Updated .gitignore");
      console.log();
    }
  } else {
    info("No .gitignore found — consider adding scripts/shared/ to it");
    console.log();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Check mode
// ════════════════════════════════════════════════════════════════════════════

if (checkOnly) {
  if (!existsSync(SCRIPTVERSION_FILE)) {
    error("No .scriptversion found — scripts have never been synced");
    process.exit(1);
  }

  const versionContent = readFileSync(SCRIPTVERSION_FILE, "utf-8");
  const localCommit = versionContent.match(/^commit=(.+)$/m)?.[1] ?? "unknown";
  const localRef = versionContent.match(/^ref=(.+)$/m)?.[1] ?? DEFAULT_REF;
  const localFetched = versionContent.match(/^fetched=(.+)$/m)?.[1] ??
    "unknown";

  info(`Local: commit=${localCommit} ref=${localRef} fetched=${localFetched}`);

  const remoteCommit = getRemoteCommit(localRef);
  if (remoteCommit === "unknown") {
    warning("Could not fetch remote HEAD (network issue?)");
    process.exit(1);
  }

  info(`Remote: commit=${remoteCommit} ref=${localRef}`);

  if (localCommit === remoteCommit) {
    success("Scripts are up-to-date");
    process.exit(0);
  } else {
    warning("Scripts are stale — run sync to update");
    process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Sync mode
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log();
  console.log(
    color.bold(
      "╔══════════════════════════════════════════════════════════════╗",
    ),
  );
  console.log(
    color.bold(
      "║  Sync from eSolia/.github                                  ║",
    ),
  );
  console.log(
    color.bold(
      "╚══════════════════════════════════════════════════════════════╝",
    ),
  );
  console.log();
  info(`Source: ${REPO_OWNER}/${REPO_NAME}@${ref}`);
  info(`Target: ${PROJECT_ROOT}`);
  console.log();

  // 1. Sync scripts
  mkdirSync(join(SHARED_DIR, "lib"), { recursive: true });
  step("Downloading scripts");
  await downloadFiles(SYNC_SCRIPTS, SHARED_DIR);
  console.log();

  // 2. Sync commands and rules (unless --scripts-only)
  if (!scriptsOnly) {
    const commandsDir = join(PROJECT_ROOT, ".claude", "commands");
    const rulesDir = join(PROJECT_ROOT, ".claude", "rules");

    if (SYNC_COMMANDS.length > 0) {
      mkdirSync(commandsDir, { recursive: true });
      step("Syncing shared commands to .claude/commands/");
      await downloadFiles(SYNC_COMMANDS, commandsDir);
      console.log();
    }

    if (SYNC_RULES.length > 0) {
      mkdirSync(rulesDir, { recursive: true });
      step("Syncing shared rules to .claude/rules/");
      await downloadFiles(SYNC_RULES, rulesDir);
      console.log();
    }
  }

  // 3. Write .scriptversion
  const remoteCommit = getRemoteCommit(ref);
  const fetchTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  writeFileSync(
    SCRIPTVERSION_FILE,
    `commit=${remoteCommit}\nfetched=${fetchTime}\nref=${ref}\n`,
  );
  success(`Wrote .scriptversion (commit=${remoteCommit.slice(0, 12)})`);
  console.log();

  // 4. Create wrappers
  const scriptsDir = join(PROJECT_ROOT, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  step("Setting up wrappers");
  for (const name of WRAPPER_SCRIPTS) {
    createWrapper(name, scriptsDir);
  }
  console.log();

  // 5. Update .gitignore
  addToGitignore();

  // 6. Summary
  console.log(
    color.bold(
      "── Sync Complete ──────────────────────────────────────────────",
    ),
  );
  console.log();
  console.log(`  Synced from: ${REPO_OWNER}/${REPO_NAME}@${ref}`);
  console.log(`  Commit: ${remoteCommit.slice(0, 12)}`);
  console.log();
  console.log("  Scripts:");
  console.log("    ./scripts/bump-version.sh <version>   # Bump version + QC");
  console.log("    ./scripts/bump-version.sh --qc-only   # QC checks only");
  console.log("    ./scripts/update-wrangler.sh           # Update wrangler");
  console.log(
    "    ./scripts/audit-backpressure.sh        # Backpressure audit",
  );
  console.log(
    "    npx tsx scripts/shared/submit-bing.mts  # Bing URL submission",
  );
  console.log(
    "    npx tsx scripts/shared/cross-post-qiita.mts # Cross-post to Qiita",
  );
  if (!scriptsOnly) {
    console.log();
    console.log("  Commands (in .claude/commands/):");
    console.log(
      "    /backpressure-review                  # SvelteKit quality review",
    );
    console.log(
      "    /seo-setup                            # SEO checklist + setup",
    );
    console.log(
      "    /seo-report                           # SEO dashboard report + fixes",
    );
    console.log(
      "    /checkpoint                           # Save session checkpoint",
    );
    console.log(
      "    /commit-style                         # Conventional commit reference",
    );
    console.log(
      "    /dev:d1-health                        # D1 database health audit",
    );
    console.log(
      "    /dev:preflight                        # Show preflight checks",
    );
    console.log(
      "    /dev:svelte-review                    # Svelte 5 best practices review",
    );
    console.log(
      "    /security:audit-github-actions        # GitHub Actions security audit",
    );
    console.log(
      "    /security:harden-github-org           # GitHub org hardening",
    );
    console.log(
      "    /standards:check                      # Review code against standards",
    );
    console.log(
      "    /standards:list                       # List all eSolia standards",
    );
    console.log(
      "    /standards:search                     # Search standards by keyword",
    );
    console.log(
      "    /standards:writing                    # Review content against writing guides",
    );
    console.log();
    console.log("  Rules (in .claude/rules/):");
    console.log(
      "    backpressure-verify                   # Auto-verify after code changes",
    );
    console.log(
      "    d1-maintenance                        # D1 database best practices",
    );
    console.log(
      "    mermaid-diagrams                      # Compact diagram styling",
    );
  }
  console.log();
  console.log("  Maintenance:");
  console.log("    ./scripts/shared/sync.sh               # Re-sync (bash)");
  console.log(
    "    npx tsx scripts/shared/sync.ts         # Re-sync (cross-platform)",
  );
  console.log("    ./scripts/shared/sync.sh --check       # Check for updates");
  console.log();
}

main().catch((err) => {
  error(String(err));
  process.exit(1);
});
