---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude workers to tackle beads issues in parallel, with skill-aware prompting and environment preparation.

## Quick Start

```bash
# Interactive: select issues and worker count
/bd-swarm

# Auto mode: process entire backlog autonomously
/bd-swarm --auto
```

## Workflow Overview

```
1. Get ready issues      →  bd ready
2. Create worktrees      →  git worktree add + npm install (parallel)
3. Wait for deps         →  All worktrees ready before workers spawn
4. Spawn workers         →  TabzChrome spawn API
5. Send prompts          →  tmux send-keys with skill hints
6. Monitor via tmuxplexer →  Background window polling
7. Complete pipeline     →  Merge → Sync → Push
```

---

## Monitoring Workers

**Key change**: Instead of a watcher subagent, monitor workers directly via tmuxplexer in a background window.

### Spawn Monitor

```bash
# Spawn tmuxplexer --watcher as background window (window 2)
plugins/conductor/scripts/monitor-workers.sh --spawn
```

The monitor shows all AI sessions with:
- Status: idle, processing, tool_use, awaiting_input
- Context %
- Current tool

### Poll Status

```bash
# Get parsed worker statuses
plugins/conductor/scripts/monitor-workers.sh --status
# Output: ctt-worker-abc|tool_use|45

# Get summary
plugins/conductor/scripts/monitor-workers.sh --summary
# Output: WORKERS:3 WORKING:2 IDLE:0 AWAITING:1 STALE:0

# Check specific issue
plugins/conductor/scripts/monitor-workers.sh --check-issue TabzChrome-abc
# Output: CLOSED or OPEN
```

### Decision Logic

Poll every ~2 minutes and decide:

| Status | Action |
|--------|--------|
| `🔧 AskUserQuestion` | **Don't nudge** - worker waiting for user answer |
| `🔧 <other tool>` | Working, leave alone |
| `awaiting_input` / `idle` | At prompt - check if issue closed or stuck |
| `stale` (5+ min no activity) | May be hung, investigate pane |
| Issue closed | Worker done, ready for cleanup |

**Detection:** Tmuxplexer shows `🔧 Using AskUserQuestion` when worker has a question pending. Never nudge these workers.

### Drill Down

Only capture worker panes when needed:

```bash
tmux capture-pane -t <worker-session> -p -S -50
```

---

## Interactive Mode (Default)

### 1. Get Ready Issues

```bash
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] [\(.type)] \(.title)"' | head -5
```

### 2. Select Worker Count

Ask user: How many workers? (2, 3, 4, 5)

### 3. Create Worktrees (Parallel)

Create all worktrees and install dependencies in parallel, then wait for completion before spawning workers.

**Important**: Use file-based locking to prevent race conditions when multiple workers spawn simultaneously.

```bash
# Validate issue ID format (alphanumeric with dash only)
validate_issue_id() {
  [[ "$1" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "ERROR: Invalid issue ID" >&2; return 1; }
}

# Lockfile for worktree creation (prevents race conditions with parallel workers)
WORKTREE_LOCK="/tmp/git-worktree-$(basename "$PROJECT_DIR").lock"

# Function to setup a single worktree with deps
setup_worktree() {
  local ISSUE="$1"
  local WORKTREE="${PROJECT_DIR}-worktrees/${ISSUE}"

  mkdir -p -- "$(dirname "$WORKTREE")"

  # Use flock to serialize worktree creation across parallel workers
  # Lock is automatically released when subshell exits (success or error)
  (
    flock -x 200 || { echo "ERROR: Failed to acquire worktree lock" >&2; exit 1; }

    # Check if worktree already exists (another worker may have created it)
    if [ -d "$WORKTREE" ]; then
      echo "Worktree already exists: $WORKTREE"
      exit 0
    fi

    git worktree add -- "$WORKTREE" -b "feature/${ISSUE}" 2>/dev/null || \
    git worktree add -- "$WORKTREE" HEAD
  ) 200>"$WORKTREE_LOCK"

  # Install deps based on lockfile type (outside lock - can run in parallel)
  if [ -f "$WORKTREE/package.json" ] && [ ! -d "$WORKTREE/node_modules" ]; then
    cd -- "$WORKTREE"
    if [ -f "pnpm-lock.yaml" ]; then
      pnpm install --frozen-lockfile
    elif [ -f "yarn.lock" ]; then
      yarn install --frozen-lockfile
    else
      npm ci 2>/dev/null || npm install
    fi
  fi

  echo "READY: $WORKTREE"
}

# Run all worktree setups in parallel
for ISSUE in TabzChrome-abc TabzChrome-def TabzChrome-ghi; do
  validate_issue_id "$ISSUE" || continue
  setup_worktree "$ISSUE" &
done

# Wait for ALL worktrees to be ready before spawning workers
wait
echo "All worktrees initialized with dependencies"
```

