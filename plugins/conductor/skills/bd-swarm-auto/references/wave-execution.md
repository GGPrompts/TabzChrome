# Wave Execution - BD Swarm Auto

Detailed step-by-step wave execution for autonomous backlog processing.

## Step 1: Get Ready Issues

```bash
bd ready --json | jq -r '.[] | "\(.id): \(.title)"'
```

If empty, announce "Backlog complete!" and stop.

Store the issue IDs and count them.

## Step 2: Calculate Worker Distribution

Determine how many terminal workers to spawn (max 4):

```
Issues: 1-4   -> 1-2 workers (1-2 issues each)
Issues: 5-8   -> 2-3 workers (2-3 issues each)
Issues: 9-12  -> 3-4 workers (3 issues each)
Issues: 13+   -> 4 workers (batch remaining)
```

Example for 10 issues:
- Worker 1: SAAS-001, SAAS-002, SAAS-003
- Worker 2: SAAS-004, SAAS-005, SAAS-006
- Worker 3: SAAS-007, SAAS-008
- Worker 4: SAAS-009, SAAS-010

## Step 3: Create Worktrees

```bash
PROJECT_DIR=$(pwd)
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
mkdir -p "$WORKTREE_DIR"

# For each ISSUE_ID, run in parallel:
for ISSUE_ID in <all-issue-ids>; do
  (
    WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"
    git worktree add "$WORKTREE" -b "feature/${ISSUE_ID}" 2>/dev/null || git worktree add "$WORKTREE" HEAD
    echo "Created: $ISSUE_ID"
  ) &
done
wait
```

**WAIT for ALL worktrees to be ready before Step 4.**

## Step 4: Spawn Terminal Workers

Spawn only 3-4 terminal workers, NOT one per issue:

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
WORKER_NUM=1  # 1, 2, 3, or 4

curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "$(jq -n \
    --arg name "worker-${WORKER_NUM}" \
    --arg dir "$PROJECT_DIR" \
    --arg cmd "claude --dangerously-skip-permissions" \
    '{name: $name, workingDir: $dir, command: $cmd}')"
```

Repeat for each worker (max 4). Save session names.

## Step 5: Send Multi-Issue Prompts

Wait 5 seconds for Claude to initialize, then send each worker its batch:

```bash
SESSION="<session-name>"
sleep 5

tmux send-keys -t "$SESSION" -l "## Multi-Issue Worker Task

**MODE: AUTONOMOUS**

Do NOT use AskUserQuestion. Make reasonable defaults for any ambiguity.
If truly blocked, close issue with reason 'needs-clarification' and create follow-up.

You are responsible for completing these issues IN PARALLEL using subagents:

<ISSUE_LIST>
- SAAS-001: Title 1
- SAAS-002: Title 2
- SAAS-003: Title 3
</ISSUE_LIST>

## CRITICAL: Use Task Subagents for Parallelization

For EACH issue, spawn a dedicated subagent in a SINGLE message with multiple Task tool calls.

## After All Subagents Complete

1. Verify all assigned issues are closed
2. Report completion to conductor

## Skills Available
- /ui-styling:ui-styling - For UI components
- /frontend-design:frontend-design - For polished designs"

sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

## Step 6: Poll Until All Issues Closed

**YOU must poll every 2 minutes. Do NOT wait for user input.**

```bash
while true; do
  echo "[$(date '+%H:%M')] Checking issue status..."

  ALL_CLOSED=true
  CLOSED_COUNT=0
  TOTAL_COUNT=<number-of-issues>

  for ISSUE_ID in <all-issue-ids>; do
    STATUS=$(bd show "$ISSUE_ID" --json | jq -r '.[0].status')
    if [ "$STATUS" = "closed" ]; then
      CLOSED_COUNT=$((CLOSED_COUNT + 1))
    else
      ALL_CLOSED=false
    fi
  done

  echo "Progress: $CLOSED_COUNT/$TOTAL_COUNT closed"

  if [ "$ALL_CLOSED" = "true" ]; then
    echo "All issues closed! Proceeding to merge."
    break
  fi

  echo "Waiting 2 minutes before next poll..."
  sleep 120
done
```

## Step 7: Kill Sessions and Merge

```bash
# Kill worker sessions (only 3-4 to kill)
for SESSION in <worker-session-names>; do
  tmux kill-session -t "$SESSION" 2>/dev/null
  echo "Killed: $SESSION"
done

# Merge each feature branch
cd "$PROJECT_DIR"
for ISSUE_ID in <all-issue-ids>; do
  git merge --no-edit "feature/${ISSUE_ID}" || {
    git checkout --theirs . 2>/dev/null
    git add -A
    git commit -m "feat: merge ${ISSUE_ID}" || true
  }
done

# Cleanup
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
for ISSUE_ID in <all-issue-ids>; do
  git worktree remove --force "${WORKTREE_DIR}/${ISSUE_ID}" 2>/dev/null
  git branch -d "feature/${ISSUE_ID}" 2>/dev/null
done
rmdir "$WORKTREE_DIR" 2>/dev/null

# Audio announcement
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Wave complete. Branches merged.", "voice": "en-GB-SoniaNeural", "priority": "high"}' &
```

## Step 8: Visual QA (After UI Waves)

If wave included UI changes, spawn tabz-manager subagent:

```
Task(subagent_type="conductor:tabz-manager",
     prompt="Visual QA after wave completion.
       1. Start dev server: npm run dev
       2. Screenshot at 1920x1080
       3. Check console for errors
       4. Create beads issues for bugs found
       5. Kill dev server when done")
```

**Skip if wave was backend/config only.**

## Step 9: Sync and Check Next Wave

```bash
bd sync
git push origin main 2>/dev/null || echo "Push skipped"

NEXT_COUNT=$(bd ready --json | jq 'length')
echo "Next wave: $NEXT_COUNT issues ready"
```

**If more issues ready, GO BACK TO STEP 1.**

**If no more issues, announce completion:**

```bash
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Backlog complete! All waves finished.", "voice": "en-GB-SoniaNeural", "priority": "high"}' &

echo "=== BD SWARM AUTO COMPLETE ==="
```
