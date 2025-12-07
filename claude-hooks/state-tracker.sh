#!/bin/bash
# Claude Code State Tracker (Unified for Tmuxplexer + Terminal-Tabs)
# Writes Claude's current state to files that both projects can read

set -euo pipefail

# Configuration
STATE_DIR="/tmp/claude-code-state"
DEBUG_DIR="$STATE_DIR/debug"
mkdir -p "$STATE_DIR" "$DEBUG_DIR"

# Get tmux pane ID if running in tmux
TMUX_PANE="${TMUX_PANE:-none}"

# Read stdin if available (contains hook data from Claude)
# Always try to read stdin with timeout to avoid hanging
STDIN_DATA=$(timeout 0.1 cat 2>/dev/null || echo "")

# Get session identifier - UNIFIED STRATEGY for both projects
# Priority: 1. CLAUDE_SESSION_ID env var, 2. TMUX_PANE (for tmuxplexer), 3. Working directory hash (for terminal-tabs)
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
    SESSION_ID="$CLAUDE_SESSION_ID"
elif [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    # Use tmux pane ID (sanitize for filename - tmuxplexer compatibility)
    SESSION_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
elif [[ -n "$PWD" ]]; then
    # Use working directory hash (terminal-tabs compatibility)
    SESSION_ID=$(echo "$PWD" | md5sum | cut -d' ' -f1 | head -c 12)
else
    # Fallback to PID (less reliable)
    SESSION_ID="$$"
fi

STATE_FILE="$STATE_DIR/${SESSION_ID}.json"

# Get current timestamp in ISO 8601
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Hook type passed as first argument
HOOK_TYPE="${1:-unknown}"

# Debug: Log stdin for tool hooks to see what Claude sends
if [[ "$HOOK_TYPE" == "pre-tool" ]] || [[ "$HOOK_TYPE" == "post-tool" ]]; then
    echo "$STDIN_DATA" > "$DEBUG_DIR/${HOOK_TYPE}-$(date +%s).json" 2>/dev/null || true
fi

# Determine state based on hook type
case "$HOOK_TYPE" in
    session-start)
        STATUS="idle"
        CURRENT_TOOL=""
        DETAILS='{"event":"session_started"}'
        ;;

    user-prompt)
        STATUS="processing"
        CURRENT_TOOL=""
        # Extract prompt from stdin if available
        PROMPT=$(echo "$STDIN_DATA" | jq -r '.prompt // "unknown"' 2>/dev/null || echo "unknown")
        DETAILS=$(jq -n --arg prompt "$PROMPT" '{event:"user_prompt_submitted",last_prompt:$prompt}')
        ;;

    pre-tool)
        STATUS="tool_use"
        # Extract tool name from stdin - try multiple field names (improved compatibility)
        CURRENT_TOOL=$(echo "$STDIN_DATA" | jq -r '.tool_name // .tool // .name // "unknown"' 2>/dev/null || echo "unknown")
        # Store args as string to avoid --argjson issues
        TOOL_ARGS_STR=$(echo "$STDIN_DATA" | jq -c '.tool_input // .input // .parameters // {}' 2>/dev/null || echo '{}')
        DETAILS=$(jq -n --arg tool "$CURRENT_TOOL" --arg args "$TOOL_ARGS_STR" '{event:"tool_starting",tool:$tool,args:($args|fromjson)}' 2>/dev/null || echo '{"event":"tool_starting"}')
        ;;

    post-tool)
        STATUS="processing"
        # Tool just finished, Claude is processing results (shows ⏳ between tools)
        CURRENT_TOOL=$(echo "$STDIN_DATA" | jq -r '.tool_name // .tool // .name // "unknown"' 2>/dev/null || echo "unknown")
        DETAILS=$(jq -n --arg tool "$CURRENT_TOOL" '{event:"tool_completed",tool:$tool}')
        ;;

    stop)
        STATUS="awaiting_input"
        CURRENT_TOOL=""
        DETAILS='{"event":"claude_stopped","waiting_for_user":true}'
        ;;

    notification)
        # Check notification type from stdin
        # Note: With matchers in settings.json, only specific notification types trigger this hook
        # Current matcher: "idle_prompt" - filters to only idle/awaiting-input notifications
        NOTIF_TYPE=$(echo "$STDIN_DATA" | jq -r '.notification_type // "unknown"' 2>/dev/null || echo "unknown")
        case "$NOTIF_TYPE" in
            idle_prompt|awaiting-input)
                # Claude is waiting for user input (>60 seconds idle)
                STATUS="awaiting_input"
                CURRENT_TOOL=""
                DETAILS='{"event":"awaiting_input_bell"}'
                ;;
            permission_prompt)
                # Claude needs permission (keep current status but flag)
                if [[ -f "$STATE_FILE" ]]; then
                    STATUS=$(jq -r '.status // "idle"' "$STATE_FILE")
                    CURRENT_TOOL=$(jq -r '.current_tool // ""' "$STATE_FILE")
                else
                    STATUS="idle"
                    CURRENT_TOOL=""
                fi
                DETAILS='{"event":"permission_prompt"}'
                ;;
            *)
                # Other notifications: preserve existing state
                if [[ -f "$STATE_FILE" ]]; then
                    STATUS=$(jq -r '.status // "idle"' "$STATE_FILE")
                    CURRENT_TOOL=$(jq -r '.current_tool // ""' "$STATE_FILE")
                else
                    STATUS="idle"
                    CURRENT_TOOL=""
                fi
                DETAILS=$(jq -n --arg type "$NOTIF_TYPE" '{event:"notification",type:$type}')
                ;;
        esac
        ;;

    *)
        # Unknown hook type - preserve state
        if [[ -f "$STATE_FILE" ]]; then
            STATUS=$(jq -r '.status // "idle"' "$STATE_FILE")
            CURRENT_TOOL=$(jq -r '.current_tool // ""' "$STATE_FILE")
        else
            STATUS="idle"
            CURRENT_TOOL=""
        fi
        DETAILS=$(jq -n --arg hook "$HOOK_TYPE" '{event:"unknown_hook",hook:$hook}')
        ;;
