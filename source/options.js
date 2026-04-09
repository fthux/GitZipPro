/**
 * GitZip Pro - options.js
 * Handles UI interactions and saves/loads settings from chrome.storage.
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const themeSelect = document.getElementById('themeSelect');
const buttonPositionSelect = document.getElementById('buttonPositionSelect');
const versionDisplay = document.getElementById('versionDisplay');

// Download page elements
const namingPreset = document.getElementById('namingPreset');
const namingCustom = document.getElementById('namingCustom');
const notifyShow = document.getElementById('notifyShow');
const notifySound = document.getElementById('notifySound');
const notifyOpen = document.getElementById('notifyOpen');

// History page elements
const historyContent = document.getElementById('history-content');
const historyCheckedCount = document.getElementById('history-checked-count');
const historyDeleteSelected = document.getElementById('history-delete-selected');
const historyClearAll = document.getElementById('history-clear-all');

// Token page elements
const tokenAccessMode = document.getElementById('tokenAccessMode');
const tokenInputSection = document.getElementById('tokenInputSection');
const githubToken = document.getElementById('githubToken');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const tokenStatusText = document.getElementById('tokenStatusText');
const saveTokenBtn = document.getElementById('saveTokenBtn');
const clearTokenBtn = document.getElementById('clearTokenBtn');
const rateLimitStatus = document.getElementById('rateLimitStatus');
const refreshRateLimitBtn = document.getElementById('refreshRateLimitBtn');

// ─── Version ──────────────────────────────────────────────────────────────────

if (chrome.runtime && chrome.runtime.getManifest) {
  versionDisplay.textContent = 'v' + chrome.runtime.getManifest().version;
}

// ─── Menu Navigation ──────────────────────────────────────────────────────────

const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.page');

function activateMenu(target) {
  const targetItem = document.querySelector(`.menu-item[data-target="${target}"]`);
  if (!targetItem) return false;
  
  menuItems.forEach(m => m.classList.remove('active'));
  targetItem.classList.add('active');

  pages.forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(target);
  if (targetPage) targetPage.classList.add('active');

  // Initialize history page if needed
  if (target === 'history' && !historyPageInitialized) {
    initHistoryPage();
    historyPageInitialized = true;
  }
  
  return true;
}

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-target');
    window.location.hash = target;
  });
});

// Handle hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (hash) {
    activateMenu(hash);
  }
});

// Initialize menu from hash on page load
document.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.slice(1);
  if (hash && activateMenu(hash)) {
    // Hash was valid and menu activated
  } else {
    // No valid hash, default to first menu
    activateMenu('general');
  }
});

// ─── Theme ────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

themeSelect.addEventListener('change', (e) => {
  const theme = e.target.value;
  applyTheme(theme);
  chrome.storage.sync.set({ gzpTheme: theme });
});

// Button Position
buttonPositionSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ gzpButtonPosition: buttonPositionSelect.value });
});

// Show File Sizes
document.getElementById('showFileSizes').addEventListener('change', () => {
  chrome.storage.sync.set({ gzpShowFileSizes: document.getElementById('showFileSizes').checked });
});

// Double Click To Select
document.getElementById('doubleClickSelect').addEventListener('change', () => {
  chrome.storage.sync.set({ gzpDoubleClickSelect: document.getElementById('doubleClickSelect').checked });
});

// ZIP Naming Rule
namingPreset.addEventListener('change', () => {
  chrome.storage.sync.set({ gzpNamingPreset: namingPreset.value });
});
namingCustom.addEventListener('input', () => {
  chrome.storage.sync.set({ gzpNamingCustom: namingCustom.value });
});

// Notifications
notifyShow.addEventListener('change', () => chrome.storage.sync.set({ gzpNotifyShow: notifyShow.checked }));
notifySound.addEventListener('change', () => chrome.storage.sync.set({ gzpNotifySound: notifySound.checked }));
notifyOpen.addEventListener('change', () => chrome.storage.sync.set({ gzpNotifyOpen: notifyOpen.checked }));

// ─── Load All Saved Settings ──────────────────────────────────────────────────

chrome.storage.sync.get(
  ['gzpTheme', 'gzpButtonPosition', 'gzpShowFileSizes', 'gzpDoubleClickSelect', 'gzpNamingPreset', 'gzpNamingCustom', 'gzpNotifyShow', 'gzpNotifySound', 'gzpNotifyOpen', 'gzpIgnoreLabels', 'gzpIgnoreCustomVars', 'gzpGitHubToken', 'gzpTokenAccessMode'],
  (res) => {
    // Theme
    const savedTheme = res.gzpTheme || 'system';
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    // Button Position
    const savedButtonPosition = res.gzpButtonPosition || 'bottom-right';
    buttonPositionSelect.value = savedButtonPosition;

    // Show File Sizes
    document.getElementById('showFileSizes').checked = res.gzpShowFileSizes !== false;

    // Double Click To Select
    document.getElementById('doubleClickSelect').checked = res.gzpDoubleClickSelect !== false;

    // ZIP Naming Rule
    namingPreset.value = res.gzpNamingPreset || '{repo}-{branch}_{ts}';
    if (res.gzpNamingCustom !== undefined) {
      namingCustom.value = res.gzpNamingCustom;
    }

    // Notifications (defaults: Show=true, Sound=true, Open=false)
    notifyShow.checked = res.gzpNotifyShow !== false;
    notifySound.checked = res.gzpNotifySound !== false;
    notifyOpen.checked = res.gzpNotifyOpen === true;

    // Auto Ignore
    if (res.gzpIgnoreLabels) {
      activeLabels = new Set(res.gzpIgnoreLabels);
    } else {
      activeLabels = new Set(PRESET_COMBOS.full_repo);
    }

    if (res.gzpIgnoreCustomVars) {
      customRules = res.gzpIgnoreCustomVars;
    }

    renderIgnoreTags();
    updatePresetButtons();
    renderCustomRules();

    // Token settings
    loadTokenSettings();
  }
);

// ─── Auto Ignore Files ────────────────────────────────────────────────────────

const IGNORE_PRESETS = {
  common: [
    { id: 'git', name: 'Git & Version Control', icon: '📦', rules: ['.git/', '.gitignore', '.gitattributes', '.gitmodules', '.github/'] },
    { id: 'sys', name: 'System Files', icon: '💻', rules: ['.DS_Store', 'Thumbs.db', 'desktop.ini', '*.tmp'] },
    { id: 'deps', name: 'Dependencies', icon: '📚', rules: ['node_modules/', 'vendor/', 'venv/', 'site-packages/', '__pycache__/', '*.egg-info/'] },
    { id: 'build', name: 'Build Output', icon: '🏗️', rules: ['dist/', 'build/', 'out/', 'target/', 'bin/', 'obj/', '*.exe', '*.dll'] },
    { id: 'logs', name: 'Logs & Temp', icon: '📝', rules: ['*.log', '*.tmp', '*.cache', '*.lock', '*.pid'] }
  ],
  media: [
    { id: 'img', name: 'Images', icon: '🖼️', rules: ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.ico', '*.webp'] },
    { id: 'vid', name: 'Videos', icon: '🎬', rules: ['*.mp4', '*.mov', '*.avi', '*.mkv', '*.webm', '*.flv'] },
    { id: 'arc', name: 'Archives', icon: '📦', rules: ['*.zip', '*.tar', '*.gz', '*.rar', '*.7z', '*.bz2'] },
    { id: 'doc', name: 'Documentation', icon: '📄', rules: ['docs/', '*.md', '*.rst', '*.txt', '*.pdf', '*.epub'] },
    { id: 'cfg', name: 'Config Files', icon: '⚙️', rules: ['.env', '*.config.js', '*.json', '*.yml', '*.yaml', '*.toml', '*.ini'] }
  ]
};

const PRESET_COMBOS = {
  code_only: ['git', 'sys', 'deps', 'build', 'logs'],
  full_repo: [],
  docs_only: ['doc'],
  design_assets: ['img', 'doc'],
  minimal: ['git', 'sys']
};

let activeLabels = new Set();
let customRules = [];

function saveIgnoreSettings() {
  chrome.storage.sync.set({
    gzpIgnoreLabels: Array.from(activeLabels),
    gzpIgnoreCustomVars: customRules
  });
}

function renderIgnoreTags() {
  const commonGrid = document.getElementById('ignoreCommonGroup');
  const mediaGrid = document.getElementById('ignoreMediaGroup');

  commonGrid.innerHTML = '';
  mediaGrid.innerHTML = '';

  const createTag = (item) => {
    const div = document.createElement('div');
    const isActive = activeLabels.has(item.id);
    div.className = `gzp-ignore-tag ${isActive ? 'active' : ''}`;
    div.innerHTML = `
      <div class="tag-header" style="gap: 6px;">
        <input type="checkbox" style="margin: 0; pointer-events: none;" ${isActive ? 'checked' : ''} />
        <span class="tag-icon">${item.icon}</span>
        <span class="tag-name">${item.name}</span>
      </div>
      <div class="tag-rules" title="${item.rules.join(', ')}">${item.rules.join(', ')}</div>
    `;
    div.addEventListener('click', () => {
      if (activeLabels.has(item.id)) activeLabels.delete(item.id);
      else activeLabels.add(item.id);
      renderIgnoreTags();
      updatePresetButtons();
      saveIgnoreSettings();
    });
    return div;
  };

  IGNORE_PRESETS.common.forEach(item => commonGrid.appendChild(createTag(item)));
  IGNORE_PRESETS.media.forEach(item => mediaGrid.appendChild(createTag(item)));
}

function updatePresetButtons() {
  const activeArr = Array.from(activeLabels).sort();
  document.querySelectorAll('.gzp-preset-chk').forEach(chk => {
    const presetId = chk.value;
    const combo = [...PRESET_COMBOS[presetId]].sort();
    const isMatch = activeArr.length === combo.length && activeArr.every((v, i) => v === combo[i]);
    chk.checked = isMatch;
  });
}

document.querySelectorAll('.gzp-preset-chk').forEach(chk => {
  chk.addEventListener('change', () => {
    if (chk.checked) {
      const presetId = chk.value;
      activeLabels = new Set(PRESET_COMBOS[presetId]);
    } else {
      activeLabels = new Set();
    }
    renderIgnoreTags();
    updatePresetButtons();
    saveIgnoreSettings();
  });
});

const customRuleInput = document.getElementById('customRuleInput');
const addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
const customRulesList = document.getElementById('customRulesList');

function renderCustomRules() {
  customRulesList.innerHTML = '';
  customRules.forEach((rule, index) => {
    const div = document.createElement('div');
    div.className = 'custom-rule-item';

    const textSpan = document.createElement('span');
    textSpan.textContent = rule;

    const delBtn = document.createElement('button');
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', () => {
      customRules.splice(index, 1);
      renderCustomRules();
      saveIgnoreSettings();
    });

    div.appendChild(textSpan);
    div.appendChild(delBtn);
    customRulesList.appendChild(div);
  });
}

addCustomRuleBtn.addEventListener('click', () => {
  const val = customRuleInput.value.trim();
  if (val && !customRules.includes(val)) {
    customRules.push(val);
    customRuleInput.value = '';
    renderCustomRules();
    saveIgnoreSettings();
  }
});

customRuleInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addCustomRuleBtn.click();
});

// ─── Token Management ─────────────────────────────────────────────────────────

const TOKEN_STORAGE_KEY = 'gzpGitHubToken';
const TOKEN_MODE_KEY = 'gzpTokenAccessMode';

let tokenIsVisible = false;

// Toggle token visibility
toggleTokenVisibility.addEventListener('click', () => {
  tokenIsVisible = !tokenIsVisible;
  githubToken.type = tokenIsVisible ? 'text' : 'password';
  toggleTokenVisibility.textContent = tokenIsVisible ? 'Hide' : 'Show';
});

// Handle access mode change
tokenAccessMode.addEventListener('change', () => {
  const mode = tokenAccessMode.value;
  tokenInputSection.style.display = mode === 'custom' ? 'block' : 'none';

  // Save mode to storage
  chrome.storage.sync.set({ [TOKEN_MODE_KEY]: mode });

  // If switching to anonymous, clear token input
  if (mode === 'anonymous') {
    githubToken.value = '';
    updateTokenStatus('Anonymous access enabled. Rate limit: 60 requests/hour.', 'info');
  }
});

// Save token
saveTokenBtn.addEventListener('click', async () => {
  const token = githubToken.value.trim();

  if (!token) {
    updateTokenStatus('Please enter a token.', 'error');
    return;
  }

  // Validate token format (basic check)
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    updateTokenStatus('Token format appears invalid. GitHub tokens usually start with "ghp_" or "github_pat_".', 'warning');
  }

  // Save token to storage
  try {
    await chrome.storage.sync.set({ [TOKEN_STORAGE_KEY]: token });
    updateTokenStatus('Token saved successfully!', 'success');

    // Refresh rate limit status
    await checkRateLimit();
  } catch (error) {
    updateTokenStatus('Failed to save token: ' + error.message, 'error');
  }
});

// Clear token
clearTokenBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear the saved token?')) {
    githubToken.value = '';
    await chrome.storage.sync.remove(TOKEN_STORAGE_KEY);
    updateTokenStatus('Token cleared.', 'info');
    await checkRateLimit();
  }
});

// Refresh rate limit
refreshRateLimitBtn.addEventListener('click', async () => {
  await checkRateLimit();
});

// Update token status display
function updateTokenStatus(message, type = 'info') {
  tokenStatusText.textContent = message;

  // Reset color
  tokenStatusText.style.color = '';

  // Set color based on type
  switch (type) {
    case 'success':
      tokenStatusText.style.color = '#0b8043'; // Green
      break;
    case 'error':
      tokenStatusText.style.color = '#d93025'; // Red
      break;
    case 'warning':
      tokenStatusText.style.color = '#f29900'; // Orange
      break;
    case 'info':
      tokenStatusText.style.color = 'var(--text-scnd)';
      break;
  }
}

// Check GitHub rate limit
async function checkRateLimit() {
  try {
    rateLimitStatus.textContent = 'Checking rate limit...';

    // Get token from storage
    const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_MODE_KEY]);
    const token = result[TOKEN_STORAGE_KEY];
    const mode = result[TOKEN_MODE_KEY] || 'anonymous';

    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    // Add token if available and mode is custom
    if (token && mode === 'custom') {
      headers['Authorization'] = `token ${token}`;
    }

    // Fetch rate limit info
    const response = await fetch('https://api.github.com/rate_limit', { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rate = data.rate || data.resources?.core;

    if (rate) {
      const remaining = rate.remaining;
      const limit = rate.limit;
      const resetTime = new Date(rate.reset * 1000);
      const resetIn = Math.max(0, Math.round((resetTime.getTime() - Date.now()) / 1000 / 60)); // minutes

      let statusText = `Remaining: ${remaining}/${limit} requests`;

      if (resetIn > 0) {
        statusText += ` (resets in ${resetIn} minutes)`;
      } else {
        statusText += ' (reset soon)';
      }

      // Add mode info
      statusText += `\nMode: ${mode === 'custom' ? 'Authenticated' : 'Anonymous'}`;

      // Add warning if low
      if (remaining < 10) {
        statusText += '\n⚠️ Rate limit almost exhausted!';
      } else if (remaining < limit * 0.2) {
        statusText += '\n⚠️ Rate limit getting low.';
      }

      rateLimitStatus.textContent = statusText;
    } else {
      rateLimitStatus.textContent = 'Rate limit data not available.';
    }
  } catch (error) {
    console.error('Failed to check rate limit:', error);
    rateLimitStatus.textContent = `Error: ${error.message}`;
  }
}

// Load token settings
async function loadTokenSettings() {
  try {
    const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_MODE_KEY]);

    // Load access mode
    const mode = result[TOKEN_MODE_KEY] || 'anonymous';
    tokenAccessMode.value = mode;

    // Show/hide token input section
    tokenInputSection.style.display = mode === 'custom' ? 'block' : 'none';

    // Load token (masked for display)
    if (result[TOKEN_STORAGE_KEY]) {
      const token = result[TOKEN_STORAGE_KEY];
      // Show first 4 and last 4 characters, mask the rest
      const maskedToken = token.length > 8
        ? token.substring(0, 4) + '•'.repeat(Math.min(token.length - 8, 12)) + token.substring(token.length - 4)
        : '••••••••';
      githubToken.value = maskedToken;
      githubToken.type = 'password';
      tokenIsVisible = false;
      toggleTokenVisibility.textContent = 'Show';

      updateTokenStatus('Token configured (masked for security).', 'success');
    } else {
      updateTokenStatus(mode === 'custom'
        ? 'Token not configured. Enter your token and click "Save Token" to validate.'
        : 'Anonymous access enabled. Rate limit: 60 requests/hour.', 'info');
    }

    // Check rate limit
    await checkRateLimit();
  } catch (error) {
    console.error('Failed to load token settings:', error);
    updateTokenStatus('Error loading token settings.', 'error');
  }
}

// ─── History Page Implementation ──────────────────────────────────────────────

const HISTORY_STORAGE_KEY = 'gzpDownloadHistory';
let downloadHistory = [];
let historyPageInitialized = false;

// Format date for display with relative labels
function formatHistoryDate(timestamp) {
  const recordDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Normalize dates to midnight for comparison
  const normalize = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const normRecord = normalize(recordDate);
  const normToday = normalize(today);
  const normYesterday = normalize(yesterday);

  // Format weekday, month day, year (e.g., "Friday, March 27, 2026")
  const formatFullDate = (d) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (normRecord.getTime() === normToday.getTime()) {
    return `Today - ${formatFullDate(recordDate)}`;
  } else if (normRecord.getTime() === normYesterday.getTime()) {
    return `Yesterday - ${formatFullDate(recordDate)}`;
  } else {
    return formatFullDate(recordDate);
  }
}

// Format time for display
function formatHistoryTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Save history to storage
 */
