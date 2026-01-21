#!/usr/bin/env bash
# Initialize a worktree with dependencies for a beads issue
# Usage: init-worktree.sh <WORKTREE_PATH> [--quiet]
#
# Combines:
# - bd worktree integration (beads DB redirect)
# - flock for parallel worker safety
# - Monorepo support (frontend/backend subdirs)
# - Multi-language deps (Node, Python, Rust, Go, Ruby, Elixir)
# - npm run build for Next.js types (fixes LSP errors)

set -e

WORKTREE="${1:-.}"
QUIET="${2:-}"

log() {
  [ -z "$QUIET" ] && echo "$@"
}

# Validate worktree exists
if [ ! -d "$WORKTREE" ]; then
  echo "Error: Worktree directory not found: $WORKTREE" >&2
  exit 1
fi

cd "$WORKTREE"
log "Initializing dependencies in $(pwd)..."

# Track what we installed
INSTALLED=""

# Lockfile for dependency installation (prevents npm cache corruption with parallel workers)
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$WORKTREE")")
DEP_LOCK="/tmp/init-worktree-${PROJECT_NAME}.lock"

#######################################
# Node.js / JavaScript / TypeScript
#######################################
install_node() {
  local dir="$1"
  [ ! -f "$dir/package.json" ] && return

  # Skip if node_modules already exists
  [ -d "$dir/node_modules" ] && return

  (
    cd "$dir"
    if [ -f "pnpm-lock.yaml" ]; then
      log "  -> pnpm install ($dir)"
      pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    elif [ -f "yarn.lock" ]; then
      log "  -> yarn install ($dir)"
      yarn install --frozen-lockfile 2>/dev/null || yarn install
    elif [ -f "bun.lockb" ]; then
      log "  -> bun install ($dir)"
      bun install --frozen-lockfile 2>/dev/null || bun install
    else
      log "  -> npm ci ($dir)"
      npm ci 2>/dev/null || npm install
    fi
  )
  INSTALLED="$INSTALLED node($dir)"
}

