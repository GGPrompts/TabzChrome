# Agent Instructions

This project uses **ggbd** (beads) for issue tracking with a shared Supabase/Postgres backend.

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
ggbd show <id>          # View issue details
ggbd update <id> --status in_progress  # Claim work
ggbd close <id>         # Complete work
# Supabase auto-syncs (no manual sync needed)
```

## Landing The Plane (When Shipping)

Only do this workflow when asked to land changes (commit/push), or when finishing a change that should clearly be published.

1. File ggbd issues for follow-ups (only if needed)
2. Run relevant quality gates (tests/linters/build) if applicable
3. Update/close ggbd issue(s) if used
4. Publish:
   ```bash
   git pull --rebase
   git push
   git status  # should show "up to date with origin"
   ```
5. Hand off: brief context for next session

If not shipping, leave a clear handoff summary instead.
