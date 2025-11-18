#!/bin/bash

# Offline Terminal Resume Script
# Shows a simple interactive menu for resuming offline terminals

TERMINAL_TYPE=${1:-bash}
WORKING_DIR=${2:-~/workspace}
TOOL_NAME=${3:-}

# Colors
RESET='\033[0m'
BOLD='\033[1m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'

# Get terminal config
get_terminal_color() {
    case $TERMINAL_TYPE in
        claude-code) echo "$YELLOW" ;;
        opencode) echo "$MAGENTA" ;;
        bash) echo "$GREEN" ;;
        tui-tool) echo "$CYAN" ;;
        codex) echo "$BLUE" ;;
        gemini) echo "$RED" ;;
        *) echo "$GREEN" ;;
    esac
}

get_terminal_icon() {
    case $TERMINAL_TYPE in
        claude-code) echo "🤖" ;;
        opencode) echo "🟣" ;;
        bash) echo ">_" ;;
        tui-tool) echo "🛠️" ;;
        codex) echo "🔮" ;;
        gemini) echo "💫" ;;
        *) echo ">_" ;;
    esac
}

get_terminal_name() {
    case $TERMINAL_TYPE in
        claude-code) echo "Claude Code" ;;
        opencode) echo "OpenCode" ;;
        bash) echo "Bash Terminal" ;;
        tui-tool) echo "${TOOL_NAME:-TUI Tool}" ;;
        codex) echo "Codex" ;;
        gemini) echo "Gemini" ;;
        *) echo "Terminal" ;;
    esac
}

# Clear screen and draw UI
draw_ui() {
    clear

    local COLOR=$(get_terminal_color)
    local ICON=$(get_terminal_icon)
    local NAME=$(get_terminal_name)

    echo
    echo -e "${BOLD}${COLOR}  $ICON $NAME - Offline${RESET}"
    echo -e "  ────────────────────────────────────"
    echo
    echo -e "  Working directory: ${CYAN}$WORKING_DIR${RESET}"
    echo

    case $TERMINAL_TYPE in
        claude-code|opencode|codex|gemini)
            echo -e "  ${BOLD}[Enter]${RESET} Resume session"
            echo -e "  ${BOLD}[N]${RESET}     Start new session"
            echo -e "  ${BOLD}[D]${RESET}     Change directory"
            echo -e "  ${BOLD}[X]${RESET}     Exit"
            ;;
        bash)
            echo -e "  ${BOLD}[Enter]${RESET} Start shell"
            echo -e "  ${BOLD}[D]${RESET}     Change directory"
            echo -e "  ${BOLD}[C]${RESET}     Run command"
            echo -e "  ${BOLD}[X]${RESET}     Exit"
            ;;
        tui-tool)
            echo -e "  ${BOLD}[Enter]${RESET} Launch $TOOL_NAME"
            echo -e "  ${BOLD}[H]${RESET}     View hotkeys"
            echo -e "  ${BOLD}[D]${RESET}     View documentation"
            echo -e "  ${BOLD}[X]${RESET}     Exit"
            ;;
        *)
            echo -e "  ${BOLD}[Enter]${RESET} Start"
            echo -e "  ${BOLD}[X]${RESET}     Exit"
            ;;
    esac

    echo
    echo -e "  ${COLOR}Select an option...${RESET}"
    echo
}

# Send resume message to backend
send_resume_message() {
    local ACTION=$1
    echo -e "\n${GREEN}Resuming terminal with action: $ACTION...${RESET}"

    # In production, this would send a WebSocket message or HTTP request
    # For now, we'll just simulate it
    echo "Would execute: $ACTION for $TERMINAL_TYPE in $WORKING_DIR"

    # Start the appropriate terminal
    case $ACTION in
        resume|new|start)
            case $TERMINAL_TYPE in
                claude-code)
                    echo "Starting Claude Code..."
                    # claude --project "$WORKING_DIR"
                    ;;
                opencode)
                    echo "Starting OpenCode..."
                    # opencode "$WORKING_DIR"
                    ;;
                bash)
                    echo "Starting bash shell..."
                    cd "$WORKING_DIR" && bash
                    ;;
                *)
                    echo "Starting terminal..."
                    cd "$WORKING_DIR" && bash
                    ;;
            esac
            ;;
        launch)
            echo "Launching $TOOL_NAME..."
            cd "$WORKING_DIR" && $TOOL_NAME
            ;;
        directory)
            echo "Change directory feature coming soon..."
            sleep 2
            draw_ui
            ;;
        command)
            read -p "Enter command to run: " cmd
            cd "$WORKING_DIR" && $cmd
            ;;
        hotkeys|docs)
            echo "Documentation feature coming soon..."
            sleep 2
            draw_ui
            ;;
        exit)
            exit 0
            ;;
    esac
}

# Main loop
main() {
    draw_ui

    while true; do
        read -rsn1 key

        case $key in
            ""|" ")  # Enter key
                case $TERMINAL_TYPE in
                    claude-code|opencode|codex|gemini)
                        send_resume_message "resume"
                        ;;
                    bash)
                        send_resume_message "start"
                        ;;
                    tui-tool)
                        send_resume_message "launch"
                        ;;
                esac
                break
                ;;
            n|N)
                if [[ $TERMINAL_TYPE =~ ^(claude-code|opencode|codex|gemini)$ ]]; then
                    send_resume_message "new"
                    break
                fi
                ;;
            d|D)
                send_resume_message "directory"
                ;;
            c|C)
                if [[ $TERMINAL_TYPE == "bash" ]]; then
                    send_resume_message "command"
                    break
                fi
                ;;
            h|H)
                if [[ $TERMINAL_TYPE == "tui-tool" ]]; then
                    send_resume_message "hotkeys"
                fi
                ;;
            x|X|q|Q)
                echo -e "\n${YELLOW}Closing...${RESET}"
                exit 0
                ;;
        esac
    done
}

# Run the main loop
main