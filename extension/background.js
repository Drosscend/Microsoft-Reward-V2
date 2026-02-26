// src/utils.ts
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1;i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// src/cdp.ts
async function cdpSend(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}
async function typeText(tabId, text) {
  for (const char of text) {
    const delay = randomInt(50, 150);
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: char
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: char
    });
    await new Promise((r) => setTimeout(r, delay));
  }
}
async function pressEnter(tabId) {
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  });
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  });
}
async function pressKey(tabId, key) {
  const keyCode = key === "Backspace" ? 8 : 0;
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode
  });
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode
  });
}
async function waitForPageLoad(tabId) {
  await cdpSend(tabId, "Page.enable");
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(listener);
      resolve();
    }, 15000);
    function listener(source, method) {
      if (source.tabId === tabId && method === "Page.loadEventFired") {
        clearTimeout(timeout);
        chrome.debugger.onEvent.removeListener(listener);
        resolve();
      }
    }
    chrome.debugger.onEvent.addListener(listener);
  });
}

// src/state.ts
function getDefaultState() {
  return {
    isRunning: false,
    mode: "pc",
    currentIndex: 0,
    total: 0,
    modes: [],
    currentModeIndex: 0,
    tabId: null,
    groupId: null
  };
}
async function getState() {
  const result = await chrome.storage.session.get("botState");
  const state = result.botState;
  if (state && typeof state === "object" && typeof state.isRunning === "boolean") {
    return state;
  }
  return getDefaultState();
}
async function setState(state) {
  await chrome.storage.session.set({ botState: state });
}
var stateMutex = Promise.resolve();
async function updateState(fn) {
  let result;
  stateMutex = stateMutex.then(async () => {
    const current = await getState();
    result = await fn(current);
    await setState(result);
  });
  await stateMutex;
  return result;
}

// src/human-behavior.ts
async function simulateHumanBehavior(tabId) {
  await new Promise((r) => setTimeout(r, randomInt(500, 1500)));
  const steps = randomInt(1, 3);
  for (let i = 0;i < steps; i++) {
    const distance = randomInt(150, 400);
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `window.scrollBy({ top: ${distance}, behavior: "smooth" })`
    });
    await new Promise((r) => setTimeout(r, randomInt(200, 500)));
  }
  if (Math.random() < 0.5) {
    const x = randomInt(100, 1100);
    const y = randomInt(100, 600);
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y
    });
  }
  if (Math.random() < 0.25) {
    try {
      const result = await cdpSend(tabId, "Runtime.evaluate", {
        expression: `(() => {
          const links = document.querySelectorAll(".b_algo h2 a");
          if (links.length === 0) return null;
          const max = Math.min(links.length, 5);
          const idx = Math.floor(Math.random() * max);
          return links[idx].href;
        })()`,
        returnByValue: true
      });
      const href = result?.result?.value;
      if (href) {
        const state = await getState();
        const newTab = await chrome.tabs.create({ url: href, active: false });
        if (state.groupId !== null && newTab.id) {
          try {
            await chrome.tabs.group({ tabIds: [newTab.id], groupId: state.groupId });
          } catch (e) {
            console.warn("[MSR] Could not add tab to group:", e);
          }
        }
        await new Promise((r) => setTimeout(r, randomInt(2000, 5000)));
        if (newTab.id) {
          try {
            await chrome.tabs.remove(newTab.id);
          } catch (e) {
            console.warn("[MSR] Could not close tab:", e);
          }
        }
      }
    } catch (e) {
      console.warn("[MSR] Error during result click simulation:", e);
    }
  }
}

// src/rewards.ts
var FALLBACK_PC_SEARCHES = 30;
var FALLBACK_MOBILE_SEARCHES = 20;
var POINTS_PER_SEARCH = 3;
async function fetchRewardsInfo() {
  try {
    const resp = await fetch("https://rewards.bing.com/api/getuserinfo", {
      credentials: "include"
    });
    if (!resp.ok) {
      console.error("[MSR] Rewards API returned", resp.status);
      return null;
    }
    const data = await resp.json();
    const userStatus = data?.dashboard?.userStatus;
    if (!userStatus) {
      console.error("[MSR] Unexpected API response shape");
      return null;
    }
    const counters = userStatus.counters;
    const pc = counters?.pcSearch?.[0];
    const mobile = counters?.mobileSearch?.[0];
    const info = {
      points: userStatus.availablePoints ?? null,
      pcProgress: pc ? { current: pc.pointProgress, target: pc.pointProgressMax } : null,
      mobileProgress: mobile ? { current: mobile.pointProgress, target: mobile.pointProgressMax } : null,
      lastUpdated: Date.now()
    };
    await chrome.storage.session.set({ rewardsInfo: info });
    return info;
  } catch (error) {
    console.error("[MSR] Error fetching rewards info:", error);
    return null;
  }
}
async function getRemainingSearches(mode) {
  const result = await chrome.storage.session.get("rewardsInfo");
  const info = result.rewardsInfo;
  if (!info)
    return mode === "pc" ? FALLBACK_PC_SEARCHES : FALLBACK_MOBILE_SEARCHES;
  const progress = mode === "pc" ? info.pcProgress : info.mobileProgress;
  if (!progress)
    return mode === "pc" ? FALLBACK_PC_SEARCHES : FALLBACK_MOBILE_SEARCHES;
  const remainingPoints = progress.target - progress.current;
  if (remainingPoints <= 0)
    return 0;
  return Math.ceil(remainingPoints / POINTS_PER_SEARCH);
}

