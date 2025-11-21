# PWA Command Center Architecture

**Vision:** Restructure Tabz into a central command center with session manager sidebar and focused popout workspaces.

**Date:** November 12, 2025
**Status:** Planning phase

---

## Executive Summary

Transform Tabz from a tab-based terminal manager into a **PWA command center** where:
- **Main window** = Central dashboard with session manager sidebar (shows ALL sessions)
- **Popout windows** = Focused workspaces with single terminal (splittable)
- **Closing popouts** = Detach (not kill) - sessions stay alive
- **OS window management** = PowerToys, Win11 Snap Layouts, multi-monitor

This architecture scales better, provides central visibility, and leverages OS-native window management instead of custom solutions.

---

## Current vs. Proposed Architecture

### Current Architecture (Tab-Based)
```
┌──────────────────────────────────────────────────┐
│ [Tab 1] [Tab 2] [Tab 3] ... [+]                 │
├──────────────────────────────────────────────────┤
│                                                  │
│         Active Terminal                          │
│                                                  │
│                                                  │
│                                                  │
└──────────────────────────────────────────────────┘

Issues:
- Hard to see all sessions at once
- Tabs get crowded with 10+ terminals
- Closing window = potentially killing sessions
- Multi-window management is complex
```

### Proposed Architecture (Command Center)
```
Main Window (PWA):
┌──────────────────────────────────────────────────┐
│ Tabz - Command Center                           │
├────────────┬─────────────────────────────────────┤
│ Sessions   │ Dashboard / Welcome                 │
│            │                                     │
│ 🤖 Claude  │ ┌─────────────────────────────┐   │
│ • a2t ●    │ │ Active Sessions: 5          │   │
│ • xyz ○    │ │ Detached: 3                 │   │
│   [↗ Open] │ │ Orphaned: 2                 │   │
│            │ └─────────────────────────────┘   │
│ 📁 TUI     │                                   │
│ • tfe ●    │ Quick Actions:                    │
│ • plx ●    │ [+ Spawn New]                     │
│   [↗ Open] │ [🔄 Scan Sessions]                │
│            │ [⚙️ Settings]                      │
│ 💻 Bash    │                                   │
│ • kbl ●    │ Recent Activity:                  │
│ • src ●    │ • tt-cc-a2t: idle (2m ago)       │
│   [↗ Open] │ • tt-bash-xyz: active            │
│            │                                   │
│ 🗑️ Orphans │                                   │
│ • old-1 ○  │                                   │
│   [Attach] │                                   │
│            │                                   │
│ [+ Spawn]  │                                   │
└────────────┴─────────────────────────────────────┘

Popout Windows (Focused):
┌──────────────────────────┐  ┌──────────────────────────┐
│ tt-cc-a2t               ✕│  │ tt-bash-xyz             ✕│
├──────────────────────────┤  ├──────────────────────────┤
│                          │  │ ┌──────────────────────┐ │
│   Claude Code Terminal   │  │ │  Split 1: Bash       │ │
│                          │  │ ├──────────────────────┤ │
│                          │  │ │  Split 2: Logs       │ │
│                          │  │ ├──────────────────────┤ │
│                          │  │ │  Split 3: Monitoring │ │
└──────────────────────────┘  └──┴──────────────────────┴─┘
    Single terminal              Vertical splits
    (can split)                  (unlimited rows)

Benefits:
✅ Central visibility of ALL sessions
✅ Popouts are simple, focused workspaces
✅ Use OS window management (PowerToys, Snap Layouts)
✅ Closing popout = detach (session stays alive)
✅ Scales to dozens of sessions
```

---

## Core Principles

### 1. **Main Window = Command Center**
- Never closes (or reopens to last state)
- Shows ALL sessions (attached, detached, orphaned)
- Central hub for spawning, attaching, managing
- Dashboard with stats and quick actions
- PWA-installable for native-like experience

### 2. **Popout Windows = Focused Workspaces**
- One terminal per window (can split vertically)
- Closing window = detach (not kill)
- Leverage OS window management
- Simple, distraction-free
- Perfect for multi-monitor setups

### 3. **Session Persistence**
- All sessions live in tmux (survive browser close)
- Detached sessions remain visible in sidebar
- Easy to reattach from command center
- No accidental session loss

