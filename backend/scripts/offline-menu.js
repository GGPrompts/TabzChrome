#!/usr/bin/env node

/**
 * Offline Terminal Menu
 * Interactive TUI menu for resuming offline terminals
 * Uses ANSI escape codes for terminal-based UI
 */

const readline = require('readline');

class OfflineMenu {
  constructor(terminalType = 'bash', workingDir = '~/workspace') {
    this.terminalType = terminalType;
    this.workingDir = workingDir;
    this.selectedIndex = 0;
    this.running = true;

    // Terminal configurations
    this.configs = {
      'claude-code': {
        icon: '🤖',
        name: 'Claude Code',
        color: '\x1b[38;5;208m', // Orange
        borderColor: '\x1b[38;5;208m',
        options: [
          { label: 'Resume last session', action: 'resume', key: 'enter' },
          { label: 'Start new session', action: 'new', key: 'n' },
          { label: 'Change directory', action: 'directory', key: 'd' },
          { label: 'View documentation', action: 'docs', key: 'h' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      },
      'opencode': {
        icon: '🟣',
        name: 'OpenCode',
        color: '\x1b[38;5;135m', // Purple
        borderColor: '\x1b[38;5;135m',
        options: [
          { label: 'Resume last session', action: 'resume', key: 'enter' },
          { label: 'Start new session', action: 'new', key: 'n' },
          { label: 'Change directory', action: 'directory', key: 'd' },
          { label: 'View documentation', action: 'docs', key: 'h' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      },
      'bash': {
        icon: '>_',
        name: 'Bash Terminal',
        color: '\x1b[38;5;46m', // Green
        borderColor: '\x1b[38;5;46m',
        options: [
          { label: 'Start shell', action: 'start', key: 'enter' },
          { label: 'Run command', action: 'command', key: 'c' },
          { label: 'Change directory', action: 'directory', key: 'd' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      },
      'codex': {
        icon: '🔮',
        name: 'Codex',
        color: '\x1b[38;5;51m', // Cyan
        borderColor: '\x1b[38;5;51m',
        options: [
          { label: 'Resume last session', action: 'resume', key: 'enter' },
          { label: 'Start new session', action: 'new', key: 'n' },
          { label: 'Change directory', action: 'directory', key: 'd' },
          { label: 'View documentation', action: 'docs', key: 'h' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      },
      'gemini': {
        icon: '💫',
        name: 'Gemini',
        color: '\x1b[38;5;202m', // Red-orange
        borderColor: '\x1b[38;5;202m',
        options: [
          { label: 'Resume last session', action: 'resume', key: 'enter' },
          { label: 'Start new session', action: 'new', key: 'n' },
          { label: 'Change directory', action: 'directory', key: 'd' },
          { label: 'View documentation', action: 'docs', key: 'h' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      },
      'tui-tool': {
        icon: '🛠️',
        name: 'TUI Tool',
        color: '\x1b[38;5;87m', // Light cyan
        borderColor: '\x1b[38;5;87m',
        options: [
          { label: 'Launch tool', action: 'launch', key: 'enter' },
          { label: 'View hotkeys', action: 'hotkeys', key: 'h' },
          { label: 'View documentation', action: 'docs', key: 'd' },
          { label: 'Exit', action: 'exit', key: 'q' }
        ]
      }
    };

    this.config = this.configs[terminalType] || this.configs.bash;
    this.setupInput();
  }

  setupInput() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    // Hide cursor
    process.stdout.write('\x1b[?25l');

    process.stdin.on('keypress', (str, key) => {
      this.handleKeypress(str, key);
    });
  }

  handleKeypress(str, key) {
    if (!this.running) return;

    // Handle special keys
    if (key) {
      if (key.name === 'up' || key.name === 'k') {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.render();
      } else if (key.name === 'down' || key.name === 'j') {
        this.selectedIndex = Math.min(this.config.options.length - 1, this.selectedIndex + 1);
        this.render();
      } else if (key.name === 'return') {
        this.selectOption(this.selectedIndex);
      } else if (key.ctrl && key.name === 'c') {
        this.exit();
      }
    }

    // Handle regular character keys
    if (str) {
      const option = this.config.options.find(o => o.key === str.toLowerCase());
      if (option) {
        const index = this.config.options.indexOf(option);
        this.selectOption(index);
      }
    }
  }

  selectOption(index) {
    const option = this.config.options[index];
    if (option) {
      // Output the action for the backend to handle
      console.log(`\nACTION:${option.action}`);
      this.exit();
    }
  }

  render() {
    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H');

    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';

    // Draw rounded box border
    const width = 50;
    const borderChar = '─';
    const topLeft = '╭';
    const topRight = '╮';
    const bottomLeft = '╰';
    const bottomRight = '╯';
    const vertical = '│';
    const divider = '├' + borderChar.repeat(width - 2) + '┤';

    // Header
    console.log(this.config.borderColor + topLeft + borderChar.repeat(width - 2) + topRight + reset);
    console.log(this.config.borderColor + vertical + reset +
                ` ${this.config.icon} ${bold}${this.config.color}${this.config.name} - Offline${reset}`.padEnd(width + 10) +
                this.config.borderColor + vertical + reset);
    console.log(this.config.borderColor + divider + reset);
    console.log(this.config.borderColor + vertical + reset + ' '.repeat(width - 2) + this.config.borderColor + vertical + reset);

    // Menu options
    this.config.options.forEach((option, index) => {
      const isSelected = index === this.selectedIndex;
      const indicator = isSelected ? '▸' : ' ';
      const textColor = isSelected ? this.config.color + bold : dim;

      const optionText = `  ${indicator} ${option.label}`;
      console.log(this.config.borderColor + vertical + reset +
                  textColor + optionText.padEnd(width - 2) + reset +
                  this.config.borderColor + vertical + reset);
    });

    console.log(this.config.borderColor + vertical + reset + ' '.repeat(width - 2) + this.config.borderColor + vertical + reset);

    // Working directory
    const dirDisplay = ` 📁 ${this.workingDir}`;
    console.log(this.config.borderColor + vertical + reset +
                dim + dirDisplay.padEnd(width - 2) + reset +
                this.config.borderColor + vertical + reset);

    console.log(this.config.borderColor + vertical + reset + ' '.repeat(width - 2) + this.config.borderColor + vertical + reset);

    // Help text
    const helpText = ' ↑/↓ Navigate • Enter Select • q Quit';
    console.log(this.config.borderColor + vertical + reset +
                dim + helpText.padEnd(width - 2) + reset +
                this.config.borderColor + vertical + reset);

    // Bottom border
    console.log(this.config.borderColor + bottomLeft + borderChar.repeat(width - 2) + bottomRight + reset);
  }

  exit() {
    this.running = false;
    // Show cursor
    process.stdout.write('\x1b[?25h');
    // Clear screen
    process.stdout.write('\x1b[2J\x1b[H');

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    process.exit(0);
  }

  start() {
    this.render();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const terminalType = args[0] || process.env.TERMINAL_TYPE || 'bash';
const workingDir = args[1] || process.env.WORKING_DIR || '~/workspace';

// Create and start the menu
const menu = new OfflineMenu(terminalType, workingDir);
menu.start();