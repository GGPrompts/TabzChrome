# TabzChrome API Reference (Internal)

REST API at `localhost:8129` for debugging, testing, and TabzChrome development.

> **For external project integration**, use the `tabz-integration` plugin which provides comprehensive integration documentation.

## Authentication

Most endpoints require auth token from `/tmp/tabz-auth-token`.

| Context | How to Get Token |
|---------|------------------|
| CLI/Scripts | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| Extension | Auto-fetches via localhost API |
| External pages | User must paste token |

Token is auto-generated on backend start (mode 0600).

---

## Endpoints

### POST /api/spawn

Create a terminal programmatically.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Worker", "workingDir": "~/projects", "command": "claude"}'
```
[Paste Spawn Example](tabz:paste?text=TOKEN%3D%24%28cat%20%2Ftmp%2Ftabz-auth-token%29%0Acurl%20-X%20POST%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fspawn%20%5C%0A%20%20-H%20%22Content-Type%3A%20application%2Fjson%22%20%5C%0A%20%20-H%20%22X-Auth-Token%3A%20%24TOKEN%22%20%5C%0A%20%20-d%20%27%7B%22name%22%3A%20%22Worker%22%2C%20%22workingDir%22%3A%20%22~%2Fprojects%22%2C%20%22command%22%3A%20%22claude%22%7D%27)

**Parameters:**
- `name` - Display name (default: "Claude Terminal")
- `workingDir` - Starting directory (default: $HOME)
- `command` - Auto-executed after spawn (optional)

---

### GET /api/health

Health check (no auth required).

```bash
curl http://localhost:8129/api/health
# Returns: uptime, memory, version, Node.js version, platform
```
[Paste Health Check](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fhealth)

---

### GET /api/agents

List all active terminals.

```bash
curl http://localhost:8129/api/agents
# Returns: data[] with id, name, state, sessionName
```
[Paste List Agents](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fagents)

---

### DELETE /api/agents/:id

Kill a terminal by ID.

```bash
curl -X DELETE http://localhost:8129/api/agents/ctt-MyTerminal-abc123
```
[Paste Delete Example](tabz:paste?text=curl%20-X%20DELETE%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Fagents%2Fctt-MyTerminal-abc123)

---

### GET /api/claude-status

Get Claude Code status for a terminal.

```bash
curl "http://localhost:8129/api/claude-status?dir=/home/user/project&sessionName=ctt-xxx"
# Returns: status, tool, file, subagentCount, contextPercentage
```

---

### GET/POST /api/settings/working-dir

Sync working directory settings.

```bash
# GET current settings
curl http://localhost:8129/api/settings/working-dir

# POST to update
curl -X POST http://localhost:8129/api/settings/working-dir \
  -H "Content-Type: application/json" \
  -d '{"globalWorkingDir": "~/projects", "recentDirs": ["~", "~/projects"]}'
```

---

### GET /api/tmux/sessions/:name/capture

Capture full terminal scrollback as text.

```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/capture
# Returns: content, metadata (workingDir, gitBranch, timestamp)
```
[Paste Capture Example](tabz:paste?text=curl%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Ftmux%2Fsessions%2Fctt-Claude-abc123%2Fcapture)

---

### POST /api/audio/speak

TTS playback via sidebar.

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, this is a test",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+20%",
    "volume": 0.8
  }'
```
[Paste TTS Example](tabz:paste?text=curl%20-X%20POST%20http%3A%2F%2Flocalhost%3A8129%2Fapi%2Faudio%2Fspeak%20%5C%0A%20%20-H%20%22Content-Type%3A%20application%2Fjson%22%20%5C%0A%20%20-d%20%27%7B%22text%22%3A%20%22Hello%2C%20this%20is%20a%20test%22%2C%20%22voice%22%3A%20%22en-US-AndrewMultilingualNeural%22%7D%27)

---

## Browser Profiles

CRUD operations for terminal profiles.

### GET /api/browser/profiles

List all profiles.

```bash
curl http://localhost:8129/api/browser/profiles
# Returns: profiles[], defaultProfileId, globalWorkingDir
```

### POST /api/browser/profiles

Create a new profile.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/browser/profiles \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profile": {"name": "My Profile", "category": "Dev", "command": "claude"}}'
```

**Body:** `{ profile: { name (required), workingDir, command, category, themeName, fontSize, fontFamily } }`

### PUT /api/browser/profiles/:id

Update an existing profile.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X PUT http://localhost:8129/api/browser/profiles/my-profile \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Updated Name", "category": "Work"}'
```

### DELETE /api/browser/profiles/:id

Delete a profile (cannot delete last one).

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X DELETE http://localhost:8129/api/browser/profiles/my-profile \
  -H "X-Auth-Token: $TOKEN"
```

### POST /api/browser/profiles/import

Bulk import profiles.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/browser/profiles/import \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profiles": [{"name": "P1"}, {"name": "P2"}], "mode": "merge"}'
```

**Modes:** `merge` (add new, skip duplicates) | `replace` (overwrite all)

---

## WebSocket Messages

Real-time terminal I/O via `ws://localhost:8129`:

| Message | Purpose |
|---------|---------|
| `TERMINAL_SPAWN` | Create terminal |
| `TERMINAL_INPUT` | Send keystrokes |
| `TERMINAL_OUTPUT` | Receive output (routed to owners) |
| `TERMINAL_RESIZE` | Update dimensions |
| `TERMINAL_KILL` | Close terminal |
| `RECONNECT` | Reattach to existing session |

See `extension/shared/messaging.ts` for message schemas.
