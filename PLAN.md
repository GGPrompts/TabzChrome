# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 7, 2025
**Current Version**: 2.3.0
**Status**: Phase 2B Complete ✅ | Next: Phase 2C Power Tools

---

## Phase 1: Getting Ready to Share

### 1.1 System Requirements Documentation ✅

**Goal**: Clear documentation so users know if TabzChrome will work for them.

**Required:**
- [x] Document minimum requirements in README.md:
  - Chrome browser (Manifest V3 compatible)
  - WSL2 or native Linux for backend
  - Node.js (document minimum version)
  - tmux (for terminal persistence)

**Optional dependencies:**
- [x] Nerd Fonts (for icons in terminal)
- [x] TUI apps referenced in default profiles (lazygit, htop, etc.)

**Tasks:**
- [x] Test minimum Node.js version (18.x minimum, 20.x+ recommended)
- [x] Verify Chrome version requirements (116+ for Side Panel API)
- [x] Add "Requirements" section to README.md
- [x] Add troubleshooting for common setup issues

### 1.2 Codebase Cleanup Audit ✅

**Goal**: Remove outdated docs, scripts, and personal paths before sharing.

**Documentation cleanup:**
- [x] Audit `docs/` folder - kept for reference (archived/, bugs/, planning/, etc.)
- [x] Audit `docs/archived/` - kept for historical reference
- [x] README.md updated - removed Commands Panel references, updated to profiles

**Config cleanup:**
- [x] Review `spawn-options.json` - removed personal paths, made generic
- [x] Review `public/spawn-options.json` - same
- [x] Fixed hardcoded `/home/matt` path in Terminal.tsx

**Scripts cleanup:**
- [x] Removed `scripts/` folder (outdated dev utilities referencing old port/session names)
- [x] Removed root shell scripts (start.sh, stop.sh, start-tmux.sh, test-claude-colors.sh)
  - These were for the web app version, not needed for Chrome extension

**Dead code:**
- [x] Searched for TODO/FIXME comments - remaining are minor (toast notifications, options page)
- [x] Commands Panel references removed from README.md

### 1.3 Test Suite (Partial ✅)

**Goal**: Ensure tests run and catch regressions, especially xterm.js issues.

**Current state:**
- ✅ Tests in `tests/` - 172 tests passing (7 test files)
- ✅ Removed web-app-specific tests (splits, multi-window, cross-window sync)

**Completed:**
- [x] Run existing test suite - 172 tests pass
- [x] Remove/update tests for features that don't exist in Chrome extension
  - Removed: cross-window-state-sync.test.ts, split-operations.test.ts,
    multi-window-popout.test.ts, detach-reattach.test.ts, detached-terminals-dropdown.test.ts
- [x] Document how to run tests in README

**Future work (post-release):**
- [ ] Add Chrome extension-specific tests:
  - [ ] Extension loads successfully
  - [ ] Sidebar opens
  - [ ] Terminal spawns with profile
  - [ ] WebSocket connection established
  - [ ] Settings persistence (Chrome storage)
- [ ] Add xterm.js regression tests:
  - [ ] Terminal resize handling
  - [ ] Copy/paste functionality
  - [ ] Reconnection behavior

### 1.4 README.md Polish (Partial ✅)

**Goal**: User-friendly documentation for new users.

- [x] Clear "Getting Started" section (exists)
- [ ] Screenshots of the extension in action
- [x] Feature overview (exists)
- [x] Installation instructions (load unpacked) (exists)
- [x] Backend setup instructions (exists)
- [x] Troubleshooting section
- [ ] Contributing guidelines (if accepting PRs)

---

## Phase 2: Chrome API Power Features for MCP

**Goal**: Leverage powerful Chrome APIs to make the Browser MCP dramatically more capable for Claude power users.

### 2.1 `chrome.debugger` - Full DevTools Protocol (Priority #1) 🔥🔥🔥🔥🔥

