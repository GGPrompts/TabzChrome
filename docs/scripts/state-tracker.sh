#!/bin/bash
# Claude Code State Tracker for TabzChrome
# Writes Claude's current state to files that the TabzChrome backend reads
# Audio announcements go through the TabzChrome backend API (Chrome TTS)

set -euo pipefail

# Portable helpers (Linux + macOS)
file_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
portable_md5() { printf '%s' "$1" | md5sum 2>/dev/null | cut -d' ' -f1 || printf '%s' "$1" | md5 2>/dev/null; }

# Configuration
STATE_DIR="/tmp/claude-code-state"
DEBUG_DIR="$STATE_DIR/debug"
SUBAGENT_DIR="$STATE_DIR/subagents"
TABZ_BACKEND="${TABZ_BACKEND_URL:-http://localhost:8129}"
mkdir -p "$STATE_DIR" "$DEBUG_DIR" "$SUBAGENT_DIR"

# Get tmux pane ID if running in tmux
TMUX_PANE="${TMUX_PANE:-none}"

# Read stdin if available (contains hook data from Claude)
# Explicit timeout prevents hanging if Claude keeps stdin open
STDIN_DATA=$(timeout 1 cat 2>/dev/null || echo "")

# Get session identifier
# Priority: 1. CLAUDE_SESSION_ID env var, 2. TMUX_PANE, 3. Working directory hash
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
    SESSION_ID="$CLAUDE_SESSION_ID"
