# Tmuxplexer ↔ Tabz Integration - Complete Plan

**Consolidated from:** TUI_SESSION_MANAGER_INTEGRATION.md + My template launcher proposal
**Date:** November 13, 2025
**Status:** Planning phase

---

## Overview

Tmuxplexer integrates with Tabz in **two complementary ways**:

1. **Session Discovery** - Show orphaned tmux sessions in spawn menu (reconnection)
2. **Template Launching** - Create complex workspace layouts from templates

Both leverage tmux as the coordination layer and tmuxplexer's existing capabilities.

---

## Integration 1: Session Discovery & Reconnection

### Summary
Users can reconnect to existing tmux sessions directly from the Tabz spawn menu without needing to remember session names.

### Architecture

```
Tabz Spawn Menu
   ↓ [User clicks "+" button]
   ↓ GET /api/tmux/sessions/orphaned?windowId=main&existing=tt-cc-xyz
   ↓
Backend executes: tmuxplexer --json --filter="tt-*" --exclude="tt-cc-xyz"
   ↓
Tmuxplexer returns JSON with session metadata
   ↓
Backend groups by type (claude-code, bash, tui-tool)
   ↓
Spawn menu displays:
   🤖 Claude Code (1)
   • tt-cc-a2t ~/projects - idle [Reconnect]

   📁 TUI Tools (1)
   • tt-tfe-3ov ~/projects/... [Reconnect]
```

### Tmuxplexer Requirements

**Add `--json` mode:**
```go
// cmd/main.go
jsonMode := flag.Bool("json", false, "Output JSON instead of TUI")
filter := flag.String("filter", "", "Only show sessions matching pattern")
exclude := flag.String("exclude", "", "Comma-separated session names to exclude")

if *jsonMode {
    sessions, _ := listSessions()

    // Filter sessions
    filtered := filterSessions(sessions, *filter, *exclude)

    // Output JSON
    output := JSONOutput{
        Success: true,
        Timestamp: time.Now().Format(time.RFC3339),
        Sessions: convertToJSONFormat(filtered),
    }
    json, _ := json.MarshalIndent(output, "", "  ")
    fmt.Println(string(json))
    return
}

// Otherwise run TUI normally
runTUI()
```

**JSON Schema:**
```json
{
  "success": true,
  "timestamp": "2025-11-13T18:30:00Z",
  "sessions": [
    {
      "name": "tt-cc-a2t",
      "type": "claude-code",
      "attached": false,
      "created": "2025-11-13T18:01:51Z",
      "windows": 2,
      "workingDir": "/home/matt/projects/terminal-tabs",
      "gitBranch": "master",
      "claudeStatus": {
        "state": "idle",
        "currentTool": null,
        "lastUpdated": "2025-11-13T18:29:50Z"
      }
    }
  ]
}
```

### Tabz Backend Changes

**New API Endpoint:**
```javascript
// backend/routes/api.js

router.get('/api/tmux/sessions/orphaned', async (req, res) => {
  const windowId = req.query.windowId || 'main'
  const existingSessions = req.query.existing ? req.query.existing.split(',') : []

  try {
    // Build command
    let cmd = 'tmuxplexer --json --filter="tt-*"'
    if (existingSessions.length > 0) {
      cmd += ` --exclude="${existingSessions.join(',')}"`
    }

    const output = execSync(cmd, {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024
    })

    const data = JSON.parse(output)

    // Group sessions by type
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
      sessions: [],
      grouped: { 'claude-code': [], 'tui-tool': [], 'bash': [], 'other': [] }
    })
  }
})
```

### Tabz Frontend Changes

**Spawn Menu Enhancement:**
```typescript
// src/SimpleTerminalApp.tsx

const [orphanedSessions, setOrphanedSessions] = useState<OrphanedSessionsResponse | null>(null)

// Fetch when spawn menu opens
useEffect(() => {
  if (showSpawnMenu) {
    fetchOrphanedSessions()
  }
}, [showSpawnMenu])

const fetchOrphanedSessions = async () => {
  const existingSessions = visibleTerminals
    .map(t => t.sessionName)
    .filter(Boolean)
    .join(',')

  const params = new URLSearchParams({
    windowId: currentWindowId,
    existing: existingSessions
  })

  const response = await fetch(`/api/tmux/sessions/orphaned?${params}`)
  const data = await response.json()
  setOrphanedSessions(data)
}
```

