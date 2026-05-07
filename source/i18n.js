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

  /**
   * Load a locale file from storage or bundled JSON.
   * @param {string} locale - The locale code (e.g. 'en', 'zh-CN')
   * @returns {Promise<object>} The translations object
   */
  async function loadLocale(locale) {
    const normalized = SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;

    // Try to load from the locales folder
    try {
      const response = await fetch(chrome.runtime.getURL(`locales/${normalized}.json`));
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      // fallback
    }

    // If locale file not found, try English as fallback
    if (normalized !== 'en') {
      try {
        const response = await fetch(chrome.runtime.getURL('locales/en.json'));
        if (response.ok) {
          return await response.json();
        }
      } catch (e) {
        // fallback
      }
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
    let value = translations;
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
    return new Promise((resolve) => {
      chrome.storage.sync.get([LOCALE_STORAGE_KEY], async (result) => {
        let locale;
        if (result[LOCALE_STORAGE_KEY]) {
          locale = result[LOCALE_STORAGE_KEY];
        } else {
          // First install: detect browser locale
          locale = detectBrowserLocale();
          // Save so it persists
          chrome.storage.sync.set({ [LOCALE_STORAGE_KEY]: locale });
        }

        // Normalize
        if (!SUPPORTED_LOCALES.includes(locale)) {
          locale = DEFAULT_LOCALE;
        }

        currentLocale = locale;
        translations = await loadLocale(locale);
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
    chrome.storage.sync.set({ [LOCALE_STORAGE_KEY]: locale });
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

  // Expose public API
  global.GZP_I18N = {
    init: initI18n,
    t: t,
    setLocale: setLocale,
    getCurrentLocale: getCurrentLocale,
    applyTranslations: applyTranslations,
    getTranslatedMessage: getTranslatedMessage,
    loadLocale: loadLocale,
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    DETECTED: detectBrowserLocale()
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);