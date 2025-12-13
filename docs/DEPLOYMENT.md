# TabzChrome Deployment Guide

Complete guide for deploying the TabzChrome Chrome extension and backend server.

---

## Prerequisites

### System Requirements

| Component | Minimum Version | Notes |
|-----------|-----------------|-------|
| Node.js | 18.x or higher | LTS recommended (20.x, 22.x) |
| npm | 8.x or higher | Comes with Node.js |
| Chrome | 116+ | Required for Side Panel API |
| tmux | 3.0+ | Required for terminal persistence |

### WSL-Specific Requirements (Windows Users)

If running in WSL (Windows Subsystem for Linux):

- **WSL 2** recommended for better performance
- Extension can load from WSL path or Windows filesystem
- Backend runs in WSL, connects via `localhost:8129`

Check WSL version:
```bash
wsl --list --verbose
```

---

## Backend Deployment

The backend server handles WebSocket connections for terminal I/O and provides REST APIs.

### Option 1: PM2 (Recommended for Production)

PM2 provides process management, auto-restart, and logging.

#### Install PM2

```bash
npm install -g pm2
```

#### Start with PM2

```bash
cd backend

# Production mode (log level 3 = info)
pm2 start ecosystem.config.js

# Development mode (log level 5 = debug)
pm2 start ecosystem.config.js --env development
```

#### PM2 Commands

```bash
pm2 logs tabz-backend       # View logs
pm2 monit                   # Real-time monitoring
pm2 reload tabz-backend     # Zero-downtime reload
pm2 stop tabz-backend       # Stop server
pm2 delete tabz-backend     # Remove from PM2
pm2 status                  # Check process status
```

#### Auto-Start on Boot

```bash
pm2 startup                 # Generate startup script (run as root if prompted)
pm2 save                    # Save current process list
```

### Option 2: Manual Start

For development or simple deployments:

```bash
cd backend
npm install
npm start
```

The server runs on port **8129** by default.

### Option 3: Development Script

For local development with tmux integration:

```bash
./scripts/dev.sh
```

This creates a `tabz-chrome` tmux session with:
- `tabz-chrome:backend` - Backend server window
- `tabz-chrome:logs` - Optional live logs window

### Environment Variables

Create or edit `backend/.env`:

```bash
# Logging Configuration
# 0=silent, 1=fatal, 2=error, 3=warn, 4=info, 5=debug
LOG_LEVEL=3

# Optional: Write logs to file
# LOG_FILE=logs/backend.log

# Port (default: 8129)
# PORT=8129
```

The `scripts/dev.sh` script can generate this file interactively.

---

## Extension Installation

### Step 1: Build the Extension

```bash
# From project root
npm install
npm run build
```

This creates the `dist-extension/` directory with the built extension.

### Step 2: Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist-extension` folder:
   - **Windows native path**: `C:\Users\<USERNAME>\path\to\TabzChrome\dist-extension`
   - **WSL path**: `\\wsl.localhost\Ubuntu\home\<USERNAME>\projects\TabzChrome\dist-extension`

### Step 3: Reload After Changes

After rebuilding (`npm run build`), click the **Reload** (🔄) button on the extension card in `chrome://extensions`.

### WSL Path Considerations

**Option A: Load from WSL path (simpler, may be flaky)**
```
\\wsl.localhost\Ubuntu\home\<username>\projects\TabzChrome\dist-extension
```

**Option B: Copy to Windows filesystem (more stable)**
```bash
# Build and sync to Windows
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/
```

Then load from `C:\Users\<username>\Desktop\TabzChrome\dist-extension`

---

## Production Checklist

### 1. WebSocket Authentication

The backend generates a random auth token on startup:

```javascript
// Token is written to:
/tmp/tabz-auth-token
```

The extension reads this token via the `/api/auth/ws-token` endpoint before establishing WebSocket connections. This prevents unauthorized local processes from controlling terminals.

**Security Notes:**
- Token file has `0600` permissions (owner read/write only)
- Token regenerates on each backend restart
- Extension fetches fresh token on connect/reconnect

### 2. Log Directory Permissions

If using file logging:

```bash
# Create logs directory with proper permissions
mkdir -p backend/logs
chmod 755 backend/logs
```

