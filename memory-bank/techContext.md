# GitZip Pro - Tech Context

## Technology Stack

### Core Technologies
- **Chrome Extension API**: Manifest V3 with service workers
- **JavaScript**: ES6+ with module pattern for encapsulation
- **HTML/CSS**: Options page with CSS custom properties for theming
- **JSZip Library**: Client-side ZIP file creation (jszip.min.js)

### External Dependencies
- **Cloudflare Worker**: Proxy server for GitHub API access
  - URL: `https://gitzip-pro-worker.fthux.com`
  - Purpose: Bypass CORS, handle rate limiting, cache responses
- **GitHub API**: Indirect access through Cloudflare Worker
  - Compatible with GitHub Contents API format

### Browser APIs Used
- **chrome.storage.sync**: Persistent storage for settings and history
- **chrome.downloads**: File download initiation
- **chrome.notifications**: Browser notifications
- **chrome.tabs**: Tab information and URL parsing
- **chrome.runtime**: Extension lifecycle and message passing
- **Fetch API**: Network requests with abort controller support
- **Web Audio API**: Notification sound generation (`playDing()`)

## Development Setup

### Project Structure
```
d:/Softwares/Temp/GitZipPro/
├── source/                    # Extension source code
│   ├── manifest.json         # Extension manifest (v3)
│   ├── background.js         # Service worker (background script)
│   ├── content.js           # Content script for GitHub UI
│   ├── content.css          # Styles for GitHub UI integration
│   ├── downloader.js        # Core download logic
│   ├── options.html         # Options page HTML
│   ├── options.js           # Options page logic
│   ├── popup.html           # Popup HTML (minimal)
│   ├── popup.js             # Popup logic
│   ├── jszip.min.js         # JSZip library (external)
│   └── icons/               # Extension icons
├── memory-bank/             # Project documentation
│   ├── projectbrief.md
│   ├── productContext.md
│   ├── activeContext.md
│   ├── systemPatterns.md
│   ├── techContext.md      # This file
│   └── progress.md
├── README.md               # Project overview
└── .clinerules            # Cline configuration
```

### Build Process
- **No build system**: Raw JavaScript/HTML/CSS files
- **No transpilation**: Uses modern JavaScript features supported by Chrome
- **No bundler**: Files loaded directly by Chrome extension manifest
- **Versioning**: Managed through Chrome Web Store and git

### Testing Approach
- **Manual Testing**: Direct testing in Chrome browser
- **Test Files**: Created ad-hoc HTML test files (e.g., `test_history.html`)
- **Chrome DevTools**: Debugging via Chrome extension developer mode
- **No automated tests**: Currently manual testing only

## Development Environment

### Tools
- **Visual Studio Code**: Primary IDE
- **Git**: Version control
- **Chrome Browser**: Target platform and testing environment
- **PowerShell**: Command-line operations on Windows

### Development Workflow
1. Make code changes in `source/` directory
2. Load unpacked extension in Chrome (`chrome://extensions/`)
3. Test functionality on GitHub repositories
4. Use Chrome DevTools for debugging
5. Update memory bank documentation
6. Commit changes to git

### Key Configuration Files

#### manifest.json (Manifest V3)
- **Permissions**: `storage`, `tabs`, `downloads`, `notifications`
- **Host Permissions**: `https://github.com/*`, `https://gitzip-pro-worker.fthux.com/*`
- **Content Scripts**: Injected into `https://github.com/*` pages
- **Background**: Service worker for download handling
- **Options Page**: `options.html` for settings interface

#### .clinerules
- Defines memory bank structure and usage guidelines
- Specifies core memory bank files
- Provides context for Cline assistant

## Technical Constraints

### Chrome Extension Limitations
- **Manifest V3**: Service workers have limited lifetime
- **Content Script Isolation**: Runs in isolated world from page JavaScript
- **Storage Limits**: `chrome.storage.sync` has quota limitations
- **Permission Model**: Requires explicit host permissions

### Performance Considerations
- **Concurrency Limit**: 5 parallel requests to avoid rate limiting
- **File Count Limit**: Maximum 500 files per download
- **Recursion Depth**: Maximum 20 levels for directory traversal
- **History Limit**: 100 most recent records stored

### Security Constraints
- **CSP Restrictions**: Content Security Policy limits script execution
- **GitHub API Rate Limits**: Indirect through Cloudflare Worker
- **Cross-Origin Restrictions**: GitHub API requires proxy for CORS

## Integration Points

### GitHub UI Integration
- **Selector Patterns**: Targets GitHub file/folder table rows
- **Mutation Observers**: Handles dynamic content loading
- **Event Delegation**: Efficient checkbox handling
- **CSS Injection**: Adds styles for custom UI elements

### Cloudflare Worker Integration
- **API Compatibility**: Mimics GitHub Contents API structure
- **Error Handling**: Retry logic for rate limiting (429 responses)
- **URL Encoding**: Proper path encoding for API requests
- **Response Parsing**: Handles both file and directory responses

### Browser Storage Integration
- **Settings Management**: Structured storage with default values
- **History Management**: Array-based storage with pruning
- **Migration Handling**: Graceful fallbacks for missing data
- **Change Detection**: Real-time updates via storage listeners

## Code Style & Conventions

### JavaScript Conventions
- **IIFE Pattern**: Module encapsulation with strict mode
- **Function Declarations**: Used for hoisting and clarity
- **Async/Await**: Preferred over promise chains for readability
- **Error First**: Callbacks with error parameters
- **Constants**: UPPER_CASE for configuration constants

### CSS Conventions
- **CSS Custom Properties**: Theme variables with fallbacks
- **BEM-like Naming**: `.history-record`, `.history-record-header`
- **Responsive Design**: Flexbox and grid layouts
- **Dark/Light Themes**: Media queries and data attributes

### HTML Conventions
- **Semantic Markup**: Appropriate HTML5 elements
- **Accessibility**: ARIA labels and keyboard navigation
- **Progressive Enhancement**: Works without JavaScript for basic structure

## Deployment & Distribution

### Chrome Web Store
- **Package Format**: ZIP file of `source/` directory
- **Version Bumping**: Update `manifest.json` version field
- **Screenshots**: Required for store listing
- **Description**: Detailed feature listing and usage instructions

### Development Distribution
- **Load Unpacked**: Direct loading from `source/` directory
- **Developer Mode**: Enabled in `chrome://extensions/`
- **Hot Reloading**: Manual reload after changes
- **Debugging**: Chrome DevTools for content scripts and service worker

### Version Management
- **Semantic Versioning**: `MAJOR.MINOR.PATCH` in manifest
- **Changelog**: Tracked in memory bank and git commits
- **Backward Compatibility**: Maintained for settings and history data
- **Migration Paths**: Considered for breaking changes