**UI Component:**
```tsx
{orphanedSessions && orphanedSessions.sessions.length > 0 && (
  <>
    <div className="spawn-menu-divider" />
    <div className="spawn-menu-section">
      <div className="spawn-menu-header">
        <span>Existing Sessions ({orphanedSessions.sessions.length})</span>
        <button onClick={fetchOrphanedSessions} title="Refresh">🔄</button>
      </div>

      {orphanedSessions.grouped['claude-code'].map(session => (
        <div key={session.name} className="spawn-menu-session">
          <div className="spawn-menu-session-info">
            <div className="spawn-menu-session-name">
              {session.name}
            </div>
            <div className="spawn-menu-session-meta">
              {session.workingDir}
              {session.claudeStatus && ` • ${session.claudeStatus.state}`}
            </div>
          </div>
          <button onClick={() => handleReconnectSession(session)}>
            Reconnect
          </button>
        </div>
      ))}
    </div>
  </>
)}
```

### Status: Ready to Implement ✅

**Detailed spec exists:** `docs/TUI_SESSION_MANAGER_INTEGRATION.md`

---

## Integration 2: Template Launching (NEW)

### Summary
Users can launch complex workspace layouts (multi-pane tmux sessions) from project-specific or global templates using tmuxplexer.

### Architecture

```
User clicks "+New Terminal" in Tabz
   ↓
Check for .tabz/templates.json in working dir
   ↓
IF FOUND:
   Launch tmuxplexer interactive launcher
   ↓
   Tmuxplexer shows template menu (gum-style UI)
   ↓
   User selects "Full Stack Dev (2x2)"
   ↓
   Tmuxplexer creates: tmux new-session -d -s "tt-script-a1b2c3d4"
   Tmuxplexer creates 2x2 grid layout
   Tmuxplexer sends commands to each pane
   Tmuxplexer sets metadata: TABZ_TEMPLATE_NAME, TABZ_TERMINAL_TYPE
   ↓
   2 seconds later...
   ↓
   Tabz useTmuxDiscovery hook polls tmux
   Discovers new session: tt-script-a1b2c3d4
   Reads metadata from tmux environment
   Creates terminal entry with correct theme/name
   Reconnects to session
   ↓
   Terminal appears in Tabz with 4 panes running!
```

### Tmuxplexer Enhancements for Tabz

#### 1. Tabz-Specific Session Naming

**Modify session name generation:**
```go
// tmux.go

// generateTabzSessionName creates names compatible with Tabz discovery
// Format: tt-<type>-<random> where type is extracted from template
func generateTabzSessionName(template SessionTemplate) string {
    // Determine terminal type from template
    terminalType := detectTerminalType(template)
    randomID := generateRandomID(8)
    return fmt.Sprintf("tt-%s-%s", terminalType, randomID)
}

// detectTerminalType analyzes template to determine Tabz terminal type
func detectTerminalType(template SessionTemplate) string {
    // Check first pane command
    if len(template.Panes) > 0 {
        cmd := template.Panes[0].Command

        if strings.Contains(cmd, "claude") {
            return "claude-code"
        }
        if strings.Contains(cmd, "tfe") || strings.Contains(cmd, "lazygit") {
            return "tui-tool"
        }
    }

    // Check template category
    if template.Category == "AI" || template.Category == "Development" {
        return "script"
    }

    // Default
    return "bash"
}
```

#### 2. Metadata Storage in Tmux Environment

**Store template metadata for Tabz to read:**
```go
// After creating session, set environment variables
func setTabzMetadata(sessionName string, template SessionTemplate) error {
    metadata := map[string]string{
        "TABZ_TEMPLATE_NAME": template.Name,
        "TABZ_TERMINAL_TYPE": detectTerminalType(template),
        "TABZ_THEME":         getThemeFromTemplate(template),
        "TABZ_WORKING_DIR":   template.WorkingDir,
        "TABZ_ICON":          getIconFromTemplate(template),
        "TABZ_PANE_COUNT":    fmt.Sprintf("%d", len(template.Panes)),
    }

    for key, value := range metadata {
        cmd := exec.Command("tmux", "set-environment", "-t", sessionName, key, value)
        if err := cmd.Run(); err != nil {
            return err
        }
    }
    return nil
}

// In createSessionFromTemplateInternal, after creating session:
if err := setTabzMetadata(sessionName, template); err != nil {
    log.Printf("Warning: Failed to set Tabz metadata: %v", err)
}
```

