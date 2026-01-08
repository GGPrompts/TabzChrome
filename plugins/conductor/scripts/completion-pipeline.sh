#!/usr/bin/env bash
# Completion pipeline: Kill sessions, merge branches, cleanup worktrees
# Usage: completion-pipeline.sh "ISSUE1 ISSUE2 ISSUE3" [PROJECT_DIR]

set -e

# Helper function: Check if changes are docs-only (markdown files)
# Exported for use by SKILL.md instructions and other scripts
# Returns 0 (true) if only .md/.markdown files changed, 1 (false) otherwise
# Usage: if is_docs_only; then echo "Skip tests"; fi
is_docs_only() {
  local staged unstaged
  staged=$(git diff --cached --name-only 2>/dev/null)
  unstaged=$(git diff --name-only 2>/dev/null)

  # No changes = not docs-only (run normal pipeline)
  if [ -z "$staged" ] && [ -z "$unstaged" ]; then
    return 1
  fi

  # Check if any non-markdown file changed
  if echo "$staged" | grep -qvE '^\s*$' && echo "$staged" | grep -qvE '\.(md|markdown)$'; then
    return 1
  fi
  if echo "$unstaged" | grep -qvE '^\s*$' && echo "$unstaged" | grep -qvE '\.(md|markdown)$'; then
    return 1
  fi

  return 0
}

ISSUES="$1"
PROJECT_DIR="${2:-$(pwd)}"
WORKTREE_DIR="${PROJECT_DIR}-worktrees"

if [ -z "$ISSUES" ]; then
  echo "Usage: completion-pipeline.sh \"ISSUE1 ISSUE2 ...\" [PROJECT_DIR]"
  exit 1
fi

cd "$PROJECT_DIR"

echo "=== Step 1: Kill Worker Sessions ==="

# Option A: From saved session list
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
  # Extract short ID (e.g., "511" from "TabzChrome-511")
  SHORT_ID="${ISSUE##*-}"
  tmux kill-session -t "worker-${ISSUE}" 2>/dev/null && echo "Killed: worker-${ISSUE}" || true
  tmux kill-session -t "worker-${SHORT_ID}" 2>/dev/null && echo "Killed: worker-${SHORT_ID}" || true
  # Match session names like ctt-worker-511-uuid
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "ctt-worker-${SHORT_ID}-" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null && echo "Killed: $S"
  done || true
done

echo ""
echo "=== Step 2: Merge Branches to Main ==="

# Ensure we're on main before merging
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Switching to main branch (was on: $CURRENT_BRANCH)"
  if ! git checkout main; then
    echo "ERROR: Failed to checkout main branch"
    exit 1
  fi
  # Pull latest to avoid push conflicts
  git pull --ff-only origin main 2>/dev/null || true
fi

MERGE_COUNT=0
MERGE_FAILED=0
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
  BRANCH="feature/${ISSUE}"

  # Check if branch exists
  if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "SKIP: Branch $BRANCH does not exist"
    continue
  fi

  echo "Merging $BRANCH..."
  MERGE_OUTPUT=$(git merge --no-edit "$BRANCH" 2>&1)
  MERGE_STATUS=$?

  if [ $MERGE_STATUS -eq 0 ]; then
    echo "  OK: Merged $BRANCH"
    MERGE_COUNT=$((MERGE_COUNT + 1))
  else
    echo "  CONFLICT: Failed to merge $BRANCH"
    echo "$MERGE_OUTPUT" | sed 's/^/    /'
    # Abort the failed merge and continue with others
    git merge --abort 2>/dev/null || true
    MERGE_FAILED=$((MERGE_FAILED + 1))
  fi
done

echo ""
echo "Merge summary: $MERGE_COUNT succeeded, $MERGE_FAILED failed"

echo ""
echo "=== Step 3: Cleanup Worktrees ==="

for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  if [ -d "${WORKTREE_DIR}/${ISSUE}" ]; then
    git worktree remove --force "${WORKTREE_DIR}/${ISSUE}" 2>/dev/null || true
    echo "Removed worktree: ${ISSUE}"
  fi
  git branch -d "feature/${ISSUE}" 2>/dev/null && echo "Deleted branch: feature/${ISSUE}" || true
done

# Remove worktrees dir if empty
rmdir "$WORKTREE_DIR" 2>/dev/null || true

echo ""
echo "=== Step 4: Audio Notification ==="

if [ "$MERGE_FAILED" -gt 0 ]; then
  AUDIO_TEXT="Wave complete. $MERGE_COUNT branches merged. $MERGE_FAILED had conflicts."
else
  AUDIO_TEXT="Wave complete. $MERGE_COUNT branches merged successfully."
fi
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$AUDIO_TEXT" '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &

echo ""
echo "=== Pipeline Complete ==="
echo "Merged: $MERGE_COUNT branches"
if [ "$MERGE_FAILED" -gt 0 ]; then
  echo "Failed: $MERGE_FAILED branches (resolve conflicts manually)"
fi
echo ""
echo "Next steps:"
echo "  bd sync && git push origin main"
