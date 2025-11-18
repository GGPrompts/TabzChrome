#!/bin/bash

# Terminal Tabs - Launch Script
# Starts both backend and frontend servers

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Terminal Tabs Launch Script       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if backend dependencies are installed
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
    cd "$BACKEND_DIR"
    npm install
fi

# Check if frontend dependencies are installed
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing frontend dependencies...${NC}"
    cd "$FRONTEND_DIR"
    npm install
fi

# Create log directory
mkdir -p "$SCRIPT_DIR/logs"

# Start backend
echo -e "${GREEN}🚀 Starting backend server...${NC}"
cd "$BACKEND_DIR"
npm start > "$SCRIPT_DIR/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}   Backend PID: $BACKEND_PID${NC}"

# Wait a bit for backend to start
sleep 2

# Check if backend is still running
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Backend failed to start. Check logs/backend.log${NC}"
    exit 1
fi

# Start frontend
echo -e "${GREEN}🚀 Starting frontend dev server...${NC}"
cd "$FRONTEND_DIR"
npm run dev > "$SCRIPT_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}   Frontend PID: $FRONTEND_PID${NC}"

# Save PIDs to file for easy stopping
echo "$BACKEND_PID" > "$SCRIPT_DIR/.backend.pid"
echo "$FRONTEND_PID" > "$SCRIPT_DIR/.frontend.pid"

echo ""
echo -e "${GREEN}✅ Terminal Tabs is starting up!${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}URLs:${NC}"
echo -e "  Frontend: ${YELLOW}http://localhost:5173${NC}"
echo -e "  Backend:  ${YELLOW}http://localhost:8127${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Backend:  tail -f logs/backend.log"
echo -e "  Frontend: tail -f logs/frontend.log"
echo ""
echo -e "${BLUE}To stop:${NC}"
echo -e "  Run: ${YELLOW}./stop.sh${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Wait a moment and check if services are still running
sleep 3

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Backend stopped unexpectedly. Check logs/backend.log${NC}"
    kill $FRONTEND_PID 2>/dev/null || true
    exit 1
fi

if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Frontend stopped unexpectedly. Check logs/frontend.log${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✨ All services running successfully!${NC}"
echo -e "${YELLOW}Press Ctrl+C to view logs, or run './stop.sh' to stop all services${NC}"
echo ""

# Follow logs (optional - user can Ctrl+C to exit)
tail -f "$SCRIPT_DIR/logs/frontend.log" "$SCRIPT_DIR/logs/backend.log"
