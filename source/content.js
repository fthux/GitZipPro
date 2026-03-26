/**
 * GitZip Pro - content.js
 * Injected on all github.com pages.
 * Detects GitHub repo file listing pages, adds hover checkboxes,
 * and shows a download button when items are selected.
 */

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  const ROW_MARK = 'data-gzp-attached';

  // ─── State ────────────────────────────────────────────────────────────────

  /** @type {Map<Element, string>} row element → file/folder href */
  const selectedItems = new Map();

  let downloadBtn = null;
  let cleanupTimeout = null;
  let isNavigating = false;  // 防止重复清除
  let buttonPosition = 'bottom-right';  // Default position

  // ─── GitHub repo page detection ───────────────────────────────────────────

  function isRepoFilePage() {
    if (location.hostname !== 'github.com') return false;
    const parts = location.pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (parts.length < 2) return false;
    const thirdSegment = parts[2];
    const excluded = new Set([
      'issues', 'pull', 'pulls', 'wiki', 'settings',
      'actions', 'projects', 'security', 'pulse', 'graphs',
      'releases', 'tags', 'commits', 'compare', 'discussions',
      'stargazers', 'watchers', 'network', 'forks', 'search',
      'sponsors', 'packages',
    ]);
    if (thirdSegment && excluded.has(thirdSegment)) return false;
    return !thirdSegment || thirdSegment === 'tree' || thirdSegment === 'blob' || parts.length === 2;
  }

  // ─── DOM Selectors ────────────────────────────────────────────────────────

  function getFileRows() {
    const selectors = [
      'table[aria-label="Files"] tbody tr',
      'table.react-directory-row-default-container tbody tr',
      'table[class*="DirectoryEntries"] tbody tr',
      'div[role="rowgroup"] > div[role="row"]',
      '.js-navigation-container > .js-navigation-item',
      'tr:has(a[href*="/blob/"]), tr:has(a[href*="/tree/"])'
    ];

    for (const selector of selectors) {
      const rows = document.querySelectorAll(selector);
      if (rows.length > 0) {
        return Array.from(rows);
      }
    }

    return [];
  }

  function getPathFromRow(row) {
    const linkSelectors = [
      'a.Link--primary[href]',
      'a[data-testid="link"]',
      'a[href*="/blob/"]',
      'a[href*="/tree/"]',
      '.js-navigation-open[href]',
      'a[class*="Link"]'
    ];

    for (const selector of linkSelectors) {
      const link = row.querySelector(selector);
      if (link && link.getAttribute('href')) {
        let href = link.getAttribute('href');
        if (href.startsWith('/')) {
          href = location.origin + href;
        }
        return href;
      }
    }

    const anyLink = row.querySelector('a[href*="/"]');
    if (anyLink) {
      return anyLink.getAttribute('href');
    }

    return '';
  }

  function getTargetCell(row) {
    const cellSelectors = [
      'td:first-child',
      'div[role="gridcell"]:first-child',
      '.js-navigation-item > .js-navigation-cell:first-child',
      '.Box-row > div:first-child',
      'td:nth-child(1)'
    ];

    for (const selector of cellSelectors) {
      const cell = row.querySelector(selector);
      if (cell) {
        return cell;
      }
    }

    return row;
  }

  // ─── Checkbox injection ───────────────────────────────────────────────────

  function createCheckbox(row, isChecked = false) {
    const wrapper = document.createElement('span');
    wrapper.className = 'gzp-cb-wrapper';
    wrapper.setAttribute('data-gzp-cb-wrapper', 'true');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'gzp-checkbox';
    cb.setAttribute('aria-label', 'Select for download');
    cb.checked = isChecked;

    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) {
        selectedItems.set(row, getPathFromRow(row));
        row.classList.add('gzp-row--selected');
      } else {
        selectedItems.delete(row);
        row.classList.remove('gzp-row--selected');
      }
      updateDownloadButton();
    });

    cb.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    wrapper.appendChild(cb);
    return { wrapper, cb };
  }

  function attachRowBehavior(row) {
    if (row.hasAttribute(ROW_MARK)) return;
    row.setAttribute(ROW_MARK, '1');

    row.classList.add('gzp-row');

    const { wrapper, cb } = createCheckbox(row);
    const targetCell = getTargetCell(row);

    targetCell.classList.add('gzp-cell');

    if (getComputedStyle(targetCell).position === 'static') {
      targetCell.style.position = 'relative';
    }

    targetCell.insertBefore(wrapper, targetCell.firstChild);

    if (selectedItems.has(row)) {
      cb.checked = true;
      row.classList.add('gzp-row--selected');
      wrapper.classList.add('gzp-cb-wrapper--visible');
    }

    row.addEventListener('mouseenter', () => {
      wrapper.classList.add('gzp-cb-wrapper--visible');
    });

    row.addEventListener('mouseleave', () => {
      if (!cb.checked) {
        wrapper.classList.remove('gzp-cb-wrapper--visible');
      }
    });

    if (cb.checked) {
      wrapper.classList.add('gzp-cb-wrapper--visible');
    }
  }

  function attachAllRows() {
    if (!isRepoFilePage()) return;
    const rows = getFileRows();
    if (rows.length === 0) return;
    rows.forEach(attachRowBehavior);
  }

  // ─── Download button ──────────────────────────────────────────────────────

  /** Stores the AbortController for any in-progress download */
  let activeDownload = null;

  const BTN_STATES = {
    IDLE:     'idle',
    LOADING:  'loading',
    DONE:     'done',
    ERROR:    'error',
  };

  const BTN_HTML = {
    [BTN_STATES.IDLE]: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
           stroke-linejoin="round" class="gzp-icon">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span class="gzp-btn-label">Download</span>
      <span class="gzp-btn-badge"></span>`,
    [BTN_STATES.LOADING]: `
      <span class="gzp-spinner"></span>
      <span class="gzp-btn-label">Downloading…</span>
      <span class="gzp-btn-progress"></span>`,
    [BTN_STATES.DONE]: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
           stroke-linejoin="round" width="17" height="17">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span class="gzp-btn-label">Done!</span>`,
    [BTN_STATES.ERROR]: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
           stroke-linejoin="round" width="17" height="17">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span class="gzp-btn-label">Error</span>`,
  };

  function setBtnState(state, label) {
    if (!downloadBtn) return;
    downloadBtn.innerHTML = BTN_HTML[state] || BTN_HTML[BTN_STATES.IDLE];
    downloadBtn.dataset.state = state;
    downloadBtn.disabled = (state === BTN_STATES.LOADING);

    if (state === BTN_STATES.LOADING && label) {
      const p = downloadBtn.querySelector('.gzp-btn-progress');
      if (p) p.textContent = label;
    }
  }

  function resetBtnToIdle() {
    setBtnState(BTN_STATES.IDLE);
    // Restore badge count
    const badge = downloadBtn && downloadBtn.querySelector('.gzp-btn-badge');
    if (badge) badge.textContent = selectedItems.size || '';
  }

  function ensureDownloadButton() {
    if (downloadBtn && document.body.contains(downloadBtn)) {
      // Ensure button has correct position class
      updateButtonPosition();
      return downloadBtn;
    }

    const btn = document.createElement('button');
    btn.id = 'gzp-download-btn';
    btn.className = 'gzp-download-btn gzp-download-btn--hidden';
    btn.dataset.state = BTN_STATES.IDLE;
    btn.innerHTML = BTN_HTML[BTN_STATES.IDLE];

    btn.addEventListener('click', async () => {
      if (btn.dataset.state === BTN_STATES.LOADING) return;

      if (!window.GZPDownloader) {
        alert('GitZip Pro: downloader not loaded. Please reload the page.');
        return;
      }

      setBtnState(BTN_STATES.LOADING, '0 / ? files');

      activeDownload = await window.GZPDownloader.start(selectedItems, {
        onProgress: (current, total, label) => {
          if (btn.dataset.state !== BTN_STATES.LOADING) return;
          const p = btn.querySelector('.gzp-btn-progress');
          if (p) p.textContent = label;
        },
        onDone: () => {
          setBtnState(BTN_STATES.DONE);
          setTimeout(resetBtnToIdle, 2500);
        },
        onError: (err) => {
          setBtnState(BTN_STATES.ERROR);
          console.error('[GitZip Pro]', err.message);
          setTimeout(resetBtnToIdle, 3500);
        },
      });
    });

    document.body.appendChild(btn);
    downloadBtn = btn;
    updateButtonPosition();
    return btn;
  }

  function updateButtonPosition() {
    if (!downloadBtn) return;
    
    // Remove existing position classes
    downloadBtn.classList.remove(
      'gzp-pos-bottom-right',
      'gzp-pos-top-left',
      'gzp-pos-top-right',
      'gzp-pos-bottom-left',
      'gzp-pos-top-center',
      'gzp-pos-bottom-center',
      'gzp-pos-left-center',
      'gzp-pos-right-center'
    );
    
    // Add new position class
    downloadBtn.classList.add(`gzp-pos-${buttonPosition}`);
  }

  function updateDownloadButton() {
    const btn = ensureDownloadButton();
    const count = selectedItems.size;
    // Only update badge when in idle state (don't overwrite loading/done/error)
    if (!btn.dataset.state || btn.dataset.state === BTN_STATES.IDLE) {
      const badge = btn.querySelector('.gzp-btn-badge');
      if (badge) badge.textContent = count > 0 ? count : '';
    }
    if (count > 0) {
      btn.classList.remove('gzp-download-btn--hidden');
    } else if (btn.dataset.state === BTN_STATES.IDLE) {
      btn.classList.add('gzp-download-btn--hidden');
    }
  }

  // ─── 清除所有选中状态（页面跳转时调用）────────────────────────────────

  function clearAllSelections() {
    if (isNavigating) return;  // 防止重复清除
    isNavigating = true;

    console.log('[GitZip Pro] Clearing all selections');

    // 清除所有行的选中样式
    const selectedRows = document.querySelectorAll('.gzp-row--selected');
    selectedRows.forEach(row => {
      row.classList.remove('gzp-row--selected');
    });

    // 清除所有复选框的选中状态
    const checkboxes = document.querySelectorAll('.gzp-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = false;
    });

    // 清除所有 wrapper 的可见状态
    const wrappers = document.querySelectorAll('.gzp-cb-wrapper');
    wrappers.forEach(wrapper => {
      wrapper.classList.remove('gzp-cb-wrapper--visible');
    });

    // 清空 Map
    selectedItems.clear();

    // 隐藏下载按钮
    updateDownloadButton();

    setTimeout(() => {
      isNavigating = false;
    }, 100);
  }

  function logDebug(message, data) {
    if (window.location.href.includes('github.com') && console && console.log) {
      console.log(`[GitZip Pro] ${message}`, data || '');
    }
  }

  // ─── 关键修复：拦截所有链接点击，在跳转前清除状态 ────────────────────────

  function interceptLinkClicks() {
    // 监听所有可能的点击事件（捕获阶段，确保在 GitHub 的处理器之前执行）
    document.body.addEventListener('click', (e) => {
      // 向上查找被点击的链接元素
      let target = e.target;
      let link = null;

      while (target && target !== document.body) {
        if (target.tagName === 'A' && target.getAttribute('href')) {
          link = target;
          break;
        }
        target = target.parentElement;
      }

      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // 检查是否是 GitHub 仓库内的导航链接
      // 排除外部链接、锚点链接、下载链接等
      if (
        href.startsWith('#') ||           // 锚点
        href.startsWith('javascript:') || // JS 伪链接
        href.startsWith('mailto:') ||     // 邮件
        href.startsWith('http') && !href.includes('github.com') // 外部链接
      ) {
        return;
      }

      // 检查是否是仓库文件/文件夹导航
      const isRepoNav = (
        href.includes('/tree/') ||
        href.includes('/blob/') ||
        (href.match(/\/[^/]+\/[^/]+(\/.*)?/) && !href.includes('/issues') && !href.includes('/pulls'))
      );

      if (isRepoNav) {
        console.log('[GitZip Pro] Link click intercepted, clearing selections before navigation:', href);
        // 立即清除状态（在页面跳转之前）
        clearAllSelections();
      }
    }, true); // 使用捕获阶段确保优先执行
  }

  // ─── SPA navigation handling ──────────────────────────────────────────────

  function onNavigate() {
    logDebug('Navigation detected, resetting state');

    // 清除所有选中状态
    clearAllSelections();

    // 清除行标记，允许重新注入
    const markedRows = document.querySelectorAll(`[${ROW_MARK}]`);
    markedRows.forEach(row => {
      row.removeAttribute(ROW_MARK);
    });

    clearTimeout(cleanupTimeout);
    cleanupTimeout = setTimeout(() => {
      attachAllRows();
      logDebug('Re-attached rows after navigation');
    }, 500);
  }

  // MutationObserver: watches for GitHub's SPA DOM replacements
  const bodyObserver = new MutationObserver((mutations) => {
    let hasRelevantChanges = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.querySelector && (
              node.querySelector('a[href*="/blob/"]') ||
              node.querySelector('table[aria-label="Files"]')
            )) {
              hasRelevantChanges = true;
              break;
            }
          }
        }
      }
      if (hasRelevantChanges) break;
    }

    if (hasRelevantChanges) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = setTimeout(attachAllRows, 250);
    }
  });

  // Intercept history.pushState
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(onNavigate, 150);
  };

  window.addEventListener('popstate', onNavigate);

  // Turbo navigation (GitHub's modern SPA framework)
  document.addEventListener('turbo:load', onNavigate);
  document.addEventListener('turbo:render', onNavigate);

  // 监听 beforeunload 事件（传统页面刷新/跳转）
  window.addEventListener('beforeunload', () => {
    console.log('[GitZip Pro] beforeunload, clearing selections');
    clearAllSelections();
  });

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 页面重新可见时，检查 URL 是否变化，重新注入
      setTimeout(() => {
        attachAllRows();
      }, 300);
    }
  });

  // ─── Load settings from storage ──────────────────────────────────────────

  function loadSettings() {
    chrome.storage.sync.get(['gzpButtonPosition'], (res) => {
      const savedPosition = res.gzpButtonPosition || 'bottom-right';
      if (buttonPosition !== savedPosition) {
        buttonPosition = savedPosition;
        updateButtonPosition();
      }
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    logDebug('Initializing GitZip Pro');

    // Load saved settings
    loadSettings();

    // Listen for storage changes (when user updates settings)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.gzpButtonPosition) {
        buttonPosition = changes.gzpButtonPosition.newValue || 'bottom-right';
        updateButtonPosition();
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    ensureDownloadButton();
    attachAllRows();

    // 关键：拦截所有链接点击
    interceptLinkClicks();

    logDebug('Initialization complete');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();