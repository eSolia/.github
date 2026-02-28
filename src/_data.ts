// Simple constants
export const cacheBuster = `${new Date().getTime()}`;
export const todaysDateYYYYMMDD = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Asia/Tokyo",
});
export const todaysDateJAJP = `${
  new Date().toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}`;
export const todaysDateENUS = `${
  new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
}`;

// Generic JSON fetcher with error handling
async function fetchJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      console.error(`Fetch error ${response.status} for ${url}`);
      return fallback;
    }
    return await response.json() as T;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);
    return fallback;
  }
}

// Fetch Japanese holidays
const holidayData = await fetchJSON<Record<string, string>>(
  "https://holidays-jp.github.io/api/v1/date.json",
  {},
);
export { holidayData as holidays };

// Fetch eSolia blog posts (JSON Feed format)
interface BlogPost {
  id: string;
  url: string;
  title: string;
  summary: string;
  date_published: string;
  tags: string[];
  author: { name: string };
}

interface JSONFeed {
  items: BlogPost[];
}

export const blogPostsEN = await fetchJSON<JSONFeed>(
  "https://blog.esolia.pro/feed.en.json",
  { items: [] },
);

export const blogPostsJA = await fetchJSON<JSONFeed>(
  "https://blog.esolia.pro/feed.ja.json",
  { items: [] },
);

// Get repo folder size
import { join } from "https://deno.land/std/path/mod.ts";
async function getFolderSize(path: string): Promise<number> {
  let totalSize = 0;

  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);
    const info = await Deno.stat(entryPath);

    if (info.isFile) {
      totalSize += info.size;
    } else if (info.isDirectory) {
      totalSize += await getFolderSize(entryPath);
    }
  }
  return totalSize;
}
const folderPath = "./";
export const repoSizeLong = await getFolderSize(folderPath);
export const repoSizeKB = Math.trunc(repoSizeLong / 1024);
export const repoSizeMB = Math.trunc(repoSizeLong / 1024 / 1024);
