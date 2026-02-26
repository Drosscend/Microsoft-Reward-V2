import type { BotState, RewardsInfo, SearchMode } from "./types";

// --- DOM helpers ---

function getElement<T extends HTMLElement>(id: string, ctor: new (...args: any[]) => T): T {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`[MSR] Element #${id} not found or wrong type`);
  }
  return el;
}

const cbPc = getElement("cb-pc", HTMLInputElement);
const cbMobile = getElement("cb-mobile", HTMLInputElement);
const actionBtn = getElement("action-btn", HTMLButtonElement);
const statusDot = getElement("status-dot", HTMLDivElement);
const statusText = getElement("status-text", HTMLSpanElement);
const pointsValue = getElement("points-value", HTMLDivElement);
const pcCount = getElement("pc-count", HTMLSpanElement);
const pcFill = getElement("pc-fill", HTMLDivElement);
const mobileCount = getElement("mobile-count", HTMLSpanElement);
const mobileFill = getElement("mobile-fill", HTMLDivElement);
const refreshBtn = getElement("refresh-btn", HTMLButtonElement);

let isRunning = false;

function formatPoints(n: number): string {
  if (typeof n !== "number") return "\u2014";
  return n.toLocaleString("en-US").replace(/,/g, " ");
}

function setStatus(status: "idle" | "running" | "done" | "error", text: string): void {
  statusDot.className = `status-dot ${status}`;
  statusText.className = `status-text ${status}`;
  statusText.textContent = text;
}

function updateActionButton(running: boolean): void {
  if (running) {
    actionBtn.innerHTML = "<span>&#9632;</span> Stop";
    actionBtn.className = "action-btn stop";
  } else {
    actionBtn.innerHTML = "<span>&#9654;</span> Start";
    actionBtn.className = "action-btn start";
  }
}

function updateCheckboxes(disabled: boolean): void {
  cbPc.disabled = disabled;
  cbMobile.disabled = disabled;
}

function updateRewardsUI(info: RewardsInfo): void {
  if (info.points !== null) {
    pointsValue.textContent = formatPoints(info.points);
    pointsValue.classList.remove("empty");
  }

  if (info.pcProgress) {
    const { current, target } = info.pcProgress;
    pcCount.textContent = `${current} / ${target}`;
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    pcFill.style.width = `${pct}%`;
  }

  if (info.mobileProgress) {
    const { current, target } = info.mobileProgress;
    mobileCount.textContent = `${current} / ${target}`;
    const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    mobileFill.style.width = `${pct}%`;
  }
}

function updateBotUI(state: BotState): void {
  isRunning = state.isRunning;

  if (state.isRunning) {
    updateActionButton(true);
    updateCheckboxes(true);
    const modeLabel = state.mode === "pc" ? "PC" : "Mobile";
    setStatus("running", `${modeLabel} ${state.currentIndex}/${state.total}`);
  } else if (state.error === "All searches already complete!") {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("done", "All searches complete!");
  } else if (state.error) {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("error", state.error);
  } else if (state.currentIndex > 0) {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("done", "Done");
  } else {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("idle", "Idle");
  }
}

// --- Messaging helper ---

function sendMsg(message: Record<string, unknown>, callback?: (response: any) => void): void {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[MSR] sendMessage error:", chrome.runtime.lastError.message);
    }
    callback?.(response);
  });
}

// --- Initialization ---

// Load current state and rewards info on popup open
chrome.storage.session.get(["botState", "rewardsInfo"], (result) => {
  const state = result.botState as BotState | undefined;
  if (state) updateBotUI(state);

  const info = result.rewardsInfo as RewardsInfo | undefined;
  if (info) updateRewardsUI(info);
});

// Auto-refresh rewards info on popup open
refreshBtn.classList.add("loading");
sendMsg({ action: "fetch-rewards" }, () => {
  refreshBtn.classList.remove("loading");
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;

  if (changes.botState) {
    updateBotUI(changes.botState.newValue as BotState);
  }

  if (changes.rewardsInfo) {
    updateRewardsUI(changes.rewardsInfo.newValue as RewardsInfo);
  }
});

// Start / Stop button
actionBtn.addEventListener("click", () => {
  if (isRunning) {
    sendMsg({ action: "stop" });
    return;
  }

  const modes: SearchMode[] = [];
  if (cbPc.checked) modes.push("pc");
  if (cbMobile.checked) modes.push("mobile");

  if (modes.length === 0) return;

  sendMsg({ action: "start", modes });
});

// Refresh rewards info button
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("loading");
  sendMsg({ action: "fetch-rewards" }, () => {
    refreshBtn.classList.remove("loading");
  });
});
