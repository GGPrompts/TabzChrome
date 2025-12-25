/**
 * UnifiedSpawn - Single entry point for all terminal spawning
 * Consolidates agent-spawner.js and unified-spawn.js functionality
 *
 * Key features:
 * - Explicit terminal types with rich configuration
 * - Handler-based architecture
 * - Rate limiting and validation
 * - Docker container support
 * - Default environments and commands
 */

const { v4: uuidv4 } = require('uuid');
const terminalRegistry = require('./terminal-registry');
const ptyHandler = require('./pty-handler');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('UnifiedSpawn');

// Spawn handlers for different terminal types
const handlers = new Map();

// Rich terminal type configurations (from agent-spawner.js)
const terminalTypeConfigs = {
  'claude-code': {
    shell: 'bash',
    command: 'claude',
    color: '#ff6b35',
    icon: '🤖',
    resumable: true,
    defaultEnv: {
      CLAUDE_CODE_ENABLED: 'true'
    }
  },
  'opencode': {
    shell: 'bash',
    command: 'opencode',
    color: '#9333ea',
    icon: '💜',
    resumable: true,
    defaultEnv: {
      OPENCODE_ENABLED: 'true'
    }
  },
  'codex': {
    shell: 'bash',
    command: null,
    color: '#06b6d4',
    icon: '📚',
    resumable: true,
    defaultEnv: {}
  },
  'orchestrator': {
    shell: 'bash',
    command: 'claude --orchestrator',
    color: '#fbbf24',
    icon: '👑',
    resumable: false,
    defaultEnv: {
      ORCHESTRATOR_MODE: 'true'
    }
  },
  'gemini': {
    shell: 'bash',
    command: 'gemini',
    color: '#22c55e',
    icon: '✨',
    resumable: false,
    defaultEnv: {
      GEMINI_ENABLED: 'true'
    }
  },
  'docker-ai': {
    shell: 'bash',
    command: 'docker ai',
    color: '#2496ed',
    icon: '🐳',
    resumable: false,
    defaultEnv: {
      DOCKER_AI_ENABLED: 'true'
    }
  },
  'bash': {
    shell: 'bash',
    command: null,
    color: '#6b7280',
    icon: '📟',
    resumable: false,
    defaultEnv: {}
  },
  'dashboard': {
    shell: 'bash',
    command: null,
    color: '#3b82f6',
    icon: '📊',
    resumable: false,
    defaultEnv: {}
  },
  'script': {
    shell: 'bash',
    command: null,
    color: '#10b981',
    icon: '📜',
    resumable: false,
    defaultEnv: {}
  },
  'tui-tool': {
    shell: 'bash',
    command: null,
    color: '#f59e0b',
    icon: '🛠️',
    resumable: false,
    defaultEnv: {}
  }
};


class UnifiedSpawnSystem {
  constructor() {
    // Configuration limits
    this.MAX_TOTAL_TERMINALS = 20;
    this.MAX_SPAWN_PER_MINUTE = 10;

    // Track spawns
    this.spawnsInProgress = new Set();
    this.spawnHistory = [];
    this.activeSpawns = new Set(); // Track active spawn keys for deduplication

    // Initialize handlers
    this.initializeHandlers();
  }

  /**
   * Initialize spawn handlers for each terminal type
   */
  initializeHandlers() {
    // Create handlers for all terminal types with rich configuration
    Object.keys(terminalTypeConfigs).forEach(terminalType => {
      const config = terminalTypeConfigs[terminalType];

      handlers.set(terminalType, {
        validate: (options) => this.validateTerminalConfig(terminalType, options),
        spawn: (options) => this.spawnTerminal(terminalType, options),
        platform: ['local'], // Local only - docker-ai runs via docker.exe locally
        resumable: config.resumable,
        ...config // Include all rich configuration
      });
    });
  }

