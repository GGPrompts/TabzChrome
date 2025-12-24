# TabzChrome Recent Changes

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
