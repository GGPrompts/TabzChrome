/**
 * PTY Handler - Simplified PTY management for Tabz
 * 
 * Simplified from Claude Orchestrator v2's complex PTY architecture
 * - Direct node-pty integration without layers of abstraction
 * - No tmux complexity
 * - Clear process lifecycle management
 * - Integration with terminal-registry.js as single source of truth
 */

const pty = require('node-pty');
const { execSync } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const os = require('os');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('PTY');

/**
 * Expand tilde (~) in file paths to actual home directory
 */
function expandTilde(filepath) {
  if (!filepath || typeof filepath !== 'string') {
    return filepath;
  }

  // Expand ~ or ~/something
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace(/^~/, os.homedir());
  }

  return filepath;
}

class PTYHandler extends EventEmitter {
  constructor() {
    super();

    // Standard terminal settings
    this.defaultCols = 80;
    this.defaultRows = 30;
    this.termType = 'xterm-256color';

    // Track active PTY processes - terminalId -> ptyInfo
    this.processes = new Map();

    // Track disconnected processes with grace period - terminalId -> timeout
    this.disconnectedProcesses = new Map();
    this.gracePeriodMs = 30000; // 30 seconds grace period

    // Tmux config file path (relative to backend)
    this.tmuxConfigPath = path.join(__dirname, '../../.tmux-terminal-tabs.conf');
  }