**Impact**: Eliminates need for `--remote-debugging-port=9222` Chrome launch. Full CDP access from inside the extension.

**Manifest change:**
```json
"permissions": ["debugger", ...]
```

**MCP Tools to implement:**

- [ ] `browser_get_network_requests` - See all XHR/fetch requests a page makes
  - Attach to tab, enable Network domain
  - Capture request URL, method, headers, body
  - Capture response status, headers, body
  - Filter by type (XHR, fetch, websocket, etc.)

- [ ] `browser_get_api_response` - Capture specific API response content
  - Wait for request matching pattern
  - Return full response body (JSON, etc.)
  - Useful for capturing AI service outputs

- [ ] `browser_profile_performance` - Profile page performance
  - Enable Performance domain
  - Capture metrics: load time, scripting, rendering
  - Identify slow operations

- [ ] `browser_get_dom_tree` - Full DOM inspection
  - Get complete DOM structure
  - Better than innerHTML for debugging

- [ ] `browser_set_breakpoint` - Debug JavaScript issues
  - Enable Debugger domain
  - Set breakpoints by URL/line
  - Pause/resume execution

- [ ] `browser_get_coverage` - Code coverage analysis
  - See which code actually runs
  - Identify dead code

**Implementation notes:**
```typescript
// In background.ts
chrome.debugger.attach({tabId}, "1.3", () => {
  chrome.debugger.sendCommand({tabId}, "Network.enable");
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Network.responseReceived") {
    // Capture response details
  }
});
```

**Migration path:**
1. Add debugger permission to manifest
2. Create `extension/debugger/` module for CDP commands
3. Add MCP tools that use extension messaging → debugger
4. Eventually deprecate external CDP connection (run-windows.sh)

---

### 2.2 `chrome.downloads` - File Download Control (Priority #2) 🔥🔥🔥🔥

**Impact**: Download any file type, not just images. Essential for AI tool workflows.

**Manifest change:**
```json
"permissions": ["downloads", ...]
```

**MCP Tools to implement:**

- [ ] `browser_download_file` - Download any file
  - URL to download
  - Optional filename/path
  - Option to open folder after
  ```typescript
  chrome.downloads.download({
    url: 'https://example.com/file.pdf',
    filename: 'downloads/document.pdf',
    saveAs: false
  });
  ```

- [ ] `browser_get_downloads` - List recent downloads
  - Search by filename, URL, date
  - Show status (complete, in_progress, failed)
  - Return file paths

- [ ] `browser_monitor_download` - Track download progress
  - Real-time progress updates
  - Completion notification

- [ ] `browser_save_page` - Save page as HTML/MHTML
  - Capture entire page with assets
  - Archive web content

- [ ] `browser_batch_download` - Download multiple files
  - Array of URLs
  - Progress for each
  - Summary when complete

**Use cases:**
- Download AI-generated images (DALL-E, Midjourney outputs)
- Save PDFs from documentation sites
- Batch download assets from a page
- Export data from web apps

---

### 2.3 `chrome.webRequest` - Network Monitoring (Priority #3) 🔥🔥🔥🔥

**Impact**: See all network traffic. Read-only in MV3 but still extremely powerful.

**Manifest change:**
```json
"permissions": ["webRequest", "<all_urls>", ...]
```

**MCP Tools to implement:**

- [ ] `browser_get_api_calls` - See all API requests from a page
  - List XHR/fetch requests
  - Show URL, method, status, timing
  - Filter by domain or pattern

- [ ] `browser_monitor_websockets` - Track WebSocket messages
  - See WebSocket connections
  - Capture messages (if possible)

- [ ] `browser_capture_auth_flow` - Debug OAuth/auth issues
  - Track redirects
  - See auth tokens in headers/cookies

- [ ] `browser_find_api_endpoints` - Discover page's APIs
  - List all unique API endpoints hit
  - Reverse-engineer undocumented APIs

