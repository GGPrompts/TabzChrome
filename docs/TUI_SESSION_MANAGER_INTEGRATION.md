# TUI Session Manager Integration Plan

**Goal:** Integrate a TUI session manager app with Tabz to enable universal session discovery and management.

**Date:** November 12, 2025
**Status:** Planning phase

---

## Overview

Instead of reimplementing session detection logic in Tabz, we'll leverage a dedicated TUI session manager that:
- Runs in **JSON mode** when called by Tabz backend (non-interactive)
- Provides rich session metadata (type, status, git branch, working dir)
- Can be spawned as a **TUI tool** for interactive management
- Filters sessions to show only "orphaned" ones (not in current Tabz window)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Tabz Frontend                                           │
│                                                         │
│  Spawn Menu                                             │
│  ┌─────────────────────────────────────┐               │
│  │ New Terminals                       │               │
│  │ • Bash                              │               │
│  │ • Claude Code                       │               │
│  ├─────────────────────────────────────┤               │
│  │ Existing Sessions (3)      [🔄]    │               │
│  │                                     │               │
│  │ 🤖 Claude Code (1)                 │               │
│  │ • tt-cc-a2t ~/projects - idle      │               │
│  │   [Reconnect]                       │               │
│  │                                     │               │
│  │ 📁 TUI Tools (1)                   │               │
│  │ • tt-tfe-3ov ~/projects/...        │               │
│  │   [Reconnect]                       │               │
│  │                                     │               │
│  │ 💻 Bash (1)                        │               │
│  │ • tt-bash-xyz /home/matt           │               │
│  │   [Reconnect]                       │               │
│  └─────────────────────────────────────┘               │
│     ▲                                                   │
│     │ HTTP GET                                          │
└─────┼───────────────────────────────────────────────────┘
      │
