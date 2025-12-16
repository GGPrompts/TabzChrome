#!/bin/bash
# Claude Code State Tracker for TabzChrome
# Writes Claude's current state to files that TabzChrome backend reads
# Audio announcements go through TabzChrome backend API (Chrome TTS)

set -euo pipefail

# Configuration
STATE_DIR="/tmp/claude-code-state"
DEBUG_DIR="$STATE_DIR/debug"
SUBAGENT_DIR="$STATE_DIR/subagents"
TABZ_BACKEND="${TABZ_BACKEND_URL:-http://localhost:8129}"
mkdir -p "$STATE_DIR" "$DEBUG_DIR" "$SUBAGENT_DIR"

# Get tmux pane ID if running in tmux
TMUX_PANE="${TMUX_PANE:-none}"

# Read stdin if available (contains hook data from Claude)
STDIN_DATA=$(timeout 0.1 cat 2>/dev/null || echo "")

# Get session identifier - works with tmux or directory-based
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
    SESSION_ID="$CLAUDE_SESSION_ID"
elif [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    SESSION_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
elif [[ -n "$PWD" ]]; then
    SESSION_ID=$(echo "$PWD" | md5sum | cut -d' ' -f1 | head -c 12)
else
    SESSION_ID="$$"
fi

STATE_FILE="$STATE_DIR/${SESSION_ID}.json"
SUBAGENT_COUNT_FILE="$SUBAGENT_DIR/${SESSION_ID}.count"

get_subagent_count() {
    cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0"
}

increment_subagent_count() {
    (
        flock -x 200
        local count=$(cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0")
        echo $((count + 1)) > "$SUBAGENT_COUNT_FILE"
    ) 200>"$SUBAGENT_COUNT_FILE.lock"
}

decrement_subagent_count() {
    (
        flock -x 200
        local count=$(cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0")
        local new_count=$((count - 1))
        [[ $new_count -lt 0 ]] && new_count=0
        echo "$new_count" > "$SUBAGENT_COUNT_FILE"
    ) 200>"$SUBAGENT_COUNT_FILE.lock"
}

# Speak via TabzChrome backend (Chrome TTS) - fire and forget
speak_tabz() {
    local text="$1"
    local voice="${2:-en-GB-SoniaNeural}"
    local rate="${3:-+10%}"

    # Fire and forget - don't wait for response
    curl -s -X POST "${TABZ_BACKEND}/api/audio/speak" \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"$text\", \"voice\": \"$voice\", \"rate\": \"$rate\", \"volume\": 0.8}" \
        > /dev/null 2>&1 &
}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOOK_TYPE="${1:-unknown}"

# Debug logging for tool events
if [[ "$HOOK_TYPE" == "pre-tool" ]] || [[ "$HOOK_TYPE" == "post-tool" ]]; then
    echo "$STDIN_DATA" > "$DEBUG_DIR/${HOOK_TYPE}-$(date +%s%N)-$$.json" 2>/dev/null || true
fi

case "$HOOK_TYPE" in
    session-start)
        STATUS="idle"
        CURRENT_TOOL=""
        DETAILS='{"event":"session_started"}'
        echo "0" > "$SUBAGENT_COUNT_FILE"
        # Cleanup old state files in background
        (
            active_panes=$(tmux list-panes -a -F '#{pane_id}' 2>/dev/null | sed 's/[^a-zA-Z0-9_-]/_/g' || echo "")
            for file in "$STATE_DIR"/*.json; do
                [[ -f "$file" ]] || continue
                filename=$(basename "$file" .json)
                if [[ "$filename" == *-context ]]; then continue; fi
                if [[ "$active_panes" == *"$filename"* ]]; then continue; fi
                if [[ "$filename" =~ ^_[0-9]+$ ]]; then rm -f "$file"; continue; fi
                if [[ "$filename" =~ ^[a-f0-9]{12}$ ]]; then
                    file_age=$(($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || echo 0)))
                    if [[ $file_age -gt 3600 ]]; then rm -f "$file"; fi
                fi
            done
            find "$DEBUG_DIR" -name "*.json" -mmin +60 -delete 2>/dev/null || true
        ) &
        # Audio announcement via TabzChrome
        if [[ "${CLAUDE_AUDIO:-0}" == "1" ]]; then
            SESSION_NAME="${CLAUDE_SESSION_NAME:-Claude}"
            speak_tabz "$SESSION_NAME session started"
        fi
        ;;
    user-prompt)
        STATUS="processing"
        CURRENT_TOOL=""
        PROMPT=$(echo "$STDIN_DATA" | jq -r '.prompt // "unknown"' 2>/dev/null || echo "unknown")
        DETAILS=$(jq -n --arg prompt "$PROMPT" '{event:"user_prompt_submitted",last_prompt:$prompt}')
        ;;
    pre-tool)
        STATUS="tool_use"
        CURRENT_TOOL=$(echo "$STDIN_DATA" | jq -r '.tool_name // .tool // .name // "unknown"' 2>/dev/null || echo "unknown")
        TOOL_ARGS_STR=$(echo "$STDIN_DATA" | jq -c '.tool_input // .input // .parameters // {}' 2>/dev/null || echo '{}')
        DETAILS=$(jq -n --arg tool "$CURRENT_TOOL" --arg args "$TOOL_ARGS_STR" '{event:"tool_starting",tool:$tool,args:($args|fromjson)}' 2>/dev/null || echo '{"event":"tool_starting"}')
        if [[ "$CURRENT_TOOL" == "Task" ]]; then increment_subagent_count; fi
        # Audio announcement via TabzChrome
        if [[ "${CLAUDE_AUDIO:-0}" == "1" ]]; then
            TOOL_DETAIL=""
            case "$CURRENT_TOOL" in
                Read|Write|Edit) TOOL_DETAIL=$(echo "$STDIN_DATA" | jq -r '.tool_input.file_path // .input.file_path // ""' 2>/dev/null | xargs basename 2>/dev/null || echo "") ;;
                Bash) TOOL_DETAIL=$(echo "$STDIN_DATA" | jq -r '.tool_input.command // .input.command // ""' 2>/dev/null | head -c 30 || echo "") ;;
                Glob|Grep) TOOL_DETAIL=$(echo "$STDIN_DATA" | jq -r '.tool_input.pattern // .input.pattern // ""' 2>/dev/null || echo "") ;;
                Task) TOOL_DETAIL=$(echo "$STDIN_DATA" | jq -r '.tool_input.description // .input.description // ""' 2>/dev/null || echo "") ;;
                WebFetch|WebSearch) TOOL_DETAIL=$(echo "$STDIN_DATA" | jq -r '.tool_input.url // .tool_input.query // .input.url // .input.query // ""' 2>/dev/null || echo "") ;;
            esac
            if [[ -n "$TOOL_DETAIL" ]]; then
                case "$CURRENT_TOOL" in
                    Read) speak_tabz "Reading $TOOL_DETAIL" ;;
                    Write) speak_tabz "Writing $TOOL_DETAIL" ;;
                    Edit) speak_tabz "Editing $TOOL_DETAIL" ;;
                    Bash) speak_tabz "Running $TOOL_DETAIL" ;;
                    Glob) speak_tabz "Finding $TOOL_DETAIL" ;;
                    Grep) speak_tabz "Searching $TOOL_DETAIL" ;;
                    Task) speak_tabz "Agent: $TOOL_DETAIL" ;;
                    WebFetch) speak_tabz "Fetching $TOOL_DETAIL" ;;
                    WebSearch) speak_tabz "Searching $TOOL_DETAIL" ;;
                    *) speak_tabz "$CURRENT_TOOL $TOOL_DETAIL" ;;
                esac
            fi
        fi
        ;;
    post-tool)
        STATUS="processing"
        CURRENT_TOOL=$(echo "$STDIN_DATA" | jq -r '.tool_name // .tool // .name // "unknown"' 2>/dev/null || echo "unknown")
        TOOL_ARGS_STR=$(echo "$STDIN_DATA" | jq -c '.tool_input // .input // .parameters // {}' 2>/dev/null || echo '{}')
        DETAILS=$(jq -n --arg tool "$CURRENT_TOOL" --arg args "$TOOL_ARGS_STR" '{event:"tool_completed",tool:$tool,args:($args|fromjson)}' 2>/dev/null || echo '{"event":"tool_completed"}')
        ;;
    stop)
        STATUS="awaiting_input"
        CURRENT_TOOL=""
        DETAILS='{"event":"claude_stopped","waiting_for_user":true}'
        # Audio announcement via TabzChrome
        if [[ "${CLAUDE_AUDIO:-0}" == "1" ]]; then
            SESSION_NAME="${CLAUDE_SESSION_NAME:-Claude}"
            speak_tabz "$SESSION_NAME ready for input"
        fi
        ;;
    subagent-stop)
        decrement_subagent_count
        SUBAGENT_COUNT=$(get_subagent_count)
        CURRENT_TOOL=""
        if [[ "$SUBAGENT_COUNT" -eq 0 ]]; then
            STATUS="awaiting_input"
            DETAILS='{"event":"subagent_stopped","remaining_subagents":0,"all_complete":true}'
        else
            STATUS="processing"
            DETAILS=$(jq -n --arg count "$SUBAGENT_COUNT" '{event:"subagent_stopped",remaining_subagents:($count|tonumber)}')
        fi
        ;;
    notification)
        NOTIF_TYPE=$(echo "$STDIN_DATA" | jq -r '.notification_type // "unknown"' 2>/dev/null || echo "unknown")
        case "$NOTIF_TYPE" in
            idle_prompt|awaiting-input)
                STATUS="awaiting_input"
                CURRENT_TOOL=""
                DETAILS='{"event":"awaiting_input_bell"}'
                ;;
            *)
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

SUBAGENT_COUNT=$(get_subagent_count)

STATE_JSON=$(cat <<EOF
{
  "session_id": "$SESSION_ID",
  "status": "$STATUS",
  "current_tool": "$CURRENT_TOOL",
  "subagent_count": $SUBAGENT_COUNT,
  "working_dir": "$PWD",
  "last_updated": "$TIMESTAMP",
  "tmux_pane": "$TMUX_PANE",
  "pid": $$,
  "hook_type": "$HOOK_TYPE",
  "details": $DETAILS
}
EOF
)

echo "$STATE_JSON" > "$STATE_FILE"

# Also write by pane ID if both session types are available
if [[ "$SESSION_ID" =~ ^[a-f0-9]{12}$ ]] && [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    PANE_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
    PANE_STATE_FILE="$STATE_DIR/${PANE_ID}.json"
    echo "$STATE_JSON" > "$PANE_STATE_FILE"
fi

exit 0
