// Service worker: orchestration via chrome.debugger CDP

import { cdpSend, typeText, pressEnter, pressKey, waitForPageLoad } from "./cdp";
import { simulateHumanBehavior } from "./human-behavior";
import { fetchRewardsInfo, getRemainingSearches } from "./rewards";
import { getDefaultState, getState, setState, updateState } from "./state";
import { ensureTab } from "./tab-manager";
import { getSearchTerms } from "./terms";
import type { BotState, PopupToWorkerMessage, SearchMode } from "./types";
import { randomInt } from "./utils";

const PC_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1";

// --- Main search logic ---

async function performNextSearch(): Promise<void> {
  const state = await getState();
  if (!state.isRunning) return;

  // If current mode is done, move to next mode
  if (state.currentIndex >= state.total) {
    const nextModeIndex = state.currentModeIndex + 1;
    if (nextModeIndex >= state.modes.length) {
      await stopSearches();
      return;
    }

    // Move to next mode
    const nextMode = state.modes[nextModeIndex];
    const nextTotal = await getRemainingSearches(nextMode);
    state.currentModeIndex = nextModeIndex;
    state.mode = nextMode;
    state.currentIndex = 0;
    state.total = nextTotal;
    await setState(state);

    // Skip this mode too if already complete
    if (nextTotal === 0) {
      await performNextSearch();
      return;
    }
  }

  const mode = state.modes[state.currentModeIndex];
  const terms = await getSearchTerms();
  const termIndex = state.currentIndex % terms.length;
  const searchTerm = terms[termIndex];

  try {
    const tabId = await ensureTab(state);

    // Set user agent for the current mode
    if (mode === "mobile") {
      await cdpSend(tabId, "Emulation.setUserAgentOverride", {
        userAgent: MOBILE_USER_AGENT,
      });
      await cdpSend(tabId, "Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 3,
        mobile: true,
      });
    } else {
      await cdpSend(tabId, "Emulation.setUserAgentOverride", {
        userAgent: PC_USER_AGENT,
      });
      await cdpSend(tabId, "Emulation.clearDeviceMetricsOverride");
    }

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

    // Refresh rewards info after each search
    fetchRewardsInfo().catch((e) => console.warn("[MSR] Background rewards refresh failed:", e));

    // Schedule next search with random delay (3-6s)
    const delayMinutes = randomInt(3, 6) / 60;
    chrome.alarms.create("next-search", { delayInMinutes: delayMinutes });
  } catch (error) {
    console.error(`[MSR] Error during search "${searchTerm}":`, error);
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

async function startSearches(modes: SearchMode[]): Promise<void> {
  // Clear cached terms so we get fresh trending topics
  await chrome.storage.session.remove("searchTerms");
  await getSearchTerms();

  // Fetch rewards info before starting
  await fetchRewardsInfo();

  // Filter out modes that are already complete
  const modesWithRemaining: { mode: SearchMode; remaining: number }[] = [];
  for (const mode of modes) {
    const remaining = await getRemainingSearches(mode);
    if (remaining > 0) {
      modesWithRemaining.push({ mode, remaining });
    } else {
      console.log(`[MSR] Skipping ${mode} searches — already complete`);
    }
  }

  // Nothing to do
  if (modesWithRemaining.length === 0) {
    console.log("[MSR] All selected search modes are already complete");
    await setState({
      ...getDefaultState(),
      error: "All searches already complete!",
    });
    return;
  }

  const activeModes = modesWithRemaining.map((m) => m.mode);

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

  const firstMode = activeModes[0];
  const state: BotState = {
    isRunning: true,
    mode: firstMode,
    currentIndex: 0,
    total: modesWithRemaining[0].remaining,
    modes: activeModes,
    currentModeIndex: 0,
    tabId,
    groupId,
  };

  await setState(state);

  // Fire first search via alarm to avoid blocking
  chrome.alarms.create("next-search", { delayInMinutes: 0.01 });
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
  await setState(getDefaultState());

  // Fetch updated rewards info after completion
  await fetchRewardsInfo();
}

// --- Top-level event listeners (required for MV3 service worker) ---

chrome.runtime.onMessage.addListener(
  (message: PopupToWorkerMessage, _sender, sendResponse) => {
    if (message.action === "start") {
      startSearches(message.modes)
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
    console.warn("[MSR] Debugger detached unexpectedly, stopping.");
    await chrome.alarms.clear("next-search");
    await setState({ ...state, isRunning: false, error: "Debugger detached" });
  }
});
