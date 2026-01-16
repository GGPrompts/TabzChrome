---
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

## Prerequisites (Execute Now)

**Invoke orchestration skill** to load spawn patterns and tmux commands:

```
Run `/conductor:orchestration` to load spawn patterns.
```

Skip only if already loaded this session or running as `--agent conductor:conductor`.

---

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

3. **Set CONDUCTOR_SESSION (REQUIRED for notifications):**
   ```bash
   CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
   echo "Conductor session: $CONDUCTOR_SESSION"
   ```

4. **Spawn workers (max 4):**
   ```bash
   TOKEN=$(cat /tmp/tabz-auth-token)
   for ISSUE_ID in $(bd ready --json | jq -r '.[].id' | head -4); do
     WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"
     # BD_SOCKET isolates beads daemon, CONDUCTOR_SESSION enables notifications
     RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
       -H "Content-Type: application/json" \
       -H "X-Auth-Token: $TOKEN" \
       -d "{\"name\": \"worker-$ISSUE_ID\", \"workingDir\": \"$WORKTREE\", \"command\": \"BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions\"}")
     SESSION=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession')
     echo "Spawned $ISSUE_ID -> $SESSION"
   done
   ```

5. **Craft prompts via engineering-prompts:**
   ```
   Skill(skill: "conductor:engineering-prompts")
   ```
   Then execute its workflow:
   - Spawn parallel Explore agents (haiku) per issue via Task tool
   - Explore agents return only summaries (context efficient)
   - Synthesize into detailed prompts with file paths and patterns
   - Each prompt ends with `/conductor:worker-done <issue-id>`

6. **Monitor and loop:**
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
