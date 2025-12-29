# Tabz

**Full Linux terminals in your Chrome sidebar**

![Version](https://img.shields.io/badge/version-1.2.22-blue)
![Chrome](https://img.shields.io/badge/chrome-manifest%20v3-green)
![License](https://img.shields.io/badge/license-MIT-green)

![Claude, Gemini, Codex, and Solitaire in a quad-split terminal sidebar - do some shopping while you code](docs/pages/screenshots/hero-dark.png)

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
- **3D Focus Mode** - Pop any terminal into an immersive full-tab 3D view (scroll to zoom, mouse to orbit, F2 to lock)
- **Terminal Popouts** - Right-click tab → "Pop Out" for standalone terminal windows (theme synced, return or detach)
- **Local dashboard** - Web UI at `localhost:8129` for terminal management and quick stats
- **Tabz MCP tools** - Let Claude Code control your browser (screenshots, clicks, form filling)
- **Keyboard shortcuts** - Quick access to paste text, send to chat, spawn terminals

### Claude Code Integration

TabzChrome is designed to work seamlessly with Claude Code:

**🚀 Quick Setup - `/discover-profiles` command**
- Scans your system for installed CLI tools (claude, lazygit, htop, nvim, etc.)
- Opens curated lists ([awesome-tuis](https://github.com/rothgar/awesome-tuis), [modern-unix](https://github.com/ibraheemdev/modern-unix)) to discover new tools
- Generates ready-to-import profiles with sensible defaults

**⚡ 0 Token Cost Up Front** - MCP tools with no context overhead!

![MCP settings](docs/pages/screenshots/mcp-settings.png)

Using Claude Code's experimental MCP CLI mode, tool schemas are loaded on-demand instead of all 44 definitions into context. Enable with the `ENABLE_EXPERIMENTAL_MCP_CLI=true` environment variable. See the [setup gist](https://gist.github.com/GGPrompts/50e82596b345557656df2fc8d2d54e2c) for details.

**🎭 Power Features (Claude Code Integration):**

TabzChrome includes a [Claude Code plugin marketplace](.claude-plugin/marketplace.json) with agents, skills, hooks, and MCP tools:

| Plugin | Type | Description |
|--------|------|-------------|
| [**conductor**](plugins/conductor/) | agents | Multi-session orchestration with 5 specialized agents (conductor, tabz-manager, tui-expert, watcher, skill-picker) |
| [**tabz-mcp**](plugins/tabz-mcp/skills/tabz-mcp/SKILL.md) | skill | Guided browser automation with dynamic tool discovery |
| [**xterm-js**](plugins/xterm-js/skills/xterm-js/SKILL.md) | skill | Terminal development patterns (resize, WebSocket, React hooks, tmux) |
| [**tabz-guide**](plugins/tabz-guide/skills/tabz-guide/SKILL.md) | skill | Progressive help for TabzChrome (profiles, API, debugging) |
| [**state-tracker**](plugins/state-tracker/) | hooks | Live Claude status tracking for terminal tab updates |
| [**ctthandoff**](plugins/ctthandoff/) | command | Generate handoff summary, copy to clipboard, speak via TTS |
| [**tabz-integration**](plugins/tabz-integration/) | command | Integration guide for connecting projects to TabzChrome |
| [**Tabz MCP Server**](tabz-mcp-server/MCP_TOOLS.md) | MCP | 44 browser control tools (screenshots, clicks, bookmarks, network, tab groups, windows) |

**Quick setup:** Plugins auto-load when you run Claude Code in the TabzChrome directory.

**📦 Install from anywhere:**
```bash
/plugin marketplace add GGPrompts/TabzChrome
/plugin install tabz-chrome:conductor   # Install specific plugins
```

---

## Quick Start

### Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ | Backend server |
| Chrome | 116+ | Manifest V3, Side Panel API |
| tmux | 3.0+ | Session persistence |
| OS | WSL2 / Linux / macOS | Backend requires Unix shell |
| edge-tts | 6.0+ | *Optional* - for TTS audio features |

> **Tip:** Run `./scripts/dev.sh` to automatically check all dependencies with install instructions.

<details>
<summary>📦 Installing tmux</summary>

| Platform | Command |
|----------|---------|
| **macOS** | `brew install tmux` |
| **Ubuntu/Debian** | `sudo apt install tmux` |
| **Fedora** | `sudo dnf install tmux` |
| **Arch** | `sudo pacman -S tmux` |

</details>

<details>
<summary>🔊 Installing edge-tts (Optional - for audio features)</summary>

| Platform | Command |
|----------|---------|
| **All platforms** | `pip install edge-tts` |

Requires Python 3.8+. If you have multiple Python versions, use `pip3 install edge-tts`.

**Verify installation:**
```bash
edge-tts --version  # Should show 6.0.0 or higher
```

</details>

<details>
<summary>🔤 Installing Nerd Fonts (Optional)</summary>

The default terminal font is **monospace** (works everywhere). For better icons and ligatures, install the bundled Nerd Fonts:

**Quick Install (fonts included in repo):**

| Platform | Command |
|----------|---------|
| **Windows** | Open `fonts/` folder → Select all `.ttf` → Right-click → Install |
| **macOS** | Double-click each `.ttf` in `fonts/` → Click "Install Font" |
| **Linux** | `cp fonts/*.ttf ~/.local/share/fonts/ && fc-cache -fv` |

After installing, **restart Chrome** and select the font in Settings (⚙️) → Edit profile → Font Family.

See [`fonts/README.md`](fonts/README.md) for details.

</details>

> **Not on Chrome Web Store** - This is a local developer tool that requires running a backend server. Install via "Load unpacked" in Chrome's developer mode.

### Installation

> **⚠️ WSL Users:** Run these commands **inside a WSL terminal**, not from Windows Git Bash or PowerShell accessing WSL paths. The backend uses native modules (`node-pty`) that require Linux npm to compile properly. Open WSL first: `wsl` in Windows Terminal, then proceed.

```bash
# Clone
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome

# Install dependencies
npm install
cd backend && npm install && cd ..

# Build extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked** → select `dist-extension/`

### Start Backend

```bash
# Recommended (WSL/Linux/macOS)
./scripts/dev.sh
```

**Why use `dev.sh`?**
- **Checks dependencies** - Verifies Node.js, npm, tmux are installed with helpful install instructions
- **Warns about optional deps** - Alerts if edge-tts or Nerd Fonts are missing
- Creates a `tabzchrome` tmux session with correct config
- Enables log forwarding so the **"Backend Logs"** profile works (shows live server output)
- Makes debugging with Claude Code easier (can capture logs via `tmux capture-pane`)

<details>
<summary>Alternative: manual start</summary>

```bash
cd backend && npm start  # Runs on port 8129
```
Note: Without dev.sh, the "Backend Logs" profile won't show logs since it relies on the named tmux session.
</details>

### Open Sidebar

- **Click extension icon** in toolbar
- **Keyboard shortcut** (set your own at `chrome://extensions/shortcuts`)
- **Right-click page** → "Open Terminal Sidebar"

> **Note:** Chrome doesn't allow extensions to close sidebars programmatically (requires user gesture), so the menu always says "Open" rather than "Toggle". Close via Chrome's built-in panel menu (⋮).

---

## Features

### Profiles System

Click the **+** dropdown to spawn terminals from saved profiles:

![Profile settings form with all configuration options](docs/pages/screenshots/profile-settings.png)

- **Name** - Display name for the profile
- **Category** - Optional grouping (e.g., "Claude Code", "TUI Tools") with color coding
- **Working Directory** - Optional (inherits from header if empty)
- **Startup Command** - Optional command to run on spawn (e.g., `lazygit`, `htop`)
- **Font Size** - 12-24px per profile
- **Appearance** - Fully customizable with separate controls:
  - **Text Colors** - 11 themes (high-contrast, dracula, ocean, neon, amber, matrix, cyberpunk, vaporwave, synthwave, aurora, holographic)
  - **Background Gradient** - 28 gradient options, independent of text colors
  - **Panel Color** - Base solid color with 13 presets
  - **Transparency** - 0-100% slider for gradient visibility
  - **Dark/Light Toggle** - Header toggle switches all themes between variants

<details>
<summary>🎨 Color Themes & Fonts</summary>

| Text Color Themes | Font Families |
|:-----------------:|:-------------:|
| high-contrast, dracula, ocean, neon, amber, matrix, cyberpunk, vaporwave, synthwave, aurora, holographic | monospace, JetBrains Mono NF, Fira Code NF, Consolas, Cascadia Code |

**Temporary Customization:** Click the 🎨 button in the bottom-right corner of any terminal to customize appearance without saving to profile.

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

![Working directory dropdown with recent paths](docs/pages/screenshots/working-directory-dropdown.png)

- One "lazygit" profile that works for any project
- One "npm run dev" profile for any Node project
- Just change the header directory to switch projects

### Terminal Features

- **Full xterm.js emulation** - Colors, cursor, scrollback
- **Copy/Paste** - Ctrl+Shift+C / Ctrl+Shift+V
- **Session persistence** - Terminals survive sidebar close (tmux-backed)
- **Tab management** - Multiple terminals, click to switch
- **WebGL/Canvas renderer toggle** - Choose between WebGL (crispest text, GPU-accelerated) or Canvas (universal compatibility)

#### Renderer Options

| Renderer | Pros | Cons |
|----------|------|------|
| **Canvas** (default) | Works everywhere, supports light mode, full gradient transparency | CPU-bound, can lag with heavy output |
| **WebGL** | GPU-accelerated, crispest text, smooth scrolling | Dark mode only, darker background (gradient at edges) |

Toggle in the header toolbar (GPU icon). WebGL automatically disables light mode due to transparency rendering limitations.

### Ghost Badge - Detached Sessions Manager

The 👻 badge appears in the header when orphaned tmux sessions exist (sessions running in tmux but not attached to the UI).

![Ghost badge popup showing detached sessions with reattach/kill options](docs/pages/screenshots/ghost-badge.png)

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

### Tab Context Menu

Right-click any terminal tab to access these actions:

| Action | Description |
|--------|-------------|
| ✏️ Rename Tab | Change the display name |
| 📋 Copy Session ID | Copy tmux session name for CLI use |
| 📄 View as Text | Capture full scrollback as selectable text |
| 👻 Detach Session | Keep running but remove from UI |
| ❌ Kill Session | Destroy terminal permanently |

**View as Text** opens the Dashboard with:
- Full terminal scrollback (no truncation)
- **Copy All** button for clipboard
- **Save as Markdown** with metadata (timestamp, working directory, git branch)

### Claude Code Status Detection

Terminal tabs show live Claude Code status with emoji indicators:

| Emoji | Meaning |
|-------|---------|
| 🤖✅ | Claude ready/waiting for input |
| 🤖⏳ | Claude is thinking |
| 🤖🔧 | Claude is using a tool |

**Detailed status on tabs** - Tabs show exactly what Claude is doing: "editing page.tsx", "reading utils.py", "running npm test". See the actual file names and actions at a glance.

**Subagent indicators** - When Claude spawns subagents, multiple robot emojis appear (🤖🤖) to show parallel work happening.

**Setup required** - See [claude-hooks/README.md](claude-hooks/README.md) for installation.

### Claude Code Audio Announcements

Get voice announcements for Claude Code activity. Configure in **Dashboard → Audio** (`localhost:8129/#/audio`):

![Audio settings tab with voice selection and event toggles](docs/pages/screenshots/audio-settings.png)

**Global Settings:**
- **Voice** - Choose a specific voice or "Random (unique per terminal)" to distinguish multiple Claude sessions
- **Speech Rate** - Adjust speed (-50% to +100%)
- **Pitch** - Adjust pitch (0Hz to +300Hz)
- **Volume** - Master volume control

**Events you can toggle:**
| Event | What it announces |
|-------|-------------------|
| Ready notification | "Claude ready" when waiting for input |
| Session start | Terminal name when Claude session begins |
| Tool announcements | "Reading", "Editing", "Searching"... |
| Include file names | "Reading package.json", "Editing App.tsx" |
| Subagent activity | "Spawning agent", agent count changes |
| Context warning | Alert at 50% context usage |
| Context critical | Alert at 75% context usage |
| MCP downloads | "Downloaded image.png" when files complete |

**Per-event customization:** Expand any event to override voice, rate, and pitch. Events with custom settings show a "Custom" badge.

**Phrase templates:** Customize what each event says using variables like `{profile}`, `{tool}`, `{filename}`. Click variable chips to insert them.

**Sound effects:** Play sounds instead of (or alongside) TTS. Choose from built-in presets, URLs, or local file paths.

**Word substitutions:** Replace specific words with sounds (e.g., make "Bash" play a chime instead of being spoken).

**Tool debounce** prevents announcement spam during rapid tool usage.

**Multi-Claude tip:** Use "Random (unique per terminal)" voice so each Claude session has a distinct voice - makes it easy to know which one is talking!

### Command History

The chat input bar includes command history:

- **↑/↓ arrows** - Navigate through previous commands
- **Clock icon** - Open history dropdown with remove buttons
- Commands persist in Chrome storage

### Local Dashboard

Access a web-based dashboard at `http://localhost:8129` for terminal management:

<img src="docs/pages/screenshots/dashboard-button.svg" alt="Dashboard icon" width="24" height="24" /> Click this icon in the sidebar header to open the dashboard.

**Pages:**
| Page | URL | Features |
|------|-----|----------|
| **Dashboard** | `/` | Quick stats (active terminals, uptime, memory), working directory selector, quick spawn |
| **Terminals** | `/terminals.html` | Full terminal list, kill/reattach, orphan management |
| **Files** | `/files` | File browser, syntax highlighting, image/video preview, favorites, **Claude Code plugin management** |
| **Audio** | `/#/audio` | Voice settings, per-event customization, sound effects, phrase templates |

**Features:**
- **Working directory sync** - Changes in dashboard sync to extension sidebar and vice versa
- **Real-time stats** - Active terminals, backend uptime, memory usage
- **Orphan cleanup** - Find and kill detached tmux sessions
- **Quick spawn** - Launch new terminals directly from the dashboard
- **File tree context menu** - Right-click for copy path, favorite, pin, open in editor
- **Folder favorites** - Star entire folders, view contents in favorites filter
- **Plugins filter** - Manage Claude Code plugins from the Files section:
  - View plugins grouped by marketplace with enable/disable toggles
  - Filter by component type (skill, agent, command, hook, mcp) and scope (global/local)
  - Expand plugins to see individual files, click badges to open in viewer

### Custom Terminal Triggers

Add `data-terminal-command` to any HTML element to create clickable command buttons:

```html
<button data-terminal-command="npm run dev">Start Dev</button>
<a href="#" data-terminal-command="git status">Check Git</a>
<code data-terminal-command="npm install express">npm install express</code>
```

**Behavior:**
- Click opens the sidebar and sends command to the **chat input bar**
- User selects which terminal tab receives the command
- Visual feedback: element shows "✓ Queued!" briefly
- Works on dynamically added elements (MutationObserver)

### Context Menu Actions

Right-click anywhere on a webpage to access terminal actions:

![Context menu showing "Send to Tabz" and "Paste to Terminal" options](docs/pages/screenshots/context-menu.png)

| Action | When Available | Destination |
|--------|----------------|-------------|
| **Open Terminal Sidebar** | Always | Opens or focuses the sidebar (always says "Open" since Chrome can't close sidebars programmatically) |
| **Send to Tabz** | Text selected | **Chat input bar** - review/edit, then pick terminal |
| **Paste to Terminal** | Text selected | **Active terminal** - at cursor position, like typing |
| **Read Aloud** | Text selected | **TTS playback** - speaks the selected text through the sidebar |
| **Send Element to Chat** | Always | **Chat input bar** - captures element's CSS selector, attributes, and metadata for browser automation |

Neither "Send to Tabz" nor "Paste to Terminal" auto-executes - press Enter to run the command. "Send to Tabz" lets you choose which terminal; "Paste to Terminal" goes to whichever tab is currently active.

**Send Element to Chat** is useful for browser automation workflows - right-click any element to capture its unique CSS selector (including `:nth-of-type()` for lists), then use it with MCP tools like `tabz_click` or `tabz_fill`.

**Read Aloud** uses your configured audio settings (Settings → Audio tab) including voice, rate, and volume. If you have "Random" voice selected, each read-aloud will use a different voice.

> **Note:** When spawning new terminals via profiles or the [Spawn API](#spawn-terminal-via-api), the startup command **does** auto-execute after the shell is ready.

### GitHub Repository Quick Actions

When browsing GitHub repository pages, a floating action button appears in the bottom-right corner:

![GitHub FAB showing Clone and Fork buttons on a repository page](docs/pages/screenshots/github-fab.png)

| Button | Action |
|--------|--------|
| **Star** | Clicks GitHub's native star button (shows "Already!" if starred) |
| **Clone** | Queues `git clone <url> && cd <repo>` to the sidebar chat bar |
| **Fork** | Opens the repository's fork page in a new tab |

**Features:**
- Only appears on repo root and code pages (not on issues, PRs, or settings)
- Glassmorphism styling matching the extension theme
- Dismissible per-repo (X button) - remembers for the session
- Clone command includes `cd` to enter the cloned directory

### Omnibox Quick Launch

Spawn terminals directly from Chrome's address bar using the `term` keyword:

![Chrome omnibox showing "term github.com/user/repo" command](docs/pages/screenshots/omnibox.png)

**Usage:** Type `term` + space + URL

**Examples:**
- `term github.com/user/repo` - Open GitHub repository
- `term localhost:3000` - Open local dev server
- `term my-app.vercel.app` - Open Vercel deployment

The URL opens in a new tab and the sidebar activates automatically.

---

## Tabz MCP Integration

Tabz includes an **MCP server** with 44 tools that let Claude Code control your browser:

![Claude using MCP tools to control DALL-E in the browser - filling prompts, clicking generate, downloading results](docs/pages/screenshots/mcp-dalle-demo.png)

| Tool | Description |
|------|-------------|
| `tabz_screenshot` | Capture viewport to disk |
| `tabz_screenshot_full` | Capture entire scrollable page |
| `tabz_click` | Click element by CSS selector |
| `tabz_fill` | Type into input fields |
| `tabz_execute_script` | Run JavaScript |
| `tabz_get_console_logs` | View browser console |
| `tabz_list_tabs` | List open tabs (accurate active tab detection) |
| `tabz_switch_tab` | Switch to a tab |
| `tabz_rename_tab` | Assign custom names to tabs |
| `tabz_open_url` | Navigate to allowed domains |
| `tabz_get_page_info` | Get current URL/title |
| `tabz_download_image` | Download images to disk (works with AI-generated images!) |
| `tabz_get_element` | Inspect element HTML/CSS |
| `tabz_enable_network_capture` | Start capturing network requests |
| `tabz_get_network_requests` | List captured XHR/fetch requests |
| `tabz_clear_network_requests` | Clear captured requests |
| `tabz_download_file` | Download any URL to disk |
| `tabz_get_downloads` | List recent downloads with status |
| `tabz_cancel_download` | Cancel in-progress download |

**Visual Feedback:** When MCP tools interact with elements, they glow briefly:
- 🟣 **Purple** - `tabz_get_element` (inspecting)
- 🟢 **Green** - `tabz_click` (action completed)
- 🔵 **Blue** - `tabz_fill` (input focused)

### Configure in Settings

Click ⚙️ → **MCP Tools** tab to configure which tools Claude can use:

![MCP Tools settings tab with tool toggles and token estimates](docs/pages/screenshots/mcp-settings.png)

- Toggle individual tools on/off
- See token usage estimates per tool
- Add custom allowed domains for `tabz_open_url`
- Apply presets (Minimal, Standard, Full)

> **Tip:** Set `ENABLE_EXPERIMENTAL_MCP_CLI=true` in your shell to load tool schemas on-demand (0 tokens up front). See [setup gist](https://gist.github.com/GGPrompts/50e82596b345557656df2fc8d2d54e2c).

### Claude Skill: `tabz-mcp`

Install the `tabz-mcp` skill for guided browser automation. The skill dynamically discovers available tools and provides workflow patterns - never goes stale when tools are added.

**Location:** `~/.claude/skills/tabz-mcp/`

### No Remote Debugging Required

**All 47 MCP tools work using Chrome Extension APIs only!** No `--remote-debugging-port=9222` flag needed.

| Feature | Works Out of the Box |
|---------|---------------------|
| Terminal sidebar | ✓ |
| Profiles, audio, themes | ✓ |
| Tab management, screenshots, clicks, fill | ✓ (Extension APIs) |
| Network capture, downloads, console logs | ✓ (Extension APIs) |

### MCP Setup

**Configure MCP** in your project's `.mcp.json`:
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
├── extension/              # Chrome extension source
│   ├── sidepanel/          # Main sidebar UI (sidepanel.tsx)
│   ├── components/         # React components (Terminal, Settings, Dropdowns)
│   ├── hooks/              # React hooks (useProfiles, useTerminalSessions, etc.)
│   ├── background/         # Service worker (WebSocket relay)
│   ├── content/            # Content script (data-terminal-command triggers)
│   ├── dashboard/          # Full-page dashboard UI
│   │   ├── sections/       # Page sections (Files, Profiles, Terminals, etc.)
│   │   ├── components/     # Dashboard-specific components
│   │   │   └── files/      # File viewer components (ImageViewer, MarkdownViewer, etc.)
│   │   ├── contexts/       # React contexts (FilesContext, SettingsContext)
│   │   └── hooks/          # Dashboard hooks (useFileViewerSettings, useDashboard)
│   ├── shared/             # Messaging and storage helpers
│   └── manifest.json
├── backend/                # Node.js server
│   ├── server.js           # Express + WebSocket (port 8129)
│   ├── modules/            # PTY handler, terminal registry, tmux manager
│   ├── routes/             # API routes (spawn, browser, files)
│   └── public/             # Dashboard web UI
├── tabz-mcp-server/        # MCP server for Claude Code browser control
├── claude-hooks/           # Claude Code status detection hooks
└── dist-extension/         # Built extension (load this in Chrome)
```

---

## Configuration

### Backend Port

Default: `8129` (configured in `backend/.env`)

### Keyboard Shortcuts

![Keyboard shortcuts configuration in Chrome](docs/pages/screenshots/keyboard-shortcuts.png)

**Extension shortcuts (set in Chrome):**

| Shortcut | Action |
|----------|--------|
| Alt+T | New terminal tab (default profile) |
| Alt+W | Close current terminal tab |
| Alt+V | Paste selected text to terminal |
| Alt+C | Send selected text to chat |

> **Note:** Alt+1-9 for tab switching has no default - set manually if desired.
> Customize all shortcuts at `chrome://extensions/shortcuts`

**In-terminal shortcuts (always available):**

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+C | Copy selected text |
| Ctrl+Shift+V | Paste from clipboard |

**Tmux shortcuts (all terminals use tmux):**

| Shortcut | Action |
|----------|--------|
| Ctrl+B, d | Detach session (keeps running in background) |
| Ctrl+B, [ | Enter scroll/copy mode (q to exit) |
| Ctrl+B, ] | Paste from tmux buffer |

> **Tip:** If your terminal seems "stuck" after pressing Ctrl+B, press Escape to cancel.
> See [tmux cheatsheet](https://tmuxcheatsheet.com/) for more commands.

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

**npm install fails with EPERM/UNC path errors (WSL)**
- You're running npm from Windows (Git Bash/PowerShell) on a WSL path
- **Fix:** Open a WSL terminal first (`wsl` in Windows Terminal), then run commands there
- The backend uses `node-pty` which requires Linux npm to compile native modules

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

**Terminal text has gaps/spacing between characters**
- This can happen with custom fonts that aren't installed
- **Fix:** Settings (⚙️) → Edit profile → Change Font Family to "Monospace (Default)" or "Consolas"
- If using Nerd Fonts, make sure they're properly installed and restart Chrome

**Terminal display looks corrupted (text wrapping wrong, duplicated lines)**
- Can occasionally happen after rapidly resizing the sidebar during heavy output
- **Fix:** Click the **↻ refresh button** in the header bar to reload the sidebar
- This forces tmux to redraw all terminals and fixes display issues

---

## Development

```bash
# Build extension
npm run build

# Build + copy to Windows Desktop (WSL2)
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/

# Run tests
npm test
```

---

## API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (uptime, memory, version, Node.js version) |
| POST | `/api/spawn` | Spawn terminal (rate limited: 10/min) |
| GET | `/api/tmux/sessions` | List sessions |
| GET | `/api/settings/working-dir` | Get working directory settings |
| POST | `/api/settings/working-dir` | Update working directory settings |
| POST | `/api/audio/speak` | Generate TTS and broadcast to sidebar for playback |

**Health Endpoint Response:**
```json
{
  "success": true,
  "status": "healthy",
  "data": {
    "uptime": 3600,
    "activeTerminals": 3,
    "totalTerminals": 5,
    "memoryUsage": { "heapUsed": 45, "heapTotal": 65, "rss": 120, "unit": "MB" },
    "version": "1.0.0",
    "nodeVersion": "v20.10.0",
    "platform": "linux",
    "timestamp": "2025-12-12T12:00:00.000Z"
  }
}
```

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

### Text-to-Speech via API

Generate audio and play it through the sidebar. Useful for slash commands and automation.

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+20%",
    "volume": 0.8
  }'
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | string | *required* | Text to speak |
| `voice` | string | `en-US-AndrewMultilingualNeural` | Edge TTS voice name |
| `rate` | string | `+0%` | Speech rate (`-50%` to `+100%`) |
| `volume` | number | `0.7` | Playback volume (0-1) |

Audio is generated via `edge-tts` (v6.0+ required), cached, and broadcast to connected sidebars via WebSocket.

---

## Developer Quality

Recent improvements for stability and maintainability:

- **Rate Limiting** - Spawn endpoint limited to 10 requests/minute per IP to prevent DoS
- **Error Boundaries** - React error boundary catches crashes, shows recovery UI, preserves terminal sessions
- **JSDoc Documentation** - Key React components documented with prop types and usage examples
- **Keyboard Navigation** - Full arrow key, Enter, Escape, Home/End support in dropdowns
- **Graceful Shutdown** - SIGTERM/SIGINT handlers for clean process termination
- **PM2 Configuration** - `ecosystem.config.js` with cluster mode, log rotation, and auto-restart
- **Input Validation** - Joi schemas validate all API inputs with clear error messages
- **Health Monitoring** - Enhanced `/api/health` endpoint with Node.js version, platform, detailed memory stats

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
