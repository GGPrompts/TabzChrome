# React Dashboard Plan

This document tracks the development of the new React-based dashboard to replace the existing HTML pages in `backend/public/`.

## Current Status

**Branch:** `feature/react-dashboard`
**Last Updated:** 2025-12-18

### ✅ Completed
- Dashboard scaffold with 6 sections (Home, Profiles, Terminals, API Playground, MCP Settings, Settings)
- Profiles section with grid/list view, search, category filtering
- Profiles section drag-drop reordering (profiles and categories)
- Profiles section theme gradient backdrops on cards
- Profiles section default profile indicator (star badge)
- Profiles section auto-updates when Chrome storage changes
- Working directory selector (syncs with sidepanel via Chrome storage)
- Kill active terminals (per-row + bulk selection)
- Reattach orphaned sessions (per-row + bulk selection)
- Chrome messaging for spawning (no auth tokens needed)
- All Tmux Sessions view with AI tool detection
- System info panel (Node version, platform, memory stats)
- Connection status indicator (backend connected/disconnected)
- MCP Settings section (tool configuration, presets, URL settings, MCP Inspector launcher)
- Settings section (working directory, API token info, theme preview)
- API Playground health checks (green/red indicators per endpoint, 60s refresh)
- API-spawned terminals now show name in Ready status (fallback when no profile)

### 📋 Future (Low Priority)
- WebSocket integration for real-time updates
- Active terminals preview in Home section

---

## Overview

The new dashboard is a **Chrome extension page** (not backend-served) that provides a modern React + TypeScript + Tailwind interface for managing TabzChrome terminals and profiles.

**Location:** `extension/dashboard/`
**URL:** `chrome-extension://[id]/dashboard/index.html`

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite + crx | Build tool (bundled with extension) |
| Tailwind CSS v4 | Styling |
| Lucide React | Icons |
| Chrome APIs | Storage, messaging (no auth needed) |

## Project Structure

```
extension/dashboard/
├── index.html              # Entry point
├── main.tsx                # React root
├── App.tsx                 # Main layout with collapsible sidebar
├── styles/
│   └── globals.css         # Theme variables + utilities
├── sections/
│   ├── Home.tsx            # Dashboard overview + system info
│   ├── Profiles.tsx        # Profile launcher grid/list + drag-drop
│   ├── Terminals.tsx       # Terminal management
│   ├── ApiPlayground.tsx   # REST API testing + health checks
│   ├── McpPlayground.tsx   # MCP tool config + Inspector launcher
│   └── Settings.tsx        # Dashboard settings
├── hooks/
│   └── useDashboard.ts     # Chrome messaging + API utilities
├── components/             # Reusable UI components
└── lib/                    # Utilities
```

## How to Use

1. Build extension: `npm run build`
2. Reload extension in Chrome
3. Click the Dashboard icon in the sidepanel header
4. Or manually navigate to `chrome-extension://[id]/dashboard/index.html`

---

## Status Comparison: Old vs New Dashboard

### Home Section

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| Stats grid (terminals, uptime, memory, orphaned) | ✓ | ✓ | ✅ Complete |
| Auto-refresh stats | ✓ 10s | ✓ 10s | ✅ Complete |
| Quick spawn buttons | ✓ | ✓ | ✅ Complete |
| Backend version display | ✓ | ✓ | ✅ Complete |
| **Working directory selector** | ✓ dropdown with recent dirs | ✓ (in Profiles section) | ✅ Complete |
| **System info table** | ✓ (node, platform, heap, rss) | ✓ | ✅ Complete |
| **Connection status indicator** | ✓ live status | ✓ (header icon) | ✅ Complete |
| **Active terminals preview** | ✓ first 5 | ✗ | ❌ Missing (separate section) |

### Terminals Section

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| Active terminals list | ✓ full table | ✓ with checkboxes | ✅ Complete |
| Orphaned sessions warning | ✓ | ✓ | ✅ Complete |
| Kill orphaned sessions | ✓ | ✓ | ✅ Complete |
| Bulk select orphans | ✓ | ✓ | ✅ Complete |
| **Bulk select active terminals** | ✓ checkboxes | ✓ | ✅ Complete |
| **Kill active terminals** | ✓ per-row + bulk | ✓ | ✅ Complete |
| **Reattach orphans** | ✓ | ✓ per-row + bulk | ✅ Complete |
| **All Tmux Sessions view** | ✓ shows external sessions | ✓ | ✅ Complete |
| **AI Tool detection** | ✓ detects claude/gemini etc | ✓ | ✅ Complete |

