# Cross-Platform Testing Matrix

Testing checklist for contributors to verify TabzChrome works correctly across all supported platforms.

---

## Supported Platforms

| Platform | Status | Primary Use Case |
|----------|--------|------------------|
| Windows 11 + WSL2 + Chrome | Primary | Development, daily use |
| Native Ubuntu + Chrome | Supported | Linux development |
| Native macOS + Chrome | Supported | macOS development |

---

## Platform-Specific Setup

### Windows 11 + WSL2 + Chrome

**Requirements:**
- Windows 11 with WSL2 enabled
- Ubuntu 22.04+ (or similar distro) in WSL2
- Chrome installed on **Windows** (not in WSL)
- Node.js 18+ in WSL2

**Setup:**
```bash
# In WSL2 terminal
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome

# Install dependencies (MUST run in WSL, not Windows terminal)
npm install
cd backend && npm install && cd ..

# Build extension
npm run build

# Copy to Windows for Chrome to load
rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/
```

**Load in Chrome (Windows):**
1. Navigate to `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → Select `C:\Users\<username>\Desktop\TabzChrome\dist-extension`

**Start Backend (WSL2):**
```bash
./scripts/dev.sh
```

**WSL-Specific Notes:**
- Use `localhost` not `127.0.0.1` when accessing backend from Chrome
- The `TABZ_WIN_PATH` env var can override the Windows destination path
- Font check is skipped in WSL (Chrome uses Windows fonts)

---

### Native Ubuntu + Chrome

**Requirements:**
- Ubuntu 22.04+ (or similar Debian-based distro)
- Chrome/Chromium installed
- Node.js 18+

**Setup:**
```bash
# Install dependencies
sudo apt update
sudo apt install -y tmux nodejs npm

# Optional: edge-tts for audio features
sudo apt install -y python3-pip pipx
pipx install edge-tts
pipx ensurepath

# Optional: lnav for log filtering
sudo apt install -y lnav

# Clone and build
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome
npm install
cd backend && npm install && cd ..
npm run build
```

**Load in Chrome:**
1. Navigate to `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → Select `dist-extension/` folder

**Start Backend:**
```bash
./scripts/dev.sh
```

---

### Native macOS + Chrome

**Requirements:**
- macOS 12+ (Monterey or later recommended)
- Chrome installed
- Node.js 18+ (via Homebrew or nvm)
- Homebrew (recommended)

**Setup:**
```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node tmux

# Optional: edge-tts for audio features
brew install python pipx
pipx install edge-tts
pipx ensurepath

# Optional: lnav for log filtering
brew install lnav

# Optional: Nerd fonts for icons
brew install --cask font-jetbrains-mono-nerd-font

# Clone and build
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome
npm install
cd backend && npm install && cd ..
npm run build
```

