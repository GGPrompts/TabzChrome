# Auto Mode - BD Swarm

Fully autonomous backlog completion. Runs until `bd ready` returns empty.

**Invoke with:** `/conductor:bd-swarm --auto`

**Sets `AUTO_MODE=true`** - Workers receive `MODE: AUTONOMOUS` marker and will not ask questions.

## Wave Loop

```bash
WAVE=1
while true; do
  READY=$(bd ready --json | jq -r '.[].id')
  [ -z "$READY" ] && break

  echo "=== Wave $WAVE: $(echo "$READY" | wc -l) issues ==="

  # PHASE 1: Initialize ALL worktrees in parallel (deps included)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
    ${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE" &
  done
  wait  # Block until all worktrees ready with deps
  echo "All worktrees initialized for wave $WAVE"

  # PHASE 2: Spawn workers (worktrees already have deps)
  # Workers get skill hints via enhanced prompts (see match_skills below)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    spawn_auto_worker "$ISSUE" "../TabzChrome-$ISSUE"
  done

  # Monitor until wave complete
  monitor_wave "$READY"

  # Merge wave results
  ${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "$READY"

  # Audio announcement for wave completion
  ISSUE_COUNT=$(echo "$READY" | wc -w)
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg text "Wave $WAVE complete. $ISSUE_COUNT issues merged. Starting next wave." \
      '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
    > /dev/null 2>&1 &

  WAVE=$((WAVE + 1))
done

# Final completion with audio
bd sync && git push origin main
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Backlog complete! All waves finished and pushed to main.", "voice": "en-GB-SoniaNeural", "rate": "+15%", "priority": "high"}' \
  > /dev/null 2>&1 &
echo "Backlog complete!"
```

## Auto Mode vs Interactive

| Aspect | Interactive | Auto |
|--------|-------------|------|
| Worker count | Ask user | All ready issues |
| Waves | One wave | Repeat until empty |
| Decisions | AskUserQuestion | Reasonable defaults |
| Context check | Manual | Auto /wipe at 75% |

## Enhanced Prompt for Autonomous Workers

Auto mode workers receive enhanced prompts with skill hints and context automatically applied.

### Skill Matching Function

```bash
# Returns natural trigger language that activates skills (like pmux does)
match_skills() {
  local TITLE_DESC=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  local SKILLS=""

  # Natural trigger language - "use the X skill for Y"
  [[ "$TITLE_DESC" =~ (terminal|xterm|pty|resize) ]] && SKILLS+="Use the xterm-js skill for terminal rendering and resize handling. "
  [[ "$TITLE_DESC" =~ (ui|component|modal|dashboard|styling) ]] && SKILLS+="Use the ui-styling skill for shadcn/ui components and Tailwind CSS. "
  [[ "$TITLE_DESC" =~ (backend|api|server|database|websocket) ]] && SKILLS+="Use the backend-development skill for API and server patterns. "
  [[ "$TITLE_DESC" =~ (browser|screenshot|click|mcp|tabz) ]] && SKILLS+="Use MCP browser automation tools via tabz_* for testing. "
  [[ "$TITLE_DESC" =~ (auth|login|oauth) ]] && SKILLS+="Use the better-auth skill for authentication patterns. "
  [[ "$TITLE_DESC" =~ (plugin|skill|agent|hook|command) ]] && SKILLS+="Use the plugin-dev skills for plugin/skill structure. "

  echo "${SKILLS}"
}
```

### Auto-Enhanced Prompt Template

```bash
build_auto_prompt() {
  local ISSUE_ID="$1"
  local TITLE="$2"
  local DESCRIPTION="$3"
  local SKILL_HINTS=$(match_skills "$TITLE $DESCRIPTION")

  cat <<EOF
**MODE: AUTONOMOUS** - Do not ask questions. Make reasonable defaults.

Fix beads issue ${ISSUE_ID}: "${TITLE}"

## Context
${DESCRIPTION}

## Approach
${SKILL_HINTS}Reference existing patterns in the codebase for consistency.

After implementation, verify the build passes and test the changes work as expected.

## Autonomous Requirements
- Do not use AskUserQuestion - make reasonable decisions
- If truly blocked, close issue with reason 'needs-clarification'

## When Done
Run: /conductor:worker-done ${ISSUE_ID}

This command will: build, run code review, commit changes, and close the issue.
EOF
}
```

### Spawn with Auto-Enhanced Prompt

```bash
spawn_auto_worker() {
  local ISSUE_ID="$1"
  local WORKTREE="$2"
  local SESSION="worker-${ISSUE_ID}"
  local CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

  # Get issue details
  local ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>/dev/null)
  local TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
  local DESCRIPTION=$(echo "$ISSUE_JSON" | jq -r '.description // ""')

  # Build enhanced prompt
  local PROMPT=$(build_auto_prompt "$ISSUE_ID" "$TITLE" "$DESCRIPTION")

  # Spawn and send
  # BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
  tmux new-session -d -s "$SESSION" -c "$WORKTREE"
  tmux send-keys -t "$SESSION" "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions" C-m
  sleep 6

  printf '%s' "$PROMPT" | tmux load-buffer -
  tmux paste-buffer -t "$SESSION"
  sleep 0.3
  tmux send-keys -t "$SESSION" C-m
}
```

## Context Recovery

If conductor hits 75% context:

```bash
# Save state
echo "$WAVE" > /tmp/conductor:bd-swarm-wave.txt

# Trigger /wipe with handoff
# Resume with: /conductor:bd-swarm --auto --resume
```
