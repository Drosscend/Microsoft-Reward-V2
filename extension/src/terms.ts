// Search term management: trending + static fallback

import { SEARCH_TERMS as STATIC_TERMS } from "./search-terms";
import { shuffle } from "./utils";

const GOOGLE_TRENDS_RSS =
  "https://trends.google.fr/trends/trendingsearches/daily/rss?geo=FR";

const TITLE_REGEX = /<title>([^<]+)<\/title>/;

async function fetchTrendingTerms(): Promise<string[]> {
  try {
    const resp = await fetch(GOOGLE_TRENDS_RSS);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const xml = await resp.text();

    const titles: string[] = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
      const titleMatch = match[0].match(TITLE_REGEX);
      if (titleMatch?.[1]) {
        titles.push(titleMatch[1].trim());
      }
    }

    if (titles.length > 0) {
      console.log(`[MSR] Fetched ${titles.length} trending terms from Google Trends`);
      return titles;
    }
  } catch (error) {
    console.warn("[MSR] Failed to fetch trending terms:", error);
  }

  return [];
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
  console.log(
    `[MSR] Search terms ready: ${trending.length} trending + ${terms.length - trending.length} static = ${terms.length} total`,
  );
  return terms;
}
