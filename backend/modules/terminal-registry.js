/**
 * Terminal Registry - Single source of truth for all terminal state
 *
 * Manages:
 * - Terminal instances and their state
 * - Terminal types (directly from config, no guessing)
 * - PTY processes
 * - Output streaming via WebSocket
 *
 * Integration with:
 * - pty-handler.js for local PTY processes
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const os = require('os');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('TerminalRegistry');

/**
 * Generate a short random ID (8 hex chars = 4 billion combinations)
 */
function shortId() {
  return crypto.randomBytes(4).toString('hex');
}
const ptyHandler = require('./pty-handler');

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

class TerminalRegistry extends EventEmitter {
  constructor() {
    super();
    this.terminals = new Map();
    this.nameCounters = new Map(); // Track name sequences
    this.defaultProfileSettings = null; // Default profile settings from Chrome extension

    this.setupEventHandlers();
  }

  /**
   * Set default profile settings (sent from Chrome extension)
   * Used for API spawns that don't specify a profile
   */
  setDefaultProfileSettings(settings) {
    this.defaultProfileSettings = settings;
    log.info('Default profile settings updated:', {
      color: settings?.color,
      hasProfile: !!settings?.profile
    });
  }

  /**
   * Get default profile settings
   */
  getDefaultProfileSettings() {
    return this.defaultProfileSettings;
  }

  /**
   * Update name counters based on existing terminal names
   * This ensures new terminals get unique sequential names
   */
  updateNameCounters() {
    // CRITICAL FIX: Don't clear counters - maintain them across the session
    // Only update if we find higher numbers

    // Scan all existing terminals and track the highest number for each type
    this.terminals.forEach(terminal => {
      if (terminal.name && terminal.terminalType) {
        // Check if the name follows the pattern "type-number"
        const match = terminal.name.match(/^(.+)-(\d+)$/);
        if (match) {
          const baseName = match[1];
          const num = parseInt(match[2]);

          // Update the counter if this number is higher than what we have
          const currentMax = this.nameCounters.get(baseName) || 0;
          if (num > currentMax) {
            this.nameCounters.set(baseName, num);
          }
        } else {
          // Terminal doesn't have a number suffix, ensure we have at least 0 for this type
          if (!this.nameCounters.has(terminal.terminalType)) {
            this.nameCounters.set(terminal.terminalType, 0);
          }
        }
      }
    });

    log.debug('Updated name counters:', Array.from(this.nameCounters.entries()));
  }

  /**
   * Setup event handlers for pty-handler
   */
  setupEventHandlers() {

    // Remove any existing PTY listeners to prevent duplicates
    ptyHandler.removeAllListeners('pty-output');
    ptyHandler.removeAllListeners('pty-closed');
    
    // Handle PTY output
    ptyHandler.on('pty-output', ({ terminalId, data }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        terminal.lastActivity = new Date();
        this.emit('output', terminalId, data);
      }
    });

