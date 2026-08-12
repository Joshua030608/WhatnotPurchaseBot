(function () {
  const money = globalThis.WhatnotBotMoney;
  const settingsApi = globalThis.WhatnotBotSettings;
  const decisionApi = globalThis.WhatnotBotDecision;
  const adapter = globalThis.WhatnotPageAdapter;
  const reasonLabels = {
    disarmed: "Disarmed",
    invalid_maximum: "Maximum bid is required",
    auction_not_detected: "Waiting for an auction",
    auction_ended: "Auction ended",
    auction_inactive: "Waiting for an active auction",
    bid_unavailable: "Bid control unavailable",
    next_bid_unknown: "Next bid could not be verified",
    maximum_reached: "Next bid exceeds your maximum",
    already_winning: "You are currently winning",
    waiting_for_outbid: "Waiting for a confirmed outbid",
    action_pending: "Checking bid result",
    duplicate_state: "Already handled this bid state",
    eligible: "Eligible to bid"
  };
  const state = {
    settings: settingsApi.normalize(settingsApi.defaults),
    armed: false,
    armedPath: null,
    pending: false,
    participation: { waitingForOutbid: false, seenNonOutbid: false, freshOutbid: false },
    lastActionKey: null,
    rawAuctionKey: null,
    auctionEpoch: 0,
    auctionId: null,
    previousSnapshot: null,
    snapshot: null,
    decision: { action: "wait", reason: "disarmed" },
    evaluationTimer: null,
    evaluating: false,
    suspendedReason: null,
    lastEvent: null
  };

  function createOverlay() {
    const overlay = document.createElement("section");
    overlay.id = "wnpb-overlay";
    overlay.hidden = true;
    overlay.setAttribute("data-wnpb-ui", "true");
    overlay.innerHTML = `
      <div class="wnpb-head">
        <span class="wnpb-dot"></span>
        <span class="wnpb-title">Whatnot Bot</span>
        <button class="wnpb-stop" type="button">Stop</button>
      </div>
      <div class="wnpb-body">
        <div class="wnpb-status">Disarmed</div>
        <div class="wnpb-metrics">
          <div class="wnpb-metric"><span class="wnpb-label">Current</span><span class="wnpb-value" data-value="current">—</span></div>
          <div class="wnpb-metric"><span class="wnpb-label">Next</span><span class="wnpb-value" data-value="next">—</span></div>
          <div class="wnpb-metric"><span class="wnpb-label">Maximum</span><span class="wnpb-value" data-value="maximum">—</span></div>
        </div>
      </div>`;
    overlay.querySelector(".wnpb-stop").addEventListener("click", () => disarm("Stopped from the page", true));
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  const overlay = createOverlay();

  function updateOverlay() {
    const snapshot = state.snapshot || {};
    const symbol = snapshot.currencySymbol || "$";
    overlay.hidden = !state.armed || !state.settings.showOverlay;
    overlay.dataset.mode = state.settings.testMode ? "test" : "live";
    overlay.querySelector(".wnpb-title").textContent = state.settings.testMode ? "Whatnot Bot · Test" : "Whatnot Bot · Live";
    overlay.querySelector(".wnpb-status").textContent = state.pending
      ? "Checking bid result"
      : reasonLabels[state.decision.reason] || state.suspendedReason || "Monitoring";
    overlay.querySelector("[data-value='current']").textContent = money.formatCents(snapshot.currentPriceCents, symbol);
    overlay.querySelector("[data-value='next']").textContent = money.formatCents(snapshot.nextBidCents, symbol);
    overlay.querySelector("[data-value='maximum']").textContent = money.formatCents(state.settings.maxBidCents, symbol);
  }

  function publicSnapshot(snapshot) {
    if (!snapshot) return null;
    return {
      supported: snapshot.supported,
      active: snapshot.active,
      ended: snapshot.ended,
      bidButtonAvailable: snapshot.bidButtonAvailable,
      currentPriceCents: snapshot.currentPriceCents,
      nextBidCents: snapshot.nextBidCents,
      currencySymbol: snapshot.currencySymbol,
      bidState: snapshot.bidState,
      auctionKey: snapshot.auctionKey,
      title: snapshot.title,
      buttonText: snapshot.buttonText
    };
  }

  function publicStatus() {
    return {
      connected: true,
      armed: state.armed,
      pending: state.pending,
      settings: state.settings,
      snapshot: publicSnapshot(state.snapshot),
      decision: state.decision,
      auctionId: state.auctionId,
      suspendedReason: state.suspendedReason,
      lastEvent: state.lastEvent,
      simulator: document.documentElement.dataset.wnpbSimulator === "true"
    };
  }

  function sendRuntimeMessage(message) {
    try {
      const promise = chrome.runtime.sendMessage(message);
      if (promise && typeof promise.catch === "function") promise.catch(() => {});
    } catch (_) {
      return;
    }
  }

  function recordEvent(kind, message, details, notify) {
    const event = {
      kind,
      message,
      details: details || {},
      notify: Boolean(notify && state.settings.notifications),
      testMode: state.settings.testMode,
      timestamp: new Date().toISOString()
    };
    state.lastEvent = event;
    sendRuntimeMessage({ type: "WNPB_RECORD_EVENT", event });
    document.dispatchEvent(new CustomEvent("wnpb-bot-event", { detail: event }));
  }

  function setBadge() {
    sendRuntimeMessage({
      type: "WNPB_SET_BADGE",
      armed: state.armed,
      testMode: state.settings.testMode
    });
  }

  function resetAuction(rawKey) {
    state.rawAuctionKey = rawKey;
    state.auctionEpoch += 1;
    state.auctionId = `${rawKey || "auction"}:${state.auctionEpoch}`;
    state.participation = { waitingForOutbid: false, seenNonOutbid: false, freshOutbid: false };
    state.lastActionKey = null;
    state.pending = false;
  }

  function updateAuctionIdentity(snapshot) {
    if (!snapshot.supported) return;
    if (!state.rawAuctionKey || snapshot.auctionKey !== state.rawAuctionKey) {
      resetAuction(snapshot.auctionKey);
      return;
    }
    const before = state.previousSnapshot;
    const restarted = before && (!before.active || before.ended) && snapshot.active;
    const priceReset = before && before.active && snapshot.active
      && Number.isInteger(before.currentPriceCents)
      && Number.isInteger(snapshot.currentPriceCents)
      && snapshot.currentPriceCents < before.currentPriceCents;
    if (restarted || priceReset) resetAuction(snapshot.auctionKey);
  }

  function updateParticipation(snapshot) {
    state.participation = decisionApi.advanceParticipation(state.participation, snapshot.bidState);
  }

  function arm() {
    if (!Number.isInteger(state.settings.maxBidCents) || state.settings.maxBidCents <= 0) {
      return { ok: false, error: "Enter a valid maximum bid first." };
    }
    state.armed = true;
    state.armedPath = location.pathname;
    state.suspendedReason = null;
    state.rawAuctionKey = null;
    state.previousSnapshot = null;
    state.auctionEpoch = 0;
    resetAuction("pending");
    setBadge();
    recordEvent(
      "armed",
      state.settings.testMode ? "Test mode armed" : "Live bidding armed",
      { maxBidCents: state.settings.maxBidCents, path: state.armedPath },
      false
    );
    scheduleEvaluation(0);
    return { ok: true };
  }

  function disarm(reason, logEvent) {
    const wasArmed = state.armed;
    state.armed = false;
    state.armedPath = null;
    state.pending = false;
    state.suspendedReason = reason || null;
    state.decision = { action: "wait", reason: "disarmed" };
    setBadge();
    updateOverlay();
    if (wasArmed && logEvent) recordEvent("stopped", reason || "Bot stopped", {}, false);
  }

  async function executeDecision(decision, snapshot) {
    const actionKey = `${state.auctionId}:${snapshot.nextBidCents}`;
    state.pending = true;
    state.lastActionKey = actionKey;
    updateOverlay();
    if (decision.action === decisionApi.actions.SIMULATE) {
      state.participation = decisionApi.participationAfterAction(snapshot.bidState);
      state.pending = false;
      recordEvent(
        "would_bid",
        `Would bid ${money.formatCents(snapshot.nextBidCents, snapshot.currencySymbol)}`,
        {
          auctionId: state.auctionId,
          title: snapshot.title,
          currentPriceCents: snapshot.currentPriceCents,
          nextBidCents: snapshot.nextBidCents,
          maxBidCents: state.settings.maxBidCents
        },
        true
      );
      scheduleEvaluation(0);
      return;
    }
    if (!state.armed || state.settings.testMode || snapshot.nextBidCents > state.settings.maxBidCents) {
      state.pending = false;
      state.lastActionKey = null;
      scheduleEvaluation(0);
      return;
    }
    const clickResult = await adapter.clickBid(snapshot.nextBidCents);
    if (!clickResult.clicked) {
      state.pending = false;
      state.lastActionKey = null;
      recordEvent("state_changed", "Bid skipped because the auction changed", { reason: clickResult.reason }, false);
      scheduleEvaluation(0);
      return;
    }
    state.participation = decisionApi.participationAfterAction(snapshot.bidState);
    if (clickResult.confirmationRequired && !clickResult.confirmed) {
      state.pending = false;
      disarm("Confirmation amount could not be verified", false);
      recordEvent(
        "error",
        "Stopped before confirmation because the bid amount could not be verified",
        { nextBidCents: snapshot.nextBidCents },
        true
      );
      return;
    }
    const verification = await adapter.verifyBid(
      snapshot.auctionKey,
      snapshot.nextBidCents,
      snapshot.currentPriceCents
    );
    state.pending = false;
    if (verification.status === "accepted" || verification.status === "observed") {
      recordEvent(
        "bid_submitted",
        `Bid submitted at ${money.formatCents(snapshot.nextBidCents, snapshot.currencySymbol)}`,
        {
          auctionId: state.auctionId,
          title: snapshot.title,
          nextBidCents: snapshot.nextBidCents,
          verification: verification.status
        },
        true
      );
      scheduleEvaluation(0);
      return;
    }
    disarm("Bid result was uncertain", false);
    recordEvent(
      "error",
      "Bot stopped because the bid result could not be verified",
      { verification: verification.status, nextBidCents: snapshot.nextBidCents },
      true
    );
  }

  async function evaluatePage() {
    if (state.evaluating) return;
    state.evaluating = true;
    try {
      if (state.armed && state.armedPath !== location.pathname) {
        disarm("Page changed; arm the bot again", true);
      }
      const snapshot = adapter.probe();
      updateAuctionIdentity(snapshot);
      updateParticipation(snapshot);
      state.snapshot = snapshot;
      const runtime = {
        armed: state.armed,
        pending: state.pending,
        hasBidThisAuction: state.participation.waitingForOutbid,
        lastActionKey: state.lastActionKey,
        auctionId: state.auctionId || snapshot.auctionKey
      };
      state.decision = decisionApi.evaluate(snapshot, state.settings, runtime);
      updateOverlay();
      state.previousSnapshot = publicSnapshot(snapshot);
      if (!state.pending && [decisionApi.actions.SIMULATE, decisionApi.actions.BID].includes(state.decision.action)) {
        await executeDecision(state.decision, snapshot);
      } else if (state.decision.action === decisionApi.actions.STOP) {
        disarm(reasonLabels[state.decision.reason] || "Bot stopped", true);
      }
    } catch (error) {
      disarm("Unexpected page integration error", false);
      recordEvent("error", "Bot stopped after an unexpected page integration error", { message: error.message }, true);
    } finally {
      state.evaluating = false;
    }
  }

  function scheduleEvaluation(delay) {
    clearTimeout(state.evaluationTimer);
    state.evaluationTimer = setTimeout(evaluatePage, Number.isInteger(delay) ? delay : 120);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "WNPB_GET_STATUS") {
      sendResponse(publicStatus());
      return false;
    }
    if (message.type === "WNPB_ARM") {
      sendResponse(arm());
      return false;
    }
    if (message.type === "WNPB_STOP") {
      disarm("Stopped from the extension", true);
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "WNPB_GET_DIAGNOSTICS") {
      sendResponse(adapter.diagnostics());
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const previousMode = state.settings.testMode;
    settingsApi.load().then((settings) => {
      state.settings = settings;
      if (state.armed && previousMode !== settings.testMode) disarm("Mode changed; arm the bot again", true);
      scheduleEvaluation(0);
    });
  });

  document.addEventListener("wnpb-simulator-command", (event) => {
    if (document.documentElement.dataset.wnpbSimulator !== "true") return;
    if (event.detail === "arm") arm();
    if (event.detail === "stop") disarm("Stopped from the simulator", true);
  });

  settingsApi.load().then((settings) => {
    state.settings = settings;
    scheduleEvaluation(0);
  });

  const observer = new MutationObserver((records) => {
    const pageChanged = records.some((record) => {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      return !target || !target.closest("[data-wnpb-ui]");
    });
    if (pageChanged) scheduleEvaluation(100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  setInterval(() => scheduleEvaluation(0), 750);
})();
