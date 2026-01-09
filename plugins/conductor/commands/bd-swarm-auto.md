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

2. **VERIFY available skills (MANDATORY):**
   ```bash
   # Get list of actually available skills - ONLY use these in prompts
   ${CLAUDE_PLUGIN_ROOT}/scripts/match-skills.sh --available-full
   ```
   Save this output. Only include skills that appear here in worker prompts.
   MCP tools (shadcn/*, tabz/*) are NOT skills - they're called directly via `mcp-cli`.

4. **Create worktrees in parallel:**
   ```bash
   PROJECT_DIR=$(pwd)
   WORKTREE_DIR="${PROJECT_DIR}-worktrees"
   mkdir -p "$WORKTREE_DIR"

   for ISSUE_ID in $(bd ready --json | jq -r '.[].id'); do
     ${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE_ID" &
   done
   wait
   ```

5. **Spawn workers (max 4):**
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

6. **Send skill-aware prompts (ONLY verified skills):**
   For each worker, send a prompt with:
   - Issue context from `bd show`
   - Skill hints: ONLY skills from step 2's `--available-full` output
     ```bash
     # Read skill hints AND verify availability
     MATCH_SCRIPT="${CLAUDE_PLUGIN_ROOT:-./plugins/conductor}/scripts/match-skills.sh"
     SKILL_HINTS=$($MATCH_SCRIPT --verify --issue "$ISSUE_ID")
     ```
   - If no skills match, omit the "Skills to Load" section entirely
   - Completion command: `/conductor:worker-done <issue-id>`

7. **Monitor and loop:**
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
