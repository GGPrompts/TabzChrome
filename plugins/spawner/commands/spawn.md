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
5. **Send prompt** - Extract from issue notes or use default
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

git worktree add ".worktrees/$ISSUE_ID" -b "feature/$ISSUE_ID"
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
PLUGIN_DIRS="--plugin-dir $HOME/.claude/plugins/marketplaces --plugin-dir $HOME/plugins/my-plugins"

curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{
    \"name\": \"$ISSUE_ID\",
    \"workingDir\": \"$WORKDIR/.worktrees/$ISSUE_ID\",
    \"command\": \"BD_SOCKET=/tmp/bd-worker-\${ISSUE_ID}.sock claude $PLUGIN_DIRS\"
  }"
```

**Key settings:**
- `name`: Use issue ID for easy lookup
- `BD_SOCKET`: Isolates beads daemon per worker, enabling MCP tools (mcp__beads__show, etc.) to work in parallel workers
- `--plugin-dir`: Workers need access to plugins

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

## Step 5: Send Prompt

**Check for prepared.prompt in issue notes:**
```python
issue = mcp__beads__show(issue_id="ISSUE-ID")
# Look for ## prepared.prompt section in notes
# If found, use that as the prompt
# Otherwise, use the standard prompt
```

**Extract prepared.prompt from notes (bash):**
```bash
# Get issue notes and extract prepared.prompt section
NOTES=$(bd show "$ISSUE_ID" --json | jq -r '.[0].notes // empty')
if echo "$NOTES" | grep -q '## prepared.prompt'; then
  # Extract content after "## prepared.prompt" until next ## or end
  PROMPT=$(echo "$NOTES" | sed -n '/## prepared\.prompt/,/^## /p' | tail -n +2 | sed '/^## /,$d')
fi

# Fallback to standard prompt if prepared.prompt not found
if [ -z "$PROMPT" ]; then
  PROMPT="Complete beads issue $ISSUE_ID. Run: bd show $ISSUE_ID --json"
fi
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

# Create worktree
git worktree add ".worktrees/$ISSUE_ID" -b "feature/$ISSUE_ID"

# Initialize deps
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID"

# Plugin directories
PLUGIN_DIRS="--plugin-dir $HOME/.claude/plugins/marketplaces --plugin-dir $HOME/plugins/my-plugins"

# Spawn terminal
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{
    \"name\": \"$ISSUE_ID\",
    \"workingDir\": \"$WORKDIR/.worktrees/$ISSUE_ID\",
    \"command\": \"BD_SOCKET=/tmp/bd-worker-\${ISSUE_ID}.sock claude $PLUGIN_DIRS\"
  }"

# Wait and get session
sleep 8
SESSION=$(curl -s http://localhost:8129/api/agents | jq -r --arg id "$ISSUE_ID" '.data[] | select(.name == $id) | .id')

# Extract prepared.prompt from issue notes (if present)
NOTES=$(bd show "$ISSUE_ID" --json | jq -r '.[0].notes // empty')
if echo "$NOTES" | grep -q '## prepared.prompt'; then
  PROMPT=$(echo "$NOTES" | sed -n '/## prepared\.prompt/,/^## /p' | tail -n +2 | sed '/^## /,$d')
fi
[ -z "$PROMPT" ] && PROMPT="Complete beads issue $ISSUE_ID. Run: bd show $ISSUE_ID --json"

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
- Use `BD_SOCKET=/tmp/bd-worker-${ISSUE_ID}.sock` to give each worker its own beads daemon for MCP tool support
- Pass `--plugin-dir` flags so workers have access to plugins
