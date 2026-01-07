---
name: bd-swarm-auto
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

**YOU are the conductor. Execute this workflow autonomously. Do NOT ask the user for input.**

## Architecture: Fewer Terminals, More Subagents

Spawn **3-4 terminal workers max**, each handling multiple issues via internal Task subagents.

```
BAD:  10 terminals x 1 issue each    -> statusline chaos
GOOD: 3 terminals x 3-4 subagents each -> smooth execution
```

---

## Quick Reference

| Step | Action | Reference |
|------|--------|-----------|
| 1 | Get ready issues | `bd ready --json` |
| 2 | Calculate workers | Max 4, distribute issues |
| 3 | Create worktrees | Parallel, wait for all |
| 4 | Spawn workers | TabzChrome API |
| 5 | Send prompts | Multi-issue with subagent instructions |
| 6 | Poll status | Every 2 min, check context |
| 7 | Merge & cleanup | Kill sessions first |
| 8 | Visual QA | tabz-manager for UI waves |
| 9 | Next wave | Loop until empty |

**Full details:** `references/wave-execution.md`

---

## EXECUTE NOW - Wave Loop

```bash
# Get ready issues
READY=$(bd ready --json | jq -r '.[].id')
[ -z "$READY" ] && echo "Backlog complete!" && exit 0

# Count and distribute to max 4 workers
ISSUES_COUNT=$(echo "$READY" | wc -l)
# 1-4: 1-2 workers, 5-8: 2-3 workers, 9+: 3-4 workers

# Create worktrees (parallel)
for ISSUE_ID in $READY; do
  plugins/conductor/scripts/setup-worktree.sh "$ISSUE_ID" &
done
wait

# Spawn workers, send prompts, monitor
# ... see references/wave-execution.md

# Merge and cleanup
plugins/conductor/scripts/completion-pipeline.sh "$READY"

# Check for next wave
NEXT=$(bd ready --json | jq 'length')
[ "$NEXT" -gt 0 ] && echo "Starting next wave..." # LOOP
```

---

## Key Rules

1. **NO USER INPUT** - Fully autonomous, no AskUserQuestion
2. **MAX 4 TERMINALS** - Never spawn more than 4 workers
3. **USE SUBAGENTS** - Workers use Task subagents for parallelization
4. **YOU MUST POLL** - Check issue status every 2 minutes
5. **LOOP UNTIL EMPTY** - Keep running waves until `bd ready` is empty
6. **VISUAL QA** - Spawn tabz-manager after UI waves
7. **MONITOR CONTEXT** - At 70%+, trigger `/wipe:wipe`

---

## Worker Prompt Template

```markdown
## Multi-Issue Worker Task

**MODE: AUTONOMOUS**

Do NOT use AskUserQuestion. Make reasonable defaults.
If blocked, close with 'needs-clarification' and create follow-up.

Issues to complete IN PARALLEL using subagents:
- ISSUE-001: Title
- ISSUE-002: Title

For EACH issue, spawn a Task subagent in ONE message.

Skills: /ui-styling:ui-styling, /frontend-design:frontend-design
```

---

## Context Recovery

**See:** `references/context-recovery.md`

At 70% context, run `/wipe:wipe` with handoff:

```
## BD Swarm Auto In Progress
**Active Issues:** [list in_progress IDs]
**Action:** Run `/conductor:bd-swarm-auto` to continue
```

---

## Auto vs Interactive

| Aspect | Auto | Interactive |
|--------|------|-------------|
| Worker count | All ready | Ask user |
| Waves | Loop until empty | One wave |
| Questions | Make defaults | AskUserQuestion ok |
| Context | Auto /wipe | Manual |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Worker not responding | `tmux capture-pane -t SESSION -p -S -50` |
| Merge conflicts | Resolve manually, continue |
| Worker stuck | Nudge via tmux send-keys |
| Subagent failed | Worker retries or marks for review |

---

## Reference Files

| File | Content |
|------|---------|
| `references/wave-execution.md` | Full 9-step execution details |
| `references/context-recovery.md` | /wipe handoff procedure |

---

Execute this workflow NOW. Start with getting ready issues.
