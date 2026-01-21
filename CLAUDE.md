# CLAUDE.md - TabzChrome

## Overview

A **Windows Terminal-style Chrome extension** for managing bash terminals in your browser sidebar. Built with React, TypeScript, and xterm.js.

| | |
|--|--|
| **Architecture** | Chrome Extension (Side Panel) + WebSocket backend |
| **Philosophy** | Windows Terminal simplicity - bash with profiles, smart directory inheritance |
| **Port** | Backend on `localhost:8129` |

---

## Architecture

```
extension/                          backend/
├── sidepanel/sidepanel.tsx         ├── server.js (Express + WebSocket)
├── components/                     ├── modules/
│   ├── Terminal.tsx                │   ├── pty-handler.js
│   └── SettingsModal.tsx           │   ├── terminal-registry.js
├── hooks/                          │   └── tmux-session-manager.js
│   ├── useTerminalSessions.ts      └── routes/
│   ├── useProfiles.ts                  ├── api.js
│   └── useClaudeStatus.ts              └── browser.js (MCP)
├── background/
│   ├── index.ts                    tabz-mcp-server/src/
│   ├── websocket.ts                ├── index.ts (MCP server entry)
│   ├── messageHandlers.ts          └── tools/ (MCP tool definitions)
│   ├── browserMcp/
│   │   ├── tabs.ts
│   │   ├── screenshots.ts
│   │   └── ...
│   └── ...
├── dashboard/
│   ├── App.tsx                     .claude/
│   ├── sections/                   ├── skills/        (project skills)
│   │   ├── Profiles.tsx            │   ├── spawning-terminals/
│   │   ├── Files.tsx               │   ├── taking-screenshots/
│   │   ├── Terminals.tsx           │   ├── xterm-js/
│   │   └── ...                     │   └── ...
│   └── contexts/                   ├── agents/
├── 3d/FocusScene.tsx               │   └── tabz-expert.md
└── shared/messaging.ts             └── commands/
```

**Key patterns:**
- **Terminal IDs**: `ctt-{profile}-{uuid}` prefix for Chrome extension terminals
- **State**: Chrome storage (UI) + tmux (process persistence)
- **Communication**: WebSocket for terminal I/O, Chrome messages for extension
- **MCP Tools**: 77 tabz_* tools available via project-scoped `.mcp.json`

---

## Core Principles

1. **Windows Terminal Simplicity** - Just bash terminals with profiles
2. **Profiles Over Complexity** - Appearance + optional command, directory inherits from header
3. **Smart Directory Inheritance** - Global working directory in header, profiles inherit if empty
4. **Chrome Native** - Side panel API (Manifest V3), no external dependencies
5. **Hybrid State** - Chrome storage for UI state + tmux for process persistence

---

## Development Rules

> **Public Project**: This repo is public with active users on WSL2/Windows, Linux, and macOS. All changes must be cross-platform compatible. Never commit hardcoded paths, usernames, or machine-specific configuration.

### ALWAYS
- Keep it simple - if it adds complexity, remove it
- Test bash terminals only - no other shell types
- Responsive CSS - should work at different sidebar widths
- Profiles in Chrome storage - user data must survive extension updates

### NEVER
- Don't add complex terminal types - bash only
- Don't over-engineer - simple solutions win
- Don't break WebSocket protocol - backend compatibility critical

### Versioning (Public Project)
- `1.0.x` - Bug fixes, safe to update
- `1.x.0` - New features, backward compatible
- `x.0.0` - Breaking changes (avoid)

**Breaking changes include:** WebSocket format, REST API, Chrome storage schema, MCP tool parameters