elif [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    SESSION_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
elif [[ -n "$PWD" ]]; then
    SESSION_ID=$(portable_md5 "$PWD" | head -c 12)
else
    SESSION_ID="$$"
fi

STATE_FILE="$STATE_DIR/${SESSION_ID}.json"
SUBAGENT_COUNT_FILE="$SUBAGENT_DIR/${SESSION_ID}.count"

get_subagent_count() {
    cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0"
}

# mkdir-based lock: atomic on all platforms (flock does not exist on macOS)
_subagent_lock_dir() { echo "$SUBAGENT_COUNT_FILE.lock.d"; }

_subagent_lock_acquire() {
    local lock_dir; lock_dir=$(_subagent_lock_dir)
    local attempts=0
    while ! mkdir "$lock_dir" 2>/dev/null; do
        attempts=$((attempts + 1))
        [[ $attempts -ge 20 ]] && return 1
        sleep 0.05
    done
    return 0
}

_subagent_lock_release() { rmdir "$(_subagent_lock_dir)" 2>/dev/null || true; }

increment_subagent_count() {
    _subagent_lock_acquire || return 0
    local count=$(cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0")
    echo $((count + 1)) > "$SUBAGENT_COUNT_FILE"
    _subagent_lock_release
}

decrement_subagent_count() {
    _subagent_lock_acquire || return 0
    local count=$(cat "$SUBAGENT_COUNT_FILE" 2>/dev/null || echo "0")
    local new_count=$((count - 1))
    [[ $new_count -lt 0 ]] && new_count=0
    echo "$new_count" > "$SUBAGENT_COUNT_FILE"
    _subagent_lock_release
}

# Speak via TabzChrome backend (Chrome TTS) - fire and forget
speak_tabz() {
    local text="$1"
    local voice="${2:-en-GB-SoniaNeural}"
    local rate="${3:-+10%}"
    local payload
    payload=$(jq -n --arg text "$text" --arg voice "$voice" --arg rate "$rate" \
        '{text:$text, voice:$voice, rate:$rate, volume:0.8}' 2>/dev/null) || return 0

    curl -s -m 2 -X POST "${TABZ_BACKEND}/api/audio/speak" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        > /dev/null 2>&1 &
}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOOK_TYPE="${1:-unknown}"

# Carry forward existing session_title across hook calls.
# Each hook invocation is a fresh process, so read from the state file.
SESSION_TITLE=$(jq -r '.session_title // ""' "$STATE_FILE" 2>/dev/null || echo "")

# Debug logging for tool events and stop/notification
if [[ "$HOOK_TYPE" == "pre-tool" ]] || [[ "$HOOK_TYPE" == "post-tool" ]] || [[ "$HOOK_TYPE" == "stop" ]] || [[ "$HOOK_TYPE" == "notification" ]]; then
    echo "$STDIN_DATA" > "$DEBUG_DIR/${HOOK_TYPE}-$(date +%s)-$$.json" 2>/dev/null || true
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
                # Skip context files - handled separately below
                if [[ "$filename" == *-context ]]; then continue; fi
                if [[ "$active_panes" == *"$filename"* ]]; then continue; fi
                if [[ "$filename" =~ ^_[0-9]+$ ]]; then rm -f "$file"; continue; fi
                if [[ "$filename" =~ ^[a-f0-9]{12}$ ]]; then
                    file_age=$(($(date +%s) - $(file_mtime "$file")))
                    if [[ $file_age -gt 3600 ]]; then rm -f "$file"; fi
                fi
            done
            # Clean up context files older than 1 hour or orphaned (no parent state file)
            for file in "$STATE_DIR"/*-context.json; do
                [[ -f "$file" ]] || continue
                file_age=$(($(date +%s) - $(file_mtime "$file")))
                parent_file="${file/-context.json/.json}"
                if [[ ! -f "$parent_file" ]] || [[ $file_age -gt 3600 ]]; then
                    rm -f "$file"
                fi
            done
            find "$DEBUG_DIR" -name "*.json" -mmin +60 -delete 2>/dev/null || true
            # Clean stale subagent count files and orphaned lock dirs
            find "$SUBAGENT_DIR" -type f -mmin +240 -delete 2>/dev/null || true
            find "$SUBAGENT_DIR" -maxdepth 1 -name "*.lock.d" -type d -mmin +10 -exec rmdir {} \; 2>/dev/null || true
            # Clean stale claude-sid linkage files
            find "$STATE_DIR" -maxdepth 1 -name "*.claude-sid" -mmin +240 -delete 2>/dev/null || true
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
        # Extract session title from the first user prompt.
        # Only set on first prompt — subsequent prompts ("yes", "looks good")
        # are usually not descriptive. Persist via state file.
        if [[ -z "$SESSION_TITLE" ]]; then
            # Try issue ID first (e.g. "tc-xxxx" or "bd-xxxx")
            _TITLE=$(echo "$PROMPT" | grep -oE '\b[a-z]{2,}-[a-z0-9]{2,}\b' | head -1 || true)
            # Try slash command (e.g. "/commit", "/review-pr 123")
            if [[ -z "$_TITLE" ]]; then
                _TITLE=$(echo "$PROMPT" | grep -oE '^/[a-z-]+(\s+\S+)?' | head -1 || true)
            fi
            # Fallback: first ~60 chars trimmed to word boundary
            if [[ -z "$_TITLE" ]]; then
                _TITLE=$(echo "$PROMPT" | head -c 60 | sed 's/[[:space:]][^[:space:]]*$//' | tr '\n' ' ' | sed 's/[[:space:]]*$//')
            fi
            SESSION_TITLE="$_TITLE"
        fi
        ;;
    pre-tool)
        STATUS="tool_use"
        CURRENT_TOOL=$(echo "$STDIN_DATA" | jq -r '.tool_name // .tool // .name // "unknown"' 2>/dev/null || echo "unknown")
        TOOL_ARGS_STR=$(echo "$STDIN_DATA" | jq -c '.tool_input // .input // .parameters // {}' 2>/dev/null || echo '{}')
        DETAILS=$(jq -n --arg tool "$CURRENT_TOOL" --arg args "$TOOL_ARGS_STR" '{event:"tool_starting",tool:$tool,args:($args|fromjson)}' 2>/dev/null || echo '{"event":"tool_starting"}')
        # NOTE: subagent counting is handled by subagent-start/subagent-stop hooks,
        # NOT here. PreToolUse fires even if the Task is denied or fails.
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
    subagent-start)
        increment_subagent_count
        SUBAGENT_COUNT=$(get_subagent_count)
        STATUS="processing"
        CURRENT_TOOL=""
        AGENT_TYPE=$(echo "$STDIN_DATA" | jq -r '.agent_type // "unknown"' 2>/dev/null || echo "unknown")
        DETAILS=$(jq -n --arg type "$AGENT_TYPE" --arg count "$SUBAGENT_COUNT" '{event:"subagent_started",agent_type:$type,active_subagents:($count|tonumber)}')
        ;;
    subagent-stop)
        decrement_subagent_count
        SUBAGENT_COUNT=$(get_subagent_count)
        CURRENT_TOOL=""
        # When all subagents done, set to awaiting_input (not processing).
        # This prevents stale "processing" state when session ends after subagent work.
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
                # Audio announcement via TabzChrome
                if [[ "${CLAUDE_AUDIO:-0}" == "1" ]]; then
                    SESSION_NAME="${CLAUDE_SESSION_NAME:-Claude}"
                    speak_tabz "$SESSION_NAME ready"
                fi
                ;;
            permission_prompt)
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

# Extract permission_mode from stdin data (indicates plan mode, etc.)
PERMISSION_MODE=$(echo "$STDIN_DATA" | jq -r '.permission_mode // ""' 2>/dev/null || echo "")
[[ "$PERMISSION_MODE" == "null" ]] && PERMISSION_MODE=""

# Resolve claude_session_id (links state file to statusline context data).
# Newer statuslines write a .claude-sid linkage file (avoids a write-write
# race on the state file); older ones wrote the ID into the state file itself.
SID_FILE="$STATE_DIR/${SESSION_ID}.claude-sid"
CLAUDE_SESSION_ID=$(cat "$SID_FILE" 2>/dev/null || echo "")
if [[ -z "$CLAUDE_SESSION_ID" && -f "$STATE_FILE" ]]; then
    CLAUDE_SESSION_ID=$(jq -r '.claude_session_id // ""' "$STATE_FILE" 2>/dev/null) || CLAUDE_SESSION_ID=""
    [[ "$CLAUDE_SESSION_ID" == "null" ]] && CLAUDE_SESSION_ID=""
fi

# If we have claude_session_id, try to read context data written by the statusline
CONTEXT_PERCENT="null"
CONTEXT_WINDOW_SIZE="null"
TOTAL_INPUT_TOKENS="null"
TOTAL_OUTPUT_TOKENS="null"

if [[ -n "$CLAUDE_SESSION_ID" ]]; then
    CONTEXT_FILE="$STATE_DIR/${CLAUDE_SESSION_ID}-context.json"
    # Require -s (non-empty): jq on an empty file exits 0 with empty stdout,
    # which then feeds "" into --argjson below and blows up the whole hook.
    if [[ -s "$CONTEXT_FILE" ]]; then
        # Check if context file is fresh (within 60 seconds)
        CONTEXT_AGE=$(($(date +%s) - $(file_mtime "$CONTEXT_FILE")))
        if [[ $CONTEXT_AGE -lt 60 ]]; then
            CONTEXT_PERCENT=$(jq -r '.context_pct // "null"' "$CONTEXT_FILE" 2>/dev/null || echo "null")
            CONTEXT_WINDOW_SIZE=$(jq -r '.context_window.context_window_size // "null"' "$CONTEXT_FILE" 2>/dev/null || echo "null")
            TOTAL_INPUT_TOKENS=$(jq -r '.context_window.total_input_tokens // "null"' "$CONTEXT_FILE" 2>/dev/null || echo "null")
            TOTAL_OUTPUT_TOKENS=$(jq -r '.context_window.total_output_tokens // "null"' "$CONTEXT_FILE" 2>/dev/null || echo "null")
            # Normalize any empty captures to the literal JSON null so
            # --argjson never sees "".
            [[ -z "$CONTEXT_PERCENT"      ]] && CONTEXT_PERCENT="null"
            [[ -z "$CONTEXT_WINDOW_SIZE"  ]] && CONTEXT_WINDOW_SIZE="null"
            [[ -z "$TOTAL_INPUT_TOKENS"   ]] && TOTAL_INPUT_TOKENS="null"
            [[ -z "$TOTAL_OUTPUT_TOKENS"  ]] && TOTAL_OUTPUT_TOKENS="null"
        fi
    fi
fi

# Build state JSON with jq (safe against special characters in values)
STATE_JSON=$(jq -n \
    --arg session_id "$SESSION_ID" \
    --arg claude_session_id "$CLAUDE_SESSION_ID" \
    --arg status "$STATUS" \
    --arg current_tool "$CURRENT_TOOL" \
    --argjson subagent_count "$SUBAGENT_COUNT" \
    --argjson context_percent "$CONTEXT_PERCENT" \
    --argjson context_window_size "$CONTEXT_WINDOW_SIZE" \
    --argjson input_tokens "$TOTAL_INPUT_TOKENS" \
    --argjson output_tokens "$TOTAL_OUTPUT_TOKENS" \
    --arg working_dir "$PWD" \
    --arg last_updated "$TIMESTAMP" \
    --arg tmux_pane "$TMUX_PANE" \
    --argjson pid "${PPID:-$$}" \
    --arg hook_type "$HOOK_TYPE" \
    --arg session_title "$SESSION_TITLE" \
    --arg permission_mode "$PERMISSION_MODE" \
    --argjson details "$DETAILS" \
    '{
        session_id: $session_id,
        claude_session_id: (if $claude_session_id == "" then null else $claude_session_id end),
        status: $status,
        current_tool: $current_tool,
        subagent_count: $subagent_count,
        context_percent: $context_percent,
        context_window: {
            size: $context_window_size,
            input_tokens: $input_tokens,
            output_tokens: $output_tokens
        },
        working_dir: $working_dir,
        last_updated: $last_updated,
        tmux_pane: $tmux_pane,
        pid: $pid,
        hook_type: $hook_type,
        session_title: (if $session_title == "" then null else $session_title end),
        permission_mode: (if $permission_mode == "" then null else $permission_mode end),
        details: $details
    }'
)

# Atomic write: write to temp file then move (prevents corruption from concurrent writes)
TEMP_FILE="${STATE_FILE}.tmp.$$"
echo "$STATE_JSON" > "$TEMP_FILE" && mv -f "$TEMP_FILE" "$STATE_FILE"

# Also write by pane ID if both session types are available
if [[ "$SESSION_ID" =~ ^[a-f0-9]{12}$ ]] && [[ "$TMUX_PANE" != "none" && -n "$TMUX_PANE" ]]; then
    PANE_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
    PANE_STATE_FILE="$STATE_DIR/${PANE_ID}.json"
    TEMP_PANE_FILE="${PANE_STATE_FILE}.tmp.$$"
    echo "$STATE_JSON" > "$TEMP_PANE_FILE" && mv -f "$TEMP_PANE_FILE" "$PANE_STATE_FILE"
fi

exit 0
