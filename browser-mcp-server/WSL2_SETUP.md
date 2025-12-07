# Browser MCP Server - WSL2 Setup Guide

This guide explains how to set up the Browser MCP Server when running Claude Code in WSL2 with Chrome on Windows.

## The Problem

WSL2 has network isolation from Windows:
- WSL2's `localhost` ≠ Windows `localhost`
- Chrome's CDP (Chrome DevTools Protocol) binds to Windows `127.0.0.1:9222` only
- Chrome ignores `--remote-debugging-address=0.0.0.0` on Windows for security

## The Solution

The MCP server runs via **Windows `node.exe`** (not WSL2), so it can access Chrome's `localhost:9222` directly. No port proxy or network bridging needed!

> **Note:** You may see references to `netsh interface portproxy` in other guides. This is **NOT required** for TabzChrome because our MCP server runs via Windows node.exe, not inside WSL2.

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

**Note:** Don't use `--remote-debugging-address=0.0.0.0` - Chrome ignores it on Windows anyway.

### 2. Configure MCP Server

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

### 3. Start Everything

**Startup order matters:**

1. **Start Chrome** - Double-click "Chrome (Claude Debug)" shortcut
2. **Start Backend** - `cd backend && npm start` (in WSL2)
3. **Start Claude Code** - It will connect to the MCP server

### 4. Verify Setup

Test CDP from PowerShell:
```powershell
curl.exe http://localhost:9222/json/version
```

Should return Chrome version info (Browser, Protocol-Version, etc.).

## How It Works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Architecture                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   WINDOWS                                                                 │
│  ┌─────────────────┐         ┌─────────────────┐                         │
│  │  Chrome         │         │  Claude Code    │                         │
│  │  127.0.0.1:9222 │         │  (WSL2)         │                         │
│  │  (CDP)          │         │                 │                         │
│  └─────────────────┘         └─────────────────┘                         │
│           ▲                           │                                   │
│           │ localhost:9222            │ stdio                             │
│           │                           ▼                                   │
│  ┌─────────────────────────────────────────────┐                         │
│  │  MCP Server (Windows node.exe)              │                         │
│  │  - Runs via run-windows.sh                  │                         │
│  │  - Direct access to Chrome CDP              │                         │
│  │  - No port proxy needed!                    │                         │
│  └─────────────────────────────────────────────┘                         │
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
1. **Chrome** binds to `127.0.0.1:9222` (localhost only - secure!)
2. **MCP Server** runs via Windows `node.exe`, so `localhost:9222` reaches Chrome directly
3. **Backend** in WSL2 is reachable from Windows via automatic localhost forwarding
4. **Claude Code** communicates with MCP server via stdio (works across WSL/Windows)

**Security:** Chrome's CDP is only accessible from localhost. No network exposure.

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

Should show `127.0.0.1:9222` in `LISTENING` state.

**Check 3: Is something else using port 9222?**
```powershell
Get-NetTCPConnection -LocalPort 9222 -State Listen |
  ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Should show `chrome`. If it shows something else, close that application and restart Chrome.

### Startup Order Issues

**Correct order:**
1. Start Chrome (via debug shortcut)
2. Start Backend (`cd backend && npm start`)
3. Start Claude Code

**Common mistake:** Starting Chrome without the `--remote-debugging-port=9222` flag. Always use the Chrome Debug shortcut.

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
# Check Chrome CDP is working
powershell.exe -Command "curl.exe http://localhost:9222/json/version"

# Check what process is on port 9222
powershell.exe -Command "netstat -an | Select-String ':9222.*LISTEN'"

# Check backend is running
curl -s http://localhost:8129/api/health
```
