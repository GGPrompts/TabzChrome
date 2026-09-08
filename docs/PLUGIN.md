# TabzChrome Plugin for Claude Code

This repository is a **Claude Code plugin marketplace** containing browser automation tools, terminal management skills, and Claude status tracking hooks.

## Quick Install

```bash
# Clone and install the plugin
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome
claude plugins install .
```

Or install directly from GitHub:

```bash
claude plugins install https://github.com/GGPrompts/TabzChrome
```

## Complete Setup (All Dependencies)

Follow these steps in order for full functionality:

### 0. Install System Dependencies

```bash
# Required for state-tracker hooks
sudo apt-get install jq
```

### 1. Clone the Repository

```bash
git clone https://github.com/GGPrompts/TabzChrome.git
cd TabzChrome
```

### 2. Build the MCP Server

**This is required** - the MCP server needs to be compiled:

```bash
cd tabz-mcp-server
npm install
npm run build    # Creates dist/ folder - REQUIRED!
cd ..
```

### 3. Start the Backend

```bash
cd backend
npm install
npm start        # Runs on localhost:8129
```

Or use the dev script (runs in tmux):
```bash
./scripts/dev.sh
```

### 4. Load the Extension in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist-extension/` folder

### 5. Install the Claude Code Plugin

```bash
# From the TabzChrome directory
/plugin install .
```

Or via `/plugin` menu → Install from local path.

### 6. Restart Claude Code

Exit and restart Claude Code to load the plugin:
```
/exit
claude
```

### 7. Verify Setup

```bash
# Check MCP connection
/mcp
# Should show: plugin:tabz-chrome:tabz ✓ connected

# Test a tool
tabz_list_tabs({})
```

## Troubleshooting Setup Issues

### "MCP failed to connect"

1. **MCP server not built:**
   ```bash
   cd tabz-mcp-server && npm run build
   ```

2. **Backend not running:**
   ```bash
   curl http://localhost:8129/api/health
   # Should return {"status":"ok"}
   ```

3. **Old MCP configs interfering:**
   ```bash
   # Check for old configs
   grep -r "browser-mcp\|tabz" ~/.claude.json
   # Remove any old mcpServers entries
   ```

4. **plugin.json missing:**
   ```bash
   # Restore from git if missing
   git checkout .claude-plugin/plugin.json
   ```

### "Chrome not reachable" errors

1. **TabzChrome extension not installed:**
   - Load the extension at `chrome://extensions`
   - Ensure it's enabled

2. **Backend not running:**
   - Start the backend: `cd backend && npm start`
   - Verify: `curl http://localhost:8129/api/health`

### After Git Pull

If you pull new changes, rebuild the MCP server:
```bash
cd tabz-mcp-server && npm run build
```

## What's Included

### MCP Server: Tabz

The full compatibility catalog currently publishes 97 tools; the compact `page-agent` preset publishes 20. Browser tools use extension APIs, and debugger-backed actions, capture, and emulation transport CDP through `chrome.debugger` without a remote debugging port.

| Category | Tools | Purpose |
|----------|-------|---------|
| Tab Management | `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab` | Navigate between tabs |
| Screenshots | `tabz_screenshot`, `tabz_screenshot_full` | Capture page visuals |
| Interaction | `tabz_read_page`, `tabz_act`, `tabz_batch` | Read compact page state and perform verified actions |
| Downloads | `tabz_download_image`, `tabz_download_file` | Download files from pages |
| Network | `tabz_enable_network_capture`, `tabz_get_network_requests` | Monitor API calls |
| Scripting | `tabz_execute_script`, `tabz_get_console_logs` | Run JS, debug |

Each MCP connection uses an automatically managed group and can target only its owned tabs. Check structured mutation results: continue after `verified`, and stop without replay on `mismatch` or `unknown`.

**Requirements:**
- TabzChrome extension installed in Chrome
- TabzChrome backend running (`cd backend && npm start`)

### Skills

#### `tabz-mcp`
Browser automation guidance for the tools published by the configured MCP server and preset. Clients may load schemas eagerly or through tool discovery.

```
Use the tabz-mcp skill when you need to automate browser tasks.
```

