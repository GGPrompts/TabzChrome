---
name: gg-status
description: "Show status of workers, issues, and plugins"
---

# Status Dashboard

View the current state of workers, issues, and the conductor system.

## Usage

```bash
/conductor:status
```

## What It Shows

### 1. Active Workers

```bash
# List workers via TabzChrome API
curl -s http://localhost:8129/api/agents | jq '.data[] | {name, state, workingDir}'
```

Shows:
- Worker name (issue ID)
- State (Processing, Awaiting Input, etc.)
- Working directory (worktree path)

### 2. Issue Status

```bash
# Get issue counts by status
mcp__beads__stats()
```

Or via CLI:
```bash
bd stats
```

Shows:
- Total open issues
- Ready (unblocked, prepared)
- In progress (being worked)
- Blocked
- Recently closed

### 3. Ready Queue

```bash
# Issues ready for workers
mcp__beads__ready()
```

Shows issues that:
- Have no blockers
- Have `ready` label (prompt prepared)
- Are not epics

### 4. Plugin Health

| Plugin | Check |
|--------|-------|
| TabzChrome | `curl -sf http://localhost:8129/api/health` |
| Beads daemon | `bd daemon status` |
| MCP server | `mcp-cli tools tabz` |

## Example Output

```markdown
## Conductor Status

### Workers (2 active)
| Name | State | Worktree |
|------|-------|----------|
| BD-abc | Processing | .worktrees/BD-abc |
| BD-xyz | Awaiting Input | .worktrees/BD-xyz |

### Issues
| Status | Count |
|--------|-------|
| Ready | 3 |
| In Progress | 2 |
| Blocked | 1 |
| Closed (today) | 5 |

### Ready Queue
1. BD-def - "Fix terminal resize"
2. BD-ghi - "Add dark mode toggle"
3. BD-jkl - "Update documentation"

### System Health
- TabzChrome: OK
- Beads daemon: Running
- MCP server: Connected
```

## Quick Commands

```bash
# Workers only
curl -s http://localhost:8129/api/agents | jq '.data[] | select(.workingDir | contains(".worktrees/")) | {name, state}'

# Ready issues only
bd ready --label ready --json | jq -r '.[].id'

# Blocked issues
bd blocked --json | jq -r '.[] | "\(.id): blocked by \(.blocked_by | join(", "))"'
```
