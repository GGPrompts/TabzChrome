#!/bin/bash
# capture-session.sh - Capture worker session transcript before killing
# Usage: capture-session.sh <session-name> <issue-id>
#
# Saves transcript to .beads/transcripts/<issue-id>.txt
# Attaches path to issue notes for later analysis

set -e

SESSION="$1"
ISSUE_ID="$2"
TRANSCRIPT_DIR=".beads/transcripts"

if [ -z "$SESSION" ] || [ -z "$ISSUE_ID" ]; then
  echo "Usage: capture-session.sh <session-name> <issue-id>"
  exit 1
fi

# Validate session exists
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session $SESSION not found, skipping capture"
  exit 0
fi

# Create transcript directory
mkdir -p "$TRANSCRIPT_DIR"

TRANSCRIPT_FILE="$TRANSCRIPT_DIR/${ISSUE_ID}.txt"

# Capture full scrollback buffer (-S - means from start)
{
  echo "=== Session Transcript ==="
  echo "Issue: $ISSUE_ID"
  echo "Session: $SESSION"
  echo "Captured: $(date -Iseconds)"
  echo "==========================="
  echo ""

  # Capture pane content with full history
  tmux capture-pane -t "$SESSION" -p -S - 2>/dev/null || echo "(capture failed)"

} > "$TRANSCRIPT_FILE"

# Get file size
SIZE=$(wc -c < "$TRANSCRIPT_FILE")
LINES=$(wc -l < "$TRANSCRIPT_FILE")

echo "Captured: $TRANSCRIPT_FILE ($LINES lines, $SIZE bytes)"

# Attach transcript path to issue notes
EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
NEW_NOTES="${EXISTING_NOTES}
transcript: $TRANSCRIPT_FILE"

bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null || echo "Warning: Could not update issue notes"

echo "Linked transcript to $ISSUE_ID"
