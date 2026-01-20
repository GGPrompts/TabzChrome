---
name: worker-done
description: "Clean up after a worker completes - merge, remove worktree, sync beads"
argument-hint: "ISSUE_ID"
---

# Worker Done

Clean up after a worker finishes their issue.

## Usage

```bash
/conductor:worker-done V4V-ct9
```

## What This Does

1. **Verify issue is closed** in beads
2. **Kill terminal** via TabzChrome API
3. **Merge changes** from worktree branch to main
4. **Remove worktree** and branch
5. **Sync beads** to persist state

## Quick Cleanup

```bash
ISSUE_ID="V4V-ct9"
TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)

# 1. Verify issue is closed
STATUS=$(bd show "$ISSUE_ID" --json | jq -r '.[0].status')
[ "$STATUS" != "closed" ] && echo "Issue not closed!" && exit 1

# 2. Kill terminal via API (find by name)
SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg id "$ISSUE_ID" \
  '.data[] | select(.name == $id) | .id')
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
    echo "Cleaning up $ISSUE_ID..."

    # Kill terminal
    SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg id "$ISSUE_ID" \
      '.data[] | select(.name == $id) | .id')
    [ -n "$SESSION" ] && curl -s -X DELETE "$TABZ_API/api/agents/$SESSION" \
      -H "X-Auth-Token: $TOKEN"

    # Merge and cleanup
    git merge "feature/$ISSUE_ID" --no-edit 2>/dev/null || true
    git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null || true
    git branch -d "feature/$ISSUE_ID" 2>/dev/null || true
  fi
done

bd sync
git push
```

## Finding Workers via API

```bash
# List all workers with worktrees
curl -s http://localhost:8129/api/agents | jq '.data[] | select(.workingDir | contains(".worktrees/")) | {name, id, workingDir}'

# Find specific worker by issue ID
curl -s http://localhost:8129/api/agents | jq -r '.data[] | select(.name == "V4V-ct9")'

# Get terminal output for debugging
SESSION="ctt-V4V-ct9-abc123"
curl -s "http://localhost:8129/api/tmux/sessions/$SESSION/capture" | jq -r '.data.content' | tail -50
```

## Handoff Notes

Workers should write structured handoff notes before closing. See [handoff-format.md](../references/handoff-format.md) for the full format.

### Quick Example

```bash
bd update ISSUE-ID --notes "$(cat <<'EOF'
## Handoff

**Status**: done
**Summary**: Fixed null check in profile loader

### Changes
- src/profile.ts: Added null guard on line 45

### Retro
- Straightforward fix, no issues
EOF
)"
```

### Mining Handoffs

```bash
# Find all issues with handoff notes
bd list --status closed --json | jq -r '.[] | select(.notes | contains("Handoff")) | "\(.id): \(.title)"'

# Extract status from a specific issue
bd show ISSUE-ID --json | jq -r '.[0].notes' | grep -oP '(?<=\*\*Status\*\*: )\w+'
```

## Notes

- **Find workers by name** (issue ID) via `/api/agents`
- **Kill terminals via API** instead of `tmux kill-session`
- Always verify issue is closed before cleanup
- Merge conflicts require manual resolution
- Use `bd sync && git push` at the end
