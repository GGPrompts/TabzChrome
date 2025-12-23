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

## [1.2.9] - 2025-12-23

### Added
- **File tree context menu** - Right-click any file or folder in the dashboard Files section:
  - **Copy Path** - Copy full path to clipboard
  - **Copy @Path** - Copy `@/path/to/file` format for Claude references
  - **Favorite** - Toggle star status (works for files AND folders now)
  - **Pin** - Open file as pinned tab (files only)
  - **Open in Editor** - Launch `$EDITOR` in a new terminal (files only)
- **Folder favorites** - Can now favorite entire folders, not just files
  - Favorited folders show their contents in the favorites filter view
  - Folders start collapsed to prevent scroll overload
- **Star indicator in file tree** - Small star icon appears on hover for all items
  - Always visible (filled yellow) when item is favorited
  - Click star to toggle favorite status directly from tree
- **Expand all button** - New button in file tree header expands all folders
  - Works with filtered tree during search (expands only matching folders)
- **Dashboard header styling** - Page headers now use JetBrains Mono font with primary green color
- **Dashboard header icons** - All page headers now have matching icons (Dashboard, Profiles, Terminals, Files, API Playground, MCP Settings, Settings)

### Changed
- **Prompts filter coloring** - Only `.prompts` folder and `.prompty` files are pink; subfolders inside `.prompts/` now use normal yellow folder color and white text
- **Prompty file text** - `.prompty` files now have pink icon but white text (previously both were pink)
- **Open in Editor icon** - Changed from external link icon to terminal icon to better indicate it spawns a terminal

### Fixed
- **Context menu CSS missing** - Added `.tab-context-menu` styles to dashboard's globals.css (was only in sidepanel CSS)
- **Memory leak in context menu** - Fixed race condition where event listeners could be added after component unmount
- **Chrome messaging pattern** - FileTree now uses `sendMessage` helper instead of direct `chrome.runtime?.sendMessage` for consistent error handling

---

## [1.2.8] - 2025-12-23

### Added
- **Chrome Debugger MCP Tools** - Three new DevTools-level inspection tools:
  - `tabz_get_dom_tree` - Get full DOM tree structure including shadow DOM (uses chrome.debugger)
  - `tabz_profile_performance` - Profile page timing, memory, and DOM metrics
  - `tabz_get_coverage` - Analyze JS/CSS code coverage to find unused code
- Tools use Chrome DevTools Protocol via chrome.debugger API
- User sees "debugging" banner in Chrome while tools run (auto-detaches after operation)
- **MCP Settings UI** - New "Debugger" category in MCP settings (sidebar + dashboard)
- **"Send Element to Chat" context menu** - Right-click any element on any webpage to capture its info:
  - Generates unique CSS selectors (uses `:nth-of-type()` for sibling disambiguation)
  - Captures tag, ID, classes, text content, and useful attributes (`data-testid`, `aria-label`, `role`, etc.)
  - Element info appears in sidebar chat as formatted code block
  - Works on all URLs (content script scope expanded from specific sites to `<all_urls>`)
- **MCP Tool Visual Feedback** - Elements now glow when MCP tools interact with them:
  - 🟣 Purple glow for `tabz_get_element` (inspect)
  - 🟢 Green glow for `tabz_click` (action completed)
  - 🔵 Blue glow for `tabz_fill` (input focused)
  - Pulsing animation (2 pulses over 1.6s), auto-scrolls element into view

### Refactored
- **Split `background.ts`** (4,537 lines → 13 modules):
  - Core: `index.ts`, `state.ts`, `utils.ts`, `websocket.ts`, `alarms.ts`
  - Features: `consoleCapture.ts`, `networkCapture.ts`, `messageHandlers.ts`, `contextMenus.ts`, `omnibox.ts`, `keyboard.ts`
  - Browser MCP handlers: `browserMcp/` subdirectory with 9 domain-specific modules
  - Extracted duplicated helpers: `getValidWindowId`, `tryOpenSidebar`, `windowsToWslPath`
- **Split `client.ts`** in MCP server (1,041 lines → 8 modules):
  - `client/core.ts`, `screenshot.ts`, `bookmarks.ts`, `downloads.ts`, `interaction.ts`, `network.ts`, `debugger.ts`, `index.ts`
  - Consolidated `formatBytes()` into shared `utils.ts`
  - Removed dead code: `cleanupScreenshots()`, `convertPathForWSL()`, `isRunningInWSL()`
- **Updated error messages** - Removed CDP references, now reference TabzChrome extension
- **Synced skills** - `.claude/skills/tabz-guide/` synced from `plugins/`

