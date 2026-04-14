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
  // Apply theme first
  const result = await chrome.storage.sync.get(['gzpTheme']);
  const theme = result.gzpTheme || 'system';
  applyTheme(theme);

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
      chrome.tabs.create({ url: 'https://github.com/fthux/GitZipPro' });
      moreMenu.classList.remove('active');
    });
  }

  if (issueBtn) {
    issueBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/fthux/GitZipPro/issues/new' });
      moreMenu.classList.remove('active');
    });
  }

  if (rateBtn) {
    rateBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://github.com/fthux/GitZipPro' });
      moreMenu.classList.remove('active');
    });
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;

    const url = new URL(tab.url);
    if (url.hostname !== 'github.com') {
      statusText.textContent = 'Not on GitHub';
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
      statusText.textContent = `Active on ${parts[0]}/${parts[1]}`;
    } else {
      statusText.textContent = 'Not on a repo file page';
    }
  } catch (e) {
    statusText.textContent = 'Unable to detect page';
  }
})();