#### 3. Project-Specific Template Loading

**Load templates from project directory:**
```go
// templates.go

// loadProjectTemplates loads from .tabz/templates.json in working dir
func loadProjectTemplates(workingDir string) ([]SessionTemplate, error) {
    projectTemplatesPath := filepath.Join(workingDir, ".tabz", "templates.json")

    if _, err := os.Stat(projectTemplatesPath); os.IsNotExist(err) {
        return nil, fmt.Errorf("no project templates found")
    }

    data, err := os.ReadFile(projectTemplatesPath)
    if err != nil {
        return nil, err
    }

    var templates []SessionTemplate
    if err := json.Unmarshal(data, &templates); err != nil {
        return nil, err
    }

    return templates, nil
}

// loadAllTemplates merges global + project templates
func loadAllTemplates(workingDir string) ([]SessionTemplate, error) {
    // Load global templates
    global, err := loadTemplates()
    if err != nil {
        return nil, err
    }

    // Try to load project templates
    project, err := loadProjectTemplates(workingDir)
    if err != nil {
        // No project templates, return global only
        return global, nil
    }

    // Merge: project templates first (higher priority)
    all := append(project, global...)
    return all, nil
}
```

#### 4. CLI Flags for Tabz Integration

**Add flags for scripted usage:**
```go
// main.go

var (
    projectMode = flag.Bool("project", false, "Load project-specific templates from .tabz/")
    cwdOverride = flag.String("cwd", "", "Working directory for templates")
    templateIdx = flag.Int("template", -1, "Create session from template index (non-interactive)")
    outputJSON  = flag.Bool("output-json", false, "Output JSON metadata after creating session")
)

// If template index specified, create and exit
if *templateIdx >= 0 {
    workingDir := *cwdOverride
    if workingDir == "" {
        workingDir, _ = os.Getwd()
    }

    templates, err := loadAllTemplates(workingDir)
    if err != nil {
        log.Fatal(err)
    }

    if *templateIdx >= len(templates) {
        log.Fatalf("Template index %d out of range (have %d templates)", *templateIdx, len(templates))
    }

    template := templates[*templateIdx]
    sessionName, err := createSessionFromTemplateWithOverride(template, workingDir)
    if err != nil {
        log.Fatal(err)
    }

    if *outputJSON {
        outputSessionMetadataJSON(sessionName, template)
    } else {
        fmt.Println(sessionName)
    }

    return
}
```

### Tabz Split Architecture Constraints

**Important:** Tabz has a hybrid split system:
- **Horizontal (side-by-side):** React-based, max 2 columns, each column is a separate tmux session
- **Vertical (up/down):** Tmux-based, multiple splits supported, all in same tmux session

This means:
- **2x2 layout** = 2 tmux sessions (left column + right column), each with 2 vertical panes
- **1x4 layout** = 1 tmux session with 4 vertical panes
- **4x1 layout** = 1 tmux session with 4 tmux windows (full-screen, switch with Ctrl+B)

### Three Template Modes

Templates can specify how they should be created:

#### Mode 1: `multi-window` (Recommended for 3-4 terminals)
**Best for:** TUI tools (Claude Code, TFE, LazyGit) that need full screen

Creates **one tmux session with multiple windows** - each terminal is full-screen, switch with Ctrl+B + number.

```
Session: tt-project-abc
├─ Window 0: Claude Code (full screen)
├─ Window 1: TFE          (full screen)
├─ Window 2: LazyGit      (full screen)
└─ Window 3: Bash         (full screen)

Switch with: Ctrl+B 0, Ctrl+B 1, Ctrl+B 2, Ctrl+B 3
```

**In Tabz:** Shows as **one terminal tab** with window navigation in footer

#### Mode 2: `single-session` (For vertical splits)
**Best for:** Monitoring, logs, or when you want to see all panes at once

Creates **one tmux session with vertical splits** - all panes visible simultaneously.

```
Session: tt-script-xyz
┌──────────────┐
│ Claude Code  │ ← Pane 0
├──────────────┤
│ Editor       │ ← Pane 1
├──────────────┤
│ Dev Server   │ ← Pane 2
├──────────────┤
│ Tests        │ ← Pane 3
└──────────────┘
```

