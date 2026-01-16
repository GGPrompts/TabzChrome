# Plugin Management Reference

Complete reference for `claude plugin` subcommands.

## Overview

Plugins extend Claude Code with additional skills, commands, agents, and hooks. They are installed from marketplaces (GitHub repositories) and can be scoped to user, project, or local levels.

## Commands

### claude plugin install

Install a plugin from available marketplaces.

```bash
claude plugin install|i [options] <plugin>
```

**Format:** `plugin-name` or `plugin-name@marketplace-name`

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Installation scope: `user` (default), `project`, or `local` |

**Examples:**

```bash
# Install from any marketplace
claude plugin install beads

# Install from specific marketplace
claude plugin install beads@beads-marketplace

# Install for project only
claude plugin install my-plugin --scope project
```

### claude plugin uninstall

Uninstall an installed plugin.

```bash
claude plugin uninstall|remove [options] <plugin>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Uninstall from scope: `user` (default), `project`, or `local` |

**Examples:**

```bash
# Uninstall from default (user) scope
claude plugin uninstall my-plugin

# Uninstall from project scope
claude plugin uninstall my-plugin --scope project
```

### claude plugin enable

Enable a disabled plugin.

```bash
claude plugin enable [options] <plugin>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Scope: `user` (default), `project`, `local` |

### claude plugin disable

Disable an enabled plugin.

```bash
claude plugin disable [options] <plugin>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Scope: `user` (default), `project`, `local` |

### claude plugin list

List all installed plugins.

```bash
claude plugin list [options]
```

**Output shows:**
- Plugin name with marketplace
- Version
- Scope (user/project/local)
- Status (enabled/disabled)

### claude plugin update

Update a plugin to the latest version.

```bash
claude plugin update [options] <plugin>
```

**Options:**

| Option | Description |
|--------|-------------|
| `-s, --scope <scope>` | Scope: `user` (default), `project`, `local`, `managed` |

**Note:** Restart required to apply updates.

### claude plugin validate

Validate a plugin or marketplace manifest.

```bash
claude plugin validate <path>
```

**Examples:**

```bash
# Validate plugin directory
claude plugin validate ./my-plugin

# Validate marketplace
claude plugin validate ./my-marketplace
```

## Marketplace Commands

### claude plugin marketplace list

List all configured marketplaces.

```bash
claude plugin marketplace list [options]
```

### claude plugin marketplace add

Add a marketplace from a URL, path, or GitHub repo.

```bash
claude plugin marketplace add <source>
```

**Examples:**

```bash
# Add from GitHub repo
claude plugin marketplace add anthropics/claude-plugins-official

# Add from URL
claude plugin marketplace add https://github.com/myorg/my-marketplace

# Add from local path
claude plugin marketplace add /path/to/marketplace
```

### claude plugin marketplace remove

Remove a configured marketplace.

```bash
claude plugin marketplace remove|rm <name>
```

### claude plugin marketplace update

Update marketplace(s) from their source.

```bash
claude plugin marketplace update [name]
```

**Examples:**

```bash
# Update all marketplaces
claude plugin marketplace update

# Update specific marketplace
claude plugin marketplace update my-marketplace
```

## Configuration Scopes

| Scope | Purpose | Location |
|-------|---------|----------|
| `user` | Global, applies everywhere | `~/.claude/settings.json` |
| `project` | Shared with team via git | `.claude/settings.json` |
| `local` | Machine-specific overrides | `.claude/settings.local.json` |

## Key Files

### ~/.claude/plugins/installed_plugins.json

Registry of all installed plugins:

```json
{
  "version": 2,
  "plugins": {
    "plugin-name@marketplace": [
      {
        "scope": "user",
        "installPath": "/home/user/.claude/plugins/cache/...",
        "version": "1.0.0",
        "installedAt": "2025-01-15T...",
        "lastUpdated": "2025-01-15T...",
        "gitCommitSha": "abc123..."
      }
    ]
  }
}
```

### ~/.claude/plugins/known_marketplaces.json

Registry of configured marketplaces:

```json
{
  "marketplace-name": {
    "source": {
      "source": "github",
      "repo": "owner/repo"
    },
    "installLocation": "/home/user/.claude/plugins/marketplaces/...",
    "lastUpdated": "2025-01-15T...",
    "autoUpdate": true
  }
}
```

### ~/.claude/settings.json (enabledPlugins)

Enabled/disabled status for plugins:

```json
{
  "enabledPlugins": {
    "plugin-name@marketplace": true,
    "another-plugin@marketplace": false
  }
}
```

## Plugin Structure

Plugins contain:

```
plugin-name/
├── plugin.json          # Manifest (required)
├── skills/              # Skills directory
│   └── skill-name/
│       └── SKILL.md
├── commands/            # Slash commands
│   └── my-command.md
├── agents/              # Custom agents
│   └── my-agent.md
└── hooks/               # Event hooks
    └── hooks.json
```

### plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": {
    "name": "Author Name",
    "url": "https://example.com"
  },
  "mcpServers": {
    "my-server": {
      "command": "${CLAUDE_PLUGIN_ROOT}/server.js"
    }
  }
}
```

## Troubleshooting

### Stale Plugin References

If you see errors about plugins that should be removed:

1. Check `~/.claude/plugins/installed_plugins.json`
2. Remove orphaned entries manually
3. Restart Claude Code

### Plugin Not Loading

1. Check `claude plugin list` for status
2. Ensure plugin is enabled
3. Validate with `claude plugin validate <path>`
4. Check for errors with `claude --debug plugins`

### Marketplace Not Updating

```bash
# Force update
claude plugin marketplace update <name>

# Check marketplace health
claude plugin marketplace list
```

### Plugin Conflicts

If multiple plugins provide the same functionality:
1. Disable conflicting plugins
2. Use `--scope` to isolate to specific projects
