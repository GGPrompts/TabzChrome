# TabzChrome MCP Tools Reference

TabzChrome provides 37 MCP tools for browser automation via Chrome Extension APIs.

## Tool Categories

| Category | Tools | Purpose |
|----------|-------|---------|
| **Tab Management** | `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab` | Navigate between tabs, accurate active detection |
| **Tab Groups** | `tabz_list_groups`, `tabz_create_group`, `tabz_update_group`, `tabz_add_to_group`, `tabz_ungroup_tabs` | Organize tabs into groups |
| **Claude Group** | `tabz_claude_group_add`, `tabz_claude_group_remove`, `tabz_claude_group_status` | Highlight tabs Claude is working with |
| **Screenshots** | `tabz_screenshot`, `tabz_screenshot_full` | Capture viewport or full scrollable page |
| **Interaction** | `tabz_click`, `tabz_fill`, `tabz_execute_script` | Click buttons, fill forms, run JS |
| **Downloads** | `tabz_download_image`, `tabz_download_file`, `tabz_get_downloads`, `tabz_cancel_download` | Download files, track status, cancel downloads |
| **Bookmarks** | `tabz_get_bookmark_tree`, `tabz_search_bookmarks`, `tabz_save_bookmark`, `tabz_create_folder`, `tabz_move_bookmark`, `tabz_delete_bookmark` | Organize bookmarks, save URLs |
| **Network** | `tabz_enable_network_capture`, `tabz_get_network_requests`, `tabz_clear_network_requests` | Monitor API calls |
| **Inspection** | `tabz_get_element`, `tabz_get_console_logs`, `tabz_get_page_info` | Debug, inspect HTML/CSS |
| **Debugger** | `tabz_get_dom_tree`, `tabz_profile_performance`, `tabz_get_coverage` | DOM tree, metrics, code coverage (uses chrome.debugger) |

## Visual Feedback

Interaction tools show visual feedback when targeting elements:

| Tool | Glow Color |
|------|------------|
| `tabz_click` | 🟢 Green (action completed) |
| `tabz_fill` | 🔵 Blue (input focused) |
| `tabz_get_element` | 🟣 Purple (inspecting) |

Elements pulse twice and auto-scroll into view.

## Getting Selectors

Right-click any element on a webpage → **"Send Element to Chat"** to capture:
- Unique CSS selector (with `:nth-of-type()` for siblings)
- Tag, ID, classes, text content
- Useful attributes (`data-testid`, `aria-label`, `role`)

---

## Usage Examples

### Screenshots

```bash
mcp-cli info tabz/tabz_screenshot       # Check schema (REQUIRED)
mcp-cli call tabz/tabz_screenshot '{}'  # Capture viewport
```

### Form Interaction

```bash
# Fill prompt
mcp-cli call tabz/tabz_fill '{"selector": "textarea", "value": "a cat astronaut"}'

# Click button
mcp-cli call tabz/tabz_click '{"selector": "button.generate"}'

# Download image (avoid avatars)
mcp-cli call tabz/tabz_download_image '{"selector": "img[src*=\"cdn\"]"}'
```

### Tab Management

```bash
# List tabs (returns real Chrome tab IDs like 1762556601)
mcp-cli call tabz/tabz_list_tabs '{}'

# Switch tab (use actual tabId from list)
mcp-cli call tabz/tabz_switch_tab '{"tabId": 1762556601}'
```

---

## Setup Requirements

### All Tools Use Extension APIs

All 37 tools work using Chrome Extension APIs only - no `--remote-debugging-port=9222` required:
- Tab management, downloads, bookmarks
- Screenshots, click/fill, element inspection
- Network capture, console logs, scripting

---

## MCP Server Configuration

Add to `.mcp.json`:

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

---

## Key Constraints

- `tabz_screenshot` cannot capture Chrome sidebar (Chrome limitation)
- Always call `mcp-cli info tabz/<tool>` before `mcp-cli call` to check schema
- Tab IDs are real Chrome tab IDs (large integers like 1762556601)
