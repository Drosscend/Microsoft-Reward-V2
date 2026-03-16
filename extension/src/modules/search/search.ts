// Search orchestration: performNextSearch + startSearchPhase

import { cdpSend, typeText, pressEnter, pressKey, waitForPageLoad } from "../cdp";
import { logActivity } from "../logger";
import { fetchRewardsInfo } from "../rewards";
import { getState, updateState } from "../state";
import { ensureTab } from "../tabs";
import { randomInt } from "../../shared/utils";
import { simulateHumanBehavior } from "./human-behavior";
import { getSearchTerms } from "./terms";

// 80% chance: 20-90s, 20% chance: long pause 1-3min (simulates reading a result)
function nextSearchDelay(): number {
  if (Math.random() < 0.2) {
    return randomInt(60, 180) / 60;
  }
  return randomInt(20, 90) / 60;
}

export async function performNextSearch(stopSearches: () => Promise<void>): Promise<void> {
  const state = await getState();
  if (!state.isRunning) return;

  if (state.currentIndex >= state.total) {
    await stopSearches();
    return;
  }

  const terms = await getSearchTerms();
  if (terms.length === 0) {
    await logActivity("error", "No search terms available, stopping");
    await stopSearches();
    return;
  }
  const termIndex = state.currentIndex % terms.length;
  const searchTerm = terms[termIndex];

  try {
    const tabId = await ensureTab(state);

    // Focus and select existing text in the search box
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector("#sb_form_q");
        if (input) { input.focus(); input.select(); }
      })()`,
    });

    await new Promise((r) => setTimeout(r, randomInt(200, 500)));

    // Clear existing text
    await pressKey(tabId, "Backspace");
    await new Promise((r) => setTimeout(r, randomInt(100, 300)));

    // Type the search term character by character
    await typeText(tabId, searchTerm);
    await new Promise((r) => setTimeout(r, randomInt(300, 800)));

    // Press Enter
    await pressEnter(tabId);

    // Wait for page to load
    await waitForPageLoad(tabId);

    // Simulate human behavior
    await simulateHumanBehavior(tabId);

    // Update state atomically
    const updatedState = await updateState((s) => {
      if (!s.isRunning) return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning) return;

    await logActivity("info", `Searched: "${searchTerm}" (${updatedState.currentIndex}/${updatedState.total} PC)`);

    // Refresh rewards info after each search
    fetchRewardsInfo().catch((e) => console.warn("[MSR] Background rewards refresh failed:", e));

    // Schedule next search with human-like delay
    chrome.alarms.create("next-search", { delayInMinutes: nextSearchDelay() });
  } catch (error) {
    logActivity("error", `Search error: "${searchTerm}" — ${error}`);
    // Continue to next search despite error
    const updatedState = await updateState((s) => {
      if (!s.isRunning) return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning) return;
    chrome.alarms.create("next-search", { delayInMinutes: nextSearchDelay() });
  }
}

// Helper to start the alarm-based search phase
export async function startSearchPhase(remaining: number, hasCardPhases: boolean, tabId: number): Promise<void> {
  if (remaining > 0) {
    // Navigate back to Bing for searches
    if (hasCardPhases) {
      await cdpSend(tabId, "Page.navigate", { url: "https://www.bing.com" });
      await waitForPageLoad(tabId);
    }

    await logActivity("info", `Starting PC search phase (${remaining} searches)`);
    chrome.alarms.create("next-search", { delayInMinutes: 0.01 });
  }
}
