---
name: gate-runner
description: "Run gates for completed issues - spawns checkpoint profiles, reads results, resolves or reopens"
---

# Gate Runner - Execute Quality Gates

Polls for issues with pending gates, spawns checkpoint workers to evaluate them, reads results, and resolves gates or reopens issues on failure.

## How It Works

1. Check for issues with pending gates (`bd gate list`)
2. For each pending gate:
   a. Map gate type to checkpoint skill
   b. Spawn checkpoint worker in the issue's worktree
   c. Wait for worker to exit
   d. Read `.checkpoints/{skill}.json` result file
   e. `bd gate resolve <id>` on pass, `bd reopen <issue>` on fail
3. When all gates pass -> merge to main

## Gate Type -> Skill Mapping

| Gate Type | Checkpoint Skill | Profile |
|-----------|-----------------|---------|
| `codex-review` | `/codex-review` | codex-reviewer |
| `test-runner` | `/test-runner` | test-runner |
| `visual-qa` | `/visual-qa` | visual-qa |
| `docs-check` | `/docs-check` | docs-checker |
| `human` | (manual) | - |

## Usage

```bash
/conductor:gate-runner
```

Run once to process all pending gates:

```bash
/conductor:gate-runner --once
```

## Implementation

```bash
#!/bin/bash
# Gate Runner - Process pending gates and resolve/reopen

TABZ_API="http://localhost:8129"
TOKEN=$(cat /tmp/tabz-auth-token)
POLL_INTERVAL=15

# Find safe-send-keys.sh
CONDUCTOR_SCRIPTS=$(find ~/plugins ~/.claude/plugins -name "safe-send-keys.sh" -path "*conductor*" -exec dirname {} \; 2>/dev/null | head -1)
SAFE_SEND_KEYS="$CONDUCTOR_SCRIPTS/safe-send-keys.sh"
TIMEOUT=300  # 5 min per checkpoint

# Gate type to skill mapping
declare -A GATE_SKILLS=(
  ["codex-review"]="/codex-review"
  ["test-runner"]="/test-runner"
  ["visual-qa"]="/visual-qa"
  ["docs-check"]="/docs-check"
)

# Pre-flight
check_health() {
  curl -sf "$TABZ_API/api/health" >/dev/null || { echo "TabzChrome not running"; exit 1; }
}

# Get pending gates as JSON
get_pending_gates() {
  bd gate list --json 2>/dev/null | jq -c '.[] | select(.status == "pending")'
}

# Get issue's worktree path
get_worktree_path() {
  local ISSUE_ID="$1"
  local WORKDIR=$(pwd)

  # Check if worktree exists
  if [ -d "$WORKDIR/.worktrees/$ISSUE_ID" ]; then
    echo "$WORKDIR/.worktrees/$ISSUE_ID"
  else
    echo ""
  fi
}

# Spawn checkpoint worker
spawn_checkpoint() {
  local GATE_ID="$1"
  local GATE_TYPE="$2"
  local ISSUE_ID="$3"
  local WORKTREE="$4"

  local SKILL="${GATE_SKILLS[$GATE_TYPE]}"
  if [ -z "$SKILL" ]; then
    echo "Unknown gate type: $GATE_TYPE"
    return 1
  fi

  # Terminal name: gate-{issue}-{type}
  local TERM_NAME="gate-${ISSUE_ID}-${GATE_TYPE}"

  # Plugin directories
  PLUGIN_DIRS="--plugin-dir $HOME/.claude/plugins/marketplaces --plugin-dir $HOME/plugins/my-plugins"

  # Spawn checkpoint worker
  local RESP=$(curl -s -X POST "$TABZ_API/api/spawn" \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{
      \"name\": \"$TERM_NAME\",
      \"workingDir\": \"$WORKTREE\",
      \"command\": \"BEADS_NO_DAEMON=1 claude $PLUGIN_DIRS\"
    }")

  echo "Spawned checkpoint $TERM_NAME"

  # Wait for Claude to initialize
  sleep 8

  # Get session ID
  local SESSION=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')

  if [ -z "$SESSION" ]; then
    echo "Failed to get session for $TERM_NAME"
    return 1
  fi

  # Send the checkpoint skill invocation (use safe-send-keys.sh)
  local PROMPT="Run the checkpoint skill $SKILL for gate $GATE_ID on issue $ISSUE_ID. Write result to .checkpoints/ and exit when done."
  "$SAFE_SEND_KEYS" "$SESSION" "$PROMPT"

  echo "$SESSION"
}

# Wait for checkpoint to complete
wait_for_checkpoint() {
  local TERM_NAME="$1"
  local WORKTREE="$2"
  local GATE_TYPE="$3"
  local TIMEOUT="$4"

  local CHECKPOINT_FILE="$WORKTREE/.checkpoints/${GATE_TYPE}.json"
  local START=$(date +%s)

  while true; do
    # Check if result file exists
    if [ -f "$CHECKPOINT_FILE" ]; then
      echo "Checkpoint complete: $CHECKPOINT_FILE"
      return 0
    fi

    # Check if terminal still exists
    local EXISTS=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')
    if [ -z "$EXISTS" ]; then
      echo "Terminal exited without writing checkpoint"
      return 1
    fi

    # Check timeout
    local NOW=$(date +%s)
    local ELAPSED=$((NOW - START))
    if [ "$ELAPSED" -gt "$TIMEOUT" ]; then
      echo "Checkpoint timed out after ${TIMEOUT}s"
      # Kill the terminal
      curl -s -X DELETE "$TABZ_API/api/agents/$EXISTS" -H "X-Auth-Token: $TOKEN" >/dev/null
      return 1
    fi

    sleep 5
  done
}

# Read checkpoint result
read_checkpoint_result() {
  local WORKTREE="$1"
  local GATE_TYPE="$2"

  local FILE="$WORKTREE/.checkpoints/${GATE_TYPE}.json"
  if [ -f "$FILE" ]; then
    cat "$FILE"
  else
    echo '{"passed": false, "error": "Checkpoint file not found"}'
  fi
}

# Process a single gate
process_gate() {
  local GATE_JSON="$1"

  local GATE_ID=$(echo "$GATE_JSON" | jq -r '.id')
  local GATE_TYPE=$(echo "$GATE_JSON" | jq -r '.type // .gate_type // "unknown"')
  local ISSUE_ID=$(echo "$GATE_JSON" | jq -r '.issue_id // .parent_id // ""')

  echo "Processing gate: $GATE_ID (type: $GATE_TYPE, issue: $ISSUE_ID)"

  # Skip manual gates
  if [ "$GATE_TYPE" = "human" ]; then
    echo "Skipping human gate (requires manual approval)"
    return 0
  fi

  # Get worktree
  local WORKTREE=$(get_worktree_path "$ISSUE_ID")
  if [ -z "$WORKTREE" ]; then
    echo "No worktree found for $ISSUE_ID - skipping"
    return 0
  fi

  # Spawn checkpoint
  local SESSION=$(spawn_checkpoint "$GATE_ID" "$GATE_TYPE" "$ISSUE_ID" "$WORKTREE")
  if [ $? -ne 0 ]; then
    echo "Failed to spawn checkpoint for $GATE_ID"
    return 1
  fi

  local TERM_NAME="gate-${ISSUE_ID}-${GATE_TYPE}"

  # Wait for completion
  wait_for_checkpoint "$TERM_NAME" "$WORKTREE" "$GATE_TYPE" "$TIMEOUT"
  local WAIT_RESULT=$?

  # Kill terminal (cleanup)
  local SESS=$(curl -s "$TABZ_API/api/agents" | jq -r --arg n "$TERM_NAME" '.data[] | select(.name == $n) | .id')
  [ -n "$SESS" ] && curl -s -X DELETE "$TABZ_API/api/agents/$SESS" -H "X-Auth-Token: $TOKEN" >/dev/null

  # Read result
  local RESULT=$(read_checkpoint_result "$WORKTREE" "$GATE_TYPE")
  local PASSED=$(echo "$RESULT" | jq -r '.passed')

  if [ "$PASSED" = "true" ]; then
    echo "Gate $GATE_ID PASSED"
    bd gate resolve "$GATE_ID" --json 2>/dev/null

    # Check if all gates for this issue are now resolved
    check_and_merge "$ISSUE_ID"
  else
    local ERROR=$(echo "$RESULT" | jq -r '.summary // .error // "Unknown failure"')
    echo "Gate $GATE_ID FAILED: $ERROR"
    bd reopen "$ISSUE_ID" --reason "Gate failed: $GATE_TYPE - $ERROR" 2>/dev/null
  fi
}

# Check if all gates passed and merge
check_and_merge() {
  local ISSUE_ID="$1"

  # Check for remaining gates on this issue
  local REMAINING=$(bd gate list --json 2>/dev/null | jq --arg id "$ISSUE_ID" '[.[] | select(.issue_id == $id and .status == "pending")] | length')

  if [ "$REMAINING" = "0" ]; then
    echo "All gates passed for $ISSUE_ID - merging"

    local WORKDIR=$(pwd)

    # Merge the branch
    cd "$WORKDIR"
    git merge "feature/$ISSUE_ID" --no-edit 2>/dev/null

    if [ $? -eq 0 ]; then
      echo "Merged feature/$ISSUE_ID"

      # Remove worktree
      git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null
      git branch -d "feature/$ISSUE_ID" 2>/dev/null

      echo "Cleaned up $ISSUE_ID"
    else
      echo "Merge conflict for $ISSUE_ID - needs manual resolution"
    fi
  fi
}

# Main loop
main() {
  local RUN_ONCE=false
  [ "$1" = "--once" ] && RUN_ONCE=true

  check_health

  echo "Gate Runner started"
  echo "Gate types supported: ${!GATE_SKILLS[*]}"

  while true; do
    # Get all pending gates
    local GATES=$(get_pending_gates)
    local COUNT=$(echo "$GATES" | grep -c . || echo 0)

    if [ "$COUNT" -eq 0 ]; then
      echo "No pending gates"
      $RUN_ONCE && exit 0
    else
      echo "Found $COUNT pending gates"

      # Process each gate (could parallelize in future)
      echo "$GATES" | while read -r GATE; do
        [ -n "$GATE" ] && process_gate "$GATE"
      done
    fi

    $RUN_ONCE && exit 0

    echo "Sleeping ${POLL_INTERVAL}s..."
    sleep "$POLL_INTERVAL"
  done
}

main "$@"
```