  /**
   * Check if a tmux session exists
   */
  tmuxSessionExists(sessionName) {
    try {
      execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique tmux session name
   */
  generateUniqueSessionName(baseName) {
    if (!this.tmuxSessionExists(baseName)) {
      return baseName;
    }

    let counter = 2;
    while (this.tmuxSessionExists(`${baseName}-${counter}`)) {
      counter++;
    }

    return `${baseName}-${counter}`;
  }

  /**
   * Create a PTY process for the given terminal config
   * Integrates with terminal-registry.js
   */
  createPTY(terminalConfig) {
    const {
      id,
      terminalType,
      name,
      workingDir = process.env.HOME || process.cwd(),
      cols = this.defaultCols,
      rows = this.defaultRows,
      env = {},
      profile = null
    } = terminalConfig;

    log.info(`Creating PTY: ${name} (${terminalType})`, {
      id: id.slice(-8),
      useTmux: terminalConfig.useTmux,
      sessionName: terminalConfig.sessionName
    });
    // Debug Gemini terminal type
    if (terminalType === 'gemini') {
      log.debug('Gemini terminal detected - will execute gemini command after spawn');
    }

    // Check if this is a TUI tool that needs special environment settings
    const isTUITool = terminalType === 'tui-tool' ||
                      name?.toLowerCase().includes('pyradio') ||
                      name?.toLowerCase().includes('lazygit') ||
                      name?.toLowerCase().includes('bottom') ||
                      name?.toLowerCase().includes('micro');

    // Build enhanced environment
    // Filter out parent terminal's variables to prevent contamination
    const filteredEnv = { ...process.env };
    delete filteredEnv.WT_SESSION;  // Windows Terminal
    delete filteredEnv.WT_PROFILE_ID;  // Windows Terminal
    delete filteredEnv.WEZTERM_EXECUTABLE;  // WezTerm
    delete filteredEnv.WEZTERM_PANE;  // WezTerm
    delete filteredEnv.ALACRITTY_SOCKET;  // Alacritty
    delete filteredEnv.KITTY_WINDOW_ID;  // Kitty

    // Determine terminal background for lipgloss/charm apps
    // COLORFGBG format: "foreground;background" (ANSI color indices)
    // Light theme: "0;15" (black on white), Dark theme: "15;0" (white on black)
    const isLightTheme = profile?.theme === 'light';
    const colorFgBg = isLightTheme ? '0;15' : '15;0';

    const enhancedEnv = {
      ...filteredEnv,
      ...env,
      TERM: isTUITool ? 'xterm-256color' : this.termType,
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
      COLUMNS: cols.toString(),
      LINES: rows.toString(),
      AGENT_NAME: name,
      TERMINAL_TYPE: terminalType,
      // Tabz process identification
      TABZ_PROCESS: 'true',
      TABZ_TYPE: terminalType,
      TABZ_NAME: name,
      TABZ_ID: id,
      // Disable automatic IDE connection for Claude Code
      CLAUDE_CODE_AUTO_CONNECT_IDE: 'false',
      // Enable mouse support for applications like MC
      COLORTERM: 'truecolor',
      // Tell lipgloss/charm apps about terminal background color
      COLORFGBG: colorFgBg,
      // Additional settings for TUI tools
      ...(isTUITool && {
        NCURSES_NO_UTF8_ACS: '1', // Force UTF-8 box drawing characters
        LESSCHARSET: 'utf-8',
      })
    };

    // Validate working directory and expand tilde
    const expandedWorkingDir = expandTilde(workingDir);
    const validWorkingDir = expandedWorkingDir || process.env.HOME || process.cwd();

    log.debug(`Working directory: ${workingDir} -> ${validWorkingDir}`);

    try {
      let ptyProcess;
      let sessionName = null;

      // Check if tmux spawning is requested
      let isReconnection = false;  // Track if this is a reconnection vs new session

      if (terminalConfig.useTmux) {
        // Check if this is a reconnection to existing session
        const requestedSession = terminalConfig.sessionName;
        log.debug(`Checking tmux session: ${requestedSession}`);
        const sessionExists = requestedSession && this.tmuxSessionExists(requestedSession);
        log.debug(`Session exists: ${sessionExists}`);

        if (sessionExists) {
          // RECONNECTION: Just attach to existing session
          isReconnection = true;
          sessionName = requestedSession;
          log.success(`🔄 Reconnecting to tmux session: ${sessionName}`);

          // Apply remain-on-exit setting to existing sessions (fixes old sessions)
          try {
            execSync(`tmux set-option -t "${sessionName}" remain-on-exit off`);
            log.debug(`Applied remain-on-exit off to existing session ${sessionName}`);
          } catch (err) {
            log.warn(`Failed to set remain-on-exit for ${sessionName}:`, err.message);
          }

          // CRITICAL FIX: Clean up any old PTY for this session (even if disconnect is in progress)
          log.debug(`Searching for old PTYs with session: ${sessionName}`);
          for (const [existingId, existingPty] of this.processes.entries()) {
            log.debug(`Checking PTY ${existingId.slice(-8)}: session=${existingPty.tmuxSession}, status=${existingPty.status}`);

            if (existingPty.tmuxSession === sessionName && existingId !== id) {
              log.info(`🧹 Found old PTY for session ${sessionName}, cleaning up...`);

              // Cancel grace period timer if it exists
              if (this.disconnectedProcesses.has(existingId)) {
                clearTimeout(this.disconnectedProcesses.get(existingId));
                this.disconnectedProcesses.delete(existingId);
                log.debug('Canceled grace period timer');
              }

              // Remove the old PTY attachment (but tmux session stays alive)
              this.processes.delete(existingId);
              log.debug('Old PTY removed from processes');
            }
          }
          log.debug(`Finished cleaning up old PTYs for session ${sessionName}`);
        } else {
          // NEW SESSION: Generate unique name and create
          // For Chrome extension terminals (ctt- prefix), use the terminal ID as session name
          // This makes them easy to identify and cleanup
          const baseName = id.startsWith('ctt-') ? id : (requestedSession || name || 'term');
          sessionName = this.generateUniqueSessionName(baseName);
          log.info(`✨ Creating new tmux session: ${sessionName}`);

          try {
            // Use custom tmux config for optimal terminal experience
            const tmuxCmd = `tmux -f "${this.tmuxConfigPath}" new-session -d -s "${sessionName}" -c "${validWorkingDir}" -x ${cols} -y ${rows}`;
            log.debug(`Using tmux config: ${this.tmuxConfigPath}`);
            execSync(tmuxCmd, {
              env: enhancedEnv
            });

            // CRITICAL: Ensure remain-on-exit is off for this session
            // This allows tabs to auto-close when you type 'exit' or Ctrl+D
            execSync(`tmux set-option -t "${sessionName}" remain-on-exit off`);

            log.success(`Tmux session created: ${sessionName}`);
          } catch (tmuxError) {
            log.error('Failed to create tmux session:', tmuxError);
            throw new Error(`Failed to create tmux session: ${tmuxError.message}`);
          }
        }

        // Attach to the tmux session via PTY (works for both new and existing)
        ptyProcess = pty.spawn('tmux', ['attach-session', '-t', sessionName], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: validWorkingDir,
          env: enhancedEnv,
          conptyInheritCursor: false
        });

        // Exit copy-mode if accidentally triggered during reconnection using tmux API
        // (Mouse wheel events can trigger copy-mode on attach)
        if (isReconnection) {
          setTimeout(() => {
            try {
              execSync(`tmux send-keys -t "${sessionName}" -X cancel 2>/dev/null || true`);
              log.debug(`Sent copy-mode cancel to ${sessionName}`);
            } catch (err) {
              log.debug('Failed to cancel copy-mode on reconnection:', err.message);
            }
          }, 150);
        }
      } else {
        // Standard non-tmux spawning (existing behavior)
        const shellCommand = this.getShellCommand(terminalType);

        // Use interactive flag for bash terminals to ensure prompt appears
        const shellArgs = (terminalType === 'bash' || terminalType === 'dashboard' || terminalType === 'script')
          ? ['-i']
          : [];

        ptyProcess = pty.spawn('bash', shellArgs, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: validWorkingDir,
          env: enhancedEnv,
          conptyInheritCursor: false
        });
      }

      // Store PTY info
      const ptyInfo = {
        id,
        name,
        terminalType,
        process: ptyProcess,
        pid: ptyProcess.pid,
        createdAt: new Date(),
        workingDir: validWorkingDir,
        status: 'active',
        tmuxSession: sessionName, // Store tmux session name if using tmux
        useTmux: terminalConfig.useTmux || false
      };

      log.debug(`💾 Storing PTY ${id.slice(-8)}: status="${ptyInfo.status}", tmux="${sessionName}", reconnect=${isReconnection}`);
      this.processes.set(id, ptyInfo);
      log.debug(`PTY stored successfully. Total PTYs: ${this.processes.size}`);

      // Setup event handlers
      this.setupEventHandlers(ptyInfo);

      // Auto-execute terminal type specific commands (SKIP for reconnections!)
      if (!isReconnection) {
        log.debug(`New session - calling autoExecuteCommand for ${terminalType}`);
        this.autoExecuteCommand(terminalType, ptyProcess, terminalConfig);
      } else {
        log.debug('Reconnection - skipping autoExecuteCommand (session already running)');
      }
      
      // For bash terminals, force a small write to trigger initial prompt display (SKIP for reconnections!)
      if (!isReconnection && (terminalType === 'bash' || terminalType === 'dashboard' || terminalType === 'script')) {
        setTimeout(() => {
          // Write empty string to force PTY to send its current buffer
          ptyProcess.write('');
        }, 100);
      }

      log.success(`PTY created: ${name} (PID ${ptyProcess.pid})`);
      return ptyInfo;

    } catch (error) {
      log.error(`Failed to create PTY for ${name}:`, error);
      throw new Error(`Failed to create PTY process: ${error.message}`);
    }
  }

