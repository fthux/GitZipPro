/**
 * GitZip Pro - background.js (Service Worker)
 *
 * Handles messages from content scripts that need privileged APIs
 * (e.g. chrome.downloads) which are unavailable in content script context.
 *
 * Message protocol:
 *   Request:  { type: 'GZP_DOWNLOAD_FILE', filename: string, base64: string, mimeType?: string }
 *   Response: { ok: true, downloadId: number } | { ok: false, error: string }
 */

importScripts('constants.js');
importScripts('i18n.js');
const { STORAGE_KEYS } = globalThis.GZP_CONSTANTS;
const MENU_IDS = {
  ROOT: 'gitzip-pro-download',
  CHECKED: 'gitzip-pro-checked-items',
  SEPARATOR: 'gitzip-pro-separator',
  SELECTED: 'gitzip-pro-selected-item'
};

const activeDownloads = new Map();

// Context menu state
let selectedItemHref = null;

// Default locale for background notifications (loaded asynchronously)
let backgroundTranslations = {};
let backgroundLocale = 'en';

// Load translations for background
async function initBackgroundI18n() {
  const locale = await GZP_I18N.init();
  backgroundLocale = locale;
  backgroundTranslations = await GZP_I18N.loadLocale(locale);
  ensureContextMenus();
}
initBackgroundI18n();

// Listen for locale changes from options page
chrome.storage.onChanged.addListener((changes) => {
  const localeKey = STORAGE_KEYS.LANGUAGE;
  if (changes[localeKey]) {
    const newLocale = changes[localeKey].newValue;
    backgroundLocale = newLocale;
    GZP_I18N.loadLocale(newLocale).then(translations => {
      backgroundTranslations = translations;
      ensureContextMenus();
    });
  }
});

