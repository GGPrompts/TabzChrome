#!/bin/bash
# poll-workers.sh - Background worker status monitor
# Usage: poll-workers.sh [--interval 30] [--output /tmp/worker-status.json]
#
# Polls beads and TabzChrome for worker status, writes JSON to output file.
# Run in background: ./poll-workers.sh &
#
# Output format:
# {
#   "timestamp": "2026-01-20T15:00:00Z",
#   "workers": [...],
#   "closed": [...],
#   "ready": [...],
#   "events": [{"type": "closed", "issue": "V4V-xxx", "at": "..."}]
# }

set -e

INTERVAL=${1:-30}
OUTPUT=${2:-/tmp/worker-status.json}
EVENTS_FILE="/tmp/worker-events.jsonl"

log() {
  echo "[$(date +%H:%M:%S)] $*" >&2
}

# Initialize
log "Starting poll-workers.sh (interval: ${INTERVAL}s, output: $OUTPUT)"
PREV_CLOSED=""

while true; do
  # Get current state
  WORKERS=$(curl -sf http://localhost:8129/api/agents 2>/dev/null | jq -c '.data // []' || echo '[]')
  IN_PROGRESS=$(bd list --status in_progress --json 2>/dev/null | jq -c '.' || echo '[]')
  CLOSED=$(bd list --status closed --json 2>/dev/null | jq -c '[.[-10:][].id]' || echo '[]')
  READY=$(bd ready --json 2>/dev/null | jq -c '[.[].id]' || echo '[]')

  # Detect newly closed issues (compare with previous)
  EVENTS="[]"
  if [ -n "$PREV_CLOSED" ]; then
    # Find IDs in CLOSED that weren't in PREV_CLOSED
    NEW_CLOSED=$(echo "$CLOSED" | jq -c --argjson prev "$PREV_CLOSED" '[.[] | select(. as $id | $prev | index($id) | not)]')

    if [ "$NEW_CLOSED" != "[]" ]; then
      # Generate events for each newly closed issue
      TIMESTAMP=$(date -Iseconds)
      EVENTS=$(echo "$NEW_CLOSED" | jq -c --arg ts "$TIMESTAMP" '[.[] | {type: "closed", issue: ., at: $ts}]')

      # Append to events file
      echo "$EVENTS" | jq -c '.[]' >> "$EVENTS_FILE"

      # Log
      log "Detected closed: $(echo "$NEW_CLOSED" | jq -r 'join(", ")')"
    fi
  fi
  PREV_CLOSED="$CLOSED"

  # Extract worker sessions that correspond to in-progress beads issues.
  # Avoid brittle regexes (beads IDs are often lowercase like bd-xxxx).
  IN_PROGRESS_IDS=$(echo "$IN_PROGRESS" | jq -c '[.[].id]' 2>/dev/null || echo '[]')
  WORKER_ISSUES=$(echo "$WORKERS" | jq -c --argjson ids "$IN_PROGRESS_IDS" \
    '[.[] | select(.name as $n | $ids | index($n)) | {id: .id, name: .name, state: .state}]' 2>/dev/null || echo '[]')

  # Build status JSON
  jq -n \
    --arg ts "$(date -Iseconds)" \
    --argjson workers "$WORKER_ISSUES" \
    --argjson in_progress "$IN_PROGRESS" \
    --argjson closed "$CLOSED" \
    --argjson ready "$READY" \
    --argjson events "$EVENTS" \
    '{
      timestamp: $ts,
      workers: $workers,
      in_progress: ($in_progress | map({id, title})),
      closed: $closed,
      ready: $ready,
      events: $events
    }' > "$OUTPUT"

  sleep "$INTERVAL"
done
