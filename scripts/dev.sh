#!/bin/bash

# TabzChrome Dev Script
# Starts backend in tmux with optional logs window

set -e

# Force consistent terminal type regardless of parent terminal
export TERM=xterm-256color
unset WT_SESSION
unset WT_PROFILE_ID

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"

# Session name without hyphen to avoid tmux prefix-matching issues
# (e.g., "tmux kill-session -t tabz" would match "tabz-chrome" but not "tabzchrome")
SESSION_NAME="tabzchrome"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  TabzChrome Dev Script                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
# Dependency Checks
# ═══════════════════════════════════════════════════════════════

MISSING_REQUIRED=()
MISSING_OPTIONAL=()

# Check Node.js (required)
if ! command -v node &> /dev/null; then
    MISSING_REQUIRED+=("node")
elif [[ $(node -v | sed 's/v\([0-9]*\).*/\1/') -lt 18 ]]; then
    echo -e "${YELLOW}⚠️  Node.js $(node -v) detected. v18+ recommended for best compatibility.${NC}"
fi

# Check npm (required)
if ! command -v npm &> /dev/null; then
    MISSING_REQUIRED+=("npm")
fi

# Check tmux (required)
if ! command -v tmux &> /dev/null; then
    MISSING_REQUIRED+=("tmux")
fi

# Check edge-tts (optional - for TTS audio features)
# Version 6.0+ required for current CLI syntax (--rate, --write-media)
if ! command -v edge-tts &> /dev/null; then
    # Check if Python is available (needed to install edge-tts)
    if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
        MISSING_OPTIONAL+=("python-for-edge-tts")
    else
        MISSING_OPTIONAL+=("edge-tts")
    fi
else
    EDGE_TTS_VERSION=$(edge-tts --version 2>&1 | sed -n 's/.*\([0-9]\+\.[0-9]\+\.[0-9]\+\).*/\1/p' | head -1)
    EDGE_TTS_MAJOR=$(echo "$EDGE_TTS_VERSION" | cut -d. -f1)
    if [ -n "$EDGE_TTS_MAJOR" ] && [ "$EDGE_TTS_MAJOR" -lt 6 ]; then
        MISSING_OPTIONAL+=("edge-tts-outdated")
    fi
fi

# Check for Nerd Font (optional - for icons in terminal)
# Skip on WSL - fonts are typically installed on Windows side and Chrome can see them
NERD_FONT_FOUND=false
if grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL detected - skip font check (Chrome uses Windows fonts)
    NERD_FONT_FOUND=true
