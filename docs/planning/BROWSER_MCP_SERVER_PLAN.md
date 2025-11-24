# Browser MCP Server - Implementation Plan

**Date**: November 24, 2025
**Purpose**: Give Claude Code access to browser console and page context via MCP

---

## Overview

Create an MCP server that enables Claude Code to interact with the Chrome browser through the existing TabzChrome extension infrastructure. This allows Claude to see console logs, execute scripts, inspect pages, and debug browser issues directly.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Windows                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Chrome Browser                                          │   │
│  │  ┌──────────────┐    ┌─────────────────────────────┐   │   │
│  │  │  Web Pages   │───►│  Extension (content script)  │   │   │
│  │  │  console.*   │    │  - Captures console logs     │   │   │
│  │  └──────────────┘    │  - Can execute scripts       │   │   │
│  │                      └──────────────┬──────────────┘   │   │
│  └──────────────────────────────────────┼──────────────────┘   │
│                                          │ WebSocket            │
│                                          │ localhost:8129       │
└──────────────────────────────────────────┼──────────────────────┘
                                           │
┌──────────────────────────────────────────┼──────────────────────┐
│  WSL                                     │                       │
│                      ┌───────────────────▼───────────────────┐  │
│                      │  Backend (Node.js) - Port 8129        │  │
│                      │  - Existing terminal WebSocket        │  │
│                      │  - NEW: Browser data endpoints        │  │
│                      └───────────────────┬───────────────────┘  │
│                                          │ HTTP/WS              │
│                      ┌───────────────────▼───────────────────┐  │
│                      │  browser-mcp-server (stdio)           │  │
│                      │  - Connects to backend                │  │
│                      │  - Exposes tools to Claude            │  │
│                      └───────────────────┬───────────────────┘  │
│                                          │ stdio                │
│                      ┌───────────────────▼───────────────────┐  │
│                      │  Claude Code                          │  │
│                      └───────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tools to Implement

| Tool | Description | Read-Only | Priority |
|------|-------------|-----------|----------|
| `browser_get_console_logs` | Get recent console output (log, warn, error, info) | ✅ | P0 |
| `browser_execute_script` | Execute JavaScript in active tab | ❌ | P0 |
| `browser_get_page_info` | Get current URL, title, DOM summary | ✅ | P1 |
| `browser_get_selected_text` | Get currently selected text | ✅ | P1 |
| `browser_get_network_errors` | Get recent failed network requests | ✅ | P2 |
| `browser_screenshot` | Capture visible tab as base64 image | ✅ | P2 |

### Tool Annotations

```typescript
// browser_get_console_logs
annotations: {
  title: "Get Browser Console Logs",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
}

// browser_execute_script
annotations: {
  title: "Execute Script in Browser",
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true
}
```

---

## Message Flow

### Console Log Capture

1. **Content script** injects into web pages, intercepts `console.*` calls
2. Sends logs to **background worker** via `chrome.runtime.sendMessage`
3. Background worker stores in circular buffer (~1000 entries max)
4. Background worker forwards to **backend** via existing WebSocket
5. Backend stores logs per-tab in memory
6. **MCP server** queries backend HTTP endpoint for logs

### Script Execution

1. **MCP server** receives `browser_execute_script` call
2. Sends request to **backend** via HTTP
3. Backend sends WebSocket message to **extension background worker**
4. Background worker uses `chrome.scripting.executeScript` on active tab
5. Result flows back through the chain

---

## Project Structure

```
browser-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # MCP server entry point (stdio transport)
│   ├── tools/
│   │   ├── console.ts    # browser_get_console_logs
│   │   ├── script.ts     # browser_execute_script
│   │   ├── page.ts       # browser_get_page_info, browser_get_selected_text
│   │   └── network.ts    # browser_get_network_errors
│   ├── client.ts         # HTTP client to backend API
│   ├── schemas.ts        # Zod validation schemas
│   └── types.ts          # Shared TypeScript types
└── dist/                 # Compiled JavaScript
```

