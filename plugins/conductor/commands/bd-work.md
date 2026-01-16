---
description: "Pick the top ready beads issue and spawn a visible worker to complete it"
---

# Beads Work - Single Issue Worker

Spawn a visible worker to tackle one beads issue. Unlike bd-swarm, no worktree is created since there's only one worker.

## Before Starting: Create Todo List

**Use TodoWrite to track workflow progress.** This ensures no steps are missed:

```
1. Select issue (bd ready or provided ID)
2. Get issue details (bd show)
3. Craft prompt (engineering-prompts skill)
4. Set CONDUCTOR_SESSION
5. Spawn worker
6. Send prompt
7. Monitor completion
```

Mark each step as `in_progress` when starting and `completed` when done.

## Prerequisites

**First, load orchestration context** (spawn patterns, tmux commands):
```
/conductor:orchestration
```
Skip if already loaded or running as `--agent conductor:conductor`.

## Quick Start

```bash
/conductor:bd-work              # Pick top priority ready issue
/conductor:bd-work TabzChrome-abc  # Work on specific issue
```

---

## Workflow

```
1. Select issue       →  bd ready (pick top) or use provided ID
2. Get issue details  →  bd show <id>
3. Craft prompt       →  /conductor:engineering-prompts (forked context)
4. Spawn worker       →  TabzChrome API (no worktree)
5. Send prompt        →  tmux send-keys
6. User watches       →  Worker visible in sidebar
```

---

## Phase 1: Select Issue

```bash
# If no ID provided, get top ready issue
bd ready --json | jq -r '.[0]'

# Get full issue details
bd show <id>
```

---

## Phase 2: Craft Prompt

Use the engineering-prompts skill to craft a context-rich prompt:

```bash
/conductor:engineering-prompts
```

This runs in **forked context** and:
1. Spawns parallel haiku Explore agents
2. Gathers file paths, patterns, dependencies
3. Returns a ready-to-use prompt

**Skills auto-activate** via UserPromptSubmit hook - no manual skill matching needed.

The generated prompt follows this structure:

```markdown
## Task: ISSUE-ID - Title
[Explicit, actionable description]

## Context
[Background and WHY - gathered via exploration]

## Key Files
- /path/to/file.ts:45-60 - [what's relevant]
- /path/to/pattern.ts:120 - [pattern to follow]

## Approach
[Implementation guidance based on codebase patterns]

Use subagents in parallel for exploration, testing, and multi-file analysis.

## When Done
Run `/conductor:worker-done ISSUE-ID`
```

**The `/conductor:worker-done` instruction is mandatory** - without it, workers don't know how to signal completion.

---

## Phase 5: Spawn Worker

First, get the conductor's tmux session name:
```bash
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
```

Then spawn the worker with `CONDUCTOR_SESSION` env var:
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="<issue-id>"
PROJECT_DIR=$(pwd)

RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"$ISSUE_ID-worker\", \"workingDir\": \"$PROJECT_DIR\", \"command\": \"CONDUCTOR_SESSION=$CONDUCTOR_SESSION claude --dangerously-skip-permissions\"}")

# Response: {"success":true,"terminal":{"id":"ctt-xxx","ptyInfo":{"tmuxSession":"ctt-xxx"}}}
SESSION=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession')
echo "Spawned: $SESSION"

# Record session IDs in beads for audit trail
bd update "$ISSUE_ID" --notes "conductor_session: $CONDUCTOR_SESSION
worker_session: $SESSION
started_at: $(date -Iseconds)"
```

**Why CONDUCTOR_SESSION?** When worker runs `/conductor:worker-done`, it sends a completion notification back to the conductor via tmux. No polling needed - push-based.

**Why record session IDs?** Enables later audit of which Claude session worked on which issue. Can review chat histories to improve prompts/workflows.

**No worktree needed** - single worker, no conflict risk.

---

## Phase 6: Send Prompt

Wait for Claude to load (~8 seconds), then send using `$SESSION` from Phase 5:

```bash
sleep 8
tmux send-keys -t "$SESSION" -l "<crafted-prompt>"
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

---

## Phase 7: Monitor

User watches worker progress in TabzChrome sidebar. Worker will:
1. Read issue details
2. Explore codebase as needed
3. Implement the fix/feature
4. Run `/conductor:worker-done <issue-id>`

---

## Cleanup

After worker completes:

```bash
# Kill the worker session (use $SESSION from Phase 5)
tmux kill-session -t "$SESSION"
```

---

## Comparison with bd-swarm

| Aspect | bd-work | bd-swarm |
|--------|---------|----------|
| Workers | 1 | Multiple |
| Worktree | No | Yes (per worker) |
| Conflict risk | None | Managed via isolation |
| Use case | Single issue focus | Batch parallel processing |
| Cleanup | Just kill session | Merge branches + cleanup |

---

## Notes

- Conductor crafts the prompt, worker executes
- Worker is visible in TabzChrome sidebar
- No worktree = simpler cleanup
- Worker completes with `/conductor:worker-done`

Execute this workflow now.