  /**
   * Get shell command based on terminal type
   */
  getShellCommand(terminalType) {
    // For now, all types start with bash - commands are sent after spawn
    return 'bash';
  }

  /**
   * Auto-execute commands specific to terminal type
   */
  autoExecuteCommand(terminalType, ptyProcess, terminalConfig) {
    // Use consistent delay for all terminals to ensure proper initialization
    // This helps with mouse support, scrollback, and other terminal features
    const delay = 1200; // Standardized delay for all terminal types

    log.debug(`Setting up auto-execute for ${terminalType} with ${delay}ms delay`);

    // Delay to ensure PTY is ready
    setTimeout(() => {
      log.debug(`Auto-execute timer fired for ${terminalType}`);
      try {
        // First check if there's a custom commands array in the config
        if (terminalConfig && terminalConfig.commands && Array.isArray(terminalConfig.commands)) {
          log.debug(`Executing ${terminalConfig.commands.length} custom command(s)`);
          terminalConfig.commands.forEach(raw => {
            const cmd = typeof raw === 'string' ? raw : ''
            if (cmd !== undefined) {
              const toWrite = cmd.endsWith('\n') ? cmd : (cmd + '\n')
              // Don't log command content - may contain escape sequences!
              ptyProcess.write(toWrite);
            }
          });
          return;
        }

        // Check for single command string (ALLOW for all types including AI terminals!)
        if (terminalConfig && terminalConfig.command && typeof terminalConfig.command === 'string') {
          const cmd = terminalConfig.command;
          const toWrite = cmd.endsWith('\n') ? cmd : (cmd + '\n')
          log.debug(`Executing custom command for ${terminalType}`);
          // Don't log command content - may contain escape sequences!
          ptyProcess.write(toWrite);
          return;
        }

        // Otherwise use default commands for known terminal types
        log.debug(`Looking for default command for terminal type: ${terminalType}`);

        // Check if there's a prompt/startCommand to pass to AI terminals
        const prompt = terminalConfig?.prompt || terminalConfig?.startCommand || '';

        // Build commands with optional prompts for AI terminals
        // Don't pass the command name itself as an argument (e.g., avoid "claude claude")
        const commands = {
          'claude-code': prompt && prompt !== 'claude' ? `claude "${prompt}"\n` : 'claude\n',
          'opencode': prompt && prompt !== 'opencode' ? `opencode "${prompt}"\n` : 'opencode\n',
          'codex': prompt && prompt !== 'codex' ? `codex "${prompt}"\n` : 'codex\n',
          'orchestrator': 'echo "Orchestrator terminal ready"\n', // Fixed: orchestrator shouldn't run claude
          'gemini': prompt && prompt !== 'gemini' ? `gemini "${prompt}"\n` : 'gemini\n',
          'docker-ai': 'docker.exe ai\n'  // Fixed: Use docker.exe for WSL/Windows
          // bash, dashboard, script - no commands needed, interactive flag handles prompt
        };
        
        const command = commands[terminalType];
        if (command) {
          log.debug(`Auto-executing ${terminalType} startup command`);
          // Don't log command content - it's just the command name but let's be consistent
          ptyProcess.write(command);
          log.debug(`Startup command sent to PTY for ${terminalType}`);
        } else {
          log.debug(`No auto-command for terminal type: ${terminalType}`);
          log.debug('Available command types:', Object.keys(commands));

          // Check if this might be a gemini terminal with wrong type
          if (terminalConfig.name && terminalConfig.name.includes('gemini')) {
            log.warn(`Terminal name contains 'gemini' but type is '${terminalType}'`);
          }
        }
      } catch (error) {
        log.error('Error executing startup command:', error);
      }
    }, delay); // Consistent delay for proper terminal initialization
  }