esac

# Build state JSON
STATE_JSON=$(cat <<EOF
{
  "session_id": "$SESSION_ID",
  "status": "$STATUS",
  "current_tool": "$CURRENT_TOOL",
  "working_dir": "$PWD",
  "last_updated": "$TIMESTAMP",
  "tmux_pane": "$TMUX_PANE",
  "pid": $$,
  "hook_type": "$HOOK_TYPE",
  "details": $DETAILS
}
EOF
)

# Write state to primary file
echo "$STATE_JSON" > "$STATE_FILE"

# ALSO write to alternate naming strategies for cross-compatibility
# This ensures both tmuxplexer AND statusline can find the state

# If we're in tmux, ALSO write using PWD hash (for statusline)
if [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]] && [[ -n "$PWD" ]]; then
    PWD_HASH=$(echo "$PWD" | md5sum | cut -d' ' -f1 | head -c 12)
    PWD_STATE_FILE="$STATE_DIR/${PWD_HASH}.json"
    echo "$STATE_JSON" > "$PWD_STATE_FILE"
fi

# If we're using PWD hash, ALSO write using TMUX_PANE (for tmuxplexer)
if [[ "$SESSION_ID" =~ ^[a-f0-9]{12}$ ]] && [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    PANE_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
    PANE_STATE_FILE="$STATE_DIR/${PANE_ID}.json"
    echo "$STATE_JSON" > "$PANE_STATE_FILE"
fi

# Cleanup old state files (older than 24 hours)
find "$STATE_DIR" -name "*.json" -mtime +1 -delete 2>/dev/null || true

exit 0
