import type { ActivityLogEntry, BotState, RewardsInfo, SearchMode } from "./types";

// --- DOM helpers ---

function getElement<T extends HTMLElement>(id: string, ctor: new (...args: any[]) => T): T {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`[MSR] Element #${id} not found or wrong type`);
  }
  return el;
}

const cbPc = getElement("cb-pc", HTMLInputElement);
const cbDailyCards = getElement("cb-daily-cards", HTMLInputElement);
const cbMoreActivities = getElement("cb-more-activities", HTMLInputElement);
const cbExploreBing = getElement("cb-explore-bing", HTMLInputElement);
const actionBtn = getElement("action-btn", HTMLButtonElement);
const statusDot = getElement("status-dot", HTMLDivElement);
const statusText = getElement("status-text", HTMLSpanElement);
const pointsValue = getElement("points-value", HTMLDivElement);
const pcCount = getElement("pc-count", HTMLSpanElement);
const pcFill = getElement("pc-fill", HTMLDivElement);
const dailyCardsRow = getElement("daily-cards-row", HTMLDivElement);
const dailyCardsCount = getElement("daily-cards-count", HTMLSpanElement);
const dailyCardsFill = getElement("daily-cards-fill", HTMLDivElement);
const moreActivitiesRow = getElement("more-activities-row", HTMLDivElement);
const moreActivitiesCount = getElement("more-activities-count", HTMLSpanElement);
const moreActivitiesFill = getElement("more-activities-fill", HTMLDivElement);
const exploreBingRow = getElement("explore-bing-row", HTMLDivElement);
const exploreBingCount = getElement("explore-bing-count", HTMLSpanElement);
const exploreBingFill = getElement("explore-bing-fill", HTMLDivElement);
const refreshBtn = getElement("refresh-btn", HTMLButtonElement);
const logHeader = getElement("log-header", HTMLDivElement);
const logChevron = getElement("log-chevron", HTMLSpanElement);
const logBody = getElement("log-body", HTMLDivElement);
const logEntries = getElement("log-entries", HTMLDivElement);
const logEmpty = getElement("log-empty", HTMLDivElement);
const logClearBtn = getElement("log-clear-btn", HTMLButtonElement);

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
  cbDailyCards.disabled = disabled;
  cbMoreActivities.disabled = disabled;
  cbExploreBing.disabled = disabled;
}

function updateProgressBar(
  countEl: HTMLSpanElement,
  fillEl: HTMLDivElement,
  current: number,
  target: number,
): void {
  countEl.textContent = `${current} / ${target}`;
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  fillEl.style.width = `${pct}%`;
}

function updateRewardsUI(info: RewardsInfo): void {
  if (info.points !== null) {
    pointsValue.textContent = formatPoints(info.points);
    pointsValue.classList.remove("empty");
  }

  if (info.pcProgress) {
    updateProgressBar(pcCount, pcFill, info.pcProgress.current, info.pcProgress.target);
  }

  if (info.dailyCardsProgress) {
    updateProgressBar(dailyCardsCount, dailyCardsFill, info.dailyCardsProgress.current, info.dailyCardsProgress.target);
  }

  if (info.moreActivitiesProgress) {
    updateProgressBar(moreActivitiesCount, moreActivitiesFill, info.moreActivitiesProgress.current, info.moreActivitiesProgress.target);
  }

  if (info.exploreBingProgress) {
    updateProgressBar(exploreBingCount, exploreBingFill, info.exploreBingProgress.current, info.exploreBingProgress.target);
  }
}

function updateCardProgressUI(state: BotState): void {
  // During bot run, override card bars with bot progress
  if (state.dailyCards) {
    updateProgressBar(dailyCardsCount, dailyCardsFill, state.dailyCards.currentCard, state.dailyCards.totalCards);
  }
  if (state.moreActivities) {
    updateProgressBar(moreActivitiesCount, moreActivitiesFill, state.moreActivities.currentCard, state.moreActivities.totalCards);
  }
  if (state.exploreBing) {
    updateProgressBar(exploreBingCount, exploreBingFill, state.exploreBing.currentCard, state.exploreBing.totalCards);
  }
}

