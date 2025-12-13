<!--
CHANGELOG ROTATION POLICY:
When this file exceeds 500 lines, move older versions to CHANGELOG-archive.md.
Keep the most recent 3-4 major versions in the main file.
-->

# Changelog

All notable changes to Tabz - Chrome Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For older versions (2.5.0 and earlier), see [CHANGELOG-archive.md](CHANGELOG-archive.md).

---

## [Unreleased]

### Fixed

#### Terminal Corruption During Refresh While Working
- **Fixed copy mode and corruption when refreshing sidebar during active Claude output** - Three-part fix:
  - Disabled tmux `client-attached` and `after-select-pane` hooks that sent `refresh-client` during reconnection (escape sequences arrived before xterm.js was ready)
  - Added 1000ms output guard to buffer initial output flood during reconnection
  - Added forced resize trick after guard lifts (sends SIGWINCH to exit copy mode and fix scroll regions)
- **Root cause**: When page refreshed during active output, partial escape sequences were misinterpreted as tmux commands (entering copy mode) or corrupted scroll regions
- **Why manual resize fixed it**: Resizing the sidebar sent SIGWINCH which forced tmux to redraw - now done automatically after init
- **Also added**: Consistent status bar styling (dark gray) to project tmux config

#### Ghost Badge Instant Updates
- **Ghost badge now updates immediately** on terminal spawn/close/detach instead of waiting for 30-second poll
- Added `refreshOrphaned()` call in WebSocket message handler for `terminal-spawned` and `terminal-closed` events
- Added direct refresh after detach action in context menu

#### Tmux Config Consistency
- **dev.sh now loads xterm.js-optimized tmux config** - Added `-f` flag and `source-file` command to ensure `.tmux-terminal-tabs.conf` is always applied, even if tmux server was started from Windows Terminal with different settings
- **pty-handler.js now forces config reload** - Added `tmux source-file` after session creation to ensure xterm.js settings apply even when tmux server was started elsewhere
- **Fixed "can't find window: 0" error** - Removed hardcoded `:0` window index in `tmux-session-manager.js` that failed when `base-index 1` is set; now uses session name without window index (works with any base-index)

---

## [2.7.4] - 2025-12-12

### Security Fixes (Pre-Release Audit)

#### CRITICAL - Backend Security
- **Fixed command injection in edge-tts** (`server.js`) - Replaced shell interpolation with `execFile()` and added input validation for voice/rate parameters
- **Added WebSocket authentication** (`server.js`, `background.ts`) - Token-based auth with 64-char random token written to `/tmp/tabz-auth-token` (mode 0600); extension auto-fetches token from `/api/auth/token` before connecting
- **Added path traversal protection** (`pty-handler.js`) - Validates working directory is within `$HOME` or `/tmp`

#### CRITICAL - Extension Security
- **Removed dangerous eval()** (`background.ts`) - Replaced arbitrary code execution with safe predefined operations for MCP execute_script
- **Restricted host_permissions** (`manifest.json`) - Changed from `<all_urls>` to specific domains: localhost:8129, github.com, gitlab.com
- **Restricted externally_connectable** (`manifest.json`) - Limited from `localhost:*/*` to `localhost:8129/*` only
- **Removed unused permissions** (`manifest.json`) - Removed cookies, history, bookmarks (were reserved but unused)

#### Accessibility (WCAG)
- **Added ARIA labels** - 30+ accessibility fixes across sidepanel.tsx, SettingsModal.tsx, ProfileDropdown.tsx, WorkingDirDropdown.tsx, GhostBadgeDropdown.tsx
- **Added semantic roles** - dialog, menu, menuitem, listbox, option, tablist, tab, tabpanel
- **Added aria-expanded/aria-selected** - Proper state indicators for interactive elements

#### Production Infrastructure
- **Enhanced health check endpoint** (`GET /api/health`) - Now returns human-readable memory sizes (MB), proper package version, timestamps
- **Added PM2 ecosystem config** (`ecosystem.config.js`) - Production-ready process management with logging, graceful shutdown, auto-restart
- **Created logs directory** - `backend/logs/` for PM2 log output with .gitignore

#### Tests & Maintenance
- **Fixed test failures** - Updated fetch mock in setup.ts, fixed assertions in useProfiles.test.ts and useWorkingDirectory.test.ts
- **CHANGELOG rotation** - Moved v1.0.0-2.5.0 to CHANGELOG-archive.md (743→218 lines)
- **Version sync** - Aligned package.json, manifest.json to 2.7.4

### New Features

