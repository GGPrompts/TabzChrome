<!--
CHANGELOG ROTATION POLICY:
When this file exceeds 500 lines, move older versions to CHANGELOG-archive.md.
Keep the most recent 3-4 major versions in the main file.
-->

# Changelog

All notable changes to Tabz - Chrome Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For older versions (1.2.x, 1.1.x, 1.0.x, and pre-public 2.x), see [CHANGELOG-archive.md](CHANGELOG-archive.md).

---

## [1.4.0] - 2026-01-02

### Docs

- **Plugin Health Check API** - Documented new endpoints in `docs/API.md`:
  - `GET /api/plugins/health` - Check for outdated plugins and cache statistics
  - `POST /api/plugins/update` - Update a single plugin to latest version
  - `POST /api/plugins/update-all` - Batch update all outdated plugins
  - `POST /api/plugins/cache/prune` - Remove old cached plugin versions

### Added

- **Desktop Notification Settings** - Configure desktop notifications for system events:
  - Master enable/disable toggle for all notifications
  - Quiet hours with configurable start/end times (supports overnight ranges like 10 PM to 8 AM)
  - Per-event toggles for connection, terminal, Claude, and system events
  - New `useDesktopNotifications` hook for consistent notification handling across components
  - **Implemented notifications:**
    - WebSocket disconnect/reconnect - alerts when backend connection lost or restored
    - Terminal exit with error code - notifies when a terminal exits with non-zero status
    - ErrorBoundary crashes - desktop alert when sidebar UI crashes
    - Orphaned sessions detected - notification when detached tmux sessions are found
    - Question waiting timeout - reminder after 60s when Claude is waiting for input
    - Context critical (persistent) - stays visible until dismissed at 75% context usage
    - MCP download failures - alerts when tabz_download_file/image fails
    - Long-running command completion - notifies after tasks running 5+ minutes finish

- **Bookmarks Manager** - Full-featured bookmark management in dedicated page:
  - Tree view of all Chrome bookmarks with folder hierarchy
  - Drag-and-drop reordering and folder organization
  - Create, edit, delete bookmarks and folders
  - Search bookmarks by title or URL
  - Integration with new tab page shortcuts

- **Dashboard Quick Access Dropdown** - Quick navigation from sidepanel header:
  - Click home icon dropdown to jump to any dashboard section
  - Direct links to Files, Terminals, Profiles, Audio, Settings, MCP Playground
  - Chevron indicator shows dropdown is available

- **Unified Header Indicators** - Consolidated badge for terminals outside sidebar:
  - Ghost (purple): Detached tmux sessions - reattach or kill
  - Popout (blue): Terminals in popup windows - return to sidebar
  - 3D Focus (cyan): Terminals in 3D mode - return to sidebar
  - Sectioned dropdown with color-coded headers and multi-select actions
  - "Restore All" button to bring back all popout/3D terminals at once
  - Keyboard navigation with arrow keys

- **Close Others Context Menu** - New terminal tab context menu options:
  - "Close Others" to kill all terminals except the selected one
  - "Close All" to kill all terminals at once

- **Weather Widget** - New tab page now shows local weather:
  - Temperature display with weather icon
  - Uses browser geolocation for local forecast
  - Clean, minimal design matching terminal aesthetic

- **Keyboard Navigation in File Tree** - Navigate files with arrow keys:
  - Arrow Up/Down to move between files
  - Arrow Left/Right to expand/collapse folders
  - Enter to open files or spawn terminals
  - Home/End to jump to first/last file
  - Requires focus on file tree (click to focus)

- **Cmd+P Fuzzy File Search** - Quick file finder in dashboard:
  - Press Cmd+P in Files section to open search modal
  - Fuzzy match against file names and paths
  - Arrow keys to navigate results, Enter to open
  - Escape to close

- **Git Status Indicators** - Visual file tree status markers:
  - Modified files (yellow dot)
  - Untracked files (light gray dot)
  - Staged files (green dot)
  - Live git status updates as you edit

- **Drag Files to Terminal** - Drag-and-drop file paths to terminal:
  - Drag any file from tree onto terminal
  - Pastes absolute file path at cursor
  - Works with all file types
  - Useful for quick file references in commands

- **Watcher Idle Detection** - Conductor agent nudges idle workers:
  - Monitors tmux sessions for inactivity
  - Auto-sends reminder after timeout
  - Helps keep parallel workers engaged
  - Configurable via conductor settings

