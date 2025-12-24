---
name: tabz-mcp
description: "Control Chrome browser: take screenshots, click buttons, fill forms, download images, inspect pages, capture network requests. Use when user says: 'screenshot this', 'click the button', 'fill the form', 'download that image', 'what page am I on', 'check the browser', 'look at my screen', 'interact with the website', 'capture the page', 'get the HTML', 'inspect element'. Provides MCP tool discovery for tabz_* browser automation tools."
---

# Tabz MCP - Browser Automation

## Overview

Control Chrome browser programmatically via the Tabz MCP server. This skill dynamically discovers available tools (never goes stale) and provides workflow patterns for common browser automation tasks.

## Tool Discovery

**Always discover available tools dynamically** - never assume which tools exist:

```bash
# List all available Tabz tools
mcp-cli tools tabz

# Get schema for a specific tool (REQUIRED before calling)
mcp-cli info tabz/<tool_name>

# Search for tools by keyword
mcp-cli grep "screenshot"
```

## Calling Tools

**Mandatory workflow** - always check schema before calling:

```bash
# Step 1: Check schema (REQUIRED)
mcp-cli info tabz/tabz_screenshot

# Step 2: Call with correct parameters
mcp-cli call tabz/tabz_screenshot '{"selector": "#main"}'
```

## Tool Categories

Discover tools by running `mcp-cli tools tabz`. Common categories include:

| Category | Tools Pattern | Purpose |
|----------|---------------|---------|
| Tab Management | `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab` | Navigate between tabs |
| Tab Groups | `tabz_list_groups`, `tabz_create_group`, `tabz_update_group`, `tabz_add_to_group`, `tabz_ungroup_tabs` | Organize tabs into groups |
| Claude Group | `tabz_claude_group_add`, `tabz_claude_group_remove`, `tabz_claude_group_status` | Highlight tabs Claude is working with |
| Page Info | `tabz_get_page_info`, `tabz_get_element` | Inspect page content |
| Interaction | `tabz_click`, `tabz_fill` | Interact with elements |
| Screenshots | `tabz_screenshot*` | Capture page visuals |
| Downloads | `tabz_download*` | Download files/images |
| Network | `tabz_enable_network_capture`, `tabz_get_network_requests`, `tabz_clear_network_requests` | Monitor API calls |
| Scripting | `tabz_execute_script`, `tabz_get_console_logs` | Run JS, debug |

## Quick Patterns

**Take a screenshot:**
```bash
mcp-cli call tabz/tabz_screenshot '{}'
```

**Click a button:**
```bash
mcp-cli call tabz/tabz_click '{"selector": "button.submit"}'
```

**Fill a form field:**
```bash
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "test@example.com"}'
```

**Switch to a specific tab:**
```bash
# First list tabs to find the ID (returns Chrome tab IDs like 1762556601)
mcp-cli call tabz/tabz_list_tabs '{}'
# Then switch using the actual tabId from the list
mcp-cli call tabz/tabz_switch_tab '{"tabId": 1762556601}'
```

**Download AI-generated image (ChatGPT/Copilot):**
```bash
# Use specific selector to avoid matching avatars
mcp-cli call tabz/tabz_download_image '{"selector": "img[src*=\"oaiusercontent.com\"]"}'
```

**Download full-res from expanded modal:**
```bash
# When user clicks image to expand, find modal image URL then download
mcp-cli call tabz/tabz_execute_script '{"code": "document.querySelector(\"[role=dialog] img\").src"}'
mcp-cli call tabz/tabz_download_file '{"url": "<url-from-above>"}'
```

## Important Notes

1. **Active tab detection**: `tabz_list_tabs` uses Chrome Extension API - the `active: true` field shows the user's ACTUAL focused tab (not a guess)
2. **Tab IDs**: Chrome tab IDs are large numbers (e.g., `1762556601`), not simple indices like `1, 2, 3`
3. **Tab targeting**: After `tabz_switch_tab`, all subsequent tools auto-target that tab
4. **Parallel tab ops**: `tabz_screenshot`, `tabz_screenshot_full`, `tabz_click`, `tabz_fill` accept optional `tabId` param to target background tabs without switching
5. **Network capture**: Must call `tabz_enable_network_capture` BEFORE the page makes requests
6. **Selectors**: Use CSS selectors - `#id`, `.class`, `button`, `input[type="text"]`
7. **Screenshots**: Return file paths - use Read tool to display images to user

## Resources

For detailed workflow examples and common automation patterns, see:
- `references/workflows.md` - Step-by-step workflows for complex tasks
