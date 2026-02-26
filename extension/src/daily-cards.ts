// Card section automation: clicks reward cards on rewards.bing.com
// Handles both "daily-sets" and "more-activities" sections

import { cdpSend, typeText, pressEnter, waitForPageLoad } from "./cdp";
import { logActivity } from "./logger";
import type { BotState, DailyCardsState } from "./types";
import { updateState } from "./state";
import { randomInt } from "./utils";

type StateKey = "dailyCards" | "moreActivities" | "exploreBing";

interface CardSectionConfig {
  containerSelector: string;
  renderCheckSelector: string;
  stateKey: StateKey;
  label: string;
  // API promotion names that are incomplete + have points (matched via data-bi-id)
  actionableNames: string[];
  // Optional: handler called when a new tab opens (for explore cards that need a search)
  onNewTab?: (newTabId: number, cardName: string) => Promise<void>;
}

interface CardInfo {
  index: number;
  dataBiId: string;
  x: number;
  y: number;
}

// --- Shared helpers ---

async function waitForSectionRender(
  tabId: number,
  selector: string,
): Promise<void> {
  const maxWait = 10_000;
  const interval = 500;
  let elapsed = 0;

  while (elapsed < maxWait) {
    const result = (await cdpSend(tabId, "Runtime.evaluate", {
      expression: `!!document.querySelector('${selector}')`,
      returnByValue: true,
    })) as { result?: { value?: boolean } };

    if (result?.result?.value) return;

    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }

  throw new Error(`Section "${selector}" did not render within 10s`);
}

async function waitForTabComplete(tabId: number, timeout = 15_000): Promise<void> {
  const interval = 500;
  let elapsed = 0;

  while (elapsed < timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }
}

async function discoverCards(
  tabId: number,
  containerSelector: string,
): Promise<CardInfo[]> {
  const result = (await cdpSend(tabId, "Runtime.evaluate", {
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
    returnByValue: true,
  })) as { result?: { value?: CardInfo[] } };

  return result?.result?.value ?? [];
}

async function getCardCoordinates(
  tabId: number,
  containerSelector: string,
  cardIndex: number,
): Promise<{ x: number; y: number }> {
  const result = (await cdpSend(tabId, "Runtime.evaluate", {
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
    returnByValue: true,
  })) as { result?: { value?: { x: number; y: number } } };

  return result?.result?.value ?? { x: 0, y: 0 };
}

