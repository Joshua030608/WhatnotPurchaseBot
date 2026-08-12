(function (root, factory) {
  const api = factory();
  root.WhatnotBotDecision = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, function () {
  const actions = Object.freeze({
    WAIT: "wait",
    SIMULATE: "simulate",
    BID: "bid",
    STOP: "stop"
  });
  const auctionStartDelayMs = 2000;
  const outbidRebidDelayMs = 250;

  function result(action, reason) {
    return { action, reason };
  }

  function evaluate(snapshot, settings, runtime) {
    if (!runtime.armed) return result(actions.WAIT, "disarmed");
    if (!Number.isInteger(settings.maxBidCents) || settings.maxBidCents <= 0) {
      return result(actions.STOP, "invalid_maximum");
    }
    if (!snapshot.supported) return result(actions.WAIT, "auction_not_detected");
    if (snapshot.ended) return result(actions.WAIT, "auction_ended");
    if (!snapshot.active) return result(actions.WAIT, "auction_inactive");
    if (Number.isFinite(runtime.auctionAgeMs) && runtime.auctionAgeMs < auctionStartDelayMs) {
      return result(actions.WAIT, "auction_start_delay");
    }
    if (!snapshot.bidButtonAvailable) return result(actions.WAIT, "bid_unavailable");
    if (!Number.isInteger(snapshot.nextBidCents)) return result(actions.WAIT, "next_bid_unknown");
    if (snapshot.nextBidCents > settings.maxBidCents) return result(actions.WAIT, "maximum_reached");
    if (snapshot.bidState === "winning") return result(actions.WAIT, "already_winning");
    if (snapshot.bidState === "unknown") return result(actions.WAIT, "bid_state_unknown");
    if (runtime.hasBidThisAuction) {
      return result(actions.WAIT, "waiting_for_outbid");
    }
    if (Number.isFinite(runtime.outbidAgeMs) && runtime.outbidAgeMs < outbidRebidDelayMs) {
      return result(actions.WAIT, "outbid_rebid_delay");
    }
    if (runtime.pending) return result(actions.WAIT, "action_pending");
    const key = `${runtime.auctionId}:${snapshot.nextBidCents}`;
    if (runtime.lastActionKey === key) return result(actions.WAIT, "duplicate_state");
    return result(settings.testMode ? actions.SIMULATE : actions.BID, "eligible");
  }

  function participationAfterAction(bidState) {
    return {
      waitingForOutbid: true,
      seenNonOutbid: bidState !== "outbid",
      freshOutbid: false
    };
  }

  function advanceParticipation(participation, bidState) {
    const current = participation || { waitingForOutbid: false, seenNonOutbid: false };
    if (!current.waitingForOutbid) return { ...current, freshOutbid: false };
    if (bidState !== "outbid") {
      return { waitingForOutbid: true, seenNonOutbid: true, freshOutbid: false };
    }
    if (current.seenNonOutbid) {
      return { waitingForOutbid: false, seenNonOutbid: false, freshOutbid: true };
    }
    return { waitingForOutbid: true, seenNonOutbid: false, freshOutbid: false };
  }

  function advanceTestParticipation(participation, nextBidCents, lastSimulatedBidCents) {
    const current = participation || { waitingForOutbid: false, seenNonOutbid: false };
    if (
      current.waitingForOutbid
      && Number.isInteger(nextBidCents)
      && Number.isInteger(lastSimulatedBidCents)
      && nextBidCents > lastSimulatedBidCents
    ) {
      return { waitingForOutbid: false, seenNonOutbid: false, freshOutbid: true };
    }
    return { ...current, freshOutbid: false };
  }

  return {
    actions,
    auctionStartDelayMs,
    outbidRebidDelayMs,
    evaluate,
    participationAfterAction,
    advanceParticipation,
    advanceTestParticipation
  };
});
