// Simple constants
export const cacheBuster = `${new Date().getTime()}`;
export const todaysDateYYYYMMDD = `${new Date().toISOString('ja-JP', { timeZone: 'Asia/Tokyo' }).split("T")[0]}`;
// export const todaysDateYYYYMMDD2 = `${new Date().toISOString().slice(0, 10)}`;
export const todaysDateJAJP = `${new Date().toLocaleString('ja-JP',{ year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}`;
export const todaysDateENUS = `${new Date().toLocaleString('en-US',{ year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}`;

// const tzoptions = { timeZone: 'America/Los_Angeles' };
// console.log(date.toLocaleString('en-US', tzoptions));
// export const todaysDateYYYYMMDD2 = `${new Date().toISOString().split("T")[0]}`;
console.log(`${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
//console.log(event.toLocaleString('ko-KR', { timeZone: 'Asia/Tokyo' }));
console.log(`${new Date().toISOString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

// Fetch holidays
const response = await fetch('https://holidays-jp.github.io/api/v1/date.json', {
  method: 'GET',
  mode: 'no-cors',
  headers: {
    'Accept': 'application/json'
  }
});
const holidays = await response.json();
export {
  holidays,
};

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
getFolderSize(folderPath).then(size => {
  console.log(`Total size: ${size/1024/1024} MB`);
});
export const repoSizeLong = await getFolderSize(folderPath);
export const repoSizeKB = Math.trunc(repoSizeLong/1024);
export const repoSizeMB = Math.trunc(repoSizeLong/1024/1024);

// Shuffle
// https://en.wikipedia.org/wiki/Fisher-Yates_shuffle
// import shuffle from "https://deno.land/x/shuffle/mod.ts";
// console.log(shuffle(["i","ro","ha","ni","ho","he","to"]));

// Import rss feed and convert to json
import { parseFeed } from "https://deno.land/x/rss/mod.ts";
async function fetchAndConvertRSS(url: string, limit: number) {
  // Fetch the RSS feed
  const response = await fetch(url);
  const xml = await response.text();
  // Parse the RSS feed
  const feed = await parseFeed(xml);
  // Limit the number of entries
  const limitedEntries = feed.entries.slice(0, limit);
  // Convert to JSON
  // const json = JSON.stringify( {...feed, entries: limitedEntries }, null, 2);
  const json = { ...feed, entries: limitedEntries };
  return json;
}
const rssUrl = "https://rick.status.lol/feed/rss";
const limit = 5;
fetchAndConvertRSS(rssUrl,limit).then(console.log).catch(console.error);
export const statuses = await fetchAndConvertRSS(rssUrl,limit);

const rssUrl2 = "https://cogley.jp/feed.xml";
const limit2 = 5;
fetchAndConvertRSS(rssUrl2,limit2).then(console.log).catch(console.error);
export const microblogposts = await fetchAndConvertRSS(rssUrl2,limit2);

const rssUrl3 = "https://bsky.app/profile/did:plc:3d3xvl3mifda2nkb7svwqlvf/rss";
const limit3 = 3;
fetchAndConvertRSS(rssUrl3,limit3).then(console.log).catch(console.error);
export const bskyposts = await fetchAndConvertRSS(rssUrl3,limit3);

const envdenoinstall = Deno.env.get("DENO_INSTALL");
console.log("DENO_INSTALL:", envdenoinstall);
// const env = Deno.env.toObject();
// console.log("env:", env);