#!/usr/bin/env npx tsx
/**
 * Submit URLs to Bing Webmaster Tools URL Submission API
 *
 * Works with any web project — auto-detects sitemap location, site URL,
 * and package manager. Centralized script from esolia.github.
 *
 * Usage:
 *   npx tsx scripts/submit-bing.mts                    # submit from local sitemap
 *   npx tsx scripts/submit-bing.mts --quota            # check quota only
 *   npx tsx scripts/submit-bing.mts --build            # rebuild sitemap before submitting
 *   npx tsx scripts/submit-bing.mts url1 url2 ...      # submit specific URLs
 *   npx tsx scripts/submit-bing.mts --file urls.txt    # submit URLs from a file (one per line)
 *   cat urls.txt | npx tsx scripts/submit-bing.mts -   # submit URLs from stdin
 *   npx tsx scripts/submit-bing.mts --site https://example.com          # override site URL
 *   npx tsx scripts/submit-bing.mts --sitemap path/to/sitemap.xml       # override sitemap path
 *
 * API key: reads BING_WEBMASTER_API_KEY from environment variable or .env file.
 * Daily quota: typically 10–100 URLs depending on site verification level.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

// ════════════════════════════════════════════════════════════════════════════
// Project root detection
// ════════════════════════════════════════════════════════════════════════════

function findProjectRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    return process.cwd();
  }
}

const PROJECT_ROOT = findProjectRoot();

// ════════════════════════════════════════════════════════════════════════════
// Package manager detection
// ════════════════════════════════════════════════════════════════════════════

function detectPM(): string {
  if (existsSync(join(PROJECT_ROOT, "pnpm-lock.yaml")) || existsSync(join(PROJECT_ROOT, "pnpm-workspace.yaml"))) return "pnpm";
  if (existsSync(join(PROJECT_ROOT, "yarn.lock"))) return "yarn";
  if (existsSync(join(PROJECT_ROOT, "bun.lockb")) || existsSync(join(PROJECT_ROOT, "bun.lock"))) return "bun";

  // Check corepack packageManager field
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"));
    if (pkg.packageManager) {
      const pm = pkg.packageManager.split("@")[0];
      if (["pnpm", "yarn", "bun", "npm"].includes(pm)) return pm;
    }
  } catch { /* no package.json */ }

  return "npm";
}

// ════════════════════════════════════════════════════════════════════════════
// Sitemap discovery
// ════════════════════════════════════════════════════════════════════════════

/** Common sitemap locations across frameworks, ordered by likelihood */
const SITEMAP_CANDIDATES = [
  // SvelteKit (Cloudflare adapter)
  ".svelte-kit/cloudflare/sitemap.xml",
  // SvelteKit (node/auto adapter)
  ".svelte-kit/output/client/sitemap.xml",
  "build/client/sitemap.xml",
  "build/sitemap.xml",
  // Lume / Deno static sites
  "_site/sitemap.xml",
  // Astro
  "dist/sitemap-index.xml",
  "dist/sitemap-0.xml",
  "dist/sitemap.xml",
  // Next.js
  ".next/server/app/sitemap.xml",
  "out/sitemap.xml",
  // Nuxt
  ".output/public/sitemap.xml",
  // Generic static output
  "public/sitemap.xml",
  "static/sitemap.xml",
  // Project root
  "sitemap.xml",
];

