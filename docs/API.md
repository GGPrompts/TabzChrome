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

### GET /api/plugins

List all installed Claude Code plugins with their enabled/disabled status.

**Response:**
```json
{
  "success": true,
  "data": {
    "marketplaces": {
      "my-plugins": [
        {
          "id": "skill-creator@my-plugins",
          "name": "skill-creator",
          "marketplace": "my-plugins",
          "enabled": true,
          "scope": "user",
          "version": "1.0.0",
          "installPath": "/home/user/.claude/plugins/cache/my-plugins/skill-creator/abc123",
          "components": ["skill"],
          "componentFiles": {
            "skills": [{ "name": "skill-creator", "path": "/home/user/.claude/plugins/.../SKILL.md" }]
          }
        }
      ],
      "tabz-chrome": [...]
    },
    "totalPlugins": 21,
    "enabledCount": 20,
    "disabledCount": 1,
    "componentCounts": { "skill": 14, "agent": 5, "command": 6, "hook": 1, "mcp": 0 },
    "scopeCounts": { "user": 20, "local": 1, "project": 0 }
  }
}
```

**Notes:**
- Reads from `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json`
- `components` array contains detected component types: skill, agent, command, hook, mcp
- `componentFiles` provides paths to individual files within each component type
- Used by Dashboard Files → Plugins filter

---

### POST /api/plugins/toggle

Enable or disable a Claude Code plugin.

**Body:**
```json
{
  "pluginId": "skill-creator@my-plugins",
  "enabled": false
}
```

**Response:**
```json
{
  "success": true,
  "pluginId": "skill-creator@my-plugins",
  "enabled": false,
  "message": "Plugin skill-creator@my-plugins disabled. Run /restart to apply changes."
}
```

**Notes:**
- Modifies `~/.claude/settings.json` → `enabledPlugins` object
- Changes take effect after running `/restart` in Claude Code
- Does not require auth token (localhost only, user-initiated action)

---

### GET /api/plugins/health

