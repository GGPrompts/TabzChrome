# Settings Reference

Configure Claude Code behavior with settings files.

## Settings Hierarchy

Settings are applied in order of precedence:

1. **Command-line flags** (highest priority)
2. **Environment variables**
3. **Project settings** (`.claude/settings.json`)
4. **Global settings** (`~/.claude/settings.json`)

## Settings File Format

### Global Settings

`~/.claude/settings.json`:
```json
{
  "model": "sonnet",
  "maxTokens": 8192,
  "temperature": 1.0,
  "thinking": {
    "enabled": true,
    "budget": 10000
  }
}
```

### Project Settings

`.claude/settings.json`:
```json
{
  "model": "sonnet",
  "maxTokens": 4096
}
```

### Local Settings (not committed)

`.claude/settings.local.json`:
```json
{
  "hooks": {
    "PostToolUse": [...]
  }
}
```

## Model Configuration

### Model Aliases

| Alias | Full Name | Use Case |
|-------|-----------|----------|
| `sonnet` | claude-sonnet-4-5-* | Balanced (default) |
| `opus` | claude-opus-4-* | Complex tasks |
| `haiku` | claude-haiku-4-* | Fast, simple tasks |

```json
{
  "model": "sonnet"
}
```

### Extended Thinking

Enable for complex reasoning:

```json
{
  "thinking": {
    "enabled": true,
    "budget": 10000
  }
}
```

**Options:**
- `enabled`: Enable extended thinking
- `budget`: Token budget (default: 10000)

## Token Settings

### maxTokens

Maximum tokens in response:

```json
{
  "maxTokens": 8192
}
```

- Default: 8192
- Range: 1-200000

### temperature

Response randomness:

```json
{
  "temperature": 0.7
}
```

- Default: 1.0
- Range: 0.0-1.0
- Lower = more focused
- Higher = more creative

## Common Settings

### Development Setup

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

### Quick Tasks

```json
{
  "model": "haiku",
  "maxTokens": 2048
}
```

### Complex Architecture

```json
{
  "model": "opus",
  "maxTokens": 16384,
  "thinking": {
    "enabled": true,
    "budget": 20000
  }
}
```

## Command-Line Flags

Override settings temporarily:

```bash
# Set model
claude --model opus "complex task"

# Set max tokens
claude --max-tokens 16384

# Set temperature
claude --temperature 0.8

# Enable debug
claude --debug
```

## Environment Variables

### API Configuration

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Proxy Configuration

```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
```

### Debug Mode

```bash
export CLAUDE_DEBUG=1
```

## Settings Commands

```bash
# View current settings
claude config list

# Set global setting
claude config set model opus

# Set project setting
claude config set --project maxTokens 4096

# Get specific setting
claude config get model

# Reset to defaults
claude config reset
```

## Best Practices

### Project Settings
- Keep project-specific in `.claude/settings.json`
- Commit to version control
- Document custom settings

### Global Settings
- Personal preferences only
- API keys and auth
- Don't override project settings

### Security
- Never commit API keys
- Use environment variables for secrets
- Keep `.local.json` in `.gitignore`

### Performance
- Use appropriate model for task
- Set reasonable token limits
- Enable caching for repeated tasks

## Troubleshooting

### Settings Not Applied

```bash
# Check settings hierarchy
claude config list --all

# Verify file syntax
cat .claude/settings.json | jq .
```

### Environment Variables Not Working

```bash
# Verify export
echo $ANTHROPIC_API_KEY

# Reload shell
source ~/.bashrc
```