    ptyHandler.on('pty-closed', ({ terminalId, exitCode, signal }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal) {
        terminal.state = 'closed';
        terminal.exitCode = exitCode;
        terminal.signal = signal;

        // Check if this is a tmux terminal
        if (terminal.sessionId || terminal.sessionName) {
          log.debug(`PTY closed for tmux terminal ${terminal.name}`);

          // Check if the tmux session still exists
          const sessionName = terminal.sessionName || terminal.sessionId;
          const sessionExists = ptyHandler.tmuxSessionExists(sessionName);

          if (sessionExists) {
            // Session still exists - user might have detached or PTY died
            log.debug(`Tmux session ${sessionName} still exists, marking as disconnected`);
            terminal.state = 'disconnected';
          } else {
            // Session ended (user typed exit/Ctrl+D) - clean up
            log.debug(`Tmux session ${sessionName} ended, removing terminal`);
            this.terminals.delete(terminalId);
            this.emit('closed', terminalId);
          }
        } else {
          // Non-tmux terminals can be safely deleted when PTY closes
          this.terminals.delete(terminalId);
          this.emit('closed', terminalId);
        }
      }
    });
  }

  /**
   * Register a new terminal with explicit type
   */
  async registerTerminal(config) {
    // CRITICAL FIX: Check if we're reconnecting to an existing tmux session
    // If sessionName/sessionId is provided and matches an existing terminal, reuse it!
    const sessionName = config.sessionName || config.sessionId;
    if (sessionName) {
      const existingTerminal = Array.from(this.terminals.values()).find(t =>
        (t.sessionId === sessionName || t.sessionName === sessionName)
      );

      if (existingTerminal) {
        log.info(`🔄 Reconnecting to existing terminal ${existingTerminal.name} (session: ${sessionName})`);

        // Update existing terminal state for reconnection
        existingTerminal.state = 'spawning';
        existingTerminal.lastActivity = new Date();
        existingTerminal.config = { ...existingTerminal.config, ...config };

        // Update customizations from config (theme, fontSize, etc.)
        if (config.theme) existingTerminal.config.theme = config.theme;
        if (config.background) existingTerminal.config.background = config.background;
        if (config.transparency !== undefined) existingTerminal.config.transparency = config.transparency;
        if (config.fontSize) existingTerminal.config.fontSize = config.fontSize;
        if (config.fontFamily) existingTerminal.config.fontFamily = config.fontFamily;

        // Preserve profile settings on reconnection
        if (config.profile) {
          existingTerminal.profile = config.profile;
        }

        try {
          // Kill old PTY if it exists (reconnection scenario)
          if (existingTerminal.ptyInfo) {
            log.debug(`Killing old PTY for ${existingTerminal.name}`);
            await ptyHandler.killPTY(existingTerminal.id).catch(() => {});
          }

          // Create new PTY attachment to the tmux session
          const terminalConfig = { ...existingTerminal.config, ...config };
          const ptyInfo = ptyHandler.createPTY(terminalConfig);
          existingTerminal.state = 'active';
          existingTerminal.ptyInfo = ptyInfo;

          log.success(`✅ Reconnected to terminal ${existingTerminal.name} (ID: ${existingTerminal.id}, session: ${sessionName})`);
          return existingTerminal;
        } catch (error) {
          log.error(`Failed to reconnect terminal ${existingTerminal.name}:`, error);
          existingTerminal.state = 'error';
          existingTerminal.error = error.message;
          throw error;
        }
      } else {
        log.debug(`Session ${sessionName} not in registry, creating new terminal`);
      }
    }

    // NEW TERMINAL: Generate unique ID
    // For session recovery, use the sessionName as ID (maintains Chrome storage compatibility)
    // For new terminals, include profile name for easier identification in tmux ls
    const sanitizeName = (name) => {
      // Convert to lowercase, replace spaces/special chars with hyphens, limit length
      const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
        .substring(0, 20);              // Limit length
      // Fallback to 'term' if sanitization results in empty string (e.g., emoji-only names)
      return sanitized || 'term';
    };

    const profileName = config.name || config.profile?.name || config.terminalType || 'term';
    const sanitizedName = sanitizeName(profileName);
    const id = config.sessionName
      ? config.sessionName  // Recovery: use tmux session name as ID
      : (config.isChrome ? `ctt-${sanitizedName}-${shortId()}` : shortId());

    // Update name counters before generating a new name
    this.updateNameCounters();

    // Generate unique name with simple counter suffix if needed
    let name;
    const providedName = config.name || config.terminalType;

    // Check if a terminal with this name already exists
    const existingWithExactName = Array.from(this.terminals.values()).find(t =>
      t.name === providedName && (t.state === 'active' || t.state === 'spawning' || t.state === 'disconnected')
    );

    if (!existingWithExactName) {
      // No duplicate, use the name as-is
      name = providedName;
    } else {
      // Find the next available number suffix
      let counter = 2;
      let candidateName;
      do {
        candidateName = `${providedName}-${counter}`;
        counter++;
      } while (Array.from(this.terminals.values()).some(t =>
        t.name === candidateName && (t.state === 'active' || t.state === 'spawning' || t.state === 'disconnected')
      ));
      name = candidateName;
      log.debug(`Name '${providedName}' already exists, using '${name}'`);
    }
    // Enhanced config with generated values
    const terminalConfig = {
      ...config,
      id,
      name,
      workingDir: expandTilde(config.workingDir) || process.env.HOME,
      cols: config.cols || 80,
      rows: config.rows || 30
    };

    log.debug(`Working directory: ${config.workingDir} -> ${terminalConfig.workingDir}`);

    // Debug terminal type
    log.debug(`Registering terminal with type: '${terminalConfig.terminalType}' (config.terminalType: '${config.terminalType}')`);

    // Guard against incorrect start commands for certain types
    // For gemini, ensure we don't accidentally start an interactive bash instead of the CLI
    if (terminalConfig.terminalType === 'gemini') {
      log.debug('Special handling for Gemini terminal');
      // If a generic bash start was provided, ignore it and let PTY handler auto-exec gemini
      if (typeof terminalConfig.command === 'string' && /\bbash\b/.test(terminalConfig.command)) {
        log.debug('Removing bash command from Gemini config');
        delete terminalConfig.command;
      }
      // If no explicit commands provided, ensure default auto-exec will run
      if (!Array.isArray(terminalConfig.commands) || terminalConfig.commands.length === 0) {
        terminalConfig.commands = [];
      }
    } else {
      log.debug(`No special handling for type: ${terminalConfig.terminalType}`);
    }

    // Use default profile settings for API spawns without explicit profile/color
    const defaults = this.defaultProfileSettings || {};

    // Terminal state - everything in one place
    const terminal = {
      id,
      name,
      terminalType: config.terminalType, // Direct from config, no guessing!
      platform: 'local', // Always use local PTY
      resumable: config.resumable || false,
      color: config.color || config.profile?.color || defaults.color || '#888888',
      icon: config.icon || config.profile?.icon || defaults.icon || '📟',
      workingDir: terminalConfig.workingDir,
      createdAt: new Date(),
      lastActivity: new Date(),
      state: 'spawning',
      embedded: config.embedded || false, // Pass through embedded flag
      position: config.position || null, // Include position if provided
      // CRITICAL FIX: Don't use defaults.profile as fallback
      // When profile is undefined (e.g., during session recovery), the frontend
      // has recovery logic to find the correct profile from the session ID name.
      // Using defaults.profile here causes audio announcements to read the wrong
      // profile name (the default profile instead of the actual spawned profile).
      profile: config.profile || null, // Chrome extension profile settings
      config: terminalConfig, // Keep full config for reference
      // TUI tool specific fields
      commands: config.commands || [],
      toolName: config.toolName || null,
      isTUITool: config.isTUITool || false,
      // Canvas state fields
      canvas: config.canvas || null, // Canvas-specific state: { x, y, width, height, zIndex, visible }
      owner: config.owner || 'sidebar', // 'sidebar' | 'canvas' - which view owns the terminal
    };

    // Store terminal first
    this.terminals.set(id, terminal);

    try {
      // Always use local PTY
      log.debug(`Creating local PTY for ${name}`);

      // Create local PTY process
      const ptyInfo = ptyHandler.createPTY(terminalConfig);
      terminal.state = 'active';
      terminal.ptyInfo = ptyInfo;
      terminal.platform = 'local';

      // CRITICAL FIX: Include tmux session info for persistence
      if (ptyInfo.tmuxSession) {
        terminal.sessionId = ptyInfo.tmuxSession;
        terminal.sessionName = ptyInfo.tmuxSession; // Backward compatibility
        log.debug(`✅ Terminal ${name} using tmux session: ${ptyInfo.tmuxSession}`);
      } else {
        log.warn(`⚠️  Terminal ${name} NOT using tmux (ptyInfo.tmuxSession is ${ptyInfo.tmuxSession})`);
        log.debug(`⚠️  Original config had useTmux: ${config.useTmux}, sessionName: ${config.sessionName}`);
      }

      log.info(`✅ Successfully registered terminal ${name} (${terminal.terminalType}), ID: ${id}, sessionId: ${terminal.sessionId || 'NONE'}`);
      return terminal;

    } catch (error) {
      log.error(`Failed to register terminal ${name}:`, error);
      terminal.state = 'error';
      terminal.error = error.message;
      throw error;
    }
  }

  /**
   * Get terminal by ID
   */
  getTerminal(id) {
    return this.terminals.get(id);
  }

  /**
   * Get all terminals
   */
  getAllTerminals() {
    return Array.from(this.terminals.values()).map(t => ({
      id: t.id,
      name: t.name,
      terminalType: t.terminalType,
      platform: t.platform,
      resumable: t.resumable,
      color: t.color,
      icon: t.icon,
      workingDir: t.workingDir,
      state: t.state,
      embedded: t.embedded,
      position: t.position, // Include position in returned data
      sessionName: t.sessionName, // Tmux session name for persistence
      profile: t.profile, // Chrome extension profile settings
      createdAt: t.createdAt,
      lastActivity: t.lastActivity,
      // TUI tool fields
      commands: t.commands,
      toolName: t.toolName,
      isTUITool: t.isTUITool,
      // Canvas state fields
      canvas: t.canvas,
      owner: t.owner || 'sidebar',
    }));
  }

  /**
   * Get active terminal count
   */
  getActiveTerminalCount() {
    return Array.from(this.terminals.values())
      .filter(t => t.state === 'active' || t.state === 'spawning')
      .length;
  }

  /**
   * Get terminal by name
   */
  getTerminalByName(name) {
    return Array.from(this.terminals.values()).find(t => t.name === name);
  }

  /**
   * Find ALL terminals by name (not just first)
   */
  getAllTerminalsByName(name) {
    return Array.from(this.terminals.values()).filter(terminal => terminal.name === name);
  }

  /**
   * Clean up duplicate terminals keeping only the newest
   */
  cleanupDuplicates() {
    const nameGroups = {};

    // Group terminals by base name (without suffixes)
    Array.from(this.terminals.values()).forEach(terminal => {
      const baseName = terminal.name.split('-')[0]; // Get base name without suffix
      if (!nameGroups[baseName]) {
        nameGroups[baseName] = [];
      }
      nameGroups[baseName].push(terminal);
    });

    // Remove duplicates, keeping the most recent
    Object.values(nameGroups).forEach(group => {
      if (group.length > 1) {
        // Sort by creation time (terminal.id includes timestamp), keep newest
        group.sort((a, b) => {
          const timeA = a.createdAt || 0;
          const timeB = b.createdAt || 0;
          return timeB - timeA;
        });

        const toRemove = group.slice(1); // Remove all but the first (newest)
        toRemove.forEach(terminal => {
          log.debug(`Cleaning up duplicate terminal: ${terminal.name} (${terminal.id})`);
          this.closeTerminal(terminal.id);
        });
      }
    });
  }

  /**
   * Send command to terminal (PTY)
   */
  sendCommand(id, command) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      throw new Error(`Terminal ${id} not found`);
    }

    // Send to PTY process
    ptyHandler.writeData(id, command);

    terminal.lastActivity = new Date();
  }

  /**
   * Resize terminal (PTY)
   */
  async resizeTerminal(id, cols, rows) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      throw new Error(`Terminal ${id} not found`);
    }

    // If terminal is disconnected, try to reconnect first
    if (terminal.state === 'disconnected') {
      log.debug(`Terminal ${terminal.name} is disconnected, attempting reconnect before resize`);
      const reconnected = await this.reconnectToTerminal(id);
      if (!reconnected) {
        throw new Error(`Terminal ${id} is disconnected and could not reconnect`);
      }
    }

    // Resize PTY process
    return ptyHandler.resize(id, cols, rows);
  }

  /**
   * Disconnect terminal (with grace period for reconnection)
   */
  disconnectTerminal(id) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      log.debug(`Terminal ${id} not found for disconnection`);
      return;
    }

    log.debug(`🔌 disconnectTerminal called for: ${terminal.name} (ID: ${id})`);
    log.debug(`   sessionId: ${terminal.sessionId || 'NONE'}`);
    log.debug(`   sessionName: ${terminal.sessionName || 'NONE'}`);
    log.debug(`   current state: ${terminal.state}`);

    // CRITICAL FIX: Don't disconnect tmux-backed terminals
    // Tmux sessions persist across WebSocket reconnections (e.g., Vite HMR)
    if (terminal.sessionId || terminal.sessionName) {
      log.debug(`✅ Skipping disconnect for tmux-backed terminal ${terminal.name} (session: ${terminal.sessionId || terminal.sessionName})`);
      log.debug(`✅ Tmux sessions persist across WebSocket reconnections`);
      return;
    }

    log.debug(`⚠️  Disconnecting NON-TMUX terminal ${terminal.name} - starting grace period`);
    terminal.state = 'disconnected';

    // Use grace period for PTY process
    if (terminal.platform === 'local' && terminal.ptyInfo) {
      ptyHandler.disconnectPTY(id);
    }
  }

  /**
   * Cancel disconnect for a terminal (stop grace period timer)
   * This should be called BEFORE attempting to reconnect
   */
  cancelDisconnect(id) {
    log.debug(`Attempting to cancel disconnect for terminal ${id}`);

    // Check if terminal exists in registry
    const terminal = this.terminals.get(id);
    if (!terminal) {
      log.debug(`Terminal ${id} not found in registry`);
      return false;
    }

    // Cancel grace period on PTY handler if it exists
    if (ptyHandler.canReconnectPTY(id)) {
      const canceled = ptyHandler.cancelDisconnect(id);
      if (canceled) {
        log.debug(`Successfully canceled disconnect for terminal ${terminal.name}`);
        terminal.state = 'active';
        return true;
      }
    }

    return false;
  }

  /**
   * Attempt to reconnect to existing terminal
   */
  async reconnectToTerminal(id, newAgentId) {
    log.debug(`Attempting to reconnect to terminal ${id}`);

    // CRITICAL FIX: First check if terminal exists in our registry
    const terminal = this.terminals.get(id);
    if (!terminal) {
      log.debug(`Terminal ${id} not found in registry`);
      return null;
    }

    // FIX: If terminal already has valid ptyInfo and is active, just return it
    // This handles RECONNECT for freshly spawned terminals (not disconnected)
    if (terminal.ptyInfo && terminal.state === 'active') {
      log.debug(`Terminal ${terminal.name} already has active PTY, returning`);
      return terminal;
    }

    // Check if PTY process was disconnected and cancel grace period
    const ptyInfo = ptyHandler.reconnectPTY(id);
    if (ptyInfo) {
      log.debug(`Successfully reconnected to PTY for terminal ${terminal.name}`);
      terminal.state = 'active';
      terminal.ptyInfo = ptyInfo;

      // Update name counters to reflect reconnected terminals
      this.updateNameCounters();

      // Update with new agent ID if provided
      if (newAgentId) {
        const oldId = terminal.id;
        this.terminals.delete(oldId);
        terminal.id = newAgentId;
        this.terminals.set(newAgentId, terminal);
      }
      return terminal;
    }

    // FIX: Also check if PTY exists in processes (not disconnected but still there)
    const existingPty = ptyHandler.getProcess(id);
    if (existingPty) {
      log.debug(`Found existing PTY for terminal ${terminal.name}`);
      terminal.state = 'active';
      terminal.ptyInfo = existingPty;
      return terminal;
    }

    // PTY doesn't exist - check if tmux session still exists and re-attach
    const sessionName = terminal.sessionName || terminal.sessionId || terminal.config?.sessionName;
    if (sessionName && ptyHandler.tmuxSessionExists(sessionName)) {
      log.debug(`PTY gone but tmux session ${sessionName} exists, re-attaching...`);
      try {
        // Re-create PTY to attach to existing tmux session
        const ptyInfo = await ptyHandler.createPTY({
          id: terminal.id,
          name: terminal.name,
          terminalType: terminal.terminalType || 'bash',
          workingDir: terminal.workingDir,
          cols: terminal.config?.cols || 80,
          rows: terminal.config?.rows || 30,
          useTmux: true,
          sessionName: sessionName, // Attach to existing session
          profile: terminal.profile,
        });

        terminal.state = 'active';
        terminal.ptyInfo = ptyInfo;
        log.debug(`Successfully re-attached to tmux session ${sessionName}`);
        return terminal;
      } catch (error) {
        log.error(`Failed to re-attach to tmux session ${sessionName}:`, error);
        return null;
      }
    }

    log.debug(`No PTY and no tmux session found for terminal ${id}`);
    return null;
  }

  /**
   * Close terminal (PTY) immediately
   */
  async closeTerminal(id, force = false) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      // Already closed / not found - treat as idempotent success
      return true;
    }

    log.debug(`Closing terminal ${terminal.name} (force=${force})`);

    try {
      // Handle tmux-backed terminals
      if (terminal.sessionId || terminal.sessionName) {
        const sessionName = terminal.sessionId || terminal.sessionName;

        if (force) {
          // FORCE CLOSE (X button): Kill the tmux session entirely
          log.debug(`Force close - killing tmux session: ${sessionName}`);
          try {
            const { execSync } = require('child_process');
            execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
            log.debug(`✅ Killed tmux session: ${sessionName}`);
          } catch (error) {
            log.debug(`Tmux session ${sessionName} may not exist (already killed)`);
          }
          await ptyHandler.killPTY(id);
        } else {
          // NORMAL CLOSE (power off): Just detach from tmux, leave session running for reconnection
          log.debug(`Power off - detaching from tmux session (session preserved): ${sessionName}`);
          await ptyHandler.killPTY(id); // This just kills the PTY attachment, not the tmux session
        }
      } else {
        // Non-tmux terminals
        if (force) {
          await ptyHandler.killPTY(id);
        } else {
          this.disconnectTerminal(id);
        }
      }

      this.terminals.delete(id);
      log.debug(`✅ Terminal ${terminal.name} removed from registry`);
      return true;
    } catch (error) {
      log.error(`Error closing terminal ${id}:`, error);
      // Remove from registry anyway
      this.terminals.delete(id);
      throw error;
    }
  }

  /**
   * Get terminals by type
   */
  getTerminalsByType(terminalType) {
    return Array.from(this.terminals.values())
      .filter(t => t.terminalType === terminalType);
  }

  /**
   * Update canvas state for a terminal
   * @param {string} id - Terminal ID
   * @param {Object} canvasState - Canvas state: { x, y, width, height, zIndex, visible }
   * @returns {Object|null} Updated terminal or null if not found
   */
  updateCanvasState(id, canvasState) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      log.warn(`Cannot update canvas state: terminal ${id} not found`);
      return null;
    }

    // Merge canvas state (allow partial updates)
    terminal.canvas = {
      ...terminal.canvas,
      ...canvasState,
    };
    terminal.lastActivity = new Date();

    log.debug(`Updated canvas state for ${terminal.name}:`, terminal.canvas);
    this.emit('canvas-updated', { id, canvas: terminal.canvas });
    return terminal;
  }

  /**
   * Transfer terminal ownership between sidebar and canvas
   * @param {string} id - Terminal ID
   * @param {string} newOwner - 'sidebar' | 'canvas'
   * @returns {Object|null} Updated terminal or null if not found
   */
  transferOwnership(id, newOwner) {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      log.warn(`Cannot transfer ownership: terminal ${id} not found`);
      return null;
    }

    if (newOwner !== 'sidebar' && newOwner !== 'canvas') {
      log.warn(`Invalid owner '${newOwner}', must be 'sidebar' or 'canvas'`);
      return null;
    }

    const previousOwner = terminal.owner || 'sidebar';
    terminal.owner = newOwner;
    terminal.lastActivity = new Date();

    log.info(`Transferred ${terminal.name} ownership: ${previousOwner} -> ${newOwner}`);
    this.emit('ownership-transferred', { id, previousOwner, newOwner });
    return terminal;
  }

  /**
   * Get terminals by owner
   * @param {string} owner - 'sidebar' | 'canvas'
   */
  getTerminalsByOwner(owner) {
    return Array.from(this.terminals.values())
      .filter(t => (t.owner || 'sidebar') === owner);
  }

  /**
   * Clean up all terminals
   */
  async cleanup() {
    log.info('Cleaning up all terminals...');

    const promises = [];
    for (const terminal of this.terminals.values()) {
      promises.push(ptyHandler.killPTY(terminal.id));
    }

    await Promise.all(promises);
    this.terminals.clear();

    // Cleanup PTY handler
    await ptyHandler.cleanupImmediate();

    log.info('Cleanup complete');
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const terminals = Array.from(this.terminals.values());

    return {
      totalTerminals: terminals.length,
      localTerminals: terminals.length, // All terminals are now local
      terminalsByType: this.getTerminalCountsByType(),
      terminalsByState: this.getTerminalCountsByState()
    };
  }

  /**
   * Get terminal counts by type
   */
  getTerminalCountsByType() {
    const counts = {};
    for (const terminal of this.terminals.values()) {
      counts[terminal.terminalType] = (counts[terminal.terminalType] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get terminal counts by state
   */
  getTerminalCountsByState() {
    const counts = {};
    for (const terminal of this.terminals.values()) {
      counts[terminal.state] = (counts[terminal.state] || 0) + 1;
    }
    return counts;
  }
}

module.exports = new TerminalRegistry();
