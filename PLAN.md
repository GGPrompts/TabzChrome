# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 16, 2025
**Current Version**: 1.1.8

---

## Current Focus: Power Tools (Phase 2C)

**Goal**: Implement Chrome API-based tools now that the settings infrastructure is in place.

### `chrome.debugger` - Additional DevTools Tools

**Impact**: Eliminates need for `--remote-debugging-port=9222`. Full CDP access from inside the extension.

**Tools to implement:**
- [ ] `tabz_profile_performance` - Profile page performance metrics
- [ ] `tabz_get_dom_tree` - Full DOM inspection
- [ ] `tabz_set_breakpoint` - Debug JavaScript issues
- [ ] `tabz_get_coverage` - Code coverage analysis

### `chrome.downloads` - Future Enhancements

- [ ] `tabz_save_page` - Save page as HTML/MHTML
- [ ] `tabz_batch_download` - Download multiple files

### `chrome.webRequest` - Additional Network Tools

**Impact**: WebSocket monitoring and auth debugging.

- [ ] `tabz_monitor_websockets` - Track WebSocket messages
- [ ] `tabz_capture_auth_flow` - Debug OAuth/auth issues

### `chrome.cookies` - Authentication Debugging

- [ ] `tabz_check_auth` - Check if logged into a service
- [ ] `tabz_get_cookies` - Get all cookies for a domain
- [ ] `tabz_get_session` - Get specific session cookie

### `chrome.history` - Research Assistant

- [ ] `tabz_search_history` - Search browsing history
- [ ] `tabz_get_research` - Gather pages visited for a topic
- [ ] `tabz_frequent_sites` - Get most visited sites

### `chrome.bookmarks` - Knowledge Management

- [ ] `tabz_save_bookmark` - Bookmark current page
- [ ] `tabz_search_bookmarks` - Find saved resources
- [ ] `tabz_organize_bookmarks` - Auto-organize bookmarks
- [ ] `tabz_get_bookmark_tree` - Export bookmark structure

---

## Documentation & Testing (Phase 2D/2E)

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

**Goal**: Make the conductor smarter about worker health and prompt quality.

### Context Window Monitoring

Currently, hooks don't receive context window data - only the statusline does via `current_usage`.

**Proposed solution**: Statusline writes context info to state files:
```bash
# In statusline.sh, write context to shared state dir
STATE_FILE="/tmp/claude-code-state/${SESSION_ID}-context.json"
echo '{"context_percent": '$percent', "tokens": '$current_tokens'}' > "$STATE_FILE"
```

Then conductor can check before assigning work:
```bash
context=$(jq '.context_percent' /tmp/claude-code-state/${WORKER}-context.json)
if [ "$context" -gt 80 ]; then
    echo "Worker at ${context}% - spawn fresh worker instead"
fi
```

**Tasks:**
- [ ] Update statusline.sh to write context info to `/tmp/claude-code-state/`
- [ ] Update Tmuxplexer's `claude_state.go` to read `context_percent`
- [ ] Add "Worker Health Monitoring" section to conductor.md
- [ ] Document context hygiene best practices

### Prompt Enhancement Tips (from /pmux)

Add tips to conductor.md for better prompts:
- [ ] **@ file references** - "Use `@filepath` to give workers context"
- [ ] **Capability triggers** - "Add `ultrathink` for complex architectural tasks"
- [ ] **Soften "one task per worker"** → "one goal per worker (they can use subagents)"

### Tmuxplexer Integration

- [ ] Conductor reads `/tmp/claude-code-state/` for worker status (already works)
- [ ] Add `subagent_count` display to Tmuxplexer TUI
- [ ] Show context % in Tmuxplexer session list (once statusline writes it)

### Sub-Agent Architecture

The conductor currently handles too many responsibilities. Split into specialized sub-agents:

| Agent | Model | Role |
|-------|-------|------|
| **Conductor** | Opus | Orchestrator - decides what needs doing, delegates to specialists |
| **Tabz Manager** | Sonnet | Browser control (screenshots, clicks, forms, page inspection) |
| **Watcher** | Haiku | Cheap polling of worker status/context, alerts when stuck/full/done |

**Watcher agent** (Haiku) - ideal for monitoring because it's fast/cheap:
```yaml
name: watcher
model: haiku
description: Monitor Claude worker sessions - check progress, context usage, completion status
```

Responsibilities:
- Periodic `tmux capture-pane` to check worker output
- Read `/tmp/claude-code-state/*.json` for status and context %
- Alert conductor when: worker done, worker stuck, context > 80%, errors detected
- Return structured status reports for conductor to act on

**Tasks:**
- [ ] Create `agents/watcher.md` - Haiku-based session monitor
- [ ] Create `agents/tabz-manager.md` - Browser automation specialist
- [ ] Slim down conductor to pure orchestration (spawn, delegate, cleanup)
- [ ] Add watcher invocation pattern to conductor docs

---

## Future Enhancements (Phase 3)

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

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For pre-public development history (v2.0-v2.7), see [CHANGELOG-archive.md](CHANGELOG-archive.md).
