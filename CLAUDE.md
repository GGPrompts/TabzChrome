# CLAUDE.md - Tmux Chrome Sidebar

## 🎯 Project Overview

A **Chrome extension for managing tmux sessions in a persistent browser sidebar**. Built with React, TypeScript, and xterm.js, it provides terminal access directly in Chrome's side panel.

**Version**: 1.0.1
**Status**: Standalone Chrome Extension - Full Feature Set Complete ✅
**Architecture**: Chrome Extension (Side Panel) + WebSocket terminal backend
**Original Project**: Extracted from [Tabz](https://github.com/GGPrompts/Tabz)
**Last Updated**: November 18, 2025

---

## 🏗️ Architecture

### Chrome Extension (React + TypeScript + Vite)
```
extension/
├── sidepanel/
│   └── sidepanel.tsx           # Main sidebar UI with tabs/terminals
├── components/
│   ├── Terminal.tsx            # xterm.js terminal component
│   ├── QuickCommandsPanel.tsx  # Commands panel with categories
│   ├── CommandEditorModal.tsx  # Custom command editor
│   └── SettingsModal.tsx       # Font size + theme settings
├── background/
│   └── background.ts           # Service worker (WebSocket + shortcuts)
├── shared/
│   ├── messaging.ts            # Extension messaging helpers
│   └── storage.ts              # Chrome storage helpers
└── manifest.json               # Extension configuration
```

### Backend (Node.js + Express + PTY)
```
backend/
├── server.js                   # Express + WebSocket server
├── modules/
│   ├── terminal-registry.js    # Terminal state management (generates ctt- IDs)
│   ├── pty-handler.js          # PTY process spawning
│   └── unified-spawn.js        # Terminal spawning logic
└── routes/
    └── api.js                  # REST API endpoints (tmux session management)
```

### Terminal ID Prefixing (`ctt-`)
**All Chrome extension terminals use `ctt-` prefix** (Chrome Terminal Tabs)
- Terminal IDs: `ctt-{uuid}` (e.g., `ctt-a1b2c3d4-e5f6...`)
- Generated in: `backend/modules/terminal-registry.js` (line 217)
- Purpose:
  - Distinguish from web app terminals (`tt-` prefix)
  - Easy identification: `tmux ls | grep "^ctt-"`
  - Easy cleanup of orphaned sessions
- Kill orphaned sessions:
  ```bash
  tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
  ```

### Communication
- **WebSocket**: Real-time terminal I/O (background worker → terminals)
- **Chrome Messages**: Extension page communication
- **Chrome Storage**: Settings persistence (font size, theme, spawn options)

### Session Persistence & Restoration
**Tmux sessions survive extension reloads** - No more orphaned background sessions!
- **On WebSocket Connect**: Backend sends terminal list (`type: 'terminals'`)
- **Sidepanel Restores**: Creates tabs for all existing terminals
- **Terminal Components**: Reconnect to tmux sessions automatically
- **Benefits**:
  - Extension reload doesn't lose terminals
  - Terminal output history preserved
  - No accumulation of orphaned tmux sessions
  - Seamless user experience across reloads
- **Files**:
  - `extension/background/background.ts` (WebSocket message handling)
  - `extension/sidepanel/sidepanel.tsx` (session restoration logic)

---

## 🎨 Core Principles

1. **Simplicity Over Features** - Minimal, focused functionality
2. **Sidebar-First** - Always accessible, never in the way
3. **Chrome Native** - Uses Chrome's side panel API (Manifest V3)
4. **Settings Persistence** - Font size, theme, custom commands saved in Chrome storage
5. **Easy to Deploy** - Extension (load unpacked) + Backend (any server with tmux)

---

## 📐 Development Rules

### ALWAYS:
1. **Keep It Simple** - If it adds complexity, think twice
2. **Test Terminal Types** - Verify Claude Code, Bash, TFE work
3. **Run Tests Before Committing** - `npm test` should pass with no failures
4. **Mobile-First CSS** - Use responsive design patterns
5. **Document Changes** - Follow documentation workflow below
6. **No Canvas Code** - This is the tab-based version, no dragging/zoom

### NEVER:
1. **Don't Add Canvas Features** - Dragging, resizing, zoom, pan = NO
2. **Don't Import from Opustrator Canvas Code** - Keep it independent
3. **Don't Over-Engineer** - Simple solutions win
4. **Don't Break WebSocket Protocol** - Backend compatibility is critical
5. **Don't Skip Tests** - Failing tests = failing features
6. **Don't Use `tmux send-keys` for Commands** - Use `/api/tmux/sessions/:name/command` API instead to prevent terminal corruption

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
rsync -av --delete /home/matt/projects/terminal-tabs-extension/dist-extension/ /mnt/c/Users/marci/Desktop/terminal-tabs-extension/dist-extension/
```

**Load/Reload in Chrome:**
1. Navigate to `chrome://extensions`
2. Enable "Developer mode" (top-right toggle)
3. First time: Click "Load unpacked" → Select `C:\Users\marci\Desktop\terminal-tabs-extension\dist-extension`
4. After rebuilding: Click the 🔄 **Reload** button on the extension card

**Quick rebuild and deploy workflow:**
```bash
npm run build:extension && rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/terminal-tabs-extension/dist-extension/
```

---

## 🚀 Key Features (Current)

✅ **Chrome Side Panel** - Always accessible, never blocks content
✅ **Settings Modal (Tabbed)** - General + Spawn Options tabs
  - Font size (12-24px), Font family (6 options), Light/Dark theme
  - Spawn options editor (add/edit/delete terminals in UI)
✅ **Session Persistence** - Tmux sessions survive extension reloads
✅ **Global "Use Tmux" Toggle** - Force all terminals to use tmux
✅ **Custom Commands** - Add your own clipboard commands
✅ **Quick Commands Panel** - Built-in git, npm, shell commands + terminal spawning
✅ **Terminal Spawning** - 18+ terminal types (loaded from spawn-options.json)
✅ **Full Terminal Emulation** - xterm.js with copy/paste support, auto-fit
✅ **WebSocket Communication** - Real-time I/O via background worker
✅ **Keyboard Shortcut** - Ctrl+Shift+9 to open sidebar (customizable)
✅ **Context Menu** - Right-click → "Open Terminal Sidebar"
✅ **Connection Status** - WebSocket connection indicator
✅ **Clipboard Support** - Copy (Ctrl+Shift+C) / Paste (Ctrl+Shift+V) in terminals

---

## 📋 Current State

### What Works
- ✅ Chrome side panel integration (sidebar persists across tabs)
- ✅ Extension icon click → Opens sidebar directly
- ✅ Keyboard shortcut (Ctrl+Shift+9) → Opens sidebar
- ✅ Context menu → "Open Terminal Sidebar"
- ✅ Settings modal with font size + theme toggle
- ✅ Custom commands with category organization
- ✅ Commands panel (spawn terminals, copy commands to clipboard)
- ✅ Terminal spawning (bash, Claude Code, TFE, LazyGit, etc.)
- ✅ Terminal I/O (keyboard input, output display)
- ✅ WebSocket auto-reconnect
- ✅ Copy/paste in terminals (Ctrl+Shift+C/V)
- ✅ Session tabs (switch between multiple terminals)
- ✅ Terminal close button

### Known Issues
- ⚠️ **Font size changes require extension reload** to take effect (not live update)
- ⚠️ Theme toggle works but may need terminal reconnect for full effect

### What Needs Work (See PLAN.md)
- Search/filter in Commands panel
- Working directory field for spawn options
- Tmux session management integration (future)

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

### Custom Commands

Click the ⚙️ icon in the Commands panel to manage custom commands.

**Adding Commands:**
1. Fill in label, command, description
2. Select category (or create new)
3. Choose type:
   - **Spawn Terminal**: Opens new terminal with command
   - **Copy to Clipboard**: Copies command for manual use
4. Click "Add"

**Built-in Categories:**
- Terminal Spawning (Claude Code, Bash, TFE, LazyGit, etc.)
- Git (status, pull, push, commit, branch)
- Development (npm, build, test)
- Shell (ls, find, mkdir, ps)

**Custom Categories:**
- Create your own organization
- Group related commands
- Collapsible/expandable

### Keyboard Shortcuts

**Open Sidebar:**
- Default: `Ctrl+Shift+9`
- Customize at: `chrome://extensions/shortcuts`

**In Terminal:**
- Copy: `Ctrl+Shift+C` (when text selected)
- Paste: `Ctrl+Shift+V`

### Context Menu

Right-click anywhere on a webpage → **"Open Terminal Sidebar"**

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

## 🔧 Configuration

### spawn-options.json
Located at `public/spawn-options.json` - defines available terminal types:

```json
{
  "spawnOptions": [
    {
      "label": "Claude Code",
      "command": "claude",
      "terminalType": "claude-code",
      "icon": "🤖",
      "description": "Claude Code (interactive mode)",
      "defaultSize": { "width": 1200, "height": 800 },
      "defaultTheme": "amber",
      "defaultTransparency": 100
    }
  ]
}
```

### Theme Aliases
Use intuitive aliases in spawn-options:
- `amber` → Retro Amber (orange monochrome)
- `green` → Matrix Rain (green on black)
- `purple` → Cyberpunk Neon
- `pink` → Vaporwave Dreams
- `blue` → Holographic
- `ocean` → Deep Ocean
- `dark` → GitHub Dark

---

## 🐛 Known Issues

1. **No Keyboard Shortcuts** - Missing Ctrl+T, Ctrl+W, etc.
2. **Mobile Untested** - May need responsive CSS work

---

## 📜 Documentation Index

### Core Documentation (Root Directory)

- **[CLAUDE.md](CLAUDE.md)** (this file) - Architecture, development rules, current system state
- **[README.md](README.md)** - User-facing documentation, getting started, features
- **[CHANGELOG.md](CHANGELOG.md)** - Version history, bug fixes, feature additions
- **[LESSONS_LEARNED.md](LESSONS_LEARNED.md)** - Technical insights, common pitfalls, prevention strategies

### Development Planning (Root Directory)

- **[PLAN.md](PLAN.md)** - Refactoring roadmap, technical debt, future improvements
- **[NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md)** - Session summaries, debugging notes, next steps

### Archived Documentation (docs/ folder)

#### Split Terminal Implementation
- **[docs/SPLIT_TERMINAL_FIXES.md](docs/SPLIT_TERMINAL_FIXES.md)** - Split terminal visual & performance fixes (completed)
- **[docs/SPLIT_PERFORMANCE_FIXES_v2.md](docs/SPLIT_PERFORMANCE_FIXES_v2.md)** - React.memo, throttling, performance optimizations (completed)

#### Tmux Integration
- **[docs/TMUX_RENDERING_FINAL.md](docs/TMUX_RENDERING_FINAL.md)** - Complete tmux rendering solution (completed)
- **[Tmux EOL Fix Gist](https://gist.github.com/GGPrompts/7d40ea1070a45de120261db00f1d7e3a)** - Fixing xterm.js EOL conversion for tmux splits (critical fix)
- **[docs/TMUX_RENDERING_FIX.md](docs/TMUX_RENDERING_FIX.md)** - Initial tmux rendering debugging (superseded by FINAL)
- **[docs/TMUX_SPLIT_RENDERING_DEBUG.md](docs/TMUX_SPLIT_RENDERING_DEBUG.md)** - Tmux split debugging notes (historical)
- **[docs/TMUX_MIGRATION_PLAN.md](docs/TMUX_MIGRATION_PLAN.md)** - Tmux migration planning (historical)

#### Testing Infrastructure
- **[docs/TEST_INFRASTRUCTURE_SUMMARY.md](docs/TEST_INFRASTRUCTURE_SUMMARY.md)** - Test setup documentation (completed)
- **[docs/TEST_COVERAGE_SUMMARY.md](docs/TEST_COVERAGE_SUMMARY.md)** - Coverage analysis (historical)
- **[docs/TESTING_SUMMARY.md](docs/TESTING_SUMMARY.md)** - Testing workflow notes (historical)
- **[docs/TESTING_PROMPT.md](docs/TESTING_PROMPT.md)** - Testing prompts (historical)

#### Legacy/Reference
- **[docs/CONTINUATION_PROMPT.md](docs/CONTINUATION_PROMPT.md)** - Legacy session prompts
- **[docs/OPUSTRATOR_IMPROVEMENTS.md](docs/OPUSTRATOR_IMPROVEMENTS.md)** - Improvements from parent project

**Quick Navigation:**
- 🐛 Debugging a bug? → [LESSONS_LEARNED.md](LESSONS_LEARNED.md)
- 📦 What changed in version X? → [CHANGELOG.md](CHANGELOG.md)
- 🏗️ Planning refactoring? → [PLAN.md](PLAN.md)
- 📖 User documentation? → [README.md](README.md)
- 🧭 Understanding architecture? → This file
- 📚 Historical reference? → [docs/](docs/) folder

---

## 📊 Project Metrics

| Metric | Value |
|--------|-------|
| Dependencies | 74 packages |
| Lines of Code | ~44,000 |
| Frontend Size | ~200KB gzipped |
| Backend Port | 8127 |
| Terminal Types | 15 |
| Themes | 14 |

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

The backend runs in a tmux session when started with `./start-tmux.sh`. View logs in multiple ways:

**1. Attach to Backend Session (Live Logs)**
```bash
tmux attach -t tabz:backend
# Press Ctrl+B, then D to detach
```

**2. View Logs in App (Dev Logs Terminal)**
- Spawn "Dev Logs" terminal from the spawn menu
- Shows last 100 lines with beautiful colors
- Uses tmux capture-pane for live viewing

**3. Check Active Tmux Sessions**
```bash
tmux ls
# Shows all tmux sessions including:
# - tabz:backend (backend server)
# - tabz:frontend (Vite dev server)
# - tt-bash-xyz (spawned bash terminals)
# - tt-cc-abc (spawned Claude Code terminals)
```

### Monitoring Terminal Sessions

**List Active Terminal Sessions**
```bash
# In terminal or via Dev Logs spawn option:
tmux ls | grep "^tt-"
# Shows all spawned terminal sessions (tt-bash-*, tt-cc-*, etc.)
```

**Capture Pane Contents**
```bash
# Capture last 100 lines from a specific session
tmux capture-pane -t tt-bash-xyz -p -S -100

# Capture entire scrollback
tmux capture-pane -t tt-bash-xyz -p -S -
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
- Check backend logs: `tmux attach -t tabz:backend`
- Look for spawn errors, working directory validation failures
- Verify `spawn-options.json` syntax

**2. Terminal spawned but blank**
- Check if session exists: `tmux ls | grep tt-`
- Try refit button (🔄) in footer
- Check browser console for xterm.js errors

**3. Persistence not working**
- Verify tmux sessions survive: refresh page, run `tmux ls`
- Check localStorage in browser DevTools (Application → Local Storage)
- Look for `simple-terminal-storage` key with terminals array

**4. Backend crash/restart**
- Terminals in tmux sessions survive backend restart
- Refresh frontend to reconnect
- Sessions will reattach automatically

### Dev Server Ports

- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend**: http://localhost:8127 (WebSocket + REST API)
- **WebSocket**: ws://localhost:8127

### Browser Console Forwarding (Claude Debugging)

**Automatic in dev mode!** Browser console logs are automatically forwarded to the backend terminal for easy debugging.

**What gets forwarded:**
- `console.log()` → Backend terminal with `[Browser]` prefix
- `console.error()` → Red error in backend terminal
- `console.warn()` → Yellow warning in backend terminal
- Includes source file:line (e.g., `[Browser:SimpleTerminalApp.tsx:123]`)

**Claude can capture logs directly** (when you run `./start-tmux.sh`):
```bash
# Claude runs these via Bash tool after making changes:
tmux capture-pane -t tabz:backend -p -S -100   # Backend logs
tmux capture-pane -t tabz:frontend -p -S -100  # Frontend logs
tmux ls | grep "^tt-"                                    # Active terminals
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

## 🧪 Testing Workflow

### Pre-Commit Testing (REQUIRED)

**Before committing ANY code changes, run the test suite:**

```bash
npm test
```

**All tests must pass** - No exceptions! If tests fail:
1. Fix the failing tests (don't skip them)
2. If your changes intentionally break tests, update the tests
3. Never commit with failing tests

> **See Also:** [LESSONS_LEARNED.md](LESSONS_LEARNED.md#testing-detachreattach) for testing checklists and verification procedures.

### Test Suite Overview

**Current Test Coverage:**
- **15 integration tests** for detach/reattach workflow
- **35+ integration tests** for split operations
- **20+ integration tests** for terminal spawning
- **Unit tests** for hooks, stores, and utilities

**Run specific test suites:**
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/integration/detach-reattach.test.ts

# Run in watch mode (during development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test-Driven Development

When fixing bugs or adding features:

1. **Write a failing test** that reproduces the bug
2. **Fix the bug** until the test passes
3. **Verify all other tests** still pass
4. **Commit with passing tests**

Example from detach/reattach bug fixes:
```typescript
// 1. Write test showing the bug
it('should reattach whole split when clicking detached pane tab', () => {
  // Test fails because clicking pane only reattaches that pane
})

// 2. Fix the code (add detachedSplitContainer check)

// 3. Test now passes - commit!
```

### Why Testing Matters

**Regression Prevention**: Tests catch bugs we've already fixed:
- ✅ Detach no longer kills tmux sessions
- ✅ processedAgentIds cleared properly
- ✅ Split layout preserved on reattach

**Confidence**: Change code without fear of breaking existing features

**Documentation**: Tests show how features should work

### CI/CD (Future)

When CI is set up, tests will run automatically on:
- Every push to GitHub
- Every pull request
- Pre-merge validation

---

## 📝 Notes for AI Assistants

### Project Context
- This project was extracted from Opustrator to create a simpler tab-based version
- The backend is shared with Opustrator (same WebSocket protocol)
- Focus on simplicity - no canvas features should be added
- **Run `npm test` before committing** - All tests must pass
- Test spawning terminals after changes (Bash, TFE, Claude Code)
- Keep dependencies minimal - avoid adding new npm packages

> **Important:** Follow the [Documentation Workflow](#-documentation-workflow) when making changes. See [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for common pitfalls and prevention strategies.

### Autonomous Debugging Workflow

> **See Also:** [LESSONS_LEARNED.md](LESSONS_LEARNED.md#debugging-patterns) for diagnostic logging patterns and multi-step state change checklists.

**When user runs `./start-tmux.sh`, you can debug autonomously:**

1. **Make code changes** (Edit/Write tools)

2. **Check if it's working** (Bash tool):
   ```bash
   # Check backend logs
   tmux capture-pane -t tabz:backend -p -S -100

   # Check frontend logs (includes browser console via forwarder)
   tmux capture-pane -t tabz:frontend -p -S -100

   # Check active terminal sessions
   tmux ls | grep "^tt-"

   # Check specific terminal
   tmux capture-pane -t tt-bash-xyz -p -S -50
   ```

3. **Analyze and fix** - You can see errors directly without asking user

**Example autonomous debugging:**
```bash
# After updating Terminal.tsx:
# 1. Capture backend to see if terminal spawned
tmux capture-pane -t tabz:backend -p -S -50 | tail -20

# 2. Check for browser errors
tmux capture-pane -t tabz:backend -p -S -100 | grep "\[Browser.*ERROR"

# 3. Verify terminal session exists
tmux ls | grep "tt-bash"
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

