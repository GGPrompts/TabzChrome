#!/usr/bin/env bash
# Initialize a worktree with dependencies for a beads issue
# Usage: init-worktree.sh <WORKTREE_PATH> [--quiet] [--symlink]
#
# Options:
#   --quiet    Suppress output
#   --symlink  Symlink node_modules from main repo (fast, for workers)
#
# Combines:
# - bd worktree integration (beads DB redirect)
# - flock for parallel worker safety
# - Monorepo support (frontend/backend subdirs)
# - Multi-language deps (Node, Python, Rust, Go, Ruby, Elixir)
# - npm run build for Next.js types (fixes LSP errors)

# Don't use set -e - we want to continue even if some steps fail
# set -e

WORKTREE="${1:-.}"
QUIET=""
SYMLINK=""

# Parse optional flags
shift || true
for arg in "$@"; do
  case "$arg" in
    --quiet) QUIET=1 ;;
    --symlink) SYMLINK=1 ;;
  esac
done

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

#######################################
# Beads redirect (for MCP tools to work in worktrees)
#######################################
# Find main repo (works in worktrees)
find_main_repo() {
  local main_repo
  main_repo=$(git rev-parse --show-toplevel 2>/dev/null)

  # If we're in a worktree, find the actual main repo
  if [ -f ".git" ]; then
    # .git is a file in worktrees, pointing to the real git dir
    # e.g., gitdir: /path/to/main/.git/worktrees/worktree-name
    local git_dir
    git_dir=$(cat .git | sed 's/gitdir: //')
    # Go up from .git/worktrees/<name> → .git → main repo
    main_repo=$(cd "$git_dir/../../.." && pwd)
  fi
  echo "$main_repo"
}

MAIN_REPO=$(find_main_repo)

ensure_beads_redirect() {
  # Only if this is a beads project (main repo has .beads/)
  local main_repo="$MAIN_REPO"

  # Check if main repo has beads
  if [ -d "$main_repo/.beads" ] && [ ! -d ".beads" ]; then
    # Create redirect file so MCP tools can find the database
    mkdir -p .beads
    # Use relative path for portability
    local rel_path
    rel_path=$(realpath --relative-to="$(pwd)" "$main_repo/.beads")
    echo "$rel_path" > .beads/redirect
    log "  -> Created .beads/redirect -> $rel_path"
    INSTALLED="$INSTALLED beads-redirect"
  fi
}

ensure_beads_redirect

#######################################
# Copy env files (secrets needed for build/tests)
#######################################
copy_env_files() {
  local main_repo="$MAIN_REPO"

  # Copy .env files from main repo (not tracked in git, contain secrets)
  for envfile in .env .env.local .env.development .env.development.local; do
    if [ -f "$main_repo/$envfile" ] && [ ! -f "$envfile" ]; then
      cp "$main_repo/$envfile" "$envfile"
      log "  -> Copied $envfile from main repo"
      INSTALLED="$INSTALLED $envfile"
    fi
  done
}

copy_env_files

# Lockfile for dependency installation (prevents npm cache corruption with parallel workers)
PROJECT_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "$WORKTREE")")
DEP_LOCK="/tmp/init-worktree-${PROJECT_NAME}.lock"

#######################################
# Node.js / JavaScript / TypeScript
#######################################
install_node() {
  local dir="$1"
  [ ! -f "$dir/package.json" ] && return

  # Skip if node_modules already exists (file or symlink)
  [ -e "$dir/node_modules" ] && return

  # Fast mode: symlink from main repo
  if [ -n "$SYMLINK" ]; then
    local main_node_modules="$MAIN_REPO/$dir/node_modules"
    [ "$dir" = "." ] && main_node_modules="$MAIN_REPO/node_modules"

    if [ -d "$main_node_modules" ]; then
      ln -s "$main_node_modules" "$dir/node_modules"
      log "  -> Symlinked node_modules ($dir)"
      INSTALLED="$INSTALLED node-symlink($dir)"
      return
    fi
  fi

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
  if [ -f package.json ] && ! grep -q '"workspaces"' package.json 2>/dev/null; then
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
    # Skip if .next already exists
    [ -e "$dir/.next" ] && return

    # NOTE: We intentionally do NOT symlink .next even in SYMLINK mode
    # Symlinking .next causes path conflicts and cache corruption because:
    # 1. .next/cache contains absolute paths to the main repo
    # 2. Two processes writing to the same .next causes race conditions
    # Instead, we run a fresh build (or skip and let worker build when needed)

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
