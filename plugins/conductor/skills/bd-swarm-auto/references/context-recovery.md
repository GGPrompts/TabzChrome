# Context Recovery - BD Swarm Auto

How to handle context limits during autonomous execution.

## Monitor Your Context

Your context percentage is visible in your status bar.

**During every poll cycle (Step 6), check your context:**
- **Below 70%:** Continue normally
- **At 70% or above:** IMMEDIATELY run `/wipe:wipe`

## How to Wipe with Handoff

1. First, save current wave state:
```bash
# Note which issues are still in progress
bd list --status=in_progress
```

2. Then invoke /wipe:wipe with this exact handoff message:

```
/wipe:wipe

## BD Swarm Auto In Progress

**Wave State:** Workers are processing issues. Resume monitoring.

**Active Issues:**
- [list the in_progress issue IDs]

**Action Required:** Run `/conductor:bd-swarm-auto` to continue.

Beads has full state. The skill will:
1. Check issue statuses (some may have closed while wiping)
2. Resume polling for remaining in_progress issues
3. Merge and cleanup when done
4. Start next wave if more issues ready
```

**DO NOT wait until you run out of context.** Wipe proactively at 70%.

## Troubleshooting

**Workers not responding:**
```bash
tmux capture-pane -t "<session>" -p -S -50
```

**Merge conflicts:**
Resolve manually, then continue.

**Worker stuck:**
```bash
tmux send-keys -t "<session>" "Please continue with your task" C-m
```

**Subagent failed:**
Worker should retry or mark issue for manual review.
