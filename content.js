(() => {
  if (globalThis.__xdgContentScriptInjected) return;
  globalThis.__xdgContentScriptInjected = true;

  const DEFAULTS = {
    enabled: true,
    mode: "dynamic",
    listMode: "include",
    autoDarkenBright: true,
    siteList: [],
    ignoreList: [],
    siteSettings: {}
  };

  function parseColor(str) {
    if (!str || str === "transparent") return null;
    if (str.startsWith("#")) {
      let hex = str.slice(1);
      if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return { r, g, b, a: 1 };
      }
    }
    const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
    return { r, g, b, a };
  }

  function getLuminance(r, g, b) {
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  function getElementBgColorOnly(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    try {
      const style = getComputedStyle(el);
      return parseColor(style.backgroundColor);
    } catch (_) {
      return null;
    }
  }

  function getEffectiveBgColor(el) {
    let curr = el;
    while (curr && curr !== document && curr.nodeType === Node.ELEMENT_NODE) {
      try {
        const style = getComputedStyle(curr);
        const bg = parseColor(style.backgroundColor);
        if (bg && bg.a > 0.4) {
          return bg;
        }
      } catch (_) {}
      curr = curr.parentElement;
    }

    try {
      const root = document.documentElement;
      const body = document.body;
      const rootBg = getElementBgColorOnly(root);
      if (rootBg && rootBg.a > 0.4) return rootBg;
      if (body) {
        const bodyBg = getElementBgColorOnly(body);
        if (bodyBg && bodyBg.a > 0.4) return bodyBg;
      }
      const rootStyle = getComputedStyle(root);
      const textColor = parseColor(rootStyle.color);
      if (textColor && getLuminance(textColor.r, textColor.g, textColor.b) > 170) {
        return { r: 24, g: 24, b: 24, a: 1 };
      }
    } catch (_) {}

    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function isPageTooBright() {
    if (!document.documentElement) return false;

    // Fast check: If root or body background is dark, the site is natively dark!
    const rootBg = getElementBgColorOnly(document.documentElement);
    const bodyBg = document.body ? getElementBgColorOnly(document.body) : null;
    const isRootDark = rootBg && rootBg.a > 0.4 && getLuminance(rootBg.r, rootBg.g, rootBg.b) < 130;
    const isBodyDark = bodyBg && bodyBg.a > 0.4 && getLuminance(bodyBg.r, bodyBg.g, bodyBg.b) < 130;

    if (isRootDark || isBodyDark) {
      return false;
    }

    // Fast check: If root or body text color is light, site is intended to be dark!
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const rootTextColor = parseColor(rootStyle.color);
      if (rootTextColor && getLuminance(rootTextColor.r, rootTextColor.g, rootTextColor.b) > 170) {
        return false;
      }
      if (document.body) {
        const bodyStyle = getComputedStyle(document.body);
        const bodyTextColor = parseColor(bodyStyle.color);
        if (bodyTextColor && getLuminance(bodyTextColor.r, bodyTextColor.g, bodyTextColor.b) > 170) {
          return false;
        }
      }
    } catch (_) {}

    // Check comprehensive native dark detection helper
    if (globalThis.xDarkGuard?.isElementAlreadyDark && globalThis.xDarkGuard.isElementAlreadyDark()) {
      return false;
    }

    const w = window.innerWidth || document.documentElement.clientWidth || 800;
    const h = window.innerHeight || document.documentElement.clientHeight || 600;

    const xFractions = [0.10, 0.30, 0.50, 0.70, 0.90];
    const yFractions = [0.20, 0.40, 0.60, 0.80];

    let brightPoints = 0;
    let totalPoints = 0;

    for (const yf of yFractions) {
      const y = Math.floor(h * yf);
      for (const xf of xFractions) {
        const x = Math.floor(w * xf);
        totalPoints++;
        try {
          const el = document.elementFromPoint(x, y);
          if (el) {
            const bg = getEffectiveBgColor(el);
            const lum = getLuminance(bg.r, bg.g, bg.b);
            if (lum >= 150) {
              brightPoints++;
            }
          } else {
            if (!isRootDark && !isBodyDark) {
              brightPoints++;
            }
          }
        } catch (_) {
          if (!isRootDark && !isBodyDark) {
            brightPoints++;
          }
        }
      }
    }

    const containers = [
      document.querySelector("main, [role='main'], #content, #main, .main, #app, #root, .content, .container"),
      document.body
    ].filter(Boolean);

    for (const container of containers) {
      totalPoints += 2;
      const bg = getEffectiveBgColor(container);
      if (bg && getLuminance(bg.r, bg.g, bg.b) >= 150) {
        brightPoints += 2;
      }
    }

    if (totalPoints === 0) return true;

    return (brightPoints / totalPoints) >= 0.35;
  }

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
    if (listMode === "include") {
      return inList;
    } else {
      return !inList;
    }
  }

  async function resolveSettings() {
    try {
      const data = await chrome.storage.local.get(DEFAULTS);
      const host = location.hostname;
      const site = data.siteSettings?.[host] || {};
      const defaultMode = data.mode || "dynamic";
      const mode = globalThis.xDarkGuard?.determineBestProfile
        ? globalThis.xDarkGuard.determineBestProfile(host, defaultMode, data.siteSettings)
        : (site.mode || defaultMode);

      // 1. TOP PRIORITY: Check if host is in ignoreList
      if (isHostInList(host, data.ignoreList || [])) {
        return { enabled: false, mode, isIgnored: true };
      }

      // 2. If user explicitly disabled dark mode for this site
      if (site.userDisabled) {
        return { enabled: false, mode };
      }

      // 3. Check if site is explicitly configured dark via include/exclude list
      const listMode = data.listMode || "include";
      const inList = isHostInList(host, data.siteList || []);
      const explicitlyInList = (listMode === "include" && inList) || (listMode === "exclude" && !inList);

      if (explicitlyInList) {
        return { enabled: true, mode, userExplicit: true };
      }

      // 4. Check if site is already native dark via DOM/cookies/meta/fastCache
      const nativeDark = globalThis.xDarkGuard?.isElementAlreadyDark
        ? globalThis.xDarkGuard.isElementAlreadyDark()
        : false;

      if (nativeDark) {
        return { enabled: false, mode, isNativeDark: true };
      }

      let fastCached = null;
      try {
        const rawSession = sessionStorage.getItem("xdg_fast_settings_v1");
        if (rawSession) fastCached = JSON.parse(rawSession);
      } catch (_) {}
      if (!fastCached) {
        try {
          const rawLocal = localStorage.getItem("xdg_host_config_v1");
          if (rawLocal) fastCached = JSON.parse(rawLocal);
        } catch (_) {}
      }

      if (fastCached && fastCached.isNativeDark) {
        return { enabled: false, mode, isNativeDark: true };
      }

      // 5. Check auto-darken setting for bright pages
      const autoBright = data.autoDarkenBright ?? true;
      if (autoBright) {
        // While page is still loading elements/styles, do not overwrite cached native dark or force dark
        if (document.readyState === "loading" || !document.body) {
          if (fastCached && (fastCached.enabled === false || fastCached.isNativeDark)) {
            return { enabled: false, mode, isNativeDark: !!fastCached.isNativeDark };
          }
          return { enabled: true, mode, isAutoBright: true };
        }

        if (isPageTooBright()) {
          return { enabled: true, mode, isAutoBright: true };
        } else {
          // Page is ALREADY dark natively! Mark isNativeDark: true so fastCache remembers it forever
          return { enabled: false, mode, isNativeDark: true };
        }
      }

      return { enabled: false, mode };
    } catch {
      return { enabled: false, mode: "dynamic" };
    }
  }

  async function applyCurrentSettings() {
    const settings = await resolveSettings();
    if (globalThis.xDarkGuard?.apply) {
      globalThis.xDarkGuard.apply(settings);
      if (document.documentElement) {
        if (settings.isIgnored) {
          document.documentElement.dataset.xdarkguardIgnored = "true";
          delete document.documentElement.dataset.xdarkguardAuto;
          delete document.documentElement.dataset.xdarkguardNative;
        } else if (settings.isNativeDark) {
          document.documentElement.dataset.xdarkguardNative = "true";
          delete document.documentElement.dataset.xdarkguardAuto;
          delete document.documentElement.dataset.xdarkguardIgnored;
        } else if (settings.isAutoBright && settings.enabled) {
          document.documentElement.dataset.xdarkguardAuto = "true";
          delete document.documentElement.dataset.xdarkguardIgnored;
          delete document.documentElement.dataset.xdarkguardNative;
        } else {
          delete document.documentElement.dataset.xdarkguardAuto;
          delete document.documentElement.dataset.xdarkguardIgnored;
          delete document.documentElement.dataset.xdarkguardNative;
        }
      }
    }
  }

  // Initial apply at document_start
  applyCurrentSettings();

  // Re-evaluate as page elements render
  if (!document.body) {
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        applyCurrentSettings();
      }
    });
    observer.observe(document.documentElement || document, { childList: true });
  }

  // Re-run once DOM is fully structured and styles are parsed
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyCurrentSettings();
      setTimeout(applyCurrentSettings, 100);
      setTimeout(applyCurrentSettings, 400);
      setTimeout(applyCurrentSettings, 1000);
    }, { once: true });
  } else {
    setTimeout(applyCurrentSettings, 50);
    setTimeout(applyCurrentSettings, 300);
    setTimeout(applyCurrentSettings, 800);
  }

  // React to storage changes (e.g. from popup or options)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (
        changes.siteList ||
        changes.ignoreList ||
        changes.listMode ||
        changes.autoDarkenBright ||
        changes.enabled ||
        changes.mode ||
        changes.siteSettings
      ) {
        applyCurrentSettings();
      }
    }
  });

  // Direct runtime message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "XDG_APPLY") {
      if (globalThis.xDarkGuard?.apply) {
        globalThis.xDarkGuard.apply(message.settings);
        sendResponse?.({ ok: true });
      }
    }
  });
})();
