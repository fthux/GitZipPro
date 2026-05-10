/**
 * GitZip Pro - options.js
 * Handles UI interactions and saves/loads settings from chrome.storage.
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const themeSelect = document.getElementById('themeSelect');
const languageSelect = document.getElementById('languageSelect');
const buttonPositionSelect = document.getElementById('buttonPositionSelect');
const versionDisplay = document.getElementById('versionDisplay');
const C = globalThis.GZP_CONSTANTS;
const STORAGE = C.STORAGE_KEYS;
const DEFAULTS = C.DEFAULTS;
const URLS = C.URLS;

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
const statsOverviewGrid = document.getElementById('stats-overview-grid');
const statsRepoDimensions = document.getElementById('stats-repo-dimensions');
const statsBranchDimensions = document.getElementById('stats-branch-dimensions');
const statsTimeRange = document.getElementById('stats-time-range');
const statsTypeFilter = document.getElementById('stats-type-filter');
const statsRepoFilter = document.getElementById('stats-repo-filter');
const statsBranchFilter = document.getElementById('stats-branch-filter');
const statsKeywordFilter = document.getElementById('stats-keyword-filter');
const statsResetFilters = document.getElementById('stats-reset-filters');
const statsFilterSummary = document.getElementById('stats-filter-summary');
const statsCustomRange = document.getElementById('stats-custom-range');
const statsStartDate = document.getElementById('stats-start-date');
const statsEndDate = document.getElementById('stats-end-date');

// Token page elements
const tokenAccessMode = document.getElementById('tokenAccessMode');
const tokenInputSection = document.getElementById('tokenInputSection');
const githubToken = document.getElementById('githubToken');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const copyToken = document.getElementById('copyToken');
const rateLimitStatus = document.getElementById('rateLimitStatus');
const refreshRateLimitBtn = document.getElementById('refreshRateLimitBtn');
const authorizePublicBtn = document.getElementById('authorizePublicBtn');
const authorizePrivateBtn = document.getElementById('authorizePrivateBtn');
const tokenScopeStatus = document.getElementById('tokenScopeStatus');

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

  if (target === 'stats') {
    initStatsPage();
  }

  // Automatically check rate limit when switching to Token page
  if (target === 'token') {
    checkRateLimit();
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

  // Check if we should show welcome modal for first-time users
  checkAndShowWelcomeModal();
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
  chrome.storage.sync.set({ [STORAGE.THEME]: theme });
});

// ─── Accent Color ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function lightenColor(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${Math.min(255, rgb.r + amount)}, ${Math.min(255, rgb.g + amount)}, ${Math.min(255, rgb.b + amount)})`;
}

function darkenColor(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${Math.max(0, rgb.r - amount)}, ${Math.max(0, rgb.g - amount)}, ${Math.max(0, rgb.b - amount)})`;
}

function applyAccentColor(color) {
  // Calculate variant colors for different usages
  const lightVariant = lightenColor(color, 60);
  const darkVariant = darkenColor(color, 30);

  // Update CSS variables
  document.documentElement.style.setProperty('--primary-color', color);
  document.documentElement.style.setProperty('--btn-text', color);

  // Update active menu background
  const menuActiveRgb = hexToRgb(color);
  document.documentElement.style.setProperty('--menu-active', `rgba(${menuActiveRgb.r}, ${menuActiveRgb.g}, ${menuActiveRgb.b}, 0.3)`);

  // Update toggle colors
  document.documentElement.style.setProperty('--toggle-track-on', `rgba(${menuActiveRgb.r}, ${menuActiveRgb.g}, ${menuActiveRgb.b}, 0.5)`);
  document.documentElement.style.setProperty('--toggle-thumb-on', color);

  // Update color picker display
  document.getElementById('customColorPicker').value = color;
  document.getElementById('colorHexDisplay').textContent = color;

  // Update preset selection indicators
  document.querySelectorAll('.color-preset').forEach(btn => {
    const btnColor = btn.getAttribute('data-color');
    if (btnColor.toLowerCase() === color.toLowerCase()) {
      btn.style.borderColor = color;
      btn.style.boxShadow = `0 0 0 2px ${color}40`;
    } else {
      btn.style.borderColor = 'transparent';
      btn.style.boxShadow = 'none';
    }
  });

  // Broadcast to content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'GZP_ACCENT_COLOR_CHANGED',
        color: color
      }).catch(() => { });
    });
  });
}

// Preset color buttons
document.querySelectorAll('.color-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.getAttribute('data-color');
    applyAccentColor(color);
    chrome.storage.sync.set({ [STORAGE.ACCENT_COLOR]: color });
  });
});

// Custom color picker
const customColorPicker = document.getElementById('customColorPicker');
customColorPicker.addEventListener('input', (e) => {
  const color = e.target.value;
  applyAccentColor(color);
  document.getElementById('colorHexDisplay').textContent = color;
});

customColorPicker.addEventListener('change', (e) => {
  chrome.storage.sync.set({ [STORAGE.ACCENT_COLOR]: e.target.value });
});

// Language
languageSelect.addEventListener('change', () => {
  const locale = languageSelect.value;
  GZP_I18N.setLocale(locale);
  chrome.storage.sync.set({ [STORAGE.LANGUAGE]: locale });
});

// Listen for language changes to re-render dynamically translated content
document.addEventListener('gzp-locale-changed', () => {
  // Re-translate token / rate limit status
  checkRateLimit();

  // Refresh the token UI elements (buttons, toggle, etc.)
  loadTokenSettings();

  // Re-render ignore tags
  renderIgnoreTags();
  updatePresetButtons();
  renderCustomRules();

  // Re-render history if initialized
  if (historyPageInitialized) {
    renderHistory();
  }

  // Re-render stats if initialized
  if (statsPageInitialized) {
    renderStatsFilterOptions();
    renderStats();
  }
});

// Button Position
buttonPositionSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ [STORAGE.BUTTON_POSITION]: buttonPositionSelect.value });
});

// Show File Sizes
document.getElementById('showFileSizes').addEventListener('change', () => {
  chrome.storage.sync.set({ [STORAGE.SHOW_FILE_SIZES]: document.getElementById('showFileSizes').checked });
});

// Double Click To Select
document.getElementById('doubleClickSelect').addEventListener('change', () => {
  chrome.storage.sync.set({ [STORAGE.DOUBLE_CLICK_SELECT]: document.getElementById('doubleClickSelect').checked });
});

// ZIP Naming Rule
namingPreset.addEventListener('change', () => {
  chrome.storage.sync.set({ [STORAGE.NAMING_PRESET]: namingPreset.value });
});
namingCustom.addEventListener('input', () => {
  chrome.storage.sync.set({ [STORAGE.NAMING_CUSTOM]: namingCustom.value });
});

// Notifications
notifyShow.addEventListener('change', () => chrome.storage.sync.set({ [STORAGE.NOTIFY_SHOW]: notifyShow.checked }));
notifySound.addEventListener('change', () => chrome.storage.sync.set({ [STORAGE.NOTIFY_SOUND]: notifySound.checked }));
notifyOpen.addEventListener('change', () => chrome.storage.sync.set({ [STORAGE.NOTIFY_OPEN]: notifyOpen.checked }));

// ─── Load All Saved Settings ──────────────────────────────────────────────────

chrome.storage.sync.get(
  [STORAGE.THEME, STORAGE.LANGUAGE, STORAGE.ACCENT_COLOR, STORAGE.BUTTON_POSITION, STORAGE.SHOW_FILE_SIZES, STORAGE.DOUBLE_CLICK_SELECT, STORAGE.NAMING_PRESET, STORAGE.NAMING_CUSTOM, STORAGE.NOTIFY_SHOW, STORAGE.NOTIFY_SOUND, STORAGE.NOTIFY_OPEN, STORAGE.IGNORE_LABELS, STORAGE.IGNORE_CUSTOM_VARS, STORAGE.GITHUB_TOKEN, STORAGE.TOKEN_ACCESS_MODE],
  (res) => {
    // Theme
    const savedTheme = res[STORAGE.THEME] || DEFAULTS.THEME;
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

    // Language - always call setLocale to ensure translations are loaded
    // (GZP_I18N.init() may not have completed yet; setLocale loads from file)
    const savedLanguage = res[STORAGE.LANGUAGE];
    const currentLocale = GZP_I18N.getCurrentLocale();
    const localeToUse = savedLanguage || currentLocale;
    GZP_I18N.setLocale(localeToUse);
    languageSelect.value = localeToUse;

    // Accent Color
    const savedAccentColor = res[STORAGE.ACCENT_COLOR] || DEFAULTS.ACCENT_COLOR;
    applyAccentColor(savedAccentColor);

    // Button Position
    const savedButtonPosition = res[STORAGE.BUTTON_POSITION] || DEFAULTS.BUTTON_POSITION;
    buttonPositionSelect.value = savedButtonPosition;

    // Show File Sizes
    document.getElementById('showFileSizes').checked = res[STORAGE.SHOW_FILE_SIZES] !== false;

    // Double Click To Select
    document.getElementById('doubleClickSelect').checked = res[STORAGE.DOUBLE_CLICK_SELECT] !== false;

    // ZIP Naming Rule
    const validPresets = Array.from(namingPreset.options).map(opt => opt.value);
    const savedPreset = res[STORAGE.NAMING_PRESET];
    namingPreset.value = validPresets.includes(savedPreset) ? savedPreset : DEFAULTS.NAMING_PRESET;
    if (res[STORAGE.NAMING_CUSTOM] !== undefined) {
      namingCustom.value = res[STORAGE.NAMING_CUSTOM];
    }

    // Notifications (defaults: Show=true, Sound=true, Open=false)
    notifyShow.checked = res[STORAGE.NOTIFY_SHOW] !== false;
    notifySound.checked = res[STORAGE.NOTIFY_SOUND] !== false;
    notifyOpen.checked = res[STORAGE.NOTIFY_OPEN] === true;

    // Auto Ignore
    if (res[STORAGE.IGNORE_LABELS]) {
      activeLabels = new Set(res[STORAGE.IGNORE_LABELS]);
    } else {
      activeLabels = new Set(PRESET_COMBOS.full_repo);
    }

    if (res[STORAGE.IGNORE_CUSTOM_VARS]) {
      customRules = res[STORAGE.IGNORE_CUSTOM_VARS];
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
    [STORAGE.IGNORE_LABELS]: Array.from(activeLabels),
    [STORAGE.IGNORE_CUSTOM_VARS]: customRules
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

const TOKEN_STORAGE_KEY = STORAGE.GITHUB_TOKEN;
const TOKEN_MODE_KEY = STORAGE.TOKEN_ACCESS_MODE;
const TOKEN_SCOPE_KEY = STORAGE.TOKEN_SCOPE;

// Token visibility states
let tokenIsVisible = false;
let saveTokenDebounceTimer = null;

function renderTokenScopeStatus(mode, token, scope) {
  if (!tokenScopeStatus) return;
  tokenScopeStatus.classList.remove('idle', 'public', 'private', 'unknown');

  if (mode !== 'custom' || !token) {
    tokenScopeStatus.classList.add('idle');
    tokenScopeStatus.textContent = GZP_I18N.t('token.token_scope_idle');
    return;
  }

  if (scope === undefined || scope === null || scope === '') {
    tokenScopeStatus.classList.add('idle');
    tokenScopeStatus.textContent = GZP_I18N.t('token.token_scope_detecting');
    return;
  }

  if (scope === 'private') {
    tokenScopeStatus.classList.add('private');
    tokenScopeStatus.textContent = GZP_I18N.t('token.token_scope_private');
  } else if (scope === 'public') {
    tokenScopeStatus.classList.add('public');
    tokenScopeStatus.textContent = GZP_I18N.t('token.token_scope_public');
  } else {
    tokenScopeStatus.classList.add('unknown');
    tokenScopeStatus.textContent = GZP_I18N.t('token.token_scope_unknown');
  }
}

// Toggle token visibility
toggleTokenVisibility.addEventListener('click', () => {
  tokenIsVisible = !tokenIsVisible;
  githubToken.type = tokenIsVisible ? 'text' : 'password';
  toggleTokenVisibility.textContent = tokenIsVisible ? GZP_I18N.t('token.token_hide') : GZP_I18N.t('token.token_show');
});

// Auto save token on input with debounce
githubToken.addEventListener('input', () => {
  clearTimeout(saveTokenDebounceTimer);
  saveTokenDebounceTimer = setTimeout(async () => {
    const token = githubToken.value.trim();

    if (token && token.length > 0) {
      await chrome.storage.sync.set({ [TOKEN_STORAGE_KEY]: token, [TOKEN_SCOPE_KEY]: 'unknown' });
      renderTokenScopeStatus(tokenAccessMode.value, token, 'unknown');
      await checkRateLimit();
    } else {
      await chrome.storage.sync.remove([TOKEN_STORAGE_KEY, TOKEN_SCOPE_KEY]);
      renderTokenScopeStatus(tokenAccessMode.value, '', '');
    }
  }, 500);
});

// Copy token to clipboard
copyToken.addEventListener('click', async () => {
  const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY]);
  const token = result[TOKEN_STORAGE_KEY];

  if (token) {
    try {
      await navigator.clipboard.writeText(token);
      copyToken.textContent = GZP_I18N.t('token.token_copied');
      setTimeout(() => {
        copyToken.textContent = GZP_I18N.t('token.token_copy');
      }, 1500);

      // Show system notification using Chrome extension API
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: GZP_I18N.t('notifications.token_copied_title'),
        message: GZP_I18N.t('notifications.token_copied_msg')
      });

    } catch (e) {
      console.error('Failed to copy token:', e);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: GZP_I18N.t('notifications.copy_failed_title'),
        message: GZP_I18N.t('notifications.copy_failed_msg')
      });
    }
  }
});

// Handle access mode change
tokenAccessMode.addEventListener('change', () => {
  const mode = tokenAccessMode.value;
  tokenInputSection.style.display = mode === 'custom' ? 'block' : 'none';

  // Save mode to storage
  chrome.storage.sync.set({ [TOKEN_MODE_KEY]: mode });

  // Show warning when using anonymous access
  const anonymousWarning = document.getElementById('anonymousWarning');
  if (mode === 'anonymous') {
    githubToken.value = '';
    anonymousWarning.style.display = 'block';
    renderTokenScopeStatus(mode, '', '');
  } else {
    anonymousWarning.style.display = 'none';

    // Restore saved token when switching back to custom mode
    chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_SCOPE_KEY], (result) => {
      if (result[TOKEN_STORAGE_KEY]) {
        githubToken.value = result[TOKEN_STORAGE_KEY];
        githubToken.type = 'password';
        tokenIsVisible = false;
        toggleTokenVisibility.textContent = GZP_I18N.t('token.token_show');
      }
      renderTokenScopeStatus(mode, result[TOKEN_STORAGE_KEY], result[TOKEN_SCOPE_KEY]);
    });
  }

  // Refresh rate limit status when mode changes
  checkRateLimit();
});

// ============================================================
// GitHub OAuth PKCE Authorization Implementation
// ============================================================

const OAUTH_WORKER_ENDPOINT = URLS.OAUTH_WORKER;

/**
 * Generate cryptographically secure random code verifier for PKCE
 * @returns {string} Base64URL encoded random string
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate SHA-256 hash and return Base64URL encoded code challenge
 * @param {string} codeVerifier 
 * @returns {Promise<string>} code_challenge
 */
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Start GitHub OAuth authorization flow
 * @param {string} scope - 'public_repo' or 'repo'
 */
