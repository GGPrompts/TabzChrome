# Interactive Mode - BD Swarm

Default mode when running `/conductor:bd-swarm` without `--auto` flag.

## 1. Get Ready Issues

```bash
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] [\(.type)] \(.title)"' | head -5
```

## 2. Select Worker Count

Ask user: How many workers? (2, 3, 4, 5)

## 3. Create Worktrees (Parallel)

Create all worktrees and install dependencies in parallel, then wait for completion before spawning workers.

**Important**: Use file-based locking to prevent race conditions when multiple workers spawn simultaneously.

```bash
# Run the worktree setup script
${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE_ID"

# Or run all in parallel:
for ISSUE in TabzChrome-abc TabzChrome-def TabzChrome-ghi; do
  ${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE" &
done
wait
echo "All worktrees initialized with dependencies"
```

## 4. Spawn Workers

**How spawning works:**
- TabzChrome's `/api/spawn` (POST) creates tmux sessions with `ctt-*` prefix
- Direct tmux spawning uses `worker-*` prefix (also works fine)
- Both appear in tmuxplexer and can be monitored the same way
- **Sessions must be killed via tmux** - there is no REST API for cleanup

**Worker plugin directories** (use `--plugin-dir` for lean workers):

| Worker Type | Plugin Dir | Use For |
|-------------|------------|---------|
| `worker-minimal` | `./plugins/worker-minimal` | General tasks |
| `worker-browser` | `./plugins/worker-browser` | Browser automation |
| `worker-codegen` | `./plugins/worker-codegen` | Terminal/xterm work |
| `worker-review` | `./plugins/worker-review` | Code review tasks |

### Option A: Via TabzChrome API (appears in browser terminal UI)

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="TabzChrome-abc"
WORKTREE="/home/user/project-worktrees/${ISSUE_ID}"
PLUGIN_DIR="./plugins/worker-minimal"  # Choose based on issue type

bd update "$ISSUE_ID" --status in_progress

# BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

# Safe JSON construction using jq (handles special characters in values)
JSON_PAYLOAD=$(jq -n \
  --arg name "worker-${ISSUE_ID}" \
  --arg dir "$WORKTREE" \
  --arg cmd "BD_SOCKET=/tmp/bd-worker-${ISSUE_ID}.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --plugin-dir $PLUGIN_DIR --dangerously-skip-permissions" \
  '{name: $name, workingDir: $dir, command: $cmd}')

# POST creates a tmux session named ctt-worker-${ISSUE_ID}-xxxx
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "$JSON_PAYLOAD"

# Store session name for later cleanup (parse from response)
SESSION_ID=$(curl -s -X POST http://localhost:8129/api/spawn ... | jq -r '.terminal.id')
echo "$SESSION_ID" >> /tmp/swarm-sessions.txt
```

### Option B: Direct tmux (simpler, CLI-only)

```bash
ISSUE_ID="TabzChrome-abc"
WORKTREE="/home/user/project-worktrees/${ISSUE_ID}"
SESSION="worker-${ISSUE_ID}"
PLUGIN_DIR="./plugins/worker-minimal"  # Choose based on issue type

bd update "$ISSUE_ID" --status in_progress

# BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

tmux new-session -d -s "$SESSION" -c "$WORKTREE"
tmux send-keys -t "$SESSION" "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --plugin-dir $PLUGIN_DIR --dangerously-skip-permissions" C-m

# Store session name for later cleanup
echo "$SESSION" >> /tmp/swarm-sessions.txt
```

## 5. Craft Enhanced Prompts

Before sending, craft a detailed prompt following the structure in `references/worker-architecture.md`.

### Step 5a: Match Skills to Issue

Match issue keywords to skill triggers (weave into guidance, don't list):

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
  [[ "$TITLE_DESC" =~ (prompt|worker|swarm|conductor) ]] && SKILLS+="Follow conductor orchestration patterns. "

  echo "${SKILLS}"
}

SKILL_HINTS=$(match_skills "$TITLE $DESCRIPTION")
```

### Step 5b: Get Key Files (Optional)

For complex issues, identify starting points:

```bash
# Quick grep for relevant files (optional, workers can explore)
KEY_FILES=$(grep -rl "$KEYWORD" --include="*.ts" --include="*.tsx" . 2>/dev/null | head -5)
```

### Step 5c: Build Enhanced Prompt

```bash
SESSION="ctt-claude-xxx"
ISSUE_ID="TabzChrome-abc"
TITLE="Fix something"
DESCRIPTION="Details from bd show"
SKILL_HINTS="UI styling best practices, xterm-js patterns"
KEY_FILES="extension/components/Terminal.tsx
extension/hooks/useTerminalSessions.ts"

sleep 4

# Validate session name
if [[ ! "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: Invalid session name format"
  exit 1
fi

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: Session does not exist"
  exit 1
fi

# Send /context first so worker sees available skills in conversation
tmux send-keys -t "$SESSION" -l '/context'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
sleep 2  # Wait for /context output

# Build enhanced prompt with all context
PROMPT=$(cat <<EOF
Fix beads issue ${ISSUE_ID}: "${TITLE}"

## Context
${DESCRIPTION}

## Key Files
${KEY_FILES:-"Explore as needed based on the issue description."}

## Approach
${SKILL_HINTS}Reference existing patterns in the codebase for consistency.

After implementation, verify the build passes and test the changes work as expected.

## When Done
Run: /conductor:worker-done ${ISSUE_ID}

This command will: build, run code review, commit changes, and close the issue.
EOF
)

# Send prompt safely
printf '%s' "$PROMPT" | tmux load-buffer -
tmux paste-buffer -t "$SESSION"
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

### Prompt Template Summary

| Section | Purpose |
|---------|---------|
| `/context` first | **Run before prompt** - shows worker its available skills |
| Title line | Issue ID + title for clarity |
| Context | Description + WHY this matters |
| Key Files | Starting points (optional) |
| Guidance | Skill hints woven naturally |
| When Done | **Mandatory** `/conductor:worker-done` instruction |

**Why `/context` first?** Workers sometimes forget to use available skills. By running `/context` before the work prompt, workers see their full capability list in conversation context, making them more likely to invoke relevant skills.

## 6. Start Monitor & Poll

```bash
# Spawn background monitor
${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --spawn

# Poll every 2 minutes
while true; do
  SUMMARY=$(${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --summary)
  echo "[$(date)] $SUMMARY"

  # Check if all issues closed
  ALL_CLOSED=true
  for ISSUE in $ISSUES; do
    # Validate issue ID before checking
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    if ! bd show "$ISSUE" 2>/dev/null | grep -q "Status: closed"; then
      ALL_CLOSED=false
      break
    fi
  done

  if $ALL_CLOSED; then
    echo "All issues closed - running completion pipeline"
    break
  fi

  sleep 120
done
```

## 7. Completion

When all workers done, run the completion pipeline:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "$ISSUES"
```

Or see `references/bd-swarm/completion-pipeline.md` for manual steps.
