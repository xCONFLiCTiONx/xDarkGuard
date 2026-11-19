const enabledEl = document.querySelector("#enabled");
const listModeEl = document.querySelector("#listMode");
const modeEl = document.querySelector("#mode");
const statusEl = document.querySelector("#status");
const siteHelpEl = document.querySelector("#siteHelp");
const currentHostEl = document.querySelector("#currentHost");
const addSiteBtn = document.querySelector("#addSiteBtn");
const ignoreSiteBtn = document.querySelector("#ignoreSiteBtn");

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

function updateChipSelection(currentMode) {
  const chips = document.querySelectorAll(".profile-chip");
  chips.forEach(chip => {
    if (chip.dataset.mode === currentMode) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

function updateButtonState(inList, isIgnored, listMode) {
  if (isIgnored) {
    ignoreSiteBtn.textContent = "✓ Ignored";
    ignoreSiteBtn.className = "btn btn-action btn-ignored";
    ignoreSiteBtn.title = "Site is completely ignored in both modes (Click to un-ignore)";
  } else {
    ignoreSiteBtn.textContent = "🚫 Ignore";
    ignoreSiteBtn.className = "btn btn-action btn-ignore-action";
    ignoreSiteBtn.title = "Completely ignore site in both Include and Exclude modes";
  }

  addSiteBtn.disabled = false;
  if (listMode === "include") {
    if (inList) {
      addSiteBtn.textContent = "✓ Included";
      addSiteBtn.className = "btn btn-action btn-added";
    } else {
      addSiteBtn.textContent = "+ Include";
      addSiteBtn.className = "btn btn-action";
    }
  } else {
    if (inList) {
      addSiteBtn.textContent = "✕ Excluded";
      addSiteBtn.className = "btn btn-action btn-added";
    } else {
      addSiteBtn.textContent = "+ Exclude";
      addSiteBtn.className = "btn btn-action";
    }
  }
}

function updateHelpText(host, isDark, listMode, isAutoDark = false, isIgnored = false, isNativeDark = false) {
  if (isIgnored) {
    siteHelpEl.textContent = `Ignored (${host} disabled in all modes)`;
    return;
  }
  if (isNativeDark && !isDark) {
    siteHelpEl.textContent = `Native dark theme (${host} already dark)`;
    return;
  }
  if (isAutoDark && isDark) {
    siteHelpEl.textContent = `Auto-darkened (bright page detected)`;
    return;
  }
  if (listMode === "include") {
    siteHelpEl.textContent = isDark
      ? `Listed (${host} is dark)`
      : `Not listed (${host} is light)`;
  } else {
    siteHelpEl.textContent = isDark
      ? `Not excluded (${host} is dark)`
      : `Excluded (${host} is light)`;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function init() {
  const tab = await getActiveTab();
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    enabledEl.disabled = listModeEl.disabled = modeEl.disabled = addSiteBtn.disabled = ignoreSiteBtn.disabled = true;
    currentHostEl.textContent = "Internal page";
    statusEl.textContent = "This browser page cannot be modified.";
    siteHelpEl.textContent = "Browser page";
    addSiteBtn.textContent = "N/A";
    ignoreSiteBtn.textContent = "N/A";
    return;
  }

  const host = new URL(tab.url).hostname;
  currentHostEl.textContent = host;

  const data = await chrome.storage.local.get(DEFAULTS);
  const listMode = data.listMode || "include";
  const inList = isHostInList(host, data.siteList);
  const isIgnored = isHostInList(host, data.ignoreList);

  let isDark = false;
  if (!isIgnored) {
    isDark = listMode === "include" ? inList : !inList;
  }

  let isAutoDark = false;
  let isNativeDark = false;
  if (!isDark && !isIgnored && tab.id) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          auto: document.documentElement?.dataset?.xdarkguardAuto === "true",
          native: document.documentElement?.dataset?.xdarkguardNative === "true"
        })
      });
      if (res?.result) {
        if (res.result.auto) {
          isAutoDark = true;
          isDark = true;
        }
        if (res.result.native) {
          isNativeDark = true;
        }
      }
    } catch (_) {}
  }

  const currentMode = data.siteSettings?.[host]?.mode || data.mode || "dynamic";

  listModeEl.value = listMode;
  enabledEl.checked = isDark;
  enabledEl.disabled = isIgnored;
  modeEl.value = currentMode;
  updateChipSelection(currentMode);

  updateHelpText(host, isDark, listMode, isAutoDark, isIgnored, isNativeDark);
  updateButtonState(inList, isIgnored, listMode);

  addSiteBtn.addEventListener("click", onAddSiteBtnClick);
  ignoreSiteBtn.addEventListener("click", onIgnoreSiteBtnClick);
  enabledEl.addEventListener("change", onToggleDark);
  listModeEl.addEventListener("change", onListModeChange);
  modeEl.addEventListener("change", onModeChange);

  document.querySelectorAll(".profile-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const selectedMode = chip.dataset.mode;
      modeEl.value = selectedMode;
      if (!enabledEl.checked && !isIgnored) {
        enabledEl.checked = true;
      }
      onModeChange();
    });
  });
}

