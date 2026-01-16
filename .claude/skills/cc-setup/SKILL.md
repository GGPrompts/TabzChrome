---
name: cc-setup
description: This skill should be used when the user asks to "diagnose Claude Code", "fix MCP errors", "manage plugins", "configure MCP servers", "check /doctor errors", "debug plugin issues", "add MCP server", "remove plugin", "list plugins", "list MCP servers", "fix schema errors", or needs help with Claude Code CLI configuration and troubleshooting.
version: 1.0.0
---

# Claude Code Setup & Diagnostics

Diagnose and manage Claude Code configuration including MCP servers, plugins, and settings via CLI commands.

## Quick Diagnostics

Run `/doctor` in Claude Code to check system health. Common issues:

| Error | Cause | Fix |
|-------|-------|-----|
| `mcpServers: Does not adhere to MCP server configuration schema` | Invalid `.mcp.json` format | Use `claude mcp add --scope project` to regenerate |
| `Found invalid settings files` | Empty or malformed JSON | Remove or fix the file |
| `Large MCP tools context` | Too many MCP tools loaded | Enable tool search (default) or reduce servers |

## Configuration Hierarchy

Claude Code loads settings from multiple sources in order:

1. **User config**: `~/.claude/settings.json` - Global settings
2. **Project config**: `.claude/settings.json` - Project-specific
3. **Local config**: `.claude/settings.local.json` - Machine-specific (gitignored)
4. **MCP config**: `.mcp.json` - Project MCP servers

### Scope Precedence

| Scope | Location | Purpose |
|-------|----------|---------|
| `user` | `~/.claude/settings.json` | Global defaults |
| `project` | `.claude/settings.json` or `.mcp.json` | Shared with team |
| `local` | `.claude/settings.local.json` | Personal overrides |

## MCP Server Management

### Add MCP Server

```bash
# Add to project (shared via git)
claude mcp add <name> --scope project -e KEY=value -- <command> [args...]

# Add to user config (global)
claude mcp add <name> --scope user -- <command> [args...]

# HTTP transport
claude mcp add --transport http <name> <url>

# With headers
claude mcp add --transport http <name> <url> --header "Authorization: Bearer ..."
```

### Common Operations

```bash
claude mcp list                    # List all MCP servers with health
claude mcp get <name>              # Get server details
claude mcp remove <name>           # Remove (auto-detects scope)
claude mcp remove <name> -s project  # Remove from specific scope
claude mcp reset-project-choices   # Reset approved/rejected project servers
```

### .mcp.json Schema

The correct schema for `.mcp.json` uses `mcpServers` wrapper:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "./path/to/server",
      "args": [],
      "env": {
        "KEY": "value"
      }
    }
  }
}
```

Transport types: `stdio` (default), `http`, `sse`

## Plugin Management

### Install/Uninstall

```bash
claude plugin install <plugin>@<marketplace>
claude plugin install <plugin>@<marketplace> --scope project
claude plugin uninstall <plugin>
claude plugin uninstall <plugin> --scope project
```

### Enable/Disable

```bash
claude plugin enable <plugin>
claude plugin disable <plugin>
claude plugin list                 # Show all installed plugins
```

### Marketplace Management

```bash
claude plugin marketplace list
claude plugin marketplace add <github-repo-or-url>
claude plugin marketplace remove <name>
claude plugin marketplace update [name]  # Update all or specific
```

### Plugin Validation

```bash
claude plugin validate /path/to/plugin
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ENABLE_TOOL_SEARCH` | Control MCP tool loading: `auto` (default), `auto:N%`, `true`, `false` |
| `CLAUDECODE` | Set to `1` when running inside Claude Code |
| `CLAUDE_CODE_SSE_PORT` | Internal SSE communication port |

## Common Troubleshooting

### MCP Schema Errors

1. Check `.mcp.json` exists and is valid JSON
2. Verify `mcpServers` wrapper is present
3. Regenerate with CLI: `claude mcp add <name> --scope project -- <command>`

### Stale Plugin References

Check `~/.claude/plugins/installed_plugins.json` for orphaned entries. Remove entries for plugins from marketplaces that no longer exist.

### Permission Issues

```bash
# Check current mode
claude --permission-mode default

# Available modes: acceptEdits, bypassPermissions, default, delegate, dontAsk, plan
```

## Key Files

| File | Purpose |
|------|---------|
| `~/.claude/settings.json` | User settings, hooks, MCP servers |
| `~/.claude/plugins/installed_plugins.json` | Installed plugin registry |
| `~/.claude/plugins/known_marketplaces.json` | Configured marketplaces |
| `.mcp.json` | Project MCP servers |
| `.claude/settings.json` | Project settings |

## CLI Quick Reference

```bash
# Diagnostics
claude doctor                      # Health check
claude --version                   # Version info
claude --debug                     # Debug mode

# Session management
claude --continue                  # Resume last session
claude --resume [id]               # Resume specific session
claude --model opus                # Use specific model

# MCP
claude mcp list
claude mcp add <name> --scope <scope> -- <cmd>
claude mcp remove <name>

# Plugins
claude plugin list
claude plugin install <plugin>@<marketplace>
claude plugin uninstall <plugin>
```

## Additional Resources

### Reference Files

For comprehensive CLI documentation, consult:
- **`references/cli-flags.md`** - Complete CLI flag reference
- **`references/mcp-commands.md`** - MCP server management details
- **`references/plugin-commands.md`** - Plugin management details

### Diagnostic Scripts

Utilities in `scripts/`:
- **`scripts/diagnose.sh`** - Run full diagnostic check
