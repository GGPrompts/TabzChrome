#!/bin/bash
# Gate Runner - Process pending gates and resolve/reopen
#
# Usage:
#   ./gate-runner.sh          # Poll continuously
#   ./gate-runner.sh --once   # Run once then exit
#
# Spawns checkpoint workers for pending gates, reads results,
# resolves gates on pass or reopens issues on failure.

set -e

TABZ_API="${TABZ_API:-http://localhost:8129}"
TOKEN="${TABZ_TOKEN:-$(cat /tmp/tabz-auth-token 2>/dev/null)}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
TIMEOUT="${TIMEOUT:-300}"

# Find safe-send-keys.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFE_SEND_KEYS="$SCRIPT_DIR/safe-send-keys.sh"

# Gate type to checkpoint skill mapping
declare -A GATE_SKILLS=(
  ["codex-review"]="codex-review"
  ["test-runner"]="test-runner"
  ["visual-qa"]="visual-qa"
  ["docs-check"]="docs-check"
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

# Pre-flight check
check_health() {
  if ! curl -sf "$TABZ_API/api/health" >/dev/null 2>&1; then
    log_err "TabzChrome not running at $TABZ_API"
    exit 1
  fi
  if [ -z "$TOKEN" ]; then
    log_err "No auth token found. Check /tmp/tabz-auth-token"
    exit 1
  fi
  log_ok "TabzChrome healthy"
}

# Get pending gates as JSON lines
get_pending_gates() {
  bd gate list --json 2>/dev/null | jq -c '.[] | select(.status == "pending" or .status == "open")' 2>/dev/null || true
}

# Get worktree path for an issue
get_worktree_path() {
  local ISSUE_ID="$1"
  local WORKDIR=$(pwd)

  # Look in .worktrees/
  if [ -d "$WORKDIR/.worktrees/$ISSUE_ID" ]; then
    echo "$WORKDIR/.worktrees/$ISSUE_ID"
    return 0
  fi

  # Look in parent's .worktrees/ (if we're in a worktree)
  local PARENT=$(git worktree list --porcelain 2>/dev/null | grep "^worktree " | head -1 | cut -d' ' -f2)
  if [ -n "$PARENT" ] && [ -d "$PARENT/.worktrees/$ISSUE_ID" ]; then
    echo "$PARENT/.worktrees/$ISSUE_ID"
    return 0
  fi

  return 1
}

# Spawn checkpoint worker
spawn_checkpoint() {
  local GATE_ID="$1"
  local GATE_TYPE="$2"
  local ISSUE_ID="$3"
  local WORKTREE="$4"

  local SKILL="${GATE_SKILLS[$GATE_TYPE]}"
  if [ -z "$SKILL" ]; then
    log_err "Unknown gate type: $GATE_TYPE"
    return 1
  fi

  # Terminal name: gate-{issue}-{type}
  local TERM_NAME="gate-${ISSUE_ID}-${GATE_TYPE}"

  # Plugin directories
  local PLUGIN_DIRS="--plugin-dir $HOME/.claude/plugins/marketplaces"
  [ -d "$HOME/plugins/my-plugins" ] && PLUGIN_DIRS="$PLUGIN_DIRS --plugin-dir $HOME/plugins/my-plugins"

  log "Spawning checkpoint $TERM_NAME..."

  # Spawn checkpoint worker
  local RESP=$(curl -s -X POST "$TABZ_API/api/spawn" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{
      \"name\": \"$TERM_NAME\",
      \"workingDir\": \"$WORKTREE\",
      \"command\": \"BEADS_NO_DAEMON=1 claude $PLUGIN_DIRS\"
    }")

  local ERROR=$(echo "$RESP" | jq -r '.error // empty')
  if [ -n "$ERROR" ]; then
    log_err "Spawn failed: $ERROR"
    return 1
  fi

  # Wait for Claude to initialize
  log "Waiting for Claude to initialize..."
  sleep 8

  # Get session ID
  local SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')

  if [ -z "$SESSION" ] || [ "$SESSION" = "null" ]; then
    log_err "Failed to get session for $TERM_NAME"
    return 1
  fi

  # Send the checkpoint skill invocation
  local PROMPT="Run the /$SKILL checkpoint for gate $GATE_ID on issue $ISSUE_ID. Write result to .checkpoints/$SKILL.json and exit when done."
  "$SAFE_SEND_KEYS" "$SESSION" "$PROMPT"

  log_ok "Spawned $TERM_NAME (session: $SESSION)"
  echo "$SESSION"
}

# Wait for checkpoint to complete
wait_for_checkpoint() {
  local TERM_NAME="$1"
  local WORKTREE="$2"
  local SKILL="$3"

  local CHECKPOINT_FILE="$WORKTREE/.checkpoints/${SKILL}.json"
  local START=$(date +%s)

  log "Waiting for checkpoint result at $CHECKPOINT_FILE..."

  while true; do
    # Check if result file exists and is valid JSON
    if [ -f "$CHECKPOINT_FILE" ]; then
      if jq -e '.passed' "$CHECKPOINT_FILE" >/dev/null 2>&1; then
        log_ok "Checkpoint file found"
        return 0
      fi
    fi

    # Check if terminal still exists
    local EXISTS=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')
    if [ -z "$EXISTS" ] || [ "$EXISTS" = "null" ]; then
      # Terminal exited - give it a moment to write file
      sleep 2
      if [ -f "$CHECKPOINT_FILE" ] && jq -e '.passed' "$CHECKPOINT_FILE" >/dev/null 2>&1; then
        log_ok "Checkpoint file found (after terminal exit)"
        return 0
      fi
      log_warn "Terminal exited without writing checkpoint"
      return 1
    fi

    # Check timeout
    local NOW=$(date +%s)
    local ELAPSED=$((NOW - START))
    if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
      log_err "Checkpoint timed out after ${TIMEOUT}s"
      # Kill the terminal
      curl -s -X DELETE "$TABZ_API/api/agents/$EXISTS" -H "X-Auth-Token: $TOKEN" >/dev/null
      return 1
    fi

    sleep 5
  done
}

# Kill checkpoint terminal
kill_checkpoint() {
  local TERM_NAME="$1"

  local SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')
  if [ -n "$SESSION" ] && [ "$SESSION" != "null" ]; then
    curl -s -X DELETE "$TABZ_API/api/agents/$SESSION" -H "X-Auth-Token: $TOKEN" >/dev/null
    log "Killed terminal $TERM_NAME"
  fi
}

# Read checkpoint result
read_checkpoint_result() {
  local WORKTREE="$1"
  local SKILL="$2"

  local FILE="$WORKTREE/.checkpoints/${SKILL}.json"
  if [ -f "$FILE" ]; then
    cat "$FILE"
  else
    echo '{"passed": false, "error": "Checkpoint file not found"}'
  fi
}

# Process a single gate
process_gate() {
  local GATE_JSON="$1"

  # Parse gate fields - handle various field names
  local GATE_ID=$(echo "$GATE_JSON" | jq -r '.id // .gate_id // ""')
  local GATE_TYPE=$(echo "$GATE_JSON" | jq -r '.type // .gate_type // "unknown"')
  local ISSUE_ID=$(echo "$GATE_JSON" | jq -r '.issue_id // .parent_id // .blocked_issue // ""')

  # Try to extract issue ID from gate ID if not present
  if [ -z "$ISSUE_ID" ] || [ "$ISSUE_ID" = "null" ]; then
    # Gates might be named like "codex-review-for-ISSUE"
    ISSUE_ID=$(echo "$GATE_ID" | grep -oP '(?<=for-)\S+' || true)
  fi

  log "Processing gate: $GATE_ID"
  log "  Type: $GATE_TYPE"
  log "  Issue: $ISSUE_ID"

  # Skip human gates
  if [ "$GATE_TYPE" = "human" ]; then
    log_warn "Skipping human gate (requires manual approval)"
    return 0
  fi

  # Check gate type is supported
  local SKILL="${GATE_SKILLS[$GATE_TYPE]}"
  if [ -z "$SKILL" ]; then
    log_warn "Unknown gate type: $GATE_TYPE (supported: ${!GATE_SKILLS[*]})"
    return 0
  fi

  # Get worktree
  local WORKTREE
  WORKTREE=$(get_worktree_path "$ISSUE_ID")
  if [ -z "$WORKTREE" ]; then
    log_warn "No worktree found for $ISSUE_ID - skipping"
    return 0
  fi

  log "  Worktree: $WORKTREE"

  # Create .checkpoints directory
  mkdir -p "$WORKTREE/.checkpoints"

  # Spawn checkpoint
  local SESSION
  SESSION=$(spawn_checkpoint "$GATE_ID" "$GATE_TYPE" "$ISSUE_ID" "$WORKTREE")
  if [ $? -ne 0 ] || [ -z "$SESSION" ]; then
    log_err "Failed to spawn checkpoint for $GATE_ID"
    return 1
  fi

  local TERM_NAME="gate-${ISSUE_ID}-${GATE_TYPE}"

  # Wait for completion
  if ! wait_for_checkpoint "$TERM_NAME" "$WORKTREE" "$SKILL"; then
    kill_checkpoint "$TERM_NAME"
    log_err "Gate $GATE_ID failed (no result)"
    bd reopen "$ISSUE_ID" --reason "Gate failed: $GATE_TYPE - checkpoint did not complete" 2>/dev/null || true
    return 1
  fi

  # Kill terminal (cleanup)
  kill_checkpoint "$TERM_NAME"

  # Read result
  local RESULT=$(read_checkpoint_result "$WORKTREE" "$SKILL")
  local PASSED=$(echo "$RESULT" | jq -r '.passed')
  local SUMMARY=$(echo "$RESULT" | jq -r '.summary // .error // "No summary"')

  if [ "$PASSED" = "true" ]; then
    log_ok "Gate $GATE_ID PASSED: $SUMMARY"
    bd gate resolve "$GATE_ID" 2>/dev/null || log_warn "Could not resolve gate (may need manual resolve)"

    # Check if all gates for this issue are now resolved
    check_all_gates_passed "$ISSUE_ID"
  else
    log_err "Gate $GATE_ID FAILED: $SUMMARY"
    bd reopen "$ISSUE_ID" --reason "Gate failed: $GATE_TYPE - $SUMMARY" 2>/dev/null || true
  fi
}

# Check if all gates passed and optionally merge
check_all_gates_passed() {
  local ISSUE_ID="$1"

  # Check for remaining gates on this issue
  local REMAINING=$(bd gate list --json 2>/dev/null | jq --arg id "$ISSUE_ID" '[.[] | select((.issue_id == $id or .parent_id == $id) and (.status == "pending" or .status == "open"))] | length')

  if [ "$REMAINING" = "0" ] || [ "$REMAINING" = "null" ]; then
    log_ok "All gates passed for $ISSUE_ID"

    # Check if issue should be merged
    local WORKDIR=$(pwd)
    local BRANCH="feature/$ISSUE_ID"

    if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
      log "Merging $BRANCH..."
      cd "$WORKDIR"

      if git merge "$BRANCH" --no-edit 2>/dev/null; then
        log_ok "Merged $BRANCH"

        # Remove worktree
        git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null || true
        git branch -d "$BRANCH" 2>/dev/null || true

        log_ok "Cleaned up $ISSUE_ID"
      else
        log_warn "Merge conflict for $ISSUE_ID - needs manual resolution"
      fi
    fi
  else
    log "Issue $ISSUE_ID has $REMAINING remaining gates"
  fi
}

# Main loop
main() {
  local RUN_ONCE=false
  [ "$1" = "--once" ] && RUN_ONCE=true

  check_health

  log "Gate Runner started"
  log "Supported gate types: ${!GATE_SKILLS[*]}"
  log "Poll interval: ${POLL_INTERVAL}s, Timeout: ${TIMEOUT}s"
  echo

  while true; do
    # Get all pending gates
    local GATES
    GATES=$(get_pending_gates)
    local COUNT=0
    [ -n "$GATES" ] && COUNT=$(echo "$GATES" | grep -c . 2>/dev/null || echo 0)

    if [ "$COUNT" -eq 0 ]; then
      log "No pending gates"
      $RUN_ONCE && { log "Exiting (--once mode)"; exit 0; }
    else
      log "Found $COUNT pending gate(s)"

      # Process each gate (sequential for safety)
      echo "$GATES" | while IFS= read -r GATE; do
        [ -n "$GATE" ] && process_gate "$GATE"
        echo
      done
    fi

    $RUN_ONCE && { log "Exiting (--once mode)"; exit 0; }

    log "Sleeping ${POLL_INTERVAL}s..."
    sleep "$POLL_INTERVAL"
    echo
  done
}

main "$@"
