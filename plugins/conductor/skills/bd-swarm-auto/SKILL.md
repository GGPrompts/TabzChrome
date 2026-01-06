---
name: bd-swarm-auto
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

**YOU are the conductor. Execute this workflow autonomously. Do NOT ask the user for input.**

## Architecture: Fewer Terminals, More Subagents

To avoid overwhelming the statusline/state tracker, we spawn **3-4 terminal workers max**, each handling multiple issues via internal Task subagents.

```
BAD:  10 terminals × 1 issue each    → statusline flicker chaos
GOOD: 3 terminals × 3-4 subagents each → smooth parallel execution
```

---

## EXECUTE NOW - Wave Loop

Repeat this loop until `bd ready` returns empty:

---

### STEP 1: Get Ready Issues

Run this command NOW:

```bash
bd ready --json | jq -r '.[] | "\(.id): \(.title)"'
```

If empty, announce "Backlog complete!" and stop.

Store the issue IDs and count them.

---

### STEP 2: Calculate Worker Distribution

Determine how many terminal workers to spawn (max 4):

```
Issues: 1-4   → 1-2 workers (1-2 issues each)
Issues: 5-8   → 2-3 workers (2-3 issues each)
Issues: 9-12  → 3-4 workers (3 issues each)
Issues: 13+   → 4 workers (batch remaining)
```

Assign issues to workers. Example for 10 issues:
- Worker 1: SAAS-001, SAAS-002, SAAS-003
- Worker 2: SAAS-004, SAAS-005, SAAS-006
- Worker 3: SAAS-007, SAAS-008
- Worker 4: SAAS-009, SAAS-010

---

### STEP 3: Create Worktrees (Run in Parallel)

For EACH ready issue, create a worktree:

```bash
PROJECT_DIR=$(pwd)
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
mkdir -p "$WORKTREE_DIR"

# For each ISSUE_ID from Step 1, run in parallel:
for ISSUE_ID in <all-issue-ids>; do
  (
    WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"
    git worktree add "$WORKTREE" -b "feature/${ISSUE_ID}" 2>/dev/null || git worktree add "$WORKTREE" HEAD
    echo "Created: $ISSUE_ID"
  ) &
done
wait

# Install deps in main worktree only (workers will use it as reference)
```

**WAIT for ALL worktrees to be ready before Step 4.**

---

### STEP 4: Spawn Terminal Workers (MAX 4)

Spawn only 3-4 terminal workers, NOT one per issue:

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
WORKER_NUM=1  # 1, 2, 3, or 4

# Spawn worker
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

---

### STEP 5: Send Multi-Issue Prompts to Workers

Wait 5 seconds for Claude to initialize, then send each worker its batch of issues:

```bash
SESSION="<session-name>"
# ISSUES assigned to this worker (e.g., "SAAS-001 SAAS-002 SAAS-003")

sleep 5

tmux send-keys -t "$SESSION" -l "## Multi-Issue Worker Task

You are responsible for completing these issues IN PARALLEL using subagents:

<ISSUE_LIST>
- SAAS-001: Title 1
- SAAS-002: Title 2
- SAAS-003: Title 3
</ISSUE_LIST>

## CRITICAL: Use Task Subagents for Parallelization

For EACH issue, spawn a dedicated subagent. Do this in a SINGLE message with multiple Task tool calls:

\`\`\`
Use the Task tool multiple times in ONE message:

Task 1:
  subagent_type: 'general-purpose'
  prompt: |
    Complete issue SAAS-001: [title]

    Description: [description]
    Worktree: ${WORKTREE_DIR}/SAAS-001

    Steps:
    1. cd to the worktree
    2. Implement the feature
    3. Run: npm run build
    4. Commit changes
    5. Run: bd close SAAS-001

Task 2:
  subagent_type: 'general-purpose'
  prompt: |
    Complete issue SAAS-002: [title]
    ...

Task 3:
  subagent_type: 'general-purpose'
  prompt: |
    Complete issue SAAS-003: [title]
    ...
\`\`\`

## After All Subagents Complete

1. Verify all assigned issues are closed: bd show SAAS-001 SAAS-002 SAAS-003
2. Report completion to conductor

## Skills Available
- /ui-styling:ui-styling - For UI components
- /frontend-design:frontend-design - For polished designs"

sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

---

### STEP 6: Poll Workers Until All Issues Closed

**YOU must poll every 2 minutes. Do NOT wait for user input.**

**ALSO: Check your context % each poll. If 70%+, run `/wipe:wipe` immediately.**

Run this loop:

```bash
while true; do
  echo "[$(date '+%H:%M')] Checking issue status..."

  # Check if ALL issues from this wave are closed
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

