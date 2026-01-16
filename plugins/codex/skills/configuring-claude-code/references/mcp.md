# MCP Server Configuration

Model Context Protocol (MCP) connects Claude to external tools and services.

## Configuration Location

Configure in `.mcp.json` (project root) or `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "VAR_NAME": "value"
      }
    }
  }
}
```

## Common MCP Servers

### Filesystem Access

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    }
  }
}
```

**Capabilities:** Read/write files, list directories, file search

### GitHub Integration

```json
{
  "mcpServers": {
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

**Capabilities:** Repository access, issues, PRs, code search

### PostgreSQL Database

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

**Capabilities:** Query execution, schema inspection

### Brave Search

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      }
    }
  }
}
```

**Capabilities:** Web search, news search

### Puppeteer (Browser)

```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```

**Capabilities:** Browser automation, screenshots, web scraping

### Context7 (Documentation)

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

**Capabilities:** Fetch up-to-date library documentation

## Environment Variables

Use `${VAR_NAME}` syntax for secrets:

```json
{
  "mcpServers": {
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

Set in shell:
```bash
export GITHUB_TOKEN=ghp_xxxxx
```

Or in `.env` file (don't commit!):
```bash
GITHUB_TOKEN=ghp_xxxxx
```

## Remote MCP Servers

Connect via HTTP/SSE:

```json
{
  "mcpServers": {
    "remote-api": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

## Multiple Servers

Configure multiple servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Testing MCP Servers

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Opens web UI to:
- List available tools
- Test tool invocations
- View resources
- Debug connections

### Manual Testing

```bash
# Test server starts
npx -y @modelcontextprotocol/server-filesystem /tmp

# Check server output
echo '{"jsonrpc":"2.0","method":"initialize","params":{}}' | \
  npx -y @modelcontextprotocol/server-filesystem /tmp
```

## Creating Custom MCP Servers

### Python Server

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server

server = Server("my-server")

@server.tool()
async def my_tool(arg: str) -> str:
    """Tool description"""
    return f"Result: {arg}"

if __name__ == "__main__":
    stdio_server(server)
```

### Node.js Server

```javascript
import { Server } from "@modelcontextprotocol/server-node";

const server = new Server("my-server");

server.tool({
  name: "my-tool",
  description: "Tool description",
  parameters: { arg: "string" }
}, async ({ arg }) => {
  return `Result: ${arg}`;
});

server.listen();
```

### Configuration

```json
{
  "mcpServers": {
    "my-server": {
      "command": "python",
      "args": ["./mcp-server/server.py"]
    }
  }
}
```

## Security Best Practices

### Filesystem Access
- Restrict to specific directories
- Use read-only when possible
- Validate file paths

### API Credentials
- Never commit credentials
- Use environment variables
- Rotate keys regularly

### Network Access
- Whitelist domains
- Use HTTPS only
- Implement timeouts

## Troubleshooting

### Server Not Starting
```bash
# Check command works
npx -y @modelcontextprotocol/server-filesystem /tmp

# Verify env vars
echo $GITHUB_TOKEN
```

### Connection Errors
```bash
# Test network
curl https://api.example.com/mcp

# Check proxy
echo $HTTP_PROXY
```

### Tool Not Found
- Verify server running
- Check server config
- Inspect capabilities with MCP Inspector
