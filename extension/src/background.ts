// Service worker: orchestration via chrome.debugger CDP

import { cdpSend, typeText, pressEnter, pressKey, waitForPageLoad } from "./cdp";
import { performDailyCards, performExploreBing, performMoreActivities } from "./daily-cards";
import { simulateHumanBehavior } from "./human-behavior";
import { clearActivityLog, logActivity } from "./logger";
import { fetchCardFilters, fetchRewardsInfo, getRemainingSearches } from "./rewards";
import { getDefaultState, getState, setState, updateState } from "./state";
import { ensureTab } from "./tab-manager";
import { getSearchTerms } from "./terms";
import type { BotState, PopupToWorkerMessage, SearchMode } from "./types";
import { randomInt } from "./utils";

const PC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

// --- Main search logic ---

async function performNextSearch(): Promise<void> {
  const state = await getState();
  if (!state.isRunning) return;

  if (state.currentIndex >= state.total) {
    await stopSearches();
    return;
  }

  const terms = await getSearchTerms();
  const termIndex = state.currentIndex % terms.length;
  const searchTerm = terms[termIndex];

  try {
    const tabId = await ensureTab(state);

    await cdpSend(tabId, "Emulation.setUserAgentOverride", {
      userAgent: PC_USER_AGENT,
    });

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

    // Schedule next search with random delay (3-6s)
    const delayMinutes = randomInt(3, 6) / 60;
    chrome.alarms.create("next-search", { delayInMinutes: delayMinutes });
  } catch (error) {
    logActivity("error", `Search error: "${searchTerm}" — ${error}`);
    // Continue to next search despite error
    const updatedState = await updateState((s) => {
      if (!s.isRunning) return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning) return;
    const delayMinutes = randomInt(3, 6) / 60;
    chrome.alarms.create("next-search", { delayInMinutes: delayMinutes });
  }
}

async function startSearches(modes: SearchMode[], dailyCards: boolean, moreActivities: boolean, exploreBing: boolean): Promise<void> {
  // Clear cached terms so we get fresh trending topics
  await chrome.storage.session.remove("searchTerms");
  await getSearchTerms();

  // Fetch rewards info before starting
  await fetchRewardsInfo();

  // Check remaining PC searches
  const pcRequested = modes.includes("pc");
  let remaining = 0;
  if (pcRequested) {
    remaining = await getRemainingSearches();
    if (remaining === 0) {
      logActivity("info", "Skipping PC searches — already complete");
    }
  }

  // Nothing to do at all
  if (remaining === 0 && !dailyCards && !moreActivities && !exploreBing) {
    logActivity("info", "All selected tasks are already complete");
    await setState({
      ...getDefaultState(),
      error: "All searches already complete!",
    });
    return;
  }

  // Find or create a Bing tab
  const tabs = await chrome.tabs.query({ url: "https://*.bing.com/*" });
  let tabId: number;

  if (tabs.length > 0 && tabs[0].id) {
    tabId = tabs[0].id;
    await chrome.tabs.update(tabId, { active: true });
  } else {
    const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
    tabId = tab.id!;
  }

  // Create a tab group for all search-related tabs
  let groupId: number | null = null;
  try {
    groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: "MS Rewards", color: "blue" });
  } catch (error) {
    console.warn("[MSR] Could not create tab group:", error);
  }

  // Attach debugger
  await chrome.debugger.attach({ tabId }, "1.3");

  // Enable required CDP domains
  await cdpSend(tabId, "Page.enable");
  await cdpSend(tabId, "Runtime.enable");

  // Wait for the tab to be fully loaded
  await new Promise<void>((resolve) => {
    const checkReady = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (tab.status === "complete") resolve();
        else setTimeout(checkReady, 500);
      });
    };
    checkReady();
  });

  const state: BotState = {
    isRunning: true,
    mode: "pc",
    currentIndex: 0,
    total: remaining,
    modes: ["pc"],
    currentModeIndex: 0,
    tabId,
    groupId,
  };

  await setState(state);

  await logActivity("info", "Bot started");

  // Fetch API-based card filters (skip completed + zero-point cards)
  const cardFilters = (dailyCards || moreActivities || exploreBing) ? await fetchCardFilters() : null;

  // Run reward card phases synchronously before searches
  const hasCardPhases = dailyCards || moreActivities || exploreBing;

  if (dailyCards) {
    const indices = cardFilters?.dailyCards ?? [];
    await updateState((s) => ({
      ...s,
      dailyCards: { isActive: true, currentCard: 0, totalCards: indices.length },
    }));

    try {
      await performDailyCards(tabId, indices);
    } catch (error) {
      logActivity("error", `Daily cards phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        dailyCards: s.dailyCards
          ? { ...s.dailyCards, isActive: false }
          : { isActive: false, currentCard: 0, totalCards: 0 },
      }));
    }
  }

  // Navigate to rewards page once for all card phases that need it
  const needsRewardsNav = moreActivities || exploreBing;
  if (needsRewardsNav && !dailyCards) {
    await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
    await waitForPageLoad(tabId);
  }

  if (moreActivities) {
    const names = cardFilters?.moreActivities ?? [];
    await updateState((s) => ({
      ...s,
      moreActivities: { isActive: true, currentCard: 0, totalCards: names.length },
    }));

    try {
      await performMoreActivities(tabId, names);
    } catch (error) {
      logActivity("error", `More activities phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        moreActivities: s.moreActivities
          ? { ...s.moreActivities, isActive: false }
          : { isActive: false, currentCard: 0, totalCards: 0 },
      }));
    }
  }

  if (exploreBing) {
    const names = cardFilters?.exploreBing ?? [];
    await updateState((s) => ({
      ...s,
      exploreBing: { isActive: true, currentCard: 0, totalCards: names.length },
    }));

    try {
      await performExploreBing(tabId, names);
    } catch (error) {
      logActivity("error", `Explore Bing phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        exploreBing: s.exploreBing
          ? { ...s.exploreBing, isActive: false }
          : { isActive: false, currentCard: 0, totalCards: 0 },
      }));
    }
  }

  // If PC searches are needed, continue with alarm-based flow
  if (remaining > 0) {
    // Navigate back to Bing for searches
    if (hasCardPhases) {
      await cdpSend(tabId, "Page.navigate", { url: "https://www.bing.com" });
      await waitForPageLoad(tabId);
    }

    await logActivity("info", `Starting PC search phase (${remaining} searches)`);
    chrome.alarms.create("next-search", { delayInMinutes: 0.01 });
  } else {
    // Only card phases were requested, we're done
    await stopSearches();
  }
}

async function stopSearches(): Promise<void> {
  const state = await getState();

  if (state.tabId !== null) {
    try {
      await chrome.debugger.detach({ tabId: state.tabId });
    } catch {
      // Already detached
    }
  }

  await chrome.alarms.clear("next-search");
  await logActivity("info", "Bot stopped");
  await setState(getDefaultState());

  // Fetch updated rewards info after completion
  await fetchRewardsInfo();
}

// --- Top-level event listeners (required for MV3 service worker) ---

chrome.runtime.onMessage.addListener(
  (message: PopupToWorkerMessage, _sender, sendResponse) => {
    if (message.action === "start") {
      startSearches(message.modes, message.dailyCards, message.moreActivities, message.exploreBing)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.action === "stop") {
      stopSearches()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.action === "fetch-rewards") {
      fetchRewardsInfo()
        .then((info) => sendResponse({ ok: true, info }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.action === "clear-log") {
      clearActivityLog()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "next-search") {
    performNextSearch();
  }
});

chrome.debugger.onDetach.addListener(async (source) => {
  const state = await getState();
  if (state.isRunning && source.tabId === state.tabId) {
    await logActivity("warn", "Debugger detached unexpectedly, stopping");
    await chrome.alarms.clear("next-search");
    await setState({ ...state, isRunning: false, error: "Debugger detached" });
  }
});
