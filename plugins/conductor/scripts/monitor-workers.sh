#!/bin/bash
# Monitor Claude workers via tmuxplexer background window
# Usage: monitor-workers.sh [--spawn] [--status] [--check-issue ISSUE_ID]

set -euo pipefail

TMUXPLEXER="${TMUXPLEXER:-$HOME/projects/tmuxplexer/tmuxplexer}"
MONITOR_WINDOW="monitor"

# Spawn tmuxplexer in background window if not exists
spawn_monitor() {
  if ! tmux list-windows -F '#{window_name}' 2>/dev/null | grep -q "^${MONITOR_WINDOW}$"; then
    tmux new-window -d -n "$MONITOR_WINDOW" "$TMUXPLEXER --watcher"
    sleep 2  # Wait for tmuxplexer to initialize
    echo "Spawned tmuxplexer monitor in background window"
  else
    echo "Monitor window already exists"
  fi
}

# Capture and parse tmuxplexer output
get_worker_status() {
  local output
  output=$(tmux capture-pane -t ":${MONITOR_WINDOW}" -p 2>/dev/null) || {
    echo "ERROR: Could not capture monitor pane"
    return 1
  }

  # Parse AI sessions from tmuxplexer output
  # Format: ● 🤖 ctt-worker-abc   🔧 Bash: npm test [33%]
  echo "$output" | grep -E "🤖.*ctt-" | while read -r line; do
    session=$(echo "$line" | grep -oP 'ctt-[a-z0-9-]+' | head -1)
    context=$(echo "$line" | grep -oP '\[\d+%\]' | tr -d '[]%')

    # Detect status from indicators
    if echo "$line" | grep -q "AskUserQuestion"; then
      status="asking_user"  # Special: worker waiting for user answer
    elif echo "$line" | grep -q "⏸️\|awaiting"; then
      status="awaiting_input"
    elif echo "$line" | grep -q "🔧"; then
      status="tool_use"
    elif echo "$line" | grep -q "💭"; then
      status="processing"
    elif echo "$line" | grep -q "⚪\|Stale"; then
      status="stale"
    else
      status="idle"
    fi

    echo "${session}|${status}|${context:-0}"
  done
}

# Check if specific issue is completed
check_issue() {
  local issue_id="$1"
  if bd show "$issue_id" 2>/dev/null | grep -q "Status: closed"; then
    echo "CLOSED"
    return 0
  else
    echo "OPEN"
    return 1
  fi
}

# Get summary for conductor
get_summary() {
  local workers
  workers=$(get_worker_status)

  if [ -z "$workers" ]; then
    echo "NO_WORKERS"
    return
  fi

  local total=0
  local idle=0
  local working=0
  local awaiting=0
  local asking=0
  local stale=0

  while IFS='|' read -r session status context; do
    total=$((total + 1))
    case "$status" in
      idle) idle=$((idle + 1)) ;;
      awaiting_input) awaiting=$((awaiting + 1)) ;;
      asking_user) asking=$((asking + 1)) ;;
      stale) stale=$((stale + 1)) ;;
      *) working=$((working + 1)) ;;
    esac
  done <<< "$workers"

  echo "WORKERS:$total WORKING:$working IDLE:$idle AWAITING:$awaiting ASKING:$asking STALE:$stale"
}

# Main command handling
case "${1:-}" in
  --spawn)
    spawn_monitor
    ;;
  --status)
    get_worker_status
    ;;
  --summary)
    get_summary
    ;;
  --check-issue)
    check_issue "${2:-}"
    ;;
  --raw)
    tmux capture-pane -t ":${MONITOR_WINDOW}" -p 2>/dev/null
    ;;
  *)
    echo "Usage: $0 [--spawn|--status|--summary|--check-issue ISSUE_ID|--raw]"
    echo ""
    echo "Commands:"
    echo "  --spawn        Spawn tmuxplexer in background window"
    echo "  --status       Get parsed worker statuses (session|status|context%)"
    echo "  --summary      Get worker summary counts"
    echo "  --check-issue  Check if issue is closed"
    echo "  --raw          Get raw tmuxplexer pane output"
    exit 1
    ;;
esac
