---
name: auto
description: "Autonomous worker loop - spawns workers, polls beads, respawns until backlog empty"
---

# Auto Mode - Autonomous Worker Loop

Spawns workers for ready issues, polls beads for updates, spawns new workers as issues become unblocked, cleans up completed work. Runs until backlog is empty.

## MCP Tools Available

When TabzChrome MCP server is connected, use these tools for worker management:

| Tool | Purpose |
|------|---------|
| `tabz_list_profiles` | Discover worker profiles (e.g., "claude-worker") |
| `tabz_spawn_profile` | Spawn workers using preconfigured profiles |
| `tabz_list_plugins` | Check what plugins workers will have access to |
| `tabz_list_skills` | Discover skills available to workers |

**Profile-based spawning is recommended** - profiles encapsulate command, theme, and plugin settings.

## How It Works

1. Check TabzChrome health
2. Start beads daemon
3. Launch worker dashboard (tmuxplexer --watcher)
4. Get ready tasks (filter out epics) -> spawn workers (up to 3 parallel)
5. Poll every 30 seconds:
   - Query `/api/agents` for worker status
   - Check beads for closed issues
   - Merge + cleanup completed workers
   - Spawn newly unblocked issues
6. When done: `bd sync && git push`

## Usage

```bash
/conductor:auto
```

**Max 3 workers** - workers spawn subagents, more causes resource contention.

## Implementation