- **Profile CRUD API Endpoints** - Programmatic profile management:
  - `GET /api/browser/profiles` - List all profiles
  - `POST /api/browser/profiles` - Create profile
  - `PUT /api/browser/profiles/:id` - Update profile
  - `DELETE /api/browser/profiles/:id` - Delete profile
  - `POST /api/browser/profiles/import` - Bulk import with merge/replace modes
  - See docs/API.md for full documentation

### Changed

- **Dashboard File Navigation** - Improved usability and consistency:
  - Better file tree navigation behavior
  - Terminal list ordering now matches sidebar tab order

- **Sidepanel Header** - Cleaned up redundant elements:
  - Removed duplicate title display
  - Updated dashboard button icon for clarity
  - Added dropdown menu for quick dashboard navigation

- **File Picker Modal** - Enhanced file selection experience:
  - Quick folder filters to jump to common directories
  - Audited all file picker usages for consistent behavior
  - Improved validation and error handling

### Fixed

- **API Spawn Theme Inheritance** - Terminals spawned via API now inherit the default profile's theme correctly

- **Pane Title Detection** - Shell with command pane titles (e.g., "bash: command") now treated as generic, preventing false-positive status displays

- **Working Directory Validation** - Invalid path handling improved:
  - Validates working directory before spawning terminal
  - Falls back gracefully with user notification
  - Invalid path warning displays UI notification

- **Profile Card Theme Preview** - Dashboard profile cards now correctly show inherited theme colors

- **Double Paste on Ctrl+Shift+V** - Fixed terminal paste firing twice due to handler responding to both keydown and keyup events

---

## [1.3.11] - 2026-01-01

### Added

- **New Tab Page** - Beautiful custom new tab page replaces Chrome default:
  - **Clock Widget** - LED-style display with Orbitron font
  - **Profile Cards** - Quick-launch terminals with one click
  - **Active Terminals** - See running terminals with status indicators
  - **Command Bar** - Search, open URLs, or spawn terminals with commands
  - **Recent Directories** - Quick access to frequently used paths
  - **Keyboard Shortcuts** - Power user friendly with hints overlay
  - **Dark Theme** - Terminal-inspired aesthetic, not generic AI look
  - Uses `chrome_url_overrides.newtab` manifest entry

### New Entry Points
- `extension/newtab/` - New tab page with React components

### New Files
- `extension/newtab/NewTab.tsx` - Main new tab component
- `extension/newtab/components/` - ClockWidget, CommandBar, ProfilesGrid, RecentDirs, StatusWidget, ShortcutsHint
- `extension/newtab/hooks/` - useNewTabProfiles, useNewTabTerminals, useNewTabWorkingDir
- `extension/newtab/styles/newtab.css` - Custom styles with CSS variables

---

## [1.3.10] - 2025-12-31

### Added
- **Pane Title Tracking** - Terminal cards now display dynamic status from tmux pane titles:
  - Claude status (current todo item being worked on)
  - TUI app status (e.g., PyRadio currently playing song)
  - New `usePaneTitles` hook for extension-side pane title support
  - Filters out generic/path values to show only meaningful status

- **Tmux Status Bar Enhancements** - Profile name and Claude pane_title now visible in tmux status bar:
  - Sets `@profile` option when spawning terminals with profiles
  - Status bar shows current profile and activity

- **Chrome Extension Customization Reference** - Comprehensive guide (`docs/reference/CHROME_EXTENSION_CUSTOMIZATION.md`) covering:
  - Customizable UI (new tab, side panel, toolbar icons, etc.)
  - Customizable behavior (tabs, windows, network, storage)
  - Hard limitations (address bar, browser chrome, native UI)
  - Manifest V3 restrictions and user action requirements

### Changed
- **Terminal Sorting** - Dashboard terminals now match sidebar tab order for consistent organization
- **Activity History Styling** - Reduced spacing and adjusted text sizes for better visual hierarchy
- **Claude Status Display** - Syncs status history to Chrome storage for dashboard access
- **Popout Window Sizes** - Increased default sizes for better visibility
- **File Path Tooltips** - Improved tooltips in Files section
- **Git Operations** - Renamed gitlogue to lazygit, added commit replay support

---

## [1.3.9] - 2025-12-30

### Added
- **Animated Icons** - 17 new animated icons with hover effects from lucide-animated:
  - Context menu icons: Sparkles (customize), Settings, AttachFile (reference), SquarePen (rename), Maximize (pop out), Expand (3D focus), Copy, Eye (view text), Delete (kill)
  - Header icons: Moon/Sun (theme), RefreshCw (refresh), Plus (new tab), ChevronDown, Keyboard (shortcuts), X (close)
  - Dashboard: PanelLeftClose/Open (sidebar collapse), GithubIcon (wagging tail!)