### Documentation
- Updated tool count from 20/26 to 29 across README.md, PLUGIN.md, mcp-tools.html
- Updated version badge from 1.1.8 to 1.2.8
- Removed outdated CDP setup instructions from PLUGIN.md
- Updated CLAUDE.md architecture diagram to reflect new modular structure
- Added dashboard section to architecture diagram

### Fixed
- **DOM tree returning empty** - Handle document nodeType 9 (was filtering out root node)
- **Coverage tool timeout** - Fixed duplicate `type` property overwriting message type with coverage type
- **CSS coverage error** - Enable DOM domain before CSS domain (Chrome requirement)
- **Debugger commands hanging** - Added 10s timeout to `sendDebuggerCommand` to prevent infinite hangs

---

## [1.2.7] - 2025-12-23

### Fixed
- **Deprecated Edge TTS voices** - Replaced voices that Microsoft removed:
  - `en-US-AmberNeural` → `en-US-AvaNeural` (Expressive, Caring female)
  - `en-US-DavisNeural` → `en-US-ChristopherNeural` (Reliable, Authority male)
  - `en-AU-WilliamNeural` → `en-AU-WilliamMultilingualNeural`
- **Content script extension context errors** - Added `isExtensionValid()` guard to prevent "Cannot read properties of undefined (reading 'sendMessage')" errors when extension context is invalidated after reload

---

## [1.2.6] - 2025-12-22

### Added
- **Copy @Path button** - New toolbar button in file viewer copies `@/path/to/file` to clipboard (useful for Claude references)
- **Prompty file viewer** - Full support for `.prompty` template files:
  - **Frontmatter display** - YAML frontmatter (name, description) shown in pink header
  - **Inline fillable fields** - Variables like `{{file}}` render as clickable inline badges
  - Click badge to edit in place, Tab/Shift+Tab navigates between fields
  - Empty fields show dashed pink border, filled fields show solid
  - **Progress indicator** - Shows "2/5 filled" with checkmark when complete
  - **Hint syntax** - `{{variable:hint text}}` shows hint as placeholder
  - **Smart copy/send** - Frontmatter stripped, variables substituted before copying or sending to terminal

### Fixed
- **File tree stuck on home directory** - Fixed race condition where file tree would load `~` instead of project directory on first dashboard load:
  - Changed `hasInitialized` boolean to track which path was initialized
  - Made cache validation stricter (never use cache for home directory)
  - Clear stale home paths from localStorage on mount

---

## [1.2.5] - 2025-12-22

### Added
- **AI-relevant files always visible** - Critical files now show even with "hidden files" off:
  - `.claude/`, `.prompts/` (Claude ecosystem)
  - `.obsidian/` (Obsidian vault indicator)
  - `.env`, `.env.local`, `.env.*` (environment files)
  - `.gitignore`, `.dockerignore`
  - `.pem`, `.key`, `.crt` (certificate/secret files)
- **Obsidian vault detection** - Folders containing `.obsidian` get 🧠 brain icon (violet color)
- **New file type icons and colors** in file tree:
  - Docker (Container icon, sky blue): `Dockerfile`, `docker-compose.yml`, `.dockerignore`
  - Gitignore (GitBranch icon, orange): `.gitignore`
  - Environment (Lock icon, yellow): `.env`, `.env.local`, `.env.*`
  - Secrets (Key icon, red): `.pem`, `.key`, `.crt`, `credentials.*`
- **Send to Terminal** - New toolbar button to send file content to any open terminal:
  - Dropdown lists all open terminals
  - Claude sessions highlighted with 🤖 indicator
  - "Send + Enter" option for Claude sessions (auto-submit prompt)
  - Uses `TMUX_SESSION_SEND` for reliable Claude delivery

### Changed
- Backend `buildFileTree` now returns `isObsidianVault` flag for folders containing `.obsidian`

---

## [1.2.4] - 2025-12-22

### Added
- **Tree-based filtered views** - Prompts and Claude filters now show proper collapsible tree structure:
  - Each source (Global ~/.prompts/, Project .prompts/, etc.) is a collapsible section
  - Folders within each source expand/collapse independently
  - No more redundant folder paths in file names
- **Preview/Pin tab system** - VS Code-style file previewing:
  - Single-click opens file as preview (italic tab, replaces previous preview)
  - Double-click tab to pin it (keeps tab open permanently)
  - Pin button in toolbar to pin current preview
  - Reduces tab clutter when browsing many files
- **Extension-based file colors** - More visual variety in filtered views:
  - Pink: .prompty files only
  - Blue: .md markdown files
  - Amber: .yaml/.yml files
  - Orange: .json files
  - Green: code files (.js, .ts, .py, etc.)
  - Gray: .txt files
  - Folders stay yellow (except Claude ecosystem folders like skills/, agents/)

