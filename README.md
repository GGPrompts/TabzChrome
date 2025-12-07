# Tabz

**Terminal sessions in your Chrome sidebar - Windows Terminal style**

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Chrome](https://img.shields.io/badge/chrome-manifest%20v3-green)
![License](https://img.shields.io/badge/license-MIT-green)

<!-- Screenshot: Use Win+Shift+S to capture the sidebar + webpage, save to docs/screenshots/sidebar-demo.png -->

## What Is This?

A Chrome extension that puts bash terminals in your browser's sidebar. Browse the web with your terminals always visible - no window juggling, no Alt+Tab.

**Key features:**
- **Profiles** - Save terminal configurations (working directory, startup command, font, theme)
- **Persistent sessions** - Terminals survive sidebar close/reopen (powered by tmux)
- **Smart directory inheritance** - Set a global working directory, profiles inherit it
- **Browser MCP tools** - Let Claude Code control your browser (screenshots, clicks, form filling)

---

## Quick Start

### Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ | Backend server |
| Chrome | 116+ | Manifest V3, Side Panel API |
| tmux | 3.0+ | Session persistence |
| OS | WSL2 / Linux / macOS | Backend requires Unix shell |

### Installation

```bash
# Clone
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome

# Install dependencies
npm install
cd backend && npm install && cd ..

# Build extension
npm run build:extension
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select `dist-extension/`

### Start Backend

```bash
cd backend
npm start  # Runs on port 8129
```

### Open Sidebar

- **Click extension icon** in toolbar
- **Ctrl+Shift+9** keyboard shortcut
- **Right-click page** → "Toggle Terminal Sidebar"

---

## Features

### Profiles System

Click the **+** dropdown to spawn terminals from saved profiles:

- **Name** - Display name for the profile
- **Working Directory** - Optional (inherits from header if empty)
- **Startup Command** - Optional command to run on spawn (e.g., `lazygit`, `htop`)
- **Font Size** - 12-24px per profile
- **Theme** - Dark or Light

### Working Directory Inheritance

The folder icon in the header sets a global working directory. Profiles without an explicit directory inherit this, enabling:

- One "lazygit" profile that works for any project
- One "npm run dev" profile for any Node project
- Just change the header directory to switch projects

### Terminal Features

- **Full xterm.js emulation** - Colors, cursor, scrollback
- **Copy/Paste** - Ctrl+Shift+C / Ctrl+Shift+V
- **Session persistence** - Terminals survive sidebar close (tmux-backed)
- **Tab management** - Multiple terminals, click to switch

### Claude Code Status Detection

Terminal tabs show live Claude Code status with emoji indicators:

| Emoji | Meaning |
|-------|---------|
| 🤖✅ | Claude ready/waiting for input |
| 🤖⏳ | Claude is thinking |
| 🤖🔧 | Claude is using a tool |

**Setup required** - See [claude-hooks/README.md](claude-hooks/README.md) for installation.

### Command History

The chat input bar includes command history:

- **↑/↓ arrows** - Navigate through previous commands
- **Clock icon** - Open history dropdown with remove buttons
- Commands persist in Chrome storage

### Custom Terminal Triggers

Add `data-terminal-command` to any HTML element to make it trigger "Run in Terminal":

```html
<button data-terminal-command="npm run dev">Start Dev</button>
<div data-terminal-command="lazygit">Open Lazygit</div>
```

Clicking the element queues the command to the sidebar chat input.

---

## Browser MCP Integration

Tabz includes an **MCP server** that lets Claude Code control your browser:

| Tool | Description |
|------|-------------|
| `browser_screenshot` | Capture page to disk |
| `browser_click` | Click element by CSS selector |
| `browser_fill` | Type into input fields |
| `browser_execute_script` | Run JavaScript |
| `browser_get_console_logs` | View browser console |
| `browser_list_tabs` | List open tabs |
| `browser_open_url` | Navigate to allowed domains |

### Interactive Command: `/ttmcp`

Type `/ttmcp` in Claude Code for a menu-driven interface to all browser tools.

### Setup (WSL2)

1. **Start Chrome with remote debugging:**
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Temp\chrome-debug
   ```

2. **Configure MCP** in your project's `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "browser": {
         "command": "/path/to/TabzChrome/browser-mcp-server/run-windows.sh",
         "args": [],
         "env": { "BACKEND_URL": "http://localhost:8129" }
       }
     }
   }
   ```

See [browser-mcp-server/MCP_TOOLS.md](browser-mcp-server/MCP_TOOLS.md) for full documentation.

---

## Architecture

```
Chrome Extension (React + TypeScript)
        │
        │ WebSocket + REST API
        ▼
Backend (Node.js + Express, port 8129)
        │
        │ PTY + tmux commands
        ▼
Tmux Sessions (source of truth)
```

**Why tmux?**
- Sessions survive backend restarts
- Free persistence - no database needed
- Single source of truth - no state sync bugs

---

## Project Structure

```
TabzChrome/
├── extension/           # Chrome extension source
│   ├── sidepanel/       # Main sidebar UI
│   ├── components/      # Terminal.tsx, SettingsModal.tsx
│   ├── background/      # Service worker (WebSocket)
│   └── manifest.json
├── backend/             # Node.js server
│   ├── server.js        # Express + WebSocket
│   └── modules/         # PTY, terminal registry
├── browser-mcp-server/  # MCP server for Claude Code
└── dist-extension/      # Built extension (load this)
```

---

## Configuration

### Backend Port

Default: `8129` (configured in `backend/.env`)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+9 | Open sidebar |
| Ctrl+Shift+C | Copy (in terminal) |
| Ctrl+Shift+V | Paste (in terminal) |

Customize at `chrome://extensions/shortcuts`

---

## Troubleshooting

**Backend won't start**
```bash
lsof -i :8129          # Check if port in use
pkill -f "node.*server.js"  # Kill orphaned processes
```

**Terminal won't connect**
- Check backend: `curl http://localhost:8129/api/health`
- WSL users: Use `localhost`, not `127.0.0.1`

**Sidebar doesn't open**
- Reload extension at `chrome://extensions`
- Check service worker console for errors

**Sessions not persisting**
```bash
tmux ls                 # Verify tmux is running
tmux kill-server        # Reset if corrupted
```

---

## Development

```bash
# Build extension
npm run build:extension

# Build + copy to Windows Desktop (WSL2)
npm run build:extension && rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/

# Run tests
npm test
```

---

## API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/spawn` | Spawn terminal |
| GET | `/api/tmux/sessions` | List sessions |

### Spawn Terminal via API

```bash
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Terminal",
    "workingDir": "~/projects",
    "command": "lazygit"
  }'
```

---

## Contributing

Issues and PRs welcome! See [CLAUDE.md](CLAUDE.md) for architecture details.

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Acknowledgments

- Built with React, TypeScript, xterm.js
- Chrome Extension Manifest V3
- tmux for session persistence

**[GitHub](https://github.com/GGPrompts/TabzChrome)** | Built by Matt