async function scrollCardIntoView(
  tabId: number,
  containerSelector: string,
  cardIndex: number,
): Promise<void> {
  await cdpSend(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const container = document.querySelector('${containerSelector}');
      if (!container) return;
      const cards = container.querySelectorAll('mee-card');
      const card = cards[${cardIndex}];
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })()`,
  });
}

async function cdpClick(tabId: number, x: number, y: number): Promise<void> {
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
  });
  await new Promise((r) => setTimeout(r, randomInt(50, 150)));

  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdpSend(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

function setCardState(
  state: BotState,
  key: StateKey,
  value: DailyCardsState,
): BotState {
  return { ...state, [key]: value };
}

// --- Generic card section processor ---

async function performCardSection(
  tabId: number,
  config: CardSectionConfig,
  needsNavigation: boolean,
): Promise<void> {
  const { containerSelector, renderCheckSelector, stateKey, label, actionableNames } = config;

  await logActivity("info", `Starting ${label} phase`);

  // Navigate to rewards page if needed
  if (needsNavigation) {
    await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
    await waitForPageLoad(tabId);
  }

  // Wait for section to render
  try {
    await waitForSectionRender(tabId, renderCheckSelector);
  } catch (e) {
    console.warn(`[MSR] ${label} not found, skipping:`, e);
    await updateState((s) =>
      setCardState(s, stateKey, { isActive: false, currentCard: 0, totalCards: 0 }),
    );
    return;
  }

  // Small extra delay for full render
  await new Promise((r) => setTimeout(r, randomInt(500, 1000)));

  // Discover cards from DOM, match against API actionable names via data-bi-id
  const cards = await discoverCards(tabId, containerSelector);

  const actionableCards = cards.filter((c) => actionableNames.includes(c.dataBiId));

  await logActivity("info", `Found ${actionableCards.length} actionable ${label} (${cards.length} in DOM)`);

  await updateState((s) =>
    setCardState(s, stateKey, {
      isActive: true,
      currentCard: 0,
      totalCards: actionableCards.length,
    }),
  );

  if (actionableCards.length === 0) {
    await logActivity("info", `All ${label} already completed`);
    await updateState((s) =>
      setCardState(s, stateKey, { isActive: false, currentCard: 0, totalCards: 0 }),
    );
    return;
  }

  for (let i = 0; i < actionableCards.length; i++) {
    const card = actionableCards[i];

    try {
      // Scroll card into view
      await scrollCardIntoView(tabId, containerSelector, card.index);
      await new Promise((r) => setTimeout(r, randomInt(300, 600)));

      // Re-query coordinates after scroll
      const coords = await getCardCoordinates(tabId, containerSelector, card.index);
      if (coords.x === 0 && coords.y === 0) {
        console.warn(`[MSR] Could not get coordinates for ${label} card ${card.index}, skipping`);
        continue;
      }

      // Snapshot current tabs before clicking
      const tabsBefore = (await chrome.tabs.query({})).map((t) => t.id);

      // Click the card
      await cdpClick(tabId, coords.x, coords.y);
      await logActivity("info", `Clicked ${label} ${i + 1}/${actionableCards.length}`);

      // Wait for navigation / new tab to appear
      await new Promise((r) => setTimeout(r, 2000));

      // Detect new tab
      const tabsAfter = await chrome.tabs.query({});
      const newTab = tabsAfter.find((t) => t.id && !tabsBefore.includes(t.id));

      if (newTab?.id) {
        // New tab opened — wait for it to load
        await waitForTabComplete(newTab.id);

        if (config.onNewTab) {
          // Custom handler (e.g., explore cards need to perform a search)
          await config.onNewTab(newTab.id, card.dataBiId);
        } else {
          // Default: just dwell
          await new Promise((r) => setTimeout(r, randomInt(3000, 6000)));
        }

        try {
          await chrome.tabs.remove(newTab.id);
        } catch (e) {
          console.warn("[MSR] Could not close card tab:", e);
        }
      } else {
        // Same-tab navigation — wait, dwell, go back to rewards
        await waitForPageLoad(tabId);
        await new Promise((r) => setTimeout(r, randomInt(3000, 6000)));

        // Navigate back to rewards page
        await cdpSend(tabId, "Page.navigate", { url: "https://rewards.bing.com" });
        await waitForPageLoad(tabId);

        try {
          await waitForSectionRender(tabId, renderCheckSelector);
        } catch {
          console.warn(`[MSR] ${label} not found after navigating back`);
        }
        await new Promise((r) => setTimeout(r, randomInt(500, 1000)));
      }

      // Update progress
      await updateState((s) => {
        const current = s[stateKey];
        return setCardState(s, stateKey, {
          isActive: true,
          currentCard: i + 1,
          totalCards: current?.totalCards ?? actionableCards.length,
        });
      });

      // Random delay between cards
      if (i < actionableCards.length - 1) {
        await new Promise((r) => setTimeout(r, randomInt(2000, 4000)));
      }
    } catch (error) {
      logActivity("error", `Error processing ${label} card ${card.dataBiId}: ${error}`);
      // Continue to next card
    }
  }

  // Mark phase as complete
  await updateState((s) => {
    const current = s[stateKey];
    return setCardState(s, stateKey, {
      isActive: false,
      currentCard: current?.currentCard ?? actionableCards.length,
      totalCards: current?.totalCards ?? actionableCards.length,
    });
  });

  await logActivity("info", `${label} phase complete`);
}

// --- Public API ---

export async function performDailyCards(tabId: number, actionableNames: string[]): Promise<void> {
  if (actionableNames.length === 0) {
    logActivity("info", "Daily cards: nothing actionable");
    return;
  }

  await performCardSection(tabId, {
    containerSelector: "#daily-sets mee-card-group:not(.ng-hide)",
    renderCheckSelector: "#daily-sets mee-card-group mee-card",
    stateKey: "dailyCards",
    label: "Daily cards",
    actionableNames,
  }, true);
}

export async function performMoreActivities(tabId: number, actionableNames: string[]): Promise<void> {
  if (actionableNames.length === 0) {
    logActivity("info", "More activities: nothing actionable");
    return;
  }

  await performCardSection(tabId, {
    containerSelector: "#more-activities",
    renderCheckSelector: "#more-activities mee-card",
    stateKey: "moreActivities",
    label: "More activities",
    actionableNames,
  }, false);
}

// --- Explore Bing search logic ---

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
