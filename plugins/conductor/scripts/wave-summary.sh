#!/usr/bin/env bash
# Wave Summary Generator
# Usage: wave-summary.sh "ISSUE1 ISSUE2 ISSUE3" [--audio] [--json]
#
# Generates a comprehensive summary of a completed wave including:
# - Issues closed with titles and cost stats
# - Files changed and git stats
# - Total cost across all workers
# - Next wave status
#
# Options:
#   --audio    Send TTS notification via TabzChrome API
#   --json     Output as JSON for programmatic use
#   --quiet    Minimal output (just stats line)

set -e

ISSUES=""
AUDIO_FLAG=""
JSON_FLAG=""
QUIET_FLAG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --audio)
      AUDIO_FLAG="true"
      shift
      ;;
    --json)
      JSON_FLAG="true"
      shift
      ;;
    --quiet)
      QUIET_FLAG="true"
      shift
      ;;
    *)
      ISSUES="$1"
      shift
      ;;
  esac
done

if [ -z "$ISSUES" ]; then
  echo "Usage: wave-summary.sh \"ISSUE1 ISSUE2 ...\" [--audio] [--json] [--quiet]"
  echo ""
  echo "Options:"
  echo "  --audio    Send TTS notification via TabzChrome"
  echo "  --json     Output as JSON"
  echo "  --quiet    Minimal output"
  exit 1
fi

# Count issues
ISSUE_COUNT=$(echo "$ISSUES" | wc -w | tr -d ' ')

# Collect stats from all issues
TOTAL_INPUT=0
TOTAL_CACHE_WRITE=0
TOTAL_CACHE_READ=0
TOTAL_OUTPUT=0
TOTAL_COST=0
TOTAL_TOOLS=0
TOTAL_SKILLS=0
CLOSED_COUNT=0
ISSUE_DATA=""

for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue

  ISSUE_JSON=$(bd show "$ISSUE" --json 2>/dev/null || echo "[]")
  TITLE=$(echo "$ISSUE_JSON" | jq -r '.[0].title // "Unknown"' 2>/dev/null || echo "Unknown")
  STATUS=$(echo "$ISSUE_JSON" | jq -r '.[0].status // "unknown"' 2>/dev/null || echo "unknown")
  NOTES=$(echo "$ISSUE_JSON" | jq -r '.[0].notes // ""' 2>/dev/null || echo "")

  # Extract stats from notes
  INPUT=$(echo "$NOTES" | grep -oP '^input_tokens:\s*\K[0-9]+' | head -1 || echo "0")
  CACHE_W=$(echo "$NOTES" | grep -oP '^cache_write_tokens:\s*\K[0-9]+' | head -1 || echo "0")
  CACHE_R=$(echo "$NOTES" | grep -oP '^cache_read_tokens:\s*\K[0-9]+' | head -1 || echo "0")
  OUTPUT=$(echo "$NOTES" | grep -oP '^output_tokens:\s*\K[0-9]+' | head -1 || echo "0")
  COST=$(echo "$NOTES" | grep -oP '^cost:\s*\$?\K[0-9.]+' | head -1 || echo "0")
  TOOLS=$(echo "$NOTES" | grep -oP '^tool_calls:\s*\K[0-9]+' | head -1 || echo "0")
  SKILLS=$(echo "$NOTES" | grep -oP '^skill_invocations:\s*\K[0-9]+' | head -1 || echo "0")

  # Accumulate totals
  [ -n "$INPUT" ] && [ "$INPUT" != "0" ] && TOTAL_INPUT=$((TOTAL_INPUT + INPUT))
  [ -n "$CACHE_W" ] && [ "$CACHE_W" != "0" ] && TOTAL_CACHE_WRITE=$((TOTAL_CACHE_WRITE + CACHE_W))
  [ -n "$CACHE_R" ] && [ "$CACHE_R" != "0" ] && TOTAL_CACHE_READ=$((TOTAL_CACHE_READ + CACHE_R))
  [ -n "$OUTPUT" ] && [ "$OUTPUT" != "0" ] && TOTAL_OUTPUT=$((TOTAL_OUTPUT + OUTPUT))
  [ -n "$TOOLS" ] && [ "$TOOLS" != "0" ] && TOTAL_TOOLS=$((TOTAL_TOOLS + TOOLS))
  [ -n "$SKILLS" ] && [ "$SKILLS" != "0" ] && TOTAL_SKILLS=$((TOTAL_SKILLS + SKILLS))

  # Sum cost with bc for decimals
  if [ -n "$COST" ] && [ "$COST" != "0" ]; then
    TOTAL_COST=$(echo "$TOTAL_COST + $COST" | bc 2>/dev/null || echo "$TOTAL_COST")
  fi

  if [ "$STATUS" = "closed" ]; then
    CLOSED_COUNT=$((CLOSED_COUNT + 1))
  fi

  # Build issue data for JSON output
  ISSUE_DATA="$ISSUE_DATA{\"id\":\"$ISSUE\",\"title\":\"$TITLE\",\"status\":\"$STATUS\",\"cost\":$COST,\"input_tokens\":${INPUT:-0},\"output_tokens\":${OUTPUT:-0}},"
