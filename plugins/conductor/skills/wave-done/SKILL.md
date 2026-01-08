---
name: wave-done
description: "Complete a wave of parallel workers: verify all workers finished, merge branches, run unified review, cleanup worktrees. Invoke with /conductor:wave-done <issue-ids>"
---

# Wave Done - Wave Completion Orchestrator

Orchestrates the completion of a wave of parallel workers spawned by bd-swarm. Handles merge, review, cleanup, and push.

## Usage

```bash
# Complete a wave with specific issues
/conductor:wave-done TabzChrome-abc TabzChrome-def TabzChrome-ghi

# Or use environment variable set by bd-swarm
/conductor:wave-done $WAVE_ISSUES
```

## Pipeline Overview

| Step | Description | Blocking? | Notes |
|------|-------------|-----------|-------|
| 1 | Verify all workers completed | Yes | All issues must be closed |
| 2 | Kill worker sessions | No | Clean termination |
| 3 | Merge branches to main | Yes | Stop on conflicts |
| 4 | Build verification | Yes | Verify merged code builds |
| 5 | Unified code review | Yes | Review all changes together |
| 6 | Cleanup worktrees and branches | No | Remove temporary resources |
| 7 | Visual QA (if UI changes) | Optional | Conductor-level UI verification |
| 8 | Sync and push | Yes | Final push to remote |
| 9 | Audio summary | No | Announce completion |

**Why unified review at wave level:** Workers run individual code reviews, but the conductor does a unified review after merge to catch cross-worker interactions and ensure the combined changes work together.

---

## Execute Pipeline

### Step 1: Verify All Workers Completed

```bash
echo "=== Step 1: Verify Worker Completion ==="

ISSUES="$@"  # From command args or $WAVE_ISSUES
ALL_CLOSED=true

for ISSUE in $ISSUES; do
  STATUS=$(bd show "$ISSUE" --json 2>/dev/null | jq -r '.[0].status // "unknown"')
  if [ "$STATUS" != "closed" ]; then
    echo "BLOCKED: $ISSUE is $STATUS (not closed)"
    ALL_CLOSED=false
  else
    echo "OK: $ISSUE is closed"
  fi
done

if [ "$ALL_CLOSED" != "true" ]; then
  echo ""
  echo "ERROR: Not all issues are closed. Wait for workers to finish or close issues manually."
  exit 1
fi
```

If any issue is not closed -> **STOP**. Wait for workers to complete or investigate why they're stuck.

---

### Step 2: Kill Worker Sessions

```bash
echo "=== Step 2: Kill Worker Sessions ==="

# Option A: From saved session list (if bd-swarm saved it)
if [ -f /tmp/swarm-sessions.txt ]; then
  while read -r SESSION; do
    [[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux kill-session -t "$SESSION"
      echo "Killed session: $SESSION"
    fi
  done < /tmp/swarm-sessions.txt
  rm -f /tmp/swarm-sessions.txt
fi

# Option B: Kill by pattern (fallback)
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  SHORT_ID="${ISSUE##*-}"
  tmux kill-session -t "worker-${ISSUE}" 2>/dev/null && echo "Killed: worker-${ISSUE}" || true
  tmux kill-session -t "worker-${SHORT_ID}" 2>/dev/null && echo "Killed: worker-${SHORT_ID}" || true
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "ctt-worker-${SHORT_ID}-" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null && echo "Killed: $S"
  done || true
done
```

**Important:** Sessions MUST be killed before removing worktrees to release file locks.

---

### Step 3: Merge Branches to Main

```bash
echo "=== Step 3: Merge Branches ==="

cd "$PROJECT_DIR"  # Main project directory (not a worktree)
git checkout main

MERGE_COUNT=0
MERGE_FAILED=""

for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
  BRANCH="feature/${ISSUE}"

  if git merge --no-edit "$BRANCH" 2>/dev/null; then
    echo "Merged: $BRANCH"
    MERGE_COUNT=$((MERGE_COUNT + 1))
  else
    echo "CONFLICT: $BRANCH"
    MERGE_FAILED="$MERGE_FAILED $ISSUE"
    git merge --abort 2>/dev/null || true
  fi
done

if [ -n "$MERGE_FAILED" ]; then
  echo ""
  echo "ERROR: Merge conflicts detected in:$MERGE_FAILED"
  echo "Resolve conflicts manually, then re-run wave-done."
  exit 1
fi

echo "Successfully merged $MERGE_COUNT branches"
```

If merge conflicts -> **STOP**. Resolve manually and re-run.

---

### Step 4: Build Verification

```bash
echo "=== Step 4: Build Verification ==="
```

Run `/conductor:verify-build`. If `passed: false` -> **STOP**, fix errors, re-run.

This verifies the merged code builds correctly with all workers' changes combined.

---

### Step 5: Unified Code Review