```bash
#!/bin/bash
MAX_WORKERS=3
POLL_INTERVAL=30
INITIAL_WAIT=120
TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)

# Find conductor scripts directory for safe-send-keys.sh
CONDUCTOR_SCRIPTS=$(find ~/plugins ~/.claude/plugins -name "safe-send-keys.sh" -path "*conductor*" -exec dirname {} \; 2>/dev/null | head -1)

# Pre-flight checks
check_health() {
  curl -sf "$TABZ_API/api/health" >/dev/null || { echo "TabzChrome not running"; exit 1; }
  bd daemon status >/dev/null 2>&1 || bd daemon start
}

# Launch tmuxplexer dashboard (sets DASHBOARD_SESSION global)
spawn_dashboard() {
  local RESP=$(curl -s -X POST "$TABZ_API/api/spawn" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d '{
      "name": "Worker Dashboard",
      "workingDir": "/home/marci/projects/tmuxplexer",
      "command": "./tmuxplexer --watcher"
    }')
  DASHBOARD_SESSION=$(echo "$RESP" | jq -r '.terminal.sessionName // empty')
  if [ -z "$DASHBOARD_SESSION" ]; then
    # Fallback: find by pattern
    sleep 2
    DASHBOARD_SESSION=$(tmux ls 2>/dev/null | grep -o "ctt-worker-dashboard-[a-f0-9]*" | head -1)
  fi
  echo "Dashboard launched -> ${DASHBOARD_SESSION:-unknown}"
}

# Get ready tasks (exclude epics)
get_ready_tasks() {
  # Only get issues with 'ready' label (backlog issues without prompts lack this label)
  bd ready --label ready --json | jq -r '.[] | select(.issue_type != "epic") | .id'
}

# Check if issue is already being worked (by terminal name)
is_issue_active() {
  local ISSUE_ID="$1"
  curl -s "$TABZ_API/api/agents" | jq -e --arg id "$ISSUE_ID" \
    '.data[] | select(.name == $id)' >/dev/null 2>&1
}

# Spawn a worker
spawn_worker() {
  local ISSUE_ID="$1"
  local WORKTREE=".worktrees/$ISSUE_ID"
  local WORKDIR=$(pwd)

  # Create worktree
  git worktree add "$WORKTREE" -b "feature/$ISSUE_ID" 2>/dev/null || return 1

  # Initialize dependencies SYNCHRONOUSLY (so they're ready before Claude starts)
  INIT_SCRIPT=$(find ~/plugins -name "init-worktree.sh" -path "*conductor*" 2>/dev/null | head -1)
  if [ -z "$INIT_SCRIPT" ]; then
    INIT_SCRIPT=$(find ~/.claude/plugins -name "init-worktree.sh" -path "*conductor*" 2>/dev/null | head -1)
  fi
  if [ -n "$INIT_SCRIPT" ]; then
    echo "Initializing $ISSUE_ID dependencies..."
    $INIT_SCRIPT "$WORKTREE" 2>&1 | tail -5
  fi

  # Plugin directories for Claude
  PLUGIN_DIRS="--plugin-dir $HOME/.claude/plugins/marketplaces --plugin-dir $HOME/plugins/my-plugins"

  # Spawn terminal with issue ID as name
  local RESP=$(curl -s -X POST "$TABZ_API/api/spawn" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{
      \"name\": \"$ISSUE_ID\",
      \"workingDir\": \"$WORKDIR/$WORKTREE\",
      \"command\": \"BEADS_NO_DAEMON=1 claude $PLUGIN_DIRS\"
    }")

  local SESSION=$(echo "$RESP" | jq -r '.terminal.sessionName')

  # Wait for Claude to fully initialize before sending prompt
  echo "Waiting for Claude to initialize..."
  sleep 8

  # Get session ID (may differ from sessionName)
  SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .id')

  # Send prompt - worker follows PRIME.md
  local PROMPT="Complete beads issue $ISSUE_ID. Run: bd show $ISSUE_ID --json"

  # Use safe-send-keys.sh for reliable prompt delivery (handles long prompts)
  if [ -n "$CONDUCTOR_SCRIPTS" ] && [ -x "$CONDUCTOR_SCRIPTS/safe-send-keys.sh" ]; then
    "$CONDUCTOR_SCRIPTS/safe-send-keys.sh" "$SESSION" "$PROMPT"
  else
    # Fallback: inline tmux with 1s delay
    tmux send-keys -t "$SESSION" -l "$PROMPT"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
  fi

  echo "Spawned $ISSUE_ID -> $SESSION"
}

# Get active workers from TabzChrome API
get_active_workers() {
  curl -s "$TABZ_API/api/agents" | jq -r '
    .data[]
    | select(.workingDir | contains(".worktrees/"))
    | .name
  '
}

# Check dashboard for stuck workers (Awaiting Input, Error)
check_dashboard_status() {
  if [ -z "$DASHBOARD_SESSION" ]; then
    return
  fi

  local DASHBOARD_STATE=$(tmux capture-pane -t "$DASHBOARD_SESSION" -p 2>/dev/null | tail -20)

  if echo "$DASHBOARD_STATE" | grep -q "Awaiting Input"; then
    echo "WARNING: Worker awaiting input detected!"
    # Extract which workers are stuck
    echo "$DASHBOARD_STATE" | grep -B1 "Awaiting Input" | grep "" | while read -r line; do
      local STUCK_WORKER=$(echo "$line" | grep -o "[A-Za-z0-9_-]*-[a-z0-9]*" | head -1)
      if [ -n "$STUCK_WORKER" ]; then
        echo "   -> $STUCK_WORKER is stuck awaiting input"
      fi
    done
  fi

  if echo "$DASHBOARD_STATE" | grep -q "Error"; then
    echo "WARNING: Worker error detected!"
    echo "$DASHBOARD_STATE" | grep -B1 "Error" | grep "" | while read -r line; do
      local ERROR_WORKER=$(echo "$line" | grep -o "[A-Za-z0-9_-]*-[a-z0-9]*" | head -1)
      if [ -n "$ERROR_WORKER" ]; then
        echo "   -> $ERROR_WORKER has an error"
      fi
    done
  fi
}

# Main
check_health
spawn_dashboard

echo "Getting ready tasks..."
READY=$(get_ready_tasks | head -n $MAX_WORKERS)

for ISSUE_ID in $READY; do
  spawn_worker "$ISSUE_ID"
done

ACTIVE_COUNT=$(get_active_workers | wc -l)
if [ "$ACTIVE_COUNT" -eq 0 ]; then
  echo "No ready tasks. Exiting."
  exit 0
fi

echo "Waiting ${INITIAL_WAIT}s for workers to initialize..."
sleep "$INITIAL_WAIT"

# Poll loop
while true; do
  WORKERS=$(get_active_workers)
  ACTIVE_COUNT=$(echo "$WORKERS" | grep -c . || echo 0)
  echo "Polling... ($ACTIVE_COUNT active workers)"

  # Check dashboard for stuck workers
  check_dashboard_status

  # Check for completed issues and spawn cleanup
  for ISSUE_ID in $WORKERS; do
    STATUS=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].status // "unknown"')
    if [ "$STATUS" = "closed" ]; then
      echo "Issue $ISSUE_ID completed! Spawning cleanup..."
      # Spawn /conductor:worker-done instead of inline cleanup
      curl -s -X POST "$TABZ_API/api/spawn" \
        -H "Content-Type: application/json" \
        -H "X-Auth-Token: $TOKEN" \
        -d "{
          \"name\": \"cleanup-$ISSUE_ID\",
          \"workingDir\": \"$(pwd)\",
          \"command\": \"claude -p '/conductor:worker-done $ISSUE_ID'\"
        }" >/dev/null
    fi
  done

  # Spawn new workers if capacity available
  ACTIVE_COUNT=$(get_active_workers | grep -c . || echo 0)
  if [ "$ACTIVE_COUNT" -lt "$MAX_WORKERS" ]; then
    SLOTS=$((MAX_WORKERS - ACTIVE_COUNT))

    for ISSUE_ID in $(get_ready_tasks | head -n $SLOTS); do
      is_issue_active "$ISSUE_ID" || spawn_worker "$ISSUE_ID"
    done
  fi

  # Exit if done
  ACTIVE_COUNT=$(get_active_workers | grep -c . || echo 0)
  REMAINING=$(get_ready_tasks | wc -l)
  if [ "$ACTIVE_COUNT" -eq 0 ] && [ "$REMAINING" -eq 0 ]; then
    echo "All work complete!"
    bd sync
    git push
    exit 0
  fi

  sleep "$POLL_INTERVAL"
done
```

