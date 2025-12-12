# Tabz

**Full Linux terminals in your Chrome sidebar**

![Version](https://img.shields.io/badge/version-2.7.0-blue)
![Chrome](https://img.shields.io/badge/chrome-manifest%20v3-green)
![License](https://img.shields.io/badge/license-MIT-green)

![Claude, Gemini, Codex, and Solitaire in a quad-split terminal sidebar - do some shopping while you code](docs/screenshots/hero-dark.png)

> **[Watch: Subagent chaos with audio announcements](https://youtu.be/uY-YbAW7yg4)** - Multiple Claude subagents running with different voice status updates

## What Is This?

**Real bash terminals running in your browser sidebar.** Not a web-based terminal emulator - actual Linux shells connected via WebSocket to your local machine.

Run anything you'd run in a normal terminal:
- **Claude Code, Gemini CLI, OpenAI Codex** - AI coding assistants side-by-side with your browser
- **TUI applications** - lazygit, htop, btop, vim, neovim, midnight commander
- **Development servers** - npm, yarn, docker, kubectl, any CLI tool
- **Full interactivity** - colors, mouse support, copy/paste, scrollback

Browse the web with your terminals always visible - no window juggling, no Alt+Tab. Terminals persist in tmux sessions, so they survive sidebar close/reopen and even browser restarts.

**Why this exists:** If you use AI coding tools (Claude Code, Gemini, Codex), you need terminals visible while browsing docs, PRs, and issues. Tabz keeps them docked to your browser instead of buried behind windows.

**Give your AI full control:** Through MCP tools and REST API, Claude Code can control your browser (screenshots, clicks, form filling, network inspection) and spawn/kill terminal sessions programmatically. Your AI assistant becomes a true automation partner.

> ⚠️ **Security Note:** By default, MCP tools only allow access to safe domains (GitHub, GitLab, Vercel, localhost, AI image generators). "YOLO mode" can be enabled in settings to allow all URLs, but we recommend using a **separate Chrome profile** without personal accounts or saved passwords if you do.

### Key Features

- **Persistent sessions** - Powered by tmux, terminals survive everything
- **Profiles system** - Save configurations for different tools (Claude Code, lazygit, htop)
- **Category organization** - Color-coded groups for easy identification
- **Smart directory inheritance** - Set a global working directory, profiles inherit it
- **Tabz MCP tools** - Let Claude Code control your browser (screenshots, clicks, form filling)
- **Keyboard shortcuts** - Quick access to paste text, send to chat, spawn terminals

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

![Profile settings form with all configuration options](docs/screenshots/profile-settings.png)

- **Name** - Display name for the profile
- **Category** - Optional grouping (e.g., "Claude Code", "TUI Tools") with color coding
- **Working Directory** - Optional (inherits from header if empty)
- **Startup Command** - Optional command to run on spawn (e.g., `lazygit`, `htop`)
- **Font Size** - 12-24px per profile
- **Theme** - 6 color schemes + dark/light toggle (toggle in header bar)

<details>
<summary>🎨 Color Themes & Fonts</summary>

| Color Themes | Font Families |
|:------------:|:-------------:|
| ![6 color schemes: high-contrast, dracula, ocean, neon, amber, matrix](docs/screenshots/color-themes.png) | ![Font options: monospace, JetBrains Mono, Fira Code, Consolas, etc.](docs/screenshots/font-options.png) |

</details>

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

![Working directory dropdown with recent paths](docs/screenshots/working-directory-dropdown.png)

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

![Ghost badge popup showing detached sessions with reattach/kill options](docs/screenshots/ghost-badge.png)

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

Get voice announcements for Claude Code activity. Configure in **Settings → Claude Audio**:

![Audio settings tab with voice selection and event toggles](docs/screenshots/audio-settings.png)

**Settings:**
- **Voice** - Choose a specific voice or "Random (unique per terminal)" to distinguish multiple Claude sessions
- **Speech Rate** - Adjust speed (-50% to +100%)
- **Volume** - Master volume control

**Events you can toggle:**
| Event | What it announces |
|-------|-------------------|
| Ready notification | "Claude ready" when waiting for input |
| Session start | Terminal name when Claude session begins |
| Tool announcements | "Reading", "Editing", "Searching"... |
| Include file names | "Reading package.json", "Editing App.tsx" |
| Subagent activity | "Spawning agent", agent count changes |

**Tool debounce** prevents announcement spam during rapid tool usage.

**Multi-Claude tip:** Use "Random (unique per terminal)" voice so each Claude session has a distinct voice - makes it easy to know which one is talking!

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

### Context Menu Actions

Right-click anywhere on a webpage to access terminal actions:

![Context menu showing "Send to Tabz" and "Paste to Terminal" options](docs/screenshots/context-menu.png)

| Action | When Available | What It Does |
|--------|----------------|--------------|
| **Toggle Terminal Sidebar** | Always | Opens or focuses the Tabz sidebar |
| **Paste to Terminal** | Text selected | Pastes selection to active terminal at cursor position |
| **Send to Tabz** | Text selected | Sends selection to the sidebar chat input bar |

**Paste to Terminal** works with tmux - text goes to the focused pane without auto-executing.

### Omnibox Quick Launch

Spawn terminals directly from Chrome's address bar using the `term` keyword:

![Chrome omnibox showing "term github.com/user/repo" command](docs/screenshots/omnibox.png)

**Usage:** Type `term` + space + URL

**Examples:**
- `term github.com/user/repo` - Open GitHub repository
- `term localhost:3000` - Open local dev server
- `term my-app.vercel.app` - Open Vercel deployment

The URL opens in a new tab and the sidebar activates automatically.

---

## Tabz MCP Integration

Tabz includes an **MCP server** with 20 tools that let Claude Code control your browser:

![Claude using MCP tools to control DALL-E in the browser - filling prompts, clicking generate, downloading results](docs/screenshots/mcp-dalle-demo.png)

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

Click ⚙️ → **MCP Tools** tab to configure which tools Claude can use:

![MCP Tools settings tab with tool toggles, token estimates, and 0-token experimental mode](docs/screenshots/mcp-settings.png)

- Toggle individual tools on/off
- See token usage estimates per tool
- Add custom allowed domains for `tabz_open_url`
- Apply presets (Minimal, Standard, Full)
- **0-Token Mode** (experimental) - Removes tool definitions from context, uses GitHub-hosted descriptions

### Claude Skill: `tabz-mcp`

Install the `tabz-mcp` skill for guided browser automation. The skill dynamically discovers available tools and provides workflow patterns - never goes stale when tools are added.

**Location:** `~/.claude/skills/tabz-mcp/`

### What Requires Remote Debugging?

| Feature | Remote Debugging Required? |
|---------|---------------------------|
| Terminal sidebar | No |
| Profiles, audio, themes | No |
| Ghost badge, session persistence | No |
| **MCP tools** (screenshots, clicks, fill) | **Yes** |
| **Network capture** | **Yes** |

If you only use Tabz for terminals, you don't need remote debugging. For MCP browser automation, see setup below.

### MCP Setup (WSL2)

1. **Start Chrome with remote debugging:**
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Temp\chrome-debug
   ```

   > **Tip:** Create a desktop shortcut for this command so you don't forget the flag.

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