#### Local Dashboard (localhost:8129)
- **Modular dashboard structure** - New multi-page dashboard at `http://localhost:8129`
- **Dashboard home** (`index.html`) - Quick stats, active terminals, working directory selector
- **Terminals page** (`terminals.html`) - Full terminal list with kill/reattach, orphan management
- **Shared CSS/JS** - `css/dashboard.css` (dark theme) and `js/dashboard.js` (WebSocket, API helpers)
- **Updated AI Launcher** - Now includes nav bar consistent with other dashboard pages
- **Dashboard button in sidebar** - New grid icon in header opens dashboard in browser tab

#### Working Directory Sync API
- **New `/api/settings/working-dir` endpoint** - GET/POST for working directory settings
- **Extension to Dashboard sync** - Working directory and recent dirs shared between extension and dashboard
- **Persisted to disk** - Settings stored in `backend/.settings.json`

### Bug Fixes

#### Tab Name Bug (API Spawn)
- **Fixed profile matching** - Terminals spawned via API now keep their custom names
- **Root cause**: Profile matching used `startsWith()` which incorrectly matched "Claude & TFE" to any "Claude: ..." terminal
- **Fix**: Changed to exact match with full sanitized name extraction from terminal ID

#### Dashboard z-index
- **Fixed dropdown z-index** - Working directory dropdown no longer appears behind other cards
- **Added `.card-with-dropdown` class** - Ensures proper stacking context

Files changed:
- `backend/routes/api.js` - Added settings API endpoints
- `backend/public/index.html` - New dashboard home page
- `backend/public/terminals.html` - New terminals management page
- `backend/public/css/dashboard.css` - Shared dashboard styles
- `backend/public/js/dashboard.js` - Shared WebSocket/API helpers
- `backend/public/launcher.html` - Updated with nav header
- `extension/hooks/useWorkingDirectory.ts` - Syncs with backend API
- `extension/hooks/useTerminalSessions.ts` - Fixed profile matching
- `extension/sidepanel/sidepanel.tsx` - Added dashboard button

---

## [2.7.3] - 2025-12-12

### Enhancements

#### AI Image Download Support
- **`tabz_download_image` now works with ChatGPT/Copilot** - Automatically extracts full CDN URLs with auth tokens
- **URL extraction from page** - Uses `tabz_execute_script` to get the actual `src` attribute (not just selector matching)
- **Direct download for HTTPS URLs** - Routes through `downloadFile` for reliable downloads
- **Extension-based capture fallback** - Added `browser-capture-image` handler for future blob URL support

**Recommended selectors for AI platforms:**
- ChatGPT: `img[src*='oaiusercontent.com']`
- General: `img[src*='cdn']`

Files changed:
- `extension/background/background.ts` - Added `handleBrowserCaptureImage()` handler
- `backend/routes/browser.js` - Added `/api/browser/capture-image` route
- `backend/server.js` - Added `browser-capture-image-result` WebSocket handler
- `tabz-mcp-server/src/client.ts` - Rewrote `downloadImage()` to extract URLs and use direct download
- `tabz-mcp-server/MCP_TOOLS.md` - Updated documentation with AI image examples

### Bug Fixes

#### GitHub FAB Star Button
- **Fixed Star button selector** - Changed from `form.unstarred` to `form[action$="/star"]`
- **Added "already starred" detection** - FAB now shows feedback when repo is already starred

#### UI Polish
- **Default font changed to JetBrains Mono NF** - Better ligatures and icon support
- **Suppressed sidePanel.open() error logs** - Cleaner console output

---

## [2.7.2] - 2025-12-11

### Bug Fixes

#### Terminal Corruption During WebSocket Reconnect
- **Extended output quiet period** - Increased from 150ms to 500ms to prevent resize during active Claude streaming
- **Increased max deferrals** - From 5 to 10 (up to 5 seconds of waiting for output to quiet)
- **Staggered REFRESH_TERMINALS** - Random 50-550ms delay per terminal prevents simultaneous redraws
- **Skip refresh during active output** - If output happened <100ms ago, skip the refresh entirely
- **Removed send-keys from resize path** - `tmux send-keys ''` on first resize was redundant (SIGWINCH already triggers redraw) and could cause corruption during active output

Root cause: When WebSocket reconnects, REFRESH_TERMINALS triggered `triggerResizeTrick()` on ALL terminals simultaneously. Each resize sends SIGWINCH to tmux, which redraws the screen. During active Claude output, these redraws interleaved with streaming content, causing the same lines to appear repeated many times.

Files changed:
- `extension/components/Terminal.tsx` - Output-aware deferral, staggered refresh
- `backend/server.js` - Removed send-keys from resize handler

---

## [2.7.1] - 2025-12-11

### Bug Fixes

