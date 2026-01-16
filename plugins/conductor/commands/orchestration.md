---
description: "Load orchestration context for multi-session workflows. Run this BEFORE bd-swarm, bd-swarm-auto, or plan-backlog."
---

# Orchestration Context

This command loads spawn patterns, tmux commands, and worker coordination knowledge needed for conductor workflows.

**Run this first** before:
- `/conductor:bd-swarm`
- `/conductor:bd-swarm-auto`
- `/conductor:plan-backlog`

---

## Architecture

```
Vanilla Claude Session (you)
├── Task tool -> can spawn subagents
│   ├── conductor:code-reviewer (sonnet) - review changes
│   ├── conductor:skill-picker (haiku) - find/install skills
│   └── conductor:tui-expert (opus) - spawn TUI tools
├── Worktree setup via scripts/setup-worktree.sh
├── Monitoring via scripts/monitor-workers.sh
└── Terminal Workers via TabzChrome spawn API
    └── Each has full Task tool, can spawn own subagents
```

---

## Quick Reference

### Spawn Worker
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"Claude: Task Name\", \"workingDir\": \"/path\", \"command\": \"BD_SOCKET=/tmp/bd-worker.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions\"}")

SESSION=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession')
```

### Send Prompt
```bash
sleep 4  # Wait for Claude to initialize
tmux send-keys -t "$SESSION" -l 'Your prompt here...'
sleep 0.3  # CRITICAL: prevents premature submission
tmux send-keys -t "$SESSION" C-m
```

### Monitor Workers
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --spawn   # Start monitor
${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --summary # Poll status
```

### Kill Session
```bash
tmux kill-session -t "$SESSION"
```

---

## Subagents (via Task Tool)

| Subagent | Model | Purpose |
|----------|-------|---------|
| `conductor:code-reviewer` | sonnet | Autonomous review |
| `conductor:skill-picker` | haiku | Search/install skills |
| `conductor:tui-expert` | opus | Spawn btop, lazygit, lnav |
| `conductor:docs-updater` | opus | Update docs after merges |

```markdown
Task(
  subagent_type="conductor:code-reviewer",
  prompt="Review changes in feature/beads-abc branch"
)
```

---

## Worktree Setup

**ALWAYS create worktrees BEFORE spawning workers** - workers in same directory cause conflicts.

```bash
${CLAUDE_PLUGIN_ROOT:-./plugins/conductor}/scripts/setup-worktree.sh "ISSUE_ID"
```

---

## Worker Completion

Workers notify the conductor when done via tmux send-keys:

```
Worker completes → /conductor:worker-done
                 → tmux send-keys to $CONDUCTOR_SESSION
                 → Conductor receives "WORKER COMPLETE: ISSUE-ID - summary"
```

**Worker prompt should end with:**
```markdown
## When Done
Run `/conductor:worker-done ISSUE-ID`
```

**CRITICAL:** Workers MUST have `CONDUCTOR_SESSION` env var set at spawn time, or they can't notify.

---

## Workers: `bd` CLI vs MCP

Both work, but `bd` CLI is recommended for workers:

```bash
# Preferred - simpler, no MCP server dependency
bd show TabzChrome-abc
bd close TabzChrome-abc --reason "done"
bd update TabzChrome-abc --status in_progress

# Also works (if worktree created via bd worktree create)
mcp-cli call beads/show '{"id": "TabzChrome-abc"}'
```

**Why prefer `bd` CLI:**
- Always available, no MCP server connection needed
- Simpler syntax, less verbose
- Works even if MCP has issues

**Note:** MCP works in worktrees when created via `bd worktree create` (sets up beads redirect).

---

## bd CLI Reference

Essential commands for conductor workflows:

| Command | Purpose |
|---------|---------|
| `bd ready` | Show issues ready to work (no blockers) |
| `bd show <id>` | View issue details |
| `bd update <id> --status in_progress` | Claim work |
| `bd close <id> --reason "done"` | Complete work |
| `bd worktree create <name>` | Create worktree with beads redirect |
| `bd prime` | Output AI workflow context (run after session start) |
| `bd sync` | Sync with git remote |
| `bd stats` | Project statistics |

### Worktree Commands

```bash
bd worktree create feature-auth           # Create worktree with beads redirect
bd worktree create bugfix --branch fix-1  # Create with specific branch name
bd worktree list                          # List all worktrees
bd worktree remove feature-auth           # Remove worktree (with safety checks)
```

The `setup-worktree.sh` script wraps `bd worktree create` with npm install and build.

---

## Best Practices

1. **Max 4 terminals** - Prevents statusline chaos
2. **Use worktrees** - Isolate workers
3. **Set CONDUCTOR_SESSION** - So workers can notify (REQUIRED)
4. **Set BD_SOCKET per worker** - Isolates beads daemon
5. **Use `bd` CLI** - Not beads MCP commands
6. **Include completion command** - Always end prompts with `/conductor:worker-done`
7. **Clean up** - Kill sessions and remove worktrees when done

---

## Orchestration context loaded. Ready to run conductor workflows.