  /**
   * Setup event handlers for PTY process
   */
  setupEventHandlers(ptyInfo) {
    const { id, name, process: ptyProcess } = ptyInfo;

    // Create named handler functions so we can remove them later
    const dataHandler = (data) => {
      this.emit('pty-output', {
        terminalId: id,
        agentName: name,
        data
      });
    };

    const exitHandler = (exitCode, signal) => {
      log.info(`PTY ${name} exited: code=${exitCode}, signal=${signal}`);
      
      // Clean up handlers to prevent memory leaks
      this.cleanupHandlers(ptyInfo);
      
      ptyInfo.status = 'closed';
      this.processes.delete(id);
      
      this.emit('pty-closed', {
        terminalId: id,
        agentName: name,
        exitCode,
        signal
      });
    };

    // Store handlers on ptyInfo so we can remove them later
    ptyInfo.handlers = {
      data: dataHandler,
      exit: exitHandler
    };

    // Handle data output
    ptyProcess.onData(dataHandler);

    // Handle process exit
    ptyProcess.onExit(exitHandler);

    // Handle errors (node-pty doesn't expose error events directly)
    // We'll catch errors in write/resize operations instead
  }

  /**
   * Clean up event handlers to prevent memory leaks
   */
  cleanupHandlers(ptyInfo) {
    if (!ptyInfo || !ptyInfo.handlers) return;
    
    const { process: ptyProcess, handlers } = ptyInfo;
    
    try {
      // Remove handlers if the process still exists
      if (ptyProcess && handlers) {
        // node-pty doesn't have removeListener, but we can clear by setting to null
        // The handlers will be garbage collected when the process is destroyed
        ptyInfo.handlers = null;
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Write data to PTY process
   */
  writeData(terminalId, data) {
    // Only log length, NEVER log the actual data (contains escape sequences that leak to host terminal!)
    // console.log(`[PTYHandler] 📥 Input for terminal ${terminalId}: ${data.length} bytes`);

    const ptyInfo = this.processes.get(terminalId);
    if (!ptyInfo) {
      log.error(`❌ PTY ${terminalId.slice(-8)} not found in processes`);
      log.debug('Available PTYs:', Array.from(this.processes.keys()).map(id => id.slice(-8)));
      throw new Error(`PTY process ${terminalId} not found`);
    }

    // Commented out to reduce log noise
    // console.log(`[PTYHandler] PTY ${terminalId} found. Status: "${ptyInfo.status}", Name: ${ptyInfo.name}, tmuxSession: ${ptyInfo.tmuxSession}`);

    if (ptyInfo.status !== 'active') {
      log.error(`❌ PTY ${terminalId.slice(-8)} is not active (status: ${ptyInfo.status})`);
      log.debug('PTY info:', {
        id: ptyInfo.id.slice(-8),
        name: ptyInfo.name,
        status: ptyInfo.status,
        tmuxSession: ptyInfo.tmuxSession
      });
      throw new Error(`PTY process ${terminalId} is not active (status: ${ptyInfo.status})`);
    }

    try {
      ptyInfo.process.write(data);
      // Commented out to prevent escape sequence leakage AND reduce log noise
      // log.debug(`Wrote ${data.length} bytes to PTY ${terminalId.slice(-8)}`);
    } catch (error) {
      log.error(`Error writing to PTY ${terminalId.slice(-8)}:`, error);
      throw error;
    }
  }

  /**
   * Resize PTY process
   */
  resize(terminalId, cols, rows) {
    const ptyInfo = this.processes.get(terminalId);
    if (!ptyInfo) {
      throw new Error(`PTY process ${terminalId} not found`);
    }

    // Validate dimensions
    const validCols = Math.max(20, Math.min(500, cols || this.defaultCols));
    const validRows = Math.max(10, Math.min(200, rows || this.defaultRows));

    try {
      ptyInfo.process.resize(validCols, validRows);
      console.log(`[PTYHandler] Resized PTY ${ptyInfo.name}: ${validCols}x${validRows}`);

      // Special handling for certain TUI apps that need screen refresh after resize
      if (ptyInfo.name && (ptyInfo.name.includes('pyradio') || ptyInfo.name.includes('PyRadio'))) {
        // Send Ctrl+L to refresh pyradio screen after resize
        setTimeout(() => {
          console.log(`[PTYHandler] Sending refresh to pyradio after resize`);
          ptyInfo.process.write('\x0C'); // Ctrl+L
        }, 100);
      }

      return { cols: validCols, rows: validRows };
    } catch (error) {
      // Ignore ENOTTY errors which happen when terminal is not ready
      if (error.code !== 'ENOTTY') {
        console.error(`[PTYHandler] Failed to resize PTY ${terminalId}:`, error);
      }
      return { cols: validCols, rows: validRows }; // Return dimensions even if resize failed
    }
  }

  /**
   * Mark a PTY as disconnected and start grace period timer
   */
  disconnectPTY(terminalId) {
    const ptyInfo = this.processes.get(terminalId);
    if (!ptyInfo) return;

    console.log(`[PTYHandler] Disconnecting PTY ${ptyInfo.name}, starting ${this.gracePeriodMs/1000}s grace period`);

    // Clear any existing timeout for this terminal to prevent timer leak
    if (this.disconnectedProcesses.has(terminalId)) {
      const existingTimeout = this.disconnectedProcesses.get(terminalId);
      clearTimeout(existingTimeout);
      this.disconnectedProcesses.delete(terminalId);
    }

    // Set a timeout to kill the process after grace period
    const timeout = setTimeout(() => {
      console.log(`[PTYHandler] Grace period expired for ${ptyInfo.name}, killing process`);
      this.killPTY(terminalId);
      this.disconnectedProcesses.delete(terminalId);
    }, this.gracePeriodMs);

    this.disconnectedProcesses.set(terminalId, timeout);
    ptyInfo.status = 'disconnected';
  }

  /**
   * Reconnect to a disconnected PTY (cancel grace period)
   */
  reconnectPTY(terminalId) {
    if (this.disconnectedProcesses.has(terminalId)) {
      console.log(`[PTYHandler] Reconnecting to PTY ${terminalId}, cancelling grace period`);
      clearTimeout(this.disconnectedProcesses.get(terminalId));
      this.disconnectedProcesses.delete(terminalId);

      const ptyInfo = this.processes.get(terminalId);
      if (ptyInfo) {
        ptyInfo.status = 'active';
        return ptyInfo;
      }
    }
    return null;
  }

  /**
   * Cancel disconnect (just stop the grace period timer without reconnecting)
   * This is useful when we want to cancel the timer before checking if terminal exists
   */
  cancelDisconnect(terminalId) {
    if (this.disconnectedProcesses.has(terminalId)) {
      console.log(`[PTYHandler] Canceling disconnect timer for PTY ${terminalId}`);
      clearTimeout(this.disconnectedProcesses.get(terminalId));
      this.disconnectedProcesses.delete(terminalId);

      // Update status if PTY exists
      const ptyInfo = this.processes.get(terminalId);
      if (ptyInfo) {
        ptyInfo.status = 'active';
        console.log(`[PTYHandler] Canceled disconnect for PTY ${ptyInfo.name}`);
      }
      return true;
    }
    return false;
  }

  /**
   * Check if a PTY exists and can be reconnected to
   */
  canReconnectPTY(terminalId) {
    return this.processes.has(terminalId);
  }

  /**
   * Kill PTY process immediately
   */
  async killPTY(terminalId, signal = 'SIGTERM') {
    const ptyInfo = this.processes.get(terminalId);
    if (!ptyInfo) {
      return true; // Already destroyed
    }

    console.log(`[PTYHandler] Killing PTY ${ptyInfo.name} (PID: ${ptyInfo.pid})`);

    try {
      // Clean up handlers first to prevent memory leaks
      this.cleanupHandlers(ptyInfo);
      
      // Send termination signal
      ptyInfo.process.kill(signal);
      
      // Wait for graceful exit with timeout
      await new Promise((resolve) => {
        let cleaned = false;
        
        // Force kill after timeout
        const timeout = setTimeout(() => {
          if (!cleaned) {
            cleaned = true;
            try {
              console.log(`[PTYHandler] Force killing PTY ${ptyInfo.name}`);
              ptyInfo.process.kill('SIGKILL');
            } catch (e) {
              // Process might already be dead
            }
            resolve();
          }
        }, 2000); // 2 second timeout
        
        // Check if process already exited
        // Since we already have an exit handler from setupEventHandlers,
        // we just need to wait for it or timeout
        const checkInterval = setInterval(() => {
          if (!this.processes.has(terminalId)) {
            // Process already removed by exit handler
            if (!cleaned) {
              cleaned = true;
              clearTimeout(timeout);
              clearInterval(checkInterval);
              console.log(`[PTYHandler] PTY ${ptyInfo.name} exited gracefully`);
              resolve();
            }
          }
        }, 100);
      });

      // Make sure it's removed from our map
      this.processes.delete(terminalId);
      return true;

    } catch (error) {
      if (error.code !== 'ESRCH') { // "No such process" is OK
        console.error(`[PTYHandler] Error killing PTY ${terminalId}:`, error);
      }
      // Clean up handlers and remove from map
      this.cleanupHandlers(ptyInfo);
      this.processes.delete(terminalId);
      return true;
    }
  }

  /**
   * Get PTY info by terminal ID
   */
  getPTY(terminalId) {
    return this.processes.get(terminalId);
  }

  /**
   * Get all active PTY processes
   */
  getAllPTYs() {
    const ptys = [];
    for (const [terminalId, ptyInfo] of this.processes) {
      ptys.push({
        terminalId,
        name: ptyInfo.name,
        terminalType: ptyInfo.terminalType,
        pid: ptyInfo.pid,
        status: ptyInfo.status,
        createdAt: ptyInfo.createdAt
      });
    }
    return ptys;
  }

  /**
   * Cleanup all PTY processes with optional grace period
   * @param {boolean} force - If true, kill immediately; if false, use grace period
   */
  async cleanupWithGrace(force = false) {
    console.log(`[PTYHandler] Cleaning up all PTY processes (force: ${force})...`);

    // Clear all grace period timeouts first
    for (const timeout of this.disconnectedProcesses.values()) {
      clearTimeout(timeout);
    }
    this.disconnectedProcesses.clear();

    if (force) {
      // Kill all processes immediately
      const promises = [];
      for (const terminalId of this.processes.keys()) {
        promises.push(this.killPTY(terminalId));
      }
      await Promise.all(promises);
      console.log(`[PTYHandler] Force killed ${promises.length} PTY processes`);
    } else {
      // Mark all as disconnected with grace period
      for (const terminalId of this.processes.keys()) {
        this.disconnectPTY(terminalId);
      }
      console.log(`[PTYHandler] Marked ${this.processes.size} PTY processes for graceful cleanup`);
    }
  }

  /**
   * Get process statistics
   */
  getStats() {
    return {
      totalProcesses: this.processes.size,
      activeProcesses: Array.from(this.processes.values()).filter(p => p.status === 'active').length,
      processByType: this.getProcessCountsByType()
    };
  }

  /**
   * Get process counts by terminal type
   */
  getProcessCountsByType() {
    const counts = {};
    for (const ptyInfo of this.processes.values()) {
      counts[ptyInfo.terminalType] = (counts[ptyInfo.terminalType] || 0) + 1;
    }
    return counts;
  }

  /**
   * Immediate cleanup of all resources on server shutdown
   */
  cleanupImmediate() {
    console.log('[PTYHandler] Cleaning up all PTY processes and timers');

    // Clear all grace period timers to prevent leaks
    for (const [terminalId, timeout] of this.disconnectedProcesses.entries()) {
      clearTimeout(timeout);
      console.log(`[PTYHandler] Cleared timer for terminal ${terminalId}`);
    }
    this.disconnectedProcesses.clear();

    // Kill all PTY processes
    for (const [terminalId, ptyInfo] of this.processes.entries()) {
      try {
        if (ptyInfo.pty && !ptyInfo.pty.killed) {
          console.log(`[PTYHandler] Killing PTY ${ptyInfo.name} (PID: ${ptyInfo.pid})`);
          ptyInfo.pty.kill();
        }
      } catch (error) {
        console.error(`[PTYHandler] Error killing PTY ${terminalId}:`, error);
      }
    }
    this.processes.clear();
  }
}

// Export singleton instance
const ptyHandler = new PTYHandler();

// Cleanup on server shutdown
process.on('SIGINT', () => {
  log.warn('Received SIGINT, cleaning up...');
  ptyHandler.cleanupImmediate();
});

process.on('SIGTERM', () => {
  log.warn('Received SIGTERM, cleaning up...');
  ptyHandler.cleanupImmediate();
});

module.exports = ptyHandler;
