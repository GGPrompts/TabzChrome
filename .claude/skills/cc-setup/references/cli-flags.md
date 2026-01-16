# Claude Code CLI Flags Reference

Complete reference for all `claude` CLI flags and options.

## Core Options

### Session Control

| Flag | Description |
|------|-------------|
| `-c, --continue` | Continue the most recent conversation in the current directory |
| `-r, --resume [value]` | Resume a conversation by session ID, or open interactive picker with optional search term |
| `--session-id <uuid>` | Use a specific session ID for the conversation (must be a valid UUID) |
| `--fork-session` | When resuming, create a new session ID instead of reusing the original (use with --resume or --continue) |
| `--no-session-persistence` | Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print) |

### Model Selection

| Flag | Description |
|------|-------------|
| `--model <model>` | Model for the current session. Provide an alias ('sonnet' or 'opus') or full name (e.g., 'claude-sonnet-4-5-20250929') |
| `--fallback-model <model>` | Enable automatic fallback to specified model when default model is overloaded (only works with --print) |

### Permission Modes

| Flag | Description |
|------|-------------|
| `--permission-mode <mode>` | Permission mode for session. Choices: `acceptEdits`, `bypassPermissions`, `default`, `delegate`, `dontAsk`, `plan` |
| `--dangerously-skip-permissions` | Bypass all permission checks. Recommended only for sandboxes with no internet access |
| `--allow-dangerously-skip-permissions` | Enable bypassing permissions as an option, without it being enabled by default |

### Tool Control

| Flag | Description |
|------|-------------|
| `--tools <tools...>` | Specify available tools. Use "" to disable all, "default" for all, or specific names (e.g., "Bash,Edit,Read") |
| `--allowedTools, --allowed-tools <tools...>` | Comma or space-separated list of tool names to allow (e.g., "Bash(git:*) Edit") |
| `--disallowedTools, --disallowed-tools <tools...>` | Comma or space-separated list of tool names to deny (e.g., "Bash(git:*) Edit") |

### System Prompts

| Flag | Description |
|------|-------------|
| `--system-prompt <prompt>` | System prompt to use for the session |
| `--append-system-prompt <prompt>` | Append a system prompt to the default system prompt |

### Agent Configuration

| Flag | Description |
|------|-------------|
| `--agent <agent>` | Agent for the current session. Overrides the 'agent' setting |
| `--agents <json>` | JSON object defining custom agents (e.g., '{"reviewer": {"description": "Reviews code", "prompt": "You are a code reviewer"}}') |

### MCP Configuration

| Flag | Description |
|------|-------------|
| `--mcp-config <configs...>` | Load MCP servers from JSON files or strings (space-separated) |
| `--strict-mcp-config` | Only use MCP servers from --mcp-config, ignoring all other MCP configurations |
| `--mcp-debug` | [DEPRECATED. Use --debug instead] Enable MCP debug mode |

### Plugin Configuration

| Flag | Description |
|------|-------------|
| `--plugin-dir <paths...>` | Load plugins from directories for this session only (repeatable) |
| `--disable-slash-commands` | Disable all skills |

### Settings Control

| Flag | Description |
|------|-------------|
| `--settings <file-or-json>` | Path to a settings JSON file or a JSON string to load additional settings from |
| `--setting-sources <sources>` | Comma-separated list of setting sources to load (user, project, local) |

### Output Modes (for --print)

| Flag | Description |
|------|-------------|
| `-p, --print` | Print response and exit (useful for pipes). Skips workspace trust dialog |
| `--output-format <format>` | Output format: "text" (default), "json" (single result), or "stream-json" (realtime streaming) |
| `--input-format <format>` | Input format: "text" (default), or "stream-json" (realtime streaming input) |
| `--include-partial-messages` | Include partial message chunks as they arrive (only works with --print and --output-format=stream-json) |
| `--replay-user-messages` | Re-emit user messages from stdin back on stdout (only works with --input-format=stream-json and --output-format=stream-json) |

### Structured Output

| Flag | Description |
|------|-------------|
| `--json-schema <schema>` | JSON Schema for structured output validation. Example: {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]} |

### Budget Control

| Flag | Description |
|------|-------------|
| `--max-budget-usd <amount>` | Maximum dollar amount to spend on API calls (only works with --print) |

### File Resources

| Flag | Description |
|------|-------------|
| `--file <specs...>` | File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png) |
| `--add-dir <directories...>` | Additional directories to allow tool access to |

### IDE Integration

| Flag | Description |
|------|-------------|
| `--ide` | Automatically connect to IDE on startup if exactly one valid IDE is available |
| `--chrome` | Enable Claude in Chrome integration |
| `--no-chrome` | Disable Claude in Chrome integration |

### API Options

| Flag | Description |
|------|-------------|
| `--betas <betas...>` | Beta headers to include in API requests (API key users only) |

### Debugging

| Flag | Description |
|------|-------------|
| `-d, --debug [filter]` | Enable debug mode with optional category filtering (e.g., "api,hooks" or "!statsig,!file") |
| `--verbose` | Override verbose mode setting from config |

### Information

| Flag | Description |
|------|-------------|
| `-v, --version` | Output the version number |
| `-h, --help` | Display help for command |

## Subcommands

| Command | Description |
|---------|-------------|
| `doctor` | Check the health of your Claude Code auto-updater |
| `install [target]` | Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version) |
| `mcp` | Configure and manage MCP servers |
| `plugin` | Manage Claude Code plugins |
| `setup-token` | Set up a long-lived authentication token (requires Claude subscription) |
| `update` | Check for updates and install if available |

## Usage Examples

### Basic Usage

```bash
# Start interactive session
claude

# Continue last conversation
claude -c

# Resume specific session
claude -r abc123

# Use specific model
claude --model opus

# One-shot query
claude -p "What is 2+2?"
```

### Permission Control

```bash
# Run with all permissions bypassed (sandbox only)
claude --dangerously-skip-permissions

# Plan mode - only planning, no execution
claude --permission-mode plan
```

### Custom Configuration

```bash
# Load custom settings
claude --settings ./my-settings.json

# Add custom agent inline
claude --agents '{"reviewer": {"description": "Code reviewer", "prompt": "You review code"}}'

# Load specific plugin
claude --plugin-dir ./my-plugin
```

### Structured Output

```bash
# Get JSON response matching schema
claude -p "List 3 colors" --json-schema '{"type":"array","items":{"type":"string"}}'

# Stream JSON output
claude -p "Tell me a story" --output-format stream-json
```

### Debugging

```bash
# Full debug mode
claude --debug

# Debug specific categories
claude --debug "api,hooks"

# Exclude categories
claude --debug "!statsig,!file"
```

### MCP Configuration

```bash
# Load MCP from specific config
claude --mcp-config ./my-mcp.json

# Strict mode - only use specified MCP
claude --strict-mcp-config --mcp-config ./my-mcp.json
```
