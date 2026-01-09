# Hooks Configuration

Execute shell commands in response to Claude Code events.

## Configuration Location

Configure hooks in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...],
    "UserPromptSubmit": [...]
  }
}
```

## Hook Types

### PreToolUse

Runs before tool execution. Can block the tool.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["./scripts/validate-bash.sh"]
      }
    ]
  }
}
```

**Use cases:**
- Validate commands before execution
- Block dangerous operations
- Log tool usage

### PostToolUse

Runs after tool execution.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": ["prettier --write $CLAUDE_FILE_PATH"]
      }
    ]
  }
}
```

**Use cases:**
- Auto-format written files
- Run linters
- Update caches

### UserPromptSubmit

Runs when user submits a prompt.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": ["./scripts/log-prompt.sh"]
      }
    ]
  }
}
```

**Use cases:**
- Log prompts for audit
- Cost tracking
- Input validation

## Matcher Patterns

Match specific tools:

```json
{
  "matcher": "Bash",           // Exact match
  "matcher": "Write|Edit",     // Multiple tools
  "matcher": ".*",             // All tools
  "hooks": [...]
}
```

## Environment Variables

Available in hook scripts:

| Variable | Description | Hooks |
|----------|-------------|-------|
| `$CLAUDE_TOOL_NAME` | Tool being called | All |
| `$CLAUDE_TOOL_INPUT` | Tool input JSON | Pre/Post |
| `$CLAUDE_TOOL_OUTPUT` | Tool output | Post only |
| `$CLAUDE_FILE_PATH` | File path | File tools |
| `$CLAUDE_USER_PROMPT` | User's prompt | UserPromptSubmit |

## Example Hooks

### Security: Block Dangerous Commands

**scripts/validate-bash.sh:**
```bash
#!/bin/bash
INPUT="$CLAUDE_TOOL_INPUT"

# Block dangerous patterns
if echo "$INPUT" | grep -qE "rm -rf /|mkfs|dd if="; then
  echo "BLOCKED: Dangerous command detected"
  exit 1
fi

exit 0
```

**Configuration:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["./scripts/validate-bash.sh"]
      }
    ]
  }
}
```

### Auto-Format: Prettier on Write

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": ["prettier --write $CLAUDE_FILE_PATH 2>/dev/null || true"]
      }
    ]
  }
}
```

### Logging: Track All Tool Usage

**scripts/log-tools.sh:**
```bash
#!/bin/bash
echo "$(date -Iseconds) $CLAUDE_TOOL_NAME" >> .claude/tool-usage.log
```

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": ["./scripts/log-tools.sh"]
      }
    ]
  }
}
```

### Lint: Run ESLint After JS/TS Changes

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          "if [[ $CLAUDE_FILE_PATH =~ \\.(js|ts|jsx|tsx)$ ]]; then eslint --fix $CLAUDE_FILE_PATH; fi"
        ]
      }
    ]
  }
}
```

### Type Check: Run tsc After TypeScript Changes

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          "if [[ $CLAUDE_FILE_PATH =~ \\.tsx?$ ]]; then npx tsc --noEmit $CLAUDE_FILE_PATH 2>&1 | head -20; fi"
        ]
      }
    ]
  }
}
```

## Hook Behavior

### Exit Codes

- **Exit 0**: Success, continue
- **Exit non-zero**: Failure
  - PreToolUse: Blocks tool execution
  - PostToolUse: Logged but doesn't block
  - UserPromptSubmit: Blocks prompt submission

### Output

- stdout is shown to user
- stderr is shown as error
- Keep output concise

### Timeouts

Hooks have a timeout (default: 30 seconds). Long-running hooks should:
- Run in background
- Return quickly
- Log to file

## Best Practices

### Performance
- Keep hooks fast (<1 second)
- Use `|| true` to prevent failures from blocking
- Run expensive operations in background

### Reliability
- Handle missing files gracefully
- Check file extensions before processing
- Use absolute paths when possible

### Security
- Validate all inputs
- Don't trust tool output blindly
- Use whitelists over blacklists

### Debugging
- Log to .claude/logs/ for debugging
- Use `set -x` for verbose bash output
- Check hook output in Claude Code response

## Troubleshooting

### Hook Not Running
- Check file permissions: `chmod +x script.sh`
- Verify path is correct
- Check matcher pattern

### Hook Blocking Unexpectedly
- Check exit code
- Review script logic
- Add debug output

### Performance Issues
- Profile hook execution time
- Move slow operations to background
- Cache results where possible
