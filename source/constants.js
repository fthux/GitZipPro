/**
 * Centralized constants for GitZip Pro.
 * Keep shared defaults, keys, URLs, and limits here.
 */
(function initGzpConstants(global) {
  const STORAGE_KEYS = {
    THEME: 'gzpTheme',
    ACCENT_COLOR: 'gzpAccentColor',
    BUTTON_POSITION: 'gzpButtonPosition',
    SHOW_FILE_SIZES: 'gzpShowFileSizes',
    DOUBLE_CLICK_SELECT: 'gzpDoubleClickSelect',
    NAMING_PRESET: 'gzpNamingPreset',
    NAMING_CUSTOM: 'gzpNamingCustom',
    NOTIFY_SHOW: 'gzpNotifyShow',
    NOTIFY_SOUND: 'gzpNotifySound',
    NOTIFY_OPEN: 'gzpNotifyOpen',
    IGNORE_LABELS: 'gzpIgnoreLabels',
    IGNORE_CUSTOM_VARS: 'gzpIgnoreCustomVars',
    GITHUB_TOKEN: 'gzpGitHubToken',
    TOKEN_ACCESS_MODE: 'gzpTokenAccessMode',
    DOWNLOAD_HISTORY: 'gzpDownloadHistory'
  };

  const DEFAULTS = {
    THEME: 'system',
    ACCENT_COLOR: '#1a73e8',
    BUTTON_POSITION: 'bottom-right',
    SHOW_FILE_SIZES: true,
    DOUBLE_CLICK_SELECT: true,
    NAMING_PRESET: '{repo}-{branch}-{path}_{ts}',
    NAMING_CUSTOM: '',
    NOTIFY_SHOW: true,
    NOTIFY_SOUND: true,
    NOTIFY_OPEN: false,
    TOKEN_ACCESS_MODE: 'anonymous'
  };

  const URLS = {
    GITHUB_BASE: 'https://github.com',
    GITHUB_API_BASE: 'https://api.github.com',
    GITHUB_RATE_LIMIT: 'https://api.github.com/rate_limit',
    REPO: 'https://github.com/fthux/GitZipPro',
    REPO_ISSUES_NEW: 'https://github.com/fthux/GitZipPro/issues/new',
    OAUTH_WORKER: 'https://gitzip-pro-github-auth.fthux.com'
  };

  const CHROME_WEBSTORE = {
    EXTENSION_ID: 'abcdefghijklmnopqrstuvwxyz',
    URL: 'https://chrome.google.com/webstore/detail/abcdefghijklmnopqrstuvwxyz'
  };

  const DOWNLOAD = {
    CONCURRENCY_LIMIT: 5,
    MAX_FILE_COUNT: 500
  };

  const UI = {
    BUTTON_POSITIONS: [
      'bottom-right',
      'top-left',
      'top-right',
      'bottom-left',
      'top-center',
      'bottom-center',
      'left-center',
      'right-center'
    ]
  };

  global.GZP_CONSTANTS = {
    STORAGE_KEYS,
    DEFAULTS,
    URLS,
    CHROME_WEBSTORE,
    DOWNLOAD,
    UI
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