### Profiles Section (NEW - not in old dashboard)

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| Profiles launcher | ✗ | ✓ | ✅ New feature |
| Grid/List view toggle | ✗ | ✓ | ✅ New feature |
| Category filtering | ✗ | ✓ | ✅ New feature |
| Search | ✗ | ✓ | ✅ New feature |
| Click to spawn | ✗ | ✓ | ✅ New feature |
| Emoji icon extraction | ✗ | ✓ | ✅ New feature |
| **Working directory selector** | ✗ | ✓ dropdown with recent dirs | ✅ New feature |
| **Inherit global workingDir** | ✗ | ✓ profiles inherit if empty | ✅ New feature |
| **Drag-drop profile reordering** | ✗ | ✓ with visual indicators | ✅ New feature |
| **Drag-drop category reordering** | ✗ | ✓ with visual indicators | ✅ New feature |
| **Theme gradient backdrops** | ✗ | ✓ cards use profile theme | ✅ New feature |
| **Default profile indicator** | ✗ | ✓ star badge | ✅ New feature |
| **Auto-update on storage change** | ✗ | ✓ real-time sync | ✅ New feature |

### API Playground Section (NEW)

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| HTTP method selector | ✗ | ✓ | ✅ New feature |
| Request headers editor | ✗ | ✓ | ✅ New feature |
| Request body editor | ✗ | ✓ | ✅ New feature |
| Response viewer | ✗ | ✓ | ✅ New feature |
| TabzChrome endpoint presets | ✗ | ✓ | ✅ New feature |
| **Health check indicators** | ✗ | ✓ green/red dots per endpoint | ✅ New feature |
| **Auto-refresh health (60s)** | ✗ | ✓ | ✅ New feature |

### Architecture Differences

| Aspect | Old HTML | New React |
|--------|----------|-----------|
| Location | Backend (`localhost:8129/`) | Extension page (`chrome-extension://`) |
| Auth for spawn | Required (X-Auth-Token) | Not needed (Chrome messaging) |
| Profile access | REST API | Direct Chrome storage |
| Real-time updates | WebSocket | Polling (no WebSocket) |
| Build | Static HTML | Bundled with extension |

---

## Features to Add (from old dashboard)

### High Priority - COMPLETED ✅

1. ~~**Working Directory Selector**~~ ✅
   - Dropdown with recent directories
   - Custom path input
   - Syncs with extension header selector (via Chrome storage listener)
   - Persists in Chrome storage

2. ~~**Reattach Orphaned Sessions**~~ ✅
   - Button to reattach orphans to new tabs
   - Bulk reattach selected

3. ~~**Kill Active Terminals**~~ ✅
   - Add kill button per terminal row
   - Bulk selection and kill

### Medium Priority

4. ~~**All Tmux Sessions View**~~ ✅
   - Show all tmux sessions (not just TabzChrome)
   - Detect AI tools (claude, gemini, codex)
   - Source indicator (Tabz vs External vs AI tool)
   - Git branch display
   - Kill any session

5. **System Information Panel**
   - Node.js version
   - Platform
   - Memory heap/RSS
   - Backend URL/WebSocket URL

6. **Connection Status Indicator**
   - Show connected/disconnected in header
   - Could use WebSocket for real-time updates

### Low Priority

7. **Active Terminals Preview in Home**
   - Show first 5 terminals in Home section
   - Link to Terminals section for full list

8. **WebSocket Integration**
   - Real-time terminal spawn/close notifications
   - Live stats updates
   - Connection status

---

## Planned Sections - COMPLETED

### MCP Settings ✅
- [x] List all available TabzChrome MCP tools
- [x] Toggle individual tools on/off
- [x] Category-based organization with collapse/expand
- [x] Search/filter tools by name or description
- [x] Quick presets (Minimal, Standard, Full)
- [x] Token usage estimates per tool
- [x] URL settings for tabz_open_url (YOLO mode, custom domains)
- [x] Save config to backend (restart Claude Code to apply)
- [x] MCP Inspector launcher (test tools interactively at localhost:6274)

### Settings ✅
- [x] Default working directory (syncs with sidepanel)
- [x] Recent directories quick select
- [x] API token documentation (file location, example curl)
- [x] Theme preview (disabled, coming soon)
- [x] Resource links (GitHub, legacy dashboard)

