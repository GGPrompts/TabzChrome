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
plugins/conductor/scripts/setup-worktree.sh "$ISSUE_ID"

# Or run all in parallel:
for ISSUE in TabzChrome-abc TabzChrome-def TabzChrome-ghi; do
  plugins/conductor/scripts/setup-worktree.sh "$ISSUE" &
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

### Option A: Via TabzChrome API (appears in browser terminal UI)

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="TabzChrome-abc"
WORKTREE="/home/user/project-worktrees/${ISSUE_ID}"

bd update "$ISSUE_ID" --status in_progress

# Safe JSON construction using jq (handles special characters in values)
JSON_PAYLOAD=$(jq -n \
  --arg name "worker-${ISSUE_ID}" \
  --arg dir "$WORKTREE" \
  --arg cmd "claude --dangerously-skip-permissions" \
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

bd update "$ISSUE_ID" --status in_progress

tmux new-session -d -s "$SESSION" -c "$WORKTREE"
tmux send-keys -t "$SESSION" "claude --dangerously-skip-permissions" C-m

# Store session name for later cleanup
echo "$SESSION" >> /tmp/swarm-sessions.txt
```

## 5. Send Skill-Aware Prompts

**Security**: Validate session names and use heredoc for prompts with dynamic content.

```bash
SESSION="ctt-claude-xxx"
ISSUE_ID="TabzChrome-abc"
TITLE="Fix something"
DESCRIPTION="Details here"

sleep 4

# Validate session name format (alphanumeric, dash, underscore only)
if [[ ! "$SESSION" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: Invalid session name format"
  exit 1
fi

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: Session does not exist"
  exit 1
fi

# Use heredoc for safe multiline prompt with variables
PROMPT=$(cat <<EOF
## Task
${ISSUE_ID}: ${TITLE}

${DESCRIPTION}

## Skills
Run \`/ui-styling:ui-styling\` or \`/xterm-js\` based on task type.

## Completion
When done: \`/conductor:worker-done ${ISSUE_ID}\`
EOF
)

# Send prompt safely using printf to handle special characters
printf '%s' "$PROMPT" | tmux load-buffer -
tmux paste-buffer -t "$SESSION"
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

## 6. Start Monitor & Poll

```bash
# Spawn background monitor
plugins/conductor/scripts/monitor-workers.sh --spawn

# Poll every 2 minutes
while true; do
  SUMMARY=$(plugins/conductor/scripts/monitor-workers.sh --summary)
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
plugins/conductor/scripts/completion-pipeline.sh "$ISSUES"
```

Or see `references/bd-swarm/completion-pipeline.md` for manual steps.