### 4. **OS Integration**
- PWA manifest for app-like experience
- Use PowerToys FancyZones for window management
- Use Win11 Snap Layouts for quick positioning
- Multi-monitor support via native OS

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser / PWA                         │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Main Window (Command Center) - ?window=main       │   │
│  │ ┌──────────┬────────────────────────────────────┐ │   │
│  │ │ Sidebar  │ Dashboard                          │ │   │
│  │ │          │                                    │ │   │
│  │ │ Sessions │ • Stats                            │ │   │
│  │ │ List     │ • Quick actions                    │ │   │
│  │ │          │ • Recent activity                  │ │   │
│  │ │ • a2t ● │ • Spawn new                        │ │   │
│  │ │ • xyz ○ │                                    │ │   │
│  │ │ • tfe ● │                                    │ │   │
│  │ └──────────┴────────────────────────────────────┘ │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                │
│  │ Popout 1        │  │ Popout 2        │                │
│  │ ?window=win-123 │  │ ?window=win-456 │                │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │                │
│  │ │ Terminal    │ │  │ │ Terminal    │ │                │
│  │ │ (splittable)│ │  │ │ (splittable)│ │                │
│  │ └─────────────┘ │  │ └─────────────┘ │                │
│  └─────────────────┘  └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                 ┌────────────────┐
                 │ tmux Sessions  │
                 │                │
                 │ • tt-cc-a2t    │
                 │ • tt-bash-xyz  │
                 │ • tt-tfe-3ov   │
                 └────────────────┘
```

---

## Implementation Plan

### **Phase 1: Restructure Main Window (Command Center)**

#### 1.1 Remove Tab Bar
```typescript
// SimpleTerminalApp.tsx - Main window only
const isMainWindow = currentWindowId === 'main'

return (
  <div className="app">
    {isMainWindow ? (
      // NEW: Command center layout
      <div className="command-center">
        <SessionManagerSidebar />
        <Dashboard />
      </div>
    ) : (
      // EXISTING: Popout window with tabs (for now)
      <div className="terminal-workspace">
        <TabBar />
        <TerminalView />
      </div>
    )}
  </div>
)
```

#### 1.2 Create Session Manager Sidebar
```typescript
// src/components/SessionManagerSidebar.tsx

interface SessionManagerSidebarProps {
  sessions: StoredTerminal[]
  onOpenInPopout: (terminalId: string) => void
  onAttachHere: (terminalId: string) => void
  onDetach: (terminalId: string) => void
  onKill: (terminalId: string) => void
  onScanSessions: () => void
}

export function SessionManagerSidebar(props: SessionManagerSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState({
    claude: true,
    tui: true,
    bash: true,
    orphaned: false
  })

  // Group sessions by type
  const grouped = groupSessionsByType(props.sessions)

  return (
    <div className="session-manager-sidebar">
      <div className="sidebar-header">
        <h2>Sessions</h2>
        <button onClick={props.onScanSessions} title="Scan for sessions">
          🔄
        </button>
      </div>

      {/* Claude Code Sessions */}
      <SessionGroup
        title="🤖 Claude Code"
        sessions={grouped.claude}
        expanded={expandedGroups.claude}
        onToggle={() => toggleGroup('claude')}
        onOpenPopout={props.onOpenInPopout}
        onAttach={props.onAttachHere}
        onDetach={props.onDetach}
        onKill={props.onKill}
      />

      {/* TUI Tools */}
      <SessionGroup
        title="📁 TUI Tools"
        sessions={grouped.tui}
        expanded={expandedGroups.tui}
        onToggle={() => toggleGroup('tui')}
        {...actions}
      />

      {/* Bash Sessions */}
      <SessionGroup
        title="💻 Bash"
        sessions={grouped.bash}
        expanded={expandedGroups.bash}
        onToggle={() => toggleGroup('bash')}
        {...actions}
      />

      {/* Orphaned Sessions */}
      {grouped.orphaned.length > 0 && (
        <SessionGroup
          title="🗑️ Orphaned"
          sessions={grouped.orphaned}
          expanded={expandedGroups.orphaned}
          onToggle={() => toggleGroup('orphaned')}
          {...actions}
        />
      )}

      <button className="spawn-new-btn" onClick={onSpawnNew}>
        + Spawn New
      </button>
    </div>
  )
}
```

#### 1.3 Create Dashboard Component
```typescript
// src/components/Dashboard.tsx

