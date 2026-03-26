/**
 * GitZip Pro - options.js
 * Handles UI interactions and saves/loads settings from chrome.storage.
 */

// ─── Elements ─────────────────────────────────────────────────────────────────

const themeSelect    = document.getElementById('themeSelect');
const buttonPositionSelect = document.getElementById('buttonPositionSelect');
const versionDisplay = document.getElementById('versionDisplay');

// Download page elements
const namingPreset = document.getElementById('namingPreset');
const namingCustom = document.getElementById('namingCustom');
const notifyShow   = document.getElementById('notifyShow');
const notifySound  = document.getElementById('notifySound');
const notifyOpen   = document.getElementById('notifyOpen');

// ─── Version ──────────────────────────────────────────────────────────────────

if (chrome.runtime && chrome.runtime.getManifest) {
  versionDisplay.textContent = 'v' + chrome.runtime.getManifest().version;
}

// ─── Menu Navigation ──────────────────────────────────────────────────────────

const menuItems = document.querySelectorAll('.menu-item');
const pages     = document.querySelectorAll('.page');

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    menuItems.forEach(m => m.classList.remove('active'));
    item.classList.add('active');

    pages.forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(item.getAttribute('data-target'));
    if (targetPage) targetPage.classList.add('active');
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
    notifyShow.checked  = res.gzpNotifyShow  !== false;
    notifySound.checked = res.gzpNotifySound !== false;
    notifyOpen.checked  = res.gzpNotifyOpen  === true;

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
