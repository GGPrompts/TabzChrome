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

# Check lnav (optional - for log filtering in logs window)
if ! command -v lnav &> /dev/null; then
    MISSING_OPTIONAL+=("lnav")
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
                echo -e "     Install with: ${BLUE}pipx install edge-tts${NC}"
                if ! command -v pipx &> /dev/null; then
                    case "$(uname -s)" in
                        Darwin)
                            echo -e "     (First install pipx: ${BLUE}brew install pipx && pipx ensurepath${NC})"
                            ;;
                        Linux)
                            echo -e "     (First install pipx: ${BLUE}sudo apt install pipx && pipx ensurepath${NC})"
                            ;;
                    esac
                fi
                ;;
            python-for-edge-tts)
                echo -e "   ${NC}• TTS audio features will be unavailable (Python not found)."
                echo -e "     Install Python and pipx first, then: ${BLUE}pipx install edge-tts${NC}"
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "     ${BLUE}brew install python pipx && pipx ensurepath${NC}"
                        else
                            echo -e "     Python: ${BLUE}https://www.python.org/downloads/${NC}"
                        fi
                        ;;
                    Linux)
                        echo -e "     ${BLUE}sudo apt install python3 pipx && pipx ensurepath${NC}"
                        ;;
                esac
                ;;
            edge-tts-outdated)
                echo -e "   ${NC}• edge-tts v${EDGE_TTS_VERSION} is outdated (v6.0+ required)."
                echo -e "     Upgrade with: ${BLUE}pipx upgrade edge-tts${NC}"
                echo -e "     (If installed via pip, first: ${BLUE}pip uninstall edge-tts && pipx install edge-tts${NC})"
                ;;
            lnav)
                echo -e "   ${NC}• Log filtering unavailable (will use tail -f instead)."
                case "$(uname -s)" in
                    Darwin)
                        if [ "$HAS_BREW" = true ]; then
                            echo -e "     Install: ${BLUE}brew install lnav${NC}"
                        else
                            echo -e "     Install: ${BLUE}https://lnav.org/downloads${NC}"
                        fi
                        ;;
                    Linux)
                        echo -e "     Install: ${BLUE}sudo apt install lnav${NC}"
                        ;;
                esac
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

# ═══════════════════════════════════════════════════════════════
# Claude Code StatusLine Check (for context % on tabs)
# ═══════════════════════════════════════════════════════════════

STATUSLINE_CONFIGURED=false
if [ -f "$HOME/.claude/settings.json" ]; then
    # Check if statusLine is configured to use our context-aware script
    STATUSLINE_CMD=$(jq -r '.statusLine.command // ""' "$HOME/.claude/settings.json" 2>/dev/null)
    if [[ "$STATUSLINE_CMD" == *"statusline-script.sh"* ]] || [[ "$STATUSLINE_CMD" == *"statusline-with-context"* ]]; then
        STATUSLINE_CONFIGURED=true
    fi
fi

if [ "$STATUSLINE_CONFIGURED" = false ]; then
    echo -e "${YELLOW}╭─────────────────────────────────────────────────────╮${NC}"
    echo -e "${YELLOW}│  💡 Context % on tabs not configured                │${NC}"
    echo -e "${YELLOW}╰─────────────────────────────────────────────────────╯${NC}"
    echo -e "   TabzChrome can show context window usage on Claude tabs."
    echo -e "   Run: ${BLUE}./plugins/state-tracker/setup.sh${NC}"
    echo ""