**In Tabz:** Shows as **one terminal tab** with 4 panes stacked vertically

#### Mode 3: `multi-session` (For complex layouts)
**Best for:** When you need multiple columns

Creates **multiple tmux sessions** arranged side-by-side in Tabz.

```
Session 1: tt-script-abc     Session 2: tt-script-xyz
┌──────────────┐            ┌──────────────┐
│ Frontend     │            │ Backend      │
├──────────────┤            ├──────────────┤
│ Tests        │            │ Database     │
└──────────────┘            └──────────────┘
       ↑                            ↑
       └──── React split (Tabz) ────┘
```

**In Tabz:** Shows as **one terminal tab** with 2 columns (React split)

---

### Template Format for Tabz

**`.tabz/templates.json` (project-specific):**
```json
[
  {
    "name": "Project Workspace (Windows)",
    "description": "Claude + TFE + Git + Shell (full-screen each)",
    "category": "Development",
    "working_dir": ".",
    "layout": "4x1",
    "tabz_mode": "multi-window",
    "tabz_metadata": {
      "terminal_type": "script",
      "theme": "cyberpunk",
      "icon": "🚀"
    },
    "panes": [
      {"command": "claude", "title": "Claude Code"},
      {"command": "tfe .", "title": "Files"},
      {"command": "lazygit", "title": "Git"},
      {"command": "bash", "title": "Shell"}
    ]
  },
  {
    "name": "Dev Stack (Vertical)",
    "description": "All tools visible at once",
    "category": "Development",
    "layout": "1x4",
    "tabz_mode": "single-session",
    "tabz_metadata": {
      "terminal_type": "script",
      "theme": "matrix",
      "icon": "📊"
    },
    "panes": [
      {"command": "npm run dev", "title": "Dev Server"},
      {"command": "npm test -- --watch", "title": "Tests"},
      {"command": "npm run lint:watch", "title": "Linter"},
      {"command": "docker compose logs -f", "title": "Logs"}
    ]
  },
  {
    "name": "Full Stack (2 Columns)",
    "description": "Frontend + Backend in separate columns",
    "category": "Development",
    "layout": "2x2",
    "tabz_mode": "multi-session",
    "tabz_metadata": {
      "terminal_type": "script",
      "theme": "cyberpunk",
      "icon": "🚀"
    },
    "panes": [
      {"command": "npm run dev", "title": "Frontend", "working_dir": "./frontend"},
      {"command": "npm test", "title": "Tests", "working_dir": "./frontend"},
      {"command": "npm run dev:api", "title": "Backend", "working_dir": "./backend"},
      {"command": "docker compose up", "title": "Database"}
    ]
  }
]
```

### Template Mode Comparison

| Aspect | `multi-window` | `single-session` | `multi-session` |
|--------|----------------|------------------|-----------------|
| **Best for** | TUI tools (full-screen) | Monitoring/logs (split) | Multi-column layouts |
| **Sessions created** | 1 | 1 | 2+ |
| **Layout in Tabz** | 1 tab, switch windows | 1 tab, vertical panes | 1 tab, React split |
| **Navigation** | Ctrl+B 0/1/2/3 | Scroll, all visible | Click columns |
| **Recommended for** | 3-4 terminals (Claude, TFE, Git) | 4+ logs/monitors | Frontend + Backend |
| **Example** | `4x1` = 4 windows | `1x4` = 4 panes | `2x2` = 2 cols × 2 rows |

**Your workflow (Claude + TFE + LazyGit + Bash):** Use `multi-window` mode! ⭐

---

### Tabz Changes for Template Launching

#### 1. Detection of Project Templates

**Check if project has templates:**
```typescript
// src/hooks/useProjectTemplates.ts

export function useProjectTemplates(workingDir: string) {
  const [hasTemplates, setHasTemplates] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    checkForTemplates()
  }, [workingDir])

  const checkForTemplates = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/tmuxplexer/has-templates?cwd=${encodeURIComponent(workingDir)}`
      )
      const data = await response.json()
      setHasTemplates(data.hasTemplates)
    } catch (error) {
      console.error('[useProjectTemplates] Error checking templates:', error)
      setHasTemplates(false)
    } finally {
      setLoading(false)
    }
  }

  return { hasTemplates, loading, checkForTemplates }
}
```

#### 2. Modified "+New Terminal" Behavior

**Launch tmuxplexer if templates exist:**
```typescript
// src/SimpleTerminalApp.tsx

