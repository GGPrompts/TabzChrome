# Tabz MCP Server - Platform Setup Guide

This guide explains how to set up the Tabz MCP Server on different platforms.

## Quick Start

**All 26 MCP tools work using Chrome Extension APIs only** - no `--remote-debugging-port=9222` flag needed!

| Platform | Launch Script | Notes |
|----------|---------------|-------|
| **WSL2** (Windows host) | `run-auto.sh` | Auto-detects WSL2, uses Windows node.exe |
| **Native Linux** | `run-auto.sh` | Uses native node |
| **macOS** | `run-auto.sh` | Uses native node |

---

## Setup Steps

### 1. Install TabzChrome Extension

Load the extension in Chrome at `chrome://extensions`:
- Enable "Developer mode"
- Click "Load unpacked"
- Select the `dist-extension/` folder

### 2. Start the Backend

```bash
cd backend && npm start
```

This starts the TabzChrome backend on `localhost:8129`.

### 3. Configure MCP Server

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "tabz": {
      "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
      "args": [],
      "env": {
        "BACKEND_URL": "http://localhost:8129"
      }
    }
  }
}
```

> Replace `/path/to/TabzChrome` with your actual clone location.

### 4. Verify Setup

```bash
# Check backend is running
curl -s http://localhost:8129/api/health

# Check MCP tools are available (from Claude Code)
mcp-cli tools tabz
```

---

## WSL2 Notes

When running Claude Code in WSL2 with Chrome on Windows:

- The `run-auto.sh` script automatically detects WSL2 and uses Windows `node.exe`
- This ensures reliable `localhost:8129` connection to the backend on Windows
- No port forwarding or network bridging needed

---

## Updating the MCP Server

When you make changes to the source code:

```bash
# Rebuild (from your TabzChrome clone)
cd tabz-mcp-server
npm run build

# Restart Claude Code to pick up changes
```

---

## Troubleshooting

### Backend Not Reachable

**Check backend is running:**
```bash
curl -s http://localhost:8129/api/health
```

If this fails, start the backend:
```bash
cd backend && npm start
```

### Extension Not Connected

1. Open Chrome sidebar and ensure TabzChrome is visible
2. Check `chrome://extensions` for any errors
3. Try reloading the extension

### WSL2: Connection Issues

If using WSL2 and `localhost` isn't working:

1. Ensure you're using `run-auto.sh` (not `run.sh`)
2. Verify Windows node.exe is installed: `/mnt/c/Program Files/nodejs/node.exe`
3. Check backend is running on Windows side (should be accessible as `localhost:8129`)

---

## Files Reference

| File | Purpose |
|------|---------|
| `.mcp.json` | Project MCP server config |
| `run.sh` | Native Linux/macOS launcher |
| `run-wsl.sh` | WSL2 launcher (uses Windows node.exe) |
| `run-auto.sh` | Auto-detect platform (recommended) |
| `dist/` | Built MCP server code |
