<!--
CHANGELOG ROTATION POLICY:
When this file exceeds 500 lines, move older versions to CHANGELOG-archive.md.
Keep the most recent 3-4 major versions in the main file.
-->

# Changelog

All notable changes to Tabz - Chrome Edition will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For older versions (1.1.x, 1.0.x, and pre-public 2.x), see [CHANGELOG-archive.md](CHANGELOG-archive.md).

---

## [1.2.22] - 2025-12-26

### Fixed
- **Duplicate audio in popouts** - Popout windows no longer play audio announcements (sidebar handles all audio)
- **Theme sync for popouts** - Dark mode changes now propagate to popout terminal windows
- **Theme sync for 3D Focus** - 3D Focus now uses `useTerminalSessions` to get session appearance overrides
- **Customize menu in 3D Focus** - Per-session theme customizations now work in 3D Focus mode
- **Panel color in popouts/3D** - Container backgrounds now respect profile's `panelColor` setting

### Changed
- 3D Focus connects to background worker to receive session data updates
- Popout and 3D Focus listen for Chrome storage changes for `isDark` preference

---

## [1.2.21] - 2025-12-26

### Added
- **Single-Terminal Popout Mode** - Popout windows now show only one terminal with minimal UI:
  - No tab bar, no chat bar, no header clutter - just the terminal
  - Fixes display corruption when multiple windows rendered the same terminal
  - Each popout is a dedicated view of one terminal

- **Pop Out Context Menu** - Right-click terminal tab → "🪟 Pop Out" option:
  - Creates standalone popup window for that terminal
  - Sidebar shows 🪟 placeholder while terminal is popped out
  - Click tab in sidebar to focus the popout window

- **Popout Window Controls** - Two-button header in popout windows:
  - ↗️ **Return to sidebar** - Closes popout, terminal stays attached
  - 👻 **Detach** - Closes popout and detaches terminal (becomes ghost in sidebar)

- **POST /api/agents/:id/detach** - New backend endpoint for `navigator.sendBeacon` on window close

### Fixed
- **Duplicate xterm instances** - Popouts no longer create conflicting terminal connections
- **Return to sidebar** - Now properly clears poppedOut state without detaching

---

## [1.2.20] - 2025-12-25

### Added
- **Window Management MCP Tools** - 7 new tools for browser window control (37 → 44 total tools):
  - `tabz_list_windows` - List all Chrome windows with dimensions and state
  - `tabz_create_window` - Create new browser windows (normal or popup)
  - `tabz_update_window` - Resize, move, minimize, maximize, focus windows
  - `tabz_close_window` - Close a window and all its tabs
  - `tabz_get_displays` - Get monitor info for multi-monitor layouts
  - `tabz_tile_windows` - Auto-arrange windows in horizontal/vertical/grid layouts
  - `tabz_popout_terminal` - Pop out sidebar terminal to standalone popup window

- **Terminal Popout Support** - Run terminals in standalone popup windows without duplicate extension issues:
  - All popup windows share the same extension instance
  - Single WebSocket connection to backend
  - No terminal session conflicts
  - Use `tabz_create_window` with `url: "/sidepanel/sidepanel.html"` and `type: "popup"`

- **Multi-Monitor Layouts** - Position windows across monitors with `tabz_get_displays` and `tabz_tile_windows`

- **Save to Profile in Customize Popover** - Quick customizations now persist:
  - Green save icon (💾) in the customize popover header
  - Saves current appearance (theme, gradient, panel color, transparency, font) to the profile
  - All future terminals using that profile inherit the saved appearance

### Changed
- **Extension permissions** - Added `system.display` permission for monitor detection
- **MCP Settings UI** - Added "Windows" category to MCP Playground and Settings modal

### Fixed
- **Dashboard Profile Cards** - Cards now match terminal appearance with full theme support:
  - Uses 3-layer background system (panel color → gradient overlay → content)
  - Respects `backgroundGradient` override, `panelColor`, and `transparency` settings
  - Previously only used theme's default gradient, ignoring profile customizations

---

## [1.2.19] - 2025-12-25 (simplify-codebase branch)

