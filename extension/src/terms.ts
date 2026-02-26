// Search term management: trending + static fallback

import { logActivity } from "./logger";
import { SEARCH_TERMS as STATIC_TERMS } from "./search-terms";
import { shuffle } from "./utils";

// Multiple geo feeds to get more trending terms (~10 per feed)
const GOOGLE_TRENDS_FEEDS = [
  "https://trends.google.com/trending/rss?geo=FR",
  "https://trends.google.com/trending/rss?geo=US",
  "https://trends.google.com/trending/rss?geo=GB",
];

const TITLE_REGEX = /<title>([^<]+)<\/title>/;

function parseTrendingTitles(xml: string): string[] {
  const titles: string[] = [];
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const titleMatch = match[0].match(TITLE_REGEX);
    if (titleMatch?.[1]) {
      titles.push(titleMatch[1].trim());
    }
  }
  return titles;
}

async function fetchTrendingTerms(): Promise<string[]> {
  const results = await Promise.allSettled(
    GOOGLE_TRENDS_FEEDS.map(async (url) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return parseTrendingTitles(await resp.text());
    }),
  );

  const seen = new Set<string>();
  const titles: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const title of result.value) {
        const key = title.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          titles.push(title);
        }
      }
    } else {
      console.warn("[MSR] Failed to fetch one trending feed:", result.reason);
    }
  }

  if (titles.length > 0) {
    logActivity("info", `Fetched ${titles.length} trending terms from Google Trends`);
  }
  return titles;
}

export async function getSearchTerms(): Promise<string[]> {
  // Check if we already have terms cached for this session
  const cached = await chrome.storage.session.get("searchTerms");
  if (cached.searchTerms && Array.isArray(cached.searchTerms)) {
    return cached.searchTerms as string[];
  }

  // Fetch trending terms and mix with static fallback
  const trending = await fetchTrendingTerms();
  const staticShuffled = shuffle(STATIC_TERMS);

  // Trending first, then fill with static terms (no duplicates)
  const combined = [...trending];
  const lowerSet = new Set(combined.map((t) => t.toLowerCase()));
  for (const term of staticShuffled) {
    if (!lowerSet.has(term.toLowerCase())) {
      combined.push(term);
      lowerSet.add(term.toLowerCase());
    }
  }

  // Shuffle everything for natural randomness
  const terms = shuffle(combined);

  await chrome.storage.session.set({ searchTerms: terms });
  await logActivity(
    "info",
    `Search terms ready: ${trending.length} trending + ${terms.length - trending.length} static = ${terms.length} total`,
  );
  return terms;
}
