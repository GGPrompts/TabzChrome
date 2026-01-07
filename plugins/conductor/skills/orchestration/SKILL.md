---
name: orchestration
description: "Multi-session Claude workflow orchestration. Spawn workers via TabzChrome, coordinate parallel tasks, use subagents for monitoring/exploration, manage beads issues. Use this skill when coordinating multiple Claude sessions or managing complex multi-step workflows."
---

# Orchestration Skill - Multi-Session Workflows

Orchestrate multiple Claude Code sessions, spawn workers, and coordinate parallel work.

## Architecture

```
Vanilla Claude Session (you)
├── Task tool -> can spawn subagents
│   ├── conductor:initializer (opus) - create worktrees
│   ├── conductor:code-reviewer (sonnet) - review changes
│   ├── conductor:skill-picker (haiku) - find/install skills
│   └── conductor:tui-expert (opus) - spawn TUI tools
├── Monitoring via tmuxplexer (background window)
└── Terminal Workers via TabzChrome spawn API
    └── Each has full Task tool, can spawn own subagents
```

---

## Quick Reference

### Spawn Worker
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Claude: Task", "workingDir": "/path", "command": "claude --dangerously-skip-permissions"}'
```

### Send Prompt
```bash
SESSION="ctt-claude-xxx"
sleep 4
tmux send-keys -t "$SESSION" -l 'Your prompt...'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

### Monitor Workers
```bash
plugins/conductor/scripts/monitor-workers.sh --spawn   # Start monitor
plugins/conductor/scripts/monitor-workers.sh --summary # Poll status
```

### Kill Session
```bash
tmux kill-session -t "ctt-worker-xxx"
```

**Full details:** `references/terminal-management.md`

---

## Subagents (via Task Tool)

| Subagent | Model | Purpose |
|----------|-------|---------|
| `conductor:initializer` | opus | Create worktrees, install deps |
| `conductor:code-reviewer` | sonnet | Autonomous review, quality gate |
| `conductor:skill-picker` | haiku | Search/install skills |
| `conductor:tui-expert` | opus | Spawn btop, lazygit, lnav |
| `conductor:docs-updater` | opus | Update docs after merges |

```markdown
Task(
  subagent_type="conductor:initializer",
  prompt="Prepare 3 workers for issues beads-abc, beads-def"
)
```

---

## Tabz MCP Tools

| Category | Tools |
|----------|-------|
| **Tabs** | tabz_list_tabs, tabz_switch_tab, tabz_open_url |
| **Tab Groups** | tabz_create_group, tabz_add_to_group |
| **Windows** | tabz_list_windows, tabz_tile_windows |
| **Screenshots** | tabz_screenshot, tabz_screenshot_full |
| **Interaction** | tabz_click, tabz_fill, tabz_execute_script |
| **Audio/TTS** | tabz_speak, tabz_list_voices |

```bash
mcp-cli info tabz/<tool>  # Check schema before calling
```

---

## Worker Flow

```
1. Code the solution
2. Task(conductor:code-reviewer) -> quality gate
3. Acquire build lock -> npm test && npm build
4. git commit
5. bd close <issue>
```

---

## Capability Triggers

| Need | Trigger Phrase |
|------|---------------|
| Terminal UI | "use the xterm-js skill" |
| UI components | "use the shadcn-ui skill" |
| Complex reasoning | "use the sequential-thinking skill" |
| Exploration | "use subagents in parallel to explore" |
| Deep thinking | Prepend `ultrathink` |

---

## Workflows

### Parallel Workers
```bash
# Spawn workers
curl -s -X POST ... -d '{"name": "Claude: Frontend"}'
curl -s -X POST ... -d '{"name": "Claude: Backend"}'

# Monitor
plugins/conductor/scripts/monitor-workers.sh --spawn
plugins/conductor/scripts/monitor-workers.sh --summary
```

### Beads Issue Swarm

Use `/conductor:bd-swarm` or:
1. `bd ready` - Get unblocked issues
2. Spawn workers (1 per issue)
3. Send skill-aware prompts
4. Workers close issues when done

---

## Best Practices

1. **Use subagents for monitoring** - Haiku is cheap
2. **Workers are vanilla Claude** - They have full Task tool
3. **Tab groups for isolation** - Each browser worker gets own group
4. **One goal per worker** - Keep context focused
5. **Clean up when done** - Kill sessions, remove worktrees

---

## Error Handling

```bash
# Backend not running
curl -s http://localhost:8129/api/health || echo "Start TabzChrome backend"

# Auth token missing
cat /tmp/tabz-auth-token || echo "Token missing - restart backend"

# Session not found
tmux has-session -t "$SESSION" 2>/dev/null || echo "Session does not exist"
```

---

## Related Commands

| Command | Purpose |
|---------|---------|
| `/conductor:bd-swarm` | Spawn workers for beads issues |
| `/conductor:plan-backlog` | Sprint planning for parallel work |
| `/conductor:bd-status` | Check beads issue status |
| `/conductor:bd-work` | Work on a single issue |

---

## Reference Files

| File | Content |
|------|---------|
| `references/terminal-management.md` | Spawn, prompt, kill, cleanup procedures |
