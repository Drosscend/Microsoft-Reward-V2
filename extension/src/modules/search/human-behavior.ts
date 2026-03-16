// Human behavior simulation to avoid bot detection

import { cdpSend } from "../cdp";
import { getState } from "../state";
import { randomInt } from "../../shared/utils";

async function simulateMouseMovements(tabId: number): Promise<void> {
  const moves = randomInt(2, 4);
  let x = randomInt(200, 600);
  let y = randomInt(150, 400);

  for (let i = 0; i < moves; i++) {
    // Move progressively, not teleport
    x += randomInt(-150, 150);
    y += randomInt(-100, 100);
    x = Math.max(50, Math.min(1200, x));
    y = Math.max(50, Math.min(700, y));

    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
    await new Promise((r) => setTimeout(r, randomInt(100, 400)));
  }
}

async function simulateScrolling(tabId: number): Promise<void> {
  const steps = randomInt(2, 5);
  for (let i = 0; i < steps; i++) {
    const distance = randomInt(100, 350);
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `window.scrollBy({ top: ${distance}, behavior: "smooth" })`,
    });
    // Pause between scrolls like reading content
    await new Promise((r) => setTimeout(r, randomInt(800, 2500)));
  }
}

async function simulateResultClick(tabId: number): Promise<void> {
  try {
    const result = (await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(() => {
        const links = document.querySelectorAll(".b_algo h2 a");
        if (links.length === 0) return null;
        const max = Math.min(links.length, 5);
        const idx = Math.floor(Math.random() * max);
        return links[idx].href;
      })()`,
      returnByValue: true,
    })) as { result?: { value?: string | null } };

    const href = result?.result?.value;
    if (!href) return;

    const state = await getState();
    const newTab = await chrome.tabs.create({ url: href, active: false });

    if (state.groupId !== null && newTab.id) {
      try {
        await chrome.tabs.group({ tabIds: [newTab.id], groupId: state.groupId });
      } catch (e) {
        console.warn("[MSR] Could not add tab to group:", e);
      }
    }

    // Stay on the page like reading it
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

export async function simulateHumanBehavior(tabId: number): Promise<void> {
  // Dwell time: pause before interacting (reading results)
  await new Promise((r) => setTimeout(r, randomInt(3000, 8000)));

  // Scroll the page with reading pauses
  await simulateScrolling(tabId);

  // 70% chance to move mouse progressively
  if (Math.random() < 0.7) {
    await simulateMouseMovements(tabId);
  }

  // 30% chance to click a result and stay on it
  if (Math.random() < 0.3) {
    await simulateResultClick(tabId);
  }
}