**Implementation notes:**
```typescript
// In background.ts
chrome.webRequest.onCompleted.addListener(
  (details) => {
    // Store in memory for MCP queries
    networkLog.push({
      url: details.url,
      method: details.method,
      status: details.statusCode,
      type: details.type,
      timestamp: details.timeStamp
    });
  },
  {urls: ["<all_urls>"]}
);
```

**Note:** Cannot block/modify requests in MV3 (unless enterprise policy). Read-only monitoring only.

---

### 2.4 `chrome.cookies` - Authentication Debugging (Priority #4) 🔥🔥🔥

**Impact**: Debug auth issues, check login state, inspect sessions.

**Manifest change:**
```json
"permissions": ["cookies", "<all_urls>", ...]
```

**MCP Tools to implement:**

- [ ] `browser_check_auth` - Check if logged into a service
  - Domain to check
  - Returns auth cookie presence/details
  - "Am I logged into GitHub?"

- [ ] `browser_get_cookies` - Get all cookies for a domain
  - List cookies with name, value, expiry
  - Debug session issues

- [ ] `browser_get_session` - Get specific session cookie
  - Check token validity
  - Debug auth flows

**Implementation:**
```typescript
chrome.cookies.getAll({domain: "github.com"}, (cookies) => {
  // Return to MCP
});
```

---

### 2.5 `chrome.history` - Research Assistant (Priority #5) 🔥🔥🔥

**Impact**: Search browsing history, find pages you visited, research assistance.

**Manifest change:**
```json
"permissions": ["history", ...]
```

**MCP Tools to implement:**

- [ ] `browser_search_history` - Search browsing history
  - Search by text, date range
  - "Find that page I visited about React hooks"
  - Return URLs, titles, visit times

- [ ] `browser_get_research` - Gather pages visited for a topic
  - Aggregate related pages
  - Build research bibliography

- [ ] `browser_frequent_sites` - Get most visited sites
  - Last week/month/all time
  - Discover patterns

**Implementation:**
```typescript
chrome.history.search({
  text: "react hooks",
  maxResults: 50
}, (results) => {
  // Return to MCP
});
```

---

### 2.6 `chrome.bookmarks` - Knowledge Management (Priority #6) 🔥🔥

**Impact**: Save and organize important pages, quick reference.

**Manifest change:**
```json
"permissions": ["bookmarks", ...]
```

**MCP Tools to implement:**

- [ ] `browser_save_bookmark` - Bookmark current page
  - Optional folder specification
  - Add tags via folder structure

- [ ] `browser_search_bookmarks` - Find saved resources
  - Search by title, URL
  - Browse folders

- [ ] `browser_organize_bookmarks` - Auto-organize bookmarks
  - Move to appropriate folders
  - Clean up duplicates

- [ ] `browser_get_bookmark_tree` - Export bookmark structure
  - Full hierarchy
  - For backup or analysis

**Implementation:**
```typescript
chrome.bookmarks.create({
  parentId: folderId,
  title: "Important Article",
  url: "https://..."
});
```

---

### 2.7 Cross-Platform Support (Linux, macOS, Windows) ✅ COMPLETE

> **Note:** Phase 2.7 (`chrome.windows` multi-window tools) was removed - conflicts with sidebar simplicity philosophy.

**Goal**: Ensure TabzChrome works on all major platforms, not just Windows/WSL2.

**Current State:**
| Component | Windows (WSL2) | Native Linux | macOS |
|-----------|----------------|--------------|-------|
| Chrome Extension | ✅ Works | ✅ Works | ✅ Works |
| Backend (Node.js) | ✅ Works | ✅ Works | ✅ Works |
| MCP Server | ✅ Works | ✅ Works | ✅ Works |

**Completed:**
- ✅ Added `run.sh` for native Linux/Mac
- ✅ Renamed `run-windows.sh` → `run-wsl.sh`
- ✅ Added `run-auto.sh` with platform auto-detection
- ✅ Updated WSL2_SETUP.md with platform-specific instructions

