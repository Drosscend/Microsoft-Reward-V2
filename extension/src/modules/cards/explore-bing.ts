// Explore Bing card automation: searches in new tabs for explore-on-bing promotions

import { cdpSend, typeText, pressEnter, waitForPageLoad } from "../cdp";
import { logActivity } from "../logger";
import { randomInt } from "../../shared/utils";
import type { CardTarget } from "../../shared/types";
import { EARN_URL, performCardSection } from "./card-processor";

// Build the search query from the card description, in the account language
// e.g., "Recherchez sur Bing les derniers codes promo et réductions" → "les derniers codes promo et réductions"
// Falls back to the topic in the promotion name
// e.g., "FRFR_couponcodes_exploreonbing_activation_Evergreen" → "couponcodes"
export function getSearchQueryForExplore(target: CardTarget): string {
  const fromDescription = (target.description ?? "").replace(/^.*?\bBing\b[\s,:]*/i, "").trim();
  if (fromDescription) return fromDescription;

  const match = target.name.match(/_([a-z]+(?:_[a-z]+)*)_exploreonbing_/i);
  return match ? match[1].toLowerCase().replace(/_/g, " ") : target.title;
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

export async function performExploreBing(tabId: number, targets: CardTarget[]): Promise<void> {
  await performCardSection(tabId, {
    pageUrl: EARN_URL,
    sectionSelector: "section#exploreonbing",
    stateKey: "exploreBing",
    label: "Explore Bing",
    targets,
    onNewTab: async (newTabId, target) => {
      const query = getSearchQueryForExplore(target);
      await logActivity("info", `Searching: "${query}"`);
      await searchInNewTab(newTabId, query);
    },
  });
}
