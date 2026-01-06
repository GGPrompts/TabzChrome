---
name: bd-swarm-auto
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

Run parallel workers in waves until the entire backlog is complete. No user interaction needed after launch.

## Quick Start

```
/conductor:bd-swarm-auto
```

That's it. The skill handles everything: worktrees, workers, monitoring, merges, and cleanup.

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  Wave Loop                                                           │
│                                                                      │
│  1. Get ready issues ──────────► bd ready                            │
│  2. Create worktrees (parallel) ──► git worktree add + npm install   │
│  3. Spawn workers ─────────────► TabzChrome API (tmux sessions)      │
│  4. Monitor via tmuxplexer ────► Poll every 2 min                    │
│  5. All issues closed? ────────► Yes: merge & cleanup                │
│  6. QA checkpoint (parallel) ──► Screenshots, console check          │
│  7. More issues? ──────────────► Yes: next wave. No: done!           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Execution Workflow

### Phase 1: Check Ready Work

```bash
echo "=== Checking backlog ==="
READY_JSON=$(bd ready --json)
READY_COUNT=$(echo "$READY_JSON" | jq 'length')

if [ "$READY_COUNT" -eq 0 ]; then
  echo "Backlog complete! No ready issues."
  tabz_speak "Backlog complete. All issues closed."
  exit 0
fi

echo "Found $READY_COUNT ready issues"
READY_ISSUES=$(echo "$READY_JSON" | jq -r '.[].id')
```

### Phase 2: Initialize Worktrees

Create all worktrees in parallel, then wait for completion before spawning workers.

```bash
echo "=== Phase 2: Creating worktrees ==="
PROJECT_DIR=$(pwd)
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
WORKTREE_LOCK="/tmp/git-worktree-$(basename "$PROJECT_DIR").lock"

# Validate issue ID format
validate_issue_id() {
  [[ "$1" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "ERROR: Invalid issue ID: $1" >&2; return 1; }
}

# Setup single worktree with deps
setup_worktree() {
  local ISSUE="$1"
  local WORKTREE="${WORKTREE_DIR}/${ISSUE}"

  mkdir -p "$(dirname "$WORKTREE")"

  # Lock for worktree creation (prevents race conditions)
  (
    flock -x 200 || { echo "ERROR: Failed to acquire lock" >&2; exit 1; }
    if [ -d "$WORKTREE" ]; then
      echo "Worktree exists: $WORKTREE"
      exit 0
    fi
    git worktree add "$WORKTREE" -b "feature/${ISSUE}" 2>/dev/null || \
    git worktree add "$WORKTREE" HEAD
  ) 200>"$WORKTREE_LOCK"

  # Install deps outside lock (parallel safe)
  if [ -f "$WORKTREE/package.json" ] && [ ! -d "$WORKTREE/node_modules" ]; then
    cd "$WORKTREE"
    if [ -f "pnpm-lock.yaml" ]; then
      pnpm install --frozen-lockfile
    elif [ -f "yarn.lock" ]; then
      yarn install --frozen-lockfile
    else
      npm ci 2>/dev/null || npm install
    fi
  fi

  echo "READY: $WORKTREE"
}

# Run all worktree setups in parallel
for ISSUE in $READY_ISSUES; do
  validate_issue_id "$ISSUE" || continue
  setup_worktree "$ISSUE" &
done

wait
echo "All worktrees initialized"
```

### Phase 3: Spawn Workers

