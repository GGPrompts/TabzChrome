---
name: configuring-codex
description: "Configures Codex CLI optimally. Use when user mentions: 'set up codex', 'configure codex', 'codex config', 'codex.toml', 'codex settings', 'codex mcp', 'codex sandbox', 'codex approval', or wants help with Codex CLI configuration."
---

# Codex Configuration Best Practices

## Quick Start

Codex configuration lives at `~/.codex/config.toml`. Create it if missing:

```bash
mkdir -p ~/.codex
touch ~/.codex/config.toml
```

## Configuration File Structure

```toml
# ~/.codex/config.toml

# Default model (o4-mini is fast, o3 is most capable)
model = "o4-mini"

# Sandbox policy (see Sandbox section)
sandbox_policy = "workspace-write"

# Approval policy (see Approval section)
approval_policy = "on-failure"

# Shell environment
shell_environment_policy = "inherit"

# MCP servers (see MCP section)
[mcp_servers.my-server]
type = "sse"
url = "http://localhost:8080/sse"
```

## Model Selection

| Model | Best For | Speed | Cost |
|-------|----------|-------|------|
| `o4-mini` | Fast iteration, simple tasks | Fast | Low |
| `o3` | Complex reasoning, architecture | Slow | High |
| `o3-pro` | Maximum capability | Slowest | Highest |

**Recommendation:** Start with `o4-mini`, use `o3` for complex multi-file changes.

```toml
# In config.toml
model = "o4-mini"
```

Override per-session:
```bash
codex -m o3 "complex refactoring task"
```

## Sandbox Policies

Control what Codex can access on your system.

| Policy | File Read | File Write | Network | Shell | Use Case |
|--------|-----------|------------|---------|-------|----------|
| `read-only` | Workspace | No | No | Limited | Code review, analysis |
| `workspace-write` | All | Workspace | No | Workspace | Normal development |
| `danger-full-access` | All | All | Yes | All | System tasks (risky) |

**Recommendation:** Use `workspace-write` for most work.

```toml
# In config.toml
sandbox_policy = "workspace-write"
```

Override per-session:
```bash
# Read-only for reviewing code
codex -s read-only

# Full access for system setup (use carefully)
codex -s danger-full-access
```

## Approval Policies

Control when Codex asks before running commands.

| Policy | Behavior | Autonomy |
|--------|----------|----------|
| `untrusted` | Ask before untrusted commands | Low |
| `on-failure` | Run all, ask only on failure | Medium |
| `on-request` | Model decides when to ask | High |
| `never` | Never ask (YOLO mode) | Maximum |

**Recommendation:** Start with `on-failure` for balance.

```toml
# In config.toml
approval_policy = "on-failure"
```

Override per-session:
```bash
# Cautious mode
codex -a untrusted

# Autonomous mode
codex -a never
```

## MCP Server Integration

Connect Codex to external tools via MCP (Model Context Protocol).

### SSE Server (HTTP streaming)

```toml
[mcp_servers.my-api]
type = "sse"
url = "http://localhost:8080/sse"
```

### Stdio Server (subprocess)

```toml
[mcp_servers.my-tool]
type = "stdio"
command = "npx"
args = ["-y", "@my-org/mcp-server"]

# Optional environment variables
[mcp_servers.my-tool.env]
API_KEY = "${MY_API_KEY}"
```

### WebSocket Server

```toml
[mcp_servers.my-ws]
type = "websocket"
url = "ws://localhost:9000/ws"
```

### Managing MCP Servers

```bash
# List connected servers
codex mcp list

# Add a server interactively
codex mcp add

# Remove a server
codex mcp remove my-server
```

## Profiles

Create named profiles for different workflows:

```toml
# ~/.codex/profiles/review.toml
model = "o4-mini"
sandbox_policy = "read-only"
approval_policy = "never"

# ~/.codex/profiles/full-dev.toml
model = "o3"
sandbox_policy = "danger-full-access"
approval_policy = "on-failure"
```

Use a profile:
```bash
codex -p review "analyze this codebase"
codex -p full-dev "set up the project"
```

## Local Models (OSS)

Use local models via LM Studio or Ollama:

```toml
# In config.toml (when using --oss flag)
local_provider = "lmstudio"  # or "ollama"
```

```bash
# Auto-detect local provider
codex --oss

# Explicit provider
codex --oss --local-provider ollama
```

## Shell Environment

Control which shell variables Codex inherits:

```toml
# Options: "inherit", "explicit", "none"
shell_environment_policy = "inherit"

# When using "explicit", specify allowed vars
[shell_environment_variables]
PATH = true
HOME = true
EDITOR = true
```

## Recommended Starter Config

```toml
# ~/.codex/config.toml

# Good defaults for most development work
model = "o4-mini"
sandbox_policy = "workspace-write"
approval_policy = "on-failure"
shell_environment_policy = "inherit"

# Optional: MCP servers
# [mcp_servers.my-server]
# type = "sse"
# url = "http://localhost:8080/sse"
```

## Common Flags Reference

| Flag | Short | Purpose |
|------|-------|---------|
| `--model` | `-m` | Override model |
| `--sandbox` | `-s` | Override sandbox policy |
| `--ask-for-approval` | `-a` | Override approval policy |
| `--profile` | `-p` | Use config profile |
| `--image` | `-i` | Attach image to prompt |
| `--config` | `-c` | Override config value |
| `--oss` | | Use local model |

## Troubleshooting

**"Permission denied" errors:**
- Check `sandbox_policy` - may need `workspace-write` or higher

**"Model not found":**
- Verify API key in environment or config
- Check model name spelling (`o4-mini`, not `o4mini`)

**MCP server not connecting:**
- Verify server is running: `curl http://localhost:PORT/sse`
- Check config.toml for typos in URL/command
- Run `codex mcp list` to see connection status
