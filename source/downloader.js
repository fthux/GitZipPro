/**
 * GitZip Pro - downloader.js
 *
 * Handles:
 *  1. Parsing GitHub file/folder URLs into { owner, repo, branch, path, type }
 *  2. Fetching file contents via GitHub API directly
 *  3. Scanning repository trees before downloading file contents
 *  4. Building a JSZip archive preserving the original tree structure
 *  5. Triggering the browser download
 *
 * Exposes window.GZPDownloader for use by content.js.
 *
 * Requires jszip.min.js to be loaded before this script.
 *
 * GitHub API endpoints used:
 *   GET /repos/{owner}/{repo}/git/matching-refs/heads/{ref}
 *   GET /repos/{owner}/{repo}/git/matching-refs/tags/{ref}
 *   GET /repos/{owner}/{repo}/git/trees/{tree_sha}[?recursive=1]
 *   GET /repos/{owner}/{repo}/git/blobs/{sha}
 *   GET /repos/{owner}/{repo}/contents/{path}?ref={branch} (compatibility fallback)
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
      case 'downloader.file_too_large': return `${vars ? vars.path : 'File'} exceeds GitHub's 100 MB API download limit.`;
      case 'downloader.file_content_unavailable': return `GitHub did not provide downloadable content for: ${vars ? vars.path : 'unknown file'}`;
      case 'downloader.file_size_mismatch': return `Downloaded size mismatch for ${vars ? vars.path : 'file'}: expected ${vars ? vars.expected : '?'} bytes, received ${vars ? vars.actual : '?'} bytes.`;
      case 'downloader.too_many_files': return `The selection contains more than ${vars ? vars.limit : MAX_FILE_COUNT} files. Download cancelled. Please select a smaller folder.`;
      default: return key;
    }
  }

  // ─── Config ───────────────────────────────────────────────────────────────

  const GITHUB_API_BASE = C.URLS.GITHUB_API_BASE;
  const CONCURRENCY_LIMIT = C.DOWNLOAD.CONCURRENCY_LIMIT;
  const MAX_FILE_COUNT = C.DOWNLOAD.MAX_FILE_COUNT;
  const MAX_GITHUB_FILE_SIZE = 100 * 1024 * 1024;

  // ─── URL Parser ───────────────────────────────────────────────────────────

  function decodeUrlPart(part) {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }

  /**
   * Parses the structural URL segments without deciding where a ref ends.
   * Slash-containing refs are resolved asynchronously by resolveGitHubUrl().
   */
  function parseGitHubUrlParts(href) {
    // Normalise — might be a relative pathname like /owner/repo/tree/main/...
    let url;
    try {
      url = new URL(href, 'https://github.com');
    } catch {
      return null;
    }

    if (url.hostname !== 'github.com') return null;

    // Remove leading slash and split
    const parts = url.pathname
      .replace(/^\//, '')
      .split('/')
      .filter(Boolean)
      .map(decodeUrlPart);
    // parts[0] = owner, parts[1] = repo, parts[2] = 'tree'|'blob'|undefined
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];
    const seg3 = parts[2]; // 'tree', 'blob', or undefined

    if (!seg3) return { owner, repo, refParts: [], type: 'dir' };
    if (seg3 !== 'tree' && seg3 !== 'blob') return null;

    const refParts = parts.slice(3).flatMap(part => part.split('/')).filter(Boolean);
    return { owner, repo, refParts, type: seg3 === 'blob' ? 'file' : 'dir' };
  }

  /**
   * Synchronous compatibility parser. Call resolveGitHubUrl() when the ref
   * must be distinguished from a repository path.
   */
  function parseGitHubUrl(href) {
    const parsed = parseGitHubUrlParts(href);
    if (!parsed) return null;

    const branch = parsed.refParts[0] || 'HEAD';
    const path = parsed.refParts.slice(1).join('/');
    return { owner: parsed.owner, repo: parsed.repo, branch, path, type: parsed.type };
  }

  function selectLongestMatchingRef(refNames, refParts, type) {
    const fullPath = refParts.join('/');
    return refNames
      .filter(refName => fullPath === refName || fullPath.startsWith(`${refName}/`))
      .filter(refName => type !== 'file' || fullPath.length > refName.length)
      .sort((a, b) => b.length - a.length)[0] || null;
  }

  async function getMatchingRefNames(owner, repo, namespace, firstPart, signal, githubToken, tokenAccessMode, cache) {
    const cacheKey = `${owner}/${repo}:${namespace}:${firstPart}`;
    let pending = cache && cache.get(cacheKey);

    if (!pending) {
      const matchingPath = encodeURIFilePath(`${namespace}/${firstPart}`);
      pending = githubFetch(
        `/repos/${owner}/${repo}/git/matching-refs/${matchingPath}`,
        signal,
        githubToken,
        tokenAccessMode
      ).then(data => {
        if (!Array.isArray(data)) {
          throw new Error(`Expected matching Git refs for: ${firstPart}`);
        }

        const prefix = `refs/${namespace}/`;
        return data
          .map(item => item && typeof item.ref === 'string' ? item.ref : '')
          .filter(ref => ref.startsWith(prefix))
          .map(ref => ref.slice(prefix.length));
      });

      if (cache) cache.set(cacheKey, pending);
    }

    try {
      return await pending;
    } catch (error) {
      if (cache && cache.get(cacheKey) === pending) cache.delete(cacheKey);
      throw error;
    }
  }

  async function resolveGitHubUrl(href, signal, githubToken = '', tokenAccessMode = 'anonymous', cache = null) {
    const parsed = parseGitHubUrlParts(href);
    if (!parsed) return null;

    const { owner, repo, refParts, type } = parsed;
    const fallback = {
      owner,
      repo,
      branch: refParts[0] || 'HEAD',
      path: refParts.slice(1).join('/'),
      type,
    };

    if (refParts.length === 0 || fallback.branch === 'HEAD' || /^[0-9a-f]{7,40}$/i.test(fallback.branch)) {
      return fallback;
    }

    const branchRefs = await getMatchingRefNames(
      owner,
      repo,
      'heads',
      refParts[0],
      signal,
      githubToken,
      tokenAccessMode,
      cache
    );
    let matchedRef = selectLongestMatchingRef(branchRefs, refParts, type);

    if (!matchedRef) {
      const tagRefs = await getMatchingRefNames(
        owner,
        repo,
        'tags',
        refParts[0],
        signal,
        githubToken,
        tokenAccessMode,
        cache
      );
      matchedRef = selectLongestMatchingRef(tagRefs, refParts, type);
    }

    if (!matchedRef) return fallback;

    const fullPath = refParts.join('/');
    return {
      owner,
      repo,
      branch: matchedRef,
      path: fullPath.slice(matchedRef.length).replace(/^\//, ''),
      type,
    };
  }

  function sanitizeRefForPath(ref) {
    return String(ref || 'HEAD').replace(/[\\/]+/g, '-');
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
  function buildHeaders(githubToken = '', tokenAccessMode = 'anonymous', accept = 'application/vnd.github.v3+json') {
    const headers = {
      'Accept': accept
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
  async function githubFetchResponse(apiPath, signal, githubToken = '', tokenAccessMode = 'anonymous', accept = 'application/vnd.github.v3+json', attempt = 0) {
    const fullUrl = `${GITHUB_API_BASE}${apiPath}`;
    const headers = buildHeaders(githubToken, tokenAccessMode, accept);

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
      return githubFetchResponse(apiPath, signal, githubToken, tokenAccessMode, accept, attempt + 1);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`GitHub API ${resp.status}: ${text.slice(0, 120)}`);
    }

    return resp;
  }

  async function githubFetch(apiPath, signal, githubToken = '', tokenAccessMode = 'anonymous', accept = 'application/vnd.github.v3+json') {
    const resp = await githubFetchResponse(apiPath, signal, githubToken, tokenAccessMode, accept);
    return resp.json();
  }

  async function githubFetchBinary(apiPath, signal, githubToken = '', tokenAccessMode = 'anonymous') {
    const resp = await githubFetchResponse(
      apiPath,
      signal,
      githubToken,
      tokenAccessMode,
      'application/vnd.github.raw+json'
    );
    return new Uint8Array(await resp.arrayBuffer());
  }

  function validateFileSize(path, bytes, expectedSize) {
    if (Number.isFinite(expectedSize) && bytes.length !== expectedSize) {
      throw new Error(t('downloader.file_size_mismatch', {
        path,
        expected: expectedSize,
        actual: bytes.length,
      }));
    }
    return bytes;
  }

  async function fetchBlob(owner, repo, sha, path, expectedSize, signal, githubToken = '', tokenAccessMode = 'anonymous') {
    if (Number.isFinite(expectedSize) && expectedSize > MAX_GITHUB_FILE_SIZE) {
      throw new Error(t('downloader.file_too_large', { path }));
    }

    const blobPath = `/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(sha)}`;
    const bytes = await githubFetchBinary(blobPath, signal, githubToken, tokenAccessMode);
    return validateFileSize(path, bytes, expectedSize);
  }

  /**
   * Fetches a single file from GitHub API and returns its binary content.
   * Small files use the Contents API's base64 content. Larger files fall back
   * to the Git Blobs API's raw media type when Contents omits content.
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

    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIFilePath(path)}?ref=${encodeURIComponent(branch)}`;
    const data = await githubFetch(
      apiPath,
      signal,
      githubToken,
      tokenAccessMode,
      'application/vnd.github.object+json'
    );

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

    const expectedSize = Number.isFinite(data.size) ? data.size : null;
    if (expectedSize !== null && expectedSize > MAX_GITHUB_FILE_SIZE) {
      throw new Error(t('downloader.file_too_large', { path }));
    }

    if (data.encoding === 'base64' && typeof data.content === 'string') {
      const b64 = data.content.replace(/\s/g, '');
      return validateFileSize(path, base64ToUint8Array(b64), expectedSize);
    }

    if (expectedSize === 0) {
      return new Uint8Array(0);
    }

    if (!data.sha) {
      throw new Error(t('downloader.file_content_unavailable', { path }));
    }

    const blobPath = `/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(data.sha)}`;
    const bytes = await githubFetchBinary(blobPath, signal, githubToken, tokenAccessMode);
    return validateFileSize(path, bytes, expectedSize);
  }

  /**
   * Lists the contents of a directory via GitHub API.
   * @returns {Array<{ type, name, path }>}
   */
  async function listDir(owner, repo, branch, path, signal, githubToken = '', tokenAccessMode = 'anonymous') {
    const apiPath = `/repos/${owner}/${repo}/contents/${encodeURIFilePath(path)}?ref=${encodeURIComponent(branch)}`;
    const data = await githubFetch(apiPath, signal, githubToken, tokenAccessMode);

    if (!Array.isArray(data)) {
      throw new Error(`Expected directory listing for: ${path}`);
    }
    return data;
  }

  // ─── Repository scanning ──────────────────────────────────────────────────

  function createScanState() {
    return {
      files: [],
      fileKeys: new Set(),
      ignoredCount: 0,
      ignoredFiles: [],
      ignoredKeys: new Set(),
      limitExceeded: false,
    };
  }

  function scopedPathKey(owner, repo, branch, path) {
    return `${owner}/${repo}@${branch}:${path}`;
  }

  function recordIgnored(state, owner, repo, branch, path) {
    const key = scopedPathKey(owner, repo, branch, path);
    if (state.ignoredKeys.has(key)) return;
    state.ignoredKeys.add(key);
    state.ignoredCount++;
    state.ignoredFiles.push(path);
  }

  function addFileCandidate(state, candidate) {
    if (state.limitExceeded) return false;

    const normalizedPath = normalizePath(candidate.path);
    const key = scopedPathKey(candidate.owner, candidate.repo, candidate.branch, normalizedPath);
    if (state.fileKeys.has(key)) return true;

    if (state.files.length >= MAX_FILE_COUNT) {
      state.limitExceeded = true;
      return false;
    }

    state.fileKeys.add(key);
    state.files.push({ ...candidate, path: normalizedPath });
    return true;
  }

  function createTreeFileCandidate(group, entry, path, signal, githubToken, tokenAccessMode) {
    const sizeBytes = Number.isFinite(entry.size) ? entry.size : null;
    const isSymlink = entry.mode === '120000';

    return {
      owner: group.owner,
      repo: group.repo,
      branch: group.branch,
      path,
      sizeBytes,
      fetch: isSymlink
        ? () => fetchFile(group.owner, group.repo, group.branch, path, signal, githubToken, tokenAccessMode)
        : () => fetchBlob(group.owner, group.repo, entry.sha, path, sizeBytes, signal, githubToken, tokenAccessMode),
    };
  }

  function createContentsFileCandidate(group, path, sizeBytes, signal, githubToken, tokenAccessMode) {
    return {
      owner: group.owner,
      repo: group.repo,
      branch: group.branch,
      path,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      fetch: () => fetchFile(group.owner, group.repo, group.branch, path, signal, githubToken, tokenAccessMode),
    };
  }

  function isPathSelected(path, entryType, selectedItems) {
    return selectedItems.some(item => {
      if (item.type === 'file') return entryType === 'blob' && path === item.path;
      if (!item.path) return true;
      return path === item.path || path.startsWith(`${item.path}/`);
    });
  }

  async function getGitTree(group, treeish, recursive, signal, githubToken, tokenAccessMode, cache = null) {
    const cacheKey = recursive ? null : treeish;
    if (cacheKey && cache && cache.has(cacheKey)) return cache.get(cacheKey);

    const query = recursive ? '?recursive=1' : '';
    const apiPath = `/repos/${group.owner}/${group.repo}/git/trees/${encodeURIComponent(treeish)}${query}`;
    const data = await githubFetch(apiPath, signal, githubToken, tokenAccessMode);
    if (!data || !Array.isArray(data.tree)) {
      throw new Error(`Expected Git tree for: ${treeish}`);
    }

    if (cacheKey && cache) cache.set(cacheKey, data);
    return data;
  }

  function collectFromRecursiveTree(group, tree, state, ignoreRules, signal, githubToken, tokenAccessMode) {
    const relevantEntries = tree.filter(entry =>
      entry && typeof entry.path === 'string' && isPathSelected(entry.path, entry.type, group.items)
    );

    const ignoredDirPrefixes = [];
    const relevantDirs = relevantEntries
      .filter(entry => entry.type === 'tree')
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length);

    for (const entry of relevantDirs) {
      if (ignoredDirPrefixes.some(prefix => entry.path.startsWith(prefix))) continue;
      if (isIgnored(entry.path, 'dir', ignoreRules)) {
        recordIgnored(state, group.owner, group.repo, group.branch, entry.path);
        ignoredDirPrefixes.push(`${entry.path}/`);
      }
    }

    const matchedSelectedFiles = new Set();
    for (const entry of relevantEntries) {
      if (state.limitExceeded) break;
      if (entry.type !== 'blob') continue;

      const path = entry.path;
      if (ignoredDirPrefixes.some(prefix => path.startsWith(prefix))) continue;
      if (isIgnored(path, 'file', ignoreRules)) {
        recordIgnored(state, group.owner, group.repo, group.branch, path);
        continue;
      }

      if (group.items.some(item => item.type === 'file' && item.path === path)) {
        matchedSelectedFiles.add(path);
      }
      addFileCandidate(
        state,
        createTreeFileCandidate(group, entry, path, signal, githubToken, tokenAccessMode)
      );
    }

    for (const item of group.items) {
      if (state.limitExceeded) break;
      if (item.type !== 'file' || matchedSelectedFiles.has(item.path)) continue;
      addFileCandidate(
        state,
        createContentsFileCandidate(group, item.path, null, signal, githubToken, tokenAccessMode)
      );
    }
  }

  async function resolveDirectoryTreeish(group, dirPath, treeCache, signal, githubToken, tokenAccessMode) {
    let treeish = group.branch;
    if (!dirPath) return treeish;

    for (const segment of dirPath.split('/').filter(Boolean)) {
      const data = await getGitTree(group, treeish, false, signal, githubToken, tokenAccessMode, treeCache);
      if (data.truncated === true) throw new Error(`Non-recursive Git tree was truncated: ${dirPath}`);
      const next = data.tree.find(entry => entry.type === 'tree' && entry.path === segment);
      if (!next || !next.sha) return null;
      treeish = next.sha;
    }

    return treeish;
  }

  async function collectTreeWalk(group, treeish, basePath, state, ignoreRules, treeCache, signal, githubToken, tokenAccessMode, depth = 0) {
    if (depth > 20) throw new Error(`Max depth exceeded at: ${basePath}`);
    if (state.limitExceeded) return;

    const data = await getGitTree(group, treeish, false, signal, githubToken, tokenAccessMode, treeCache);
    if (data.truncated === true) throw new Error(`Non-recursive Git tree was truncated: ${basePath || group.branch}`);

    for (const entry of data.tree) {
      if (state.limitExceeded) break;
      if (!entry || typeof entry.path !== 'string') continue;

      const path = basePath ? `${basePath}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        if (isIgnored(path, 'dir', ignoreRules)) {
          recordIgnored(state, group.owner, group.repo, group.branch, path);
          continue;
        }
        await collectTreeWalk(group, entry.sha, path, state, ignoreRules, treeCache, signal, githubToken, tokenAccessMode, depth + 1);
      } else if (entry.type === 'blob') {
        if (isIgnored(path, 'file', ignoreRules)) {
          recordIgnored(state, group.owner, group.repo, group.branch, path);
          continue;
        }
        addFileCandidate(
          state,
          createTreeFileCandidate(group, entry, path, signal, githubToken, tokenAccessMode)
        );
      }
    }
  }

  async function collectFileFromTreeWalk(group, item, state, ignoreRules, treeCache, signal, githubToken, tokenAccessMode) {
    const parts = item.path.split('/').filter(Boolean);
    const filename = parts.pop();
    const parentPath = parts.join('/');
    const treeish = await resolveDirectoryTreeish(group, parentPath, treeCache, signal, githubToken, tokenAccessMode);
    if (!treeish) return false;

    const data = await getGitTree(group, treeish, false, signal, githubToken, tokenAccessMode, treeCache);
    if (data.truncated === true) throw new Error(`Non-recursive Git tree was truncated: ${parentPath}`);
    const entry = data.tree.find(candidate => candidate.type === 'blob' && candidate.path === filename);
    if (!entry) return false;

    if (isIgnored(item.path, 'file', ignoreRules)) {
      recordIgnored(state, group.owner, group.repo, group.branch, item.path);
      return true;
    }

    addFileCandidate(
      state,
      createTreeFileCandidate(group, entry, item.path, signal, githubToken, tokenAccessMode)
    );
    return true;
  }

  async function collectGroupWithTreeWalk(group, state, ignoreRules, signal, githubToken, tokenAccessMode) {
    const treeCache = new Map();

    for (const item of group.items) {
      if (state.limitExceeded) break;
      if (item.type === 'file') {
        const found = await collectFileFromTreeWalk(group, item, state, ignoreRules, treeCache, signal, githubToken, tokenAccessMode);
        if (!found) throw new Error(`Git tree path not found: ${item.path}`);
        continue;
      }

      const treeish = await resolveDirectoryTreeish(group, item.path, treeCache, signal, githubToken, tokenAccessMode);
      if (!treeish) throw new Error(`Git tree path not found: ${item.path}`);
      await collectTreeWalk(group, treeish, item.path, state, ignoreRules, treeCache, signal, githubToken, tokenAccessMode);
    }
  }

  async function collectContentsDirectory(group, dirPath, state, ignoreRules, signal, githubToken, tokenAccessMode, depth = 0) {
    if (depth > 20) throw new Error(`Max depth exceeded at: ${dirPath}`);
    if (state.limitExceeded) return;

    const entries = await listDir(group.owner, group.repo, group.branch, dirPath, signal, githubToken, tokenAccessMode);
    for (const entry of entries) {
      if (state.limitExceeded) break;

      const ignoreType = entry.type === 'dir' ? 'dir' : 'file';
      if (isIgnored(entry.path, ignoreType, ignoreRules)) {
        recordIgnored(state, group.owner, group.repo, group.branch, entry.path);
        continue;
      }

      if (entry.type === 'file' || entry.type === 'symlink') {
        addFileCandidate(
          state,
          createContentsFileCandidate(group, entry.path, entry.size, signal, githubToken, tokenAccessMode)
        );
      } else if (entry.type === 'dir') {
        await collectContentsDirectory(group, entry.path, state, ignoreRules, signal, githubToken, tokenAccessMode, depth + 1);
      }
    }
  }

  async function collectGroupWithContents(group, state, ignoreRules, signal, githubToken, tokenAccessMode) {
    for (const item of group.items) {
      if (state.limitExceeded) break;
      if (item.type === 'file') {
        addFileCandidate(
          state,
          createContentsFileCandidate(group, item.path, null, signal, githubToken, tokenAccessMode)
        );
      } else {
        await collectContentsDirectory(group, item.path, state, ignoreRules, signal, githubToken, tokenAccessMode);
      }
    }
  }

  async function scanGroup(group, state, ignoreRules, signal, githubToken, tokenAccessMode) {
    try {
      const recursiveTree = await getGitTree(group, group.branch, true, signal, githubToken, tokenAccessMode);
      if (recursiveTree.truncated === true) {
        await collectGroupWithTreeWalk(group, state, ignoreRules, signal, githubToken, tokenAccessMode);
      } else {
        collectFromRecursiveTree(group, recursiveTree.tree, state, ignoreRules, signal, githubToken, tokenAccessMode);
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      if (state.limitExceeded) return;
      console.warn('[GitZip Pro] Git Trees API scan failed; falling back to Contents API:', err);
      await collectGroupWithContents(group, state, ignoreRules, signal, githubToken, tokenAccessMode);
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

    try {
      // ② Parse all selected URLs and resolve the longest matching Git ref.
      const parsed = [];
      const refCache = new Map();
      for (const [, href] of selectedItems) {
        const info = await resolveGitHubUrl(href, signal, githubToken, tokenAccessMode, refCache);
        if (info) parsed.push(info);
      }

      if (parsed.length === 0) {
        onError && onError(new Error(t('downloader.no_valid_items')));
        return abortCtrl;
      }

      const { owner, repo, branch } = parsed[0];
      const safeBranchPath = sanitizeRefForPath(branch);
      const zipRoot = `${repo}-${safeBranchPath}`;

      // ③ Scan and validate the complete selection before fetching file contents
      onProgress && onProgress(0, 0, t('downloader.scanning'));

      const scanState = createScanState();
      const groups = new Map();
      for (const item of parsed) {
        const normalizedItem = { ...item, path: normalizePath(item.path) };
        if (isIgnored(normalizedItem.path, normalizedItem.type, compiledIgnoreRules)) {
          recordIgnored(scanState, normalizedItem.owner, normalizedItem.repo, normalizedItem.branch, normalizedItem.path);
          continue;
        }

        const groupKey = `${normalizedItem.owner}/${normalizedItem.repo}@${normalizedItem.branch}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, {
            owner: normalizedItem.owner,
            repo: normalizedItem.repo,
            branch: normalizedItem.branch,
            items: [],
          });
        }
        groups.get(groupKey).items.push(normalizedItem);
      }

      for (const group of groups.values()) {
        if (scanState.limitExceeded) break;
        await scanGroup(group, scanState, compiledIgnoreRules, signal, githubToken, tokenAccessMode);
      }

      if (scanState.limitExceeded) {
        throw new Error(t('downloader.too_many_files', { limit: MAX_FILE_COUNT }));
      }

      const fileList = scanState.files;
      const totalIgnored = scanState.ignoredCount;
      const totalIgnoredFiles = scanState.ignoredFiles;

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
        if (Number.isFinite(item.sizeBytes) && item.sizeBytes > MAX_GITHUB_FILE_SIZE) {
          throw new Error(t('downloader.file_too_large', { path: item.path }));
        }
        const bytes = await item.fetch();
        item.sizeBytes = bytes.length;
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
        .replace(/{branch}/g, safeBranchPath)
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

  global.GZPDownloader = { start, parseGitHubUrl, resolveGitHubUrl };

})(window);
