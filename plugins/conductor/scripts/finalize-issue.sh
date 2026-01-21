#!/usr/bin/env bash
# finalize-issue.sh - One-command "landing the plane" for a single worker issue
#
# Usage:
#   ./finalize-issue.sh ISSUE_ID
#
# What it does (v1):
# - Verifies the issue is closed
# - Runs required checkpoints (from issue labels gate:*) via gate-runner.sh
# - Verifies checkpoints passed
# - Captures session transcript/stats (if possible) and kills the worker terminal
# - Merges feature/ISSUE_ID into main
# - Removes the worktree and deletes the feature branch
# - bd sync + git push
#
# Skips (via env):
#   SKIP_CHECKPOINTS=1  - Don't run gate-runner.sh (still verifies if files exist)
#   SKIP_CAPTURE=1      - Don't capture session transcript/stats
#   SKIP_KILL=1         - Don't kill the worker terminal
#   SKIP_MERGE=1        - Don't merge into main
#   SKIP_CLEANUP=1      - Don't remove worktree/branch
#   SKIP_PUSH=1         - Don't bd sync / git push

set -euo pipefail

ISSUE_ID="${1:-}"
if [ -z "$ISSUE_ID" ]; then
  echo "Usage: $0 ISSUE_ID" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORKTREE_PATH="$REPO_ROOT/.worktrees/$ISSUE_ID"

TABZ_API="${TABZ_API:-http://localhost:8129}"
TOKEN="${TABZ_TOKEN:-$(cat /tmp/tabz-auth-token 2>/dev/null || true)}"

cd "$REPO_ROOT"

echo "=== Finalize $ISSUE_ID ==="

STATUS="$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].status // empty' 2>/dev/null || true)"
if [ "$STATUS" != "closed" ]; then
  echo "ERROR: issue $ISSUE_ID is not closed (status: ${STATUS:-unknown})" >&2
  exit 1
fi

if [ ! -d "$WORKTREE_PATH" ]; then
  echo "ERROR: worktree not found: $WORKTREE_PATH" >&2
  exit 1
fi

if [ -z "${SKIP_CHECKPOINTS:-}" ]; then
  echo "=== Step 1: Run checkpoints ==="
  "$SCRIPT_DIR/gate-runner.sh" --issue "$ISSUE_ID" --worktree "$WORKTREE_PATH"
  echo
else
  echo "=== Step 1: Run checkpoints (SKIPPED) ==="
  echo
fi

echo "=== Step 2: Verify checkpoints ==="
if ! "$SCRIPT_DIR/verify-checkpoints.sh" --issue "$ISSUE_ID" --worktree "$WORKTREE_PATH"; then
  echo "ERROR: checkpoints failed for $ISSUE_ID (reopening issue)" >&2
  bd reopen "$ISSUE_ID" --reason "Checkpoints failed during finalize" 2>/dev/null || true
  exit 1
fi
echo

if [ -z "${SKIP_CAPTURE:-}" ] || [ -z "${SKIP_KILL:-}" ]; then
  echo "=== Step 3: Capture + kill worker terminal ==="

  if ! curl -sf "$TABZ_API/api/health" >/dev/null 2>&1; then
    echo "WARN: TabzChrome not running at $TABZ_API (skipping capture/kill)" >&2
  elif [ -z "$TOKEN" ]; then
    echo "WARN: /tmp/tabz-auth-token missing (skipping capture/kill)" >&2
  else
    AGENT_JSON="$(curl -s "$TABZ_API/api/agents" 2>/dev/null | jq -c --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | {id, sessionName}' 2>/dev/null | head -1 || true)"
    AGENT_ID="$(echo "$AGENT_JSON" | jq -r '.id // empty' 2>/dev/null || true)"
    TMUX_SESSION="$(echo "$AGENT_JSON" | jq -r '.sessionName // empty' 2>/dev/null || true)"

    # Capture stats (best-effort)
    if [ -z "${SKIP_CAPTURE:-}" ]; then
      CAPTURE="$SCRIPT_DIR/capture-session.sh"
      if [ -x "$CAPTURE" ]; then
        SESSION_TO_CAPTURE="${TMUX_SESSION:-$AGENT_ID}"
        if [ -n "$SESSION_TO_CAPTURE" ] && tmux has-session -t "$SESSION_TO_CAPTURE" 2>/dev/null; then
          "$CAPTURE" "$SESSION_TO_CAPTURE" "$ISSUE_ID" "$REPO_ROOT" || true
        else
          echo "WARN: tmux session not found for $ISSUE_ID (capture skipped)" >&2
        fi
      fi
    fi

    # Kill worker tab
    if [ -z "${SKIP_KILL:-}" ] && [ -n "$AGENT_ID" ]; then
      curl -s -X DELETE "$TABZ_API/api/agents/$AGENT_ID" -H "X-Auth-Token: $TOKEN" >/dev/null || true
      echo "Killed worker: $AGENT_ID"
    fi
  fi
  echo
fi

if [ -z "${SKIP_MERGE:-}" ]; then
  echo "=== Step 4: Merge feature branch ==="

  CURRENT_BRANCH="$(git branch --show-current)"
  if [ "$CURRENT_BRANCH" != "main" ]; then
    git checkout main
  fi
  git pull --ff-only origin main 2>/dev/null || true

  BRANCH="feature/$ISSUE_ID"
  if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "ERROR: branch not found: $BRANCH" >&2
    exit 1
  fi

  if ! git merge --no-edit "$BRANCH"; then
    echo "ERROR: merge conflict while merging $BRANCH (worktree preserved)" >&2
    exit 1
  fi
  echo
fi

if [ -z "${SKIP_CLEANUP:-}" ]; then
  echo "=== Step 5: Cleanup worktree + branch ==="
  git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  git branch -d "feature/$ISSUE_ID" 2>/dev/null || true
  echo
fi

if [ -z "${SKIP_PUSH:-}" ]; then
  echo "=== Step 6: bd sync + git push ==="
  bd sync
  git push
  git status
  echo
fi

echo "Done."
