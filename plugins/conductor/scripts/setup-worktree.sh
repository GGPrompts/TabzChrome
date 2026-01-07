#!/usr/bin/env bash
# Setup a worktree with dependencies for a beads issue
# Usage: setup-worktree.sh <ISSUE_ID> [PROJECT_DIR]

set -e

ISSUE="$1"
PROJECT_DIR="${2:-$(pwd)}"
WORKTREE_DIR="${PROJECT_DIR}-worktrees"
WORKTREE="${WORKTREE_DIR}/${ISSUE}"

# Validate issue ID format (alphanumeric with dash only)
if [[ ! "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: Invalid issue ID format: $ISSUE" >&2
  exit 1
fi

mkdir -p "$WORKTREE_DIR"

# Lockfile for worktree creation (prevents race conditions with parallel workers)
WORKTREE_LOCK="/tmp/git-worktree-$(basename "$PROJECT_DIR").lock"

# Use flock to serialize worktree creation across parallel workers
# Lock is automatically released when subshell exits (success or error)
(
  flock -x 200 || { echo "ERROR: Failed to acquire worktree lock" >&2; exit 1; }

  # Check if worktree already exists (another worker may have created it)
  if [ -d "$WORKTREE" ]; then
    echo "Worktree already exists: $WORKTREE"
    exit 0
  fi

  git -C "$PROJECT_DIR" worktree add "$WORKTREE" -b "feature/${ISSUE}" 2>/dev/null || \
  git -C "$PROJECT_DIR" worktree add "$WORKTREE" HEAD
) 200>"$WORKTREE_LOCK"

# Install deps based on lockfile type (outside lock - can run in parallel)
if [ -f "$WORKTREE/package.json" ] && [ ! -d "$WORKTREE/node_modules" ]; then
  cd "$WORKTREE"
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile
  elif [ -f "yarn.lock" ]; then
    yarn install --frozen-lockfile
  else
    npm ci 2>/dev/null || npm install
  fi
fi

echo "READY: $WORKTREE"