Check plugin health: identify outdated plugins and view cache statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "outdated": [
      {
        "pluginId": "my-plugin@my-plugins",
        "name": "my-plugin",
        "marketplace": "my-plugins",
        "scope": "user",
        "projectPath": null,
        "installedSha": "abc123def456",
        "currentSha": "789xyz012345",
        "lastUpdated": "2025-12-15T10:30:00.000Z"
      }
    ],
    "current": 15,
    "unknown": 0,
    "marketplaceHeads": {
      "my-plugins": {
        "head": "789xyz012345abcdef789xyz012345abcdef7890",
        "path": "/home/user/projects/my-plugins",
        "source": "git@github.com:user/my-plugins.git"
      }
    },
    "cache": {
      "totalSize": 51200,
      "totalVersions": 42,
      "byMarketplace": {
        "my-plugins": {
          "size": 25600,
          "versions": 21,
          "plugins": {
            "skill-creator": 3,
            "plugin-dev": 2
          }
        }
      }
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `outdated` | array | Plugins with newer versions available |
| `current` | number | Count of up-to-date plugins |
| `unknown` | number | Plugins from unregistered marketplaces |
| `marketplaceHeads` | object | Current git HEAD for each marketplace |
| `cache.totalSize` | number | Total cache size in KB |
| `cache.totalVersions` | number | Total cached version count |

**Example:**
```bash
curl http://localhost:8129/api/plugins/health
```

**Notes:**
- Version comparison uses both `version` and `gitCommitSha` fields
- Plugins with semantic versions (e.g., "1.0.0") are skipped from outdated checks
- Plugin files are checked via `git diff` to avoid false positives when repo changes don't affect a specific plugin
- Cache size is calculated using `du` command (KB units)

---

### POST /api/plugins/update

Update a single plugin to the latest version.

**Body:**
```json
{
  "pluginId": "my-plugin@my-plugins",
  "scope": "user"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pluginId` | string | Yes | Plugin identifier (name@marketplace) |
| `scope` | string | No | Override scope (user, project, local) |

**Response:**
```json
{
  "success": true,
  "pluginId": "my-plugin@my-plugins",
  "scope": "user",
  "output": "Updated my-plugin@my-plugins to abc123def456",
  "message": "Plugin my-plugin@my-plugins updated. Run /restart to apply changes."
}
```

**Example:**
```bash
curl -X POST http://localhost:8129/api/plugins/update \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "skill-creator@my-plugins"}'
```

**Notes:**
- Runs `claude plugin update` command internally
- For project-scoped plugins, executes from the project directory
- 30 second timeout for the update operation
- Changes take effect after running `/restart` in Claude Code

---

### POST /api/plugins/update-all

Update all outdated plugins at once.

**Body:**
```json
{
  "scope": "user"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scope` | string | No | `user` (default) only updates user-scoped plugins, `all` attempts all scopes |

**Response:**
```json
{
  "success": true,
  "message": "Updated 3 plugins (1 skipped). Run /restart to apply changes.",
  "results": [
    {
      "pluginId": "skill-creator@my-plugins",
      "success": true,
      "output": "Updated skill-creator@my-plugins to abc123"
    },
    {
      "pluginId": "broken-plugin@other",
      "success": false,
      "error": "Plugin not found in marketplace"
    }
  ],
  "skipped": [
    {
      "pluginId": "local-plugin@local",
      "scope": "local",
      "reason": "project/local scoped (no projectPath)"
    }
  ]
}
```

**Example:**
```bash
# Update only user-scoped plugins (default)
curl -X POST http://localhost:8129/api/plugins/update-all \
  -H "Content-Type: application/json" \
  -d '{}'

# Update all plugins including project-scoped
curl -X POST http://localhost:8129/api/plugins/update-all \
  -H "Content-Type: application/json" \
  -d '{"scope": "all"}'
```

**Notes:**
- Plugins with semantic versions (e.g., "1.0.0") are automatically skipped
- Project/local scoped plugins without a stored `projectPath` are skipped by default
- Each plugin update has a 30 second timeout
- Returns individual success/failure status for each plugin

---

### POST /api/plugins/cache/prune

Remove old cached plugin versions to free disk space.

**Body:**
```json
{
  "marketplace": "my-plugins",
  "keepLatest": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `marketplace` | string | No | Specific marketplace to prune (all if omitted) |
| `keepLatest` | number | No | Number of versions to keep per plugin (default: 1) |

**Response:**
```json
{
  "success": true,
  "removed": 15,
  "freedBytes": 52428800,
  "freedMB": "50.00"
}
```

**Example:**
```bash
# Prune all marketplaces, keep only latest version
curl -X POST http://localhost:8129/api/plugins/cache/prune \
  -H "Content-Type: application/json" \
  -d '{}'

# Keep 2 latest versions for specific marketplace
curl -X POST http://localhost:8129/api/plugins/cache/prune \
  -H "Content-Type: application/json" \
  -d '{"marketplace": "my-plugins", "keepLatest": 2}'
```

**Notes:**
- Versions are sorted by modification time (newest first)
- Cache location: `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`
- Does not affect currently installed plugin functionality
- Useful for cleaning up after many plugin updates

---

## Browser Profiles

Manage terminal profiles programmatically. Profiles define appearance, startup command, and category for terminals.

### GET /api/browser/profiles

List all terminal profiles with their settings.

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

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl http://localhost:8129/api/browser/profiles \
  -H "X-Auth-Token: $TOKEN"
```

---

### POST /api/browser/profiles

Create a new terminal profile.

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `profile.name` | string | Yes | Display name |
| `profile.id` | string | No | Custom ID (auto-generated from name if not provided) |
| `profile.workingDir` | string | No | Starting directory |
| `profile.command` | string | No | Command to run on spawn |
| `profile.category` | string | No | Category for grouping |
| `profile.themeName` | string | No | Theme (high-contrast, dracula, ocean, etc.) |
| `profile.fontSize` | number | No | Font size in pixels (default: 16) |
| `profile.fontFamily` | string | No | Font family (default: monospace) |

**Response:**
```json
{
  "success": true,
  "profile": {
    "id": "my-profile-m1a2b3c",
    "name": "My Profile",
    "workingDir": "~/projects",
    "command": "claude",
    "category": "Claude Code",
    "themeName": "dracula",
    "fontSize": 16,
    "fontFamily": "monospace"
  }
}
```

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/browser/profiles \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profile": {"name": "Claude Worker", "category": "Claude Code", "command": "claude"}}'
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

**Response:**
```json
{
  "success": true,
  "profile": {
    "id": "my-profile",
    "name": "Updated Name",
    "themeName": "ocean"
  }
}
```

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X PUT http://localhost:8129/api/browser/profiles/my-profile \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Renamed Profile", "category": "Development"}'
```

---

### DELETE /api/browser/profiles/:id

Delete a profile by ID. Cannot delete the last remaining profile.

**Response:**
```json
{
  "success": true,
  "deletedProfile": {
    "id": "my-profile",
    "name": "My Profile"
  }
}
```

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X DELETE http://localhost:8129/api/browser/profiles/my-profile \
  -H "X-Auth-Token: $TOKEN"
```

---

### POST /api/browser/profiles/import

Bulk import profiles from JSON.

**Body:**
```json
{
  "profiles": [
    { "name": "Profile 1", "category": "Dev" },
    { "name": "Profile 2", "category": "Dev", "command": "htop" }
  ],
  "mode": "merge"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `profiles` | array | Yes | Array of profile objects (each must have `name`) |
| `mode` | string | No | `merge` (default) or `replace` |

**Modes:**
- `merge`: Add new profiles, skip duplicates by ID
- `replace`: Replace all existing profiles with imported ones

**Response:**
```json
{
  "success": true,
  "imported": 2,
  "skipped": 0,
  "skippedIds": [],
  "total": 5
}
```

**Example:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/browser/profiles/import \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profiles": [{"name": "Dev", "category": "Work"}, {"name": "Test", "category": "Work"}], "mode": "merge"}'
```

---

## Security Model

- **CLI/Conductor**: Full access via token file
- **Extension**: Fetches token via `/api/auth/token` (localhost only)
- **External pages**: User must manually paste token
- **Malicious sites**: Cannot auto-spawn - token required
