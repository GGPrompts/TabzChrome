#!/usr/bin/env bash
# gate-runner.sh - Run quality checkpoints for a beads issue
#
# Usage:
#   ./gate-runner.sh --issue ISSUE_ID [--worktree PATH] [--timeout 300]
#
# Notes:
# - This is NOT `bd gate` (async wisp gates for external waits).
# - Here "gate" means "quality checkpoint" (codex review, tests, docs, visual QA).
# - Required checkpoints come from issue labels:
#     - Preferred: `gate:<type>` (e.g. `gate:codex-review`)
#     - Legacy: `<type>` (e.g. `codex-review`)
#
# Output:
# - Writes `.checkpoints/*.json` in the issue worktree (via checkpoint workers).
# - Exits non-zero if any required checkpoint fails or is missing.

set -euo pipefail

TABZ_API="${TABZ_API:-http://localhost:8129}"
TOKEN="${TABZ_TOKEN:-$(cat /tmp/tabz-auth-token 2>/dev/null || true)}"
TIMEOUT="${TIMEOUT:-300}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFE_SEND_KEYS="$SCRIPT_DIR/safe-send-keys.sh"

declare -A GATE_SKILLS=(
  ["codex-review"]="conductor:reviewing-code"
  ["test-runner"]="conductor:running-tests"
  ["visual-qa"]="conductor:visual-qa"
  ["docs-check"]="conductor:docs-check"
)

declare -A CHECKPOINT_FILES=(
  ["codex-review"]="codex-review.json"
  ["test-runner"]="test-runner.json"
  ["visual-qa"]="visual-qa.json"
  ["docs-check"]="docs-check.json"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${NC}[$(date +%H:%M:%S)] $*"; }
log_ok() { echo -e "${GREEN}[$(date +%H:%M:%S)] ✓ $*${NC}"; }
log_err() { echo -e "${RED}[$(date +%H:%M:%S)] ✗ $*${NC}"; }
log_warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] ⚠ $*${NC}"; }

usage() {
  cat <<EOF
Usage: $0 --issue ISSUE_ID [--worktree PATH] [--timeout SECONDS]

Required gates come from issue labels:
  - gate:codex-review
  - gate:test-runner
  - gate:docs-check
  - gate:visual-qa

Legacy (still supported):
  - codex-review, test-runner, docs-check, visual-qa
EOF
  exit 2
}

check_health() {
  if ! curl -sf "$TABZ_API/api/health" >/dev/null 2>&1; then
    log_err "TabzChrome not running at $TABZ_API"
    exit 1
  fi
  if [ -z "$TOKEN" ]; then
    log_err "No auth token found. Check /tmp/tabz-auth-token"
    exit 1
  fi
  if [ ! -x "$SAFE_SEND_KEYS" ]; then
    log_err "safe-send-keys.sh not found or not executable: $SAFE_SEND_KEYS"
    exit 1
  fi
  log_ok "TabzChrome healthy"
}

get_worktree_path() {
  local issue_id="$1"
  local workdir
  workdir="$(pwd)"

  if [ -d "$workdir/.worktrees/$issue_id" ]; then
    echo "$workdir/.worktrees/$issue_id"
    return 0
  fi

  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
  if [ -n "$repo_root" ] && [ -d "$repo_root/.worktrees/$issue_id" ]; then
    echo "$repo_root/.worktrees/$issue_id"
    return 0
  fi

  return 1
}

get_required_gates() {
  local issue_id="$1"

  bd show "$issue_id" --json 2>/dev/null | jq -r '
    (.[0].labels // [])[]
    | if startswith("gate:") then sub("^gate:";"") else . end
  ' 2>/dev/null | while read -r label; do
    case "$label" in
      codex-review|test-runner|visual-qa|docs-check)
        echo "$label"
        ;;
    esac
  done | sort -u
}

