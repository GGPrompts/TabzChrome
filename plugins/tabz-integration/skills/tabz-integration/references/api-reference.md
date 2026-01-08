# TabzChrome API Reference for Integration

REST API at `localhost:8129` for integrating external projects with TabzChrome.

## Authentication

Most endpoints require the auth token from `/tmp/tabz-auth-token`.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -H "X-Auth-Token: $TOKEN" http://localhost:8129/api/agents
```

The token file is created when the backend starts (mode 0600, readable by owner only).

---

## Core Endpoints

### POST /api/spawn

Create a new terminal tab programmatically.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "Build Worker",
    "workingDir": "~/projects/myapp",
    "command": "npm run build"
  }'
```

**Parameters:**
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | No | "Claude Terminal" | Display name in tab |
| `workingDir` | No | $HOME | Starting directory |
| `command` | No | - | Command to auto-execute |

**Response:**
```json
{
  "success": true,
  "terminalId": "ctt-BuildWorker-abc123"
}
```

---

### GET /api/health

Health check (no auth required).

```bash
curl http://localhost:8129/api/health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "version": "1.4.0",
  "nodeVersion": "v20.10.0",
  "platform": "linux"
}
```

---

### GET /api/agents

List all active terminals.

```bash
curl http://localhost:8129/api/agents
```

**Response:**
```json
{
  "data": [
    {
      "id": "ctt-Claude-abc123",
      "name": "Claude",
      "state": "active",
      "sessionName": "ctt-Claude-abc123"
    }
  ]
}
```

---

### DELETE /api/agents/:id

Kill a terminal by ID.

```bash
curl -X DELETE http://localhost:8129/api/agents/ctt-Claude-abc123
```

---

## Audio Endpoints

### POST /api/audio/speak

Generate and play TTS audio through the Chrome sidebar.

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Task complete",
    "voice": "en-US-EmmaNeural",
    "rate": "+10%",
    "pitch": "+20Hz",
    "volume": 0.8,
    "priority": "high"
  }'
```

**Parameters:**
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `text` | Yes | - | Text to speak |
| `voice` | No | User setting | Voice code (see audio-integration.md) |
| `rate` | No | "+0%" | Speed (-50% to +100%) |
| `pitch` | No | "+0Hz" | Pitch (-200Hz to +300Hz) |
| `volume` | No | 0.7 | Playback volume (0.0-1.0) |
| `priority` | No | "low" | "high" interrupts, "low" can be skipped |

---

### POST /api/audio/generate

Generate TTS audio and return URL (doesn't auto-play).

```bash
curl -X POST http://localhost:8129/api/audio/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice": "en-US-AndrewNeural"}'
```

**Response:**
```json
{
  "success": true,
  "url": "http://localhost:8129/audio/abc123.mp3",
  "cached": false
}
```

---

## WebSocket API

Connect to `ws://localhost:8129?token=<token>` for real-time communication.

### Queue Command

Send a command to the sidebar chat input:

```json
{"type": "QUEUE_COMMAND", "command": "npm test"}
```

The command appears in the chat input, ready for the user to select a terminal and send.

### Terminal Messages

| Message Type | Direction | Purpose |
|--------------|-----------|---------|
| `QUEUE_COMMAND` | Client → Server | Queue to chat input |
| `TERMINAL_SPAWN` | Client → Server | Create terminal |
| `TERMINAL_INPUT` | Client → Server | Send keystrokes |
| `TERMINAL_OUTPUT` | Server → Client | Receive output |
| `TERMINAL_RESIZE` | Client → Server | Update dimensions |

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "error": "Error message description",
  "code": "ERROR_CODE"
}
```

Common error codes:
- `AUTH_REQUIRED` - Missing or invalid token
- `NOT_FOUND` - Terminal ID not found
- `INVALID_REQUEST` - Missing required parameters