## Two-Phase Quality System

Quality checking is split into two phases:

### Phase 1: Pre-commit (Cleanup Agent)

The `cleanup` agent is a **lightweight pre-commit check** that:
- Verifies gates are assigned to the issue
- Checks if any `.checkpoints/*.json` results exist from previous runs
- If checkpoints exist and failed -> blocks commit (worker must fix first)
- Does NOT run gates itself - just checks status

**Cleanup does NOT:**
- Run code review (gate-runner does that)
- Run tests (gate-runner does that)
- Do deep analysis

### Phase 2: Post-close (Gate Runner)

The `gate-runner` handles the actual quality gates after worker closes:
- Spawns checkpoint workers (`/codex-review`, `/test-runner`, etc.)
- Reads `.checkpoints/{type}.json` results
- Passes -> merge to main
- Fails -> reopens issue with reason

### Full Flow

```
+-----------------+     +--------------+     +-------------+     +-------------+
|  /conductor:auto | --> | Worker works | --> |   Cleanup   | --> | Worker closes|
|  spawns workers |     |  on issue    |     | (pre-commit)|     |    issue     |
+-----------------+     +--------------+     +-------------+     +-------------+
                                                    |                    |
                                              +-----+-----+              |
                                              |           |              |
                                        +-----v----+ +----v----+   +-----v-----+
                                        |  PASS    | |NEEDS_WORK|   | Gate Runner|
                                        |(continue)| |(fix+retry)|  | runs gates |
                                        +----------+ +----------+   +-----+-----+
                                                                          |
                                                    +---------------------+-------------------+
                                                    |                                         |
                                              +-----v-----+                           +-------v-------+
                                              |Gates PASS |                           | Gates FAIL    |
                                              |-> Merge   |                           | -> Reopen     |
                                              +-----------+                           +---------------+
```

