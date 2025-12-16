# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 13, 2025
**Current Version**: 1.0.0
**Status**: Profile Organization Complete | Next: Power Tools

---

## Recently Completed (v2.7.0)

### ✅ Profile Categories with Colors - COMPLETE

- **Category Field** - Optional `category` field on profiles (e.g., "Claude Code", "TUI Tools")
- **Collapsible Groups** - Profiles grouped by category with expand/collapse
- **Color Palette** - 9 colors: Green, Blue, Purple, Orange, Red, Yellow, Cyan, Pink, Gray
- **Color Picker** - Click dots next to category header to set color
- **Colored Tabs** - Selected terminal tabs show category color (background, text, border)
- **Search Bar** - Filter profiles by name, command, or category
- **Autocomplete** - Category input suggests existing categories
- Files: `extension/components/SettingsModal.tsx`, `extension/sidepanel/sidepanel.tsx`

### ✅ Claude Status Shows Profile Name - COMPLETE

- **Profile Name in Ready State** - When Claude is idle, shows "✓ {ProfileName}" instead of "✓ Ready"
- **Easier Identification** - Matches audio announcements which use profile names
- Files: `extension/hooks/useClaudeStatus.ts`, `extension/sidepanel/sidepanel.tsx`

---

## Completed (v2.6.0)

### ✅ Auto-Voice Assignment - COMPLETE

- **Unique Voices per Session** - Each Claude session gets a different voice from pool of 10
- **Voice Pool** - Andrew, Emma, Sonia, Ryan, Natasha, William, Brian, Aria, Guy, Jenny
- **Round-Robin** - First session gets Andrew, second Emma, etc.
- **Profile Override Priority** - Profile settings take precedence over auto-assigned voice
- Files: `extension/sidepanel/sidepanel.tsx`

### ✅ Audio Settings UX Refactor - COMPLETE

- **Per-Profile Audio** - Moved audio settings into profile edit form (collapsible section)
- **Audio Mode** - "Use default" / "Enabled" / "Disabled" per profile
- **Voice/Rate Overrides** - Optional per-profile voice and speech rate
- **Header Mute Button** - 🔊/🔇 toggle for quick master mute
- **Renamed Tab** - "Audio" → "Claude Audio" for clarity
- Files: `extension/components/SettingsModal.tsx`, `extension/sidepanel/sidepanel.tsx`

---

## Completed (v2.5.0)

### ✅ Audio Notifications for Claude Status - COMPLETE

- **Chrome Audio Playback** - Neural TTS via edge-tts, played through Chrome (better than WSL audio)
- **Backend Endpoint** - `POST /api/audio/generate` generates and caches MP3s
- **Settings UI** - New "Claude Audio" tab with defaults (voice, rate, volume, events)
- **Named Announcements** - Says "Claude ready", "Claude 1 ready", "Claude 2 ready" based on tab name/order
- **Smart Detection** - Only plays when `processing/tool_use → awaiting_input` AND `subagent_count === 0`
- Files: `backend/server.js`, `extension/sidepanel/sidepanel.tsx`, `extension/components/SettingsModal.tsx`

### ✅ Profile Import/Export - COMPLETE

- **Export** - Download all profiles as `tabz-profiles-{date}.json` (includes audioOverrides)
- **Import** - Load profiles from JSON with validation, merge or replace options
- Files: `extension/components/SettingsModal.tsx`

### ✅ UX Improvements - COMPLETE

- **Keyboard Shortcuts Link** - Keyboard icon in header opens `chrome://extensions/shortcuts`
- **Fixed Alt+T Working Directory** - Now correctly uses header's global working directory (was using stale state)
- **Ctrl+Shift+9 Opens Sidebar** - Changed to `_execute_action` so keyboard shortcut actually works
- **Copy Session ID** - Right-click tab → "📋 Copy Session ID" for tmux conductor workflows
- Files: `extension/manifest.json`, `extension/background/background.ts`, `extension/sidepanel/sidepanel.tsx`

---

## Completed Work (Summary)

### Phase 1: Getting Ready to Share (v1.0-v2.0)

- **1.1 System Requirements** - Documented in README.md (Chrome 116+, Node 18+, tmux)
- **1.2 Codebase Cleanup** - Removed outdated docs, scripts, personal paths
- **1.3 Test Suite** - 172 tests passing; extension-specific tests planned post-release
- **1.4 README Polish** - Getting Started, features, installation docs complete; screenshots TODO

### Phase 2A-2B: MCP Foundation (v2.1-v2.3)

- **2.7 Cross-Platform Support** - Added `run.sh`, `run-wsl.sh`, `run-auto.sh` for Linux/Mac/WSL2
- **2.9 MCP Rebrand** - Renamed `browser-mcp-server` → `tabz-mcp-server`, tools `browser_*` → `tabz_*`
- **2.10 Settings Modal MCP Tab** - Individual tool toggles, token estimates, presets, allowed URLs config
- **2.11 Phase A+B** - Chrome permissions added, backend MCP config endpoint, dynamic tool loading, Settings UI complete

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

---

## Phase 2C: Power Tools (In Progress)

**Goal**: Implement Chrome API-based tools now that the settings infrastructure is in place.

### 2.1 Network Monitoring (CDP-based) ✅ COMPLETE

**Impact**: Capture and inspect all network requests (XHR, fetch, etc.) with full response bodies.

**Tools implemented:**
- [x] `tabz_enable_network_capture` - Enable network monitoring for current tab
- [x] `tabz_get_network_requests` - List captured requests with filtering (URL pattern, method, status, type)
- [x] `tabz_get_api_response` - Get full response body for a specific request
- [x] `tabz_clear_network_requests` - Clear captured requests

