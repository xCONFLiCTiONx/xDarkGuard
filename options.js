const optListMode = document.querySelector("#optListMode");
const optDefaultMode = document.querySelector("#optDefaultMode");
const optAutoDarkenBright = document.querySelector("#optAutoDarkenBright");
const listModeDesc = document.querySelector("#listModeDesc");
const listHeaderDesc = document.querySelector("#listHeaderDesc");
const addSiteForm = document.querySelector("#addSiteForm");
const newSiteInput = document.querySelector("#newSiteInput");
const siteListEl = document.querySelector("#siteList");

const addIgnoreForm = document.querySelector("#addIgnoreForm");
const newIgnoreInput = document.querySelector("#newIgnoreInput");
const ignoreListEl = document.querySelector("#ignoreListEl");

const exportBtn = document.querySelector("#exportBtn");
const importBtn = document.querySelector("#importBtn");
const importFileInput = document.querySelector("#importFileInput");
const backupStatus = document.querySelector("#backupStatus");

const DEFAULTS = {
  enabled: true,
  mode: "dynamic",
  listMode: "include",
  autoDarkenBright: true,
  siteList: [],
  ignoreList: [],
  siteSettings: {}
};

function normalizeDomain(input) {
  let val = input.trim().toLowerCase();
  if (!val) return "";
  // Strip protocol
  val = val.replace(/^[a-zA-Z]+:\/\//, "");
  // Strip path and query/hash
  val = val.split("/")[0].split("?")[0].split("#")[0];
  // Strip port
  val = val.split(":")[0];
  return val;
}

function updateDescriptions(mode) {
  if (mode === "include") {
    listModeDesc.textContent =
      "Include mode: websites are light by default. When you add a site to the list, it will be dark themed.";
    listHeaderDesc.textContent = "Sites that will be dark themed (included):";
  } else {
    listModeDesc.textContent =
      "Exclude mode: all websites are dark by default. Any site in this list will stay light (excluded).";
    listHeaderDesc.textContent = "Sites that will stay light (excluded):";
  }
}

function renderList(list) {
  siteListEl.innerHTML = "";
  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.className = "site-empty";
    li.textContent = "No sites in list yet.";
    siteListEl.appendChild(li);
    return;
  }

  list.forEach(site => {
    const li = document.createElement("li");
    li.className = "site-item";

    const span = document.createElement("span");
    span.textContent = site;

    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.textContent = "Remove";
    delBtn.addEventListener("click", () => removeSite(site));

    li.appendChild(span);
    li.appendChild(delBtn);
    siteListEl.appendChild(li);
  });
}

function renderIgnoreList(list) {
  if (!ignoreListEl) return;
  ignoreListEl.innerHTML = "";
  if (!list || list.length === 0) {
    const li = document.createElement("li");
    li.className = "site-empty";
    li.textContent = "No sites ignored yet.";
    ignoreListEl.appendChild(li);
    return;
  }

  list.forEach(site => {
    const li = document.createElement("li");
    li.className = "site-item";

    const span = document.createElement("span");
    span.textContent = site;

    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.textContent = "Remove";
    delBtn.addEventListener("click", () => removeIgnoreSite(site));

    li.appendChild(span);
    li.appendChild(delBtn);
    ignoreListEl.appendChild(li);
  });
}

async function removeSite(siteToRemove) {
  const data = await chrome.storage.local.get(DEFAULTS);
  const currentList = Array.isArray(data.siteList) ? data.siteList : [];
  const updatedList = currentList.filter(
    item => item.toLowerCase().trim() !== siteToRemove.toLowerCase().trim()
  );
  await chrome.storage.local.set({ siteList: updatedList });
  renderList(updatedList);
}

async function removeIgnoreSite(siteToRemove) {
  const data = await chrome.storage.local.get(DEFAULTS);
  const currentList = Array.isArray(data.ignoreList) ? data.ignoreList : [];
  const updatedList = currentList.filter(
    item => item.toLowerCase().trim() !== siteToRemove.toLowerCase().trim()
  );
  await chrome.storage.local.set({ ignoreList: updatedList });
  renderIgnoreList(updatedList);
}

function showBackupStatus(msg, isError = false) {
  if (!backupStatus) return;
  backupStatus.textContent = msg;
  backupStatus.style.color = isError ? "#ff8c8c" : "#7ce3a2";
  setTimeout(() => {
    backupStatus.textContent = "";
  }, 4000);
}

