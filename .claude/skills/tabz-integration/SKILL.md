---
name: tabz-integration
description: Integrate projects with TabzChrome terminals via HTML attributes, WebSocket, JS API, or Spawn API
user-invocable: true
---

# TabzChrome Integration

Help users integrate their projects with TabzChrome terminals.

## When to Use

- Adding "Run in Terminal" buttons to web pages
- Creating CLI tools that queue commands to TabzChrome
- Building prompt libraries with fillable templates
- Programmatically spawning terminal tabs

## Integration Methods

| Method | Auth | Best For |
|--------|------|----------|
| HTML `data-terminal-command` | None | Static buttons on docs/tool pages |
| WebSocket + websocat | File token | CLI/tmux workflows |
| WebSocket + JS | API token | Prompt libraries, web apps |
| POST /api/spawn | Token | Creating new terminal tabs |

## Quick Start

First, ask which integration the user needs:

```
questions:
  - question: "Which TabzChrome integration methods do you need?"
    header: "Integration"
    multiSelect: true
    options:
      - label: "HTML Buttons"
        description: "data-terminal-command for 'Run in Terminal' buttons"
      - label: "CLI/Scripts"
        description: "WebSocket via websocat for shell scripts"
      - label: "Web App JS"
        description: "JavaScript WebSocket for prompt libraries"
      - label: "Spawn API"
        description: "POST /api/spawn to create new tabs"
```

Then provide the relevant reference:

| Selection | Reference |
|-----------|-----------|
| HTML Buttons | `references/html-integration.md` |
| CLI/Scripts | `references/cli-websocket.md` |
| Web App JS | `references/javascript-api.md` |
| Spawn API | `references/spawn-api.md` |

## Authentication Summary

| Context | Method |
|---------|--------|
| CLI / Scripts | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| Extension Settings | Click "API Token" → "Copy Token" |
| External web pages | User pastes token (stored in localStorage) |

## Architecture Overview

```
Web Page / CLI / App
        │
        ▼
TabzChrome Backend (localhost:8129)
        │
        ▼ WebSocket broadcast
Chrome Extension
        │
        ▼
Sidepanel → Terminal Tabs
```

For security considerations on HTTPS sites, see `references/security.md`.
