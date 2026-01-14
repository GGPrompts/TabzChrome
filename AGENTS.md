# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.
Use `bd prime` for workflow context, and `bd hooks install` if you want auto-injection.

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
bd ready              # Find available work
bd create "Title" --type task --priority 2  # Create issue
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
bd prime              # Workflow context
bd hooks install      # Auto-inject bd context at session start
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
   bd sync
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
