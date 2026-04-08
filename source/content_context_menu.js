/**
 * GitZip Pro - Context Menu Integration
 * This code should be added to content.js to handle right-click context menu functionality.
 */

// Add to content.js state section (around line 15-28)
/*
  // Add these to existing state variables:
  let lastRightClickedRow = null;
  let lastRightClickedHref = null;
*/

// Add this function to handle right-click on rows
function setupRowContextMenu(row) {
  row.addEventListener('contextmenu', (e) => {
    // Get the href for this row
    const href = getPathFromRow(row);
    if (!href) return;
    
    // Store the clicked item for context menu
    lastRightClickedRow = row;
    lastRightClickedHref = href;
    
    // Get the display name for the item
    const link = row.querySelector('a[href*="/tree/"], a[href*="/blob/"]');
    const itemName = link ? link.textContent.trim() : href.split('/').pop();
    
    // Send message to background script to update context menu
    chrome.runtime.sendMessage({
      type: 'GZP_UPDATE_CONTEXT_MENU',
      href: href,
      itemName: itemName
    });
    
    // Don't prevent default - let browser show context menu
  });
}

// Add this to attachRowBehavior function (around line 354)
/*
  // Add context menu support
  setupRowContextMenu(row);
*/

// Add this message listener to init function or global scope
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GZP_DOWNLOAD_CONTEXT_ITEM') {
    // Download the item that was right-clicked
    const href = message.href;
    
    if (!href || !window.GZPDownloader) {
      console.error('GitZip Pro: Cannot download context menu item');
      return;
    }
    
    // Create a Map with the single item
    const selectedItems = new Map();
    selectedItems.set(document.createElement('div'), href);
    
    // Start download
    window.GZPDownloader.start(selectedItems, {
      onProgress: (current, total, label) => {
        console.log(`Downloading: ${label}`);
      },
      onDone: () => {
        console.log('Context menu download completed');
      },
      onError: (err) => {
        console.error('Context menu download error:', err);
      },
    });
    
    sendResponse({ ok: true });
    return true;
  }
  
  return false;
});

// Update attachAllRows function to include context menu setup
/*
  function attachAllRows() {
    if (isAttachingRows) return;
    isAttachingRows = true;
    
    try {
      if (!isRepoFilePage()) return;
      const rows = getFileRows();
      if (rows.length === 0) return;
      rows.forEach((row) => {
        attachRowBehavior(row);
        setupRowContextMenu(row); // Add this line
      });
    } finally {
      setTimeout(() => {
        isAttachingRows = false;
      }, 0);
    }
  }
*/