spawn_checkpoint() {
  local issue_id="$1"
  local gate_type="$2"
  local worktree="$3"

  local file="${CHECKPOINT_FILES[$gate_type]:-}"
  if [ -z "$file" ]; then
    log_err "Unsupported gate type: $gate_type"
    return 1
  fi

  local term_name="chk-${issue_id}-${gate_type}"

  log "Spawning checkpoint $term_name..."

  # For codex-review, run `codex review` directly (non-interactive, no terminal needed)
  # For other gates, spawn Claude with the skill
  if [ "$gate_type" = "codex-review" ]; then
    # Run codex review directly - it's non-interactive and exits on completion
    # No need to spawn a terminal, just run in background and write checkpoint
    (
      cd "$worktree"
      mkdir -p .checkpoints

      # Run codex review (--base main for branch diff, or --uncommitted)
      local review_output
      if git diff --quiet main...HEAD 2>/dev/null; then
        # No branch diff, check uncommitted
        review_output="$(codex review --uncommitted --title "$issue_id review" 2>&1)" || true
      else
        # Has branch changes
        review_output="$(codex review --base main --title "$issue_id review" 2>&1)" || true
      fi

      # Parse result - codex review exits 0 on success, non-zero on issues
      local passed="true"
      local summary="Code review passed"

      # Check if review found issues (look for P1/P2 markers or "incorrect" verdict)
      if echo "$review_output" | grep -qE '\[P[12]\]|incorrect'; then
        passed="false"
        summary="Code review found issues"
      fi

      # Write checkpoint
      cat > ".checkpoints/$file" <<EOF
{
  "checkpoint": "codex-review",
  "timestamp": "$(date -Iseconds)",
  "passed": $passed,
  "summary": "$summary",
  "issues": []
}
EOF
      log_ok "Codex review complete: $passed"
    ) &

    # Return a fake session ID (codex review runs in background, not in terminal)
    echo "codex-review-$$"
    return 0
  fi

  # Other gates use Claude with skills
  local skill="${GATE_SKILLS[$gate_type]:-}"
  if [ -z "$skill" ]; then
    log_err "No skill for gate type: $gate_type"
    return 1
  fi

  local plugin_dirs="--plugin-dir $HOME/.claude/plugins/marketplaces"
  [ -d "$HOME/plugins/my-plugins" ] && plugin_dirs="$plugin_dirs --plugin-dir $HOME/plugins/my-plugins"
  local command="BEADS_NO_DAEMON=1 claude $plugin_dirs"
  local prompt="Run /$skill for issue $issue_id.

When finished, write the result JSON to .checkpoints/$file and exit.

Include: {checkpoint, timestamp, passed, summary}."

  local resp
  resp="$(curl -s -X POST "$TABZ_API/api/spawn" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{
      \"name\": \"$term_name\",
      \"workingDir\": \"$worktree\",
      \"command\": \"$command\"
    }")"

  local err
  err="$(echo "$resp" | jq -r '.error // empty' 2>/dev/null || true)"
  if [ -n "$err" ]; then
    log_err "Spawn failed: $err"
    return 1
  fi

  log "Waiting for Claude to initialize..."
  sleep 8

  local session
  session="$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$term_name" '.data[] | select(.name == $n) | .id' 2>/dev/null || true)"
  if [ -z "$session" ] || [ "$session" = "null" ]; then
    log_err "Failed to get session for $term_name"
    return 1
  fi

  "$SAFE_SEND_KEYS" "$session" "$prompt"

  echo "$session"
}

kill_checkpoint() {
  local term_name="$1"
  local session
  session="$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$term_name" '.data[] | select(.name == $n) | .id' 2>/dev/null || true)"
  if [ -n "$session" ] && [ "$session" != "null" ]; then
    curl -s -X DELETE "$TABZ_API/api/agents/$session" -H "X-Auth-Token: $TOKEN" >/dev/null
  fi
}