- **AnimatedMenuItem Component** - Wrapper that triggers icon animation when hovering anywhere on the menu item, not just the icon

- **More Inline Actions** - Active Terminals page (grid and list views) now shows 6 action buttons per terminal:
  - Edit Profile, Copy Session ID, Pop Out, Open in 3D Focus, View as Text, Kill Terminal
  - Context menu still available for less common actions (Detach, Open Reference)

### Fixed
- **Edit Profile Navigation** - Clicking "Edit Profile" from Terminals page now correctly navigates to Profiles section with the edit dialog open
  - Changed hash route from `#/settings-profiles` to `#/profiles` to match valid section names
  - Added hashchange listener in SettingsProfiles to detect edit parameter

- **Profile Sync** - Active Terminals page now updates in real-time when profile settings are changed:
  - Added Chrome storage listener for `profiles` changes
  - Terminals now look up profile from live profiles list instead of using stale cached data

- **DeleteIcon SVG Errors** - Fixed console errors from animating SVG path `d` and line `y1/y2` attributes:
  - Simplified animation to only lift and tilt the lid group

---

## [1.3.8] - 2025-12-30

### Fixed
- **MCP Notification Tools** - `tabz_notification_show/update/clear/list` now work correctly:
  - Fixed tree-shaking eliminating notification handlers from build (added handler registry)
  - Fixed payload `type` collision - notification template type was overwriting WebSocket message type
  - Added missing backend response handlers for notification results in `server.js`
  - Fixed `chrome.notifications.create` API call signature (always pass ID as first arg)

- **TTS German Language Detection** - Audio announcements no longer randomly speak German:
  - Removed "Multilingual" voices from `VOICE_OPTIONS` in audio generator
  - Multilingual voices auto-detect language and misidentified short phrases like tool names

---

## [1.3.7] - 2025-12-30

### Added
- **User Title Setting** - Personalize how Claude addresses you in audio announcements:
  - New "How should Claude address you?" input in Audio settings
  - Use `{title}` variable in any phrase template (e.g., "Sir, Claude ready")
  - Test Sound button now includes title in test phrase

- **AskUserQuestion Audio Event** - Get notified when Claude asks a question:
  - New "Question asked" toggle in Audio settings
  - Reads the question and available options aloud
  - Sub-toggle to enable/disable reading options
  - Template variables: `{title}`, `{profile}`, `{question}`, `{options}`

- **Plan Approval Audio Event** - Get notified when Claude presents a plan:
  - New "Plan approval" toggle in Audio settings
  - Announces when ExitPlanMode is called
  - Sub-toggle to read approval options aloud
  - Template variables: `{title}`, `{profile}`, `{options}`

- **Personality Presets** (types only) - Foundation for future voice personas:
  - Butler ("Sir"), Captain, Medieval ("My liege"), Casual presets defined

### Fixed
- **Negative Speech Rate** - Rates like "-50%" now work correctly:
  - Changed edge-tts command from `--rate -50%` to `--rate=-50%`
  - Prevents shell from interpreting negative values as flags

- **Tool Action Phrasing** - Consistent present tense for all tool announcements:
  - "Editing" instead of "Edit"
  - Added: "Asking question", "Entering plan mode", "Presenting plan", "Updating tasks"

### Changed
- **State Tracker Hook** - Now captures `permission_mode` field for plan mode detection

---

## [1.3.6] - 2025-12-30

### Added
- **Terminals Grid View** - New card-based view for Active Terminals page:
  - Toggle between Grid and Table views (persists to localStorage)
  - Cards show profile name with emoji, session ID, working dir, git branch
  - Claude status with context % progress bar
  - Recent activity history (last 5 status updates)
  - Click to switch (supports sidebar, popout windows, and 3D focus)
  - Right-click context menu for Copy Session ID, Open in 3D Focus

- **Dashboard Orphaned Sessions** - Orphaned sessions alert now on main Dashboard:
  - Shows detached terminals with Reattach/Kill actions
  - Moved from Terminals page for better visibility

- **Dashboard External Tmux Sessions** - Non-Tabz tmux sessions section:
  - Shows all tmux sessions not managed by TabzChrome
  - View as Text and Kill actions

