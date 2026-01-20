---
name: gg-auto
description: "Autonomous worker loop - delegates to planner, prompt-writer, spawner, and cleanup plugins"
context:
  skills:
    - spawner:terminals           # TabzChrome API patterns
    - conductor:automating-browser # MCP tool reference for browser debugging
---

# Auto Mode - Autonomous Worker Loop

Lightweight orchestrator that coordinates focused plugins to process work autonomously.

## First: Load Context

**Before starting, read the context skills to understand available tools:**

1. Read `/spawner:terminals` skill for TabzChrome spawning patterns
2. Read `/conductor:automating-browser` skill for MCP tool reference

These skills teach you the TabzChrome MCP tools (tabz_*) and REST API patterns.

## Steps

Add these to your to-dos:

1. **Pre-flight checks** - Verify TabzChrome running, start beads daemon
2. **Start background poller** - Launch monitoring script
3. **Spawn workers** - For each ready issue (max 3 parallel)
4. **Monitor and cleanup** - Check poller output, run cleanup when issues close
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

## Step 2: Start Background Poller

Start the monitoring script in background - it writes status to `/tmp/worker-status.json`:

```bash
# Find and start poll script
POLL_SCRIPT=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "poll-workers.sh" 2>/dev/null | head -1)
if [ -n "$POLL_SCRIPT" ]; then
  nohup "$POLL_SCRIPT" 30 /tmp/worker-status.json > /tmp/poll-workers.log 2>&1 &
  echo "Started background poller (PID: $!)"
fi
```

The poller:
- Checks worker status every 30s
- Detects newly closed issues
- Writes events to `/tmp/worker-events.jsonl`

## Step 3: Spawn Workers

For each ready issue (up to MAX_WORKERS=3), use the Task tool with Haiku:

```python
# Get ready issues (excluding epics)
ready_issues = bd ready --json | jq '[.[] | select(.issue_type != "epic")] | .[0:3]'

# Spawn each using Task tool (parallel)
for issue in ready_issues:
    Task(
        subagent_type="general-purpose",
        model="haiku",
        prompt=f"/spawner:spawn {issue['id']}",
        description=f"Spawn {issue['id']}"
    )
```

The spawner will:
- Create git worktree
- Initialize dependencies (npm, python, etc.)
- Run `npm run build` for Next.js types
- Spawn terminal via TabzChrome
- Send prepared prompt to worker

## Step 4: Monitor and Cleanup

**You are now free to continue other work.** Periodically check the poller output:

```bash
# Check current status
cat /tmp/worker-status.json | jq '{workers: .workers, in_progress: .in_progress | length, ready: .ready | length}'

# Check for events (newly closed issues)
tail -5 /tmp/worker-events.jsonl 2>/dev/null
```

When issues close, collect them for batch cleanup:

```bash
# Get all newly closed issue IDs from events file
CLOSED_ISSUES=$(cat /tmp/worker-events.jsonl 2>/dev/null | jq -sr '[.[].issue] | unique | join(" ")')
```

## Step 5: Wave Completion

When a wave is done (all spawned workers have closed their issues), run the completion pipeline:

```bash
# Find completion-pipeline.sh
PIPELINE=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "completion-pipeline.sh" 2>/dev/null | head -1)

# Run with audio notification
AUDIO=1 "$PIPELINE" "$CLOSED_ISSUES"
```

The completion pipeline:
1. **Captures session transcripts** with token usage stats
2. **Kills worker terminals**
3. **Merges feature branches** to main (handles conflicts gracefully)
4. **Removes worktrees** and deletes merged branches
5. **Generates wave summary** with total costs and git stats

For individual issue cleanup, use: `/cleanup:done ISSUE_ID`

## Step 6: Final Sync and Next Wave

```bash
# Stop poller
pkill -f poll-workers.sh

# Final sync and push
bd sync
git push

# Check for more work
NEXT_READY=$(bd ready --json | jq 'length')
echo "Wave complete! $NEXT_READY issues ready for next wave."
```

If more issues are ready, go back to Step 3 (spawn workers).

## Background Polling Benefits

- **Non-blocking**: You can continue planning while workers run
- **Event-driven**: Cleanup triggers only when issues close
- **Persistent**: Poller survives conversation compaction
- **Observable**: Status always available in `/tmp/worker-status.json`

## Quick Status Check

```bash
# One-liner status
jq -r '"Workers: \(.workers | length), In Progress: \(.in_progress | length), Ready: \(.ready | length)"' /tmp/worker-status.json
```

## Worker Workflow

Workers follow PRIME.md instructions (injected via beads hook):

1. Read issue context with `bd show` or MCP tools
2. Claim the issue (status = in_progress)
3. Do the work
4. Commit changes with issue ID in message
5. Add retro notes
6. Close the issue
7. Run `bd sync` and push branch

The conductor detects closed status via poller and delegates cleanup.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_WORKERS | 3 | Maximum parallel workers |
| POLL_INTERVAL | 30s | How often to check status |
| STATUS_FILE | /tmp/worker-status.json | Poller output |
| EVENTS_FILE | /tmp/worker-events.jsonl | Closed issue events |

## Related Plugins

| Plugin | Purpose |
|--------|---------|
| `/prompt-writer` | Craft worker prompts from backlog issues |
| `/planner` | Break down features into tasks |
| `/spawner` | Spawn workers in worktrees |
| `/cleanup` | Merge and cleanup after completion |

## Notes

- Conductor is now a lightweight orchestrator
- Background poller handles monitoring
- All heavy work delegated to focused plugins (Haiku)
- Planning uses Sonnet for reasoning
- Workers follow PRIME.md - MCP tools and `bd sync` work in worktrees
