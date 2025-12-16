# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 16, 2025
**Current Version**: 1.1.6

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
- [ ] **Verify --dynamic-tool-discovery flag** - README claims this is a real Claude Code flag; may be inaccurate (API-level feature, not CLI flag)
- [ ] **Add Homebrew install note for macOS** - brew is not installed by default
- [ ] **Clean archived docs** - Personal paths remain in `docs/archived/*` files
- [ ] Add homepage/bugs fields to backend/package.json

### Testing TODO
- [ ] **Cross-platform testing matrix**
  - [ ] Windows 11 + WSL2 + Chrome (current setup)
  - [ ] Native Ubuntu + Chrome
  - [ ] Native macOS + Chrome
  - [ ] Verify all MCP tools work on each platform

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
