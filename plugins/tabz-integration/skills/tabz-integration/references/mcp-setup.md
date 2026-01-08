# MCP Tools Setup for External Projects

Add TabzChrome's browser automation tools to any project that supports MCP (Model Context Protocol).

## Quick Setup

Add to your project's `.mcp.json`:

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

Replace `/path/to/TabzChrome` with your actual TabzChrome installation path.

## Prerequisites

1. TabzChrome backend running (`./scripts/dev.sh` from TabzChrome directory)
2. MCP-compatible client (Claude Code, etc.)
3. Chrome browser with TabzChrome extension installed

## Available Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Screenshots** | `tabz_screenshot`, `tabz_screenshot_full` | Capture viewport or full page |
| **Interaction** | `tabz_click`, `tabz_fill`, `tabz_execute_script` | Click buttons, fill forms, run JS |
| **Tab Management** | `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab` | Navigate between tabs |
| **Downloads** | `tabz_download_image`, `tabz_download_file` | Download files from pages |
| **Inspection** | `tabz_get_element`, `tabz_get_page_info`, `tabz_get_console_logs` | Debug and inspect |
| **Network** | `tabz_enable_network_capture`, `tabz_get_network_requests` | Monitor API calls |
| **Audio** | `tabz_speak`, `tabz_list_voices`, `tabz_play_audio` | TTS and audio playback |
| **History** | `tabz_history_search`, `tabz_history_recent` | Search browsing history |
| **Cookies** | `tabz_cookies_get`, `tabz_cookies_list`, `tabz_cookies_audit` | Debug authentication |
| **Emulation** | `tabz_emulate_device`, `tabz_emulate_network` | Responsive testing |

Total: 71 tools across all categories.

## Usage Pattern

Always check schema before calling:

```bash
mcp-cli info tabz/tabz_screenshot       # Check parameters
mcp-cli call tabz/tabz_screenshot '{}'  # Call tool
```

## Common Workflows

### Screenshot a Page

```bash
mcp-cli call tabz/tabz_screenshot '{}'
```

### Fill a Form and Submit

```bash
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "test@example.com"}'
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]"}'
```

### Download an Image

```bash
mcp-cli call tabz/tabz_download_image '{"selector": "img.hero-image"}'
```

### Speak Status Update

```bash
mcp-cli call tabz/tabz_speak '{"text": "Build complete", "priority": "high"}'
```

## Visual Feedback

When tools interact with elements, visual feedback appears:
- **Green glow** - Click action
- **Blue glow** - Fill/input focused
- **Purple glow** - Element inspection

## Getting CSS Selectors

Right-click any element on a page and select **"Send Element to Chat"** to get:
- Unique CSS selector
- Element attributes
- Text content

## Limitations

- `tabz_screenshot` cannot capture the Chrome sidebar (Chrome limitation)
- Extension must be active in Chrome
- Some tools require the tab to be in the foreground

## Troubleshooting

**"MCP server not responding"**
- Check TabzChrome backend: `curl http://localhost:8129/api/health`
- Verify path in `.mcp.json` is correct

**"Tool not found"**
- Ensure `tabz-mcp-server/run-auto.sh` exists and is executable
- Check MCP client logs for connection errors

**"Permission denied"**
- Some Chrome APIs require user gesture or active tab focus
