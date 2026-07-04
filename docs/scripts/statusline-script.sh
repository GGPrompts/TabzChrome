#!/bin/bash
# Minimal Claude Code statusline for TabzChrome context % display.
#
# Claude Code pipes status JSON to this script on every update. We write the
# context-window data to /tmp/claude-code-state/ where the state tracker and
# the TabzChrome backend pick it up, then print a simple status line.
#
# Install:
#   cp docs/scripts/statusline-script.sh ~/.claude/hooks/
#   chmod +x ~/.claude/hooks/statusline-script.sh
# Then in ~/.claude/settings.json:
#   "statusLine": { "type": "command", "command": "~/.claude/hooks/statusline-script.sh" }

# Portable helpers (Linux + macOS)
portable_md5() { printf '%s' "$1" | md5sum 2>/dev/null | cut -d' ' -f1 || printf '%s' "$1" | md5 2>/dev/null; }

input=$(cat)
STATE_DIR="/tmp/claude-code-state"
mkdir -p "$STATE_DIR"

model=$(echo "$input" | jq -r '.model.display_name // .model.id // "Claude"')
current_dir=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
claude_sid=$(echo "$input" | jq -r '.session_id // ""')

# Same session-ID derivation as state-tracker.sh so the linkage file lines up
if [[ -n "${CLAUDE_SESSION_ID:-}" ]]; then
    SESSION_ID="$CLAUDE_SESSION_ID"
elif [[ "${TMUX_PANE:-none}" != "none" && -n "${TMUX_PANE:-}" ]]; then
    SESSION_ID=$(echo "$TMUX_PANE" | sed 's/[^a-zA-Z0-9_-]/_/g')
elif [[ -n "$current_dir" ]]; then
    SESSION_ID=$(portable_md5 "$current_dir" | head -c 12)
else
    SESSION_ID="$$"
fi

# Write context data + linkage file when the status JSON carries context info
context_pct=""
if [[ -n "$claude_sid" ]] && [[ "$(echo "$input" | jq -r '.context_window // ""')" != "" ]]; then
    size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
    in_tok=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
    cache_c=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
    cache_r=$(echo "$input" | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
    if [[ "$size" -gt 0 ]]; then
        # input + cache tokens approximates what /context shows
        context_pct=$(( (in_tok + cache_c + cache_r) * 100 / size ))
    fi

    echo "$input" | jq -c "{
        session_id: .session_id,
        context_window: .context_window,
        context_pct: ${context_pct:-null},
        timestamp: now | todateiso8601
    }" > "$STATE_DIR/${claude_sid}-context.json" 2>/dev/null

    # Linkage file so the state tracker can find the context file above.
    # (Kept separate from the state file to avoid a write-write race.)
    echo "$claude_sid" > "$STATE_DIR/${SESSION_ID}.claude-sid" 2>/dev/null
fi

# Print the visible status line
GREEN='\033[92m'; YELLOW='\033[93m'; RED='\033[91m'; BLUE='\033[94m'
MAGENTA='\033[95m'; GRAY='\033[90m'; RESET='\033[0m'

parts=("${MAGENTA}🤖 ${model}${RESET}")
if [[ -n "$context_pct" ]]; then
    if [[ "$context_pct" -lt 50 ]]; then ctx_color="$GREEN"
    elif [[ "$context_pct" -lt 75 ]]; then ctx_color="$YELLOW"
    else ctx_color="$RED"; fi
    parts+=("${ctx_color}${context_pct}% ctx${RESET}")
fi
[[ -n "$current_dir" ]] && parts+=("${BLUE}${current_dir/#$HOME/\~}${RESET}")

line=""
for i in "${!parts[@]}"; do
    [[ $i -eq 0 ]] && line="${parts[i]}" || line="${line}${GRAY} │ ${RESET}${parts[i]}"
done
printf "%b\n" "$line"
