---
name: orchestration
description: "Multi-session Claude workflow orchestration. Spawn workers via TabzChrome, coordinate parallel tasks, use subagents for monitoring/exploration, manage beads issues. Use this skill when coordinating multiple Claude sessions or managing complex multi-step workflows."
---

# Orchestration Skill - Multi-Session Workflows

This skill enables you to orchestrate multiple Claude Code sessions, spawn workers, and coordinate parallel work using TabzChrome.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vanilla Claude Session (you)                               │
│  ✅ Has Task tool → can spawn subagents                     │
│                                                             │
│  Subagents (via Task tool):                                 │
│    → conductor:watcher (haiku) - cheap monitoring           │
│    → conductor:skill-picker (haiku) - find/install skills   │
│    → conductor:tui-expert (opus) - spawn TUI tools          │
│                                                             │
│  Terminal Workers (via TabzChrome spawn API):               │
│    → Each is a vanilla Claude with full Task tool           │
│    → Can use their own subagents for exploration            │
│    → Assigned tab groups for browser isolation              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why this works:** Skills add knowledge without restricting tools. You keep the Task tool and can spawn lightweight subagents for monitoring while workers run in separate terminals with full capabilities.

## Core Capabilities (TabzChrome)

### Tabz MCP Tools

```bash
mcp-cli info tabz/<tool>  # Check schema before calling
```

| Category | Tools |
|----------|-------|
| **Tabs** | tabz_list_tabs, tabz_switch_tab, tabz_rename_tab, tabz_get_page_info, tabz_open_url |
| **Tab Groups** | tabz_list_groups, tabz_create_group, tabz_update_group, tabz_add_to_group, tabz_claude_group_add |
| **Windows** | tabz_list_windows, tabz_create_window, tabz_tile_windows, tabz_popout_terminal |
| **Screenshots** | tabz_screenshot, tabz_screenshot_full |
| **Interaction** | tabz_click, tabz_fill, tabz_get_element, tabz_execute_script |
| **DOM/Debug** | tabz_get_dom_tree, tabz_get_console_logs, tabz_profile_performance |
| **Network** | tabz_enable_network_capture, tabz_get_network_requests |
| **Downloads** | tabz_download_image, tabz_download_file, tabz_get_downloads |
| **Audio/TTS** | tabz_speak, tabz_list_voices, tabz_play_audio |

### Subagents (via Task Tool)

Since you're running as vanilla Claude (not via `--agent`), the Task tool is available:

| Subagent | Model | Purpose | Invocation |
|----------|-------|---------|------------|
| `conductor:watcher` | haiku | Poll worker health, send notifications | `Task(subagent_type="conductor:watcher")` |
| `conductor:skill-picker` | haiku | Search/install skills from skillsmp.com | `Task(subagent_type="conductor:skill-picker")` |
| `conductor:tui-expert` | opus | Spawn btop, lazygit, lnav, tfe | `Task(subagent_type="conductor:tui-expert")` |
| `conductor:docs-updater` | opus | Update docs after merges | `Task(subagent_type="conductor:docs-updater")` |

**Example - Start background watcher:**
```
Task tool:
  subagent_type: "conductor:watcher"
  run_in_background: true
  prompt: "Monitor all Claude workers. Check every 30s. Notify on completion/errors."
```

### Terminal Workers

Workers are spawned as separate Claude sessions via TabzChrome API. Each worker:
- Has full Task tool (can spawn their own explore subagents)
- Gets an assigned tab group for browser isolation
- Runs independently with its own context window

## Terminal Management

**Get auth token:**
```bash
cat /tmp/tabz-auth-token
```

**Spawn a worker:**
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

**Send prompt to worker:**
```bash
SESSION="ctt-claude-task-xxxxx"
sleep 4  # Wait for Claude init

tmux send-keys -t "$SESSION" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

**List active terminals:**
```bash
curl -s http://localhost:8129/api/agents | jq '.data[] | {id, name, state}'
```

**Kill a terminal:**
```bash
curl -X DELETE http://localhost:8129/api/agents/{terminal-id}
```

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

### Capability Triggers

Skills require explicit phrasing. Use "use the ___ skill to..." format:

| Need | Trigger |
|------|---------|
| Terminal UI | "use the xterm-js skill" |
| Debugging | "use the debugging skill" |
| UI components | "use the shadcn-ui skill" |
| Complex reasoning | "use the sequential-thinking skill" |
| Exploration | "use subagents in parallel to explore" |
| Deep thinking | Prepend `ultrathink` |

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

## Workflows

### Parallel Workers

```bash
# Spawn multiple workers
curl -s -X POST http://localhost:8129/api/spawn ... -d '{"name": "Claude: Frontend", ...}'
curl -s -X POST http://localhost:8129/api/spawn ... -d '{"name": "Claude: Backend", ...}'

# Start background watcher
Task(subagent_type="conductor:watcher", run_in_background=true,
     prompt="Monitor workers, notify on completion")
```

### Beads Issue Swarm

Use `/conductor:bd-swarm` command or:

1. `bd ready` - Get unblocked issues
2. Spawn workers (1 per issue)
3. Send skill-aware prompts with issue context
4. Workers close issues when done: `bd close <id> --reason "..."`

### TUI Tools

Invoke tui-expert subagent for system info:

```
Task(subagent_type="conductor:tui-expert",
     prompt="Check system resources with btop")
```

## Best Practices

1. **Use subagents for monitoring** - Haiku watcher is cheap
2. **Workers are vanilla Claude** - They have full Task tool
3. **Tab groups for isolation** - Each browser worker gets own group
4. **One goal per worker** - Keep context focused
5. **Capability triggers** - Activate skills explicitly
6. **Clean up when done** - Kill terminals after completion

## Error Handling

**Backend not running:**
```bash
curl -s http://localhost:8129/api/health || echo "Start TabzChrome backend"
```

**Auth token missing:**
```bash
cat /tmp/tabz-auth-token || echo "Token missing - restart backend"
```

**Session not found:**
```bash
tmux has-session -t "$SESSION" 2>/dev/null || echo "Session does not exist"
```

## Related Commands

- `/conductor:bd-swarm` - Spawn workers for beads issues
- `/conductor:plan-backlog` - Sprint planning for parallel work
- `/conductor:bd-status` - Check beads issue status
- `/conductor:bd-work` - Work on a single beads issue
