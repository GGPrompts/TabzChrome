# PLAN.md - TabzChrome Roadmap

**Last Updated**: January 2, 2026
**Current Version**: 1.4.0

---

## Canvas Migration (Active)

**Goal**: Migrate tabz-canvas (separate React app) INTO TabzChrome to be served from backend at `http://localhost:8129/canvas`.

**Branch**: `canvas`

### Why Migrate?
1. Eliminates CORS/proxy complexity
2. Direct access to WebSocket, profiles, themes - no auth token dance
3. Still accessible by Claude via Tabz MCP (regular webpage, NOT extension page)
4. Simplifies deployment - one codebase

### Migration Tasks

| Task | Status | Beads ID |
|------|--------|----------|
| Terminal state sync API (canvas state, ownership, transfer endpoints) | ✅ DONE | c6610b0 |
| Send to Canvas button (sidebar → canvas) | ✅ DONE | 6df7c0e |
| Setup canvas directory & Vite build | TODO | TabzChrome-7xy |
| Migrate React components (App, Terminal, FileCard, Toolbar) | TODO | TabzChrome-ogu |
| Add Express static route `/canvas` | TODO | TabzChrome-jyn |
| ~~Integrate with profile/theme systems~~ | N/A | - |
| Send to Sidebar button (canvas → sidebar) | TODO | TabzChrome-qie |
| Drag-drop from sidebar to canvas | TODO | TabzChrome-zg3 |

### Source Files (from tabz-canvas)
```
src/App.tsx                       → canvas/src/App.tsx (refactor to use hooks)
src/stores/canvasStore.ts         → canvas/src/hooks/useCanvasViewport.ts (rewrite)
src/stores/profileStore.ts        → DELETE (use direct API calls)
src/components/CanvasTerminal.tsx → canvas/src/components/CanvasTerminal.tsx
src/components/CanvasFileCard.tsx → canvas/src/components/CanvasFileCard.tsx
src/components/Toolbar.tsx        → canvas/src/components/Toolbar.tsx

NEW: canvas/src/hooks/useCanvasTerminals.ts (fetch from backend API)
```

### New Dependencies
- **None!** All deps already in TabzChrome (React, xterm.js, Tailwind)
- ~~`zustand`~~ - NOT NEEDED (see State Management below)
- ~~`motion`~~ - NOT USED in tabz-canvas (was in package.json but no imports)

### State Management (No Zustand)

Canvas is a regular webpage at `/canvas`, not an extension page. State is split:

| Data | Storage | Why |
|------|---------|-----|
| Terminal positions/sizes | Backend API (`/api/canvas/terminals`) | Already implemented in c6610b0 |
| Terminal ownership | Backend API | Sidebar ↔ Canvas transfer |
| Viewport pan/zoom | localStorage | Personal preference, no sync needed |
| Profiles/themes | Backend API (`/api/profiles`) | Direct access, no CORS |

**Hooks to create:**
- `useCanvasViewport()` - Pan/zoom with localStorage persistence
- `useCanvasTerminals()` - Fetch/update via existing REST API

### Architecture
```
canvas/                     (NEW - separate Vite app)
├── src/
│   ├── App.tsx             Pan/zoom canvas viewport
│   ├── hooks/
│   │   ├── useCanvasViewport.ts   localStorage for pan/zoom
│   │   └── useCanvasTerminals.ts  REST API for terminal state
│   └── components/
│       ├── CanvasTerminal.tsx  xterm.js draggable cards
│       ├── CanvasFileCard.tsx  File viewer cards
│       └── Toolbar.tsx         Canvas controls
├── dist/                   Built output
└── vite.config.ts

backend/server.js
└── app.use('/canvas', express.static('canvas/dist'))

Existing backend (already done):
├── /api/canvas/terminals           GET - list terminals with canvas state
├── /api/canvas/terminals/:id       PATCH - update position/size
├── /api/canvas/terminals/:id/transfer  POST - move between views
└── /api/canvas/terminals/batch     POST - batch updates
```

### Design Decisions

**Canvas = Display Surface, Not Terminal Manager**
- Canvas does NOT spawn terminals - sidebar handles that
- Terminals arrive via: "Send to Canvas" button OR drag-drop from sidebar
- Canvas only needs: pan/zoom, position/resize terminals, "Return to Sidebar" button
- No profile picker, no spawn UI needed on canvas
- Simplifies Toolbar to just viewport controls (reset zoom, fit all, etc.)

### Issues Fixed in tabz-canvas
- [x] Passive wheel event listener errors
- [x] Terminal drag bouncing at different zoom levels
- [x] ~~Profile selection falls back to hardcoded theme~~ N/A - canvas doesn't need profile selection

### Future: Architecture Unification

**Goal**: Consolidate extension pages → backend-served pages + minimal sidebar

**Phase 1 (Current)**: Canvas as backend page
```
Extension pages:        Backend pages:
├── Sidebar             ├── /canvas ← NEW
├── Dashboard
└── New Tab
```

**Phase 2**: Dashboard → Backend
```
Extension pages:        Backend pages:
├── Sidebar             ├── /canvas
├── New Tab             └── /dashboard ← MIGRATE
```
- Migrate `chrome.storage` settings → backend `/api/settings`
- Dashboard becomes `localhost:8129/dashboard`
- Can open Canvas + Dashboard as tabs in same window

**Phase 3**: Settings → Sidebar
```
Extension pages:        Backend pages:
├── Sidebar             ├── /canvas
│   ├── Terminals       └── /files (optional)
│   ├── Settings ← MOVE
│   └── Profiles ← MOVE
└── New Tab
```
- All config accessible from sidebar (collapsible sections or tabs)
- Dashboard becomes optional/deprecated
- Sidebar = full control center

