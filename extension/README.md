# Terminal Tabs - Chrome Extension

Browser extension version of Terminal Tabs with integrated terminal management in Chrome/Edge.

## Features

- ✅ **Popup Command Palette** - Quick launcher from toolbar with recent sessions
- ✅ **Side Panel** - Full terminal interface in Chrome Side Panel
- ✅ **DevTools Integration** - Terminal panel in DevTools with network → cURL converter
- ✅ **Content Script** - GitHub repo detection, error suggestions, command detection
- ✅ **Background Service Worker** - Persistent WebSocket connection to backend
- ✅ **Context Menus** - Right-click actions on web pages
- ✅ **Chrome Storage Sync** - Session syncing across devices

## Project Structure

```
extension/
├── manifest.json              # Chrome Extension Manifest V3
├── popup/
│   ├── popup.html            # Popup HTML entry point
│   └── popup.tsx             # Popup React component
├── sidepanel/
│   ├── sidepanel.html        # Side panel HTML entry point
│   └── sidepanel.tsx         # Side panel React component
├── devtools/
│   ├── devtools.html         # DevTools registration HTML
│   ├── devtools.ts           # DevTools panel registration
│   ├── panel.html            # DevTools panel HTML
│   └── panel.tsx             # DevTools panel React component
├── background/
│   └── background.ts         # Service worker (WebSocket, messaging, context menus)
├── content/
│   └── content.ts            # Content script (page integrations)
├── components/
│   └── ui/                   # shadcn/ui components
│       ├── command.tsx
│       ├── badge.tsx
│       └── separator.tsx
├── shared/
│   ├── messaging.ts          # Extension message types & helpers
│   ├── storage.ts            # Chrome Storage API helpers
│   └── utils.ts              # Shared utilities
├── lib/
│   └── utils.ts              # shadcn/ui utilities (cn function)
├── styles/
│   └── globals.css           # Global styles with Tailwind
└── icons/                    # Extension icons (16, 48, 128)
```

## Development

### Prerequisites

1. **Backend running**: Start the terminal-tabs backend server
   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Node.js**: v18 or higher

### Build Extension

```bash
# Development mode (watch for changes)
npm run dev:extension

# Production build
npm run build:extension

# Create distributable ZIP
npm run zip:extension
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist-extension` directory
5. The extension should now appear in your toolbar!

### Testing

- **Popup**: Click the extension icon in toolbar
- **Side Panel**: Right-click extension icon → "Open Side Panel"
- **DevTools**: Open DevTools (F12) → "Terminal" tab
- **Context Menu**: Right-click on any page → "Terminal Tabs"

## Icon Assets

The extension requires icon files at the following sizes:

- `icons/icon16.png` - 16x16 (toolbar, tabs)
- `icons/icon48.png` - 48x48 (extension management)
- `icons/icon128.png` - 128x128 (Chrome Web Store)

**TODO**: Create icon assets with terminal theme (📟 or similar)

You can use any PNG icon generator or create them manually. Recommended:
- Base color: `#4CAF50` (green) or `#FFA000` (amber)
- Design: Terminal/console icon with "Tab" indicator

## Chrome Extension Features

### 1. Command Palette Popup

Quick access from toolbar:
- Recent sessions (last 5)
- Quick spawn options (Bash, Claude Code, LazyGit, etc.)
- Open side panel
- Active session count badge

### 2. Side Panel

Full terminal interface:
- Session tabs
- Terminal view (xterm.js)
- Pin/unpin toggle
- Settings button
- Connection status

### 3. DevTools Panel

Developer-focused features:
- Terminal tabs in DevTools
- Network request viewer
- cURL command generator
- Copy/paste to terminal

### 4. Content Script Integrations

Page-specific features:
- GitHub repo detection → Clone in terminal
- Error message detection → Command suggestions
- Package manager command detection → Run in terminal buttons
- Keyboard shortcuts (Cmd/Ctrl+K)

### 5. Background Service Worker

Backend coordination:
- WebSocket connection to terminal backend
- Message routing between extension pages
- Context menu registration
- Badge updates
- Session state sync

## Permissions

The extension requires these permissions:

- `storage` - Save sessions and settings
- `contextMenus` - Add right-click menu items
- `tabs` - Manage tab state
- `sidePanel` - Show side panel interface
- `host_permissions` - Connect to localhost:8127 (backend WebSocket)

## Architecture

### Message Flow

```
Content Script → Background → WebSocket → Backend
                    ↓
              Popup/SidePanel/DevTools
```

### Storage

- **Local Storage** - Recent sessions, active sessions (per-device)
- **Sync Storage** - Settings, preferences (cross-device, 100KB limit)

### WebSocket Protocol

The extension uses the same WebSocket protocol as the main terminal-tabs app:

- `spawn-terminal` - Spawn new terminal
- `attach-terminal` - Attach to existing session
- `terminal-input` - Send input to terminal
- `terminal-output` - Receive output from terminal
- `list-sessions` - Get active sessions

## Chrome Web Store Preparation

When ready to publish:

1. **Build production version**:
   ```bash
   npm run build:extension
   npm run zip:extension
   ```

2. **Create store assets**:
   - Screenshots (1280x800 or 640x400)
   - Promotional images (440x280)
   - Description and feature list

3. **Privacy Policy**: Required if using `storage` or `tabs` permissions

4. **Developer Account**: $5 one-time fee

5. **Upload**: Chrome Web Store Developer Dashboard

## Known Limitations

- ✅ Backend must be running on `localhost:8127`
- ✅ No offline mode (requires WebSocket connection)
- ✅ Chrome 114+ required for Side Panel API
- ⚠️ Terminal view placeholder (xterm.js integration TODO)

## Next Steps

1. **Integrate xterm.js** - Add actual terminal rendering in sidepanel/devtools
2. **Create icons** - Design and add 16/48/128px icons
3. **Add settings page** - Options page for configuration
4. **Test on Edge** - Verify Manifest V3 compatibility
5. **Polish UI** - Refine styling and animations
6. **Error handling** - Better error messages and recovery
7. **Chrome Web Store** - Prepare and publish

## Related Documentation

- [Implementation Plan](../IMPLEMENTATION_PLAN.md) - Full implementation roadmap
- [Main App README](../README.md) - Terminal Tabs web app
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)

---

Built with ❤️ using React, TypeScript, Vite, shadcn/ui, and xterm.js
