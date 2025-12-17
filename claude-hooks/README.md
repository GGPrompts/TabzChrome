# Claude Code Hooks for TabzChrome Status Detection

These hooks enable the Claude status indicator (🤖✅/⏳/🔧) on terminal tabs.

## Two Ways to Get Status Detection

### Option 1: Plugin (Automatic)

If you run Claude Code **inside the TabzChrome directory**, hooks work automatically via the plugin system. No setup required.

You can also install the plugin globally:
```bash
/plugin marketplace add GGPrompts/TabzChrome
```

### Option 2: Global Hooks (Works Everywhere)

For status detection in **any project**, install hooks globally:

```bash
# 1. Copy the hook script
mkdir -p ~/.claude/hooks
cp ~/projects/TabzChrome/hooks/scripts/state-tracker.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/state-tracker.sh

# 2. Merge hooks into your settings
# View what to add:
cat ~/projects/TabzChrome/claude-hooks/settings.example.json
```

Then merge the `hooks` section from `settings.example.json` into `~/.claude/settings.json`.

**Restart Claude Code** - hooks take effect on next session.

## Status Indicators

| Status | Emoji | Meaning |
|--------|-------|---------|
| `awaiting_input` | 🤖✅ | Claude is ready/waiting for input |
| `processing` | 🤖⏳ | Claude is thinking |
| `tool_use` | 🤖🔧 | Claude is using a tool (Edit, Bash, etc.) |

## How It Works

```
Claude Code ─► hooks ─► /tmp/claude-code-state/*.json
                                    │
                                    └─► TabzChrome backend (/api/claude-status)
                                              └─► Frontend polls every 2s
```

1. **Claude hooks** write state to `/tmp/claude-code-state/*.json`
2. **Backend API** (`/api/claude-status`) reads these files
3. **Frontend** polls every 2 seconds and displays status on tabs

## State File Format

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

## Hook Events

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

### Stale status files?

The cleanup endpoint removes old state files:
```bash
curl -X POST http://localhost:8129/api/claude-status/cleanup
```

## Requirements

- `jq` - for JSON parsing in the hook script
- Claude Code with hooks support
- TabzChrome backend running on port 8129

## Verify Setup

```bash
# Check if hooks are installed
ls ~/.claude/hooks/state-tracker.sh

# Check if hooks are configured
cat ~/.claude/settings.json | grep -A2 '"hooks"'

# Test the hook script directly
~/.claude/hooks/state-tracker.sh session-start
cat /tmp/claude-code-state/*.json
```
