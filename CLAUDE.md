# CLAUDE.md - TabzChrome

## 🎯 Project Overview

A **simple, Windows Terminal-style Chrome extension** for managing bash terminals in your browser sidebar. Built with React, TypeScript, and xterm.js.

**Version**: 2.7.0 (Profile Categories + Color-Coded Tabs)
**Status**: In Development - Windows Terminal Simplification ✨
**Architecture**: Chrome Extension (Side Panel) + WebSocket backend
**Philosophy**: Windows Terminal simplicity - bash with profiles and smart directory inheritance
**Last Updated**: December 9, 2025

---

## 🏗️ Architecture

### Chrome Extension (React + TypeScript + Vite)
```
extension/
├── sidepanel/
│   └── sidepanel.tsx           # Main sidebar UI - Windows Terminal style
├── components/
│   ├── Terminal.tsx            # xterm.js terminal component
│   └── SettingsModal.tsx       # Profiles management (add/edit/delete)
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
- Terminal IDs: `ctt-{profileName}-{shortId}` (e.g., `ctt-Bash-a1b2c3d4`)
- Generated in: `backend/modules/terminal-registry.js` (line ~247-262)
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
2. **Profiles Over Complexity** - Appearance + optional command, working directory inherits from header
3. **Smart Directory Inheritance** - Global working directory in header, profiles inherit if empty
4. **Chrome Native** - Side panel API (Manifest V3), no external dependencies
5. **Smart Persistence** - Terminal sessions, profiles, and recent directories saved in Chrome storage
6. **Hybrid State** - Chrome storage for UI state + tmux for process persistence
7. **Easy to Deploy** - Extension (load unpacked) + Backend (Node.js server)

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

4. **CHANGELOG Rotation**
   - Main CHANGELOG.md: Keep under 500 lines (recent 3-4 versions)
   - Archive older versions to CHANGELOG-archive.md
   - Always keep full history accessible, just split for readability

**Keep this file focused on "how the system works NOW", not "how we got here".**

### 🏗️ Building & Deploying the Extension

**Build the extension:**
```bash
npm run build
```

**Load/Reload in Chrome:**
1. Navigate to `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. First time: Click "Load unpacked" → Select your `dist-extension` folder:
   - Windows: `C:\Users\<USERNAME>\path\to\TabzChrome\dist-extension`
   - WSL: `\\wsl.localhost\Ubuntu\home\<USERNAME>\projects\TabzChrome\dist-extension`
4. After rebuilding: Click the 🔄 **Reload** button on the extension card

**Development workflow (WSL users):**
```bash
# Build and copy to Windows (recommended - more stable than WSL path)
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/
# Then click Reload in chrome://extensions
```

**Alternative:** Load directly from WSL path (may be flaky)

---

## 🚀 Key Features

✅ **Windows Terminal-Style UI** - Clean header with working directory selector
✅ **Profiles System** - Define terminal profiles with:
  - Starting command (optional) - runs when terminal spawns (e.g., `lazygit`, `htop`)
  - Working directory (optional) - leave empty to inherit from header
  - Font size (12-24px)
  - Font family (6 options: monospace, JetBrains Mono, Fira Code, etc.)
  - Theme (6 families: high-contrast, dracula, ocean, neon, amber, matrix) + dark/light toggle
✅ **Global Working Directory** - Dropdown in header sets default directory:
  - Profiles without explicit workingDir inherit from this
  - Recent directories remembered (with remove option)
  - Enables one "lazygit" profile for all projects - just change header dir
✅ **Terminal Session Persistence** - Terminals survive sidebar close/reopen
✅ **Paste to Terminal** - Right-click selected text → "Paste to Terminal"
✅ **Split + Button** - Windows Terminal-style in tab bar:
  - Click + to spawn default profile
  - Click ▼ to select any profile
✅ **Settings Modal** - Two tabs: Profiles and MCP Tools
  - Profiles: add/edit/delete, set default, drag-and-drop reorder
  - MCP Tools: individual tool toggles, URL settings, token estimates
✅ **Tab Management** - Drag-and-drop reordering, hover-to-show X close buttons
✅ **Ghost Badge** - 👻 badge shows orphaned tmux sessions with reattach/kill options
✅ **Claude Code Status** - Emoji indicators in tabs (🤖✅ idle, 🤖⏳ working, 🤖🔧 tool use)
✅ **Command History** - Up/down arrows in chat bar, clock icon to view history
✅ **Full Terminal Emulation** - xterm.js with copy/paste support
✅ **WebSocket Communication** - Real-time I/O via background worker
✅ **Keyboard Shortcuts** - Ctrl+Shift+9 to open sidebar (configurable in Chrome)
✅ **Context Menu** - Right-click → "Toggle Terminal Sidebar" or "Paste to Terminal"
✅ **Connection Status** - WebSocket connection indicator in header
✅ **HTTP Spawn API** - Spawn terminals programmatically via REST endpoint

