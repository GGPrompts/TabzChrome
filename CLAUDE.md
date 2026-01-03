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
│   ├── messageHandlers.ts          └── tools/ (MCP tool definitions,
│   ├── browserMcp/                           call backend directly)
│   │   ├── tabs.ts
│   │   ├── screenshots.ts
│   │   └── ...
│   └── ...
├── dashboard/
│   ├── App.tsx                     (Full-page dashboard UI)
│   ├── sections/
│   │   ├── Profiles.tsx            (Profile management)
│   │   ├── Files.tsx               (File browser)
│   │   ├── Terminals.tsx           (Terminal management)
│   │   ├── Audio.tsx               (Audio notifications config)
│   │   ├── McpPlayground.tsx       (MCP tool testing)
│   │   └── Settings.tsx
│   ├── components/files/           (File tree, viewers)
│   ├── components/audio/           (EventCard, PhraseEditor, etc.)
│   └── contexts/                   (React contexts)
├── 3d/FocusScene.tsx
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
/rebuild                      # Build extension (cross-platform, handles WSL copy)
npm test                      # Run tests

# Debugging
tmux ls | grep "^ctt-"                        # List extension terminals
tail -50 backend/logs/unified.log             # View unified logs (backend + browser)
lnav backend/logs/unified.log                 # Interactive log filtering (if lnav installed)
ps aux | grep "node server"                   # Check backend running

# lnav filtering (in logs window)
:filter-in \[Server\]                         # Show only Server logs
:filter-in \[Browser                          # Show only browser logs
:filter-in ERROR                              # Show only errors
:filter-out \[buildFileTree\]                 # Hide verbose file tree logs
```

### Build & Deploy
**IMPORTANT:** Always use `/rebuild` to build the extension. Never use `npm run build` with manual rsync - the skill handles cross-platform paths correctly.

```bash
/rebuild                      # Build + copy (WSL users: set TABZ_WIN_PATH in ~/.bashrc)
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
| `extension/background/index.ts` | Service worker entry point |
| `extension/background/websocket.ts` | WebSocket connection management |
| `extension/background/messageHandlers.ts` | Chrome runtime message handlers |
| `extension/background/browserMcp/` | Browser MCP handlers (tabs, screenshots, etc.) |
| `extension/3d/FocusScene.tsx` | 3D Focus Mode (Three.js + React Three Fiber) |
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

### Skills for TabzChrome Development

Use these skills when working on TabzChrome itself:

| Skill | When to Use |
|-------|-------------|
| `xterm-js` | Terminal.tsx changes, resize handling, input/output, WebSocket I/O |
| `tabz-guide` | Understanding TabzChrome features, API, MCP tools, audio/TTS |
| `tabz-mcp` | Browser automation, testing MCP tools, screenshot workflows |
| `shadcn-ui` | Dashboard UI components, settings modals, forms |
| `tailwindcss` | Styling sidepanel, dashboard, responsive layouts |

**Trigger with:** "use the xterm-js skill to debug terminal rendering"

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/rebuild` | Build extension (WSL: also copies to Windows) |
| `/ctthandoff` | Generate handoff summary, copy to clipboard, speak via TTS |
| `/bd-work` | Pick top beads issue and start working |
| `/bd-swarm` | Spawn parallel workers for multiple issues |
| `/bd-status` | Show beads issue tracker overview |
| `/plan-backlog` | Groom issues into parallelizable waves |

### Conductor Agents

For orchestrating multi-session work on TabzChrome:

| Agent | When to Use |
|-------|-------------|
| `conductor:watcher` | Monitor Claude workers, send notifications |
| `conductor:tabz-manager` | Browser automation (spawn as visible terminal) |
| `conductor:tui-expert` | Spawn btop, lazygit, lnav for system info |

**Spawn tabz-manager for browser testing:**
```bash
claude --agent conductor:tabz-manager --dangerously-skip-permissions
```

### Parallel Worker Patterns

When spawning multiple Claude workers via conductor:

**Use git worktrees** - Workers in same directory cause conflicts:
```bash
git worktree add ../TabzChrome-feature branch-name
# Spawn worker with workingDir pointing to worktree
```

**Common worker issues observed:**
1. **Prompt doesn't submit** - Always use `sleep 0.3` before `C-m`
2. **Worker finishes but doesn't close issue** - Nudge with explicit `bd close` command
3. **Worker sits idle after commit** - May need reminder to close beads issue
4. **Workers conflict on same files** - Use worktrees for parallel work

**Nudging idle workers:**
```bash
# If worker has uncommitted changes but is idle
tmux send-keys -t "$SESSION" "npm run build && git add . && git commit -m 'message' && bd close ISSUE-ID --reason 'done'" Enter
```

### Autonomous Debugging
```bash
# Check backend + terminals without asking user
ps aux | grep "node server.js" | grep -v grep
tmux ls | grep "^ctt-"
tail -50 backend/logs/unified.log              # Unified log (backend + browser)
```

### Key Constraints
- `tabz_screenshot` cannot capture Chrome sidebar (Chrome limitation)
- Keep dependencies minimal - avoid adding npm packages
- Follow semantic versioning - project is public with active users

### Clickable File Paths
File paths in terminal output and chat are clickable and open in the dashboard Files viewer.
For paths to be detected as links, use absolute paths:
- ✅ `/home/matt/projects/TabzChrome/extension/file.ts`
- ✅ `~/projects/TabzChrome/extension/file.ts`
- ❌ `./extension/file.ts` (relative paths don't resolve in chat)
- ❌ `extension/file.ts` (needs leading `/` or `~`)

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
