/**
 * GitZip Pro - i18n.js
 * Simple localization engine.
 * Detects browser language on first install, provides translations,
 * and supports live language switching.
 */
(function initGzpI18n(global) {
  const LOCALE_STORAGE_KEY = 'gzpLocale';
  const SUPPORTED_LOCALES = ['en', 'zh-CN'];
  const DEFAULT_LOCALE = 'en';
  // build.js replaces the marker with the locale JSON at package build time.
  // The empty object keeps the unbuilt source usable during development.
  const BUNDLED_LOCALES = /*__GZP_BUNDLED_LOCALES__*/ {};

  /**
   * Firefox content scripts can expose WebExtension APIs through `browser`
   * while Chromium exposes them through `chrome`. Keep resource loading
   * independent of the namespace used by the current browser.
   */
  function getRuntime() {
    // Prefer Firefox's native Promise-based namespace when available. The
    // compatibility `chrome` namespace can invoke callbacks with an empty
    // response before the real Promise settles.
    const api = global.browser || global.chrome;
    return api && api.runtime ? api.runtime : null;
  }

  function getExtensionUrl(path) {
    const runtime = getRuntime();
    return runtime && typeof runtime.getURL === 'function' ? runtime.getURL(path) : '';
  }

  function requestLocaleFromBackground(locale) {
    const runtime = getRuntime();
    // The background worker already has direct access to extension resources;
    // avoid sending a message back to itself if its own fetch ever fails.
    if (global.GZP_BACKGROUND_CONTEXT || typeof document === 'undefined' || !runtime || typeof runtime.sendMessage !== 'function') {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const finish = (response) => {
        resolve(response && response.ok && response.translations ? response.translations : null);
      };

      try {
        const message = { type: 'GZP_GET_LOCALE', locale };
        // Firefox's native `browser` namespace is Promise-based. The Chrome
        // compatibility namespace is callback-based in content scripts.
        const isFirefoxPromiseApi = global.browser && runtime === global.browser.runtime;
        if (!isFirefoxPromiseApi) {
          runtime.sendMessage(message, (response) => {
            void (runtime.lastError && runtime.lastError.message);
            finish(response);
          });
          return;
        }

        const result = runtime.sendMessage(message);
        if (result && typeof result.then === 'function') {
          result.then(finish, () => finish(null));
        } else {
          finish(null);
        }
      } catch (e) {
        finish(null);
      }
    });
  }

  /** Loaded translations cache */
  let translations = {};
  /** Current active locale */
  let currentLocale = DEFAULT_LOCALE;

  /**
   * Get the user's preferred locale from the browser.
   * Returns the first supported locale match, or 'en' if none match.
   */
  function detectBrowserLocale() {
    const browserLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    // Exact match
    if (browserLang === 'zh-cn' || browserLang === 'zh') {
      return 'zh-CN';
    }
    // Partial match
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    return DEFAULT_LOCALE;
  }

  // The bundled locale data is also the last-resort source while storage or
  // resource loading is still pending. This prevents UI callers from showing
  // raw keys during Firefox content-script startup.
  function getTranslationSource() {
    if (translations && Object.keys(translations).length > 0) {
      return translations;
    }
    const detected = detectBrowserLocale();
    return BUNDLED_LOCALES[currentLocale]
      || BUNDLED_LOCALES[detected]
      || BUNDLED_LOCALES[DEFAULT_LOCALE]
      || {};
  }

  function hasTranslations(value) {
    return value && typeof value === 'object' && Object.keys(value).length > 0;
  }

  /**
   * Load a locale file from storage or bundled JSON.
   * @param {string} locale - The locale code (e.g. 'en', 'zh-CN')
   * @returns {Promise<object>} The translations object
   */
  async function loadLocale(locale) {
    const normalized = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;

    // Prefer data bundled into the content script. This avoids Firefox's
    // content-script restrictions on fetching moz-extension:// resources.
    if (BUNDLED_LOCALES[normalized]) {
      return BUNDLED_LOCALES[normalized];
    }

    // Try to load from the locales folder
    try {
      const url = getExtensionUrl(`locales/${normalized}.json`);
      if (url) {
        const response = await fetch(url);
        if (response.ok) {
          return await response.json();
        }
      }
    } catch (e) {
      // fallback
    }

    // Firefox may block content-script fetches for moz-extension resources.
    const backgroundTranslations = await requestLocaleFromBackground(normalized);
    if (backgroundTranslations) return backgroundTranslations;

    // If locale file not found, try English as fallback
    if (normalized !== 'en') {
      try {
        const url = getExtensionUrl('locales/en.json');
        if (url) {
          const response = await fetch(url);
          if (response.ok) {
            return await response.json();
          }
        }
      } catch (e) {
        // fallback
      }

      const englishTranslations = await requestLocaleFromBackground('en');
      if (englishTranslations) return englishTranslations;
    }

    return {};
  }

  /**
   * Get a translation value by dot-separated key path.
   * @param {string} key - e.g. "general.page_title"
   * @param {object} [vars] - Optional variable substitutions: { key: value }
   * @returns {string} The translated string, or the key if not found
   */
  function t(key, vars) {
    const parts = key.split('.');
    let value = getTranslationSource();
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Substitute {variables}
    if (vars) {
      return value.replace(/\{(\w+)\}/g, (match, varName) => {
        return varName in vars ? String(vars[varName]) : match;
      });
    }

    return value;
  }

  /**
   * Apply translations to all elements with data-i18n attribute.
   * Also handles placeholder attributes via data-i18n-placeholder.
   * Also handles title attributes via data-i18n-title.
   */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const varsAttr = el.getAttribute('data-i18n-vars');
        let vars = null;
        if (varsAttr) {
          try {
            vars = JSON.parse(varsAttr);
          } catch (e) {
            // ignore
          }
        }
        el.textContent = t(key, vars);
      }
    });

    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        const varsAttr = el.getAttribute('data-i18n-vars');
        let vars = null;
        if (varsAttr) {
          try {
            vars = JSON.parse(varsAttr);
          } catch (e) {
            // ignore
          }
        }
        el.innerHTML = t(key, vars);
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = t(key);
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.title = t(key);
      }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria-label');
      if (key) {
        el.setAttribute('aria-label', t(key));
      }
    });

    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.getAttribute('data-i18n-value');
      if (key && el.tagName === 'OPTION') {
        el.textContent = t(key);
      }
    });
  }

  /**
   * Initialize the i18n system.
   * On first install (no saved locale), detect browser language.
   * @returns {Promise<string>} The resolved locale
   */
  async function initI18n() {
    const api = global.browser || global.chrome;
    const storageApi = api && api.storage ? api.storage.local : null;
    let readLocale;
    try {
      readLocale = !storageApi
        ? Promise.resolve({})
        : global.browser && storageApi === global.browser.storage.local
          ? storageApi.get([LOCALE_STORAGE_KEY])
          : new Promise((resolve) => storageApi.get([LOCALE_STORAGE_KEY], resolve));
    } catch (e) {
      readLocale = Promise.resolve({});
    }

    return new Promise((resolve) => {
      Promise.resolve(readLocale).catch(() => ({})).then(async (result) => {
        let locale;
        if (result[LOCALE_STORAGE_KEY]) {
          locale = result[LOCALE_STORAGE_KEY];
        } else {
          // First install: detect browser locale
          locale = detectBrowserLocale();
          // Save so it persists
          if (storageApi && typeof storageApi.set === 'function') {
            try {
              const write = global.browser && storageApi === global.browser.storage.local
                ? storageApi.set({ [LOCALE_STORAGE_KEY]: locale })
                : new Promise((done) => storageApi.set({ [LOCALE_STORAGE_KEY]: locale }, done));
              Promise.resolve(write).catch(() => {});
            } catch (e) {
              // Storage is optional for rendering translations.
            }
          }
        }

        // Normalize
        if (!SUPPORTED_LOCALES.includes(locale)) {
          locale = DEFAULT_LOCALE;
        }

        currentLocale = locale;
        const loaded = await loadLocale(locale);
        translations = hasTranslations(loaded) ? loaded : getTranslationSource();
        resolve(locale);
      });
    });
  }

  /**
   * Switch to a different locale and apply translations.
   * @param {string} locale - The locale code
   */
  async function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      locale = DEFAULT_LOCALE;
    }
    currentLocale = locale;
    translations = await loadLocale(locale);
    chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: locale });
    applyTranslations();

    // Dispatch a custom event so other scripts can react
    document.dispatchEvent(new CustomEvent('gzp-locale-changed', {
      detail: { locale }
    }));
  }

  /**
   * Get the current active locale.
   * @returns {string}
   */
  function getCurrentLocale() {
    return currentLocale;
  }

  /**
   * Get a translated notification message.
   * This can be used from background.js by passing the translations object.
   * @param {object} i18n - The i18n API
   * @param {string} locale - The locale code
   * @param {string} key - The translation key
   * @param {object} [vars] - Optional variable substitutions
   * @returns {Promise<string>}
   */
  async function getTranslatedMessage(locale, key, vars) {
    const translations = await loadLocale(locale);
    const parts = key.split('.');
    let value = translations;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return key;
      }
    }
    if (typeof value !== 'string') return key;
    if (vars) {
      return value.replace(/\{(\w+)\}/g, (match, varName) => {
        return varName in vars ? String(vars[varName]) : match;
      });
    }
    return value;
  }

  /**
   * Reload translations for a locale and update the internal state,
   * without saving to storage or dispatching events.
   * This is useful for content scripts that need to update the internal
   * translations object without triggering side effects like storage writes.
   * @param {string} locale - The locale code (e.g. 'en', 'zh-CN')
   * @returns {Promise<object>} The loaded translations
   */
  async function reloadLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      locale = DEFAULT_LOCALE;
    }
    currentLocale = locale;
    translations = await loadLocale(locale);
    return translations;
  }

  // Expose public API
  global.GZP_I18N = {
    init: initI18n,
    t: t,
    setLocale: setLocale,
    getCurrentLocale: getCurrentLocale,
    applyTranslations: applyTranslations,
    getTranslatedMessage: getTranslatedMessage,
    loadLocale: loadLocale,
    reloadLocale: reloadLocale,
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    DETECTED: detectBrowserLocale()
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
