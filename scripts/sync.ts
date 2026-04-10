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
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
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
  { src: "scripts/CLAUDE.md", dest: "CLAUDE.md" },
  { src: "scripts/lib/common.sh", dest: "lib/common.sh" },
  { src: "scripts/bump-version.sh", dest: "bump-version.sh" },
  { src: "scripts/update-wrangler.sh", dest: "update-wrangler.sh" },
  { src: "scripts/audit-backpressure.sh", dest: "audit-backpressure.sh" },
  { src: "scripts/audit-whatsnew.sh", dest: "audit-whatsnew.sh" },
  { src: "scripts/ast-grep-rules/sgconfig.yml", dest: "ast-grep-rules/sgconfig.yml" },
  { src: "scripts/ast-grep-rules/sql-injection-d1.yml", dest: "ast-grep-rules/sql-injection-d1.yml" },
  { src: "scripts/ast-grep-rules/sql-injection-concat.yml", dest: "ast-grep-rules/sql-injection-concat.yml" },
  { src: "scripts/ast-grep-rules/n-plus-one-query.yml", dest: "ast-grep-rules/n-plus-one-query.yml" },
  { src: "scripts/ast-grep-rules/unchecked-db-result.yml", dest: "ast-grep-rules/unchecked-db-result.yml" },
  { src: "scripts/ast-grep-rules/unbounded-query.yml", dest: "ast-grep-rules/unbounded-query.yml" },
  { src: "scripts/ast-grep-rules/empty-error-handler.yml", dest: "ast-grep-rules/empty-error-handler.yml" },
  { src: "scripts/ast-grep-rules/god-function.yml", dest: "ast-grep-rules/god-function.yml" },
  { src: "scripts/sync.sh", dest: "sync.sh" },
  { src: "scripts/sync.ts", dest: "sync.ts" },
  { src: "scripts/asvs-check.ts", dest: "asvs-check.ts" },
  { src: "scripts/submit-bing.mts", dest: "submit-bing.mts" },
  { src: "scripts/cross-post-devto.mts", dest: "cross-post-devto.mts" },
  { src: "scripts/cross-post-qiita.mts", dest: "cross-post-qiita.mts" },
];

// Commands and rules are auto-discovered from the GitHub repo at sync time.
// Add new files to .claude/shared-commands/ or .claude/shared-rules/ in
// eSolia/.github and they will be picked up automatically — no need to
// edit this script.
const SHARED_COMMANDS_PATH = ".claude/shared-commands";
const SHARED_RULES_PATH = ".claude/shared-rules";

const SYNC_WORKFLOWS: SyncEntry[] = [
  {
    src: ".github/shared-caller-workflows/ast-grep.yml",
    dest: "ast-grep.yml",
  },
];

