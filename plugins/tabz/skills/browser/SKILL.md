---
name: browser
description: "Browser automation via tabz MCP tools. Use when taking screenshots, filling forms, debugging network requests, testing responsive design, or using text-to-speech notifications."
---

# TabzChrome Browser Automation

Control Chrome via MCP tools for screenshots, interaction, debugging, and notifications.

## Quick Start

Call the tabz tools published by your configured server or preset. Clients may load schemas eagerly or through tool discovery:

```
tabz_screenshot({})
```

## Core Workflows

### Screenshot a Page

```bash
# Get current tab info
tabz_get_page_info({})

# Take screenshot
tabz_screenshot({})
# Returns file path - use Read tool to view
```

### Debug Network/API Issues

```bash
# 1. Enable capture BEFORE triggering action
tabz_enable_network_capture({})

# 2. Trigger the action on page

# 3. Get failed requests (status >= 400)
tabz_get_network_requests({"statusMin": 400})

# 4. Check console for JS errors
tabz_get_console_logs({"level": "error"})
```

### Test Responsive Design

```bash
# Emulate device
tabz_emulate_device({"device": "iPhone 14"})

# Take screenshot
tabz_screenshot({})

# Clear emulation
tabz_emulate_clear({})
```

### Fill and Submit Form

For compact interaction, call `tabz_read_page`, then use a returned ref with `tabz_act`. Refs belong to that tab, document and caller; never reuse them after navigation, rereading or ownership changes. Use `tabz_batch` for up to 20 already-known enabled calls in order; it stops at the first error and does not retry. Read `structuredContent` for verified, mismatch and unknown outcomes.

The example below is for non-sensitive forms. For credentials use `tabz_request_login` or saved-login tools. Protected documents refuse arbitrary-selector clicks and reads; submit using a previously published ref or ask the user. Never replay an uncertain mutation.

```javascript
tabz_read_page({"tabId": 123456})
tabz_act({"action": "type", "ref": "<email ref from page>", "value": "test@example.com", "tabId": 123456})
tabz_act({"action": "click", "ref": "<submit ref from page>", "tabId": 123456})
```

### Notify User (TTS)

```bash
tabz_speak({"text": "Task complete"})
```

### Performance Profiling

```bash
tabz_profile_performance({})
# Returns: DOM nodes, JS heap, event listeners, timing
```

### DOM Tree Inspection

```bash
tabz_get_dom_tree({"maxDepth": 3})
```

## Tool Categories

| Category | Key Tools |
|----------|-----------|
| Screenshots | screenshot, screenshot_full |
| Interaction | read_page, act, batch, click, fill |
| Network | enable_network_capture, get_network_requests |
| DOM/Debug | get_dom_tree, get_console_logs, profile_performance |
| Emulation | emulate_device, emulate_geolocation |
| Audio/TTS | speak, list_voices, play_audio |
| Tabs | list_tabs, open_url, switch_tab |
| Cookies | cookies_get, cookies_list |

## Important Notes

- Available schemas depend on the configured server and preset
- Use tab IDs returned by `tabz_list_tabs` for this connection; unowned tabs are refused
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
