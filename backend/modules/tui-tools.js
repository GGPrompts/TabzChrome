const pty = require('node-pty');
const os = require('os');

class TUIToolsManager {
  constructor(terminalRegistry) {
    this.terminalRegistry = terminalRegistry;
    this.tools = {
      lazygit: {
        command: 'lazygit',
        name: 'LazyGit',
        description: 'Terminal UI for git commands',
        icon: '🔀',
        color: '#f1502f',
        checkCommand: 'which lazygit',
        installCommand: 'snap install lazygit',
        fallback: 'git status'
      },
      bottom: {
        command: 'bottom',
        name: 'Bottom',
        description: 'Cross-platform graphical process/system monitor',
        icon: '📊',
        color: '#00ff00',
        checkCommand: 'which bottom || which btm',
        installCommand: 'snap install bottom || cargo install bottom',
        fallback: 'top'
      },
      htop: {
        command: 'htop',
        name: 'htop',
        description: 'Interactive process viewer',
        icon: '📈',
        color: '#00ff00',
        checkCommand: 'which htop',
        installCommand: 'apt-get install htop || brew install htop',
        fallback: 'top'
      },
      micro: {
        command: 'micro',
        name: 'Micro',
        description: 'Modern terminal text editor',
        icon: '📝',
        color: '#ff6b35',
        checkCommand: 'which micro',
        installCommand: 'curl https://getmic.ro | bash',
        fallback: 'nano'
      },
      lnav: {
        command: 'lnav',
        name: 'lnav',
        description: 'Log file navigator',
        icon: '📜',
        color: '#ffd700',
        checkCommand: 'which lnav',
        installCommand: 'apt-get install lnav || brew install lnav',
        fallback: 'tail -f'
      },
      aichat: {
        command: 'aichat',
        name: 'AIChat',
        description: 'All-in-one CLI for LLMs',
        icon: '🤖',
        color: '#9333ea',
        checkCommand: 'which aichat',
        installCommand: 'cargo install aichat',
        fallback: null
      },
      calcure: {
        command: 'calcure',
        name: 'Calcure',
        description: 'Modern TUI calendar and task manager with customizable UI',
        icon: '📅',
        color: '#3b82f6',
        checkCommand: 'which calcure',
        installCommand: 'pip3 install calcure',
        fallback: 'cal'
      },
      taskwarrior: {
        command: 'taskwarrior-tui',
        name: 'Taskwarrior TUI',
        description: 'Terminal task management',
        icon: '✅',
        color: '#10b981',
        checkCommand: 'which taskwarrior-tui',
        installCommand: 'cargo install taskwarrior-tui',
        fallback: 'task list'
      }
    };
  }

  async checkToolAvailable(toolName) {
    const tool = this.tools[toolName];
    if (!tool) return false;

    return new Promise((resolve) => {
      const checkProcess = pty.spawn('bash', ['-c', tool.checkCommand], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env
      });

      checkProcess.on('exit', (code) => {
        resolve(code === 0);
      });
    });
  }

  async spawnTUITool(toolName, workingDir = process.env.HOME) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Unknown TUI tool: ${toolName}`);
    }

    // Check if tool is available
    const isAvailable = await this.checkToolAvailable(toolName);
    
    // Use fallback command if tool is not available and fallback exists
    const commandToRun = isAvailable ? tool.command : (tool.fallback || tool.command);
    
    const terminalId = `tui-${toolName}-${Date.now()}`;
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    
    try {
      const ptyProcess = pty.spawn(commandToRun, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        }
      });

      // Register with terminal registry
      const terminalData = {
        id: terminalId,
        pid: ptyProcess.pid,
        name: tool.name,
        terminalType: 'tui-tool',
        toolName: toolName,
        icon: tool.icon,
        color: tool.color,
        description: tool.description,
        workingDir,
        isAvailable,
        usedFallback: !isAvailable && tool.fallback,
        ptyProcess
      };

      this.terminalRegistry.register(terminalId, terminalData);

      // If tool is not available, send installation instructions
      if (!isAvailable) {
        const message = tool.fallback 
          ? `\r\n⚠️  ${tool.name} not found. Using fallback: ${tool.fallback}\r\n`
          : `\r\n⚠️  ${tool.name} not found. Install with: ${tool.installCommand}\r\n`;
        
        setTimeout(() => {
          ptyProcess.write(message);
        }, 100);
      }

      return terminalData;
    } catch (error) {
      console.error(`Failed to spawn TUI tool ${toolName}:`, error);
      throw error;
    }
  }

  getAvailableTools() {
    return Object.entries(this.tools).map(([key, tool]) => ({
      key,
      ...tool
    }));
  }

  async getInstalledTools() {
    const tools = [];
    for (const [key, tool] of Object.entries(this.tools)) {
      const isInstalled = await this.checkToolAvailable(key);
      tools.push({
        key,
        ...tool,
        isInstalled
      });
    }
    return tools;
  }
}

module.exports = TUIToolsManager;