async function handleExport() {
  try {
    const data = await chrome.storage.local.get(null);
    const exportData = {
      appName: "xDarkGuard",
      version: "0.1.0",
      exportedAt: new Date().toISOString(),
      settings: {
        mode: data.mode || "dynamic",
        listMode: data.listMode || "include",
        autoDarkenBright: data.autoDarkenBright ?? true,
        siteList: Array.isArray(data.siteList) ? data.siteList : [],
        ignoreList: Array.isArray(data.ignoreList) ? data.ignoreList : [],
        siteSettings: data.siteSettings || {}
      }
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `xdarkguard-settings.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showBackupStatus(`Exported ${filename}`);
  } catch (err) {
    showBackupStatus("Export failed: " + err.message, true);
  }
}

function handleImportClick() {
  if (importFileInput) {
    importFileInput.value = "";
    importFileInput.click();
  }
}

async function handleFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const settings = parsed.settings || parsed;
    const updates = {};

    if (settings.mode) updates.mode = settings.mode;
    if (settings.listMode) updates.listMode = settings.listMode;
    if (typeof settings.autoDarkenBright === "boolean") {
      updates.autoDarkenBright = settings.autoDarkenBright;
    }
    if (Array.isArray(settings.siteList)) {
      updates.siteList = settings.siteList;
    }
    if (Array.isArray(settings.ignoreList)) {
      updates.ignoreList = settings.ignoreList;
    }
    if (settings.siteSettings && typeof settings.siteSettings === "object") {
      updates.siteSettings = settings.siteSettings;
    }

    if (Object.keys(updates).length) {
      await chrome.storage.local.set(updates);

      const refreshed = await chrome.storage.local.get(DEFAULTS);
      optListMode.value = refreshed.listMode || "include";
      optDefaultMode.value = refreshed.mode || "dynamic";
      optAutoDarkenBright.checked = refreshed.autoDarkenBright ?? true;
      updateDescriptions(refreshed.listMode || "include");
      renderList(refreshed.siteList || []);
      renderIgnoreList(refreshed.ignoreList || []);

      showBackupStatus(`Imported successfully (${(refreshed.siteList || []).length} sites in list, ${(refreshed.ignoreList || []).length} ignored)`);
    } else {
      showBackupStatus("No recognized settings found in file.", true);
    }
  } catch (err) {
    showBackupStatus("Import error: " + err.message, true);
  }
}

async function init() {
  const data = await chrome.storage.local.get(DEFAULTS);
  const listMode = data.listMode || "include";
  const mode = data.mode || "dynamic";
  const list = Array.isArray(data.siteList) ? data.siteList : [];
  const ignoreList = Array.isArray(data.ignoreList) ? data.ignoreList : [];
  const autoDarken = data.autoDarkenBright ?? true;

  optListMode.value = listMode;
  optDefaultMode.value = mode;
  optAutoDarkenBright.checked = autoDarken;
  updateDescriptions(listMode);
  renderList(list);
  renderIgnoreList(ignoreList);

  optListMode.addEventListener("change", async () => {
    const newMode = optListMode.value;
    await chrome.storage.local.set({ listMode: newMode });
    updateDescriptions(newMode);
  });

  optDefaultMode.addEventListener("change", async () => {
    await chrome.storage.local.set({ mode: optDefaultMode.value });
  });

  optAutoDarkenBright.addEventListener("change", async () => {
    await chrome.storage.local.set({ autoDarkenBright: optAutoDarkenBright.checked });
  });

  if (exportBtn) exportBtn.addEventListener("click", handleExport);
  if (importBtn) importBtn.addEventListener("click", handleImportClick);
  if (importFileInput) importFileInput.addEventListener("change", handleFileSelected);

  addSiteForm.addEventListener("submit", async e => {
    e.preventDefault();
    const domain = normalizeDomain(newSiteInput.value);
    if (!domain) return;

    const currentData = await chrome.storage.local.get(DEFAULTS);
    const list = Array.isArray(currentData.siteList) ? [...currentData.siteList] : [];
    if (!list.map(s => s.toLowerCase()).includes(domain.toLowerCase())) {
      list.push(domain);
      await chrome.storage.local.set({ siteList: list });
      renderList(list);
    }
    newSiteInput.value = "";
  });

  if (addIgnoreForm) {
    addIgnoreForm.addEventListener("submit", async e => {
      e.preventDefault();
      const domain = normalizeDomain(newIgnoreInput.value);
      if (!domain) return;

      const currentData = await chrome.storage.local.get(DEFAULTS);
      const list = Array.isArray(currentData.ignoreList) ? [...currentData.ignoreList] : [];
      if (!list.map(s => s.toLowerCase()).includes(domain.toLowerCase())) {
        list.push(domain);
        await chrome.storage.local.set({ ignoreList: list });
        renderIgnoreList(list);
      }
      newIgnoreInput.value = "";
    });
  }
}

init();
