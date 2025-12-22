#!/bin/bash
# Run tabz-mcp-server via Windows node.exe from WSL2
#
# Why Windows node.exe?
# Ensures reliable localhost:8129 connection to the TabzChrome backend
# running on Windows. WSL2 node can also work, but Windows node.exe
# is more reliable for cross-platform localhost connections.
#
# Requirements:
# - Node.js installed on Windows (default path: /mnt/c/Program Files/nodejs/)
# - TabzChrome backend running on localhost:8129
#
# For native Linux/macOS, use run.sh instead.
# For auto-detection, use run-auto.sh

exec "/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w "$(dirname "$0")/dist/index.js")"
