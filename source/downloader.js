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

  // ─── Config ───────────────────────────────────────────────────────────────

  const GITHUB_API_BASE = 'https://api.github.com';
  const CONCURRENCY_LIMIT = 5;   // max parallel fetch requests
  const MAX_FILE_COUNT = 500; // safety cap

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

    // 如果使用自定义token模式且有token，则添加认证头
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

    // 处理速率限制 (429 Too Many Requests 或 403 Forbidden with rate limit info)
    if ((resp.status === 429 || resp.status === 403) && attempt < 3) {
      // 检查是否有 Retry-After 头
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
   * @returns {Uint8Array}
   */
  async function fetchFile(owner, repo, branch, path, signal, githubToken = '', tokenAccessMode = 'anonymous') {
    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIFilePath(path)}?ref=${branch}`;
    const data = await githubFetch(apiPath, signal, githubToken, tokenAccessMode);

    if (data.type !== 'file' || !data.content) {
      throw new Error(`Unexpected response for file: ${path}`);
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

      if (entry.type === 'file') {
        const entryPath = entry.path;
        fileList.push({
          path: entryPath,
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
      settings = { namingPreset: '{repo}-{branch}-{path}_{ts}', namingCustom: '', notifyShow: true, notifySound: true, notifyOpen: false, ignoreLabels: [], ignoreCustomVars: [], githubToken: '', tokenAccessMode: 'anonymous' };
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
      onError && onError(new Error('No valid GitHub items selected.'));
      return abortCtrl;
    }

    const { owner, repo, branch } = parsed[0];
    const zipRoot = `${repo}-${branch}`;

    try {
      // ③ Collect all files to download (traverse dirs recursively)
      onProgress && onProgress(0, 0, 'Scanning…');

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
          throw new Error(`All selected items were skipped by ignore rules (${totalIgnored} item${totalIgnored > 1 ? 's' : ''} excluded). Check your ignore settings if this is not intended.`);
        } else {
          throw new Error('No files found in selection.');
        }
      }

      const total = fileList.length;
      onProgress && onProgress(0, total, `0 / ${total} files`);

      // ── ZIP mode (default) ────────────────────────────────────────────
      const zip = new JSZip();
      let completed = 0;

      const tasks = fileList.map(item => async () => {
        const bytes = await item.fetch();
        zip.file(`${zipRoot}/${item.path}`, bytes);
        completed++;
        onProgress && onProgress(completed, total, `${completed} / ${total} files`);
      });

      await withConcurrency(CONCURRENCY_LIMIT, tasks);

      onProgress && onProgress(total, total, 'Packing ZIP…');

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

      // 处理路径名称: 如果是根目录则为空 否则取最后一级文件夹名
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
      chrome.storage.sync.get(
        ['gzpNamingPreset', 'gzpNamingCustom', 'gzpNotifyShow', 'gzpNotifySound', 'gzpNotifyOpen', 'gzpIgnoreLabels', 'gzpIgnoreCustomVars', 'gzpGitHubToken', 'gzpTokenAccessMode'],
        (res) => {
          resolve({
            namingPreset: res.gzpNamingPreset || '{repo}-{branch}-{path}_{ts}',
            namingCustom: res.gzpNamingCustom || '',
            notifyShow: res.gzpNotifyShow !== false,
            notifySound: res.gzpNotifySound !== false,
            notifyOpen: res.gzpNotifyOpen === true,
            ignoreLabels: res.gzpIgnoreLabels, // undefined is handled during logic fallback
            ignoreCustomVars: res.gzpIgnoreCustomVars || [],
            githubToken: res.gzpGitHubToken || '',
            tokenAccessMode: res.gzpTokenAccessMode || 'anonymous'
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