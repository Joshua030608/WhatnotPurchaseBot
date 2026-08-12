const test = require("node:test");
const assert = require("node:assert/strict");
const {
  actions,
  evaluate,
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

test("does not bid while the user is winning", () => {
  assert.equal(evaluate(snapshot({ bidState: "winning" }), settings(), runtime()).reason, "already_winning");
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
