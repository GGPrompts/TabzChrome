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
  tmux kill-session -t "worker-${ISSUE}" 2>/dev/null && echo "Killed: worker-${ISSUE}" || true
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "ctt-.*${ISSUE}" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null && echo "Killed: $S"
  done || true
done

echo ""
echo "=== Step 2: Merge Branches ==="

MERGE_COUNT=0
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
  if git merge --no-edit "feature/${ISSUE}" 2>/dev/null; then
    echo "Merged: feature/${ISSUE}"
    MERGE_COUNT=$((MERGE_COUNT + 1))
  else
    echo "WARN: Could not merge feature/${ISSUE} (may not exist or conflicts)"
  fi
done

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

AUDIO_TEXT="Wave complete. $MERGE_COUNT branches merged successfully."
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg text "$AUDIO_TEXT" '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
  > /dev/null 2>&1 &

echo ""
echo "=== Pipeline Complete ==="
echo "Merged: $MERGE_COUNT branches"
echo ""
echo "Next steps:"
echo "  bd sync && git push origin main"
