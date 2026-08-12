(function (root, factory) {
  root.WhatnotBotSettings = factory();
})(globalThis, function () {
  const defaults = Object.freeze({
    maxBidCents: null,
    testMode: true,
    notifications: true,
    showOverlay: true
  });

  function normalize(input) {
    const value = input || {};
    const maxBidCents = Number.isInteger(value.maxBidCents) && value.maxBidCents > 0
      ? value.maxBidCents
      : null;
    return {
      maxBidCents,
      testMode: value.testMode !== false,
      notifications: value.notifications !== false,
      showOverlay: value.showOverlay !== false
    };
  }

  async function load() {
    return normalize(await chrome.storage.local.get(defaults));
  }

  async function save(patch) {
    const current = await load();
    const next = normalize({ ...current, ...patch });
    await chrome.storage.local.set(next);
    return next;
  }

  return { defaults, normalize, load, save };
});
