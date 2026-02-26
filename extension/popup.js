// src/popup.ts
function getElement(id, ctor) {
  const el = document.getElementById(id);
  if (!el || !(el instanceof ctor)) {
    throw new Error(`[MSR] Element #${id} not found or wrong type`);
  }
  return el;
}
var cbPc = getElement("cb-pc", HTMLInputElement);
var cbMobile = getElement("cb-mobile", HTMLInputElement);
var actionBtn = getElement("action-btn", HTMLButtonElement);
var statusDot = getElement("status-dot", HTMLDivElement);
var statusText = getElement("status-text", HTMLSpanElement);
var pointsValue = getElement("points-value", HTMLDivElement);
var pcCount = getElement("pc-count", HTMLSpanElement);
var pcFill = getElement("pc-fill", HTMLDivElement);
var mobileCount = getElement("mobile-count", HTMLSpanElement);
var mobileFill = getElement("mobile-fill", HTMLDivElement);
var refreshBtn = getElement("refresh-btn", HTMLButtonElement);
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
  cbMobile.disabled = disabled;
}
function updateRewardsUI(info) {
  if (info.points !== null) {
    pointsValue.textContent = formatPoints(info.points);
    pointsValue.classList.remove("empty");
  }
  if (info.pcProgress) {
    const { current, target } = info.pcProgress;
    pcCount.textContent = `${current} / ${target}`;
    const pct = target > 0 ? Math.min(current / target * 100, 100) : 0;
    pcFill.style.width = `${pct}%`;
  }
  if (info.mobileProgress) {
    const { current, target } = info.mobileProgress;
    mobileCount.textContent = `${current} / ${target}`;
    const pct = target > 0 ? Math.min(current / target * 100, 100) : 0;
    mobileFill.style.width = `${pct}%`;
  }
}
function updateBotUI(state) {
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
function sendMsg(message, callback) {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("[MSR] sendMessage error:", chrome.runtime.lastError.message);
    }
    callback?.(response);
  });
}
chrome.storage.session.get(["botState", "rewardsInfo"], (result) => {
  const state = result.botState;
  if (state)
    updateBotUI(state);
  const info = result.rewardsInfo;
  if (info)
    updateRewardsUI(info);
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
});
actionBtn.addEventListener("click", () => {
  if (isRunning) {
    sendMsg({ action: "stop" });
    return;
  }
  const modes = [];
  if (cbPc.checked)
    modes.push("pc");
  if (cbMobile.checked)
    modes.push("mobile");
  if (modes.length === 0)
    return;
  sendMsg({ action: "start", modes });
});
refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("loading");
  sendMsg({ action: "fetch-rewards" }, () => {
    refreshBtn.classList.remove("loading");
  });
});
