#!/bin/bash
# Run tabz-mcp-server via Windows node.exe from WSL2
#
# Why Windows node.exe?
# CDP (Chrome DevTools Protocol) needs to connect to Chrome on Windows.
# WSL2 node can't reach Windows localhost:9222 directly, but Windows
# node.exe can. This allows screenshots, clicks, and other CDP features.
#
# Requirements:
# - Node.js installed on Windows (default path: /mnt/c/Program Files/nodejs/)
# - Chrome running with --remote-debugging-port=9222
#
# For native Linux/macOS, use run.sh instead.
# For auto-detection, use run-auto.sh

exec "/mnt/c/Program Files/nodejs/node.exe" "$(wslpath -w "$(dirname "$0")/dist/index.js")"
