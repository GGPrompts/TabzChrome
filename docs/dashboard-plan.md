# React Dashboard Plan

This document tracks the development of the new React-based dashboard to replace the existing HTML pages in `backend/public/`.

## Overview

The new dashboard is a **Chrome extension page** (not backend-served) that provides a modern React + TypeScript + Tailwind interface for managing TabzChrome terminals and profiles.

**Branch:** `feature/react-dashboard`
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
│   ├── Home.tsx            # Dashboard overview
│   ├── Profiles.tsx        # Profile launcher grid/list
│   ├── Terminals.tsx       # Terminal management
│   └── ApiPlayground.tsx   # REST API testing
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
| **Working directory selector** | ✓ dropdown with recent dirs | ✗ | ❌ Missing |
| **System info table** | ✓ (node, platform, heap, rss) | ✗ | ❌ Missing |
| **WebSocket connection indicator** | ✓ live status | ✗ | ❌ Missing |
| **Active terminals preview** | ✓ first 5 | ✗ | ❌ Missing (separate section) |

### Terminals Section

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| Active terminals list | ✓ full table | ✓ simplified list | ⚠️ Partial |
| Orphaned sessions warning | ✓ | ✓ | ✅ Complete |
| Kill orphaned sessions | ✓ | ✓ | ✅ Complete |
| Bulk select orphans | ✓ | ✓ | ✅ Complete |
| **Bulk select active terminals** | ✓ checkboxes | ✗ | ❌ Missing |
| **Kill active terminals** | ✓ per-row + bulk | ✗ | ❌ Missing |
| **Reattach orphans** | ✓ | ✗ | ❌ Missing |
| **All Tmux Sessions view** | ✓ shows external sessions | ✗ | ❌ Missing |
| **AI Tool detection** | ✓ detects claude/gemini etc | ✗ | ❌ Missing |

### Profiles Section (NEW - not in old dashboard)

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| Profiles launcher | ✗ | ✓ | ✅ New feature |
| Grid/List view toggle | ✗ | ✓ | ✅ New feature |
| Category filtering | ✗ | ✓ | ✅ New feature |
| Search | ✗ | ✓ | ✅ New feature |
| Click to spawn | ✗ | ✓ | ✅ New feature |
| Emoji icon extraction | ✗ | ✓ | ✅ New feature |

### API Playground Section (NEW)

| Feature | Old HTML | New React | Status |
|---------|----------|-----------|--------|
| HTTP method selector | ✗ | ✓ | ✅ New feature |
| Request headers editor | ✗ | ✓ | ✅ New feature |
| Request body editor | ✗ | ✓ | ✅ New feature |
| Response viewer | ✗ | ✓ | ✅ New feature |
| TabzChrome endpoint presets | ✗ | ✓ | ✅ New feature |

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

### High Priority

1. **Working Directory Selector**
   - Dropdown with recent directories
   - Custom path input
   - Syncs with extension header selector
   - Persists in Chrome storage

2. **Reattach Orphaned Sessions**
   - Button to reattach orphans to new tabs
   - Bulk reattach selected

3. **Kill Active Terminals**
   - Add kill button per terminal row
   - Bulk selection and kill

### Medium Priority

4. **All Tmux Sessions View**
   - Show all tmux sessions (not just TabzChrome)
   - Detect AI tools (claude, gemini, codex)
   - Source indicator (Tabz vs External)
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

## Planned Sections (Future)

### MCP Playground
- [ ] List available MCP servers
- [ ] Browse tools per server
- [ ] Search/filter tools
- [ ] Auto-generate form from JSON schema
- [ ] Execute tool and show results

### Settings
- [ ] Theme selector
- [ ] Default working directory
- [ ] API token display (for external tools)

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
| `extension/dashboard/App.tsx` | Main layout, sidebar navigation |
| `extension/dashboard/sections/Home.tsx` | Stats, quick actions |
| `extension/dashboard/sections/Profiles.tsx` | Profile launcher |
| `extension/dashboard/sections/Terminals.tsx` | Terminal/orphan management |
| `extension/dashboard/sections/ApiPlayground.tsx` | API testing |
| `extension/dashboard/hooks/useDashboard.ts` | Chrome messaging, API helpers |
| `extension/dashboard/styles/globals.css` | Theme CSS variables |
| `vite.config.extension.ts` | Build config (includes dashboard entry) |

---

## Changelog

### 2024-12-18
- Initial scaffold with 4 sections (Home, Profiles, Terminals, API Playground)
- Converted from backend-served to extension page
- Dashboard button in sidepanel now opens extension page
- No auth required - uses Chrome messaging for spawning
- Profiles load from Chrome storage directly