**Phase 4**: Canvas with Left Panel
```
┌──────────────┬────────────┬──────────────────────┐
│   Sidebar    │ Left Panel │   Canvas Workspace   │
│  (extension) │            │                      │
│              │ 📁 Files   │  [Terminal] [File]   │
│  • Terminals │ 🔀 Git     │                      │
│  • Settings  │            │  [Terminal]          │
│  • Profiles  │ (drag →)   │                      │
└──────────────┴────────────┴──────────────────────┘
```
- Files/Git panel in Canvas for drag-drop workflow
- Sidebar for quick access + settings
- Canvas for spatial arrangement

**Benefits of Unification**:
- Single source of truth (backend storage)
- Drag-drop between Files ↔ Canvas
- Simpler extension (less chrome.* dependency)
- All views share same data without sync issues

---

## MCP Tool Expansion

**Goal**: With dynamic tool discovery (`mcp-cli`), there's no context cost for having many tools. Expand MCP capabilities using Chrome Extension APIs.

### Completed (v1.3.5+)

- **Cookies** (5 tools): `tabz_cookies_get`, `tabz_cookies_list`, `tabz_cookies_set`, `tabz_cookies_delete`, `tabz_cookies_audit`
- **History** (5 tools): `tabz_history_search`, `tabz_history_visits`, `tabz_history_recent`, `tabz_history_delete_url`, `tabz_history_delete_range`
- **Sessions** (3 tools): `tabz_sessions_recently_closed`, `tabz_sessions_restore`, `tabz_sessions_devices`
- **Emulation** (6 tools): Device, geolocation, network, media, vision simulation
- **Notifications** (4 tools): Desktop notifications with progress support

### Future Ideas (Lower Priority)

| Tool | Description | Why Lower |
|------|-------------|-----------|
| `tabz_monitor_websockets` | Track WebSocket messages | Niche use case |
| `tabz_set_breakpoint` | Debug JavaScript | Complex, better in DevTools |
| `tabz_capture_auth_flow` | Debug OAuth flows | Complex setup |

---

## Documentation & Testing

### Completed
- [x] **Archived docs cleaned** - `docs/archived/` contains only `.gitkeep`
- [x] **Magic timing documented** - 150ms, 300ms, 1000ms in `docs/lessons-learned/terminal-rendering.md`

### TODO
- [ ] Add homepage/bugs fields to backend/package.json
- [ ] **Cross-platform testing matrix**
  - [ ] Windows 11 + WSL2 + Chrome (current setup)
  - [ ] Native Ubuntu + Chrome
  - [ ] Native macOS + Chrome
  - [ ] Verify all MCP tools work on each platform

---

## Bug Fixes

- [ ] **Invalid working directory notification** - When spawning terminal with non-existent directory:
  - Currently fails silently or uses previous valid directory
  - Add notification popup warning user the directory doesn't exist
  - Offer to create directory or use fallback

---

## Dashboard File Tree Improvements

**Status**: Partial

### Completed
- [x] **Right-click context menu** - `FileTreeContextMenu.tsx` with 15+ options
  - Copy Path / Copy Relative Path
  - Copy @filename (Claude/Codex style)
  - Favorite (files AND folders)
  - Set as Working Directory (folders)
  - Spawn Terminal Here (folders) with profile submenu
  - Send to Terminal (files)
  - Open in Viewer (files)
  - TTS read file

### TODO
- [ ] Keyboard navigation (arrow keys, Enter to open)
- [ ] Fuzzy search (Cmd+P style)
- [ ] Git status indicators (modified/untracked)
- [ ] Drag file path to terminal

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

### Chrome URL Overrides (v1.3.11)

- [x] **New Tab Override** - Replace Chrome's new tab with TabzChrome Dashboard
  - Beautiful clock widget with Orbitron LED font
  - Profile cards for quick terminal launch
  - Active terminals widget with status
  - Command bar for search/URLs/commands
  - Recent directories quick access
  - Dark theme, terminal-inspired aesthetic
  - Uses `chrome_url_overrides.newtab` in manifest

#### New Tab Page - Completed
- [x] **Dashboard button** - Settings icon opens full dashboard
- [x] **Configurable profile grid** - Bookmarks on profiles page
- [x] **Active terminals rich status** - `StatusWidget.tsx` with Claude status, context %, pane titles

#### New Tab Page - TODO
- [ ] **Weather widget** - Use free weather API from another project
  - Minimal display: temp, conditions, icon
  - Cache results to avoid API spam
- [ ] **Quick notes terminal** - Spawn popup terminal with micro/default editor
  - Notes tagged by working directory
  - Quick capture for project-specific thoughts
  - Could store in `~/.tabz-notes/{project}/`

### Waiting on Chrome Updates

- [ ] **`sidePanel.close()` (Chrome 141+)** - Add "Close Terminal Sidebar" to context menu. Currently only `open()` exists and requires user gesture. [Chrome API docs](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### GitHub FAB
- **Fork + Clone Combo** - Fork first, then clone user's fork (proper OSS contribution flow)

### Other Features
- **Tab Context Menu** - Right-click for Rename, Close, Close Others
- **Chrome Web Store Publication** - Privacy policy, screenshots, version management

---

## Agent Coordination

**Status**: Using beads (`bd`) for issue tracking

See `.beads/` directory and run `bd ready` to see open work items.

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