### Fixed
- **README.md showing as yellow folder** - Files inside plugins/ no longer incorrectly get folder icons
- **File tree reverting to home directory** - Fixed race condition where file tree loaded ~ before working directory was ready

### Changed
- Backend `/api/files/list` now returns tree structures instead of flat groups

---

## [1.2.3] - 2025-12-22

### Added
- **File Filters** - TFE-style filter buttons in Files section header:
  - **Claude filter** - Shows all Claude ecosystem files (~/.claude/, .claude/, CLAUDE.md, .mcp.json, plugins)
  - **Prompts filter** - Shows prompt templates (~/.prompts/, .prompts/, .claude/commands/)
  - **Favorites filter** - Shows user-starred files
- **Star/Favorite files** - Star button in file viewer toolbar to bookmark files
  - Yellow filled star when favorited
  - Persisted to localStorage
  - Click ⭐ filter to see all favorites
- **TFE-inspired file colors** in tree view:
  - Orange: CLAUDE.md, .claude/, settings.json
  - Pink: .prompts/, .prompty files
  - Purple: agents
  - Teal: skills
  - Green: hooks
  - Cyan: .mcp.json
  - Amber: plugins
- **Relative paths in filtered views** - Shows `conductor/plugin.json` instead of just `plugin.json`
- **New backend API** - `GET /api/files/list?filter=X&workingDir=Y` for filtered file lists

### Fixed
- **Broken symlinks** - Filtered file lists now skip broken symlinks instead of erroring
- **Git directory exclusion** - .git folders excluded from filtered results

---

## [1.2.2] - 2025-12-22

### Added
- **Video file support** - View mp4, webm, mov, avi, mkv files with native browser controls
  - New `/api/files/video` backend endpoint (100MB limit)
  - Purple icon color for video files in tree and tabs
- **CSV table viewer** - View CSV files as formatted tables
  - Proper quote/comma parsing (handles `"quoted, fields"`)
  - Sticky header row, hover highlighting on rows
  - Uses viewer font settings (size/family)
  - Emerald icon color for CSV files
- **Markdown link navigation** - Relative links in `.md` files now open in file viewer
  - Click `[changelog](CHANGELOG.md)` to open in new tab
  - External links still open in browser
- **Dashboard section persistence** - Active section saved to localStorage
  - Remembers which page you were on after refresh
  - Sidebar collapsed state also persisted
- **Files section caching** - New `FilesContext` for persistent state
  - Open files and active tab preserved across dashboard tab switches
  - File tree cached (only refetches on path change or manual refresh)

### Changed
- Tab icons now use colored icons matching file tree (green=code, blue=md, orange=json, yellow=image, purple=video, emerald=csv)
- `useWorkingDirectory` hook now exports `isLoaded` flag for timing coordination

### Fixed
- **File tree loading home directory on refresh** - Fixed path mismatch between tilde (`~/projects/X`) and expanded (`/home/user/projects/X`) paths that caused cache misses and duplicate fetches
- **Working directory persistence race condition** - Added `isLoaded` guards to prevent stale `~` from being written to Chrome storage during initial load

---

## [1.2.1] - 2025-12-22

### Added
- **Files section enhancements:**
  - **Syntax highlighting** - react-syntax-highlighter with vscDarkPlus theme (50+ languages)
  - **Markdown rendering** - ReactMarkdown with GFM support (tables, code blocks, lists)
  - **Line numbers** for code files
  - **Font settings** in Files header - adjustable font size (12-24px) and family
  - **File tree depth** setting in Settings page (1-10 levels)
  - **Image viewer controls** - Fit/100%/zoom buttons, dimensions display, download button
  - Uses `$EDITOR` environment variable for "Open in Editor" (fallback: nano)

### Fixed
- **TTS reliability** - Fixed edge-tts special character handling with file input, added 3000 char truncation
- **Voice sync** - Added Davis & Amber voices to settings, synced 12 voices between backend and frontend

---

## [1.2.0] - 2025-12-22

### Changed
- **No CDP required!** All 26 MCP tools now use Chrome Extension APIs exclusively
  - No `--remote-debugging-port=9222` flag needed to launch Chrome
  - No puppeteer-core dependency (smaller install, faster startup)
  - Simpler setup - just install extension and start backend

### Removed
- **`tabz_get_api_response` tool** - Removed due to browser security restrictions preventing response body capture via Extension APIs. Use `tabz_get_network_requests` to see request metadata (URL, method, status, timing)

### Updated
- Documentation cleanup across all files:
  - GitHub Pages (`docs/pages/mcp-tools.html`) - Updated tool list and requirements section
  - README.md - Simplified MCP setup instructions
  - WSL2_SETUP.md - Completely rewritten (much simpler now)
  - All skills and agents updated to remove CDP references
  - Dashboard MCP Settings page updated

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
