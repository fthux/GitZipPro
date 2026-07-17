/**
 * GitZip Pro - content.js
 * Injected on all github.com pages.
 * Detects GitHub repo file listing pages, adds hover checkboxes,
 * and shows a download button when items are selected.
 */

(function () {
  'use strict';
  const C = globalThis.GZP_CONSTANTS;
  const STORAGE = C.STORAGE_KEYS;
  const DEFAULTS = C.DEFAULTS;

  // ─── Constants ────────────────────────────────────────────────────────────

  const ROW_MARK = 'data-gzp-attached';

  /** I18n helper - local alias for GZP_I18N.t() */
  function t(key, vars) {
    return globalThis.GZP_I18N ? globalThis.GZP_I18N.t(key, vars) : key;
  }

  // ─── State ────────────────────────────────────────────────────────────────

  /** @type {Map<Element, string>} row element → file/folder href */
  const selectedItems = new Map();

  /** 文件大小缓存 {path: sizeString} */
  const fileSizeCache = new Map();
  const fileSizeRefCache = new Map();

  let downloadControl = null;
  let downloadBtn = null;
  let resultToggleBtn = null;
  let downloadPanel = null;
  let cleanupTimeout = null;
  let isNavigating = false;  // 防止重复清除
  let buttonPosition = DEFAULTS.BUTTON_POSITION;

  // Context menu state
  let hoveredContextItem = null;
  let lastRightClickedRow = null;
  let lastRightClickedHref = null;

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
        // Filter out rows inside rendered markdown areas (e.g. README tables)
        // to prevent injecting checkboxes into non-repo-file-listing content.
        return Array.from(rows).filter(row => !row.closest('.markdown-body'));
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
  async function fetchFileSize(fileHref) {
    if (fileSizeCache.has(fileHref)) {
      return fileSizeCache.get(fileHref);
    }

    // 如果已经关闭文件大小显示 直接返回空 不发起请求
    if (!showFileSizes) {
      return '';
    }

    // 获取保存的token设置
    const tokenResult = await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE.GITHUB_TOKEN, STORAGE.TOKEN_ACCESS_MODE], resolve);
    });

    const token = tokenResult[STORAGE.GITHUB_TOKEN];
    const mode = tokenResult[STORAGE.TOKEN_ACCESS_MODE] || DEFAULTS.TOKEN_ACCESS_MODE;

    // 准备请求头
    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    // 如果使用自定义token模式且有token，则添加认证头
    if (token && mode === 'custom') {
      headers['Authorization'] = `token ${token}`;
    }

    // 创建AbortController用于取消请求
    const abortController = new AbortController();
    fileSizeAbortControllers.set(fileHref, abortController);

    try {
      const info = await globalThis.GZPDownloader.resolveGitHubUrl(
        fileHref,
        abortController.signal,
        token,
        mode,
        fileSizeRefCache
      );
      if (!info || info.type !== 'file' || !info.path) {
        fileSizeCache.set(fileHref, '');
        return '';
      }

      const encodedPath = info.path.split('/').map(encodeURIComponent).join('/');
      const apiUrl = `${C.URLS.GITHUB_API_BASE}/repos/${info.owner}/${info.repo}/contents/${encodedPath}?ref=${encodeURIComponent(info.branch)}`;
      const response = await fetch(apiUrl, {
        headers,
        signal: abortController.signal
      });

      if (!response.ok) {
        fileSizeCache.set(fileHref, '');
        return '';
      }

      const data = await response.json();

      if (data && data.size !== undefined) {
        const sizeStr = formatSize(data.size);
        fileSizeCache.set(fileHref, sizeStr);
        return sizeStr;
      }

      fileSizeCache.set(fileHref, '');
      return '';
    } catch (e) {
      // 如果是请求被取消 则不缓存
      if (e.name !== 'AbortError') {
        fileSizeCache.set(fileHref, '');
      }
      return '';
    } finally {
      fileSizeAbortControllers.delete(fileHref);
    }
  }

  // 清理所有文件大小列和取消所有未完成的请求
  function clearAllFileSizes() {
    // 取消所有正在进行的请求
    fileSizeAbortControllers.forEach((controller) => {
      controller.abort();
    });
    fileSizeAbortControllers.clear();

    // 移除页面上所有文件大小列
    const sizeCells = document.querySelectorAll('.gzp-file-size-cell');
    sizeCells.forEach(cell => {
      if (cell.parentNode) {
        cell.parentNode.removeChild(cell);
      }
    });

    // 清除表格的colspan标记 下次开启时重新处理
    const tables = document.querySelectorAll('table[data-gzp-colspan-fixed]');
    tables.forEach(table => {
      table.removeAttribute('data-gzp-colspan-fixed');

      // 恢复colspan值
      const colspanCells = table.querySelectorAll('[colspan]');
      colspanCells.forEach(cell => {
        const currentColspan = parseInt(cell.getAttribute('colspan'), 10);
        if (currentColspan >= 4 && currentColspan <= 11) {
          cell.setAttribute('colspan', (currentColspan - 1).toString());
        }
      });
    });
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
    const fileLink = row.querySelector('a[href*="/blob/"]');
    if (!fileLink) {
      sizeCell.textContent = '';
      return;
    }

    // 异步获取大小
    const size = await fetchFileSize(fileLink.getAttribute('href'));
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
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = '20px';
    wrapper.style.height = '20px';
    wrapper.style.marginRight = '8px';
    wrapper.style.flexShrink = '0';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'gzp-checkbox';
    cb.setAttribute('aria-label', t('checkbox.select_for_download'));
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
    // 使用类来标记已初始化的行，而不是属性，这样更容易在导航时清除
    if (row.classList.contains('gzp-row-initialized')) return;

    // ✅ 跳过返回上一级的父文件夹导航行
    // 使用更灵活的检测方法，匹配用户脚本中的逻辑
    const isParentDirectoryRow = row.querySelector('a[aria-label*="Go to parent directory"], a[aria-label="Parent directory"], .js-navigation-open[title=".."]') !== null;

    if (isParentDirectoryRow) {
      // 只有真正的父目录行才跳过
      row.classList.add('gzp-row-initialized');
      return;
    }

    // 检查是否已经有选择框（防止重复添加）
    if (row.querySelector('.gzp-checkbox, input[type="checkbox"]')) {
      row.classList.add('gzp-row-initialized');
      return;
    }

    row.classList.add('gzp-row-initialized');

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

    targetCell.insertBefore(wrapper, targetCell.firstChild);

    // 显示文件大小（仅当设置开启时）
    if (showFileSizes) {
      displayFileSizeInRow(row);
    }

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

      if (isDoubleClick && doubleClickSelect) {
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

    // 添加上下文菜单支持
    setupRowContextMenu(row);
  }

  // ─── Context Menu Functions ──────────────────────────────────────────────

  function getContextMenuItem(row) {
    const href = getPathFromRow(row);
    if (!href) return null;

    const link = row.querySelector('a[href*="/tree/"], a[href*="/blob/"]');
    const itemName = link ? link.textContent.trim() : href.split('/').pop();
    const itemType = href.includes('/blob/')
      ? 'file'
      : href.includes('/tree/')
        ? 'folder'
        : 'unknown';

    return { row, href, itemName, itemType };
  }

  function updateContextMenuItem(item) {
    chrome.runtime.sendMessage({
      type: 'GZP_UPDATE_CONTEXT_MENU',
      enabled: Boolean(item),
      href: item ? item.href : null,
      itemName: item ? item.itemName : null,
      itemType: item ? item.itemType : null
    }, () => {
      void chrome.runtime.lastError;
    });
  }

  function clearContextMenuSelection() {
    hoveredContextItem = null;
    lastRightClickedRow = null;
    lastRightClickedHref = null;
    updateContextMenuItem(null);
  }

  function prepareContextMenuItem(row, lockItem = false) {
    const item = getContextMenuItem(row);
    if (!item) return false;

    hoveredContextItem = item;
    if (lockItem) {
      lastRightClickedRow = row;
      lastRightClickedHref = item.href;
    }
    updateContextMenuItem(item);
    return true;
  }

  function getContextMenuRow(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target ? target.closest('.gzp-row-initialized.gzp-row') : null;
  }

  function setupRowContextMenu(row) {
    row.addEventListener('mouseenter', () => {
      prepareContextMenuItem(row);
    });

    row.addEventListener('mouseleave', () => {
      if (!hoveredContextItem || hoveredContextItem.row !== row) return;

      // Opening a native context menu can trigger mouseleave. Keep the menu
      // title intact until the next explicit right-click target is known.
      hoveredContextItem = null;
    });
  }

  function handleContextMenuDownload(href) {
    if (!href || !window.GZPDownloader) {
      console.error('GitZip Pro: Cannot download context menu item');
      return;
    }

    const downloadMap = new Map();
    downloadMap.set(document.createElement('div'), href);
    startDownload(downloadMap);
  }

  function attachAllRows() {
    // 使用防抖机制，避免重复执行
    clearTimeout(attachAllRows.timeout);
    attachAllRows.timeout = setTimeout(() => {
      if (!isRepoFilePage()) {
        return;
      }
      const rows = getFileRows();
      if (rows.length === 0) {
        // 如果没有找到行，可能是DOM还没准备好，安排重试
        setTimeout(attachAllRows, 100);
        return;
      }
      rows.forEach(attachRowBehavior);
    }, 30); // 使用30ms防抖，类似用户脚本
  }

  // ─── Download button ──────────────────────────────────────────────────────

  /** Stores the current cancellable download task. */
  let activeDownload = null;
  let lastDownloadItems = null;
  let lastProgress = null;
  let lastError = null;
  let lastResult = null;
  let isCancelling = false;
  let panelCollapsed = false;
  let panelState = 'idle';
  let extensionTheme = DEFAULTS.THEME;
  const systemThemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const BTN_STATES = {
    IDLE: 'idle',
    LOADING: 'loading',
    DONE: 'done',
    ERROR: 'error',
    CANCELLED: 'cancelled',
  };

  const DOWNLOAD_PHASES = ['scan', 'download', 'compress', 'save'];

  function resolveDownloadTheme(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return systemThemeQuery && systemThemeQuery.matches ? 'dark' : 'light';
  }

  function applyDownloadTheme(theme) {
    extensionTheme = theme || DEFAULTS.THEME;
    const resolvedTheme = resolveDownloadTheme(extensionTheme);
    [downloadControl, downloadBtn, resultToggleBtn, downloadPanel].filter(Boolean).forEach(element => {
      element.dataset.gzpTheme = resolvedTheme;
    });
  }

  if (systemThemeQuery) {
    const handleSystemThemeChange = () => {
      if (extensionTheme === 'system') applyDownloadTheme(extensionTheme);
    };
    if (typeof systemThemeQuery.addEventListener === 'function') {
      systemThemeQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === 'function') {
      systemThemeQuery.addListener(handleSystemThemeChange);
    }
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return t('download_progress.unknown_size');
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index++;
    }
    const digits = value >= 10 || index === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[index]}`;
  }

  function getPhaseLabel(phase) {
    return t(`download_progress.phase_${phase}`);
  }

  function getProgressLabel(progress) {
    if (!progress) return '';
    if (progress.phase === 'scan') {
      const count = Number.isFinite(progress.totalFiles) ? progress.totalFiles : 0;
      const size = Number.isFinite(progress.totalBytes) && progress.totalBytes > 0
        ? ` · ${progress.totalBytesKnown ? '' : t('download_progress.at_least')}${formatBytes(progress.totalBytes)}`
        : '';
      return `${count} ${t('download_progress.files')}${size}`;
    }
    if (progress.phase === 'download') {
      const files = `${progress.completedFiles || 0} / ${progress.totalFiles || 0}`;
      const bytes = Number.isFinite(progress.totalBytes) && progress.totalBytes > 0
        ? ` · ${formatBytes(progress.completedBytes || 0)} / ${progress.totalBytesKnown ? '' : t('download_progress.at_least')}${formatBytes(progress.totalBytes)}`
        : '';
      return `${files} ${t('download_progress.files')}${bytes}`;
    }
    if (progress.phase === 'compress') {
      return `${t('download_progress.source_size')} ${formatBytes(progress.totalBytes)}`;
    }
    if (progress.phase === 'save') {
      const total = Number.isFinite(progress.zipSizeBytes) ? progress.zipSizeBytes : progress.totalBytes;
      if (Number.isFinite(progress.completedBytes) && progress.completedBytes > 0 && Number.isFinite(total)) {
        return `${formatBytes(progress.completedBytes)} / ${formatBytes(total)}`;
      }
      return `${t('download_progress.zip_size')} ${formatBytes(total)}`;
    }
    return '';
  }

  function getBtnProgressText() {
    if (!lastProgress) return '';
    if (Number.isFinite(lastProgress.phaseProgress)) {
      return `${Math.round(lastProgress.phaseProgress * 100)}%`;
    }
    return getPhaseLabel(lastProgress.phase);
  }

  function getChevronIconHTML(expanded) {
    return `
      <svg class="gzp-chevron-icon${expanded ? ' gzp-chevron-icon--expanded' : ''}" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
           stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6"/>
      </svg>`;
  }

  function getBtnHTML(state) {
    switch (state) {
      case BTN_STATES.IDLE:
        return `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
               stroke-linejoin="round" class="gzp-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span class="gzp-btn-label">${t('download_btn.idle')}</span>
          <span class="gzp-btn-badge"></span>`;
      case BTN_STATES.LOADING:
        return `
          <span class="gzp-spinner"></span>
          <span class="gzp-btn-label">${isCancelling ? t('download_btn.cancelling') : t('download_btn.loading')}</span>
          <span class="gzp-btn-progress">${escapeHTML(getBtnProgressText())}</span>`;
      default:
        return '';
    }
  }

  function getResultToggleHTML() {
    const hasTerminalStatus = [BTN_STATES.DONE, BTN_STATES.ERROR, BTN_STATES.CANCELLED].includes(panelState);
    const statusDot = hasTerminalStatus ? '<span class="gzp-result-status-dot" aria-hidden="true"></span>' : '';
    return `${statusDot}${getChevronIconHTML(!panelCollapsed)}`;
  }

  function syncDownloadControlState() {
    if (!downloadControl || !downloadBtn || !resultToggleBtn) return;
    const downloadHidden = downloadBtn.classList.contains('gzp-download-btn--hidden');
    const toggleHidden = resultToggleBtn.classList.contains('gzp-result-toggle--hidden');
    downloadControl.classList.toggle('gzp-download-control--has-toggle', !toggleHidden);
    downloadControl.classList.toggle('gzp-download-control--hidden', downloadHidden && toggleHidden);
  }

  function renderResultToggle() {
    if (!resultToggleBtn) return;
    const hasDetails = panelState !== BTN_STATES.IDLE;
    resultToggleBtn.classList.toggle('gzp-result-toggle--hidden', !hasDetails);
    if (!hasDetails) {
      syncDownloadControlState();
      return;
    }
    resultToggleBtn.dataset.state = panelState;
    resultToggleBtn.innerHTML = getResultToggleHTML();
    const actionLabel = t(panelCollapsed ? 'download_progress.expand' : 'download_progress.collapse');
    const stateLabel = panelState === BTN_STATES.DONE
      ? t('download_progress.last_download')
      : panelState === BTN_STATES.ERROR
        ? t('download_progress.failed')
        : panelState === BTN_STATES.CANCELLED
          ? t('download_progress.cancelled')
          : '';
    const accessibleLabel = stateLabel ? `${stateLabel}: ${actionLabel}` : actionLabel;
    resultToggleBtn.title = accessibleLabel;
    resultToggleBtn.setAttribute('aria-label', accessibleLabel);
    resultToggleBtn.setAttribute('aria-expanded', String(!panelCollapsed));
    syncDownloadControlState();
  }

  function setBtnState(state) {
    if (!downloadBtn) return;
    downloadBtn.innerHTML = getBtnHTML(state);
    downloadBtn.dataset.state = state;
    downloadBtn.disabled = state === BTN_STATES.LOADING;
    downloadBtn.setAttribute('aria-busy', String(state === BTN_STATES.LOADING));
    downloadBtn.title = '';
  }

  function resetBtnToIdle() {
    activeDownload = null;
    lastProgress = null;
    lastError = null;
    lastResult = null;
    isCancelling = false;
    panelCollapsed = false;
    panelState = BTN_STATES.IDLE;
    setBtnState(BTN_STATES.IDLE);
    renderResultToggle();
    if (downloadPanel) downloadPanel.classList.add('gzp-download-panel--hidden');
    // Restore badge count
    const badge = downloadBtn && downloadBtn.querySelector('.gzp-btn-badge');
    if (badge) badge.textContent = selectedItems.size || '';
    updateDownloadButton();
  }

  function getErrorDetails(error) {
    if (!error) return '';
    return [
      `${t('download_progress.error_phase')}: ${getPhaseLabel(error.phase || (lastProgress && lastProgress.phase) || 'download')}`,
      `${t('download_progress.error_code')}: ${error.code || 'DOWNLOAD_FAILED'}`,
      error.path ? `${t('download_progress.error_file')}: ${error.path}` : '',
      Number.isFinite(error.httpStatus) ? `HTTP: ${error.httpStatus}` : '',
      error.requestPath ? `${t('download_progress.error_request')}: ${error.requestPath}` : '',
      `${t('download_progress.error_reason')}: ${error.message || String(error)}`,
    ].filter(Boolean).join('\n');
  }

  function copyErrorDetails() {
    const details = getErrorDetails(lastError);
    if (!details) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(details).catch(() => {});
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = details;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function getStageState(phase, buttonState) {
    const activeIndex = lastProgress ? DOWNLOAD_PHASES.indexOf(lastProgress.phase) : -1;
    const phaseIndex = DOWNLOAD_PHASES.indexOf(phase);
    if (buttonState === BTN_STATES.DONE) return 'done';
    if (phaseIndex < activeIndex) return 'done';
    if (phaseIndex === activeIndex) {
      if (buttonState === BTN_STATES.ERROR) return 'error';
      if (buttonState === BTN_STATES.CANCELLED) return 'cancelled';
      return 'active';
    }
    return 'pending';
  }

  function setPanelCollapsed(collapsed) {
    panelCollapsed = Boolean(collapsed);
    if (activeDownload) setBtnState(BTN_STATES.LOADING);
    renderResultToggle();
    renderProgressPanel();
  }

  function renderProgressPanel() {
    if (!downloadPanel) return;
    const buttonState = panelState;
    if (buttonState === BTN_STATES.IDLE || panelCollapsed) {
      downloadPanel.classList.add('gzp-download-panel--hidden');
      return;
    }

    downloadPanel.classList.remove('gzp-download-panel--hidden');
    const progressPercent = lastProgress && Number.isFinite(lastProgress.phaseProgress)
      ? Math.max(0, Math.min(100, Math.round(lastProgress.phaseProgress * 100)))
      : null;
    const stages = DOWNLOAD_PHASES.map((phase) => {
      const stageState = getStageState(phase, buttonState);
      const isCurrent = lastProgress && lastProgress.phase === phase;
      const meta = isCurrent ? getProgressLabel(lastProgress) : '';
      const icon = stageState === 'done' ? '&#10003;' : stageState === 'error' ? '!' : stageState === 'cancelled' ? '&#8211;' : stageState === 'active' ? '&#9679;' : '&#9675;';
      return `
        <div class="gzp-progress-stage" data-stage-state="${stageState}">
          <span class="gzp-stage-icon">${icon}</span>
          <span class="gzp-stage-name">${escapeHTML(getPhaseLabel(phase))}</span>
          <span class="gzp-stage-meta">${escapeHTML(meta)}</span>
        </div>`;
    }).join('');

    const errorBlock = buttonState === BTN_STATES.ERROR && lastError ? `
      <div class="gzp-error-detail">
        <strong>${escapeHTML(lastError.message || String(lastError))}</strong>
        <span>${escapeHTML(getErrorDetails(lastError))}</span>
      </div>` : '';
    const resultBlock = buttonState === BTN_STATES.DONE && lastResult ? `
      <div class="gzp-result-detail">
        <div><span>${escapeHTML(t('download_progress.result_filename'))}</span><strong>${escapeHTML(lastResult.filename || '')}</strong></div>
        <div><span>${escapeHTML(t('download_progress.result_file_count'))}</span><strong>${escapeHTML(lastResult.fileCount || 0)}</strong></div>
        <div><span>${escapeHTML(t('download_progress.source_size'))}</span><strong>${escapeHTML(formatBytes(lastResult.sourceSizeBytes))}</strong></div>
        <div><span>${escapeHTML(t('download_progress.zip_size'))}</span><strong>${escapeHTML(formatBytes(lastResult.zipSizeBytes))}</strong></div>
      </div>` : '';
    const currentPath = lastProgress && lastProgress.currentPath && buttonState === BTN_STATES.LOADING
      ? `<div class="gzp-current-path">${escapeHTML(lastProgress.currentPath)}</div>`
      : '';
    const footer = buttonState === BTN_STATES.LOADING
      ? `<button type="button" class="gzp-panel-action gzp-cancel-download" ${isCancelling ? 'disabled' : ''}>${escapeHTML(isCancelling ? t('download_btn.cancelling') : t('download_progress.cancel'))}</button>`
      : buttonState === BTN_STATES.ERROR
        ? `<button type="button" class="gzp-panel-action gzp-copy-error">${escapeHTML(t('download_progress.copy_details'))}</button>
           <button type="button" class="gzp-panel-action gzp-retry-download">${escapeHTML(t('download_progress.retry'))}</button>
           <button type="button" class="gzp-panel-action gzp-clear-result">${escapeHTML(t('download_progress.clear_result'))}</button>`
        : `<button type="button" class="gzp-panel-action gzp-new-download">${escapeHTML(t('download_progress.download_again'))}</button>
           <button type="button" class="gzp-panel-action gzp-clear-result">${escapeHTML(t('download_progress.clear_result'))}</button>`;

    const terminalStatus = buttonState === BTN_STATES.DONE
      ? t('download_progress.completed')
      : buttonState === BTN_STATES.ERROR
        ? t('download_progress.failed')
        : buttonState === BTN_STATES.CANCELLED
          ? t('download_progress.cancelled')
          : '';

    downloadPanel.innerHTML = `
      <div class="gzp-panel-header">
        <div class="gzp-panel-heading">
          <strong>${escapeHTML(t('download_progress.title'))}</strong>
          <span>${escapeHTML(terminalStatus)}</span>
        </div>
        <button type="button" class="gzp-panel-toggle" title="${escapeHTML(t('download_progress.collapse'))}" aria-label="${escapeHTML(t('download_progress.collapse'))}">${getChevronIconHTML(true)}</button>
      </div>
      <div class="gzp-stage-list">${stages}</div>
      <div class="gzp-progress-track ${progressPercent === null && buttonState === BTN_STATES.LOADING ? 'gzp-progress-track--indeterminate' : ''}">
        <span style="width: ${progressPercent === null ? 100 : progressPercent}%"></span>
      </div>
      ${currentPath}
      ${resultBlock}
      ${errorBlock}
      <div class="gzp-panel-footer">${footer}</div>`;

    const cancelButton = downloadPanel.querySelector('.gzp-cancel-download');
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        if (!activeDownload || isCancelling) return;
        isCancelling = true;
        setBtnState(BTN_STATES.LOADING);
        renderProgressPanel();
        activeDownload.cancel();
      });
    }
    const copyButton = downloadPanel.querySelector('.gzp-copy-error');
    if (copyButton) copyButton.addEventListener('click', copyErrorDetails);
    const retryButton = downloadPanel.querySelector('.gzp-retry-download');
    if (retryButton) retryButton.addEventListener('click', () => startDownload(lastDownloadItems));
    const newDownloadButton = downloadPanel.querySelector('.gzp-new-download');
    if (newDownloadButton) {
      newDownloadButton.addEventListener('click', () => startDownload(selectedItems.size > 0 ? selectedItems : lastDownloadItems));
    }
    const clearButton = downloadPanel.querySelector('.gzp-clear-result');
    if (clearButton) clearButton.addEventListener('click', resetBtnToIdle);
    const toggleButton = downloadPanel.querySelector('.gzp-panel-toggle');
    if (toggleButton) toggleButton.addEventListener('click', () => setPanelCollapsed(true));
  }

  function showErrorNotification(error) {
    chrome.storage.local.get([STORAGE.NOTIFY_SHOW], (res) => {
      if (res[STORAGE.NOTIFY_SHOW] !== false) {
        chrome.runtime.sendMessage({
          type: 'GZP_SHOW_ERROR_NOTIFICATION',
          message: error.message,
        });
      }
    });
  }

  function startDownload(items) {
    if (!items || items.size === 0 || !window.GZPDownloader) return;
    if (activeDownload && downloadBtn && downloadBtn.dataset.state === BTN_STATES.LOADING) return;

    lastDownloadItems = new Map(items);
    lastProgress = { phase: 'scan', phaseProgress: null, totalFiles: 0, totalBytes: 0 };
    lastError = null;
    lastResult = null;
    isCancelling = false;
    panelCollapsed = false;
    panelState = BTN_STATES.LOADING;

    const btn = ensureDownloadButton();
    btn.classList.remove('gzp-download-btn--hidden');
    setBtnState(BTN_STATES.LOADING);
    renderResultToggle();
    renderProgressPanel();

    activeDownload = window.GZPDownloader.start(lastDownloadItems, {
      onProgress: (progress) => {
        if (!downloadBtn || downloadBtn.dataset.state !== BTN_STATES.LOADING) return;
        lastProgress = progress;
        setBtnState(BTN_STATES.LOADING);
        renderProgressPanel();
      },
      onDone: (result) => {
        activeDownload = null;
        lastResult = result;
        lastProgress = { ...lastProgress, phase: 'save', phaseProgress: 1 };
        panelState = BTN_STATES.DONE;
        setBtnState(BTN_STATES.IDLE);
        updateDownloadButton();
        renderResultToggle();
        renderProgressPanel();
      },
      onCancel: () => {
        activeDownload = null;
        isCancelling = false;
        panelState = BTN_STATES.CANCELLED;
        setBtnState(BTN_STATES.IDLE);
        updateDownloadButton();
        renderResultToggle();
        renderProgressPanel();
      },
      onError: (error) => {
        activeDownload = null;
        isCancelling = false;
        lastError = error;
        panelState = BTN_STATES.ERROR;
        setBtnState(BTN_STATES.IDLE);
        updateDownloadButton();
        renderResultToggle();
        renderProgressPanel();
        showErrorNotification(error);
      },
    });
  }

  function ensureDownloadButton() {
    if (downloadControl && downloadBtn && document.body.contains(downloadControl)) {
      // Ensure button has correct position class
      updateButtonPosition();
      return downloadBtn;
    }

    const control = document.createElement('div');
    control.id = 'gzp-download-control';
    control.className = 'gzp-download-control gzp-download-control--hidden';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'gzp-download-btn';
    btn.className = 'gzp-download-btn gzp-download-btn--hidden';
    btn.dataset.state = BTN_STATES.IDLE;
    btn.innerHTML = getBtnHTML(BTN_STATES.IDLE);

    btn.addEventListener('click', () => {
      const state = btn.dataset.state || BTN_STATES.IDLE;
      if (state !== BTN_STATES.IDLE) return;

      if (!window.GZPDownloader) {
        alert('GitZip Pro: downloader not loaded. Please reload the page.');
        return;
      }

      startDownload(selectedItems);
    });

    const resultButton = document.createElement('button');
    resultButton.type = 'button';
    resultButton.id = 'gzp-download-result-toggle';
    resultButton.className = 'gzp-download-result-toggle gzp-result-toggle--hidden';
    resultButton.setAttribute('aria-controls', 'gzp-download-panel');
    resultButton.addEventListener('click', () => setPanelCollapsed(!panelCollapsed));
    control.appendChild(btn);
    control.appendChild(resultButton);
    document.body.appendChild(control);
    const panel = document.createElement('section');
    panel.id = 'gzp-download-panel';
    panel.className = 'gzp-download-panel gzp-download-panel--hidden';
    panel.setAttribute('aria-live', 'polite');
    document.body.appendChild(panel);
    downloadControl = control;
    downloadBtn = btn;
    resultToggleBtn = resultButton;
    downloadPanel = panel;
    applyDownloadTheme(extensionTheme);
    updateButtonPosition();
    return btn;
  }

  function updateButtonPosition() {
    if (!downloadControl) return;

    // Remove existing position classes
    const positionedElements = [downloadControl, downloadPanel].filter(Boolean);
    positionedElements.forEach(element => element.classList.remove(
      'gzp-pos-bottom-right',
      'gzp-pos-top-left',
      'gzp-pos-top-right',
      'gzp-pos-bottom-left',
      'gzp-pos-top-center',
      'gzp-pos-bottom-center',
      'gzp-pos-left-center',
      'gzp-pos-right-center'
    ));

    // Add new position class
    positionedElements.forEach(element => element.classList.add(`gzp-pos-${buttonPosition}`));
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
    syncDownloadControlState();
  }

  // ─── 清除所有选中状态（页面跳转时调用）────────────────────────────────

  function clearAllSelections() {
    if (isNavigating) return;  // 防止重复清除
    isNavigating = true;

    console.log('[GitZip Pro] Clearing all selections');
    clearContextMenuSelection();

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

    // 清除行标记，允许重新注入 - 清除两种标记方式
    const markedRowsByAttr = document.querySelectorAll(`[${ROW_MARK}]`);
    markedRowsByAttr.forEach(row => {
      row.removeAttribute(ROW_MARK);
    });

    // 清除类标记
    const markedRowsByClass = document.querySelectorAll('.gzp-row-initialized');
    markedRowsByClass.forEach(row => {
      row.classList.remove('gzp-row-initialized');
    });

    clearTimeout(cleanupTimeout);
    // 使用更短的延迟并添加重试机制
    cleanupTimeout = setTimeout(() => {
      attachAllRows();
      // 添加二次检查，确保所有行都被处理
      setTimeout(() => {
        const rows = getFileRows();
        const markedRowsAfter = document.querySelectorAll('.gzp-row-initialized');
        if (rows.length > 0 && rows.length !== markedRowsAfter.length) {
          logDebug(`Rows mismatch: found ${rows.length} rows but only ${markedRowsAfter.length} marked, retrying`);
          // 清除标记并重试
          rows.forEach(row => row.classList.remove('gzp-row-initialized'));
          attachAllRows();
        }
      }, 500);
      logDebug('Re-attached rows after navigation');
    }, 300);
  }

  // MutationObserver: watches for GitHub's SPA DOM replacements
  const bodyObserver = new MutationObserver((mutations) => {
    let hasRelevantChanges = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 更积极的检测，类似用户脚本
            if (node.classList && node.classList.contains('js-navigation-container')) {
              hasRelevantChanges = true;
              break;
            }
            if (node.querySelector && (
              node.querySelector('a[href*="/blob/"]') ||
              node.querySelector('a[href*="/tree/"]') ||
              node.querySelector('table[aria-label="Files"]') ||
              node.querySelector('.js-navigation-container') ||
              node.querySelector('.react-directory-row-default-container') ||
              node.querySelector('.js-navigation-item')
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
      cleanupTimeout = setTimeout(attachAllRows, 50); // 更短的延迟
    }
  });

  // Intercept history.pushState
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(onNavigate, 100);
  };

  window.addEventListener('popstate', onNavigate);

  // Turbo navigation (GitHub's modern SPA framework)
  document.addEventListener('turbo:load', onNavigate);
  document.addEventListener('turbo:render', onNavigate);

  // GitHub's older pjax navigation system
  document.addEventListener('pjax:end', onNavigate);
  document.addEventListener('pjax:success', onNavigate);

  // 监听 beforeunload 事件（传统页面刷新/跳转）
  window.addEventListener('beforeunload', () => {
    console.log('[GitZip Pro] beforeunload, clearing selections');
    clearAllSelections();
  });

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 页面重新可见时，清除行标记 允许重新注入
      const markedRows = document.querySelectorAll(`[${ROW_MARK}]`);
      markedRows.forEach(row => {
        row.removeAttribute(ROW_MARK);
      });

      // 同时清除类标记
      const markedRowsByClass = document.querySelectorAll('.gzp-row-initialized');
      markedRowsByClass.forEach(row => {
        row.classList.remove('gzp-row-initialized');
      });

      setTimeout(() => {
        attachAllRows();
        logDebug('Page became visible, re-attached rows');
      }, 100); // 更短的延迟
    }
  });

  // ─── Accent Color Handling ─────────────────────────────────────────────

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
    const rgb = hexToRgb(color);
    const hoverColor = darkenColor(color, 20);

    document.documentElement.style.setProperty('--gzp-primary-color', color);
    document.documentElement.style.setProperty('--gzp-primary-hover', hoverColor);
    document.documentElement.style.setProperty('--gzp-primary-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
    document.documentElement.style.setProperty('--gzp-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }

  // Listen for accent color changes from options page
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'GZP_ACCENT_COLOR_CHANGED' && message.color) {
      applyAccentColor(message.color);
    }
  });

  // Load saved accent color on page load
  chrome.storage.local.get([STORAGE.ACCENT_COLOR], (res) => {
    if (res[STORAGE.ACCENT_COLOR]) {
      applyAccentColor(res[STORAGE.ACCENT_COLOR]);
    }
  });

  // 添加额外的页面加载事件监听器，类似用户脚本
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(attachAllRows, 100);
  });

  window.addEventListener('load', () => {
    setTimeout(attachAllRows, 100);
  });

  // ─── Load settings from storage ──────────────────────────────────────────

  // Settings state
  let showFileSizes = DEFAULTS.SHOW_FILE_SIZES;
  let doubleClickSelect = DEFAULTS.DOUBLE_CLICK_SELECT;

  // 文件大小请求控制器 用于取消未完成的请求
  const fileSizeAbortControllers = new Map();

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE.THEME, STORAGE.BUTTON_POSITION, STORAGE.SHOW_FILE_SIZES, STORAGE.DOUBLE_CLICK_SELECT], (res) => {
        applyDownloadTheme(res[STORAGE.THEME] || DEFAULTS.THEME);
        const savedPosition = res[STORAGE.BUTTON_POSITION] || DEFAULTS.BUTTON_POSITION;
        if (buttonPosition !== savedPosition) {
          buttonPosition = savedPosition;
          updateButtonPosition();
        }

        showFileSizes = res[STORAGE.SHOW_FILE_SIZES] !== false;
        doubleClickSelect = res[STORAGE.DOUBLE_CLICK_SELECT] !== false;

        resolve();
      });
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    logDebug('Initializing GitZip Pro');

    // ✅ 首先加载设置 确保所有设置值正确后才进行后续操作
    await loadSettings();

    // Listen for storage changes (when user updates settings)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' || namespace === 'sync') {
        if (changes[STORAGE.THEME]) {
          applyDownloadTheme(changes[STORAGE.THEME].newValue || DEFAULTS.THEME);
        }

        if (changes[STORAGE.BUTTON_POSITION]) {
          buttonPosition = changes[STORAGE.BUTTON_POSITION].newValue || DEFAULTS.BUTTON_POSITION;
          updateButtonPosition();
        }

        if (changes[STORAGE.SHOW_FILE_SIZES]) {
          showFileSizes = changes[STORAGE.SHOW_FILE_SIZES].newValue !== false;

          if (showFileSizes) {
            // 开启时 重新为所有行显示文件大小
            const rows = getFileRows();
            rows.forEach(row => {
              displayFileSizeInRow(row);
            });
          } else {
            // 关闭时 立即清理所有已显示的文件大小和取消请求
            clearAllFileSizes();
          }
        }

        if (changes[STORAGE.DOUBLE_CLICK_SELECT]) {
          doubleClickSelect = changes[STORAGE.DOUBLE_CLICK_SELECT].newValue !== false;
        }

        if (changes[STORAGE.LANGUAGE]) {
          const newLocale = changes[STORAGE.LANGUAGE].newValue || DEFAULTS.LANGUAGE;
          // Reload translations and refresh UI text
          if (window.GZP_I18N && typeof window.GZP_I18N.reloadLocale === 'function') {
            window.GZP_I18N.reloadLocale(newLocale).then(() => {
              // Refresh download button text if in idle state
              if (downloadBtn && document.body.contains(downloadBtn)) {
                const currentState = downloadBtn.dataset.state || BTN_STATES.IDLE;
                setBtnState(currentState);
                if (currentState === BTN_STATES.IDLE) {
                  const badge = downloadBtn.querySelector('.gzp-btn-badge');
                  if (badge) badge.textContent = selectedItems.size || '';
                }
                renderResultToggle();
                renderProgressPanel();
              }
              // Refresh checkbox aria-labels
              document.querySelectorAll('.gzp-checkbox').forEach(cb => {
                cb.setAttribute('aria-label', t('checkbox.select_for_download'));
              });
            });
          }
        }
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    // Init i18n translations before creating UI elements
    if (window.GZP_I18N && typeof window.GZP_I18N.init === 'function') {
      await window.GZP_I18N.init();
    }

    ensureDownloadButton();

    // ✅ 现在attachAllRows是在设置完全加载完成后才执行
    // 此时showFileSizes已经是正确的值 不会再用默认true值
    attachAllRows();

    // 关键：拦截所有链接点击
    interceptLinkClicks();

    // 添加上下文菜单消息监听器
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GZP_DOWNLOAD_CONTEXT_ITEM') {
        const hasCurrentItem = lastRightClickedRow &&
          document.contains(lastRightClickedRow) &&
          lastRightClickedHref;

        if (!hasCurrentItem) {
          sendResponse({ ok: false, error: 'Context menu item is no longer available' });
          return false;
        }

        handleContextMenuDownload(lastRightClickedHref);
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });

    // Right-button pointerdown runs before contextmenu, giving the background
    // worker the earliest possible chance to preload the next row's title.
    document.addEventListener('pointerdown', (event) => {
      const isRightClick = event.button === 2 || (event.button === 0 && event.ctrlKey);
      if (!isRightClick) return;

      const row = getContextMenuRow(event);
      if (row) {
        prepareContextMenuItem(row, true);
      } else {
        clearContextMenuSelection();
      }
    }, true);

    // Keyboard-triggered menus have no pointerdown, so contextmenu repeats the
    // preparation as a fallback and also clears stale state outside file rows.
    document.addEventListener('contextmenu', (event) => {
      const row = getContextMenuRow(event);
      if (row) {
        prepareContextMenuItem(row, true);
      } else {
        clearContextMenuSelection();
      }
    }, true);

    logDebug('Initialization complete');
  }

  // Listen for locale changes from options page and refresh button text
  document.addEventListener('gzp-locale-changed', () => {
    if (downloadBtn && document.body.contains(downloadBtn)) {
      const currentState = downloadBtn.dataset.state || BTN_STATES.IDLE;
      setBtnState(currentState);
      if (currentState === BTN_STATES.IDLE) {
        const badge = downloadBtn.querySelector('.gzp-btn-badge');
        if (badge) badge.textContent = selectedItems.size || '';
      }
      renderResultToggle();
      renderProgressPanel();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
