# CLI / WebSocket Integration

Shell functions and tmux workflows using websocat.

## Authentication

```bash
# Get the auth token (auto-generated on backend startup)
TOKEN=$(cat /tmp/tabz-auth-token)

# Connect with token
websocat "ws://localhost:8129?token=$TOKEN"
```

## Message Format

```json
{
  "type": "QUEUE_COMMAND",
  "command": "your command or prompt here"
}
```

## Shell Function

Add to `.bashrc` or `.zshrc`:

```bash
# Queue command/prompt to TabzChrome sidebar
tabz() {
  local cmd="$*"
  local token=$(cat /tmp/tabz-auth-token 2>/dev/null)
  if [[ -z "$token" ]]; then
    echo "Error: TabzChrome backend not running"
    return 1
  fi
  echo "{\"type\":\"QUEUE_COMMAND\",\"command\":$(echo "$cmd" | jq -Rs .)}" | \
    websocat "ws://localhost:8129?token=$token"
}

# Usage:
# tabz npm run dev
# tabz "Explain this error and suggest a fix"
```

## Multi-line Prompts

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
cat <<'EOF' | jq -Rs '{type:"QUEUE_COMMAND",command:.}' | websocat "ws://localhost:8129?token=$TOKEN"
Implement a new feature that:
1. Adds user authentication
2. Uses JWT tokens
3. Includes refresh token rotation
EOF
```

## Tmux Integration

```bash
# Send current pane output to Claude
tabz-explain() {
  local output=$(tmux capture-pane -p -S -50)
  tabz "Explain this terminal output:\n\n$output"
}

# Queue last command's output
tabz-last() {
  local cmd=$(fc -ln -1)
  local output=$($cmd 2>&1)
  tabz "I ran: $cmd\n\nOutput:\n$output\n\nExplain what happened."
}
```

## Dependencies

- `websocat` - WebSocket CLI client
- `jq` - JSON processor

Install:
```bash
# Ubuntu/Debian
sudo apt install websocat jq

# macOS
brew install websocat jq
```
