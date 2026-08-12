const test = require("node:test");
const assert = require("node:assert/strict");
const interaction = require("../shared/interaction.js");

test("uses a complete press and release for Whatnot's live bid control", () => {
  assert.deepEqual(interaction.activationSequence("show-bid-button"), ["mousedown", "mouseup"]);
  assert.equal(interaction.pressDurationMs, 100);
  assert.equal(interaction.overtakenStabilityMs, 300);
});

test("uses click for other compatible bid controls", () => {
  assert.deepEqual(interaction.activationSequence("other-bid-button"), ["click"]);
});

test("releases a staged bid only while the exact auction state is still eligible", () => {
  const eligible = {
    supported: true,
    active: true,
    ended: false,
    bidButtonAvailable: true,
    auctionKey: "auction-1",
    nextBidCents: 200,
    bidState: "outbid"
  };
  assert.equal(interaction.canReleaseBid(eligible, "auction-1", 200), true);
  assert.equal(interaction.canReleaseBid({ ...eligible, auctionKey: "auction-2" }, "auction-1", 200), false);
  assert.equal(interaction.canReleaseBid({ ...eligible, nextBidCents: 300 }, "auction-1", 200), false);
  assert.equal(interaction.canReleaseBid({ ...eligible, bidState: "winning" }, "auction-1", 200), false);
  assert.equal(interaction.canReleaseBid({ ...eligible, bidState: "unknown" }, "auction-1", 200), false);
  assert.equal(interaction.canReleaseBid({ ...eligible, ended: true }, "auction-1", 200), false);
  assert.equal(interaction.canReleaseBid(eligible, "auction-1", 200, false), false);
});

test("accepts an explicit winning state", () => {
  assert.equal(interaction.bidObservation({ bidState: "winning" }, 200, 100), "accepted");
});

test("accepts an explicit bid confirmation", () => {
  assert.equal(interaction.bidObservation({ bidState: "neutral", bidConfirmed: true }, 200, 100), "confirmed");
});

test("recognizes an attempted bid that was immediately overtaken", () => {
  assert.equal(interaction.bidObservation({
    bidState: "outbid",
    bidConfirmed: false,
    ended: false,
    currentPriceCents: 200,
    nextBidCents: 300
  }, 200, 100), "overtaken");
});

test("does not verify an unchanged stale outbid state", () => {
  assert.equal(interaction.bidObservation({
    bidState: "outbid",
    bidConfirmed: false,
    ended: false,
    currentPriceCents: 100,
    nextBidCents: 200
  }, 200, 100), null);
});

test("recognizes an overtaken attempt when the auction ends", () => {
  assert.equal(interaction.bidObservation({
    bidState: "outbid",
    bidConfirmed: false,
    ended: true,
    currentPriceCents: 200,
    nextBidCents: null
  }, 200, 100), "overtaken");
});

test("does not use price movement without a positive outbid state", () => {
  assert.equal(interaction.bidObservation({
    bidState: "neutral",
    bidConfirmed: false,
    ended: false,
    currentPriceCents: 200,
    nextBidCents: 300
  }, 200, 100), null);
});
