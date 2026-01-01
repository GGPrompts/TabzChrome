# PLAN.md - TabzChrome Roadmap

**Last Updated**: January 1, 2026
**Current Version**: 1.3.11

---

## Active Work: Codebase Simplification

**Branch:** `simplify-codebase`
**Status:** Wave 1-2 complete, Wave 3 pending

### Wave 3: Larger Refactors (Pending)

#### Consolidate Profile Management
**Impact:** -800 LOC | **Effort:** Medium-High

Same profile CRUD in 3 places (2,793 LOC total). Create shared `ProfileManager` component.
Reference: `~/projects/Tabz` for cleaner theme/customization UI.

#### Unify Messaging Systems
**Impact:** Type safety | **Effort:** Medium

Three overlapping systems (Chrome, WebSocket, Broadcast). Create single transformation layer.

### Wave 4: Nice to Have

- Extract `DropdownBase` component (-200 LOC)
- Extract terminal reconciliation to pure testable function
- Document magic timing values (150ms, 300ms)

### Audit Reference

Detailed analysis in `audit-results/`:
- `SUMMARY.md` - Executive summary
- `architecture.md` - Overall architecture
- `backend-api.md` - API/MCP analysis
- `components.md` - UI component duplication map
- `hooks-state.md` - State management review

---

## MCP Tool Expansion

**Goal**: With dynamic tool discovery (`mcp-cli`), there's no context cost for having many tools. Expand MCP capabilities using Chrome Extension APIs.

### Planned Tools

#### `chrome.cookies` - Authentication Debugging
**Permission**: `"cookies"` + host patterns

| Tool | Description |
|------|-------------|
| `tabz_get_cookies` | Get all cookies for a domain |
| `tabz_check_auth` | Check if logged into a service (has session cookie) |
| `tabz_clear_cookies` | Clear cookies for a domain (logout) |

#### `chrome.history` - Research Assistant
**Permission**: `"history"`

| Tool | Description |
|------|-------------|
| `tabz_search_history` | Search browsing history by text/date |
| `tabz_frequent_sites` | Get most visited sites |
| `tabz_delete_history` | Remove specific URLs from history |

### Lower Priority / Complex

| Tool | Description | Why Lower |
|------|-------------|-----------|
| `tabz_monitor_websockets` | Track WebSocket messages | Niche use case |
| `tabz_set_breakpoint` | Debug JavaScript | Complex, better in DevTools |
| `tabz_capture_auth_flow` | Debug OAuth flows | Complex setup |

---

## Documentation & Testing

### TODO
- [ ] **Clean archived docs** - Personal paths remain in `docs/archived/*` files
- [ ] Add homepage/bugs fields to backend/package.json
- [ ] **Cross-platform testing matrix**
  - [ ] Windows 11 + WSL2 + Chrome (current setup)
  - [ ] Native Ubuntu + Chrome
  - [ ] Native macOS + Chrome
  - [ ] Verify all MCP tools work on each platform

---

## Dashboard File Tree Improvements

**Status**: Planning

### Context Menu for File Tree
- [ ] **Right-click context menu** - Disable Chrome default menu on tree only (not viewers)
- [ ] **Menu options**:
  - Copy Path / Copy Relative Path
  - Copy @filename (Claude/Codex style)
  - Favorite (files AND folders - currently files only)
  - Set as Working Directory (folders)
  - Spawn Terminal Here (folders) → submenu with profiles
  - Send to Terminal (files)
  - Open in Viewer (files)
- Reference: `~/projects/opustrator/frontend/src/components/EnhancedFileViewer.tsx` (lines 750-1270)

### Floating Command Composer
- [ ] **Pop-out composer window** - More space for editing prompts before sending
- [ ] **Features**:
  - Multi-line editor for complex prompts
  - Target selection: existing terminals OR spawn new
  - "New Terminal" option with profile/directory/name selection
  - Mode: Execute (Enter) / Paste only / Paste + focus
  - Non-interactive mode (--print, one-shot)
  - Close after send option
- [ ] **Implementation**: `chrome.windows.create({ type: 'popup' })` for true floating window

### Command Queue (Replace History) ✅ DONE (v1.3.11)
- [x] **Replace unused history with queue** - Stage multiple prompts before dispatch
- [x] **Queue features**:
  - Add prompts with different targets per item
  - Run sequentially or all at once (sequential, parallel modes)
  - Edit before dispatch (inline editing)
  - Reorder (drag-and-drop or up/down buttons)
  - "Run Next", "Run All Sequential", "Run All Parallel" buttons
- [x] **Keyboard shortcuts** - Ctrl+Q to queue, Ctrl+Shift+Enter to run next
- [ ] **Pairs with floating composer** - Compose → Add to Queue → Dispatch when ready (future)

