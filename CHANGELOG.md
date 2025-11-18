# Changelog

All notable changes to Terminal Tabs - Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2025-11-18

### 🚀 Major Features

#### Commands Panel Improvements
- **Added Spawn Options Editor** - Edit spawn options directly in Settings UI
  - Full CRUD operations (add/edit/delete spawn options)
  - Stored in Chrome storage (survives extension reloads and storage clears)
  - Form fields: Label, Icon, Terminal Type, Command, Description, Working Directory, URL
  - Loads from `spawn-options.json` as fallback if no custom options exist
  - Files: `extension/components/SettingsModal.tsx`, `extension/components/QuickCommandsPanel.tsx`

- **Added Font Family Support** - Choose from 6 font families
  - Dropdown in Settings → General tab
  - Options: Monospace, JetBrains Mono, Fira Code, Consolas, Courier New, Source Code Pro
  - Applies to all terminals immediately (no reload needed)
  - Files: `extension/components/SettingsModal.tsx`, `extension/components/Terminal.tsx`

- **Added Global "Use Tmux" Toggle** - Force all terminals to use tmux
  - Toggle in sidebar header (next to Connected badge)
  - Overrides individual terminal settings when enabled
  - Persists in Chrome storage
  - Files: `extension/sidepanel/sidepanel.tsx`, `extension/background/background.ts`

#### Session Persistence & Restoration
- **Tmux sessions survive extension reloads** - Automatic reconnection on reload
  - Backend sends terminal list on WebSocket connection
  - Sidepanel restores all existing terminals as tabs
  - Terminal components reconnect to tmux sessions
  - No more orphaned sessions accumulating in background
  - Files: `extension/background/background.ts`, `extension/sidepanel/sidepanel.tsx`

- **Terminal IDs prefixed with `ctt-`** - Easy identification and cleanup
  - All terminal IDs now start with `ctt-` (Chrome Terminal Tabs)
  - Makes it easy to find/kill orphaned sessions: `tmux ls | grep "^ctt-"`
  - Distinguishes from main app terminals (which use `tt-`)
  - Files: `backend/modules/terminal-registry.js`

#### Settings Improvements
- **Settings apply immediately** - No extension reload needed
  - Font size changes apply to all terminals instantly
  - Font family changes apply instantly
  - Theme toggle (dark/light) applies instantly
  - Terminal components re-render when settings change
  - Files: `extension/components/Terminal.tsx`

- **Settings Modal with Tabs** - Organized settings UI
  - General tab: Font size, font family, theme toggle, preview
  - Spawn Options tab: Add/edit/delete spawn options
  - Tab badges show spawn option count
  - Files: `extension/components/SettingsModal.tsx`

### 🐛 Bug Fixes

#### Terminal Rendering & UX
- **Fixed terminal not fitting sidebar on spawn** - Immediate fit on load
  - Added second fit attempt at 300ms (catches slow layout)
  - Added ResizeObserver for automatic refit on container resize
  - Terminals now fit perfectly on first spawn
  - Files: `extension/components/Terminal.tsx`

- **Fixed tab names showing IDs** - Now display friendly names
  - Tab names show spawn option label (e.g., "Claude Code", "Bash Terminal")
  - Background worker passes `name` field to backend
  - Sidepanel displays friendly names instead of `terminal-xxxxx`
  - Files: `extension/shared/messaging.ts`, `extension/components/QuickCommandsPanel.tsx`, `extension/background/background.ts`

- **Fixed font family not updating** - Added to Terminal useEffect dependencies
  - Font family changes now trigger terminal updates
  - Terminals update xterm.js fontFamily option
  - Resize trick forces complete redraw
  - Files: `extension/components/Terminal.tsx`

