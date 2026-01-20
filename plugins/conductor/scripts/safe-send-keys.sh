#!/bin/bash
# safe-send-keys.sh - Send keys to tmux session with existence validation
#
# Usage:
#   safe-send-keys.sh <session> <text>           # Send text + Enter
#   safe-send-keys.sh <session> <text> --no-enter  # Send text only
#   safe-send-keys.sh <session> --key <key>      # Send special key (C-c, C-m, etc.)
#
# Environment:
#   SEND_KEYS_DELAY - Delay before Enter (default: 1.0s)
#
# Returns:
#   0 - Success
#   1 - Session does not exist
#   2 - Invalid arguments
#
# Examples:
#   safe-send-keys.sh ctt-worker-abc "Hello world"
#   safe-send-keys.sh ctt-worker-abc "partial text" --no-enter
#   safe-send-keys.sh ctt-worker-abc --key C-c
#   SEND_KEYS_DELAY=2 safe-send-keys.sh ctt-worker-abc "long prompt"

set -e

SESSION="$1"
shift

if [ -z "$SESSION" ]; then
  echo "Usage: safe-send-keys.sh <session> <text> [--no-enter]" >&2
  echo "       safe-send-keys.sh <session> --key <key>" >&2
  exit 2
fi

# Validate session exists
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' does not exist, skipping" >&2
  exit 1
fi

# Handle --key mode (send special key like C-c, Enter, etc.)
if [ "$1" = "--key" ]; then
  KEY="$2"
  if [ -z "$KEY" ]; then
    echo "Missing key after --key" >&2
    exit 2
  fi
  tmux send-keys -t "$SESSION" "$KEY"
  exit 0
fi

# Handle text mode
TEXT="$1"
NO_ENTER=""

if [ "$2" = "--no-enter" ]; then
  NO_ENTER="true"
fi

if [ -z "$TEXT" ]; then
  echo "Missing text to send" >&2
  exit 2
fi

# Send text literally (preserves special characters)
tmux send-keys -t "$SESSION" -l "$TEXT"

# Add Enter unless --no-enter specified
if [ -z "$NO_ENTER" ]; then
  # Configurable delay - default 1.0s for long prompts in Claude Code
  DELAY=${SEND_KEYS_DELAY:-1.0}
  sleep "$DELAY"
  tmux send-keys -t "$SESSION" C-m
fi

exit 0