  /**
   * Main spawn method - single entry point for all terminal creation
   */
  async spawn(options) {
    // Use provided requestId from frontend, or generate new one
    const requestId = options.requestId || uuidv4();
    const startTime = Date.now();

    log.debug('Spawn request FULL CONFIG:', JSON.stringify(options, null, 2));

    // Extra debug for Gemini
    if (options?.terminalType === 'gemini') {
      log.debug('*** GEMINI TERMINAL DETECTED ***');
      log.debug('Gemini options:', JSON.stringify(options, null, 2));
    } else if (options?.name?.includes('gemini')) {
      log.warn('Name contains "gemini" but type is:', options?.terminalType);
    }

    try {
      // 1. Validate basic options
      const validation = await this.validateSpawnRequest(options);
      if (!validation.valid) {
        log.error('Validation failed:', validation.error);
        return {
          success: false,
          error: validation.error,
          requestId
        };
      }

      // 2. Check rate limits
      const rateLimitCheck = this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: rateLimitCheck.message,
          retryAfter: rateLimitCheck.retryAfter,
          requestId
        };
      }

      // 3. Check terminal count
      const activeTerminals = terminalRegistry.getActiveTerminalCount();
      if (activeTerminals >= this.MAX_TOTAL_TERMINALS) {
        return {
          success: false,
          error: `Maximum terminal limit reached (${this.MAX_TOTAL_TERMINALS}). Please close some terminals.`,
          requestId
        };
      }

      // 4. Get handler for terminal type
      const handler = handlers.get(options.terminalType);
      if (!handler) {
        log.error(`Unknown terminal type: ${options.terminalType}. Available types:`, Array.from(handlers.keys()));
        return {
          success: false,
          error: `Unknown terminal type: ${options.terminalType}`,
          requestId
        };
      }
      // Debug Gemini spawn
      if (options.terminalType === 'gemini') {
        log.debug('Processing Gemini spawn request with handler:', handler);
      }

      // 5. Validate with type-specific handler
      const handlerValidation = await handler.validate(options);
      if (!handlerValidation.valid) {
        return {
          success: false,
          error: handlerValidation.error,
          requestId
        };
      }

      // 6. Check platform support
      const platform = options.platform || 'local';
      if (!Array.isArray(handler.platform)) {
        handler.platform = [handler.platform];
      }
      if (!handler.platform.includes(platform)) {
        return {
          success: false,
          error: `Terminal type ${options.terminalType} does not support platform ${platform}`,
          requestId
        };
      }

      // 7. Check for duplicate spawns
      // CRITICAL FIX: Include sessionName for tmux terminals to avoid false duplicates during reconnection
      const spawnKey = options.sessionName
        ? `${options.terminalType}_${options.name}_${options.sessionName}`
        : `${options.terminalType}_${options.name}`;

      if (this.activeSpawns.has(spawnKey)) {
        log.warn('Duplicate spawn prevented:', spawnKey);
        return {
          success: false,
          error: `Terminal ${options.name} is already being spawned`,
          requestId
        };
      }
      this.activeSpawns.add(spawnKey);
      // Clean up spawn key after 5 seconds
      setTimeout(() => this.activeSpawns.delete(spawnKey), 5000);

      // 8. Track spawn in progress
      this.spawnsInProgress.add(requestId);

      // 9. Execute spawn with handler
      const terminal = await handler.spawn({
        ...options,
        requestId,
        resumable: handler.resumable
      });

      // 10. Record spawn in history
      this.recordSpawn({
        requestId,
        terminalId: terminal.id,
        terminalType: options.terminalType,
        platform,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      });

      // 11. Remove from in-progress
      this.spawnsInProgress.delete(requestId);

