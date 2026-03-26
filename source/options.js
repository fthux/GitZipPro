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

// ─── Version ──────────────────────────────────────────────────────────────────

if (chrome.runtime && chrome.runtime.getManifest) {
  versionDisplay.textContent = 'v' + chrome.runtime.getManifest().version;
}

// ─── Menu Navigation ──────────────────────────────────────────────────────────

const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.page');

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('active'));
    item.classList.add('active');

    pages.forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(item.getAttribute('data-target'));
    if (targetPage) targetPage.classList.add('active');

    // Initialize history page if needed
    if (item.getAttribute('data-target') === 'history' && !historyPageInitialized) {
      initHistoryPage();
      historyPageInitialized = true;
    }
  });
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
  ['gzpTheme', 'gzpButtonPosition', 'gzpNamingPreset', 'gzpNamingCustom', 'gzpNotifyShow', 'gzpNotifySound', 'gzpNotifyOpen', 'gzpIgnoreLabels', 'gzpIgnoreCustomVars'],
  (res) => {
    // Theme
    const savedTheme = res.gzpTheme || 'system';
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    // Button Position
    const savedButtonPosition = res.gzpButtonPosition || 'bottom-right';
    buttonPositionSelect.value = savedButtonPosition;

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
      activeLabels = new Set(PRESET_COMBOS.code_only);
    }

    if (res.gzpIgnoreCustomVars) {
      customRules = res.gzpIgnoreCustomVars;
    }

    renderIgnoreTags();
    updatePresetButtons();
    renderCustomRules();
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

// ─── History Page Implementation ──────────────────────────────────────────────

const HISTORY_STORAGE_KEY = 'gzpDownloadHistory';
let downloadHistory = [];
let historyPageInitialized = false;

// Format date for display (YYYY-MM-DD format)
function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    historyControls.style.display = downloadHistory.length > 0 ? 'block' : 'none';
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
                <span class="history-record-repo">${repoName}</span>
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

  // No more select-all functionality - removed as requested

  historyDeleteSelected.addEventListener('click', deleteSelectedRecords);
  historyClearAll.addEventListener('click', clearAllHistory);

  // Listen for messages from background script about new downloads
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GZP_DOWNLOAD_COMPLETE' && message.record) {
      addHistoryRecord(message.record);
    }
  });
}

// Initialize history page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're already on the history tab
  const activeMenuItem = document.querySelector('.menu-item.active');
  if (activeMenuItem && activeMenuItem.getAttribute('data-target') === 'history') {
    initHistoryPage();
    historyPageInitialized = true;
  }
});