### Changed
- **Terminals → Active Terminals** - Renamed and simplified:
  - Now shows only registered terminals (no more duplicates with orphaned)
  - Fixed filtering bug where orphaned sessions appeared in Active list
  - Removed redundant "All Tmux Sessions" section (external sessions moved to Dashboard)

- **Profile Emoji Display** - Terminal names now show full profile name with emoji (e.g., "🔧 DevOps" instead of just "DevOps")

- **Popout Window Focus** - Clicking terminals in dashboard now properly brings popout windows to front (moved logic into `switchToSession`)

---

## [1.3.5] - 2025-12-30

### Changed
- **File Picker UX Improvements**:
  - Auto-fallback to `~` when configured default path doesn't exist
  - Added "Expand All" / "Collapse All" button to quickly see all compatible files
  - Moved file picker defaults from Audio page to Files page settings dropdown

- **Profile Editor UX** - Audio and Background Media sections now always expanded (no more clicking to expand + scrolling)

- **CLAUDE.md Icon** - Now shows robot icon instead of gear (matches the 🤖 filter indicator)

---

## [1.3.4] - 2025-12-30

### Added
- **Sound Effects Volume Controls** - Separate volume for sound effects vs TTS:
  - **Global Sound Effects Volume** slider in Audio settings (default 40%)
  - **Per-effect volume** slider (0-200%) on each sound effect to balance individual sounds
  - Removed hardcoded 0.4 volume scaling - now fully configurable

- **File Picker Modal** - Reusable modal for browsing and selecting local files:
  - Opens to configurable default directories (Audio: `~/sfx`, Images: `~/Pictures`, Videos: `~/Videos`)
  - File type filtering - shows only matching files (audio, images, or videos)
  - Integrated with SoundEffectPicker - browse button now opens file picker
  - **File Picker Defaults** section in Audio settings to configure default directories

- **Audio Playback from FileTree** - Right-click audio files to play them:
  - New "Play Audio" context menu option for mp3, wav, flac, ogg, m4a, etc.
  - Play/Stop toggle with visual feedback
  - Uses global sound effects volume setting
  - Pink music icon for audio files in file tree

### Changed
- **Volume Settings Renamed** - Clarified volume controls:
  - "Volume" → "Voice Volume" (TTS announcements)
  - New "Sound Effects Volume" (preset sounds, local files, URLs)

---

## [1.3.3] - 2025-12-29

### Added
- **Chrome History API** (5 tools): `tabz_history_search`, `tabz_history_visits`, `tabz_history_recent`, `tabz_history_delete_url`, `tabz_history_delete_range` - Search and manage browsing history
- **Chrome Sessions API** (3 tools): `tabz_sessions_recently_closed`, `tabz_sessions_restore`, `tabz_sessions_devices` - Recover closed tabs, view synced devices
- **Chrome Cookies API** (5 tools): `tabz_cookies_get`, `tabz_cookies_list`, `tabz_cookies_set`, `tabz_cookies_delete`, `tabz_cookies_audit` - Debug auth, audit tracking cookies
- **CDP Emulation** (6 tools): `tabz_emulate_device`, `tabz_emulate_clear`, `tabz_emulate_geolocation`, `tabz_emulate_network`, `tabz_emulate_media`, `tabz_emulate_vision` - Responsive testing, accessibility simulation
- **Chrome Notifications API** (5 tools): `tabz_notification_show`, `tabz_notification_update`, `tabz_notification_progress`, `tabz_notification_clear`, `tabz_notification_list` - Desktop notifications with progress support

**Total MCP tools: 71** (previously 47, +24 new)

---

## [1.3.2] - 2025-12-29

### Added
- **Dashboard Profile Management** (`Settings → Profiles`) - Full profile editor in dashboard:
  - Live **TerminalPreview** component showing all 4 visual layers (panel color, media, gradient, content)
  - Profile cards with visual theme previews, category grouping, drag-drop reordering
  - Inline edit form with live preview while editing
  - **Category filter dropdown** next to search bar (multi-select by category)
  - **Edit Categories mode** - rename categories, change colors, delete (moves profiles to Uncategorized)
  - **Paste-only launch** - Terminal icon launches with command pasted but not executed (edit flags first)
  - **Reference badge** shown next to profile name, paperclip icon in action bar to open reference
  - Import/export profiles with merge or replace options

### Changed
- **Dashboard Settings Consolidation** - Unified settings under nested Settings navigation:
  - Settings now has expandable sub-items: Profiles, General, Tabz MCP, Audio
  - Collapsed sidebar shows child icons when Settings is expanded (with tooltips)
  - Removed top-level Profiles section (merged into Settings → Profiles)

