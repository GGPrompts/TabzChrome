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

## What's Included

### MCP Server: Tabz

**20 browser automation tools** for controlling Chrome programmatically:

| Category | Tools | Purpose |
|----------|-------|---------|
| Tab Management | `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab` | Navigate between tabs |
| Screenshots | `tabz_screenshot`, `tabz_screenshot_full` | Capture page visuals |
| Interaction | `tabz_click`, `tabz_fill` | Click elements, fill forms |
| Downloads | `tabz_download_image`, `tabz_download_file` | Download files from pages |
| Network | `tabz_enable_network_capture`, `tabz_get_api_response` | Monitor API calls |
| Scripting | `tabz_execute_script`, `tabz_get_console_logs` | Run JS, debug |

**Requirements:**
- TabzChrome extension installed in Chrome
- TabzChrome backend running (`cd backend && npm start`)

### Skills

#### `tabz-mcp`
Browser automation guidance with dynamic tool discovery. Never goes stale - discovers available tools at runtime.

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
mcp-cli call tabz/tabz_screenshot '{}'
```

### Control AI Image Tools

```bash
# Fill DALL-E prompt
mcp-cli call tabz/tabz_fill '{"selector": "textarea", "value": "a cat astronaut"}'

# Click generate
mcp-cli call tabz/tabz_click '{"selector": "button.generate"}'

# Download result
mcp-cli call tabz/tabz_download_image '{"selector": "img.result"}'
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
2. Check MCP server: `mcp-cli tools tabz`
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

```bash
# List available tools
mcp-cli tools tabz

# Check tool schema
mcp-cli info tabz/tabz_screenshot

# Call a tool
mcp-cli call tabz/tabz_screenshot '{}'
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
