---
name: tabz-guide
description: "Progressive disclosure guide to TabzChrome capabilities. This skill should be used when users ask about profiles, terminal management, browser automation, MCP tools, audio/TTS notifications, integration, debugging, API, or setup. Provides on-demand help organized by topic with references to detailed documentation."
---

# TabzChrome Guide

TabzChrome is a Chrome extension providing **full Linux terminals in your browser sidebar** with persistence, profiles, and browser automation.

## When to Use This Skill

Trigger on questions about:
- Profile creation and management
- Terminal spawning and API integration
- MCP browser automation tools
- Audio/TTS notifications and settings
- Debugging terminal issues
- Recent features and changes

## Quick Reference

### Profiles

Profiles are templates for spawning terminals with saved settings (theme, font, directory, startup command).

**To create a profile:**
1. Open Settings (⚙️) → Profiles tab
2. Click "Add Profile"
3. Set name, category, theme, font size
4. Optional: working directory (empty = inherits from header)
5. Optional: startup command (e.g., `lazygit`, `htop`)

**Key features:**
- Smart directory inheritance from header
- Categories with 9 colors (collapsible)
- Import/Export as JSON
- Drag-drop reordering in dashboard

### Integration

**Markdown Links** - Create runnable buttons in `.md` files viewed in dashboard:
```markdown
[Run Tests](tabz:spawn?cmd=npm%20test&name=Tests)
[Launch Claude](tabz:spawn?profile=claude%20code)
[Queue to Chat](tabz:queue?text=git%20status)
[Paste to Terminal](tabz:paste?text=pwd)
```

| Action | Format | Button Color |
|--------|--------|--------------|
| Spawn | `tabz:spawn?cmd=xxx` | Green |
| Spawn profile | `tabz:spawn?profile=name` | Green |
| Queue to chat | `tabz:queue?text=xxx` | Blue |
| Paste to terminal | `tabz:paste?text=xxx` | Orange |

**Spawn API** - Create terminals programmatically:
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Worker", "workingDir": "~/projects", "command": "claude"}'
```

**HTML triggers** - Add to any web page element:
```html
<button data-terminal-command="npm run dev">Start Dev</button>
```

For full API documentation, read `references/api-endpoints.md`.

### MCP Tools

71 tools for browser automation: screenshots, clicks, downloads, network capture, debugger, audio/TTS, history, sessions, cookies, emulation, and notifications.

**Quick example:**
```bash
mcp-cli info tabz/tabz_screenshot       # Check schema first
mcp-cli call tabz/tabz_screenshot '{}'  # Capture viewport
```

| Category | Tools |
|----------|-------|
| Tab Management | `list_tabs`, `switch_tab`, `rename_tab` |
| Screenshots | `screenshot`, `screenshot_full` |
| Interaction | `click`, `fill`, `execute_script` |
| Downloads | `download_image`, `download_file`, `cancel_download` |
| Debugger | `get_dom_tree`, `profile_performance`, `get_coverage` |
| Audio/TTS | `speak`, `list_voices`, `play_audio` |
| History | `history_search`, `history_visits`, `history_recent`, `history_delete_*` |
| Sessions | `sessions_recently_closed`, `sessions_restore`, `sessions_devices` |
| Cookies | `cookies_get`, `cookies_list`, `cookies_set`, `cookies_delete`, `cookies_audit` |
| Emulation | `emulate_device`, `emulate_geolocation`, `emulate_network`, `emulate_media`, `emulate_vision` |
| Notifications | `notification_show`, `notification_update`, `notification_clear`, `notification_list` |

**Visual Feedback:** Elements glow when tools interact (🟢 click, 🔵 fill, 🟣 inspect).

**Getting Selectors:** Right-click any element → "Send Element to Chat" for unique CSS selector.

For complete tool reference, read `references/mcp-tools.md`.

### Debugging

**Essential commands:**
```bash
ps aux | grep "node server.js" | grep -v grep  # Backend running?
tmux ls | grep "^ctt-"                          # List terminals
curl http://localhost:8129/api/health           # Health check
```

For common issues and solutions, read `references/debugging.md`.

### Audio/TTS

Neural text-to-speech notifications for Claude Code status changes. Audio generated via edge-tts, played through Chrome.

**Key settings** (Settings → Audio):
- **Voice**: 10 neural voices, or "Random" for unique voice per terminal
- **Rate**: Speech speed (-50% to +100%)
- **Pitch**: Voice pitch (-200Hz to +300Hz) - higher = more urgent
- **Events**: Ready, session start, tools, subagents, context warnings

**Context alerts auto-elevate pitch + rate:**
- 50% warning: `+100Hz`, `+15%` rate
- 75% critical: `+200Hz`, `+30%` rate

**API example:**
```bash
curl -X POST http://localhost:8129/api/audio/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "Task complete", "pitch": "+20Hz"}'
```

For voice codes, parameters, and API details, read `references/audio-tts.md`.

### Recent Features

| Version | Key Feature |
|---------|-------------|
| 1.2.19 | Codebase simplification (MCP client removed, hooks extracted) |
| 1.2.8 | Send Element to Chat, MCP visual feedback, debugger tools |
| 1.1.16 | tabz-guide plugin, tui-expert agent |
| 1.1.15 | Context window % on tabs, audio alerts |
| 1.1.14 | 3D Focus Mode |

For full changelog, read `references/changelog.md`.

## Advanced Topics

### Ghost Badge (Detached Sessions)

To free tab space while keeping sessions alive:
1. Right-click tab → "👻 Detach Session"
2. Ghost badge (👻) appears in header with count
3. Click badge → Reattach or Kill sessions

### Claude Status Tracking

Tabs show live Claude status with emoji indicators:
- 🤖✅ Ready/waiting
- 🤖⏳ Thinking
- 🤖🔧 Using tool
- 🤖🤖 Subagents running

**Voice pool:** Select "Random (unique per terminal)" to distinguish multiple Claude sessions.

### Renderer Toggle

Toggle WebGL/Canvas in header (GPU icon):
- **Canvas** (default): Works everywhere, supports light mode
- **WebGL**: GPU-accelerated, dark mode only

## File Locations

> Paths relative to TabzChrome installation directory.

| File | Purpose |
|------|---------|
| `README.md` | User guide |
| `docs/API.md` | REST API reference |
| `CHANGELOG.md` | Version history |
| `tabz-mcp-server/MCP_TOOLS.md` | MCP tools reference |
| `docs/PLUGIN.md` | Plugin/hook setup |

## Essential Commands

```bash
# Backend
./scripts/dev.sh                  # Start backend (tmux session)

# Build
npm run build                     # Build extension

# MCP
mcp-cli info tabz/<tool>          # Check schema (REQUIRED)
mcp-cli call tabz/<tool> '{...}'  # Call tool

# API
curl http://localhost:8129/api/health
```

---

For detailed information on any topic, read the corresponding file in `references/`.
