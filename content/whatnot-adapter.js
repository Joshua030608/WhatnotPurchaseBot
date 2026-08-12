(function (root, factory) {
  root.WhatnotPageAdapter = factory(root.WhatnotBotMoney, root.WhatnotBotInteraction);
})(globalThis, function (money, interaction) {
  const priceSelectors = [
    "[data-wnpb-role='current-price']",
    "[data-testid*='current-bid' i]",
    "[data-testid*='current-price' i]",
    "[aria-label*='current bid' i]",
    "[aria-label*='current price' i]"
  ];
  const nextBidSelectors = [
    "[data-wnpb-role='next-bid']",
    "[data-testid*='next-bid' i]",
    "[aria-label*='next bid' i]"
  ];
  const titleSelectors = [
    "[data-wnpb-role='title']",
    "[data-testid*='product-title' i]",
    "[data-testid*='listing-title' i]",
    "[data-testid*='auction-title' i]",
    "h1",
    "h2"
  ];

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function elementText(element) {
    return cleanText([
      element && element.getAttribute && element.getAttribute("aria-label"),
      element && element.textContent
    ].filter(Boolean).join(" "));
  }

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    if (element.closest("[data-wnpb-ui]")) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function queryVisible(scope, selector) {
    return Array.from((scope || document).querySelectorAll(selector)).find(isVisible) || null;
  }

  function readFirstPrice(scope, selectors) {
    for (const selector of selectors) {
      const element = queryVisible(scope, selector);
      if (!element) continue;
      const cents = money.parsePriceText(elementText(element));
      if (Number.isInteger(cents)) return { cents, text: elementText(element), element };
    }
    return null;
  }

  function scoreBidButton(button) {
    if (!isVisible(button)) return -100;
    const text = elementText(button);
    const testId = cleanText(button.getAttribute("data-testid"));
    const role = cleanText(button.getAttribute("data-wnpb-role"));
    const combined = `${text} ${testId} ${role}`.toLowerCase();
    if (/custom|max\s*bid|pre[-\s]?bid|buy\s*(it\s*)?now|offer|giveaway|cancel|history/.test(combined)) return -100;
    let score = 0;
    if (role === "bid-button") score += 100;
    if (/bid[-_ ]?(button|cta)|place[-_ ]?bid/.test(testId.toLowerCase())) score += 30;
    if (/^(place\s+)?bid\b/i.test(text)) score += 20;
    if (/\bbid\b/i.test(text)) score += 8;
    if (/\bbid\b/i.test(button.getAttribute("aria-label") || "")) score += 10;
    if (Number.isInteger(money.parsePriceText(text))) score += 5;
    if (button.closest("[role='dialog']")) score -= 8;
    return score;
  }

  function findBidButton() {
    const candidates = Array.from(document.querySelectorAll("button, [role='button']"));
    let winner = null;
    let score = 0;
    for (const candidate of candidates) {
      const candidateScore = scoreBidButton(candidate);
      if (candidateScore > score) {
        winner = candidate;
        score = candidateScore;
      }
    }
    return score >= 8 ? winner : null;
  }

  function findAuctionRoot(button) {
    if (!button) {
      return queryVisible(document, "section[class*='LivePlayer_livePlayer__'], [data-wnpb-auction]") || document.body;
    }
    const livePlayer = button.closest("section[class*='LivePlayer_livePlayer__']");
    if (livePlayer) return livePlayer;
    const explicit = button.closest("[data-wnpb-auction], [data-testid*='auction' i], [data-testid*='live-item' i]");
    if (explicit) return explicit;
    let current = button.parentElement;
    let best = current || document.body;
    let bestScore = -1;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const text = cleanText(current.innerText).slice(0, 5000);
      let score = 0;
      if (money.parsePriceText(text) !== null) score += 2;
      if (/\b\d{1,2}:\d{2}\b/.test(text)) score += 2;
      if (/\b(current|next)\s+(bid|price)\b/i.test(text)) score += 2;
      if (/\b(auction|winning|outbid)\b/i.test(text)) score += 1;
      if (score > bestScore) {
        best = current;
        bestScore = score;
      }
      if (score >= 5) break;
    }
    return best || document.body;
  }

  function readNextBid(button, auctionRoot) {
    const buttonText = elementText(button);
    const fromButton = money.parsePriceText(buttonText);
    if (Number.isInteger(fromButton)) return { cents: fromButton, text: buttonText, element: button };
    const direct = readFirstPrice(auctionRoot, nextBidSelectors);
    if (direct) return direct;
    const candidates = Array.from(auctionRoot.querySelectorAll("[aria-label], [data-testid], span, p, div"));
    for (const element of candidates.slice(0, 500)) {
      if (!isVisible(element)) continue;
      const text = elementText(element);
      if (!/\b(next\s+bid|bid\s+(?:now|amount)|place\s+bid)\b/i.test(text)) continue;
      const cents = money.parsePriceText(text);
      if (Number.isInteger(cents)) return { cents, text, element };
    }
    return null;
  }

  function readCurrentPrice(auctionRoot, nextBid) {
    const direct = readFirstPrice(auctionRoot, priceSelectors);
    if (direct) return direct;
    const candidates = Array.from(auctionRoot.querySelectorAll("[aria-label], [data-testid], span, p, div"));
    for (const element of candidates.slice(0, 500)) {
      if (!isVisible(element)) continue;
      const text = elementText(element);
      if (!/\b(current\s+(bid|price)|high\s+bid)\b/i.test(text)) continue;
      const cents = money.parsePriceText(text);
      if (Number.isInteger(cents)) return { cents, text, element };
    }
    const exactPrices = Array.from(auctionRoot.querySelectorAll("strong, span, div"));
    for (const element of exactPrices.slice(0, 500)) {
      if (!isVisible(element) || element.closest("[data-testid='show-bid-button'], [data-wnpb-role='bid-button']")) continue;
      const text = cleanText(element.innerText || element.textContent);
      if (!/^(?:US\$|CA\$|AU\$|NZ\$|[\$£€])\s*\d[\d.,]*$/i.test(text)) continue;
      const cents = money.parsePriceText(text);
      if (Number.isInteger(cents)) return { cents, text, element };
    }
    return nextBid ? null : readFirstPrice(auctionRoot, ["[data-price]"]);
  }

  function readViewerUsername() {
    const selectors = [
      "#team-invite-profile-menu-anchor img[alt]",
      "[data-testid*='profile-menu' i] img[alt]",
      "[aria-label*='profile' i] img[alt]",
      "header button img[alt]",
      "[role='banner'] button img[alt]"
    ];
    const ignored = new Set(["activity", "inbox", "notifications", "referrals", "search", "wallet"]);
    for (const selector of selectors) {
      for (const image of document.querySelectorAll(selector)) {
        const username = cleanText(image.getAttribute("alt")).toLowerCase();
        if (/^[a-z0-9_.-]{2,64}$/.test(username) && !ignored.has(username)) return username;
      }
    }
    return "";
  }

  function readBidState(auctionRoot) {
    const explicit = auctionRoot.getAttribute("data-wnpb-bid-state");
    if (["winning", "outbid", "neutral"].includes(explicit)) return explicit;
    const selectors = [
      "[data-wnpb-role='bid-status']",
      "[data-testid*='bid-status' i]",
      "[data-testid*='winning' i]",
      "[data-testid*='outbid' i]",
      "[role='status']",
      "[aria-live]"
    ];
    const texts = [];
    for (const selector of selectors) {
      for (const element of Array.from(auctionRoot.querySelectorAll(selector)).slice(0, 20)) {
        if (isVisible(element)) texts.push(elementText(element));
      }
    }
    const text = cleanText(texts.join(" "));
    if (/you(?:'re| are)\s+(?:currently\s+)?winning|you(?:'re| are)\s+(?:the\s+)?highest\s+bidder/i.test(text)) return "winning";
    if (/you(?:'ve| have)?\s+been\s+outbid|you(?:'re| are)\s+outbid/i.test(text)) return "outbid";
    const winnerMatch = cleanText(auctionRoot.innerText).match(/(?:^|\s)([a-z0-9_.-]+)\s+is\s+Winning!/i);
    if (winnerMatch) {
      const viewer = readViewerUsername();
      if (!viewer) return "unknown";
      return winnerMatch[1].toLowerCase() === viewer ? "winning" : "outbid";
    }
    return "neutral";
  }

  function readBidConfirmation(auctionRoot) {
    return Array.from(auctionRoot.querySelectorAll("[aria-label], [role='status']")).some((element) => (
      isVisible(element) && /\bbid\s+confirmed\b/i.test(elementText(element))
    ));
  }

  function readTitle(auctionRoot) {
    const detailsButton = Array.from(auctionRoot.querySelectorAll("button")).find((button) => {
      if (!isVisible(button) || button.matches("[data-testid='show-bid-button']")) return false;
      const text = cleanText(button.innerText || button.textContent);
      return /\b\d+\s+Bids?\b/i.test(text) && /Shipping/i.test(text);
    });
    if (detailsButton) {
      const title = cleanText(detailsButton.querySelector("strong")?.textContent);
      if (title) return title;
    }
    for (const selector of titleSelectors) {
      const element = queryVisible(auctionRoot, selector);
      if (!element) continue;
      const text = cleanText(element.innerText || element.textContent);
      if (text && text.length <= 300) return text;
    }
    return "Current auction";
  }

  function readAuctionKey(auctionRoot, title) {
    const attributes = ["data-auction-id", "data-listing-id", "data-product-id", "data-item-id", "data-key"];
    for (const name of attributes) {
      const value = auctionRoot.getAttribute(name) || auctionRoot.closest(`[${name}]`)?.getAttribute(name);
      if (value) return `${name}:${value}`;
    }
    return `${location.pathname}:${cleanText(title).toLowerCase().slice(0, 120)}`;
  }

  function isDisabled(button) {
    return !button || button.matches(":disabled, [aria-disabled='true'], [data-disabled='true']");
  }

  function probe() {
    const button = findBidButton();
    const auctionRoot = findAuctionRoot(button);
    const nextBid = button ? readNextBid(button, auctionRoot) : null;
    const currentPrice = readCurrentPrice(auctionRoot, nextBid);
    const rootText = cleanText(auctionRoot.innerText).slice(0, 8000);
    const ended = auctionRoot.getAttribute("data-wnpb-ended") === "true" || /\b(auction\s+ended|auction\s+closed|item\s+sold|sold\s+to|awaiting\s+next\s+item)\b/i.test(rootText);
    const title = readTitle(auctionRoot);
    const bidState = readBidState(auctionRoot);
    const bidConfirmed = readBidConfirmation(auctionRoot);
    const supported = Boolean(button && nextBid);
    return {
      supported,
      active: supported && !ended,
      ended,
      bidButtonAvailable: Boolean(button && !isDisabled(button)),
      currentPriceCents: currentPrice ? currentPrice.cents : null,
      nextBidCents: nextBid ? nextBid.cents : null,
      currencySymbol: money.currencySymbol((nextBid && nextBid.text) || (currentPrice && currentPrice.text) || "$"),
      bidState,
      bidConfirmed,
      auctionKey: readAuctionKey(auctionRoot, title),
      title,
      buttonText: button ? elementText(button) : null,
      button,
      auctionRoot
    };
  }

  function dialogConfirmation(expectedCents) {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], dialog")).filter(isVisible);
    for (const dialog of dialogs) {
      const dialogText = elementText(dialog);
      if (!/\bbid\b/i.test(dialogText)) continue;
      const prices = dialogText.match(/(?:US\$|CA\$|AU\$|NZ\$|[\$£€])\s*\d[\d.,]*/gi) || [];
      if (!prices.some((value) => money.parseCents(value) === expectedCents)) continue;
      const buttons = Array.from(dialog.querySelectorAll("button, [role='button']")).filter(isVisible);
      const button = buttons.find((candidate) => {
        const text = elementText(candidate);
        return /^(confirm|place\s+bid|bid\b)/i.test(text) && !/cancel|custom|max/i.test(text) && !isDisabled(candidate);
      });
      if (button) return button;
    }
    return null;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function releaseMouse(target, rect) {
    target.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    }));
  }

  function continuationAllowed(canContinue) {
    try {
      return typeof canContinue !== "function" || canContinue();
    } catch (_) {
      return false;
    }
  }

  async function activateBidButton(button, expectedAuctionKey, expectedCents, canContinue) {
    const sequence = interaction.activationSequence(button.getAttribute("data-testid"));
    if (sequence.length === 1 && sequence[0] === "click") {
      if (!continuationAllowed(canContinue)) return { completed: false, sequence };
      HTMLButtonElement.prototype.click.call(button);
      return { completed: true, sequence };
    }
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    }));
    await delay(interaction.pressDurationMs);
    const current = probe();
    const canRelease = button.isConnected
      && current.button === button
      && interaction.canReleaseBid(
        current,
        expectedAuctionKey,
        expectedCents,
        continuationAllowed(canContinue)
      );
    releaseMouse(canRelease ? button : document, rect);
    if (!canRelease) return { completed: false, sequence };
    return { completed: true, sequence };
  }

  async function clickBid(expectedAuctionKey, expectedCents, canContinue) {
    const before = probe();
    if (!interaction.canReleaseBid(
      before,
      expectedAuctionKey,
      expectedCents,
      continuationAllowed(canContinue)
    )) {
      return { clicked: false, reason: "state_changed" };
    }
    before.button.focus({ preventScroll: true });
    const activation = await activateBidButton(before.button, expectedAuctionKey, expectedCents, canContinue);
    if (!activation.completed) return { clicked: false, reason: "state_changed" };
    await delay(200);
    const visibleDialog = Array.from(document.querySelectorAll("[role='dialog'], dialog")).find(isVisible);
    if (!visibleDialog) return { clicked: true, confirmed: true, confirmationRequired: false, activationSequence: activation.sequence, before };
    if (!continuationAllowed(canContinue)) {
      return { clicked: true, confirmed: false, confirmationRequired: true, reason: "state_changed", activationSequence: activation.sequence, before };
    }
    const confirmation = dialogConfirmation(expectedCents);
    if (!confirmation) return { clicked: true, confirmed: false, confirmationRequired: true, activationSequence: activation.sequence, before };
    confirmation.focus({ preventScroll: true });
    confirmation.click();
    return { clicked: true, confirmed: true, confirmationRequired: true, activationSequence: activation.sequence, before };
  }

  async function verifyBid(auctionKey, expectedCents, previousCurrentCents) {
    const deadline = Date.now() + 5000;
    let overtakenSince = null;
    while (Date.now() < deadline) {
      await delay(75);
      const after = probe();
      if (after.auctionKey !== auctionKey) return { status: "auction_changed", snapshot: after };
      const observation = interaction.bidObservation(after, expectedCents, previousCurrentCents);
      if (after.ended) return { status: observation || "ended", snapshot: after };
      if (observation === "overtaken") {
        overtakenSince = overtakenSince || Date.now();
        if (Date.now() - overtakenSince >= interaction.overtakenStabilityMs) {
          return { status: observation, snapshot: after };
        }
      } else {
        overtakenSince = null;
        if (observation) return { status: observation, snapshot: after };
      }
    }
    const snapshot = probe();
    return {
      status: interaction.bidObservation(snapshot, expectedCents, previousCurrentCents) || "uncertain",
      snapshot
    };
  }

  function diagnostics() {
    const snapshot = probe();
    const candidates = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter(isVisible)
      .map((element) => ({
        text: elementText(element).slice(0, 160),
        ariaLabel: cleanText(element.getAttribute("aria-label")).slice(0, 160),
        testId: cleanText(element.getAttribute("data-testid")).slice(0, 160),
        score: scoreBidButton(element),
        disabled: isDisabled(element)
      }))
      .filter((entry) => entry.score > -100 || /bid/i.test(`${entry.text} ${entry.ariaLabel} ${entry.testId}`))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
    return {
      url: `${location.origin}${location.pathname}`,
      title: document.title,
      detected: {
        supported: snapshot.supported,
        active: snapshot.active,
        ended: snapshot.ended,
        currentPriceCents: snapshot.currentPriceCents,
        nextBidCents: snapshot.nextBidCents,
        bidState: snapshot.bidState,
        bidConfirmed: snapshot.bidConfirmed,
        auctionKey: snapshot.auctionKey,
        buttonText: snapshot.buttonText
      },
      candidates
    };
  }

  return { probe, clickBid, verifyBid, diagnostics };
});
