# Historical Planning Document (v1.0 - v2.1)

**Archived**: December 4, 2025
**Note**: This document contains historical planning content from the project's early development. Kept for reference.

---

## Project Identity Evolution

**What TabzChrome became:**
A full-featured Chrome extension port of Tabz with:
- Tab-based terminal interface
- Profiles system with working directory inheritance
- Settings modal for profile management
- Complete terminal features in browser sidebar

**Original alternative vision (not pursued):**
A lightweight tmux-polling sidebar:
- Simple session list (not tabs)
- Poll tmux every 2s for sessions
- No state management (tmux is truth)
- Single terminal viewer

**Decision made**: Keep full-featured approach - it works well.

---

## Completed Features (v1.0.0 - v2.2.0)

### Core Features
- Chrome side panel integration (sidebar persists across tabs)
- Terminal persistence (survive extension reloads)
- Tmux integration (sessions survive, auto-restore on reload)
- Session restoration (`ctt-` prefix for easy cleanup)
- Full terminal emulation with xterm.js
- WebSocket communication via background worker
- Copy/paste in terminals (Ctrl+Shift+C/V)

### Profiles System (v2.0+)
- Profiles with name, command, workingDir, font, theme
- Default profile selection
- Global working directory in header
- Profile inheritance (empty workingDir inherits from header)
- Recent directories with persistence
- Windows Terminal-style split + button

### Settings
- Settings modal for profile management
- Font size (12-24px) per profile
- Font family options (6 choices)
- Theme (dark/light) per profile

### Browser MCP Server (v1.2.0+)
- 11 MCP tools for browser automation
- `/ttmcp` interactive command
- Screenshot, click, fill, navigate capabilities

### HTTP API (v2.2.0)
- POST /api/spawn for programmatic terminal spawning
- Session isolation with ctt- prefix filtering
- Backend sharing across multiple projects

---

## Architecture Decisions

### Hybrid State Management
- Chrome storage for UI state (profiles, settings, recent dirs)
- tmux for terminal persistence (processes survive backend restart)
- WebSocket for real-time terminal I/O

### Terminal ID Prefixes
- `ctt-` prefix for Chrome extension terminals
- Distinguishes from web app terminals (`tt-`)
- Enables easy cleanup of orphaned sessions

### Manifest V3 Compliance
- Service worker instead of background page
- Chrome storage API
- Chrome runtime messaging

---

## Features Intentionally Excluded

- **Split terminals** - Sidebar is narrow, use tmux splits
- **Multi-window support** - One sidebar per window by design
- **Background gradients** - Simplicity over aesthetics
- **Tab drag-and-drop** - Narrow targets, awkward UX
- **Per-terminal customization** - Settings apply via profiles

---

## Original Version History

- **v1.0.0** - Initial release with basic terminal tabs
- **v1.0.1** - Spawn options editor, font family support
- **v1.2.0** - Browser MCP Server with 6 automation tools
- **v2.0.0** - Profiles system, Windows Terminal-style UI
- **v2.1.0** - Working directory inheritance, starting commands
- **v2.2.0** - HTTP spawn API, session isolation

---

*This document archived from the original PLAN.md during the "Getting Ready to Share" cleanup.*
