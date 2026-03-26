#!/usr/bin/env npx tsx
/**
 * Cross-post Japanese articles to Qiita
 *
 * Two input modes:
 *   1. Markdown file: provide a .md file with YAML frontmatter (for eSolia articles, manual translations)
 *   2. Feed mode: pull from cogley.jp JSON feed, filtering for lang=ja articles (future)
 *
 * Qiita does not support canonical_url in its API, so a "originally published at"
 * note is prepended to the article body.
 *
 * Usage:
 *   npx tsx scripts/shared/cross-post-qiita.mts --file article.md          # dry-run one file
 *   npx tsx scripts/shared/cross-post-qiita.mts --file article.md --post   # actually post
 *   npx tsx scripts/shared/cross-post-qiita.mts --file article.md --post --publish  # post as public
 *   npx tsx scripts/shared/cross-post-qiita.mts --dir ./articles-ja/       # dry-run all .md in dir
 *   npx tsx scripts/shared/cross-post-qiita.mts --feed                     # pull from cogley.jp feed (future)
 *   npx tsx scripts/shared/cross-post-qiita.mts --update                   # update existing articles
 *
 * Environment:
 *   QIITA_API_KEY   Qiita personal access token (required for --post/--update)
 *   FEED_URL        Override feed URL (default: https://api.cogley.jp/feed.json)
 *
 * Markdown frontmatter format:
 *   ---
 *   title: 記事のタイトル
 *   tags: [cloudflare, svelte, typescript]
 *   canonical_url: https://esolia.co.jp/ja/articles/cloud-sovereignty-japan/
 *   source: esolia          # "esolia" or "cogley" — controls footer/attribution
 *   ---
 *   Article body in markdown...
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

// ════════════════════════════════════════════════════════════════════════════
// Colors
// ════════════════════════════════════════════════════════════════════════════

const GREEN = "\x1b[0;32m";
const RED = "\x1b[0;31m";
const YELLOW = "\x1b[1;33m";
const BLUE = "\x1b[0;34m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

interface ArticleFrontmatter {
  title: string;
  tags: string[];
  canonical_url?: string;
  source?: "esolia" | "cogley";
  description?: string;
}

interface ArticleInput {
  slug: string;
  frontmatter: ArticleFrontmatter;
  body: string;
}

interface QiitaTag {
  name: string;
  versions: string[];
}

interface QiitaArticlePayload {
  title: string;
  body: string;
  tags: QiitaTag[];
  private: boolean;
  tweet: boolean;
}

interface ManifestEntry {
  qiitaId: string;
  contentHash: string;
  postedAt: string;
  updatedAt: string | null;
  canonical: string | null;
  qiitaUrl: string;
}

interface Manifest {
  version: number;
  articles: Record<string, ManifestEntry>;
}

// ════════════════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════════════════

const FEED_URL = process.env.FEED_URL ?? "https://api.cogley.jp/feed.json";
const QIITA_API_BASE = "https://qiita.com/api/v2";
const RATE_LIMIT_DELAY_MS = 2000;
const MAX_QIITA_TAGS = 5;

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const DATA_DIR = join(SCRIPT_DIR, "data");
const MANIFEST_PATH = join(DATA_DIR, "qiita-manifest.json");

// ════════════════════════════════════════════════════════════════════════════
// Attribution — differs by source
// ════════════════════════════════════════════════════════════════════════════

function buildCanonicalNote(source: "esolia" | "cogley", canonicalUrl: string): string {
  const siteName = source === "esolia" ? "eSolia.co.jp" : "cogley.jp";
  return `> 本記事は[${siteName}の完全版](${canonicalUrl})の要約版です。詳細は完全版をご覧ください。\n\n`;
}

function buildFooter(source: "esolia" | "cogley", canonicalUrl?: string): string {
  // Blank line before --- is critical: Qiita's parser treats --- after text (no blank line)
  // as a setext H2 heading, making the preceding paragraph bold/large.
  const lines: string[] = ["", "", "---", ""];

  if (canonicalUrl) {
    if (source === "esolia") {
      lines.push(`*この記事は [eSolia.co.jp](${canonicalUrl}) に掲載されたものです。*`);
    } else {
      lines.push(`*この記事は [cogley.jp](${canonicalUrl}) に掲載されたものです。*`);
    }
    lines.push("");
  }

  if (source === "esolia") {
    lines.push("*[Rick Cogley（コグレー・リック）](https://esolia.co.jp/about/team/)は[株式会社イソリア](https://esolia.co.jp)のCEO兼創業者。東京を拠点に日英バイリンガルITアウトソーシングとインフラサービスを提供しています。*");
  } else {
    lines.push("*[Rick Cogley（コグレー・リック）](https://esolia.co.jp/about/team/)は[株式会社イソリア](https://esolia.co.jp)のCEO兼創業者。東京で日英バイリンガルITアウトソーシングとインフラサービスを提供中。*");
  }

  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// CLI argument parsing
// ════════════════════════════════════════════════════════════════════════════

interface CliArgs {
  dryRun: boolean;
  publish: boolean;
  file: string | null;
  dir: string | null;
  feed: boolean;
  force: boolean;
  update: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const opts: CliArgs = {
    dryRun: true,
    publish: false,
    file: null,
    dir: null,
    feed: false,
    force: false,
    update: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--post":
        opts.dryRun = false;
        break;
      case "--publish":
        opts.publish = true;
        break;
      case "--file":
        opts.file = args[++i] ?? null;
        break;
      case "--dir":
        opts.dir = args[++i] ?? null;
        break;
      case "--feed":
        opts.feed = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--update":
        opts.update = true;
        opts.dryRun = false;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(`
${BOLD}cross-post-qiita${NC} — Cross-post Japanese articles to Qiita

${BOLD}Usage:${NC}
  npx tsx scripts/shared/cross-post-qiita.mts [options]

${BOLD}Input (pick one):${NC}
  --file <path>  Post a single markdown file with YAML frontmatter
  --dir <path>   Post all .md files in a directory
  --feed         Pull from cogley.jp JSON feed (lang=ja articles)

${BOLD}Options:${NC}
  --dry-run      Show what would be posted (default)
  --post         Actually call the Qiita API
  --publish      Post as public (default: private/draft)
  --force        Re-post even if content hash matches
  --update       Update existing articles on Qiita
  --help, -h     Show this help

${BOLD}Environment:${NC}
  QIITA_API_KEY  Qiita personal access token (required for --post/--update)
  FEED_URL       Override feed URL

${BOLD}Frontmatter format:${NC}
  ---
  title: 記事のタイトル
  tags: [cloudflare, svelte, typescript]
  canonical_url: https://esolia.co.jp/ja/articles/...
  source: esolia
  ---
`);
        process.exit(0);
        break;
      default:
        console.error(`${RED}Unknown argument: ${args[i]}${NC}`);
        process.exit(1);
    }
  }

  return opts;
}

// ════════════════════════════════════════════════════════════════════════════
// YAML frontmatter parser (minimal, no dependency)
// ════════════════════════════════════════════════════════════════════════════

function parseFrontmatter(content: string): { frontmatter: ArticleFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("No YAML frontmatter found. File must start with --- and have closing ---");
  }

  const yamlBlock = match[1];
  const body = match[2].trim();

  // Simple YAML key: value parser
  const fm: Record<string, string | string[]> = {};
  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (!kvMatch) continue;

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();

    // Handle array syntax: [tag1, tag2, tag3]
    if (value.startsWith("[") && value.endsWith("]")) {
      fm[key] = value
        .slice(1, -1)
        .split(",")
        .map((t) => t.trim().replace(/^["']|["']$/g, ""));
    } else {
      fm[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  if (!fm.title || typeof fm.title !== "string") {
    throw new Error("Frontmatter must include 'title'");
  }

  return {
    frontmatter: {
      title: fm.title as string,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      canonical_url: (fm.canonical_url as string) || undefined,
      source: (fm.source as "esolia" | "cogley") || "cogley",
      description: (fm.description as string) || undefined,
    },
    body,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Input loading
// ════════════════════════════════════════════════════════════════════════════

function loadFromFile(filePath: string): ArticleInput {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const raw = readFileSync(absPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const slug = basename(absPath, ".md");

  return { slug, frontmatter, body };
}

function loadFromDir(dirPath: string): ArticleInput[] {
  const absDir = resolve(dirPath);
  if (!existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

  const files = readdirSync(absDir).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    throw new Error(`No .md files found in ${absDir}`);
  }

  return files.map((f) => loadFromFile(join(absDir, f)));
}

// ════════════════════════════════════════════════════════════════════════════
// Tag normalization
// ════════════════════════════════════════════════════════════════════════════

/** Qiita tags: alphanumeric, hyphens, some CamelCase conventions */
function normalizeTag(tag: string): string {
  // Qiita is more permissive than Dev.to — preserve case for known tags
  const KNOWN_TAGS: Record<string, string> = {
    cloudflare: "Cloudflare",
    sveltekit: "SvelteKit",
    svelte: "Svelte",
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    rust: "Rust",
    go: "Go",
    docker: "Docker",
    linux: "Linux",
    aws: "AWS",
    security: "Security",
    devops: "DevOps",
    webdev: "Web",
    seo: "SEO",
    japan: "Japan",
    初心者: "初心者",
  };

  const lower = tag.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ亜-熙\-]/g, "");
  return KNOWN_TAGS[lower] || tag;
}