async function onIgnoreSiteBtnClick() {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  const data = await chrome.storage.local.get(DEFAULTS);
  let ignoreList = Array.isArray(data.ignoreList) ? [...data.ignoreList] : [];
  let siteList = Array.isArray(data.siteList) ? [...data.siteList] : [];
  const listMode = data.listMode || "include";
  const currentlyIgnored = isHostInList(host, ignoreList);

  if (currentlyIgnored) {
    ignoreList = ignoreList.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
    statusEl.textContent = `Removed ${host} from ignore list`;
  } else {
    ignoreList.push(host);
    siteList = siteList.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
    statusEl.textContent = `Ignored ${host} (disabled in all modes)`;
  }

  await chrome.storage.local.set({ ignoreList, siteList });

  const isIgnoredNow = !currentlyIgnored;
  const inListNow = isHostInList(host, siteList);
  const isDark = isIgnoredNow ? false : (listMode === "include" ? inListNow : !inListNow);

  enabledEl.checked = isDark;
  enabledEl.disabled = isIgnoredNow;
  updateHelpText(host, isDark, listMode, false, isIgnoredNow, false);
  updateButtonState(inListNow, isIgnoredNow, listMode);

  await chrome.runtime.sendMessage({
    type: "XDG_APPLY_ACTIVE_TAB",
    settings: { enabled: isDark, mode: modeEl.value }
  });
}

async function onAddSiteBtnClick() {
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  const data = await chrome.storage.local.get(DEFAULTS);
  let list = Array.isArray(data.siteList) ? [...data.siteList] : [];
  let ignoreList = Array.isArray(data.ignoreList) ? [...data.ignoreList] : [];
  const listMode = data.listMode || "include";

  if (isHostInList(host, ignoreList)) {
    ignoreList = ignoreList.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
  }

  const inList = isHostInList(host, list);

  if (listMode === "include") {
    if (inList) {
      list = list.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
      statusEl.textContent = `Removed ${host} from include list`;
    } else {
      list.push(host);
      statusEl.textContent = `Added ${host} to include list`;
    }
  } else {
    if (inList) {
      list = list.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
      statusEl.textContent = `Removed ${host} from exclude list`;
    } else {
      list.push(host);
      statusEl.textContent = `Added ${host} to exclude list`;
    }
  }

  const siteSettings = data.siteSettings || {};
  siteSettings[host] = { ...(siteSettings[host] || {}), userDisabled: false, mode: modeEl.value };

  await chrome.storage.local.set({ siteList: list, ignoreList, siteSettings });

  const updatedInList = isHostInList(host, list);
  const isDark = listMode === "include" ? updatedInList : !updatedInList;
  enabledEl.checked = isDark;
  enabledEl.disabled = false;
  updateHelpText(host, isDark, listMode, false, false, false);
  updateButtonState(updatedInList, false, listMode);

  await chrome.runtime.sendMessage({
    type: "XDG_APPLY_ACTIVE_TAB",
    settings: { enabled: isDark, mode: modeEl.value, userExplicit: true }
  });
}

