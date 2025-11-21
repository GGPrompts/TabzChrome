# CLAUDE.md - TabzChrome

## 🎯 Project Overview

A **simple, Windows Terminal-style Chrome extension** for managing bash terminals in your browser sidebar. Built with React, TypeScript, and xterm.js.

**Version**: 2.0.0 (Simplified)
**Status**: In Development - Windows Terminal Simplification ✨
**Architecture**: Chrome Extension (Side Panel) + WebSocket backend
**Philosophy**: Windows Terminal simplicity - just bash with profiles
**Last Updated**: November 18, 2025

---

## 🏗️ Architecture

### Chrome Extension (React + TypeScript + Vite)
```
extension/
├── sidepanel/
│   └── sidepanel.tsx           # Main sidebar UI - Windows Terminal style
├── components/
│   ├── Terminal.tsx            # xterm.js terminal component
│   └── SettingsModal.tsx       # Settings (General + Profiles tabs)
├── background/
│   └── background.ts           # Service worker (WebSocket + shortcuts)
├── shared/
│   ├── messaging.ts            # Extension messaging helpers
│   └── storage.ts              # Chrome storage helpers
├── profiles.json               # Default profiles (shipped with extension)
└── manifest.json               # Extension configuration
```

### Backend (Node.js + Express + PTY)
```
backend/
├── server.js                   # Express + WebSocket server (port 8129)
├── modules/
│   ├── terminal-registry.js    # Terminal state management
│   ├── pty-handler.js          # PTY process spawning
│   └── unified-spawn.js        # Simplified: spawns bash only
└── routes/
    └── api.js                  # REST API endpoints
```

### Terminal ID Prefixing (`ctt-`)
**All Chrome extension terminals use `ctt-` prefix** (Chrome Terminal Tabs)
- Terminal IDs: `ctt-{uuid}` (e.g., `ctt-a1b2c3d4-e5f6...`)
- Generated in: `backend/modules/terminal-registry.js` (line ~239)
- Activated by: `isChrome: true` flag in spawn config
- Purpose:
  - Distinguish from web app terminals (`tt-` prefix)
  - Easy identification: `tmux ls | grep "^ctt-"`
  - Easy cleanup of orphaned sessions
  - Helps with terminal persistence and reconnection
- Kill orphaned sessions:
  ```bash
  tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
  ```

### Communication
- **WebSocket**: Real-time terminal I/O (background worker → terminals)
- **Chrome Messages**: Extension page communication (via ports)
- **Chrome Storage**: Terminal sessions, profiles and settings persistence (survives extension updates)
- **Custom Events**: Settings changes broadcast via `window.dispatchEvent`

### Hybrid State Management
**Balances simplicity with usability:**
- Terminal sessions are saved to Chrome storage when created/modified
- Sessions persist when sidebar is closed and reopened
- On reconnect, reconciles Chrome storage with backend tmux sessions
- Tmux provides the actual terminal persistence (processes keep running)
- Chrome storage provides the UI state (which tabs were open)
- If backend restarts, stored sessions attempt to reconnect to tmux

---

## 🎨 Core Principles

1. **Windows Terminal Simplicity** - Just bash terminals with profiles
2. **Profiles Over Complexity** - Working directory + appearance settings, nothing more
3. **Chrome Native** - Side panel API (Manifest V3), no external dependencies
4. **Smart Persistence** - Terminal sessions and profiles saved in Chrome storage
5. **Hybrid State** - Chrome storage for UI state + tmux for process persistence
6. **Easy to Deploy** - Extension (load unpacked) + Backend (Node.js server)

---

## 📐 Development Rules

### ALWAYS:
1. **Keep It Simple** - If it adds complexity, remove it
2. **Test Bash Terminals** - Only bash, nothing else
3. **Windows Terminal Mental Model** - How would Windows Terminal do it?
4. **Responsive CSS** - Should work at different sidebar widths
5. **Document Changes** - Update CLAUDE.md for architectural changes
6. **Profiles in Chrome Storage** - User data must survive extension updates

### NEVER:
1. **Don't Add Complex Terminal Types** - Bash only, no exceptions
2. **Don't Add Commands Panel** - It was removed for simplicity
3. **Don't Over-Engineer** - Simple solutions always win
4. **Don't Break WebSocket Protocol** - Backend compatibility critical
5. **Don't Make Sessions Too Persistent** - Balance between UX and simplicity
6. **Don't Bundle Static JSON** - Default profiles load once, user edits in settings

