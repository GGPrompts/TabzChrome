# Browser MCP Server - WSL2 Setup Guide

This guide explains how to set up the Browser MCP Server when running Claude Code in WSL2 with Chrome on Windows.

## The Problem

WSL2 has network isolation from Windows:
- WSL2's `localhost` ≠ Windows `localhost`
- Chrome's CDP (Chrome DevTools Protocol) binds to Windows `127.0.0.1:9222` only
- Chrome ignores `--remote-debugging-address=0.0.0.0` on Windows for security
- An MCP server running in WSL2 cannot directly access Windows `localhost:9222`

## The Solution

Two components working together:

1. **MCP server runs via Windows `node.exe`** - Direct access to Chrome's CDP
2. **Port proxy forwards WSL → Windows** - Bridges the network gap

## Setup Steps

### 1. Create Chrome Debug Shortcut (One-Time)

Create a batch file at `C:\Users\marci\Scripts\Chrome-Debug.bat`:

```batch
@echo off
REM Chrome with Remote Debugging for Claude Code

echo Closing existing Chrome instances...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting Chrome with remote debugging on port 9222...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --remote-debugging-port=9222 ^
    --user-data-dir=C:\Temp\chrome-debug ^
    --no-first-run ^
    --no-default-browser-check

echo Chrome started with debugging enabled!
timeout /t 3
```

Create a desktop shortcut pointing to this batch file with Chrome's icon.

**Note:** Don't use `--remote-debugging-address=0.0.0.0` - Chrome ignores it on Windows.

### 2. Set Up Port Proxy (One-Time, Requires Admin)

Chrome only listens on `127.0.0.1:9222`. To access from WSL2, set up a port proxy:

```powershell
# Run as Administrator
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
```

Verify it's set up:
```powershell
netsh interface portproxy show all
```

Expected output:
```
Listen on ipv4:             Connect to ipv4:
Address         Port        Address         Port
--------------- ----------  --------------- ----------
0.0.0.0         9222        127.0.0.1       9222
```

**This persists across reboots** - you only need to do it once.

### 3. Configure MCP Server

The project includes a `run-windows.sh` wrapper that runs via Windows `node.exe`.

**Project `.mcp.json`:**
```json
{
  "mcpServers": {
    "browser": {
      "command": "/home/matt/projects/TabzChrome/browser-mcp-server/run-windows.sh",
      "args": [],
      "env": {
        "BACKEND_URL": "http://localhost:8129"
      }
    }
  }
}
```

### 4. Start Everything

**Startup order matters:**

1. **Start Chrome** - Double-click "Chrome (Claude Debug)" shortcut
2. **Start Backend** - `cd backend && npm start` (in WSL2)
3. **Start Claude Code** - It will connect to the MCP server

### 5. Verify Setup

Test CDP from WSL2:
```bash
# Get Windows gateway IP
WIN_IP=$(ip route | grep default | awk '{print $3}')
curl -s "http://${WIN_IP}:9222/json/version"
```

Should return Chrome version info.

## How It Works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Architecture                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   WINDOWS                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                              │
│  │  Chrome         │    │  Port Proxy     │                              │
│  │  127.0.0.1:9222 │◀───│  0.0.0.0:9222   │◀─── WSL2 connects here      │
│  │  (CDP)          │    │  (netsh)        │                              │
│  └─────────────────┘    └─────────────────┘                              │
│           │                                                               │
│           ▼                                                               │
│  ┌─────────────────┐         ┌─────────────────┐                         │
│  │  MCP Server     │  stdio  │  Claude Code    │                         │
│  │  (node.exe)     │◀───────▶│  (WSL2)         │                         │
│  │  via run-win.sh │         │                 │                         │
│  └─────────────────┘         └─────────────────┘                         │
│           │                           │                                   │
│           ▼                           ▼                                   │
│    localhost:9222              localhost:8129                             │
│    (reaches Chrome)            (reaches backend)                          │
│                                                                           │
│   WSL2                                                                    │
│  ┌─────────────────┐                                                     │
│  │  TabzChrome     │                                                     │
│  │  Backend :8129  │                                                     │
│  └─────────────────┘                                                     │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why this works:**
1. **Chrome** binds to `127.0.0.1:9222` (Windows-only security restriction)
2. **Port Proxy** listens on `0.0.0.0:9222` and forwards to `127.0.0.1:9222`
3. **MCP Server** runs via `node.exe` so `localhost:9222` reaches Chrome directly
4. **Backend** in WSL2 is reachable from Windows via localhost forwarding
5. **Claude Code** communicates with MCP server via stdio (works across WSL/Windows)

## Updating the MCP Server

When you make changes to the source code:

```bash
# Rebuild
cd /home/matt/projects/TabzChrome/browser-mcp-server
npm run build

# Restart Claude Code to pick up changes
```

## Troubleshooting

### "CDP not available" - Most Common Issue

**Check 1: Is Chrome running with debugging?**
```powershell
# From PowerShell - should return Chrome version JSON
curl.exe http://localhost:9222/json/version
```

If this fails, Chrome wasn't started with `--remote-debugging-port=9222`. Use the Chrome Debug shortcut.

**Check 2: Is Chrome actually using the port?**
```powershell
netstat -an | findstr :9222
```

Look for `LISTENING` on either `0.0.0.0:9222` or `127.0.0.1:9222`.

**Check 3: Is something else using port 9222?**
```powershell
Get-NetTCPConnection -LocalPort 9222 -State Listen |
  ForEach-Object { Get-Process -Id $_.OwningProcess }
```

If it shows `svchost` instead of `chrome`, the port proxy is running but Chrome isn't. Restart Chrome.

**Check 4: Is the port proxy set up?**
```powershell
netsh interface portproxy show all
```

Should show `0.0.0.0:9222 → 127.0.0.1:9222`. If missing, set it up (see Setup Steps).

**Check 5: Can WSL2 reach the port?**
```bash
WIN_IP=$(ip route | grep default | awk '{print $3}')
curl -s "http://${WIN_IP}:9222/json/version"
```

### Startup Order Issues

**Correct order:**
1. Start Chrome (via debug shortcut)
2. Start Backend (`cd backend && npm start`)
3. Start Claude Code

**Wrong:** Starting Chrome after the port proxy is created but without the debug flag - the proxy runs but forwards to nothing.

### Screenshots Save to Wrong Location

Screenshots save to Windows path `C:\Users\marci\ai-images\`.

To view in Claude Code, use the WSL path:
```
/mnt/c/Users/marci/ai-images/screenshot-xxx.png
```

### Browser Window Shrinking (Fixed)

This was caused by broken CDP connection. When CDP isn't working, puppeteer may try to create a new browser instance with default viewport. With proper CDP setup, this doesn't happen.

## Files Reference

| File | Purpose |
|------|---------|
| `.mcp.json` | Project MCP server config |
| `run-windows.sh` | Wrapper to run via Windows node.exe |
| `C:\Users\marci\Scripts\Chrome-Debug.bat` | Chrome startup script |
| `C:\Users\marci\ai-images\` | Screenshot output directory |
| `dist/` | Built MCP server code |

## Quick Diagnostic Commands

```bash
# Check Chrome CDP from Windows
powershell.exe -Command "curl.exe http://localhost:9222/json/version"

# Check port proxy
powershell.exe -Command "netsh interface portproxy show all"

# Check what's on port 9222
powershell.exe -Command "netstat -an | Select-String ':9222.*LISTEN'"

# Check CDP from WSL2
curl -s "http://$(ip route | grep default | awk '{print $3}'):9222/json/version"

# Check backend
curl -s http://localhost:8129/api/health
```
