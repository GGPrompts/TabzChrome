# Terminal Management - Orchestration

Detailed procedures for managing Claude workers via TabzChrome.

## Get Auth Token

```bash
cat /tmp/tabz-auth-token
```

## Spawn a Worker

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Claude: Task Name", "workingDir": "/path/to/project", "command": "claude --dangerously-skip-permissions"}'
```

- Always include "Claude:" in name (enables status tracking)
- Always use `--dangerously-skip-permissions`
- Response includes `terminal.sessionName` - save for sending prompts

## Send Prompt to Worker

```bash
SESSION="ctt-claude-task-xxxxx"
sleep 4  # Wait for Claude init

# CRITICAL: Validate session exists before sending (prevents crashes)
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: Session $SESSION does not exist"
  exit 1
fi

tmux send-keys -t "$SESSION" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

## List Active Sessions

```bash
# All tmux sessions (includes TabzChrome-spawned ones)
tmux list-sessions

# Filter to workers only
tmux list-sessions -F '#{session_name}' | grep -E "worker-|ctt-"
```

## Kill a Session

```bash
# TabzChrome spawn creates tmux sessions - kill them via tmux
tmux kill-session -t "ctt-worker-xxx"

# Or by worker naming convention
tmux kill-session -t "worker-issue-id"
```

**Note:** There is no REST API to kill terminals. TabzChrome's `/api/spawn` creates tmux sessions, cleanup is via `tmux kill-session`.

## Worker Prompt Structure

When sending tasks to workers, include relevant capabilities:

```markdown
## Task
[Clear description of what needs to be done]

## Approach
- Use the xterm-js skill for terminal patterns
- Use subagents in parallel to explore the codebase
- Use tabz MCP tools for browser automation (if worker has tab group)

## Files
@path/to/relevant/file.ts
@path/to/another/file.ts

## Constraints
[What NOT to change, requirements to follow]

## Success Criteria
[How to verify the task is complete]
```

## Tab Group Isolation

When spawning multiple workers that need browser access:

1. Create a unique tab group per worker
2. Pass the groupId to the worker
3. Worker uses explicit tabId - never relies on active tab

```bash
# Create isolated tab group for worker
tabz_create_group --title "Worker-1" --color "blue"
# Returns groupId - pass to worker prompt
```

## Session Cleanup

**Critical:** Always clean up after orchestration completes. Sessions and worktrees don't auto-cleanup.

```bash
# Kill worker sessions
tmux list-sessions -F '#{session_name}' | grep -E "worker-|ctt-worker" | while read S; do
  tmux kill-session -t "$S"
done

# Remove worktrees
git worktree list | grep worktrees | awk '{print $1}' | while read W; do
  git worktree remove --force "$W"
done

# Delete merged feature branches
git branch | grep "feature/" | xargs -r git branch -d
```

**Checklist before ending session:**
- [ ] All worker tmux sessions killed
- [ ] All worktrees removed
- [ ] Feature branches merged and deleted
- [ ] `bd sync` run to persist issue state
