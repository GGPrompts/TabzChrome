# TabzChrome Recent Changes

## 1.2.12 (Dec 29, 2025)

**24 New Chrome API MCP Tools (47 → 71 total):**

*History API (5 tools):*
- `tabz_history_search` - Search browsing history by keyword and date range
- `tabz_history_visits` - Get visit details for a specific URL
- `tabz_history_recent` - Get most recent N history entries
- `tabz_history_delete_url` - Remove a specific URL from history
- `tabz_history_delete_range` - Remove history within a date range

*Sessions API (3 tools):*
- `tabz_sessions_recently_closed` - List recently closed tabs/windows
- `tabz_sessions_restore` - Restore a closed tab/window by sessionId
- `tabz_sessions_devices` - List tabs open on other synced Chrome devices

*Cookies API (5 tools):*
- `tabz_cookies_get` - Get specific cookie by name and URL
- `tabz_cookies_list` - List cookies for a domain
- `tabz_cookies_set` - Create or update a cookie
- `tabz_cookies_delete` - Remove a specific cookie
- `tabz_cookies_audit` - Analyze page cookies (find trackers)

*CDP Emulation (6 tools):*
- `tabz_emulate_device` - Mobile/tablet viewport simulation
- `tabz_emulate_clear` - Reset all emulation overrides
- `tabz_emulate_geolocation` - Spoof GPS coordinates
- `tabz_emulate_network` - Throttle network (3G, offline, etc.)
- `tabz_emulate_media` - Print mode, dark mode preference
- `tabz_emulate_vision` - Colorblindness simulation

*Notifications API (5 tools):*
- `tabz_notification_show` - Display desktop notification
- `tabz_notification_update` - Modify existing notification
- `tabz_notification_clear` - Dismiss a notification
- `tabz_notification_list` - Get all active notifications
- `tabz_notification_progress` - Update notification progress

---

## 1.2.11 (Dec 24, 2025)

**Tab Groups MCP Tools (8 new tools):**
- `tabz_list_groups` - List all tab groups with their tabs
- `tabz_create_group` - Create group with title and color
- `tabz_update_group` - Change title, color, or collapsed state
- `tabz_add_to_group` - Add tabs to existing group
- `tabz_ungroup_tabs` - Remove tabs from groups
- `tabz_claude_group_add` - Add tab to purple "Claude Active" group
- `tabz_claude_group_remove` - Remove from Claude group
- `tabz_claude_group_status` - Check Claude group status

**Claude Active Highlighting:**
- When working with tabs, call `tabz_claude_group_add` to mark them with a purple "Claude" group
- Visual feedback in Chrome's tab bar shows which tabs Claude is using

---

## 1.2.8 (Dec 23, 2025)

**Chrome Debugger MCP Tools:**
- `tabz_get_dom_tree` - Full DOM tree including shadow DOM
- `tabz_profile_performance` - Page timing, memory, DOM metrics
- `tabz_get_coverage` - JS/CSS code coverage analysis

**Browser Automation UX:**
- **"Send Element to Chat"** - Right-click any element to capture unique CSS selector
- **Visual Feedback** - Elements glow when MCP tools interact:
  - 🟢 Green for `tabz_click`
  - 🔵 Blue for `tabz_fill`
  - 🟣 Purple for `tabz_get_element`

---

## 1.1.16 (Dec 21, 2025)

**New plugins and agents:**
- **tabz-guide plugin** - Progressive disclosure help system
- **tui-expert agent** - Spawn and control TUI tools (btop, lazygit, lnav) via tmux
- **terminal-tools skill** - Structured patterns for TUI tool interaction

**Fixes:**
- State-tracker hooks properly reference `hooks.json` file
- State-tracker robustness with atomic writes, handles corrupted JSON
- 3D Focus settings sync with sidebar WebGL/Canvas toggle

---

## 1.1.15 (Dec 20, 2025)

**Context window tracking:**
- Tabs show context % on far right (e.g., "62%")
- Color-coded: green (<50%), yellow (50-74%), red (75%+)
- Audio alerts at 50% and 75% thresholds
- Requires StatusLine hook (see state-tracker plugin examples)

**WebGL renderer fixes:**
- Fully opaque backgrounds for diffs and box-drawing
- All themes use solid colors matching gradient starts

---

## 1.1.14 (Dec 20, 2025)

**3D Focus Mode:**
- Right-click tab → "🧊 Open in 3D Focus"
- Terminal floats in 3D starfield
- Scroll to zoom (1.5x-25x), mouse to orbit, F2 to lock camera
- Preserves theme, font size, font family
- Auto-returns to sidebar when 3D tab closes

---

## 1.1.13 (Dec 19, 2025)

**View as Text:**
- Right-click tab → "📄 View as Text"
- Full scrollback as copyable text (no truncation)
- Save as Markdown with metadata (timestamp, working directory, git branch)
- Dashboard Terminals page: Eye icon next to each terminal

---

## 1.1.10-12 (Dec 18, 2025)

**Dashboard enhancements:**
- Drag-drop profile reordering
- Theme gradient previews on cards
- Default profile star indicator
- Auto-sync with sidebar changes
- MCP Inspector launcher

---

## Key Architecture Changes

| Change | Description |
|--------|-------------|
| **Tmux resize pattern** | Only send resize on window resize, not container changes |
| **WebGL backgrounds** | Opaque instead of transparent for rendering stability |
| **State-tracker** | Preserves claude_session_id for context linking |

---

For complete version history, read `CHANGELOG.md` in the TabzChrome installation.