**Tasks:**

1. [x] **Add native launch script**
   ```bash
   # tabz-mcp-server/run.sh (for Linux/Mac)
   #!/bin/bash
   exec node "$(dirname "$0")/dist/index.js"
   ```

2. [x] **Rename existing script**
   - `run-windows.sh` → `run-wsl.sh` (clearer naming)

3. [x] **Add platform detection script**
   ```bash
   # tabz-mcp-server/run-auto.sh
   #!/bin/bash
   if grep -qi microsoft /proc/version 2>/dev/null; then
     # WSL2 - use Windows node for CDP access
     exec "/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w "$(dirname "$0")/dist/index.js")"
   else
     # Native Linux/Mac
     exec node "$(dirname "$0")/dist/index.js"
   fi
   ```

4. [x] **Update README with platform-specific setup**

   **Chrome Launch Commands:**
   ```markdown
   ### Linux
   ```bash
   google-chrome --remote-debugging-port=9222
   # or for Chromium:
   chromium-browser --remote-debugging-port=9222
   ```

   ### macOS
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```

   ### Windows (from CMD/PowerShell)
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

   ### Windows (WSL2)
   ```bash
   # Create a shortcut or use:
   cmd.exe /c start chrome --remote-debugging-port=9222
   ```
   ```

5. [x] **Update README with MCP config per platform**

   ```markdown
   ### MCP Configuration

   **Linux / macOS:**
   ```json
   {
     "mcpServers": {
       "tabz": {
         "command": "/path/to/tabz-mcp-server/run.sh",
         "env": { "BACKEND_URL": "http://localhost:8129" }
       }
     }
   }
   ```

   **Windows (WSL2):**
   ```json
   {
     "mcpServers": {
       "tabz": {
         "command": "/path/to/tabz-mcp-server/run-wsl.sh",
         "env": { "BACKEND_URL": "http://localhost:8129" }
       }
     }
   }
   ```

   **Or use auto-detection:**
   ```json
   {
     "mcpServers": {
       "tabz": {
         "command": "/path/to/tabz-mcp-server/run-auto.sh",
         "env": { "BACKEND_URL": "http://localhost:8129" }
       }
     }
   }
   ```
   ```

6. [ ] **Test matrix before release**
   - [ ] Windows 11 + WSL2 + Chrome (current setup)
   - [ ] Native Ubuntu + Chrome
   - [ ] Native macOS + Chrome
   - [ ] Verify CDP connection on each platform
   - [ ] Verify screenshots save to correct paths

7. [ ] **Path handling improvements** (if needed)
   - The `convertPathForWSL()` function should be harmless on native (only converts Windows paths)
   - May need `convertPathForMac()` if screenshot paths have issues on macOS

**Platform-Specific Notes:**

| Platform | CDP Host | Screenshot Path | Notes |
|----------|----------|-----------------|-------|
| WSL2 | `host.docker.internal` or PowerShell fallback | `/mnt/c/Users/.../ai-images/` | Need Windows node.exe |
| Linux | `localhost:9222` | `~/ai-images/` | Native node works |
| macOS | `localhost:9222` | `~/ai-images/` | Native node works |

---

### 2.9 MCP Rebrand: `browser` → `tabz` ✅ COMPLETE

**Goal**: Rename MCP server from generic "browser" to branded "tabz" for clarity.

**Changes:**
- [x] Rename `browser-mcp-server/` → `tabz-mcp-server/`
- [x] Rename MCP server name: `"browser"` → `"tabz"` in package.json
- [x] Rename all tools: `browser_*` → `tabz_*`
  - `tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab`
  - `tabz_get_page_info`, `tabz_screenshot`, `tabz_download_image`
  - `tabz_click`, `tabz_fill`, `tabz_get_element`
  - `tabz_open_url`, `tabz_get_console_logs`, `tabz_execute_script`
- [x] Update `.mcp.json` examples in docs
- [x] Update MCP_TOOLS.md
- [x] Update CLAUDE.md references
- [x] Update WSL2_SETUP.md

**Rationale:**
- "browser" is generic, could conflict with other browser MCPs
- "tabz" is branded and distinctive
- Matches project name (TabzChrome)

---

### 2.10 Settings Modal - MCP Tools Tab

**Goal**: Let users configure which MCP tool groups are enabled directly from the Chrome extension UI.

**UI Design:**
```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                              [X]  │
├─────────────────────────────────────────────────────────────┤
│  [Profiles] [MCP Tools]                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔧 Tabz MCP Tool Groups                                    │
│                                                             │
│  Control which tools are available to Claude.               │
│  Fewer tools = less context usage = faster responses.       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ Core (4 tools)                        🔒 Required │   │
│  │   List tabs, switch, rename, page info              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ Interaction (5 tools)                             │   │
│  │   Click, fill, screenshot, download image, inspect  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ Navigation (1 tool)                               │   │
│  │   Open URLs (GitHub, localhost, Vercel, etc.)       │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☑ Console (2 tools)                                 │   │
│  │   Get console logs, execute JavaScript              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ Downloads (2 tools)                    ⚡ Power   │   │
│  │   Download any file, list downloads                 │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ Cookies (3 tools)                      ⚡ Power   │   │
│  │   Check auth, get cookies, inspect sessions         │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ History (3 tools)                      ⚡ Power   │   │
│  │   Search browsing history, frequent sites           │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ Bookmarks (4 tools)                    ⚡ Power   │   │
│  │   Save, search, organize bookmarks                  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ☐ Network (4 tools)                      ⚡ Power   │   │
│  │   Monitor API calls, capture responses              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  📊 Estimated context: ~2,400 tokens                        │
│     (with all power tools: ~8,200 tokens)                   │
│                                                             │
│  ⚡ Quick Presets:                                          │
│  [Minimal] [Standard] [Everything]                          │
│                                                             │
│  ⚠️ Restart Claude Code to apply changes                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**

