# Worker Architecture

This document describes the unified worker architecture for parallel issue processing with bd-swarm.

## Overview

```
Worker (vanilla Claude via tmux/TabzChrome)
  ├─> Gets context from `bd show <issue-id>`
  ├─> For specialized tasks, invokes subagents:
  │     Task(subagent_type="frontend-builder", ...)
  │     Task(subagent_type="backend-builder", ...)
  │     Task(subagent_type="terminal-builder", ...)
  └─> Each subagent has skills in frontmatter that load on-demand
```

## What Workers ARE

- **Vanilla Claude sessions** spawned via TabzChrome API or direct tmux
- **Same plugin context** as the main session (no `--plugin-dir` isolation)
- **Subagent invokers** - workers use `Task(subagent_type=...)` for specialized work
- **Issue-focused** - each worker receives issue context and completes the task

## What Workers are NOT

- **NOT specialized agents** - no worker-frontend.md, worker-backend.md, etc.
- **NOT plugin-isolated** - no `--plugin-dir ./plugins/worker-minimal`
- **NOT skill-preloaded** - skills load via subagent frontmatter, not worker config

## Subagent Invocation

Workers invoke subagents based on issue type:

| Issue Keywords | Subagent | Skills Loaded |
|----------------|----------|---------------|
| UI, component, modal, dashboard | `frontend-builder` | aesthetic, ui-styling, web-frameworks, frontend-design |
| backend, API, server, database | `backend-builder` | backend-development, databases, better-auth |
| terminal, xterm, PTY, resize | `terminal-builder` | xterm-js |
| browser, screenshot, click | `conductor:tabz-manager` | tabz-mcp |
| review, audit, quality | `conductor:code-reviewer` | code-review |

## Why This Architecture?

1. **Simplicity** - Workers are just Claude sessions, no special configuration
2. **On-demand skills** - Skills load via subagent frontmatter, saving context
3. **Flexible** - Same worker can handle any issue type by invoking different subagents
4. **Maintainable** - Subagent definitions live in plugin `agents/` directories

## Worker Lifecycle

```
1. Spawn      → TabzChrome API or tmux creates session
2. Prompt     → Worker receives issue context via tmux send-keys
3. Work       → Worker invokes subagents as needed
4. Complete   → Worker runs /conductor:worker-done
5. Cleanup    → Session killed, worktree merged/removed
```

## Related Files

| File | Purpose |
|------|---------|
| `commands/bd-swarm.md` | Main swarm workflow |
| `skills/bd-swarm-auto/SKILL.md` | Autonomous backlog processing |
| `commands/plan-backlog.md` | Sprint planning with subagent matching |
| `scripts/completion-pipeline.sh` | Cleanup after workers complete |