// Helper to translate a key in background context
function t(key, vars) {
  const parts = key.split('.');
  let value = backgroundTranslations;
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

/** Ensure context menus exist with current translations. Create if missing, update if present. */
function ensureContextMenus() {
  try {
    // Try to update first (menus already exist from a previous session)
    chrome.contextMenus.update(MENU_IDS.ROOT, { title: t('context_menu.root') }, () => {
      if (chrome.runtime.lastError) {
        // Menu doesn't exist yet — create them now with translations loaded
        createContextMenus();
        return;
      }
      // Update the remaining menus
      chrome.contextMenus.update(MENU_IDS.CHECKED, { title: t('context_menu.checked_items') });
      chrome.contextMenus.update(MENU_IDS.SELECTED, { title: t('context_menu.selected_item', { name: '(none)' }) });
    });
  } catch (e) {
    // Fallback: create them
    createContextMenus();
  }
}

function createContextMenus() {
  chrome.contextMenus.create({
    id: MENU_IDS.ROOT,
    title: t('context_menu.root'),
    contexts: ['page', 'link', 'selection']
  });
  chrome.contextMenus.create({
    id: MENU_IDS.CHECKED,
    parentId: MENU_IDS.ROOT,
    title: t('context_menu.checked_items'),
    contexts: ['page', 'link', 'selection'],
    enabled: false
  });
  chrome.contextMenus.create({
    id: MENU_IDS.SEPARATOR,
    parentId: MENU_IDS.ROOT,
    type: 'separator',
    contexts: ['page', 'link', 'selection']
  });
  chrome.contextMenus.create({
    id: MENU_IDS.SELECTED,
    parentId: MENU_IDS.ROOT,
    title: t('context_menu.selected_item', { name: '(none)' }),
    contexts: ['page', 'link', 'selection']
  });
}

// Create context menu on installation
chrome.runtime.onInstalled.addListener((details) => {
  // Menus are created by ensureContextMenus() once translations load.
  // On install/update, we also need to wait for translations to be ready.
  // Since initBackgroundI18n() runs asynchronously on worker start,
  // and contextMenus.create can be called multiple times safely,
  // we just need to ensure context menus are created. ensureContextMenus()
  // will handle both creation and updating after translations are ready.

  // If translations are already loaded (unlikely at this point), create now
  if (backgroundTranslations && Object.keys(backgroundTranslations).length > 0) {
    createContextMenus();
  }
  // Otherwise, ensureContextMenus() called from initBackgroundI18n()
  // will handle creation once translations are ready.

  // Check if this is a fresh install (not an update)
  if (details.reason === 'install') {
    // Set a flag to show welcome modal
    chrome.storage.local.set({
      'gitzip-pro-show-welcome': true
    }, () => {
      // Open options page to token section
      chrome.runtime.openOptionsPage(() => {
        // Add hash to navigate directly to token page
        // This will be handled by the options page itself
      });
    });
  }
});



// Update context menu when receiving right-click info from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle download file messages
  if (message.type === 'GZP_DOWNLOAD_FILE') {
    const { filename, base64, mimeType = 'application/octet-stream', notifyShow, notifyOpen, historyRecord } = message;

    (async () => {
      try {
        let safeFilename = filename;
        // chrome.downloads strictly forbids any path segment starting with a dot or tilde
        safeFilename = safeFilename.replace(/(^|\/)[.~]/g, '$1_');

        const dataUrl = `data:${mimeType};base64,${base64}`;
        chrome.downloads.download({ url: dataUrl, filename: safeFilename, saveAs: false }, (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            if (notifyShow || notifyOpen) {
              // Store filename and history record along with notification preferences
              activeDownloads.set(downloadId, { notifyShow, notifyOpen, filename, historyRecord });
            }
            sendResponse({ ok: true, downloadId });
          }
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();

    return true;
  }

  // Handle context menu update messages
  if (message.type === 'GZP_UPDATE_CONTEXT_MENU') {
    const { href, itemName, itemType } = message;
    selectedItemHref = href;

    // Update the context menu title based on item type
    const displayName = itemName || (href ? href.split('/').pop() : 'unknown');
    let menuTitle;
    if (itemType === 'file') {
      menuTitle = t('context_menu.selected_file', { name: displayName });
    } else if (itemType === 'folder') {
      menuTitle = t('context_menu.selected_folder', { name: displayName });
    } else {
      // Fallback for unknown type
      menuTitle = t('context_menu.selected_item', { name: displayName });
    }

    chrome.contextMenus.update(MENU_IDS.SELECTED, {
      title: menuTitle
    });

    sendResponse({ ok: true });
    return true;
  }

  // Handle error notification messages
  if (message.type === 'GZP_SHOW_ERROR_NOTIFICATION') {
    const { message: errorMessage } = message;

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: t('notifications.download_failed_title'),
        message: errorMessage,
        priority: 2
      }, (err) => {
        if (chrome.runtime.lastError) {
          // Fallback with data URI icon
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            title: t('notifications.download_failed_title'),
            message: errorMessage,
            priority: 2
          });
        }
      });
    } catch (e) {
      console.warn('[GitZip Pro] Failed to show error notification', e);
    }

    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_IDS.SELECTED && selectedItemHref) {
    // Send message to content script to download the selected item
    chrome.tabs.sendMessage(tab.id, {
      type: 'GZP_DOWNLOAD_CONTEXT_ITEM',
      href: selectedItemHref
    });
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.id && activeDownloads.has(delta.id)) {
    if (delta.state && delta.state.current === 'complete') {
      const prefs = activeDownloads.get(delta.id);
      activeDownloads.delete(delta.id);

      if (prefs.notifyShow) {
        try {
          // Attempt notification. Requires iconUrl, gracefully fails if missing template icon
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'GitZip Pro',
            message: t('notifications.download_complete_msg')
          }, (err) => {
            if (chrome.runtime.lastError) {
              // Fallback to data URI if local resource fails
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                title: 'GitZip Pro',
                message: t('notifications.download_complete_msg')
              });
            }
          });
        } catch (e) {
          console.warn('[GitZip Pro] Failed to show OS notification', e);
        }
      }

      if (prefs.notifyOpen) {
        try {
          chrome.downloads.show(delta.id);
        } catch (e) {
          console.warn('[GitZip Pro] Failed to open folder', e);
        }
      }

      // Save history record to storage AND notify options page for live UI update
      (async () => {
        try {
          // Use the full history record sent from downloader.js if available
          const record = prefs.historyRecord || {
            timestamp: Date.now(),
            downloadName: prefs.filename || 'download.zip',
            owner: 'unknown',
            repo: 'Unknown repository',
            branch: 'main',
            fileCount: 0,
            files: []
          };

          // Ensure record has required fields
          if (!record.timestamp) record.timestamp = Date.now();
          if (!record.downloadName) record.downloadName = prefs.filename || 'download.zip';
          if (!record.id) record.id = 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

          // Save to storage first, then notify (await ensures write completes before message)
          await saveHistoryRecord(record);

          // Notify options page for live UI update (best-effort, may fail if page is closed)
          chrome.runtime.sendMessage({
            type: 'GZP_DOWNLOAD_COMPLETE',
            record: record
          }).catch(() => {
            // Options page not open — no problem, storage was already saved above
          });
        } catch (e) {
          console.warn('[GitZip Pro] Failed to save history record', e);
        }
      })();
    } else if (delta.state && delta.state.current === 'interrupted') {
      activeDownloads.delete(delta.id);
    }
  }
});

/**
 * Save a history record directly to chrome.storage.local.
 * This ensures history is persisted regardless of whether the options page is open.
 */
function saveHistoryRecord(record) {
  return new Promise((resolve) => {
    const HISTORY_STORAGE_KEY = STORAGE_KEYS.DOWNLOAD_HISTORY;
    const MAX_RECORDS = 100;

    chrome.storage.local.get([HISTORY_STORAGE_KEY], (res) => {
      let history = Array.isArray(res[HISTORY_STORAGE_KEY]) ? res[HISTORY_STORAGE_KEY] : [];

      // Avoid duplicate records (same id)
      if (record.id && history.some((r) => r.id === record.id)) {
        resolve();
        return;
      }

      history.unshift(record);

      // Keep only the most recent records
      if (history.length > MAX_RECORDS) {
        history = history.slice(0, MAX_RECORDS);
      }

      chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: history }, () => {
        resolve();
      });
    });
  });
}
