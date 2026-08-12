const defaults = {
  maxBidCents: null,
  testMode: true,
  notifications: true,
  showOverlay: true,
  eventLog: []
};
let eventQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (current[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
});

function notificationTitle(event) {
  if (event.kind === "would_bid") return "Whatnot Bot · Test mode";
  if (event.kind === "bid_submitted") return "Whatnot Bot · Bid submitted";
  if (event.kind === "error") return "Whatnot Bot · Stopped";
  return "Whatnot Purchase Bot";
}

async function recordEvent(event) {
  const stored = await chrome.storage.local.get({ eventLog: [] });
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...event
  };
  const eventLog = [entry, ...stored.eventLog].slice(0, 75);
  await chrome.storage.local.set({ eventLog });
  if (entry.notify) {
    await chrome.notifications.create(entry.id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
      title: notificationTitle(entry),
      message: entry.message,
      priority: entry.kind === "error" ? 2 : 1
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  if (message.type === "WNPB_RECORD_EVENT" && message.event) {
    eventQueue = eventQueue.then(() => recordEvent(message.event)).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "WNPB_SET_BADGE" && sender.tab && Number.isInteger(sender.tab.id)) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: message.armed ? (message.testMode ? "TEST" : "ON") : "" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: message.testMode ? "#D79822" : "#168A47" });
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === "WNPB_CLEAR_LOG") {
    chrome.storage.local.set({ eventLog: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
