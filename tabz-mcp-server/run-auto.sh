#!/bin/bash
# Auto-detect platform and run tabz-mcp-server with appropriate node
#
# Detects:
# - WSL2: Uses Windows node.exe for reliable localhost:8129 connection
# - Native Linux/macOS: Uses native node
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

# Detect WSL2 by checking for Microsoft kernel
if grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL2 - use Windows node.exe for reliable connection to backend on Windows
    WINDOWS_NODE="/mnt/c/Program Files/nodejs/node.exe"

    if [[ -x "$WINDOWS_NODE" ]]; then
        exec "$WINDOWS_NODE" "$(wslpath -w "$SCRIPT_DIR/dist/index.js")"
    else
        echo "ERROR: Windows node.exe not found at $WINDOWS_NODE" >&2
        echo "Please install Node.js on Windows or update the path in this script." >&2
        exit 1
    fi
else
    # Native Linux or macOS - use native node
    exec node "$SCRIPT_DIR/dist/index.js"
fi
