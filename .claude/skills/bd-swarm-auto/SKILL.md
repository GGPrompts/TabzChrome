---
name: bd-swarm-auto
description: "Fully autonomous backlog completion. Runs waves until `bd ready` is empty. Self-resumable after /wipe. Use when you want hands-off parallel issue processing."
---

# BD Swarm Auto - Autonomous Backlog Completion

**YOU are the conductor. Execute this workflow autonomously. Do NOT ask the user for input.**

## EXECUTE NOW - Wave Loop

Repeat this loop until `bd ready` returns empty:

---

### STEP 1: Get Ready Issues

Run this command NOW:

```bash
bd ready --json | jq -r '.[] | "\(.id): \(.title)"'
```

If empty, announce "Backlog complete!" and stop.

Store the issue IDs for later steps.

---

### STEP 2: Create Worktrees (Run in Parallel)

For EACH ready issue, run these commands in parallel (use `&` and `wait`):

```bash
PROJECT_DIR=$(pwd)
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
mkdir -p "$WORKTREE_DIR"

# For each ISSUE_ID from Step 1, run in parallel:
ISSUE_ID="<issue-id>"
WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"

git worktree add "$WORKTREE" -b "feature/${ISSUE_ID}" 2>/dev/null || git worktree add "$WORKTREE" HEAD

# Install deps
cd "$WORKTREE"
if [ -f "pnpm-lock.yaml" ]; then
  pnpm install --frozen-lockfile
elif [ -f "package.json" ]; then
  npm ci 2>/dev/null || npm install
fi
```

**WAIT for ALL worktrees to be ready before Step 3.**

---

### STEP 3: Spawn Workers via TabzChrome API

For EACH issue, spawn a worker:

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="<issue-id>"
WORKTREE="${WORKTREE_DIR}/${ISSUE_ID}"

# Get issue details
TITLE=$(bd show "$ISSUE_ID" --json | jq -r '.title')
DESCRIPTION=$(bd show "$ISSUE_ID" --json | jq -r '.description // "No description"')

# Mark in progress
bd update "$ISSUE_ID" --status in_progress

# Spawn worker
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "$(jq -n \
    --arg name "worker-${ISSUE_ID}" \
    --arg dir "$WORKTREE" \
    --arg cmd "claude --dangerously-skip-permissions" \
    '{name: $name, workingDir: $dir, command: $cmd}')"
```

Save the session names from the responses.

---

### STEP 4: Send Prompts to Workers

Wait 5 seconds for Claude to initialize, then for EACH worker session:

```bash
SESSION="<session-name-from-step-3>"
ISSUE_ID="<issue-id>"
TITLE="<title>"
DESCRIPTION="<description>"

sleep 5

# Send the prompt
tmux send-keys -t "$SESSION" -l "## Task
${ISSUE_ID}: ${TITLE}

${DESCRIPTION}

## CRITICAL: Use Subagents Aggressively

You MUST spawn 4-5 subagents in parallel for this task. This is a demo showcasing mass parallelization.

**Launch these subagents simultaneously (single message with multiple Task calls):**

1. **Explore agent** - Explore the codebase structure and find relevant files
2. **Explore agent** - Search for similar implementations to reference
3. **Plan agent** - Create detailed implementation plan for: ${TITLE}
4. **Explore agent** - Identify all files to modify or create

**Do this FIRST before any implementation.**

## After Subagents Complete

1. Synthesize findings from all subagents
2. Implement the solution
3. Build and verify: npm run build
4. Run: /conductor:worker-done ${ISSUE_ID}

## Skills (invoke explicitly)
- /ui-styling:ui-styling - For UI components
- /frontend-design:frontend-design - For polished designs"

sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

---

### STEP 5: Launch Tmuxplexer Monitor

**DO THIS NOW** - Spawn the monitor in a background window:

```bash
plugins/conductor/scripts/monitor-workers.sh --spawn
```

If that script doesn't exist, use:

```bash
tmux new-window -n "monitor" "tmuxplexer --watcher"
```

---

### STEP 6: Poll Workers Until All Issues Closed

**YOU must poll every 2 minutes. Do NOT wait for user input.**

**ALSO: Check your context % each poll. If 70%+, run `/wipe:wipe` immediately (see Context Recovery section).**

Run this loop:

```bash
while true; do
  echo "[$(date '+%H:%M')] Checking worker status..."

  # Get summary from monitor script or directly
  plugins/conductor/scripts/monitor-workers.sh --summary 2>/dev/null || \
    tmux list-sessions -F '#{session_name}' | grep -E "worker-|ctt-" | wc -l

  # Check if ALL issues from this wave are closed
  ALL_CLOSED=true
  for ISSUE_ID in <list-of-issue-ids>; do
    STATUS=$(bd show "$ISSUE_ID" --json | jq -r '.status')
    echo "  $ISSUE_ID: $STATUS"
    if [ "$STATUS" != "closed" ]; then
      ALL_CLOSED=false
    fi
  done

  if [ "$ALL_CLOSED" = "true" ]; then
    echo "All issues closed! Proceeding to merge."
    break
  fi

  # >>> CHECK YOUR CONTEXT % HERE <<<
  # Look at your status bar or tmuxplexer. If 70%+, run /wipe:wipe with handoff NOW.

  echo "Waiting 2 minutes before next poll..."
  sleep 120
done
```

**IMPORTANT:**
- Do NOT skip this polling
- Do NOT ask the user if workers are done - YOU must check
- Do NOT ignore your context % - run `/wipe:wipe` at 70%

---

### STEP 7: Kill Sessions and Merge

Once all issues are closed:

```bash
# Kill worker sessions
for SESSION in <session-names>; do
  tmux kill-session -t "$SESSION" 2>/dev/null
  echo "Killed: $SESSION"
done

# Merge each feature branch
cd "$PROJECT_DIR"
for ISSUE_ID in <issue-ids>; do
  git merge --no-edit "feature/${ISSUE_ID}" && echo "Merged: feature/${ISSUE_ID}"
done

# Cleanup worktrees and branches
for ISSUE_ID in <issue-ids>; do
  git worktree remove --force "${WORKTREE_DIR}/${ISSUE_ID}" 2>/dev/null
  git branch -d "feature/${ISSUE_ID}" 2>/dev/null
done

# Audio announcement
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Wave complete. Branches merged.", "voice": "en-GB-SoniaNeural", "priority": "high"}' &
```

---

### STEP 8: Sync and Check for Next Wave

```bash
bd sync
git push origin main

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
2. **YOU MUST POLL** - Check issue status every 2 minutes. Do not wait for user to say "done".
3. **USE TMUXPLEXER** - Launch the monitor so you can see worker activity.
4. **LOOP UNTIL EMPTY** - Keep running waves until `bd ready` returns nothing.
5. **MONITOR YOUR CONTEXT** - Check your context % in the status bar or tmuxplexer. At 70%+, trigger `/wipe:wipe`.

---

## Context Recovery (CRITICAL)

**You MUST monitor your own context usage.** Your context percentage is visible in:
- Your status bar (e.g., "45% ctx")
- Tmuxplexer monitor (shows YOUR session too, not just workers)

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

**Action Required:** Run `/bd-swarm-auto` to continue.

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

---

Execute this workflow NOW. Start with Step 1.