function saveHistory() {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [HISTORY_STORAGE_KEY]: downloadHistory }, () => {
      resolve();
    });
  });
}

/**
 * Load history from storage
 */
function loadHistory() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([HISTORY_STORAGE_KEY], (res) => {
      downloadHistory = Array.isArray(res[HISTORY_STORAGE_KEY]) ? res[HISTORY_STORAGE_KEY] : [];
      resolve(downloadHistory);
    });
  });
}

/**
 * Add a new history record
 */
async function addHistoryRecord(record) {
  // Add timestamp if not present
  if (!record.timestamp) {
    record.timestamp = Date.now();
  }

  // Add id if not present
  if (!record.id) {
    record.id = 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  downloadHistory.unshift(record); // Add to beginning (most recent first)

  // Keep only last 100 records to avoid storage issues
  if (downloadHistory.length > 100) {
    downloadHistory = downloadHistory.slice(0, 100);
  }

  await saveHistory();
  renderHistory();
}

/**
 * Delete selected history records
 */
async function deleteSelectedRecords() {
  const checkboxes = document.querySelectorAll('.history-record-checkbox input[type="checkbox"]:checked');
  const idsToDelete = Array.from(checkboxes).map(cb => cb.closest('.history-record').dataset.id);

  if (idsToDelete.length === 0) return;

  downloadHistory = downloadHistory.filter(record => !idsToDelete.includes(record.id));
  await saveHistory();
  renderHistory();
}

/**
 * Clear all history records
 */
async function clearAllHistory() {
  if (downloadHistory.length === 0 || !confirm('Are you sure you want to clear all download history?')) {
    return;
  }

  downloadHistory = [];
  await saveHistory();
  renderHistory();
}

/**
 * Render the history page
 */
function renderHistory() {
  // Show/hide control buttons based on whether there are any records
  const historyControls = document.querySelector('.history-controls');
  if (historyControls) {
    historyControls.style.display = downloadHistory.length > 0 ? 'flex' : 'none';
  }

  // Show empty state if no history
  if (downloadHistory.length === 0) {
    historyContent.innerHTML = `
      <div class="history-empty-state">
        <h3>No download history yet</h3>
        <p>Your download history will appear here after you download files from GitHub repositories.</p>
      </div>
    `;
    historyDeleteSelected.disabled = true;
    if (historyCheckedCount) {
      historyCheckedCount.textContent = '0';
    }
    return;
  }

  // Group records by date
  const grouped = {};
  downloadHistory.forEach(record => {
    const dateKey = formatHistoryDate(record.timestamp);
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(record);
  });

  // Render groups
  let html = '';
  Object.entries(grouped).forEach(([dateLabel, records]) => {
    html += `
      <div class="history-date-group">
        <div class="history-date-header">${dateLabel}</div>
    `;

    records.forEach(record => {
      const filesCount = record.fileCount || (Array.isArray(record.files) ? record.files.length : 0);
      const ignoredCount = record.ignoredCount || 0;
      const repoName = record.repo || 'Unknown repository';
      const branchName = record.branch || 'main';
      const ownerName = record.owner || 'unknown';
      const downloadName = record.downloadName || record.filename || 'download.zip';
      const path = record.path || '';

      html += `
        <div class="history-record" data-id="${record.id}">
          <div class="history-record-header">
            <div class="history-record-checkbox">
              <input type="checkbox" />
            </div>
            <div class="history-record-content">
              <div class="history-record-title">
                <span class="history-record-repo">${ownerName}/${repoName}</span>
                <span class="history-record-branch">${branchName}</span>
              </div>
              <div class="history-record-meta">
                <div class="history-record-meta-item">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>${formatHistoryTime(record.timestamp)}</span>
                </div>
                <div class="history-record-meta-item">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>${filesCount} ${filesCount === 1 ? 'file' : 'files'}</span>
                  ${ignoredCount > 0 ? `<span style="margin-left: 6px; color: var(--text-scnd); font-size: 11px;">(${ignoredCount} filtered out)</span>` : ''}
                </div>
              </div>
            </div>
            <div class="history-record-expand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div class="history-record-details">
            <div><strong>Repository:</strong> ${ownerName}/${repoName}</div>
            <div><strong>Branch:</strong> ${branchName}</div>
            ${path ? `<div><strong>Path:</strong> ${path}</div>` : ''}
            ${downloadName ? `<div><strong>Downloaded as:</strong> ${downloadName}</div>` : ''}
            ${filesCount > 0 ? `
              <div style="margin-top: 8px;"><strong>Files (${filesCount}):</strong></div>
              <div class="history-file-list">
                ${record.files && record.files.slice(0, 20).map(file => `<div class="history-file-item">${file}</div>`).join('') || ''}
                ${filesCount > 20 ? `<div class="history-file-item">... and ${filesCount - 20} more</div>` : ''}
              </div>
            ` : ''}
            ${ignoredCount > 0 ? `
              <div style="margin-top: 8px;">
                <strong>Filtered out:</strong> ${ignoredCount} ${ignoredCount === 1 ? 'file was' : 'files were'} excluded based on your auto‑ignore settings.
                ${record.ignoredFiles && record.ignoredFiles.length > 0 ? `
                  <div style="margin-top: 4px; font-size: 12px;">
                    <strong>Filtered files:</strong>
                    <div class="history-file-list" style="margin-top: 4px;">
                      ${record.ignoredFiles.slice(0, 10).map(file => `<div class="history-file-item">${file}</div>`).join('')}
                      ${record.ignoredFiles.length > 10 ? `<div class="history-file-item">... and ${record.ignoredFiles.length - 10} more</div>` : ''}
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  historyContent.innerHTML = html;

  // Add event listeners
  addHistoryEventListeners();
  updateSelectionUI();
}

/**
 * Add event listeners to history records
 */
function addHistoryEventListeners() {
  // Expand/collapse toggle
  document.querySelectorAll('.history-record-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle if checkbox was clicked
      if (e.target.type === 'checkbox' || e.target.closest('.history-record-checkbox')) {
        return;
      }
      const record = header.closest('.history-record');
      record.classList.toggle('expanded');
    });
  });

  // Checkbox selection
  document.querySelectorAll('.history-record-checkbox input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateSelectionUI();
    });
  });
}

/**
 * Update selection UI (checked count display, delete button)
 */
function updateSelectionUI() {
  const checkboxes = document.querySelectorAll('.history-record-checkbox input[type="checkbox"]');
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  const totalCount = checkboxes.length;

  // Update checked count display
  if (historyCheckedCount) {
    historyCheckedCount.textContent = checkedCount.toString();
  }

  // Update delete button
  historyDeleteSelected.disabled = checkedCount === 0;
}

/**
 * Initialize history page
 */
async function initHistoryPage() {
  await loadHistory();
  renderHistory();

  historyDeleteSelected.addEventListener('click', deleteSelectedRecords);
  historyClearAll.addEventListener('click', clearAllHistory);


}

// Initialize history page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize message listener for download completion events
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GZP_DOWNLOAD_COMPLETE' && message.record) {
      // If history page is already initialized, add the record
      if (historyPageInitialized) {
        addHistoryRecord(message.record);
        renderHistory(); // Re-render to show new record
      } else {
        // Store the record temporarily and add it when history page is initialized
        if (!window.pendingHistoryRecords) {
          window.pendingHistoryRecords = [];
        }
        window.pendingHistoryRecords.push(message.record);
      }
    }
  });

  // Check if we're already on the history tab
  const activeMenuItem = document.querySelector('.menu-item.active');
  if (activeMenuItem && activeMenuItem.getAttribute('data-target') === 'history') {
    initHistoryPage();
    historyPageInitialized = true;

    // Process any pending records
    if (window.pendingHistoryRecords && window.pendingHistoryRecords.length > 0) {
      window.pendingHistoryRecords.forEach(record => {
        addHistoryRecord(record);
      });
      window.pendingHistoryRecords = [];
      renderHistory();
    }
  }
});
