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

  /** 文件大小缓存 {path: sizeString} */
  const fileSizeCache = new Map();

  let downloadBtn = null;
  let cleanupTimeout = null;
  let isNavigating = false;  // 防止重复清除
  let buttonPosition = 'bottom-right';  // Default position
  let isAttachingRows = false;  // 防止重复附加行

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

  /**
   * 格式化字节大小为可读格式
   */
  function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
  }

  /**
   * 通过GitHub API获取文件大小
   */
  async function fetchFileSize(filePath) {
    if (fileSizeCache.has(filePath)) {
      return fileSizeCache.get(filePath);
    }

    // 解析仓库信息
    const pathParts = location.pathname.replace(/^\//, '').split('/').filter(Boolean);
    const owner = pathParts[0];
    const repo = pathParts[1];

    // 查找分支名
    let branch = 'main';
    const treeIndex = pathParts.indexOf('tree');
    if (treeIndex !== -1 && treeIndex + 1 < pathParts.length) {
      branch = pathParts[treeIndex + 1];
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    try {
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!response.ok) {
        fileSizeCache.set(filePath, '');
        return '';
      }

      const data = await response.json();

      if (data && data.size !== undefined) {
        const sizeStr = formatSize(data.size);
        fileSizeCache.set(filePath, sizeStr);
        return sizeStr;
      }

      fileSizeCache.set(filePath, '');
      return '';
    } catch (e) {
      fileSizeCache.set(filePath, '');
      return '';
    }
  }

  // 找到文件大小列并显示文件大小
  async function displayFileSizeInRow(row) {
    // 先检查是否已经插入了大小列，防止重复
    if (row.querySelector('.gzp-file-size-cell')) {
      return;
    }

    // 找到日期列（最后一列）
    const dateColumnSelectors = [
      'td:last-child',
      'div[role="gridcell"]:last-child',
      '.js-navigation-item > .js-navigation-cell:last-child',
      'td:has(time)',
      'div[role="gridcell"]:has(time)'
    ];

    let dateColumn = null;
    for (const selector of dateColumnSelectors) {
      const element = row.querySelector(selector);
      if (element) {
        dateColumn = element;
        break;
      }
    }

    if (!dateColumn) {
      return;
    }

    // 创建新的文件大小列
    const sizeCell = document.createElement(dateColumn.tagName);
    sizeCell.className = 'gzp-file-size-cell';
    sizeCell.textContent = '…';

    // 设置样式
    sizeCell.style.color = '#8b949e';
    sizeCell.style.fontSize = '12px';
    sizeCell.style.fontFamily = 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace';
    sizeCell.style.whiteSpace = 'nowrap';
    sizeCell.style.textAlign = 'right';
    sizeCell.style.paddingRight = '16px';
    sizeCell.style.minWidth = '40px';
    sizeCell.style.width = '40px';

    // 在日期列前面插入大小列
    dateColumn.parentNode.insertBefore(sizeCell, dateColumn);

    // 修复表头和第一行commit信息行的colspan属性：添加一列后需要将所有跨列的单元格colspan值+1
    const table = row.closest('table');
    if (table && !table.hasAttribute('data-gzp-colspan-fixed')) {
      // 标记表格已经处理过colspan，防止重复执行+1操作
      table.setAttribute('data-gzp-colspan-fixed', 'true');

      // 找到所有带colspan的单元格（包括表头和第一行的commit信息行）
      const colspanCells = table.querySelectorAll('[colspan]');
      colspanCells.forEach(cell => {
        const currentColspan = parseInt(cell.getAttribute('colspan'), 10);
        // 只要colspan >= 3 的都自动 +1 适配新增的文件大小列
        if (currentColspan >= 3 && currentColspan <= 10) { // 防止过大的错误值，只修改合理范围
          cell.setAttribute('colspan', (currentColspan + 1).toString());
        }
      });
    }

    // 检查是否是文件夹
    if (row.querySelector('a[href*="/tree/"]')) {
      sizeCell.textContent = '';
      return;
    }

    // 获取文件路径
    console.log("测试row:", row);
    const fileLink = row.querySelector('a[href*="/blob/"]');
    if (!fileLink) {
      sizeCell.textContent = '';
      return;
    }

    const hrefParts = fileLink.getAttribute('href').split('/blob/');
    if (hrefParts.length < 2) {
      sizeCell.textContent = '';
      return;
    }

    const filePath = hrefParts[1].split('/').slice(1).join('/');

    // 异步获取大小
    const size = await fetchFileSize(filePath);
    sizeCell.textContent = size || '';
  }

  function getTargetCell(row) {
    // 优先查找大屏幕单元格（这个类通常是可见的）
    const largeScreenCell = row.querySelector('.react-directory-row-name-cell-large-screen');
    if (largeScreenCell && window.getComputedStyle(largeScreenCell).display !== 'none') {
      return largeScreenCell;
    }

    // 如果大屏幕单元格不存在或被隐藏，查找小屏幕单元格并强制显示
    const smallScreenCell = row.querySelector('.react-directory-row-name-cell-small-screen');
    if (smallScreenCell) {
      // 强制覆盖 display 属性，使复选框容器可见
      smallScreenCell.style.display = 'flex';
      smallScreenCell.style.alignItems = 'center';
      return smallScreenCell;
    }

    // 原有的选择器逻辑作为后备
    const cellSelectors = [
      'td:first-child',
      'div[role="gridcell"]:first-child',
      '.js-navigation-item > .js-navigation-cell:first-child',
      '.Box-row > div:first-child',
      'td:nth-child(1)'
    ];

    for (const selector of cellSelectors) {
      const cells = row.querySelectorAll(selector);
      for (const cell of cells) {
        const style = window.getComputedStyle(cell);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          if (cell.classList.contains('react-directory-row-name-cell-small-screen')) {
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
          }
          return cell;
        }
      }
    }

    // 最后后备：返回第一个可见的 td 或 div
    const allCells = row.querySelectorAll('td, div[role="gridcell"]');
    for (const cell of allCells) {
      const style = window.getComputedStyle(cell);
      if (style.display !== 'none') {
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
    // 内联样式确保可见
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = '20px';
    wrapper.style.height = '20px';
    wrapper.style.marginRight = '8px';
    wrapper.style.flexShrink = '0';
    wrapper.style.opacity = '1';
    wrapper.style.visibility = 'visible';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'gzp-checkbox';
    cb.setAttribute('aria-label', 'Select for download');
    cb.checked = isChecked;
    cb.style.width = '16px';
    cb.style.height = '16px';
    cb.style.margin = '0';
    cb.style.cursor = 'pointer';

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

    // 修复重复复选框问题：先移除任何现有的 gzp-cb-wrapper 元素
    const existingWrappers = row.querySelectorAll('.gzp-cb-wrapper');
    existingWrappers.forEach(wrapper => {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    });

    // 同时也要移除可能已经存在的复选框
    const existingCheckboxes = row.querySelectorAll('.gzp-checkbox');
    existingCheckboxes.forEach(cb => {
      if (cb.parentNode) {
        cb.parentNode.removeChild(cb);
      }
    });

    // 移除可能已经存在的文件大小元素
    const existingFileSizes = row.querySelectorAll('.gzp-file-size');
    existingFileSizes.forEach(sizeElement => {
      if (sizeElement.parentNode) {
        sizeElement.parentNode.removeChild(sizeElement);
      }
    });

    // 创建复选框
    const { wrapper, cb } = createCheckbox(row, false);
    const targetCell = getTargetCell(row);

    targetCell.classList.add('gzp-cell');

    if (getComputedStyle(targetCell).position === 'static') {
      targetCell.style.position = 'relative';
    }

    // Ensure the wrapper is visible by default
    wrapper.style.opacity = '1';
    wrapper.style.visibility = 'visible';

    targetCell.insertBefore(wrapper, targetCell.firstChild);

    // 显示文件大小
    displayFileSizeInRow(row);

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

    // Ensure the wrapper is visible by default
    wrapper.classList.add('gzp-cb-wrapper--visible');

    // 添加双击选择功能
    let lastClickTime = 0;
    row.addEventListener('click', (e) => {
      // 检查是否点击了复选框或包装器
      const clickedCheckbox = e.target.classList.contains('gzp-checkbox') ||
        e.target.closest('.gzp-checkbox');
      const clickedWrapper = e.target.classList.contains('gzp-cb-wrapper') ||
        e.target.closest('.gzp-cb-wrapper');

      // 如果是点击复选框或包装器，不处理双击选择
      if (clickedCheckbox || clickedWrapper) {
        return;
      }

      const currentTime = Date.now();
      const isDoubleClick = (currentTime - lastClickTime) < 500; // 500ms内视为双击
      lastClickTime = currentTime;

      if (isDoubleClick) {
        e.stopPropagation();
        e.preventDefault();

        // 切换选择状态
        const newCheckedState = !cb.checked;
        cb.checked = newCheckedState;

        // 触发change事件以确保状态更新
        const changeEvent = new Event('change', { bubbles: false });
        cb.dispatchEvent(changeEvent);
      }
    });
  }

  function attachAllRows() {
    // 防止重复执行附加操作
    if (isAttachingRows) return;
    isAttachingRows = true;

    try {
      if (!isRepoFilePage()) return;
      const rows = getFileRows();
      if (rows.length === 0) return;
      rows.forEach(attachRowBehavior);
    } finally {
      // 使用setTimeout确保在下一个事件循环中重置标志，避免微任务问题
      setTimeout(() => {
        isAttachingRows = false;
      }, 0);
    }
  }

  // ─── Download button ──────────────────────────────────────────────────────

  /** Stores the AbortController for any in-progress download */
  let activeDownload = null;

  const BTN_STATES = {
    IDLE: 'idle',
    LOADING: 'loading',
    DONE: 'done',
    ERROR: 'error',
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