export function Dashboard() {
  const { terminals } = useSimpleTerminalStore()
  const stats = calculateStats(terminals)

  return (
    <div className="dashboard">
      <div className="welcome">
        <h1>Welcome to Tabz</h1>
        <p>Your terminal command center</p>
      </div>

      <div className="stats-grid">
        <StatCard
          icon="🟢"
          title="Active Sessions"
          value={stats.active}
          subtitle={`${stats.windows} windows`}
        />
        <StatCard
          icon="⏸️"
          title="Detached"
          value={stats.detached}
          subtitle="Ready to reconnect"
        />
        <StatCard
          icon="🗑️"
          title="Orphaned"
          value={stats.orphaned}
          subtitle="Not managed by Tabz"
        />
      </div>

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <button onClick={onSpawnNew}>+ Spawn New Terminal</button>
        <button onClick={onScanSessions}>🔄 Scan Sessions</button>
        <button onClick={onOpenSettings}>⚙️ Settings</button>
      </div>

      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <ActivityList sessions={terminals} limit={5} />
      </div>
    </div>
  )
}
```

#### 1.4 Add PWA Manifest
```json
// public/manifest.json

{
  "name": "Tabz - Terminal Command Center",
  "short_name": "Tabz",
  "description": "Browser-based terminal manager with tmux integration",
  "start_url": "/?window=main",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#88c0d0",
  "orientation": "any",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "categories": ["utilities", "productivity"],
  "screenshots": [
    {
      "src": "/screenshot-wide.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ]
}
```

---

### **Phase 2: Change Popout Behavior (Detach on Close)**

#### 2.1 Modify Popout Close Handler
```typescript
// Current behavior: Kill session
handlePopOutTab(terminalId) {
  const newWindowId = generateWindowId()
  updateTerminal(terminalId, { windowId: newWindowId })
  window.open(`?window=${newWindowId}&active=${terminalId}`)
}

// When popout closes (current):
window.addEventListener('beforeunload', () => {
  removeTerminal(terminalId) // ❌ Kills session
})

// NEW behavior: Detach session
window.addEventListener('beforeunload', () => {
  if (currentWindowId !== 'main') {
    // Detach all terminals in this window
    visibleTerminals.forEach(terminal => {
      updateTerminal(terminal.id, {
        windowId: null,
        status: 'detached'
      })
    })

    // Backend keeps tmux session alive
    // Main window sidebar will show as detached (○)
  }
})
```

#### 2.2 Add Detach/Reattach Logic
```typescript
// Detach (disconnect from window, keep session alive)
const handleDetach = (terminalId: string) => {
  updateTerminal(terminalId, {
    windowId: null,
    status: 'detached'
  })

  // Send WebSocket message to backend
  wsRef.current?.send(JSON.stringify({
    type: 'detach',
    terminalId,
  }))
}

// Reattach (reconnect to window)
const handleReattach = (terminalId: string, targetWindowId: string) => {
  updateTerminal(terminalId, {
    windowId: targetWindowId,
    status: 'reconnecting'
  })

  // WebSocket reconnect happens automatically
}
```

#### 2.3 Update Backend Detach Handler
```javascript
// backend/server.js

case 'detach':
  // Don't kill tmux session - just disconnect WebSocket
  const terminalId = message.terminalId

  // Remove from terminal owners (prevents output routing)
  if (terminalOwners.has(terminalId)) {
    terminalOwners.get(terminalId).delete(ws)
  }

  // Keep tmux session alive
  console.log(`[Server] Detached from ${terminalId}, session still alive`)
  break
```

---

### **Phase 3: Session Manager Features**

#### 3.1 Live Status Polling
```typescript
// Poll every 3 seconds when main window is visible
useEffect(() => {
  if (currentWindowId !== 'main') return

  const interval = setInterval(() => {
    fetchAllSessions() // Scans tmux + updates status
  }, 3000)

  return () => clearInterval(interval)
}, [currentWindowId])

const fetchAllSessions = async () => {
  // Option A: Direct tmux scan (lightweight)
  const response = await fetch('/api/tmux/sessions/all')

  // Option B: Call TUI session manager in JSON mode
  const response = await fetch('/api/tmux/sessions/detailed')

  const data = await response.json()
  updateSessionStatuses(data.sessions)
}
```

#### 3.2 Session Actions
```typescript
// Open in new popout
const handleOpenInPopout = (terminalId: string) => {
  const newWindowId = generateWindowId()
  updateTerminal(terminalId, { windowId: newWindowId })
  window.open(`?window=${newWindowId}&active=${terminalId}`)
}

// Attach to main window (show terminal in dashboard area)
const handleAttachHere = (terminalId: string) => {
  updateTerminal(terminalId, { windowId: 'main' })
  setActiveTerminal(terminalId)
}

// Detach from current window
const handleDetach = (terminalId: string) => {
  updateTerminal(terminalId, {
    windowId: null,
    status: 'detached'
  })
}

// Kill session (permanent)
const handleKill = async (terminalId: string) => {
  if (!confirm('Kill this session? This cannot be undone.')) return

  await fetch(`/api/terminals/${terminalId}`, { method: 'DELETE' })
  removeTerminal(terminalId)
}
```

#### 3.3 Drag-to-Popout
```typescript
// Allow dragging session items to create popouts
const handleDragStart = (e: DragEvent, terminalId: string) => {
  e.dataTransfer.setData('terminalId', terminalId)
  e.dataTransfer.effectAllowed = 'move'
}

const handleDragEnd = (e: DragEvent) => {
  const terminalId = e.dataTransfer.getData('terminalId')

  // If dragged outside main window bounds, create popout
  const mainWindowRect = mainWindowRef.current.getBoundingClientRect()
  if (!isWithinBounds(e.clientX, e.clientY, mainWindowRect)) {
    handleOpenInPopout(terminalId)
  }
}
```

---

### **Phase 4: Simplify Popout Windows**

#### 4.1 Single Terminal Mode (Optional)
```typescript
// Remove multi-tab support from popouts
// Popouts show ONE terminal (but can split vertically)

const PopoutWindow = () => {
  const terminal = visibleTerminals[0] // Only 1 terminal per popout

  return (
    <div className="popout-window">
      <div className="popout-header">
        <span>{terminal.name}</span>
        <button onClick={handleDetach}>Detach</button>
        <button onClick={handleClose}>✕</button>
      </div>

      {terminal.splitLayout ? (
        <SplitLayout terminal={terminal} />
      ) : (
        <Terminal agent={terminal} />
      )}
    </div>
  )
}
```

#### 4.2 Split Constraints
```typescript
// Enforce split rules:
// - Horizontal splits: Max 1 (2 columns)
// - Vertical splits: Unlimited (stacking)

const canSplitHorizontal = (terminal: StoredTerminal) => {
  // Check if already has horizontal split
  if (terminal.splitLayout?.type === 'vertical') {
    return false // Already split left/right
  }
  return true
}

const canSplitVertical = (terminal: StoredTerminal) => {
  // Always allow vertical splits (stacking)
  return true
}
```

---

### **Phase 5: OS Integration**

#### 5.1 PWA Installation Prompt
```typescript
// Prompt user to install as PWA
useEffect(() => {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    setDeferredPrompt(e)
    setShowInstallPrompt(true)
  })
}, [])

