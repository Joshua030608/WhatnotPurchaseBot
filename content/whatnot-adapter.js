(function (root, factory) {
  root.WhatnotPageAdapter = factory(root.WhatnotBotMoney);
})(globalThis, function (money) {
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
    if (!button) return document.body;
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
    return nextBid ? null : readFirstPrice(auctionRoot, ["[data-price]"]);
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
    if (/you(?:'ve| have)?\s+been\s+outbid|you(?:'re| are)\s+outbid|\boutbid\b/i.test(text)) return "outbid";
    if (/you(?:'re| are)\s+(?:currently\s+)?winning|you(?:'re| are)\s+(?:the\s+)?highest\s+bidder/i.test(text)) return "winning";
    return "neutral";
  }

  function readTitle(auctionRoot) {
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
    const ended = auctionRoot.getAttribute("data-wnpb-ended") === "true" || /\b(auction\s+ended|auction\s+closed|item\s+sold|sold\s+to)\b/i.test(rootText);
    const title = readTitle(auctionRoot);
    const bidState = readBidState(auctionRoot);
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

  async function clickBid(expectedCents) {
    const before = probe();
    if (!before.supported || !before.bidButtonAvailable || before.nextBidCents !== expectedCents) {
      return { clicked: false, reason: "state_changed" };
    }
    before.button.focus({ preventScroll: true });
    before.button.click();
    await delay(200);
    const visibleDialog = Array.from(document.querySelectorAll("[role='dialog'], dialog")).find(isVisible);
    if (!visibleDialog) return { clicked: true, confirmed: true, confirmationRequired: false, before };
    const confirmation = dialogConfirmation(expectedCents);
    if (!confirmation) return { clicked: true, confirmed: false, confirmationRequired: true, before };
    confirmation.focus({ preventScroll: true });
    confirmation.click();
    return { clicked: true, confirmed: true, confirmationRequired: true, before };
  }

  async function verifyBid(auctionKey, expectedCents, previousCurrentCents) {
    const deadline = Date.now() + 3500;
    while (Date.now() < deadline) {
      await delay(175);
      const after = probe();
      if (after.auctionKey !== auctionKey) return { status: "auction_changed", snapshot: after };
      if (after.bidState === "winning") return { status: "accepted", snapshot: after };
      if (after.ended) return { status: "ended", snapshot: after };
      const priceAdvanced = Number.isInteger(after.currentPriceCents) && after.currentPriceCents >= expectedCents && after.currentPriceCents !== previousCurrentCents;
      const nextAdvanced = Number.isInteger(after.nextBidCents) && after.nextBidCents > expectedCents;
      if (priceAdvanced || nextAdvanced) return { status: "observed", snapshot: after };
    }
    return { status: "uncertain", snapshot: probe() };
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
        auctionKey: snapshot.auctionKey,
        buttonText: snapshot.buttonText
      },
      candidates
    };
  }

  return { probe, clickBid, verifyBid, diagnostics };
});