```bash
echo "=== Phase 3: Spawning workers ==="
TOKEN=$(cat /tmp/tabz-auth-token)
SESSION_FILE="/tmp/swarm-sessions-$(date +%s).txt"

for ISSUE in $READY_ISSUES; do
  validate_issue_id "$ISSUE" || continue
  WORKTREE="${WORKTREE_DIR}/${ISSUE}"

  # Mark issue in progress
  bd update "$ISSUE" --status in_progress

  # Get issue details for prompt
  ISSUE_JSON=$(bd show "$ISSUE" --json)
  TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  DESCRIPTION=$(echo "$ISSUE_JSON" | jq -r '.description // "No description"')

  # Spawn via TabzChrome API
  JSON_PAYLOAD=$(jq -n \
    --arg name "worker-${ISSUE}" \
    --arg dir "$WORKTREE" \
    --arg cmd "claude --dangerously-skip-permissions" \
    '{name: $name, workingDir: $dir, command: $cmd}')

  RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "$JSON_PAYLOAD")

  SESSION=$(echo "$RESPONSE" | jq -r '.terminal.sessionName // empty')
  if [ -n "$SESSION" ]; then
    echo "$SESSION:$ISSUE" >> "$SESSION_FILE"
    echo "Spawned: $SESSION for $ISSUE"

    # Wait for Claude to initialize
    sleep 4

    # Send prompt
    PROMPT=$(cat <<EOF
## Task
${ISSUE}: ${TITLE}

${DESCRIPTION}

## Instructions
1. Read the issue carefully with \`bd show ${ISSUE}\`
2. Implement the solution
3. Build and verify: \`npm run build\`
4. When done, run: \`/conductor:worker-done ${ISSUE}\`

## Skills (use if relevant)
- Use the xterm-js skill for terminal/pty work
- Use the ui-styling skill for UI components
- Use subagents in parallel for codebase exploration
EOF
)

    printf '%s' "$PROMPT" | tmux load-buffer -
    tmux paste-buffer -t "$SESSION"
    sleep 0.3
    tmux send-keys -t "$SESSION" C-m
  else
    echo "ERROR: Failed to spawn worker for $ISSUE"
  fi
done
```

### Phase 4: Monitor Until Complete

```bash
echo "=== Phase 4: Monitoring workers ==="

# Spawn tmuxplexer monitor
plugins/conductor/scripts/monitor-workers.sh --spawn 2>/dev/null || true

POLL_INTERVAL=120  # 2 minutes
MAX_STALE_TIME=600 # 10 minutes

while true; do
  SUMMARY=$(plugins/conductor/scripts/monitor-workers.sh --summary 2>/dev/null || echo "WORKERS:? WORKING:? IDLE:? AWAITING:? STALE:?")
  echo "[$(date '+%H:%M')] $SUMMARY"

  # Check if all issues are closed
  ALL_CLOSED=true
  for ISSUE in $READY_ISSUES; do
    validate_issue_id "$ISSUE" || continue
    STATUS=$(bd show "$ISSUE" --json 2>/dev/null | jq -r '.status // "unknown"')
    if [ "$STATUS" != "closed" ]; then
      ALL_CLOSED=false
      break
    fi
  done

  if $ALL_CLOSED; then
    echo "All issues closed!"
    break
  fi

  # Check for stale workers (might need nudge)
  STALE=$(echo "$SUMMARY" | grep -oP 'STALE:\K\d+')
  if [ "$STALE" -gt 0 ]; then
    echo "WARNING: $STALE stale workers detected"
    # Could add automatic nudging here
  fi

  sleep $POLL_INTERVAL
done
```

### Phase 5: Merge & Cleanup

```bash
echo "=== Phase 5: Merging and cleanup ==="
cd "$PROJECT_DIR"

# Kill worker sessions
if [ -f "$SESSION_FILE" ]; then
  while IFS=: read -r SESSION ISSUE; do
    [[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    tmux kill-session -t "$SESSION" 2>/dev/null && echo "Killed: $SESSION"
  done < "$SESSION_FILE"
  rm "$SESSION_FILE"
fi

# Also kill by pattern (fallback)
for ISSUE in $READY_ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  tmux kill-session -t "worker-${ISSUE}" 2>/dev/null
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "ctt-.*${ISSUE}" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null
  done
done

# Merge branches
MERGE_COUNT=0
for ISSUE in $READY_ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  if git merge --no-edit "feature/${ISSUE}" 2>/dev/null; then
    MERGE_COUNT=$((MERGE_COUNT + 1))
    echo "Merged: feature/${ISSUE}"
  fi
done

# Cleanup worktrees and branches
for ISSUE in $READY_ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  git worktree remove --force "${WORKTREE_DIR}/${ISSUE}" 2>/dev/null
  git branch -d "feature/${ISSUE}" 2>/dev/null
done

# Remove worktree directory if empty
rmdir "$WORKTREE_DIR" 2>/dev/null || true

echo "Merged $MERGE_COUNT branches, cleaned up worktrees"

# Audio announcement
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "Wave complete. $MERGE_COUNT branches merged." \
    '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &
```

### Phase 6: Sync and Check for More

