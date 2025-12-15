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

---

### GET /api/health

Health check endpoint (no auth required).

```bash
curl http://localhost:8129/api/health
```

---

### GET /api/agents

List all active terminals.

```bash
curl http://localhost:8129/api/agents
```

---

### DELETE /api/agents/:id

Kill a terminal by ID.

```bash
curl -X DELETE http://localhost:8129/api/agents/ctt-MyTerminal-a1b2c3d4
```

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

## Security Model

- **CLI/Conductor**: Full access via token file
- **Extension**: Fetches token via `/api/auth/token` (localhost only)
- **External pages**: User must manually paste token
- **Malicious sites**: Cannot auto-spawn - token required
