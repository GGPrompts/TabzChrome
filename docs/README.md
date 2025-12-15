# TabzChrome Documentation Index

This directory contains project documentation organized by category.

**Last Updated**: December 13, 2025

---

## Directory Structure

### `/lessons-learned/` - Bug Insights & Best Practices
Debugging lessons, gotchas, and best practices organized by topic.

- **[README.md](lessons-learned/README.md)** - Index and contribution guidelines
- **[terminal-rendering.md](lessons-learned/terminal-rendering.md)** - xterm.js, resize coordination, tmux
- **[chrome-extension.md](lessons-learned/chrome-extension.md)** - Storage, reconnection, audio
- **[react-patterns.md](lessons-learned/react-patterns.md)** - Hooks, performance, state
- **[architecture.md](lessons-learned/architecture.md)** - Multi-window, splits, WebSocket
- **[debugging.md](lessons-learned/debugging.md)** - Dev environment, troubleshooting

**Use Case**: Reference when debugging issues or learning patterns.

**Related**: The `skills/xterm-js/` skill contains generalized patterns extracted from these lessons.

---

### `/bugs/` - Active Bug Investigation
Active debugging notes and investigation logs.

- **CONNECTION_DEBUG.md** - WebSocket connection debugging notes
- **SESSION_DEBUG.md** - Session debugging notes

**Use Case**: Reference when debugging active issues.

---

### `/planning/` - Planning & Analysis
Feature planning and integration documents.

- **BROWSER_MCP_SERVER_PLAN.md** - MCP server planning
- **CHROME_EXTENSION_POSSIBILITIES.md** - Chrome API feature planning
- **SELECTED_TEXT_FEATURE.md** - Paste-to-terminal feature (implemented)
- **TUI_SESSION_MANAGER_INTEGRATION.md** - TUI integration planning
- **TMUXPLEXER_TABZ_INTEGRATION.md** - Tmuxplexer integration planning

**Use Case**: Review when planning new features.

---

### `/archived/` - Archived & Historical
Completed work, historical notes, and legacy documentation.

Includes: OPUSTRATOR audits, MULTI_WINDOW_REATTACH investigation, session fix summaries, and legacy prompts.

**Note**: These documents are historical reference only.

---

### `/reference/` - Technical Reference
Technical reference materials for specific features and patterns.

- **CLAUDE_CODE_COLORS.md** - Terminal color schemes for Claude Code
- **SEND_KEYS_SAFETY.md** - Safety guidelines for send-keys functionality

---

### `/brainstorm/` - Ideas & Integration
Brainstorming documents for future features.

- **ECOSYSTEM_INTEGRATION.md** - GGPrompts ecosystem integration ideas

---

### `/screenshots/` - Visual Assets
Screenshots and visual documentation assets.

---

## Primary Documentation (Root Directory)

Essential documentation in the project root:

- **[README.md](../README.md)** - Project overview, getting started
- **[CLAUDE.md](../CLAUDE.md)** - Architecture, development rules
- **[lessons-learned/](lessons-learned/)** - Bug insights, pitfalls
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history
- **[PLAN.md](../PLAN.md)** - Development roadmap

---

## Quick Navigation

### For Debugging:
1. Check **[lessons-learned/](lessons-learned/)** by topic
2. Search **[bugs/](bugs/)** for active investigations
3. See **[skills/xterm-js/](../skills/xterm-js/)** for generalized patterns

### For Planning Features:
1. Review **[planning/](planning/)**
2. Check **[/PLAN.md](../PLAN.md)**

### For Architecture:
1. Read **[/CLAUDE.md](../CLAUDE.md)**

---

## Documentation Standards

**After Completing Work:**
1. **[/CHANGELOG.md](../CHANGELOG.md)** - Add version entry
2. **[lessons-learned/](lessons-learned/)** - Add to appropriate topic file
3. **[/CLAUDE.md](../CLAUDE.md)** - Update for architecture changes

**When Planning:**
1. Create file in **[planning/](planning/)**
2. Update **[/PLAN.md](../PLAN.md)**