else
    case "$(uname -s)" in
        Darwin)
            # macOS: check font directories for common Nerd/dev fonts
            if ls ~/Library/Fonts/*[Nn]erd* /Library/Fonts/*[Nn]erd* 2>/dev/null | grep -q . || \
               ls ~/Library/Fonts/*[Jj]et[Bb]rains* /Library/Fonts/*[Jj]et[Bb]rains* 2>/dev/null | grep -q . || \
               ls ~/Library/Fonts/*[Ff]ira[Cc]ode* /Library/Fonts/*[Ff]ira[Cc]ode* 2>/dev/null | grep -q .; then
                NERD_FONT_FOUND=true
            fi
            ;;
        Linux)
            # Linux: use fontconfig
            if command -v fc-list &> /dev/null; then
                if fc-list : family | grep -qi "nerd\|powerline\|firacode\|jetbrains\|hack\|meslo"; then
                    NERD_FONT_FOUND=true
                fi
            else
                # No fc-list, skip font check
                NERD_FONT_FOUND=true
            fi
            ;;
        *)
            # Unknown OS, skip font check
            NERD_FONT_FOUND=true
            ;;
    esac
fi
if [ "$NERD_FONT_FOUND" = false ]; then
    MISSING_OPTIONAL+=("nerd-font")
fi

# Report missing required dependencies
if [ ${#MISSING_REQUIRED[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required dependencies: ${MISSING_REQUIRED[*]}${NC}"
    echo ""

    # Check if Homebrew is available on macOS
    HAS_BREW=false
    if command -v brew &> /dev/null; then
        HAS_BREW=true
    fi

    for dep in "${MISSING_REQUIRED[@]}"; do
        case "$dep" in
            node|npm)
                echo -e "${YELLOW}📦 Install Node.js (includes npm):${NC}"
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "   ${BLUE}brew install node${NC}"
                        else
                            echo -e "   ${NC}Download installer: ${BLUE}https://nodejs.org/${NC}"
                        fi
                        ;;
                    Linux)
                        echo -e "   ${BLUE}curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -${NC}"
                        echo -e "   ${BLUE}sudo apt install -y nodejs${NC}"
                        echo -e "   ${NC}or visit: https://nodejs.org/"
                        ;;
                    *)
                        echo -e "   ${NC}Visit: https://nodejs.org/"
                        ;;
                esac
                ;;
            tmux)
                echo -e "${YELLOW}📦 Install tmux:${NC}"
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "   ${BLUE}brew install tmux${NC}"
                        else
                            echo -e "   ${NC}Install Homebrew first: ${BLUE}https://brew.sh${NC}"
                            echo -e "   ${NC}Then run: ${BLUE}brew install tmux${NC}"
                        fi
                        ;;
                    Linux)
                        if command -v apt &> /dev/null; then
                            echo -e "   ${BLUE}sudo apt install tmux${NC}"
                        elif command -v dnf &> /dev/null; then
                            echo -e "   ${BLUE}sudo dnf install tmux${NC}"
                        elif command -v pacman &> /dev/null; then
                            echo -e "   ${BLUE}sudo pacman -S tmux${NC}"
                        else
                            echo -e "   ${NC}Install tmux using your package manager"
                        fi
                        ;;
                    *)
                        echo -e "   ${NC}Install tmux using your package manager"
                        ;;
                esac
                ;;
        esac
        echo ""
    done
    exit 1
fi

# Report missing optional dependencies
if [ ${#MISSING_OPTIONAL[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Optional dependencies not found: ${MISSING_OPTIONAL[*]}${NC}"

    # Check if Homebrew is available on macOS (for optional deps too)
    HAS_BREW=false
    if command -v brew &> /dev/null; then
        HAS_BREW=true
    fi

    for dep in "${MISSING_OPTIONAL[@]}"; do
        case "$dep" in
            edge-tts)
                echo -e "   ${NC}• TTS audio features will be unavailable."
                echo -e "     Install with: ${BLUE}pip install edge-tts${NC}"
                ;;
            python-for-edge-tts)
                echo -e "   ${NC}• TTS audio features will be unavailable (Python not found)."
                echo -e "     Install Python first, then: ${BLUE}pip install edge-tts${NC}"
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "     Python: ${BLUE}brew install python${NC}"
                        else
                            echo -e "     Python: ${BLUE}https://www.python.org/downloads/${NC}"
                        fi
                        ;;
                    Linux)
                        echo -e "     Python: ${BLUE}sudo apt install python3 python3-pip${NC}"
                        ;;
                esac
                ;;
            edge-tts-outdated)
                echo -e "   ${NC}• edge-tts v${EDGE_TTS_VERSION} is outdated (v6.0+ required)."
                echo -e "     Upgrade with: ${BLUE}pip install --upgrade edge-tts${NC}"
                ;;
            nerd-font)
                echo -e "   ${NC}• Terminal icons may not display correctly."
                echo -e "     Download: ${BLUE}https://www.nerdfonts.com/font-downloads${NC}"
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "     Or: ${BLUE}brew install --cask font-jetbrains-mono-nerd-font${NC}"
                        fi
                        ;;
                    Linux)
                        echo -e "     Or: ${BLUE}sudo apt install fonts-jetbrains-mono${NC} (Ubuntu 22.04+)"
                        ;;
                esac
                ;;
        esac
    done
    echo ""
fi

echo -e "${GREEN}✓ Dependencies OK${NC}"
echo ""

# Quick update check (non-blocking, 2s timeout)
CURRENT_VERSION=$(grep '"version"' "$SCRIPT_DIR/../package.json" | sed 's/.*"version": "\([^"]*\)".*/\1/')
LATEST_RELEASE=$(curl -s --max-time 2 https://api.github.com/repos/GGPrompts/TabzChrome/releases/latest 2>/dev/null | grep '"tag_name"' | sed 's/.*"tag_name": "v\?\([^"]*\)".*/\1/')

# Compare versions (returns 0 if $1 > $2, 1 otherwise)
version_gt() {
    # Sort versions and check if first arg comes after second
    [ "$(printf '%s\n%s' "$1" "$2" | sort -V | tail -n1)" = "$1" ] && [ "$1" != "$2" ]
}

if [ -n "$LATEST_RELEASE" ] && version_gt "$LATEST_RELEASE" "$CURRENT_VERSION"; then
    echo -e "${YELLOW}╭─────────────────────────────────────────────────────╮${NC}"
    echo -e "${YELLOW}│  🆕 Update available: v${CURRENT_VERSION} → v${LATEST_RELEASE}${NC}"
    echo -e "${YELLOW}│  ${NC}Run: ${BLUE}git pull${NC} to update"
    echo -e "${YELLOW}│  ${NC}See: ${BLUE}https://github.com/GGPrompts/TabzChrome/releases${NC}"
    echo -e "${YELLOW}╰─────────────────────────────────────────────────────╯${NC}"
    echo ""
elif [ -n "$LATEST_RELEASE" ]; then
    echo -e "${GREEN}✓ TabzChrome v${CURRENT_VERSION} (latest)${NC}"
    echo ""
fi

# Interactive configuration
echo -e "${YELLOW}📋 Configuration:${NC}"
echo ""

# Ask about logs window
read -p "$(echo -e ${BLUE}Enable live logs window? ${NC}${YELLOW}[y/N]${NC}: )" ENABLE_LOGS
ENABLE_LOGS=${ENABLE_LOGS:-n}

# Ask about log level (consola levels)
echo ""
echo -e "${BLUE}Select log level:${NC}"
echo -e "  ${YELLOW}0${NC} - Silent (no logs)"
echo -e "  ${YELLOW}1${NC} - Errors only"
echo -e "  ${YELLOW}2${NC} - Warnings and errors"
echo -e "  ${YELLOW}3${NC} - Info (default, recommended)"
echo -e "  ${YELLOW}4${NC} - Debug (verbose)"
echo -e "  ${YELLOW}5${NC} - Trace (very verbose)"
echo ""
read -p "$(echo -e ${BLUE}Log level ${NC}${YELLOW}[0-5, default: 3]${NC}: )" LOG_LEVEL
LOG_LEVEL=${LOG_LEVEL:-3}

# Validate log level
if ! [[ "$LOG_LEVEL" =~ ^[0-5]$ ]]; then
  echo -e "${YELLOW}⚠️  Invalid log level, using 3 (info)${NC}"
  LOG_LEVEL=3
fi

# Write .env file with selected log level
cat > "$BACKEND_DIR/.env" << EOF
# TabzChrome Backend Configuration
# Generated by scripts/dev.sh

# Logging Configuration (consola levels)
# 0=silent, 1=error, 2=warn, 3=info, 4=debug, 5=trace
LOG_LEVEL=$LOG_LEVEL
EOF

echo ""
echo -e "${GREEN}✓ Configuration saved${NC}"
echo ""

# Tmux config optimized for xterm.js (used by TabzChrome extension)
TMUX_CONFIG="$SCRIPT_DIR/../.tmux-terminal-tabs.conf"

# Check if we're running inside the session we're about to kill
CURRENT_SESSION=$(tmux display-message -p '#S' 2>/dev/null || echo "")
if [ "$CURRENT_SESSION" = "$SESSION_NAME" ]; then
    echo -e "${RED}❌ You're running this from inside the $SESSION_NAME tmux session!${NC}"
    echo -e "${YELLOW}   Run from a different terminal or detach first (Ctrl+B, D)${NC}"
    exit 1
fi

# Kill existing session if it exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Existing tmux session found. Killing it...${NC}"
    tmux kill-session -t $SESSION_NAME
fi

# Kill any process using port 8129 (in case backend was started manually)
PORT_PID=$(lsof -t -i:8129 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
    echo -e "${YELLOW}⚠️  Port 8129 in use (PID: $PORT_PID). Killing process...${NC}"
    kill $PORT_PID 2>/dev/null
    sleep 1
    # Force kill if still running
    if kill -0 $PORT_PID 2>/dev/null; then
        kill -9 $PORT_PID 2>/dev/null
    fi
fi

# Check if backend dependencies are installed
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
    cd "$BACKEND_DIR"
    npm install
fi

echo -e "${GREEN}🚀 Creating tmux session: $SESSION_NAME${NC}"
echo ""

# Create new tmux session with backend in first window
# Uses xterm.js-optimized config so TabzChrome terminals get consistent settings
tmux -f "$TMUX_CONFIG" new-session -d -s $SESSION_NAME -n backend -c "$BACKEND_DIR"

# Ensure config is applied even if tmux server was already running
# (tmux -f only applies on server startup, not when joining existing server)
tmux source-file "$TMUX_CONFIG"

tmux send-keys -t $SESSION_NAME:backend "npm start" C-m

# Create logs window if enabled
if [[ "$ENABLE_LOGS" =~ ^[Yy]$ ]]; then
  BROWSER_LOG="$BACKEND_DIR/logs/browser.log"
  # Ensure log file exists
  mkdir -p "$(dirname "$BROWSER_LOG")"
  touch "$BROWSER_LOG"

  tmux new-window -t $SESSION_NAME -n logs -c "$SCRIPT_DIR"
  tmux send-keys -t $SESSION_NAME:logs "echo -e '${GREEN}Browser Console Logs${NC} - tail -f $BROWSER_LOG'; echo '(Reload extension to start seeing logs)'; echo ''; tail -f $BROWSER_LOG" C-m
fi

# Select the backend window
tmux select-window -t $SESSION_NAME:backend

echo -e "${GREEN}✅ TabzChrome backend started in tmux session!${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Tmux Commands:${NC}"
echo -e "  Attach:  ${YELLOW}tmux attach -t $SESSION_NAME${NC}"
echo -e "  Detach:  ${YELLOW}Ctrl+B, then D${NC}"
if [[ "$ENABLE_LOGS" =~ ^[Yy]$ ]]; then
  echo -e "  Windows: ${YELLOW}Ctrl+B, then 0/1${NC} (backend/logs)"
else
  echo -e "  Windows: ${YELLOW}Ctrl+B, then 0${NC} (backend)"
fi
echo -e "  Kill:    ${YELLOW}tmux kill-session -t $SESSION_NAME${NC}"
echo ""
echo -e "${BLUE}URLs:${NC}"
echo -e "  Backend:  ${YELLOW}http://localhost:8129${NC}"
echo ""
echo -e "${BLUE}Log Level: ${YELLOW}$LOG_LEVEL${NC} ${NC}(0=silent, 1=error, 2=warn, 3=info, 4=debug, 5=trace)"
if [[ "$ENABLE_LOGS" =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}Browser Logs: ${GREEN}Enabled${NC} (window 1)"
else
  echo -e "${BLUE}Browser Logs: ${YELLOW}Disabled${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Claude can capture logs:${NC}"
echo -e "  Backend:  ${YELLOW}tmux capture-pane -t $SESSION_NAME:backend -p -S -50${NC}"
echo -e "  Browser:  ${YELLOW}tail -50 $BACKEND_DIR/logs/browser.log${NC}"
echo ""
echo -e "${YELLOW}Attaching to tmux session...${NC}"
echo ""

# Attach to the session
tmux attach -t $SESSION_NAME
