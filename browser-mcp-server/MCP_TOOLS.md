# Browser MCP Tools Reference

Quick reference for the browser MCP tools available to Claude Code.

## Tools Overview

| Tool | Trigger Words | Description |
|------|---------------|-------------|
| `browser_get_page_info` | "what page", "current tab", "what site", "looking at", "URL" | Get the current page's URL, title, and tab ID |
| `browser_get_console_logs` | "console logs", "errors", "warnings", "debug", "browser logs" | Retrieve console output from browser tabs |
| `browser_execute_script` | "run script", "execute", "DOM", "click", "get element", "page data" | Execute JavaScript in the browser tab |

---

## browser_get_page_info

**Purpose:** Get information about the current browser page.

**Trigger phrases:**
- "What page am I looking at?"
- "What's the current URL?"
- "What tab is open?"
- "What site am I on?"

**Parameters:**
- `tabId` (optional): Specific tab ID to query. Defaults to active tab.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `url`: Full URL of the page
- `title`: Page title
- `tabId`: Chrome tab identifier
- `favIconUrl`: Favicon URL

---

## browser_get_console_logs

**Purpose:** Get console output (log, warn, error, info, debug) from browser tabs.

**Trigger phrases:**
- "Show me the console logs"
- "Are there any errors in the browser?"
- "Check for JavaScript errors"
- "What's in the console?"
- "Debug the page"

**Parameters:**
- `level`: Filter by level - `all`, `log`, `info`, `warn`, `error`, `debug`
- `limit`: Max entries to return (1-1000, default: 100)
- `since`: Only logs after this timestamp (ms since epoch)
- `tabId`: Filter by specific tab ID
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of console entries with timestamp, level, message, source URL
- Stack traces for errors

---

## browser_execute_script

**Purpose:** Execute JavaScript code in the browser tab.

**Trigger phrases:**
- "Run this script in the browser"
- "Get the page title"
- "Click the button"
- "Extract data from the page"
- "Check if element exists"
- "Get the DOM"

**Parameters:**
- `code` (required): JavaScript code to execute
- `tabId` (optional): Target tab ID. Defaults to active tab.
- `allFrames` (optional): Run in all iframes too (default: false)

**Returns:**
- `success`: boolean
- `result`: Return value of the script
- `error`: Error message if failed

**Common Examples:**
```javascript
// Get page title
document.title

// Get all links
[...document.links].map(a => a.href)

// Check if logged in
!!document.querySelector('.user-avatar')

// Get form value
document.querySelector('input#email').value

// Click a button
document.querySelector('button.submit').click()

// Get localStorage
JSON.stringify(localStorage)
```

---

## Architecture

```
Chrome Browser (Windows)
       ↓ console.log, etc.
Content Script → Background Worker → WebSocket → Backend (WSL:8129)
                                                      ↓
                                             Browser MCP Server (stdio)
                                                      ↓
                                               Claude Code
```

## Requirements

1. **Backend running:** `cd backend && npm start`
2. **Chrome extension loaded:** Reload at `chrome://extensions`
3. **MCP server configured:** `.mcp.json` in project root

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to backend" | Start backend: `cd backend && npm start` |
| "No logs captured" | Open Chrome tabs and interact with pages |
| "Request timed out" | Check Chrome is open with extension installed |
| Tools not showing | Restart Claude Code after adding `.mcp.json` |
