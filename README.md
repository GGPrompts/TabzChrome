# Tabz

**Terminal sessions in your Chrome sidebar - Windows Terminal style**

![Version](https://img.shields.io/badge/version-2.7.0-blue)
![Chrome](https://img.shields.io/badge/chrome-manifest%20v3-green)
![License](https://img.shields.io/badge/license-MIT-green)

![TabzChrome - Terminal sidebar with Claude Code, lazygit, and system monitoring](docs/screenshots/hero-dark.png)

## What Is This?

A Chrome extension that puts bash terminals in your browser's sidebar. Browse the web with your terminals always visible - no window juggling, no Alt+Tab.

**Key features:**
- **Profiles with Categories** - Organize profiles into color-coded groups (Claude Code, TUI Tools, etc.)
- **Color-coded tabs** - Terminal tabs show category colors for easy identification
- **Persistent sessions** - Terminals survive sidebar close/reopen (powered by tmux)
- **Smart directory inheritance** - Set a global working directory, profiles inherit it
- **Tabz MCP tools** - Let Claude Code control your browser (screenshots, clicks, form filling)

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
- **Category** - Optional grouping (e.g., "Claude Code", "TUI Tools") with color coding
- **Working Directory** - Optional (inherits from header if empty)
- **Startup Command** - Optional command to run on spawn (e.g., `lazygit`, `htop`)
- **Font Size** - 12-24px per profile
- **Theme** - 6 color schemes (high-contrast, dracula, ocean, neon, amber, matrix) + dark/light toggle

#### Profile Categories

Organize your profiles into color-coded groups:

- **Collapsible Groups** - Click category header to expand/collapse
- **9 Colors** - Green, Blue, Purple, Orange, Red, Yellow, Cyan, Pink, Gray
- **Color Picker** - Click color dots next to category to change color
- **Color-Coded Tabs** - Selected terminal tabs show their category color
- **Search** - Filter profiles by name, command, or category

#### Import/Export Profiles

Backup and share your profile configurations:

- **Export** - Click the download icon to save all profiles as `tabz-profiles-{date}.json`
- **Import** - Click the upload icon to load profiles from a JSON file
- **Merge** - Add new profiles while keeping existing ones (duplicates by ID are skipped)
- **Replace** - Replace all existing profiles with imported ones

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

### Ghost Badge - Detached Sessions Manager

The 👻 badge appears in the header when orphaned tmux sessions exist (sessions running in tmux but not attached to the UI).

**Use cases:**
- Detach long-running sessions to free up tab space
- Recover sessions after browser crash or sidebar close
- Clean up forgotten sessions

**How to use:**
1. Right-click a tab → "👻 Detach Session" - removes from UI but keeps tmux session alive
2. Ghost badge appears with count of detached sessions
3. Click badge → select sessions → **Reattach** (bring back as tabs) or **Kill** (destroy)

| Action | Result |
|--------|--------|
| Detach Session | Tab removed, tmux session preserved, appears in Ghost Badge |
| Reattach | Session restored as a tab with full terminal history |
| Kill | Tmux session destroyed permanently |

### Claude Code Status Detection

Terminal tabs show live Claude Code status with emoji indicators:

| Emoji | Meaning |
|-------|---------|
| 🤖✅ | Claude ready/waiting for input |
| 🤖⏳ | Claude is thinking |
| 🤖🔧 | Claude is using a tool |

**Setup required** - See [claude-hooks/README.md](claude-hooks/README.md) for installation.

### Claude Code Audio Announcements

Get voice announcements for Claude Code activity using Edge TTS:

```bash
# Enable audio for a session
CLAUDE_AUDIO=1 claude

# With custom voice
CLAUDE_AUDIO=1 CLAUDE_VOICE="en-GB-SoniaNeural" claude
```

**What gets announced:**
- Session start/ready for input
- Tool usage with context (e.g., "Reading package.json", "Editing App.tsx")

**Configuration file:** `~/.claude/audio-config.sh`

```bash
# Key settings
DEFAULT_VOICE="en-US-AndrewMultilingualNeural"  # Edge TTS voice
DEFAULT_RATE="+30%"                              # Speech speed
PLAYBACK_SPEED="1.0"                             # mpv speed multiplier
TOOL_DEBOUNCE_MS="1000"                          # Min gap between announcements

# Toggle features
ANNOUNCE_TOOLS="true"
ANNOUNCE_SESSION_START="true"
ANNOUNCE_READY="true"

# Custom audio clips (optional)
CUSTOM_CLIPS_DIR="/path/to/clips"
```

**Available voices** (run `edge-tts voice-list` for full list):

| Voice | Description |
|-------|-------------|
| `en-US-AndrewMultilingualNeural` | US Male (default) |
| `en-US-EmmaMultilingualNeural` | US Female |
| `en-GB-SoniaNeural` | British Female |
| `en-GB-RyanNeural` | British Male |
| `en-AU-WilliamNeural` | Australian Male |

**Multi-Claude setups:** Use different voices per terminal to distinguish which Claude is speaking:

```bash
# Terminal 1
CLAUDE_AUDIO=1 CLAUDE_VOICE="en-US-AndrewMultilingualNeural" claude

# Terminal 2
CLAUDE_AUDIO=1 CLAUDE_VOICE="en-GB-SoniaNeural" claude
```

**Custom clips:** Drop `.mp3` files in your clips directory to replace TTS:
- `ready.mp3` - Played when Claude is ready for input
- `session-start.mp3` - Played on session start
- `build-pass.mp3` - Played on successful build
- `error.mp3` - Played on errors

**Requirements:** `edge-tts` and `mpv` must be installed.

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

## Tabz MCP Integration

Tabz includes an **MCP server** with 20 tools that let Claude Code control your browser:

| Tool | Description |
|------|-------------|
| `tabz_screenshot` | Capture viewport to disk |
| `tabz_screenshot_full` | Capture entire scrollable page |
| `tabz_click` | Click element by CSS selector |
| `tabz_fill` | Type into input fields |
| `tabz_execute_script` | Run JavaScript |
| `tabz_get_console_logs` | View browser console |
| `tabz_list_tabs` | List open tabs |
| `tabz_switch_tab` | Switch to a tab |
| `tabz_rename_tab` | Assign custom names to tabs |
| `tabz_open_url` | Navigate to allowed domains |
| `tabz_get_page_info` | Get current URL/title |
| `tabz_download_image` | Download images to disk |
| `tabz_get_element` | Inspect element HTML/CSS |
| `tabz_enable_network_capture` | Start capturing network requests |
| `tabz_get_network_requests` | List captured XHR/fetch requests |
| `tabz_get_api_response` | Get full response body for a request |
| `tabz_clear_network_requests` | Clear captured requests |
| `tabz_download_file` | Download any URL to disk |
| `tabz_get_downloads` | List recent downloads with status |
| `tabz_cancel_download` | Cancel in-progress download |

### Configure in Settings

Click ⚙️ → **MCP Tools** tab to:
- Toggle individual tools on/off
- See token usage estimates
- Add custom allowed domains for `tabz_open_url`
- Apply presets (Minimal, Standard, Full)

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
       "tabz": {
         "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
         "args": [],
         "env": { "BACKEND_URL": "http://localhost:8129" }
       }
     }
   }
   ```

See [tabz-mcp-server/MCP_TOOLS.md](tabz-mcp-server/MCP_TOOLS.md) for full documentation.

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
├── tabz-mcp-server/  # MCP server for Claude Code
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

## Backend Configuration

The backend server supports optional environment variables in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8129` | HTTP/WebSocket server port |
| `LOG_LEVEL` | `4` | Logging verbosity: 0=silent, 1=fatal, 2=error, 3=warn, 4=info, 5=debug |
| `LOG_FILE` | *(none)* | Optional file path to write logs (e.g., `logs/backend.log`) |
| `CLEANUP_ON_START` | `false` | Kill orphaned tmux sessions on backend start |

**Example `backend/.env`:**
```bash
PORT=8129
LOG_LEVEL=5        # Enable debug logging
# LOG_FILE=logs/backend.log
```

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