1. [ ] **Chrome Storage for MCP Settings**
   ```typescript
   // extension/shared/storage.ts
   interface McpSettings {
     enabledGroups: string[];
     // Default: ['core', 'interaction', 'navigation', 'console']
   }

   export async function getMcpSettings(): Promise<McpSettings>;
   export async function saveMcpSettings(settings: McpSettings): Promise<void>;
   ```

2. [ ] **Backend API Endpoint**
   ```javascript
   // backend/routes/api.js

   // MCP server queries this on startup
   router.get('/api/mcp-config', async (req, res) => {
     const config = await readMcpConfig();
     res.json(config);
   });

   // Extension saves settings here
   router.post('/api/mcp-config', async (req, res) => {
     await saveMcpConfig(req.body);
     res.json({ success: true });
   });
   ```

3. [ ] **MCP Server - Dynamic Tool Registration**
   ```typescript
   // tabz-mcp-server/src/index.ts

   const TOOL_GROUPS = {
     core: () => registerCoreTools(server),
     interaction: () => registerInteractionTools(server),
     navigation: () => registerNavigationTools(server),
     console: () => registerConsoleTools(server),
     downloads: () => registerDownloadTools(server),
     cookies: () => registerCookieTools(server),
     history: () => registerHistoryTools(server),
     bookmarks: () => registerBookmarkTools(server),
     network: () => registerNetworkTools(server),
   };

   async function getEnabledGroups(): Promise<string[]> {
     try {
       const response = await fetch('http://localhost:8129/api/mcp-config');
       const config = await response.json();
       return config.enabledGroups || ['core', 'interaction', 'navigation', 'console'];
     } catch {
       // Fallback if backend not running
       return ['core', 'interaction', 'navigation', 'console'];
     }
   }

   // Register only enabled tool groups
   const enabledGroups = await getEnabledGroups();
   for (const group of enabledGroups) {
     if (TOOL_GROUPS[group]) {
       TOOL_GROUPS[group]();
     }
   }
   ```

