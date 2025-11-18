#!/bin/bash

# Terminal Tabs - Simple Log Viewer
# Shows recent logs from backend (with beautiful colors!)

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Terminal Tabs - Live Logs 📊        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if backend is running
BACKEND_PID=$(pgrep -f "node.*backend.*server.js" 2>/dev/null | head -1)

if [ -z "$BACKEND_PID" ]; then
  echo -e "${YELLOW}⚠️  Backend not running${NC}"
  echo ""
  echo "Start backend with:"
  echo "  cd $PROJECT_ROOT/backend && npm start"
  echo ""
  echo "Or start everything with tmux:"
  echo "  cd $PROJECT_ROOT && ./start-tmux.sh"
  exit 1
fi

echo -e "${GREEN}✅ Backend running (PID: $BACKEND_PID)${NC}"
echo -e "${CYAN}Port: 8127 | WebSocket: ws://localhost:8127${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Follow the backend process logs
# On Linux, journalctl can show process logs by PID
if command -v journalctl &> /dev/null; then
  echo -e "${CYAN}Following backend logs (Ctrl+C to exit)...${NC}"
  echo ""
  exec journalctl _PID=$BACKEND_PID -f --output=cat
else
  # Fallback: try to find log output via /proc
  echo -e "${YELLOW}Note: Install journalctl for better log viewing${NC}"
  echo ""
  echo -e "${CYAN}Backend is running. Logs are in the terminal where you ran 'npm start'${NC}"
  echo ""
  echo "To see beautiful logs:"
  echo "  1. Open the terminal running the backend"
  echo "  2. Or start with: ./start-tmux.sh"
  echo "  3. Then attach with: tmux attach -t terminal-tabs"

  # Keep terminal open
  read -p "Press Enter to exit..."
fi