### Changed
- **Codebase simplification Wave 1** - Comprehensive audit and cleanup:
  - Removed 221 unused npm packages (@dnd-kit/*, immer, react-resizable, patch-package, happy-dom, vite-plugin-web-extension, jest)
  - Extracted `useOutsideClick` hook - replaced 7 duplicate useEffect patterns (~90 LOC removed)
  - Extracted shared utilities to `extension/shared/utils.ts`: `API_BASE`, `getEffectiveWorkingDir()`, `compactPath()`/`expandPath()`
  - Deleted stale `backend/jest.config.js` (vitest is used instead)

- **Codebase simplification Wave 2** - Major refactoring across 8 commits:
  - **MCP client layer removed** (`9f255b4`) - Tools now call backend directly (~1,300 LOC removed, `tabz-mcp-server/src/client/` deleted)
  - **useAudioNotifications split** (`bf5ac5e`) - Monolithic 544 LOC hook → 85 LOC with focused modules:
    - `useAudioPlayback.ts` - Audio API, debouncing
    - `useStatusTransitions.ts` - Status change detection
    - `useToolAnnouncements.ts` - Tool announcement logic
    - `constants/audioVoices.ts` - VOICE_POOL, thresholds
    - `utils/textFormatting.ts` - stripEmojis, etc.
  - **Backend audio-generator extracted** (`3f2cbac`) - Shared audio generation module (~250 LOC saved)
  - **WebSocket boilerplate extracted** (`b2dcbea`) - `makeBrowserRequest()` helper in browser.js (~1,000 LOC saved)
  - **useChromeSetting hook extracted** (`b3bef41`) - Reusable Chrome storage listener pattern (~100 LOC saved)
  - **useDragDrop hook extracted** (`da04357`) - Shared drag-drop state management (~50 LOC saved)
  - **StorageData interface expanded** (`fed9f93`) - All storage keys now typed
  - **SettingsContext extracted** (`8570f66`) - Reduced prop drilling in SettingsModal

### Fixed
- **tui-tools.js bug** - Fixed call to non-existent `register()` method
- **Dead code removal** - Removed unused offline menu system (~60 LOC):
  - `backend/scripts/offline-menu.js`
  - `backend/scripts/offline-terminal-menu.go`
  - `backend/scripts/offline-terminal-ui.js`
  - `backend/scripts/offline-terminal-simple.sh`

### Added
- **Audit documentation** - Comprehensive codebase analysis in `audit-results/`:
  - `SUMMARY.md` - Executive summary and priority rankings
  - `architecture.md` - Overall architecture assessment
  - `backend-api.md` - API/MCP duplication analysis
  - `components.md` - UI component duplication map
  - `hooks-state.md` - State management review

---

## [1.2.18] - 2025-12-25

### Added
- **Reference docs for profiles** - Quick reference cards in `docs/reference/` for TUI tools and AI CLIs:
  - Claude Code, Gemini CLI, Codex - flags, modes, MCP config
  - LazyGit, Yazi, btop, lnav - key bindings, common options
  - Each doc includes `tabz:spawn` and `tabz:paste` buttons for quick launch
  - Attach to profiles via `reference` field (shows 📎 badge)

### Fixed
- **Profile import preserves all fields** - Import handler now includes all profile properties:
  - `backgroundGradient`, `panelColor`, `transparency` - theme customization
  - `reference` - attached reference doc/URL
  - Previously these fields were stripped during import
- **Profiles API returns full data** - `/api/browser/profiles` now returns complete profile objects instead of only id/name/command/workingDir/category
- **Dashboard file references** - Clicking profile reference (📎) now correctly opens file in dashboard Files section

### Changed
- **Profile schema documentation** - Updated `discover-profiles.md` with new profile fields
- **Files API tilde expansion** - Image and video routes now support `~/` paths

---

## [1.2.17] - 2025-12-25

### Fixed
- **Light mode now works properly** - Panel colors and gradients adapt correctly:
  - Panel colors auto-convert to light equivalents (black → white, navy → light blue, etc.)
  - Light gradients are now actual light colors (white/cream/pastels) instead of slightly-lighter-darks
  - Customize popover dropdowns adapt to light/dark mode (white bg with dark text in light mode)
- **Terminal tab ready state styling** - Checkmark (✓) is now green while profile name stays white (was coloring both green)

---

## [1.2.16] - 2025-12-25

### Changed
- **Simplified light/dark mode for gradients** - Light mode now shows muted/softer versions of the same gradient (not bright white):
  - Each gradient has a `lightGradient` property - a softer variant that retains the color character
  - Example: Amber Warmth in light mode becomes a soft brown (#5d4840 → #3a3633) instead of cream
  - Removed 8 bright light-only gradients (pure-white, soft-cream, paper, etc.)
  - Light mode is now usable with Claude Code's light syntax highlighting themes
- **Reduced panel color presets** - Removed bright colors (white, cream, light gray) that don't work well with terminal readability
- **20 gradient options** (down from 28) - All gradients now work in both light and dark mode

---

## [1.2.15] - 2025-12-25

### Added
- **Separated theme system** - Text colors and backgrounds are now independently customizable:
  - **Text Colors** (11 themes): Control terminal text/ANSI colors - high-contrast, dracula, ocean, neon, amber, matrix, cyberpunk, vaporwave, synthwave, aurora, holographic
  - **Background Gradient** (28 options): Separate from text colors - dark-neutral, pure-black, ocean-depths, vaporwave-dream, etc.
  - **Panel Color** (13 presets): Base solid color shown through gradient transparency
  - **Transparency Slider** (0-100%): Controls gradient visibility over panel color
- **Footer customize button** (🎨) - Floating button in bottom-right of each terminal:
  - Opens popover with text colors, background, panel color, transparency controls
  - Changes are per-terminal and don't save to profile (temporary overrides)
  - Purple indicator shows when terminal has active overrides
  - Reset button to return to profile defaults
- **5 new aesthetic themes** from original Tabz:
  - Cyberpunk - Neon cyan/magenta with glow
  - Vaporwave - Retro pink/cyan aesthetic
  - Synthwave - 80s sunset vibes
  - Aurora - Northern lights inspired
  - Holographic - Iridescent green-teal shimmer

### Changed
- "Color Theme" renamed to "Text Colors" in UI for clarity
- Profile settings now include Background Gradient, Panel Color, and Transparency
- All 11 text themes have both dark and light variants

---

## [1.2.14] - 2025-12-25

### Added
- **Markdown terminal buttons** - Interactive `tabz:` links in markdown files viewed in the dashboard:
  - `tabz:spawn?cmd=npm%20test` - Spawn terminal with command (uses default profile theme)
  - `tabz:spawn?profile=claude` - Spawn specific profile by name
  - `tabz:queue?text=git%20status` - Queue text to chat input (user selects terminal)
  - `tabz:paste?text=pwd` - Paste directly into active terminal
  - Buttons render with colored text/borders: green (spawn), blue (queue), orange (paste)
  - Smart profile matching: exact name, emoji-stripped, starts-with
  - See `docs/terminal-buttons-demo.md` for examples
- **Profile reference indicators** - Paperclip icon shows which profiles have attached reference docs:
  - Visible in sidebar Settings → Profiles list
  - Visible in Dashboard → Profiles section (grid and list views)
  - Hover to see the full reference URL/path

---

## [1.2.13] - 2025-12-24

### Added
- **Dashboard Active Terminals table UI** - Complete redesign of the terminals list:
  - Proper table layout with resizable columns (drag column edges to resize)
  - Columns: Status, Name, Activity, Context %, Path, Branch, Created, Actions
  - Rich Claude activity display showing tool + file details (e.g., "✏️ Edit: settings.tsx")
  - Context % properly centered and color-coded
- **Hover tooltip on terminal rows** - Hover for ~400ms to see detailed info:
  - Terminal name, session ID with copy button, working directory, git branch
  - Current Claude status with context percentage
  - Recent activity history (last 12 tool uses with timestamps)
  - Created time
- **Right-click context menu** - Right-click terminal rows for quick actions:
  - Copy Session ID (for conductor/tmux workflows)
  - Open in 3D Focus
- **3D Focus button in Actions** - New cube icon to open terminal in 3D Focus mode
- **Copy session ID in tooltip** - Small copy icon next to session name for quick access

### Changed
- Backend now returns `details` field in claudeState for rich tool information
- Activity column shows file names being edited, commands being run, patterns being searched

---

## [1.2.12] - 2025-12-24

### Added
- **File Actions dropdown menu** - Clean ⋮ dropdown replacing cluttered toolbar buttons
  - Consolidates: Copy Path, Copy @Path, Favorite, Pin, Paste to Terminal, Read Aloud, Open in Editor
  - Works in file viewer toolbar and via right-click on file tabs
  - TTS loading indicator shows spinner while generating audio for long files
- **Send to Chat in toolbar** - Quick icon button to send file content to sidebar chat
- **Category dropdown for profiles** - New combobox-style category selector when editing profiles
  - Shows all existing categories in a dropdown menu
  - "Create new category..." option for adding custom categories
  - Filters existing categories as you type when creating
  - Replaces the old datalist input that only showed suggestions while typing
- **Paste-only launch for profiles** - New clipboard icon on dashboard profile cards/list
  - Spawns terminal and types the command without pressing Enter
  - Useful for TUIs and AI CLIs where you want to add flags before running
  - Only appears on profiles that have a start command
- **Profile reference links** - Add a URL or file path to any profile for quick access to docs
  - Set in profile edit form (Reference field)
  - Right-click terminal tab → "Open Reference" to open
  - URLs open in new Chrome tab, file paths open in dashboard Files section

### Changed
- **Cleaner file viewer toolbar** - Now shows only Copy and Send icons plus ⋮ menu
- **Filtered file lists context menu** - Fixed missing right-click menu on favorites/prompts/claude filtered views

---

## [1.2.11] - 2025-12-24

### Added
- **Tab Groups MCP tools** - 8 new tools for managing Chrome tab groups:
  - `tabz_list_groups` - List all tab groups with their tabs
  - `tabz_create_group` - Create a new tab group with title and color
  - `tabz_update_group` - Update group title, color, or collapsed state
  - `tabz_add_to_group` - Add tabs to an existing group
  - `tabz_ungroup_tabs` - Remove tabs from their groups
  - `tabz_claude_group_add` - Add tab to purple "Claude Active" group
  - `tabz_claude_group_remove` - Remove tab from Claude group
  - `tabz_claude_group_status` - Get status of Claude Active group
- **Claude Active tab highlighting** - When Claude works with a tab, it can be added to a distinctive purple "Claude" group for visual feedback in the tab bar
- **Tab Groups in Settings** - All 8 new tools appear in the MCP Tools settings page

### Changed
- MCP tool count increased from 29 to 37
- Updated MCP_TOOLS.md with full documentation for all tab group tools

---

## [1.2.10] - 2025-12-23

### Added
- **Shared ActiveTerminalsList component** - New reusable component for terminal lists:
  - Used by both Dashboard (Home) and Terminals pages for consistent display
  - Shows Claude status indicators (Ready, Using Bash, Thinking, etc.)
  - Shows context percentage with color coding (green < 50%, yellow 50-74%, orange 75-89%, red 90%+)
  - Shows git branch and AI tool badges
  - Clickable terminals to switch to that tab in sidebar
- **Context percentage in dashboard** - Terminal lists now show Claude's context window usage
  - Backend updated to include `context_pct` in `/api/tmux/sessions/detailed` endpoint
  - Looks up context data via `claude_session_id` from state files
- **Click-to-switch terminals** - Click any Tabz terminal in dashboard to switch to it in sidebar
  - New `SWITCH_TO_TERMINAL` message type for dashboard → sidebar communication
  - Works from both Home page and Terminals page

### Changed
- **Working directory display** - Now uses `~` instead of full home path (`/home/user` → `~`)
- **Badge styling for accessibility** - All badges now use dark background with colored text/border:
  - Tabz: Green text + green border on dark bg
  - External: Blue text + blue border on dark bg
  - claude-code: Orange text + orange border on dark bg (was purple)
- **Source column simplified** - Now shows just "Tabz" or "External" based on session origin
  - Removed redundant AI tool display (already shown in AI Tool column)
- **Optimized column widths** - All Tmux Sessions table columns adjusted for better space usage

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
