---
name: gg-spawn
description: "Spawn a Claude worker for a ready issue"
argument-hint: "ISSUE_ID"
context:
  skills:
    - spawner:terminals  # TabzChrome API patterns, worktree setup, prompt sending
---

# Spawn Worker

Spawn a Claude terminal in an isolated git worktree to work on a beads issue.

## Steps

Add these to your to-dos:

1. **Pre-flight checks** - Verify TabzChrome running and issue is ready
2. **Create git worktree** - Isolated working directory for the worker
3. **Initialize dependencies** - Use `/spawner:terminals` skill (Haiku)
4. **Spawn terminal** - Create worker via TabzChrome API
5. **Send prompt** - Pep-talk with TTS announcement
6. **Update issue status** - Mark as in_progress

---

## Step 1: Pre-flight Checks

**Check TabzChrome Health:**
```bash
curl -sf http://localhost:8129/api/health >/dev/null || echo "TabzChrome not running"
```

**Verify Issue is Ready:**
```python
issue = mcp__beads__show(issue_id="ISSUE-ID")
# Check: status is ready or open with 'ready' label
```

## Step 2: Create Git Worktree

```bash
ISSUE_ID="ISSUE-ID"
WORKDIR=$(pwd)

# Preferred: bd handles beads redirect for MCP tools
bd worktree create ".worktrees/$ISSUE_ID" --branch "feature/$ISSUE_ID"

# Fallback if beads not available
# git worktree add ".worktrees/$ISSUE_ID" -b "feature/$ISSUE_ID"
```

## Step 3: Initialize Dependencies (SYNCHRONOUS)

Initialize BEFORE spawning so worker doesn't waste time:

```bash
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID" 2>&1 | tail -5
```

The init script handles:
| Detected File | Action |
|---------------|--------|
| `package.json` | `npm ci` (or pnpm/yarn/bun) |
| `pyproject.toml` | `uv pip install -e .` |
| `requirements.txt` | `uv pip install -r requirements.txt` |
| `Cargo.toml` | `cargo fetch` |
| `go.mod` | `go mod download` |

## Step 4: Spawn Terminal via TabzChrome

**Using MCP (preferred):**
```python
tabz_spawn_profile(
    profileId="claude-worker",
    workingDir="~/projects/.worktrees/ISSUE-ID",
    name="ISSUE-ID"
)
```

**Using REST API:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)

curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{
    \"name\": \"$ISSUE_ID\",
    \"workingDir\": \"$WORKDIR/.worktrees/$ISSUE_ID\",
    \"command\": \"BEADS_WORKING_DIR=$WORKDIR claude\"
  }"
```

**Key settings:**
- `name`: Use issue ID for easy lookup
- `BEADS_WORKING_DIR`: Points to main repo so beads MCP tools work in worktrees

## Step 4a: Wait for Claude Initialization

```bash
echo "Waiting for Claude to initialize..."
sleep 8
```

Claude needs 8+ seconds to fully boot.

## Step 4b: Get Session ID

```bash
SESSION=$(curl -s http://localhost:8129/api/agents | jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .id')
```

## Step 5: Send Pep-Talk Prompt with TTS Announcement

Workers get a short, encouraging prompt with a fun TTS intro announcement.

**Build the pep-talk prompt:**
```bash
# Randomized phrases for variety
INTROS=("is in the game" "has entered the chat" "is on the case" "is locked in" "just clocked in")
OUTROS=("Let's go!" "Time to shine!" "This is gonna be good." "Easy money." "Watch this.")
VIBES=("Users are counting on this one." "Straightforward win." "Time to make it shine." "This is gonna be good.")

# Pick random elements
INTRO="${INTROS[$RANDOM % ${#INTROS[@]}]}"
OUTRO="${OUTROS[$RANDOM % ${#OUTROS[@]}]}"
VIBE="${VIBES[$RANDOM % ${#VIBES[@]}]}"

# Get issue title
TITLE=$(bd show "$ISSUE_ID" --json | jq -r '.[0].title // "the task"')

# Build the prompt
PROMPT="You've got $ISSUE_ID - $TITLE. $VIBE

First, announce yourself: tabz_speak(\"$ISSUE_ID $INTRO - $TITLE. $OUTRO\")

Then check \`bd show $ISSUE_ID\` and make it happen!"
```

**Using safe-send-keys.sh (reliable for long prompts):**
```bash
SAFE_SEND_KEYS=$(find ~/plugins ~/.claude/plugins -name "safe-send-keys.sh" -path "*spawner*" 2>/dev/null | head -1)
"$SAFE_SEND_KEYS" "$SESSION" "$PROMPT"
```

**Fallback with tmux:**
```bash
tmux send-keys -t "$SESSION" -l "$PROMPT"
sleep 1
tmux send-keys -t "$SESSION" C-m
```

## Step 6: Update Issue Status

```python
mcp__beads__update(issue_id="ISSUE-ID", status="in_progress")
```

## Quick Reference

```bash
ISSUE_ID="ISSUE-ID"
WORKDIR=$(pwd)
TOKEN=$(cat /tmp/tabz-auth-token)

# Create worktree (bd handles beads redirect)
bd worktree create ".worktrees/$ISSUE_ID" --branch "feature/$ISSUE_ID"

# Initialize deps
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID"

# Spawn terminal
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{
    \"name\": \"$ISSUE_ID\",
    \"workingDir\": \"$WORKDIR/.worktrees/$ISSUE_ID\",
    \"command\": \"BEADS_WORKING_DIR=$WORKDIR claude\"
  }"

# Wait and get session
sleep 8
SESSION=$(curl -s http://localhost:8129/api/agents | jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .id')

# Build pep-talk prompt with random phrases
INTROS=("is in the game" "has entered the chat" "is on the case" "is locked in" "just clocked in")
OUTROS=("Let's go!" "Time to shine!" "This is gonna be good." "Easy money." "Watch this.")
VIBES=("Users are counting on this one." "Straightforward win." "Time to make it shine." "This is gonna be good.")
INTRO="${INTROS[$RANDOM % ${#INTROS[@]}]}"
OUTRO="${OUTROS[$RANDOM % ${#OUTROS[@]}]}"
VIBE="${VIBES[$RANDOM % ${#VIBES[@]}]}"
TITLE=$(bd show "$ISSUE_ID" --json | jq -r '.[0].title // "the task"')
PROMPT="You've got $ISSUE_ID - $TITLE. $VIBE

First, announce yourself: tabz_speak(\"$ISSUE_ID $INTRO - $TITLE. $OUTRO\")

Then check \`bd show $ISSUE_ID\` and make it happen!"

# Send prompt
SAFE_SEND_KEYS=$(find ~/plugins ~/.claude/plugins -name "safe-send-keys.sh" -path "*spawner*" 2>/dev/null | head -1)
"$SAFE_SEND_KEYS" "$SESSION" "$PROMPT"
```

## Worker Dashboard

Monitor workers with tmuxplexer:

```bash
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "Worker Dashboard",
    "workingDir": "/home/marci/projects/tmuxplexer",
    "command": "./tmuxplexer --watcher"
  }'
```

## Naming Convention

**Use issue ID as terminal name.** This enables:
- Easy lookup via `/api/agents`
- Clear display in dashboard
- Correlation: terminal = issue = branch = worktree

## Notes

- Initialize deps SYNCHRONOUSLY before spawning
- Wait 8+ seconds for Claude to boot before sending prompt
- Workers follow PRIME.md - they'll read the issue and work autonomously
- Use `BEADS_WORKING_DIR=$WORKDIR` so beads MCP tools work in worktrees
