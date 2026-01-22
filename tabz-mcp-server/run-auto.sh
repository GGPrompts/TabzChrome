#!/bin/bash
# Run tabz-mcp-server with native node
#
# Note: Previously used Windows node.exe on WSL2, but env vars don't pass
# through the WSL/Windows boundary. Native node works fine for localhost.
#
# Usage in MCP config:
# {
#   "mcpServers": {
#     "tabz": {
#       "command": "/path/to/tabz-mcp-server/run-auto.sh",
#       "env": { "BACKEND_URL": "http://localhost:8129" }
#     }
#   }
# }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Auto-install dependencies if node_modules missing
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "[tabz-mcp] Installing dependencies..." >&2
  (cd "$SCRIPT_DIR" && npm install --silent) >&2
fi

exec node "$SCRIPT_DIR/dist/index.js"
