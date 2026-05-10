/**
 * GitZip Pro - popup.js
 * Updates the popup status indicator based on the active tab's URL.
 */

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

(async () => {
  const C = globalThis.GZP_CONSTANTS;
  const STORAGE = C.STORAGE_KEYS;
  const DEFAULTS = C.DEFAULTS;
  const URLS = C.URLS;
  // Apply theme first
  const result = await chrome.storage.local.get([STORAGE.THEME]);
  const theme = result[STORAGE.THEME] || DEFAULTS.THEME;
  applyTheme(theme);

  // Initialize i18n
  await GZP_I18N.init();
  GZP_I18N.applyTranslations();

  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // Setup button event listeners
  const optionsBtn = document.getElementById('options-btn');
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  const starBtn = document.getElementById('star-btn');
  const issueBtn = document.getElementById('issue-btn');
  const rateBtn = document.getElementById('rate-btn');

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', () => {
      moreMenu.classList.remove('active');
    });

    moreMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (starBtn) {
    starBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: URLS.REPO });
      moreMenu.classList.remove('active');
    });
  }

  if (issueBtn) {
    issueBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: URLS.REPO_ISSUES_NEW });
      moreMenu.classList.remove('active');
    });
  }

  if (rateBtn) {
    rateBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: C.CHROME_WEBSTORE.URL });
      moreMenu.classList.remove('active');
    });
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const url = new URL(tab.url);
    if (url.hostname !== 'github.com') {
      statusText.textContent = GZP_I18N.t('popup.not_on_github');
      return;
    }

    const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
    const excluded = new Set([
      'issues', 'pull', 'pulls', 'wiki', 'settings',
      'actions', 'projects', 'security', 'pulse', 'graphs',
      'releases', 'tags', 'commits', 'compare', 'discussions',
    ]);

    const isRepo = parts.length >= 2 && (!parts[2] || parts[2] === 'tree');
    const isExcluded = parts[2] && excluded.has(parts[2]);

    if (isRepo && !isExcluded) {
      dot.classList.remove('inactive');
      statusText.textContent = GZP_I18N.t('popup.active_on', { owner: parts[0], repo: parts[1] });
    } else {
      statusText.textContent = GZP_I18N.t('popup.not_on_repo_page');
    }
  } catch (e) {
    statusText.textContent = GZP_I18N.t('popup.unable_to_detect');
  }
})();