4. [ ] **Settings Modal Component**
   ```typescript
   // extension/components/McpSettingsTab.tsx

   const MCP_TOOL_GROUPS = [
     { id: 'core', name: 'Core', tools: 4, locked: true,
       desc: 'List tabs, switch, rename, page info' },
     { id: 'interaction', name: 'Interaction', tools: 5,
       desc: 'Click, fill, screenshot, download image, inspect' },
     { id: 'navigation', name: 'Navigation', tools: 1,
       desc: 'Open URLs (GitHub, localhost, Vercel, etc.)' },
     { id: 'console', name: 'Console', tools: 2,
       desc: 'Get console logs, execute JavaScript' },
     { id: 'downloads', name: 'Downloads', tools: 2, power: true,
       desc: 'Download any file, list downloads' },
     { id: 'cookies', name: 'Cookies', tools: 3, power: true,
       desc: 'Check auth, get cookies, inspect sessions' },
     { id: 'history', name: 'History', tools: 3, power: true,
       desc: 'Search browsing history, frequent sites' },
     { id: 'bookmarks', name: 'Bookmarks', tools: 4, power: true,
       desc: 'Save, search, organize bookmarks' },
     { id: 'network', name: 'Network', tools: 4, power: true,
       desc: 'Monitor API calls, capture responses' },
   ];

   const TOKEN_ESTIMATES = {
     core: 800, interaction: 1200, navigation: 400, console: 600,
     downloads: 600, cookies: 700, history: 700, bookmarks: 800, network: 1500
   };
   ```

5. [ ] **Sync Extension → Backend**
   ```typescript
   // When user saves MCP settings in modal
   async function syncMcpSettings(settings: McpSettings) {
     // Save to Chrome storage
     await saveMcpSettings(settings);

     // Sync to backend for MCP server to read
     await fetch('http://localhost:8129/api/mcp-config', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(settings)
     });
   }
   ```

**Token Estimation Logic:**
```typescript
const estimateTokens = (groups: string[]) => {
  return groups.reduce((sum, g) => sum + (TOKEN_ESTIMATES[g] || 500), 0);
};

// Display in UI
<div className="text-sm text-muted-foreground">
  📊 Estimated context: ~{estimateTokens(enabledGroups).toLocaleString()} tokens
</div>
```

**Quick Presets:**
```typescript
const PRESETS = {
  minimal: ['core'],
  standard: ['core', 'interaction', 'navigation', 'console'],
  everything: Object.keys(TOOL_GROUPS),
};
```

---

### 2.11 Implementation Order & Checklist

**Phase A: Foundation (Do First)** ✅ COMPLETE

1. [x] **Cross-platform support**
   - [x] Add `run.sh` for native Linux/Mac
   - [x] Rename `run-windows.sh` → `run-wsl.sh`
   - [x] Add `run-auto.sh` with platform detection
   - [x] Update README with platform-specific setup

2. [x] **Rebrand MCP**
   - [x] Rename `browser-mcp-server/` → `tabz-mcp-server/`
   - [x] Update tool names `browser_*` → `tabz_*`
   - [x] Update all documentation

3. [x] **Add Chrome permissions to manifest.json**
   ```json
   "permissions": [
     "debugger",
     "downloads",
     "webRequest",
     "cookies",
     "history",
     "bookmarks",
     // existing...
   ]
   ```

4. [x] **Backend MCP config endpoint**
   - [x] `GET /api/mcp-config`
   - [x] `POST /api/mcp-config`
   - [x] Config file storage (`mcp-config.json`)

5. [x] **MCP dynamic tool loading**
   - [x] Query backend for enabled groups
   - [x] Conditional tool registration
   - [x] Fallback defaults

**Phase B: Settings UI** ✅ COMPLETE

