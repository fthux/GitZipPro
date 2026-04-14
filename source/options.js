/**
 * GitZip Pro - options.js
 * Handles UI interactions and saves/loads settings from chrome.storage.
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const themeSelect = document.getElementById('themeSelect');
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
  [STORAGE.THEME, STORAGE.ACCENT_COLOR, STORAGE.BUTTON_POSITION, STORAGE.SHOW_FILE_SIZES, STORAGE.DOUBLE_CLICK_SELECT, STORAGE.NAMING_PRESET, STORAGE.NAMING_CUSTOM, STORAGE.NOTIFY_SHOW, STORAGE.NOTIFY_SOUND, STORAGE.NOTIFY_OPEN, STORAGE.IGNORE_LABELS, STORAGE.IGNORE_CUSTOM_VARS, STORAGE.GITHUB_TOKEN, STORAGE.TOKEN_ACCESS_MODE],
  (res) => {
    // Theme
    const savedTheme = res[STORAGE.THEME] || DEFAULTS.THEME;
    themeSelect.value = savedTheme;
    applyTheme(savedTheme);

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

// Token visibility states
let tokenIsVisible = false;
let saveTokenDebounceTimer = null;

// Toggle token visibility
toggleTokenVisibility.addEventListener('click', () => {
  tokenIsVisible = !tokenIsVisible;
  githubToken.type = tokenIsVisible ? 'text' : 'password';
  toggleTokenVisibility.textContent = tokenIsVisible ? 'Hide' : 'Show';
});

// Auto save token on input with debounce
githubToken.addEventListener('input', () => {
  clearTimeout(saveTokenDebounceTimer);
  saveTokenDebounceTimer = setTimeout(async () => {
    const token = githubToken.value.trim();

    if (token && token.length > 0) {
      await chrome.storage.sync.set({ [TOKEN_STORAGE_KEY]: token });
      await checkRateLimit();
    } else {
      await chrome.storage.sync.remove(TOKEN_STORAGE_KEY);
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
      copyToken.textContent = 'Copied!';
      setTimeout(() => {
        copyToken.textContent = 'Copy';
      }, 1500);

      // Show system notification using Chrome extension API
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Token Copied',
        message: 'GitHub Personal Access Token copied to clipboard successfully.'
      });

    } catch (e) {
      console.error('Failed to copy token:', e);

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Copy Failed',
        message: 'Failed to copy token to clipboard. Please try again.'
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
  } else {
    anonymousWarning.style.display = 'none';

    // Restore saved token when switching back to custom mode
    chrome.storage.sync.get([TOKEN_STORAGE_KEY], (result) => {
      if (result[TOKEN_STORAGE_KEY]) {
        githubToken.value = result[TOKEN_STORAGE_KEY];
        githubToken.type = 'password';
        tokenIsVisible = false;
        toggleTokenVisibility.textContent = 'Show';
      }
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

    authorizePublicBtn.textContent = 'Authorizing...';
    authorizePrivateBtn.textContent = 'Authorizing...';

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
      await chrome.storage.sync.set({ [TOKEN_STORAGE_KEY]: authResult.accessToken });

      // Update UI
      githubToken.value = authResult.accessToken.substring(0, 4) + '•'.repeat(Math.min(authResult.accessToken.length - 8, 12)) + authResult.accessToken.substring(authResult.accessToken.length - 4);
      githubToken.type = 'password';
      tokenIsVisible = false;
      toggleTokenVisibility.textContent = 'Show';

      const tokenType = authResult.tokenType === 'private' ? 'Public + Private Repos' : 'Public Repos Only';
      // Show authorization success message directly in rate limit status area
      rateLimitStatus.textContent = `✅ Authorization successful! Granted access for ${tokenType}`;

      // Delay rate limit refresh to ensure Chrome Storage has been updated
      setTimeout(() => checkRateLimit(), 100);
    }

  } catch (error) {
    console.error('OAuth authorization error:', error);
    rateLimitStatus.textContent = '❌ Authorization failed: ' + error.message;
  } finally {
    // Re-enable buttons
    authorizePublicBtn.disabled = false;
    authorizePrivateBtn.disabled = false;
    authorizePublicBtn.textContent = 'Authorize for Public Repos';
    authorizePrivateBtn.textContent = 'Authorize for Public + Private Repos';
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
    // Set loading state immediately to avoid empty display
    rateLimitStatus.textContent = 'Checking rate limit...';

    const result = await chrome.storage.sync.get([TOKEN_STORAGE_KEY, TOKEN_MODE_KEY]);

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
      toggleTokenVisibility.textContent = 'Show';
    }

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

function getHistoryTypeInfo(record) {
  const rawType = record && record.type === 'file' ? 'file' : 'folder';
  return rawType === 'file'
    ? { type: 'file', label: 'File', icon: '📄' }
    : { type: 'folder', label: 'Folder', icon: '📁' };
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
      const typeInfo = getHistoryTypeInfo(record);
      const targetUrl = buildHistoryTargetUrl(record);

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
                  <span>${filesCount} ${filesCount === 1 ? 'file' : 'files'}</span>
                  ${ignoredCount > 0 ? `<span style="margin-left: 6px; color: var(--text-scnd); font-size: 11px;">(${ignoredCount} filtered out)</span>` : ''}
                </div>
                <a class="history-open-link" href="${targetUrl}" target="_blank" rel="noopener noreferrer" title="Open source location on GitHub">
                  Open in GitHub
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
            <div><strong>Repository:</strong> ${ownerName}/${repoName}</div>
            <div><strong>Branch:</strong> ${branchName}</div>
            <div><strong>Type:</strong> ${typeInfo.label}</div>
            ${path ? `<div><strong>Path:</strong> ${path}</div>` : ''}
            <div><strong>Source URL:</strong> <a class="history-open-link" href="${targetUrl}" target="_blank" rel="noopener noreferrer">Open in GitHub</a></div>
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
  checkUpdateBtn.textContent = 'Checking...';
  updateStatusRow.style.display = 'flex';
  updateStatusText.textContent = 'Checking for updates...';

  try {
    if (chrome.runtime && chrome.runtime.requestUpdateCheck) {
      chrome.runtime.requestUpdateCheck((status, details) => {
        checkUpdateBtn.disabled = false;
        checkUpdateBtn.textContent = 'Check for Updates';

        if (status === 'update_available') {
          updateStatusText.textContent = `New version ${details.version} available! Downloading update...`;
          updateStatusText.style.color = '#0b8043';

          // Chrome will automatically download and install the update
          chrome.runtime.onUpdateAvailable.addListener(() => {
            updateStatusText.textContent = 'Update downloaded. The extension will be updated on next browser restart.';
          });
        } else if (status === 'no_update') {
          updateStatusText.textContent = 'You are using the latest version.';
          updateStatusText.style.color = 'var(--text-scnd)';
        } else if (status === 'throttled') {
          updateStatusText.textContent = 'Update check throttled. Please try again later.';
          updateStatusText.style.color = '#f29900';
        }
      });
    } else {
      updateStatusText.textContent = 'Update API not available in development mode.';
      updateStatusText.style.color = 'var(--text-scnd)';
      checkUpdateBtn.disabled = false;
      checkUpdateBtn.textContent = 'Check for Updates';
    }
  } catch (error) {
    updateStatusText.textContent = `Error checking updates: ${error.message}`;
    updateStatusText.style.color = '#d93025';
    checkUpdateBtn.disabled = false;
    checkUpdateBtn.textContent = 'Check for Updates';
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
