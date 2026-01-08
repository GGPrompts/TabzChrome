---
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

**YOU are the conductor. Execute this workflow autonomously. Do NOT ask the user for input.**

## Execute Now

1. **Check ready issues:**
   ```bash
   bd ready --json | jq -r '.[] | "\(.id): \(.title)"'
   ```
   If empty, announce "Backlog complete!" and stop.

2. **Create worktrees in parallel:**
   ```bash
   PROJECT_DIR=$(pwd)
   WORKTREE_DIR="${PROJECT_DIR}-worktrees"
   mkdir -p "$WORKTREE_DIR"

   for ISSUE_ID in $(bd ready --json | jq -r '.[].id'); do
     ${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE_ID" &
   done
   wait
   ```

3. **Spawn workers (max 4):**
   ```bash
   TOKEN=$(cat /tmp/tabz-auth-token)
   for ISSUE_ID in $(bd ready --json | jq -r '.[].id' | head -4); do
     WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"
     RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
       -H "Content-Type: application/json" \
       -H "X-Auth-Token: $TOKEN" \
       -d "{\"name\": \"worker-$ISSUE_ID\", \"workingDir\": \"$WORKTREE\", \"command\": \"claude --dangerously-skip-permissions\"}")
     SESSION=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession')
     echo "Spawned $ISSUE_ID -> $SESSION"
   done
   ```

4. **Send skill-aware prompts:**
   For each worker, send a prompt with:
   - Issue context from `bd show`
   - Skill hint based on issue keywords (terminal→`/xterm-js:xterm-js`, UI→`/ui-styling:ui-styling`, etc.)
   - Completion command: `/conductor:worker-done <issue-id>`

5. **Monitor and loop:**
   - Poll `${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --summary` every 2 min
   - When all issues closed, run completion pipeline
   - Check `bd ready` - if more issues, start next wave

## Key Rules

- **NO USER INPUT** - Make reasonable defaults, never AskUserQuestion
- **MAX 4 TERMINALS** - Distribute issues across workers
- **MONITOR CONTEXT** - At 70%+, trigger `/wipe:wipe` with handoff
- **LOOP UNTIL EMPTY** - Keep running waves until backlog clear

## Full Details

See skill: `/conductor:bd-swarm-auto` for complete workflow reference.