- **Sidebar Modal Removed** - Profile editing moved entirely to dashboard:
  - Grid icon in sidebar header → Opens Dashboard Settings → Profiles
  - Right-click terminal tab → "Edit Profile" opens dashboard with that profile selected
  - Gear icon → Opens Dashboard Settings → General
  - Deleted: `SettingsModal.tsx`, `ProfilesTab.tsx`, `AudioTab.tsx`, `SettingsContext.tsx`, `ModalUI.tsx`, `ImportExportDialog.tsx`, `CategoryCombobox.tsx`
  - Deleted: `dashboard/sections/Profiles.tsx` (merged into SettingsProfiles)

- **Profile Cards Streamlined**:
  - Removed inline category color pickers (use Edit Categories mode instead)
  - Action buttons: Launch, Paste-only, Edit, Copy, Reference, Star, Delete

---

## [1.3.1] - 2025-12-29

### Added
- **Quick Preview/Reset on Audio Events** - EventCard header now has Preview and Reset icons for quick access:
  - Preview button (speaker icon) plays the event sound without expanding settings
  - Reset button (rotate icon) appears only when event has customizations
  - Both actions still available at bottom of expanded settings too

### Fixed
- **MCP Audio Tools Missing** - Rebuilt tabz-mcp-server to include `audio.js` (was missing from dist):
  - `tabz_speak`, `tabz_list_voices`, `tabz_play_audio` now available (47 total tools)
