#!/bin/bash
# capture-session.sh - Capture worker session transcript and usage stats
# Usage: capture-session.sh <session-name> <issue-id> [working-dir]
#
# Saves transcript to .beads/transcripts/<issue-id>.txt
# Reads actual token usage from Claude's session JSONL files
# Attaches stats to issue notes for cost tracking
#
# Environment:
#   TRANSCRIPT_DIR - Override transcript directory (default: .beads/transcripts)

set -e

SESSION="$1"
ISSUE_ID="$2"
WORKING_DIR="${3:-$(pwd)}"
TRANSCRIPT_DIR="${TRANSCRIPT_DIR:-.beads/transcripts}"

if [ -z "$SESSION" ] || [ -z "$ISSUE_ID" ]; then
  echo "Usage: capture-session.sh <session-name> <issue-id> [working-dir]"
  echo ""
  echo "Captures Claude session transcript and token usage stats."
  echo "Stats are extracted from Claude's session JSONL files."
  exit 1
fi

# Validate session exists (graceful skip if not)
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

# ============================================================================
# TOKEN USAGE: Read from Claude's session JSONL files (authoritative source)
# ============================================================================
# Claude stores usage data in ~/.claude/projects/<encoded-path>/<session-id>.jsonl
# Each assistant message has .message.usage with token counts

get_session_usage() {
  local PROJECT_DIR="$1"
  local ENCODED_PATH

  # Encode the project path (replace / with -)
  ENCODED_PATH=$(echo "$PROJECT_DIR" | sed 's|^/||; s|/|-|g')

  # Find the most recent session file for this project
  local CLAUDE_PROJECT_DIR="$HOME/.claude/projects/-${ENCODED_PATH}"

  if [ ! -d "$CLAUDE_PROJECT_DIR" ]; then
    echo "0 0 0 0"  # input cache_create cache_read output
    return
  fi

  # Get the most recently modified session file
  local SESSION_FILE
  SESSION_FILE=$(ls -t "$CLAUDE_PROJECT_DIR"/*.jsonl 2>/dev/null | head -1)

  if [ -z "$SESSION_FILE" ] || [ ! -f "$SESSION_FILE" ]; then
    echo "0 0 0 0"
    return
  fi

  # Sum up usage from assistant messages (streaming for large files)
  # Filter to assistant type first, then extract usage
  grep '"type":"assistant"' "$SESSION_FILE" 2>/dev/null | \
    jq -s '
      [.[].message.usage | select(. != null)] |
      {
        input: (map(.input_tokens // 0) | add // 0),
        cache_create: (map(.cache_creation_input_tokens // 0) | add // 0),
        cache_read: (map(.cache_read_input_tokens // 0) | add // 0),
        output: (map(.output_tokens // 0) | add // 0)
      } |
      "\(.input) \(.cache_create) \(.cache_read) \(.output)"
    ' 2>/dev/null || echo "0 0 0 0"
}

# Get working directory from session (or use provided)
WORKER_CWD=$(tmux display-message -t "$SESSION" -p '#{pane_current_path}' 2>/dev/null || echo "$WORKING_DIR")

# Get usage stats from Claude's session files
USAGE_STATS=$(get_session_usage "$WORKER_CWD")
# Remove any quotes from jq output
USAGE_STATS=$(echo "$USAGE_STATS" | tr -d '"')
read -r INPUT_TOKENS CACHE_CREATE CACHE_READ OUTPUT_TOKENS <<< "$USAGE_STATS"

# Ensure numeric values (default to 0 if empty)
INPUT_TOKENS=${INPUT_TOKENS:-0}
CACHE_CREATE=${CACHE_CREATE:-0}
CACHE_READ=${CACHE_READ:-0}
OUTPUT_TOKENS=${OUTPUT_TOKENS:-0}

# Calculate approximate cost (Claude Opus 4.5 pricing as of 2025)
# Input: $15/1M, Output: $75/1M, Cache write: $18.75/1M, Cache read: $1.875/1M
COST=$(echo "scale=4; ($INPUT_TOKENS * 0.000015) + ($OUTPUT_TOKENS * 0.000075) + ($CACHE_CREATE * 0.00001875) + ($CACHE_READ * 0.000001875)" | bc 2>/dev/null || echo "0")

# Count tool calls and skill invocations from transcript
TOOL_CALLS=$(grep -cE '(Read|Write|Edit|Bash|Glob|Grep|WebFetch|WebSearch|Task)\(' "$RAW_CAPTURE" 2>/dev/null) || TOOL_CALLS=0
SKILL_INVOCATIONS=$(grep -cE '^/[a-z]' "$RAW_CAPTURE" 2>/dev/null) || SKILL_INVOCATIONS=0

# Build transcript with header
{
  echo "=== Session Transcript ==="
  echo "Issue: $ISSUE_ID"
  echo "Session: $SESSION"
  echo "Working Dir: $WORKER_CWD"
  echo "Captured: $(date -Iseconds)"
  echo ""
  echo "=== Usage Stats (from Claude session files) ==="
  echo "Input Tokens: $INPUT_TOKENS"
  echo "Cache Write Tokens: $CACHE_CREATE"
  echo "Cache Read Tokens: $CACHE_READ"
  echo "Output Tokens: $OUTPUT_TOKENS"
  echo "Estimated Cost: \$${COST}"
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
echo "  Tokens: ${INPUT_TOKENS} in + ${CACHE_CREATE} cache_w + ${CACHE_READ} cache_r / ${OUTPUT_TOKENS} out"
echo "  Cost: \$${COST}, Tools: $TOOL_CALLS, Skills: $SKILL_INVOCATIONS"

# Attach transcript path AND stats to issue notes (if issue exists)
ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>/dev/null)
if [ -n "$ISSUE_JSON" ] && echo "$ISSUE_JSON" | jq -e '.[0]' >/dev/null 2>&1; then
  EXISTING_NOTES=$(echo "$ISSUE_JSON" | jq -r '.[0].notes // ""')

  # Remove any existing stats lines to avoid duplication
  CLEAN_NOTES=$(echo "$EXISTING_NOTES" | grep -v '^transcript:' | grep -v '^input_tokens:' | grep -v '^cache_.*_tokens:' | grep -v '^output_tokens:' | grep -v '^cost:' | grep -v '^tool_calls:' | grep -v '^skill_invocations:')

  NEW_NOTES="${CLEAN_NOTES}
transcript: $TRANSCRIPT_FILE
input_tokens: $INPUT_TOKENS
cache_write_tokens: $CACHE_CREATE
cache_read_tokens: $CACHE_READ
output_tokens: $OUTPUT_TOKENS
cost: \$${COST}
tool_calls: $TOOL_CALLS
skill_invocations: $SKILL_INVOCATIONS"

  bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null && echo "Linked transcript and stats to $ISSUE_ID" || echo "Warning: Could not update issue notes"
else
  echo "Note: Issue $ISSUE_ID not found in beads, transcript saved but not linked"
fi
