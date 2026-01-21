---
name: browser
description: "Browser automation via 70 tabz MCP tools. Use when taking screenshots, filling forms, debugging network requests, testing responsive design, or using text-to-speech notifications."
---

# TabzChrome Browser Automation

Control Chrome via MCP tools for screenshots, interaction, debugging, and notifications.

## Quick Start

Use mcp-cli to discover and call tools:

```bash
# Get tool schema (REQUIRED before calling)
mcp-cli info tabz/tabz_screenshot

# Call tool
mcp-cli call tabz/tabz_screenshot '{}'
```

## Core Workflows

### Screenshot a Page

```bash
# Get current tab info
mcp-cli call tabz/tabz_get_page_info '{}'

# Take screenshot
mcp-cli call tabz/tabz_screenshot '{}'
# Returns file path - use Read tool to view
```

### Debug Network/API Issues

```bash
# 1. Enable capture BEFORE triggering action
mcp-cli call tabz/tabz_enable_network_capture '{}'

# 2. Trigger the action on page

# 3. Get failed requests (status >= 400)
mcp-cli call tabz/tabz_get_network_requests '{"statusMin": 400}'

# 4. Check console for JS errors
mcp-cli call tabz/tabz_get_console_logs '{"level": "error"}'
```

### Test Responsive Design

```bash
# Emulate device
mcp-cli call tabz/tabz_emulate_device '{"device": "iPhone 14"}'

# Take screenshot
mcp-cli call tabz/tabz_screenshot '{}'

# Clear emulation
mcp-cli call tabz/tabz_emulate_clear '{}'
```

### Fill and Submit Form

```bash
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "test@example.com"}'
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]"}'
```

### Notify User (TTS)

```bash
mcp-cli call tabz/tabz_speak '{"text": "Task complete"}'
```

### Performance Profiling

```bash
mcp-cli call tabz/tabz_profile_performance '{}'
# Returns: DOM nodes, JS heap, event listeners, timing
```

### DOM Tree Inspection

```bash
mcp-cli call tabz/tabz_get_dom_tree '{"maxDepth": 3}'
```

## Tool Categories

| Category | Count | Key Tools |
|----------|-------|-----------|
| Screenshots | 2 | screenshot, screenshot_full |
| Interaction | 4 | click, fill, get_element |
| Network | 3 | enable_network_capture, get_network_requests |
| DOM/Debug | 4 | get_dom_tree, get_console_logs, profile_performance |
| Emulation | 6 | emulate_device, emulate_geolocation |
| Audio/TTS | 3 | speak, list_voices, play_audio |
| Tabs | 5 | list_tabs, open_url, switch_tab |
| Cookies | 5 | cookies_get, cookies_list |

## Important Notes

- Always run `mcp-cli info tabz/<tool>` before calling
- Use explicit `tabId` when possible - don't rely on "active" tab
- Tab IDs are large integers (e.g., `1762561083`)
- `tabz_screenshot` cannot capture Chrome sidebar

## References

See `references/` for detailed workflows and full tool documentation:

### Quick Guides
- `screenshot-workflows.md` - Viewport vs full page screenshots
- `network-debugging.md` - API request inspection
- `form-automation.md` - Clicks, fills, selectors
- `tts-notifications.md` - Audio feedback patterns

### Full MCP Tool Documentation
- `core-tools.md` - Tabs, screenshots, clicks, fills, DOM inspection
- `windows-groups.md` - Windows, tab groups, multi-window workflows
- `network-downloads.md` - Network capture, downloads, file operations
- `browser-data.md` - History, sessions, cookies, bookmarks
- `profiles-and-plugins.md` - Terminal profiles, Claude Code plugin management
- `advanced-tools.md` - Emulation, performance profiling, notifications
