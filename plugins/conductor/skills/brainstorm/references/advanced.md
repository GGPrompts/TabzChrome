# Advanced Beads Features

Features for complex workflows - use sparingly.

## Gates

Gates are issues that block other work until an external condition is met.

```bash
# Create a gate
bd create "CI must pass" --type gate

# Link to external system
bd update GATE-ID --await-id "gh-run-12345"

# Gate blocks dependent work
bd dep add deploy-task GATE-ID
```

### Gate Use Cases

- CI/CD pipeline completion
- Code review approval
- External API availability
- Manual QA sign-off

### Checking Gates

```bash
# Gates with await status
bd list --type gate --json | jq '.[] | select(.awaitId)'
```

## Agents

Agent-type issues track Claude worker sessions.

```bash
# Create agent tracker
bd create "Worker 1: Auth feature" --type agent

# Link to session
bd update AGENT-ID --session "ctt-default-abc123"

# Close when worker completes
bd close AGENT-ID --reason "completed auth feature"
```

### Agent Tracking Pattern

```bash
# Before spawning worker
AGENT=$(bd create "Worker: $ISSUE" --type agent --json | jq -r '.id')

# Spawn worker
SESSION=$(curl -X POST .../spawn | jq -r '.sessionName')

# Link them
bd update $AGENT --session "$SESSION"

# Monitor
bd list --type agent --status in_progress
```

## Defer (Time-Based Visibility)

Hide issues until a future date:

```bash
# Defer for 2 days
bd update ID --defer "+2d"

# Defer until specific date
bd update ID --defer "2025-02-01"

# Defer until next Monday
bd update ID --defer "next monday"

# Clear defer
bd update ID --defer ""
```

Deferred issues don't appear in `bd ready` until the date passes.

### Defer Use Cases

- Waiting for external dependency
- Scheduled maintenance windows
- "Revisit later" items
- Sprint planning (defer to next sprint)

## Due Dates

Track deadlines:

```bash
# Due in 1 week
bd update ID --due "+1w"

# Due Friday
bd update ID --due "friday"

# Due specific date
bd update ID --due "2025-01-31"

# Clear due date
bd update ID --due ""
```

### Viewing Due Issues

```bash
# Issues due soon
bd list --json | jq '[.[] | select(.due)] | sort_by(.due)'
```

## External References

Link to external systems:

```bash
# Link to GitHub issue
bd update ID --external-ref "gh-123"

# Link to Jira
bd update ID --external-ref "PROJ-456"

# Multiple refs (update again)
bd update ID --external-ref "gh-123,jira-456"
```

## Compact (Archiving)

Archive old closed issues to reduce clutter:

```bash
# Compact issues closed before date
bd compact --before "2025-01-01"

# Preview what would be compacted
bd compact --before "2025-01-01" --dry-run
```

Compacted issues are summarized and moved to archive.

## Issue Types Reference

| Type | Purpose |
|------|---------|
| `task` | Default - a unit of work |
| `bug` | Something broken |
| `feature` | New functionality |
| `epic` | Container for related tasks |
| `chore` | Maintenance, cleanup |
| `gate` | External blocker |
| `agent` | Track worker session |
| `molecule` | Workflow template instance |

## Sandbox Mode

For workers in isolated environments:

```bash
# Read-only mode (workers can read but not write)
bd --readonly list

# Sandbox mode (no daemon, no auto-sync)
bd --sandbox update ID --status in_progress
```

## Environment Variables

```bash
BD_ACTOR="worker-1"          # Actor name for audit trail
CLAUDE_SESSION_ID="abc123"   # Auto-link to session on close
```