PM2 automatically creates log files specified in `ecosystem.config.js`:
- `logs/error.log` - Error output
- `logs/out.log` - Standard output
- `logs/combined.log` - Combined logs

### 3. Health Check Monitoring

The backend provides a health check endpoint:

```bash
curl http://localhost:8129/api/health
```

Response:
```json
{
  "success": true,
  "status": "healthy",
  "data": {
    "uptime": 3600,
    "activeTerminals": 3,
    "totalTerminals": 5,
    "memoryUsage": {
      "heapUsed": 45,
      "heapTotal": 65,
      "rss": 80
    },
    "version": "3.9.1"
  }
}
```

**Monitoring Integration:**
- Use with uptime monitors (UptimeRobot, Pingdom, etc.)
- PM2 Plus can use this for custom health checks
- Returns 200 when healthy, useful for load balancers

### 4. Graceful Shutdown

The backend handles `SIGTERM` and `SIGINT` signals:
- Closes WebSocket connections gracefully
- Allows active terminals to complete
- PM2 uses `kill_timeout: 5000` (5 seconds) before force kill

### 5. Resource Limits

PM2 ecosystem config includes:
- `max_memory_restart: '500M'` - Restart if memory exceeds 500MB
- `max_restarts: 10` - Maximum restart attempts
- `min_uptime: '10s'` - Consider started if running 10+ seconds

---

## Troubleshooting

### Backend Won't Start

**Port already in use:**
```bash
# Check what's using port 8129
lsof -i :8129

# Kill the process
kill -9 <PID>
```

**Missing dependencies:**
```bash
cd backend && npm install
```

**node-pty build issues:**
```bash
# Rebuild native modules
cd backend && npm rebuild node-pty
```

### Extension Won't Connect

**Check backend is running:**
```bash
curl http://localhost:8129/api/health
```

**Check WebSocket connection in DevTools:**
1. Right-click sidebar → Inspect
2. Network tab → WS filter
3. Look for connection to `ws://localhost:8129`

**WSL networking issues:**
- Use `localhost` not `127.0.0.1`
- Ensure WSL2 networking is working: `curl localhost:8129`

### Terminals Not Persisting

**Check tmux sessions:**
```bash
# List all Chrome extension terminals
tmux ls | grep "^ctt-"

# List all sessions
tmux ls
```

**Orphaned sessions:**
```bash
# Kill orphaned Chrome extension terminals
tmux list-sessions | grep "^ctt-" | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### PM2 Issues

**Logs not rotating:**
```bash
# Install pm2-logrotate
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

**Process keeps restarting:**
```bash
# Check error logs
pm2 logs tabz-backend --err

# Check for crash loop
pm2 describe tabz-backend
```

### Extension Not Loading

**"Manifest not found" error:**
- Ensure you selected `dist-extension/` folder, not the project root
- Rebuild with `npm run build`

**Icons missing:**
- Check `dist-extension/icons/` exists
- Rebuild the extension

**Permissions errors:**
- Chrome may need restart after permissions change
- Check `chrome://extensions` for error badges

### Debug Logging

**Enable verbose backend logging:**
```bash
# In backend/.env
LOG_LEVEL=5
```

**Check browser console logs:**
1. Open sidebar (Ctrl+Shift+9)
2. Right-click → Inspect
3. Console tab shows extension logs

**Capture backend terminal output:**
```bash
# If using dev.sh script
tmux capture-pane -t tabz-chrome:backend -p -S -100
```

---

## Quick Reference

### Ports

| Service | Port | Protocol |
|---------|------|----------|
| Backend HTTP | 8129 | HTTP |
| Backend WebSocket | 8129 | WS |

### Key Files

| File | Purpose |
|------|---------|
| `backend/ecosystem.config.js` | PM2 configuration |
| `backend/.env` | Environment variables |
| `/tmp/tabz-auth-token` | WebSocket auth token |
| `dist-extension/` | Built extension files |

### Key Commands

```bash
# Development
./scripts/dev.sh              # Start with tmux

# Production
pm2 start ecosystem.config.js # Start with PM2
pm2 logs tabz-backend         # View logs
pm2 monit                     # Monitor

# Extension
npm run build                 # Build extension
npm run zip                   # Package for distribution

# Debugging
curl localhost:8129/api/health # Health check
tmux ls | grep "^ctt-"        # List terminal sessions
```

---

*Last updated: December 2025*