---

## Implementation Steps

### Phase 1: Console Capture in Extension

**Files to modify:**
- `extension/content/content.ts` - Add console interception
- `extension/background/background.ts` - Store and forward logs
- `extension/shared/messaging.ts` - Add new message types

**New message types:**
```typescript
| 'CONSOLE_LOG'           // Content → Background: captured console entry
| 'GET_CONSOLE_LOGS'      // MCP → Backend → Extension: request logs
| 'CONSOLE_LOGS_RESPONSE' // Extension → Backend → MCP: log data
```

### Phase 2: Create MCP Server

**Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.6.1",
  "axios": "^1.7.9",
  "zod": "^3.23.8"
}
```

**Server initialization:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "browser-mcp-server",
  version: "1.0.0"
});
```

### Phase 3: Backend API Endpoints

**New REST endpoints:**
```
GET  /api/browser/console-logs     - Get console logs
POST /api/browser/execute-script   - Execute script in browser
GET  /api/browser/page-info        - Get current page info
GET  /api/browser/selected-text    - Get selected text
```

**WebSocket message types:**
```typescript
// Backend → Extension
{ type: 'browser-execute-script', code: string, tabId?: number }
{ type: 'browser-get-page-info' }

// Extension → Backend
{ type: 'browser-script-result', result: any, error?: string }
{ type: 'browser-page-info', url: string, title: string, ... }
```

### Phase 4: Claude Code Configuration

Add to `~/.claude/claude_desktop_config.json` or Claude Code settings:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/browser-mcp-server/dist/index.js"],
      "env": {
        "BACKEND_URL": "http://localhost:8129"
      }
    }
  }
}
```

---

## Input/Output Schemas

### browser_get_console_logs

**Input:**
```typescript
{
  level?: "all" | "log" | "warn" | "error" | "info",  // Filter by level
  limit?: number,           // Max entries (default: 100, max: 1000)
  since?: number,           // Timestamp filter (ms since epoch)
  tabId?: number,           // Filter by tab (default: active tab)
  response_format?: "json" | "markdown"
}
```

**Output (markdown):**
```markdown
# Console Logs (47 entries)

## Errors (3)
- [10:23:45] TypeError: Cannot read property 'foo' of undefined
  at App.tsx:123
- [10:23:46] Failed to fetch: NetworkError
  ...

## Warnings (5)
- [10:23:44] React: Each child should have a unique "key" prop
  ...

## Logs (39)
- [10:23:40] Application started
- [10:23:41] User logged in: john@example.com
  ...
```

### browser_execute_script

**Input:**
```typescript
{
  code: string,             // JavaScript code to execute
  tabId?: number,           // Target tab (default: active tab)
  allFrames?: boolean       // Execute in all frames (default: false)
}
```

**Output:**
```typescript
{
  success: boolean,
  result?: any,             // Return value from script
  error?: string            // Error message if failed
}
```

---

## Security Considerations

1. **Script execution is dangerous** - Only Claude (with user approval) can trigger
2. **Console logs may contain sensitive data** - User should be aware
3. **Backend only accepts localhost connections** - No remote access
4. **MCP server runs locally** - No network exposure

---

## Testing Plan

1. **Manual testing**: Execute each tool and verify results
2. **Console capture**: Open a page, trigger console.log, verify capture
3. **Script execution**: Run `document.title` and verify return value
4. **Error handling**: Test with invalid inputs, disconnected backend

---

## Future Enhancements

- `browser_screenshot` - Capture visible tab as image
- `browser_get_network_errors` - Monitor failed network requests
- `browser_get_dom` - Query DOM elements by selector
- `browser_click` - Simulate clicks on elements
- `browser_fill_form` - Fill form fields
- Real-time log streaming via SSE transport

---

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/llms-full.txt)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [TabzChrome Architecture](../CLAUDE.md)
