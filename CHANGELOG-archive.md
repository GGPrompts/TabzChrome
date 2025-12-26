# Changelog Archive

This file contains older changelog entries. See [CHANGELOG.md](CHANGELOG.md) for recent changes (1.2.x).

**Contents:**
- [Public Versions (Archived)](#public-versions-archived): 1.1.x, 1.0.x
- [Pre-Public Development History](#pre-public-development-history): 2.7.x - 1.0.0 (development versions before public release)

---

# Public Versions (Archived)

These are older public releases that have been archived to keep the main changelog manageable.

---

## [1.1.20] - 2025-12-21

### Added
- **Audio priority system** - High-priority audio (summaries, handoffs) now blocks low-priority status updates:
  - `/ctthandoff` and `/page-reader:read-page` play at high priority
  - Claude status updates (tools, ready) are skipped while high-priority audio plays
  - Prevents status announcements from interrupting spoken summaries
- **page-reader plugin** - New `/page-reader:read-page` command captures current page, summarizes key points, and reads aloud via TTS
- **User settings for speak endpoint** - `/api/audio/speak` now respects user's configured voice, rate, and pitch from Settings modal
- **Chipmunk voice for subagents** - Subagent announcements use +50Hz pitch so you can distinguish them by ear

### Fixed
- **MCP tab targeting** - Fixed bug where MCP tools could operate on wrong tab if user switched tabs in Chrome. Now refreshes active tab state before CDP operations
- **Ghost badge route order** - Fixed routing bug that could cause issues with kill/reattach actions
- **Ghost badge feedback** - Improved visual feedback for kill and reattach operations
- **Context alert pitch** - Reduced pitch elevation for context warnings (was too chipmunk-y):
  - 50% warning: now +15Hz pitch, +5% rate (was +30Hz, +10%)
  - 75% critical: now +25Hz pitch, +10% rate (was +50Hz, +20%)

---

## [1.1.18] - 2025-12-21

### Added
- **Bookmark MCP tools** - 6 new tools for Chrome bookmark management:
  - `tabz_get_bookmark_tree` - Get bookmark folder hierarchy
  - `tabz_search_bookmarks` - Find bookmarks by title/URL
  - `tabz_save_bookmark` - Save URLs to bookmarks (with folder support)
  - `tabz_create_folder` - Create bookmark folders
  - `tabz_move_bookmark` - Move bookmarks between folders
  - `tabz_delete_bookmark` - Remove bookmarks or folders
- **skillsmp.com** - Added to default URL allowlist for `tabz_open_url`
- **TTS pitch control** - New pitch parameter for audio notifications:
  - Adjustable from -20Hz (lower) to +50Hz (higher/urgent)
  - Settings slider in Audio tab
  - Context alerts auto-elevate pitch for urgency (+20Hz at 50%, +40Hz at 75%)
  - Backend API endpoints now accept `pitch` parameter

---

## [1.1.17] - 2025-12-21

### Improved
- **View as Text** - Enhanced terminal capture viewer:
  - Auto-scrolls to bottom on open (shows most recent output first)
  - Added Refresh button to re-fetch terminal content without closing

---

## [1.1.16] - 2025-12-21

### Added
- **tabz-guide plugin** - Progressive disclosure help system for TabzChrome:
  - On-demand guidance for profiles, MCP tools, API, debugging, integration
  - Brief answers with links to detailed documentation
  - Install with `/plugin install tabz-chrome:tabz-guide`
- **tui-expert agent** - Spawn and control TUI tools (btop, lazygit, lnav) via tmux
- **terminal-tools skill** - Structured patterns for TUI tool interaction

### Fixed
- **State-tracker hooks** - Plugin now properly references `hooks.json` file instead of inline config
- **State-tracker robustness** - Prevents script exit on corrupted JSON files, uses atomic writes
- **3D Focus settings sync** - WebGL/Canvas toggle now syncs with sidebar settings

### Changed
- **tui-expert model** - Upgraded from haiku to opus for better reasoning
- **README plugin docs** - Fixed broken links, added complete plugin table with correct paths

---

## [1.1.15] - 2025-12-20

### Added
- **Context window percentage on tabs** - Claude terminal tabs now display context usage:
  - Shows percentage on far right of tab (e.g., "62%")
  - Color-coded to match statusline thresholds: green (<50%), yellow (50-74%), red (75%+)
  - Tooltip includes context percentage
  - Persists even when Claude is idle
- **Audio alerts for context thresholds** - New notification events in Settings → Audio:
  - **Context warning** - Announces when context reaches 50%
  - **Context critical** - Announces when context reaches 75%
  - Uses hysteresis to only announce once per threshold crossing

### Fixed
- **State-tracker preserves claude_session_id** - Fixed race condition where state-tracker would overwrite the `claude_session_id` field set by statusline, causing context percentage to disappear from tabs
- **WebGL renderer now shows diffs and box-drawing correctly** - Changed WebGL background from semi-transparent to fully opaque. All themes now use solid `black` colors matching their gradient starts instead of transparent. High-contrast dark uses pure `#000000` for maximum contrast.
- **Detach now announces "detached" instead of "closed"** - Fixed race condition where audio announcement fired before detach flag was set
- **Reattached terminals restore original profile name** - When recovering terminals from ghost badge, the matched profile's name (including emoji) is now restored instead of showing just the sanitized name

### Documentation
- Added statusline example to state-tracker plugin (`examples/statusline-with-context.sh`)
- Added setup guide for context window display (`examples/README.md`)

---

## [1.1.14] - 2025-12-20

### Added
- **3D Focus Mode** - Immersive terminal experience in a dedicated browser tab:
  - Right-click any terminal tab → "🧊 Open in 3D Focus"
  - Terminal floats in 3D space with starfield background
  - **Controls:** Scroll to zoom (1.5x-25x), mouse to orbit, F2 to lock camera, Esc to unfocus terminal
  - Preserves terminal's theme, font size, and font family from profile
  - Auto-returns to sidebar when 3D tab closes or extension reloads

### Fixed
- **Stale 3D focus state** - Terminals no longer get stuck showing "Viewing in 3D" after extension reload

---

## [1.1.13] - 2025-12-19

### Added
- **View as Text** - New feature to capture terminal output as selectable, copyable text:
  - Right-click any terminal tab → "📄 View as Text"
  - Dashboard Terminals page: Eye icon next to each terminal
  - Opens in dashboard with full scrollback (no truncation)
  - **Copy All** button for clipboard
  - **Save as Markdown** exports with metadata (timestamp, working directory, git branch)

### Fixed
- **Terminal resize comments** - Corrected code comments to accurately describe the resize trick as "rows-1, then fit" (not cols).

---

## [1.1.12] - 2025-12-18

### Fixed
- **State-tracker plugin SubagentStop hook** - Added missing `SubagentStop` hook to `hooks/hooks.json`. Previously only defined in `plugin.json`, causing subagent counts to never decrement when Task agents completed. This resulted in persistent robot emoji indicators in the statusline and terminal tabs.

---

## [1.1.11] - 2025-12-18

### Fixed
- **Dashboard profile drag-drop** - Fixed profiles not being draggable in grid/list view. Nested button elements were capturing mouse events; restructured to use pointer-events-none on content areas.
- **Cross-category drag-drop** - Profiles can now be dragged between categories. When dropped into a different category, the profile's category is automatically updated.
- **Drop indicators visibility** - Changed drop indicator color from theme variable to explicit green (#22c55e) for better visibility.

### Changed
- **MCP Inspector buttons** - Split into "Start Server" and "Open Inspector" buttons. This allows opening the inspector in the current Chrome browser instead of the system default browser.

---

## [1.1.10] - 2025-12-18

### Added
- **Dashboard Profiles drag-drop reordering** - Drag profiles to reorder within/across categories, drag category headers to reorder categories. Visual drop indicators for grid (left/right) and list (above/below) views.
- **Dashboard Profiles theme gradients** - Profile cards now display their theme's background gradient, making it easy to visually distinguish profiles.
- **Dashboard Profiles default indicator** - Star badge shows which profile is the default (used by Spawn API when no profile specified).
- **Dashboard Profiles auto-sync** - Profile cards update automatically when you change settings in the sidebar (no refresh needed).
- **MCP Inspector launcher** - New button in dashboard MCP Settings and sidebar MCP tab to launch the official MCP Inspector for interactive tool testing at localhost:6274.

### Changed
- Renamed "MCP Playground" to "MCP Settings" in dashboard navigation (better reflects its purpose as a configuration page).

### Fixed
- Dashboard GitHub link now points to correct repository (GGPrompts/TabzChrome).

---

## [1.1.9] - 2025-12-18

### Added
- **WebGL/Canvas renderer toggle** - New setting to switch between WebGL (crispest text, GPU-accelerated) and Canvas (universal compatibility) renderers. WebGL provides sharper text rendering but requires dark mode due to transparency limitations.

### Technical
- WebGL renderer automatically uses 50% background opacity for compatibility with gradient backgrounds
- Canvas renderer uses fully transparent backgrounds for maximum gradient visibility
- Light mode is disabled when WebGL is enabled (WebGL has rendering issues with transparent backgrounds in light mode)
- Added 150ms delay before reload when toggling renderer to ensure Chrome storage propagates

---

## [1.1.8] - 2025-12-17

### Added
- **Plugin system restructure** - Plugins are now individually toggleable via `~/.claude/settings.json`. Enable with `"state-tracker@tabz-chrome": true`
- **State-tracker as installable plugin** - Audio notifications and status tracking now available as a separate plugin that can be installed from the TabzChrome repository
- **Dependency checks in `dev.sh`** - Script now checks for required (Node.js, npm, tmux) and optional (edge-tts, Nerd Fonts) dependencies with platform-specific install instructions
- **Port cleanup in dev.sh** - Automatically kills processes on port 8129 when restarting backend
- **Cross-platform support** - macOS users get Homebrew commands if available, otherwise direct download links

### Fixed
- **Fixed double audio notifications** - Audio no longer plays twice when Claude finishes a task
- **Fixed audio not playing on first terminal spawn** - Audio settings now load before first session announcement
- **Fixed state tracker permission_prompt handling** - Permission prompts no longer incorrectly change Claude's status
- **Fixed state tracker subagent completion** - Status correctly returns to `awaiting_input` when all subagents finish
- **Fixed TTS audio 500 errors** - Updated edge-tts CLI arguments for v7.x (`--rate` instead of `-r`, `--write-media` instead of `-o`)
- **Fixed /rebuild command** - Auto-detects Windows username instead of hardcoding

### Documentation
- Fixed incorrect `--dynamic-tool-discovery` flag → use `ENABLE_EXPERIMENTAL_MCP_CLI=true` env var
- Added edge-tts v6.0+ to requirements table in README
- Improved onboarding docs for cross-platform users

---

## [1.1.7] - 2025-12-16

### Fixed
- **Context menu "Open Terminal Sidebar" now works** - Fixed the context menu action that was silently failing to open the sidebar
- **Persist selected terminal tab across sidebar refresh** - The active terminal tab selection is now saved and restored when the sidebar is refreshed or reopened

---

## [1.1.6] - 2025-12-16

### Added
- **`tabId` parameter for parallel tab operations** - `tabz_screenshot`, `tabz_screenshot_full`, `tabz_click`, and `tabz_fill` now accept an optional `tabId` parameter to target specific tabs without switching. Enables multi-agent workflows where Claude can operate on multiple browser tabs simultaneously.

---

## [1.1.5] - 2025-12-16

### Fixed
- **Fixed MCP tools targeting wrong browser tab** - Screenshots, clicks, and other MCP operations now correctly target the user's actual focused tab instead of always defaulting to the first tab. The fix stores the tab URL alongside the Chrome tab ID and matches CDP pages by URL.

---

## [1.1.4] - 2025-12-16

### Fixed
- **Fixed terminal corruption when bookmarks bar appears/disappears** - Changed resize trick to shrink by row instead of column, preventing tmux status bar from wrapping during resize. Also added buffer-clearing protection for row delta changes in ResizeObserver
- **Fixed dev.sh version check showing wrong direction** - Version comparison now correctly checks if remote is newer than local (was showing "update available 1.1.3 → 1.1.1")

---

## [1.1.2] - 2025-12-16

### Fixed

#### Terminal Resize Stability
- **Fixed terminal corruption when resizing sidebar** - Clearing xterm buffer before large dimension changes (>5 columns) prevents reflow algorithm from corrupting complex ANSI sequences (Claude Code statusline, colored diffs)
- **Fixed isWrapped crash** - Protected all `clear()` calls with resize lock to prevent "Cannot set properties of undefined (setting 'isWrapped')" error during concurrent writes
- **Fixed blank screen after sidebar refresh** - Improved resize trick timing ensures tmux redraws content correctly after page refresh

These fixes significantly improve stability when:
- Resizing Chrome sidebar while Claude Code is outputting
- Refreshing the sidebar during active terminal sessions
- Switching between tabs during heavy terminal output

---

## [1.1.1] - 2025-12-15

### Fixed
- **Remove personal data from git** - `backend/.settings.json` and `mcp-config.json` now gitignored
- **Safe MCP defaults** - YOLO mode (allowAllUrls) now OFF by default, minimal tools enabled
- **Safe working directory defaults** - Recent dirs defaults to `['~']` only, no hardcoded paths
- **Console spam removed** - Debug logging removed from audio and Claude status hooks

---

## [1.1.0] - 2025-12-15

### Changed

#### Default Font Changed to Monospace
- **Default font is now `monospace`** instead of `JetBrains Mono NF` - Works out of the box on all systems without installing fonts
- **Fixes character spacing issues** on systems without Nerd Fonts installed

### Added

#### Bundled Nerd Fonts
- **`fonts/` folder** with pre-bundled Nerd Fonts (16MB total):
  - JetBrains Mono NF (Regular + Bold)
  - Fira Code NF (Regular + Bold)
  - Caskaydia Cove NF (Regular + Bold)
- **Simple install instructions** in `fonts/README.md` for Windows, macOS, and Linux

#### Platform-Aware Font List
- **Font dropdown now filters by platform** - Windows-only fonts (Consolas, Cascadia Code/Mono) hidden on macOS/Linux
- **Trimmed font list** from 11 to 8 options - removed unbundled Nerd Fonts that required manual download

### Fixed
- **Terminal spacing/gaps issue** when default font not installed - now falls back gracefully to system monospace

---

## [1.0.1] - 2025-12-14

### Fixed

#### Terminal Corruption After Long Idle
- **Fixed terminal display corruption when returning after idle** - When Chrome service worker goes idle (30+ seconds), WebSocket disconnects. Previously, reconnection didn't resync the terminal, causing xterm.js and tmux buffers to be out of sync. Now triggers a resize trick on reconnect which forces tmux to redraw, resyncing the display.

---

## [1.0.0] - 2025-12-14

**First Public Release** - Full Linux terminals in your Chrome sidebar!

### Highlights

- **Real bash terminals** in your browser sidebar (not a web emulator)
- **Persistent sessions** powered by tmux - terminals survive sidebar close, browser restart
- **20 MCP tools** for Claude Code browser automation (screenshots, clicks, network capture)
- **Profile system** with categories, color-coded tabs, and smart directory inheritance
- **Claude Code status detection** with emoji indicators and optional voice announcements

### Added

#### Manual Token Input for External Launchers
- **Extension Settings: "API Token" button** - Click to reveal "Copy Token" button that copies auth token to clipboard
- **GitHub Pages launcher: Token input field** - Paste token once, stored in localStorage for persistence
- **Improved UX for external sites** - Users consciously authorize sites by pasting their token instead of auto-fetch

#### TTS Long Text Support
- **Handles long text-to-speech requests** - Text over 5000 characters now uses temp file input instead of command line
- **Dynamic timeout scaling** - Timeout scales with text length (10s base + 1s per 1000 chars, max 120s)

### Fixed

#### Terminal Corruption During Refresh While Working
- **Fixed copy mode and corruption when refreshing sidebar during active Claude output** - Three-part fix:
  - Disabled tmux `client-attached` and `after-select-pane` hooks that sent `refresh-client` during reconnection
  - Added 1000ms output guard to buffer initial output flood during reconnection
  - Added forced resize trick after guard lifts (sends SIGWINCH to exit copy mode)

#### Sidebar Resize Corruption During Active Output
- **Fixed terminal corruption when resizing sidebar while Claude is outputting** - Made `fitTerminal()` abort after max deferrals instead of forcing fit during continuous output

#### Ghost Badge Instant Updates
- **Ghost badge now updates immediately** on terminal spawn/close/detach instead of waiting for 30-second poll

#### Tmux Config Consistency
- **dev.sh and pty-handler.js now force xterm.js-optimized tmux config** - Ensures consistent behavior regardless of how tmux server was started
- **Fixed "can't find window: 0" error** - Works with any tmux `base-index` setting

---

# Pre-Public Development History

These are development versions before the v1.0.0 public release. Version numbers were reset when going public.

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

#### Claude Status Shows Profile Name
- **Profile Name in Ready State** - When Claude is idle, shows "Ready Claude Worker" instead of "Ready"
- **Easier Multi-Claude Identification** - Visual status now matches audio announcements

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

#### Audio Settings UX Refactor
- **Per-Profile Audio Settings** - Moved audio configuration from Audio tab into each profile's edit form
- **Audio Mode Dropdown** - Three options per profile:
  - "Use default" - Follows header toggle and global defaults
  - "Enabled" - Always plays (respects master mute)
  - "Disabled" - Never plays, even when header audio is on
- **Voice/Rate Overrides** - Optional per-profile voice and speech rate settings
- **Simplified Audio Tab** - Renamed to "Claude Audio", now only shows global defaults (voice, rate, volume, events)
- **Removed Profile Overrides Section** - No longer needed since settings are in profiles

#### Header Mute Button
- **Quick Mute Toggle** - Speaker icon in header between keyboard and settings icons
- **Master Mute** - One click to silence all audio notifications
- **Visual Feedback** - Green when active, gray when muted or disabled
- **Persisted State** - Mute preference saved to Chrome storage

### Bug Fixes

- **Tab switching flash** - Removed scheduleTmuxRefresh workaround that caused terminals to flash when switching tabs (actual fix was moving tmux status bar to top)

---

## [2.5.0] - 2025-12-09

### Major Features

#### Chrome Audio Notifications for Claude Status
- **Neural TTS via Edge-TTS** - Backend generates MP3s using Azure neural voices (free, no API key)
- **Chrome Playback** - Audio plays through Chrome for native Windows audio (better than WSL→mpv)
- **Backend Endpoint** - `POST /api/audio/generate { text, voice? }` with MD5-based caching
- **Static File Serving** - `GET /audio/{hash}.mp3` serves cached audio files
- **Named Announcements** - Says "Claude ready" or "Claude 1 ready" based on profile name and tab count
- **Smart Detection** - Only plays when `processing/tool_use → awaiting_input` AND `subagent_count === 0`
- **1s Debounce** - Prevents rapid-fire announcements
- Files: `backend/server.js`, `extension/sidepanel/sidepanel.tsx`

#### Audio Settings UI
- **New "Audio" Tab** - Third tab in Settings modal alongside Profiles and MCP Tools
- **Master Toggle** - Enable/disable all audio notifications
- **"Ready" Toggle** - Control the ready notification specifically
- **Volume Slider** - 0-100% volume control
- **Test Button** - Preview the "Ready" sound at current volume
- **Auto-Save** - Settings save immediately to Chrome storage
- Files: `extension/components/SettingsModal.tsx`

#### Profile Import/Export
- **Export Profiles** - Download all profiles as JSON file (`tabz-profiles-{date}.json`)
- **Import Profiles** - Load profiles from JSON with validation
- **Merge or Replace** - Choose to add new profiles while keeping existing, or replace all
- **Edge Case Handling** - Invalid JSON shows error, missing fields show warnings, duplicates skipped on merge
- Files: `extension/components/SettingsModal.tsx`

### Improvements

#### Keyboard Shortcuts
- **Keyboard Icon in Header** - Click to open `chrome://extensions/shortcuts` directly
- **Fixed Ctrl+Shift+9** - Changed to `_execute_action` so shortcut actually opens sidebar (was showing error notification)
- **Fixed Alt+T Working Directory** - Now uses ref to get current `globalWorkingDir` (was using stale closure value)
- Files: `extension/manifest.json`, `extension/background/background.ts`, `extension/sidepanel/sidepanel.tsx`

#### Tab Context Menu
- **Copy Session ID** - New right-click option "Copy Session ID" copies tmux session name to clipboard
- **Use Case** - Quick copy for tmux conductor workflows (`tmux send-keys -t <session>`)
- Files: `extension/sidepanel/sidepanel.tsx`

### Bug Fixes

- **Alt+T ignored header directory** - Fixed stale closure by adding `globalWorkingDirRef`
- **Sidebar shortcut showed error** - Replaced custom `toggle-sidebar` command with `_execute_action`

---

## [2.4.1] - 2025-12-09

### Added

#### Profile Import/Export (Initial)
- **Export Profiles** - Download all profiles as JSON file (`tabz-profiles-{date}.json`)
- **Import Profiles** - Load profiles from JSON with validation
- **Merge or Replace** - Choose to add new profiles while keeping existing, or replace all
- **Edge Case Handling** - Invalid JSON shows error, missing fields show warnings, duplicates skipped on merge
- Files: `extension/components/SettingsModal.tsx`

---

## [2.4.0] - 2025-12-08

### Major Features

#### Ghost Badge - Detached Sessions Manager
- **Ghost Badge** - Header badge shows count of orphaned tmux sessions
- **Detach Session** - Right-click tab → "Detach Session" removes from UI but preserves tmux session
- **Reattach Sessions** - Select orphaned sessions and bring them back as tabs with full history
- **Kill Sessions** - Permanently destroy selected tmux sessions with confirmation
- **Select All** - Bulk selection for managing multiple detached sessions
- **30s Polling** - Automatically detects new orphaned sessions
- Files: `backend/routes/api.js`, `extension/hooks/useOrphanedSessions.ts`, `extension/sidepanel/sidepanel.tsx`

### API Changes

- **`GET /api/tmux/orphaned-sessions`** - List ctt-* tmux sessions not in terminal registry
- **`POST /api/tmux/reattach`** - Reattach orphaned sessions to registry `{ sessions: string[] }`
- **`DELETE /api/tmux/sessions/bulk`** - Kill multiple tmux sessions `{ sessions: string[] }`
- **`DELETE /api/agents/:id?force=false`** - New `force` parameter: `true` (default) kills tmux, `false` detaches only

---

## [2.3.0] - 2025-12-07

### Major Features

#### MCP Settings Tab (Phase 2A + 2B Complete)
- **Individual Tool Toggles** - Enable/disable each of 12 MCP tools separately
- **Token Estimates** - See estimated context usage per tool configuration
- **Presets** - Minimal, Standard, Full tool sets with one click
- **Configurable Allowed URLs** - Add custom domains for `tabz_open_url`, or enable "YOLO mode" for all URLs
- **MCP Rebrand** - All tools renamed from `browser_*` → `tabz_*`
- **Cross-Platform Scripts** - Added `run.sh` (native), `run-wsl.sh`, `run-auto.sh` (auto-detect)
- Files: `extension/components/SettingsModal.tsx`, `tabz-mcp-server/src/`

#### Claude Code Status Display
- **Emoji Indicators in Tabs** - idle, working, tool use
- **Per-Terminal Status** - Each terminal independently shows its Claude state
- **Smart Polling** - Only polls terminals that are running Claude Code
- Files: `extension/hooks/useClaudeStatus.ts`, `extension/sidepanel/sidepanel.tsx`

#### Command History
- **Arrow Key Navigation** - Press Up/Down in chat bar to cycle through past commands
- **Persistent Storage** - Command history saved in Chrome storage across sessions
- **Clock Icon** - Visual indicator shows history is available
- Files: `extension/hooks/useCommandHistory.ts`

#### Targeted Pane Send for Split Layouts
- **Tmux Split Support** - Send commands to specific panes in split tmux layouts
- **Multi-Terminal Select** - Target multiple terminals from the chat bar
- **Claude-Aware Routing** - Automatically routes to correct pane when Claude is in a split
- Files: `backend/server.js`, `extension/sidepanel/sidepanel.tsx`

### Improvements

- **Smart Tab Reuse** - `tabz_open_url` switches to existing tab instead of opening duplicates
- **Terminal ID Naming** - IDs now use `ctt-{profileName}-{shortId}` for readability
- **Command Queuing** - "Run in Terminal" context menu queues commands if terminal is busy
- **Tab Rename Tool** - New `tabz_rename_tab` MCP tool for persistent tab names (stored by URL)

### Bug Fixes

- **Chat input routing** - Always use tmux send-keys for Claude terminals
- **Terminal names preserved** - Names survive backend restart recovery
- **Prevent duplicate spawns** - Fixed rapid-click creating multiple terminals
- **Console log spam** - Reduced noise in background worker logs
- **xterm.js buffer corruption** - Added resize lock during output bursts
- **Light theme backgrounds** - Fixed missing explicit background colors
- **Post-resize refresh** - Tmux sessions now refresh after resize
- **Throttle resize events** - Only trigger on actual dimension changes
- **Pane-focus-in hook** - Disabled hook that interrupted tmux split dragging
- **Claude status flashing** - Added 3-poll (6s) debounce before removing status from tabs
- **Tab layout stability** - Fixed + button outside scroll area, consistent tab widths
- **MCP preset UX** - Presets now fill checkboxes without saving; shows "Unsaved changes" indicator
- **Profile dropdown clipping** - Fixed dropdown alignment when + button at right edge
- **Status hover text** - Tab tooltips now show full untruncated status details

### Documentation

- **Docs Audit** - Removed 10+ outdated files, archived historical docs
- **PLAN.md Updates** - Removed Windows tools (Phase 2.7), added Hotkeys Settings Tab
- **CLAUDE.md Fixes** - Updated to 12 MCP tools, documented 6 color themes, fixed terminal ID format
- **Version Sync** - All files now consistently at 2.3.0

---

## [2.2.0] - 2025-12-03

### Major Features

#### HTTP API for Programmatic Terminal Spawning
- **POST /api/spawn** - New REST endpoint to spawn terminals via HTTP
- **Automation Ready** - Enables Claude/scripts to spawn terminals programmatically
- **Parameters** - `name`, `workingDir`, `command` (all optional)
- **Tmux Persistence** - API-spawned terminals use tmux for persistence
- **Auto-Display** - Tabs appear automatically in the sidebar

#### Session Isolation for Multi-Project Backend
- **ctt- Prefix Filtering** - Frontend only shows terminals with `ctt-` prefix
- **Backend Sharing** - Multiple projects can share port 8129 without cross-contamination
- **Startup Recovery** - Backend recovers orphaned `ctt-` tmux sessions on restart
- **Display Names** - Recovered terminals show `Bash (shortId)` instead of full UUID

### Technical Details

- `useTmux: true` now properly flows through `registerTerminal()` to PTY creation
- Removed duplicate `createPTY` calls that were causing redundant PTY processes
- `resize` WebSocket handler now registers connections as terminal owners
- Terminals without profiles inherit settings from the default profile
- Files changed: `backend/server.js`, `extension/sidepanel/sidepanel.tsx`

### Bug Fixes

- **API-spawned terminals showing blank** - Fixed: resize handler now registers WebSocket as owner
- **Recovered terminals not using tmux** - Fixed: `useTmux: true` passed through registerTerminal
- **Font size stuck at 14** - Fixed: terminals without profiles now inherit from default profile
- **Duplicate PTY processes** - Fixed: removed redundant createPTY calls after registerTerminal

---

## [2.1.0] - 2025-12-03

### Major Features

#### Global Working Directory with Profile Inheritance
- **Working Directory Selector** - New dropdown in header (folder icon) to set global working directory
- **Profile Inheritance** - Profiles with empty workingDir inherit from header
- **Recent Directories** - Last 10 directories remembered with persistence
- **Remove from List** - Hover and click X to remove typos from recent dirs
- **Use Case** - One "lazygit" profile works for any project, just change header dir

#### Profile Starting Commands
- **Command Field** - Profiles can now have an optional starting command
- **Auto-Execute** - Command runs automatically when terminal spawns
- **Examples** - `lazygit`, `htop`, `npm run dev`, `vim .`

#### Simplified Settings
- **Removed General Tab** - Was redundant since all settings are per-profile
- **Profiles Only** - Settings modal now just manages profiles
- **Clearer UX** - No confusion about global vs profile settings

#### Windows Terminal-Style Split Button
- **Split + Button** - In tab bar, like Windows Terminal
- **Click +** - Spawns terminal with default profile
- **Click Down Arrow** - Opens dropdown to select any profile
- **Removed** - "New Tab" dropdown from header (cleaner)

### Technical Details

- Profiles now have optional `command` field (string)
- Profiles with empty `workingDir` inherit from `globalWorkingDir` state
- `globalWorkingDir` and `recentDirs` persisted in Chrome storage
- Spawn functions updated: `handleSpawnProfile`, `handleSpawnDefaultProfile`, etc.
- Files changed: `sidepanel.tsx`, `SettingsModal.tsx`

### Bug Fixes

- **Initial terminal uses default profile** - Fixed: was spawning basic bash without profile settings
- **Profiles not loaded on first install** - Fixed: now auto-loads from profiles.json
- **Settings modal state persists** - Fixed: modal now resets to list view when opened

---

## [1.2.0] - 2025-11-24

### Major Features

#### Browser MCP Server - Extended Automation Tools
Six new tools added to enable comprehensive browser automation via Claude Code:

| Tool | Description |
|------|-------------|
| `browser_screenshot` | Capture screenshots to ~/ai-images/ (viewport, full page, or element) |
| `browser_download_image` | Download images by CSS selector or direct URL |
| `browser_list_tabs` | List all open browser tabs with URLs and titles |
| `browser_switch_tab` | Switch to a specific tab by ID |
| `browser_click` | Click elements by CSS selector |
| `browser_fill` | Fill input fields with text |

#### Screenshot & Image Capture
- **Full Page Screenshots** - Capture entire scrollable pages with `fullPage: true`
- **Element Screenshots** - Target specific elements with CSS selectors
- **Auto-save to ~/ai-images/** - Screenshots saved with timestamps, viewable via Read tool
- **Image Download** - Extract images from `<img>` tags or CSS background-image
- Files: `tabz-mcp-server/src/tools/screenshot.ts`, `tabz-mcp-server/src/client.ts`

#### Tab Management
- **List All Tabs** - Get tabId, URL, title, and active status for all open tabs
- **Switch Tabs** - Bring specific tabs to focus by ID
- **Filters chrome:// pages** - Only shows actual web pages
- Files: `tabz-mcp-server/src/tools/tabs.ts`

#### DOM Interaction
- **Click Elements** - Click buttons, links, checkboxes by CSS selector
- **Fill Forms** - Type text into input fields and textareas
- **Wait for Elements** - Automatically waits up to 5 seconds for elements to appear
- **Clear Before Fill** - Clears existing input value before typing
- Files: `tabz-mcp-server/src/tools/interaction.ts`

### Technical Details

- **All new tools use CDP** - Chrome DevTools Protocol via puppeteer-core
- **WSL2 Compatible** - PowerShell bridge for Windows Chrome access from WSL
- **Type-safe Implementation** - Full TypeScript with Zod schemas
- **Comprehensive Error Messages** - Actionable troubleshooting guidance

### Architecture (CDP Tools)
```
Chrome Browser (Windows with --remote-debugging-port=9222)
       |
   CDP / WebSocket
       |
Browser MCP Server (puppeteer-core)
       |
   Claude Code
```

### Documentation
- **MCP_TOOLS.md** - Updated with all 9 tools, examples, and troubleshooting
- Added architecture diagram for CDP-based tools
- Added requirements for Chrome debugging port

### Known Limitations
- CDP tools require Chrome started with `--remote-debugging-port=9222`
- Screenshots/clicks only work on main frame (no iframe support yet)
- Tab IDs are session-specific indices, not persistent Chrome tab IDs

---

## [1.1.0] - 2025-11-24

### Major Features

#### Browser MCP Server - Claude Code Integration
- **New MCP Server for Browser Automation** - Claude Code can now interact with your browser
  - Get current page info (URL, title, tab ID)
  - Get console logs (log, warn, error, info, debug)
  - Execute JavaScript in browser tabs
  - Files: `tabz-mcp-server/` (new package)

- **Dual Connection Strategy** - Works with or without Chrome debugging
  - **CDP Mode** (recommended): Connects via Chrome DevTools Protocol for full JS execution
  - **Extension Mode**: Falls back to extension messaging (limited by CSP)
  - CDP bypasses Content Security Policy restrictions for unrestricted script execution
  - Files: `tabz-mcp-server/src/client.ts`

- **WSL2 + Windows Chrome Support** - Seamless cross-platform operation
  - Uses PowerShell bridge to access Chrome debugging from WSL2
  - No port forwarding or network configuration required
  - Works with Tailscale VPN active
  - Files: `tabz-mcp-server/src/client.ts`

#### Architecture
```
Chrome Browser (Windows)
       | --remote-debugging-port=9222
       |
Browser MCP Server (stdio) <-> Claude Code
       | (fallback)
Extension Background Worker -> WebSocket -> Backend (WSL:8129)
```

#### Available MCP Tools
| Tool | Description |
|------|-------------|
| `browser_get_page_info` | Get current URL, title, and tab ID |
| `browser_get_console_logs` | Retrieve console output with filtering |
| `browser_execute_script` | Execute JavaScript in browser (CDP bypasses CSP) |

### Technical Details

- **MCP Server Configuration** - Project-level `.mcp.json`
  - Registered as `browser` MCP server in Claude Code
  - Uses stdio transport for Claude Code communication
  - Requires backend running for extension fallback mode

- **CDP Connection** - Chrome DevTools Protocol
  - Requires Chrome started with `--remote-debugging-port=9222`
  - Puppeteer-core for CDP communication
  - Automatic WebSocket endpoint discovery via PowerShell (WSL2)

- **Backend Routes** - REST API bridge for extension method
  - `GET /api/browser/console-logs` - Retrieve captured console logs
  - `POST /api/browser/execute-script` - Execute script via extension
  - `GET /api/browser/page-info` - Get active tab info
  - Files: `backend/routes/browser.js`, `backend/server.js`

- **Extension Handlers** - WebSocket message handlers
  - `browser-execute-script` - Execute JS via chrome.scripting API
  - `browser-get-page-info` - Query active tab info
  - `browser-console-log` - Forward console logs to backend
  - Files: `extension/background/background.ts`

### Documentation
- **MCP_TOOLS.md** - Quick reference for browser MCP tools
  - Tool descriptions and trigger phrases
  - Parameter documentation
  - Code examples for common operations
  - Troubleshooting guide

### Known Limitations
- Extension method blocked by strict CSP (use CDP mode instead)
- CDP mode requires Chrome started with debugging flag
- Console log capture requires page interaction after extension load

---

## [1.0.1] - 2025-11-18

### Major Features

#### Commands Panel Improvements
- **Added Spawn Options Editor** - Edit spawn options directly in Settings UI
  - Full CRUD operations (add/edit/delete spawn options)
  - Stored in Chrome storage (survives extension reloads and storage clears)
  - Form fields: Label, Icon, Terminal Type, Command, Description, Working Directory, URL
  - Loads from `spawn-options.json` as fallback if no custom options exist
  - Files: `extension/components/SettingsModal.tsx`, `extension/components/QuickCommandsPanel.tsx`

- **Added Font Family Support** - Choose from 6 font families
  - Dropdown in Settings > General tab
  - Options: Monospace, JetBrains Mono, Fira Code, Consolas, Courier New, Source Code Pro
  - Applies to all terminals immediately (no reload needed)
  - Files: `extension/components/SettingsModal.tsx`, `extension/components/Terminal.tsx`

- **Added Global "Use Tmux" Toggle** - Force all terminals to use tmux
  - Toggle in sidebar header (next to Connected badge)
  - Overrides individual terminal settings when enabled
  - Persists in Chrome storage
  - Files: `extension/sidepanel/sidepanel.tsx`, `extension/background/background.ts`

#### Session Persistence & Restoration
- **Tmux sessions survive extension reloads** - Automatic reconnection on reload
  - Backend sends terminal list on WebSocket connection
  - Sidepanel restores all existing terminals as tabs
  - Terminal components reconnect to tmux sessions
  - No more orphaned sessions accumulating in background
  - Files: `extension/background/background.ts`, `extension/sidepanel/sidepanel.tsx`

- **Terminal IDs prefixed with `ctt-`** - Easy identification and cleanup
  - All terminal IDs now start with `ctt-` (Chrome Terminal Tabs)
  - Makes it easy to find/kill orphaned sessions: `tmux ls | grep "^ctt-"`
  - Distinguishes from main app terminals (which use `tt-`)
  - Files: `backend/modules/terminal-registry.js`

#### Settings Improvements
- **Settings apply immediately** - No extension reload needed
  - Font size changes apply to all terminals instantly
  - Font family changes apply instantly
  - Theme toggle (dark/light) applies instantly
  - Terminal components re-render when settings change
  - Files: `extension/components/Terminal.tsx`

- **Settings Modal with Tabs** - Organized settings UI
  - General tab: Font size, font family, theme toggle, preview
  - Spawn Options tab: Add/edit/delete spawn options
  - Tab badges show spawn option count
  - Files: `extension/components/SettingsModal.tsx`

### Bug Fixes

#### Terminal Rendering & UX
- **Fixed terminal not fitting sidebar on spawn** - Immediate fit on load
  - Added second fit attempt at 300ms (catches slow layout)
  - Added ResizeObserver for automatic refit on container resize
  - Terminals now fit perfectly on first spawn
  - Files: `extension/components/Terminal.tsx`

- **Fixed tab names showing IDs** - Now display friendly names
  - Tab names show spawn option label (e.g., "Claude Code", "Bash Terminal")
  - Background worker passes `name` field to backend
  - Sidepanel displays friendly names instead of `terminal-xxxxx`
  - Files: `extension/shared/messaging.ts`, `extension/components/QuickCommandsPanel.tsx`, `extension/background/background.ts`

- **Fixed font family not updating** - Added to Terminal useEffect dependencies
  - Font family changes now trigger terminal updates
  - Terminals update xterm.js fontFamily option
  - Resize trick forces complete redraw
  - Files: `extension/components/Terminal.tsx`

### UI/UX Improvements
- **Spawn Options loaded from JSON** - Consistency with web app
  - Uses `spawn-options.json` for default spawn options (~18 terminals)
  - Clipboard commands (Git, Dev, Shell) still hardcoded for simplicity
  - Priority: Chrome storage > JSON fallback
  - Files: `extension/components/QuickCommandsPanel.tsx`

- **Tab names instead of IDs** - Better usability
  - Tabs show meaningful names: "Claude Code", "Bash", etc.
  - No more cryptic `terminal-1731876543210` names
  - Makes switching between terminals easier

### Technical Improvements
- **Chrome storage for spawn options** - Persistent customization
  - Spawn options stored in `chrome.storage.local`
  - Survives extension reloads, browser restarts, Chrome updates
  - Only cleared by manual storage clear or extension uninstall
  - Falls back to JSON if no custom options exist

- **ResizeObserver for terminals** - Automatic fit on resize
  - Monitors container size changes
  - Triggers fit whenever sidebar resizes
  - Works with devtools open/close, zoom in/out
  - Properly cleaned up on component unmount

### Documentation
- **SPAWN_OPTIONS_ANALYSIS.md** - Decision analysis for JSON vs hardcoded approach
- **MISSING_FEATURES.md** - Feature gap analysis vs web app
- **CLAUDE.md** - Updated with current features and development rules

---

## [1.0.0] - 2025-11-17

### Initial Release - Chrome Extension MVP

#### Core Features
- **Chrome Side Panel Integration** - Sidebar persists across tabs
  - Extension icon click → Opens sidebar
  - Keyboard shortcut (Ctrl+Shift+9) → Opens sidebar
  - Context menu → "Open Terminal Sidebar"
  - Files: `extension/manifest.json`, `extension/background/background.ts`

- **Terminal Emulation** - Full xterm.js integration
  - WebSocket communication via background worker
  - Copy/paste support (Ctrl+Shift+C/V)
  - Terminal tabs with close buttons
  - Auto-reconnect on WebSocket disconnect
  - Files: `extension/components/Terminal.tsx`, `extension/sidepanel/sidepanel.tsx`

- **Settings Modal** - Basic terminal configuration
  - Font size slider (12-24px)
  - Theme toggle (Dark/Light)
  - Live preview
  - Files: `extension/components/SettingsModal.tsx`

- **Commands Panel** - Quick access to spawn options and clipboard commands
  - Spawn terminals (Bash, Claude Code, TFE, etc.)
  - Copy commands to clipboard (git, npm, shell)
  - Custom commands support (add your own)
  - Working directory override
  - Files: `extension/components/QuickCommandsPanel.tsx`, `extension/components/CommandEditorModal.tsx`

- **Terminal Spawning** - Launch 15+ terminal types
  - Bash, Claude Code, TFE, LazyGit, htop, and more
  - Working directory support
  - Command execution on spawn
  - Resumable sessions (tmux integration)
  - Files: `extension/background/background.ts`

#### Architecture
- **Frontend**: React + TypeScript + Vite
- **Backend**: Shared with terminal-tabs web app (Node.js + Express + PTY)
- **Storage**: Chrome storage API for settings
- **Communication**: Chrome runtime messaging + WebSocket

#### Known Limitations
- No per-terminal customization (font size/theme apply globally)
- No background gradients or transparency
- No project management
- Settings require extension rebuild to update (fixed in v1.0.1)

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
