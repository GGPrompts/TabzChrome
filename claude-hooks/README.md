# Claude Code Hooks for Tabz Status Detection

These hooks enable the Claude status indicator (🤖✅/⏳/🔧) on terminal tabs.

## Status Indicators

| Status | Emoji | Meaning |
|--------|-------|---------|
| `awaiting_input` | 🤖✅ | Claude is ready/waiting for input |
| `processing` | 🤖⏳ | Claude is thinking |
| `tool_use` | 🤖🔧 | Claude is using a tool (Edit, Bash, etc.) |

## Installation

### 1. Copy the hook script

```bash
# Create hooks directory
mkdir -p ~/.claude/hooks

# Copy the state tracker
cp claude-hooks/state-tracker.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/state-tracker.sh
```

### 2. Add hooks to your Claude settings

Merge the contents of `settings.example.json` into your `~/.claude/settings.json`:

```bash
# If you don't have a settings.json yet:
cp claude-hooks/settings.example.json ~/.claude/settings.json

# If you already have one, manually merge the "hooks" section
```

### 3. Restart Claude Code

The hooks will take effect on the next Claude Code session.

## How It Works

1. **Claude hooks** write state to `/tmp/claude-code-state/*.json`
2. **Backend API** (`/api/claude-status`) reads these files
3. **Frontend** polls every 2 seconds and displays status on tabs

### State File Format

```json
{
  "session_id": "abc123",
  "status": "processing",
  "current_tool": "Edit",
  "working_dir": "/home/user/project",
  "last_updated": "2025-12-07T12:00:00Z",
  "tmux_pane": "%42",
  "hook_type": "pre-tool"
}
```

### Hook Events

| Hook | Triggered When | Sets Status |
|------|----------------|-------------|
| `SessionStart` | New Claude session | `idle` |
| `UserPromptSubmit` | User sends a message | `processing` |
| `PreToolUse` | Before tool execution | `tool_use` |
| `PostToolUse` | After tool execution | `processing` |
| `Stop` | Claude finishes turn | `awaiting_input` |
| `Notification` | Idle prompt (60s) | `awaiting_input` |

## Troubleshooting

### Status not showing?

1. Check if state files are being created:
   ```bash
   ls -la /tmp/claude-code-state/
   ```

2. Check if backend can read them:
   ```bash
   curl "http://localhost:8129/api/claude-status?dir=/your/project/path"
   ```

3. Ensure hooks are executable:
   ```bash
   chmod +x ~/.claude/hooks/state-tracker.sh
   ```

### Stale status?

The cleanup endpoint removes old state files:
```bash
curl -X POST http://localhost:8129/api/claude-status/cleanup
```

## Requirements

- `jq` - for JSON parsing in the hook script
- Claude Code with hooks support
- Tabz backend running on port 8129
