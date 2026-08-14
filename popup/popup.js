(function () {
  const money = globalThis.WhatnotBotMoney;
  const settingsApi = globalThis.WhatnotBotSettings;
  const elements = {
    maxBid: document.getElementById("maxBid"),
    currencyPrefix: document.getElementById("currencyPrefix"),
    testMode: document.getElementById("testMode"),
    notifications: document.getElementById("notifications"),
    modePill: document.getElementById("modePill"),
    statusDot: document.getElementById("statusDot"),
    statusTitle: document.getElementById("statusTitle"),
    statusText: document.getElementById("statusText"),
    currentPrice: document.getElementById("currentPrice"),
    nextBid: document.getElementById("nextBid"),
    maximumDisplay: document.getElementById("maximumDisplay"),
    armButton: document.getElementById("armButton"),
    simulatorButton: document.getElementById("simulatorButton"),
    diagnosticsButton: document.getElementById("diagnosticsButton"),
    clearLogButton: document.getElementById("clearLogButton"),
    eventList: document.getElementById("eventList"),
    error: document.getElementById("error")
  };
  let activeTab = null;
  let status = null;
  let currentSettings = settingsApi.normalize(settingsApi.defaults);

  function showError(message) {
    elements.error.textContent = message || "";
    elements.error.hidden = !message;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function sendToActiveTab(message) {
    activeTab = await getActiveTab();
    if (!activeTab || !Number.isInteger(activeTab.id)) return null;
    try {
      return await chrome.tabs.sendMessage(activeTab.id, message);
    } catch (_) {
      return null;
    }
  }

  function reasonText(reason) {
    const labels = {
      disarmed: "Ready to arm on this tab",
      invalid_maximum: "Enter a valid maximum bid",
      auction_not_detected: "No compatible live auction detected",
      auction_ended: "The current auction has ended",
      auction_inactive: "Waiting for the next auction",
      auction_start_delay: "Waiting through the 2–7 second start delay",
      bid_unavailable: "The bid control is unavailable",
      next_bid_unknown: "The next bid amount could not be read",
      maximum_reached: "The next bid exceeds your maximum",
      already_winning: "You are currently winning",
      waiting_for_outbid: currentSettings.testMode
        ? "Waiting for the next bid amount"
        : "Waiting until Whatnot confirms you were outbid",
      outbid_rebid_delay: "Waiting through the 1–1,000 ms re-bid delay",
      bid_state_unknown: "Cannot verify who is winning",
      action_pending: "Checking the result of the last action",
      duplicate_state: "This bid state was already handled",
      eligible: "The next bid is within your maximum"
    };
    return labels[reason] || "Monitoring the page";
  }

  function renderStatus() {
    const snapshot = status && status.snapshot;
    const symbol = snapshot && snapshot.currencySymbol ? snapshot.currencySymbol : "$";
    elements.currencyPrefix.textContent = symbol;
    elements.currentPrice.textContent = money.formatCents(snapshot && snapshot.currentPriceCents, symbol);
    elements.nextBid.textContent = money.formatCents(snapshot && snapshot.nextBidCents, symbol);
    elements.maximumDisplay.textContent = money.formatCents(currentSettings.maxBidCents, symbol);
    elements.statusDot.className = "status-dot";
    if (!status || !status.connected) {
      elements.statusTitle.textContent = "Open a Whatnot show";
      elements.statusText.textContent = "The bot connects only to Whatnot tabs";
      elements.armButton.disabled = true;
      elements.armButton.textContent = currentSettings.testMode ? "Start test mode" : "Start live bidding";
      elements.armButton.className = "primary";
      return;
    }
    elements.armButton.disabled = false;
    if (status.armed) {
      elements.statusDot.classList.add(currentSettings.testMode ? "armed" : "live");
      elements.statusTitle.textContent = currentSettings.testMode ? "Test mode armed" : "Live bidding armed";
      elements.statusText.textContent = reasonText(status.decision && status.decision.reason);
      elements.armButton.textContent = "Stop bot";
      elements.armButton.className = "primary stop";
    } else {
      if (snapshot && snapshot.supported) elements.statusDot.classList.add("ready");
      elements.statusTitle.textContent = snapshot && snapshot.supported ? "Auction detected" : "Connected to Whatnot";
      elements.statusText.textContent = status.suspendedReason || reasonText(status.decision && status.decision.reason);
      elements.armButton.textContent = currentSettings.testMode ? "Start test mode" : "Start live bidding";
      elements.armButton.className = "primary";
    }
  }

  function renderMode() {
    const testMode = elements.testMode.checked;
    elements.modePill.textContent = testMode ? "TEST" : "LIVE";
    elements.modePill.className = testMode ? "mode-pill" : "mode-pill live";
    renderStatus();
  }

  function renderLog(eventLog) {
    if (!eventLog || !eventLog.length) {
      elements.eventList.innerHTML = '<p class="empty">No actions yet.</p>';
      return;
    }
    elements.eventList.replaceChildren(...eventLog.slice(0, 8).map((event) => {
      const row = document.createElement("div");
      row.className = "event";
      const title = document.createElement("strong");
      title.textContent = event.message;
      const time = document.createElement("span");
      time.textContent = new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
      row.append(title, time);
      return row;
    }));
  }

  async function saveControls() {
    const maxBidCents = money.parseCents(elements.maxBid.value);
    currentSettings = await settingsApi.save({
      maxBidCents: Number.isInteger(maxBidCents) && maxBidCents > 0 ? maxBidCents : null,
      testMode: elements.testMode.checked,
      notifications: elements.notifications.checked
    });
    renderMode();
    return currentSettings;
  }

  async function refresh() {
    status = await sendToActiveTab({ type: "WNPB_GET_STATUS" });
    renderStatus();
    const stored = await chrome.storage.local.get({ eventLog: [] });
    renderLog(stored.eventLog);
  }

  elements.maxBid.addEventListener("change", () => saveControls());
  elements.notifications.addEventListener("change", () => saveControls());
  elements.testMode.addEventListener("change", async () => {
    if (!elements.testMode.checked) {
      const confirmed = window.confirm("Live mode can place binding bids and purchases. Enable live mode?");
      if (!confirmed) elements.testMode.checked = true;
    }
    await saveControls();
    await refresh();
  });

  elements.armButton.addEventListener("click", async () => {
    showError("");
    await saveControls();
    if (!currentSettings.maxBidCents) {
      showError("Enter a valid maximum bid first.");
      elements.maxBid.focus();
      return;
    }
    const response = await sendToActiveTab({ type: status && status.armed ? "WNPB_STOP" : "WNPB_ARM" });
    if (!response) {
      showError("Open or reload a Whatnot page, then try again.");
      return;
    }
    if (response.ok === false) showError(response.error);
    await refresh();
  });

  elements.simulatorButton.addEventListener("click", async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("simulator/index.html") });
    window.close();
  });

  elements.diagnosticsButton.addEventListener("click", async () => {
    showError("");
    const diagnostics = await sendToActiveTab({ type: "WNPB_GET_DIAGNOSTICS" });
    if (!diagnostics) {
      showError("Diagnostics are available on a Whatnot page.");
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    elements.diagnosticsButton.textContent = "Copied";
    setTimeout(() => { elements.diagnosticsButton.textContent = "Copy diagnostics"; }, 1200);
  });

  elements.clearLogButton.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "WNPB_CLEAR_LOG" });
    renderLog([]);
  });

  async function initialize() {
    currentSettings = await settingsApi.load();
    elements.maxBid.value = currentSettings.maxBidCents ? (currentSettings.maxBidCents / 100).toFixed(2) : "";
    elements.testMode.checked = currentSettings.testMode;
    elements.notifications.checked = currentSettings.notifications;
    renderMode();
    await refresh();
    setInterval(refresh, 750);
  }

  initialize().catch((error) => showError(error.message));
})();