const handleNewTerminal = async () => {
  const workingDir = settingsStore.defaultWorkingDir

  // Check for project templates
  const response = await fetch(
    `/api/tmuxplexer/has-templates?cwd=${encodeURIComponent(workingDir)}`
  )
  const { hasTemplates } = await response.json()

  if (hasTemplates) {
    // Launch tmuxplexer launcher (will create detached session)
    await launchTmuxplexer(workingDir)

    // Tmux discovery hook will pick it up automatically
    console.log('[Spawn] Launched tmuxplexer - session will appear shortly')
  } else {
    // Default: spawn bash
    await spawnTerminal({
      terminalType: 'bash',
      workingDir
    })
  }
}

const launchTmuxplexer = async (workingDir: string) => {
  try {
    await fetch('/api/tmuxplexer/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDir,
        mode: 'project'
      })
    })
  } catch (error) {
    console.error('[Spawn] Error launching tmuxplexer:', error)
    alert('Failed to launch template selector')
  }
}
```

#### 3. Backend Endpoints

**API for template detection and launching:**
```javascript
// backend/routes/api.js

// Check if project has templates
router.get('/api/tmuxplexer/has-templates', async (req, res) => {
  const { cwd } = req.query
  const projectTemplates = path.join(cwd, '.tabz', 'templates.json')
  const hasTemplates = fs.existsSync(projectTemplates)

  res.json({ hasTemplates })
})