wait_for_checkpoint_file() {
  local term_name="$1"
  local checkpoint_path="$2"
  local start
  start="$(date +%s)"

  log "Waiting for checkpoint: $checkpoint_path"

  while true; do
    if [ -f "$checkpoint_path" ] && jq -e '.passed' "$checkpoint_path" >/dev/null 2>&1; then
      return 0
    fi

    local exists
    exists="$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$term_name" '.data[] | select(.name == $n) | .id' 2>/dev/null || true)"
    if [ -z "$exists" ] || [ "$exists" = "null" ]; then
      sleep 2
      if [ -f "$checkpoint_path" ] && jq -e '.passed' "$checkpoint_path" >/dev/null 2>&1; then
        return 0
      fi
      return 1
    fi

    local now elapsed
    now="$(date +%s)"
    elapsed=$((now - start))
    if [ "$elapsed" -gt "$TIMEOUT" ]; then
      log_err "Checkpoint timed out after ${TIMEOUT}s"
      curl -s -X DELETE "$TABZ_API/api/agents/$exists" -H "X-Auth-Token: $TOKEN" >/dev/null
      return 1
    fi

    sleep 5
  done
}

run_gate() {
  local issue_id="$1"
  local gate_type="$2"
  local worktree="$3"

  local term_name="chk-${issue_id}-${gate_type}"
  local file="${CHECKPOINT_FILES[$gate_type]}"
  local checkpoint_path="$worktree/.checkpoints/$file"

  mkdir -p "$worktree/.checkpoints"

  local session
  session="$(spawn_checkpoint "$issue_id" "$gate_type" "$worktree")"
  if [ -z "$session" ]; then
    log_err "$issue_id: failed to spawn $gate_type"
    return 1
  fi

  # codex-review runs in background without a terminal - just wait for file
  if [ "$gate_type" = "codex-review" ]; then
    log "Waiting for codex review to complete..."
    local start elapsed
    start="$(date +%s)"
    while true; do
      if [ -f "$checkpoint_path" ] && jq -e '.passed' "$checkpoint_path" >/dev/null 2>&1; then
        break
      fi
      elapsed=$(( $(date +%s) - start ))
      if [ "$elapsed" -gt "$TIMEOUT" ]; then
        log_err "$issue_id: codex review timed out after ${TIMEOUT}s"
        return 1
      fi
      sleep 5
    done
  else
    # Other gates run in terminals - wait and cleanup
    if ! wait_for_checkpoint_file "$term_name" "$checkpoint_path"; then
      log_err "$issue_id: $gate_type did not produce a valid checkpoint"
      kill_checkpoint "$term_name"
      return 1
    fi
    kill_checkpoint "$term_name"
  fi

  local passed summary
  passed="$(jq -r '.passed' "$checkpoint_path" 2>/dev/null || echo "false")"
  summary="$(jq -r '.summary // .error // "No summary"' "$checkpoint_path" 2>/dev/null || echo "No summary")"

  if [ "$passed" = "true" ]; then
    log_ok "$issue_id: $gate_type PASS - $summary"
    return 0
  fi

  log_err "$issue_id: $gate_type FAIL - $summary"
  return 1
}

ISSUE_ID=""
WORKTREE_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --issue)
      ISSUE_ID="${2:-}"
      shift 2
      ;;
    --worktree)
      WORKTREE_OVERRIDE="${2:-}"
      shift 2
      ;;
    --timeout)
      TIMEOUT="${2:-300}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      log_err "Unknown arg: $1"
      usage
      ;;
  esac
done

[ -z "$ISSUE_ID" ] && usage

check_health

WORKTREE="${WORKTREE_OVERRIDE:-$(get_worktree_path "$ISSUE_ID" || true)}"
if [ -z "$WORKTREE" ] || [ ! -d "$WORKTREE" ]; then
  log_err "Worktree not found for $ISSUE_ID"
  exit 1
fi

REQUIRED="$(get_required_gates "$ISSUE_ID" || true)"
if [ -z "$REQUIRED" ]; then
  log_warn "No required checkpoints for $ISSUE_ID (no gate:* labels)"
  exit 0
fi

log "Required checkpoints for $ISSUE_ID:"
echo "$REQUIRED" | sed 's/^/  - /'

FAILED=0
while read -r gate; do
  [ -z "$gate" ] && continue
  run_gate "$ISSUE_ID" "$gate" "$WORKTREE" || FAILED=$((FAILED + 1))
done <<< "$REQUIRED"

if [ "$FAILED" -gt 0 ]; then
  log_err "$ISSUE_ID: $FAILED checkpoint(s) failed"
  exit 1
fi

log_ok "$ISSUE_ID: all checkpoints passed"
