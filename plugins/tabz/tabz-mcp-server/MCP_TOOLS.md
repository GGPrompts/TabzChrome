# Tabz MCP Tools Reference

Quick reference for TabzChrome MCP tools. The published tool list depends on the selected configuration or preset.

> **Tool overhead:** Select `MCP_PRESET=page-agent` for the compact browser surface. The full catalog retains legacy and Tabz management tools. Schema loading depends on the client and selected preset; published size is measured separately from billed tokens. See the repository's `docs/planning/glass-catchup-2026-09-07/` measurement artifacts.

### Published size (2026-09-07 catch-up build)

The isolated built-server measurement includes complete tool entries and initialize instructions:

| Selection | Tools | Schema characters / UTF-8 bytes | Startup characters | Combined chars/4 estimate |
| --- | ---: | ---: | ---: | ---: |
| Full compatibility | 97 | 60,653 / 60,653 | 1,168 | 15,456 |
| `page-agent` | 20 | 18,235 / 18,235 | 1,168 | 4,851 |

These are `ceil(chars/4)` estimates, not tokenizer or billing measurements. The same 97-tool combined surface is 25.44% smaller than immediately before this description pass. Client loading behavior and selected tools determine actual context usage. Detailed evidence and original-baseline comparisons are in `docs/planning/glass-catchup-2026-09-07/tool-overhead-verification.md` in the repository.


## Tools Overview

