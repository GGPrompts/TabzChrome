# Personal Homepage MCP Integration

Research and planning for integrating TabzChrome MCP capabilities into a personal homepage/dashboard.

> **Context**: This research was done while building [personal-homepage](~/projects/personal-homepage), a browser start page with Weather, Daily Feed, and API Playground sections. The MCP integration was deferred to keep the public Vercel deployment dependency-free.

## Integration Vision

A unified dashboard that serves as both a browser start page AND a control center for MCP-powered workflows.

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Control Center                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Connected Servers          Quick Actions                   │
│  ┌─────────────────┐       ┌──────────────────────────┐    │
│  │ ● browser-mcp   │       │ [📸 Screenshot] [🖱 Click] │    │
│  │ ● terminal-mcp  │       │ [➕ New Tab] [💻 Terminal] │    │
│  └─────────────────┘       └──────────────────────────┘    │
│                                                             │
│  Terminal Sessions          Prompt Queue                    │
│  ┌─────────────────┐       ┌──────────────────────────┐    │
│  │ > session-1     │       │ "Fix the auth bug..."    │    │
│  │ > session-2     │       │ "Add dark mode to..."    │    │
│  └─────────────────┘       └──────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Architecture

### Communication Flow

```
Personal Homepage (React)
         ↓
    WebSocket + REST
         ↓
Backend Server (localhost:8129)
    ├── Terminal PTY management
    ├── Console log storage
    └── Script execution relay
         ↓
Chrome Extension
    ├── Console capture
    ├── Script execution
    └── Tab management
```

### Connection Strategy

```typescript
// Auto-detect if TabzChrome backend is running
const [backendAvailable, setBackendAvailable] = useState(false)

useEffect(() => {
  fetch('http://localhost:8129/api/health')
    .then(() => setBackendAvailable(true))
    .catch(() => setBackendAvailable(false))
}, [])

// Only show MCP section if backend is available
{backendAvailable && <MCPControlCenter />}
```

## Available MCP Tools

| Tool | Description | UI Element |
|------|-------------|------------|
| `browser_get_page_info` | Get current tab URL, title | Status display |
| `browser_screenshot` | Capture viewport/fullpage | Button + gallery |
| `browser_download_image` | Download images from page | Button |
| `browser_get_console_logs` | Retrieve console output | Live log viewer |
| `browser_execute_script` | Run JS in browser | Code input + run |
| `browser_click` | Click element by selector | Selector input |
| `browser_fill` | Fill input fields | Form builder |
| `browser_list_tabs` | List all open tabs | Tab list UI |
| `browser_switch_tab` | Switch to specific tab | Click to switch |
| `browser_rename_tab` | Custom tab names | Inline edit |
| `browser_get_element` | Inspect element HTML/CSS | Inspector panel |
| `browser_open_url` | Open allowed URLs | URL input |

## Planned Features

### 1. Console Log Viewer

Real-time browser console logs with filtering:

```typescript
// Connect to backend WebSocket
const ws = new WebSocket('ws://localhost:8129')

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'browser-console-log') {
    addLog(data.entry)
  }
}

// Or poll REST endpoint
const logs = await fetch('http://localhost:8129/api/browser/console-logs?level=error&limit=100')
```

**UI Features:**
- Filter by level (log, warn, error, info, debug)
- Filter by tab
- Search logs
- Clear logs
- Auto-scroll toggle

### 2. Tab Manager

Visual tab management:

```typescript
// List tabs
const tabs = await fetch('http://localhost:8129/api/browser/page-info')

// Switch tab (via MCP tool or direct)
await fetch('http://localhost:8129/api/browser/switch-tab', {
  method: 'POST',
  body: JSON.stringify({ tabId: 123 })
})
```

**UI Features:**
- Grid/list view of open tabs
- Favicon + title display
- Click to switch
- Rename tabs inline
- Close tabs
- Group by domain

### 3. Quick Actions Panel

Button grid for common MCP operations:

| Action | Tool | Parameters |
|--------|------|------------|
| 📸 Screenshot | `browser_screenshot` | `{ fullPage: false }` |
| 📄 Full Page | `browser_screenshot` | `{ fullPage: true }` |
| 🔄 Refresh | `browser_execute_script` | `location.reload()` |
| ⬆️ Scroll Top | `browser_execute_script` | `scrollTo(0,0)` |
| 📋 Copy URL | `browser_execute_script` | `navigator.clipboard.writeText(location.href)` |

### 4. Terminal Session Manager

List and manage terminal sessions from the homepage:

```typescript
// Get sessions
const sessions = await fetch('http://localhost:8129/api/tmux/sessions')

// Spawn new terminal
await fetch('http://localhost:8129/api/tmux/spawn', {
  method: 'POST',
  body: JSON.stringify({ profile: 'default' })
})
```

