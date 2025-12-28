# TabzChrome HTTP API

The backend exposes REST endpoints for terminal automation and integration.

**Base URL:** `http://localhost:8129`

---

## Authentication

Most endpoints require an auth token to prevent unauthorized terminal spawning.

**Token Location:** `/tmp/tabz-auth-token` (auto-generated on backend startup, mode 0600)

| Context | How to Get Token |
|---------|------------------|
| CLI / Scripts | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| Extension Settings | Click "API Token" → "Copy Token" |
| GitHub Pages launcher | Paste token into input field |

---

## Endpoints

### POST /api/spawn

Spawn a terminal programmatically.

**Headers:**
- `Content-Type: application/json`
- `X-Auth-Token: <token>` (required)

**Body:**
```json
{
  "name": "My Terminal",
  "workingDir": "/home/user/projects",
  "command": "claude --dangerously-skip-permissions"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Display name (default: "Claude Terminal") |
| `workingDir` | string | No | Starting directory (default: `$HOME`) |
| `command` | string | No | Command to run after spawn |

**Response:**
```json
{
  "success": true,
  "terminal": {
    "id": "ctt-MyTerminal-a1b2c3d4",
    "name": "My Terminal",
    "terminalType": "bash",
    "ptyInfo": {
      "useTmux": true,
      "tmuxSession": "ctt-MyTerminal-a1b2c3d4"
    }
  }
}
```

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Claude Worker", "workingDir": "~/projects", "command": "claude"}'
```
[Paste Spawn Example](tabz:paste?text=TOKEN%3D%24%28cat%20%2Ftmp%2Ftabz-auth-token%29%0Acurl%20-X%20POST%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fspawn%20%5C%0A%20%20-H%20%22Content-Type%3A%20application%2Fjson%22%20%5C%0A%20%20-H%20%22X-Auth-Token%3A%20%24TOKEN%22%20%5C%0A%20%20-d%20%27%7B%22name%22%3A%20%22Claude%20Worker%22%2C%20%22workingDir%22%3A%20%22~%2Fprojects%22%2C%20%22command%22%3A%20%22claude%22%7D%27)

---

### GET /api/health

Health check endpoint (no auth required).

```bash
curl http://localhost:8129/api/health
```
[Paste Health Check](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fhealth)

---

### GET /api/agents

List all active terminals.

```bash
curl http://localhost:8129/api/agents
```
[Paste List Agents](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fagents)

---

### DELETE /api/agents/:id

Kill a terminal by ID.

```bash
curl -X DELETE http://localhost:8129/api/agents/ctt-MyTerminal-a1b2c3d4
```
[Paste Delete Example](tabz:paste?text=curl%20-X%20DELETE%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fagents%2Fctt-MyTerminal-a1b2c3d4)

---

### POST /api/agents/:id/detach

Detach a terminal (convert to ghost session). Used by popout windows when closed via OS window button.

This endpoint is designed for `navigator.sendBeacon()` - it accepts an empty body and doesn't require auth since it only detaches (doesn't spawn or kill).

```bash
curl -X POST http://localhost:8129/api/agents/ctt-MyTerminal-a1b2c3d4/detach
```

**Response:**
```json
{
  "success": true,
  "message": "Terminal detached",
  "terminalId": "ctt-MyTerminal-a1b2c3d4"
}
```

**Use case:** When a popout window is closed via the OS close button (X), the `beforeunload` handler calls this endpoint to detach the terminal, making it a "ghost" that can be reattached later.

---

### GET/POST /api/settings/working-dir

Sync working directory settings between extension and dashboard.

**GET:**
```bash
curl http://localhost:8129/api/settings/working-dir
```

**POST:**
```bash
curl -X POST http://localhost:8129/api/settings/working-dir \
  -H "Content-Type: application/json" \
  -d '{"globalWorkingDir": "~/projects", "recentDirs": ["~", "~/projects"]}'
```

---

### GET /api/claude-status

Get Claude Code status for a terminal.

```bash
curl "http://localhost:8129/api/claude-status?dir=/home/user/project&sessionName=ctt-xxx"
```

---

## WebSocket

Real-time terminal I/O uses WebSocket at `ws://localhost:8129`.

**Message Types:**
- `TERMINAL_SPAWN` - Create new terminal
- `TERMINAL_INPUT` - Send keystrokes
- `TERMINAL_OUTPUT` - Receive output
- `TERMINAL_RESIZE` - Update dimensions
- `TERMINAL_KILL` - Close terminal

See `extension/shared/messaging.ts` for message schemas.

---

## Tmux Session Endpoints

### GET /api/tmux/sessions/:name/capture

Capture full terminal scrollback as text. Used by the "View as Text" feature.

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "terminal output text...",
    "lines": 1234,
    "metadata": {
      "sessionName": "ctt-Claude-abc123",
      "workingDir": "/home/user/projects",
      "gitBranch": "main",
      "capturedAt": "2025-12-19T17:30:00.000Z"
    }
  }
}
```

**Example:**
```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/capture
```
[Paste Capture Example](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Ftmux%2Fsessions%2Fctt-Claude-abc123%2Fcapture)

**Notes:**
- ANSI escape codes are stripped for clean text output
- No line length or line count limits (full scrollback)
- `gitBranch` is null if not in a git repository

---

### POST /api/ai/explain-script

Use Claude to explain what a script does. Used by the File Tree "Explain Script" feature.

**Body:**
```json
{
  "path": "/home/user/scripts/deploy.sh"
}
```

**Response:**
```json
{
  "success": true,
  "explanation": "This script deploys the application to production. It pulls latest code, builds, and restarts services. Warning: modifies files in /var/www and restarts nginx."
}
```

**Notes:**
- Requires `claude` CLI to be installed and accessible
- File content limited to 10KB to prevent token overflow
- 60 second timeout for Claude response
- Returns concise 2-3 sentence summary focusing on purpose and side effects

---

## Security Model

- **CLI/Conductor**: Full access via token file
- **Extension**: Fetches token via `/api/auth/token` (localhost only)
- **External pages**: User must manually paste token
- **Malicious sites**: Cannot auto-spawn - token required