# Use flock for npm operations (prevents cache corruption)
(
  flock -x 200 || { log "Warning: Failed to acquire dep lock, continuing anyway"; }

  # Root package.json
  install_node "."

  # Monorepo subdirectories (skip if using workspaces)
  if ! grep -q '"workspaces"' package.json 2>/dev/null; then
    for subdir in frontend backend web app packages/* apps/*; do
      [ -d "$subdir" ] && install_node "$subdir"
    done
  fi
) 200>"$DEP_LOCK"

#######################################
# Run build for Next.js types (fixes LSP "Cannot find module" errors)
#######################################
run_nextjs_build() {
  local dir="$1"

  # Detect Next.js
  if [ -f "$dir/next.config.ts" ] || [ -f "$dir/next.config.js" ] || [ -f "$dir/next.config.mjs" ]; then
    # Skip if .next/types already exists
    [ -d "$dir/.next/types" ] && return

    if [ -f "$dir/package.json" ] && grep -q '"build"' "$dir/package.json"; then
      log "  -> Building Next.js types ($dir)"
      (cd "$dir" && npm run build 2>&1 | tail -3) || log "    Build had warnings (continuing)"
      INSTALLED="$INSTALLED nextjs-build($dir)"
    fi
  fi
}

# Build Next.js projects for LSP support
run_nextjs_build "."
for subdir in frontend web app apps/*; do
  [ -d "$subdir" ] && run_nextjs_build "$subdir"
done

#######################################
# Python
#######################################
install_python() {
  local dir="$1"
  local has_deps=false

  [ -f "$dir/pyproject.toml" ] && has_deps=true
  [ -f "$dir/requirements.txt" ] && has_deps=true
  [ -f "$dir/requirements-dev.txt" ] && has_deps=true

  [ "$has_deps" = "false" ] && return

  (
    cd "$dir"

    # Create venv if needed
    if [ ! -d ".venv" ]; then
      if command -v uv &>/dev/null; then
        log "  -> uv venv ($dir)"
        uv venv
      else
        log "  -> python -m venv ($dir)"
        python3 -m venv .venv
      fi
    fi

    # Activate and install
    source .venv/bin/activate 2>/dev/null || true

    if [ -f "pyproject.toml" ]; then
      if command -v uv &>/dev/null; then
        log "  -> uv pip install -e . ($dir)"
        uv pip install -e ".[dev]" 2>/dev/null || uv pip install -e .
      else
        log "  -> pip install -e . ($dir)"
        pip install -e ".[dev]" 2>/dev/null || pip install -e .
      fi
    elif [ -f "requirements.txt" ]; then
      if command -v uv &>/dev/null; then
        log "  -> uv pip install -r requirements.txt ($dir)"
        uv pip install -r requirements.txt
      else
        log "  -> pip install -r requirements.txt ($dir)"
        pip install -r requirements.txt
      fi
    fi
  )
  INSTALLED="$INSTALLED python($dir)"
}

# Root Python
install_python "."

# Monorepo Python subdirs
for subdir in backend api server; do
  [ -d "$subdir" ] && install_python "$subdir"
done

#######################################
# Other languages
#######################################

# Rust
if [ -f "Cargo.toml" ]; then
  log "  -> cargo fetch"
  cargo fetch
  INSTALLED="$INSTALLED rust"
fi

# Go
if [ -f "go.mod" ]; then
  log "  -> go mod download"
  go mod download
  INSTALLED="$INSTALLED go"
fi

# Ruby
if [ -f "Gemfile" ]; then
  log "  -> bundle install"
  bundle install
  INSTALLED="$INSTALLED ruby"
fi

# Elixir
if [ -f "mix.exs" ]; then
  log "  -> mix deps.get"
  mix deps.get
  INSTALLED="$INSTALLED elixir"
fi

#######################################
# Pre-commit hook for cleanup
#######################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Locate pre-commit hook source.
# - In conductor plugin, it's in that plugin's scripts directory.
# - This init-worktree.sh is shared by multiple plugins, so don't assume co-location.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
find_precommit_hook() {
  local found=""

  if [ -f "$SCRIPT_DIR/pre-commit-cleanup.sh" ]; then
    found="$SCRIPT_DIR/pre-commit-cleanup.sh"
  elif [ -f "$REPO_ROOT/plugins/conductor/scripts/pre-commit-cleanup.sh" ]; then
    found="$REPO_ROOT/plugins/conductor/scripts/pre-commit-cleanup.sh"
  else
    # Last resort: look in Claude plugin cache (running from an installed plugin).
    found="$(find "$HOME/.claude/plugins/cache" -maxdepth 8 -type f -path "*/conductor/*/scripts/pre-commit-cleanup.sh" 2>/dev/null | head -1)"
  fi

  echo "$found"
}

HOOK_SOURCE="$(find_precommit_hook)"

# Worktrees have .git as a file pointing to the real git dir
if [ -f ".git" ]; then
  GIT_DIR=$(cat .git | sed 's/gitdir: //')
  HOOK_TARGET="$GIT_DIR/hooks/pre-commit"
else
  HOOK_TARGET=".git/hooks/pre-commit"
fi

if [ -n "$HOOK_SOURCE" ] && [ -f "$HOOK_SOURCE" ]; then
  mkdir -p "$(dirname "$HOOK_TARGET")"
  cp "$HOOK_SOURCE" "$HOOK_TARGET"
  chmod +x "$HOOK_TARGET"
  log "  -> Installed pre-commit hook"
  INSTALLED="$INSTALLED hook"
fi

#######################################
# Summary
#######################################
if [ -n "$INSTALLED" ]; then
  log "Initialized:$INSTALLED"
else
  log "No dependencies detected"
fi

log "Done: $(pwd)"
