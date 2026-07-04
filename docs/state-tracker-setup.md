# State Tracker Setup for Claude Code

TabzChrome can display Claude's current state (working, idle, using tools) and trigger audio notifications. This requires installing a hook script at the user level.

## What It Does

- Updates terminal status in TabzChrome sidebar (working/idle/tool use)
- Triggers audio notifications via Chrome TTS
- Tracks subagent activity

## Installation

### 1. Copy the script

```bash
# From TabzChrome directory
mkdir -p ~/.claude/hooks/scripts
cp docs/scripts/state-tracker.sh ~/.claude/hooks/scripts/
chmod +x ~/.claude/hooks/scripts/state-tracker.sh
```

### 2. Add hooks to settings.json

Add these hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh session-start",
            "timeout": 2
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh user-prompt",
            "timeout": 1
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh pre-tool",
            "timeout": 1
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh post-tool",
            "timeout": 1
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh stop",
            "timeout": 1
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh subagent-start",
            "timeout": 1
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh subagent-stop",
            "timeout": 1
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/scripts/state-tracker.sh notification",
            "timeout": 1
          }
        ]
      }
    ]
  }
}
```

### 3. Restart Claude Code

```bash
# Or use /restart if you have the restart plugin
claude
```

## Context Percentage (Optional)

Terminal tabs can also show context window usage (e.g. `50% ctx`). This uses
Claude Code's statusline feature, which receives context data the hooks don't.

### 1. Install the statusline script

```bash
# From TabzChrome directory
cp docs/scripts/statusline-script.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/statusline-script.sh
```

### 2. Configure it in settings.json

Add to `~/.claude/settings.json` (top level, alongside `"hooks"`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/hooks/statusline-script.sh"
  }
}
```

### How it works

On every status update, the script writes
`/tmp/claude-code-state/<claude-session-id>-context.json` (token counts and
context %) plus a small linkage file that lets the state tracker join the
context data to its state file. The tracker then embeds `context_percent`
into the state JSON that the TabzChrome backend reads. Already have your own
statusline? Merge the file-writing block from `docs/scripts/statusline-script.sh`
into it — the printed status line itself can be anything you like.

## Configuration

The script uses these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TABZ_BACKEND_URL` | `http://localhost:8129` | TabzChrome backend URL |
| `CLAUDE_AUDIO` | `0` | Set to `1` to enable spoken announcements |
| `CLAUDE_SESSION_NAME` | `Claude` | Name used in spoken announcements |

## How It Works

1. Claude Code fires hook events (SessionStart, Stop, etc.)
2. The script writes state to `/tmp/claude-code-state/<session>.json`
3. TabzChrome backend polls these files
4. Sidebar updates and audio plays via Chrome TTS

## Troubleshooting

Check state files:
```bash
ls -la /tmp/claude-code-state/
cat /tmp/claude-code-state/*.json
```

Check backend is running:
```bash
curl http://localhost:8129/health
```
