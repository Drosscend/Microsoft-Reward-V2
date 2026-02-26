// Chrome DevTools Protocol helpers

import { randomInt } from "./utils";

export async function cdpSend(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

export async function typeText(tabId: number, text: string): Promise<void> {
  for (const char of text) {
    const delay = randomInt(50, 150);

    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown",
      key: char,
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      text: char,
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: char,
    });

    await new Promise((r) => setTimeout(r, delay));
  }
}

export async function pressEnter(tabId: number): Promise<void> {
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

export async function pressKey(tabId: number, key: string): Promise<void> {
  const keyCode = key === "Backspace" ? 8 : 0;
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await cdpSend(tabId, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
}

export async function waitForPageLoad(tabId: number): Promise<void> {
  await cdpSend(tabId, "Page.enable");
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(listener);
      resolve();
    }, 15_000);

    function listener(
      source: chrome.debugger.Debuggee,
      method: string,
    ): void {
      if (source.tabId === tabId && method === "Page.loadEventFired") {
        clearTimeout(timeout);
        chrome.debugger.onEvent.removeListener(listener);
        resolve();
      }
    }

    chrome.debugger.onEvent.addListener(listener);
  });
}
