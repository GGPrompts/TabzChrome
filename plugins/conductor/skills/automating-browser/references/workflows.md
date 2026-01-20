# Claude Code MCP Patterns

Quick reference for using tabz MCP tools in Claude Code.

## Load Tools First

Always use MCPSearch before calling MCP tools:

```
# Search by keyword
MCPSearch with query: "screenshot"

# Load specific tool
MCPSearch with query: "select:mcp__tabz__tabz_screenshot"
```

## Common Debugging Workflows

### Console Errors

```
MCPSearch: select:mcp__tabz__tabz_get_console_logs
mcp__tabz__tabz_get_console_logs with level="error"
```

### Network/API Debugging

```
# Enable BEFORE the action
MCPSearch: select:mcp__tabz__tabz_enable_network_capture
mcp__tabz__tabz_enable_network_capture

# Trigger action (click, navigate, etc.)

# Check failures
MCPSearch: select:mcp__tabz__tabz_get_network_requests
mcp__tabz__tabz_get_network_requests with statusFilter="error"
```

### Screenshot + View

```
MCPSearch: select:mcp__tabz__tabz_screenshot
mcp__tabz__tabz_screenshot
# Returns path like /tmp/tabz-screenshots/...
Read the returned file path to view
```

### Get Page Info

```
MCPSearch: select:mcp__tabz__tabz_get_page_info
mcp__tabz__tabz_get_page_info
# Returns: url, title, loading state
```

## Interaction

### Click

```
MCPSearch: select:mcp__tabz__tabz_click
mcp__tabz__tabz_click with selector="button.submit"
```

### Fill Form

```
MCPSearch: select:mcp__tabz__tabz_fill
mcp__tabz__tabz_fill with selector="#email" value="test@example.com"
```

## Tab Management

### List Tabs

```
MCPSearch: select:mcp__tabz__tabz_list_tabs
mcp__tabz__tabz_list_tabs
# Note: Tab IDs are large integers (e.g., 1762556601)
```

### Switch Tab

```
MCPSearch: select:mcp__tabz__tabz_switch_tab
mcp__tabz__tabz_switch_tab with tabId=1762556601
```

### Create Tab Group

```
MCPSearch: select:mcp__tabz__tabz_create_group
mcp__tabz__tabz_create_group with tabIds=[123,456] title="My Research" color="blue"
```

## TTS Notifications

```
MCPSearch: select:mcp__tabz__tabz_speak
mcp__tabz__tabz_speak with text="Task complete" priority="high"
```

## Device Emulation

```
MCPSearch: select:mcp__tabz__tabz_emulate_device
mcp__tabz__tabz_emulate_device with device="iPhone 14"

# Clear emulation
MCPSearch: select:mcp__tabz__tabz_emulate_clear
mcp__tabz__tabz_emulate_clear
```