### 📝 Documentation Workflow

**After completing work (features, bug fixes, refactoring):**

1. **CHANGELOG.md** - Add version entry with what changed
   - Use categories: Added, Changed, Fixed, Removed
   - Include user-facing impact
   - Reference issue numbers if applicable

2. **LESSONS_LEARNED.md** - Capture key insights from complex bugs
   - Why the bug happened (root cause)
   - How to prevent it (patterns, checklists)
   - Code examples showing right vs wrong approach
   - Files to remember for similar issues

3. **CLAUDE.md** - Update ONLY for architecture changes
   - New patterns or principles
   - Changes to core workflows
   - Updated technical details
   - **DON'T** add "Recently Fixed" narratives (use CHANGELOG instead)

**Keep this file focused on "how the system works NOW", not "how we got here".**

### 🏗️ Building & Deploying the Extension

**Build the extension:**
```bash
npm run build:extension
```

**Copy to Windows (for Chrome on Windows):**
```bash
# From WSL, copy built extension to Windows desktop
rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/TabzChrome-simplified/dist-extension/
```

**Load/Reload in Chrome:**
1. Navigate to `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. First time: Click "Load unpacked" → Select `C:\Users\marci\Desktop\TabzChrome-simplified\dist-extension`
4. After rebuilding: Click the 🔄 **Reload** button on the extension card

**Quick rebuild and deploy workflow:**
```bash
npm run build:extension && rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/TabzChrome-simplified/dist-extension/
```

---

## 🚀 Key Features

✅ **Windows Terminal-Style UI** - Clean header with "New Tab" dropdown
✅ **Profiles System** - Define terminal profiles with:
  - Working directory (where terminal starts)
  - Font size (12-24px)
  - Font family (6 options: monospace, JetBrains Mono, Fira Code, etc.)
  - Theme (dark/light)
✅ **Terminal Session Persistence** - Terminals survive sidebar close/reopen
✅ **Paste to Terminal** - Right-click selected text → "Paste to Terminal"
✅ **Quick Spawn** - "+" button in tab bar spawns default profile
✅ **Profile Dropdown** - "New Tab" dropdown to select any profile
✅ **Settings Modal** - Two tabs:
  - General: Global font size, font family, theme
  - Profiles: Add/edit/delete profiles, set default
✅ **Live Settings Updates** - Changes apply immediately, no extension reload
✅ **Tab Close Buttons** - Hover-to-show X buttons (Windows Terminal style)
✅ **Full Terminal Emulation** - xterm.js with copy/paste support
✅ **WebSocket Communication** - Real-time I/O via background worker
✅ **Keyboard Shortcut** - Ctrl+Shift+9 to open sidebar
✅ **Context Menu** - Right-click → "Toggle Terminal Sidebar" or "Paste to Terminal"
✅ **Connection Status** - WebSocket connection indicator in header

---

## 📋 Current State

### ✅ Complete
- Chrome side panel integration
- Extension icon click → Opens sidebar
- Keyboard shortcut (Ctrl+Shift+9)
- Context menu → "Toggle Terminal Sidebar"
- Context menu → "Paste to Terminal" (for selected text)
- Windows Terminal-style header (clean, minimal)
- Tab close buttons (hover-to-show X)
- Settings modal - General tab (font size, font family, theme)
- Settings modal - Profiles tab (add/edit/delete profiles)
- Live settings updates (no extension reload needed)
- Terminal spawning (bash only with ctt- prefix)
- Terminal I/O (keyboard input, output display)
- WebSocket auto-reconnect
- Copy/paste in terminals (Ctrl+Shift+C/V)
- Session tabs (switch between multiple terminals)
- Terminal session persistence (Chrome storage + tmux)
- Profiles infrastructure (types, default profiles.json, storage)
- "+" button in tab bar - Spawns default profile
- "New Tab" dropdown - Select profile from list
- Profile spawn logic - Passes profile settings to backend

### 🎯 Vision
Windows Terminal simplicity - just bash terminals with configurable profiles (working dir + appearance)

---


### Settings Modal

Click the ⚙️ icon in the sidebar header to open settings.

**Font Size** (12-24px)
- Adjust terminal font size with slider
- See live preview before saving
- ⚠️ **Note:** Font size changes require extension reload to fully take effect

**Theme Toggle** (Dark/Light)
- **Dark** (default): Black background (#0a0a0a) + green text (#00ff88)
- **Light**: White background (#ffffff) + dark text (#24292e)
- Changes apply immediately

**Settings Persistence:**
- Stored in Chrome storage (local)
- Survives browser restart
- Applies to all terminals


### Keyboard Shortcuts

**Open Sidebar:**
- Default: `Ctrl+Shift+9`
- Customize at: `chrome://extensions/shortcuts`