**UI Features:**
- List active sessions (ctt-* prefix)
- Session status (active, idle)
- Kill session button
- Spawn new session
- Link to open in extension sidepanel

### 5. Embedded Terminal (Advanced)

Full xterm.js terminal in the homepage:

```typescript
import { Terminal } from 'xterm'
import { AttachAddon } from 'xterm-addon-attach'

const term = new Terminal()
const ws = new WebSocket('ws://localhost:8129')

// Attach to existing session
ws.send(JSON.stringify({
  type: 'attach-tmux',
  sessionName: 'ctt-abc123'
}))

const attachAddon = new AttachAddon(ws)
term.loadAddon(attachAddon)
```

### 6. Prompt Queue

Queue prompts to send to Claude Code sessions:

**UI Features:**
- Text area for prompt input
- Queue list with pending prompts
- Target session selector
- Send to tmux session via:
  ```bash
  tmux send-keys -t session-name "prompt text" Enter
  ```

### 7. Screenshot Gallery

View recent screenshots captured via MCP:

```typescript
// Screenshots are saved to ~/ai-images/
// Could watch this directory or maintain a list
const screenshots = await fetch('http://localhost:8129/api/screenshots')
```

**UI Features:**
- Grid of recent screenshots
- Click to view full size
- Copy to clipboard
- Delete

## Section Configuration

Make MCP features optional/toggleable:

```typescript
// types
interface SectionConfig {
  id: string
  enabled: boolean
  requiresLocal: boolean
  localEndpoint?: string
}

// Default config
const defaultSections: SectionConfig[] = [
  { id: 'weather', enabled: true, requiresLocal: false },
  { id: 'feed', enabled: true, requiresLocal: false },
  { id: 'api-playground', enabled: true, requiresLocal: false },
  { id: 'mcp', enabled: false, requiresLocal: true, localEndpoint: 'http://localhost:8129' },
]

// Auto-enable if backend detected
useEffect(() => {
  if (backendAvailable) {
    setSections(prev => prev.map(s =>
      s.id === 'mcp' ? { ...s, enabled: true } : s
    ))
  }
}, [backendAvailable])
```

## File Structure (Proposed)

```
personal-homepage/
├── app/sections/
│   └── mcp-control/
│       ├── index.tsx           # Main MCP section
│       ├── ConsoleViewer.tsx   # Console log component
│       ├── TabManager.tsx      # Tab list/management
│       ├── QuickActions.tsx    # Action button grid
│       ├── TerminalList.tsx    # Session list
│       ├── PromptQueue.tsx     # Prompt queueing
│       └── hooks/
│           ├── useBackendConnection.ts
│           ├── useConsoleLogs.ts
│           └── useTabs.ts
```

## Dependencies

```json
{
  "dependencies": {
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "xterm-addon-attach": "^0.9.0"
  }
}
```

## API Endpoints Reference

### Backend REST API (localhost:8129)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/console-logs` | Get console logs |
| GET | `/api/browser/page-info` | Get current page info |
| POST | `/api/browser/execute-script` | Execute JS in browser |
| GET | `/api/tmux/sessions` | List terminal sessions |
| POST | `/api/tmux/spawn` | Create new terminal |
| DELETE | `/api/tmux/sessions/:name` | Kill terminal |
| POST | `/api/tmux/sessions/:name/rename` | Rename terminal |

### WebSocket Messages (ws://localhost:8129)

**Incoming (from server):**
- `{ type: 'browser-console-log', entry: {...} }`
- `{ type: 'output', terminalId, data }`
- `{ type: 'sessions-list', sessions: [...] }`

**Outgoing (to server):**
- `{ type: 'attach-tmux', sessionName }`
- `{ type: 'command', terminalId, command }`
- `{ type: 'resize', terminalId, cols, rows }`

## Implementation Priority

1. **Phase 1: Read-only monitoring**
   - Console log viewer
   - Tab list (view only)
   - Backend connection detection

2. **Phase 2: Basic actions**
   - Tab switching
   - Screenshot button
   - Quick action buttons

3. **Phase 3: Terminal integration**
   - Terminal session list
   - Spawn/kill terminals
   - Link to extension

4. **Phase 4: Advanced**
   - Embedded xterm.js terminal
   - Prompt queue
   - Screenshot gallery

## Related Files

- Personal Homepage: `~/projects/personal-homepage/`
- TabzChrome Backend: `~/projects/TabzChrome/backend/`
- MCP Server: `~/projects/TabzChrome/browser-mcp-server/`
- Extension: `~/projects/TabzChrome/extension/`

---

*Created during personal-homepage development session, November 2024*