---

## Source Inspiration

| Source | What |
|--------|------|
| `~/projects/personal-homepage` | Bookmarks → Profiles, API Playground, hooks |
| `~/projects/portfolio-style-guides` | 45+ shadcn/ui components, Admin Dashboard layout |
| `backend/public/*.html` | Original dashboard features |
| TabzChrome Extension | Theme variables, profile schema |

---

## File References

| File | Purpose |
|------|---------|
| `extension/dashboard/App.tsx` | Main layout, sidebar navigation, connection status |
| `extension/dashboard/sections/Home.tsx` | Stats, quick actions, system info |
| `extension/dashboard/sections/Profiles.tsx` | Profile launcher |
| `extension/dashboard/sections/Terminals.tsx` | Terminal/orphan management |
| `extension/dashboard/sections/ApiPlayground.tsx` | API testing + health checks |
| `extension/dashboard/sections/McpPlayground.tsx` | MCP tool config + Inspector launcher |
| `extension/dashboard/sections/Settings.tsx` | Dashboard settings |
| `extension/dashboard/hooks/useDashboard.ts` | Chrome messaging, API helpers |
| `extension/dashboard/styles/globals.css` | Theme CSS variables |
| `vite.config.extension.ts` | Build config (includes dashboard entry) |

---

## Changelog

### 2025-12-18 (session 5)
- Enhanced Profiles section with drag-drop reordering:
  - Drag profiles to reorder within and across categories
  - Drag category headers to reorder categories
  - Visual drop indicators (left/right for grid, above/below for list)
  - Uncategorized stays pinned at bottom
- Added theme gradient backdrops to profile cards (grid and list view)
- Added default profile indicator (star badge) matching sidebar
- Added Chrome storage listener for auto-updating when profiles change
- Renamed "MCP Playground" to "MCP Settings" in navigation
- Added MCP Inspector launcher to dashboard and sidebar:
  - Spawns terminal with `npx @modelcontextprotocol/inspector`
  - Opens interactive tool testing UI at localhost:6274
- Fixed GitHub link in dashboard footer (was pointing to wrong repo)

### 2025-12-18 (session 4)
- Added API Playground health check indicators:
  - Green/red/gray dots next to each endpoint preset
  - GET endpoints checked on page load and every 60 seconds
  - POST/DELETE endpoints show neutral (gray) indicator
- Fixed terminal display names for API-spawned sessions:
  - Sidebar now uses `session.name` as fallback when no profile exists
  - API-spawned terminals show "✓ Terminal Name" instead of "✓ Ready"
- Removed Prompts section (prompt library will be at ggprompts.com instead)
- Created prompts-section-design.md spec for future reference

### 2025-12-18 (session 3)
- Added System Information panel to Home section (Backend URL, WebSocket URL, Version, Node.js, Platform, Memory Heap/RSS)
- Added connection status indicator to sidebar header (green wifi = connected, red = disconnected)
- Created MCP Playground section with full tool configuration:
  - Category-based tool organization (Core, Interaction, Screenshot, etc.)
  - Individual tool toggles with token estimates
  - Quick presets (Minimal, Standard, Full)
  - Search/filter functionality
  - URL settings for tabz_open_url (YOLO mode, custom domains)
- Created Settings section with:
  - Working directory management (syncs with sidepanel via Chrome storage)
  - API token documentation and example curl command
  - Theme preview (disabled, coming soon)
  - Resource links

### 2025-12-18 (session 2)
- Added working directory selector to Profiles section
- Working directory now syncs bidirectionally between dashboard and sidepanel
- Added Chrome storage change listener for real-time sync
- Profiles without workingDir now inherit globalWorkingDir
- Added kill buttons for active terminals (per-row + bulk)
- Added reattach buttons for orphaned sessions (per-row + bulk)
- Added selection checkboxes for active terminals
- Updated useDashboard hook with killSessions and reattachSessions
- Added All Tmux Sessions view with AI tool detection
- Shows source indicator (Tabz/claude-code/External)
- Displays git branch for each session
- Kill button for any tmux session

### 2024-12-18
- Initial scaffold with 4 sections (Home, Profiles, Terminals, API Playground)
- Converted from backend-served to extension page
- Dashboard button in sidepanel now opens extension page
- No auth required - uses Chrome messaging for spawning
- Profiles load from Chrome storage directly
