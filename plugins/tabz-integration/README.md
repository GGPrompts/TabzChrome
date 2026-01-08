# TabzChrome Integration Plugin

Connect any project to TabzChrome terminals via REST API, WebSocket, MCP tools, or TTS.

## When to Use This Plugin

Install this plugin in projects that need to:
- **Spawn terminals** from scripts or applications
- **Add "Run in Terminal" buttons** to web pages or documentation
- **Use MCP browser automation tools** from Claude Code
- **Send TTS notifications** from build scripts, CI/CD, or code
- **Queue commands** to the TabzChrome sidebar chat

## Installation

Copy this plugin to your project's `.claude/plugins/` directory:

```bash
cp -r plugins/tabz-integration /path/to/your-project/.claude/plugins/
```

Or symlink for auto-updates:

```bash
ln -s /path/to/TabzChrome/plugins/tabz-integration /path/to/your-project/.claude/plugins/
```

## Prerequisites

- TabzChrome backend running (`./scripts/dev.sh` from TabzChrome directory)
- Chrome browser with TabzChrome extension installed

## Quick Examples

### Spawn a Terminal

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Worker", "workingDir": "~/projects", "command": "npm run dev"}'
```

### HTML Button (No Auth)

```html
<button data-terminal-command="npm test">Run Tests</button>
```

### TTS Notification

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Build complete"}'
```

### MCP Tools

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "tabz": {
      "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
      "args": [],
      "env": { "BACKEND_URL": "http://localhost:8129" }
    }
  }
}
```

## Plugin Contents

```
plugins/tabz-integration/
├── README.md                 # This file
├── plugin.json               # Plugin metadata
└── skills/tabz-integration/
    ├── SKILL.md              # Main skill (triggers on integration questions)
    └── references/
        ├── integration-examples.md   # Detailed code examples
        ├── api-reference.md          # REST API documentation
        ├── mcp-setup.md              # MCP tools setup guide
        └── audio-integration.md      # TTS integration guide
```

## When to Use tabz-integration vs tabz-guide

| Plugin | Use Case |
|--------|----------|
| **tabz-integration** | External projects connecting TO TabzChrome |
| **tabz-guide** | Working ON TabzChrome itself (profiles, debugging, internal features) |

Install `tabz-integration` in your other projects. `tabz-guide` stays in the TabzChrome project.

## License

MIT - Same as TabzChrome
