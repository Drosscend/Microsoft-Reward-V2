// Bot state management with mutex-protected updates

import type { BotState } from "./types";

export function getDefaultState(): BotState {
  return {
    isRunning: false,
    mode: "pc",
    currentIndex: 0,
    total: 0,
    modes: [],
    currentModeIndex: 0,
    tabId: null,
    groupId: null,
  };
}

export async function getState(): Promise<BotState> {
  const result = await chrome.storage.session.get("botState");
  const state = result.botState;
  if (
    state &&
    typeof state === "object" &&
    typeof (state as BotState).isRunning === "boolean"
  ) {
    return state as BotState;
  }
  return getDefaultState();
}

export async function setState(state: BotState): Promise<void> {
  await chrome.storage.session.set({ botState: state });
}

// Mutex for serializing read-modify-write state operations
let stateMutex: Promise<void> = Promise.resolve();

export async function updateState(
  fn: (state: BotState) => BotState | Promise<BotState>,
): Promise<BotState> {
  let result!: BotState;
  stateMutex = stateMutex.then(async () => {
    const current = await getState();
    result = await fn(current);
    await setState(result);
  });
  await stateMutex;
  return result;
}
