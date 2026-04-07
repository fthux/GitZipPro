# GitZip Pro - System Patterns

## Architecture Overview
GitZip Pro follows a client-side Chrome extension architecture with a proxy server component for GitHub API access. The system is designed to work entirely within the browser while leveraging a Cloudflare Worker to bypass CORS restrictions and GitHub API limitations.

## Core Components

### 1. Content Script Integration
- **Location**: `source/content.js`
- **Responsibility**: Integrates with GitHub UI, adds checkboxes to file/folder rows
- **Pattern**: DOM manipulation with mutation observers for dynamic content
- **Communication**: Exposes selection state to downloader via `window.GZPDownloader`

### 2. Download Engine
- **Location**: `source/downloader.js`
- **Responsibility**: Core download logic, file fetching, ZIP creation
- **Key Functions**:
  - `parseGitHubUrl()`: Parses GitHub URLs into structured data
  - `collectFiles()`: Recursive directory traversal with depth limiting
  - `start()`: Main download entry point with concurrency control
  - `withConcurrency()`: Limits parallel requests to prevent rate limiting

### 3. Cloudflare Worker Proxy
- **Purpose**: Acts as intermediary between extension and GitHub API
- **API Shape**: Mimics GitHub Contents API (`/repos/{owner}/{repo}/contents/{path}`)
- **Benefits**:
  - Avoids CORS restrictions
  - Provides caching and rate limit handling
  - Centralized API endpoint management
- **Default URL**: `https://gitzip-pro-worker.fthux.com`

### 4. Auto-Ignore System
- **Configuration**: Defined in `IGNORE_PRESETS` with common and media categories
- **Rule Compilation**: `compileIgnoreRules()` combines preset labels and custom patterns
- **Matching Logic**: `isIgnored()` uses wildcard matching with directory/file differentiation
- **Stats Tracking**: `stats` object in `collectFiles()` tracks ignored count and file paths

### 5. History Management
- **Storage**: Chrome Storage API (`chrome.storage.sync`)
- **Key**: `gzpDownloadHistory`
- **Record Structure**:
  ```javascript
  {
    timestamp: Date.now(),
    owner: 'owner',
    repo: 'repo',
    branch: 'branch',
    path: 'path',
    type: 'file' | 'dir',
    downloadName: 'filename.zip',
    files: ['file1', 'file2'],
    fileCount: 2,
    ignoredCount: 5,
    ignoredFiles: ['.gitignore', 'node_modules/']
  }
  ```
- **Pagination**: Limited to 100 most recent records

### 6. Options/Settings Management
- **Location**: `source/options.js` and `source/options.html`
- **Storage**: Chrome Storage API with `gzp` prefix keys
- **Themes**: Light/dark/system theme support with CSS custom properties
- **Settings Categories**:
  - General (theme, button position)
  - Download (naming rules, auto-ignore)
  - Notifications (show, sound, open folder)

## Design Patterns

### Module Pattern
```javascript
(function (global) {
  'use strict';
  // Private functions and variables
  const PRIVATE_CONST = 'value';
  
  function privateFunction() { ... }
  
  // Public API
  global.GZPDownloader = { start, parseGitHubUrl };
})(window);
```

### Concurrency Control Pattern
- Uses `withConcurrency()` to limit parallel fetch requests
- Default limit: 5 concurrent requests
- Prevents overwhelming GitHub API and browser resources

### Recursive Traversal with Stats
- Depth-limited recursion (max 20 levels)
- Stats object passed through recursion to accumulate metrics
- Early termination when file count exceeds `MAX_FILE_COUNT` (500)

### Event-Driven Communication
- Content script ↔ Downloader: Selection state via `window.GZPDownloader`
- Downloader ↔ Background: Download requests via `chrome.runtime.sendMessage`
- Background ↔ Options: History updates via message listeners

### Storage Abstraction
- Settings: `chrome.storage.sync` for user preferences
- History: Same storage with separate key
- Fallback defaults when storage is empty

## Data Flow Patterns

### Download Flow
1. User selects files → content script builds `Map<Element, string>`
2. `GZPDownloader.start(selectedItems, callbacks)` called
3. Parse URLs → Fetch settings → Compile ignore rules
4. For each item: collect files recursively with ignore checking
5. Fetch files concurrently with Cloudflare Worker
6. Build ZIP with JSZip → Convert to base64
7. Send to background script for download initiation
8. Create history record → Store → Update UI

### History Flow
1. Download completes → History record created
2. Record sent to background → Stored in `chrome.storage.sync`
3. Options page listens for `GZP_DOWNLOAD_COMPLETE` messages
4. `addHistoryRecord()` → `saveHistory()` → `renderHistory()`
5. UI updates with grouped records and expandable details

### Settings Flow
1. Options page loads → `chrome.storage.sync.get()` all settings
2. Apply defaults for missing values
3. UI controls bound to storage with change listeners
4. Changes auto-save to storage

## Error Handling Patterns

### Network Error Handling
- Retry logic for 429 (rate limit) responses with exponential backoff
- Abort controller for cancellation support
- Progress callbacks for user feedback

### Storage Error Handling
- Default values when storage is empty/corrupted
- Graceful degradation when storage API fails

### User Error Handling
- Validation of selected items before download
- Clear error messages in UI
- Safe defaults for invalid settings

## Performance Patterns

### Lazy Loading
- History page initialized only when visited
- Settings loaded on demand

### Efficient DOM Updates
- Batched rendering of history records
- Virtual scrolling considerations for large lists

### Memory Management
- File content released after ZIP creation
- History limited to 100 records
- Concurrency limits prevent memory exhaustion

## Security Patterns

### Content Security
- GitHub URL validation before processing
- Path traversal prevention in URL parsing
- Safe file path handling

### Privacy Protection
- Client-side ZIP creation (no server sees file contents)
- Minimal data sent to Cloudflare Worker (only GitHub API requests)
- No tracking or analytics in current implementation

### Extension Security
- Manifest v3 with service worker
- Minimal permissions required
- Content scripts only on `https://github.com/*`