const handleInstallPWA = async () => {
  if (!deferredPrompt) return

  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice

  if (outcome === 'accepted') {
    console.log('PWA installed!')
  }

  setDeferredPrompt(null)
  setShowInstallPrompt(false)
}
```

#### 5.2 Multi-Monitor Detection
```typescript
// Detect available screens
const screens = await window.getScreenDetails() // Screen Capture API

// Allow user to choose which monitor for popouts
const handleOpenOnMonitor = (terminalId: string, screenIndex: number) => {
  const screen = screens[screenIndex]
  const newWindowId = generateWindowId()

  updateTerminal(terminalId, { windowId: newWindowId })

  // Open window on specific screen
  const features = `left=${screen.availLeft},top=${screen.availTop},width=1200,height=800`
  window.open(`?window=${newWindowId}&active=${terminalId}`, '_blank', features)
}
```

#### 5.3 Keyboard Shortcuts
```typescript
// Global shortcuts for command center
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+T: Open main window
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      window.open('/?window=main', 'tabz-main')
    }

    // Ctrl+Shift+N: Spawn new terminal in popout
    if (e.ctrlKey && e.shiftKey && e.key === 'N') {
      spawnTerminalInPopout()
    }

    // Ctrl+Shift+D: Detach current terminal
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      handleDetach(activeTerminalId)
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [activeTerminalId])
```

---

## Visual Mockups

### Main Window (Command Center)

```
┌────────────────────────────────────────────────────────────────┐
│ Tabz - Command Center                                    [⚙️] │
├────────────┬───────────────────────────────────────────────────┤
│            │                                                   │
│ Sessions   │  Welcome to Tabz                                 │
│            │  Your terminal command center                    │
│ 🤖 Claude  │                                                   │
│ ├─ a2t ●   │  ┌─────────────┬─────────────┬─────────────┐   │
│ │  [↗][⏸] │  │ 🟢 Active   │ ⏸️ Detached │ 🗑️ Orphaned │   │
│ └─ xyz ○   │  │     5       │      3      │      2      │   │
│    [↗][🗑] │  │  8 windows  │  Ready to   │  Not in     │   │
│            │  │             │  reconnect  │  Tabz       │   │
│ 📁 TUI     │  └─────────────┴─────────────┴─────────────┘   │
│ ├─ tfe ●   │                                                   │
│ │  [↗][⏸] │  Quick Actions:                                  │
│ └─ plx ●   │  ┌──────────────────────────────────────────┐  │
│    [↗][⏸] │  │ [+ Spawn New Terminal]                   │  │
│            │  │ [🔄 Scan Sessions]                        │  │
│ 💻 Bash    │  │ [⚙️ Settings]                             │  │
│ ├─ kbl ●   │  └──────────────────────────────────────────┘  │
│ │  [↗][⏸] │                                                   │
│ ├─ src ●   │  Recent Activity:                                │
│ │  [↗][⏸] │  • tt-cc-a2t: idle (2m ago)                     │
│ └─ 1sh ○   │  • tt-bash-xyz: running command                 │
│    [↗][🗑] │  • tt-tfe-3ov: viewing files                    │
│            │                                                   │
│ 🗑️ Orphans │                                                   │
│ └─ old ○   │                                                   │
│    [↗][🗑] │                                                   │
│            │                                                   │
│ [+ Spawn]  │                                                   │
│            │                                                   │
└────────────┴───────────────────────────────────────────────────┘
```

### Popout Window (Focused Workspace)

```
┌──────────────────────────────────────────────────────────┐
│ tt-cc-a2t                              [⏸ Detach] [✕]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│        Claude Code Terminal                              │
│                                                          │
│        (Single terminal, can split vertically)           │
│                                                          │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Popout with Vertical Splits