- **README Images Broken** - Moved screenshots from `docs/archive/` to `docs/screenshots/` (GitHub doesn't follow symlinks)
- **Docs Archive Naming** - Renamed `github-pages-2024` → `github-pages` (project started in 2025)

### Changed
- **tabz-guide Skill Updated** - Tool count updated from 29 → 47, added Audio/TTS category
- **Unified Logging** - All backend and browser logs now write to single `logs/unified.log`:
  - Backend module logs (`[Server]`, `[PTY]`, `[TerminalRegistry]`, etc.)
  - Browser console logs (`[Browser:Terminal]`, `[Browser:Sessions]`, etc.)
  - Consistent format: `[HH:MM:SS] LEVEL [Module] message`
  - `dev.sh` logs window now uses lnav (if installed) for interactive filtering
  - Included lnav format file (`backend/logs/tabz-log.json`) for enhanced parsing
  - lnav filtering examples: `:filter-in \[Server\]`, `:filter-in ERROR`, `:filter-out \[buildFileTree\]`

- **Default Profiles** - Consolidated log profiles:
  - Replaced "Backend Logs" and "Browser Logs" profiles with single "Logs" profile
  - Dynamically finds log path from running tmux session (works for any install location)
  - Uses lnav if available, falls back to `tail -f`

### Added
- lnav optional dependency check in `dev.sh` with install instructions

---

## [1.3.0] - 2025-12-28

### Added
- **Audio Dashboard** - Full-featured audio configuration at Dashboard → Audio (`#/audio`):
  - Moved from sidebar Settings modal to dedicated dashboard section
  - **Per-event overrides** - Each event (ready, tools, context warnings) can customize voice, rate, and pitch
  - **Phrase templates** - Custom announcement text with variables: `{profile}`, `{tool}`, `{filename}`, `{count}`, `{percentage}`
  - **Sound effects** - Play sounds instead of or alongside TTS (built-in presets, URLs, or local file paths)
  - **Word substitutions** - Replace specific words with sound effects (e.g., "Bash" → chime sound)
  - New components: `EventCard` (expandable with "Custom" badge), `PhraseEditor` (clickable variable chips, live preview), `SoundEffectPicker`, `WordSubstitutionEditor`
  - Backend: `/api/audio/local-file` route for serving local audio files

- **Clickable File Paths in Terminal** - File paths in terminal output are now clickable:
  - Detects absolute paths (`/home/...`), tilde paths (`~/...`), and relative paths (`./...`, `../...`)
  - Supports line:column suffixes (`file.tsx:42:10`)
  - Clicking opens the file in the Dashboard Files viewer
  - Uses xterm.js `registerLinkProvider` API

- **Profiles Dashboard Improvements**:
  - **Search bar in header** - Moved to header row to save vertical space
  - **Multi-select category filter** - Filter button with dropdown supporting multiple category selection
  - **Profile title styling** - Uses profile's theme foreground color and font family
  - **Full-width command preview** - Commands use card width with natural truncation, brighter text
  - **Consistent card heights** - Button row always at bottom with min-height
  - **Drag handle top-left** - Moved from bottom action bar to top-left corner on hover
  - **Clickable reference badge** - Reference links in top-right corner, click to open URL or file

- **Script Runner in File Tree** - Right-click scripts to run, check, or explain them:
  - **Run Script** - Spawns new terminal to execute the script
  - **Check / Dry Run** - Syntax check without execution (e.g., `bash -n`, `python -m py_compile`)
  - **Explain Script** - Uses Claude to explain what the script does (inline in context menu)
  - Supports: `.sh`, `.py`, `.js`, `.ts`, `.rb`, `.pl`, `.php`, `.go`, `.rs`, `Makefile`, `package.json`
  - Scripts run from their parent directory for correct relative path resolution

- **AI Endpoint** - `POST /api/ai/explain-script`:
  - Reads script file and sends to `claude -p` for explanation
  - Returns concise 2-3 sentence summary with potential side effects
  - 60 second timeout, 10KB file limit for token safety

- **Clickable `tabz:paste` Links in Documentation** - Added paste-to-terminal links for:
  - API docs (`docs/API.md`, `plugins/tabz-guide/.../api-endpoints.md`)
  - CLI reference docs (`claude-code.md`, `gemini-cli.md`, `codex.md`)

- **Plugins Filter in Dashboard Files** - New filter to manage Claude Code plugins:
  - Shows all installed plugins grouped by marketplace (my-plugins, tabz-chrome, etc.)
  - Toggle switches to enable/disable individual plugins (requires `/restart` to apply)
  - Filter by: enabled/disabled status, component type (skill, agent, command, hook, mcp), scope (global/local)
  - Component badges show counts (e.g., "Agent (5)") - clickable to open first file of that type
  - Expandable plugins with chevron to reveal individual component files
  - Search plugins by name or ID
  - Backend endpoints: `GET /api/plugins`, `POST /api/plugins/toggle`

### Refactored
- **Files.tsx component extraction** - Split 1,048-line monolith into focused components (now 590 lines):
  - `fileViewerUtils.ts` (113 lines) - Utility functions (icon colors, relative time, CSV/frontmatter parsing)
  - `ImageViewer.tsx` (107 lines) - Image display with zoom controls and dimensions
  - `VideoViewer.tsx` (50 lines) - Video player with download button
  - `CsvViewer.tsx` (88 lines) - CSV table with sticky headers
  - `MarkdownViewer.tsx` (237 lines) - Markdown with frontmatter, tabz: protocol links, syntax highlighting

### Changed
- **dev.sh stash behavior** - Now asks before dropping stashed changes:
  - Shows what files are modified before stashing
  - Prompts "Drop these changes after update?" with default No
  - If No, restores stash after build (preserves uncommitted work)
  - If Yes, drops stash as before (for build artifacts)

### Fixed
- **Dashboard hash navigation** - Clicking reference links now navigates between sections:
  - App listens for `hashchange` events to switch active section
  - FilesContext listens for `hashchange` to open files from URL path parameter
  - Fixes: clicking profile reference badge now opens file in Files viewer

- **Popout window close handling** - Closing a popout terminal window now properly:
  - Removes the tab from sidebar (was stuck showing "Popped Out" placeholder)
  - Detaches terminal to appear as ghost/orphan for respawning
  - Uses reliable `chrome.windows.onRemoved` listener instead of unreliable `beforeunload` + `sendBeacon`
  - "Return to Sidebar" button returns terminal without detaching

- **Audio mute toggle now respects TTS from slash commands** - The sidebar header mute button now properly silences:
  - TTS from `/api/audio/speak` (used by slash commands like `/ctthandoff`)
  - Direct audio playback from `/api/audio/play`
  - Bug: handlers in useEffect captured stale `audioGlobalMute` state
  - Fix: uses ref to access current mute value in stale closures

### Added
- **Video/Image Background Support** - Set videos or images as terminal backgrounds:
  - Per-profile background media settings (image/video/none)
  - Supports local files (~/path) and URLs (http/https)
  - Video formats: mp4, webm, mov (loops silently, muted)
  - Image formats: jpg, png, gif, webp, svg
  - Opacity slider to control media visibility (0-100%)
  - Media layer renders behind gradient overlay
  - Graceful fallback to panel color if file not found

- **Media Serving Endpoint** - `GET /api/media?path=<filepath>`:
  - Resolves `~` to home directory
  - Validates file extension for security
  - Supports video seeking with range requests
  - Caches media for 1 hour

---
