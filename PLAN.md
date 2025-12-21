# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 21, 2025
**Current Version**: 1.1.18

---

## Current Focus: MCP Tool Expansion

**Goal**: With dynamic tool discovery (`mcp-cli`), there's no context cost for having many tools. Expand MCP capabilities using Chrome Extension APIs.

### Priority 1: High Value, Easy to Implement

#### `chrome.cookies` - Authentication Debugging
**Permission**: `"cookies"` + host patterns

| Tool | Description | Status |
|------|-------------|--------|
| `tabz_get_cookies` | Get all cookies for a domain | Planned |
| `tabz_check_auth` | Check if logged into a service (has session cookie) | Planned |
| `tabz_clear_cookies` | Clear cookies for a domain (logout) | Planned |

#### `chrome.history` - Research Assistant
**Permission**: `"history"`

| Tool | Description | Status |
|------|-------------|--------|
| `tabz_search_history` | Search browsing history by text/date | Planned |
| `tabz_frequent_sites` | Get most visited sites | Planned |
| `tabz_delete_history` | Remove specific URLs from history | Planned |

#### `chrome.bookmarks` - Knowledge Management ✓
**Permission**: `"bookmarks"`

| Tool | Description | Status |
|------|-------------|--------|
| `tabz_save_bookmark` | Save URL to bookmarks (with folder support) | Done |
| `tabz_search_bookmarks` | Find bookmarks by title/URL | Done |
| `tabz_get_bookmark_tree` | Get full bookmark hierarchy | Done |
| `tabz_create_folder` | Create bookmark folder | Done |
| `tabz_move_bookmark` | Move bookmark to different folder | Done |
| `tabz_delete_bookmark` | Remove a bookmark | Done |

#### `chrome.downloads` - Page Saving
**Permission**: `"downloads"` (already have)

| Tool | Description | Status |
|------|-------------|--------|
| `tabz_save_page` | Save page as HTML/MHTML for offline analysis | Planned |

### Priority 2: Medium Value

#### `chrome.debugger` - DevTools Access
**Permission**: `"debugger"` (shows warning to user)
**Note**: Eliminates need for `--remote-debugging-port=9222`

| Tool | Description | Status |
|------|-------------|--------|
| `tabz_get_dom_tree` | Full DOM inspection | Planned |
| `tabz_profile_performance` | Profile page performance metrics | Planned |
| `tabz_get_coverage` | Code coverage analysis | Planned |

### Priority 3: Lower Value / Complex

| Tool | Description | Why Lower |
|------|-------------|-----------|
| `tabz_monitor_websockets` | Track WebSocket messages | Niche use case |
| `tabz_set_breakpoint` | Debug JavaScript | Complex, better in DevTools |
| `tabz_capture_auth_flow` | Debug OAuth flows | Complex setup |

---

## Documentation & Testing

### Documentation TODO
- [x] **Verify --dynamic-tool-discovery flag** - Fixed! Was inaccurate. Updated README to use `ENABLE_EXPERIMENTAL_MCP_CLI=true` env var instead
- [x] **Add Homebrew install note for macOS** - Handled in scripts/dev.sh which detects if brew is missing and shows https://brew.sh
- [ ] **Clean archived docs** - Personal paths remain in `docs/archived/*` files
- [ ] Add homepage/bugs fields to backend/package.json

### Testing TODO
- [ ] **Cross-platform testing matrix**
  - [ ] Windows 11 + WSL2 + Chrome (current setup)
  - [ ] Native Ubuntu + Chrome
  - [ ] Native macOS + Chrome
  - [ ] Verify all MCP tools work on each platform

---

## Conductor Agent Enhancements

**Status**: Mostly complete. Core infrastructure is working.

### Completed

- [x] **Context Window Monitoring** - Statusline writes to `/tmp/claude-code-state/{session}-context.json` with `context_pct`
- [x] **Sub-Agent Architecture** - All agents created:
  - `conductor.md` - Multi-session orchestrator (Opus)
  - `tabz-manager.md` - Browser automation specialist (Opus)
  - `watcher.md` - Worker health monitor (Haiku)
  - `skill-picker.md` - SkillsMP integration
  - `tui-expert.md` - TUI tool specialist