**Features:**
- CDP Network domain via puppeteer-core
- URL pattern filtering (regex or substring)
- Method, status code, resource type filters
- Pagination support (limit/offset)
- Auto-cleanup (5 min expiry, 500 request max)
- Response body caching with 100KB truncation
- Markdown and JSON output formats

### 2.2 `chrome.debugger` - Additional DevTools Tools (TODO)

**Impact**: Eliminates need for `--remote-debugging-port=9222`. Full CDP access from inside the extension.

**Tools to implement:**
- [ ] `tabz_profile_performance` - Profile page performance metrics
- [ ] `tabz_get_dom_tree` - Full DOM inspection
- [ ] `tabz_set_breakpoint` - Debug JavaScript issues
- [ ] `tabz_get_coverage` - Code coverage analysis

### 2.3 `chrome.downloads` - File Download Control ✅ COMPLETE

**Impact**: Download any file type, not just images. Essential for AI tool workflows.

**Tools implemented:**
- [x] `tabz_download_file` - Download any URL with optional filename, returns Windows + WSL paths
- [x] `tabz_get_downloads` - List recent downloads with status/progress
- [x] `tabz_cancel_download` - Cancel in-progress downloads

**Future enhancements:**
- [ ] `tabz_save_page` - Save page as HTML/MHTML
- [ ] `tabz_batch_download` - Download multiple files

**Use cases:** AI-generated images, PDFs, batch asset downloads

### 2.4 `chrome.webRequest` - Additional Network Tools (TODO)

**Impact**: WebSocket monitoring and auth debugging.

**Tools to implement:**
- [ ] `tabz_monitor_websockets` - Track WebSocket messages
- [ ] `tabz_capture_auth_flow` - Debug OAuth/auth issues

### 2.5 `chrome.cookies` - Authentication Debugging

**Tools to implement:**
- [ ] `tabz_check_auth` - Check if logged into a service
- [ ] `tabz_get_cookies` - Get all cookies for a domain
- [ ] `tabz_get_session` - Get specific session cookie

### 2.6 `chrome.history` - Research Assistant

**Tools to implement:**
- [ ] `tabz_search_history` - Search browsing history
- [ ] `tabz_get_research` - Gather pages visited for a topic
- [ ] `tabz_frequent_sites` - Get most visited sites

### 2.7 `chrome.bookmarks` - Knowledge Management

**Tools to implement:**
- [ ] `tabz_save_bookmark` - Bookmark current page
- [ ] `tabz_search_bookmarks` - Find saved resources
- [ ] `tabz_organize_bookmarks` - Auto-organize bookmarks
- [ ] `tabz_get_bookmark_tree` - Export bookmark structure

---

## Phase 2D: Public Release Cleanup

**Status**: Pre-release audit complete. See [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md) for full findings.

### ✅ Critical Issues - FIXED
- [x] Repository URL in package.json (was `tmux-chrome-sidebar`, now `TabzChrome`)
- [x] Package name corrected (`tabzchrome`)
- [x] Version sync (package.json, manifest.json → 2.7.0)
- [x] Personal paths genericized in CLAUDE.md
- [x] GitHub URL fixed in CLAUDE.md
- [x] Added `dist-extension/` to .gitignore
- [x] Created CONTRIBUTING.md

### High Priority - TODO
- [x] **Add screenshots** - Screenshots in `docs/pages/screenshots/`
- [x] **Remove debug console.logs** - Cleaned popup.tsx and sidepanel.tsx
- [x] **Update MCP tool count** - README/CLAUDE updated to 17 tools
- [ ] **Verify --dynamic-tool-discovery flag** - README claims this is a real Claude Code flag; may be inaccurate (API-level feature, not CLI flag)
- [ ] **Add Homebrew install note for macOS** - brew is not installed by default; add install instructions or note

### Medium Priority - TODO
- [x] **Add license to backend/package.json** - Added `"license": "MIT"`
- [x] **Review manifest permissions** - See docs/AUDIT_REPORT.md; unused permissions reserved for Phase 2C
- [ ] **Clean archived docs** - Personal paths remain in `docs/archived/*` files
- [x] **Document backend .env** - Added Backend Configuration section to README

### Low Priority - TODO
- [ ] Add homepage/bugs fields to backend/package.json
- [ ] Consider conditional debug mode for console.logs
- [ ] Archive outdated planning documents

---

## Phase 2E: Testing & Release

- [ ] **Cross-platform testing matrix**
  - [ ] Windows 11 + WSL2 + Chrome (current setup)
  - [ ] Native Ubuntu + Chrome
  - [ ] Native macOS + Chrome
  - [ ] Verify all MCP tools work on each platform

---

## Phase 3: Future Enhancements

### ✅ Detached Sessions Manager (Ghost Badge) - COMPLETE (v2.4.0)
Shows 👻 badge with count of orphaned tmux sessions. Click for reattach/kill options.

---

### GitHub FAB Enhancements
- ~~**Star Button** - Add ⭐ Star button to GitHub FAB~~ ✅ Done (clicks native star button)
- **Fork + Clone Combo** - Fork first, then clone user's fork (proper OSS contribution flow)

### Other Future Features
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
  [ ] Downloads
```

---

## Known Issues / Potential Bugs

### ✅ ResizeObserver Missing Buffer Clear Protection - FIXED (v1.1.3)

**Fixed in v1.1.3** - ResizeObserver now has same buffer-clearing protection as window resize handler.

- Checks both row delta (>2) and column delta (>5)
- Clears buffer and triggers resize trick for large dimension changes
- Handles bookmarks bar appearing/disappearing, Chrome toolbar changes

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For historical planning documents, see [docs/archived/](docs/archived/).
