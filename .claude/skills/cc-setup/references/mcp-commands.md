# MCP Server Management Reference

Complete reference for `claude mcp` subcommands.

## Overview

MCP (Model Context Protocol) servers extend Claude's capabilities with external tools. Claude Code manages MCP servers through the `claude mcp` command family.

## Commands

### claude mcp add

Add an MCP server to Claude Code.

```bash
claude mcp add [options] <name> <commandOrUrl> [args...]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Configuration scope: `local` (default), `user`, or `project` |
| `-t, --transport <transport>` | Transport type: `stdio` (default), `sse`, `http` |
| `-e, --env <env...>` | Set environment variables (e.g., -e KEY=value) |
| `-H, --header <header...>` | Set WebSocket headers (e.g., -H "X-Api-Key: abc123") |

**Examples:**

```bash
# Add stdio server (default transport)
claude mcp add my-server -- npx my-mcp-server

# Add to project scope (shared via git)
claude mcp add my-server --scope project -- ./path/to/server

# Add with environment variables
claude mcp add my-server -e API_KEY=xxx -e DEBUG=true -- npx my-mcp-server

# Add HTTP server
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# Add HTTP server with auth header
claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer token123"

# Add with subprocess flags (use -- to separate)
claude mcp add my-server -- my-command --some-flag arg1
```

### claude mcp add-json

Add an MCP server using a JSON configuration string.

```bash
claude mcp add-json [options] <name> <json>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Configuration scope: `local` (default), `user`, or `project` |

**Examples:**

```bash
# Add stdio server via JSON
claude mcp add-json my-server '{"type":"stdio","command":"npx","args":["my-mcp-server"]}'

# Add with environment variables
claude mcp add-json my-server '{"type":"stdio","command":"./server","env":{"API_KEY":"xxx"}}'

# Add HTTP server
claude mcp add-json my-server '{"type":"http","url":"https://mcp.example.com"}'
```

### claude mcp list

List all configured MCP servers with health status.

```bash
claude mcp list
```

**Output shows:**
- Server name
- Command/URL
- Connection status (✓ Connected or ✗ Failed)

### claude mcp get

Get details about a specific MCP server.

```bash
claude mcp get <name>
```

### claude mcp remove

Remove an MCP server.

```bash
claude mcp remove [options] <name>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Configuration scope - if not specified, removes from whichever scope it exists in |

**Examples:**

```bash
# Remove (auto-detects scope)
claude mcp remove my-server

# Remove from specific scope
claude mcp remove my-server --scope project
```

### claude mcp reset-project-choices

Reset all approved and rejected project-scoped (.mcp.json) servers within this project.

```bash
claude mcp reset-project-choices
```

Use when:
- You want to re-prompt for project MCP server approval
- Testing project MCP configuration

### claude mcp add-from-claude-desktop

Import MCP servers from Claude Desktop (Mac and WSL only).

```bash
claude mcp add-from-claude-desktop [options]
```

### claude mcp serve

Start Claude Code as an MCP server (for other tools to connect to).

```bash
claude mcp serve [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-d, --debug` | Enable debug mode |
| `--verbose` | Override verbose mode setting from config |

## Configuration Scopes

| Scope | Location | Use Case |
|-------|----------|----------|
| `local` | `~/.claude/settings.local.json` | Personal, machine-specific |
| `user` | `~/.claude/settings.json` | Global defaults |
| `project` | `.mcp.json` | Shared with team via git |

## .mcp.json Schema

Project MCP servers are defined in `.mcp.json` at project root:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "./path/to/server",
      "args": ["arg1", "arg2"],
      "env": {
        "API_KEY": "value",
        "DEBUG": "true"
      }
    }
  }
}
```

### Schema Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | No | Transport type: `stdio` (default), `http`, `sse` |
| `command` | Yes (stdio) | Command to execute |
| `args` | No | Array of command arguments |
| `env` | No | Environment variables object |
| `url` | Yes (http/sse) | Server URL |
| `headers` | No (http/sse) | HTTP headers object |

### Transport Types

**stdio (default):**
```json
{
  "my-server": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "my-mcp-package"]
  }
}
```

**http:**
```json
{
  "my-server": {
    "type": "http",
    "url": "https://mcp.example.com",
    "headers": {
      "Authorization": "Bearer token"
    }
  }
}
```

**sse:**
```json
{
  "my-server": {
    "type": "sse",
    "url": "https://mcp.example.com/events"
  }
}
```

## Tool Search Configuration

Control how MCP tools are loaded with the `ENABLE_TOOL_SEARCH` environment variable:

| Value | Behavior |
|-------|----------|
| `auto` | Activates when MCP tools exceed 10% of context (default) |
| `auto:N` | Activates at custom threshold, where N is a percentage |
| `true` | Always enabled |
| `false` | Disabled, all MCP tools loaded upfront |

**Examples:**

```bash
# Use custom 5% threshold
ENABLE_TOOL_SEARCH=auto:5 claude

# Disable tool search
ENABLE_TOOL_SEARCH=false claude
```

Or set in `settings.json`:
```json
{
  "env": {
    "ENABLE_TOOL_SEARCH": "auto:5"
  }
}
```

## Troubleshooting

### Common Issues

**"mcpServers: Does not adhere to MCP server configuration schema"**
- Ensure `.mcp.json` has the `mcpServers` wrapper
- Regenerate with: `claude mcp add <name> --scope project -- <command>`

**Server shows "✗ Failed" in `claude mcp list`**
- Check command path is correct
- Verify executable permissions
- Check environment variables are set
- Run with `--debug` for more info

**Project servers not loading**
- Run `claude mcp reset-project-choices` to re-approve
- Check `enableAllProjectMcpServers` in settings

### Debugging

```bash
# Enable MCP debug output
claude --debug mcp

# Check server health
claude mcp list

# Get specific server details
claude mcp get <name>
```