## Integration with /conductor:auto

The gate-runner can run alongside `/conductor:auto`:

1. **auto** spawns workers for ready issues
2. Workers complete work and commit (cleanup agent does quick check)
3. Workers close issues
4. **gate-runner** runs full quality gates
5. Gates pass -> merge proceeds
6. Gates fail -> issue reopened

## Checkpoint Result Format

All checkpoints write to `.checkpoints/{gate-type}.json`:

```json
{
  "checkpoint": "codex-review",
  "timestamp": "2026-01-19T12:00:00Z",
  "passed": true,
  "issues": [],
  "summary": "No critical issues found"
}
```

Required fields:
- `passed`: boolean - did the gate pass?
- `summary`: string - human-readable result

## Gate Lifecycle

```
Created     ->  Pending  ->  Running  ->  Passed/Failed
(by planner)   (waiting)   (worker)    (resolved/reopen)
```

### Creating Gates

Gates are created during planning:

```bash
# Via bd gate (if supported)
bd gate create --type codex-review --issue V4V-ct9

# Or as blocking issues
bd create "codex-review for V4V-ct9" --type gate --deps "blocks:V4V-ct9"
```

### Resolving Gates

```bash
# On pass
bd gate resolve GATE_ID --result '{"passed": true}'

# On fail
bd reopen ISSUE_ID --reason "Gate failed: codex-review"
```

## Manual Testing

```bash
# List pending gates
bd gate list --json

# Create a test gate (if empty)
bd gate create --type test-runner --issue YOUR_ISSUE_ID

# Run gate-runner once
/conductor:gate-runner --once

# Check results
cat .worktrees/YOUR_ISSUE/.checkpoints/test-runner.json
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| POLL_INTERVAL | 15s | How often to check for gates |
| TIMEOUT | 300s | Max time per checkpoint |
| TABZ_API | localhost:8129 | TabzChrome API endpoint |

## Notes

- Human gates require manual `bd gate resolve`
- Each gate type maps to exactly one checkpoint skill
- Workers write to `.checkpoints/` - results persist after terminal exit
- Gate failure reopens the issue with failure reason
- All gates must pass before merge
- Gate-runner handles one gate at a time (sequential for safety)
