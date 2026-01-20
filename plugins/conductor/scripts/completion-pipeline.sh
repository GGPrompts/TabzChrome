#!/usr/bin/env bash
# completion-pipeline.sh - Full cleanup pipeline for completed wave
# Usage: completion-pipeline.sh "ISSUE1 ISSUE2 ISSUE3" [PROJECT_DIR]
#
# Combines all completion steps:
# 1. Capture session transcripts and usage stats
# 2. Kill worker sessions
# 3. Merge feature branches to main
# 4. Cleanup worktrees
# 5. Generate wave summary with cost totals
#
# Environment:
#   SKIP_CAPTURE=1    - Skip session capture
#   SKIP_MERGE=1      - Skip branch merging
#   SKIP_CLEANUP=1    - Skip worktree cleanup
#   AUDIO=1           - Enable audio notification

set -e

ISSUES="$1"
PROJECT_DIR="${2:-$(pwd)}"
WORKTREE_BASE="$(dirname "$PROJECT_DIR")"

if [ -z "$ISSUES" ]; then
  echo "Usage: completion-pipeline.sh \"ISSUE1 ISSUE2 ...\" [PROJECT_DIR]"
  echo ""
  echo "Environment variables:"
  echo "  SKIP_CAPTURE=1  - Skip session capture"
  echo "  SKIP_MERGE=1    - Skip branch merging"
  echo "  SKIP_CLEANUP=1  - Skip worktree cleanup"
  echo "  AUDIO=1         - Enable audio notification"
  exit 1
fi

# Find script directory for calling other scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$PROJECT_DIR"

# Helper: Check if changes are docs-only (markdown files)
is_docs_only() {
  local staged unstaged
  staged=$(git diff --cached --name-only 2>/dev/null)
  unstaged=$(git diff --name-only 2>/dev/null)

  # No changes = not docs-only
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

echo "========================================================================"
echo "                    COMPLETION PIPELINE"
echo "========================================================================"
echo "Project: $PROJECT_DIR"
echo "Issues:  $ISSUES"
echo ""

# ============================================================================
# Step 1: Capture Session Transcripts (if capture-session.sh exists)
# ============================================================================
if [ -z "$SKIP_CAPTURE" ] && [ -x "$SCRIPT_DIR/capture-session.sh" ]; then
  echo "=== Step 1: Capture Session Transcripts ==="

  for ISSUE in $ISSUES; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue

    # Try common session naming patterns
    SHORT_ID="${ISSUE##*-}"
    for SESSION_PATTERN in "worker-${ISSUE}" "worker-${SHORT_ID}" "ctt-worker-${SHORT_ID}"; do
      if tmux has-session -t "$SESSION_PATTERN" 2>/dev/null; then
        echo "Capturing session: $SESSION_PATTERN"
        "$SCRIPT_DIR/capture-session.sh" "$SESSION_PATTERN" "$ISSUE" "$PROJECT_DIR" || true
        break
      fi
    done
  done
  echo ""
else
  echo "=== Step 1: Capture Session Transcripts (SKIPPED) ==="
  echo ""
fi

# ============================================================================
# Step 2: Kill Worker Sessions
# ============================================================================
echo "=== Step 2: Kill Worker Sessions ==="

# From saved session list if it exists
if [ -f /tmp/swarm-sessions.txt ]; then
  while read -r SESSION; do
    [[ "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux kill-session -t "$SESSION"
      echo "  Killed: $SESSION"
    fi
  done < /tmp/swarm-sessions.txt
  rm -f /tmp/swarm-sessions.txt
fi

# Kill by issue ID pattern
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  SHORT_ID="${ISSUE##*-}"

  # Try various naming patterns
  for SESSION_PATTERN in "worker-${ISSUE}" "worker-${SHORT_ID}"; do
    tmux kill-session -t "$SESSION_PATTERN" 2>/dev/null && echo "  Killed: $SESSION_PATTERN" || true
  done

  # Kill sessions matching ctt-worker-XXX-* pattern
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "ctt-worker-${SHORT_ID}-" | while read -r S; do
    tmux kill-session -t "$S" 2>/dev/null && echo "  Killed: $S"
  done || true
done

echo ""

# ============================================================================
# Step 3: Merge Branches to Main
# ============================================================================
if [ -z "$SKIP_MERGE" ]; then
  echo "=== Step 3: Merge Branches to Main ==="

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
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "  Skipping invalid: $ISSUE" >&2; continue; }
    BRANCH="feature/${ISSUE}"

    # Check if branch exists
    if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
      echo "  SKIP: Branch $BRANCH does not exist"
      continue
    fi

    echo "  Merging $BRANCH..."
    MERGE_OUTPUT=$(git merge --no-edit "$BRANCH" 2>&1)
    MERGE_STATUS=$?

    if [ $MERGE_STATUS -eq 0 ]; then
      echo "    OK: Merged $BRANCH"
      MERGE_COUNT=$((MERGE_COUNT + 1))
    else
      echo "    CONFLICT: Failed to merge $BRANCH"
      echo "$MERGE_OUTPUT" | sed 's/^/      /'
      # Abort the failed merge and continue with others
      git merge --abort 2>/dev/null || true
      MERGE_FAILED=$((MERGE_FAILED + 1))
    fi
  done

  echo ""
  echo "  Merge summary: $MERGE_COUNT succeeded, $MERGE_FAILED failed"
  echo ""
else
  echo "=== Step 3: Merge Branches (SKIPPED) ==="
  echo ""
fi

# ============================================================================
# Step 4: Cleanup Worktrees
# ============================================================================
if [ -z "$SKIP_CLEANUP" ]; then
  echo "=== Step 4: Cleanup Worktrees ==="

  for ISSUE in $ISSUES; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue

    # Worktrees are sibling directories (../$ISSUE)
    if [ -d "${WORKTREE_BASE}/${ISSUE}" ]; then
      git worktree remove --force "${WORKTREE_BASE}/${ISSUE}" 2>/dev/null || true
      echo "  Removed worktree: ${ISSUE}"
    fi

    # Delete the feature branch
    git branch -d "feature/${ISSUE}" 2>/dev/null && echo "  Deleted branch: feature/${ISSUE}" || true
  done
  echo ""
else
  echo "=== Step 4: Cleanup Worktrees (SKIPPED) ==="
  echo ""
fi

# ============================================================================
# Step 5: Generate Wave Summary
# ============================================================================
echo "=== Step 5: Wave Summary ==="

AUDIO_ARG=""
[ -n "$AUDIO" ] && AUDIO_ARG="--audio"

if [ -x "$SCRIPT_DIR/wave-summary.sh" ]; then
  "$SCRIPT_DIR/wave-summary.sh" "$ISSUES" $AUDIO_ARG
else
  # Fallback basic summary
  echo ""
  echo "Pipeline complete for issues: $ISSUES"
  echo ""
  echo "Next steps:"
  echo "  bd sync && git push origin main"
fi

# ============================================================================
# Final status
# ============================================================================
if [ "${MERGE_FAILED:-0}" -gt 0 ]; then
  echo ""
  echo "WARNING: $MERGE_FAILED branches had merge conflicts!"
  echo "Resolve conflicts manually, then:"
  echo "  1. Commit the merge resolution"
  echo "  2. Re-run: completion-pipeline.sh \"$ISSUES\""
  exit 1
fi

echo ""
echo "Done! Final steps:"
echo "  bd sync && git push origin main"