6. [x] **Settings Modal - MCP Tab**
   - [x] Tab navigation (Profiles | MCP Tools)
   - [x] Tool group checkboxes
   - [x] Token estimate display
   - [x] Quick presets
   - [x] "Restart required" notice

7. [x] **Chrome Storage integration**
   - [x] Save/load MCP settings
   - [x] Sync to backend on change

**Phase C: Power Tools**

8. [ ] **Downloads tools**
   - [ ] `tabz_download_file`
   - [ ] `tabz_get_downloads`

9. [ ] **Cookies tools**
   - [ ] `tabz_check_auth`
   - [ ] `tabz_get_cookies`

10. [ ] **History tools**
    - [ ] `tabz_search_history`

11. [ ] **Bookmarks tools**
    - [ ] `tabz_save_bookmark`
    - [ ] `tabz_search_bookmarks`

12. [ ] **Network/Debugger tools** (most complex)
    - [ ] `tabz_get_network_requests`
    - [ ] `tabz_get_api_response`

**Phase D: Testing & Release**

13. [ ] **Cross-platform testing**
    - [ ] Windows 11 + WSL2 + Chrome
    - [ ] Native Ubuntu + Chrome
    - [ ] Native macOS + Chrome (if possible)
    - [ ] Verify all MCP tools work on each platform

**Architecture Summary:**
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Chrome Extension │     │    Backend       │     │   Tabz MCP       │
│ Settings Modal   │────▶│    (8129)        │◀────│   Server         │
│                  │POST │ /api/mcp-config  │ GET │                  │
│ [x] Core         │     │                  │     │ registerTools()  │
│ [x] Interaction  │     │ mcp-config.json  │     │ based on config  │
│ [ ] Downloads    │     │                  │     │                  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
        │                                                   │
        │              Chrome Storage                       │
        └──────────────▶ mcpSettings ◀──────────────────────┘
                         (backup)
```

---

## Phase 3: Future Enhancements (Post-Release)

### Detached Sessions Manager (👻 Ghost Badge)
Show count of detached tmux sessions with quick reattach/kill options.

**UI Design:**
```
Header: [🟢 Connected] [👻 3]  ← click for dropdown
                        ┌──────────────────────┐
                        │ Detached Sessions    │
                        ├──────────────────────┤
                        │ ctt-claude-abc123    │
                        │   [Reattach] [Kill]  │
                        │ ctt-lazygit-def456   │
                        │   [Reattach] [Kill]  │
                        └──────────────────────┘
```

**Implementation:**

1. **Backend endpoint** (~30 min)
   ```javascript
   // GET /api/tmux/orphaned-sessions
   // Returns ctt- sessions NOT in terminal registry
   const tmuxSessions = execSync('tmux ls').toString().split('\n')
   const registeredIds = terminalRegistry.getTerminalIds()
   const orphaned = tmuxSessions
     .filter(s => s.startsWith('ctt-'))
     .filter(s => !registeredIds.includes(s.split(':')[0]))
   ```

2. **Frontend state** (~30 min)
   - Poll every 30s or on-demand when badge clicked
   - Store orphaned session list in state

3. **Ghost badge UI** (~30 min)
   - Show 👻 + count next to connection indicator
   - Hide when count is 0
   - Subtle animation on count change

4. **Dropdown menu** (~30 min)
   - List session names
   - Reattach button → calls spawn API with `sessionName`
   - Kill button → calls `DELETE /api/tmux/sessions/:name`

**Complexity:** Low-Medium (~2-3 hours total)

**Files to modify:**
- `backend/routes/api.js` - Add orphaned sessions endpoint
- `extension/sidepanel/sidepanel.tsx` - Badge + dropdown UI
- `extension/hooks/useOrphanedSessions.ts` - New hook for polling

---

### Audio/Voice Pack for Claude Status
Play sounds or voice announcements when Claude status changes.

**Implementation options:**
1. **Extension plays audio** (cleanest) - React to `claudeStatuses` changes in sidepanel
   ```typescript
   useEffect(() => {
     if (status?.status === 'tool_use') new Audio('/sounds/tool.mp3').play()
     if (status?.status === 'awaiting_input') new Audio('/sounds/ready.mp3').play()
   }, [claudeStatuses])
   ```
2. **Hooks call Windows directly** - PowerShell from WSL
   ```bash
   powershell.exe -c "(New-Object Media.SoundPlayer 'C:\sounds\ready.wav').PlaySync()" &
   ```
3. **Windows TTS** - Dynamic announcements
   ```bash
   powershell.exe -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('Editing file')" &
   ```

**Voice pack ideas:**
- Tool-specific sounds (edit, bash, read, grep)
- "Ready for input" when Claude finishes
- Error/warning sounds
- RTS-style advisor: "Your Claude is under attack" on errors 😂

### Keyboard Shortcuts Settings Tab
A 3rd tab in Settings for viewing and configuring keyboard shortcuts.

**Features:**
- Display current keybindings (from manifest defaults)
- "Open Chrome shortcuts page" button (`chrome://extensions/shortcuts`)
- Available actions:
  - New Tab (`Alt+T` suggested)
  - Close Tab (`Alt+W` suggested)
  - Next Tab (`Alt+]`)
  - Previous Tab (`Alt+[`)
  - Jump to Tab 1-9 (`Alt+1` through `Alt+9`)