function buildQiitaTags(tags: string[]): QiitaTag[] {
  const seen = new Set<string>();
  const result: QiitaTag[] = [];

  for (const t of tags) {
    const normalized = normalizeTag(t);
    if (normalized && !seen.has(normalized.toLowerCase())) {
      seen.add(normalized.toLowerCase());
      result.push({ name: normalized, versions: [] });
    }
    if (result.length >= MAX_QIITA_TAGS) break;
  }

  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// Content hashing
// ════════════════════════════════════════════════════════════════════════════

function computeHash(title: string, content: string): string {
  return createHash("sha256").update(`${title}\n${content}`).digest("hex").slice(0, 16);
}

// ════════════════════════════════════════════════════════════════════════════
// Manifest management
// ════════════════════════════════════════════════════════════════════════════

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    return { version: 1, articles: {} };
  }
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw) as Manifest;
}

function saveManifest(manifest: Manifest): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

// ════════════════════════════════════════════════════════════════════════════
// Qiita API client
// ════════════════════════════════════════════════════════════════════════════

interface QiitaResponse {
  id: string;
  url: string;
  title: string;
  created_at: string;
}

async function createQiitaArticle(apiKey: string, payload: QiitaArticlePayload): Promise<QiitaResponse> {
  const res = await fetch(`${QIITA_API_BASE}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qiita API POST ${res.status}: ${body}`);
  }

  return (await res.json()) as QiitaResponse;
}