### 4. Spawn Workers

**Security**: Use heredoc with `jq` for safe JSON construction. Never embed unsanitized variables directly in JSON strings.

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="TabzChrome-abc"
WORKTREE="/home/user/project-worktrees/${ISSUE_ID}"

bd update "$ISSUE_ID" --status in_progress

# Safe JSON construction using jq (handles special characters in values)
JSON_PAYLOAD=$(jq -n \
  --arg name "Claude: ${ISSUE_ID}" \
  --arg dir "$WORKTREE" \
  --arg cmd "claude --dangerously-skip-permissions" \
  '{name: $name, workingDir: $dir, command: $cmd}')

curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "$JSON_PAYLOAD"
```

### 5. Send Skill-Aware Prompts

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
# This avoids shell escaping issues with special characters in title/description
PROMPT=$(cat <<EOF
## Task
${ISSUE_ID}: ${TITLE}

${DESCRIPTION}

## Skills
Run \`/ui-styling:ui-styling\` or \`/xterm-js\` based on task type.

## Completion
When done: \`/worker-done ${ISSUE_ID}\`
EOF
)

# Send prompt safely using printf to handle special characters
printf '%s' "$PROMPT" | tmux load-buffer -
tmux paste-buffer -t "$SESSION"
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

### 6. Start Monitor & Poll

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

### 7. Completion Pipeline

When all workers done:

```bash
# Merge branches
cd -- "$PROJECT_DIR"
for ISSUE in $ISSUES; do
  # Validate before git operations
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid issue: $ISSUE" >&2; continue; }
  git merge --no-edit -- "feature/${ISSUE}"
done

# Cleanup worktrees
for ISSUE in $ISSUES; do
  [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
  git worktree remove --force -- "${PROJECT_DIR}-worktrees/${ISSUE}"
  git branch -d -- "feature/${ISSUE}"
done

# Sync and push
bd sync && git push origin main

# Notify (use jq for any dynamic content)
mcp-cli call tabz/tabz_speak "$(jq -n --arg text "Sprint complete" '{text: $text}')"
```

---

## Auto Mode (`--auto`)

Fully autonomous backlog completion. Runs until `bd ready` returns empty.

### Wave Loop

```bash
WAVE=1
while true; do
  READY=$(bd ready --json | jq -r '.[].id')
  [ -z "$READY" ] && break

  echo "=== Wave $WAVE: $(echo "$READY" | wc -l) issues ==="

  # PHASE 1: Initialize ALL worktrees in parallel (deps included)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
    setup_worktree "$ISSUE" &  # Uses function from section 3
  done
  wait  # Block until all worktrees ready with deps
  echo "All worktrees initialized for wave $WAVE"

  # PHASE 2: Spawn workers (worktrees already have deps)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    spawn_worker "$ISSUE"
  done

  # Monitor until wave complete
  monitor_wave "$READY"

  # Merge wave results
  merge_wave "$READY"

  WAVE=$((WAVE + 1))
done

# Final completion
bd sync && git push origin main
echo "Backlog complete!"
```

### Auto Mode Differences

| Aspect | Interactive | Auto |
|--------|-------------|------|
| Worker count | Ask user | All ready issues |
| Waves | One wave | Repeat until empty |
| Decisions | AskUserQuestion | Reasonable defaults |
| Context check | Manual | Auto /wipe at 75% |

### Context Recovery

If conductor hits 75% context:

```bash
# Save state
echo "$WAVE" > /tmp/bd-swarm-wave.txt

# Trigger /wipe with handoff
# Resume with: /bd-swarm --auto --resume
```

---

## Worker Expectations

Each worker will:
1. Read issue with `bd show <id>`
2. Implement feature/fix
3. Build and test
4. Run `/worker-done <issue-id>` (reviews, commits, closes issue)

---

## Skill Matching

Match skills to issue content:

| Keywords | Skill |
|----------|-------|
| terminal, xterm, pty | `/xterm-js` |
| ui, component, modal, button | `/ui-styling:ui-styling` |
| plugin, skill, agent | `/plugin-development:plugin-development` |
| debug, fix, error, bug | Debugging patterns |

---

## Notes

- Workers run in isolated worktrees (prevents conflicts)
- Monitor via tmuxplexer background window (no watcher subagent)
- User can switch to monitor window via status bar click
- Check actual pane content before nudging idle workers
