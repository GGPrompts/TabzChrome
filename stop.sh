#!/bin/bash

# Tabz - Stop Script
# Stops both backend and frontend servers

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${YELLOW}🛑 Stopping Tabz...${NC}"
echo ""

# Stop backend
if [ -f "$SCRIPT_DIR/.backend.pid" ]; then
    BACKEND_PID=$(cat "$SCRIPT_DIR/.backend.pid")
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping backend (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID
        echo -e "${GREEN}✓ Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend not running${NC}"
    fi
    rm "$SCRIPT_DIR/.backend.pid"
else
    echo -e "${YELLOW}No backend PID file found${NC}"
fi

# Stop frontend
if [ -f "$SCRIPT_DIR/.frontend.pid" ]; then
    FRONTEND_PID=$(cat "$SCRIPT_DIR/.frontend.pid")
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping frontend (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID
        echo -e "${GREEN}✓ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend not running${NC}"
    fi
    rm "$SCRIPT_DIR/.frontend.pid"
else
    echo -e "${YELLOW}No frontend PID file found${NC}"
fi

# Also kill any remaining node/vite processes on the ports
echo ""
echo -e "${YELLOW}Cleaning up any remaining processes...${NC}"

# Kill any process on port 8127 (backend)
BACKEND_PORT_PID=$(lsof -ti:8127 2>/dev/null || true)
if [ ! -z "$BACKEND_PORT_PID" ]; then
    echo -e "${YELLOW}Killing process on port 8127...${NC}"
    kill $BACKEND_PORT_PID 2>/dev/null || true
fi

# Kill any process on port 5173 (frontend)
FRONTEND_PORT_PID=$(lsof -ti:5173 2>/dev/null || true)
if [ ! -z "$FRONTEND_PORT_PID" ]; then
    echo -e "${YELLOW}Killing process on port 5173...${NC}"
    kill $FRONTEND_PORT_PID 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}✅ Tabz stopped successfully!${NC}"