**In Terminal:**
- Copy: `Ctrl+Shift+C` (when text selected)
- Paste: `Ctrl+Shift+V`

### Context Menu

**Right-click on webpage:**
- **"Toggle Terminal Sidebar"** - Opens/focuses the sidebar
- **"Paste '[text]' to Terminal"** - Appears when text is selected
  - Pastes to the currently active terminal tab
  - Text appears at cursor position (doesn't auto-execute)
  - Works with tmux - pastes to focused pane

---

## 🔧 Configuration

### Extension Manifest

Located at `extension/manifest.json`:

```json
{
  "name": "Terminal Tabs - Browser Edition",
  "version": "1.0.0",
  "permissions": [
    "storage",          // Settings persistence
    "contextMenus",     // Right-click menu
    "tabs",             // Tab information
    "sidePanel",        // Sidebar access
    "clipboardRead",    // Paste in terminal
    "clipboardWrite"    // Copy from terminal
  ],
  "commands": {
    "toggle-sidebar": {
      "suggested_key": {
        "default": "Ctrl+Shift+9"
      }
    }
  }
}
```

---

## 🐛 Known Issues

1. **WSL Connection** - If loading from WSL path, must use `localhost` not `127.0.0.1`
2. **Paste to TUI Apps** - Text pastes directly, may corrupt TUI apps if not at prompt
3. **No Keyboard Shortcuts** - Missing Ctrl+T, Ctrl+W, etc. (browser limitations)

---

## 📜 Documentation Index

### Core Documentation (Root Directory)

- **[CLAUDE.md](CLAUDE.md)** (this file) - Architecture, development rules, current system state
- **[README.md](README.md)** - User-facing documentation, getting started, features
- **[LESSONS_LEARNED.md](LESSONS_LEARNED.md)** - Technical insights, common pitfalls, prevention strategies
- **[CHANGELOG.md](CHANGELOG.md)** - Version history, bug fixes, feature additions
- **[PLAN.md](PLAN.md)** - Refactoring roadmap, technical debt, future improvements

### Organized Documentation (docs/ folder)

See **[docs/README.md](docs/README.md)** for complete navigation guide.

#### Bug Investigations (docs/bugs/)
- **[docs/bugs/MULTI_WINDOW_REATTACH_BUG.md](docs/bugs/MULTI_WINDOW_REATTACH_BUG.md)** - Multi-window reattach investigation
- **[docs/bugs/CONNECTION_DEBUG.md](docs/bugs/CONNECTION_DEBUG.md)** - WebSocket connection debugging
- **[docs/bugs/](docs/bugs/)** - Additional debugging notes and investigations

#### Planning & Analysis (docs/planning/)
- **[docs/planning/IMPLEMENTATION_PLAN.md](docs/planning/IMPLEMENTATION_PLAN.md)** - Implementation planning
- **[docs/planning/MISSING_FEATURES.md](docs/planning/MISSING_FEATURES.md)** - Feature tracking
- **[docs/planning/](docs/planning/)** - Architecture analysis and brainstorming

#### Technical Reference (docs/reference/)
- **[docs/reference/SPLIT_LAYOUT_DESIGN.md](docs/reference/SPLIT_LAYOUT_DESIGN.md)** - Split layout design spec
- **[docs/reference/OPUSTRATOR_LEGACY_AUDIT.md](docs/reference/OPUSTRATOR_LEGACY_AUDIT.md)** - Legacy code audit
- **[docs/reference/CLAUDE_CODE_COLORS.md](docs/reference/CLAUDE_CODE_COLORS.md)** - Terminal color schemes
- **[docs/reference/](docs/reference/)** - Technical patterns and guidelines

#### Implementation Phases (docs/phases/)
- **[docs/phases/REMAINING_PHASES.md](docs/phases/REMAINING_PHASES.md)** - Current roadmap
- **[docs/phases/](docs/phases/)** - Phase-by-phase implementation tracking

#### Archived & Historical (docs/archived/)
- **[docs/archived/](docs/archived/)** - Completed work, historical notes, legacy prompts

**Quick Navigation:**
- 🐛 Debugging a bug? → [LESSONS_LEARNED.md](LESSONS_LEARNED.md) or [docs/bugs/](docs/bugs/)
- 📦 What changed in version X? → [CHANGELOG.md](CHANGELOG.md)
- 🏗️ Planning features? → [PLAN.md](PLAN.md) or [docs/planning/](docs/planning/)
- 📖 User documentation? → [README.md](README.md)
- 🧭 Understanding architecture? → This file + [docs/reference/](docs/reference/)
- 📚 Complete doc index? → [docs/README.md](docs/README.md)

---

## 📊 Project Metrics

| Metric | Value |
|--------|-------|
| Dependencies | 74 packages |
| Lines of Code | ~44,000 |
| Frontend Size | ~200KB gzipped |
| Backend Port | 8129 |
| Terminal Types | 1 (bash only) |
| Themes | 2 (dark/light) |

---

## 🎯 Design Goals

### Primary Goals
1. **Easy to Use** - Spawn terminal, start typing
2. **Fast** - Instant spawning, no lag
3. **Reliable** - WebSocket auto-reconnect, error recovery
4. **Beautiful** - Modern glassmorphic UI, smooth animations

### Non-Goals
1. **Canvas Features** - No dragging, resizing, zoom
2. **Infinite Workspace** - Tabs only, not spatial
3. **Complex Layouts** - Keep it simple
4. **Desktop PWA** - Web-first, not Electron

---

## 🔍 Debugging & Monitoring

### Checking Backend Logs

**Running the backend:**
```bash
cd backend
npm start
```

**Check if backend is running:**
```bash
ps aux | grep "node server.js" | grep -v grep
```

**Backend listens on:** `http://localhost:8129`

### Check Active Tmux Sessions
```bash
tmux ls
# Shows all tmux sessions including:
# - ctt-<uuid> (Chrome extension terminals)
# - Named sessions like "Bash", "Large Text", etc.
```

### Monitoring Terminal Sessions

**List Active Chrome Extension Terminal Sessions**
```bash
# List Chrome extension terminals by ID:
tmux ls | grep "^ctt-"

# List by session name:
tmux ls | grep -E "^(Bash|Projects|Large Text)"
```

**Capture Pane Contents**
```bash
# Capture last 100 lines from a named session
tmux capture-pane -t Bash -p -S -100

# Capture entire scrollback
tmux capture-pane -t "Large Text" -p -S -
```

**Monitor WebSocket Messages**
Backend logs show WebSocket activity when `LOG_LEVEL=5` (debug):
```bash
# In backend/.env:
LOG_LEVEL=5  # Shows detailed PTY operations, tmux session info

# Restart backend:
./stop.sh && ./start-tmux.sh
```

### Common Debugging Scenarios

**1. Terminal won't spawn**
- Check if backend is running: `ps aux | grep "node server.js"`
- Check service worker console for WebSocket connection errors
- Look for spawn errors in backend output

**2. Terminal spawned but blank**
- Check if tmux session exists: `tmux ls | grep "^ctt-"` or `tmux ls`
- Check service worker console for WebSocket errors
- Check sidepanel console (F12 in sidebar) for xterm.js errors

**3. Persistence not working**
- Check Chrome storage in extension console: `chrome.storage.local.get(['terminalSessions'])`
- Verify tmux sessions survive: `tmux ls`
- Check WebSocket connection status in service worker console

**4. Backend crash/restart**
- Terminals in tmux sessions survive backend restart
- Refresh frontend to reconnect
- Sessions will reattach automatically

### Dev Server Ports

- **Backend**: http://localhost:8129 (WebSocket + REST API)
- **WebSocket**: ws://localhost:8129
- **Chrome Extension**: Loads from WSL path or Windows Desktop

### Browser Console Forwarding (Claude Debugging)

**Automatic in dev mode!** Browser console logs are automatically forwarded to the backend terminal for easy debugging.

**What gets forwarded:**
- `console.log()` → Backend terminal with `[Browser]` prefix
- `console.error()` → Red error in backend terminal
- `console.warn()` → Yellow warning in backend terminal
- Includes source file:line (e.g., `[Browser:SimpleTerminalApp.tsx:123]`)

**Claude can capture logs directly**:
```bash
# Claude runs these via Bash tool after making changes:
# Check backend logs for WebSocket activity
ps aux | grep "node server.js" | grep -v grep

# List active Chrome extension terminals
tmux ls | grep "^ctt-"

# Check specific terminal output
tmux capture-pane -t Bash -p -S -20
```

**User can view logs manually:**
```bash
# Method 1: Attach to backend session
tmux attach -t tabz:backend

# Method 2: Spawn "Dev Logs" terminal in app
# Right-click → Dev Logs

# Method 3: Capture last 50 browser logs
tmux capture-pane -t tabz:backend -p -S -50 | grep "\[Browser"
```

**Format (optimized for Claude Code):**
```
[Browser:SimpleTerminalApp.tsx:456] Terminal spawned: terminal-abc123
[Browser:Terminal.tsx:234] xterm initialized {cols: 80, rows: 24}
[Browser] WebSocket connected
```

**Why this helps:**
- ✅ **Claude can debug autonomously** - Capture panes directly, no user copy-paste needed
- ✅ Browser + backend logs in one place
- ✅ Structured format uses minimal context
- ✅ Source location helps pinpoint issues quickly

---

## 🔗 Links

- **GitHub**: https://github.com/GGPrompts/Tabz
- **Parent Project**: https://github.com/GGPrompts/opustrator
- **xterm.js Docs**: https://xtermjs.org/

---

---

## 📝 Notes for AI Assistants

### Project Context
- This is the simplified "TabzChrome" version - Chrome extension only
- Originally tried pure tmux state management but was too annoying
- Now uses hybrid approach: Chrome storage for UI + tmux for processes
- Focus on Windows Terminal simplicity - just bash with profiles
- Backend WebSocket runs on port 8129
- Keep dependencies minimal - avoid adding new npm packages

> **Important:** Follow the [Documentation Workflow](#-documentation-workflow) when making changes. See [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for common pitfalls and prevention strategies.

### Autonomous Debugging Workflow

> **See Also:** [LESSONS_LEARNED.md](LESSONS_LEARNED.md#debugging-patterns) for diagnostic logging patterns and multi-step state change checklists.

**When debugging the Chrome extension, you can debug autonomously:**

1. **Make code changes** (Edit/Write tools)

2. **Check if it's working** (Bash tool):
   ```bash
   # Check if backend is running
   ps aux | grep "node server.js" | grep -v grep

   # Check active Chrome extension terminals
   tmux ls | grep "^ctt-"

   # List all terminal sessions by name
   tmux ls

   # Check specific terminal output
   tmux capture-pane -t Bash -p -S -50
   ```

3. **Analyze and fix** - You can see errors directly without asking user

**Example autonomous debugging:**
```bash
# After updating extension code:
# 1. Check if backend is receiving spawn commands
ps aux | grep "node server.js" | grep -v grep

# 2. Verify Chrome extension terminals exist
tmux ls | grep "^ctt-"

# 3. Check specific terminal output
tmux capture-pane -t Bash -p -S -20
```

**This enables:**
- ✅ Fix issues without user needing to copy-paste logs
- ✅ Verify changes work before committing
- ✅ Debug race conditions by capturing exact timing
- ✅ See both browser + backend logs in one capture

### Sending Prompts to Other Claude Sessions (Tmux Workflow)

**When working across multiple Claude Code sessions in tmux**, you can send prompts directly to other sessions using `tmux send-keys`:

**Critical: Use 0.3s delay to prevent submission issues**

```bash
# Send prompt to another Claude session
TARGET_SESSION="31"  # or any tmux session number

# Send the prompt text (literal mode preserves formatting)
tmux send-keys -t "$TARGET_SESSION" -l "Your prompt text here..."

# CRITICAL: 0.3s delay prevents newline from triggering submit before prompt loads
sleep 0.3

# Submit the prompt
tmux send-keys -t "$TARGET_SESSION" C-m
```

**Why the delay matters:**
- Without the delay, Claude may interpret the final newline as a submission before the full prompt is loaded
- This causes only a blank line to be sent instead of your full prompt
- 0.3 seconds handles even very long prompts (100+ lines) reliably

**Use cases:**
- Delegating test fixes to another Claude session while you continue other work
- Sending complex refactoring prompts to a dedicated session
- Coordinating work across multiple parallel Claude sessions