┌─────▼───────────────────────────────────────────────────┐
│ Tabz Backend (Node.js)                                  │
│                                                         │
│  GET /api/tmux/sessions/orphaned                        │
│  ?windowId=main&existing=tt-cc-xyz,tt-bash-abc         │
│                                                         │
│  ┌──────────────────────────────────┐                  │
│  │ 1. execSync('tui-manager --json  │                  │
│  │      --filter=tt-*               │                  │
│  │      --exclude=...')             │                  │
│  │                                  │                  │
│  │ 2. Parse JSON response           │                  │
│  │ 3. Filter by windowId            │                  │
│  │ 4. Return orphaned sessions      │                  │
│  └──────────────────────────────────┘                  │
│     ▲                                                   │
│     │ execSync                                          │
└─────┼───────────────────────────────────────────────────┘
      │
┌─────▼───────────────────────────────────────────────────┐
│ TUI Session Manager (Go/Rust)                           │
│                                                         │
│  Modes:                                                 │
│  1. Interactive TUI (default)                           │
│  2. JSON export (--json flag)                           │
│                                                         │
│  Features:                                              │
│  • Session type detection (bash, claude, tui-tool)      │
│  • Rich metadata (working dir, git branch, status)      │
│  • Claude Code status hooks                             │
│  • Filter by prefix (--filter=tt-*)                     │
│  • Exclude specific sessions (--exclude=...)            │
│  • Preview panes                                        │
│  • Send keys to sessions                                │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1: TUI Session Manager Requirements

### Command-Line Interface

```bash
# Interactive TUI mode (default)
tui-session-manager

# JSON export mode (for Tabz integration)
tui-session-manager --json

# With filters
tui-session-manager --json --filter="tt-*"

# Exclude specific sessions
tui-session-manager --json --exclude="tt-cc-xyz,tt-bash-abc"

# Combined
tui-session-manager --json --filter="tt-*" --exclude="tt-cc-xyz"
```

### Flags Specification

| Flag | Description | Example |
|------|-------------|---------|
| `--json` | Output JSON instead of TUI | `--json` |
| `--filter=PATTERN` | Only show sessions matching glob pattern | `--filter="tt-*"` |
| `--exclude=LIST` | Comma-separated list of session names to exclude | `--exclude="tt-cc-xyz,tt-bash-abc"` |
| `--attached-only` | Only show attached sessions | `--attached-only` |
| `--detached-only` | Only show detached sessions | `--detached-only` |

### JSON Output Schema

```json
{
  "success": true,
  "timestamp": "2025-11-12T18:30:00Z",
  "sessions": [
    {
      "name": "tt-cc-a2t",
      "type": "claude-code",
      "attached": false,
      "created": "2025-11-12T18:01:51Z",
      "windows": 2,
      "workingDir": "/home/matt/projects/terminal-tabs",
      "gitBranch": "master",
      "claudeStatus": {
        "state": "idle",
        "currentTool": null,
        "lastUpdated": "2025-11-12T18:29:50Z"
      },
      "panes": [
        {
          "id": "%1",
          "command": "claude",
          "active": true
        }
      ]
    },
    {
      "name": "tt-tfe-3ov",
      "type": "tui-tool",
      "attached": true,
      "created": "2025-11-12T18:07:42Z",
      "windows": 1,
      "workingDir": "/home/matt/projects/terminal-tabs",
      "gitBranch": "master",
      "panes": [
        {
          "id": "%5",
          "command": "tfe",
          "active": true
        }
      ]
    },
    {
      "name": "tt-bash-xyz",
      "type": "bash",
      "attached": false,
      "created": "2025-11-12T18:10:00Z",
      "windows": 1,
      "workingDir": "/home/matt",
      "gitBranch": null,
      "panes": [
        {
          "id": "%8",
          "command": "bash",
          "active": true
        }
      ]
    }
  ]
}
```

### Session Type Detection

The TUI app should detect terminal type using this priority:

1. **Session name pattern** (most reliable):
   - `tt-cc-*` or `tt-claude-*` → `claude-code`
   - `tt-bash-*` → `bash`
   - `tt-tfe-*` → `tui-tool`
   - `tt-tui-*` → `tui-tool`
   - `tt-lazy-*` → `tui-tool`

2. **Running command** (fallback):
   - Command contains `claude` → `claude-code`
   - Command contains `tfe` → `tui-tool`
   - Command contains `lazygit` → `tui-tool`
   - Default → `bash`

### Error Handling

```json
// No tmux server running
{
  "success": false,
  "error": "tmux server not running",
  "sessions": []
}

// No sessions found (not an error)
{
  "success": true,
  "sessions": []
}

// Invalid filter pattern
{
  "success": false,
  "error": "invalid filter pattern",
  "sessions": []
}
```

### Performance Requirements

- **Execution time:** < 100ms for typical workload (10-20 sessions)
- **Memory:** < 10MB
- **Exit code:** 0 on success, non-zero on error

---

## Part 2: Tabz Backend Requirements

### API Endpoint

**Path:** `GET /api/tmux/sessions/orphaned`

**Query Parameters:**
- `windowId` (optional): Current Tabz window ID (default: `"main"`)
- `existing` (optional): Comma-separated list of session names already in this window

**Implementation:**

```javascript
// backend/routes/api.js

/**
 * Get orphaned tmux sessions (sessions not in current Tabz window)
 * Calls TUI session manager in JSON mode
 */
app.get('/api/tmux/sessions/orphaned', async (req, res) => {
  const windowId = req.query.windowId || 'main'
  const existingSessions = req.query.existing ? req.query.existing.split(',') : []

  try {
    // Build command with filters
    let cmd = 'tui-session-manager --json --filter="tt-*"'
    if (existingSessions.length > 0) {
      cmd += ` --exclude="${existingSessions.join(',')}"`
    }

    // Execute with timeout
    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 5000, // 5 second timeout
      maxBuffer: 1024 * 1024 // 1MB max
    })

    // Parse JSON response
    const data = JSON.parse(output)

    if (!data.success) {
      return res.json({
        success: false,
        error: data.error || 'Unknown error from session manager',
        sessions: []
      })
    }

    // Group sessions by type for frontend display
    const grouped = {
      'claude-code': [],
      'tui-tool': [],
      'bash': [],
      'other': []
    }

    data.sessions.forEach(session => {
      const type = session.type || 'other'
      if (grouped[type]) {
        grouped[type].push(session)
      } else {
        grouped['other'].push(session)
      }
    })

    res.json({
      success: true,
      sessions: data.sessions,
      grouped,
      windowId,
      timestamp: data.timestamp
    })

  } catch (error) {
    console.error('[API] Error fetching orphaned sessions:', error)
    res.json({
      success: false,
      error: error.message,
      sessions: []
    })
  }
})
```

### Error Scenarios to Handle

1. **TUI app not installed:** Gracefully return empty list
2. **TUI app timeout:** Return error after 5 seconds
3. **Invalid JSON:** Log error, return empty list
4. **Tmux not running:** Return empty list (expected state)

---

## Part 3: Tabz Frontend Requirements

### State Management

```typescript
// In SimpleTerminalApp.tsx or separate hook

interface OrphanedSession {
  name: string
  type: 'claude-code' | 'bash' | 'tui-tool' | 'other'
  attached: boolean
  created: string
  windows: number
  workingDir: string
  gitBranch: string | null
  claudeStatus?: {
    state: string
    currentTool: string | null
    lastUpdated: string
  }
}

interface OrphanedSessionsResponse {
  success: boolean
  sessions: OrphanedSession[]
  grouped: {
    'claude-code': OrphanedSession[]
    'tui-tool': OrphanedSession[]
    'bash': OrphanedSession[]
    'other': OrphanedSession[]
  }
  error?: string
}

const [orphanedSessions, setOrphanedSessions] = useState<OrphanedSessionsResponse | null>(null)
const [loadingOrphaned, setLoadingOrphaned] = useState(false)
```

### Fetch Logic

```typescript
// Fetch when spawn menu opens
useEffect(() => {
  if (showSpawnMenu) {
    fetchOrphanedSessions()
  }
}, [showSpawnMenu])

const fetchOrphanedSessions = async () => {
  setLoadingOrphaned(true)

  try {
    // Build query params
    const existingSessions = visibleTerminals
      .map(t => t.sessionName)
      .filter(Boolean) // Remove undefined/null
      .join(',')

    const params = new URLSearchParams({
      windowId: currentWindowId,
      existing: existingSessions
    })

    const response = await fetch(`/api/tmux/sessions/orphaned?${params}`)
    const data = await response.json()

    setOrphanedSessions(data)
  } catch (error) {
    console.error('[SpawnMenu] Error fetching orphaned sessions:', error)
    setOrphanedSessions({
      success: false,
      sessions: [],
      grouped: { 'claude-code': [], 'tui-tool': [], 'bash': [], 'other': [] },
      error: error.message
    })
  } finally {
    setLoadingOrphaned(false)
  }
}
```

### Spawn Menu UI

```typescript
// In spawn menu component (after new terminal options)

{orphanedSessions && orphanedSessions.sessions.length > 0 && (
  <>
    <div className="spawn-menu-divider" />

    <div className="spawn-menu-section">
      <div className="spawn-menu-header">
        <span>Existing Sessions ({orphanedSessions.sessions.length})</span>
        <button
          className="spawn-menu-refresh"
          onClick={fetchOrphanedSessions}
          disabled={loadingOrphaned}
          title="Refresh session list"
        >
          🔄
        </button>
      </div>

      {/* Claude Code Sessions */}
      {orphanedSessions.grouped['claude-code'].length > 0 && (
        <div className="spawn-menu-group">
          <div className="spawn-menu-group-title">🤖 Claude Code</div>
          {orphanedSessions.grouped['claude-code'].map(session => (
            <div key={session.name} className="spawn-menu-session">
              <div className="spawn-menu-session-info">
                <div className="spawn-menu-session-name">{session.name}</div>
                <div className="spawn-menu-session-meta">
                  {session.workingDir}
                  {session.gitBranch && ` • ${session.gitBranch}`}
                  {session.claudeStatus && ` • ${session.claudeStatus.state}`}
                </div>
              </div>
              <button
                className="spawn-menu-session-btn"
                onClick={() => handleReconnectSession(session)}
              >
                Reconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TUI Tools */}
      {orphanedSessions.grouped['tui-tool'].length > 0 && (
        <div className="spawn-menu-group">
          <div className="spawn-menu-group-title">📁 TUI Tools</div>
          {orphanedSessions.grouped['tui-tool'].map(session => (
            <div key={session.name} className="spawn-menu-session">
              <div className="spawn-menu-session-info">
                <div className="spawn-menu-session-name">{session.name}</div>
                <div className="spawn-menu-session-meta">
                  {session.workingDir}
                  {session.gitBranch && ` • ${session.gitBranch}`}
                </div>
              </div>
              <button
                className="spawn-menu-session-btn"
                onClick={() => handleReconnectSession(session)}
              >
                Reconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bash Sessions */}
      {orphanedSessions.grouped['bash'].length > 0 && (
        <div className="spawn-menu-group">
          <div className="spawn-menu-group-title">💻 Bash</div>
          {orphanedSessions.grouped['bash'].map(session => (
            <div key={session.name} className="spawn-menu-session">
              <div className="spawn-menu-session-info">
                <div className="spawn-menu-session-name">{session.name}</div>
                <div className="spawn-menu-session-meta">
                  {session.workingDir}
                </div>
              </div>
              <button
                className="spawn-menu-session-btn"
                onClick={() => handleReconnectSession(session)}
              >
                Reconnect
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </>
)}
```

### Reconnect Handler

```typescript
const handleReconnectSession = async (session: OrphanedSession) => {
  try {
    // Find matching spawn option by terminal type
    const spawnOption = spawnOptions.find(opt =>
      opt.terminalType === session.type
    ) || spawnOptions.find(opt => opt.terminalType === 'bash') // Fallback

    // Create new terminal with detected type
    const terminal: StoredTerminal = {
      id: `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: session.name,
      status: 'reconnecting',
      sessionName: session.name,
      terminalType: session.type,
      workingDir: session.workingDir,
      gitBranch: session.gitBranch || undefined,
      windowId: currentWindowId,
      icon: spawnOption?.icon || '💻',
      theme: spawnOption?.defaultTheme,
      background: spawnOption?.defaultBackground,
      transparency: spawnOption?.defaultTransparency,
      fontSize: spawnOption?.defaultFontSize,
      fontFamily: spawnOption?.defaultFontFamily,
      useTmux: true // Always true for reconnect
    }

    // Add to store
    addTerminal(terminal)

    // Set as active
    setActiveTerminal(terminal.id)

    // Close spawn menu
    setShowSpawnMenu(false)

    // Backend will handle reconnection via WebSocket
    console.log(`[SpawnMenu] Reconnecting to session: ${session.name}`)

  } catch (error) {
    console.error('[SpawnMenu] Error reconnecting to session:', error)
    alert(`Failed to reconnect: ${error.message}`)
  }
}
```

### CSS Styling

```css
/* Spawn menu sections */
.spawn-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 12px 0;
}