| Tool | Trigger Words | Description |
|------|---------------|-------------|
| `tabz_read_page` | "read page", "find controls", "get refs" | Read a compact outline and publish refs for the current document |
| `tabz_act` | "act", "click ref", "type", "scroll", "drag" | Perform a page action using a ref, selector, text or coordinates |
| `tabz_batch` | "batch", "run these calls" | Run up to 20 enabled calls in order; stop at the first error |
| `tabz_get_page_info` | "what page", "current tab", "what site", "looking at", "URL" | Get the current page's URL, title, and tab ID |
| `tabz_get_console_logs` | "console logs", "errors", "warnings", "debug", "browser logs" | Retrieve console output from browser tabs |
| `tabz_execute_script` | "run script", "execute", "DOM", "get element", "page data" | Execute JavaScript in the browser tab |
| `tabz_screenshot` | "screenshot my view", "what I see", "current viewport" | Capture viewport screenshot (what's visible) |
| `tabz_screenshot_full` | "screenshot this page", "full page", "entire page", "whole page" | Capture entire scrollable page in one image |
| `tabz_download_image` | "download image", "save image", "get picture" | Download images from pages to local disk |
| `tabz_list_tabs` | "list tabs", "what tabs", "open tabs", "show tabs" | List tabs in this connection's owned group |
| `tabz_close_tab` | "close tab", "close my group" | Close owned tabs by ID or group |
| `tabz_switch_tab` | "switch tab", "go to tab", "change tab" | Switch to a specific tab |
| `tabz_rename_tab` | "rename tab", "name tab", "label tab" | Assign a custom name to a tab |
| `tabz_click` | "click", "press button", "click element" | Legacy selector click; prefer `tabz_act` with a published ref |
| `tabz_fill` | "fill", "type", "enter text", "fill form" | Legacy fill for ordinary values; requires verified readback |
| `tabz_get_element` | "inspect element", "get styles", "element info", "css debug" | Get element HTML, styles, bounds for CSS debugging/recreation |
| `tabz_open_url` | "open URL", "navigate to", "open GitHub", "open localhost" | Open allowed URLs (GitHub, GitLab, Vercel, localhost) in browser tabs |
| `tabz_enable_network_capture` | "enable network", "start capture", "monitor requests" | Start capturing network requests (XHR, fetch, etc.) |
| `tabz_get_network_requests` | "network requests", "API calls", "what requests" | List captured network requests with filtering |
| `tabz_clear_network_requests` | "clear network", "reset requests" | Clear all captured network requests |
| `tabz_download_file` | "download file", "download URL", "save file" | Download any URL to disk (returns Windows + WSL paths) |
| `tabz_get_downloads` | "list downloads", "download status", "recent downloads" | List recent downloads with status and progress |
| `tabz_cancel_download` | "cancel download", "stop download" | Cancel an in-progress download |
| `tabz_save_page` | "save page", "archive page", "save as MHTML" | Save complete page as MHTML (HTML + CSS + images bundled) |
| `tabz_get_bookmark_tree` | "show bookmarks", "bookmark folders", "bookmark hierarchy" | Get bookmark folder structure |
| `tabz_search_bookmarks` | "find bookmark", "search bookmarks" | Find bookmarks by title or URL |
| `tabz_save_bookmark` | "save bookmark", "add bookmark", "bookmark this" | Save URL to bookmarks |
| `tabz_create_folder` | "create folder", "new bookmark folder" | Create bookmark folder |
| `tabz_move_bookmark` | "move bookmark", "organize bookmarks" | Move bookmark to different folder |
| `tabz_delete_bookmark` | "delete bookmark", "remove bookmark" | Delete bookmark or folder |
| `tabz_get_dom_tree` | "DOM tree", "page structure", "inspect DOM" | Get full DOM tree via chrome.debugger |
| `tabz_profile_performance` | "performance metrics", "page speed", "memory usage" | Profile timing, memory, and DOM metrics |
| `tabz_get_coverage` | "code coverage", "unused CSS", "unused JavaScript" | Get JS/CSS code coverage analysis |
| `tabz_list_groups` | "list groups", "tab groups", "show groups" | List tab groups accessible to this connection |
| `tabz_create_group` | "create group", "group tabs", "new group" | Create a group from owned tabs |
| `tabz_update_group` | "update group", "rename group", "change group color" | Update an owned group's properties |
| `tabz_add_to_group` | "add to group", "move to group" | Add owned tabs to an owned group |
| `tabz_ungroup_tabs` | "ungroup tabs", "remove from group" | Ungroup owned tabs |
| `tabz_claude_group_add` | "mark tab active", "highlight tab" | Add an owned tab to this connection's enforced group |
| `tabz_claude_group_remove` | "unmark tab", "done with tab" | Remove an owned tab from this connection's enforced group |
| `tabz_claude_group_status` | "claude group status", "active tabs" | Get status of this connection's enforced group |
| `tabz_list_windows` | "list windows", "what windows", "show windows" | List all Chrome windows with dimensions and state |
| `tabz_create_window` | "new window", "create window", "popup window" | Create new browser window (normal or popup) |
| `tabz_update_window` | "move window", "resize window", "maximize", "minimize" | Update window position, size, or state |
| `tabz_close_window` | "close window" | Close a browser window (and all its tabs) |
| `tabz_get_displays` | "monitors", "displays", "screens", "multi-monitor" | Get display/monitor info for multi-monitor layouts |
| `tabz_tile_windows` | "tile windows", "arrange windows", "split windows" | Auto-arrange windows in grid/split layouts |
| `tabz_popout_terminal` | "popout terminal", "terminal window", "detach terminal" | Pop out sidebar terminal to standalone popup window |
| `tabz_speak` | "say", "announce", "speak", "read aloud", "TTS" | Speak text aloud using neural TTS (respects user audio settings) |
| `tabz_list_voices` | "list voices", "TTS voices", "available voices" | List available neural TTS voices |
| `tabz_play_audio` | "play sound", "play audio", "soundboard", "notification sound" | Play audio file by URL (MP3, WAV, etc.) |
| `tabz_history_*` | "search history", "recent pages", "delete history" | Browser history tools (5 tools) |
| `tabz_sessions_*` | "recently closed", "restore tab", "other devices" | Session management tools (3 tools) |
| `tabz_cookies_*` | "get cookie", "set cookie", "audit cookies" | Cookie management tools (5 tools) |
| `tabz_emulate_*` | "mobile view", "slow network", "colorblind mode" | Device emulation tools (6 tools) |
| `tabz_notification_*` | "show notification", "progress bar", "clear notification" | Desktop notification tools (5 tools) |
| `tabz_list_profiles` | "list profiles", "terminal profiles", "available profiles" | List terminal profiles with optional category filter |
| `tabz_list_categories` | "list categories", "profile categories" | List all profile categories |
| `tabz_spawn_profile` | "spawn profile", "spawn terminal", "start profile" | Spawn a terminal using a saved profile |
| `tabz_get_profile` | "get profile", "show profile", "profile details" | Get details of a specific terminal profile |
| `tabz_create_profile` | "create profile", "new profile", "add profile" | Create a new terminal profile |
| `tabz_update_profile` | "update profile", "modify profile", "change profile" | Update an existing terminal profile |
| `tabz_delete_profile` | "delete profile", "remove profile" | Delete a terminal profile |
| `tabz_list_plugins` | "list plugins", "installed plugins" | List Claude Code plugins with status |
| `tabz_list_skills` | "list skills", "available skills", "find skill" | List skills from enabled plugins |
| `tabz_get_skill` | "get skill", "skill details", "show skill" | Get full SKILL.md content for a skill |
| `tabz_plugins_health` | "plugin health", "outdated plugins" | Check plugin versions and cache |
| `tabz_toggle_plugin` | "enable plugin", "disable plugin" | Toggle plugin enabled/disabled |
| `tabz_list_terminals` | "list terminals", "running terminals", "show workers" | List running terminals/workers |
| `tabz_send_keys` | "send keys", "send prompt", "type in terminal" | Send text/keys to a terminal with delay |
| `tabz_capture_terminal` | "capture terminal", "terminal output", "what's in terminal" | Capture recent output from terminal |

> **Note:** Most tools support a `tabId` parameter to target a specific tab. Get tab IDs from `tabz_list_tabs`.

Each MCP connection has an automatically managed browser group and cannot target another caller's or the user's tabs. Mutation results distinguish verified, mismatch, and unknown outcomes. Never replay an unknown mutation; reread safe state to reconcile when possible.

---

## Tool Categories

| Category | Tools |
|----------|-------|
| **Core & Interaction** | Tabs, clicks, forms, screenshots, console |
| **Browser Data** | Bookmarks, history, sessions, cookies |
| **Windows & Groups** | Tab groups, windows, displays, tiling |
| **Network & Downloads** | Network capture, file downloads, page save |
| **Advanced** | DOM inspection, emulation, notifications, audio |
| **Claude Integration** | Profiles, plugins, skills, terminals |

---

## Architecture

The full catalog currently publishes 97 tools, while the `page-agent` preset publishes 20. Browser operations travel through the backend to the extension. Some use ordinary Chrome extension APIs; debugger-backed actions, capture, and emulation use CDP through `chrome.debugger`. They do not require a remote debugging port.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTENSION-BASED ARCHITECTURE                     │
│   Preset-selected tools: tabs, screenshots, actions, network, etc.   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Chrome Browser                                                      │
│         │                                                            │
│         ↓ Chrome Extension APIs                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  TabzChrome Extension (Background Worker)                    │    │
│  │  - chrome.tabs, chrome.scripting, chrome.tabGroups           │    │
│  │  - chrome.downloads, chrome.bookmarks, chrome.debugger       │    │
│  │  - chrome.webRequest, chrome.windows, chrome.system.display  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ WebSocket                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Backend (localhost:8129)                                    │    │
│  │  - Routes browser requests to extension                      │    │
│  │  - Terminal management (tmux sessions)                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ HTTP                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tabz MCP Server (stdio or Streamable HTTP)                  │    │
│  │  - Tool handlers route requests through the backend          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ stdio                                     │
│                    Claude Code                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**
- Debugger-backed tools carry CDP through `chrome.debugger`; no `--remote-debugging-port` flag is needed
- MCP server runs via `run-wsl.sh` (WSL2) or `run.sh` (native)
- Tool handlers call the backend; the CLI uses the Streamable HTTP MCP transport
- Connection identity and automatic groups restrict browser operations to owned tabs

---

## Requirements

1. **Backend running:** `cd backend && npm start`
2. **Chrome extension loaded:** At `chrome://extensions`

## Platform Setup (Quick Reference)

| Platform | Script | Notes |
|----------|--------|-------|
| WSL2 | `run-wsl.sh` | Backend in WSL, Chrome on Windows |
| Native Linux/macOS | `run.sh` | Uses native node |
| Auto-detect | `run-auto.sh` | Recommended - detects platform |

**Project `.mcp.json`:**
```json
{
  "mcpServers": {
    "browser": {
      "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
      "args": [],
      "env": { "BACKEND_URL": "http://localhost:8129" }
    }
  }
}
```

See [WSL2_SETUP.md](WSL2_SETUP.md) for full platform-specific setup instructions.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect to backend" | Start backend: `cd backend && npm start` |
| "No logs captured" | Open Chrome tabs and interact with pages |
| "Request timed out" | Check Chrome is open with extension installed |
| Tools not showing | Restart Claude Code after updating `.mcp.json` |
| "No active page found" | Open a webpage (not chrome:// pages) |
| "Element not found" | Check selector matches an element on the page |
| Screenshots wrong location | Fixed! Paths auto-convert to WSL format (`/mnt/c/...`) |

### Quick Diagnostics

```bash
# Check backend is running
curl http://localhost:8129/api/health

# Check extension is connected (look for WebSocket clients)
curl http://localhost:8129/api/health | grep -o '"wsClients":[0-9]*'

# Verify the tabz MCP server is configured in Claude Code
claude mcp list
```

Tools are published through MCP `tools/list`. Clients may load schemas eagerly or use tool discovery; select a preset to control which tools the server publishes.

### Bounded capture additions

| Tool | Purpose |
| --- | --- |
| `tabz_enable_deep_capture` | Start bounded debugger response/stream capture for an owned readable tab |
| `tabz_disable_deep_capture` | Stop capture, clear its rows and release debugger ownership |
| `tabz_get_response_body` | Read a bounded page of a deep body or stream |

`tabz_act` supports inline screenshot/zoom results and optional post-action observation. Screenshot metadata identifies dimensions, MIME type, bytes and saved path. Observation failure does not replay a mutation. Protected login documents refuse screenshots and observation.