async function startGitHubOAuth(scope) {
  try {
    // Disable buttons during authorization
    authorizePublicBtn.disabled = true;
    authorizePrivateBtn.disabled = true;

    const originalPublicText = authorizePublicBtn.textContent;
    const originalPrivateText = authorizePrivateBtn.textContent;

    authorizePublicBtn.textContent = GZP_I18N.t('token.auth_authorizing');
    authorizePrivateBtn.textContent = GZP_I18N.t('token.auth_authorizing');

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Build authorization URL
    const authUrl = new URL(OAUTH_WORKER_ENDPOINT);
    authUrl.searchParams.set('code_verifier', codeVerifier);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('scope', scope);

    // Open authorization window
    const authWindow = window.open(
      authUrl.toString(),
      'GitHub Authorization',
      'width=600,height=700,scrollbars=yes,resizable=yes,status=no,menubar=no,toolbar=no,location=no'
    );

    if (!authWindow) {
      throw new Error('Failed to open authorization window. Please check browser popup blocker settings.');
    }

    // Create promise to handle authorization result
    const authResult = await new Promise((resolve, reject) => {
      const messageHandler = (event) => {
        // Security: only accept messages from our worker domain
        if (event.origin !== new URL(OAUTH_WORKER_ENDPOINT).origin) return;

        // Cleanup
        window.removeEventListener('message', messageHandler);

        // Close window if still open
        if (!authWindow.closed) {
          authWindow.close();
        }

        const data = event.data;

        if (data.type === 'OAUTH_SUCCESS') {
          resolve(data);
        } else if (data.type === 'OAUTH_ERROR') {
          reject(new Error(data.message || 'Authorization failed'));
        }
      };

      // Listen for postMessage from worker
      window.addEventListener('message', messageHandler);

      // Set timeout for authorization
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        if (!authWindow.closed) authWindow.close();
        reject(new Error('Authorization timed out. Please try again.'));
      }, 5 * 60 * 1000); // 5 minutes timeout

      // Monitor authorization window close event
      const authWindowCloseCheck = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(authWindowCloseCheck);
          window.removeEventListener('message', messageHandler);
          reject(new Error('Authorization cancelled by user.'));
        }
      }, 500);
    });

    // Authorization successful - save token
    if (authResult.accessToken) {
      // Save token to storage
      const storedScope = scope === 'repo' ? 'private' : 'public';
      await chrome.storage.sync.set({ [TOKEN_STORAGE_KEY]: authResult.accessToken, [TOKEN_SCOPE_KEY]: storedScope });

      // Update UI
      githubToken.value = authResult.accessToken.substring(0, 4) + '•'.repeat(Math.min(authResult.accessToken.length - 8, 12)) + authResult.accessToken.substring(authResult.accessToken.length - 4);
      githubToken.type = 'password';
      tokenIsVisible = false;
      toggleTokenVisibility.textContent = GZP_I18N.t('token.token_show');

      const tokenType = storedScope === 'private' ? GZP_I18N.t('token.auth_success').replace('{type}', 'Public + Private Repos') : GZP_I18N.t('token.auth_success').replace('{type}', 'Public Repos Only');
      // Show authorization success message directly in rate limit status area
      rateLimitStatus.textContent = GZP_I18N.t('token.auth_success').replace('{type}', storedScope === 'private' ? 'Public + Private Repos' : 'Public Repos Only');
      renderTokenScopeStatus('custom', authResult.accessToken, storedScope);

      // Delay rate limit refresh to ensure Chrome Storage has been updated
      setTimeout(() => checkRateLimit(), 100);
    }

  } catch (error) {
    console.error('OAuth authorization error:', error);
    rateLimitStatus.textContent = GZP_I18N.t('token.auth_failed').replace('{message}', error.message);
  } finally {
    // Re-enable buttons
    authorizePublicBtn.disabled = false;
    authorizePrivateBtn.disabled = false;
    authorizePublicBtn.textContent = GZP_I18N.t('token.auth_public_btn');
    authorizePrivateBtn.textContent = GZP_I18N.t('token.auth_private_btn');
  }
}

