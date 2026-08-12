const test = require("node:test");
const assert = require("node:assert/strict");
const interaction = require("../shared/interaction.js");

test("uses a complete press and release for Whatnot's live bid control", () => {
  assert.deepEqual(interaction.activationSequence("show-bid-button"), ["mousedown", "mouseup"]);
});

test("uses click for other compatible bid controls", () => {
  assert.deepEqual(interaction.activationSequence("other-bid-button"), ["click"]);
});
