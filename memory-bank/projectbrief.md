# GitZip Pro - Project Brief

## Project Overview
GitZip Pro is a Chrome extension that enhances GitHub repository browsing by allowing users to download selected files and folders as ZIP archives directly from GitHub pages. It provides a convenient way to download specific parts of repositories without cloning entire repositories or using git commands.

## Core Value Proposition
- **Selective Downloads**: Users can select specific files/folders from GitHub repositories and download them as ZIP archives
- **Smart Filtering**: Built-in auto-ignore functionality to exclude system files, dependencies, and other non-essential files
- **History Tracking**: Maintains download history with detailed metadata about each download operation
- **Customizable**: Configurable download settings, naming conventions, and notification preferences

## Target Users
- Developers who need specific files from GitHub repositories
- Students and educators downloading code examples
- Technical writers accessing documentation
- Anyone who wants to avoid cloning entire repositories

## Key Features
1. **GitHub Integration**: Seamless integration with GitHub UI through content scripts
2. **Recursive Directory Traversal**: Automatically includes all files within selected directories
3. **Auto-Ignore System**: Predefined and customizable rules to filter out unnecessary files
4. **Download History**: Tracks all downloads with metadata and filtering information
5. **Custom Naming**: Configurable ZIP file naming patterns
6. **Notifications**: Browser notifications with optional sound and folder opening
7. **Theme Support**: Light/dark/system theme options for the extension UI

## Technical Foundation
- **Manifest V3**: Chrome extension using service workers
- **Cloudflare Worker Proxy**: Fetches GitHub content through a proxy to avoid CORS issues
- **JSZip Library**: Client-side ZIP file creation
- **Chrome Storage API**: Persistent storage for settings and history

## Project Status
Active development with recent enhancements to history tracking and UI improvements.