// OAuth Authorization button handlers
authorizePublicBtn.addEventListener('click', () => startGitHubOAuth('public_repo'));
authorizePrivateBtn.addEventListener('click', () => startGitHubOAuth('repo'));


// Refresh rate limit
refreshRateLimitBtn.addEventListener('click', async () => {
  await checkRateLimit();
});



// Check GitHub rate limit
async function checkRateLimit() {

  try {
    rateLimitStatus.textContent = GZP_I18N.t('token.rate_limit_checking');

    // Get token from storage
    const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_MODE_KEY, TOKEN_SCOPE_KEY]);
    const token = result[TOKEN_STORAGE_KEY];
    const mode = result[TOKEN_MODE_KEY] || 'anonymous';

    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    // Add token if available and mode is custom
    if (token && mode === 'custom') {
      // Use only ASCII characters to prevent fetch errors
      const cleanToken = token.replace(/[^\x00-\x7F]/g, '').trim();
      headers['Authorization'] = `token ${cleanToken}`;
    }

    // Fetch rate limit info
    const response = await fetch(URLS.GITHUB_RATE_LIMIT, { headers });

    if (!response.ok) {
      let errorMessage = '';

      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage += errorData.message;
          if (errorData.documentation_url) {
            errorMessage += `\nDocs: ${errorData.documentation_url}`;
          }
        } else {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    const rate = data.rate || data.resources?.core;

    // Detect and persist token scope from GitHub response headers when using custom token
    if (token && mode === 'custom') {
      const oauthScopesHeader = (response.headers.get('x-oauth-scopes') || '').toLowerCase();
      const scopeList = oauthScopesHeader
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      let detectedScope = 'unknown';
      if (scopeList.includes('repo')) {
        detectedScope = 'private';
      } else if (scopeList.includes('public_repo')) {
        detectedScope = 'public';
      } else if (oauthScopesHeader.trim() === '') {
        detectedScope = 'unknown';
      } else {
        // Tokens without repo/public_repo but still authenticated are treated as public-only
        detectedScope = 'public';
      }

      if (result[TOKEN_SCOPE_KEY] !== detectedScope) {
        await chrome.storage.sync.set({ [TOKEN_SCOPE_KEY]: detectedScope });
      }
      renderTokenScopeStatus(mode, token, detectedScope);
    } else {
      renderTokenScopeStatus(mode, token, result[TOKEN_SCOPE_KEY]);
    }

    if (rate) {
      const remaining = rate.remaining;
      const limit = rate.limit;
      const resetTime = new Date(rate.reset * 1000);
      const resetIn = Math.max(0, Math.round((resetTime.getTime() - Date.now()) / 1000 / 60)); // minutes

      let statusText = GZP_I18N.t('token_rate_data.remaining_fmt', { remaining, limit });

      if (resetIn > 0) {
        statusText += ' (' + GZP_I18N.t('token_rate_data.resets_in', { minutes: resetIn }) + ')';
      } else {
        statusText += ' (' + GZP_I18N.t('token_rate_data.reset_soon') + ')';
      }

      // Add mode info
      const modeLabel = GZP_I18N.t(mode === 'custom' ? 'token_rate_data.mode_authenticated' : 'token_rate_data.mode_anonymous');
      statusText += '\n' + GZP_I18N.t('token_rate_data.mode', { mode: modeLabel });

      // Add warning if low
      if (remaining < 10) {
        statusText += '\n' + GZP_I18N.t('token_rate_data.almost_exhausted');
      } else if (remaining < limit * 0.2) {
        statusText += '\n' + GZP_I18N.t('token_rate_data.getting_low');
      }

      rateLimitStatus.textContent = statusText;
    } else {
      rateLimitStatus.textContent = GZP_I18N.t('token.rate_limit_not_available');
    }
  } catch (error) {
    console.error('Failed to check rate limit:', error);
    rateLimitStatus.textContent = GZP_I18N.t('token.rate_limit_error').replace('{message}', error.message);
  }
}

