# React Dashboard Plan

This document tracks the development of the new React-based dashboard to replace the existing HTML pages in `backend/public/`.

## Overview

The new dashboard provides a modern React + TypeScript + Tailwind interface served from the TabzChrome backend. It replaces the vanilla HTML/JS pages with a component-based architecture that can share code with the Chrome extension sidepanel.

**Branch:** `feature/react-dashboard`

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool |
| Tailwind CSS | Styling |
| Lucide React | Icons |

## Project Structure

```
dashboard/
├── index.html              # Entry point
├── main.tsx                # React root
├── App.tsx                 # Main layout with collapsible sidebar
├── postcss.config.js       # Tailwind PostCSS config
├── styles/
│   └── globals.css         # Theme variables + utilities
├── sections/
│   ├── Home.tsx            # Dashboard overview
│   ├── Profiles.tsx        # Profile launcher grid/list
│   ├── Terminals.tsx       # Terminal management
│   └── ApiPlayground.tsx   # REST API testing
├── components/             # Reusable UI components
├── hooks/                  # Custom React hooks
└── lib/                    # Utilities
```

## NPM Scripts

```bash
npm run dev:dashboard      # Dev server at localhost:5174/dashboard/
npm run build:dashboard    # Builds to backend/public/dashboard/
npm run build:all          # Builds extension + dashboard
```

---

## Completed

### Infrastructure
- [x] Vite config (`vite.config.dashboard.ts`)
- [x] TypeScript config (`tsconfig.dashboard.json`)
- [x] Tailwind CSS setup with theme variables
- [x] NPM scripts for dev/build
- [x] Main App layout with collapsible sidebar

### Sections

#### Home (Dashboard)
- [x] Stats grid (active terminals, uptime, memory, orphaned sessions)
- [x] Auto-refresh every 10 seconds
- [x] Quick action buttons (spawn terminals)
- [x] Backend version display
- [x] Error state handling

#### Profiles Launcher
- [x] Fetch profiles from `/api/browser/profiles`
- [x] Grid view with category grouping
- [x] List view alternative
- [x] Search filtering
- [x] Category pill filters
- [x] Click-to-launch via `/api/spawn`
- [x] Emoji icon extraction from profile names
- [x] Loading and error states

#### Terminals Management
- [x] Active terminals list from `/api/terminals`
- [x] Orphaned sessions warning panel
- [x] Checkbox selection for bulk operations
- [x] Kill individual orphaned sessions
- [x] Kill selected (bulk) operation

#### API Playground
- [x] HTTP method selector (GET, POST, PUT, DELETE)
- [x] URL input with method color coding
- [x] Headers editor (add/remove/toggle)
- [x] Request body editor (for POST/PUT)
- [x] Response viewer with status, time, copy button
- [x] TabzChrome endpoint presets sidebar

---

## Planned

### Phase 1: Polish & Components

#### Profiles Enhancements
- [ ] Context menu (right-click) for profile actions
- [ ] Drag-to-reorder profiles
- [ ] Edit profile inline (opens modal)
- [ ] Delete profile confirmation
- [ ] Import/export profiles
- [ ] Favorite profiles (pin to top)

#### UI Components (from portfolio-style-guides)
- [ ] Dialog/Modal component
- [ ] Select dropdown
- [ ] Tooltip
- [ ] Toast notifications
- [ ] Badge variants

#### Settings Section
- [ ] Theme selector (matches extension themes)
- [ ] API token management
- [ ] Default working directory
- [ ] Background style options

### Phase 2: MCP Playground

#### MCP Tool Browser
- [ ] List available MCP servers (`mcp-cli servers`)
- [ ] Browse tools per server (`mcp-cli tools`)
- [ ] Search/filter tools by name/description
- [ ] Tool detail view with JSON schema

#### MCP Tool Tester
- [ ] Select tool from browser
- [ ] Auto-generate form from JSON schema
- [ ] Execute tool (`mcp-cli call`)
- [ ] Display results with JSON viewer
- [ ] Save tool call history

### Phase 3: Advanced Features

#### Terminal Embedding
- [ ] Embed xterm.js terminals in dashboard (experimental)
- [ ] Quick terminal preview on hover
- [ ] Full terminal view in modal

#### Monitoring
- [ ] Real-time terminal activity chart
- [ ] Memory usage over time
- [ ] WebSocket connection status
- [ ] Console log viewer (from MCP)

#### Integration
- [ ] Share hooks/utils with extension sidepanel
- [ ] Unified theme provider
- [ ] Profile sync between dashboard and extension

---

## Source Inspiration

Components and patterns adapted from:

| Source | What |
|--------|------|
| `~/projects/personal-homepage` | Bookmarks section (→ Profiles), API Playground, useTerminalExtension hook |
| `~/projects/portfolio-style-guides` | 45+ shadcn/ui components, Admin Dashboard layout, Theme system |
| TabzChrome Extension | Theme variables, profile schema, API endpoints |

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Backend status, uptime, memory |
| `/api/terminals` | GET | List active terminal sessions |
| `/api/browser/profiles` | GET | Fetch profiles from Chrome storage |
| `/api/tmux/orphaned-sessions` | GET | List orphaned tmux sessions |
| `/api/spawn` | POST | Create new terminal |
| `/api/tmux/kill-session` | POST | Kill a tmux session |

---

## File References

| New File | Purpose |
|----------|---------|
| `vite.config.dashboard.ts` | Vite build config for dashboard |
| `tsconfig.dashboard.json` | TypeScript config for dashboard |
| `dashboard/App.tsx` | Main layout component |
| `dashboard/sections/Home.tsx` | Dashboard overview section |
| `dashboard/sections/Profiles.tsx` | Profile launcher section |
| `dashboard/sections/Terminals.tsx` | Terminal management section |
| `dashboard/sections/ApiPlayground.tsx` | API testing section |
| `dashboard/styles/globals.css` | Theme CSS variables |

---

## Notes

- Dashboard is served from backend at `/dashboard/` path
- Shares Tailwind config with extension (same theme variables)
- Can run dev server independently on port 5174
- Production build outputs to `backend/public/dashboard/`
