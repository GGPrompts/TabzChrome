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
| 1.5 | Review worker discoveries | No | Check for untracked TODOs, list discovered-from issues |
| 2 | Capture transcripts and kill sessions | No | Save session output for analysis, then terminate |
| 3 | Merge branches to main | Yes | Stop on conflicts |
| 4 | Build verification | Yes | Verify merged code builds |
| 5 | Unified code review | Yes | Review all changes together |
| 6 | Cleanup worktrees and branches | No | Remove temporary resources |
| 7 | Visual QA (if UI changes) | Optional | Conductor-level UI verification |
| 8 | Sync and push | Yes | Final push to remote |
| 9 | Audio summary | No | Announce completion |

**Why unified review at wave level:** Workers do NOT run code review (to avoid conflicts when running in parallel). The conductor does the sole code review after merge, catching cross-worker interactions and ensuring the combined changes work together.

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

### Step 1.5: Review Worker Discoveries (Before Killing Sessions)

**IMPORTANT:** Before killing sessions, check if workers tracked their discoveries.

```bash
echo "=== Step 1.5: Review Worker Discoveries ==="

# Check for issues with discovered-from links to wave issues
for ISSUE in $ISSUES; do
  # Find issues that were discovered from this issue
  DISCOVERIES=$(bd list --all --json 2>/dev/null | jq -r --arg parent "$ISSUE" '.[] | select(.depends_on[]? | contains("discovered-from") and contains($parent)) | .id' 2>/dev/null)

  if [ -n "$DISCOVERIES" ]; then
    echo "Discoveries from $ISSUE:"
    echo "$DISCOVERIES" | while read -r DISC; do
      [ -z "$DISC" ] && continue
      TITLE=$(bd show "$DISC" --json 2>/dev/null | jq -r '.[0].title // "?"')
      echo "  - $DISC: $TITLE"
    done
  fi
done

# Check for TODOs in worker branches that should have been tracked
echo ""
echo "Checking for untracked TODOs in worker changes..."
for ISSUE in $ISSUES; do
  BRANCH="feature/${ISSUE}"
  if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    TODOS=$(git diff main.."$BRANCH" 2>/dev/null | grep -E "^\+.*TODO|^\+.*FIXME|^\+.*HACK" | head -5)
    if [ -n "$TODOS" ]; then
      echo "WARNING: Untracked TODOs in $BRANCH:"
      echo "$TODOS"
      echo "Consider creating follow-up issues with: bd create --title 'TODO: ...' && bd dep add <new-id> discovered-from $ISSUE"
    fi
  fi
done
```

This step:
- Lists issues discovered-from wave issues (shows workers tracked discoveries)
- Warns about TODOs in worker changes that may need issues
- Gives conductor a chance to create missing follow-ups before session context is lost

**If critical discoveries are missing:** Pause here, review worker session output via `tmux capture-pane`, then create issues manually with `discovered-from` links.

---

### Step 2: Capture Transcripts and Kill Sessions

```bash
echo "=== Step 2: Capture Transcripts and Kill Sessions ==="

CAPTURE_SCRIPT="${CLAUDE_PLUGIN_ROOT:-./plugins/conductor}/scripts/capture-session.sh"

# Helper function to capture and kill
capture_and_kill() {
  local SESSION="$1"
  local ISSUE="$2"

  # Capture transcript before killing
  if [ -x "$CAPTURE_SCRIPT" ]; then
    "$CAPTURE_SCRIPT" "$SESSION" "$ISSUE" 2>/dev/null || echo "Warning: Could not capture $SESSION"
  fi

  # Kill session
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "Killed: $SESSION"
}

# Option A: From saved session list (if bd-swarm saved it)
if [ -f /tmp/swarm-sessions.txt ]; then
  while read -r SESSION; do
    [[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      # Extract issue ID from session name (ctt-worker-ISSUEID-xxx or worker-ISSUEID)
      ISSUE_FROM_SESSION=$(echo "$SESSION" | sed -E 's/^(ctt-)?worker-([^-]+(-[a-z0-9]+)?).*/\2/')
      capture_and_kill "$SESSION" "$ISSUE_FROM_SESSION"
    fi
  done < /tmp/swarm-sessions.txt
  rm -f /tmp/swarm-sessions.txt
fi

# Option B: Kill by pattern (fallback)
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  SHORT_ID="${ISSUE##*-}"

  # Try worker-ISSUE format
  if tmux has-session -t "worker-${ISSUE}" 2>/dev/null; then
    capture_and_kill "worker-${ISSUE}" "$ISSUE"
  fi

  # Try ctt-worker-* format
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "ctt-worker.*${SHORT_ID}" | while read -r S; do
    capture_and_kill "$S" "$ISSUE"
  done || true
done

echo "Transcripts saved to .beads/transcripts/"
```

**Important:**
- Transcripts are captured BEFORE killing sessions to preserve context
- Sessions MUST be killed before removing worktrees to release file locks
- Transcripts can be analyzed later with `/conductor:analyze-transcripts`

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

**Note:** Workers do NOT run code review (to avoid parallel conflicts). This conductor-level review is the sole code review for all worker changes.

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

### Step 9: Comprehensive Summary

```bash
echo "=== Step 9: Summary ==="

# Run the comprehensive summary script
${CLAUDE_PLUGIN_ROOT}/scripts/wave-summary.sh "$ISSUES" --audio
```

This generates a detailed summary including:
- All issues completed with titles and status
- Wave statistics (branches merged, files changed, lines added/removed)
- Next steps (remaining ready issues or backlog status)
- Audio notification of completion

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
