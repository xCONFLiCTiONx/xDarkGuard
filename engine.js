(() => {
  if (globalThis.xDarkGuard) return;

  const STYLE_ID = "xdg-darkguard-style";
  const FLASH_BLOCKER_ID = "xdg-instant-flash-blocker";
  const SESSION_KEY = "xdg_fast_settings_v1";
  const LOCAL_KEY = "xdg_host_config_v1";

  const cssByMode = {
    "filter+": `
      :root, html {
        color-scheme: dark !important;
        background-color: #ffffff !important;
        min-height: 100vh !important;
      }
      html {
        background: #ffffff !important;
        filter: invert(1) hue-rotate(180deg) !important;
        color-scheme: dark !important;
        min-height: 100vh !important;
      }
      img, video, canvas, iframe, svg, picture, [role="img"],
      [style*="background-image"], [data-darkguard-preserve] {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      video, canvas { background: #000; }
    `,
    filter: `
      :root, html {
        color-scheme: dark !important;
        background-color: #ffffff !important;
        min-height: 100vh !important;
      }
      html {
        background: #ffffff !important;
        filter: invert(1) hue-rotate(180deg) !important;
        color-scheme: dark !important;
        min-height: 100vh !important;
      }
      img, video, canvas, iframe, svg, picture, [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `,
    dynamic: `
      :root, html {
        color-scheme: dark !important;
        background-color: #14171c !important;
        min-height: 100vh !important;
      }
      html, body {
        background-color: #14171c !important;
        color: #e3e6ec !important;
        color-scheme: dark !important;
        min-height: 100vh !important;
      }
      div, main, section, article, aside, nav, header, footer,
      table, thead, tbody, tfoot, tr, td, th,
      ul, ol, li, form, fieldset, dialog, details,
      pre, code, blockquote {
        background-color: #181b22 !important;
        color: #e3e6ec !important;
        border-color: #353b47 !important;
      }
      p, span, h1, h2, h3, h4, h5, h6, dt, dd, label, b, strong, em, i, small {
        color: inherit !important;
      }
      a, a * {
        color: #8ab4f8 !important;
      }
      a:visited, a:visited * {
        color: #c58af8 !important;
      }
      input, textarea, select {
        background-color: #222630 !important;
        color: #f0f2f7 !important;
        border: 1px solid #414856 !important;
        color-scheme: dark;
      }
      button {
        background-color: #2b313e !important;
        color: #f0f2f7 !important;
        border: 1px solid #414856 !important;
      }
      [style*="background-image"]:not([style*="none"]) {
        background-color: transparent !important;
      }
      img, video, canvas, svg, iframe, picture {
        opacity: 0.92;
      }
    `,
    static: `
      :root, html {
        color-scheme: dark !important;
        background-color: #121212 !important;
        min-height: 100vh !important;
      }
      html, body {
        background-color: #121212 !important;
        color: #e0e0e0 !important;
        color-scheme: dark !important;
        min-height: 100vh !important;
      }
      div, main, section, article, aside, nav, header, footer,
      table, thead, tbody, tfoot, tr, td, th,
      ul, ol, li, form, fieldset, dialog,
      pre, code, blockquote {
        background-color: #1a1a1a !important;
        color: #e0e0e0 !important;
        border-color: #333333 !important;
      }
      a, a * { color: #9dbdff !important; }
      input, textarea, select, button {
        background-color: #262626 !important;
        color: #eee !important;
        border: 1px solid #444 !important;
      }
    `
  };

  const baselineDarkCss = `
    :root, html {
      color-scheme: dark !important;
      background-color: #121212 !important;
    }
  `;

  function parseColorString(str) {
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
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1.0
    };
  }

  function determineBestProfile(host, defaultMode, siteSettings = {}) {
    if (siteSettings?.[host]?.mode && ["filter+", "filter", "dynamic", "static"].includes(siteSettings[host].mode)) {
      return siteSettings[host].mode;
    }

    const lowerHost = (host || "").toLowerCase();

    // Specific video / heavy media sites that require filter+ for proper media color preservation
    const mediaDomains = [
      "youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "netflix.com",
      "hulu.com", "disneyplus.com", "spotify.com", "soundcloud.com",
      "figma.com", "canva.com", "maps.google.com"
    ];
    if (mediaDomains.some(domain => lowerHost === domain || lowerHost.endsWith("." + domain))) {
      return "filter+";
    }

    return defaultMode || "dynamic";
  }

  function isElementAlreadyDark() {
    try {
      const root = document.documentElement;
      const body = document.body;

      // 1. Check classes on root or body
      const rootCls = (root ? root.className : "").toString().toLowerCase();
      const bodyCls = (body ? body.className : "").toString().toLowerCase();
      const darkKeywords = [
        "dark", "night", "black", "vscode-dark", "tw-dark",
        "ui-dark", "is-dark", "color-scheme-dark", "mode-dark",
        "app-dark", "theme-night", "theme-dark", "dark-theme", "dark-mode"
      ];
      for (const kw of darkKeywords) {
        if (rootCls.includes(kw) || bodyCls.includes(kw)) {
          return true;
        }
      }

      // 2. Check attributes on root or body
      const attrs = [
        "data-theme", "theme", "data-color-mode", "color-scheme",
        "data-bs-theme", "data-ui-theme", "data-mode", "data-scheme", "dark"
      ];
      for (const attr of attrs) {
        const rootVal = (root ? root.getAttribute(attr) || "" : "").toLowerCase();
        const bodyVal = (body ? body.getAttribute(attr) || "" : "").toLowerCase();
        if (rootVal.includes("dark") || rootVal.includes("night") || rootVal.includes("black") || rootVal === "true") return true;
        if (bodyVal.includes("dark") || bodyVal.includes("night") || bodyVal.includes("black") || bodyVal === "true") return true;
      }

      // 3. Check inline style / color-scheme
      const rootStyle = (root ? root.getAttribute("style") || "" : "").toLowerCase();
      const bodyStyle = (body ? body.getAttribute("style") || "" : "").toLowerCase();
      if (rootStyle.includes("color-scheme: dark") || rootStyle.includes("color-scheme:dark") ||
          bodyStyle.includes("color-scheme: dark") || bodyStyle.includes("color-scheme:dark")) {
        return true;
      }
      if (root && root.style && root.style.colorScheme === "dark") return true;

      // 4. Check meta tags
      const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
      if (metaColorScheme && metaColorScheme.content?.toLowerCase().includes("dark")) {
        return true;
      }

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor && metaThemeColor.content) {
        const parsed = parseColorString(metaThemeColor.content.trim());
        if (parsed && (parsed.r * 299 + parsed.g * 587 + parsed.b * 114) / 1000 < 130) {
          return true;
        }
      }

      // 5. Check cookies (YouTube f6=400, theme=dark, etc.)
      if (document.cookie) {
        const cookie = document.cookie.toLowerCase();
        if (
          cookie.includes("f6=400") || cookie.includes("f6=40") ||
          cookie.includes("theme=dark") || cookie.includes("theme=night") ||
          cookie.includes("dark_mode=1") || cookie.includes("dark_mode=true") ||
          cookie.includes("darkmode=1") || cookie.includes("darkmode=true") ||
          cookie.includes("color_mode=dark") || cookie.includes("twilight-theme=dark") ||
          cookie.includes("night_mode=1")
        ) {
          return true;
        }
      }

      // 6. Check LocalStorage if accessible
      try {
        const darkKeys = ["theme", "color-mode", "dark-mode", "theme-preference", "colorScheme", "ui-theme", "mode"];
        for (const k of darkKeys) {
          const val = (localStorage.getItem(k) || "").toLowerCase();
          if (val === "dark" || val === "night" || val === "black" || val.includes("dark")) {
            return true;
          }
        }
      } catch (_) {}

      // 7. Check computed style if available
      if (root) {
        try {
          const computed = getComputedStyle(root);
          if (computed.colorScheme === "dark") return true;
          const bg = parseColorString(computed.backgroundColor);
          if (bg && bg.a > 0.5 && (bg.r * 299 + bg.g * 587 + bg.b * 114) / 1000 < 130) {
            return true;
          }
        } catch (_) {}
      }

      if (body) {
        try {
          const computed = getComputedStyle(body);
          if (computed.colorScheme === "dark") return true;
          const bg = parseColorString(computed.backgroundColor);
          if (bg && bg.a > 0.5 && (bg.r * 299 + bg.g * 587 + bg.b * 114) / 1000 < 130) {
            return true;
          }
        } catch (_) {}
      }
    } catch (_) {}

    return false;
  }

  function injectPreHeadStyle(styleEl) {
    const target = document.documentElement || document.head || document;
    if (target && target.insertBefore) {
      if (!styleEl.isConnected) {
        target.insertBefore(styleEl, target.firstChild);
      }
    } else {
      const observer = new MutationObserver(() => {
        const root = document.documentElement || document.head;
        if (root && root.insertBefore) {
          if (!styleEl.isConnected) root.insertBefore(styleEl, root.firstChild);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }

  // Set dark color-scheme on root immediately to guarantee a dark viewport canvas
  if (document.documentElement) {
    try {
      document.documentElement.style.colorScheme = "dark";
    } catch (_) {}
  }

  const host = location.hostname;
  let fastCached = null;
  try {
    const rawSession = sessionStorage.getItem(SESSION_KEY);
    if (rawSession) fastCached = JSON.parse(rawSession);
  } catch (_) {}

  if (!fastCached) {
    try {
      const rawLocal = localStorage.getItem(LOCAL_KEY);
      if (rawLocal) fastCached = JSON.parse(rawLocal);
    } catch (_) {}
  }

  let initialEnabled = true;
  let initialMode = "dynamic";

  if (fastCached) {
    if (fastCached.isIgnored || fastCached.enabled === false || fastCached.isNativeDark) {
      initialEnabled = false;
    } else {
      initialEnabled = true;
      initialMode = fastCached.mode && cssByMode[fastCached.mode]
        ? fastCached.mode
        : determineBestProfile(host);
    }
  } else {
    if (isElementAlreadyDark()) {
      initialEnabled = false;
    } else {
      initialMode = determineBestProfile(host);
    }
  }

  // Instant pre-paint to prevent white canvas flash
  if (initialEnabled) {
    const flashStyle = document.createElement("style");
    flashStyle.id = FLASH_BLOCKER_ID;

    // For filter/filter+ mode on auto-detected sites, use non-inverting baseline dark canvas
    // to avoid turning native dark pages white before DOM inspection completes
    const isFilterMode = initialMode === "filter" || initialMode === "filter+";
    const isUserExplicit = fastCached?.userExplicit;
    const modeCss = (isFilterMode && !isUserExplicit)
      ? baselineDarkCss
      : (cssByMode[initialMode] || cssByMode["dynamic"]);

    flashStyle.textContent = `/* xDarkGuard instant dark pre-paint (${initialMode}) */\n${modeCss}`;
    injectPreHeadStyle(flashStyle);
    if (document.documentElement) {
      document.documentElement.dataset.xdarkguardMode = initialMode;
      try {
        document.documentElement.style.colorScheme = "dark";
      } catch (_) {}
    }
  }

  function apply(settings = {}) {
    let style = document.getElementById(STYLE_ID);

    if (!settings.enabled) {
      style?.remove();
      const flashBlocker = document.getElementById(FLASH_BLOCKER_ID);
      flashBlocker?.remove();
      if (document.documentElement) {
        delete document.documentElement.dataset.xdarkguardMode;
        delete document.documentElement.dataset.xdarkguardAuto;
        if (settings.isNativeDark) {
          document.documentElement.dataset.xdarkguardNative = "true";
        } else {
          delete document.documentElement.dataset.xdarkguardNative;
        }
        try {
          document.documentElement.style.colorScheme = "";
        } catch (_) {}
      }
      try {
        const disabledObj = JSON.stringify({
          enabled: false,
          mode: settings.mode,
          isIgnored: !!settings.isIgnored,
          isNativeDark: !!settings.isNativeDark
        });
        sessionStorage.setItem(SESSION_KEY, disabledObj);
        localStorage.setItem(LOCAL_KEY, disabledObj);
      } catch (_) {}
      return;
    }

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      injectPreHeadStyle(style);
    } else if (!style.isConnected) {
      injectPreHeadStyle(style);
    }

    const mode = cssByMode[settings.mode] ? settings.mode : "dynamic";
    style.textContent = `/* xDarkGuard mode: ${mode} */\n${cssByMode[mode]}`;

    if (document.documentElement) {
      document.documentElement.dataset.xdarkguardMode = mode;
      delete document.documentElement.dataset.xdarkguardNative;
      try {
        document.documentElement.style.colorScheme = "dark";
      } catch (_) {}
    }

    const flashBlocker = document.getElementById(FLASH_BLOCKER_ID);
    if (flashBlocker && flashBlocker !== style) {
      flashBlocker.remove();
    }

    try {
      const enabledObj = JSON.stringify({
        enabled: true,
        mode,
        isIgnored: false,
        isNativeDark: false,
        userExplicit: !!settings.userExplicit
      });
      sessionStorage.setItem(SESSION_KEY, enabledObj);
      localStorage.setItem(LOCAL_KEY, enabledObj);
    } catch (_) {}
  }

  globalThis.xDarkGuard = {
    apply,
    cssByMode,
    determineBestProfile,
    isElementAlreadyDark
  };
})();
