---
name: gg-auto
description: "Autonomous worker loop - delegates to planner, prompt-writer, spawner, and cleanup plugins"
---

# Auto Mode - Autonomous Worker Loop

Lightweight orchestrator that coordinates the focused plugins to process work autonomously.

## Steps

Add these to your to-dos:

1. **Pre-flight checks** - Verify TabzChrome running, start beads daemon
2. **Spawn dashboard** - Launch tmuxplexer for worker monitoring
3. **For each ready issue** - Run `/spawner:spawn` (max 3 parallel workers)
4. **Poll loop** - Every 30s: detect closed issues, run `/cleanup:done`
5. **When empty** - Sync beads and push

---

## Plugins Used

| Plugin | Command | Purpose |
|--------|---------|---------|
| spawner | `/spawner:spawn` | Spawn workers for ready issues |
| cleanup | `/cleanup:done` | Merge and cleanup completed work |

**Max 3 workers** - workers spawn subagents, more causes resource contention.

## Step 1: Pre-flight Checks

```bash
# Check TabzChrome
curl -sf http://localhost:8129/api/health >/dev/null || { echo "TabzChrome not running"; exit 1; }

# Start beads daemon
bd daemon status >/dev/null 2>&1 || bd daemon start
```

## Step 2: Spawn Dashboard

```bash
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $(cat /tmp/tabz-auth-token)" \
  -d '{"name": "Worker Dashboard", "workingDir": "~/projects/tmuxplexer", "command": "./tmuxplexer --watcher"}'
```

Shows: status, context usage, working directory, git branch.

## Step 3: Spawn Workers

For each issue with `ready` label (up to MAX_WORKERS=3), run `/spawner:spawn`:

```bash
# Get ready issues
READY=$(bd ready --json | jq -r '.[].id')

for ISSUE_ID in $READY; do
  # Delegate to spawner plugin
  claude -p "/spawner:spawn $ISSUE_ID"
done
```

The spawner plugin will:
- Create git worktree
- Initialize dependencies
- Spawn terminal via TabzChrome
- Send prompt to worker

## Step 4: Poll Loop

Every 30 seconds, check for closed issues and run cleanup:

```bash
# Get closed issues with active workers
CLOSED=$(bd list --status closed --json | jq -r '.[].id')

for ISSUE_ID in $CLOSED; do
  # Check if worker terminal exists
  SESSION=$(curl -s http://localhost:8129/api/agents | jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .id')

  if [ -n "$SESSION" ]; then
    # Delegate cleanup
    claude -p "/cleanup:done $ISSUE_ID"
  fi
done

# Spawn newly unblocked issues (up to MAX_WORKERS)
```

## Step 5: Complete

When no active workers and no ready tasks:

```bash
bd sync
git push
echo "All work complete!"
```

## Implementation Notes

The conductor now delegates all heavy work:

| Task | Delegated To |
|------|--------------|
| Write prompts | `/prompt-writer:write` (Haiku) |
| Spawn terminals | `/spawner:spawn` (Haiku) |
| Merge/cleanup | `/cleanup:done` (Haiku) |
| Planning | `/planner:plan` (Sonnet) |

This keeps conductor lightweight and focused on coordination.

## Worker Workflow

Workers follow PRIME.md instructions (injected via beads hook):

1. Read issue context with `bd show` or MCP tools
2. Claim the issue (status = in_progress)
3. Do the work
4. Commit changes with issue ID in message
5. Add retro notes
6. Close the issue
7. Run `bd sync` and push branch

The conductor detects closed status via polling and delegates cleanup.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_WORKERS | 3 | Maximum parallel workers |
| POLL_INTERVAL | 30s | How often to check status |

## Related Plugins

| Plugin | Purpose |
|--------|---------|
| `/prompt-writer` | Craft worker prompts from backlog issues |
| `/planner` | Break down features into tasks |
| `/spawner` | Spawn workers in worktrees |
| `/cleanup` | Merge and cleanup after completion |

## Notes

- Conductor is now a lightweight orchestrator
- All heavy work delegated to focused plugins
- Each plugin can use optimal model (Haiku for mechanical, Sonnet for reasoning)
- Workers follow PRIME.md - MCP tools and `bd sync` work in worktrees