### Documentation Workflow
After completing work:
1. **CHANGELOG.md** - Version entry with what changed
2. **docs/lessons-learned/** - Key insights from complex bugs
3. **CLAUDE.md** - Only for architecture changes (keep minimal!)

---

## Quick Reference

### Commands
```bash
# Development
./scripts/dev.sh              # Start backend (creates tabzchrome tmux session)
npm run build                 # Build extension
npm test                      # Run tests

# Debugging
tmux ls | grep "^ctt-"                        # List extension terminals
tail -50 backend/logs/unified.log             # View unified logs
ps aux | grep "node server"                   # Check backend running
```

### Spawn API
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "My Terminal", "workingDir": "~/projects", "command": "claude"}'
```

See `docs/API.md` for full API documentation.

---

## Key Files

| File | Purpose |
|------|---------|
| `extension/components/Terminal.tsx` | xterm.js terminal + resize handling |
| `extension/hooks/useTerminalSessions.ts` | Session lifecycle, Chrome storage sync |
| `extension/hooks/useProfiles.ts` | Profile CRUD and persistence |
| `extension/background/index.ts` | Service worker entry point |
| `extension/background/websocket.ts` | WebSocket connection management |
| `extension/background/browserMcp/` | Browser MCP handlers (tabs, screenshots, etc.) |
| `tabz-mcp-server/src/tools/` | MCP tool definitions (call backend directly) |
| `backend/modules/pty-handler.js` | PTY spawning, tmux integration |
| `backend/routes/api.js` | REST endpoints including spawn API |

---

## Known Issues

1. **WSL Connection** - Use `localhost` not `127.0.0.1` when loading from WSL path
2. **Paste to TUI Apps** - May corrupt TUI apps if not at prompt
3. **Rapid Sidebar Resize** - Quickly narrowing sidebar during heavy output can cause text wrapping corruption (rare edge case)

---

## Documentation

| Need | Location |
|------|----------|
| User guide | `README.md` |
| API reference | `docs/API.md` |
| MCP tools | `tabz-mcp-server/MCP_TOOLS.md` |
| Debugging | `docs/lessons-learned/debugging.md` |
| Terminal rendering | `docs/lessons-learned/terminal-rendering.md` |
| Chrome extension | `docs/lessons-learned/chrome-extension.md` |
| Change history | `CHANGELOG.md` |
| Roadmap | `PLAN.md` |

---

## AI Assistant Notes

### Project-Local Skills & Agents

This project has local skills and agents in `.claude/`:

| Location | Purpose |
|----------|---------|
| `.claude/skills/tabz-browser/` | Screenshots, forms, network debugging, responsive testing, TTS |
| `.claude/skills/tabz-terminals/` | Spawn workers via TabzChrome API, worktree setup |
| `.claude/skills/tabz-development/` | Working on TabzChrome codebase (Terminal.tsx, xterm.js) |
| `.claude/skills/claude-code-setup/` | Diagnose/manage Claude Code CLI config, MCP, plugins |
| `.claude/agents/tabz-expert.md` | Browser automation specialist (77 MCP tools) |

### MCP Tools (Project-Scoped)

The 77 tabz_* MCP tools are only available in this project (configured in `.mcp.json`). Use `mcp-cli` to discover and call tools.

### Spawning Workers

For parallel work, spawn vanilla Claude workers on worktrees:

```bash
# Create worktree (bd handles beads redirect automatically)
bd worktree create feature-branch

# Spawn worker with BEADS_WORKING_DIR for MCP tools
TOKEN=$(cat /tmp/tabz-auth-token)
PROJECT_DIR=$(pwd)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"Feature Worker\", \"workingDir\": \"../feature-branch\", \"command\": \"BEADS_WORKING_DIR=$PROJECT_DIR claude\"}"
```

**Key:** `BEADS_WORKING_DIR` tells the beads MCP server where to find the database. Point it to the main repo, not the worktree.

Workers receive plain prompts and use beads naturally (`bd show`, `bd close`, or MCP tools).

### Beads Integration

Track work across sessions with beads:
```bash
bd ready                    # Find available work
bd show <id>                # View issue details
bd close <id> --reason="done"  # Complete work
```

### Autonomous Debugging
```bash
ps aux | grep "node server.js" | grep -v grep
tmux ls | grep "^ctt-"
tail -50 backend/logs/unified.log
```

### Key Constraints
- `tabz_screenshot` cannot capture Chrome sidebar (Chrome limitation)
- Keep dependencies minimal - avoid adding npm packages
- Follow semantic versioning - project is public with active users

### When Making Changes
1. Check `docs/lessons-learned/` for common pitfalls
2. Update CHANGELOG.md after fixes
3. Run `npm test` before committing
4. Build and test in Chrome before pushing