function findSitemap(): string | null {
  for (const candidate of SITEMAP_CANDIDATES) {
    const full = resolve(PROJECT_ROOT, candidate);
    if (existsSync(full)) return full;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// Site URL detection
// ════════════════════════════════════════════════════════════════════════════

/** Extract the origin from the first <loc> in a sitemap */
function siteUrlFromSitemap(sitemapPath: string): string | null {
  try {
    const xml = readFileSync(sitemapPath, "utf-8");
    const match = xml.match(/<loc>(https?:\/\/[^/<]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Try to find site URL from package.json homepage or common config files */
function siteUrlFromConfig(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"));
    if (pkg.homepage && pkg.homepage.startsWith("http")) {
      return new URL(pkg.homepage).origin;
    }
  } catch { /* ignore */ }

  // Check for svelte.config.* with a site URL
  for (const configFile of ["svelte.config.js", "svelte.config.ts"]) {
    try {
      const content = readFileSync(join(PROJECT_ROOT, configFile), "utf-8");
      // Look for origin/site patterns like: origin: 'https://...'
      const match = content.match(/origin\s*:\s*['"]?(https?:\/\/[^'"]+)/);
      if (match?.[1]) return match[1];
    } catch { /* ignore */ }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// API key loading
// ════════════════════════════════════════════════════════════════════════════

function loadApiKey(): string {
  // 1. Environment variable (CI, dotenv loaded by shell, etc.)
  if (process.env.BING_WEBMASTER_API_KEY) {
    return process.env.BING_WEBMASTER_API_KEY;
  }

  // 2. Project .env file
  const envPath = resolve(PROJECT_ROOT, ".env");
  try {
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^BING_WEBMASTER_API_KEY=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch { /* no .env */ }

  console.error("Error: BING_WEBMASTER_API_KEY not found.");
  console.error("Set it as an environment variable or add it to .env");
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// URL reading helpers
// ════════════════════════════════════════════════════════════════════════════

function readUrlsFromFile(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http"));
}

async function readUrlsFromStdin(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks)
    .toString("utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("http"));
}

function getUrlsFromSitemap(sitemapPath: string): string[] {
  const xml = readFileSync(sitemapPath, "utf-8");
  const urls: string[] = [];
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}

// ════════════════════════════════════════════════════════════════════════════
// Bing API
// ════════════════════════════════════════════════════════════════════════════

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

async function checkQuota(apiKey: string, siteUrl: string): Promise<{ daily: number; monthly: number }> {
  const url = `${BING_API_BASE}/GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quota check failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { d: { DailyQuota: number; MonthlyQuota: number } };
  return { daily: data.d.DailyQuota, monthly: data.d.MonthlyQuota };
}

async function submitUrl(apiKey: string, siteUrl: string, pageUrl: string): Promise<boolean> {
  const url = `${BING_API_BASE}/SubmitUrl?apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl, url: pageUrl }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  FAIL ${pageUrl}: ${res.status} ${text}`);
    return false;
  }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// Output helpers
// ════════════════════════════════════════════════════════════════════════════

const isWindows = process.platform === "win32";
const green = (s: string) => (isWindows ? s : `\x1b[0;32m${s}\x1b[0m`);
const red = (s: string) => (isWindows ? s : `\x1b[0;31m${s}\x1b[0m`);
const cyan = (s: string) => (isWindows ? s : `\x1b[0;36m${s}\x1b[0m`);
const bold = (s: string) => (isWindows ? s : `\x1b[1m${s}\x1b[0m`);

// ════════════════════════════════════════════════════════════════════════════
// Parse arguments
// ════════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

function getFlag(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

const flagSite = getFlag("--site");
const flagSitemap = getFlag("--sitemap");
const flagFile = getFlag("--file");
const wantQuota = args.includes("--quota");
const wantBuild = args.includes("--build");
const wantHelp = args.includes("--help") || args.includes("-h");

if (wantHelp) {
  console.log(`Usage: npx tsx submit-bing.mts [options] [url1 url2 ...]

Options:
  --quota              Check remaining quota and exit
  --build              Rebuild the project before reading sitemap
  --site <url>         Override site URL (default: auto-detect)
  --sitemap <path>     Override sitemap path (default: auto-detect)
  --file <path>        Read URLs from a file (one per line)
  -                    Read URLs from stdin
  --help               Show this help

Auto-detection:
  Site URL:   extracted from sitemap, package.json homepage, or svelte.config.*
  Sitemap:    searches common build output paths (SvelteKit, Lume, Astro, Next.js, etc.)
  API key:    BING_WEBMASTER_API_KEY env var or .env file
  PM:         auto-detects pnpm/yarn/npm/bun for --build`);
  process.exit(0);
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  const apiKey = loadApiKey();

  // Build if requested
  if (wantBuild) {
    const pm = detectPM();
    console.log(`Building with ${pm}...`);
    execSync(`${pm} run build`, { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log();
  }

  // Resolve sitemap path
  let sitemapPath: string | null = null;
  if (flagSitemap) {
    sitemapPath = resolve(PROJECT_ROOT, flagSitemap);
    if (!existsSync(sitemapPath)) {
      console.error(`Error: Sitemap not found at ${sitemapPath}`);
      process.exit(1);
    }
  } else {
    sitemapPath = findSitemap();
  }

  // Resolve site URL
  let siteUrl = flagSite ?? null;
  if (!siteUrl && sitemapPath) {
    siteUrl = siteUrlFromSitemap(sitemapPath);
  }
  if (!siteUrl) {
    siteUrl = siteUrlFromConfig();
  }
  if (!siteUrl) {
    console.error("Error: Could not determine site URL.");
    console.error("Use --site <url> or add a homepage field to package.json");
    process.exit(1);
  }

  console.log(bold(`Bing URL Submission — ${siteUrl}`));
  console.log();

  // Quota-only mode
  if (wantQuota) {
    const quota = await checkQuota(apiKey, siteUrl);
    console.log(`  Daily remaining:   ${quota.daily}`);
    console.log(`  Monthly remaining: ${quota.monthly}`);
    process.exit(0);
  }

  // Check quota
  const quotaBefore = await checkQuota(apiKey, siteUrl);
  console.log(cyan(`Quota: ${quotaBefore.daily} daily / ${quotaBefore.monthly} monthly remaining`));
  console.log();

  // Determine URLs to submit
  let urls: string[];

  if (flagFile) {
    const filePath = resolve(process.cwd(), flagFile);
    urls = readUrlsFromFile(filePath);
    console.log(`Read ${urls.length} URLs from ${filePath}`);
  } else if (args.includes("-")) {
    urls = await readUrlsFromStdin();
    console.log(`Read ${urls.length} URLs from stdin`);
  } else {
    // Filter out flags and their values to find bare URL args
    const bareUrls = args.filter((a) => a.startsWith("http"));
    if (bareUrls.length > 0) {
      urls = bareUrls;
    } else if (sitemapPath) {
      urls = getUrlsFromSitemap(sitemapPath);
      console.log(`Found ${urls.length} URLs in sitemap`);
    } else {
      console.error("Error: No sitemap found and no URLs provided.");
      console.error("Use --build to generate one, --sitemap to specify a path, or pass URLs directly.");
      process.exit(1);
    }
  }

  if (urls.length === 0) {
    console.log("No URLs to submit.");
    process.exit(0);
  }

  if (urls.length > quotaBefore.daily) {
    console.log(
      `Warning: ${urls.length} URLs but only ${quotaBefore.daily} daily quota. Submitting first ${quotaBefore.daily}.`
    );
    urls = urls.slice(0, quotaBefore.daily);
  }

  console.log(`Submitting ${urls.length} URLs...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const pageUrl of urls) {
    const ok = await submitUrl(apiKey, siteUrl, pageUrl);
    if (ok) {
      succeeded++;
      console.log(green(`  OK   ${pageUrl}`));
    } else {
      failed++;
    }
  }

  console.log();
  if (failed === 0) {
    console.log(green(`Done: ${succeeded} submitted`));
  } else {
    console.log(`Done: ${green(String(succeeded) + " submitted")}, ${red(String(failed) + " failed")}`);
  }

  const quotaAfter = await checkQuota(apiKey, siteUrl);
  console.log(cyan(`Quota remaining: ${quotaAfter.daily} daily / ${quotaAfter.monthly} monthly`));
}

main().catch((err) => {
  console.error(red(String(err)));
  process.exit(1);
});
