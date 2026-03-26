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