// src/tab-manager.ts
var isEnsuring = false;
async function ensureTab(state) {
  if (isEnsuring) {
    if (state.tabId !== null)
      return state.tabId;
    await new Promise((r) => setTimeout(r, 500));
    const fresh = await getState();
    if (fresh.tabId !== null)
      return fresh.tabId;
  }
  isEnsuring = true;
  try {
    let tabId = state.tabId;
    if (tabId !== null) {
      try {
        await chrome.tabs.get(tabId);
      } catch {
        tabId = null;
      }
    }
    if (tabId === null) {
      const tabs = await chrome.tabs.query({ url: "https://*.bing.com/*" });
      if (tabs.length > 0 && tabs[0].id) {
        tabId = tabs[0].id;
      } else {
        const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
        tabId = tab.id;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (state.groupId !== null) {
        try {
          await chrome.tabs.group({ tabIds: [tabId], groupId: state.groupId });
        } catch (e) {
          console.warn("[MSR] Could not add tab to group:", e);
        }
      }
      state.tabId = tabId;
      await setState(state);
    }
    try {
      await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: "1",
        returnByValue: true
      });
    } catch {
      try {
        await chrome.debugger.attach({ tabId }, "1.3");
      } catch (e) {
        console.warn("[MSR] Debugger attach failed (may already be attached):", e);
      }
      await cdpSend(tabId, "Page.enable");
      await cdpSend(tabId, "Runtime.enable");
    }
    return tabId;
  } finally {
    isEnsuring = false;
  }
}

// src/search-terms.ts
var SEARCH_TERMS = [
  "Actualités France",
  "Recettes de cuisine",
  "Météo",
  "Football",
  "Cinéma",
  "Santé",
  "Voyages",
  "Musique",
  "Technologies",
  "Mode",
  "Emploi",
  "Éducation",
  "Économie",
  "Politique",
  "Environnement",
  "Jeux vidéo",
  "Livres",
  "Sport",
  "Séries TV",
  "Art",
  "Science",
  "Histoire",
  "Animaux",
  "Automobile",
  "Bricolage",
  "Jardinage",
  "Beauté",
  "Bien-être",
  "Gastronomie",
  "Décoration",
  "Informatique",
  "Photographie",
  "Danse",
  "Théâtre",
  "Musées",
  "Astronomie",
  "Psychologie",
  "Philosophie",
  "Langues étrangères",
  "Yoga",
  "Méditation",
  "Écologie",
  "Recycling",
  "Énergies renouvelables",
  "Littérature",
  "Poésie",
  "Architecture",
  "Design",
  "Innovation",
  "Startups"
];