- Note explaining Chrome's shortcut configuration system
- Detection of conflicts with Chrome/Windows hotkeys

**Implementation notes:**
- Chrome doesn't allow programmatic shortcut changes (security)
- Tab displays what's available + links to Chrome's native config
- Provide suggested defaults that avoid common conflicts

### Keyboard Shortcuts (Manifest)
- `Alt+T` - Open spawn menu
- `Alt+W` - Close active tab
- `Alt+1-9` - Jump to tab
- Blocked: Can't override Ctrl+T/W (browser reserved)

### Import/Export Profiles
- Export profiles to JSON for backup/sharing
- Import profiles from file

### Tab Context Menu
- Right-click tab for: Rename, Close, Close Others

### Chrome Web Store Publication
- Privacy policy
- Screenshots and description
- Version management

---

## Known Issues to Investigate

### Tmux Status Bar Rendering Glitch
When Claude is working, sometimes the tmux status bar disappears and terminal output text appears in its place.

**Suspected cause:** Conflict between:
- `state-tracker.sh` writing Claude status
- `tmux-status-claude.sh` (from Tabz web app) trying to update tmux status bar
- TabzChrome doesn't use tmux status display, but hooks may still be triggering it

**Symptoms:**
- Status bar area shows random terminal output (e.g., code snippets)
- Happens during Claude tool use

**Potential fixes:**
- Disable `tmux-status-claude.sh` hook when using TabzChrome
- Add guard in hook to detect Chrome extension context
- `Ctrl+L` or `tmux refresh-client -S` to fix temporarily

---

## Non-Goals

These are intentionally excluded from the Chrome extension:

- **Split terminals** - Sidebar is narrow, use tmux splits instead
- **Multi-window support** - Chrome has one sidebar per window by design
- **Complex theming UI** - Keep it simple, 6 curated themes + dark/light toggle
- **`chrome.windows` tools** - Multi-window workflows conflict with sidebar simplicity

---

## Technical Notes

### Terminal ID Prefixes
- `ctt-` prefix for all Chrome extension terminals
- Enables easy cleanup: `tmux ls | grep "^ctt-"`
- Distinguishes from web app terminals (`tt-`)

### State Management
- Chrome storage for UI state (profiles, settings, recent dirs)
- tmux for terminal persistence (processes survive backend restart)
- WebSocket for real-time terminal I/O

### Ports
- Backend: 8129 (WebSocket + REST API)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For historical planning documents and completed work, see [docs/archive/](docs/archive/).
