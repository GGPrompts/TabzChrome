#!/bin/bash
# capture-session.sh - Capture worker session transcript before killing
# Usage: capture-session.sh <session-name> <issue-id>
#
# Saves transcript to .beads/transcripts/<issue-id>.txt
# Extracts token usage and cost information
# Attaches stats to issue notes for tracking

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
RAW_CAPTURE=$(mktemp)

# Capture full scrollback buffer (-S - means from start)
tmux capture-pane -t "$SESSION" -p -S - 2>/dev/null > "$RAW_CAPTURE" || echo "(capture failed)" > "$RAW_CAPTURE"

# Extract token/cost information from Claude Code output
# Claude Code shows: "Cost: $X.XX" and token counts in various formats
TOTAL_COST=$(grep -oE '\$[0-9]+\.[0-9]+' "$RAW_CAPTURE" | tail -1 | tr -d '$' || echo "0")
TOTAL_TOKENS_IN=$(grep -oE '[0-9,]+[kK]? (input|in)' "$RAW_CAPTURE" | tail -1 | grep -oE '[0-9,]+' | tr -d ',' || echo "0")
TOTAL_TOKENS_OUT=$(grep -oE '[0-9,]+[kK]? (output|out)' "$RAW_CAPTURE" | tail -1 | grep -oE '[0-9,]+' | tr -d ',' || echo "0")

# Try to extract from Claude's session summary format (if present)
# Format varies: "Input: XXX tokens, Output: XXX tokens" or compact forms
if [ "$TOTAL_TOKENS_IN" = "0" ]; then
  TOTAL_TOKENS_IN=$(grep -oiE 'input:?\s*[0-9,]+' "$RAW_CAPTURE" | tail -1 | grep -oE '[0-9,]+' | tr -d ',' || echo "0")
fi
if [ "$TOTAL_TOKENS_OUT" = "0" ]; then
  TOTAL_TOKENS_OUT=$(grep -oiE 'output:?\s*[0-9,]+' "$RAW_CAPTURE" | tail -1 | grep -oE '[0-9,]+' | tr -d ',' || echo "0")
fi

# Count tool calls (rough estimate based on common patterns)
TOOL_CALLS=$(grep -cE '(Read|Write|Edit|Bash|Glob|Grep|WebFetch|WebSearch)\(' "$RAW_CAPTURE" 2>/dev/null || echo "0")

# Count skill invocations
SKILL_INVOCATIONS=$(grep -cE '^/[a-z]+-[a-z]+' "$RAW_CAPTURE" 2>/dev/null || echo "0")

# Build transcript with header
{
  echo "=== Session Transcript ==="
  echo "Issue: $ISSUE_ID"
  echo "Session: $SESSION"
  echo "Captured: $(date -Iseconds)"
  echo ""
  echo "=== Usage Stats ==="
  echo "Cost: \$${TOTAL_COST:-0}"
  echo "Tokens In: ${TOTAL_TOKENS_IN:-0}"
  echo "Tokens Out: ${TOTAL_TOKENS_OUT:-0}"
  echo "Tool Calls: $TOOL_CALLS"
  echo "Skill Invocations: $SKILL_INVOCATIONS"
  echo "==========================="
  echo ""
  cat "$RAW_CAPTURE"
} > "$TRANSCRIPT_FILE"

rm -f "$RAW_CAPTURE"

# Get file size
SIZE=$(wc -c < "$TRANSCRIPT_FILE")
LINES=$(wc -l < "$TRANSCRIPT_FILE")

echo "Captured: $TRANSCRIPT_FILE ($LINES lines, $SIZE bytes)"
echo "  Cost: \$${TOTAL_COST:-0}, Tokens: ${TOTAL_TOKENS_IN:-0} in / ${TOTAL_TOKENS_OUT:-0} out, Tools: $TOOL_CALLS"

# Attach transcript path AND stats to issue notes
EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
NEW_NOTES="${EXISTING_NOTES}
transcript: $TRANSCRIPT_FILE
cost: \$${TOTAL_COST:-0}
tokens_in: ${TOTAL_TOKENS_IN:-0}
tokens_out: ${TOTAL_TOKENS_OUT:-0}
tool_calls: $TOOL_CALLS
skill_invocations: $SKILL_INVOCATIONS"

bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null || echo "Warning: Could not update issue notes"

echo "Linked transcript and stats to $ISSUE_ID"
