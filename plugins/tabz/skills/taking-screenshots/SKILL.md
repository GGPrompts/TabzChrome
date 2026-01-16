---
name: taking-screenshots
description: "Captures browser screenshots via tabz_screenshot MCP tool. Use when the user asks to 'take a screenshot', 'capture the page', 'screenshot this tab', or needs to visually verify web page content."
---

# Screenshot

Capture browser screenshots via TabzChrome MCP tools.

## Visible Viewport

```bash
mcp-cli call tabz/tabz_screenshot '{}'
```

## With Explicit Tab

```bash
# List tabs to get ID
mcp-cli call tabz/tabz_list_tabs '{}'

# Screenshot specific tab
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762561083}'
```

## Full Page

Capture entire scrollable page:

```bash
mcp-cli call tabz/tabz_screenshot_full '{}'
```

## Reliable Pattern

Always target explicit tab to avoid capturing wrong page:

```bash
# 1. List tabs
mcp-cli call tabz/tabz_list_tabs '{}'

# 2. Note the tabId you want (e.g., 1762561083)

# 3. Screenshot with explicit tabId
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762561083}'
```

## Background Tab Capture

Both tools accept optional `tabId` for background capture without switching focus:

```bash
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762561083}'
```

## Check Schema

```bash
mcp-cli info tabz/tabz_screenshot
mcp-cli info tabz/tabz_screenshot_full
```

## Limitations

- Cannot capture Chrome sidebar (Chrome limitation)
- Returns base64-encoded image data
- Full page screenshots may take longer for long pages