### 🎨 UI/UX Improvements
- **Spawn Options loaded from JSON** - Consistency with web app
  - Uses `spawn-options.json` for default spawn options (~18 terminals)
  - Clipboard commands (Git, Dev, Shell) still hardcoded for simplicity
  - Priority: Chrome storage > JSON fallback
  - Files: `extension/components/QuickCommandsPanel.tsx`

- **Tab names instead of IDs** - Better usability
  - Tabs show meaningful names: "Claude Code", "Bash", etc.
  - No more cryptic `terminal-1731876543210` names
  - Makes switching between terminals easier

### 🔧 Technical Improvements
- **Chrome storage for spawn options** - Persistent customization
  - Spawn options stored in `chrome.storage.local`
  - Survives extension reloads, browser restarts, Chrome updates
  - Only cleared by manual storage clear or extension uninstall
  - Falls back to JSON if no custom options exist

- **ResizeObserver for terminals** - Automatic fit on resize
  - Monitors container size changes
  - Triggers fit whenever sidebar resizes
  - Works with devtools open/close, zoom in/out
  - Properly cleaned up on component unmount

### 📝 Documentation
- **SPAWN_OPTIONS_ANALYSIS.md** - Decision analysis for JSON vs hardcoded approach
- **MISSING_FEATURES.md** - Feature gap analysis vs web app
- **CLAUDE.md** - Updated with current features and development rules

---

## [1.0.0] - 2025-11-17

### Initial Release - Chrome Extension MVP

#### Core Features
- **Chrome Side Panel Integration** - Sidebar persists across tabs
  - Extension icon click → Opens sidebar
  - Keyboard shortcut (Ctrl+Shift+9) → Opens sidebar
  - Context menu → "Open Terminal Sidebar"
  - Files: `extension/manifest.json`, `extension/background/background.ts`

- **Terminal Emulation** - Full xterm.js integration
  - WebSocket communication via background worker
  - Copy/paste support (Ctrl+Shift+C/V)
  - Terminal tabs with close buttons
  - Auto-reconnect on WebSocket disconnect
  - Files: `extension/components/Terminal.tsx`, `extension/sidepanel/sidepanel.tsx`

- **Settings Modal** - Basic terminal configuration
  - Font size slider (12-24px)
  - Theme toggle (Dark/Light)
  - Live preview
  - Files: `extension/components/SettingsModal.tsx`

- **Commands Panel** - Quick access to spawn options and clipboard commands
  - Spawn terminals (Bash, Claude Code, TFE, etc.)
  - Copy commands to clipboard (git, npm, shell)
  - Custom commands support (add your own)
  - Working directory override
  - Files: `extension/components/QuickCommandsPanel.tsx`, `extension/components/CommandEditorModal.tsx`

- **Terminal Spawning** - Launch 15+ terminal types
  - Bash, Claude Code, TFE, LazyGit, htop, and more
  - Working directory support
  - Command execution on spawn
  - Resumable sessions (tmux integration)
  - Files: `extension/background/background.ts`

#### Architecture
- **Frontend**: React + TypeScript + Vite
- **Backend**: Shared with terminal-tabs web app (Node.js + Express + PTY)
- **Storage**: Chrome storage API for settings
- **Communication**: Chrome runtime messaging + WebSocket

#### Known Limitations
- No per-terminal customization (font size/theme apply globally)
- No background gradients or transparency
- No project management
- Settings require extension rebuild to update (fixed in v1.0.1)

---

## Cleanup Commands

**Kill orphaned Chrome extension terminal sessions:**
```bash
# List all ctt- sessions
tmux ls | grep "^ctt-"

# Kill all ctt- sessions
tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

**Kill orphaned web app terminal sessions:**
```bash
# List all tt- sessions (web app)
tmux ls | grep "^tt-"

# Kill all tt- sessions
tmux list-sessions | grep "^tt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

---

**Repository**: https://github.com/GGPrompts/terminal-tabs-extension
**Backend**: Shared with https://github.com/GGPrompts/terminal-tabs
**License**: MIT
