# Agent Instructions

This project uses **ggbd** (beads) for issue tracking. Run `ggbd onboard` to get started.
Use `ggbd prime` for workflow context, and `ggbd hooks install` if you want auto-injection.

## Project Context

- Chrome extension side panel + Node.js backend + MCP server
- Backend runs on `localhost:8129` and uses tmux for sessions
- Bash-only terminals; avoid adding other shell types

## Development Rules

- Keep it simple; avoid over-engineering
- Cross-platform only: no hardcoded paths or OS-specific assumptions
- Do not break WebSocket protocol or Chrome storage schema
- Avoid adding new npm dependencies unless absolutely necessary

## Build & Test

- Use `/rebuild` to build the extension (do not use `npm run build`)
- Start backend with `./scripts/dev.sh` (or `cd backend && npm start`)
- Run tests with `npm test -- --run`

## Documentation Updates

- Update `CHANGELOG.md` for user-visible changes
- Add lessons to `docs/lessons-learned/` for tricky bugs
- Update `CLAUDE.md` only for architecture changes

## Quick Reference

```bash
ggbd ready              # Find available work
ggbd create "Title" --type task --priority 2  # Create issue
ggbd show <id>          # View issue details
ggbd update <id> --status in_progress  # Claim work
ggbd close <id>         # Complete work
# Supabase auto-syncs (no manual sync needed)
ggbd prime              # Workflow context
ggbd hooks install      # Auto-inject ggbd context at session start
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   # Supabase auto-syncs (no manual sync needed)
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with ggbd (beads)

**IMPORTANT**: This project uses **ggbd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why ggbd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
ggbd ready --json
```

**Create new issues:**

```bash
ggbd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
ggbd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
ggbd update bd-42 --status in_progress --json
ggbd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
ggbd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `ggbd ready` shows unblocked issues
2. **Claim your task**: `ggbd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `ggbd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `ggbd close <id> --reason "Done"`

### Auto-Sync

ggbd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use ggbd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `ggbd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

<!-- END BEADS INTEGRATION -->
