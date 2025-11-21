# chrome-extension Branch

**Git Worktree Location**: `~/projects/terminal-tabs-extension`
**Branch**: `feat/chrome-extension`
**Status**: 🚧 85% Complete - **Build Issues**

## What This Is

Chrome extension version of Tabz. Leverages Chrome's side panel, DevTools, and popup APIs. Same terminal functionality but as a browser extension.

## Current Status

- ✅ **Manifest V3**: Configuration complete
- ✅ **Structure**: popup, sidepanel, devtools, background, content
- ⚠️ **Build Broken**: Icon files missing, config issues
- ❓ **Terminal Status**: Unknown - can't build to test

## Extension Structure

```
extension/
├── manifest.json          # Chrome extension manifest
├── popup/                 # Command palette popup
├── sidepanel/             # Side panel terminal UI
├── devtools/              # DevTools integration
├── background/            # Service worker (WebSocket)
└── content/               # Content script
```

## Build Issues

1. Missing icon files (need 16x16, 48x48, 128x128)
2. Content script path issues in @crxjs config
3. Build config needs fixing

## How to Work on This

```bash
cd ~/projects/terminal-tabs-extension

# Install dependencies
npm install

# Try to build (currently fails)
npm run build:extension

# Dev mode (also has issues)
npm run dev:extension
```

## What's Needed

1. Create placeholder icons
2. Fix content script path in Vite config
3. Test WebSocket from service worker
4. Package for Chrome Web Store

## Assessment

- 🌟 Most unique - Only terminal manager as Chrome extension
- 🎯 Perfect for multi-monitor - Chrome's native side panel
- ⚠️ Build complexity - Needs fixes before usable

## Main Documentation

See [FEATURE_BRANCHES.md](../terminal-tabs/FEATURE_BRANCHES.md) in the main repo for complete overview of all branches.
