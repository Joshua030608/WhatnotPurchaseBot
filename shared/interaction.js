(function (root, factory) {
  const api = factory();
  root.WhatnotBotInteraction = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis, function () {
  function activationSequence(testId) {
    return testId === "show-bid-button" ? ["mousedown", "mouseup"] : ["click"];
  }

  return { activationSequence };
});
