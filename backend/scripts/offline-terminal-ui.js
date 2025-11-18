#!/usr/bin/env node

/**
 * Offline Terminal UI Script
 * Shows an interactive menu for resuming offline terminals
 */

const readline = require('readline');
const { execSync } = require('child_process');

class OfflineTerminalUI {
  constructor(terminalInfo) {
    this.info = terminalInfo;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Enable raw mode for single keypress handling
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  // Terminal type configurations
  getTypeConfig() {
    const configs = {
      'claude-code': {
        icon: '🤖',
        name: 'Claude Code',
        color: '\x1b[33m', // Yellow
        options: [
          { key: 'Enter', label: 'Resume session', action: 'resume' },
          { key: 'N', label: 'Start new session', action: 'new' },
          { key: 'D', label: 'Change directory', action: 'directory' },
          { key: 'X', label: 'Close terminal', action: 'close' }
        ]
      },
      'opencode': {
        icon: '🟣',
        name: 'OpenCode',
        color: '\x1b[35m', // Magenta
        options: [
          { key: 'Enter', label: 'Resume session', action: 'resume' },
          { key: 'N', label: 'Start new session', action: 'new' },
          { key: 'D', label: 'Change directory', action: 'directory' },
          { key: 'X', label: 'Close terminal', action: 'close' }
        ]
      },
      'bash': {
        icon: '>_',
        name: 'Bash Terminal',
        color: '\x1b[32m', // Green
        options: [
          { key: 'Enter', label: 'Start shell', action: 'start' },
          { key: 'D', label: 'Change directory', action: 'directory' },
          { key: 'C', label: 'Run command', action: 'command' },
          { key: 'X', label: 'Close terminal', action: 'close' }
        ]
      },
      'tui-tool': {
        icon: '🛠️',
        name: this.info.toolName || 'TUI Tool',
        color: '\x1b[36m', // Cyan
        options: [
          { key: 'Enter', label: `Launch ${this.info.toolName || 'tool'}`, action: 'launch' },
          { key: 'H', label: 'View hotkeys', action: 'hotkeys' },
          { key: 'D', label: 'View documentation', action: 'docs' },
          { key: 'X', label: 'Close terminal', action: 'close' }
        ]
      }
    };

    return configs[this.info.terminalType] || configs.bash;
  }

  // Draw the UI
  draw() {
    const config = this.getTypeConfig();
    const reset = '\x1b[0m';

    // Clear screen
    console.clear();

    // Draw box
    console.log('╭' + '─'.repeat(45) + '╮');
    console.log(`│  ${config.icon} ${config.color}${config.name} - Offline${reset}`.padEnd(54) + '│');
    console.log('├' + '─'.repeat(45) + '┤');
    console.log('│' + ' '.repeat(45) + '│');

    // Show terminal info
    if (this.info.lastActiveAt) {
      const timeAgo = this.getTimeAgo(this.info.lastActiveAt);
      console.log(`│  Last active: ${timeAgo}`.padEnd(46) + '│');
    }

    if (this.info.workingDir) {
      const dir = this.info.workingDir.replace('/home/matt', '~');
      console.log(`│  Working dir: ${dir}`.padEnd(46) + '│');
    }

    console.log('│' + ' '.repeat(45) + '│');

    // Show options
    config.options.forEach(option => {
      const keyDisplay = option.key === 'Enter' ? '[Enter]' : `[${option.key}]`;
      console.log(`│  ${config.color}${keyDisplay.padEnd(9)}${reset} ${option.label}`.padEnd(54) + '│');
    });

    console.log('│' + ' '.repeat(45) + '│');
    console.log('╰' + '─'.repeat(45) + '╯');
    console.log('\nPress a key to select an option...');
  }

  getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  }

  // Handle key press
  async handleKeyPress(key) {
    const config = this.getTypeConfig();

    // Handle Enter key
    if (key === '\r' || key === '\n') {
      const enterOption = config.options.find(o => o.key === 'Enter');
      if (enterOption) {
        await this.executeAction(enterOption.action);
      }
      return;
    }

    // Handle other keys
    const upperKey = key.toUpperCase();
    const option = config.options.find(o => o.key === upperKey);

    if (option) {
      await this.executeAction(option.action);
    }
  }

  // Execute the selected action
  async executeAction(action) {
    console.log(`\nExecuting: ${action}...`);

    // Send message to backend via WebSocket or API
    const message = {
      type: 'resume-terminal',
      terminalId: this.info.id,
      action: action,
      terminalType: this.info.terminalType,
      workingDir: this.info.workingDir
    };

    // For now, just log what would happen
    console.log('Would send:', JSON.stringify(message, null, 2));

    // In production, this would communicate with the backend
    // to actually spawn the terminal

    setTimeout(() => {
      this.cleanup();
      process.exit(0);
    }, 2000);
  }

  cleanup() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    this.rl.close();
  }

  start() {
    this.draw();

    process.stdin.on('data', async (key) => {
      const char = key.toString();

      // Handle Ctrl+C
      if (char === '\x03') {
        this.cleanup();
        process.exit(0);
      }

      await this.handleKeyPress(char);
    });
  }
}

// Get terminal info from command line args or environment
const terminalInfo = {
  id: process.env.TERMINAL_ID || 'test-terminal',
  terminalType: process.env.TERMINAL_TYPE || 'bash',
  workingDir: process.env.WORKING_DIR || process.cwd(),
  lastActiveAt: Date.now() - 120000, // 2 minutes ago for testing
  toolName: process.env.TOOL_NAME || null
};

// Parse command line args
const args = process.argv.slice(2);
if (args[0]) terminalInfo.terminalType = args[0];
if (args[1]) terminalInfo.workingDir = args[1];
if (args[2]) terminalInfo.toolName = args[2];

// Create and start the UI
const ui = new OfflineTerminalUI(terminalInfo);
ui.start();