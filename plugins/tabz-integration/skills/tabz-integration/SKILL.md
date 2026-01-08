---
name: tabz-integration
description: "Integration guide for connecting projects to TabzChrome terminals. This skill should be used when users want to: spawn terminals from scripts, add 'Run in Terminal' buttons to web pages, integrate MCP browser automation tools, use TTS/audio notifications from code, or connect any project to TabzChrome's API."
---

# TabzChrome Integration Guide

Connect any project to TabzChrome terminals via REST API, WebSocket, HTML attributes, or MCP tools.

## When to Use This Skill

Trigger when users ask about:
- Spawning terminals from scripts or code
- Adding "Run in Terminal" buttons to web pages
- Connecting to TabzChrome from external apps
- Setting up MCP tools for browser automation
- Using TTS/audio notifications programmatically
- Queuing commands to the sidebar chat input

## Quick Start

### Spawn a Terminal (Most Common)

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Worker", "workingDir": "~/projects", "command": "claude"}'
```

### Add HTML Buttons (No Auth)

```html
<button data-terminal-command="npm run dev">Start Dev Server</button>
```

### Queue to Chat Input

```bash
echo '{"type":"QUEUE_COMMAND","command":"npm test"}' | \
  websocat "ws://localhost:8129?token=$(cat /tmp/tabz-auth-token)"
```

## Integration Methods

| Method | Auth Required | Use Case |
|--------|---------------|----------|
| HTML `data-terminal-command` | None | Static buttons on web pages |
| WebSocket + websocat | Token file | CLI scripts, shell functions |
| WebSocket + JS | API endpoint | Web applications |
| POST /api/spawn | Token header | Create new terminal tabs |
| MCP tools | Backend running | Browser automation from Claude |
| Audio API | None | TTS notifications from code |

For detailed examples, see `references/integration-examples.md`.

## REST API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/spawn` | POST | Create terminal with optional command |
| `/api/health` | GET | Health check (no auth) |
| `/api/agents` | GET | List active terminals |
| `/api/agents/:id` | DELETE | Kill a terminal |
| `/api/audio/speak` | POST | TTS playback |
| `/api/audio/generate` | POST | Generate TTS audio URL |

**Authentication:** Most endpoints require `X-Auth-Token` header with value from `/tmp/tabz-auth-token`.

See `references/api-reference.md` for full endpoint documentation.

## MCP Tools Setup

Add TabzChrome MCP server to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "tabz": {
      "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
      "args": [],
      "env": { "BACKEND_URL": "http://localhost:8129" }
    }
  }
}
```

This gives you access to 71 browser automation tools. See `references/mcp-setup.md` for tool categories.

## Audio/TTS Integration

Speak text from any script or application:

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Build complete", "voice": "en-US-AndrewNeural"}'
```

See `references/audio-integration.md` for voice options and advanced usage.

## Shell Helper Function

Add to `.bashrc` or `.zshrc`:

```bash
tabz() {
  local cmd="$*"
  local token=$(cat /tmp/tabz-auth-token 2>/dev/null)
  if [[ -z "$token" ]]; then
    echo "Error: TabzChrome backend not running" >&2
    return 1
  fi
  echo "{\"type\":\"QUEUE_COMMAND\",\"command\":$(echo "$cmd" | jq -Rs .)}" | \
    websocat "ws://localhost:8129?token=$token"
}

# Usage: tabz npm run dev
# Usage: tabz "Explain this error and fix it"
```

## Prerequisites

- TabzChrome backend running (`./scripts/dev.sh` from TabzChrome directory)
- For WebSocket: `websocat` installed (`cargo install websocat` or package manager)
- For MCP: Claude Code or MCP-compatible client

## Troubleshooting

**"Backend not running"**
```bash
curl http://localhost:8129/api/health  # Should return JSON
```

**"Auth token not found"**
```bash
cat /tmp/tabz-auth-token  # Should exist when backend running
```

**"Connection refused"**
- Ensure backend started: `./scripts/dev.sh`
- Check port 8129 not in use: `lsof -i :8129`
