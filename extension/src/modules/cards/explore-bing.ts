// Explore Bing cards: opens each card's bing.com destination in a new tab and searches its topic.
// Edge forbids extensions from scripting rewards.bing.com, so the other card sections stay manual.

import { cdpSend, typeText, pressEnter, waitForPageLoad } from "../cdp";
import { logActivity } from "../logger";
import { updateState } from "../state";
import { randomInt } from "../../shared/utils";
import type { CardTarget } from "../../shared/types";

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

async function waitForTabComplete(tabId: number, timeout = 15_000): Promise<void> {
  const interval = 500;
  for (let elapsed = 0; elapsed < timeout; elapsed += interval) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((r) => setTimeout(r, interval));
  }
}

async function searchExploreCard(target: CardTarget): Promise<void> {
  const tab = await chrome.tabs.create({ url: target.url, active: true });
  const tabId = tab.id!;

  try {
    await waitForTabComplete(tabId);
    const query = getSearchQueryForExplore(target);
    await logActivity("info", `Searching: "${query}"`);
    await searchInNewTab(tabId, query);
  } finally {
    await chrome.tabs.remove(tabId).catch(() => console.warn("[MSR] Could not close explore tab"));
  }
}

async function setProgress(isActive: boolean, currentCard: number, totalCards: number): Promise<void> {
  await updateState((s) => ({ ...s, exploreBing: { isActive, currentCard, totalCards } }));
}

export async function performExploreBing(targets: CardTarget[]): Promise<void> {
  if (targets.length === 0) {
    await logActivity("info", "Explore Bing: nothing actionable");
    return;
  }

  const total = targets.length;
  await logActivity("info", "Starting Explore Bing phase");
  await setProgress(true, 0, total);

  for (let i = 0; i < total; i++) {
    try {
      await searchExploreCard(targets[i]);
    } catch (error) {
      await logActivity("error", `Explore Bing card ${targets[i].name} failed: ${error}`);
    }

    await setProgress(true, i + 1, total);
    if (i < total - 1) await new Promise((r) => setTimeout(r, randomInt(2000, 4000)));
  }

  await setProgress(false, total, total);
  await logActivity("info", "Explore Bing phase complete");
}
