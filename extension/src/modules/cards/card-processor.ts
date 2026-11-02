// Card section automation: clicks reward cards on rewards.bing.com
// Handles the "dailyset" (/dashboard), "moreactivities" and "exploreonbing" (/earn) sections

import { cdpSend, waitForPageLoad } from "../cdp";
import { logActivity } from "../logger";
import { updateState } from "../state";
import { randomInt } from "../../shared/utils";
import type { BotState, CardTarget, DailyCardsState } from "../../shared/types";
import type { StateKey, CardSectionConfig, CardLink } from "./types";

const DASHBOARD_URL = "https://rewards.bing.com/dashboard";
export const EARN_URL = "https://rewards.bing.com/earn";

// --- Shared helpers ---

async function evaluate<T>(tabId: number, expression: string): Promise<T | undefined> {
  const result = (await cdpSend(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as { result?: { value?: T } };
  return result?.result?.value;
}

// The page streams its sections: hidden copies sit in `div[hidden]` until React swaps them in,
// so only the rendered section and its visible links count.
function visibleLinksExpression(sectionSelector: string): string {
  return `[...document.querySelectorAll('${sectionSelector}')]
    .find((s) => s.getClientRects().length > 0)
    ?.querySelectorAll('a[href]')
    ?? []`;
}

function normalizeText(text: string): string {
  return text.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function waitForSectionRender(
  tabId: number,
  sectionSelector: string,
): Promise<void> {
  const maxWait = 10_000;
  const interval = 500;
  let elapsed = 0;

  while (elapsed < maxWait) {
    const rendered = await evaluate<boolean>(
      tabId,
      `[...${visibleLinksExpression(sectionSelector)}].some((a) => a.getClientRects().length > 0)`,
    );

    if (rendered) return;

    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }

  throw new Error(`Section "${sectionSelector}" did not render within 10s`);
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

async function discoverLinks(
  tabId: number,
  sectionSelector: string,
): Promise<CardLink[]> {
  const links = await evaluate<CardLink[]>(
    tabId,
    `[...${visibleLinksExpression(sectionSelector)}]
      .filter((a) => a.getClientRects().length > 0)
      .map((a) => ({ href: a.getAttribute('href'), text: a.innerText }))`,
  );
  return links ?? [];
}

// Match each API promotion to a link by its destination URL. Several cards can share a URL
// (explore cards all point to bing.com), so the card title breaks ties.
export function matchTargets(
  links: CardLink[],
  targets: CardTarget[],
): { linkIndex: number; target: CardTarget }[] {
  const used = new Set<number>();
  const matches: { linkIndex: number; target: CardTarget }[] = [];

  for (const target of targets) {
    const candidates = links
      .map((link, i) => ({ link, i }))
      .filter(({ link, i }) => link.href === target.url && !used.has(i));
    const title = normalizeText(target.title);
    const byTitle = candidates.filter(({ link }) => normalizeText(link.text).includes(title));
    const match = byTitle[0] ?? (candidates.length === 1 ? candidates[0] : undefined);

    if (match) {
      used.add(match.i);
      matches.push({ linkIndex: match.i, target });
    } else {
      console.warn(`[MSR] No card link found for ${target.name}`);
    }
  }

  return matches;
}

async function getLinkCoordinates(
  tabId: number,
  sectionSelector: string,
  linkIndex: number,
): Promise<{ x: number; y: number }> {
  const coords = await evaluate<{ x: number; y: number }>(
    tabId,
    `(() => {
      const link = [...${visibleLinksExpression(sectionSelector)}]
        .filter((a) => a.getClientRects().length > 0)[${linkIndex}];
      if (!link) return { x: 0, y: 0 };
      const rect = link.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()`,
  );
  return coords ?? { x: 0, y: 0 };
}

async function scrollLinkIntoView(
  tabId: number,
  sectionSelector: string,
  linkIndex: number,
): Promise<void> {
  await evaluate(
    tabId,
    `[...${visibleLinksExpression(sectionSelector)}]
      .filter((a) => a.getClientRects().length > 0)[${linkIndex}]
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })`,
  );
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

async function endPhase(stateKey: StateKey): Promise<void> {
  await updateState((s) => {
    const current = s[stateKey];
    return setCardState(s, stateKey, {
      isActive: false,
      currentCard: current?.currentCard ?? 0,
      totalCards: current?.totalCards ?? 0,
    });
  });
}

// --- Generic card section processor ---

export async function performCardSection(
  tabId: number,
  config: CardSectionConfig,
): Promise<void> {
  const { stateKey, label, targets } = config;

  if (targets.length === 0) {
    logActivity("info", `${label}: nothing actionable`);
    return;
  }

  await updateState((s) =>
    setCardState(s, stateKey, { isActive: true, currentCard: 0, totalCards: targets.length }),
  );

  try {
    await runCardSection(tabId, config);
  } catch (error) {
    if (String(error).includes("Not allowed")) {
      logActivity("warn", `${label}: this browser blocks extensions on rewards.bing.com (Edge), do them manually`);
    } else {
      logActivity("error", `${label} phase failed: ${error}`);
    }
    await endPhase(stateKey);
  }
}

async function runCardSection(
  tabId: number,
  config: CardSectionConfig,
): Promise<void> {
  const { pageUrl, sectionSelector, stateKey, label, targets } = config;

  await logActivity("info", `Starting ${label} phase`);

  await cdpSend(tabId, "Page.navigate", { url: pageUrl });
  await waitForPageLoad(tabId);

  // Wait for section to render
  try {
    await waitForSectionRender(tabId, sectionSelector);
  } catch (e) {
    console.warn(`[MSR] ${label} not found, skipping:`, e);
    await endPhase(stateKey);
    return;
  }

  // Small extra delay for full render
  await new Promise((r) => setTimeout(r, randomInt(500, 1000)));

  // Discover card links from DOM, match against API actionable promotions via href
  const links = await discoverLinks(tabId, sectionSelector);

  const actionableCards = matchTargets(links, targets);

  await logActivity("info", `Found ${actionableCards.length}/${targets.length} actionable ${label} (${links.length} links in DOM)`);

  await updateState((s) =>
    setCardState(s, stateKey, {
      isActive: true,
      currentCard: 0,
      totalCards: actionableCards.length,
    }),
  );

  if (actionableCards.length === 0) {
    await logActivity("info", `All ${label} already completed`);
    await endPhase(stateKey);
    return;
  }

  for (let i = 0; i < actionableCards.length; i++) {
    const { linkIndex, target } = actionableCards[i];

    try {
      // Scroll card into view
      await scrollLinkIntoView(tabId, sectionSelector, linkIndex);
      await new Promise((r) => setTimeout(r, randomInt(300, 600)));

      // Re-query coordinates after scroll
      const coords = await getLinkCoordinates(tabId, sectionSelector, linkIndex);
      if (coords.x === 0 && coords.y === 0) {
        console.warn(`[MSR] Could not get coordinates for ${label} card ${target.name}, skipping`);
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
          await config.onNewTab(newTab.id, target);
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
        // Same-tab navigation — wait, dwell, go back to the section's page
        await waitForPageLoad(tabId);
        await new Promise((r) => setTimeout(r, randomInt(3000, 6000)));

        await cdpSend(tabId, "Page.navigate", { url: pageUrl });
        await waitForPageLoad(tabId);

        try {
          await waitForSectionRender(tabId, sectionSelector);
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
      logActivity("error", `Error processing ${label} card ${target.name}: ${error}`);
      // Continue to next card
    }
  }

  // Mark phase as complete
  await endPhase(stateKey);

  await logActivity("info", `${label} phase complete`);
}

// --- Public API ---

export async function performDailyCards(tabId: number, targets: CardTarget[]): Promise<void> {
  await performCardSection(tabId, {
    pageUrl: DASHBOARD_URL,
    sectionSelector: "section#dailyset",
    stateKey: "dailyCards",
    label: "Daily cards",
    targets,
  });
}

export async function performMoreActivities(tabId: number, targets: CardTarget[]): Promise<void> {
  await performCardSection(tabId, {
    pageUrl: EARN_URL,
    sectionSelector: "section#moreactivities",
    stateKey: "moreActivities",
    label: "More activities",
    targets,
  });
}
