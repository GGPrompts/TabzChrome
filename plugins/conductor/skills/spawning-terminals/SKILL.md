---
name: spawning-terminals
description: "Spawn and manage terminal tabs via TabzChrome REST API. Use when spawning workers, creating terminals programmatically, setting up worktrees for parallel work, monitoring worker status, or sending prompts to Claude sessions."
---

# TabzChrome Terminal Management

Spawn terminals, manage workers, and orchestrate parallel Claude sessions.

## MCP Tools (Preferred)

| Tool | Purpose |
|------|---------|
| `tabz_spawn_profile` | Spawn terminal using saved profile |
| `tabz_list_profiles` | List terminal profiles |
| `tabz_list_categories` | List profile categories |

```python
# Spawn worker with profile
tabz_spawn_profile(
    profileId="claude-worker",
    workingDir="~/projects/.worktrees/ISSUE-ID",
    name="ISSUE-ID"
)
```

## REST API

### Spawn Terminal

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "ISSUE-ID",
    "workingDir": "/path/to/worktree",
    "command": "BEADS_NO_DAEMON=1 claude --plugin-dir ~/.claude/plugins/marketplaces"
  }'
```

| Param | Required | Description |
|-------|----------|-------------|
| `name` | No | Display name (use issue ID for workers) |
| `workingDir` | No | Starting directory |
| `command` | No | Command to auto-execute |
| `profileId` | No | Terminal profile for appearance/command |

### Worker Management

```bash
# List workers
curl -s http://localhost:8129/api/agents | jq '.data[]'

# Find by name
curl -s http://localhost:8129/api/agents | jq -r '.data[] | select(.name == "ISSUE-ID")'

# Kill worker
curl -s -X DELETE "http://localhost:8129/api/agents/$SESSION" -H "X-Auth-Token: $TOKEN"
```

## Git Worktrees

Worktrees allow parallel workers on same repo without conflicts.

```bash
ISSUE_ID="ISSUE-ID"

# Create worktree
git worktree add ".worktrees/$ISSUE_ID" -b "feature/$ISSUE_ID"

# Initialize deps (SYNCHRONOUS - before spawning)
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*conductor*" 2>/dev/null | head -1)
$INIT_SCRIPT ".worktrees/$ISSUE_ID"

# Cleanup
git worktree remove ".worktrees/$ISSUE_ID" --force
git branch -d "feature/$ISSUE_ID"
```

## Sending Prompts

```bash
# Wait for Claude to initialize (8+ seconds)
sleep 8

# Find safe-send-keys.sh
SAFE_SEND_KEYS=$(find ~/plugins ~/.claude/plugins -name "safe-send-keys.sh" -path "*conductor*" 2>/dev/null | head -1)

# Send prompt
"$SAFE_SEND_KEYS" "$SESSION" "Complete beads issue $ISSUE_ID. Run: bd show $ISSUE_ID --json"
```

## Important Notes

1. **Name terminals with issue ID** for easy lookup
2. **Initialize deps SYNCHRONOUSLY** before spawning
3. **Use `BEADS_NO_DAEMON=1`** in worker command (worktrees share DB)
4. **Wait 8+ seconds** before sending prompt for Claude to initialize

## References

- [handoff-format.md](references/handoff-format.md) - Worker handoff note format
- [model-routing.md](references/model-routing.md) - Model selection guide
