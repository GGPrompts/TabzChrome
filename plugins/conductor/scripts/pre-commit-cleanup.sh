#!/bin/bash
# Pre-commit hook that spawns a cleanup agent to review changes
# Install: Copy to .git/hooks/pre-commit in worker worktrees
# Or: Add to conductor's init-worktree.sh
#
# The cleanup agent:
# - Reviews staged changes for quality/completeness
# - Determines if tests or further work is needed
# - Updates the beads issue with retro notes
# - Messages the worker with feedback
# - Blocks commit if work is needed, allows if good

set -e

# Get issue ID from branch name (feature/ISSUE-ID format)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ISSUE_ID=$(echo "$BRANCH" | sed -n 's|feature/||p')

if [ -z "$ISSUE_ID" ]; then
  # Not a feature branch, skip cleanup review
  exit 0
fi

# Get worktree path
WORKTREE_PATH=$(pwd)

# Find worker's tmux session (terminal named after issue ID)
TABZ_API="http://localhost:8129"
WORKER_SESSION=$(curl -s "$TABZ_API/api/agents" 2>/dev/null | \
  jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .sessionName' 2>/dev/null || echo "")

if [ -z "$WORKER_SESSION" ]; then
  # Can't find worker session, just allow commit
  echo "Cleanup: No worker session found for $ISSUE_ID, skipping review"
  exit 0
fi

# Check if there are actually staged changes
if git diff --cached --quiet; then
  echo "Cleanup: No staged changes, skipping review"
  exit 0
fi

# Get change stats for context
STATS=$(git diff --cached --stat | tail -1)
FILES_CHANGED=$(git diff --cached --name-only | wc -l)

echo "Cleanup: Reviewing $FILES_CHANGED files for $ISSUE_ID ($STATS)..."

# Spawn cleanup agent with rich context
CLEANUP_RESULT=$(ISSUE_ID="$ISSUE_ID" \
  WORKER_SESSION="$WORKER_SESSION" \
  WORKTREE_PATH="$WORKTREE_PATH" \
  claude --agent conductor:cleanup \
    --print \
    
    "Review staged changes for issue $ISSUE_ID.

## Context
- Worktree: $WORKTREE_PATH
- Worker session: $WORKER_SESSION
- Changes: $STATS

## Staged Files
$(git diff --cached --name-only)

## Your Task
1. Run git diff --cached to see the actual changes
2. Analyze complexity and completeness
3. Decide: PASS or NEEDS_WORK
4. Update beads issue with retro notes
5. Message worker with your decision" \
  2>&1) || true

# Check if cleanup agent said NEEDS_WORK
if echo "$CLEANUP_RESULT" | grep -q "NEEDS_WORK"; then
  echo ""
  echo "========================================"
  echo "Cleanup: Review found issues"
  echo "========================================"
  echo "$CLEANUP_RESULT" | grep -A 20 "Decision:" || echo "$CLEANUP_RESULT" | tail -20
  echo ""
  echo "Fix the issues and try committing again."
  exit 1
fi

echo "Cleanup: Review passed"
exit 0
