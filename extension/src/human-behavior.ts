// Human behavior simulation to avoid bot detection

import { cdpSend } from "./cdp";
import { getState } from "./state";
import { randomInt } from "./utils";

export async function simulateHumanBehavior(tabId: number): Promise<void> {
  // Dwell time: wait 0.5-1.5s
  await new Promise((r) => setTimeout(r, randomInt(500, 1500)));

  // Scroll the page (1-3 steps)
  const steps = randomInt(1, 3);
  for (let i = 0; i < steps; i++) {
    const distance = randomInt(150, 400);
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `window.scrollBy({ top: ${distance}, behavior: "smooth" })`,
    });
    await new Promise((r) => setTimeout(r, randomInt(200, 500)));
  }

  // 50% chance to move mouse
  if (Math.random() < 0.5) {
    const x = randomInt(100, 1100);
    const y = randomInt(100, 600);
    await cdpSend(tabId, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    });
  }

  // 25% chance to click a result in a new tab
  if (Math.random() < 0.25) {
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
      if (href) {
        const state = await getState();
        const newTab = await chrome.tabs.create({ url: href, active: false });

        // Add to tab group if available
        if (state.groupId !== null && newTab.id) {
          try {
            await chrome.tabs.group({ tabIds: [newTab.id], groupId: state.groupId });
          } catch (e) {
            console.warn("[MSR] Could not add tab to group:", e);
          }
        }

        // Wait 2-5 seconds then close
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