**Load in Chrome:**
1. Navigate to `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked → Select `dist-extension/` folder

**Start Backend:**
```bash
./scripts/dev.sh
```

---

## Known Platform Differences

### Paths

| Platform | Home Dir | Temp Dir | Auth Token |
|----------|----------|----------|------------|
| WSL2 | `/home/<user>` | `/tmp` | `/tmp/tabz-auth-token` |
| Ubuntu | `/home/<user>` | `/tmp` | `/tmp/tabz-auth-token` |
| macOS | `/Users/<user>` | `/tmp` or `/var/folders/...` | `/tmp/tabz-auth-token` |

### Commands

| Task | WSL2/Ubuntu | macOS |
|------|-------------|-------|
| Install tmux | `sudo apt install tmux` | `brew install tmux` |
| Install Node.js | `sudo apt install nodejs` | `brew install node` |
| Check port usage | `lsof -i :8129` | `lsof -i :8129` |
| Font cache refresh | `fc-cache -fv` | N/A (restart apps) |

### Terminal Behavior

| Behavior | WSL2 | Ubuntu | macOS |
|----------|------|--------|-------|
| Clipboard | Shared with Windows | Native | Native |
| Font rendering | Windows fonts | Linux fonts | macOS fonts |
| PTY behavior | Standard | Standard | May differ slightly |
| Signal handling | Standard | Standard | Standard |

### Extension Loading

| Platform | Extension Path |
|----------|----------------|
| WSL2 | Windows path (e.g., `C:\Users\...\dist-extension`) |
| Ubuntu | Linux path (e.g., `/home/.../dist-extension`) |
| macOS | macOS path (e.g., `/Users/.../dist-extension`) |

---

## Critical Features Checklist

Run through this checklist on each platform before considering it verified.

### Core Terminal Functionality

- [ ] **Spawn terminal** - Click + to create new terminal from default profile
- [ ] **Terminal input** - Type commands and see output
- [ ] **Terminal output** - Colors, cursor positioning work correctly
- [ ] **Copy/Paste** - Ctrl+Shift+C / Ctrl+Shift+V work
- [ ] **Scrollback** - Can scroll up to see history
- [ ] **Multiple tabs** - Can have multiple terminals open
- [ ] **Tab switching** - Click tabs to switch between terminals
- [ ] **Kill terminal** - Right-click tab → Kill Session works
- [ ] **Session persistence** - Close and reopen sidebar, terminal state preserved

### Profiles System

- [ ] **Create profile** - Settings → Profiles → Add works
- [ ] **Edit profile** - Can modify name, command, directory, appearance
- [ ] **Delete profile** - Can delete non-default profiles
- [ ] **Spawn from profile** - + dropdown shows profiles, spawning works
- [ ] **Working directory** - Profile directory is respected on spawn
- [ ] **Startup command** - Profile command executes after spawn
- [ ] **Import/Export** - Can export and reimport profiles JSON

### Working Directory

- [ ] **Header directory** - Can set global working directory
- [ ] **Directory inheritance** - Profiles without explicit dir inherit from header
- [ ] **Recent directories** - Dropdown shows recent directories
- [ ] **Path expansion** - `~` expands to home directory

### Appearance

- [ ] **Theme switching** - Can change text color themes
- [ ] **Background gradients** - Gradient options work
- [ ] **Transparency** - Slider adjusts gradient visibility
- [ ] **Font size** - Can change font size per profile
- [ ] **Dark/Light toggle** - Header toggle switches themes
- [ ] **WebGL/Canvas toggle** - Can switch renderers

### Ghost Badge (Detached Sessions)

- [ ] **Detach session** - Right-click tab → Detach works
- [ ] **Ghost badge appears** - Badge shows count of detached sessions
- [ ] **Reattach** - Can bring back detached session
- [ ] **Kill detached** - Can kill detached sessions from popup

### Tab Context Menu

- [ ] **Rename tab** - Can change display name
- [ ] **Copy Session ID** - Copies tmux session name
- [ ] **View as Text** - Opens dashboard with scrollback
- [ ] **Detach Session** - Converts to ghost
- [ ] **Kill Session** - Destroys terminal

### Dashboard

- [ ] **Dashboard loads** - http://localhost:8129 shows dashboard
- [ ] **Stats display** - Active terminals, uptime, memory shown
- [ ] **Terminals section** - Lists all terminals
- [ ] **Files section** - File browser works
- [ ] **Audio section** - Audio settings accessible
- [ ] **Working dir sync** - Changes sync to sidebar

### Backend API

- [ ] **Health check** - `curl http://localhost:8129/api/health` returns success
- [ ] **Spawn API** - Can spawn terminal via REST API (with auth token)
- [ ] **Sessions list** - `/api/tmux/sessions` returns sessions
- [ ] **WebSocket** - Terminal I/O works via WebSocket

---

## MCP Tools Verification

Test each MCP tool category on every platform.

### Prerequisites

1. Configure MCP in your project's `.mcp.json`:
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

2. Start Claude Code in a project with MCP configured
3. Verify tools are loaded: "list my mcp tools"

### Tab & Navigation Tools

- [ ] `tabz_list_tabs` - Lists open tabs with accurate active tab
- [ ] `tabz_switch_tab` - Switches to specified tab
- [ ] `tabz_rename_tab` - Assigns custom name to tab
- [ ] `tabz_open_url` - Opens allowed domains (GitHub, localhost)
- [ ] `tabz_get_page_info` - Returns current URL and title

### Screenshot Tools

- [ ] `tabz_screenshot` - Captures viewport to disk
- [ ] `tabz_screenshot_full` - Captures full scrollable page

**Note:** Screenshots cannot capture the Chrome sidebar (Chrome API limitation).

### Interaction Tools

- [ ] `tabz_click` - Clicks element by CSS selector
- [ ] `tabz_fill` - Fills input fields
- [ ] `tabz_execute_script` - Runs JavaScript in page
- [ ] `tabz_get_element` - Inspects element HTML/styles

### Network Tools

- [ ] `tabz_enable_network_capture` - Starts network monitoring
- [ ] `tabz_get_network_requests` - Lists captured requests
- [ ] `tabz_clear_network_requests` - Clears captured data

### Download Tools

- [ ] `tabz_download_image` - Downloads images from pages
- [ ] `tabz_download_file` - Downloads any URL
- [ ] `tabz_get_downloads` - Lists recent downloads

### Console Tools

- [ ] `tabz_get_console_logs` - Retrieves console output

