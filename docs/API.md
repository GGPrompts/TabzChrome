# TabzChrome HTTP API

The backend exposes REST endpoints and a WebSocket server for terminal management, browser automation, file operations, git integration, and more.

**Base URL:** `http://localhost:8129`

---

## Table of Contents

- [Authentication](#authentication)
- [Terminals / Agents](#terminals--agents)
- [Terminal Send-Keys & Capture](#terminal-send-keys--capture)
- [Tmux Sessions](#tmux-sessions)
- [Claude Status](#claude-status)
- [Audio / TTS](#audio--tts)
- [Files](#files)
- [Git](#git)
- [Browser Profiles](#browser-profiles)
- [Browser Automation](#browser-automation)
- [Plugins](#plugins)
- [MCP Configuration](#mcp-configuration)
- [Settings](#settings)
- [Terminal Panes](#terminal-panes)
- [Pages](#pages)
- [Miscellaneous](#miscellaneous)
- [WebSocket Protocol](#websocket-protocol)

---

## Authentication

**Token Location:** `/tmp/tabz-auth-token` (auto-generated on backend startup, mode 0600)

| Context | How to Get Token |
|---------|------------------|
| CLI / Scripts | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| Extension Settings | Click "API Token" → "Copy Token" |
| GitHub Pages launcher | Paste token into input field |

### Which endpoints require auth?

Most endpoints do **not** require authentication. The following **do** require the `X-Auth-Token` header (or `?token=` query param):

| Endpoint | Auth Method |
|----------|-------------|
| `POST /api/spawn` | `X-Auth-Token` header or `?token=` query |
| `POST /api/agents` | `X-Auth-Token` header (via rate limiter) |
| `POST /api/notify` | `X-Auth-Token` header or `?token=` query |
| `POST /api/git/repos/:repo/stage` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/unstage` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/commit` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/push` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/pull` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/fetch` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/discard` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/stash` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/stash-pop` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/stash-apply` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/stash-drop` | `X-Auth-Token` header |
| `POST /api/git/repos/:repo/generate-message` | `X-Auth-Token` header |
| WebSocket `ws://localhost:8129` | `?token=` query param (required) |

### Token Endpoints

#### GET /api/auth/token

Fetch the current auth token (localhost only).

```bash
curl http://localhost:8129/api/auth/token
```

**Response:** `{ "token": "abc123..." }`

#### GET /api/auth-token

Alternative token endpoint (same behavior).

```bash
curl http://localhost:8129/api/auth-token
```

**Response:** `{ "token": "abc123..." }`

---

## Terminals / Agents

### POST /api/spawn

Simple terminal spawn endpoint for automation scripts.

**Auth:** Required (`X-Auth-Token` header)

**Body:**
```json
{
  "name": "My Terminal",
  "workingDir": "/home/user/projects",
  "command": "claude",
  "profile": "default"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Display name (default: "Claude Terminal") |
| `workingDir` | string | No | Starting directory (default: `$HOME`) |
| `command` | string | No | Command to run after spawn |
| `profile` | string | No | Profile name to apply |

**Response:**
```json
{
  "success": true,
  "terminal": {
    "id": "ctt-MyTerminal-a1b2c3d4",
    "name": "My Terminal",
    "terminalType": "bash",
    "ptyInfo": { "useTmux": true, "tmuxSession": "ctt-MyTerminal-a1b2c3d4" }
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

### POST /api/agents

Spawn a terminal using profile settings or explicit parameters. Rate limited: 10 requests per minute per IP.

**Auth:** Required (`X-Auth-Token` header)

**Body:**
```json
{
  "profileId": "claude-worker",
  "workingDir": "~/projects/my-app"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `profileId` | string | One of these | Profile ID to use (inherits name, command, theme) |
| `terminalType` | string | One of these | Terminal type: `bash`, `claude-code`, etc. |
| `name` | string | No | Display name (defaults to profile name or "Agent") |
| `workingDir` | string | No | Starting directory (overrides profile) |
| `platform` | string | No | `local` (default) or `docker` |
| `resumable` | boolean | No | Enable tmux persistence (default: false) |
| `color` | string | No | Hex color (e.g., `#ff5733`) |
| `icon` | string | No | Emoji icon |
| `env` | object | No | Environment variables |
| `prompt` | string | No | Initial prompt to send (max 500 chars) |
| `autoStart` | boolean | No | Start immediately (default: true) |

**Note:** Either `profileId` or `terminalType` is required.

**Response:**
```json
{
  "success": true,
  "message": "Agent 'Claude Worker' spawned successfully",
  "data": {
    "id": "ctt-claude-worker-a1b2c3d4",
    "name": "Claude Worker",
    "terminalType": "bash",
    "platform": "local",
    "resumable": false,
    "state": "active",
    "profileId": "claude-worker",
    "profileName": "Claude Worker"
  }
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
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "ctt-Claude-a1b2c3d4",
      "name": "Claude",
      "terminalType": "bash",
      "platform": "local",
      "resumable": false,
      "state": "active",
      "embedded": false,
      "createdAt": "2026-01-15T10:00:00.000Z",
      "lastActivity": "2026-01-15T10:05:00.000Z"
    }
  ]
}
```

---

### GET /api/agents/:id

Get specific agent details.

```bash
curl http://localhost:8129/api/agents/ctt-Claude-a1b2c3d4
```

---

### DELETE /api/agents/:id

Kill a terminal by ID.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `force` | boolean | `true` | If `true`, kills tmux session. If `false`, just removes from registry (detach mode) |

```bash
# Force close (kill tmux session)
curl -X DELETE http://localhost:8129/api/agents/ctt-Claude-a1b2c3d4

# Detach only (preserve tmux session)
curl -X DELETE "http://localhost:8129/api/agents/ctt-Claude-a1b2c3d4?force=false"
```

**Response:**
```json
{
  "success": true,
  "message": "Agent 'Claude' closed and tmux session killed",
  "data": {
    "id": "ctt-Claude-a1b2c3d4",
    "name": "Claude",
    "terminalType": "bash",
    "detached": false
  }
}
```

---

### POST /api/agents/:id/detach

Detach a terminal (convert to ghost session). Designed for `navigator.sendBeacon()` — accepts empty body, no auth required.

```bash
curl -X POST http://localhost:8129/api/agents/ctt-Claude-a1b2c3d4/detach
```

**Response:**
```json
{
  "success": true,
  "message": "Agent 'Claude' detached (tmux session preserved)",
  "data": {
    "id": "ctt-Claude-a1b2c3d4",
    "name": "Claude",
    "detached": true
  }
}
```

---

### POST /api/agents/:id/command

Send a command to a terminal.

**Body:**
```json
{
  "command": "echo hello"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | Command text (1–10000 chars) |

---

### POST /api/agents/:id/resize

Resize a terminal.

**Body:**
```json
{
  "cols": 120,
  "rows": 40
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cols` | integer | Yes | Columns (20–300) |
| `rows` | integer | Yes | Rows (10–100) |

---

## Terminal Send-Keys & Capture

### POST /api/terminals/send-keys

Send keys to a terminal via tmux. Used by MCP tools for interactive prompting.

**Body:**
```json
{
  "terminalId": "ctt-Claude-a1b2c3d4",
  "sessionName": "ctt-Claude-a1b2c3d4",
  "text": "hello world",
  "execute": true,
  "delay": 600
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `terminalId` | string | Yes | Terminal ID |
| `sessionName` | string | Yes | Tmux session name |
| `text` | string | Yes | Text to send (1–50000 chars) |
| `execute` | boolean | No | Send Enter after text (default: true) |
| `delay` | integer | No | Delay before Enter in ms (default: 600, max: 5000) |

---

### GET /api/terminals/:id/capture

Capture terminal output via tmux.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `lines` | integer | 50 | Lines to capture (1–1000) |

```bash
curl "http://localhost:8129/api/terminals/ctt-Claude-a1b2c3d4/capture?lines=100"
```

**Response:**
```json
{
  "success": true,
  "output": "$ echo hello\nhello\n$ ",
  "lines": 3,
  "terminalId": "ctt-Claude-a1b2c3d4"
}
```

---

## Terminal Panes

### GET /api/terminals/:id/panes

List tmux panes for a terminal session. Returns metadata for each pane including command, path, and active status.

```bash
curl http://localhost:8129/api/terminals/ctt-Claude-a1b2c3d4/panes \
  -H "X-Auth-Token: $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "paneId": "%42",
      "index": 0,
      "command": "claude",
      "title": "~/projects/foo",
      "path": "/home/user/projects/foo",
      "active": true
    },
    {
      "paneId": "%43",
      "index": 1,
      "command": "bash",
      "title": "~/projects/foo",
      "path": "/home/user/projects/foo",
      "active": false
    }
  ],
  "terminalId": "ctt-Claude-a1b2c3d4",
  "sessionName": "ctt-Claude-a1b2c3d4"
}
```

**Notes:**
- Returns empty array if the terminal has no tmux session or tmux is not running
- The `active` field indicates which pane has tmux focus
- Pane IDs (e.g. `%42`) can be used with the `targeted-pane-send` WebSocket message
- The terminal listing (`GET /api/agents`) also includes `paneCount` and `panes` array for each terminal

---

## Pages

### GET /api/pages

List all backend-served HTML pages. These pages at `localhost:8129` are uniquely automatable by TabzChrome MCP tools (screenshots, DOM reading, clicks) unlike chrome-extension:// pages.

```bash
curl http://localhost:8129/api/pages
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "Dashboard",
      "path": "index.html",
      "url": "http://localhost:8129/index.html",
      "category": "General"
    },
    {
      "name": "Forms",
      "path": "templates/mcp-test/forms.html",
      "url": "http://localhost:8129/templates/mcp-test/forms.html",
      "category": "Mcp Test"
    }
  ]
}
```

**Notes:**
- Scans `backend/public/` recursively for `.html` files
- Category is derived from the directory path
- No authentication required

---

## Tmux Sessions

### GET /api/tmux/sessions

List active tmux session names (simple).

```bash
curl http://localhost:8129/api/tmux/sessions
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": ["ctt-Claude-abc123", "tabzchrome", "my-session"],
    "count": 3
  }
}
```

---

### GET /api/tmux/sessions/detailed

List all sessions with rich metadata (working dir, git branch, AI tool detection, Claude statusline).

```bash
curl http://localhost:8129/api/tmux/sessions/detailed
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [...],
    "grouped": {
      "tabz": [...],
      "claudeCode": [...],
      "external": [...]
    },
    "count": 5,
    "counts": { "tabz": 2, "claudeCode": 1, "external": 2 }
  }
}
```

---

### GET /api/tmux/sessions/:name

Get detailed info for a specific session.

```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123
```

---

### GET /api/tmux/sessions/:name/preview

Capture pane content for preview.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `lines` | integer | 100 | Lines to capture |
| `window` | integer | 1 | Window index |
| `full` | boolean | false | Capture full scrollback |

```bash
curl "http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/preview?lines=50"
```

---

### GET /api/tmux/sessions/:name/capture

Capture full terminal content with metadata. Used by "View as Text" feature. ANSI codes are stripped.

```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/capture
```

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
      "capturedAt": "2026-01-15T17:30:00.000Z"
    }
  }
}
```

---

### GET /api/tmux/sessions/:name/statusline

Get Claude Code statusline for a Claude session.

```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/statusline
```

**Response:**
```json
{
  "success": true,
  "data": {
    "claudeState": { ... },
    "statusIcon": "🔵"
  }
}
```

---

### GET /api/tmux/sessions/:name/windows

List windows for a tmux session.

```bash
curl http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123/windows
```

---

### POST /api/tmux/sessions/:name/command

Execute a tmux control command on a session. Does NOT send keys to the terminal — safe for TUI apps.

**Body:**
```json
{
  "command": "split-window -h"
}
```

---

### POST /api/tmux/refresh/:name

Refresh tmux session display (sends empty key to trigger redraw).

```bash
curl -X POST http://localhost:8129/api/tmux/refresh/ctt-Claude-abc123
```

---

### DELETE /api/tmux/sessions/:name

Kill a tmux session. **Destructive — cannot be undone.**

```bash
curl -X DELETE http://localhost:8129/api/tmux/sessions/ctt-Claude-abc123
```

---

### DELETE /api/tmux/sessions/bulk

Kill multiple tmux sessions at once. **Destructive.**

**Body:**
```json
{
  "sessions": ["ctt-old-session-1", "ctt-old-session-2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "killed": ["ctt-old-session-1", "ctt-old-session-2"],
    "failed": []
  },
  "message": "Killed 2 session(s), 0 failed"
}
```

---

### POST /api/tmux/detach/:name

Detach from a tmux session (keep session alive). Used when moving terminals between browser windows.

```bash
curl -X POST http://localhost:8129/api/tmux/detach/ctt-Claude-abc123
```

---

### GET /api/tmux/info/:name

Get tmux session info (pane title, window count, working directory). Used for tab naming.

```bash
curl http://localhost:8129/api/tmux/info/ctt-Claude-abc123
```

**Response:**
```json
{
  "success": true,
  "paneTitle": "lazygit @ ~/my-repo",
  "windowCount": 2,
  "activeWindow": 0,
  "paneCount": 1,
  "paneMarked": false,
  "paneZoomed": false,
  "sessionName": "ctt-Claude-abc123"
}
```

---

### GET /api/tmux/orphaned-sessions

List orphaned `ctt-*` tmux sessions not in the terminal registry ("ghost" sessions).

```bash
curl http://localhost:8129/api/tmux/orphaned-sessions
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orphanedSessions": ["ctt-old-abc123"],
    "count": 1,
    "totalTmuxSessions": 5,
    "totalCttSessions": 3,
    "registeredTerminals": 2
  }
}
```

---

### POST /api/tmux/reattach

Reattach orphaned sessions to the terminal registry.

**Body:**
```json
{
  "sessions": ["ctt-old-abc123"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": [{ "session": "ctt-old-abc123", "terminalId": "ctt-old-abc123", "name": "old" }],
    "failed": []
  },
  "message": "Reattached 1 session(s), 0 failed"
}
```

---

### POST /api/tmux/cleanup

Kill all tmux sessions matching a pattern. **Destructive.** Supports wildcard `*`.

**Body:**
```json
{
  "pattern": "ctt-*"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Killed 3 session(s) matching pattern \"ctt-*\"",
  "killed": 3,
  "sessions": ["ctt-a", "ctt-b", "ctt-c"]
}
```

---

## Claude Status

### GET /api/claude-status

Get Claude Code status for a terminal. Reads from `/tmp/claude-code-state/` files.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `dir` | string | Yes | Working directory path |
| `sessionName` | string | No | Tmux session name (for precise pane matching) |

```bash
curl "http://localhost:8129/api/claude-status?dir=/home/user/project&sessionName=ctt-Claude-abc123"
```

**Response:**
```json
{
  "success": true,
  "status": "working",
  "current_tool": "Edit",
  "last_updated": "2026-01-15T10:05:00.000Z",
  "sessionId": "abc123",
  "claude_session_id": "session-xyz",
  "details": null,
  "subagent_count": 0,
  "context_window": { "context_pct": 42 },
  "pane_title": "Editing: server.js"
}
```

**Matching strategy:**
1. If `sessionName` provided: match by tmux pane ID (most specific)
2. Exact `working_dir` match
3. Parent directory match (terminal in `~` shows status for Claude in `~/projects/foo`)

---

### POST /api/claude-status/cleanup

Clean up stale state files from `/tmp/claude-code-state/`.

```bash
curl -X POST http://localhost:8129/api/claude-status/cleanup
```

**Response:**
```json
{
  "success": true,
  "removed": 15,
  "stateFilesRemoved": 8,
  "contextFilesRemoved": 4,
  "debugFilesRemoved": 3,
  "message": "Cleaned up 8 state, 4 context, 3 debug file(s)"
}
```

---

### GET /api/claude/session

Get Claude Code session info from state file. Returns session ID and conversation path.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `pane` | string | Yes | Tmux pane ID (e.g., `%3`) |

```bash
curl "http://localhost:8129/api/claude/session?pane=%3"
```

**Response:**
```json
{
  "sessionId": "abc-123",
  "workingDir": "/home/user/project",
  "conversationPath": "/home/user/.claude/projects/-home-user-project/abc-123.jsonl",
  "pane": "%3",
  "status": "working"
}
```

---

## Audio / TTS

### GET /api/audio/list

List cached audio files from edge-tts.

```bash
curl http://localhost:8129/api/audio/list
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "files": [
    { "file": "abc123.mp3", "url": "http://localhost:8129/audio/abc123.mp3", "size": 12345 }
  ]
}
```

---

### POST /api/audio/generate

Generate audio using edge-tts with caching. Rate limited: 30 requests per minute per IP.

**Body:**
```json
{
  "text": "Hello world",
  "voice": "en-US-AndrewNeural",
  "rate": "+0%",
  "pitch": "+0Hz"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to speak |
| `voice` | string | No | TTS voice (default: `en-US-AndrewNeural`) |
| `rate` | string | No | Speech rate (default: `+0%`) |
| `pitch` | string | No | Pitch adjustment (default: `+0Hz`) |

---

### POST /api/audio/speak

Generate audio AND broadcast to Chrome extension for playback. Allows CLI/slash commands to trigger audio through the browser.

**Body:**
```json
{
  "text": "Task complete!",
  "voice": "en-US-AndrewNeural",
  "rate": "+0%",
  "pitch": "+0Hz",
  "volume": 0.7,
  "priority": "high"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to speak |
| `voice` | string | No | TTS voice |
| `rate` | string | No | Speech rate |
| `pitch` | string | No | Pitch adjustment |
| `volume` | number | No | Volume 0–1 (default: 0.7) |
| `priority` | string | No | `high` (interrupts) or `low` (default, can be skipped) |

---

### POST /api/audio/play

Play an audio file by URL (broadcast to extension, no TTS generation).

**Body:**
```json
{
  "url": "http://localhost:8129/audio/notification.mp3",
  "volume": 0.7,
  "priority": "low"
}
```

---

### GET /api/audio/local-file

Serve a local audio file. Used by SoundEffectPicker.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | File path (supports `~` expansion) |

```bash
curl "http://localhost:8129/api/audio/local-file?path=~/sounds/alert.mp3"
```

**Security:** Only allows `.mp3`, `.wav`, `.ogg`, `.m4a`, `.webm` files under home directory or `/tmp`.

---

## Files

All file endpoints are under `/api/files/`. No auth required.

### GET /api/files/read

Read a file's content.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Absolute file path |

```bash
curl "http://localhost:8129/api/files/read?path=/home/user/project/README.md"
```

---

### GET /api/files/content

Read file content with metadata (size, modified date). Max 1MB.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | File path (supports `~` expansion) |

```bash
curl "http://localhost:8129/api/files/content?path=~/project/README.md"
```

---

### GET /api/files/tree

Get file tree for a directory.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `path` | string | `~/workspace` | Directory path |
| `depth` | integer | 5 | Max depth |
| `showHidden` | boolean | false | Show hidden files |

```bash
curl "http://localhost:8129/api/files/tree?path=~/projects/my-app&depth=3&showHidden=true"
```

---

### GET /api/files/list

Get filtered file list (prompts, claude config, favorites).

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `filter` | string | `all` | `claude`, `prompts`, or `favorites` |
| `workingDir` | string | cwd | Working directory context |
| `showHidden` | boolean | false | Show hidden files |

```bash
curl "http://localhost:8129/api/files/list?filter=claude&workingDir=~/projects/my-app"
```

---

### GET /api/files/list-markdown

List markdown files in a directory.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `path` | string | cwd | Directory to scan |

---

### GET /api/files/project-files

Get common project files (README.md, CLAUDE.md, etc.) from workspace root.

```bash
curl http://localhost:8129/api/files/project-files
```

---

### GET /api/files/image

Serve image as base64 data URI.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Image file path (supports `~`) |

---

### GET /api/files/video

Serve video as base64 data URI (max 100MB).

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Video file path (supports `~`) |

---

### GET /api/files/audio

Serve audio file as base64 data URI (max 50MB). Supported: mp3, wav, ogg, m4a, webm, aac, flac.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Audio file path (supports `~`) |

---

### GET /api/files/git-status

Get git status for files in a directory.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `path` | string | cwd | Directory path |

```bash
curl "http://localhost:8129/api/files/git-status?path=~/projects/my-app"
```

**Response:**
```json
{
  "isGitRepo": true,
  "gitRoot": "/home/user/projects/my-app",
  "files": {
    "/home/user/projects/my-app/src/index.ts": { "status": "modified", "indexStatus": " ", "workTreeStatus": "M" }
  }
}
```

---

### POST /api/files/write

Write/save a file. Only allows writing within home directory.

**Body:**
```json
{
  "path": "/home/user/project/output.txt",
  "content": "file content here"
}
```

---

### POST /api/files/save-excalidraw

Save an Excalidraw drawing as PNG (and optionally JSON).

**Body:**
```json
{
  "imageData": "data:image/png;base64,...",
  "jsonData": { ... }
}
```

---

### GET /api/files/widget-docs/:widgetName

Get documentation files for a terminal widget type.

```bash
curl http://localhost:8129/api/files/widget-docs/claude-code
```

---

## Git

All git endpoints are under `/api/git/`. Read endpoints are unauthenticated. Write endpoints require auth.

### Read Endpoints

#### GET /api/git/repos

List all repositories with status.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `dir` | string | `~/projects` | Projects directory to scan |

```bash
curl "http://localhost:8129/api/git/repos?dir=~/projects"
```

---

#### GET /api/git/repos/:repo/status

Detailed git status for one repo.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `dir` | string | `~/projects` | Projects directory |

```bash
curl "http://localhost:8129/api/git/repos/TabzChrome/status?dir=~/projects"
```

---

#### GET /api/git/repos/:repo/log

Recent commits for a repo.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `dir` | string | `~/projects` | Projects directory |
| `limit` | integer | 20 | Number of commits |

```bash
curl "http://localhost:8129/api/git/repos/TabzChrome/log?limit=10"
```

---

#### GET /api/git/repos/:repo/stashes

List stashes for a repo.

```bash
curl "http://localhost:8129/api/git/repos/TabzChrome/stashes"
```

---

#### GET /api/git/graph

Get commit graph data for visualization.

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `path` | string | Required | Full path to repo |
| `limit` | integer | 50 | Number of commits |
| `skip` | integer | 0 | Offset for pagination |

```bash
curl "http://localhost:8129/api/git/graph?path=~/projects/TabzChrome&limit=50"
```

---

#### GET /api/git/diff

Get diff for a commit or between commits.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Full path to repo |
| `base` | string | No | Base commit hash |
| `head` | string | No | Head commit hash |
| `file` | string | No | Specific file to diff |

```bash
curl "http://localhost:8129/api/git/diff?path=~/projects/TabzChrome&base=abc123"
```

---

#### GET /api/git/commit/:hash

Get details for a specific commit.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Full path to repo |

```bash
curl "http://localhost:8129/api/git/commit/abc123?path=~/projects/TabzChrome"
```

---

#### GET /api/git/branches

Get all branches for a repo.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | Full path to repo |

```bash
curl "http://localhost:8129/api/git/branches?path=~/projects/TabzChrome"
```

---

### Write Endpoints (Auth Required)

All write endpoints require `X-Auth-Token` header and accept `?dir=` to specify the projects directory.

#### POST /api/git/repos/:repo/stage

Stage files.

**Body:** `{ "files": ["path1", "path2"] }` or `{ "files": ["."] }` for all.

---

#### POST /api/git/repos/:repo/unstage

Unstage files.

**Body:** `{ "files": ["path1", "path2"] }`

---

#### POST /api/git/repos/:repo/commit

Create a commit.

**Body:** `{ "message": "Commit message" }`

---

#### POST /api/git/repos/:repo/push

Push to remote.

**Body:** `{ "remote": "origin", "branch": "main" }` (both optional)

---

#### POST /api/git/repos/:repo/pull

Pull from remote.

**Body:** `{ "remote": "origin", "branch": "main" }` (both optional)

---

#### POST /api/git/repos/:repo/fetch

Fetch from remote.

**Body:** `{ "remote": "origin" }` (optional)

---

#### POST /api/git/repos/:repo/discard

Discard changes.

**Body:** `{ "files": ["path1"] }` or `{ "all": true }` for all unstaged changes.

---

#### POST /api/git/repos/:repo/stash

Create a stash.

**Body:** `{ "message": "stash message", "includeUntracked": true }` (both optional)

---

#### POST /api/git/repos/:repo/stash-pop

Pop the most recent stash.

**Body:** `{ "ref": "stash@{0}" }` (optional, defaults to most recent)

---

#### POST /api/git/repos/:repo/stash-apply

Apply a stash without removing it.

**Body:** `{ "ref": "stash@{0}" }` (optional)

---

#### POST /api/git/repos/:repo/stash-drop

Drop a stash.

**Body:** `{ "ref": "stash@{0}" }` (optional)

---

#### POST /api/git/repos/:repo/generate-message

Generate a commit message using Claude CLI (Haiku model).

**Body:** `{ "model": "haiku" }` (optional, defaults to `haiku`)

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST "http://localhost:8129/api/git/repos/TabzChrome/generate-message" \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{}'
```

**Response:**
```json
{
  "success": true,
  "message": "fix: resolve race condition in terminal reconnection"
}
```

---

## Browser Profiles

All endpoints under `/api/browser/profiles`. Manage terminal profiles stored in Chrome storage.

### GET /api/browser/profiles

List all terminal profiles.

| Query Param | Type | Description |
|-------------|------|-------------|
| `category` | string | Filter by category (e.g., `AI Assistants`) |

```bash
curl http://localhost:8129/api/browser/profiles
```

**Response:**
```json
{
  "success": true,
  "profiles": [
    {
      "id": "default",
      "name": "Bash",
      "workingDir": "",
      "command": "",
      "fontSize": 16,
      "fontFamily": "monospace",
      "themeName": "high-contrast",
      "category": "General"
    }
  ],
  "defaultProfileId": "default",
  "globalWorkingDir": "~"
}
```

---

### POST /api/browser/profiles

Create a new profile.

**Body:**
```json
{
  "profile": {
    "name": "My Profile",
    "workingDir": "~/projects",
    "command": "claude",
    "category": "Claude Code",
    "themeName": "dracula"
  }
}
```

---

### PUT /api/browser/profiles/:id

Update an existing profile. Only provided fields are updated.

**Body:**
```json
{
  "name": "Updated Name",
  "themeName": "ocean"
}
```

---

### DELETE /api/browser/profiles/:id

Delete a profile. Cannot delete the last remaining profile.

---

### POST /api/browser/profiles/import

Bulk import profiles.

**Body:**
```json
{
  "profiles": [
    { "name": "Profile 1", "category": "Dev" },
    { "name": "Profile 2", "command": "htop" }
  ],
  "mode": "merge"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `profiles` | array | Required | Array of profile objects (each must have `name`) |
| `mode` | string | `merge` | `merge` (add new, skip duplicates) or `replace` (replace all) |

---

## Browser Automation

REST endpoints under `/api/browser/` that relay requests to the Chrome extension via WebSocket.

### Tabs & Navigation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/tabs` | List all open tabs |
| POST | `/api/browser/switch-tab` | Switch to a tab by ID |
| POST | `/api/browser/open-url` | Open URL in new/existing tab |
| GET | `/api/browser/active-tab` | Get active tab info |

### Page Interaction

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/execute-script` | Execute JavaScript on page |
| POST | `/api/browser/click-element` | Click an element by selector |
| POST | `/api/browser/fill-input` | Fill an input field |
| POST | `/api/browser/get-element-info` | Get element details by selector |
| GET | `/api/browser/page-info` | Get current page URL & title |

### Screenshots & Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/screenshot` | Capture visible area screenshot |
| POST | `/api/browser/screenshot-full` | Capture full page screenshot |
| POST | `/api/browser/capture-image` | Capture image from page |
| POST | `/api/browser/download-file` | Download a file by URL |
| POST | `/api/browser/save-page` | Save page as HTML/MHTML |
| GET | `/api/browser/downloads` | List recent downloads |
| POST | `/api/browser/cancel-download` | Cancel a download |

### Console & Network

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/console-logs` | Get browser console logs |
| POST | `/api/browser/network-capture/enable` | Enable network request capture |
| POST | `/api/browser/network-requests` | Get captured network requests |
| POST | `/api/browser/network-requests/clear` | Clear captured requests |

### DevTools / Debugger

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/debugger/dom-tree` | Get DOM tree via debugger |
| POST | `/api/browser/debugger/performance` | Profile page performance |
| POST | `/api/browser/debugger/coverage` | Get code coverage data |

### Bookmarks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/bookmarks/tree` | Get bookmark tree |
| GET | `/api/browser/bookmarks/search` | Search bookmarks |
| POST | `/api/browser/bookmarks/create` | Create a bookmark |
| POST | `/api/browser/bookmarks/create-folder` | Create a bookmark folder |
| POST | `/api/browser/bookmarks/move` | Move a bookmark |
| POST | `/api/browser/bookmarks/delete` | Delete a bookmark |

### Tab Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/tab-groups` | List tab groups |
| POST | `/api/browser/tab-groups` | Create a tab group |
| PUT | `/api/browser/tab-groups/:groupId` | Update a tab group |
| POST | `/api/browser/tab-groups/:groupId/tabs` | Add tabs to a group |
| POST | `/api/browser/ungroup-tabs` | Remove tabs from groups |

### Claude Tab Group

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/claude-group/add` | Add tabs to Claude group |
| POST | `/api/browser/claude-group/remove` | Remove tabs from Claude group |
| GET | `/api/browser/claude-group/status` | Get Claude group status |

### Windows & Displays

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/windows` | List browser windows |
| POST | `/api/browser/windows` | Create a new window |
| PUT | `/api/browser/windows/:windowId` | Update window properties |
| DELETE | `/api/browser/windows/:windowId` | Close a window |
| GET | `/api/browser/displays` | Get display/monitor info |
| POST | `/api/browser/windows/tile` | Tile windows across displays |
| POST | `/api/browser/popout-terminal` | Pop out a terminal to its own window |

### History

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/history/search` | Search browsing history |
| POST | `/api/browser/history/visits` | Get visits for a URL |
| GET | `/api/browser/history/recent` | Get recent history |
| POST | `/api/browser/history/delete-url` | Delete a URL from history |
| POST | `/api/browser/history/delete-range` | Delete history in time range |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/sessions/recent` | Recently closed tabs/windows |
| POST | `/api/browser/sessions/restore` | Restore a closed session |
| GET | `/api/browser/sessions/devices` | Tabs from other devices |

### Cookies

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/cookies/get` | Get a specific cookie |
| POST | `/api/browser/cookies/list` | List cookies for a domain |
| POST | `/api/browser/cookies/set` | Set a cookie |
| POST | `/api/browser/cookies/delete` | Delete a cookie |
| POST | `/api/browser/cookies/audit` | Audit cookies |

### Device Emulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/emulate/device` | Emulate a device |
| POST | `/api/browser/emulate/clear` | Clear emulation |
| POST | `/api/browser/emulate/geolocation` | Emulate geolocation |
| POST | `/api/browser/emulate/network` | Emulate network conditions |
| POST | `/api/browser/emulate/media` | Emulate media features |
| POST | `/api/browser/emulate/vision` | Emulate vision deficiency |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/browser/notification/show` | Show a notification |
| POST | `/api/browser/notification/update` | Update a notification |
| POST | `/api/browser/notification/progress` | Update progress notification |
| POST | `/api/browser/notification/clear` | Clear a notification |
| GET | `/api/browser/notification/list` | List active notifications |

### Settings & Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/browser/settings` | Get extension settings |
| GET | `/api/browser/categories` | Get profile categories |

---

## Plugins

Manage Claude Code plugins (skills, agents, commands, hooks).

### GET /api/plugins

List all installed plugins with enabled/disabled status.

```bash
curl http://localhost:8129/api/plugins
```

**Response:**
```json
{
  "success": true,
  "data": {
    "marketplaces": { "my-plugins": [...] },
    "totalPlugins": 21,
    "enabledCount": 20,
    "disabledCount": 1,
    "componentCounts": { "skill": 14, "agent": 5, "command": 6, "hook": 1, "mcp": 0 },
    "scopeCounts": { "user": 20, "local": 1, "project": 0 }
  }
}
```

---

### POST /api/plugins/toggle

Enable or disable a plugin.

**Body:**
```json
{
  "pluginId": "skill-creator@my-plugins",
  "enabled": false
}
```

---

### GET /api/plugins/skills

Get skill metadata from enabled plugins for autocomplete.

**Response:**
```json
{
  "success": true,
  "skills": [
    {
      "id": "/my-plugins:skill-name",
      "name": "Skill Display Name",
      "desc": "Brief description",
      "pluginId": "plugin-name@marketplace",
      "pluginName": "plugin-name",
      "marketplace": "my-plugins",
      "category": "Plugin"
    }
  ],
  "count": 12
}
```

**Note:** Skill IDs use the format `/{pluginName}:{skillName}`.

---

### GET /api/plugins/health

Check plugin health (outdated plugins, cache stats).

```bash
curl http://localhost:8129/api/plugins/health
```

---

### POST /api/plugins/update

Update a single plugin.

**Body:**
```json
{
  "pluginId": "my-plugin@my-plugins",
  "scope": "user"
}
```

---

### POST /api/plugins/update-all

Update all outdated plugins.

**Body:**
```json
{
  "scope": "user"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `scope` | string | `user` | `user` (default) or `all` (includes project-scoped) |

---

### POST /api/plugins/cache/prune

Remove old cached plugin versions.

**Body:**
```json
{
  "marketplace": "my-plugins",
  "keepLatest": 2
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `marketplace` | string | all | Specific marketplace to prune |
| `keepLatest` | number | 1 | Versions to keep per plugin |

---

## MCP Configuration

Configure which MCP tools are available to Claude Code.

### GET /api/mcp-config

Get current MCP tool configuration.

```bash
curl http://localhost:8129/api/mcp-config
```

**Response:**
```json
{
  "success": true,
  "enabledTools": ["tabz_list_tabs", "tabz_screenshot", "..."],
  "allowAllUrls": false,
  "customDomains": "example.com\n*.mycompany.com"
}
```

---

### POST /api/mcp-config

Save MCP tool configuration. Changes take effect after Claude Code restart.

**Body:**
```json
{
  "enabledTools": ["tabz_list_tabs", "tabz_screenshot"],
  "allowAllUrls": false,
  "customDomains": "example.com"
}
```

---

### GET /api/mcp-presets

List all saved tool presets.

```bash
curl http://localhost:8129/api/mcp-presets
```

---

### POST /api/mcp-presets

Save a new preset or update existing.

**Body:**
```json
{
  "name": "My Preset",
  "tools": ["tabz_list_tabs", "tabz_screenshot"],
  "description": "2 tools"
}
```

**Usage:** `MCP_PRESET=my-preset claude`

---

### DELETE /api/mcp-presets/:slug

Delete a saved preset.

```bash
curl -X DELETE http://localhost:8129/api/mcp-presets/my-preset
```

---

## Settings

### GET /api/settings/working-dir

Get current working directory settings.

```bash
curl http://localhost:8129/api/settings/working-dir
```

**Response:**
```json
{
  "success": true,
  "data": {
    "globalWorkingDir": "~/projects",
    "recentDirs": ["~", "~/projects"]
  }
}
```

---

### POST /api/settings/working-dir

Update working directory settings.

**Body:**
```json
{
  "globalWorkingDir": "~/projects",
  "recentDirs": ["~", "~/projects"]
}
```

---

## Miscellaneous

### GET /api/health

Health check endpoint. No auth required.

```bash
curl http://localhost:8129/api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "data": {
    "uptime": 3600,
    "activeTerminals": 3,
    "totalTerminals": 5,
    "memoryUsage": { "heapUsed": 45, "heapTotal": 60, "rss": 120, "unit": "MB" },
    "version": "1.0.0",
    "nodeVersion": "v20.10.0",
    "platform": "linux",
    "timestamp": "2026-01-15T10:00:00.000Z"
  }
}
```

---

### GET /api/terminal-types

Get available terminal types and their configurations.

```bash
curl http://localhost:8129/api/terminal-types
```

---

### GET /api/spawn-stats

Get spawn statistics (rate limiting, counts).

```bash
curl http://localhost:8129/api/spawn-stats
```

---

### GET /api/mcp/inspector-command

Get the command to launch MCP Inspector.

```bash
curl http://localhost:8129/api/mcp/inspector-command
```

**Response:**
```json
{
  "success": true,
  "data": {
    "command": "npx @modelcontextprotocol/inspector node /path/to/tabz-mcp-server/dist/index.js",
    "inspectorUrl": "http://localhost:6274"
  }
}
```

---

### GET /api/tui-tools

List installed TUI tools (lazygit, htop, etc.).

```bash
curl http://localhost:8129/api/tui-tools
```

---

### POST /api/tui-tools/spawn

Spawn a TUI tool in a terminal.

**Body:**
```json
{
  "toolName": "lazygit",
  "workingDir": "~/projects/my-app"
}
```

---

### POST /api/notify

Broadcast a worker notification via WebSocket. Used by workers for completion/status updates.

**Auth:** Required (`X-Auth-Token` header)

**Body:**
```json
{
  "type": "task-complete",
  "issueId": "beads-001",
  "summary": "Feature implemented successfully",
  "session": "ctt-worker-abc123"
}
```

---

### POST /api/console-log

Receive browser console logs and write to unified log.

**Body:**
```json
{
  "logs": [
    { "level": "error", "message": "Something failed", "timestamp": 1234567890 }
  ]
}
```

---

### POST /api/ai/explain-script

Use Claude CLI to explain what a script does.

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
  "explanation": "This script deploys the application to production..."
}
```

**Notes:**
- Requires `claude` CLI installed
- File content limited to 10KB
- 60 second timeout

---

### GET /api/media

Serve local media files for terminal backgrounds. Supports video seeking via range requests.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `path` | string | Yes | File path (supports `~` expansion) |

Allowed extensions: `.mp4`, `.webm`, `.mov`, `.m4v`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`

```bash
curl "http://localhost:8129/api/media?path=~/backgrounds/space.mp4"
```

---

### GET /launcher

Serves the AI Terminal Launcher HTML page.

---

## WebSocket Protocol

Real-time terminal I/O and browser communication uses WebSocket at `ws://localhost:8129`.

### Connection

**Authentication:** Required via `?token=` query parameter.

```javascript
const token = await fetch('http://localhost:8129/api/auth/token').then(r => r.json()).then(d => d.token);
const ws = new WebSocket(`ws://localhost:8129?token=${token}`);
```

Connections without a valid token are rejected with close code 1008 (Policy Violation).

---

### Client → Server Messages

| Type | Description | Key Fields |
|------|-------------|------------|
| `identify` | Identify client type | `clientType`: `"sidebar"` or `"web"` |
| `set-default-profile` | Store default profile settings | `settings`: profile settings object |
| `spawn` | Create new terminal | `config`: spawn config, `requestId`: dedup ID |
| `command` | Send keystrokes to terminal | `terminalId`, `command` |
| `resize` | Update terminal dimensions | `terminalId`, `cols`, `rows` |
| `close` | Force close terminal (kill tmux) | `terminalId` |
| `detach` | Detach terminal (preserve tmux) | `terminalId` |
| `reconnect` | Reconnect to existing terminal | `terminalId` (or `data.terminalId`) |
| `list-terminals` | Request terminal list | (no fields) |
| `query-tmux-sessions` | Query orphaned tmux sessions | (no fields) |
| `update-embedded` | Update terminal embedded status | `terminalId`, `embedded` |
| `targeted-pane-send` | Send text to specific tmux pane | `tmuxPane`, `text`, `sendEnter` |
| `tmux-session-send` | Send text to tmux session by name | `sessionName`, `text`, `sendEnter` |

---

### Server → Client Messages

| Type | Description | Key Fields |
|------|-------------|------------|
| `memory-stats` | Server memory stats (sent on connect) | `data.heapUsed`, `data.rss`, `data.terminals` |
| `terminal-spawned` | Terminal created | `data`: terminal object, `requestId` |
| `spawn-error` | Spawn failed | `error`, `requestId`, `terminalType` |
| `terminal-output` | Terminal output data | `terminalId`, `data` |
| `terminal-closed` | Terminal removed | `data.id` |
| `terminal-reconnected` | Reconnection successful | `data`: terminal object |
| `reconnect-failed` | Reconnection failed | `terminalId` |
| `terminals` | Terminal list response | `data`: array, `connectionCount`, `recoveryComplete` |
| `tmux-sessions-list` | Orphaned sessions list | `data.sessions`: string array |
| `audio-speak` | Play TTS audio | `url`, `volume`, `priority`, `text` |
| `audio-play` | Play audio file | `url`, `volume`, `priority` |
| `worker-notification` | Worker status update | `data.notificationType`, `data.issueId`, `data.summary` |

---

### Browser MCP Relay Messages

The WebSocket also relays browser MCP requests between the REST API and Chrome extension. These are internal and follow the pattern `browser-*-result`. The full list of ~45 relay message types corresponds to the browser automation endpoints listed above.

---

## Security Model

- **CLI/Conductor**: Full access via token file
- **Extension**: Fetches token via `/api/auth/token` (localhost only)
- **External pages**: User must manually paste token
- **Malicious sites**: Cannot auto-spawn — token required
- **File endpoints**: Configurable `RESTRICT_TO_HOME` env var for path restriction
- **Git write operations**: All require auth token
- **Spawn endpoints**: Rate limited (10/min for agents, 30/min for audio)