async function onToggleDark() {
  statusEl.textContent = "Applying…";
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  const data = await chrome.storage.local.get(DEFAULTS);
  let list = Array.isArray(data.siteList) ? [...data.siteList] : [];
  let ignoreList = Array.isArray(data.ignoreList) ? [...data.ignoreList] : [];
  const listMode = data.listMode || "include";
  const wantDark = enabledEl.checked;

  if (isHostInList(host, ignoreList)) {
    ignoreList = ignoreList.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
  }

  if (listMode === "include") {
    if (wantDark) {
      if (!isHostInList(host, list)) list.push(host);
    } else {
      list = list.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
    }
  } else {
    if (wantDark) {
      list = list.filter(item => item.toLowerCase().trim() !== host.toLowerCase());
    } else {
      if (!isHostInList(host, list)) list.push(host);
    }
  }

  const siteSettings = data.siteSettings || {};
  siteSettings[host] = {
    ...(siteSettings[host] || {}),
    userDisabled: !wantDark,
    mode: modeEl.value
  };

  await chrome.storage.local.set({ siteList: list, ignoreList, siteSettings });

  const inList = isHostInList(host, list);
  enabledEl.disabled = false;
  updateHelpText(host, wantDark, listMode, false, false, false);
  updateButtonState(inList, false, listMode);

  const result = await chrome.runtime.sendMessage({
    type: "XDG_APPLY_ACTIVE_TAB",
    settings: { enabled: wantDark, mode: modeEl.value, userExplicit: wantDark }
  });
  statusEl.textContent = result?.ok ? "Updated for this site" : (result?.error || "Could not apply");
}

async function onListModeChange() {
  statusEl.textContent = "Updating mode…";
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  const newListMode = listModeEl.value;
  const data = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set({ listMode: newListMode });

  const inList = isHostInList(host, data.siteList);
  const isIgnored = isHostInList(host, data.ignoreList);
  const isDark = isIgnored ? false : (newListMode === "include" ? inList : !inList);
  enabledEl.checked = isDark;
  enabledEl.disabled = isIgnored;
  updateHelpText(host, isDark, newListMode, false, isIgnored, false);
  updateButtonState(inList, isIgnored, newListMode);

  const result = await chrome.runtime.sendMessage({
    type: "XDG_APPLY_ACTIVE_TAB",
    settings: { enabled: isDark, mode: modeEl.value }
  });
  statusEl.textContent = result?.ok ? `Switched to ${newListMode} mode` : "Could not apply";
}

async function onModeChange() {
  statusEl.textContent = "Applying profile…";
  const tab = await getActiveTab();
  if (!tab?.url) return;
  const host = new URL(tab.url).hostname;

  const data = await chrome.storage.local.get(DEFAULTS);
  const siteSettings = data.siteSettings || {};
  const selectedMode = modeEl.value;

  siteSettings[host] = { ...(siteSettings[host] || {}), mode: selectedMode };
  await chrome.storage.local.set({ siteSettings });

  const isIgnored = isHostInList(host, data.ignoreList);
  let isDark = enabledEl.checked;
  if (isIgnored) isDark = false;

  updateChipSelection(selectedMode);

  const result = await chrome.runtime.sendMessage({
    type: "XDG_APPLY_ACTIVE_TAB",
    settings: { enabled: isDark, mode: selectedMode, userExplicit: isDark }
  });
  statusEl.textContent = result?.ok ? `Applied profile: ${selectedMode}` : "Could not apply profile";
}

init().catch(() => {
  statusEl.textContent = "Could not load settings.";
});