### Other File Tree Ideas
- [ ] Keyboard navigation (arrow keys, Enter to open)
- [ ] Fuzzy search (Cmd+P style)
- [ ] Git status indicators (modified/untracked)
- [ ] Drag file path to terminal

---

## Tmux MCP Server

**Status**: Researching

Existing projects to evaluate:
- [jonrad/tmux-mcp](https://github.com/jonrad/tmux-mcp) - POC, basic control
- [nickgnd/tmux-mcp](https://github.com/nickgnd/tmux-mcp) - Claude Desktop integration
- [michael-abdo/tmux-claude-mcp-server](https://github.com/michael-abdo/tmux-claude-mcp-server) - Hierarchical Claude orchestration

**Why tmux API > send-keys**: Terminals can be in states that don't accept keys (vim, TUI apps). API calls always work.

Potential tools:
| Tool | Description |
|------|-------------|
| `tmux_list_sessions` | List all sessions with metadata |
| `tmux_capture_pane` | Get pane contents (what you see) |
| `tmux_run_shell` | Run command, wait for exit, return output |
| `tmux_wait_for_prompt` | Wait until shell is idle |
| `tmux_get_pane_pid` | Get foreground process |

---

## Agent Coordination Board

**Status**: Idea

Could use **GitHub Projects** as shared kanban for agent coordination:
```bash
# Agent posts note to project board
gh project item-create 4 --owner GGPrompts \
  --title "Worker-1: Refactor complete" \
  --body "Split into 8 modules, tests pass"
```

Benefits: No infrastructure to build, works from CLI, real-time sync, mobile app.

---

## Future Enhancements

### Video Background Optimizations

**Status**: Planned

Power-saving and performance improvements for video backgrounds:

- [ ] **Idle timeout** - Pause video after configurable inactivity (5/10/30 min)
  - Track last keypress/mouse activity
  - Fade to static gradient when idle
  - Resume on any input
  - Setting: "Video idle timeout: Off / 5 min / 10 min / 30 min"

- [ ] **Pause inactive tabs** - Only play video on the active terminal tab
  - Use `isActive` prop to control playback
  - Reduces CPU/GPU usage with many tabs open

- [ ] **Volume slider** - For videos with audio (ambient sounds)
  - Download option: video-only vs video+audio
  - Volume control 0-100% alongside opacity slider
  - Good for rain/fireplace/coffee shop ambience

- [ ] **Background gallery** - Browse and apply backgrounds easily
  - Scan `~/Videos/terminal-backgrounds/` for local files
  - Thumbnail previews
  - "Use as background" action from file viewer

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
- **Complex theming UI** - 6 curated themes + dark/light toggle is enough

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

## Adding New MCP Tools Checklist

When adding new MCP tools, update these files:

### Implementation (Required)
1. `extension/manifest.json` - Add Chrome permission (e.g., `"bookmarks"`, `"history"`)
2. `tabz-mcp-server/src/tools/<category>.ts` - Create tool file with Zod schemas
3. `tabz-mcp-server/src/types.ts` - Add TypeScript types
4. `tabz-mcp-server/src/client.ts` - Add HTTP client functions
5. `tabz-mcp-server/src/index.ts` - Import and register tool group
6. `backend/routes/browser.js` - Add REST endpoints
7. `backend/server.js` - Add WebSocket response handlers (e.g., `browser-bookmarks-tree-result`)
8. `extension/background/background.ts` - Add message handlers calling Chrome APIs

### Documentation (Required)
9. `extension/components/settings/types.ts` - Add to `MCP_TOOLS` array (sidebar settings)
10. `extension/dashboard/sections/McpPlayground.tsx` - Add to `MCP_TOOLS` array (dashboard)
11. `tabz-mcp-server/MCP_TOOLS.md` - Add to overview table + detailed documentation
12. `CHANGELOG.md` - Add version entry
13. `PLAN.md` - Update status from "Planned" to "Done"

### Version Sync
14. `package.json` - Bump version
15. `extension/manifest.json` - Bump version (must match package.json)
16. `PLAN.md` - Update "Current Version"

### Skill References (Optional but recommended)
17. `.claude/skills/tabz-guide/references/mcp-tools.md` - Update tool count + categories
18. `plugins/tabz-guide/skills/tabz-guide/references/mcp-tools.md` - Sync copy
19. `README.md` - Update tool count
20. `docs/pages/mcp-tools.html` - Update tool count + add table rows

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For pre-public development history (v2.0-v2.7), see [CHANGELOG-archive.md](CHANGELOG-archive.md).
