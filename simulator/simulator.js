(function () {
  const money = globalThis.WhatnotBotMoney;
  const settingsApi = globalThis.WhatnotBotSettings;
  const auction = document.querySelector("[data-wnpb-auction]");
  const currentPrice = auction.querySelector("[data-wnpb-role='current-price']");
  const nextBid = auction.querySelector("[data-wnpb-role='next-bid']");
  const bidStatus = auction.querySelector("[data-wnpb-role='bid-status']");
  const bidButton = auction.querySelector("[data-wnpb-role='bid-button']");
  const maxInput = document.getElementById("simMax");
  const incrementInput = document.getElementById("simIncrement");
  const testModeInput = document.getElementById("simTestMode");
  const confirmationInput = document.getElementById("simConfirmation");
  const confirmDialog = document.getElementById("confirmDialog");
  const confirmAmount = document.getElementById("confirmAmount");
  const confirmBid = document.getElementById("confirmBid");
  const log = document.getElementById("simLog");
  const simState = document.getElementById("simState");
  let currentCents = 1000;
  let nextCents = 1100;
  let lot = 1;
  let stagedBidCents = null;
  let confirmationBidCents = null;

  function format(cents) {
    return money.formatCents(cents, "$");
  }

  function renderAuction() {
    currentPrice.textContent = format(currentCents);
    nextBid.textContent = format(nextCents);
    bidButton.textContent = `Bid ${format(nextCents)}`;
    bidButton.setAttribute("aria-label", `Bid ${format(nextCents)}`);
  }

  function addLog(message) {
    if (log.querySelector("p") && log.children.length === 1 && log.textContent.includes("No events")) log.replaceChildren();
    const entry = document.createElement("p");
    entry.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
    log.prepend(entry);
  }

  function acceptBid(bidCents) {
    currentCents = bidCents;
    nextCents = bidCents + (money.parseCents(incrementInput.value) || 100);
    auction.dataset.wnpbBidState = "winning";
    bidStatus.textContent = "You're currently winning";
    renderAuction();
    addLog(`UI accepted ${format(currentCents)}`);
  }

  async function saveSettings() {
    const maxBidCents = money.parseCents(maxInput.value);
    await settingsApi.save({
      maxBidCents: Number.isInteger(maxBidCents) && maxBidCents > 0 ? maxBidCents : null,
      testMode: testModeInput.checked,
      notifications: true,
      showOverlay: true
    });
  }

  bidButton.addEventListener("mousedown", () => {
    stagedBidCents = nextCents;
  });

  document.addEventListener("mouseup", (event) => {
    const bidCents = stagedBidCents;
    stagedBidCents = null;
    if (!Number.isInteger(bidCents) || !bidButton.contains(event.target)) return;
    if (confirmationInput.checked) {
      confirmationBidCents = bidCents;
      confirmAmount.textContent = format(bidCents);
      confirmBid.textContent = `Confirm bid ${format(bidCents)}`;
      confirmDialog.showModal();
      return;
    }
    acceptBid(bidCents);
  });

  confirmBid.addEventListener("click", () => {
    const bidCents = confirmationBidCents;
    confirmationBidCents = null;
    confirmDialog.close();
    if (Number.isInteger(bidCents)) acceptBid(bidCents);
  });

  document.getElementById("simArm").addEventListener("click", async () => {
    await saveSettings();
    document.dispatchEvent(new CustomEvent("wnpb-simulator-command", { detail: "arm" }));
    simState.textContent = testModeInput.checked ? "Test armed" : "Live armed";
    addLog(testModeInput.checked ? "Test mode armed" : "Live mode armed");
  });

  document.getElementById("simStop").addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("wnpb-simulator-command", { detail: "stop" }));
    simState.textContent = "Stopped";
  });

  document.getElementById("simOutbid").addEventListener("click", () => {
    if (auction.dataset.wnpbEnded === "true") return;
    currentCents = nextCents;
    nextCents += money.parseCents(incrementInput.value) || 100;
    auction.dataset.wnpbBidState = "outbid";
    bidStatus.textContent = "You've been outbid";
    renderAuction();
    addLog(`Competitor bid ${format(currentCents)}`);
  });

  document.getElementById("simNewAuction").addEventListener("click", () => {
    lot += 1;
    currentCents = 1000;
    nextCents = currentCents + (money.parseCents(incrementInput.value) || 100);
    stagedBidCents = null;
    confirmationBidCents = null;
    auction.dataset.auctionId = `sim-${lot}`;
    auction.dataset.wnpbBidState = "neutral";
    auction.dataset.wnpbEnded = "false";
    document.getElementById("lotNumber").textContent = String(lot);
    bidStatus.textContent = "Open for bids";
    bidButton.disabled = false;
    renderAuction();
    addLog(`Auction ${lot} started`);
  });

  document.getElementById("simEndAuction").addEventListener("click", () => {
    auction.dataset.wnpbEnded = "true";
    bidStatus.textContent = "Auction ended";
    bidButton.disabled = true;
    addLog("Auction ended");
  });

  document.addEventListener("wnpb-bot-event", (event) => {
    addLog(event.detail.message);
    if (event.detail.kind === "error") simState.textContent = "Stopped";
  });

  settingsApi.load().then((settings) => {
    if (settings.maxBidCents) maxInput.value = (settings.maxBidCents / 100).toFixed(2);
    testModeInput.checked = settings.testMode;
  });

  renderAuction();
})();
