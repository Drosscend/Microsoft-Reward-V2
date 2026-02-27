// src/ui/popup.ts
function getElement(id, ctor) {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`[MSR] Element #${id} not found or wrong type`);
  }
  return el;
}
var cbPc = getElement("cb-pc", HTMLInputElement);
var cbDailyCards = getElement("cb-daily-cards", HTMLInputElement);
var cbMoreActivities = getElement("cb-more-activities", HTMLInputElement);
var cbExploreBing = getElement("cb-explore-bing", HTMLInputElement);
var actionBtn = getElement("action-btn", HTMLButtonElement);
var statusDot = getElement("status-dot", HTMLDivElement);
var statusText = getElement("status-text", HTMLSpanElement);
var pointsValue = getElement("points-value", HTMLDivElement);
var pcCount = getElement("pc-count", HTMLSpanElement);
var pcFill = getElement("pc-fill", HTMLDivElement);
var dailyCardsRow = getElement("daily-cards-row", HTMLDivElement);
var dailyCardsCount = getElement("daily-cards-count", HTMLSpanElement);
var dailyCardsFill = getElement("daily-cards-fill", HTMLDivElement);
var moreActivitiesRow = getElement("more-activities-row", HTMLDivElement);
var moreActivitiesCount = getElement("more-activities-count", HTMLSpanElement);
var moreActivitiesFill = getElement("more-activities-fill", HTMLDivElement);
var exploreBingRow = getElement("explore-bing-row", HTMLDivElement);
var exploreBingCount = getElement("explore-bing-count", HTMLSpanElement);
var exploreBingFill = getElement("explore-bing-fill", HTMLDivElement);
var refreshBtn = getElement("refresh-btn", HTMLButtonElement);
var logHeader = getElement("log-header", HTMLDivElement);
var logChevron = getElement("log-chevron", HTMLSpanElement);
var logBody = getElement("log-body", HTMLDivElement);
var logEntries = getElement("log-entries", HTMLDivElement);
var logEmpty = getElement("log-empty", HTMLDivElement);
var logClearBtn = getElement("log-clear-btn", HTMLButtonElement);
var isRunning = false;
function formatPoints(n) {
  if (typeof n !== "number")
    return "—";
  return n.toLocaleString("en-US").replace(/,/g, " ");
}
function setStatus(status, text) {
  statusDot.className = `status-dot ${status}`;
  statusText.className = `status-text ${status}`;
  statusText.textContent = text;
}
function updateActionButton(running) {
  if (running) {
    actionBtn.innerHTML = "<span>&#9632;</span> Stop";
    actionBtn.className = "action-btn stop";
  } else {
    actionBtn.innerHTML = "<span>&#9654;</span> Start";
    actionBtn.className = "action-btn start";
  }
}
function updateCheckboxes(disabled) {
  cbPc.disabled = disabled;
  cbDailyCards.disabled = disabled;
  cbMoreActivities.disabled = disabled;
  cbExploreBing.disabled = disabled;
}
function updateProgressBar(countEl, fillEl, current, target) {
  countEl.textContent = `${current} / ${target}`;
  const pct = target > 0 ? Math.min(current / target * 100, 100) : 0;
  fillEl.style.width = `${pct}%`;
}
function updateRewardsUI(info) {
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
function updateCardProgressUI(state) {
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
function updateBotUI(state) {
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
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function renderFullLog(entries) {
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
  logEntries.scrollTop = logEntries.scrollHeight;
}
logHeader.addEventListener("click", (e) => {
  if (e.target.id === "log-clear-btn")
    return;
  logBody.classList.toggle("open");
  logChevron.classList.toggle("open");
});
logClearBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sendMsg({ action: "clear-log" });
  renderFullLog([]);
});
function updateStartButtonState() {
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
function sendMsg(message, callback) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[MSR] sendMessage error:", chrome.runtime.lastError.message);
    }
    callback?.(response);
  });
}
chrome.storage.session.get(["botState", "rewardsInfo", "activityLog"], (result) => {
  const state = result.botState;
  if (state)
    updateBotUI(state);
  const info = result.rewardsInfo;
  if (info)
    updateRewardsUI(info);
  const log = result.activityLog;
  if (log)
    renderFullLog(log);
  updateStartButtonState();
});
refreshBtn.classList.add("loading");
sendMsg({ action: "fetch-rewards" }, () => {
  refreshBtn.classList.remove("loading");
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session")
    return;
  if (changes.botState) {
    updateBotUI(changes.botState.newValue);
  }
  if (changes.rewardsInfo) {
    updateRewardsUI(changes.rewardsInfo.newValue);
  }
  if (changes.activityLog) {
    renderFullLog(changes.activityLog.newValue ?? []);
  }
});
actionBtn.addEventListener("click", () => {
  if (isRunning) {
    sendMsg({ action: "stop" });
    return;
  }
  const modes = [];
  if (cbPc.checked)
    modes.push("pc");
  const dailyCards = cbDailyCards.checked;
  const moreActivities = cbMoreActivities.checked;
  const exploreBing = cbExploreBing.checked;
  if (modes.length === 0 && !dailyCards && !moreActivities && !exploreBing)
    return;
  sendMsg({ action: "start", modes, dailyCards, moreActivities, exploreBing });
});
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("loading");
  sendMsg({ action: "fetch-rewards" }, () => {
    refreshBtn.classList.remove("loading");
  });
});