// Launch tmuxplexer (spawns in background)
router.post('/api/tmuxplexer/launch', async (req, res) => {
  const { workingDir, mode } = req.body

  try {
    // Build command
    const args = ['--project', '--cwd', workingDir]

    // Spawn tmuxplexer in background (detached)
    const child = spawn('tmuxplexer', args, {
      detached: true,
      stdio: 'ignore',
      cwd: workingDir
    })

    child.unref() // Let it run independently

    res.json({ success: true })
  } catch (error) {
    console.error('[API] Error launching tmuxplexer:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// List available templates (for UI preview)
router.get('/api/tmuxplexer/templates', async (req, res) => {
  const { cwd } = req.query

  try {
    const { stdout } = await execAsync(
      `tmuxplexer --list --project --cwd "${cwd}" --output json`
    )

    const templates = JSON.parse(stdout)
    res.json({ templates })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

#### 4. Tmux Discovery Enhancement

**Read metadata from tmux environment:**
```typescript
// src/hooks/useTmuxDiscovery.ts

// When discovering new session, read Tabz metadata
const getTabzMetadata = async (sessionName: string) => {
  try {
    const response = await fetch(
      `/api/tmux/environment?session=${encodeURIComponent(sessionName)}`
    )
    const env = await response.json()

    return {
      templateName: env.TABZ_TEMPLATE_NAME,
      terminalType: env.TABZ_TERMINAL_TYPE || 'bash',
      theme: env.TABZ_THEME,
      workingDir: env.TABZ_WORKING_DIR,
      icon: env.TABZ_ICON,
      paneCount: parseInt(env.TABZ_PANE_COUNT || '1')
    }
  } catch (error) {
    console.error('[useTmuxDiscovery] Error reading metadata:', error)
    return null
  }
}

// Use metadata when creating terminal entry
if (metadata) {
  newTerminal.name = metadata.templateName || terminalType
  newTerminal.terminalType = metadata.terminalType
  newTerminal.theme = metadata.theme || config.defaultTheme
  newTerminal.icon = metadata.icon || config.icon
}
```

**Backend endpoint to read tmux environment:**
```javascript
// backend/routes/api.js

router.get('/api/tmux/environment', async (req, res) => {
  const { session } = req.query

  try {
    const { stdout } = await execAsync(
      `tmux show-environment -t "${session}"`
    )

    // Parse environment variables
    const env = {}
    stdout.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        env[match[1]] = match[2]
      }
    })

    res.json(env)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### Status: Needs Implementation 🆕

---

## Comparison: Session Discovery vs Template Launching

| Aspect | Session Discovery | Template Launching |
|--------|------------------|-------------------|
| **Trigger** | User opens spawn menu | User clicks "+New Terminal" |
| **Tmuxplexer Mode** | `--json` (non-interactive) | Interactive TUI |
| **Purpose** | Reconnect to existing sessions | Create new multi-pane workspaces |
| **Sessions** | Shows orphaned tt-* sessions | Creates new tt-* session |
| **UI** | Spawn menu dropdown | Full-screen tmuxplexer TUI |
| **Workflow** | Fast reconnection | Template selection → workspace creation |
| **Metadata Source** | Live tmux inspection | Template JSON + tmux environment |

Both features are **complementary**:
- **Discovery** helps recover lost sessions
- **Templates** help create complex layouts quickly

---

## Implementation Priority

### Phase 1: Session Discovery (2-3 days)
1. Add `--json` flag to tmuxplexer
2. Implement session type detection
3. Add Tabz backend endpoint
4. Add spawn menu UI
5. Test reconnection flow

### Phase 2: Template Launching (3-4 days)
1. Add Tabz metadata storage to tmuxplexer
2. Add project template loading
3. Implement session name generation (tt- prefix)
4. Add Tabz backend endpoints (has-templates, launch)
5. Modify "+New Terminal" button logic
6. Enhance useTmuxDiscovery to read metadata

### Phase 3: Polish (1-2 days)
1. Error handling for missing tmuxplexer
2. Graceful fallback when no templates
3. Documentation and examples
4. Testing across both integrations

---

## Example Workflow

### Workflow 1: Reconnecting to Orphaned Session

```bash
# User in Tabz, clicks "+" button
# Spawn menu opens, fetches orphaned sessions
# Shows:
#   🤖 Claude Code (1)
#   • tt-cc-a2t ~/projects - idle [Reconnect]

# User clicks "Reconnect"
# Tabz creates terminal entry with sessionName="tt-cc-a2t"
# Backend reconnects to existing tmux session
# Terminal appears with Claude Code session active
```

### Workflow 2: Creating Workspace from Template

```bash
# User in ~/projects/terminal-tabs
# Clicks "+New Terminal" button

# Tabz detects .tabz/templates.json exists
# Launches: tmuxplexer --project --cwd ~/projects/terminal-tabs

# Tmuxplexer TUI shows:
#   > Full Stack Dev (2x2)
#     Claude + Editor (1x2)
#     Monitoring Wall (4x2)

# User selects "Full Stack Dev"
# Tmuxplexer creates:
#   Session: tt-script-a1b2c3d4
#   Layout: 2x2 grid
#   Panes: npm dev, npm dev:api, docker, npm test
#   Metadata: TABZ_TEMPLATE_NAME="Full Stack Dev"

# 2 seconds later...
# Tabz discovers new session
# Reads metadata from tmux environment
# Creates terminal entry with name="Full Stack Dev"
# Reconnects to session
# Terminal appears with 4 panes running!
```

---

## Success Criteria

### Session Discovery
- ✅ Orphaned sessions appear in spawn menu within 1 second
- ✅ Sessions grouped by type (claude-code, bash, tui-tool)
- ✅ Claude status displayed for Claude sessions
- ✅ Reconnection works without manual session name entry
- ✅ Graceful fallback when tmuxplexer not installed

### Template Launching
- ✅ Project templates auto-detected from .tabz/templates.json
- ✅ Tmuxplexer launches in <500ms
- ✅ Created sessions appear in Tabz within 2 seconds
- ✅ Metadata correctly parsed (name, theme, type)
- ✅ Works with complex layouts (2x2, 4x2, etc.)
- ✅ Falls back to bash spawn when no templates

---

## Files to Modify

### Tmuxplexer
```
main.go                 # Add --json, --project, --output-json flags
tmux.go                 # Add Tabz session naming + metadata storage
templates.go            # Add project template loading
types.go                # Add Tabz metadata types
```

### Tabz
```
backend/routes/api.js               # Add 4 new endpoints
src/SimpleTerminalApp.tsx           # Modify spawn menu + "+New" button
src/SimpleTerminalApp.css           # Add spawn menu session styles
src/hooks/useTmuxDiscovery.ts       # Add metadata reading
src/hooks/useProjectTemplates.ts    # NEW: Template detection hook
```

---

**End of Consolidated Plan**
