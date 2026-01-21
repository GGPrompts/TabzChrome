---
name: gg-done
description: "Clean up after a worker completes - merge, remove worktree, sync beads"
argument-hint: "ISSUE_ID"
---

# Worker Done - Cleanup

Clean up after a worker finishes their issue.

## Steps

Add these to your to-dos:

1. **Verify issue is closed** - Worker must complete first
2. **Run checkpoints + finalize** - One command does the rest (recommended)

---

## Step 1: Verify Issue is Closed

```python
issue = mcp__beads__show(issue_id="ISSUE-ID")
# Verify status == "closed"
```

```bash
STATUS=$(bd show "$ISSUE_ID" --json | jq -r '.[0].status')
[ "$STATUS" != "closed" ] && echo "Issue not closed!" && exit 1
```

## Step 2 (Recommended): Run Finalize Script

This runs:
- required checkpoints (from issue labels like `gate:codex-review`)
- checkpoint verification
- capture transcript/stats (best-effort)
- kill worker terminal
- merge to main
- worktree + branch cleanup
- `bd sync` + `git push`

```bash
./plugins/conductor/scripts/finalize-issue.sh "$ISSUE_ID"
```

### Optional Skip Flags (env)

```bash
# Example: verify existing checkpoints, but don't re-run them
SKIP_CHECKPOINTS=1 ./plugins/conductor/scripts/finalize-issue.sh "$ISSUE_ID"
```

---

## Manual Fallback (if needed)

### Kill Terminal via TabzChrome API

```bash
TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)

# Find session by name (issue ID)
SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg id "$ISSUE_ID" \
  '.data[] | select(.name == $id) | .id')

# Kill if found
[ -n "$SESSION" ] && curl -s -X DELETE "$TABZ_API/api/agents/$SESSION" \
  -H "X-Auth-Token: $TOKEN"
```

## Step 2a: Capture Session with Cost Stats (Recommended)

Capture transcript AND token usage before killing the session:
```bash
# Find capture-session.sh
CAPTURE_SCRIPT=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "capture-session.sh" 2>/dev/null | head -1)

# Capture if script exists and session is still alive
if [ -n "$CAPTURE_SCRIPT" ] && tmux has-session -t "$SESSION" 2>/dev/null; then
  "$CAPTURE_SCRIPT" "$SESSION" "$ISSUE_ID" "$(pwd)"
fi
```

This captures:
- Full session transcript to `.beads/transcripts/<issue-id>.txt`
- Actual token usage from Claude's session JSONL files
- Calculated cost (Opus 4.5 pricing)
- Tool call and skill invocation counts
- Stats attached to issue notes for tracking

## Step 3: Merge Feature Branch

```bash
git merge "feature/$ISSUE_ID" --no-edit
```

**If merge conflicts:**
- Stop and report - don't auto-resolve
- Leave worktree intact for manual resolution
- Output conflict files for user

## Step 4: Remove Worktree and Branch

```bash
git worktree remove ".worktrees/$ISSUE_ID" --force
git branch -d "feature/$ISSUE_ID"
```

## Step 5: Sync Beads and Push

```bash
bd sync
git push
```

## Quick Reference

```bash
ISSUE_ID="ISSUE-ID"
TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)

# 1. Verify issue is closed
STATUS=$(bd show "$ISSUE_ID" --json | jq -r '.[0].status')
[ "$STATUS" != "closed" ] && echo "Issue not closed!" && exit 1

# 2. Get session ID
SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg id "$ISSUE_ID" \
  '.data[] | select(.name == $id) | .id')

# 2a. Capture session with cost stats BEFORE killing
CAPTURE_SCRIPT=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "capture-session.sh" 2>/dev/null | head -1)
[ -n "$CAPTURE_SCRIPT" ] && [ -n "$SESSION" ] && tmux has-session -t "$SESSION" 2>/dev/null && \
  "$CAPTURE_SCRIPT" "$SESSION" "$ISSUE_ID" "$(pwd)"

# 2b. Kill terminal via API
[ -n "$SESSION" ] && curl -s -X DELETE "$TABZ_API/api/agents/$SESSION" \
  -H "X-Auth-Token: $TOKEN"

# 3. Merge changes
git merge "feature/$ISSUE_ID" --no-edit

# 4. Remove worktree and branch
git worktree remove ".worktrees/$ISSUE_ID" --force
git branch -d "feature/$ISSUE_ID"

# 5. Sync beads
bd sync
```

## Batch Cleanup

Clean up all completed workers at once:

```bash
TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)

# Find all worktree-based workers
WORKERS=$(curl -s "$TABZ_API/api/agents" | jq -r '
  .data[] | select(.workingDir | contains(".worktrees/")) | .name
')

for ISSUE_ID in $WORKERS; do
  STATUS=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].status // "unknown"')

  if [ "$STATUS" = "closed" ]; then
    echo "Finalizing $ISSUE_ID..."
    ./plugins/conductor/scripts/finalize-issue.sh "$ISSUE_ID" || true
  fi
done

git status
```

## Error Handling

| Scenario | Action |
|----------|--------|
| Issue not closed | Stop - worker should complete first |
| Merge conflicts | Stop and report - don't auto-resolve |
| Missing worktree | Skip removal, continue |
| Terminal already dead | Continue |
| Branch doesn't exist | Skip branch deletion, continue |

## Notes

- Always verify issue is closed before cleanup
- Find workers by name (issue ID) via `/api/agents`
- Kill terminals via API instead of `tmux kill-session`
- Merge conflicts require manual resolution
- Use `bd sync && git push` at the end
