#!/bin/bash

# Terminal Tabs - Development Logs Viewer
# Shows beautiful colored logs from the running backend

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/.logs/backend.log"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m'

clear

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    Terminal Tabs - Dev Logs 📊        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if backend process is running
# Look for either "node server.js" or "node backend/server.js" or similar patterns
BACKEND_PID=$(pgrep -f "node.*server\.js" 2>/dev/null | head -1)

if [ -z "$BACKEND_PID" ]; then
  echo -e "${RED}❌ Backend not running${NC}"
  echo ""
  echo -e "${CYAN}Start backend with:${NC}"
  echo -e "  ${GREEN}cd $PROJECT_ROOT/backend && npm start${NC}"
  echo ""
  echo -e "${CYAN}Or start everything with:${NC}"
  echo -e "  ${GREEN}cd $PROJECT_ROOT && ./start-tmux.sh${NC}"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

echo -e "${GREEN}✅ Backend running (PID: $BACKEND_PID)${NC}"
echo -e "${CYAN}Port: 8127 | WebSocket: ws://localhost:8127${NC}"
echo ""

# METHOD 1: Check for tmux session (if started with start-tmux.sh)
if tmux has-session -t terminal-tabs 2>/dev/null; then
  echo -e "${GREEN}✅ Found terminal-tabs tmux session${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Show recent backend logs (last 100 lines with colors preserved!)
  echo -e "${MAGENTA}📊 Recent Backend Logs (from tmux):${NC}"
  echo ""
  tmux capture-pane -t terminal-tabs:backend -p -S -100 -e

  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}✨ Live view:${NC} ${CYAN}tmux attach -t terminal-tabs:backend${NC}"
  echo ""
  read -p "Press Enter to exit..."

# METHOD 2: Check for log file (if enabled)
elif [ -f "$LOG_FILE" ]; then
  echo -e "${GREEN}✅ Found log file${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  echo -e "${MAGENTA}📊 Recent Backend Logs (last 100 lines):${NC}"
  echo ""
  tail -100 "$LOG_FILE"

  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}✨ Live view:${NC} ${CYAN}tail -f $LOG_FILE${NC}"
  echo ""
  read -p "Press Enter to exit..."

# METHOD 3: Use journalctl (Linux)
elif command -v journalctl &> /dev/null; then
  echo -e "${YELLOW}💡 Using journalctl (system logs)${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  echo -e "${MAGENTA}📊 Recent Backend Logs (last 50 lines):${NC}"
  echo ""
  journalctl _PID=$BACKEND_PID -n 50 --no-pager --output=cat

  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}✨ Live view:${NC} ${CYAN}journalctl _PID=$BACKEND_PID -f${NC}"
  echo ""
  read -p "Press Enter to exit..."

# METHOD 4: Fallback - helpful message
else
  echo -e "${YELLOW}💡 Backend is running, but logs aren't accessible from here${NC}"
  echo ""
  echo -e "${CYAN}Where to find logs:${NC}"
  echo ""
  echo -e "${GREEN}1.${NC} Check the terminal where you ran:"
  echo -e "   ${CYAN}npm start${NC}"
  echo -e "   (That terminal shows the beautiful colored logs)"
  echo ""
  echo -e "${GREEN}2.${NC} Or restart with tmux to view logs from anywhere:"
  echo -e "   ${CYAN}cd $PROJECT_ROOT && ./start-tmux.sh${NC}"
  echo ""
  echo -e "${GREEN}3.${NC} Enable log file (add to backend/.env):"
  echo -e "   ${CYAN}LOG_FILE=../.logs/backend.log${NC}"
  echo -e "   Then restart backend"
  echo ""
  echo -e "${MAGENTA}Why can't we see logs here?${NC}"
  echo -e "  When you run ${CYAN}npm start${NC} directly, logs go to that terminal's stdout"
  echo -e "  We can't capture them without tmux or a log file"
  echo ""
  read -p "Press Enter to exit..."
fi