#### `xterm-js`
Battle-tested patterns for xterm.js terminal applications:
- Refs and state management
- WebSocket communication
- React hooks integration
- Tmux session handling

```
Use the xterm-js skill when building terminal UIs.
```

### Commands

| Command | Description |
|---------|-------------|
| `/ctthandoff` | Generate handoff summary with optional TTS playback |
| `/rebuild` | Build extension and copy to Windows for Chrome reload |
| `/discover-profiles` | Scan system for CLI tools and generate profile configs |
| `/demo` | Orchestrate multi-Claude demo with AI image generation |

### Hooks: Claude Status Tracking

Real-time Claude Code status detection for terminal tabs:

| Status | Emoji | Meaning |
|--------|-------|---------|
| `awaiting_input` | 🤖✅ | Claude is ready/waiting |
| `processing` | 🤖⏳ | Claude is thinking |
| `tool_use` | 🤖🔧 | Claude is using a tool |

**Features:**
- Writes state to `/tmp/claude-code-state/` for TabzChrome to read
- Audio announcements via TabzChrome backend (Chrome TTS)
- Subagent tracking (count of running Task tools)

**Enable audio:**
```bash
export CLAUDE_AUDIO=1
export CLAUDE_SESSION_NAME="MyProject"
```

## Architecture

```
TabzChrome/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/                 # Slash commands
│   ├── ctthandoff.md
│   ├── rebuild.md
│   ├── discover-profiles.md
│   └── demo.md
├── skills/                   # Claude skills
│   ├── tabz-mcp/
│   │   ├── SKILL.md
│   │   └── references/
│   └── xterm-js/
│       ├── SKILL.md
│       └── references/
├── hooks/                    # Claude Code hooks
│   ├── hooks.json
│   └── scripts/
│       └── state-tracker.sh
├── .mcp.json                # MCP server config
└── tabz-mcp-server/         # MCP server implementation
```

## Requirements

### For MCP Tools (Browser Automation)

1. **Chrome Extension**: Load `dist-extension/` in Chrome
2. **Backend Server**:
   ```bash
   cd backend && npm install && npm start
   ```
3. **MCP Server** (auto-installed with plugin):
   ```bash
   cd tabz-mcp-server && npm install
   ```

### For Hooks (Status Tracking)

- `jq` - JSON parsing in shell scripts
- TabzChrome backend for audio announcements

## Usage Examples

### Take a Screenshot

```bash
tabz_screenshot({})
```

### Control AI Image Tools

```bash
# Fill DALL-E prompt
tabz_fill({"selector": "textarea", "value": "a cat astronaut"})

# Click generate
tabz_click({"selector": "button.generate"})

# Download result
tabz_download_image({"selector": "img.result"})
```

### Generate Handoff Summary

```
/ctthandoff
```

With audio:
```
/ctthandoff
```

Without audio:
```
/ctthandoff quiet
```

## Troubleshooting

### MCP Server Not Connecting

1. Check backend is running: `curl http://localhost:8129/health`
2. Check MCP server is configured: `claude mcp list`
3. Restart Claude Code to reload MCP config

### Status Indicators Not Showing

1. Check state files: `ls -la /tmp/claude-code-state/`
2. Verify hooks are loaded: `claude --debug` and look for hook registration
3. Ensure scripts are executable: `chmod +x hooks/scripts/*.sh`

### Audio Not Playing

1. Check backend audio endpoint: `curl -X POST http://localhost:8129/api/audio/speak -H "Content-Type: application/json" -d '{"text": "test"}'`
2. Ensure `CLAUDE_AUDIO=1` is set
3. Check Chrome tab with extension has focus (Chrome TTS requires tab focus)

## Development

### Building the Extension

```bash
npm run build
```

### Testing MCP Tools

Tools are called directly as MCP tool calls. Available schemas and loading behavior depend on the configured client and preset:

```
tabz_screenshot({})
```

### Testing Hooks

```bash
# Manually trigger a hook
./hooks/scripts/state-tracker.sh session-start

# Check state file
cat /tmp/claude-code-state/*.json | jq
```

## License

MIT
