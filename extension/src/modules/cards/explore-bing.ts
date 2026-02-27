// Explore Bing card automation: searches in new tabs for explore-on-bing promotions

import { cdpSend, typeText, pressEnter, waitForPageLoad } from "../cdp";
import { logActivity } from "../logger";
import { randomInt } from "../../shared/utils";
import { performCardSection } from "./card-processor";

// Known topic → search query mapping
const EXPLORE_SEARCH_MAP: Record<string, string> = {
  shopping: "best online shopping deals",
  weather: "weather forecast this week",
  financemarket: "stock market prices today",
  streaming_services: "best streaming services comparison",
  cellphone_plans: "best cell phone plans",
  airline_tickets: "cheap flights airline tickets",
  bank_accounts: "best savings bank accounts",
  rental_cars: "car rental deals near me",
  beauty_and_hair_products: "best beauty products",
  all_inclusive_resorts: "all inclusive resort vacation deals",
};

// Extract a search query from the API promotion name
// e.g., "NonEN_moreactivities_task14_financemarket_exploreonbing_..." → "stock market prices today"
// e.g., "ENUS_moreactivities_task35_CellPhone_Plans_exploreonbing_..." → "best cell phone plans"
function getSearchQueryForExplore(apiName: string): string {
  const match = apiName.match(/_task\d+_(.+?)_exploreonbing_/);
  if (!match) return "trending topics today";
  const rawTopic = match[1].toLowerCase();
  if (EXPLORE_SEARCH_MAP[rawTopic]) return EXPLORE_SEARCH_MAP[rawTopic];
  // Fallback: replace underscores with spaces
  return rawTopic.replace(/_/g, " ");
}

// Perform a search in a new tab (attach debugger, type, enter, wait, detach)
async function searchInNewTab(newTabId: number, query: string): Promise<void> {
  await chrome.debugger.attach({ tabId: newTabId }, "1.3");
  await cdpSend(newTabId, "Page.enable");
  await cdpSend(newTabId, "Runtime.enable");

  try {
    // Focus the search box
    await cdpSend(newTabId, "Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector("#sb_form_q") || document.querySelector("input[type='search']") || document.querySelector("textarea[name='q']");
        if (input) { input.focus(); input.select(); }
      })()`,
    });

    await new Promise((r) => setTimeout(r, randomInt(300, 600)));

    // Type the search query
    await typeText(newTabId, query);
    await new Promise((r) => setTimeout(r, randomInt(300, 600)));

    // Press Enter
    await pressEnter(newTabId);

    // Wait for results to load
    await waitForPageLoad(newTabId);
    await new Promise((r) => setTimeout(r, randomInt(2000, 4000)));
  } finally {
    try {
      await chrome.debugger.detach({ tabId: newTabId });
    } catch {
      // Already detached
    }
  }
}

export async function performExploreBing(tabId: number, actionableNames: string[]): Promise<void> {
  if (actionableNames.length === 0) {
    logActivity("info", "Explore Bing: nothing actionable");
    return;
  }

  await performCardSection(tabId, {
    containerSelector: "#explore-on-bing",
    renderCheckSelector: "#explore-on-bing mee-card",
    stateKey: "exploreBing",
    label: "Explore Bing",
    actionableNames,
    onNewTab: async (newTabId, cardName) => {
      const query = getSearchQueryForExplore(cardName);
      await logActivity("info", `Searching: "${query}"`);
      await searchInNewTab(newTabId, query);
    },
  }, false);
}
