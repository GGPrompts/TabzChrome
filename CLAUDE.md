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
extension/                      backend/
├── sidepanel/sidepanel.tsx     ├── server.js (Express + WebSocket)
├── components/                 ├── modules/
│   ├── Terminal.tsx            │   ├── pty-handler.js
│   └── SettingsModal.tsx       │   ├── terminal-registry.js
├── hooks/                      │   └── tmux-session-manager.js
│   ├── useTerminalSessions.ts  └── routes/
│   ├── useProfiles.ts              ├── api.js
│   └── useClaudeStatus.ts          └── browser.js (MCP)
├── background/background.ts
└── shared/messaging.ts
```

**Key patterns:**
- **Terminal IDs**: `ctt-{profile}-{uuid}` prefix for Chrome extension terminals
- **State**: Chrome storage (UI) + tmux (process persistence)
- **Communication**: WebSocket for terminal I/O, Chrome messages for extension

---

## Core Principles

1. **Windows Terminal Simplicity** - Just bash terminals with profiles
2. **Profiles Over Complexity** - Appearance + optional command, directory inherits from header
3. **Smart Directory Inheritance** - Global working directory in header, profiles inherit if empty
4. **Chrome Native** - Side panel API (Manifest V3), no external dependencies
5. **Hybrid State** - Chrome storage for UI state + tmux for process persistence

---

## Development Rules

### ALWAYS
- Keep it simple - if it adds complexity, remove it
- Test bash terminals only - no other shell types
- Responsive CSS - should work at different sidebar widths
- Profiles in Chrome storage - user data must survive extension updates

### NEVER
- Don't add complex terminal types - bash only
- Don't over-engineer - simple solutions win
- Don't break WebSocket protocol - backend compatibility critical
- Don't bundle static JSON - default profiles load once, user edits in settings

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

### Plugin/Skill Sync
Skills and agents exist in two places that must stay in sync:

| Location | Purpose |
|----------|---------|
| `.claude/skills/`, `.claude/agents/` | Project-level (Claude reads these) |
| `plugins/*/skills/`, `plugins/*/agents/` | Plugin distribution (for sharing) |

**When updating skills/agents:** Update both locations, or copy from one to the other.
```bash
# Example: sync xterm-js skill to plugin
cp -r .claude/skills/xterm-js/* plugins/xterm-js/skills/xterm-js/
```

---

## Quick Reference

### Commands
```bash
# Development
./scripts/dev.sh              # Start backend (creates tabzchrome tmux session)
npm run build                 # Build extension
npm test                      # Run tests

# Debugging
tmux ls | grep "^ctt-"        # List extension terminals
tmux capture-pane -t Bash -p  # Capture terminal output
ps aux | grep "node server"   # Check backend running
```

### Build & Deploy
```bash
npm run build
# WSL: rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/
# Then reload at chrome://extensions
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
| `extension/background/background.ts` | Service worker, WebSocket management |
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

### Autonomous Debugging
```bash
# Check backend + terminals without asking user
ps aux | grep "node server.js" | grep -v grep
tmux ls | grep "^ctt-"
tmux capture-pane -t tabzchrome:backend -p -S -50
```

### Key Constraints
- `tabz_screenshot` cannot capture Chrome sidebar (Chrome limitation)
- Keep dependencies minimal - avoid adding npm packages
- Follow semantic versioning - project is public with active users

### Tmux Send-Keys Pattern
```bash
# Send prompt to another Claude session
tmux send-keys -t "$SESSION" -l "prompt text"
sleep 0.3  # CRITICAL: prevents premature submission
tmux send-keys -t "$SESSION" C-m
```

### When Making Changes
1. Check `docs/lessons-learned/` for common pitfalls
2. Update CHANGELOG.md after fixes
3. Run `npm test` before committing
4. Build and test in Chrome before pushing
