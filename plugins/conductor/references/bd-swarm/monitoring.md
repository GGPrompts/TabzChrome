# Worker Monitoring

Monitor workers directly via tmuxplexer in a background window.

## Spawn Monitor

```bash
# Spawn tmuxplexer --watcher as background window (window 2)
plugins/conductor/scripts/monitor-workers.sh --spawn
```

The monitor shows all AI sessions with:
- Status: idle, processing, tool_use, awaiting_input
- Context %
- Current tool

## Poll Status

```bash
# Get parsed worker statuses
plugins/conductor/scripts/monitor-workers.sh --status
# Output: ctt-worker-abc|tool_use|45

# Get summary
plugins/conductor/scripts/monitor-workers.sh --summary
# Output: WORKERS:3 WORKING:2 IDLE:0 AWAITING:1 STALE:0

# Check specific issue
plugins/conductor/scripts/monitor-workers.sh --check-issue TabzChrome-abc
# Output: CLOSED or OPEN
```

## Decision Logic

Poll every ~2 minutes and decide:

| Status | Action |
|--------|--------|
| `🔧 AskUserQuestion` | **Don't nudge** - worker waiting for user answer |
| `🔧 <other tool>` | Working, leave alone |
| `awaiting_input` / `idle` | At prompt - check if issue closed or stuck |
| `stale` (5+ min no activity) | May be hung, investigate pane |
| Issue closed | Worker done, ready for cleanup |

**Detection:** Tmuxplexer shows `🔧 Using AskUserQuestion` when worker has a question pending. Never nudge these workers.

## Drill Down

Only capture worker panes when needed:

```bash
tmux capture-pane -t <worker-session> -p -S -50
```