fi

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
    echo -e "${YELLOW}╰─────────────────────────────────────────────────────╯${NC}"
    echo ""
    read -p "$(echo -e ${BLUE}Update now? ${NC}${YELLOW}[y/N]${NC}: )" DO_UPDATE
    if [[ "$DO_UPDATE" =~ ^[Yy]$ ]]; then
        echo ""
        cd "$SCRIPT_DIR/.."

        # Check for local changes before pulling
        STASH_NEEDED=false
        DROP_STASH=false
        if ! git diff --quiet || ! git diff --cached --quiet; then
            echo -e "${YELLOW}📦 Local changes detected:${NC}"
            echo ""
            git status --short
            echo ""
            git diff --stat
            echo ""
            read -p "$(echo -e ${BLUE}Drop these changes after update? ${NC}${YELLOW}[y/N]${NC}: )" DROP_CHOICE
            if [[ "$DROP_CHOICE" =~ ^[Yy]$ ]]; then
                DROP_STASH=true
            fi
            echo -e "${BLUE}Stashing changes for update...${NC}"
            git stash push -m "dev.sh auto-stash before update" --include-untracked
            STASH_NEEDED=true
        fi

        echo -e "${BLUE}📥 Pulling latest changes...${NC}"
        git pull origin main

        echo ""
        echo -e "${BLUE}📦 Installing dependencies...${NC}"
        npm install

        echo ""
        echo -e "${BLUE}🔨 Building extension...${NC}"
        npm run build

        # Copy to Windows if WSL
        if grep -qi microsoft /proc/version 2>/dev/null; then
            WIN_DEST="${TABZ_WIN_PATH:-/mnt/c/Users/$(ls /mnt/c/Users/ 2>/dev/null | grep -vE '^(Default|Default User|Public|All Users|WsiAccount|desktop.ini)$' | head -1)/Desktop/TabzChrome/dist-extension/}"
            if [ -d "$(dirname "$WIN_DEST")" ]; then
                echo ""
                echo -e "${BLUE}📋 Copying to Windows...${NC}"
                rsync -av --delete dist-extension/ "$WIN_DEST"
                echo ""
                echo -e "${GREEN}✅ Extension updated! Reload at chrome://extensions${NC}"
            fi
        else
            echo ""
            echo -e "${GREEN}✅ Extension updated! Load dist-extension/ in Chrome${NC}"
        fi

        # Update version after update
        CURRENT_VERSION=$(grep '"version"' "$SCRIPT_DIR/../package.json" | sed 's/.*"version": "\([^"]*\)".*/\1/')

        # Handle stashed changes based on user choice
        if [ "$STASH_NEEDED" = true ]; then
            if [ "$DROP_STASH" = true ]; then
                echo -e "${YELLOW}🗑️  Dropping stashed changes (as requested)${NC}"
                git stash drop 2>/dev/null || true
            else
                echo -e "${BLUE}📦 Restoring stashed changes...${NC}"
                if git stash pop 2>/dev/null; then
                    echo -e "${GREEN}✓ Stashed changes restored${NC}"
                else
                    echo -e "${YELLOW}⚠️  Could not auto-restore stash (conflicts). Your changes are in: git stash list${NC}"
                    echo -e "   Run ${BLUE}git stash pop${NC} manually to restore, or ${BLUE}git stash drop${NC} to discard."
                fi
            fi
        fi
        echo ""
    fi

    # Check for plugin updates
    PLUGIN_MARKETPLACE="$HOME/.claude/plugins/marketplaces/tabz-chrome"
    if [ -d "$PLUGIN_MARKETPLACE" ]; then
        echo -e "${YELLOW}💡 TabzChrome plugins detected${NC}"
        echo -e "   Run ${BLUE}/plugin update${NC} in Claude Code to sync plugins"
        echo ""
    fi
