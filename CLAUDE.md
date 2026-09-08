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
│   └── settings/                   │   ├── terminal-registry.js
├── hooks/                          │   └── tmux-session-manager.js
│   ├── useTerminalSessions.ts      └── routes/
│   ├── useProfiles.ts                  ├── api.js
│   └── useClaudeStatus.ts              └── browser.js (MCP)
├── background/
│   ├── index.ts                    tabz-mcp-server/src/
│   ├── websocket.ts                ├── index.ts (stdio entry)
│   ├── messageHandlers.ts          └── tools/ (MCP tool definitions)
│   ├── browserMcp/
│   │   ├── tabs.ts
│   │   ├── screenshots.ts
│   │   └── ...
│   └── ...
├── dashboard/
│   ├── App.tsx                     .claude/
│   ├── sections/                   ├── skills/        (project skills)
│   │   ├── SettingsProfiles.tsx     │   ├── tabz-browser/
│   │   ├── Files.tsx               │   ├── tabz-terminals/
│   │   ├── Terminals.tsx           │   ├── tabz-development/
│   │   └── ...                     │   └── tabz-integration/
│   └── contexts/                   ├── agents/
├── 3d/FocusScene.tsx               │   └── tabz-expert.md
└── shared/messaging.ts             └── commands/
```

**Key patterns:**
- **Terminal IDs**: `ctt-{profile}-{shortId}` prefix for Chrome extension terminals (shortId is 8 hex chars)
- **State**: Chrome storage (UI) + tmux (process persistence)
- **Communication**: WebSocket for terminal I/O, Chrome messages for extension
- **Browser trust**: `backend/modules/ws-identity.js` checks exact origins and `TABZ_EXTENSION_IDS` before token access and WebSocket upgrade. Browser frames use an identified extension channel; terminal broadcasts retain their protocol. This separates browser origins, not same-user processes. See [local browser trust](docs/local-browser-trust.md).
- **Local token file**: Backend and MCP readers resolve `tabz-auth-token` beneath the OS temporary directory; avoid hardcoding `/tmp`.
- **Saved login boundary**: `backend/modules/credential-store.js` owns local `~/.tabzchrome` files (`TABZ_HOME` override); metadata routes return field names and readiness, while the fill relay uses values internally. Protected prompt terminals require the in-process `SECRET_SPAWN` capability and retain classification in tmux. See [saved login boundaries](docs/saved-logins.md).
- **Credential document protection**: `extension/background/browserMcp/documentProtection.ts` serializes per-tab content-read and credential-entry admission separately from the debugger queue. Chrome document identities persist in session storage before entry; capture adapters check eligibility before storing or forwarding content. New content/export tools must use this boundary and validate their results before returning them. Same-document navigation and BFCache do not clear protection.
- **Capture lifecycle**: screenshot transactions share a bounded scheduler and always capture the intended debugger target. Trusted Chrome document lifecycle metadata controls console/network admission. Capture rows retain their original caller ownership; group mutations invalidate refs and diagnostics before changing membership. Deep capture ends on navigation/protection/ownership changes and requires explicit re-enable. The MAIN console bridge only supplies log content; the Chrome sender supplies document identity.
- **Prompt notifications**: background one-shot alarms poll ordinary terminal metadata and own desktop permission/question transitions. UI views report visibility for focus suppression; audio stays in its existing hooks. Protected terminal flags/session prefixes exclude status polling. Lifecycle generations discard late responses after terminal-list changes.
- **MCP transports**: `server.ts` creates the shared tool server; `index.ts` serves stdio and `http.ts` serves isolated Streamable HTTP sessions mounted by `backend/modules/tabz-mcp-mount.js` at `/mcp` and `/mcp/:preset` on port 8129. Per-session identity, backend URL and tab state use AsyncLocalStorage. Canonical MCP source and build output are mirrored to `plugins/tabz/tabz-mcp-server`.
- **CLI client**: `tabz-mcp-server/src/cli/index.ts` provides `tabz discover/call/run`; `src/client/index.ts` exports the reusable HTTP MCP client. Each run has a distinct caller identity, validates tool schemas before dispatch, and latches uncertain mutations. The default is `http://localhost:8129/mcp/page-agent`; no model or AI SDK is involved. See `docs/tabz-cli.md`.
- **Compact browser tools**: `tabz_read_page` publishes document-bound refs for `tabz_act`; refs are invalidated by rereads, navigation, removal and ownership changes. The extension admits reads/actions through the credential document boundary. `tabz_batch` dispatches sequentially through the current server's enabled-tool registry and stops on the first error. It is not a workflow engine or a retry mechanism.

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
TABZ_TOKEN_FILE=$(node -p 'require("node:path").join(require("node:os").tmpdir(), "tabz-auth-token")')
TOKEN=$(cat "$TABZ_TOKEN_FILE")
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
| `.claude/agents/tabz-expert.md` | Browser automation specialist using the configured MCP preset |

### MCP Tools (Project-Scoped)

The full catalog has 97 `tabz_*` tools; `page-agent` selects 20. This project's `.mcp.json` configures the server. Schema loading depends on the client and preset; size estimates and measured comparisons are in `docs/planning/glass-catchup-2026-09-07/tool-overhead-verification.md`.

### Spawning Workers

For parallel work, spawn vanilla Claude workers on worktrees:

```bash
# Create worktree (bd discovers the shared database through Git)
bd worktree create feature-branch

# Spawn worker with BEADS_WORKING_DIR for MCP tools
TABZ_TOKEN_FILE=$(node -p 'require("node:path").join(require("node:os").tmpdir(), "tabz-auth-token")')
TOKEN=$(cat "$TABZ_TOKEN_FILE")
PROJECT_DIR=$(pwd)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"Feature Worker\", \"workingDir\": \"../feature-branch\", \"command\": \"BEADS_WORKING_DIR=$PROJECT_DIR claude\"}"
```

**Key:** `BEADS_WORKING_DIR` tells the beads MCP server where to find the database. Point it to the main repo, not the worktree.

Workers receive plain prompts and use Beads through `bd show` and the prepared issue instructions. During orchestrated waves, the orchestrator owns issue updates and closure.

### Beads Integration

- At session start, call beads MCP `context(workspace_root='<project_root>')` to scope issues to this project's `tc` prefix

Track work across sessions with beads:
```bash
ggbd ready                    # Find available work
ggbd show <id>                # View issue details
ggbd close <id> --reason="done"  # Complete work
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
