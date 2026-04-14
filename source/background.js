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
const MENU_IDS = {
  ROOT: 'gitzip-pro-download',
  CHECKED: 'gitzip-pro-checked-items',
  SEPARATOR: 'gitzip-pro-separator',
  SELECTED: 'gitzip-pro-selected-item'
};

const activeDownloads = new Map();

// Context menu state
let selectedItemHref = null;

// Create context menu on installation
chrome.runtime.onInstalled.addListener((details) => {
  // Create parent menu item
  chrome.contextMenus.create({
    id: MENU_IDS.ROOT,
    title: 'GitZip Pro Download',
    contexts: ['page', 'link', 'selection']
  });

  // Create disabled "Checked Item(s)" submenu
  chrome.contextMenus.create({
    id: MENU_IDS.CHECKED,
    parentId: MENU_IDS.ROOT,
    title: 'Checked Item(s)',
    contexts: ['page', 'link', 'selection'],
    enabled: false
  });

  // Create separator
  chrome.contextMenus.create({
    id: MENU_IDS.SEPARATOR,
    parentId: MENU_IDS.ROOT,
    type: 'separator',
    contexts: ['page', 'link', 'selection']
  });

  // Create dynamic "Selected Folder" submenu (will be updated)
  chrome.contextMenus.create({
    id: MENU_IDS.SELECTED,
    parentId: MENU_IDS.ROOT,
    title: 'Selected Folder - (none)',
    contexts: ['page', 'link', 'selection']
  });

  // Check if this is a fresh install (not an update)
  if (details.reason === 'install') {
    // Set a flag to show welcome modal
    chrome.storage.sync.set({
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
      menuTitle = `Selected File - ${displayName}`;
    } else if (itemType === 'folder') {
      menuTitle = `Selected Folder - ${displayName}`;
    } else {
      // Fallback for unknown type
      menuTitle = `Selected Item - ${displayName}`;
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
        title: 'GitZip Pro - Download Failed',
        message: errorMessage,
        priority: 2
      }, (err) => {
        if (chrome.runtime.lastError) {
          // Fallback with data URI icon
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            title: 'GitZip Pro - Download Failed',
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
            message: 'Download completed successfully!'
          }, (err) => {
            if (chrome.runtime.lastError) {
              // Fallback to data URI if local resource fails
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                title: 'GitZip Pro',
                message: 'Download completed successfully!'
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

      // Send download completion message to options page for history tracking
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

        chrome.runtime.sendMessage({
          type: 'GZP_DOWNLOAD_COMPLETE',
          record: record
        });
      } catch (e) {
        console.warn('[GitZip Pro] Failed to send history record', e);
      }
    } else if (delta.state && delta.state.current === 'interrupted') {
      activeDownloads.delete(delta.id);
    }
  }
});