done

# Remove trailing comma
ISSUE_DATA="${ISSUE_DATA%,}"

# Get git stats
FILES_CHANGED="?"
INSERTIONS="0"
DELETIONS="0"

# Try to get diff stats for the wave
if [ "$ISSUE_COUNT" -gt 0 ]; then
  DIFF_STATS=$(git diff --stat HEAD~$ISSUE_COUNT 2>/dev/null | tail -1 || echo "")
  if [ -n "$DIFF_STATS" ]; then
    FILES_CHANGED=$(echo "$DIFF_STATS" | grep -oE '[0-9]+ files? changed' | grep -oE '[0-9]+' || echo "?")
    INSERTIONS=$(echo "$DIFF_STATS" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    DELETIONS=$(echo "$DIFF_STATS" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")
  fi
fi

# Check for next wave
NEXT_READY=$(bd ready --json 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
BLOCKED_COUNT=$(bd blocked --json 2>/dev/null | jq 'length' 2>/dev/null || echo "0")

# JSON output
if [ "$JSON_FLAG" = "true" ]; then
  jq -n \
    --arg timestamp "$(date -Iseconds)" \
    --argjson issue_count "$ISSUE_COUNT" \
    --argjson closed_count "$CLOSED_COUNT" \
    --argjson total_cost "$TOTAL_COST" \
    --argjson total_input "$TOTAL_INPUT" \
    --argjson total_cache_write "$TOTAL_CACHE_WRITE" \
    --argjson total_cache_read "$TOTAL_CACHE_READ" \
    --argjson total_output "$TOTAL_OUTPUT" \
    --argjson total_tools "$TOTAL_TOOLS" \
    --argjson total_skills "$TOTAL_SKILLS" \
    --arg files_changed "$FILES_CHANGED" \
    --argjson insertions "$INSERTIONS" \
    --argjson deletions "$DELETIONS" \
    --argjson next_ready "$NEXT_READY" \
    --argjson blocked "$BLOCKED_COUNT" \
    "{
      timestamp: \$timestamp,
      wave: {
        issues_total: \$issue_count,
        issues_closed: \$closed_count,
        issues: [$ISSUE_DATA]
      },
      tokens: {
        input: \$total_input,
        cache_write: \$total_cache_write,
        cache_read: \$total_cache_read,
        output: \$total_output,
        total_cost_usd: \$total_cost
      },
      activity: {
        tool_calls: \$total_tools,
        skill_invocations: \$total_skills
      },
      git: {
        files_changed: \$files_changed,
        insertions: \$insertions,
        deletions: \$deletions
      },
      next: {
        ready: \$next_ready,
        blocked: \$blocked
      }
    }"
  exit 0
fi

# Quiet output
if [ "$QUIET_FLAG" = "true" ]; then
  echo "Wave: $CLOSED_COUNT/$ISSUE_COUNT closed | Cost: \$$TOTAL_COST | +$INSERTIONS/-$DELETIONS lines | Next: $NEXT_READY ready"
  exit 0
fi

# Full output
echo ""
echo "========================================================================"
echo "                         WAVE COMPLETE"
echo "========================================================================"
echo ""

# List closed issues with titles
echo "Issues Completed ($CLOSED_COUNT/$ISSUE_COUNT):"
echo "------------------------------------------------------------------------"
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  ISSUE_JSON=$(bd show "$ISSUE" --json 2>/dev/null || echo "[]")
  TITLE=$(echo "$ISSUE_JSON" | jq -r '.[0].title // "Unknown"' 2>/dev/null || echo "Unknown")
  STATUS=$(echo "$ISSUE_JSON" | jq -r '.[0].status // "unknown"' 2>/dev/null || echo "unknown")
  NOTES=$(echo "$ISSUE_JSON" | jq -r '.[0].notes // ""' 2>/dev/null || echo "")
  COST=$(echo "$NOTES" | grep -oP '^cost:\s*\$?\K[0-9.]+' | head -1 || echo "?")

  if [ "$STATUS" = "closed" ]; then
    printf "  [x] %-20s %s (\$%s)\n" "$ISSUE" "$TITLE" "$COST"
  else
    printf "  [ ] %-20s %s (status: %s)\n" "$ISSUE" "$TITLE" "$STATUS"
  fi
done

echo ""
echo "Cost Summary:"
echo "------------------------------------------------------------------------"
echo "  Input Tokens:       $TOTAL_INPUT"
echo "  Cache Write Tokens: $TOTAL_CACHE_WRITE"
echo "  Cache Read Tokens:  $TOTAL_CACHE_READ"
echo "  Output Tokens:      $TOTAL_OUTPUT"
echo "  Tool Calls:         $TOTAL_TOOLS"
echo "  Skill Invocations:  $TOTAL_SKILLS"
echo "  ----------------------------------------"
echo "  Total Cost:         \$$TOTAL_COST"

echo ""
echo "Git Statistics:"
echo "------------------------------------------------------------------------"
echo "  Branches merged:    $ISSUE_COUNT"
echo "  Files changed:      $FILES_CHANGED"
echo "  Lines added:        +$INSERTIONS"
echo "  Lines removed:      -$DELETIONS"

echo ""
echo "Next Steps:"
echo "------------------------------------------------------------------------"
if [ "$NEXT_READY" -gt 0 ]; then
  echo "  $NEXT_READY issues ready for next wave"
  echo "  Run: /conductor:auto"
else
  if [ "$BLOCKED_COUNT" -gt 0 ]; then
    echo "  $BLOCKED_COUNT issues blocked (waiting on dependencies)"
    echo "  Run: bd blocked"
  else
    echo "  Backlog complete! No more issues ready."
  fi
fi

echo ""
echo "------------------------------------------------------------------------"
echo "Completed: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Audio notification if requested
if [ "$AUDIO_FLAG" = "true" ]; then
  if [ "$NEXT_READY" -gt 0 ]; then
    AUDIO_TEXT="Wave complete. $CLOSED_COUNT of $ISSUE_COUNT issues closed. Total cost: $TOTAL_COST dollars. $NEXT_READY more issues ready for next wave."
  else
    AUDIO_TEXT="Wave complete. $CLOSED_COUNT of $ISSUE_COUNT issues closed. Total cost: $TOTAL_COST dollars. Backlog is now empty."
  fi

  # Try TabzChrome API first, fall back to local TTS
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg text "$AUDIO_TEXT" '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
    > /dev/null 2>&1 &
fi