#### Terminal Redraw Storm Fix
- **Fixed terminal corruption** - Same line appearing repeated many times (20x, 57x, etc.)
- **Root cause**: Multiple `triggerResizeTrick()` calls in rapid succession caused tmux to redraw screen content many times
- **REFRESH_TERMINALS deduplication** - Now sent once (500ms) instead of twice (200ms + 700ms)
- **Removed redundant refresh-client** - PTY resize already sends SIGWINCH, extra refresh-client was unnecessary
- **Added debounce to triggerResizeTrick** - 500ms minimum between calls prevents redraw storms
- **Removed duplicate post-connection refresh** - Terminal.tsx no longer calls triggerResizeTrick at 1200ms (handled by REFRESH_TERMINALS)

Files changed:
- `extension/hooks/useTerminalSessions.ts` - Single REFRESH_TERMINALS at 500ms
- `extension/components/Terminal.tsx` - Debounce triggerResizeTrick, removed redundant call
- `backend/modules/pty-handler.js` - Removed refresh-client after resize

---

## [2.7.0] - 2025-12-09

### Major Features

#### Profile Categories with Color-Coded Tabs
- **Category Field** - Optional category for each profile (e.g., "Claude Code", "TUI Tools", "Gemini")
- **Collapsible Groups** - Profiles grouped by category with expand/collapse headers
- **9-Color Palette** - Green, Blue, Purple, Orange, Red, Yellow, Cyan, Pink, Gray
- **Inline Color Picker** - Click color dots next to category header to change color
- **Color-Coded Tabs** - Selected terminal tabs show category color (background tint, text, border)
- **Search Bar** - Filter profiles by name, command, or category
- **Autocomplete** - Category input suggests existing categories from other profiles
- **Category Settings Persistence** - Colors and collapsed state saved to Chrome storage
- Files: `extension/components/SettingsModal.tsx`, `extension/sidepanel/sidepanel.tsx`

#### Claude Status Shows Profile Name
- **Profile Name in Ready State** - When Claude is idle, shows "Ready Claude Worker" instead of "Ready"
- **Easier Multi-Claude Identification** - Visual status now matches audio announcements
- Files: `extension/hooks/useClaudeStatus.ts`, `extension/sidepanel/sidepanel.tsx`

### Technical Details

- **New Types** - `CategorySettings` interface, `CATEGORY_COLORS` palette constant
- **Real-time Updates** - Category color changes broadcast via CustomEvent to update tabs immediately
- **Profile Schema** - Added optional `category?: string` field to Profile interface

---

## [2.6.0] - 2025-12-09

### Major Features

#### Auto-Voice Assignment for Claude Sessions
- **Unique Voices per Session** - Each Claude session automatically gets a different voice from a pool of 10
- **Voice Pool** - Andrew, Emma, Sonia, Ryan, Natasha, William, Brian, Aria, Guy, Jenny (US/UK/AU accents)
- **Round-Robin Assignment** - First session gets Andrew, second gets Emma, etc.
- **Profile Override Priority** - Profile voice settings still take precedence over auto-assigned voice
- **Tell Sessions Apart by Ear** - Hear "Sonia ready" vs "Andrew ready" to know which Claude finished
- Files: `extension/sidepanel/sidepanel.tsx`

#### Audio Settings UX Refactor
- **Per-Profile Audio Settings** - Moved audio configuration from Audio tab into each profile's edit form
- **Audio Mode Dropdown** - Three options per profile:
  - "Use default" - Follows header toggle and global defaults
  - "Enabled" - Always plays (respects master mute)
  - "Disabled" - Never plays, even when header audio is on
- **Voice/Rate Overrides** - Optional per-profile voice and speech rate settings
- **Simplified Audio Tab** - Renamed to "Claude Audio", now only shows global defaults (voice, rate, volume, events)
- **Removed Profile Overrides Section** - No longer needed since settings are in profiles
- Files: `extension/components/SettingsModal.tsx`, `extension/sidepanel/sidepanel.tsx`

#### Header Mute Button
- **Quick Mute Toggle** - Speaker icon in header between keyboard and settings icons
- **Master Mute** - One click to silence all audio notifications
- **Visual Feedback** - Green when active, gray when muted or disabled
- **Persisted State** - Mute preference saved to Chrome storage
- Files: `extension/sidepanel/sidepanel.tsx`

### Bug Fixes

- **Tab switching flash** - Removed scheduleTmuxRefresh workaround that caused terminals to flash when switching tabs (actual fix was moving tmux status bar to top)

---

## Cleanup Commands

**Kill orphaned Chrome extension terminal sessions:**
```bash
# List all ctt- sessions
tmux ls | grep "^ctt-"

# Kill all ctt- sessions
tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

**Kill orphaned web app terminal sessions:**
```bash
# List all tt- sessions (web app)
tmux ls | grep "^tt-"

# Kill all tt- sessions
tmux list-sessions | grep "^tt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

---

**Repository**: https://github.com/GGPrompts/terminal-tabs-extension
**Backend**: Shared with https://github.com/GGPrompts/terminal-tabs
**License**: MIT