// Load token settings
async function loadTokenSettings() {
  try {
    // Set loading state immediately to avoid empty display
    rateLimitStatus.textContent = GZP_I18N.t('token.rate_limit_checking');

    const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_MODE_KEY, TOKEN_SCOPE_KEY]);

    // Load access mode
    const mode = result[TOKEN_MODE_KEY] || 'anonymous';
    tokenAccessMode.value = mode;

    // Show/hide token input section
    tokenInputSection.style.display = mode === 'custom' ? 'block' : 'none';

    // Show warning when using anonymous access
    const anonymousWarning = document.getElementById('anonymousWarning');
    if (mode === 'anonymous') {
      anonymousWarning.style.display = 'block';
    } else {
      anonymousWarning.style.display = 'none';
    }

    // Load token (masked for display)
    if (result[TOKEN_STORAGE_KEY]) {
      githubToken.value = result[TOKEN_STORAGE_KEY];
      githubToken.type = 'password';
      tokenIsVisible = false;
      toggleTokenVisibility.textContent = GZP_I18N.t('token.token_show');
    }
    renderTokenScopeStatus(mode, result[TOKEN_STORAGE_KEY], result[TOKEN_SCOPE_KEY]);

    // Only query rate limit if Token page is currently active
    const isTokenPageActive = document.getElementById('token').classList.contains('active');
    if (isTokenPageActive) {
      checkRateLimit();
    }
  } catch (error) {
    console.error('Failed to load token settings:', error);
    updateTokenStatus('Error loading token settings.', 'error');
  }
}

