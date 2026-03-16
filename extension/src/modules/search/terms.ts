// Search term management: Google Trends RSS + Google Autocomplete expansion

import { logActivity } from "../logger";
import { shuffle, randomInt } from "../../shared/utils";

const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=FR";
const GOOGLE_AUTOCOMPLETE = "https://www.google.com/complete/search?client=firefox&hl=fr&q=";

const TITLE_REGEX = /<title>([^<]+)<\/title>/;
const EXPAND_LETTERS = "abcdefghijklmnopqrstuvwxyz";

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

async function fetchTrendingSeeds(): Promise<string[]> {
  try {
    const resp = await fetch(GOOGLE_TRENDS_RSS);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const titles = parseTrendingTitles(await resp.text());
    if (titles.length > 0) {
      logActivity("info", `Fetched ${titles.length} trending seeds from Google Trends FR`);
    }
    return titles;
  } catch (error) {
    console.warn("[MSR] Failed to fetch Google Trends RSS:", error);
    return [];
  }
}

async function fetchAutocompleteSuggestions(query: string): Promise<string[]> {
  try {
    const resp = await fetch(GOOGLE_AUTOCOMPLETE + encodeURIComponent(query));
    if (!resp.ok) return [];
    const data = (await resp.json()) as [string, string[]];
    return data[1] ?? [];
  } catch {
    return [];
  }
}

function pickRandomLetters(count: number): string[] {
  const letters: string[] = [];
  const available = EXPAND_LETTERS.split("");
  for (let i = 0; i < count; i++) {
    const idx = randomInt(0, available.length - 1);
    letters.push(available.splice(idx, 1)[0]);
  }
  return letters;
}

async function expandWithAutocomplete(seeds: string[]): Promise<string[]> {
  const seen = new Set<string>(seeds.map((s) => s.toLowerCase()));
  const expanded: string[] = [...seeds];

  for (const seed of seeds) {
    // Direct autocomplete on the seed
    const suggestions = await fetchAutocompleteSuggestions(seed);
    for (const s of suggestions) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        expanded.push(s);
      }
    }
    await new Promise((r) => setTimeout(r, randomInt(200, 400)));

    // Expand with 3 random letters: "seed a", "seed m", "seed r"
    const letters = pickRandomLetters(3);
    for (const letter of letters) {
      const letterSuggestions = await fetchAutocompleteSuggestions(`${seed} ${letter}`);
      for (const s of letterSuggestions) {
        const key = s.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          expanded.push(s);
        }
      }
      await new Promise((r) => setTimeout(r, randomInt(200, 400)));
    }
  }

  return expanded;
}

export async function getSearchTerms(): Promise<string[]> {
  // Check if we already have terms cached for this session
  const cached = await chrome.storage.session.get("searchTerms");
  if (cached.searchTerms && Array.isArray(cached.searchTerms) && cached.searchTerms.length > 0) {
    return cached.searchTerms as string[];
  }

  // Fetch trending seeds from Google Trends RSS
  const seeds = await fetchTrendingSeeds();

  if (seeds.length === 0) {
    logActivity("error", "No trending seeds fetched — cannot generate search terms");
    return [];
  }

  // Expand seeds with Google Autocomplete
  const expanded = await expandWithAutocomplete(seeds);
  const terms = shuffle(expanded);

  await chrome.storage.session.set({ searchTerms: terms });
  await logActivity(
    "info",
    `Search terms ready: ${seeds.length} seeds expanded to ${terms.length} unique terms`,
  );
  return terms;
}