## What Workers Should Do

Workers follow PRIME.md instructions (injected via beads hook):

1. Read issue context with `bd show` or MCP tools
2. Claim the issue (status = in_progress)
3. Do the work
4. Commit changes with issue ID in message
5. Add retro notes
6. Close the issue
7. Run `bd sync` and push branch

The conductor detects closed status via polling and handles merge + cleanup.

## TabzChrome API Usage

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Pre-flight check |
| `POST /api/spawn` | Create worker terminal |
| `GET /api/agents` | List all terminals, find by name |
| `DELETE /api/agents/:id` | Kill terminal after cleanup |
| `GET /api/tmux/sessions/:id/capture` | Debug stuck workers |

### Worker Lookup by Issue ID

```bash
# Find worker by name (issue ID)
curl -s http://localhost:8129/api/agents | jq -r '.data[] | select(.name == "V4V-ct9")'

# Get session ID for tmux commands
SESSION=$(curl -s http://localhost:8129/api/agents | jq -r '.data[] | select(.name == "V4V-ct9") | .id')
```

## Worker Dashboard

The tmuxplexer `--watcher` mode shows:
- All Claude sessions with real-time status
- Context usage percentage
- Working directory and git branch

```
 AI Only | 3 showing
|[f] Filter | 3 attached | 3 AI
|------------------------------------------
|   V4V-ct9                    Processing [45%]
|      ~/projects/app/.worktrees/V4V-ct9
|   V4V-g2z                    Awaiting Input [30%]
|      ~/projects/app/.worktrees/V4V-g2z
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_WORKERS | 3 | Maximum parallel workers |
| POLL_INTERVAL | 30s | How often to check status |
| INITIAL_WAIT | 120s | Wait after spawn before polling |

## Notes

- **Names terminals with issue ID** for easy lookup
- Filters out epics from ready queue (not actionable)
- Uses TabzChrome API instead of manual tracking
- Kills terminals via API after merge
- Launches dashboard for visual monitoring
- Workers must close issues for detection
- **Dependencies are installed synchronously** before Claude starts (npm, pip, etc.)
- **Plugin directories are passed** via `--plugin-dir` flag
- Workers follow PRIME.md - MCP tools and `bd sync` work in worktrees