async function updateQiitaArticle(
  apiKey: string,
  id: string,
  payload: QiitaArticlePayload
): Promise<QiitaResponse> {
  const res = await fetch(`${QIITA_API_BASE}/items/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qiita API PATCH ${res.status}: ${body}`);
  }

  return (await res.json()) as QiitaResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const opts = parseArgs();
  const apiKey = process.env.QIITA_API_KEY ?? "";

  console.log(`\n${BOLD}cross-post-qiita${NC} — Japanese articles → Qiita\n`);

  if (!opts.dryRun && !apiKey) {
    console.error(`${RED}Error: QIITA_API_KEY environment variable is required for --post/--update${NC}`);
    console.error(`Set it via direnv or: export QIITA_API_KEY=your_token_here`);
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(`${YELLOW}Dry-run mode${NC} — no API calls will be made. Use --post to submit.\n`);
  }

  // Load articles from input source
  let articles: ArticleInput[];

  if (opts.file) {
    articles = [loadFromFile(opts.file)];
  } else if (opts.dir) {
    articles = loadFromDir(opts.dir);
  } else if (opts.feed) {
    // Future: pull from cogley.jp feed with lang=ja filter
    console.error(`${RED}Feed mode not yet implemented. Use --file or --dir for now.${NC}`);
    process.exit(1);
  } else {
    console.error(`${RED}No input specified. Use --file, --dir, or --feed.${NC}`);
    console.error(`Run with --help for usage.`);
    process.exit(1);
  }

  console.log(`${DIM}Loaded ${articles.length} article(s)${NC}\n`);

  // Load manifest
  const manifest = loadManifest();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const { slug, frontmatter, body } = article;
    const hash = computeHash(frontmatter.title, body);
    const existing = manifest.articles[slug];

    console.log(`${BOLD}[${i + 1}/${articles.length}]${NC} ${frontmatter.title}`);
    console.log(`  ${DIM}slug: ${slug} | hash: ${hash}${NC}`);

    // Skip if already posted and hash unchanged (unless --force)
    if (existing && existing.contentHash === hash && !opts.force) {
      if (opts.update) {
        console.log(`  ${DIM}Content unchanged, skipping update${NC}`);
      } else {
        console.log(`  ${DIM}Already posted (qiitaId: ${existing.qiitaId}), skipping${NC}`);
      }
      skipped++;
      console.log("");
      continue;
    }

    // Build body with canonical note and footer
    const source = frontmatter.source || "cogley";
    // Ensure body ends with a blank line to prevent Qiita's setext heading parser
    // from bolding the last paragraph when --- follows immediately
    const safeBody = body.endsWith("\n\n") ? body : body.endsWith("\n") ? body + "\n" : body + "\n\n";

    let fullBody = "";
    // Skip auto-generated canonical note if the body already starts with a blockquote
    // (author provided a custom 要約版 disclaimer in the markdown file)
    const bodyStartsWithBlockquote = safeBody.trimStart().startsWith(">");
    if (frontmatter.canonical_url && !bodyStartsWithBlockquote) {
      fullBody += buildCanonicalNote(source, frontmatter.canonical_url);
    }
    fullBody += safeBody;
    fullBody += buildFooter(source, frontmatter.canonical_url);

    // Build tags
    const tags = buildQiitaTags(frontmatter.tags);

    // Qiita: private=true means draft/unlisted, private=false means public
    const payload: QiitaArticlePayload = {
      title: frontmatter.title,
      body: fullBody,
      tags,
      private: !opts.publish,
      tweet: false,
    };

    console.log(`  ${BLUE}tags:${NC} ${tags.map((t) => t.name).join(", ")}`);
    if (frontmatter.canonical_url) {
      console.log(`  ${BLUE}canonical:${NC} ${frontmatter.canonical_url}`);
    }
    console.log(`  ${BLUE}source:${NC} ${source}`);
    console.log(`  ${BLUE}visibility:${NC} ${opts.publish ? "public" : "private (draft)"}`);
    console.log(`  ${BLUE}body length:${NC} ${fullBody.length} chars`);

    if (opts.dryRun) {
      // Show first 300 chars of body
      const preview = body.slice(0, 300);
      console.log(`  ${DIM}--- preview ---${NC}`);
      console.log(`  ${DIM}${preview.replace(/\n/g, "\n  ")}${NC}`);
      console.log(`  ${DIM}--- end preview ---${NC}`);
      console.log(`  ${YELLOW}[dry-run] Would ${existing ? "update" : "create"} on Qiita${NC}`);
      created++;
      console.log("");
      continue;
    }

    // Actually post/update
    try {
      if (existing?.qiitaId && (opts.update || opts.force)) {
        console.log(`  ${DIM}Updating Qiita article ${existing.qiitaId}...${NC}`);
        const result = await updateQiitaArticle(apiKey, existing.qiitaId, payload);
        manifest.articles[slug] = {
          ...existing,
          contentHash: hash,
          updatedAt: new Date().toISOString(),
          qiitaUrl: result.url,
        };
        console.log(`  ${GREEN}✓ Updated:${NC} ${result.url}`);
        updated++;
      } else {
        console.log(`  ${DIM}Creating on Qiita...${NC}`);
        const result = await createQiitaArticle(apiKey, payload);
        manifest.articles[slug] = {
          qiitaId: result.id,
          contentHash: hash,
          postedAt: new Date().toISOString(),
          updatedAt: null,
          canonical: frontmatter.canonical_url || null,
          qiitaUrl: result.url,
        };
        console.log(`  ${GREEN}✓ Created:${NC} ${result.url}`);
        created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ${RED}✗ Error: ${msg}${NC}`);
      errors++;
    }

    console.log("");

    // Rate limit between API calls
    if (!opts.dryRun && i < articles.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Save manifest
  if (!opts.dryRun) {
    saveManifest(manifest);
    console.log(`${DIM}Manifest saved to ${MANIFEST_PATH}${NC}\n`);
  }

  // Summary
  console.log(`${BOLD}Summary:${NC}`);
  if (opts.dryRun) {
    console.log(`  ${YELLOW}${created} would be posted${NC}  ${DIM}${skipped} skipped${NC}`);
    console.log(`\n  Run with ${BOLD}--post${NC} to submit to Qiita.`);
    console.log(`  Add ${BOLD}--publish${NC} to make articles public (default: private/draft).`);
  } else {
    console.log(
      `  ${GREEN}${created} created${NC}  ${BLUE}${updated} updated${NC}  ${DIM}${skipped} skipped${NC}  ${errors > 0 ? RED : DIM}${errors} errors${NC}`
    );
  }
  console.log("");

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err instanceof Error ? err.message : String(err)}${NC}`);
  process.exit(1);
});