      return {
        success: true,
        terminal,
        requestId
      };

    } catch (error) {
      log.error('Spawn failed:', error);
      log.error('Error stack:', error.stack);
      log.debug('Failed config was:', JSON.stringify(options, null, 2));
      this.spawnsInProgress.delete(requestId);

      return {
        success: false,
        error: error.message || 'Failed to spawn terminal',
        requestId
      };
    }
  }

  /**
   * Validate spawn request
   */
  async validateSpawnRequest(options) {
    if (!options) {
      return { valid: false, error: 'Options are required' };
    }

    if (!options.terminalType) {
      return { valid: false, error: 'Terminal type is required' };
    }

    if (!options.name) {
      options.name = `${options.terminalType}-${Date.now()}`;
    }

    // Validate working directory if provided
    if (options.workingDir) {
      const fs = require('fs').promises;
      const os = require('os');
      const path = require('path');

      // Expand ~ to home directory
      let workingDir = options.workingDir;
      if (workingDir.startsWith('~/')) {
        workingDir = path.join(os.homedir(), workingDir.slice(2));
        options.workingDir = workingDir; // Update the options with expanded path
      } else if (workingDir === '~') {
        workingDir = os.homedir();
        options.workingDir = workingDir;
      }

      try {
        const stat = await fs.stat(workingDir);
        if (!stat.isDirectory()) {
          return { valid: false, error: 'Working directory must be a directory' };
        }
      } catch (error) {
        return { valid: false, error: `Working directory does not exist: ${workingDir}` };
      }
    }

    return { valid: true };
  }

  /**
   * Check rate limits
   */
  checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old history
    this.spawnHistory = this.spawnHistory.filter(spawn => spawn.timestamp > oneMinuteAgo);
    
    if (this.spawnHistory.length >= this.MAX_SPAWN_PER_MINUTE) {
      const oldestSpawn = this.spawnHistory[0];
      const retryAfter = Math.ceil((oldestSpawn.timestamp + 60000 - now) / 1000);
      
      return {
        allowed: false,
        message: `Rate limit exceeded. Maximum ${this.MAX_SPAWN_PER_MINUTE} spawns per minute.`,
        retryAfter
      };
    }

    return { allowed: true };
  }

  /**
   * Record spawn in history
   */
  recordSpawn(spawnInfo) {
    this.spawnHistory.push(spawnInfo);
    
    // Keep only last 100 spawns
    if (this.spawnHistory.length > 100) {
      this.spawnHistory = this.spawnHistory.slice(-100);
    }
  }

  // Unified validation method
  validateTerminalConfig(terminalType, config) {
    // Special validation for TUI tools
    if (terminalType === 'tui-tool' && !config.toolName && !config.commands) {
      return { valid: false, error: 'TUI tool requires either toolName or commands' };
    }
    return { valid: true };
  }

  // Unified spawn method - all terminals run locally
  async spawnTerminal(terminalType, config) {
    const typeConfig = terminalTypeConfigs[terminalType];

    // Merge configurations
    const finalConfig = {
      ...typeConfig,
      ...config,
      env: {
        ...typeConfig.defaultEnv,
        ...config.env
      }
    };

    log.debug(`Spawning ${terminalType} terminal with config:`, finalConfig);

    try {
      // All terminals spawn locally (docker-ai uses docker.exe ai command locally)
      const terminal = await this.spawnLocalTerminal(terminalType, finalConfig);

      return terminal;

    } catch (error) {
      log.error(`Failed to spawn ${terminalType} terminal:`, error);
      throw error;
    }
  }

  // Local terminal spawn
  async spawnLocalTerminal(terminalType, config) {
    const typeConfig = terminalTypeConfigs[terminalType];

    // REMOVED: Complex reconnection logic that was causing duplicate terminals
    // Terminals are now ephemeral - if they disconnect, spawn a new one
    // This simplifies state management and prevents zombie terminals

    // Handle size parameter - convert to cols/rows
    // Size should be provided by frontend (from spawn-options.json or global settings)
    // Fallback to 800x600 only if frontend doesn't send size (shouldn't happen)
    const size = config.size || { width: 800, height: 600 };
    const cols = Math.floor(size.width / 9);   // ~9px per char
    const rows = Math.floor(size.height / 17); // ~17px per line

    // Add cols/rows to config
    config.cols = cols;
    config.rows = rows;
    config.size = size; // Store original size for later reference

    log.debug(`Terminal size: ${size.width}x${size.height} -> ${cols}x${rows} (cols x rows)`);

    // Handle special cases
    if (terminalType === 'tui-tool') {
      // Determine the command to run - check command first (from spawn-options.json)
      let command = '';
      if (config.command) {
        // Use command directly from config (e.g., "tfe", "lazygit")
        command = config.command;
      } else if (config.commands && config.commands.length > 0) {
        command = config.commands[0];
      } else if (config.toolName) {
        const toolCommands = {
          'lazygit': 'lazygit',
          'bottom': 'bottom',
          'calcure': 'calcure',
          'htop': 'htop',
          'micro': 'micro',
          'lnav': 'lnav'
        };
        command = toolCommands[config.toolName] || config.toolName;
      }
      config.command = command || 'bash';
      config.toolName = config.toolName || 'custom';
    } else if (terminalType === 'dashboard') {
      config.command = config.dashboardScript || 'echo "Dashboard terminal ready"';
    }
    // Handle bash terminals with commands array (TFE, Micro Editor, etc.)
    else if (terminalType === 'bash' && config.commands && config.commands.length > 0) {
      config.command = config.commands.join(' && ');  // Join multiple commands with &&
      log.debug(`Setting bash command from commands array:`, config.command);
    }

    // Ensure tmux is enabled for resumable terminals
    // pty-handler checks useTmux, but unified-spawn uses resumable
    if (config.resumable && !config.useTmux) {
      config.useTmux = true;
    }

    // Register terminal
    const terminal = await terminalRegistry.registerTerminal(config);

    // NOTE: PTY handler automatically sends initial commands for AI terminals
    // No manual command sending needed here to avoid duplication

    return terminal;
  }


  /**
   * Get spawn statistics
   */
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const fiveMinutesAgo = now - 300000;

    return {
      activeTerminals: terminalRegistry.getActiveTerminalCount(),
      maxTerminals: this.MAX_TOTAL_TERMINALS,
      spawnsInProgress: this.spawnsInProgress.size,
      spawnsLastMinute: this.spawnHistory.filter(s => s.timestamp > oneMinuteAgo).length,
      spawnsLastFiveMinutes: this.spawnHistory.filter(s => s.timestamp > fiveMinutesAgo).length,
      rateLimit: this.MAX_SPAWN_PER_MINUTE
    };
  }

  /**
   * Get available terminal types
   */
  getAvailableTypes() {
    return Array.from(handlers.keys()).map(type => {
      const handler = handlers.get(type);
      return {
        type,
        platforms: handler.platform,
        resumable: handler.resumable
      };
    });
  }

  /**
   * Check if spawn is in progress
   */
  isSpawnInProgress(requestId) {
    return this.spawnsInProgress.has(requestId);
  }

  /**
   * Get spawn history
   */
  getSpawnHistory(limit = 10) {
    return this.spawnHistory.slice(-limit);
  }


  /**
   * Get terminal type configuration (from agent-spawner.js)
   */
  getTerminalTypeConfig(terminalType) {
    const config = terminalTypeConfigs[terminalType];
    if (!config) return null;

    return {
      ...config,
      platform: 'local'
    };
  }

  /**
   * Get all terminal types (from agent-spawner.js)
   */
  getTerminalTypes() {
    return Object.keys(terminalTypeConfigs);
  }

  /**
   * Get all terminal configurations with full details
   */
  getAllTerminalConfigs() {
    return Object.entries(terminalTypeConfigs).reduce((acc, [type, config]) => {
      acc[type] = {
        ...config,
        platform: 'local' // All terminals run locally
      };
      return acc;
    }, {});
  }

}

// Export singleton instance
module.exports = new UnifiedSpawnSystem();
