# Tmux Chrome Sidebar

**A Chrome extension for managing tmux sessions in a persistent browser sidebar**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome](https://img.shields.io/badge/chrome-extension-green)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 What Is This?

A **standalone Chrome extension** that puts a tmux session manager in your browser's sidebar. Browse the web with your terminal sessions always visible and accessible - no window juggling, no Alt+Tab, just your terminals right where you need them.

### Key Philosophy

**Tmux is the source of truth.** This extension doesn't manage terminal state - it queries tmux for active sessions and displays them in a clean sidebar interface. Simple polling, zero state sync bugs, true persistence.

---

## ✨ Features

### ⚙️ Settings & Customization
- **Font Size Control** - Adjust 12-24px with live preview
- **Theme Toggle** - Switch between Dark (green on black) and Light (dark on white)
- **Settings Persistence** - Saved in Chrome storage, survives restart
- **Note:** Font size changes require extension reload to fully apply

### 🔧 Terminal Management
- **Session Tabs** - Switch between multiple terminals
- **One-click spawn** - 15+ terminal types (Claude Code, Bash, TFE, LazyGit, etc.)
- **Copy/Paste** - Ctrl+Shift+C/V in terminals
- **Connection Status** - WebSocket indicator
- **Terminal I/O** - Full xterm.js emulation with real-time communication

### 🎨 User Experience
- **Always visible** - Sidebar persists across all tabs
- **Never moves** - No window positioning, no Z-index battles
- **Multi-monitor friendly** - Drag Chrome to any screen
- **Session persistence** - Terminals survive sidebar close/reopen
- **Clean UI** - Green/cyan color scheme
- **Keyboard shortcut** - Ctrl+Shift+9 to open (customizable)
- **Context menu** - Right-click → "Open Terminal Sidebar"

---

## 🏗️ Architecture

### Simple 3-Layer Design

```
┌─────────────────────────────────────┐
│  Chrome Extension (React)           │
│  - Profile-based terminal spawning  │
│  - Session tabs sidebar             │
│  - xterm.js terminal viewer         │
└────────────┬────────────────────────┘
             │ REST API + WebSocket
┌────────────▼────────────────────────┐
│  Backend (Node.js + Express)        │
│  - GET /api/tmux/sessions           │
│  - POST /api/tmux/spawn             │
│  - WebSocket for terminal I/O       │
└────────────┬────────────────────────┘
             │ tmux commands
┌────────────▼────────────────────────┐
│  Tmux Sessions (source of truth)    │
│  - tt-bash-xyz                      │
│  - tt-cc-abc (Claude Code)          │
│  - tt-tfe-def (File Explorer)       │
└─────────────────────────────────────┘
```

### Why Tmux-Only?

**Problems with traditional approaches:**
- State sync bugs between frontend and backend
- Complex localStorage + Zustand + BroadcastChannel
- Manual session naming and tracking
- Persistence layer duplication

**Tmux-only solution:**
- ✅ **Single source of truth** - Tmux manages sessions, we just display them
- ✅ **Auto-naming** - Pane titles become session names
- ✅ **Free persistence** - Sessions survive everything
- ✅ **40% less code** - No state management libraries needed
- ✅ **Zero sync bugs** - Can't get out of sync with tmux

---

## 🚀 Quick Start

### System Requirements

**Required:**
| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **Node.js** | 18.x | 20.x+ | Required for backend server |
| **Chrome** | 116+ | Latest | Manifest V3, Side Panel API |
| **tmux** | 3.0+ | 3.4+ | Session persistence |
| **OS** | WSL2 / Linux | Ubuntu 22.04+ | Backend requires Unix shell |

**Platform Notes:**
- **Windows users**: Must use WSL2 for the backend - native Windows is not supported
- **macOS**: Works natively with Homebrew-installed tmux
- **Linux**: Works on any distro with Node.js and tmux

**Optional (for enhanced experience):**
- **Nerd Fonts** - Enables icons in terminal (e.g., [JetBrains Mono Nerd Font](https://www.nerdfonts.com/))
- **lazygit** - If you want to use the lazygit profile
- **htop** - If you want to use the htop profile

### Installation

**1. Clone and Install:**
```bash
git clone https://github.com/GGPrompts/tmux-chrome-sidebar.git
cd tmux-chrome-sidebar

# Install dependencies
npm install
cd backend && npm install && cd ..
```

**2. Build Extension:**
```bash
npm run build:extension
```

**3. Load in Chrome:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist-extension/` folder

**4. Start Backend:**
```bash
# WSL (recommended)
cd backend
npm start  # Runs on port 8129

# Or Windows
cd backend
set PORT=8129 && npm start
```

**5. Open Side Panel:**
- **Click extension icon** → Opens sidebar directly
- **Press Ctrl+Shift+9** → Opens sidebar
- **Right-click page** → "Open Terminal Sidebar"

---

## 📝 Usage

### Managing Sessions

**View Sessions:**
- Open side panel → Click "Terminals" tab
- All active tmux sessions appear in list
- Shows session name, window count, status

**Attach to Session:**
- Click any session → Terminal opens
- Type commands, run programs
- Tmux shortcuts work (Ctrl+B prefix)

**Detach from Session:**
- Click ✕ close button
- Session stays alive in tmux
- Appears in session list for later reattach

**Spawn New Session:**
- Click + button in header for default profile
- Click dropdown arrow to select a profile

### Profiles

**Manage Profiles:**
- Click ⚙️ settings icon in header
- Add, edit, or delete profiles

**Profile Settings:**
- Name, optional working directory
- Font size (12-24px)
- Font family and theme

**Working Directory Inheritance:**
- Profiles with empty workingDir inherit from header selector
- Enables one "lazygit" profile that works for any project

---

## 🔧 Configuration

### Ports
- **Backend**: 8129 (configured in `backend/.env`)
- **WebSocket**: `ws://localhost:8129`

### Profiles
- Stored in Chrome storage (local)
- Persist across browser sessions
- Default profiles from `profiles.json`

---

## 📂 Project Structure

```
.
├── extension/                 # Chrome extension source
│   ├── background/           # Service worker
│   ├── sidepanel/            # Main sidebar UI
│   ├── popup/                # Command palette
│   ├── devtools/             # DevTools panel
│   ├── components/           # React components
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   └── SettingsModal.tsx # Profiles management
│   ├── hooks/                # React hooks
│   ├── shared/               # Utilities
│   └── manifest.json         # Extension config
├── backend/                  # Node.js backend
│   ├── server.js            # Express + WebSocket server
│   ├── modules/             # Terminal/tmux logic
│   └── routes/              # API endpoints
├── dist-extension/          # Built extension (load this in Chrome)
└── package.json
```

---

## 🎯 Key Differences from Tabz

| Aspect | Tabz | Tmux Chrome Sidebar |
|--------|------|---------------------|
| **Purpose** | Full terminal manager app | Chrome extension for session management |
| **State** | Zustand + localStorage | Tmux only (polling) |
| **UI** | Browser tabs with splits | Session list + single terminal |
| **Persistence** | Zustand + tmux | Tmux only |
| **Location** | Browser tab | Chrome sidebar |
| **Use Case** | Terminal-focused work | Web browsing + terminal access |

This is a **standalone project**, not a Tabz variant. It shares the backend architecture but has a completely different frontend approach optimized for Chrome's side panel.

---

## 🔌 Backend API

### Session Management
- `GET /api/tmux/sessions` - List all sessions
- `POST /api/tmux/spawn` - Create new session
- `DELETE /api/tmux/sessions/:name` - Kill session
- `POST /api/tmux/sessions/:name/rename` - Rename
- `GET /api/tmux/info/:name` - Get session details

### WebSocket Messages
**Client → Server:**
- `{ type: 'attach-tmux', sessionName }` - Attach
- `{ type: 'command', terminalId, command: data }` - Input
- `{ type: 'resize', terminalId, cols, rows }` - Resize

**Server → Client:**
- `{ type: 'output', terminalId, data }` - Terminal output
- `{ type: 'terminal-closed', data: { id } }` - Session ended

---

## 🛠️ Development

### Building
```bash
# Build extension
npm run build:extension

# Build for distribution
npm run zip:extension  # Creates terminal-tabs-extension.zip
```

### Testing
```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

### Debugging
```bash
# Backend logs (if using tmux startup)
tmux attach -t tmux-chrome-sidebar:backend

# Or view in DevTools
# chrome://extensions → Terminal Tabs → Service Worker → Console
```

---

## 🔧 Troubleshooting

### Common Issues

**Backend won't start**
```bash
# Check if port 8129 is already in use
lsof -i :8129

# Kill orphaned Node processes
pkill -f "node.*server.js"

# Verify tmux is installed
tmux -V
```

**Terminal won't connect**
- Verify backend is running: `curl http://localhost:8129/api/health`
- Check Chrome DevTools console for WebSocket errors
- Ensure you're using `localhost`, not `127.0.0.1` (WSL requirement)

**Sidebar doesn't open**
- Refresh the extension: `chrome://extensions` → click reload icon
- Check service worker console for errors
- Try the keyboard shortcut: `Ctrl+Shift+9`

**tmux sessions not persisting**
```bash
# Check if tmux server is running
tmux ls

# Kill orphaned Chrome extension sessions
tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

**WSL-specific issues**
- Extension must be loaded from Windows path or WSL network path (`\\wsl.localhost\...`)
- Backend must run inside WSL, not Windows
- Use `localhost` in extension, not WSL IP address

---

## 🌐 Browser MCP Integration

TabzChrome includes a **Browser MCP Server** that lets Claude Code control your browser programmatically.

### Available Tools

| Tool | Description |
|------|-------------|
| `browser_get_page_info` | Get current page URL & title |
| `browser_screenshot` | Capture page/element to disk |
| `browser_click` | Click element by CSS selector |
| `browser_fill` | Type text into input field |
| `browser_execute_script` | Run JavaScript in browser |
| `browser_get_console_logs` | View browser console output |
| `browser_list_tabs` | Show all open tabs |
| `browser_switch_tab` | Focus a different tab |
| `browser_rename_tab` | Assign custom name to a tab |
| `browser_open_url` | Navigate to allowed URLs |
| `browser_get_element` | Inspect element HTML/CSS |
| `browser_download_image` | Save image from page |

> **Note:** Most tools support a `tabId` parameter to target specific tabs.

### Quick Start: `/ttmcp` Command

In Claude Code, type `/ttmcp` for an interactive menu:

```
Browser MCP Tools:
───────────────────────────────────────
 1. Page Info      - Get URL & title of current tab
 2. Screenshot     - Capture page/element to disk
 3. Click          - Click element by CSS selector
 4. Fill           - Type text into input field
 5. Execute JS     - Run JavaScript in browser
 ...
───────────────────────────────────────
Enter number (1-12):
```

### Use Cases

- **AI Tool Automation** - Control Sora, DALL-E, ChatGPT interfaces
- **Development Testing** - Test Vercel deployments, localhost apps
- **GitHub Workflows** - Open PRs/issues during git operations
- **Visual Debugging** - Take screenshots, inspect elements, view console logs

### Requirements

1. **Backend running**: `cd backend && npm start`
2. **Extension loaded**: For console log forwarding
3. **Chrome with remote debugging** (see setup below)

### Chrome Debug Setup (WSL2)

WSL2 can't reach Windows `localhost` directly, so we need a port proxy:

**One-time setup (run as Administrator in CMD):**
```cmd
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
```

**Start Chrome with debugging:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Temp\chrome-debug
```

Or create a batch script (e.g., `C:\Users\YourName\Scripts\Chrome-Debug.bat`):
```batch
@echo off
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --remote-debugging-port=9222 ^
    --user-data-dir=C:\Temp\chrome-debug ^
    --no-first-run
```

**Security note:** The `0.0.0.0` binding exposes port 9222 to your local network. This is fine behind a home router. For untrusted networks, use Tailscale or remove the port proxy when not in use:
```cmd
netsh interface portproxy delete v4tov4 listenport=9222 listenaddress=0.0.0.0
```

See [browser-mcp-server/MCP_TOOLS.md](browser-mcp-server/MCP_TOOLS.md) for full documentation.

---

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Technical architecture and development guidelines
- **[browser-mcp-server/MCP_TOOLS.md](browser-mcp-server/MCP_TOOLS.md)** - Browser MCP tools reference
- **[CHANGELOG.md](CHANGELOG.md)** - Version history

---

## 🎨 Design Philosophy

### Always There, Never In The Way
The Chrome sidebar approach means your terminals are:
- **Persistent** across all tabs
- **Fixed position** - no window juggling
- **Multi-monitor friendly** - follows Chrome window
- **Non-intrusive** - collapses when not needed

### Tmux as Truth
Instead of managing state in React:
- Query tmux for sessions (simple polling)
- Display what tmux knows
- Let tmux handle persistence, naming, organization
- 40% less code, zero sync bugs

### Session-First, Not Tab-First
Focus on tmux sessions as the mental model:
- List of sessions (like VS Code terminal panel)
- Click to attach/detach
- Not browser-style tabs with drag/drop
- Simpler, clearer, faster

---

## 🚧 Roadmap

Future enhancements under consideration:
- [ ] Keyboard shortcuts (Alt+T for spawn, Alt+W for close)
- [ ] Export/import profiles
- [ ] Tab context menu (rename, close others)
- [ ] Chrome Web Store publication

---

## 🤝 Contributing

This is a personal project but suggestions welcome! Open an issue or PR.

### Development Setup
1. Fork the repo
2. Create feature branch
3. Make changes
4. Test in Chrome
5. Submit PR

---

## 📄 License

MIT License - see LICENSE file

---

## 🙏 Acknowledgments

- Built with React, TypeScript, xterm.js
- Inspired by Tabz terminal manager
- Uses tmux for session persistence
- Chrome Extension Manifest V3

---

**Built by Matt** | [GitHub](https://github.com/GGPrompts)
