const test = require("node:test");
const assert = require("node:assert/strict");
const money = require("../shared/money.js");

test("parses decimal input into cents", () => {
  assert.equal(money.parseCents("25.00"), 2500);
  assert.equal(money.parseCents("$1,234.56"), 123456);
});

test("parses comma decimal currency text", () => {
  assert.equal(money.parseCents("€1.234,56"), 123456);
});

test("extracts the final displayed currency amount", () => {
  assert.equal(money.parsePriceText("Place bid US$42.50"), 4250);
});

test("rejects text without a currency amount", () => {
  assert.equal(money.parsePriceText("Auction ends in 00:12"), null);
});

test("formats whole and fractional amounts", () => {
  assert.equal(money.formatCents(2500, "$"), "$25");
  assert.equal(money.formatCents(2550, "$"), "$25.50");
});