// ─── History Page Implementation ──────────────────────────────────────────────

const HISTORY_STORAGE_KEY = STORAGE.DOWNLOAD_HISTORY;
let downloadHistory = [];
let historyPageInitialized = false;
let statsPageInitialized = false;
const statsFilters = {
  timeRange: 'all',
  type: 'all',
  repo: 'all',
  branch: 'all',
  keyword: '',
  customStart: '',
  customEnd: ''
};

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

  // Get locale from current i18n setting for date formatting
  const locale = GZP_I18N && GZP_I18N.getCurrentLocale ?
    (GZP_I18N.getCurrentLocale() === 'zh-CN' ? 'zh-CN' : 'en-US') :
    'en-US';

  // Format weekday, month day, year (e.g., "Friday, March 27, 2026")
  const formatFullDate = (d) => {
    return d.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (normRecord.getTime() === normToday.getTime()) {
    return `${GZP_I18N.t('history.date_today')} - ${formatFullDate(recordDate)}`;
  } else if (normRecord.getTime() === normYesterday.getTime()) {
    return `${GZP_I18N.t('history.date_yesterday')} - ${formatFullDate(recordDate)}`;
  } else {
    return formatFullDate(recordDate);
  }
}

// Format time for display
function formatHistoryTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatHistoryFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return GZP_I18N.t('history.unknown_size');
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  const value = size >= 10 || idx === 0 ? Math.round(size) : size.toFixed(1);
  return `${value} ${units[idx]}`;
}

function classifyPathType(path) {
  const name = (path || '').split('/').pop() || '';
  if (!name) return 'folder';
  return name.includes('.') ? 'file' : 'folder';
}

function getRecordSizeBytes(record) {
  if (Array.isArray(record.fileDetails) && record.fileDetails.length > 0) {
    return record.fileDetails.reduce((sum, item) => {
      return sum + (Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0);
    }, 0);
  }
  return 0;
}

function aggregateStats(records) {
  const summary = {
    totalDownloads: records.length,
    totalFolderDownloads: 0,
    totalFileDownloads: 0,
    totalDownloadedFiles: 0,
    totalFilteredItems: 0,
    totalFilteredFolders: 0,
    totalFilteredFiles: 0,
    totalDownloadedBytes: 0,
    totalUniqueRepos: 0,
    averageFilesPerDownload: 0
  };

  const repoMap = new Map();
  const branchMap = new Map();

  records.forEach((record) => {
    const ts = Number(record.timestamp) || 0;
    const filesCount = Number(record.fileCount) || (Array.isArray(record.files) ? record.files.length : 0);
    const ignoredCount = Number(record.ignoredCount) || 0;
    const downloadedBytes = getRecordSizeBytes(record);
    const owner = record.owner || 'unknown';
    const repo = record.repo || 'Unknown repository';
    const branch = record.branch || 'main';
    const repoKey = `${owner}/${repo}`;
    const branchKey = `${owner}/${repo}#${branch}`;
    const recordType = record.type === 'file' ? 'file' : 'folder';

    summary.totalDownloadedFiles += filesCount;
    summary.totalFilteredItems += ignoredCount;
    summary.totalDownloadedBytes += downloadedBytes;
    if (recordType === 'file') summary.totalFileDownloads++;
    else summary.totalFolderDownloads++;

    if (Array.isArray(record.ignoredFiles)) {
      record.ignoredFiles.forEach((p) => {
        if (classifyPathType(p) === 'file') summary.totalFilteredFiles++;
        else summary.totalFilteredFolders++;
      });
    }

    if (!repoMap.has(repoKey)) {
      repoMap.set(repoKey, { repo: repoKey, downloads: 0, files: 0, filtered: 0, bytes: 0 });
    }
    const repoStats = repoMap.get(repoKey);
    repoStats.downloads++;
    repoStats.files += filesCount;
    repoStats.filtered += ignoredCount;
    repoStats.bytes += downloadedBytes;

    if (!branchMap.has(branchKey)) {
      branchMap.set(branchKey, { branch: branch, repo: repoKey, downloads: 0, files: 0, bytes: 0 });
    }
    const branchStats = branchMap.get(branchKey);
    branchStats.downloads++;
    branchStats.files += filesCount;
    branchStats.bytes += downloadedBytes;
  });

  summary.totalUniqueRepos = repoMap.size;
  summary.averageFilesPerDownload = summary.totalDownloads > 0
    ? (summary.totalDownloadedFiles / summary.totalDownloads)
    : 0;

  const topRepos = Array.from(repoMap.values()).sort((a, b) => b.downloads - a.downloads).slice(0, 10);
  const topBranches = Array.from(branchMap.values()).sort((a, b) => b.downloads - a.downloads).slice(0, 10);

  return { summary, topRepos, topBranches };
}

function filterHistoryRecords(records) {
  const now = Date.now();
  const timeMap = {
    today: now - 24 * 60 * 60 * 1000,
    '7d': now - 7 * 24 * 60 * 60 * 1000,
    '30d': now - 30 * 24 * 60 * 60 * 1000,
    '90d': now - 90 * 24 * 60 * 60 * 1000
  };
  const keyword = statsFilters.keyword.trim().toLowerCase();

  return records.filter((record) => {
    const ts = Number(record.timestamp) || 0;
    const owner = record.owner || 'unknown';
    const repo = record.repo || 'Unknown repository';
    const branch = record.branch || 'main';
    const type = record.type === 'file' ? 'file' : 'folder';
    const repoKey = `${owner}/${repo}`;
    const path = (record.path || '').toLowerCase();
    const downloadName = (record.downloadName || record.filename || '').toLowerCase();

    if (statsFilters.timeRange !== 'all') {
      if (statsFilters.timeRange === 'custom') {
        if (statsFilters.customStart) {
          const startTs = new Date(`${statsFilters.customStart}T00:00:00`).getTime();
          if (Number.isFinite(startTs) && ts < startTs) return false;
        }
        if (statsFilters.customEnd) {
          const endTs = new Date(`${statsFilters.customEnd}T23:59:59.999`).getTime();
          if (Number.isFinite(endTs) && ts > endTs) return false;
        }
      } else {
        const threshold = timeMap[statsFilters.timeRange];
        if (threshold && ts < threshold) return false;
      }
    }
    if (statsFilters.type !== 'all' && type !== statsFilters.type) return false;
    if (statsFilters.repo !== 'all' && repoKey !== statsFilters.repo) return false;
    if (statsFilters.branch !== 'all' && branch !== statsFilters.branch) return false;
    if (keyword && !(`${repoKey} ${branch} ${path} ${downloadName}`).toLowerCase().includes(keyword)) return false;

    return true;
  });
}

