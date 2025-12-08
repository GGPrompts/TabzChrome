# Claude Code Hooks for TabzChrome Status Detection

These hooks enable the Claude status indicator (🤖✅/⏳/🔧) on terminal tabs.

## Quick Setup

If you already have tmuxplexer installed, the hooks are likely already configured.
Check with:

```bash
ls ~/.claude/hooks/state-tracker.sh
cat ~/.claude/settings.json | grep -A2 '"hooks"'
```

## Status Indicators

| Status | Emoji | Meaning |
|--------|-------|---------|
| `awaiting_input` | 🤖✅ | Claude is ready/waiting for input |
| `processing` | 🤖⏳ | Claude is thinking |
| `tool_use` | 🤖🔧 | Claude is using a tool (Edit, Bash, etc.) |

## Installation (if not already set up)

### Option 1: From tmuxplexer (recommended)

```bash
cd ~/projects/tmuxplexer
./hooks/install.sh
```

### Option 2: Manual setup

1. **Copy hooks from tmuxplexer:**
```bash
mkdir -p ~/.claude/hooks
cp ~/projects/tmuxplexer/hooks/state-tracker.sh ~/.claude/hooks/
cp ~/projects/tmuxplexer/hooks/tmux-status-claude.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.sh
```

2. **Add hooks to Claude settings:**

Merge `settings.example.json` into `~/.claude/settings.json`:
```bash
# View the example:
cat ~/projects/TabzChrome/claude-hooks/settings.example.json

# Then manually merge the "hooks" section into ~/.claude/settings.json
```

3. **Restart Claude Code** - hooks take effect on next session.

## How It Works

```
Claude Code ─► hooks ─► /tmp/claude-code-state/*.json
                                    │
                                    ├─► TabzChrome backend (/api/claude-status)
                                    │         └─► Frontend polls every 2s
                                    │
                                    └─► tmux status bar (tmux-status-claude.sh)
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

### Status bar disappearing?

The tmux status bar hides if:
- State file is >60 seconds old (stale)
- No Claude running in current session

### Stale status files?

The cleanup endpoint removes old state files:
```bash
curl -X POST http://localhost:8129/api/claude-status/cleanup
```

## Requirements

- `jq` - for JSON parsing in the hook script
- Claude Code with hooks support
- TabzChrome backend running on port 8129

## Source of Truth

The canonical hook scripts are maintained in:
- **Active:** `~/.claude/hooks/` (what Claude actually uses)
- **Source:** `~/projects/tmuxplexer/hooks/` (upstream for updates)

Do NOT copy hooks from this directory - use tmuxplexer's install.sh instead.
