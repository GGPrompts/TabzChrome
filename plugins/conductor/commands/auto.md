---
name: gg-auto
description: "Autonomous worker loop - spawns workers, monitors for completion, cleans up"
context:
  skills:
    - spawner:terminals           # TabzChrome API patterns
    - conductor:automating-browser # MCP tool reference for browser debugging
---

# Auto Mode - Autonomous Worker Loop

Orchestrate parallel workers: spawn → monitor → cleanup → repeat.

**CRITICAL**: This is a CONTINUOUS LOOP. Do NOT stop after spawning. You MUST actively monitor and cleanup.

## Main Loop (Your Job)

```
WHILE there is work:
  1. Spawn workers for ready issues (up to 3)
  2. LOOP every 30-60s:
     - Check which workers completed
     - Run cleanup for each completed worker
     - Check for new ready issues
     - Spawn more workers if slots available
  3. When all done: sync and push
```

**You must keep checking and cleaning up until no workers remain and no issues are ready.**

---

## Step 1: Pre-flight

```bash
# Check TabzChrome
curl -sf http://localhost:8129/api/health >/dev/null || { echo "TabzChrome not running"; exit 1; }

# Start beads daemon
bd daemon status >/dev/null 2>&1 || bd daemon start

# Clear old events
rm -f /tmp/worker-events.jsonl
```

## Step 2: Start Background Poller

```bash
POLL_SCRIPT=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "poll-workers.sh" 2>/dev/null | head -1)
if [ -z "$POLL_SCRIPT" ]; then
  echo "ERROR: poll-workers.sh not found" >&2
  exit 1
fi
pkill -f poll-workers.sh 2>/dev/null || true
nohup "$POLL_SCRIPT" 30 /tmp/worker-status.json > /tmp/poll-workers.log 2>&1 &
echo "Started background poller"
```

## Step 3: Spawn Initial Workers

Get ready issues and spawn up to 3:

```bash
# How many workers are already running?
CURRENT=$(curl -sf http://localhost:8129/api/agents | jq '[.data[] | select(.workingDir | contains(".worktrees/"))] | length')
SLOTS=$((3 - CURRENT))

# Get ready issues
bd ready --json | jq -r '.[].id' | head -$SLOTS
```

For each issue, spawn with Task tool:
```python
Task(
    subagent_type="general-purpose",
    model="haiku",
    prompt="/spawner:spawn ISSUE-ID",
    description="Spawn ISSUE-ID"
)
```

**Spawn in parallel** - send multiple Task calls in one message.

## Step 4: Monitor Loop (CRITICAL)

**YOU MUST ACTIVELY LOOP HERE.** Check every 30-60 seconds until all work is done.

### Check Status

```bash
# Quick status
jq -r '"Workers: \(.workers | length), In Progress: \(.in_progress | length), Ready: \(.ready | length)"' /tmp/worker-status.json 2>/dev/null || echo "Waiting for poller..."

# Check for newly closed issues
cat /tmp/worker-events.jsonl 2>/dev/null | tail -5
```

### When Issues Close - IMMEDIATELY Cleanup

When you see closed issues in the events file:

```python
# For EACH closed issue, spawn cleanup
Task(
    subagent_type="general-purpose",
    model="haiku",
    prompt="/cleanup:done CLOSED-ISSUE-ID",
    description="Cleanup CLOSED-ISSUE-ID"
)
```

### After Cleanup - Check for More Work

```bash
# How many slots available?
CURRENT=$(curl -sf http://localhost:8129/api/agents | jq '[.data[] | select(.workingDir | contains(".worktrees/"))] | length')
SLOTS=$((3 - CURRENT))

# Get ready issues
READY=$(bd ready --json | jq -r '.[].id' | head -$SLOTS)
echo "Slots: $SLOTS, Ready: $READY"
```

If there are ready issues and available slots, **spawn more workers** (go back to Step 3).

### Loop Termination

Only stop when:
1. No workers running (`.workers | length == 0`)
2. No issues in progress (`.in_progress | length == 0`)
3. No issues ready (`.ready | length == 0`)

## Step 5: Final Cleanup

When all work is done:

```bash
# Stop poller
pkill -f poll-workers.sh

# Final sync
bd sync
git push

echo "Wave complete!"
```

---

## Example Session Flow

```
[Check ready issues] → Found 5 ready
[Spawn 3 workers] → bd-001, bd-002, bd-003
[Wait 30s, check status] → 3 in progress, 2 ready
[Wait 30s, check status] → bd-001 closed!
[Cleanup bd-001] → merged, worktree removed
[Spawn 1 worker] → bd-004 (filling slot)
[Wait 30s, check status] → bd-002 closed!
[Cleanup bd-002] → merged
[Spawn 1 worker] → bd-005 (last ready issue)
[Wait 30s, check status] → 3 in progress, 0 ready
[Wait 30s, check status] → bd-003, bd-004 closed!
[Cleanup both] → merged
[Wait 30s, check status] → bd-005 closed!
[Cleanup bd-005] → merged
[Check status] → 0 workers, 0 in progress, 0 ready
[Final sync] → Done!
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Check status | `jq . /tmp/worker-status.json` |
| See closed events | `cat /tmp/worker-events.jsonl` |
| Count workers | `curl -s localhost:8129/api/agents \| jq '.data \| length'` |
| Ready issues | `bd ready --json \| jq -r '.[].id'` |
| Spawn worker | `Task(prompt="/spawner:spawn ID")` |
| Cleanup worker | `Task(prompt="/cleanup:done ID")` |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| MAX_WORKERS | 3 | Maximum parallel workers |
| POLL_INTERVAL | 30s | How often poller checks |
| CHECK_INTERVAL | 30-60s | How often YOU should check |

## Notes

- Workers are autonomous - they close issues when done
- Poller detects closures and writes to events file
- You must actively check the events file and trigger cleanup
- Always fill available slots with ready work
- Don't stop until everything is done