---

## 🔌 HTTP API for Automation

### POST /api/spawn

Spawn a terminal programmatically (useful for Claude/automation workflows).

**Request:**
```bash
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Terminal",
    "workingDir": "/home/user/projects",
    "command": "claude --dangerously-skip-permissions"
  }'
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Display name for the tab (default: "Claude Terminal") |
| `workingDir` | string | No | Starting directory (default: `$HOME`) |
| `command` | string | No | Command to execute after spawn (e.g., `claude`, `lazygit`) |

**Response:**
```json
{
  "success": true,
  "terminal": {
    "id": "ctt-uuid...",
    "name": "My Terminal",
    "terminalType": "bash",
    "ptyInfo": {
      "useTmux": true,
      "tmuxSession": "ctt-uuid..."
    }
  }
}
```

**Features:**
- Terminals use tmux for persistence (survive backend restarts)
- Uses `ctt-` prefix for Chrome extension isolation
- Tab appears automatically in the sidebar
- Command executes ~1.2s after spawn (waits for shell ready)

**Example: Spawn Claude Code session**
```bash
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"name": "Claude Worker", "workingDir": "~/projects/myapp", "command": "claude --dangerously-skip-permissions"}'
```

---

## 📋 Current State

### ✅ Complete
- Chrome side panel integration
- Extension icon click → Opens sidebar
- Keyboard shortcut (Ctrl+Shift+9)
- Context menu → "Toggle Terminal Sidebar"
- Context menu → "Paste to Terminal" (for selected text)
- Windows Terminal-style header with working directory selector
- Tab close buttons (hover-to-show X)
- Settings modal - Profiles only (simplified, removed redundant General tab)
- Profile settings: name, workingDir (optional), command (optional), font, theme
- Global working directory in header (profiles inherit if their workingDir empty)
- Recent directories list with persistence and remove option
- Terminal spawning (bash only with ctt- prefix)
- Terminal I/O (keyboard input, output display)
- Starting command execution (profile.command runs on spawn)
- WebSocket auto-reconnect
- Copy/paste in terminals (Ctrl+Shift+C/V)
- Session tabs (switch between multiple terminals)
- Terminal session persistence (Chrome storage + tmux)
- Split + button in tab bar (+ spawns default, ▼ shows profile dropdown)
- Profile spawn logic - Passes profile settings + inherited workingDir to backend

### 🎯 Vision
Windows Terminal simplicity - bash terminals with profiles that can inherit working directory from header, enabling tool profiles (lazygit, htop) that work across all projects

---


### Profiles Modal

Click the ⚙️ icon in the sidebar header to manage profiles.

**Profile Settings:**
- **Name** - Display name for the profile
- **Working Directory** (optional) - Leave empty to inherit from header
- **Starting Command** (optional) - Command to run when terminal spawns (e.g., `lazygit`, `npm run dev`)
- **Font Size** (12-24px) - Per-profile font size
- **Font Family** - Monospace, JetBrains Mono, Fira Code, Consolas, etc.
- **Theme** - Dark or Light

**Default Profile:**
- Set which profile spawns when clicking the + button
- Dropdown at top of profiles list

**Working Directory Inheritance:**
Profiles with empty workingDir inherit from the global working directory in the header. This enables:
- One "lazygit" profile that works for any project
- One "htop" profile, one "npm run dev" profile, etc.
- Just change the header directory to switch projects

**Profile Persistence:**
- Stored in Chrome storage (local)
- Survives browser restart and extension updates


### Working Directory Selector

The folder icon in the header opens the working directory dropdown.

**Features:**
- **Current Directory** - Shows currently selected directory
- **Custom Input** - Type any path and press Enter
- **Recent Directories** - Last 10 directories used (persisted)
- **Remove from List** - Hover over item and click X to remove typos

**Path Format:**
- `~` expands to home directory
- `~/projects` → `/home/username/projects`
- Paths are expanded by the backend

**Inheritance:**
- Profiles with empty workingDir use the header directory
- Profiles with explicit workingDir ignore the header
- Recent directories auto-populated when spawning terminals


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

**Active Permissions:**
- `storage` - Settings persistence (profiles, sessions, recent dirs)
- `contextMenus` - Right-click menu (Paste to Terminal, Send to Chat)
- `tabs` - Tab information for MCP tools
- `sidePanel` - Sidebar access
- `clipboardRead` / `clipboardWrite` - Terminal copy/paste
- `notifications` - Terminal alerts
- `scripting` - Content script injection
- `activeTab` - Current tab access
- `alarms` - WebSocket reconnection scheduling
- `debugger` - CDP for screenshots and browser automation
- `downloads` - Download MCP tools
- `webRequest` - Network capture MCP tools

**Reserved for Phase 2C (not yet implemented):**
- `cookies` - Future cookie inspection/management MCP tools
- `history` - Future browser history MCP tools
- `bookmarks` - Future bookmark management MCP tools

**Keyboard Shortcuts:**
- `Ctrl+Shift+9` - Toggle sidebar (configurable in chrome://extensions/shortcuts)

---

## 🌐 Tabz MCP Integration

TabzChrome includes a **Tabz MCP Server** that enables Claude Code to programmatically control the browser.

### Available Tools

**20 MCP tools** for browser automation (see [MCP_TOOLS.md](tabz-mcp-server/MCP_TOOLS.md)):
- `tabz_list_tabs` - List all open tabs
- `tabz_switch_tab` - Switch to specific tab
- `tabz_rename_tab` - Assign custom names to tabs (persist by URL)
- `tabz_get_page_info` - Get current page URL and title
- `tabz_open_url` - Open allowed URLs (GitHub, GitLab, Vercel, localhost)
- `tabz_click` - Click elements by CSS selector
- `tabz_fill` - Fill form inputs
- `tabz_screenshot` - Capture viewport screenshots to disk
- `tabz_screenshot_full` - Capture entire scrollable page
- `tabz_download_image` - Download images from pages
- `tabz_get_element` - Inspect element HTML/CSS
- `tabz_execute_script` - Run JavaScript in page
- `tabz_get_console_logs` - View browser console output
- `tabz_enable_network_capture` - Start capturing network requests
- `tabz_get_network_requests` - List captured XHR/fetch requests
- `tabz_get_api_response` - Get full response body for a request
- `tabz_clear_network_requests` - Clear captured requests
- `tabz_download_file` - Download any URL to disk (returns Windows + WSL paths)
- `tabz_get_downloads` - List recent downloads with status
- `tabz_cancel_download` - Cancel in-progress download

### Claude Skill: `tabz-mcp`

Install the `tabz-mcp` skill for guided browser automation. The skill **dynamically discovers available tools** via `mcp-cli` - never goes stale when tools are added.

**Location:** `~/.claude/skills/tabz-mcp/`

**Features:**
- Dynamic tool discovery (runs `mcp-cli tools tabz`)
- Schema lookup before calls (`mcp-cli info tabz/<tool>`)
- Common workflow patterns for multi-step tasks
- Selector tips and debugging guidance

**Perfect for:**
- Controlling AI tools (Sora, DALL-E) - fill prompts, click generate, download results
- Testing Vercel deployments
- Opening GitHub PRs/issues during development
- Browser automation without writing code

Just ask naturally: "Take a screenshot", "Click the submit button", "Fill the email field"

### Omnibox URL Navigation

The extension supports opening URLs from Chrome's omnibox (address bar):

**Usage:** `term <url>`

**Examples:**
- `term github.com/user/repo` - Open GitHub repository
- `term localhost:3000` - Open dev server
- `term my-app.vercel.app` - Open Vercel deployment

See [OMNIBOX_FEATURES.md](OMNIBOX_FEATURES.md) for complete documentation.

---

## 🐛 Known Issues

1. **WSL Connection** - If loading from WSL path, must use `localhost` not `127.0.0.1`
2. **Paste to TUI Apps** - Text pastes directly, may corrupt TUI apps if not at prompt
3. **Keyboard Shortcuts Need Configuration** - Alt+T/W/1-9 defined in manifest but require user to set in `chrome://extensions/shortcuts` (no defaults due to Chrome restrictions)

