// background.js - xDarkGuard Service Worker with Include/Exclude Modes

const DEFAULTS = {
  enabled: true,
  mode: "dynamic",
  listMode: "include",
  autoDarkenBright: true,
  siteList: [],
  ignoreList: [],
  siteSettings: {}
};

function isHostInList(host, list = []) {
  if (!host || !Array.isArray(list)) return false;
  const lowerHost = host.toLowerCase();
  return list.some(item => {
    const lowerItem = item.toLowerCase().trim();
    if (!lowerItem) return false;
    return lowerHost === lowerItem || lowerHost.endsWith("." + lowerItem);
  });
}

function isSiteDark(host, data) {
  if (data.enabled === false) return false;
  if (isHostInList(host, data.ignoreList || [])) return false;
  const inList = isHostInList(host, data.siteList || []);
  const listMode = data.listMode || "include";
  return listMode === "include" ? inList : !inList;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const updates = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (current[key] === undefined) updates[key] = value;
  }
  // Migrate any previous siteSettings into siteList if siteList is empty
  if ((!current.siteList || current.siteList.length === 0) && current.siteSettings) {
    const migrated = Object.entries(current.siteSettings)
      .filter(([, conf]) => conf && conf.enabled !== false)
      .map(([site]) => site);
    if (migrated.length) {
      updates.siteList = migrated;
    }
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return;

  if (message.type === "XDG_APPLY_ACTIVE_TAB") {
    applyToActiveTab(message.settings).then(sendResponse).catch(error => {
      sendResponse({ ok: false, error: String(error?.message || error) });
    });
    return true;
  }
});

async function applyToActiveTab(overrides = {}) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return { ok: false, error: "This page cannot be modified by an extension." };
  }
  const stored = await chrome.storage.local.get(DEFAULTS);
  const host = new URL(tab.url).hostname;
  const site = stored.siteSettings?.[host] || {};
  const isIgnored = isHostInList(host, stored.ignoreList || []);
  const calculatedEnabled = isIgnored ? false : isSiteDark(host, stored);
  const settings = {
    enabled: overrides.enabled !== undefined ? overrides.enabled : calculatedEnabled,
    mode: overrides.mode || site.mode || stored.mode || "dynamic",
    isIgnored
  };

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "XDG_APPLY", settings });
    if (response?.ok) {
      return { ok: true, enabled: settings.enabled, mode: settings.mode };
    }
  } catch {
    // Content script not loaded yet (e.g. pre-existing tab before reload)
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["engine.js", "content.js"]
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: s => globalThis.xDarkGuard?.apply(s),
    args: [settings]
  });
  return { ok: true, enabled: settings.enabled, mode: settings.mode };
}