```bash
echo "=== Step 5: Unified Code Review ==="
```

Run `/conductor:code-review`. This reviews all merged changes together to catch:
- Cross-worker interactions
- Combined code patterns
- Architectural consistency

**Note:** Each worker already ran code review on their individual changes. This is a final unified review of the combined result.

If blockers found -> **STOP**, fix issues, re-run.

---

### Step 6: Cleanup Worktrees and Branches

```bash
echo "=== Step 6: Cleanup ==="

PROJECT_DIR=$(pwd)
WORKTREE_DIR="${PROJECT_DIR}-worktrees"

for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue

  # Remove worktree
  if [ -d "${WORKTREE_DIR}/${ISSUE}" ]; then
    git worktree remove --force "${WORKTREE_DIR}/${ISSUE}" 2>/dev/null || true
    echo "Removed worktree: ${ISSUE}"
  fi

  # Delete feature branch
  git branch -d "feature/${ISSUE}" 2>/dev/null && echo "Deleted branch: feature/${ISSUE}" || true
done

# Remove worktrees dir if empty
rmdir "$WORKTREE_DIR" 2>/dev/null || true
```

---

### Step 7: Visual QA (Optional - UI Changes Only)

If the wave included UI changes (React components, CSS, dashboard updates):

```bash
echo "=== Step 7: Visual QA ==="
```

Spawn tabz-manager subagent for visual verification:

```
Task(subagent_type="conductor:tabz-manager",
     prompt="Visual QA after wave merge.
       1. Start dev server if needed
       2. Screenshot key UI areas at 1920x1080
       3. Check browser console for errors
       4. Verify all merged UI changes render correctly
       5. Create beads issues for any visual bugs found")
```

**Skip this step if:**
- Wave was backend-only
- Wave was config/docs changes only
- No UI components were modified

---

### Step 8: Sync and Push

```bash
echo "=== Step 8: Sync and Push ==="

# Commit any wave-level changes (if build/review made fixes)
if ! git diff --quiet HEAD; then
  git add -A
  git commit -m "chore: wave completion fixes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
fi

# Sync beads and push
bd sync
git push origin main

echo "Pushed to main"
```

---

### Step 9: Audio Summary

```bash
echo "=== Step 9: Summary ==="

AUDIO_TEXT="Wave complete. $MERGE_COUNT branches merged and pushed to main."
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$AUDIO_TEXT" '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &

echo ""
echo "=== Wave Complete ==="
echo "Merged: $MERGE_COUNT branches"
echo "Issues closed: $(echo $ISSUES | wc -w)"
echo ""
echo "Next steps:"
echo "  bd ready          # Check for next wave"
echo "  bd stats          # View project health"
```

---

## Error Handling

| Step | On Failure | Recovery |
|------|------------|----------|
| Worker verification | Show which issues not closed | Wait for workers or investigate |
| Session kill | Continue - non-blocking | Manual tmux cleanup if needed |
| Merge | Show conflicts, abort | Resolve conflicts manually |
| Build | Show errors | Fix build, re-run wave-done |
| Review | Show blockers | Fix issues, re-run wave-done |
| Cleanup | Continue - best effort | Manual worktree/branch cleanup |
| Visual QA | Log findings | Create beads issues for bugs |
| Push | Show git errors | Manual push after fixing |

---

## Re-running After Fixes

If the pipeline stopped at merge, build, or review:

1. Fix the issues in the main branch
2. Re-run `/conductor:wave-done <issues>`

The pipeline will skip already-completed steps (sessions already killed, worktrees already cleaned).

---

## Using completion-pipeline.sh

For automated cleanup without the full review pipeline:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "ISSUE1 ISSUE2 ISSUE3"
```

This script handles: kill sessions -> merge -> cleanup -> audio notification.

Use wave-done for the full pipeline with unified review. Use completion-pipeline.sh for quick cleanup.

---

## Checklist After Wave-Done

Verify completion:

```bash
# No leftover worker sessions
tmux list-sessions | grep -E "worker-|ctt-worker" && echo "WARN: Sessions remain"

# No leftover worktrees
ls ${PROJECT_DIR}-worktrees/ 2>/dev/null && echo "WARN: Worktrees remain"

# No orphaned feature branches
git branch | grep "feature/" && echo "WARN: Branches remain"

# Check for next wave
bd ready
```

---

## Next Wave

After wave-done completes:

```bash
# Check if more work is ready
NEXT_COUNT=$(bd ready --json | jq 'length')

if [ "$NEXT_COUNT" -gt 0 ]; then
  echo "$NEXT_COUNT issues ready for next wave"
  # Run /conductor:bd-swarm for next wave
else
  echo "Backlog complete!"
fi
```

For fully autonomous operation, use `/conductor:bd-swarm-auto` which loops waves automatically.
