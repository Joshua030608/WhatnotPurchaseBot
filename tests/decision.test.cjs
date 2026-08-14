const test = require("node:test");
const assert = require("node:assert/strict");
const {
  actions,
  evaluate,
  auctionStartDelayRangeMs,
  outbidRebidDelayRangeMs,
  randomDelayMs,
  participationAfterAction,
  advanceParticipation,
  advanceTestParticipation
} = require("../shared/decision.js");

function snapshot(overrides = {}) {
  return {
    supported: true,
    active: true,
    ended: false,
    bidButtonAvailable: true,
    nextBidCents: 1100,
    bidState: "neutral",
    ...overrides
  };
}

function settings(overrides = {}) {
  return { maxBidCents: 2500, testMode: true, ...overrides };
}

function runtime(overrides = {}) {
  return {
    armed: true,
    pending: false,
    hasBidThisAuction: false,
    lastActionKey: null,
    auctionId: "auction-1",
    auctionAgeMs: 2000,
    auctionStartDelayMs: 2000,
    outbidAgeMs: Infinity,
    outbidRebidDelayMs: 1000,
    ...overrides
  };
}

test("does nothing while disarmed", () => {
  assert.deepEqual(evaluate(snapshot(), settings(), runtime({ armed: false })), {
    action: actions.WAIT,
    reason: "disarmed"
  });
});

test("stops when no valid maximum is configured", () => {
  assert.equal(evaluate(snapshot(), settings({ maxBidCents: null }), runtime()).action, actions.STOP);
});

test("waits when an auction cannot be detected", () => {
  assert.equal(evaluate(snapshot({ supported: false }), settings(), runtime()).reason, "auction_not_detected");
});

test("never bids above the configured maximum", () => {
  assert.deepEqual(evaluate(snapshot({ nextBidCents: 2501 }), settings(), runtime()), {
    action: actions.WAIT,
    reason: "maximum_reached"
  });
});

test("allows a bid equal to the configured maximum", () => {
  assert.equal(evaluate(snapshot({ nextBidCents: 2500 }), settings(), runtime()).action, actions.SIMULATE);
});

test("waits until the sampled auction-start delay has elapsed", () => {
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 4999, auctionStartDelayMs: 5000 })).reason, "auction_start_delay");
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 5000, auctionStartDelayMs: 5000 })).action, actions.SIMULATE);
});

test("waits until the sampled outbid delay has elapsed", () => {
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 499, outbidRebidDelayMs: 500 })).reason, "outbid_rebid_delay");
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 500, outbidRebidDelayMs: 500 })).action, actions.SIMULATE);
});

test("samples inclusive delay values within the configured ranges", () => {
  assert.deepEqual(auctionStartDelayRangeMs, { min: 2000, max: 7000 });
  assert.deepEqual(outbidRebidDelayRangeMs, { min: 1, max: 1000 });
  assert.equal(randomDelayMs(auctionStartDelayRangeMs, () => 0), 2000);
  assert.equal(randomDelayMs(auctionStartDelayRangeMs, () => 1), 7000);
  assert.equal(randomDelayMs(outbidRebidDelayRangeMs, () => 0), 1);
  assert.equal(randomDelayMs(outbidRebidDelayRangeMs, () => 1), 1000);
});

test("clamps evaluated delays to their allowed ranges", () => {
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 1999, auctionStartDelayMs: 0 })).reason, "auction_start_delay");
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 2000, auctionStartDelayMs: 0 })).action, actions.SIMULATE);
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 6999, auctionStartDelayMs: 9000 })).reason, "auction_start_delay");
  assert.equal(evaluate(snapshot(), settings(), runtime({ auctionAgeMs: 7000, auctionStartDelayMs: 9000 })).action, actions.SIMULATE);
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 0, outbidRebidDelayMs: 0 })).reason, "outbid_rebid_delay");
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 1, outbidRebidDelayMs: 0 })).action, actions.SIMULATE);
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 999, outbidRebidDelayMs: 9000 })).reason, "outbid_rebid_delay");
  assert.equal(evaluate(snapshot({ bidState: "outbid" }), settings(), runtime({ outbidAgeMs: 1000, outbidRebidDelayMs: 9000 })).action, actions.SIMULATE);
});

test("does not bid while the user is winning", () => {
  assert.equal(evaluate(snapshot({ bidState: "winning" }), settings(), runtime()).reason, "already_winning");
});

test("does not bid when the visible winner cannot be matched to the user", () => {
  assert.equal(evaluate(snapshot({ bidState: "unknown" }), settings(), runtime()).reason, "bid_state_unknown");
});

test("does not bid itself up without a confirmed outbid", () => {
  assert.equal(evaluate(snapshot(), settings(), runtime({ hasBidThisAuction: true })).reason, "waiting_for_outbid");
});

test("bids again after a confirmed outbid", () => {
  const ready = advanceParticipation(
    advanceParticipation(participationAfterAction("neutral"), "winning"),
    "outbid"
  );
  assert.equal(
    evaluate(snapshot({ bidState: "outbid", nextBidCents: 1200 }), settings(), runtime({ hasBidThisAuction: ready.waitingForOutbid })).action,
    actions.SIMULATE
  );
});

test("uses the direct bid action in live mode", () => {
  assert.equal(evaluate(snapshot(), settings({ testMode: false }), runtime()).action, actions.BID);
});

test("deduplicates an already handled auction price", () => {
  assert.equal(
    evaluate(snapshot(), settings(), runtime({ lastActionKey: "auction-1:1100" })).reason,
    "duplicate_state"
  );
});

test("requires a stale outbid marker to clear before it can trigger again", () => {
  const afterAction = participationAfterAction("outbid");
  const stillStale = advanceParticipation(afterAction, "outbid");
  assert.equal(stillStale.waitingForOutbid, true);
  assert.equal(stillStale.freshOutbid, false);
  const cleared = advanceParticipation(stillStale, "winning");
  const returned = advanceParticipation(cleared, "outbid");
  assert.equal(returned.waitingForOutbid, false);
  assert.equal(returned.freshOutbid, true);
});

test("test mode stays locked while the next bid is unchanged", () => {
  const afterAction = participationAfterAction("outbid");
  const unchanged = advanceTestParticipation(afterAction, 200, 200);
  assert.equal(unchanged.waitingForOutbid, true);
  assert.equal(unchanged.freshOutbid, false);
});

test("test mode treats a higher next bid as a simulated outbid", () => {
  const afterAction = participationAfterAction("outbid");
  const advanced = advanceTestParticipation(afterAction, 300, 200);
  assert.equal(advanced.waitingForOutbid, false);
  assert.equal(advanced.freshOutbid, true);
  assert.equal(
    evaluate(
      snapshot({ nextBidCents: 300, bidState: "outbid" }),
      settings({ maxBidCents: 500 }),
      runtime({ hasBidThisAuction: advanced.waitingForOutbid, lastActionKey: "auction-1:200" })
    ).action,
    actions.SIMULATE
  );
});

test("test mode still stops simulating above the maximum", () => {
  const advanced = advanceTestParticipation(participationAfterAction("outbid"), 600, 500);
  assert.equal(
    evaluate(
      snapshot({ nextBidCents: 600, bidState: "outbid" }),
      settings({ maxBidCents: 500 }),
      runtime({ hasBidThisAuction: advanced.waitingForOutbid, lastActionKey: "auction-1:500" })
    ).reason,
    "maximum_reached"
  );
});
