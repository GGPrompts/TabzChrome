# Beads Commands Reference

Complete command reference for beads issue tracking. **Prefer MCP tools when available** - they're more efficient than CLI.

## MCP Tools (Preferred)

Use `MCPSearch` to find beads tools, then call them directly:

```
MCPSearch(query="beads")
```

### Common Operations

| Action | MCP Tool | CLI Fallback |
|--------|----------|--------------|
| Find ready work | `mcp__beads__ready()` | `bd ready --json` |
| View issue | `mcp__beads__show(issue_id="ID")` | `bd show ID --json` |
| List issues | `mcp__beads__list(status="open")` | `bd list --status open --json` |
| Create issue | `mcp__beads__create(title="...", priority=2)` | `bd create "..." --priority 2` |
| Update issue | `mcp__beads__update(issue_id="ID", status="in_progress")` | `bd update ID --status in_progress` |
| Close issue | `mcp__beads__close(issue_id="ID", reason="done")` | `bd close ID --reason "done"` |
| Add dependency | `mcp__beads__dep(issue_id="A", depends_on_id="B")` | `bd dep add A B` |
| See blocked | `mcp__beads__blocked()` | `bd blocked --json` |
| Stats | `mcp__beads__stats()` | `bd stats` |

### MCP Tool Examples

```python
# Find work
mcp__beads__ready(limit=5)

# Create with full details
mcp__beads__create(
  title="Add dark mode",
  description="Implement dark mode toggle",
  issue_type="feature",
  priority=2,
  labels=["frontend", "ui"]
)

# Update with notes
mcp__beads__update(
  issue_id="bd-xyz",
  status="in_progress",
  notes="Started implementation, focusing on CSS variables first"
)

# Add dependency
mcp__beads__dep(
  issue_id="bd-impl",      # This issue...
  depends_on_id="bd-design", # ...is blocked by this one
  dep_type="blocks"
)

# Close with reason
mcp__beads__close(
  issue_id="bd-xyz",
  reason="Implemented dark mode with CSS variables and localStorage persistence"
)
```

## CLI Reference (Fallback)

Use CLI when MCP tools aren't available or for operations like `bd sync`.

### Issue Lifecycle

```bash
# Create
bd create "Title"                    # Basic issue
bd create "Title" --priority 1       # With priority (0=critical, 4=backlog)
bd create "Title" --type bug         # Types: task, bug, feature, epic, chore
bd create "Title" --label frontend   # With labels

# Read
bd list                              # All issues
bd list --status open                # Filter by status
bd list --label frontend             # Filter by label
bd show ID                           # Full details
bd show ID --json                    # JSON output

# Update
bd update ID --priority 1            # Change priority
bd update ID --status in_progress    # Change status
bd update ID --title "New title"     # Change title
bd update ID --description "..."     # Change description
bd update ID --notes "..."           # Add notes (for prompts!)
bd update ID --estimate 60           # Estimate in minutes
bd update ID --assignee "name"       # Assign

# Close
bd close ID                          # Close with prompt for reason
bd close ID --reason "done"          # Close with reason
```

### Dependencies

```bash
bd dep add BLOCKED BLOCKER           # BLOCKED is blocked by BLOCKER
bd dep remove BLOCKED BLOCKER        # Remove dependency
bd dep list ID                       # Show dependencies for issue
bd blocked                           # Show all blocked issues
bd ready                             # Show unblocked issues
```

### Labels

```bash
bd label add ID frontend,urgent      # Add labels
bd label remove ID urgent            # Remove label
bd label list                        # List all labels in use
```

### Organization

```bash
bd stats                             # Overview statistics
bd ready                             # What can be worked on now
bd ready --json                      # JSON for scripting
bd blocked                           # What's stuck
bd blocked --json                    # JSON with blocker details
```

### Sync & Daemon (CLI Only)

These operations don't have MCP equivalents:

```bash
bd sync                              # Sync with git (JSONL)
bd daemon start                      # Start background sync
bd daemon stop                       # Stop daemon
bd daemon status                     # Check daemon health
```

### Advanced

```bash
# Defer (hide until date)
bd update ID --defer "+2d"           # Show in 2 days
bd update ID --defer "2025-02-01"    # Show on date
bd update ID --defer ""              # Clear defer

# External references
bd update ID --external-ref "gh-123" # Link to GitHub issue

# Due dates
bd update ID --due "+1w"             # Due in 1 week
bd update ID --due "friday"          # Due Friday

# Claiming (atomic assign + in_progress)
bd update ID --claim                 # Claim issue for yourself
```

## Output Formats

CLI commands support `--json` for scripting:

```bash
bd list --json | jq '.[].title'
bd ready --json | jq -r '.[].id'
bd show ID --json | jq -r '.[0].notes'
```

MCP tools return structured data directly - no JSON parsing needed.
