# Terminal Tabs - Launch Scripts

Quick reference for starting and stopping Terminal Tabs.

## 🚀 Quick Start

### Option 1: Background Processes (Simple)

Start both servers in the background:
```bash
./start.sh
```

Stop all servers:
```bash
./stop.sh
```

**Features:**
- Runs in background
- Logs to `logs/backend.log` and `logs/frontend.log`
- Auto-checks dependencies
- Shows URLs and PIDs

**View logs:**
```bash
tail -f logs/backend.log
tail -f logs/frontend.log
```

---

### Option 2: Tmux Session (Recommended)

Start in a tmux session (better for development):
```bash
./start-tmux.sh
```

**Features:**
- Backend, Frontend, and Logs in separate windows
- Easy switching with `Ctrl+B` then `0/1/2`
- Detach with `Ctrl+B` then `D`
- Reattach with `tmux attach -t terminal-tabs`

**Tmux Commands:**
- **Switch windows:** `Ctrl+B` then `0` (backend), `1` (frontend), `2` (logs)
- **Detach session:** `Ctrl+B` then `D`
- **Reattach:** `tmux attach -t terminal-tabs`
- **Kill session:** `tmux kill-session -t terminal-tabs`

---

## 📋 Manual Start (No Scripts)

If you prefer to start services manually:

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

---

## 🌐 URLs

After starting:
- **Frontend:** http://localhost:5173
- **Backend WebSocket:** ws://localhost:8127/ws
- **Backend API:** http://localhost:8127

---

## 🐛 Troubleshooting

### Port Already in Use

If you get "port already in use" errors:

```bash
# Check what's using the ports
lsof -i :5173   # Frontend
lsof -i :8127   # Backend

# Kill processes on specific ports
./stop.sh       # This handles it automatically
```

### Services Won't Start

1. Check logs: `logs/backend.log` and `logs/frontend.log`
2. Ensure dependencies are installed: `npm install`
3. Try manual start to see error messages

### Tmux Not Found

Install tmux:
```bash
# Ubuntu/Debian
sudo apt install tmux

# macOS
brew install tmux
```

---

## 🗂️ Files Created by Scripts

- `.backend.pid` - Backend process ID (auto-cleaned by stop.sh)
- `.frontend.pid` - Frontend process ID (auto-cleaned by stop.sh)
- `logs/backend.log` - Backend output
- `logs/frontend.log` - Frontend output

These are gitignored and can be safely deleted.

---

## 💡 Tips

1. **Use tmux for development** - Easier to see output and switch between services
2. **Use background mode for production-like testing** - Simulates deployed environment
3. **Check logs if something breaks** - All output is captured
4. **Run `./stop.sh` before `./start.sh`** - Ensures clean restart

---

---

## 🔍 Dev Logs Profile

A special profile for viewing Terminal Tabs development logs in real-time using `lnav`.

### Quick Add

**Option 1: Open the HTML file (Easiest)**
```bash
# Open in your browser
xdg-open add-dev-logs-profile.html  # Linux
open add-dev-logs-profile.html      # macOS
```
Click the button to add the profile, then refresh Terminal Tabs.

**Option 2: Use the Settings UI**
1. Start Terminal Tabs
2. Click the 🎨 button in the footer
3. Click "+ New Profile"
4. Fill in:
   - **Name:** Dev Logs
   - **Icon:** 🔍
   - **Command:** `lnav logs/backend.log logs/frontend.log`
   - **Terminal Type:** bash
   - **Working Dir:** `~/projects/terminal-tabs/terminal-tabs`
   - **Theme:** monokai
   - **Transparency:** 95

**Option 3: Console Command**
```bash
node add-dev-logs-profile.js
```
Follow the instructions to paste code in browser console.

### Using the Profile

1. Start Terminal Tabs with `./start.sh` or `./start-tmux.sh`
2. Click the **+** button in the tab bar
3. Select **"Dev Logs"** profile
4. Watch both backend and frontend logs in a beautiful TUI!

**lnav Features:**
- Color-coded log levels
- Real-time tail mode
- Search with `/`
- Filter by log level
- SQL queries over logs
- Press `?` for help

---

**Happy Coding!** 🎉
