# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 9, 2025
**Current Version**: 2.4.0
**Status**: Pre-release polish | Next: Profile Export + Audio Notifications

---

## Next Up: Pre-Release Features

### 1. Profile Import/Export

**Goal**: Let users backup, share, and restore their terminal profiles.

**UI Location**: Settings Modal → Profiles tab → Add Import/Export buttons

**Implementation:**

#### Export Profiles
```
[Export] button → Downloads profiles.json
```

1. Add "Export" button next to profile list header
2. On click: serialize profiles array to JSON
3. Trigger browser download of `tabz-profiles-{date}.json`
4. Include version number for future compatibility

**Export format:**
```json
{
  "version": 1,
  "exported": "2025-12-09T12:00:00Z",
  "profiles": [
    {
      "id": "bash",
      "name": "Bash",
      "workingDir": "",
      "command": "",
      "fontSize": 14,
      "fontFamily": "JetBrains Mono",
      "theme": "dracula"
    }
  ]
}
```

#### Import Profiles
```
[Import] button → File picker → Merge or Replace dialog
```

1. Add "Import" button next to Export
2. On click: open file picker (accept .json)
3. Parse and validate JSON structure
4. Show dialog: "Merge with existing" or "Replace all"
5. If merge: skip duplicates by ID, add new ones
6. Save to Chrome storage

**Files to modify:**
- `extension/components/SettingsModal.tsx` - Add buttons and logic
- No backend changes needed (Chrome storage only)

**Edge cases:**
- Invalid JSON → Show error toast
- Missing required fields → Skip invalid profiles with warning
- Duplicate IDs on merge → Keep existing, skip imported

---

### 2. Audio Notifications for Claude Status

**Goal**: Play sounds when Claude Code status changes (idle→working, working→idle, tool use).

**Current state tracking**: You have hooks that track Claude status via terminal output parsing.

**Options to explore:**

#### Option A: Chrome Extension Audio (Simplest)
```
Extension plays audio files when claudeStatuses changes
```

1. Add audio files to extension (`extension/sounds/`)
   - `ready.mp3` - Claude finished, ready for input
   - `working.mp3` - Claude started working (optional, might be annoying)
   - `tool.mp3` - Tool use detected (optional)

2. In sidepanel, watch `claudeStatuses` state changes
3. Use Web Audio API or `<audio>` element to play sounds
4. Add Settings toggle: "Enable audio notifications"
5. Optional: Per-sound toggles, volume slider

**Pros:** Simple, works offline, instant
**Cons:** Limited to bundled sounds

#### Option B: Backend Audio via PowerShell TTS (Windows)
```
Backend triggers PowerShell speech synthesis
```

1. Backend endpoint: `POST /api/audio/speak` with text
2. Calls PowerShell: `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('Claude is ready')`
3. Extension calls this endpoint on status change

**Pros:** Dynamic text, RTS advisor style ("Construction complete")
**Cons:** Windows only, slight latency, requires backend

#### Option C: Hybrid (Recommended?)
- Use Chrome extension audio for simple beeps/chimes
- Optional TTS for verbose announcements via backend

**Files to modify:**
- `extension/sounds/` - Add audio files
- `extension/sidepanel/sidepanel.tsx` - Add audio playback logic
- `extension/components/SettingsModal.tsx` - Add audio settings
- `extension/shared/storage.ts` - Persist audio preferences
- (Option B) `backend/routes/api.js` - TTS endpoint

**Settings UI mockup:**
```
Audio Notifications
  [x] Enable sounds
  [ ] Play sound when Claude starts working
  [x] Play sound when Claude is ready for input
  [ ] Play sound on tool use

  Volume: [====|----] 50%

  [ ] Use Windows TTS for announcements (experimental)
```

---

### Implementation Order

1. **Profile Export** (30 min) - Simple, high value for sharing
2. **Profile Import** (30 min) - Completes the feature
3. **Audio: Basic sounds** (1 hr) - Add files, playback logic, settings
4. **Audio: TTS** (optional) - If you want dynamic announcements

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

### 2.3 `chrome.downloads` - File Download Control (TODO)

**Impact**: Download any file type, not just images. Essential for AI tool workflows.

**Tools to implement:**
- [ ] `tabz_download_file` - Download any file with optional filename/path
- [ ] `tabz_get_downloads` - List recent downloads with status
- [ ] `tabz_monitor_download` - Track download progress
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

## Phase 2D: Testing & Release

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

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For historical planning documents, see [docs/archived/](docs/archived/).
