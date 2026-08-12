(function (root, factory) {
  const api = factory();
  root.WhatnotBotInteraction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, function () {
  const pressDurationMs = 100;
  const overtakenStabilityMs = 300;

  function activationSequence(testId) {
    return testId === "show-bid-button" ? ["mousedown", "mouseup"] : ["click"];
  }

  function canReleaseBid(snapshot, expectedAuctionKey, expectedCents, continuationAllowed = true) {
    return Boolean(
      continuationAllowed
      && snapshot
      && snapshot.supported
      && snapshot.active
      && !snapshot.ended
      && snapshot.bidButtonAvailable
      && snapshot.auctionKey === expectedAuctionKey
      && snapshot.nextBidCents === expectedCents
      && snapshot.bidState !== "winning"
      && snapshot.bidState !== "unknown"
    );
  }

  function bidObservation(snapshot, expectedCents, previousCurrentCents) {
    if (!snapshot) return null;
    if (snapshot.bidState === "winning") return "accepted";
    const priceCrossed = Number.isInteger(expectedCents)
      && Number.isInteger(snapshot.currentPriceCents)
      && snapshot.currentPriceCents >= expectedCents
      && snapshot.currentPriceCents !== previousCurrentCents
      && (
        snapshot.ended
        || Number.isInteger(snapshot.nextBidCents) && snapshot.nextBidCents > expectedCents
      );
    if (snapshot.bidState === "outbid" && priceCrossed) return "overtaken";
    if (snapshot.bidConfirmed) return "confirmed";
    return null;
  }

  return { pressDurationMs, overtakenStabilityMs, activationSequence, canReleaseBid, bidObservation };
});