function renderStatsFilterOptions() {
  if (!statsRepoFilter || !statsBranchFilter) return;
  const repoSet = new Set();
  const branchSet = new Set();
  downloadHistory.forEach((record) => {
    repoSet.add(`${record.owner || 'unknown'}/${record.repo || 'Unknown repository'}`);
    branchSet.add(record.branch || 'main');
  });

  const repoOptions = [`<option value="all">${GZP_I18N.t('stats.repo_all')}</option>`]
    .concat(Array.from(repoSet).sort().map(v => `<option value="${v}">${v}</option>`));
  const branchOptions = [`<option value="all">${GZP_I18N.t('stats.branch_all')}</option>`]
    .concat(Array.from(branchSet).sort().map(v => `<option value="${v}">${v}</option>`));

  statsRepoFilter.innerHTML = repoOptions.join('');
  statsBranchFilter.innerHTML = branchOptions.join('');

  if (!repoSet.has(statsFilters.repo)) statsFilters.repo = 'all';
  if (!branchSet.has(statsFilters.branch)) statsFilters.branch = 'all';
  statsRepoFilter.value = statsFilters.repo;
  statsBranchFilter.value = statsFilters.branch;
}

function renderTable(headers, rows) {
  if (!rows || rows.length === 0) {
    return `<div class="stats-empty">${GZP_I18N.t('stats.no_data')}</div>`;
  }
  return `
    <table class="stats-table">
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function renderStats() {
  if (!statsOverviewGrid || !statsRepoDimensions || !statsBranchDimensions) {
    return;
  }

  const filteredRecords = filterHistoryRecords(downloadHistory);
  const { summary, topRepos, topBranches } = aggregateStats(filteredRecords);
  const t = (key) => GZP_I18N.t(key);
  const overviewItems = [
    [t('stats.kpi_total_downloads'), summary.totalDownloads.toLocaleString()],
    [t('stats.kpi_folder_downloads'), summary.totalFolderDownloads.toLocaleString()],
    [t('stats.kpi_file_downloads'), summary.totalFileDownloads.toLocaleString()],
    [t('stats.kpi_downloaded_files'), summary.totalDownloadedFiles.toLocaleString()],
    [t('stats.kpi_filtered_items'), summary.totalFilteredItems.toLocaleString()],
    [t('stats.kpi_filtered_folders'), summary.totalFilteredFolders.toLocaleString()],
    [t('stats.kpi_filtered_files'), summary.totalFilteredFiles.toLocaleString()],
    [t('stats.kpi_total_size'), formatHistoryFileSize(summary.totalDownloadedBytes)],
    [t('stats.kpi_unique_repos'), summary.totalUniqueRepos.toLocaleString()],
    [t('stats.kpi_avg_files'), summary.averageFilesPerDownload.toFixed(1)]
  ];

  statsOverviewGrid.innerHTML = overviewItems.map(([label, value]) => `
    <div class="stats-kpi">
      <div class="stats-kpi-label">${label}</div>
      <div class="stats-kpi-value">${value}</div>
      <div class="stats-kpi-subtle">${t('stats.calculated_from')}</div>
    </div>
  `).join('');

  statsRepoDimensions.innerHTML = renderTable(
    [t('stats.table_repo'), t('stats.table_downloads'), t('stats.table_files'), t('stats.table_filtered'), t('stats.table_size')],
    topRepos.map((item) => [
      item.repo,
      item.downloads.toLocaleString(),
      item.files.toLocaleString(),
      item.filtered.toLocaleString(),
      formatHistoryFileSize(item.bytes)
    ])
  );

  statsBranchDimensions.innerHTML = renderTable(
    [t('stats.table_branch'), t('stats.table_repo'), t('stats.table_downloads'), t('stats.table_files'), t('stats.table_size')],
    topBranches.map((item) => [
      item.branch,
      item.repo,
      item.downloads.toLocaleString(),
      item.files.toLocaleString(),
      formatHistoryFileSize(item.bytes)
    ])
  );

  if (statsFilterSummary) {
    statsFilterSummary.textContent = t('stats.showing_records').replace('{count}', filteredRecords.length).replace('{total}', downloadHistory.length);
  }
}

function attachStatsFilterListeners() {
  if (!statsTimeRange || !statsTypeFilter || !statsRepoFilter || !statsBranchFilter || !statsKeywordFilter || !statsResetFilters || !statsCustomRange || !statsStartDate || !statsEndDate) {
    return;
  }
  if (statsTimeRange.dataset.bound === '1') return;

  const syncCustomRangeVisibility = () => {
    const isCustom = statsTimeRange.value === 'custom';
    statsCustomRange.classList.toggle('active', isCustom);
  };

  const onChange = () => {
    statsFilters.timeRange = statsTimeRange.value;
    statsFilters.type = statsTypeFilter.value;
    statsFilters.repo = statsRepoFilter.value;
    statsFilters.branch = statsBranchFilter.value;
    statsFilters.keyword = statsKeywordFilter.value;
    statsFilters.customStart = statsStartDate.value;
    statsFilters.customEnd = statsEndDate.value;
    syncCustomRangeVisibility();
    renderStats();
  };

  statsTimeRange.addEventListener('change', onChange);
  statsTypeFilter.addEventListener('change', onChange);
  statsRepoFilter.addEventListener('change', onChange);
  statsBranchFilter.addEventListener('change', onChange);
  statsKeywordFilter.addEventListener('input', onChange);
  statsStartDate.addEventListener('change', onChange);
  statsEndDate.addEventListener('change', onChange);
  statsResetFilters.addEventListener('click', () => {
    statsFilters.timeRange = 'all';
    statsFilters.type = 'all';
    statsFilters.repo = 'all';
    statsFilters.branch = 'all';
    statsFilters.keyword = '';
    statsFilters.customStart = '';
    statsFilters.customEnd = '';
    statsTimeRange.value = 'all';
    statsTypeFilter.value = 'all';
    statsRepoFilter.value = 'all';
    statsBranchFilter.value = 'all';
    statsKeywordFilter.value = '';
    statsStartDate.value = '';
    statsEndDate.value = '';
    syncCustomRangeVisibility();
    renderStats();
  });

  syncCustomRangeVisibility();
  statsTimeRange.dataset.bound = '1';
}

async function initStatsPage() {
  if (!statsPageInitialized) {
    await loadHistory();
    statsPageInitialized = true;
    attachStatsFilterListeners();
  }
  renderStatsFilterOptions();
  renderStats();
}

function getHistoryTypeInfo(record) {
  const rawType = record && record.type === 'file' ? 'file' : 'folder';
  return rawType === 'file'
    ? { type: 'file', label: GZP_I18N.t('history.type_file'), icon: '📄' }
    : { type: 'folder', label: GZP_I18N.t('history.type_folder'), icon: '📁' };
}

function buildHistoryTargetUrl(record) {
  const ownerName = record.owner || 'unknown';
  const repoName = record.repo || 'Unknown repository';
  const branchName = record.branch || 'main';
  const path = (record.path || '').replace(/^\/+|\/+$/g, '');
  const typeInfo = getHistoryTypeInfo(record);

  const base = `${URLS.GITHUB_BASE}/${ownerName}/${repoName}`;
  if (!path) {
    return `${base}/tree/${encodeURIComponent(branchName)}`;
  }

  if (typeInfo.type === 'file') {
    const folderPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    return folderPath
      ? `${base}/tree/${encodeURIComponent(branchName)}/${folderPath}`
      : `${base}/tree/${encodeURIComponent(branchName)}`;
  }

  return `${base}/tree/${encodeURIComponent(branchName)}/${path}`;
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
  if (statsPageInitialized) {
    renderStatsFilterOptions();
    renderStats();
  }
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
  if (statsPageInitialized) {
    renderStatsFilterOptions();
    renderStats();
  }
}

/**
 * Clear all history records
 */
async function clearAllHistory() {
  if (downloadHistory.length === 0 || !confirm(GZP_I18N.t('history.clear_confirm'))) {
    return;
  }

  downloadHistory = [];
  await saveHistory();
  renderHistory();
  if (statsPageInitialized) {
    renderStatsFilterOptions();
    renderStats();
  }
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
        <h3>${GZP_I18N.t('history.empty_title')}</h3>
        <p>${GZP_I18N.t('history.empty_desc')}</p>
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
      const fileDetails = Array.isArray(record.fileDetails) ? record.fileDetails : [];
      const typeInfo = getHistoryTypeInfo(record);
      const targetUrl = buildHistoryTargetUrl(record);

      const filesLabel = filesCount === 1 ? GZP_I18N.t('history.file') : GZP_I18N.t('history.files');
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
                <span class="history-record-type-badge ${typeInfo.type}" title="Download source type">${typeInfo.icon} ${typeInfo.label}</span>
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
                  <span>${filesCount} ${filesLabel}</span>
                  ${ignoredCount > 0 ? `<span style="margin-left: 6px; color: var(--text-scnd); font-size: 11px;">${GZP_I18N.t('history.filtered_out', { count: ignoredCount })}</span>` : ''}
                </div>
                  <a class="history-open-link" href="${targetUrl}" target="_blank" rel="noopener noreferrer" title="${GZP_I18N.t('history.open_in_github')}">
                  ${GZP_I18N.t('history.open_in_github')}
                </a>
              </div>
            </div>
            <div class="history-record-expand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div class="history-record-details">
            <div><strong>${GZP_I18N.t('history.detail_repository')}</strong> ${ownerName}/${repoName}</div>
            <div><strong>${GZP_I18N.t('history.detail_branch')}</strong> ${branchName}</div>
            <div><strong>${GZP_I18N.t('history.detail_type')}</strong> ${typeInfo.label}</div>
            ${path ? `<div><strong>${GZP_I18N.t('history.detail_path')}</strong> ${path}</div>` : ''}
            <div><strong>${GZP_I18N.t('history.detail_source_url')}</strong> <a class="history-open-link" href="${targetUrl}" target="_blank" rel="noopener noreferrer">${GZP_I18N.t('history.open_in_github')}</a></div>
            ${downloadName ? `<div><strong>${GZP_I18N.t('history.detail_downloaded_as')}</strong> ${downloadName}</div>` : ''}
            ${filesCount > 0 ? `
              <div style="margin-top: 8px;"><strong>${GZP_I18N.t('history.detail_files_count', { count: filesCount })}</strong></div>
              <div class="history-file-list">
                ${fileDetails.length > 0
            ? fileDetails.slice(0, 20).map(item => `
                      <div class="history-file-item">
                        <span>${item.path}</span>
                        <span style="margin-left: 8px; color: var(--text-scnd);">(${formatHistoryFileSize(item.sizeBytes)})</span>
                      </div>
                    `).join('')
            : (record.files && record.files.slice(0, 20).map(file => `<div class="history-file-item"><span>${file}</span><span style="margin-left: 8px; color: var(--text-scnd);">(${GZP_I18N.t('history.unknown_size')})</span></div>`).join('') || '')
          }
                ${filesCount > 20 ? `<div class="history-file-item">${GZP_I18N.t('history.and_more', { count: filesCount - 20 })}</div>` : ''}
              </div>
            ` : ''}
            ${ignoredCount > 0 ? `
              <div style="margin-top: 8px;">
                <strong>${GZP_I18N.t('history.filtered_out_label')}</strong> ${GZP_I18N.t('history.filtered_out_desc', { count: ignoredCount })}
                ${record.ignoredFiles && record.ignoredFiles.length > 0 ? `
                  <div style="margin-top: 4px; font-size: 12px;">
                    <strong>${GZP_I18N.t('history.filtered_files_label')}</strong>
                    <div class="history-file-list" style="margin-top: 4px;">
                      ${record.ignoredFiles.slice(0, 10).map(file => `<div class="history-file-item">${file}</div>`).join('')}
                      ${record.ignoredFiles.length > 10 ? `<div class="history-file-item">${GZP_I18N.t('history.and_more', { count: record.ignoredFiles.length - 10 })}</div>` : ''}
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
      if (
        e.target.type === 'checkbox' ||
        e.target.closest('.history-record-checkbox') ||
        e.target.closest('.history-open-link')
      ) {
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
      // Background.js now saves history to storage directly.
      // Reload from storage to stay in sync (avoids duplicate saves).
      if (historyPageInitialized || statsPageInitialized) {
        loadHistory().then(() => {
          renderHistory();
          if (statsPageInitialized) {
            renderStatsFilterOptions();
            renderStats();
          }
        });
      }
    }
  });

  // Check if we're already on the history tab
  const activeMenuItem = document.querySelector('.menu-item.active');
  if (activeMenuItem && activeMenuItem.getAttribute('data-target') === 'history') {
    initHistoryPage();
    historyPageInitialized = true;
  } else if (activeMenuItem && activeMenuItem.getAttribute('data-target') === 'stats') {
    initStatsPage();
  }
});

// ─── About Page Implementation ─────────────────────────────────────────────────

// About page elements
const currentVersion = document.getElementById('currentVersion');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const updateStatusRow = document.getElementById('updateStatusRow');
const updateStatusText = document.getElementById('updateStatusText');
const reportIssueBtn = document.getElementById('reportIssueBtn');
const rateUsBtn = document.getElementById('rateUsBtn');
const starGithubBtn = document.getElementById('starGithubBtn');

// Constants
const GITHUB_REPO_URL = URLS.REPO;
const CHROME_EXTENSION_ID = C.CHROME_WEBSTORE.EXTENSION_ID;
const CHROME_WEBSTORE_URL = C.CHROME_WEBSTORE.URL;

// Set current version on page load
document.addEventListener('DOMContentLoaded', () => {
  if (chrome.runtime && chrome.runtime.getManifest) {
    currentVersion.textContent = 'v' + chrome.runtime.getManifest().version;
  }
});

// Check for updates
checkUpdateBtn.addEventListener('click', async () => {
  checkUpdateBtn.disabled = true;
  checkUpdateBtn.textContent = GZP_I18N.t('about.checking_updates');
  updateStatusRow.style.display = 'flex';
  updateStatusText.textContent = GZP_I18N.t('about.loading');

  try {
    if (chrome.runtime && chrome.runtime.requestUpdateCheck) {
      chrome.runtime.requestUpdateCheck((status, details) => {
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = GZP_I18N.t('about.check_updates');

        if (status === 'update_available') {
          updateStatusText.textContent = GZP_I18N.t('about.update_available').replace('{version}', details.version);
          updateStatusText.style.color = '#0b8043';

          // Chrome will automatically download and install the update
          chrome.runtime.onUpdateAvailable.addListener(() => {
            updateStatusText.textContent = GZP_I18N.t('about.update_downloaded');
          });
        } else if (status === 'no_update') {
          updateStatusText.textContent = GZP_I18N.t('about.latest_version');
          updateStatusText.style.color = 'var(--text-scnd)';
        } else if (status === 'throttled') {
          updateStatusText.textContent = GZP_I18N.t('about.update_throttled');
          updateStatusText.style.color = '#f29900';
        }
      });
    } else {
      updateStatusText.textContent = GZP_I18N.t('about.update_dev_mode');
      updateStatusText.style.color = 'var(--text-scnd)';
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = GZP_I18N.t('about.check_updates');
    }
  } catch (error) {
    updateStatusText.textContent = GZP_I18N.t('about.update_error').replace('{message}', error.message);
    updateStatusText.style.color = '#d93025';
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.textContent = GZP_I18N.t('about.check_updates');
  }
});

// Report issue button
reportIssueBtn.addEventListener('click', () => {
  window.open(`${GITHUB_REPO_URL}/issues/new`, '_blank');
});

// Rate us button
rateUsBtn.addEventListener('click', () => {
  window.open(CHROME_WEBSTORE_URL, '_blank');
});

// Star on GitHub button
starGithubBtn.addEventListener('click', () => {
  window.open(GITHUB_REPO_URL, '_blank');
});

// ─── Welcome Modal for First-Time Users ──────────────────────────────────────

/**
 * Check if we should show the welcome modal for first-time users
 */
async function checkAndShowWelcomeModal() {
  try {
    // Check if we should show welcome modal
    const result = await chrome.storage.sync.get(['gitzip-pro-show-welcome']);
    const shouldShowWelcome = result['gitzip-pro-show-welcome'] === true;

    if (shouldShowWelcome) {
      // Remove the flag so modal only shows once
      await chrome.storage.sync.remove(['gitzip-pro-show-welcome']);

      // Navigate to token page
      activateMenu('token');
      window.location.hash = 'token';

      // Show modal after a short delay to ensure page is loaded
      setTimeout(() => {
        showWelcomeModal();
      }, 500);
    }
  } catch (error) {
    console.error('Error checking welcome modal:', error);
  }
}

/**
 * Show the welcome modal
 */
function showWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (!modal) return;

  modal.style.display = 'flex';

  // Add event listeners
  const closeBtn = document.getElementById('welcomeModalClose');
  const learnMoreBtn = document.getElementById('welcomeModalLearnMore');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeWelcomeModal();
      // Start flashing the token dropdown
      flashTokenDropdown();
    });
  }

  if (learnMoreBtn) {
    learnMoreBtn.addEventListener('click', () => {
      // Open GitHub documentation about personal access tokens
      window.open('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens', '_blank');
    });
  }

  // Close modal when clicking on overlay
  const overlay = modal.querySelector('.welcome-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      closeWelcomeModal();
      flashTokenDropdown();
    });
  }
}

/**
 * Close the welcome modal
 */
function closeWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Make the token dropdown flash to draw attention
 */
function flashTokenDropdown() {
  const tokenDropdown = document.getElementById('tokenAccessMode');
  if (!tokenDropdown) return;

  // Add flashing animation class
  tokenDropdown.classList.add('token-dropdown-flash');

  // Scroll to token dropdown if needed
  tokenDropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Remove animation class after it completes (3 cycles * 1s each = 3s)
  setTimeout(() => {
    tokenDropdown.classList.remove('token-dropdown-flash');
  }, 3000);
}