```
┌──────────────────────────────────────────────────────────┐
│ tt-bash-xyz                            [⏸ Detach] [✕]   │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ Split 1: Bash - Running build                      │  │
│ │ $ npm run build                                     │  │
│ │ Building...                                         │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ Split 2: Logs - Watching output                    │  │
│ │ [12:34:56] LOG: Compilation successful             │  │
│ │ [12:34:57] LOG: Starting server...                 │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ Split 3: Monitoring - System stats                 │  │
│ │ CPU: 45%  Memory: 8.2GB  Disk: 120GB              │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Session Lifecycle

### 1. Spawn New Session
```
User clicks "Spawn New" in sidebar
  ↓
Select terminal type (Claude, Bash, TUI)
  ↓
Choose target:
  • Open here (main window)
  • Open in popout (new window)
  ↓
Backend creates tmux session
  ↓
Terminal appears in sidebar (● active)
  ↓
If popout: New window opens with terminal
```

### 2. Detach Session
```
User closes popout window (or clicks "Detach")
  ↓
Frontend: updateTerminal({ windowId: null, status: 'detached' })
  ↓
Backend: Disconnect WebSocket, keep tmux session alive
  ↓
Sidebar updates: ● active → ○ detached
  ↓
Session remains in tmux, ready to reattach
```

### 3. Reattach Session
```
User clicks "↗ Open" on detached session
  ↓