.spawn-menu-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spawn-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
}

.spawn-menu-refresh {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.spawn-menu-refresh:hover {
  opacity: 1;
}

.spawn-menu-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spawn-menu-group-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.spawn-menu-session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  transition: background 0.2s;
}

.spawn-menu-session:hover {
  background: rgba(255, 255, 255, 0.1);
}

.spawn-menu-session-info {
  flex: 1;
  min-width: 0;
}

.spawn-menu-session-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spawn-menu-session-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.spawn-menu-session-btn {
  background: rgba(59, 130, 246, 0.3);
  border: 1px solid rgba(59, 130, 246, 0.5);
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
  margin-left: 8px;
  white-space: nowrap;
}

.spawn-menu-session-btn:hover {
  background: rgba(59, 130, 246, 0.5);
  border-color: rgba(59, 130, 246, 0.7);
}
```

---

## Communication Protocol

### Workflow: User Reconnects to Orphaned Session

```
1. User clicks "+" button (spawn menu)
   └─> Frontend fetches orphaned sessions
       └─> GET /api/tmux/sessions/orphaned?windowId=main&existing=tt-cc-xyz
           └─> Backend calls: tui-session-manager --json --filter="tt-*" --exclude="tt-cc-xyz"
               └─> TUI app returns JSON with all tt-* sessions except tt-cc-xyz
           └─> Backend groups by type, returns to frontend
       └─> Frontend displays grouped sessions