// src/terms.ts
var GOOGLE_TRENDS_RSS = "https://trends.google.fr/trends/trendingsearches/daily/rss?geo=FR";
var TITLE_REGEX = /<title>([^<]+)<\/title>/;
async function fetchTrendingTerms() {
  try {
    const resp = await fetch(GOOGLE_TRENDS_RSS);
    if (!resp.ok)
      throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    const titles = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    let match;
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
async function getSearchTerms() {
  const cached = await chrome.storage.session.get("searchTerms");
  if (cached.searchTerms && Array.isArray(cached.searchTerms)) {
    return cached.searchTerms;
  }
  const trending = await fetchTrendingTerms();
  const staticShuffled = shuffle(SEARCH_TERMS);
  const combined = [...trending];
  const lowerSet = new Set(combined.map((t) => t.toLowerCase()));
  for (const term of staticShuffled) {
    if (!lowerSet.has(term.toLowerCase())) {
      combined.push(term);
      lowerSet.add(term.toLowerCase());
    }
  }
  const terms = shuffle(combined);
  await chrome.storage.session.set({ searchTerms: terms });
  console.log(`[MSR] Search terms ready: ${trending.length} trending + ${terms.length - trending.length} static = ${terms.length} total`);
  return terms;
}

// src/background.ts
var PC_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
var MOBILE_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1";
async function performNextSearch() {
  const state = await getState();
  if (!state.isRunning)
    return;
  if (state.currentIndex >= state.total) {
    const nextModeIndex = state.currentModeIndex + 1;
    if (nextModeIndex >= state.modes.length) {
      await stopSearches();
      return;
    }
    const nextMode = state.modes[nextModeIndex];
    const nextTotal = await getRemainingSearches(nextMode);
    state.currentModeIndex = nextModeIndex;
    state.mode = nextMode;
    state.currentIndex = 0;
    state.total = nextTotal;
    await setState(state);
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
    if (mode === "mobile") {
      await cdpSend(tabId, "Emulation.setUserAgentOverride", {
        userAgent: MOBILE_USER_AGENT
      });
      await cdpSend(tabId, "Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 812,
        deviceScaleFactor: 3,
        mobile: true
      });
    } else {
      await cdpSend(tabId, "Emulation.setUserAgentOverride", {
        userAgent: PC_USER_AGENT
      });
      await cdpSend(tabId, "Emulation.clearDeviceMetricsOverride");
    }
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector("#sb_form_q");
        if (input) { input.focus(); input.select(); }
      })()`
    });
    await new Promise((r) => setTimeout(r, randomInt(200, 500)));
    await pressKey(tabId, "Backspace");
    await new Promise((r) => setTimeout(r, randomInt(100, 300)));
    await typeText(tabId, searchTerm);
    await new Promise((r) => setTimeout(r, randomInt(300, 800)));
    await pressEnter(tabId);
    await waitForPageLoad(tabId);
    await simulateHumanBehavior(tabId);
    const updatedState = await updateState((s) => {
      if (!s.isRunning)
        return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning)
      return;
    fetchRewardsInfo().catch((e) => console.warn("[MSR] Background rewards refresh failed:", e));
    const delayMinutes = randomInt(3, 6) / 60;
    chrome.alarms.create("next-search", { delayInMinutes: delayMinutes });
  } catch (error) {
    console.error(`[MSR] Error during search "${searchTerm}":`, error);
    const updatedState = await updateState((s) => {
      if (!s.isRunning)
        return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning)
      return;
    const delayMinutes = randomInt(3, 6) / 60;
    chrome.alarms.create("next-search", { delayInMinutes: delayMinutes });
  }
}
async function startSearches(modes) {
  await chrome.storage.session.remove("searchTerms");
  await getSearchTerms();
  await fetchRewardsInfo();
  const modesWithRemaining = [];
  for (const mode of modes) {
    const remaining = await getRemainingSearches(mode);
    if (remaining > 0) {
      modesWithRemaining.push({ mode, remaining });
    } else {
      console.log(`[MSR] Skipping ${mode} searches — already complete`);
    }
  }
  if (modesWithRemaining.length === 0) {
    console.log("[MSR] All selected search modes are already complete");
    await setState({
      ...getDefaultState(),
      error: "All searches already complete!"
    });
    return;
  }
  const activeModes = modesWithRemaining.map((m) => m.mode);
  const tabs = await chrome.tabs.query({ url: "https://*.bing.com/*" });
  let tabId;
  if (tabs.length > 0 && tabs[0].id) {
    tabId = tabs[0].id;
    await chrome.tabs.update(tabId, { active: true });
  } else {
    const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
    tabId = tab.id;
  }
  let groupId = null;
  try {
    groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: "MS Rewards", color: "blue" });
  } catch (error) {
    console.warn("[MSR] Could not create tab group:", error);
  }
  await chrome.debugger.attach({ tabId }, "1.3");
  await cdpSend(tabId, "Page.enable");
  await cdpSend(tabId, "Runtime.enable");
  await new Promise((resolve) => {
    const checkReady = () => {
      chrome.tabs.get(tabId, (tab) => {
        if (tab.status === "complete")
          resolve();
        else
          setTimeout(checkReady, 500);
      });
    };
    checkReady();
  });
  const firstMode = activeModes[0];
  const state = {
    isRunning: true,
    mode: firstMode,
    currentIndex: 0,
    total: modesWithRemaining[0].remaining,
    modes: activeModes,
    currentModeIndex: 0,
    tabId,
    groupId
  };
  await setState(state);
  chrome.alarms.create("next-search", { delayInMinutes: 0.01 });
}
async function stopSearches() {
  const state = await getState();
  if (state.tabId !== null) {
    try {
      await chrome.debugger.detach({ tabId: state.tabId });
    } catch {}
  }
  await chrome.alarms.clear("next-search");
  await setState(getDefaultState());
  await fetchRewardsInfo();
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "start") {
    startSearches(message.modes).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.action === "stop") {
    stopSearches().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message.action === "fetch-rewards") {
    fetchRewardsInfo().then((info) => sendResponse({ ok: true, info })).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
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