function updateBotUI(state: BotState): void {
  isRunning = state.isRunning;
  updateCardProgressUI(state);

  if (state.isRunning) {
    updateActionButton(true);
    updateCheckboxes(true);

    if (state.dailyCards?.isActive) {
      const { currentCard, totalCards } = state.dailyCards;
      setStatus("running", `Daily Cards ${currentCard}/${totalCards}`);
    } else if (state.moreActivities?.isActive) {
      const { currentCard, totalCards } = state.moreActivities;
      setStatus("running", `Activities ${currentCard}/${totalCards}`);
    } else if (state.exploreBing?.isActive) {
      const { currentCard, totalCards } = state.exploreBing;
      setStatus("running", `Explore Bing ${currentCard}/${totalCards}`);
    } else {
      setStatus("running", `PC ${state.currentIndex}/${state.total}`);
    }
  } else if (state.error === "All searches already complete!") {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("done", "All searches complete!");
  } else if (state.error) {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("error", state.error);
  } else if (state.currentIndex > 0 || state.dailyCards || state.moreActivities || state.exploreBing) {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("done", "Done");
  } else {
    updateActionButton(false);
    updateCheckboxes(false);
    setStatus("idle", "Idle");
  }
  updateStartButtonState();
}

// --- Activity log ---

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderFullLog(entries: ActivityLogEntry[]): void {
  // Remove all children except the empty placeholder
  while (logEntries.firstChild) {
    logEntries.removeChild(logEntries.firstChild);
  }

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "No activity yet";
    logEntries.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "log-entry";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = formatTime(entry.timestamp);

    const msg = document.createElement("span");
    msg.className = `log-msg ${entry.level}`;
    msg.textContent = entry.message;
    msg.title = entry.message;

    row.appendChild(time);
    row.appendChild(msg);
    logEntries.appendChild(row);
  }

  // Auto-scroll to bottom
  logEntries.scrollTop = logEntries.scrollHeight;
}

// Toggle log panel
logHeader.addEventListener("click", (e) => {
  // Don't toggle when clicking clear button
  if ((e.target as HTMLElement).id === "log-clear-btn") return;
  logBody.classList.toggle("open");
  logChevron.classList.toggle("open");
});

// Clear log
logClearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sendMsg({ action: "clear-log" });
  renderFullLog([]);
});

// --- Checkbox disable logic ---

function updateStartButtonState(): void {
  if (isRunning) {
    actionBtn.disabled = false;
    return;
  }
  const anyChecked = cbPc.checked || cbDailyCards.checked || cbMoreActivities.checked || cbExploreBing.checked;
  actionBtn.disabled = !anyChecked;
}

cbPc.addEventListener("change", updateStartButtonState);
cbDailyCards.addEventListener("change", updateStartButtonState);
cbMoreActivities.addEventListener("change", updateStartButtonState);
cbExploreBing.addEventListener("change", updateStartButtonState);

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

// Load current state, rewards info, and activity log on popup open
chrome.storage.session.get(["botState", "rewardsInfo", "activityLog"], (result) => {
  const state = result.botState as BotState | undefined;
  if (state) updateBotUI(state);

  const info = result.rewardsInfo as RewardsInfo | undefined;
  if (info) updateRewardsUI(info);

  const log = result.activityLog as ActivityLogEntry[] | undefined;
  if (log) renderFullLog(log);

  updateStartButtonState();
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

  if (changes.activityLog) {
    renderFullLog((changes.activityLog.newValue as ActivityLogEntry[]) ?? []);
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
  const dailyCards = cbDailyCards.checked;
  const moreActivities = cbMoreActivities.checked;
  const exploreBing = cbExploreBing.checked;

  if (modes.length === 0 && !dailyCards && !moreActivities && !exploreBing) return;

  sendMsg({ action: "start", modes, dailyCards, moreActivities, exploreBing });
});

// Refresh rewards info button
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("loading");
  sendMsg({ action: "fetch-rewards" }, () => {
    refreshBtn.classList.remove("loading");
  });
});
