#!/usr/bin/env npx tsx
/**
 * Cross-post cogley.jp articles to Dev.to
 *
 * Fetches the cogley.jp JSON feed, filters for articles, cleans content,
 * and posts to Dev.to with canonical_url pointing back to the original.
 * Each article includes an attribution footer linking to eSolia.
 *
 * Usage:
 *   npx tsx scripts/cross-post-devto.mts                    # dry-run all articles from feed
 *   npx tsx scripts/cross-post-devto.mts --file article.md  # dry-run one local markdown file
 *   npx tsx scripts/cross-post-devto.mts --file article.md --post  # actually post a local file
 *   npx tsx scripts/cross-post-devto.mts --dir ./posts      # dry-run all .md files in a directory
 *   npx tsx scripts/cross-post-devto.mts --publish          # post as published (not draft)
 *   npx tsx scripts/cross-post-devto.mts --slug cloudflare-pages-to-workers-migration
 *   npx tsx scripts/cross-post-devto.mts --stream tech      # only articles from "tech" stream
 *   npx tsx scripts/cross-post-devto.mts --force            # re-post even if hash matches
 *   npx tsx scripts/cross-post-devto.mts --update           # update existing articles on Dev.to
 *   npx tsx scripts/cross-post-devto.mts --post             # actually call the API (opposite of dry-run)
 *
 * Environment:
 *   DEVTO_API_KEY   Dev.to API key (required for non-dry-run)
 *   FEED_URL        Override feed URL (default: https://api.cogley.jp/feed.json)
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

interface FeedItem {
  id: string;
  url: string;
  title: string;
  content_html: string;
  content_text: string;
  summary: string;
  date_published: string;
  date_modified: string;
  tags: string[];
  _pub: {
    stream: string;
    mood: string;
    type: string;
  };
}

interface JsonFeed {
  version: string;
  title: string;
  home_page_url: string;
  feed_url: string;
  items: FeedItem[];
}

interface ArticleFrontmatter {
  title: string;
  tags: string[];
  canonical_url?: string;
  description?: string;
}

interface ArticleInput {
  slug: string;
  frontmatter: ArticleFrontmatter;
  body: string;
}

interface DevtoArticlePayload {
  title: string;
  body_markdown: string;
  canonical_url: string;
  tags: string[];
  description: string;
  published: boolean;
  main_image?: string;
}

interface ManifestEntry {
  devtoId: number;
  contentHash: string;
  postedAt: string;
  updatedAt: string | null;
  canonical: string;
}

interface Manifest {
  version: number;
  articles: Record<string, ManifestEntry>;
}

// ════════════════════════════════════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════════════════════════════════════

const FEED_URL = process.env.FEED_URL ?? "https://api.cogley.jp/feed.json";
const COVER_IMAGE_BASE = "https://api.cogley.jp/api/og/cover";
const DEVTO_API_BASE = "https://dev.to/api/articles";
const RATE_LIMIT_DELAY_MS = 3000;
const MAX_DEVTO_TAGS = 4;
const MAX_DESCRIPTION_LENGTH = 150;

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const DATA_DIR = join(SCRIPT_DIR, "data");
const MANIFEST_PATH = join(DATA_DIR, "devto-manifest.json");

// ════════════════════════════════════════════════════════════════════════════
// Attribution footer — backlinks to cogley.jp and esolia.co.jp
// ════════════════════════════════════════════════════════════════════════════

function buildFooter(canonicalUrl: string): string {
  return [
    "",
    "---",
    "",
    `*Originally published at [cogley.jp](${canonicalUrl})*`,
    "",
    "*[Rick Cogley](https://esolia.co.jp/en/about/team/) is CEO of [eSolia Inc.](https://esolia.co.jp/en/), providing bilingual IT outsourcing and infrastructure services in Tokyo, Japan.*",
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════════════
// CLI argument parsing
// ════════════════════════════════════════════════════════════════════════════

interface CliArgs {
  dryRun: boolean;
  publish: boolean;
  file: string | null;
  dir: string | null;
  slug: string | null;
  stream: string | null;
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
    slug: null,
    stream: null,
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
      case "--slug":
        opts.slug = args[++i] ?? null;
        break;
      case "--stream":
        opts.stream = args[++i] ?? null;
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
${BOLD}cross-post-devto${NC} — Cross-post articles to Dev.to

${BOLD}Usage:${NC}
  npx tsx scripts/cross-post-devto.mts [options]

${BOLD}Input (pick one):${NC}
  --file <path>  Post a single markdown file with YAML frontmatter
  --dir <path>   Post all .md files in a directory
  (no input)     Pull from cogley.jp JSON feed (default)

${BOLD}Feed filters (only with feed mode):${NC}
  --slug <slug>  Only process one article by slug
  --stream <s>   Filter by _pub.stream (e.g., "tech")

${BOLD}Options:${NC}
  --dry-run      Show what would be posted (default)
  --post         Actually call the Dev.to API
  --publish      Post as published (default: draft)
  --force        Re-post even if content hash matches
  --update       Update existing articles on Dev.to
  --help, -h     Show this help

${BOLD}Environment:${NC}
  DEVTO_API_KEY  Dev.to API key (required for --post/--update)
  FEED_URL       Override feed URL

${BOLD}Frontmatter format (for --file/--dir):${NC}
  ---
  title: Article Title
  tags: [svelte, typescript, cloudflare]
  canonical_url: https://example.com/articles/...
  description: Short description for Dev.to
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
// Content cleaning
// ════════════════════════════════════════════════════════════════════════════

function cleanContent(text: string): string {
  let cleaned = text;

  // Phosphor icons → Unicode equivalents
  cleaned = cleaned.replace(/<i class="ph-duotone ph-check-circle[^"]*"><\/i>/g, "✓");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-check[^"]*"><\/i>/g, "✓");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-x-circle[^"]*"><\/i>/g, "✗");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-x[^"]*"><\/i>/g, "✗");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-arrow-right[^"]*"><\/i>/g, "→");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-warning[^"]*"><\/i>/g, "⚠");
  cleaned = cleaned.replace(/<i class="ph-duotone ph-info[^"]*"><\/i>/g, "ℹ");
  // Strip any remaining Phosphor icon tags
  cleaned = cleaned.replace(/<i class="ph-[^"]*"><\/i>/g, "");

  // <br> → newline
  cleaned = cleaned.replace(/<br\s*\/?>/g, "\n");

  // Strip stray wrapper HTML tags (but preserve content)
  cleaned = cleaned.replace(/<\/?(div|span|section|string|all)[^>]*>/g, "");

  // Collapse 3+ consecutive blank lines to 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

// ════════════════════════════════════════════════════════════════════════════
// Tag mapping
// ════════════════════════════════════════════════════════════════════════════

/** Dev.to tags: lowercase, alphanumeric + hyphens only */
function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/**
 * Build Dev.to tags from feed item tags + content-aware expansion.
 * Dev.to allows max 4 tags.
 */
