#!/bin/bash
# Run tabz-mcp-server using native Node.js
# Use this on native Linux or macOS (not WSL2)
#
# For WSL2, use run-wsl.sh which invokes Windows node.exe
# For auto-detection, use run-auto.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/dist/index.js"
