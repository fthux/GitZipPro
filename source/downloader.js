/**
 * GitZip Pro - downloader.js
 *
 * Handles:
 *  1. Parsing GitHub file/folder URLs into { owner, repo, branch, path, type }
 *  2. Fetching file contents via GitHub API directly
 *  3. Recursively traversing directories
 *  4. Building a JSZip archive preserving the original tree structure
 *  5. Triggering the browser download
 *
 * Exposes window.GZPDownloader for use by content.js.
 *
 * Requires jszip.min.js to be loaded before this script.
 *
 * GitHub API endpoints used:
 *   GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}
 *   → File:  { type:"file", name, path, content:<base64>, encoding:"base64" }
 *   → Dir:   [ { type:"file"|"dir", name, path, ... }, ... ]
 */

(function (global) {
  'use strict';
  const C = globalThis.GZP_CONSTANTS;
  const STORAGE = C.STORAGE_KEYS;
  const DEFAULTS = C.DEFAULTS;

  /**
   * I18n helper — falls back to key if GZP_I18N not available,
   * and falls back to English text if localization not loaded yet.
   */
  function t(key, vars) {
    if (global.GZP_I18N) {
      const result = global.GZP_I18N.t(key, vars);
      // If the result equals the key (translation not found), use English fallback
      if (result !== key) return result;
    }
    // Hardcoded English fallback for downloader messages
    switch (key) {
      case 'downloader.scanning': return 'Scanning…';
      case 'downloader.files_progress': return `${vars ? vars.completed : 0} / ${vars ? vars.total : 0} files`;
      case 'downloader.packing_zip': return 'Packing ZIP…';
      case 'downloader.no_files_found': return 'No files found in selection.';
      case 'downloader.all_skipped': return `All selected items were skipped by ignore rules (${vars ? vars.count : 0} item(s) excluded). Check your ignore settings if this is not intended.`;
      case 'downloader.no_valid_items': return 'No valid GitHub items selected.';
      default: return key;
    }
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  const GITHUB_API_BASE = C.URLS.GITHUB_API_BASE;
  const CONCURRENCY_LIMIT = C.DOWNLOAD.CONCURRENCY_LIMIT;
  const MAX_FILE_COUNT = C.DOWNLOAD.MAX_FILE_COUNT;

  // ─── URL Parser ───────────────────────────────────────────────────────────

  /**
   * Parses a full GitHub URL into its components.
   *
   * Supported patterns:
   *   https://github.com/owner/repo                        → tree root
   *   https://github.com/owner/repo/tree/branch[/path]    → directory
   *   https://github.com/owner/repo/blob/branch/path      → file
   *
   * @param {string} href  Full URL or pathname from the row element.
   * @returns {{ owner, repo, branch, path, type: 'file'|'dir' } | null}
   */
  function parseGitHubUrl(href) {
    // Normalise — might be a relative pathname like /owner/repo/tree/main/...
    let url;
    try {
      url = new URL(href, 'https://github.com');
    } catch {
      return null;
    }

    if (url.hostname !== 'github.com') return null;

    // Remove leading slash and split
    const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
    // parts[0] = owner, parts[1] = repo, parts[2] = 'tree'|'blob'|undefined
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    const seg3 = parts[2]; // 'tree', 'blob', or undefined

    if (!seg3 || seg3 === 'tree') {
      const branch = parts[3] || 'HEAD';
      const path = parts.slice(4).join('/');
      return { owner, repo, branch, path, type: 'dir' };
    }

    if (seg3 === 'blob') {
      const branch = parts[3] || 'HEAD';
      const path = parts.slice(4).join('/');
      return { owner, repo, branch, path, type: 'file' };
    }

    return null;
  }

  // ─── Concurrency limiter ──────────────────────────────────────────────────

  /**
   * Runs an array of async task-factories with at most `limit` concurrent.
   */
  async function withConcurrency(limit, tasks) {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < tasks.length) {
        const current = index++;
        results[current] = await tasks[current]();
      }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  // ─── GitHub API fetch helpers ─────────────────────────────────────────────

  /**
   * Builds request headers for GitHub API
   */
  function buildHeaders(githubToken = '', tokenAccessMode = 'anonymous') {
    const headers = {
      'Accept': 'application/vnd.github.v3+json'
    };

    // Add authentication header if using custom token mode with valid token
    if (githubToken && tokenAccessMode === 'custom') {
      headers['Authorization'] = `token ${githubToken}`;
    }

    return headers;
  }

  /**
   * Fetches from GitHub API with retries on 429 (rate-limit) and 403 (rate-limit).
   */
  async function githubFetch(apiPath, signal, githubToken = '', tokenAccessMode = 'anonymous', attempt = 0) {
    const fullUrl = `${GITHUB_API_BASE}${apiPath}`;
    const headers = buildHeaders(githubToken, tokenAccessMode);

    let resp;
    try {
      resp = await fetch(fullUrl, { headers, signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error(`Network error: ${e.message}`);
    }

    // Handle rate limiting (429 Too Many Requests or 403 Forbidden with rate limit info)
    if ((resp.status === 429 || resp.status === 403) && attempt < 3) {
      // Check for Retry-After header
      const retryAfter = resp.headers.get('Retry-After');
      const wait = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 2000;
      await new Promise(r => setTimeout(r, wait));
      return githubFetch(apiPath, signal, githubToken, tokenAccessMode, attempt + 1);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`GitHub API ${resp.status}: ${text.slice(0, 120)}`);
    }

    return resp.json();
  }

  /**
   * Fetches a single file from GitHub API and returns its binary content.
   * The API returns the GitHub Contents API shape with base64 `content`.
   *
   * Handles symlinks by resolving the target and re-fetching the actual file.
   *
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @param {string} path
   * @param {AbortSignal} signal
   * @param {string} githubToken
   * @param {string} tokenAccessMode
   * @param {number} symlinkDepth  Internal - tracks symlink resolution depth to prevent loops
   * @returns {Uint8Array}
   */
  async function fetchFile(owner, repo, branch, path, signal, githubToken = '', tokenAccessMode = 'anonymous', symlinkDepth = 0) {
    if (symlinkDepth > 10) {
      throw new Error(`Symlink resolution exceeded max depth for: ${path}`);
    }

    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIFilePath(path)}?ref=${branch}`;
    const data = await githubFetch(apiPath, signal, githubToken, tokenAccessMode);

    // Handle symlinks - resolve the target and fetch the actual file
    if (data.type === 'symlink' && data.target) {
      let target = data.target;
      // If target is absolute (starts with /), it's relative to repo root
      // If target is relative, it's relative to the directory containing the symlink
      if (!target.startsWith('/')) {
        const dir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
        target = dir ? `${dir}/${target}` : target;
      } else {
        // Remove leading '/' for a clean repo-relative path
        target = target.slice(1);
      }
      // Normalize 'foo/../bar' → 'bar' path segments
      const normalizedTarget = normalizePath(target);
      return fetchFile(owner, repo, branch, normalizedTarget, signal, githubToken, tokenAccessMode, symlinkDepth + 1);
    }

    if (data.type !== 'file') {
      throw new Error(`Unexpected response for file: ${path} (type: ${data.type})`);
    }

    if (!data.content) {
      // Empty file - return empty Uint8Array
      return new Uint8Array(0);
    }

    // Decode base64 → binary
    const b64 = data.content.replace(/\s/g, '');
    return base64ToUint8Array(b64);
  }

  /**
   * Lists the contents of a directory via GitHub API.
   * @returns {Array<{ type, name, path }>}
   */
  async function listDir(owner, repo, branch, path, signal, githubToken = '', tokenAccessMode = 'anonymous') {
    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIFilePath(path)}?ref=${branch}`;
    const data = await githubFetch(apiPath, signal, githubToken, tokenAccessMode);

    if (!Array.isArray(data)) {
      throw new Error(`Expected directory listing for: ${path}`);
    }
    return data;
  }

  // ─── Recursive traversal ──────────────────────────────────────────────────

  /**
   * Recursively collects all files under a directory.
   * Populates `fileList` with { path: string, fetch: () => Promise<Uint8Array> }.
   * Tracks ignored files in stats.ignoredCount and stats.ignoredFiles.
   */
  async function collectFiles(owner, repo, branch, dirPath, fileList, signal, depth = 0, ignoreRules = [], stats = { ignoredCount: 0, ignoredFiles: [] }, githubToken = '', tokenAccessMode = 'anonymous') {
    if (depth > 20) throw new Error(`Max depth exceeded at: ${dirPath}`);
    if (fileList.length >= MAX_FILE_COUNT) return;

    const entries = await listDir(owner, repo, branch, dirPath, signal, githubToken, tokenAccessMode);

    for (const entry of entries) {
      if (fileList.length >= MAX_FILE_COUNT) break;

      if (isIgnored(entry.path, entry.type, ignoreRules)) {
        stats.ignoredCount++;
        stats.ignoredFiles.push(entry.path);
        continue;
      }

      if (entry.type === 'file' || entry.type === 'symlink') {
        const entryPath = entry.path;
        fileList.push({
          path: entryPath,
          sizeBytes: Number.isFinite(entry.size) ? entry.size : null,
          fetch: () => fetchFile(owner, repo, branch, entryPath, signal, githubToken, tokenAccessMode),
        });
      } else if (entry.type === 'dir') {
        // Recurse synchronously to keep depth-first ordering
        await collectFiles(owner, repo, branch, entry.path, fileList, signal, depth + 1, ignoreRules, stats, githubToken, tokenAccessMode);
      }
    }
  }

  // ─── Main download entry point ────────────────────────────────────────────

  /**
   * Called by content.js when the user clicks Download.
   *
   * @param {Map<Element, string>} selectedItems  row → GitHub URL
   * @param {object} callbacks
   * @param {(current:number, total:number, label:string) => void} callbacks.onProgress
   * @param {() => void} callbacks.onDone
   * @param {(err: Error) => void} callbacks.onError
   */
  async function start(selectedItems, callbacks = {}) {
    const { onProgress, onDone, onError } = callbacks;

    const abortCtrl = new AbortController();
    const { signal } = abortCtrl;

    // ① Read all settings from storage
    let settings;
    try {
      settings = await getSettings();
    } catch {
      settings = { namingPreset: DEFAULTS.NAMING_PRESET, namingCustom: DEFAULTS.NAMING_CUSTOM, notifyShow: DEFAULTS.NOTIFY_SHOW, notifySound: DEFAULTS.NOTIFY_SOUND, notifyOpen: DEFAULTS.NOTIFY_OPEN, ignoreLabels: [], ignoreCustomVars: [], githubToken: '', tokenAccessMode: DEFAULTS.TOKEN_ACCESS_MODE };
    }
    const { namingPreset, namingCustom, notifyShow, notifySound, notifyOpen, ignoreLabels, ignoreCustomVars, githubToken, tokenAccessMode } = settings;

    const compiledIgnoreRules = compileIgnoreRules(ignoreLabels || [], ignoreCustomVars || []);

    // ② Parse all selected URLs
    const parsed = [];
    for (const [, href] of selectedItems) {
      const info = parseGitHubUrl(href);
      if (info) parsed.push(info);
    }

    if (parsed.length === 0) {
      onError && onError(new Error(t('downloader.no_valid_items')));
      return abortCtrl;
    }

    const { owner, repo, branch } = parsed[0];
    const zipRoot = `${repo}-${branch}`;

    try {
      // ③ Collect all files to download (traverse dirs recursively)
      onProgress && onProgress(0, 0, t('downloader.scanning'));

      const fileList = []; // { path: string, fetch: fn }
      let totalIgnored = 0;
      let totalIgnoredFiles = [];

      for (const item of parsed) {
        if (isIgnored(item.path, item.type, compiledIgnoreRules)) {
          totalIgnored++;
          totalIgnoredFiles.push(item.path);
          continue;
        }

        if (item.type === 'file') {
          fileList.push({
            path: item.path,
            sizeBytes: null,
            fetch: () => fetchFile(item.owner, item.repo, item.branch, item.path, signal, githubToken, tokenAccessMode),
          });
        } else {
          const stats = { ignoredCount: 0, ignoredFiles: [] };
          await collectFiles(item.owner, item.repo, item.branch, item.path, fileList, signal, 0, compiledIgnoreRules, stats, githubToken, tokenAccessMode);
          totalIgnored += stats.ignoredCount;
          totalIgnoredFiles.push(...stats.ignoredFiles);
        }
      }

      if (fileList.length === 0) {
        if (totalIgnored > 0) {
          throw new Error(t('downloader.all_skipped', { count: totalIgnored }));
        } else {
          throw new Error(t('downloader.no_files_found'));
        }
      }

      const total = fileList.length;
      onProgress && onProgress(0, total, t('downloader.files_progress', { completed: 0, total }));

      // ── ZIP mode (default) ────────────────────────────────────────────
      const zip = new JSZip();
      let completed = 0;

      const tasks = fileList.map(item => async () => {
        const bytes = await item.fetch();
        if (item.sizeBytes == null) {
          item.sizeBytes = bytes.length;
        }
        zip.file(`${zipRoot}/${item.path}`, bytes);
        completed++;
        onProgress && onProgress(completed, total, t('downloader.files_progress', { completed, total }));
      });

      await withConcurrency(CONCURRENCY_LIMIT, tasks);

      onProgress && onProgress(total, total, t('downloader.packing_zip'));

      const base64 = await zip.generateAsync({
        type: 'base64',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const template = (namingCustom && namingCustom.trim() !== '') ? namingCustom.trim() : namingPreset;
      const now = new Date();
      const ts = now.toISOString().slice(0, 10).replace(/-/g, '');
      const date = now.toISOString().slice(0, 10);
      const datetime = `${ts}-${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;

      // Process path name: empty for root directory, otherwise take last folder name
      const pathName = parsed[0].path ? parsed[0].path.split('/').pop() : '';

      let zipName = template
        .replace(/{owner}/g, owner)
        .replace(/{repo}/g, repo)
        .replace(/{branch}/g, branch)
        .replace(/{path}/g, pathName)
        .replace(/{date}/g, date)
        .replace(/{datetime}/g, datetime)
        .replace(/{ts}/g, ts);

      if (!zipName.toLowerCase().endsWith('.zip')) {
        zipName += '.zip';
      }

      if (notifySound) {
        playDing();
      }

      // Create history record with download details
      const historyRecord = {
        timestamp: Date.now(),
        owner: parsed[0].owner,
        repo: parsed[0].repo,
        branch: parsed[0].branch,
        path: parsed[0].path || '',
        type: parsed[0].type,
        downloadName: zipName,
        files: fileList.map(item => item.path),
        fileDetails: fileList.map(item => ({
          path: item.path,
          sizeBytes: Number.isFinite(item.sizeBytes) ? item.sizeBytes : null
        })),
        fileCount: fileList.length,
        ignoredCount: totalIgnored,
        ignoredFiles: totalIgnoredFiles
      };

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'GZP_DOWNLOAD_FILE',
            filename: zipName,
            base64,
            mimeType: 'application/zip',
            notifyShow,
            notifyOpen,
            historyRecord: historyRecord
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!resp || !resp.ok) {
              return reject(new Error((resp && resp.error) || 'Download failed in background'));
            }
            resolve(resp.downloadId);
          }
        );
      });

      onDone && onDone();

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[GitZip Pro] Download error:', err);
        onError && onError(err);
      }
    }

    return abortCtrl;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STORAGE.NAMING_PRESET, STORAGE.NAMING_CUSTOM, STORAGE.NOTIFY_SHOW, STORAGE.NOTIFY_SOUND, STORAGE.NOTIFY_OPEN, STORAGE.IGNORE_LABELS, STORAGE.IGNORE_CUSTOM_VARS, STORAGE.GITHUB_TOKEN, STORAGE.TOKEN_ACCESS_MODE],
        (res) => {
          resolve({
            namingPreset: res[STORAGE.NAMING_PRESET] || DEFAULTS.NAMING_PRESET,
            namingCustom: res[STORAGE.NAMING_CUSTOM] || DEFAULTS.NAMING_CUSTOM,
            notifyShow: res[STORAGE.NOTIFY_SHOW] !== false,
            notifySound: res[STORAGE.NOTIFY_SOUND] !== false,
            notifyOpen: res[STORAGE.NOTIFY_OPEN] === true,
            ignoreLabels: res[STORAGE.IGNORE_LABELS],
            ignoreCustomVars: res[STORAGE.IGNORE_CUSTOM_VARS] || [],
            githubToken: res[STORAGE.GITHUB_TOKEN] || '',
            tokenAccessMode: res[STORAGE.TOKEN_ACCESS_MODE] || DEFAULTS.TOKEN_ACCESS_MODE
          });
        }
      );
    });
  }

  function playDing() {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.warn('Audio play failed', err);
    }
  }

  /**
   * Encode a file path for use in a URL, preserving slashes.
   */
  function encodeURIFilePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  /**
   * Decode a base64 string to a Uint8Array without exceeding the call-stack.
   */
  function base64ToUint8Array(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Normalize a file path by resolving '.' and '..' segments.
   * e.g. "foo/../bar/baz" → "bar/baz", "./a/./b" → "a/b"
   */
  function normalizePath(path) {
    const parts = path.split('/');
    const result = [];
    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        if (result.length > 0) result.pop();
        continue;
      }
      result.push(part);
    }
    return result.join('/');
  }

  // ─── Auto Ignore Logic ────────────────────────────────────────────────────

  const IGNORE_PRESETS = {
    common: [
      { id: 'git', rules: ['.git/', '.gitignore', '.gitattributes', '.gitmodules', '.github/'] },
      { id: 'sys', rules: ['.DS_Store', 'Thumbs.db', 'desktop.ini', '*.tmp'] },
      { id: 'deps', rules: ['node_modules/', 'vendor/', 'venv/', 'site-packages/', '__pycache__/', '*.egg-info/'] },
      { id: 'build', rules: ['dist/', 'build/', 'out/', 'target/', 'bin/', 'obj/', '*.exe', '*.dll'] },
      { id: 'logs', rules: ['*.log', '*.tmp', '*.cache', '*.lock', '*.pid'] }
    ],
    media: [
      { id: 'img', rules: ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.ico', '*.webp'] },
      { id: 'vid', rules: ['*.mp4', '*.mov', '*.avi', '*.mkv', '*.webm', '*.flv'] },
      { id: 'arc', rules: ['*.zip', '*.tar', '*.gz', '*.rar', '*.7z', '*.bz2'] },
      { id: 'doc', rules: ['docs/', '*.md', '*.rst', '*.txt', '*.pdf', '*.epub'] },
      { id: 'cfg', rules: ['.env', '*.config.js', '*.json', '*.yml', '*.yaml', '*.toml', '*.ini'] }
    ]
  };

  function compileIgnoreRules(labels, customVars) {
    const rules = [];
    const pushRules = (group) => {
      group.forEach(item => {
        if (labels.includes(item.id)) rules.push(...item.rules);
      });
    };
    pushRules(IGNORE_PRESETS.common);
    pushRules(IGNORE_PRESETS.media);
    if (customVars && customVars.length > 0) {
      rules.push(...customVars);
    }
    return rules;
  }

  function matchWildcard(str, pattern) {
    const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(str);
  }

  function isIgnored(path, type, rules) {
    if (!rules || rules.length === 0) return false;
    const filename = path.split('/').pop();

    for (const rule of rules) {
      let pattern = rule.trim();
      if (!pattern) continue;

      const isDirRule = pattern.endsWith('/');
      if (isDirRule) {
        pattern = pattern.slice(0, -1);
        const parts = path.split('/');
        // If any directory in the path matches
        if (parts.slice(0, -1).some(p => matchWildcard(p, pattern))) return true;
        // Or if this item itself is a directory and matches
        if (type === 'dir' && matchWildcard(filename, pattern)) return true;
      } else {
        // file rules apply only if the item is a file
        if (type === 'file' && matchWildcard(filename, pattern)) return true;
      }
    }
    return false;
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.GZPDownloader = { start, parseGitHubUrl };

})(window);