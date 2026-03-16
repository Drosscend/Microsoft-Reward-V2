// Service worker: orchestration via chrome.debugger CDP

import { cdpSend, waitForPageLoad } from "../modules/cdp";
import { performDailyCards, performExploreBing, performMoreActivities } from "../modules/cards";
import { setIconDefault, setIconRunning } from "../modules/icon";
import { clearActivityLog, logActivity } from "../modules/logger";
import { fetchCardFilters, fetchRewardsInfo, getRemainingSearches } from "../modules/rewards";
import { performNextSearch, startSearchPhase, getSearchTerms } from "../modules/search";
import { getDefaultState, getState, setState, updateState } from "../modules/state";
import type { BotState, PopupToWorkerMessage, SearchMode } from "../shared/types";

// --- Orchestration ---

async function startSearches(modes: SearchMode[], dailyCards: boolean, moreActivities: boolean, exploreBing: boolean): Promise<void> {
  const pcRequested = modes.includes("pc");

  // Only fetch search terms if PC searches are requested
  if (pcRequested) {
    await chrome.storage.session.remove("searchTerms");
    const terms = await getSearchTerms();

    if (terms.length === 0) {
      await logActivity("error", "Cannot start — no search terms available (all feeds failed)");
      await setState({
        ...getDefaultState(),
        error: "No search terms available — check your internet connection",
      });
      return;
    }
  }

  // Fetch rewards info before starting
  await fetchRewardsInfo();

  // Check remaining PC searches
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

  // Hide navigator.webdriver flag set by chrome.debugger
  await cdpSend(tabId, "Page.addScriptToEvaluateOnNewDocument", {
    source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })",
  });

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
  await setIconRunning();

  await logActivity("info", "Bot started");

  // Fetch API-based card filters (skip completed + zero-point cards)
  const cardFilters = (dailyCards || moreActivities || exploreBing) ? await fetchCardFilters() : null;

  // Run reward card phases synchronously before searches
  const hasCardPhases = dailyCards || moreActivities || exploreBing;

  if (dailyCards) {
    const indices = cardFilters?.dailyCards ?? [];
    if (indices.length > 0) {
      await updateState((s) => ({
        ...s,
        dailyCards: { isActive: true, currentCard: 0, totalCards: indices.length },
      }));
    }

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

  // Navigate to rewards page once for all card phases that need it.
  // Daily cards navigates only when it has actionable items — if it returned
  // early (0 actionable), we still need to navigate for the remaining phases.
  const needsRewardsNav = moreActivities || exploreBing;
  const dailyCardsNavigated = dailyCards && (cardFilters?.dailyCards ?? []).length > 0;
  if (needsRewardsNav && !dailyCardsNavigated) {
    await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
    await waitForPageLoad(tabId);
  }

  if (moreActivities) {
    const names = cardFilters?.moreActivities ?? [];
    if (names.length > 0) {
      await updateState((s) => ({
        ...s,
        moreActivities: { isActive: true, currentCard: 0, totalCards: names.length },
      }));
    }

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
    if (names.length > 0) {
      await updateState((s) => ({
        ...s,
        exploreBing: { isActive: true, currentCard: 0, totalCards: names.length },
      }));
    }

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

  // Refresh rewards info after card phases so progress bars reflect completion
  if (hasCardPhases) {
    await fetchRewardsInfo();
  }

  // If PC searches are needed, continue with alarm-based flow
  if (remaining > 0) {
    await startSearchPhase(remaining, hasCardPhases, tabId);
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

  // Fetch updated rewards info BEFORE resetting state
  // so progress bars transition smoothly from bot values to API values
  await fetchRewardsInfo();
  await setState(getDefaultState());
  await setIconDefault();
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
    performNextSearch(stopSearches);
  }
});

chrome.debugger.onDetach.addListener(async (source) => {
  const state = await getState();
  if (state.isRunning && source.tabId === state.tabId) {
    await logActivity("warn", "Debugger detached unexpectedly, stopping");
    await chrome.alarms.clear("next-search");
    await setState({ ...state, isRunning: false, error: "Debugger detached" });
    await setIconDefault();
  }
});

// Set default icon on service worker startup
setIconDefault().catch(() => {});

