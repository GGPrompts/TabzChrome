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

  # Use bd worktree create - handles beads redirect automatically
  cd "$PROJECT_DIR"
  bd worktree create "$WORKTREE" --branch "feature/${ISSUE}" 2>/dev/null || \
  bd worktree create "$WORKTREE" 2>/dev/null || \
  git worktree add "$WORKTREE" HEAD  # Fallback if bd fails
) 200>"$WORKTREE_LOCK"

# Install deps based on lockfile type (outside lock - can run in parallel)
# Always install if node_modules is missing OR if it looks stale (no .package-lock.json)
if [ -f "$WORKTREE/package.json" ]; then
  cd "$WORKTREE"

  NEEDS_INSTALL=false
  if [ ! -d "node_modules" ]; then
    echo "node_modules missing - installing dependencies..."
    NEEDS_INSTALL=true
  elif [ ! -f "node_modules/.package-lock.json" ] && [ ! -f "node_modules/.yarn-integrity" ]; then
    echo "node_modules looks incomplete - reinstalling..."
    NEEDS_INSTALL=true
  fi

  if [ "$NEEDS_INSTALL" = true ]; then
    if [ -f "pnpm-lock.yaml" ]; then
      pnpm install --frozen-lockfile
    elif [ -f "yarn.lock" ]; then
      yarn install --frozen-lockfile
    else
      npm ci 2>/dev/null || npm install
    fi
    echo "Dependencies installed"
  else
    echo "Dependencies already installed"
  fi
fi

# Run initial build if package.json has a build script
if [ -f "$WORKTREE/package.json" ]; then
  cd "$WORKTREE"
  if grep -q '"build"' package.json; then
    # Only build if dist doesn't exist or is older than src
    if [ ! -d "dist" ] && [ ! -d "dist-extension" ] && [ ! -d "build" ] && [ ! -d ".next" ]; then
      echo "Running initial build..."
      npm run build 2>&1 | tail -10 || echo "Build had warnings (continuing)"
    else
      echo "Build output exists - skipping initial build"
    fi
  fi
fi

# Copy worker-specific PRIME.md to worktree
WORKER_PRIME="$PROJECT_DIR/plugins/conductor/references/WORKER_PRIME.md"
if [ -f "$WORKER_PRIME" ]; then
  mkdir -p "$WORKTREE/.beads"
  cp "$WORKER_PRIME" "$WORKTREE/.beads/PRIME.md"
  echo "Worker PRIME.md installed"
fi

echo "READY: $WORKTREE"