```bash
echo "=== Phase 6: Sync and check ==="
bd sync
git push origin main

# Check for more ready issues (dependencies may have unblocked)
NEXT_READY=$(bd ready --json | jq 'length')

if [ "$NEXT_READY" -gt 0 ]; then
  echo "Found $NEXT_READY more issues ready - starting next wave"
  # Loop back to Phase 1 (handled by wave loop wrapper)
else
  echo "=== BACKLOG COMPLETE ==="
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d '{"text": "Backlog complete! All waves finished and pushed to main.", "voice": "en-GB-SoniaNeural", "rate": "+15%", "priority": "high"}' \
    > /dev/null 2>&1 &
fi
```

## Context Recovery

If context reaches ~70%, run `/wipe` with this handoff:

```markdown
## BD Swarm Auto In Progress

Autonomous backlog processing active. Run `/bd-swarm-auto` to continue.
Beads has full state - just resume.
```

The skill is idempotent - resuming will:
1. Check `bd ready` for remaining work
2. Skip already-closed issues
3. Continue from where it left off

## QA Checkpoint (Optional)

Between waves, run visual QA if a dev server is available:

```bash
# Start dev server if available
if grep -q '"dev"' package.json 2>/dev/null; then
  npm run dev &
  DEV_PID=$!
  sleep 5

  # Screenshot desktop/tablet/mobile
  mcp-cli call tabz/tabz_open_url '{"url": "http://localhost:3000"}'
  sleep 2

  mcp-cli call tabz/tabz_screenshot '{"filename": "qa-desktop.png"}'

  mcp-cli call tabz/tabz_emulate_device '{"device": "tablet"}'
  mcp-cli call tabz/tabz_screenshot '{"filename": "qa-tablet.png"}'

  mcp-cli call tabz/tabz_emulate_device '{"device": "mobile"}'
  mcp-cli call tabz/tabz_screenshot '{"filename": "qa-mobile.png"}'

  mcp-cli call tabz/tabz_emulate_clear '{}'

  # Check console errors
  CONSOLE=$(mcp-cli call tabz/tabz_get_console_logs '{}')
  ERRORS=$(echo "$CONSOLE" | grep -c "error" || true)

  if [ "$ERRORS" -gt 0 ]; then
    echo "WARNING: $ERRORS console errors detected"
    # Could create bug issue here
  fi

  kill $DEV_PID 2>/dev/null
fi
```

## Wave Loop (Full Execution)

Execute this complete workflow:

```bash
WAVE=1

while true; do
  echo ""
  echo "╔═══════════════════════════════════════╗"
  echo "║           WAVE $WAVE                    ║"
  echo "╚═══════════════════════════════════════╝"

  # Phase 1: Get ready issues
  READY_JSON=$(bd ready --json)
  READY_COUNT=$(echo "$READY_JSON" | jq 'length')

  if [ "$READY_COUNT" -eq 0 ]; then
    echo "No more ready issues - backlog complete!"
    break
  fi

  READY_ISSUES=$(echo "$READY_JSON" | jq -r '.[].id')
  echo "Processing $READY_COUNT issues: $READY_ISSUES"

  # Phase 2-5: Setup, spawn, monitor, merge
  # (Execute the phases above)

  # Phase 6: Sync and loop
  bd sync
  git push origin main

  WAVE=$((WAVE + 1))
done

# Final announcement
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "All $((WAVE - 1)) waves complete. Backlog is empty." \
    '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &

echo ""
echo "=== BD SWARM AUTO COMPLETE ==="
echo "Waves completed: $((WAVE - 1))"
echo "All issues closed, branches merged, pushed to main"
```

## Differences from bd-swarm --auto

| Feature | bd-swarm --auto | bd-swarm-auto |
|---------|-----------------|---------------|
| Invocation | Flag on command | Dedicated skill |
| Self-resumable | Needs manual restart | `/wipe` handoff continues |
| System prompt | Generic | Optimized for autonomy |
| Claude-invokable | No | Yes (via Skill tool) |
| Context monitoring | Manual | Built-in (70% threshold) |

## Troubleshooting

**Worker not starting:**
```bash
# Check backend running
curl -s http://localhost:8129/api/health

# Check auth token
cat /tmp/tabz-auth-token

# Check session exists
tmux has-session -t "worker-xxx" 2>/dev/null && echo "exists"
```

**Stale workers:**
```bash
# Capture pane to see what's happening
tmux capture-pane -t "worker-xxx" -p -S -50

# Nudge if stuck
tmux send-keys -t "worker-xxx" "Please continue with the task" C-m
```

**Merge conflicts:**
```bash
# Check for conflicts
git status

# Resolve manually then:
git add . && git commit -m "resolve merge conflict"
```

Execute this workflow now.