elif [ -n "$LATEST_RELEASE" ]; then
    echo -e "${GREEN}✓ TabzChrome v${CURRENT_VERSION} (latest)${NC}"

    # Still check for plugin updates even if main repo is current
    PLUGIN_MARKETPLACE="$HOME/.claude/plugins/marketplaces/tabz-chrome"
    if [ -d "$PLUGIN_MARKETPLACE" ]; then
        # Check if plugins are behind by comparing git commits
        cd "$SCRIPT_DIR/.."
        REPO_COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
        PLUGIN_COMMIT=$(cd "$PLUGIN_MARKETPLACE" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        if [ "$REPO_COMMIT" != "$PLUGIN_COMMIT" ] && [ "$PLUGIN_COMMIT" != "unknown" ]; then
            echo -e "${YELLOW}   💡 Plugins may need update (repo: ${REPO_COMMIT}, plugins: ${PLUGIN_COMMIT})${NC}"
            echo -e "      Run ${BLUE}/plugin update${NC} in Claude Code"
        fi
    fi
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

# ═══════════════════════════════════════════════════════════════
# NPM Dependency Staleness Check
# ═══════════════════════════════════════════════════════════════
# Compares package-lock.json mtime against node_modules to detect
# if dependencies are out of date after a git pull

check_deps_stale() {
    local dir="$1"
    local name="$2"

    # If node_modules doesn't exist, definitely need install
    if [ ! -d "$dir/node_modules" ]; then
        return 0  # stale
    fi

    # If package-lock.json doesn't exist, skip check
    if [ ! -f "$dir/package-lock.json" ]; then
        return 1  # not stale
    fi

    # Compare modification times: is package-lock.json newer than node_modules?
    if [ "$dir/package-lock.json" -nt "$dir/node_modules" ]; then
        return 0  # stale
    fi

    return 1  # not stale
}

NEEDS_INSTALL=()

# Check root project
if check_deps_stale "$SCRIPT_DIR/.." "root"; then
    NEEDS_INSTALL+=("root")
fi

# Check backend
if check_deps_stale "$BACKEND_DIR" "backend"; then
    NEEDS_INSTALL+=("backend")
fi

# Check tabz-mcp-server
MCP_DIR="$SCRIPT_DIR/../tabz-mcp-server"
if [ -d "$MCP_DIR" ] && check_deps_stale "$MCP_DIR" "tabz-mcp-server"; then
    NEEDS_INSTALL+=("tabz-mcp-server")
fi

# Install stale dependencies
if [ ${#NEEDS_INSTALL[@]} -gt 0 ]; then
    echo -e "${YELLOW}📦 Dependencies out of date: ${NEEDS_INSTALL[*]}${NC}"
    echo -e "   ${NC}(package-lock.json is newer than node_modules)"
    echo ""

    for location in "${NEEDS_INSTALL[@]}"; do
        case "$location" in
            root)
                echo -e "${BLUE}   Installing root dependencies...${NC}"
                cd "$SCRIPT_DIR/.."
                npm install
                ;;
            backend)
                echo -e "${BLUE}   Installing backend dependencies...${NC}"
                cd "$BACKEND_DIR"
                npm install
                ;;
            tabz-mcp-server)
                echo -e "${BLUE}   Installing MCP server dependencies...${NC}"
                cd "$MCP_DIR"
                npm install
                ;;
        esac
    done

    echo ""
    echo -e "${GREEN}✓ Dependencies updated${NC}"
    echo ""
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
  UNIFIED_LOG="$BACKEND_DIR/logs/unified.log"
  # Ensure log file exists (backend will create it, but ensure dir exists)
  mkdir -p "$(dirname "$UNIFIED_LOG")"
  touch "$UNIFIED_LOG"

  tmux new-window -t $SESSION_NAME -n logs -c "$SCRIPT_DIR"

  # Use lnav if available, otherwise fall back to tail -f
  if command -v lnav &> /dev/null; then
    tmux send-keys -t $SESSION_NAME:logs "echo -e '${GREEN}Unified Logs${NC} - lnav $UNIFIED_LOG'; echo '(Filter: :filter-in pattern | Quit: q)'; echo ''; sleep 1 && lnav $UNIFIED_LOG" C-m
  else
    tmux send-keys -t $SESSION_NAME:logs "echo -e '${GREEN}Unified Logs${NC} - tail -f $UNIFIED_LOG'; echo '(Install lnav for filtering: sudo apt install lnav)'; echo ''; tail -f $UNIFIED_LOG" C-m
  fi
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
  echo -e "${BLUE}Unified Logs: ${GREEN}Enabled${NC} (window 1)"
else
  echo -e "${BLUE}Unified Logs: ${YELLOW}Disabled${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}Claude can capture logs:${NC}"
echo -e "  All logs: ${YELLOW}tail -50 $BACKEND_DIR/logs/unified.log${NC}"
echo ""
echo -e "${YELLOW}Attaching to tmux session...${NC}"
echo ""

# Attach to the session
tmux attach -t $SESSION_NAME