---

### STEP 7: Kill Sessions and Merge

Once all issues are closed:

```bash
# Kill worker sessions (only 3-4 to kill, not 10+)
for SESSION in <worker-session-names>; do
  tmux kill-session -t "$SESSION" 2>/dev/null
  echo "Killed: $SESSION"
done

# Merge each feature branch
cd "$PROJECT_DIR"
for ISSUE_ID in <all-issue-ids>; do
  git merge --no-edit "feature/${ISSUE_ID}" && echo "Merged: feature/${ISSUE_ID}" || {
    # Handle conflicts by taking theirs for new files
    git checkout --theirs . 2>/dev/null
    git add -A
    git commit -m "feat: merge ${ISSUE_ID}" || true
  }
done

# Cleanup worktrees and branches
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

---

### STEP 8: Visual QA via tabz-manager (After UI Waves)

**If this wave included UI/visual changes**, spawn tabz-manager as a subagent to validate:

```
Use the Task tool:
  subagent_type: "conductor:tabz-manager"
  prompt: |
    Visual QA after wave completion.

    1. Start the dev server: npm run dev (wait for it to be ready)
    2. Open http://localhost:3000 in browser
    3. Screenshot at desktop viewport (1920x1080)
    4. Check browser console for errors (tabz_get_console_logs)
    5. Navigate to any new pages added this wave and screenshot those too
    6. Kill the dev server when done

    If you find visual bugs or console errors:
    - Create beads issues with: bd create --title "Bug: <description>" --type bug --priority 2
    - These will be picked up in a future wave

    Report what you found.
```

**Skip this step if the wave was only backend/config changes.**

---

### STEP 9: Sync and Check for Next Wave

```bash
bd sync
git push origin main 2>/dev/null || echo "Push skipped (no remote or auth)"

# Check for more ready issues
NEXT_COUNT=$(bd ready --json | jq 'length')
echo "Next wave: $NEXT_COUNT issues ready"
```

**If more issues are ready, GO BACK TO STEP 1.**

**If no more issues, announce completion:**

```bash
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Backlog complete! All waves finished.", "voice": "en-GB-SoniaNeural", "priority": "high"}' &

echo "=== BD SWARM AUTO COMPLETE ==="
```

---

## Key Rules

1. **NO USER INPUT** - This is fully autonomous. Do not use AskUserQuestion.
2. **MAX 4 TERMINALS** - Never spawn more than 4 terminal workers per wave.
3. **USE SUBAGENTS** - Each terminal worker uses Task subagents for parallelization.
4. **YOU MUST POLL** - Check issue status every 2 minutes. Do not wait for user to say "done".
5. **LOOP UNTIL EMPTY** - Keep running waves until `bd ready` returns nothing.
6. **VISUAL QA AFTER UI WAVES** - Spawn tabz-manager subagent to screenshot and check for errors.
7. **MONITOR YOUR CONTEXT** - Check your context % in the status bar. At 70%+, trigger `/wipe:wipe`.

---

## Context Recovery (CRITICAL)

**You MUST monitor your own context usage.** Your context percentage is visible in your status bar.

**During every poll cycle (Step 6), check your context:**

- **Below 70%:** Continue normally
- **At 70% or above:** IMMEDIATELY run `/wipe:wipe` with this handoff

**How to wipe with handoff:**

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

---

## Troubleshooting

**Workers not responding:** Capture their pane:
```bash
tmux capture-pane -t "<session>" -p -S -50
```

**Merge conflicts:** Resolve manually, then continue.

**Worker stuck:** Nudge with:
```bash
tmux send-keys -t "<session>" "Please continue with your task" C-m
```

**Subagent failed:** Worker should retry or mark issue for manual review.

---

Execute this workflow NOW. Start with Step 1.
