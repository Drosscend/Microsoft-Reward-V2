// src/shared/utils.ts
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

// src/modules/cdp/cdp.ts
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
// src/modules/logger/logger.ts
var MAX_LOG_ENTRIES = 150;
var STORAGE_KEY = "activityLog";
var consoleMethods = {
  info: console.log,
  warn: console.warn,
  error: console.error
};
async function logActivity(level, message) {
  try {
    consoleMethods[level](`[MSR] ${message}`);
    const entry = {
      timestamp: Date.now(),
      level,
      message
    };
    const result = await chrome.storage.session.get(STORAGE_KEY);
    const log = result[STORAGE_KEY] ?? [];
    log.push(entry);
    if (log.length > MAX_LOG_ENTRIES) {
      log.splice(0, log.length - MAX_LOG_ENTRIES);
    }
    await chrome.storage.session.set({ [STORAGE_KEY]: log });
  } catch {}
}
async function clearActivityLog() {
  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: [] });
  } catch {}
}
// src/modules/state/state.ts
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
// src/modules/cards/card-processor.ts
async function waitForSectionRender(tabId, selector) {
  const maxWait = 1e4;
  const interval = 500;
  let elapsed = 0;
  while (elapsed < maxWait) {
    const result = await cdpSend(tabId, "Runtime.evaluate", {
      expression: `!!document.querySelector('${selector}')`,
      returnByValue: true
    });
    if (result?.result?.value)
      return;
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }
  throw new Error(`Section "${selector}" did not render within 10s`);
}
async function waitForTabComplete(tabId, timeout = 15000) {
  const interval = 500;
  let elapsed = 0;
  while (elapsed < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete")
      return;
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }
}
async function discoverCards(tabId, containerSelector) {
  const result = await cdpSend(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const container = document.querySelector('${containerSelector}');
      if (!container) return [];
      const cards = container.querySelectorAll('mee-card');
      return Array.from(cards).map((card, i) => {
        const rewardable = card.querySelector('[data-bi-id]');
        const dataBiId = rewardable ? rewardable.getAttribute('data-bi-id') : '';
        const link = card.querySelector('a.ds-card-sec') || card.querySelector('a');
        if (!link) return { index: i, dataBiId: dataBiId || '', x: 0, y: 0 };
        const rect = link.getBoundingClientRect();
        return {
          index: i,
          dataBiId: dataBiId || '',
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        };
      });
    })()`,
    returnByValue: true
  });
  return result?.result?.value ?? [];
}
async function getCardCoordinates(tabId, containerSelector, cardIndex) {
  const result = await cdpSend(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const container = document.querySelector('${containerSelector}');
      if (!container) return { x: 0, y: 0 };
      const cards = container.querySelectorAll('mee-card');
      const card = cards[${cardIndex}];
      if (!card) return { x: 0, y: 0 };
      const link = card.querySelector('a.ds-card-sec') || card.querySelector('a');
      if (!link) return { x: 0, y: 0 };
      const rect = link.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()`,
    returnByValue: true
  });
  return result?.result?.value ?? { x: 0, y: 0 };
}
async function scrollCardIntoView(tabId, containerSelector, cardIndex) {
  await cdpSend(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const container = document.querySelector('${containerSelector}');
      if (!container) return;
      const cards = container.querySelectorAll('mee-card');
      const card = cards[${cardIndex}];
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })()`
  });
}
async function cdpClick(tabId, x, y) {
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y
  });
  await new Promise((r) => setTimeout(r, randomInt(50, 150)));
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}
function setCardState(state, key, value) {
  return { ...state, [key]: value };
}
async function performCardSection(tabId, config, needsNavigation) {
  const { containerSelector, renderCheckSelector, stateKey, label, actionableNames } = config;
  await logActivity("info", `Starting ${label} phase`);
  if (needsNavigation) {
    await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
    await waitForPageLoad(tabId);
  }
  try {
    await waitForSectionRender(tabId, renderCheckSelector);
  } catch (e) {
    console.warn(`[MSR] ${label} not found, skipping:`, e);
    await updateState((s) => {
      const current = s[stateKey];
      return setCardState(s, stateKey, {
        isActive: false,
        currentCard: current?.totalCards ?? 0,
        totalCards: current?.totalCards ?? 0
      });
    });
    return;
  }
  await new Promise((r) => setTimeout(r, randomInt(500, 1000)));
  const cards = await discoverCards(tabId, containerSelector);
  const actionableCards = cards.filter((c) => actionableNames.includes(c.dataBiId));
  await logActivity("info", `Found ${actionableCards.length} actionable ${label} (${cards.length} in DOM)`);
  await updateState((s) => setCardState(s, stateKey, {
    isActive: true,
    currentCard: 0,
    totalCards: actionableCards.length
  }));
  if (actionableCards.length === 0) {
    await logActivity("info", `All ${label} already completed`);
    await updateState((s) => {
      const current = s[stateKey];
      return setCardState(s, stateKey, {
        isActive: false,
        currentCard: current?.totalCards ?? 0,
        totalCards: current?.totalCards ?? 0
      });
    });
    return;
  }
  for (let i = 0;i < actionableCards.length; i++) {
    const card = actionableCards[i];
    try {
      await scrollCardIntoView(tabId, containerSelector, card.index);
      await new Promise((r) => setTimeout(r, randomInt(300, 600)));
      const coords = await getCardCoordinates(tabId, containerSelector, card.index);
      if (coords.x === 0 && coords.y === 0) {
        console.warn(`[MSR] Could not get coordinates for ${label} card ${card.index}, skipping`);
        continue;
      }
      const tabsBefore = (await chrome.tabs.query({})).map((t) => t.id);
      await cdpClick(tabId, coords.x, coords.y);
      await logActivity("info", `Clicked ${label} ${i + 1}/${actionableCards.length}`);
      await new Promise((r) => setTimeout(r, 2000));
      const tabsAfter = await chrome.tabs.query({});
      const newTab = tabsAfter.find((t) => t.id && !tabsBefore.includes(t.id));
      if (newTab?.id) {
        await waitForTabComplete(newTab.id);
        if (config.onNewTab) {
          await config.onNewTab(newTab.id, card.dataBiId);
        } else {
          await new Promise((r) => setTimeout(r, randomInt(3000, 6000)));
        }
        try {
          await chrome.tabs.remove(newTab.id);
        } catch (e) {
          console.warn("[MSR] Could not close card tab:", e);
        }
      } else {
        await waitForPageLoad(tabId);
        await new Promise((r) => setTimeout(r, randomInt(3000, 6000)));
        await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
        await waitForPageLoad(tabId);
        try {
          await waitForSectionRender(tabId, renderCheckSelector);
        } catch {
          console.warn(`[MSR] ${label} not found after navigating back`);
        }
        await new Promise((r) => setTimeout(r, randomInt(500, 1000)));
      }
      await updateState((s) => {
        const current = s[stateKey];
        return setCardState(s, stateKey, {
          isActive: true,
          currentCard: i + 1,
          totalCards: current?.totalCards ?? actionableCards.length
        });
      });
      if (i < actionableCards.length - 1) {
        await new Promise((r) => setTimeout(r, randomInt(2000, 4000)));
      }
    } catch (error) {
      logActivity("error", `Error processing ${label} card ${card.dataBiId}: ${error}`);
    }
  }
  await updateState((s) => {
    const current = s[stateKey];
    return setCardState(s, stateKey, {
      isActive: false,
      currentCard: current?.currentCard ?? actionableCards.length,
      totalCards: current?.totalCards ?? actionableCards.length
    });
  });
  await logActivity("info", `${label} phase complete`);
}
async function performDailyCards(tabId, actionableNames) {
  if (actionableNames.length === 0) {
    logActivity("info", "Daily cards: nothing actionable");
    return;
  }
  await performCardSection(tabId, {
    containerSelector: "#daily-sets mee-card-group:not(.ng-hide)",
    renderCheckSelector: "#daily-sets mee-card-group mee-card",
    stateKey: "dailyCards",
    label: "Daily cards",
    actionableNames
  }, true);
}
async function performMoreActivities(tabId, actionableNames) {
  if (actionableNames.length === 0) {
    logActivity("info", "More activities: nothing actionable");
    return;
  }
  await performCardSection(tabId, {
    containerSelector: "#more-activities",
    renderCheckSelector: "#more-activities mee-card",
    stateKey: "moreActivities",
    label: "More activities",
    actionableNames
  }, false);
}
// src/modules/cards/explore-bing.ts
var EXPLORE_SEARCH_MAP = {
  shopping: "best online shopping deals",
  weather: "weather forecast this week",
  financemarket: "stock market prices today",
  streaming_services: "best streaming services comparison",
  cellphone_plans: "best cell phone plans",
  airline_tickets: "cheap flights airline tickets",
  bank_accounts: "best savings bank accounts",
  rental_cars: "car rental deals near me",
  beauty_and_hair_products: "best beauty products",
  all_inclusive_resorts: "all inclusive resort vacation deals"
};
function getSearchQueryForExplore(apiName) {
  const match = apiName.match(/_task\d+_(.+?)_exploreonbing_/);
  if (!match)
    return "trending topics today";
  const rawTopic = match[1].toLowerCase();
  if (EXPLORE_SEARCH_MAP[rawTopic])
    return EXPLORE_SEARCH_MAP[rawTopic];
  return rawTopic.replace(/_/g, " ");
}
async function searchInNewTab(newTabId, query) {
  await chrome.debugger.attach({ tabId: newTabId }, "1.3");
  await cdpSend(newTabId, "Page.enable");
  await cdpSend(newTabId, "Runtime.enable");
  try {
    await cdpSend(newTabId, "Runtime.evaluate", {
      expression: `(() => {
        const input = document.querySelector("#sb_form_q") || document.querySelector("input[type='search']") || document.querySelector("textarea[name='q']");
        if (input) { input.focus(); input.select(); }
      })()`
    });
    await new Promise((r) => setTimeout(r, randomInt(300, 600)));
    await typeText(newTabId, query);
    await new Promise((r) => setTimeout(r, randomInt(300, 600)));
    await pressEnter(newTabId);
    await waitForPageLoad(newTabId);
    await new Promise((r) => setTimeout(r, randomInt(2000, 4000)));
  } finally {
    try {
      await chrome.debugger.detach({ tabId: newTabId });
    } catch {}
  }
}
async function performExploreBing(tabId, actionableNames) {
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
    }
  }, false);
}
// src/modules/icon/icon.ts
var SIZES = [16, 32];
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function isInsideStar(px, py, cx, cy, outerR, innerR) {
  const spikes = 5;
  const vertices = [];
  for (let i = 0;i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = Math.PI * i / spikes - Math.PI / 2;
    vertices.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  let inside = false;
  for (let i = 0, j = vertices.length - 1;i < vertices.length; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if (yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
function createIcon(hex, size) {
  const [r, g, b] = hexToRgb(hex);
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  const radius = center - Math.max(1, size * 0.06);
  const starOuter = center * 0.52;
  const starInner = center * 0.22;
  for (let y = 0;y < size; y++) {
    for (let x = 0;x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        if (isInsideStar(x + 0.5, y + 0.5, center, center, starOuter, starInner)) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        } else {
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  return new ImageData(data, size, size);
}
async function setIcon(color) {
  const imageData = {};
  for (const size of SIZES) {
    imageData[String(size)] = createIcon(color, size);
  }
  await chrome.action.setIcon({ imageData });
}
var COLOR_DEFAULT = "#0078d4";
var COLOR_RUNNING = "#22c55e";
async function setIconDefault() {
  await setIcon(COLOR_DEFAULT);
}
async function setIconRunning() {
  await setIcon(COLOR_RUNNING);
}
// src/modules/rewards/rewards.ts
var FALLBACK_PC_SEARCHES = 30;
var POINTS_PER_SEARCH = 3;
function getUserLanguage(promos) {
  for (const p of promos) {
    if (p.complete && p.pointProgressMax > 0) {
      const match = p.name.match(/^([A-Z]{2})[A-Z]{2}_/);
      if (match)
        return match[1];
    }
  }
  return null;
}
function isVisiblePromo(name, userLang) {
  if (/^(WW_|Global_|NonEN_)/.test(name))
    return true;
  if (userLang && name.startsWith(userLang))
    return true;
  const localeMatch = name.match(/^([A-Z]{2})[A-Z_]/);
  if (localeMatch && userLang && localeMatch[1] !== userLang)
    return false;
  return true;
}
function isExploreBingPromo(name) {
  return name.includes("_exploreonbing_");
}
function isLockedPromo(promo) {
  return promo.attributes?.is_unlocked === "False";
}
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
    const dashboard = data?.dashboard;
    let dailyCardsProgress = null;
    if (dashboard?.dailySetPromotions) {
      const today = new Date;
      const dateKey = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
      const todayPromos = dashboard.dailySetPromotions[dateKey];
      if (todayPromos) {
        const withPoints = todayPromos.filter((p) => p.pointProgressMax > 0);
        dailyCardsProgress = {
          current: withPoints.filter((p) => p.complete).length,
          target: withPoints.length
        };
      }
    }
    let moreActivitiesProgress = null;
    let exploreBingProgress = null;
    const morePromos = dashboard?.morePromotions;
    if (morePromos) {
      const userLang = getUserLanguage(morePromos);
      const explore = morePromos.filter((p) => p.pointProgressMax > 0 && !isLockedPromo(p) && isExploreBingPromo(p.name));
      const regular = morePromos.filter((p) => p.pointProgressMax > 0 && !isLockedPromo(p) && !isExploreBingPromo(p.name) && isVisiblePromo(p.name, userLang));
      moreActivitiesProgress = {
        current: regular.filter((p) => p.complete).length,
        target: regular.length
      };
      exploreBingProgress = {
        current: explore.filter((p) => p.complete).length,
        target: explore.length
      };
    }
    const info = {
      points: userStatus.availablePoints ?? null,
      pcProgress: pc ? { current: pc.pointProgress, target: pc.pointProgressMax } : null,
      mobileProgress: mobile ? { current: mobile.pointProgress, target: mobile.pointProgressMax } : null,
      dailyCardsProgress,
      moreActivitiesProgress,
      exploreBingProgress,
      lastUpdated: Date.now()
    };
    await chrome.storage.session.set({ rewardsInfo: info });
    return info;
  } catch (error) {
    console.error("[MSR] Error fetching rewards info:", error);
    return null;
  }
}
async function fetchCardFilters() {
  try {
    const resp = await fetch("https://rewards.bing.com/api/getuserinfo", {
      credentials: "include"
    });
    if (!resp.ok) {
      console.warn("[MSR] Card filters: API returned", resp.status);
      return { dailyCards: [], moreActivities: [], exploreBing: [] };
    }
    const data = await resp.json();
    const dashboard = data?.dashboard;
    if (!dashboard) {
      console.warn("[MSR] Card filters: no dashboard in response");
      return { dailyCards: [], moreActivities: [], exploreBing: [] };
    }
    const dailyCards = [];
    const dailySetPromotions = dashboard.dailySetPromotions;
    if (dailySetPromotions) {
      const today = new Date;
      const dateKey = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;
      const todayPromos = dailySetPromotions[dateKey];
      if (todayPromos) {
        for (const promo of todayPromos) {
          if (!promo.complete && promo.pointProgressMax > 0) {
            dailyCards.push(promo.name);
          }
        }
        await logActivity("info", `Daily cards: ${dailyCards.length}/${todayPromos.length} actionable`);
      } else {
        console.warn(`[MSR] No daily set promotions for ${dateKey}`);
      }
    }
    const moreActivities = [];
    const exploreBing = [];
    const morePromotions = dashboard.morePromotions;
    if (morePromotions) {
      const userLang = getUserLanguage(morePromotions);
      for (const promo of morePromotions) {
        if (!promo.complete && promo.pointProgressMax > 0 && !isLockedPromo(promo)) {
          if (isExploreBingPromo(promo.name)) {
            exploreBing.push(promo.name);
          } else if (isVisiblePromo(promo.name, userLang)) {
            moreActivities.push(promo.name);
          }
        }
      }
      if (moreActivities.length > 0) {
        await logActivity("info", `More activities: ${moreActivities.length} actionable`);
      }
      if (exploreBing.length > 0) {
        await logActivity("info", `Explore Bing: ${exploreBing.length} actionable`);
      }
    }
    return { dailyCards, moreActivities, exploreBing };
  } catch (error) {
    console.error("[MSR] Error fetching card filters:", error);
    return { dailyCards: [], moreActivities: [], exploreBing: [] };
  }
}
async function getRemainingSearches() {
  const result = await chrome.storage.session.get("rewardsInfo");
  const info = result.rewardsInfo;
  if (!info)
    return FALLBACK_PC_SEARCHES;
  const progress = info.pcProgress;
  if (!progress)
    return FALLBACK_PC_SEARCHES;
  const remainingPoints = progress.target - progress.current;
  if (remainingPoints <= 0)
    return 0;
  return Math.ceil(remainingPoints / POINTS_PER_SEARCH);
}
// src/modules/tabs/tab-manager.ts
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
// src/modules/search/human-behavior.ts
async function simulateMouseMovements(tabId) {
  const moves = randomInt(2, 4);
  let x = randomInt(200, 600);
  let y = randomInt(150, 400);
  for (let i = 0;i < moves; i++) {
    x += randomInt(-150, 150);
    y += randomInt(-100, 100);
    x = Math.max(50, Math.min(1200, x));
    y = Math.max(50, Math.min(700, y));
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y
    });
    await new Promise((r) => setTimeout(r, randomInt(100, 400)));
  }
}
async function simulateScrolling(tabId) {
  const steps = randomInt(2, 5);
  for (let i = 0;i < steps; i++) {
    const distance = randomInt(100, 350);
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `window.scrollBy({ top: ${distance}, behavior: "smooth" })`
    });
    await new Promise((r) => setTimeout(r, randomInt(800, 2500)));
  }
}
async function simulateResultClick(tabId) {
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
    if (!href)
      return;
    const state = await getState();
    const newTab = await chrome.tabs.create({ url: href, active: false });
    if (state.groupId !== null && newTab.id) {
      try {
        await chrome.tabs.group({ tabIds: [newTab.id], groupId: state.groupId });
      } catch (e) {
        console.warn("[MSR] Could not add tab to group:", e);
      }
    }
    await new Promise((r) => setTimeout(r, randomInt(5000, 15000)));
    if (newTab.id) {
      try {
        await chrome.tabs.remove(newTab.id);
      } catch (e) {
        console.warn("[MSR] Could not close tab:", e);
      }
    }
  } catch (e) {
    console.warn("[MSR] Error during result click simulation:", e);
  }
}
async function simulateHumanBehavior(tabId) {
  await new Promise((r) => setTimeout(r, randomInt(3000, 8000)));
  await simulateScrolling(tabId);
  if (Math.random() < 0.7) {
    await simulateMouseMovements(tabId);
  }
  if (Math.random() < 0.3) {
    await simulateResultClick(tabId);
  }
}

// src/modules/search/terms.ts
var GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=FR";
var GOOGLE_AUTOCOMPLETE = "https://www.google.com/complete/search?client=firefox&hl=fr&q=";
var TITLE_REGEX = /<title>([^<]+)<\/title>/;
var EXPAND_LETTERS = "abcdefghijklmnopqrstuvwxyz";
function parseTrendingTitles(xml) {
  const titles = [];
  const itemRegex = /<item>[\s\S]*?<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const titleMatch = match[0].match(TITLE_REGEX);
    if (titleMatch?.[1]) {
      titles.push(titleMatch[1].trim());
    }
  }
  return titles;
}
async function fetchTrendingSeeds() {
  try {
    const resp = await fetch(GOOGLE_TRENDS_RSS);
    if (!resp.ok)
      throw new Error(`HTTP ${resp.status}`);
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
async function fetchAutocompleteSuggestions(query) {
  try {
    const resp = await fetch(GOOGLE_AUTOCOMPLETE + encodeURIComponent(query));
    if (!resp.ok)
      return [];
    const data = await resp.json();
    return data[1] ?? [];
  } catch {
    return [];
  }
}
function pickRandomLetters(count) {
  const letters = [];
  const available = EXPAND_LETTERS.split("");
  for (let i = 0;i < count; i++) {
    const idx = randomInt(0, available.length - 1);
    letters.push(available.splice(idx, 1)[0]);
  }
  return letters;
}
async function expandWithAutocomplete(seeds) {
  const seen = new Set(seeds.map((s) => s.toLowerCase()));
  const expanded = [...seeds];
  for (const seed of seeds) {
    const suggestions = await fetchAutocompleteSuggestions(seed);
    for (const s of suggestions) {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        expanded.push(s);
      }
    }
    await new Promise((r) => setTimeout(r, randomInt(200, 400)));
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
async function getSearchTerms() {
  const cached = await chrome.storage.session.get("searchTerms");
  if (cached.searchTerms && Array.isArray(cached.searchTerms) && cached.searchTerms.length > 0) {
    return cached.searchTerms;
  }
  const seeds = await fetchTrendingSeeds();
  if (seeds.length === 0) {
    logActivity("error", "No trending seeds fetched — cannot generate search terms");
    return [];
  }
  const expanded = await expandWithAutocomplete(seeds);
  const terms = shuffle(expanded);
  await chrome.storage.session.set({ searchTerms: terms });
  await logActivity("info", `Search terms ready: ${seeds.length} seeds expanded to ${terms.length} unique terms`);
  return terms;
}

// src/modules/search/search.ts
function nextSearchDelay() {
  if (Math.random() < 0.2) {
    return randomInt(60, 180) / 60;
  }
  return randomInt(20, 90) / 60;
}
async function performNextSearch(stopSearches) {
  const state = await getState();
  if (!state.isRunning)
    return;
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
    await logActivity("info", `Searched: "${searchTerm}" (${updatedState.currentIndex}/${updatedState.total} PC)`);
    fetchRewardsInfo().catch((e) => console.warn("[MSR] Background rewards refresh failed:", e));
    chrome.alarms.create("next-search", { delayInMinutes: nextSearchDelay() });
  } catch (error) {
    logActivity("error", `Search error: "${searchTerm}" — ${error}`);
    const updatedState = await updateState((s) => {
      if (!s.isRunning)
        return s;
      return { ...s, currentIndex: s.currentIndex + 1 };
    });
    if (!updatedState.isRunning)
      return;
    chrome.alarms.create("next-search", { delayInMinutes: nextSearchDelay() });
  }
}
async function startSearchPhase(remaining, hasCardPhases, tabId) {
  if (remaining > 0) {
    if (hasCardPhases) {
      await cdpSend(tabId, "Page.navigate", { url: "https://www.bing.com" });
      await waitForPageLoad(tabId);
    }
    await logActivity("info", `Starting PC search phase (${remaining} searches)`);
    chrome.alarms.create("next-search", { delayInMinutes: 0.01 });
  }
}
// src/workers/background.ts
async function startSearches(modes, dailyCards, moreActivities, exploreBing) {
  const pcRequested = modes.includes("pc");
  if (pcRequested) {
    await chrome.storage.session.remove("searchTerms");
    const terms = await getSearchTerms();
    if (terms.length === 0) {
      await logActivity("error", "Cannot start — no search terms available (all feeds failed)");
      await setState({
        ...getDefaultState(),
        error: "No search terms available — check your internet connection"
      });
      return;
    }
  }
  await fetchRewardsInfo();
  let remaining = 0;
  if (pcRequested) {
    remaining = await getRemainingSearches();
    if (remaining === 0) {
      logActivity("info", "Skipping PC searches — already complete");
    }
  }
  if (remaining === 0 && !dailyCards && !moreActivities && !exploreBing) {
    logActivity("info", "All selected tasks are already complete");
    await setState({
      ...getDefaultState(),
      error: "All searches already complete!"
    });
    return;
  }
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
  await cdpSend(tabId, "Page.addScriptToEvaluateOnNewDocument", {
    source: "Object.defineProperty(navigator, 'webdriver', { get: () => undefined })"
  });
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
  const state = {
    isRunning: true,
    mode: "pc",
    currentIndex: 0,
    total: remaining,
    modes: ["pc"],
    currentModeIndex: 0,
    tabId,
    groupId
  };
  await setState(state);
  await setIconRunning();
  await logActivity("info", "Bot started");
  const cardFilters = dailyCards || moreActivities || exploreBing ? await fetchCardFilters() : null;
  const hasCardPhases = dailyCards || moreActivities || exploreBing;
  if (dailyCards) {
    const indices = cardFilters?.dailyCards ?? [];
    if (indices.length > 0) {
      await updateState((s) => ({
        ...s,
        dailyCards: { isActive: true, currentCard: 0, totalCards: indices.length }
      }));
    }
    try {
      await performDailyCards(tabId, indices);
    } catch (error) {
      logActivity("error", `Daily cards phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        dailyCards: s.dailyCards ? { ...s.dailyCards, isActive: false } : { isActive: false, currentCard: 0, totalCards: 0 }
      }));
    }
  }
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
        moreActivities: { isActive: true, currentCard: 0, totalCards: names.length }
      }));
    }
    try {
      await performMoreActivities(tabId, names);
    } catch (error) {
      logActivity("error", `More activities phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        moreActivities: s.moreActivities ? { ...s.moreActivities, isActive: false } : { isActive: false, currentCard: 0, totalCards: 0 }
      }));
    }
  }
  if (exploreBing) {
    const names = cardFilters?.exploreBing ?? [];
    if (names.length > 0) {
      await updateState((s) => ({
        ...s,
        exploreBing: { isActive: true, currentCard: 0, totalCards: names.length }
      }));
    }
    try {
      await performExploreBing(tabId, names);
    } catch (error) {
      logActivity("error", `Explore Bing phase failed: ${error}`);
      await updateState((s) => ({
        ...s,
        exploreBing: s.exploreBing ? { ...s.exploreBing, isActive: false } : { isActive: false, currentCard: 0, totalCards: 0 }
      }));
    }
  }
  if (hasCardPhases) {
    await fetchRewardsInfo();
  }
  if (remaining > 0) {
    await startSearchPhase(remaining, hasCardPhases, tabId);
  } else {
    await stopSearches();
  }
}
async function stopSearches() {
  const state = await getState();
  if (state.tabId !== null) {
    try {
      await chrome.debugger.detach({ tabId: state.tabId });
    } catch {}
  }
  await chrome.alarms.clear("next-search");
  await logActivity("info", "Bot stopped");
  await fetchRewardsInfo();
  await setState(getDefaultState());
  await setIconDefault();
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "start") {
    startSearches(message.modes, message.dailyCards, message.moreActivities, message.exploreBing).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
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
  if (message.action === "clear-log") {
    clearActivityLog().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
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
setIconDefault().catch(() => {});
