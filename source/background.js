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


const activeDownloads = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GZP_DOWNLOAD_FILE') return false;

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