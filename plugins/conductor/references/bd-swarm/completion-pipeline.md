# Completion Pipeline - BD Swarm

Clean up in this order: **Sessions -> Merge -> Visual Review -> Worktrees -> Branches -> Sync**

## Quick Reference

```bash
# Run the script with issue IDs
${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "TabzChrome-abc TabzChrome-def"
```

## Manual Steps

### Step 1: Kill Worker Sessions

```bash
cd "$PROJECT_DIR"

# Option A: From saved session list
if [ -f /tmp/swarm-sessions.txt ]; then
  while read -r SESSION; do
    [[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux kill-session -t "$SESSION"
      echo "Killed session: $SESSION"
    fi
  done < /tmp/swarm-sessions.txt
  rm /tmp/swarm-sessions.txt
fi

# Option B: Kill by pattern (if session list not available)
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  # Try both naming conventions
  tmux kill-session -t "worker-${ISSUE}" 2>/dev/null && echo "Killed: worker-${ISSUE}"
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "ctt-.*${ISSUE}" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null && echo "Killed: $S"
  done
done
```

### Step 2: Merge Branches

```bash
MERGE_COUNT=0
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid issue: $ISSUE" >&2; continue; }
  if git merge --no-edit "feature/${ISSUE}"; then
    MERGE_COUNT=$((MERGE_COUNT + 1))
  fi
done
```

### Step 3: Visual Review (Conductor Only)

**This is when visual review happens** - after merge, before cleanup.

Workers skip visual review to avoid browser tab conflicts. The conductor does unified visual review here:

```bash
# Conductor opens browser tabs for UI verification
# - Use tabz_screenshot to capture UI state
# - Use tabz_open_url to navigate to affected pages
# - Verify all merged changes work together

# Example: screenshot the dashboard after all changes merged
mcp-cli call tabz/tabz_open_url '{"url": "http://localhost:3000/dashboard"}'
mcp-cli call tabz/tabz_screenshot '{}'
```

**Why here:**
- All worker changes are merged - see complete picture
- No tab conflicts - workers are done
- Better review quality - interactions between changes visible

See TabzChrome-s19 for the architectural decision.

### Step 4: Cleanup Worktrees and Branches

```bash
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  git worktree remove --force "${PROJECT_DIR}-worktrees/${ISSUE}"
  git branch -d "feature/${ISSUE}"
done

echo "Worktrees cleaned up, $MERGE_COUNT branches merged"
```

### Step 5: Audio Summary

```bash
AUDIO_TEXT="Wave complete. $MERGE_COUNT branches merged successfully. Worktrees cleaned up."
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$AUDIO_TEXT" '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &
```

### Step 6: Sync and Push

```bash
bd sync && git push origin main

# Final completion announcement
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Sprint complete. All changes pushed to main.", "voice": "en-GB-SoniaNeural", "rate": "+15%", "priority": "high"}' \
  > /dev/null 2>&1 &
```

**Important:** Sessions MUST be killed before removing worktrees, otherwise Claude processes may hold file locks.

## Session Cleanup Checklist

Before ending a swarm session, verify cleanup is complete:

```bash
# Check for leftover worker sessions
tmux list-sessions | grep -E "worker-|ctt-worker"

# Check for leftover worktrees
ls ${PROJECT_DIR}-worktrees/ 2>/dev/null

# Check for orphaned feature branches
git branch | grep "feature/"

# Manual cleanup if needed
tmux kill-session -t "worker-xxx"
git worktree remove --force "${PROJECT_DIR}-worktrees/xxx"
git branch -d "feature/xxx"
```

**Common issue:** If conductor session ends before completion pipeline runs, sessions/worktrees are orphaned. Always run the completion pipeline or clean up manually.