Choose target:
  • Open here (main window)
  • Open in popout (new window)
  ↓
Frontend: updateTerminal({ windowId, status: 'reconnecting' })
  ↓
Backend: Reconnect WebSocket to existing tmux session
  ↓
Terminal appears in target window
  ↓
Sidebar updates: ○ detached → ● active
```

### 4. Kill Session
```
User clicks "🗑️" on session
  ↓
Confirm dialog: "Kill session? Cannot be undone."
  ↓
Frontend: DELETE /api/terminals/:id
  ↓
Backend: tmux kill-session -t <session-name>
  ↓
Frontend: removeTerminal(terminalId)
  ↓
Session removed from sidebar
```

---

## State Management

### Terminal States
```typescript
type TerminalStatus =
  | 'spawning'      // Creating new session
  | 'active'        // Attached to a window
  | 'detached'      // Session alive, not in any window
  | 'reconnecting'  // Reattaching to existing session
  | 'error'         // Failed to spawn/reconnect

interface StoredTerminal {
  id: string
  name: string
  status: TerminalStatus
  sessionName: string
  terminalType: 'bash' | 'claude-code' | 'tui-tool' | 'other'
  windowId: string | null  // null = detached
  workingDir?: string
  gitBranch?: string
  // ... other fields
}
```

### Window Types
```typescript
type WindowType =
  | 'main'      // Command center (sidebar + dashboard)
  | 'popout'    // Focused terminal workspace

const currentWindowId = urlParams.get('window') || 'main'
const isMainWindow = currentWindowId === 'main'
```

---

## API Changes

### New Endpoints

#### GET /api/tmux/sessions/all
```javascript
// Return ALL sessions (including orphaned)
{
  "success": true,
  "sessions": [
    {
      "name": "tt-cc-a2t",
      "type": "claude-code",
      "attached": true,
      "windowId": "main",
      "workingDir": "/home/matt/projects",
      "gitBranch": "master"
    },
    // ... all sessions
  ]
}
```

#### POST /api/terminals/:id/detach
```javascript
// Detach terminal from window (keep session alive)
{
  "terminalId": "terminal-abc123"
}

// Response:
{
  "success": true,
  "sessionName": "tt-cc-a2t",
  "status": "detached"
}
```

#### POST /api/terminals/:id/reattach
```javascript
// Reattach to existing session
{
  "terminalId": "terminal-abc123",
  "windowId": "window-xyz789"
}