function buildTags(item: FeedItem): string[] {
  const tags = new Set<string>();

  // Start with feed item tags
  for (const t of item.tags) {
    const normalized = normalizeTag(t);
    if (normalized) tags.add(normalized);
  }

  // Content-aware expansion: scan title + summary for tech keywords
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const KEYWORD_TO_TAG: Record<string, string> = {
    svelte: "svelte",
    sveltekit: "svelte",
    vite: "vite",
    typescript: "typescript",
    javascript: "javascript",
    cloudflare: "cloudflare",
    "workers": "cloudflare",
    docker: "docker",
    linux: "linux",
    python: "python",
    rust: "rust",
    go: "go",
    japan: "japan",
    webdev: "webdev",
    devops: "devops",
    security: "security",
    seo: "seo",
  };

  for (const [keyword, tag] of Object.entries(KEYWORD_TO_TAG)) {
    if (text.includes(keyword)) tags.add(tag);
  }

  // Cap at MAX_DEVTO_TAGS, preferring feed tags first
  return [...tags].slice(0, MAX_DEVTO_TAGS);
}

// ════════════════════════════════════════════════════════════════════════════
// Slug extraction
// ════════════════════════════════════════════════════════════════════════════

function extractSlug(url: string): string {
  // https://cogley.jp/articles/cloudflare-pages-to-workers-migration → cloudflare-pages-to-workers-migration
  const match = url.match(/\/articles\/([^/?#]+)/);
  return match ? match[1] : url;
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
// Dev.to API client
// ════════════════════════════════════════════════════════════════════════════

interface DevtoResponse {
  id: number;
  url: string;
  slug: string;
  title: string;
  published_at: string | null;
}

async function createDevtoArticle(apiKey: string, payload: DevtoArticlePayload): Promise<DevtoResponse> {
  const res = await fetch(DEVTO_API_BASE, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ article: payload }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dev.to API POST ${res.status}: ${body}`);
  }

  return (await res.json()) as DevtoResponse;
}

async function updateDevtoArticle(apiKey: string, id: number, payload: DevtoArticlePayload): Promise<DevtoResponse> {
  const res = await fetch(`${DEVTO_API_BASE}/${id}`, {
    method: "PUT",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ article: payload }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dev.to API PUT ${res.status}: ${body}`);
  }

  return (await res.json()) as DevtoResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      description: (fm.description as string) || undefined,
    },
    body,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Input loading (--file / --dir)
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

/** Build Dev.to tags from frontmatter tags (for --file/--dir mode) */
function buildTagsFromFrontmatter(tags: string[]): string[] {
  return tags.map(normalizeTag).filter(Boolean).slice(0, MAX_DEVTO_TAGS);
}

// ════════════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const opts = parseArgs();
  const apiKey = process.env.DEVTO_API_KEY ?? "";

  console.log(`\n${BOLD}cross-post-devto${NC} — cogley.jp → Dev.to\n`);

  if (!opts.dryRun && !apiKey) {
    console.error(`${RED}Error: DEVTO_API_KEY environment variable is required for --post/--update${NC}`);
    console.error(`Set it via direnv or: export DEVTO_API_KEY=your_key_here`);
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(`${YELLOW}Dry-run mode${NC} — no API calls will be made. Use --post to submit.\n`);
  }

  // ── Determine input mode: file/dir or feed ──────────────────────────────

  interface ProcessableArticle {
    slug: string;
    title: string;
    bodyMarkdown: string;
    canonicalUrl: string;
    tags: string[];
    description: string;
    coverImage?: string;
  }

  const processable: ProcessableArticle[] = [];

  if (opts.file || opts.dir) {
    // File/dir mode: load from local markdown with frontmatter
    let inputs: ArticleInput[];
    if (opts.file) {
      inputs = [loadFromFile(opts.file)];
    } else {
      inputs = loadFromDir(opts.dir!);
    }
    console.log(`${DIM}Loaded ${inputs.length} article(s) from ${opts.file ? "file" : "directory"}${NC}\n`);

    for (const input of inputs) {
      const cleanedBody = cleanContent(input.body);
      const canonical = input.frontmatter.canonical_url ?? "";
      const footer = canonical ? buildFooter(canonical) : "";
      const desc = input.frontmatter.description ?? "";

      processable.push({
        slug: input.slug,
        title: input.frontmatter.title,
        bodyMarkdown: cleanedBody + footer,
        canonicalUrl: canonical,
        tags: buildTagsFromFrontmatter(input.frontmatter.tags),
        description: desc.length > MAX_DESCRIPTION_LENGTH
          ? desc.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…"
          : desc,
      });
    }
  } else {
    // Feed mode: fetch from JSON feed
    console.log(`${DIM}Fetching ${FEED_URL}...${NC}`);
    const feedRes = await fetch(FEED_URL);
    if (!feedRes.ok) {
      console.error(`${RED}Failed to fetch feed: ${feedRes.status} ${feedRes.statusText}${NC}`);
      process.exit(1);
    }
    const feed = (await feedRes.json()) as JsonFeed;

    let articles = feed.items.filter((item) => item._pub?.type === "article");
    console.log(`${DIM}Found ${articles.length} article(s) in feed (${feed.items.length} total items)${NC}\n`);

    if (articles.length === 0) {
      console.log(`${YELLOW}No articles found in feed.${NC}`);
      return;
    }

    // Apply feed-specific filters
    if (opts.slug) {
      articles = articles.filter((item) => extractSlug(item.url) === opts.slug);
      if (articles.length === 0) {
        console.error(`${RED}No article found with slug: ${opts.slug}${NC}`);
        process.exit(1);
      }
    }
    if (opts.stream) {
      articles = articles.filter((item) => item._pub?.stream === opts.stream);
      if (articles.length === 0) {
        console.error(`${RED}No articles found in stream: ${opts.stream}${NC}`);
        process.exit(1);
      }
    }

    for (const item of articles) {
      const cleanedContent = cleanContent(item.content_text);
      const description = item.summary.length > MAX_DESCRIPTION_LENGTH
        ? item.summary.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…"
        : item.summary;

      processable.push({
        slug: extractSlug(item.url),
        title: item.title,
        bodyMarkdown: cleanedContent + buildFooter(item.url),
        canonicalUrl: item.url,
        tags: buildTags(item),
        description,
        coverImage: `${COVER_IMAGE_BASE}/${item.id}.png`,
      });
    }
  }

  // ── Process articles ────────────────────────────────────────────────────

  // Load manifest
  const manifest = loadManifest();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < processable.length; i++) {
    const art = processable[i];
    const hash = computeHash(art.title, art.bodyMarkdown);
    const existing = manifest.articles[art.slug];

    console.log(`${BOLD}[${i + 1}/${processable.length}]${NC} ${art.title}`);
    console.log(`  ${DIM}slug: ${art.slug} | hash: ${hash}${NC}`);

    // Skip if already posted and hash unchanged (unless --force)
    if (existing && existing.contentHash === hash && !opts.force) {
      if (opts.update) {
        console.log(`  ${DIM}Content unchanged, skipping update${NC}`);
      } else {
        console.log(`  ${DIM}Already posted (devtoId: ${existing.devtoId}), skipping${NC}`);
      }
      skipped++;
      console.log("");
      continue;
    }

    // Build payload
    const payload: DevtoArticlePayload = {
      title: art.title,
      body_markdown: art.bodyMarkdown,
      canonical_url: art.canonicalUrl,
      tags: art.tags,
      description: art.description,
      published: opts.publish,
      ...(art.coverImage ? { main_image: art.coverImage } : {}),
    };

    console.log(`  ${BLUE}tags:${NC} ${art.tags.join(", ")}`);
    if (art.canonicalUrl) console.log(`  ${BLUE}canonical:${NC} ${art.canonicalUrl}`);
    if (art.coverImage) console.log(`  ${BLUE}cover:${NC} ${art.coverImage}`);
    console.log(`  ${BLUE}description:${NC} ${art.description}`);
    console.log(`  ${BLUE}published:${NC} ${opts.publish}`);
    console.log(`  ${BLUE}body length:${NC} ${art.bodyMarkdown.length} chars`);

    if (opts.dryRun) {
      // Show first 300 chars of body
      const preview = art.bodyMarkdown.slice(0, 300);
      console.log(`  ${DIM}--- preview ---${NC}`);
      console.log(`  ${DIM}${preview.replace(/\n/g, "\n  ")}${NC}`);
      console.log(`  ${DIM}--- end preview ---${NC}`);
      console.log(`  ${YELLOW}[dry-run] Would ${existing ? "update" : "create"} on Dev.to${NC}`);
      created++;
      console.log("");
      continue;
    }

    // Actually post/update
    try {
      if (existing?.devtoId) {
        // Update existing (--force or --update with known devtoId)
        console.log(`  ${DIM}Updating Dev.to article ${existing.devtoId}...${NC}`);
        const result = await updateDevtoArticle(apiKey, existing.devtoId, payload);
        manifest.articles[art.slug] = {
          ...existing,
          contentHash: hash,
          updatedAt: new Date().toISOString(),
        };
        console.log(`  ${GREEN}✓ Updated:${NC} ${result.url}`);
        updated++;
      } else {
        // Create new
        console.log(`  ${DIM}Creating on Dev.to...${NC}`);
        const result = await createDevtoArticle(apiKey, payload);
        manifest.articles[art.slug] = {
          devtoId: result.id,
          contentHash: hash,
          postedAt: new Date().toISOString(),
          updatedAt: null,
          canonical: art.canonicalUrl,
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
    if (!opts.dryRun && i < processable.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // Save manifest (even on dry-run we don't save)
  if (!opts.dryRun) {
    saveManifest(manifest);
    console.log(`${DIM}Manifest saved to ${MANIFEST_PATH}${NC}\n`);
  }

  // Summary
  console.log(`${BOLD}Summary:${NC}`);
  if (opts.dryRun) {
    console.log(`  ${YELLOW}${created} would be posted${NC}  ${DIM}${skipped} skipped${NC}`);
    console.log(`\n  Run with ${BOLD}--post${NC} to submit to Dev.to.`);
  } else {
    console.log(`  ${GREEN}${created} created${NC}  ${BLUE}${updated} updated${NC}  ${DIM}${skipped} skipped${NC}  ${errors > 0 ? RED : DIM}${errors} errors${NC}`);
  }
  console.log("");

  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`${RED}Fatal: ${err instanceof Error ? err.message : String(err)}${NC}`);
  process.exit(1);
});
