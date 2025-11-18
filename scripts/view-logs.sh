#!/bin/bash

# Terminal Tabs - Live Log Viewer
# Shows beautiful colored logs from backend and frontend

set -e

# Colors for output
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Terminal Tabs - Live Log Viewer     ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if running in tmux session
if tmux has-session -t terminal-tabs 2>/dev/null; then
  echo -e "${GREEN}✓ Found terminal-tabs tmux session${NC}"
  echo ""
  echo -e "${BLUE}Choose log source:${NC}"
  echo -e "  ${YELLOW}1${NC} - Backend logs (colored, structured)"
  echo -e "  ${YELLOW}2${NC} - Frontend logs (Vite dev server)"
  echo -e "  ${YELLOW}3${NC} - Both (split pane)"
  echo ""

  # Auto-select option 3 (both) for convenience
  CHOICE=3

  if [ "$CHOICE" = "1" ]; then
    echo -e "${GREEN}Showing backend logs...${NC}"
    tmux capture-pane -t terminal-tabs:backend -p -S -1000
    echo ""
    echo -e "${YELLOW}Following live backend logs (Ctrl+C to exit)...${NC}"
    tmux pipe-pane -t terminal-tabs:backend -o "cat"
    tmux attach -t terminal-tabs:backend
  elif [ "$CHOICE" = "2" ]; then
    echo -e "${GREEN}Showing frontend logs...${NC}"
    tmux capture-pane -t terminal-tabs:frontend -p -S -1000
    echo ""
    echo -e "${YELLOW}Following live frontend logs (Ctrl+C to exit)...${NC}"
    tmux pipe-pane -t terminal-tabs:frontend -o "cat"
    tmux attach -t terminal-tabs:frontend
  elif [ "$CHOICE" = "3" ]; then
    echo -e "${GREEN}Showing both logs in split view...${NC}"
    echo ""

    # Create a new tmux window with split panes
    tmux new-window -t terminal-tabs -n viewer
    tmux split-window -h -t terminal-tabs:viewer

    # Left pane: backend logs
    tmux select-pane -t terminal-tabs:viewer.0
    tmux send-keys -t terminal-tabs:viewer.0 "echo -e '${CYAN}Backend Logs (Port 8127)${NC}' && echo '' && tmux capture-pane -t terminal-tabs:backend -p -S -50 && echo '' && echo -e '${YELLOW}Following live...${NC}' && tail -f /dev/null" C-m

    # Right pane: frontend logs
    tmux select-pane -t terminal-tabs:viewer.1
    tmux send-keys -t terminal-tabs:viewer.1 "echo -e '${CYAN}Frontend Logs (Vite)${NC}' && echo '' && tmux capture-pane -t terminal-tabs:frontend -p -S -50 && echo '' && echo -e '${YELLOW}Following live...${NC}' && tail -f /dev/null" C-m

    # Attach to the viewer window
    tmux select-window -t terminal-tabs:viewer
    echo -e "${GREEN}✓ Created split view (backend | frontend)${NC}"
    echo -e "${YELLOW}Tip: Use Ctrl+B then arrow keys to navigate panes${NC}"
  fi
else
  echo -e "${YELLOW}⚠ terminal-tabs tmux session not found${NC}"
  echo ""
  echo -e "${BLUE}To view live logs:${NC}"
  echo -e "  1. Start the app with: ${GREEN}./start-tmux.sh${NC}"
  echo -e "  2. Then run this script again"
  echo ""
  echo -e "${BLUE}Alternative - Check process logs:${NC}"

  # Try to find running backend process
  BACKEND_PID=$(pgrep -f "node.*backend.*server.js" || echo "")
  if [ -n "$BACKEND_PID" ]; then
    echo -e "  ${GREEN}✓ Backend running (PID: $BACKEND_PID)${NC}"
    echo -e "  View with: ${YELLOW}journalctl _PID=$BACKEND_PID -f${NC}"
  else
    echo -e "  ${RED}✗ Backend not running${NC}"
  fi

  # Try to find running frontend process
  FRONTEND_PID=$(pgrep -f "vite" || echo "")
  if [ -n "$FRONTEND_PID" ]; then
    echo -e "  ${GREEN}✓ Frontend running (PID: $FRONTEND_PID)${NC}"
    echo -e "  View with: ${YELLOW}journalctl _PID=$FRONTEND_PID -f${NC}"
  else
    echo -e "  ${RED}✗ Frontend not running${NC}"
  fi

  echo ""
  echo -e "${BLUE}Quick Start:${NC}"
  echo -e "  ${YELLOW}cd $PROJECT_ROOT && ./start-tmux.sh${NC}"
fi
