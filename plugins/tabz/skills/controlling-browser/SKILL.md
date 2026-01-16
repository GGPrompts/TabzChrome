---
name: controlling-browser
description: "Clicks buttons, fills forms, and navigates web pages via tabz MCP tools. Use when the user asks to 'click a button', 'fill out a form', 'navigate to a page', 'interact with a website', or needs to automate browser interactions."
---

# Browser Control

Control Chrome browser via TabzChrome MCP tools.

## CRITICAL: Always Use Tab Groups

**NEVER operate on the user's current tab.** Always create your own tab group first:

```bash
# 1. Create your own group FIRST
mcp-cli call tabz/tabz_create_group '{"title": "Claude Working", "color": "purple"}'
# Returns: {"groupId": 123}

# 2. Open URLs INTO your group
mcp-cli call tabz/tabz_open_url '{"url": "https://example.com", "newTab": true, "groupId": 123}'

# 3. Always use explicit tabId from YOUR tabs
mcp-cli call tabz/tabz_screenshot '{"tabId": <your_tab_id>}'
```

## Always Check Schema First

```bash
mcp-cli info tabz/<tool_name>
```

## Tab Targeting

**Chrome tab IDs are large numbers** (e.g., `1762561083`), NOT indices.

```bash
mcp-cli call tabz/tabz_list_tabs '{}'
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762561083}'
```

## Navigation

```bash
mcp-cli call tabz/tabz_open_url '{"url": "https://example.com", "newTab": true, "groupId": 123}'
mcp-cli call tabz/tabz_switch_tab '{"tabId": 1762561083}'
mcp-cli call tabz/tabz_get_page_info '{}'
```

## Interaction

```bash
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]"}'
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "test@example.com"}'
mcp-cli call tabz/tabz_get_element '{"selector": ".my-element"}'
mcp-cli call tabz/tabz_execute_script '{"script": "document.title"}'
```

## Form Workflow

```bash
mcp-cli call tabz/tabz_fill '{"selector": "#username", "value": "user@example.com"}'
mcp-cli call tabz/tabz_fill '{"selector": "#password", "value": "secret"}'
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]"}'
```

## Visual Feedback

Elements glow when interacted with:
- Green glow on `tabz_click`
- Blue glow on `tabz_fill`
- Purple glow on `tabz_get_element`