2. User clicks "Reconnect" on tt-cc-a2t
   └─> Frontend creates terminal with:
       - sessionName: "tt-cc-a2t"
       - terminalType: "claude-code" (detected by TUI app)
       - status: "reconnecting"
   └─> WebSocket message sent to backend
       └─> Backend attaches to existing tmux session
   └─> Terminal activates and shows session content
```

### Data Flow Diagram

```
┌──────────────┐
│ User clicks  │
│ Spawn Menu   │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────┐
│ Frontend                     │
│ fetchOrphanedSessions()      │
└──────┬───────────────────────┘
       │ HTTP GET
       │ /api/tmux/sessions/orphaned
       │ ?windowId=main&existing=...
       ▼
┌──────────────────────────────┐
│ Backend                      │
│ execSync('tui-session-       │
│   manager --json ...')       │
└──────┬───────────────────────┘
       │ stdout
       ▼
┌──────────────────────────────┐
│ TUI Session Manager          │
│ 1. List all tmux sessions    │
│ 2. Filter by tt-* prefix     │
│ 3. Exclude existing list     │
│ 4. Detect types              │
│ 5. Output JSON               │
└──────┬───────────────────────┘
       │ JSON response
       ▼
┌──────────────────────────────┐
│ Backend                      │
│ Parse, group, return         │
└──────┬───────────────────────┘
       │ HTTP response
       ▼
┌──────────────────────────────┐
│ Frontend                     │
│ Display in spawn menu        │
└──────────────────────────────┘
```

---

## Testing Scenarios

### Scenario 1: Fresh Start
- **Setup:** No tmux sessions running
- **Expected:** Spawn menu shows "No existing sessions"
- **TUI output:** `{"success": true, "sessions": []}`

### Scenario 2: Orphaned Sessions
- **Setup:** 3 tt-* sessions exist, none in Tabz
- **Expected:** All 3 appear in spawn menu, grouped by type
- **TUI output:** JSON with all 3 sessions

### Scenario 3: Mixed Sessions
- **Setup:** 5 tt-* sessions, 2 already in Tabz
- **Expected:** Only 3 orphaned sessions appear
- **TUI output:** JSON excludes the 2 that are in `--exclude` list

### Scenario 4: TUI App Not Installed
- **Setup:** TUI app binary missing
- **Expected:** Spawn menu shows normal options, no errors
- **Backend:** Catches error, returns empty list

### Scenario 5: Tmux Not Running
- **Setup:** Tmux server not running
- **Expected:** Spawn menu shows normal options
- **TUI output:** `{"success": false, "error": "tmux server not running"}`

---

## Future Enhancements

### Phase 2: Advanced Filters
- Filter by working directory
- Filter by git branch
- Filter by attached/detached status
- Filter by age (idle time)

### Phase 3: Preview Integration
- Show live preview of session in spawn menu (optional)
- Use TUI app's preview capability

### Phase 4: Bi-directional Sync
- TUI app reads Tabz state from localStorage
- Shows which sessions are "in Tabz" vs orphaned
- Allows launching Tabz windows from TUI

---

## File Locations

### Tabz Files to Modify
```
backend/routes/api.js               # Add /api/tmux/sessions/orphaned endpoint
src/SimpleTerminalApp.tsx           # Add orphaned session state + UI
src/SimpleTerminalApp.css           # Add spawn menu session styles
```

### TUI App Files to Create/Modify
```
cmd/main.go                         # Add --json, --filter, --exclude flags
pkg/session/detector.go             # Session type detection logic
pkg/session/exporter.go             # JSON export functionality
```

---

## Dependencies

### Tabz
- Node.js `child_process.execSync`
- Existing spawn options system
- Existing WebSocket reconnect logic

### TUI App
- `encoding/json` for JSON output
- Tmux command-line interface
- Session name parsing logic
- Claude status hook integration (if reusing existing)

---

## Success Criteria

✅ TUI app outputs valid JSON in < 100ms
✅ Backend endpoint returns orphaned sessions
✅ Spawn menu displays grouped sessions
✅ Reconnect button creates terminal with correct type
✅ No background polling (only fetches when menu opens)
✅ Graceful error handling (missing TUI app, no tmux, etc.)
✅ Works with sessions spawned from anywhere (manual, tmuxplexer, etc.)

---

## Questions to Resolve

1. **TUI app language:** Go or Rust?
2. **TUI app name:** `tui-session-manager`, `tmuxplexer-json`, or other?
3. **Installation path:** `/usr/local/bin`, `~/.local/bin`, or bundled with Tabz?
4. **Update frequency:** Manual refresh only, or auto-refresh on interval?

---

## Next Steps

1. **Tabz side (you can start now):**
   - Add API endpoint skeleton
   - Add spawn menu UI mockup (with fake data)
   - Test with hardcoded JSON response

2. **TUI app side (later):**
   - Implement `--json` flag
   - Implement session type detection
   - Test JSON output format
   - Add filter/exclude logic

3. **Integration:**
   - Point Tabz to real TUI app binary
   - End-to-end testing
   - Performance tuning
   - Error handling

---

**End of Plan**