---

## 📜 Documentation Index

### Core Documentation (Root Directory)

- **[CLAUDE.md](CLAUDE.md)** (this file) - Architecture, development rules, current system state
- **[README.md](README.md)** - User-facing documentation, getting started, features
- **[LESSONS_LEARNED.md](LESSONS_LEARNED.md)** - Technical insights, common pitfalls, prevention strategies
- **[CHANGELOG.md](CHANGELOG.md)** - Version history, bug fixes, feature additions
- **[PLAN.md](PLAN.md)** - Refactoring roadmap, technical debt, future improvements
- **[OMNIBOX_FEATURES.md](OMNIBOX_FEATURES.md)** - Chrome omnibox URL navigation feature

### Tabz MCP Documentation

- **[tabz-mcp-server/MCP_TOOLS.md](tabz-mcp-server/MCP_TOOLS.md)** - Complete reference for all Tabz MCP tools
- **`~/.claude/skills/tabz-mcp/`** - Claude skill for guided browser automation

### Organized Documentation (docs/ folder)

See **[docs/README.md](docs/README.md)** for navigation guide.

#### Bug Investigations (docs/bugs/)
- **[docs/bugs/CONNECTION_DEBUG.md](docs/bugs/CONNECTION_DEBUG.md)** - WebSocket connection debugging
- **[docs/bugs/SESSION_DEBUG.md](docs/bugs/SESSION_DEBUG.md)** - Session debugging notes