// Response:
{
  "success": true,
  "sessionName": "tt-cc-a2t",
  "status": "active"
}
```

---

## Benefits Summary

### User Experience
✅ **Never lose work** - closing window = detach, not kill
✅ **Central visibility** - see all sessions in one place
✅ **Focused workspaces** - popouts are simple, distraction-free
✅ **Better organization** - group by type, filter, search
✅ **Multi-monitor friendly** - use OS tools (PowerToys, Snap)

### Technical
✅ **Simpler architecture** - main window vs popouts (clear separation)
✅ **Better state management** - central source of truth in sidebar
✅ **Scalability** - can handle dozens of sessions
✅ **OS integration** - PWA, multi-monitor, native window management
✅ **Session persistence** - tmux keeps everything alive

### Performance
✅ **Less polling** - only main window polls (not all popouts)
✅ **Efficient rendering** - popouts render single terminal
✅ **Reduced complexity** - no multi-tab logic in popouts

---

## Migration Path

### For Existing Users

1. **First load after update:**
   - Show migration banner: "Tabz has been upgraded to Command Center mode!"
   - Explain new architecture (sidebar + popouts)
   - Offer quick tour

2. **Preserve existing sessions:**
   - All sessions remain alive in tmux
   - Main window shows all sessions in sidebar
   - User can pop out as needed

3. **Gradual adoption:**
   - Keep tab-based mode for popouts (phase 1)
   - Transition to single-terminal popouts (phase 2)
   - Users adapt at their own pace

---

## Open Questions

### 1. Main Window Terminal Support
**Question:** Should main window support showing a terminal (in dashboard area)?

**Options:**
- A) Main window is sidebar-only (no terminals)
- B) Main window can show ONE terminal (clicked from sidebar)
- C) Main window can show terminals in tabs (like current)

**Recommendation:** Option B - clicking session in sidebar shows it in dashboard area (quick preview), but encourage popouts for real work.

---

### 2. Popout Tab Support
**Question:** Should popouts support multiple tabs, or single terminal only?

**Options:**
- A) Single terminal only (simplest)
- B) Max 2-3 tabs (compromise)
- C) Keep current multi-tab support

**Recommendation:** Option A for initial release - single terminal per popout. Can add 2-3 tab support later if users request it.

---

### 3. Split Constraints
**Question:** What split constraints for popouts?

**Current proposal:**
- Horizontal: Max 1 split (2 columns)
- Vertical: Unlimited (stacking rows)

**Alternative:**
- Free-form splits (current behavior)
- No splits (single terminal only)

**Recommendation:** Stick with proposal - 2 columns max, unlimited rows. Matches natural reading flow (left-to-right, top-to-bottom).

---

### 4. TUI Session Manager Integration
**Question:** Should React sidebar replace TUI app, or coexist?

**Options:**
- A) React sidebar only (remove TUI app dependency)
- B) React sidebar + TUI app as optional tool
- C) Use TUI app's JSON output to populate React sidebar

**Recommendation:** Option C - best of both worlds. React sidebar for quick actions, TUI app for power users who want advanced features (preview, send keys, etc.).

---

### 5. Background Polling
**Question:** Should all windows poll, or just main?

**Options:**
- A) Only main window polls (most efficient)
- B) All windows poll independently
- C) Main window polls + broadcasts to popouts

**Recommendation:** Option A - only main window polls tmux. Popouts are simple focused workspaces that don't need live session list.

---

## Success Criteria

✅ Main window shows all sessions (active, detached, orphaned)
✅ Popouts are single-terminal focused workspaces
✅ Closing popout = detach (session stays alive)
✅ Reattaching is 1-click from sidebar
✅ PWA installable with app-like experience
✅ Works seamlessly with OS window management
✅ No session loss on window close
✅ Scales to 20+ sessions without performance issues
✅ Clear, intuitive UX for new users

---

## Implementation Timeline

### Week 1: Phase 1 (Command Center)
- [ ] Restructure main window (sidebar + dashboard)
- [ ] Create SessionManagerSidebar component
- [ ] Create Dashboard component
- [ ] Add PWA manifest
- [ ] Test with existing sessions

### Week 2: Phase 2 (Detach Behavior)
- [ ] Modify popout close handler
- [ ] Update backend detach logic
- [ ] Add reattach functionality
- [ ] Test session persistence

### Week 3: Phase 3 (Session Manager Features)
- [ ] Live status polling
- [ ] Session actions (open, detach, kill)
- [ ] Drag-to-popout
- [ ] Search/filter sessions

### Week 4: Phase 4 (Polish)
- [ ] Simplify popout windows
- [ ] Enforce split constraints
- [ ] Add keyboard shortcuts
- [ ] Multi-monitor support
- [ ] Documentation

---

## Files to Create/Modify

### New Files
```
src/components/SessionManagerSidebar.tsx
src/components/SessionManagerSidebar.css
src/components/Dashboard.tsx
src/components/Dashboard.css
src/components/SessionGroup.tsx
src/components/SessionItem.tsx
src/components/StatCard.tsx
src/components/ActivityList.tsx
public/manifest.json
public/icon-192.png
public/icon-512.png
```

### Modified Files
```
src/SimpleTerminalApp.tsx          # Main layout switching
src/SimpleTerminalApp.css          # Command center styling
src/stores/simpleTerminalStore.ts  # Add detached status
backend/routes/api.js               # Add detach/reattach endpoints
backend/server.js                   # Modify close handler
```

---

## Next Steps

1. **Validate architecture** - review this plan, get feedback
2. **Create mockups** - visual designs for sidebar and dashboard
3. **Start Phase 1** - implement main window restructure
4. **Iterate** - test with real usage, adjust as needed

---

**End of Plan**
