---
name: configuring-claude-code
description: "Provides guidance for configuring Claude Code optimally. Use when users ask about: CLAUDE.md structure, plugin architecture, skill patterns, hooks, MCP integration, settings.json, slash commands, or Claude Code best practices."
---

# Claude Code Configuration Guide

Help users configure Claude Code for optimal development workflows.

## Quick Reference

| Task | Location/Command |
|------|------------------|
| Project instructions | `CLAUDE.md` (root) |
| Settings | `.claude/settings.json` or `~/.claude/settings.json` |
| Slash commands | `.claude/commands/*.md` |
| Skills | `.claude/skills/<name>/SKILL.md` |
| Hooks | `.claude/settings.local.json` |
| MCP servers | `.mcp.json` or `.claude/mcp.json` |
| Plugins | `plugins/<name>/plugin.json` |

## CLAUDE.md Structure

The `CLAUDE.md` file provides project context to Claude. Keep it concise (<500 lines).

```markdown
# Project Name

Brief description of what this project does.

## Architecture

Key directories, patterns, and data flow.

## Development Rules

### ALWAYS
- Critical patterns to follow

### NEVER
- Anti-patterns to avoid

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development |
| `npm test` | Run tests |

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point |
```

**Best practices:**
- Focus on what Claude needs to know, not general documentation
- Include commands Claude should run
- List critical constraints and anti-patterns
- Use tables for quick reference

**For detailed CLAUDE.md patterns:** See `references/claude-md.md`

## Plugin Architecture

Plugins package commands, skills, hooks, and MCP servers together.

```
plugins/my-plugin/
├── plugin.json           # Metadata (required)
├── commands/             # Slash commands
│   └── my-command.md
├── skills/               # Agent skills
│   └── my-skill/
│       └── SKILL.md
├── agents/               # Subagent definitions
│   └── my-agent.md
└── hooks/                # Hook scripts
    └── pre-tool.sh
```

**plugin.json:**
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description"
}
```

**For plugin development guide:** See `references/plugin-structure.md`

## Skill Patterns

Skills extend Claude's capabilities with domain-specific knowledge.

```
.claude/skills/my-skill/
├── SKILL.md              # Instructions (required)
├── references/           # Detailed docs (loaded on demand)
├── scripts/              # Executable code
└── assets/               # Templates
```

**SKILL.md structure:**
```markdown
---
name: my-skill
description: "When to trigger this skill"
---

# Skill Name

Brief description.

## When to Use

Specific activation criteria.

## Instructions

Step-by-step guidance.

## Quick Reference

For detailed X: See `references/x.md`
```

**Progressive disclosure:** Keep SKILL.md concise (<200 lines). Put detailed documentation in `references/` directory.

**For skill development patterns:** See `references/skills.md`

## Hooks Configuration

Hooks execute shell commands in response to Claude Code events.

**Configure in `.claude/settings.local.json`:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["./scripts/validate-bash.sh"]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": ["prettier --write $CLAUDE_FILE_PATH"]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": ["./scripts/log-prompt.sh"]
      }
    ]
  }
}
```

**Hook types:**
- `PreToolUse` - Before tool execution (can block)
- `PostToolUse` - After tool execution
- `UserPromptSubmit` - When user submits prompt

**Environment variables available:**
- `$CLAUDE_TOOL_NAME` - Tool being called
- `$CLAUDE_FILE_PATH` - File path (for file tools)

**For hook patterns and examples:** See `references/hooks.md`

## MCP Integration

Model Context Protocol connects Claude to external tools and services.

**Configure in `.mcp.json`:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Common MCP servers:**
- `@modelcontextprotocol/server-filesystem` - File access
- `@modelcontextprotocol/server-github` - GitHub integration
- `@modelcontextprotocol/server-postgres` - Database queries
- `@modelcontextprotocol/server-puppeteer` - Browser automation

**For MCP configuration guide:** See `references/mcp.md`

## Settings Configuration

**Project settings (`.claude/settings.json`):**
```json
{
  "model": "sonnet",
  "maxTokens": 8192,
  "thinking": {
    "enabled": true,
    "budget": 10000
  }
}
```

**Model aliases:**
- `sonnet` - Balanced (default)
- `opus` - Complex tasks
- `haiku` - Fast, simple tasks

**For full settings reference:** See `references/settings.md`

## Slash Commands

Create custom commands in `.claude/commands/`:

**`.claude/commands/deploy.md`:**
```markdown
---
description: Deploy to production
---

Run the deployment pipeline:
1. Run tests: `npm test`
2. Build: `npm run build`
3. Deploy: `./scripts/deploy.sh`

Verify deployment succeeded and report status.
```

**Invoke with:** `/deploy`

**Arguments:** Use `$ARGUMENTS` for user input
```markdown
---
description: Create a component
---

Create a React component named $ARGUMENTS in src/components/.
```

**For command patterns:** See `references/commands.md`

## Best Practices

### Project Setup Checklist

1. **CLAUDE.md** - Project context and rules
2. **`.claude/settings.json`** - Model and token settings
3. **`.mcp.json`** - External tool integrations
4. **`.claude/commands/`** - Frequently used workflows
5. **`.claude/skills/`** - Domain-specific knowledge

### Common Patterns

**Auto-format on write:**
```json
{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": ["prettier --write $CLAUDE_FILE_PATH"]}
    ]
  }
}
```

**Validate before bash:**
```json
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Bash", "hooks": ["./scripts/validate-command.sh"]}
    ]
  }
}
```

### Security

- Never commit API keys in `.mcp.json` - use `${ENV_VAR}` syntax
- Use hooks to validate dangerous operations
- Restrict MCP filesystem access to project directories

## Reference Files

Load these for detailed guidance:

| Topic | Reference |
|-------|-----------|
| CLAUDE.md patterns | `references/claude-md.md` |
| Plugin development | `references/plugin-structure.md` |
| Skill patterns | `references/skills.md` |
| Hook configuration | `references/hooks.md` |
| MCP servers | `references/mcp.md` |
| Settings reference | `references/settings.md` |
| Command patterns | `references/commands.md` |

## Codex vs Claude Code Comparison

| Aspect | Codex | Claude Code |
|--------|-------|-------------|
| Provider | OpenAI | Anthropic |
| Config file | `~/.codex/config.toml` | `~/.claude/settings.json` |
| Skills | `~/.codex/skills/` | `.claude/skills/` + plugins |
| MCP | `config.toml` sections | `.mcp.json` |
| Agents | N/A | Plugin agents |
| Hooks | N/A | Pre/Post tool hooks |
| Commands | N/A | `.claude/commands/` |