- [x] **Conductor reads state files** - Can check worker context % before assigning work
- [x] **Prompt tips in conductor.md** - @ file references, capability triggers documented

### Remaining

- [ ] Add `subagent_count` display to Tmuxplexer TUI
- [ ] Show context % in Tmuxplexer session list

---

## Future Enhancements

### Waiting on Chrome Updates

- [ ] **`sidePanel.close()` (Chrome 141+)** - Add "Close Terminal Sidebar" to context menu. Currently only `open()` exists and requires user gesture. [Chrome API docs](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### GitHub FAB
- **Fork + Clone Combo** - Fork first, then clone user's fork (proper OSS contribution flow)

### Other Features
- **Tab Context Menu** - Right-click for Rename, Close, Close Others
- **Chrome Web Store Publication** - Privacy policy, screenshots, version management

---

## Non-Goals

These are intentionally excluded from the Chrome extension:

- **Split terminals** - Sidebar is narrow, use tmux splits instead
- **Multi-window support** - Chrome has one sidebar per window by design
- **Complex theming UI** - 6 curated themes + dark/light toggle is enough
- **`chrome.windows` tools** - Multi-window workflows conflict with sidebar simplicity

---

## Technical Notes

### Terminal ID Prefixes
- `ctt-` prefix for all Chrome extension terminals
- Easy cleanup: `tmux ls | grep "^ctt-"`
- Distinguishes from web app terminals (`tt-`)

### State Management
- Chrome storage for UI state (profiles, settings, recent dirs)
- tmux for terminal persistence (processes survive backend restart)
- WebSocket for real-time terminal I/O

### Ports
- Backend: 8129 (WebSocket + REST API)

### MCP Settings Architecture
```
Chrome Extension     Backend (8129)      Tabz MCP Server
Settings Modal  -->  /api/mcp-config --> registerTools()
  [x] Core           mcp-config.json     based on config
  [x] Interaction
  [x] Downloads
```

---

## Adding New MCP Tools Checklist

When adding new MCP tools, update these files:

### Implementation (Required)
1. `extension/manifest.json` - Add Chrome permission (e.g., `"bookmarks"`, `"history"`)
2. `tabz-mcp-server/src/tools/<category>.ts` - Create tool file with Zod schemas
3. `tabz-mcp-server/src/types.ts` - Add TypeScript types
4. `tabz-mcp-server/src/client.ts` - Add HTTP client functions
5. `tabz-mcp-server/src/index.ts` - Import and register tool group
6. `backend/routes/browser.js` - Add REST endpoints
7. `backend/server.js` - Add WebSocket response handlers (e.g., `browser-bookmarks-tree-result`)
8. `extension/background/background.ts` - Add message handlers calling Chrome APIs

### Documentation (Required)
9. `extension/components/settings/types.ts` - Add to `MCP_TOOLS` array (sidebar settings)
10. `extension/dashboard/sections/McpPlayground.tsx` - Add to `MCP_TOOLS` array (dashboard)
11. `tabz-mcp-server/MCP_TOOLS.md` - Add to overview table + detailed documentation
12. `CHANGELOG.md` - Add version entry
13. `PLAN.md` - Update status from "Planned" to "Done"

### Version Sync
14. `package.json` - Bump version
15. `extension/manifest.json` - Bump version (must match package.json)
16. `PLAN.md` - Update "Current Version"

### Skill References (Optional but recommended)
17. `.claude/skills/tabz-guide/references/mcp-tools.md` - Update tool count + categories
18. `plugins/tabz-guide/skills/tabz-guide/references/mcp-tools.md` - Sync copy
19. `README.md` - Update tool count
20. `docs/pages/mcp-tools.html` - Update tool count + add table rows

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For pre-public development history (v2.0-v2.7), see [CHANGELOG-archive.md](CHANGELOG-archive.md).
