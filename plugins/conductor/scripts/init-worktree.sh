#!/bin/bash
# Initialize dependencies in a worktree
# Usage: init-worktree.sh <worktree-path> [--quiet]

set -e

WORKTREE="${1:-.}"
QUIET="${2:-}"

log() {
  [ -z "$QUIET" ] && echo "$@"
}

if [ ! -d "$WORKTREE" ]; then
  echo "Error: Worktree directory not found: $WORKTREE" >&2
  exit 1
fi

cd "$WORKTREE"
log "Initializing dependencies in $(pwd)..."

# Track what we installed
INSTALLED=""

# Node.js / JavaScript / TypeScript
if [ -f "package.json" ]; then
  if [ -f "pnpm-lock.yaml" ]; then
    log "  -> pnpm install"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    INSTALLED="$INSTALLED node(pnpm)"
  elif [ -f "yarn.lock" ]; then
    log "  -> yarn install"
    yarn install --frozen-lockfile 2>/dev/null || yarn install
    INSTALLED="$INSTALLED node(yarn)"
  elif [ -f "bun.lockb" ]; then
    log "  -> bun install"
    bun install --frozen-lockfile 2>/dev/null || bun install
    INSTALLED="$INSTALLED node(bun)"
  else
    log "  -> npm ci"
    npm ci 2>/dev/null || npm install
    INSTALLED="$INSTALLED node(npm)"
  fi
fi

# Check for monorepo subdirectories with their own package.json
for subdir in frontend backend packages/* apps/*; do
  if [ -d "$subdir" ] && [ -f "$subdir/package.json" ]; then
    # Skip if already handled by root install (workspaces)
    if [ -f "package.json" ] && grep -q '"workspaces"' package.json 2>/dev/null; then
      continue
    fi
    log "  -> Installing $subdir dependencies"
    (cd "$subdir" && npm ci 2>/dev/null || npm install)
    INSTALLED="$INSTALLED $subdir"
  fi
done

# Python - prefer uv, fallback to pip
install_python() {
  local install_cmd="$1"

  if command -v uv &>/dev/null; then
    # Create venv if it doesn't exist
    if [ ! -d ".venv" ]; then
      log "  -> uv venv"
      uv venv
    fi
    log "  -> $install_cmd (uv)"
    source .venv/bin/activate 2>/dev/null || true
    eval "uv $install_cmd"
  else
    # Fallback to pip
    if [ ! -d ".venv" ]; then
      log "  -> python -m venv .venv"
      python3 -m venv .venv
    fi
    source .venv/bin/activate 2>/dev/null || true
    log "  -> $install_cmd (pip)"
    eval "pip $install_cmd"
  fi
  INSTALLED="$INSTALLED python"
}

if [ -f "pyproject.toml" ]; then
  install_python "pip install -e \".[dev]\" 2>/dev/null || pip install -e ."
elif [ -f "requirements.txt" ]; then
  install_python "pip install -r requirements.txt"
elif [ -f "requirements-dev.txt" ]; then
  install_python "pip install -r requirements-dev.txt"
fi

# Check for monorepo Python subdirectories
for subdir in backend api server; do
  if [ -d "$subdir" ]; then
    if [ -f "$subdir/pyproject.toml" ] || [ -f "$subdir/requirements.txt" ]; then
      log "  -> Installing $subdir Python dependencies"
      (
        cd "$subdir"
        if [ -f "pyproject.toml" ]; then
          install_python "pip install -e \".[dev]\" 2>/dev/null || pip install -e ."
        elif [ -f "requirements.txt" ]; then
          install_python "pip install -r requirements.txt"
        fi
      )
    fi
  fi
done

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

# Install pre-commit hook for cleanup agent
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SOURCE="$SCRIPT_DIR/pre-commit-cleanup.sh"
HOOK_TARGET=".git/hooks/pre-commit"

# Worktrees have .git as a file pointing to the real git dir
if [ -f ".git" ]; then
  GIT_DIR=$(cat .git | sed 's/gitdir: //')
  HOOK_TARGET="$GIT_DIR/hooks/pre-commit"
fi

if [ -f "$HOOK_SOURCE" ]; then
  mkdir -p "$(dirname "$HOOK_TARGET")"
  cp "$HOOK_SOURCE" "$HOOK_TARGET"
  chmod +x "$HOOK_TARGET"
  log "  -> Installed pre-commit cleanup hook"
  INSTALLED="$INSTALLED hook"
fi

# Summary
if [ -n "$INSTALLED" ]; then
  log "Initialized:$INSTALLED"
else
  log "No dependencies detected"
fi

log "Done: $(pwd)"
