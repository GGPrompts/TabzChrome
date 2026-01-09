# Plugin Development Guide

Create and distribute Claude Code plugins.

## Plugin Structure

```
my-plugin/
├── plugin.json           # Metadata (required)
├── commands/             # Slash commands
│   └── *.md
├── skills/               # Agent skills
│   └── <skill-name>/
│       ├── SKILL.md
│       └── references/
├── agents/               # Subagent definitions
│   └── *.md
├── hooks/                # Hook scripts
│   └── *.sh
└── .mcp.json             # MCP server configs
```

## plugin.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": "Your Name",
  "homepage": "https://github.com/user/plugin",
  "license": "MIT"
}
```

## Commands

Place in `commands/` directory. Each `.md` file becomes a slash command.

**commands/deploy.md:**
```markdown
---
description: Deploy to production environment
---

# Deploy

1. Run tests to verify everything passes
2. Build the production bundle
3. Deploy using ./scripts/deploy.sh
4. Verify deployment succeeded
```

**Usage:** `/my-plugin:deploy`

### Command Arguments

Use `$ARGUMENTS` for user input:

```markdown
---
description: Create a new component
---

Create a React component named $ARGUMENTS.
```

**Usage:** `/my-plugin:create-component Button`

## Skills

Skills provide domain-specific knowledge. Structure:

```
skills/my-skill/
├── SKILL.md              # Main instructions
├── references/           # Detailed docs
│   └── patterns.md
├── scripts/              # Executables
│   └── helper.sh
└── assets/               # Templates
    └── template.tsx
```

**SKILL.md format:**
```markdown
---
name: my-skill
description: "Trigger criteria"
---

# Skill Name

## When to Use
Specific activation scenarios.

## Instructions
Step-by-step guidance.

## References
- Detailed patterns: `references/patterns.md`
```

## Agents

Define subagents for specialized tasks:

**agents/code-reviewer.md:**
```markdown
---
name: code-reviewer
description: "Reviews code for quality and security"
tools: ["Read", "Grep", "Glob"]
---

# Code Review Agent

Review code changes for:
1. Security vulnerabilities
2. Performance issues
3. Code style violations
4. Missing tests

Report findings with severity levels.
```

## MCP Integration

Add `.mcp.json` to plugin root:

```json
{
  "mcpServers": {
    "plugin-server": {
      "command": "node",
      "args": ["./mcp-server/index.js"],
      "env": {
        "API_KEY": "${PLUGIN_API_KEY}"
      }
    }
  }
}
```

## Installation

### From Local Path
```bash
# Add to ~/.claude/plugins/ or project's plugins/
cp -r my-plugin ~/.claude/plugins/
```

### From Git
```bash
# Clone to plugins directory
git clone https://github.com/user/my-plugin ~/.claude/plugins/my-plugin
```

## Plugin Discovery

Claude Code discovers plugins from:
1. `~/.claude/plugins/` - Global plugins
2. `./plugins/` - Project plugins
3. `./.claude/plugins/` - Project-specific

## Best Practices

### Naming
- Use kebab-case for plugin name
- Prefix commands with plugin name for clarity
- Use descriptive skill names

### Documentation
- Include README.md for humans
- Document all commands
- Provide usage examples

### Versioning
- Follow semver
- Document breaking changes
- Tag releases

### Security
- Never hardcode secrets
- Use environment variables
- Validate all inputs