const WRAPPER_SCRIPTS = [
  "bump-version.sh",
  "update-wrangler.sh",
  "audit-backpressure.sh",
  "audit-whatsnew.sh",
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

interface GitHubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

/**
 * Auto-discover files in a remote directory via the GitHub Contents API.
 * Recurses into subdirectories so nested structures (e.g. commands/dev/)
 * are picked up automatically.
 */
async function discoverRemoteFiles(
  remotePath: string,
  gitRef: string,
): Promise<SyncEntry[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${remotePath}?ref=${gitRef}`;
  const response = await fetch(url);
  if (!response.ok) {
    error(
      `Failed to list ${remotePath}: ${response.status} ${response.statusText}`,
    );
    return [];
  }
  const items: GitHubContentEntry[] = await response.json();
  const entries: SyncEntry[] = [];

  for (const item of items) {
    if (item.type === "dir") {
      const subEntries = await discoverRemoteFiles(item.path, gitRef);
      entries.push(...subEntries);
    } else if (item.type === "file") {
      const dest = item.path.replace(`${remotePath}/`, "");
      entries.push({ src: item.path, dest });
    }
  }

  return entries;
}

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

/**
 * Remove local files that were previously synced but no longer exist in the
 * remote source. Compares the files on disk against the list of files just
 * discovered from the remote, and deletes any extras.
 *
 * Skips:
 *  - CLAUDE.md (the directory's own readme, always synced separately)
 *  - Files inside a "local/" subdirectory (repo-specific, never synced)
 */
function cleanupStaleFiles(
  targetDir: string,
  syncedEntries: SyncEntry[],
  label: string,
): void {
  if (!existsSync(targetDir)) return;

  const remoteDests = new Set(syncedEntries.map((e) => e.dest));

  function walkDir(dir: string, prefix: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      // Never touch local/ subdirectories
      if (entry.isDirectory() && entry.name === "local") continue;

      if (entry.isDirectory()) {
        walkDir(join(dir, entry.name), relPath);
      } else if (!remoteDests.has(relPath)) {
        unlinkSync(join(dir, entry.name));
        warning(`Removed stale ${label}: ${relPath}`);
      }
    }
  }

  walkDir(targetDir, "");
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

  // 2. Sync commands, rules, and workflows (unless --scripts-only)
  let syncedCommands: SyncEntry[] = [];
  let syncedRules: SyncEntry[] = [];

  if (!scriptsOnly) {
    const commandsDir = join(PROJECT_ROOT, ".claude", "commands");
    const rulesDir = join(PROJECT_ROOT, ".claude", "rules");

    // Auto-discover commands from the central repo
    step("Discovering shared commands...");
    syncedCommands = await discoverRemoteFiles(SHARED_COMMANDS_PATH, ref);
    if (syncedCommands.length > 0) {
      mkdirSync(commandsDir, { recursive: true });
      step(`Syncing ${syncedCommands.length} commands to .claude/commands/`);
      await downloadFiles(syncedCommands, commandsDir);
      console.log();
    } else {
      warning("No shared commands found");
      console.log();
    }

    // Auto-discover rules from the central repo
    step("Discovering shared rules...");
    syncedRules = await discoverRemoteFiles(SHARED_RULES_PATH, ref);
    if (syncedRules.length > 0) {
      mkdirSync(rulesDir, { recursive: true });
      step(`Syncing ${syncedRules.length} rules to .claude/rules/`);
      await downloadFiles(syncedRules, rulesDir);
      console.log();
    } else {
      warning("No shared rules found");
      console.log();
    }

    if (SYNC_WORKFLOWS.length > 0) {
      const workflowsDir = join(PROJECT_ROOT, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      step("Syncing shared workflows to .github/workflows/");
      await downloadFiles(SYNC_WORKFLOWS, workflowsDir);
      console.log();
    }

    // Remove files that no longer exist in the remote
    step("Cleaning up stale synced files...");
    cleanupStaleFiles(commandsDir, syncedCommands, "command");
    cleanupStaleFiles(rulesDir, syncedRules, "rule");
    console.log();
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
    "    ./scripts/audit-whatsnew.sh             # What's new audit",
  );
  console.log(
    "    npx tsx scripts/shared/submit-bing.mts  # Bing URL submission",
  );
  console.log(
    "    npx tsx scripts/shared/cross-post-qiita.mts # Cross-post to Qiita",
  );
  if (!scriptsOnly) {
    if (syncedCommands.length > 0) {
      console.log();
      console.log(
        `  Commands (${syncedCommands.length} synced to .claude/commands/):`,
      );
      for (const cmd of syncedCommands) {
        if (cmd.dest === "CLAUDE.md") continue;
        const name = cmd.dest.replace(/\.md$/, "").replace(/\//g, ":");
        console.log(`    /${name}`);
      }
    }

    if (syncedRules.length > 0) {
      console.log();
      console.log(
        `  Rules (${syncedRules.length} synced to .claude/rules/):`,
      );
      for (const rule of syncedRules) {
        if (rule.dest === "CLAUDE.md") continue;
        console.log(`    ${rule.dest.replace(/\.md$/, "")}`);
      }
    }

    if (SYNC_WORKFLOWS.length > 0) {
      console.log();
      console.log("  Workflows (in .github/workflows/):");
      for (const wf of SYNC_WORKFLOWS) {
        console.log(`    ${wf.dest}`);
      }
    }
  }
  console.log();
  console.log("  Maintenance:");
  console.log(
    "    npx tsx scripts/shared/sync.ts         # Re-sync (primary)",
  );
  console.log(
    "    ./scripts/shared/sync.sh               # Re-sync (bash wrapper)",
  );
  console.log(
    "    npx tsx scripts/shared/sync.ts --check # Check for updates",
  );
  console.log();
}

main().catch((err) => {
  error(String(err));
  process.exit(1);
});