### Bookmark Tools

- [ ] `tabz_get_bookmark_tree` - Shows bookmark structure
- [ ] `tabz_search_bookmarks` - Finds bookmarks
- [ ] `tabz_save_bookmark` - Creates bookmark

### Tab Groups

- [ ] `tabz_list_groups` - Lists tab groups
- [ ] `tabz_create_group` - Creates new group
- [ ] `tabz_update_group` - Changes group properties
- [ ] `tabz_claude_group_add` - Adds to Claude Active group

### Window Management

- [ ] `tabz_list_windows` - Lists Chrome windows
- [ ] `tabz_create_window` - Creates new window
- [ ] `tabz_update_window` - Moves/resizes window
- [ ] `tabz_tile_windows` - Arranges windows in grid

### Audio/TTS Tools

- [ ] `tabz_speak` - Speaks text via TTS
- [ ] `tabz_list_voices` - Lists available voices
- [ ] `tabz_play_audio` - Plays audio file

**Note:** Requires edge-tts 6.0+ for TTS features.

### Terminal Tools

- [ ] `tabz_popout_terminal` - Pops terminal to standalone window

---

## Audio Features Verification

Audio features require edge-tts 6.0+ installed.

### Setup Verification

```bash
# Check edge-tts is installed
edge-tts --version  # Should show 6.0.0 or higher

# Test TTS generation
edge-tts --text "Hello" --write-media /tmp/test.mp3
```

### Feature Checklist

- [ ] **Voice selection** - Dashboard → Audio shows voice options
- [ ] **TTS playback** - "Read Aloud" context menu works
- [ ] **Event announcements** - Claude Code tool usage announced (if enabled)
- [ ] **Sound effects** - Custom sounds play for events
- [ ] **Volume control** - Volume slider affects playback

---

## Claude Code Integration

### Status Detection

Requires the state-tracker hooks to be installed.

- [ ] **Status indicators** - Terminal tabs show Claude status (thinking, tool use)
- [ ] **Subagent detection** - Multiple robot emojis for parallel agents
- [ ] **Context percentage** - Context usage shown (requires statusline setup)

### Hooks Setup

Follow [state-tracker-setup.md](state-tracker-setup.md) to install the state-tracker
hook script (status indicators, subagent detection) and the optional statusline
script (context percentage).

---

## Common Issues by Platform

### WSL2

| Issue | Solution |
|-------|----------|
| `npm install` fails with EPERM | Run from WSL terminal, not Windows |
| Backend unreachable | Use `localhost` not `127.0.0.1` |
| Extension not updating | Sync to Windows path with rsync |
| Fonts look wrong | Install font on Windows, restart Chrome |

### Ubuntu

| Issue | Solution |
|-------|----------|
| tmux not found | `sudo apt install tmux` |
| Port 8129 in use | `lsof -i :8129` to find process, kill it |
| Fonts missing glyphs | Install Nerd Fonts, run `fc-cache -fv` |
| edge-tts not in PATH | Run `pipx ensurepath`, restart shell |

### macOS

| Issue | Solution |
|-------|----------|
| Permission denied on scripts | `chmod +x scripts/*.sh` |
| node-pty build fails | Install Xcode Command Line Tools |
| Brew packages not found | Add Homebrew to PATH in shell profile |
| Font not appearing in Chrome | Restart Chrome after font install |

---

## Performance Testing

### Load Test

1. Spawn 5+ terminals simultaneously
2. Run `top` or `htop` in each
3. Verify smooth scrolling and input responsiveness

### Memory Check

```bash
# Check backend memory
curl http://localhost:8129/api/health | jq '.data.memoryUsage'
```

### Stress Test

1. Rapidly open/close sidebar 10 times
2. Spawn and kill terminals rapidly
3. Resize sidebar during heavy output

---

## Reporting Issues

When reporting platform-specific issues, include:

1. **Platform:** (WSL2 / Ubuntu / macOS) + version
2. **Node.js version:** `node -v`
3. **Chrome version:** (from chrome://settings/help)
4. **Steps to reproduce**
5. **Expected vs actual behavior**
6. **Logs:** `tail -50 backend/logs/unified.log`
7. **Console errors:** (from Chrome DevTools on sidebar)

File issues at: https://github.com/GGPrompts/TabzChrome/issues

---

## Contributor Testing Workflow

Before submitting a PR:

1. **Run tests:** `npm test`
2. **Build:** `npm run build`
3. **Test on your platform** using the checklist above
4. **Note any platform-specific changes** in PR description
5. **If changing platform-specific code**, request testing on other platforms

---

**Last Updated:** 2026-01-01
