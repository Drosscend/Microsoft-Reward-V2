// Tab lifecycle and debugger attachment management

import { cdpSend } from "./cdp";
import { getState, setState } from "./state";
import type { BotState } from "./types";

// Flag to prevent concurrent ensureTab calls
let isEnsuring = false;

export async function ensureTab(state: BotState): Promise<number> {
  if (isEnsuring) {
    // Another ensureTab is in progress — return current tabId or wait
    if (state.tabId !== null) return state.tabId;
    await new Promise((r) => setTimeout(r, 500));
    const fresh = await getState();
    if (fresh.tabId !== null) return fresh.tabId;
  }

  isEnsuring = true;
  try {
    let tabId = state.tabId;

    // Check if the tab still exists
    if (tabId !== null) {
      try {
        await chrome.tabs.get(tabId);
      } catch {
        tabId = null;
      }
    }

    // Tab is gone — find or create a new Bing tab
    if (tabId === null) {
      const tabs = await chrome.tabs.query({ url: "https://*.bing.com/*" });
      if (tabs.length > 0 && tabs[0].id) {
        tabId = tabs[0].id;
      } else {
        const tab = await chrome.tabs.create({ url: "https://www.bing.com" });
        tabId = tab.id!;
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Add to group if exists
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

    // Ensure debugger is attached
    try {
      await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
        expression: "1",
        returnByValue: true,
      });
    } catch {
      // Re-attach debugger
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