#### Planning & Analysis (docs/planning/)
- **[docs/planning/](docs/planning/)** - Feature planning and integration docs

#### Technical Reference (docs/reference/)
- **[docs/reference/CLAUDE_CODE_COLORS.md](docs/reference/CLAUDE_CODE_COLORS.md)** - Terminal color schemes
- **[docs/reference/SEND_KEYS_SAFETY.md](docs/reference/SEND_KEYS_SAFETY.md)** - Send-keys safety guidelines

#### Archived & Historical (docs/archived/)
- **[docs/archived/](docs/archived/)** - Completed work, historical notes, legacy code audits

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

### Starting the Dev Environment

**Recommended: Use the dev script (creates named tmux session):**
```bash
./scripts/dev.sh
```

This creates a tmux session named `tabz-chrome` with:
- `tabz-chrome:backend` - Backend server window
- `tabz-chrome:logs` - Optional live logs window (refreshes every 1s)

**Alternative: Manual start:**
```bash
cd backend && npm start
```

**Check if backend is running:**
```bash
ps aux | grep "node server.js" | grep -v grep
```

**Backend listens on:** `http://localhost:8129`

### Backend Logs Profile

The extension includes a "Backend Logs" profile that shows live backend output:
1. Start backend with `./scripts/dev.sh`
2. In the extension, click the + dropdown → "Backend Logs"
3. Watch live logs update every second

The profile uses `tmux capture-pane -t tabz-chrome:backend` - no hardcoded paths needed.

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
# Ctrl+C to stop, then:
cd backend && npm start
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

### Testing

**Run all tests:**
```bash
npm test           # Watch mode
npm test -- --run  # Single run
```

**Run specific test files:**
```bash
npm test -- --run tests/unit/hooks/           # All hook tests
npm test -- --run tests/unit/content/         # Content script tests
npm test -- --run tests/integration/          # Integration tests
```

**Test Structure:**
```
tests/
├── setup.ts                          # Global mocks (Chrome APIs, WebSocket, etc.)
├── smoke.test.ts                     # Basic infrastructure tests
├── unit/
│   ├── hooks/
│   │   ├── useProfiles.test.ts       # Profile CRUD, defaults (18 tests)
│   │   ├── useWorkingDirectory.test.ts  # Directory inheritance (21 tests)
│   │   └── useTerminalSessions.test.ts  # Session lifecycle (30 tests)
│   └── content/
│       └── content.test.ts           # Send to Tabz button, patterns (66 tests)
└── integration/
    ├── terminal-lifecycle.test.ts    # Spawn → persist → reconnect (15 tests)
    └── profile-inheritance.test.ts   # Working dir inheritance flow (19 tests)
```

**Total: 174 tests** covering:
- **Hooks**: Profile management, working directory, terminal sessions
- **Content Script**: Command pattern matching, button injection, GitHub/GitLab detection
- **Integration**: End-to-end state flows for critical user journeys

**Writing New Tests:**
- Use existing mocks from `tests/setup.ts` (Chrome storage, runtime, WebSocket)
- For async hooks, use `waitFor()` from `@testing-library/react`
- Avoid mixing `vi.useFakeTimers()` with `waitFor()` - they don't play well together
- See `tests/unit/hooks/useTerminalSessions.test.ts` for complex async patterns

### Browser Console Forwarding (Claude Debugging)

**Automatic in dev mode!** Browser console logs are automatically forwarded to the backend terminal for easy debugging.

**What gets forwarded:**
- `console.log()` → Backend terminal with `[Browser]` prefix
- `console.error()` → Red error in backend terminal
- `console.warn()` → Yellow warning in backend terminal
- Includes source file:line (e.g., `[Browser:SimpleTerminalApp.tsx:123]`)

**Claude can capture logs directly**:
```bash
# Capture backend logs (when started with ./scripts/dev.sh):
tmux capture-pane -t tabz-chrome:backend -p -S -100

# Check backend logs for WebSocket activity
ps aux | grep "node server.js" | grep -v grep

# List active Chrome extension terminals
tmux ls | grep "^ctt-"

# Check specific terminal output
tmux capture-pane -t Bash -p -S -20
```

**User can view logs manually:**
```bash
# Backend logs appear in the terminal where you ran `npm start`
# Look for [Browser] prefixed lines for frontend logs
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

- **GitHub**: https://github.com/GGPrompts/TabzChrome
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

