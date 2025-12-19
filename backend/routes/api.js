/**
 * Tabz API Routes - Simplified & Explicit
 *
 * Key principles:
 * - Minimal API surface (reduced from 120+ to ~15 endpoints)
 * - terminal-registry.js as single source of truth
 * - Explicit terminal types (no guessing)
 * - Clear validation and error handling
 */

const express = require('express');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const terminalRegistry = require('../modules/terminal-registry');
const unifiedSpawn = require('../modules/unified-spawn');

const router = express.Router();

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

/**
 * Rate limiter for spawn endpoint (POST /api/agents)
 * Prevents DoS attacks by limiting terminal spawning
 * 10 spawns per minute per IP is reasonable for normal use
 */
const spawnRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 requests per minute
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: 'Too many spawn requests',
    message: 'Rate limit exceeded. Maximum 10 terminal spawns per minute.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    // Use IP address for rate limiting
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const terminalTypes = unifiedSpawn.getTerminalTypes();

const spawnAgentSchema = Joi.object({
  name: Joi.string().min(1).max(50).optional(),
  terminalType: Joi.string().valid(...terminalTypes).required(),
  platform: Joi.string().valid('docker', 'local').default('local'),
  workingDir: Joi.string().optional(),
  resumable: Joi.boolean().default(false),
  color: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: Joi.string().max(10).optional(),
  env: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
  prompt: Joi.string().max(500).optional(),
  autoStart: Joi.boolean().default(true),
  agentConfigPath: Joi.string().optional()
});

const commandSchema = Joi.object({
  command: Joi.string().required().min(1).max(10000)
});

const resizeSchema = Joi.object({
  cols: Joi.number().integer().min(20).max(300).required(),
  rows: Joi.number().integer().min(10).max(100).required()
});

// =============================================================================
// VALIDATION MIDDLEWARE
// =============================================================================

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.details[0].message,
        details: error.details
      });
    }
    req.body = value;
    next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Invalid parameters',
        message: error.details[0].message
      });
    }
    req.params = value;
    next();
  };
}

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function errorHandler(err, req, res, next) {
  console.error('API Error:', err);
  
  // Known error types
  if (err.message.includes('not found')) {
    return res.status(404).json({
      error: 'Resource not found',
      message: err.message
    });
  }
  
  if (err.message.includes('Terminal type') || err.message.includes('Unknown terminal type')) {
    return res.status(400).json({
      error: 'Invalid terminal type',
      message: err.message,
      supportedTypes: terminalTypes
    });
  }
  
  if (err.message.includes('Permission denied') || err.message.includes('EACCES')) {
    return res.status(403).json({
      error: 'Permission denied',
      message: 'Unable to access the requested resource'
    });
  }
  
  // Generic server error
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
}

// =============================================================================
// AGENT ROUTES
// =============================================================================

/**
 * GET /api/spawn-options - List available spawn options from spawn-options.json
 */
router.get('/spawn-options', asyncHandler(async (req, res) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const spawnOptionsPath = path.join(__dirname, '../../public/spawn-options.json');
    const data = await fs.readFile(spawnOptionsPath, 'utf-8');
    const spawnConfig = JSON.parse(data);

    res.json({
      success: true,
      count: spawnConfig.spawnOptions.length,
      data: spawnConfig.spawnOptions,
      globalDefaults: spawnConfig.globalDefaults || {}, // Include globalDefaults
      projects: spawnConfig.projects || [] // Include projects
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load spawn options',
      message: error.message
    });
  }
}));

/**
 * PUT /api/spawn-options - Save spawn options to spawn-options.json
 */
router.put('/spawn-options', asyncHandler(async (req, res) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const { spawnOptions, globalDefaults, projects } = req.body;

    if (!Array.isArray(spawnOptions)) {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'spawnOptions must be an array'
      });
    }

    const spawnOptionsPath = path.join(__dirname, '../../public/spawn-options.json');

    // Read existing file to preserve projects, globalDefaults if not provided
    let existingGlobalDefaults = {};
    let existingProjects = [];
    try {
      const existingData = await fs.readFile(spawnOptionsPath, 'utf-8');
      const existingConfig = JSON.parse(existingData);
      existingGlobalDefaults = existingConfig.globalDefaults || {};
      existingProjects = existingConfig.projects || [];
    } catch (err) {
      // File doesn't exist or is invalid, use empty defaults
    }

    const configData = {
      projects: Array.isArray(projects) ? projects : existingProjects, // Use provided projects or preserve existing
      globalDefaults: globalDefaults || existingGlobalDefaults,
      spawnOptions
    };

    await fs.writeFile(
      spawnOptionsPath,
      JSON.stringify(configData, null, 2),
      'utf-8'
    );

    res.json({
      success: true,
      message: 'Spawn options saved successfully',
      count: spawnOptions.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save spawn options',
      message: error.message
    });
  }
}));

/**
 * POST /api/agents - Spawn new agent with explicit terminal type
 *
 * Required: terminalType (explicit - no guessing!)
 * Optional: name, platform, workingDir, env, etc.
 *
 * Rate limited: 10 requests per minute per IP (DoS prevention)
 */
router.post('/agents', spawnRateLimiter, validateBody(spawnAgentSchema), asyncHandler(async (req, res) => {
  const config = req.body;
  
  // Spawn agent using UnifiedSpawn for validation and rate limiting
  const result = await unifiedSpawn.spawn(config);
  
  if (!result.success) {
    return res.status(400).json({
      error: 'Failed to spawn agent',
      message: result.error,
      requestId: result.requestId,
      retryAfter: result.retryAfter
    });
  }
  
  const terminal = result.terminal;
  
  res.status(201).json({
    success: true,
    message: `Agent '${terminal.name}' spawned successfully`,
    data: {
      id: terminal.id,
      name: terminal.name,
      terminalType: terminal.terminalType,
      platform: terminal.platform,
      resumable: terminal.resumable,
      color: terminal.color,
      icon: terminal.icon,
      workingDir: terminal.workingDir,
      state: terminal.state,
      createdAt: terminal.createdAt
    }
  });
}));

/**
 * GET /api/agents - List all active agent terminals
 */
router.get('/agents', asyncHandler(async (req, res) => {
  const terminals = terminalRegistry.getAllTerminals();
  
  res.json({
    success: true,
    count: terminals.length,
    data: terminals.map(t => ({
      id: t.id,
      name: t.name,
      terminalType: t.terminalType, // Always explicit
      platform: t.platform,
      resumable: t.resumable,
      color: t.color,
      icon: t.icon,
      workingDir: t.workingDir,
      state: t.state,
      embedded: t.embedded,
      createdAt: t.createdAt,
      lastActivity: t.lastActivity
    }))
  });
}));

/**
 * GET /api/agents/:id - Get specific agent details
 */
router.get('/agents/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const terminal = terminalRegistry.getTerminal(id);
  
  if (!terminal) {
    return res.status(404).json({
      error: 'Agent not found',
      message: `No agent found with ID: ${id}`
    });
  }
  
  res.json({
    success: true,
    data: {
      id: terminal.id,
      name: terminal.name,
      terminalType: terminal.terminalType,
      platform: terminal.platform,
      resumable: terminal.resumable,
      color: terminal.color,
      icon: terminal.icon,
      workingDir: terminal.workingDir,
      state: terminal.state,
      embedded: terminal.embedded,
      createdAt: terminal.createdAt,
      lastActivity: terminal.lastActivity,
      config: terminal.config // Include full config for debugging
    }
  });
}));

/**
 * DELETE /api/agents/:id - Close agent and cleanup
 * Query params:
 *   - force: boolean (default: true) - If true, kills tmux session. If false, just removes from registry (detach mode)
 */
router.delete('/agents/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const force = req.query.force !== 'false'; // Default to true, only false if explicitly set
  const terminal = terminalRegistry.getTerminal(id);

  if (!terminal) {
    return res.status(404).json({
      error: 'Agent not found',
      message: `No agent found with ID: ${id}`
    });
  }

  // Close terminal - force=true kills tmux, force=false just removes from registry
  terminalRegistry.closeTerminal(id, force);

  // Broadcast to WebSocket clients so UI removes the tab
  const broadcast = req.app.get('broadcast');
  if (broadcast) {
    broadcast({ type: 'terminal-closed', data: { id } });
  }

  res.json({
    success: true,
    message: force
      ? `Agent '${terminal.name}' closed and tmux session killed`
      : `Agent '${terminal.name}' detached (tmux session preserved)`,
    data: {
      id: terminal.id,
      name: terminal.name,
      terminalType: terminal.terminalType,
      detached: !force
    }
  });
}));

/**
 * POST /api/agents/:id/command - Send command to agent
 */
router.post('/agents/:id/command', validateBody(commandSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { command } = req.body;
  
  const terminal = terminalRegistry.getTerminal(id);
  if (!terminal) {
    return res.status(404).json({
      error: 'Agent not found',
      message: `No agent found with ID: ${id}`
    });
  }
  
  if (terminal.state !== 'active') {
    return res.status(400).json({
      error: 'Agent not active',
      message: `Cannot send command to agent in state: ${terminal.state}`
    });
  }
  
  // Send command to terminal
  terminalRegistry.sendCommand(id, command);
  
  res.json({
    success: true,
    message: 'Command sent successfully',
    data: {
      terminalId: id,
      command: command.length > 100 ? command.substring(0, 100) + '...' : command,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * POST /api/agents/:id/resize - Resize terminal
 */
router.post('/agents/:id/resize', validateBody(resizeSchema), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { cols, rows } = req.body;
  
  const terminal = terminalRegistry.getTerminal(id);
  if (!terminal) {
    return res.status(404).json({
      error: 'Agent not found',
      message: `No agent found with ID: ${id}`
    });
  }
  
  // Resize terminal
  terminalRegistry.resizeTerminal(id, cols, rows);
  
  res.json({
    success: true,
    message: 'Terminal resized successfully',
    data: {
      terminalId: id,
      cols,
      rows
    }
  });
}));

// =============================================================================
// UTILITY ROUTES
// =============================================================================

/**
 * GET /api/terminal-types - Get available terminal types
 */
router.get('/terminal-types', asyncHandler(async (req, res) => {
  const availableTypes = unifiedSpawn.getAvailableTypes();
  const types = unifiedSpawn.getTerminalTypes();
  const typeConfigs = {};

  for (const type of types) {
    typeConfigs[type] = unifiedSpawn.getTerminalTypeConfig(type);
  }

  res.json({
    success: true,
    data: {
      types,
      configs: typeConfigs,
      availableTypes // Include platform and resumable info
    }
  });
}));

/**
 * GET /api/spawn-stats - Get spawn statistics
 */
router.get('/spawn-stats', asyncHandler(async (req, res) => {
  const stats = unifiedSpawn.getStats();
  
  res.json({
    success: true,
    data: stats
  });
}));

/**
 * GET /api/health - Health check for load balancers, monitoring, PM2
 */
router.get('/health', asyncHandler(async (req, res) => {
  const terminals = terminalRegistry.getAllTerminals();
  const memUsage = process.memoryUsage();

  res.json({
    success: true,
    status: 'healthy',
    data: {
      uptime: Math.floor(process.uptime()),
      activeTerminals: terminals.filter(t => t.state === 'active').length,
      totalTerminals: terminals.length,
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        unit: 'MB'
      },
      version: require('../package.json').version,
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/mcp/inspector-command - Get the command to launch MCP Inspector
 * Returns the full npx command with the correct path to the tabz-mcp-server
 */
router.get('/mcp/inspector-command', asyncHandler(async (req, res) => {
  const path = require('path');

  // Get the path to the tabz-mcp-server relative to the backend
  const mcpServerPath = path.resolve(__dirname, '../../tabz-mcp-server/dist/index.js');

  res.json({
    success: true,
    data: {
      command: `npx @modelcontextprotocol/inspector node ${mcpServerPath}`,
      mcpServerPath,
      note: 'Installs on first use via npx'
    }
  });
}));

/**
 * GET /api/tmux/sessions - List active tmux sessions (simple)
 */
router.get('/tmux/sessions', asyncHandler(async (req, res) => {
  const { execSync } = require('child_process');

  try {
    // List tmux sessions with format: session_name:session_id
    const output = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', { encoding: 'utf8' });
    const sessions = output.trim().split('\n').filter(s => s.length > 0);

    res.json({
      success: true,
      data: {
        sessions,
        count: sessions.length
      }
    });
  } catch (error) {
    // If tmux server is not running or no sessions exist
    if (error.status === 1) {
      res.json({
        success: true,
        data: {
          sessions: [],
          count: 0
        }
      });
    } else {
      throw error;
    }
  }
}));

// =============================================================================
// TMUX SESSION MANAGER ENDPOINTS
// =============================================================================

const tmuxSessionManager = require('../modules/tmux-session-manager');

/**
 * GET /api/tmux/sessions/detailed - List all sessions with rich metadata
 * Returns:
 * - Basic info (name, windows, attached)
 * - Working directory & git branch
 * - AI tool detection
 * - Claude Code statusline (if applicable)
 * - Tabz managed vs external
 */
router.get('/tmux/sessions/detailed', asyncHandler(async (req, res) => {
  const sessions = await tmuxSessionManager.listDetailedSessions();
  const grouped = tmuxSessionManager.groupSessions(sessions);

  res.json({
    success: true,
    data: {
      sessions,
      grouped,
      count: sessions.length,
      counts: {
        tabz: grouped.tabz.length,
        claudeCode: grouped.claudeCode.length,
        external: grouped.external.length,
      }
    }
  });
}));

/**
 * GET /api/tmux/sessions/:name - Get detailed info for a specific session
 */
router.get('/tmux/sessions/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const sessions = await tmuxSessionManager.listDetailedSessions();
  const session = sessions.find(s => s.name === name);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: `Session ${name} not found`
    });
  }

  res.json({
    success: true,
    data: session
  });
}));

/**
 * GET /api/tmux/sessions/:name/preview - Capture pane content for preview
 * Query params:
 * - lines: number of lines to capture (default: 100)
 * - window: window index (default: 0)
 * - full: capture full scrollback (default: false)
 */
router.get('/tmux/sessions/:name/preview', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const lines = parseInt(req.query.lines || '100', 10);
  const windowIndex = parseInt(req.query.window || '0', 10);
  const full = req.query.full === 'true';

  let result;
  if (full) {
    result = await tmuxSessionManager.captureFullScrollback(name, windowIndex);
  } else {
    result = await tmuxSessionManager.capturePanePreview(name, lines, windowIndex);
  }

  if (result.success) {
    res.json({
      success: true,
      data: {
        content: result.content,
        lines: result.lines,
        paneId: result.paneId
      }
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * GET /api/tmux/sessions/:name/statusline - Get Claude Code statusline
 * Only works for Claude Code sessions
 */
router.get('/tmux/sessions/:name/statusline', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const sessions = await tmuxSessionManager.listDetailedSessions();
  const session = sessions.find(s => s.name === name);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: `Session ${name} not found`
    });
  }

  if (session.aiTool !== 'claude-code') {
    return res.status(400).json({
      success: false,
      error: `Session ${name} is not a Claude Code session`
    });
  }

  res.json({
    success: true,
    data: {
      claudeState: session.claudeState,
      statusIcon: tmuxSessionManager.getStatusIcon(session)
    }
  });
}));

/**
 * GET /api/tmux/sessions/:name/windows - List windows for a session
 */
router.get('/tmux/sessions/:name/windows', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const result = await tmuxSessionManager.listWindows(name);

  if (result.success) {
    res.json({
      success: true,
      data: result.windows
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * POST /api/tmux/sessions/:name/command - Execute tmux control command on session
 * Body: { command: string }
 * Example: { command: "split-window -h" } → executes tmux split-window -t sessionName -h
 * Does NOT send keys to terminal - safe for TUI apps!
 */
router.post('/tmux/sessions/:name/command', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { command } = req.body;

  if (!command || typeof command !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Command is required'
    });
  }

  const result = await tmuxSessionManager.executeTmuxCommand(name, command);

  if (result.success) {
    res.json({
      success: true,
      message: `Command executed on session ${name}`
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * POST /api/tmux/refresh/:name - Refresh tmux session display
 * Uses send-keys with empty string to trigger redraw.
 * NOTE: refresh-client requires an attached client, but Chrome extension
 * terminals connect via PTY, not tmux attach. Send-keys works for all.
 */
router.post('/tmux/refresh/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { execSync } = require('child_process');

  try {
    // Send empty key to trigger redraw (refresh-client needs attached client, not PTY)
    execSync(`tmux send-keys -t "${name}" '' 2>/dev/null || true`, {
      encoding: 'utf8',
      timeout: 1000
    });

    res.json({
      success: true,
      message: `Refreshed tmux session ${name}`
    });
  } catch (error) {
    // Silently succeed even on error - session might not exist
    res.json({
      success: true,
      message: `Refresh attempted for ${name}`
    });
  }
}));

/**
 * DELETE /api/tmux/sessions/:name - Kill a tmux session
 * WARNING: This is destructive and cannot be undone
 */
router.delete('/tmux/sessions/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const result = await tmuxSessionManager.killSession(name);

  if (result.success) {
    // Broadcast to WebSocket clients so UI removes the tab (if it's a ctt- session)
    if (name.startsWith('ctt-')) {
      const broadcast = req.app.get('broadcast');
      if (broadcast) {
        broadcast({ type: 'terminal-closed', data: { id: name } });
      }
    }

    res.json({
      success: true,
      message: `Session ${name} killed`
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * POST /api/tmux/detach/:name - Detach from a tmux session (keep session alive)
 * Used when moving terminals between browser windows
 */
router.post('/tmux/detach/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { execSync } = require('child_process');

  try {
    // Check if session exists
    try {
      execSync(`tmux has-session -t "${name}" 2>/dev/null`);
    } catch {
      return res.status(404).json({
        success: false,
        error: `Session ${name} not found`
      });
    }

    // Detach all clients from this session (non-destructive)
    // This doesn't kill the session, just detaches clients
    execSync(`tmux detach-client -s "${name}" 2>/dev/null || true`);

    console.log(`[API] Detached from tmux session: ${name}`);

    res.json({
      success: true,
      message: `Detached from session ${name}`,
      session: name
    });
  } catch (err) {
    console.error(`[API] Failed to detach from tmux session ${name}:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}));

/**
 * GET /api/tmux/list - List all active tmux sessions
 * Returns array of session names for preview before cleanup
 */
router.get('/tmux/list', asyncHandler(async (req, res) => {
  const { execSync } = require('child_process');

  try {
    // Get list of all tmux sessions
    const output = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true', {
      encoding: 'utf-8'
    }).trim();

    const sessions = output ? output.split('\n').filter(s => s) : [];

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (err) {
    console.error('[API] Failed to list tmux sessions:', err.message);
    res.json({
      success: true,
      sessions: [],
      count: 0
    });
  }
}));

/**
 * GET /api/tmux/info/:name - Get information about a tmux session
 * Returns pane title and window count for tab naming
 */
router.get('/tmux/info/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { execSync } = require('child_process');

  try {
    // Check if session exists
    try {
      execSync(`tmux has-session -t "${name}" 2>/dev/null`);
    } catch {
      return res.status(404).json({
        success: false,
        error: `Session ${name} not found`
      });
    }

    // Get window name, pane title, window count, pane count, current working directory, and pane state
    // Format: "window_name|pane_title|session_windows|window_index|pane_count|pane_current_path|pane_marked|window_zoomed_flag"
    const info = execSync(
      `tmux display-message -t "${name}" -p "#{window_name}|#{pane_title}|#{session_windows}|#{window_index}|#{window_panes}|#{pane_current_path}|#{pane_marked}|#{window_zoomed_flag}"`,
      { encoding: 'utf-8' }
    ).trim();

    const [windowName, paneTitle, windowCountStr, activeWindowStr, paneCountStr, currentPath, paneMarkedStr, paneZoomedStr] = info.split('|');
    const paneMarked = paneMarkedStr === '1';
    const paneZoomed = paneZoomedStr === '1';
    const windowCount = parseInt(windowCountStr, 10);
    const activeWindow = parseInt(activeWindowStr, 10);
    const paneCount = parseInt(paneCountStr, 10);

    // Shorten path for display (replace home directory with ~)
    const homeDir = require('os').homedir();
    const displayPath = currentPath ? currentPath.replace(homeDir, '~') : null;

    // Debug: Log raw tmux values
    console.log(`[API] Tmux info for ${name}:`, { windowName, paneTitle, windowCount, paneCount, currentPath: displayPath });

    // Prefer window_name when it differs from pane_title and is not generic
    // This makes tab names update dynamically for bash terminals running TUI apps
    // Examples:
    //   - Bash running lazygit: window_name="lazygit", pane_title="bash" → use "lazygit"
    //   - Claude Code: window_name="bash", pane_title="Editing: file.tsx" → use pane_title
    //   - Plain bash: window_name="bash", pane_title="bash" → use "bash"

    // Check if pane_title looks like a hostname (MattDesktop, Matt-Desktop, localhost, ip-xxx)
    const hostnamePattern = /^(localhost|[\w]+-?(desktop|laptop)|ip-[\d-]+)$/i
    const paneTitleIsHostname = hostnamePattern.test(paneTitle)

    // Check if window_name looks like a directory path (contains ., /, ~, or ..)
    // Examples: "./classics", "../go", "~/projects", "/home/user"
    const windowNameIsDirectory = windowName && /[.\/~]/.test(windowName)

    // Determine base name (app or useful title)
    let baseName
    if (paneTitleIsHostname || paneTitle === 'bash') {
      // If pane_title is generic (hostname or "bash"), use window_name if it's an app
      baseName = windowName && !windowNameIsDirectory ? windowName : 'bash'
    } else {
      // Otherwise use pane_title (e.g., "Editing: file.tsx" from Claude Code)
      baseName = paneTitle
    }

    // Build display name with optional command and working directory
    // Examples:
    //   - "bash @ ~/projects/terminal-tabs"
    //   - "gitui @ ~/my-repo"
    //   - "✳ Claude Auto Status @ ~/projects/terminal-tabs"
    //   - "bash (./tmuxplexer) @ ~/tmuxplexer"
    let displayName = baseName

    // Append command if window_name is a directory-like command (./app, ../script)
    if (windowNameIsDirectory) {
      displayName = `${displayName} (${windowName})`
    }

    // Append working directory if available and different from command
    // Skip if displayPath already appears in the name (avoid "bash (./foo) @ ./foo")
    if (displayPath && !displayName.includes(displayPath)) {
      displayName = `${displayName} @ ${displayPath}`
    }

    // Debug: Log final display name
    console.log(`[API] Display name for ${name}: "${displayName}" (baseName="${baseName}", cmd=${windowNameIsDirectory ? windowName : 'none'}, path=${displayPath})`);

    res.json({
      success: true,
      paneTitle: displayName, // Return as paneTitle for backward compatibility
      windowCount: windowCount || 1,
      activeWindow: activeWindow || 0,
      paneCount: paneCount || 1,
      paneMarked,      // NEW: Pane is marked (for swap operations)
      paneZoomed,      // NEW: Pane is zoomed (full screen)
      sessionName: name
    });
  } catch (err) {
    console.error(`[API] Failed to get tmux info for ${name}:`, err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}));

/**
 * GET /api/claude-status?dir=<path>&sessionName=<name> - Get Claude Code status from state-tracker file
 * Returns status (idle, working, tool_use, awaiting_input) for a specific terminal
 *
 * Matching strategy:
 * 1. If sessionName provided: Match by tmux pane ID (most specific, handles multiple sessions in same dir)
 * 2. Otherwise: Match by working_dir and return most recent (fallback for non-tmux)
 */
router.get('/claude-status', asyncHandler(async (req, res) => {
  const workingDir = req.query.dir;
  const sessionName = req.query.sessionName;
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');


  if (!workingDir) {
    return res.status(400).json({
      success: false,
      error: 'Missing dir parameter'
    });
  }

  try {
    const stateDir = '/tmp/claude-code-state';
    let tmuxPaneId = null;

    // If sessionName provided, get the tmux pane ID for precise matching
    if (sessionName) {
      try {
        // First check if session exists (silent check)
        execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
        // Get pane ID for this session (format: %123)
        tmuxPaneId = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id}"`, { encoding: 'utf-8' }).trim().split('\n')[0];
      } catch (err) {
        // Session doesn't exist - silently fall back to dir matching
        // This is expected during backend restart before terminals reconnect
      }
    }

    // Search all state files for matching terminal
    const files = fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : [];
    let bestMatch = null;
    let bestMatchTime = 0;

    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue;

      try {
        const filePath = path.join(stateDir, file);
        const stateData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Match by tmux pane if we have it (most specific)
        if (tmuxPaneId && stateData.tmux_pane === tmuxPaneId) {
          const updateTime = stateData.last_updated ? new Date(stateData.last_updated).getTime() : 0;

          if (!bestMatch || updateTime > bestMatchTime) {
            bestMatch = {
              success: true,
              status: stateData.status || 'unknown',
              current_tool: stateData.current_tool || '',
              last_updated: stateData.last_updated || '',
              sessionId: stateData.session_id || file.replace('.json', ''),
              tmuxPane: stateData.tmux_pane,
              details: stateData.details || null,
              subagent_count: stateData.subagent_count || 0
            };
            bestMatchTime = updateTime;
          }
        }
        // Fallback: Match by working directory only if no pane ID
        else if (!tmuxPaneId && stateData.working_dir === workingDir) {
          const updateTime = stateData.last_updated ? new Date(stateData.last_updated).getTime() : 0;

          if (!bestMatch || updateTime > bestMatchTime) {
            bestMatch = {
              success: true,
              status: stateData.status || 'unknown',
              current_tool: stateData.current_tool || '',
              last_updated: stateData.last_updated || '',
              sessionId: stateData.session_id || file.replace('.json', ''),
              details: stateData.details || null,
              matchType: 'exact',
              subagent_count: stateData.subagent_count || 0
            };
            bestMatchTime = updateTime;
          }
        }
        // Third tier: Check if Claude's working_dir is a child of terminal's workingDir
        // This allows terminals started in ~ to show status for Claude running in ~/projects/foo
        else if (!tmuxPaneId && stateData.working_dir && stateData.working_dir.startsWith(workingDir + '/')) {
          const updateTime = stateData.last_updated ? new Date(stateData.last_updated).getTime() : 0;

          // Only use parent match if we don't have an exact match yet
          if (!bestMatch || (bestMatch.matchType !== 'exact' && updateTime > bestMatchTime)) {
            bestMatch = {
              success: true,
              status: stateData.status || 'unknown',
              current_tool: stateData.current_tool || '',
              last_updated: stateData.last_updated || '',
              sessionId: stateData.session_id || file.replace('.json', ''),
              details: stateData.details || null,
              matchType: 'parent',
              subagent_count: stateData.subagent_count || 0
            };
            bestMatchTime = updateTime;
          }
        }
      } catch (err) {
        // Skip invalid JSON files
        continue;
      }
    }

    // Return best match or unknown if no match found
    if (bestMatch) {
      // Try to merge context window data from statusline
      if (bestMatch.sessionId) {
        try {
          const contextFile = path.join(stateDir, `${bestMatch.sessionId}-context.json`);
          if (fs.existsSync(contextFile)) {
            const contextData = JSON.parse(fs.readFileSync(contextFile, 'utf-8'));
            if (contextData.context_window) {
              bestMatch.context_window = contextData.context_window;
            }
          }
        } catch (err) {
          // Context file not found or invalid - that's okay, statusline may not have run yet
        }
      }
      res.json(bestMatch);
    } else {
      res.json({
        success: true,
        status: 'unknown',
        sessionId: null
      });
    }
  } catch (err) {
    console.error(`[API] Failed to get Claude status for ${workingDir}:`, err.message);
    res.json({
      success: true,
      status: 'unknown'
    });
  }
}));

/**
 * POST /api/claude-status/cleanup - Clean up stale state files
 * Removes state files for:
 * 1. Tmux sessions that no longer exist
 * 2. Files older than 7 days
 * 3. Files with "none" as tmux_pane (non-tmux sessions older than 1 day)
 * 4. Debug files older than 1 hour (accumulate 400+ files/day!)
 */
router.post('/claude-status/cleanup', asyncHandler(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { execSync } = require('child_process');

  try {
    const stateDir = '/tmp/claude-code-state';

    if (!fs.existsSync(stateDir)) {
      return res.json({
        success: true,
        removed: 0,
        message: 'State directory does not exist'
      });
    }

    // Get all active tmux panes
    let activePanes = new Set();
    try {
      const panes = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
      activePanes = new Set(panes.trim().split('\n').filter(p => p));
    } catch (err) {
      console.warn('[API] Could not list tmux panes:', err.message);
    }

    const files = fs.readdirSync(stateDir);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * oneDayMs;
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue;

      try {
        const filePath = path.join(stateDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        // Read file to check tmux_pane
        let shouldDelete = false;
        let reason = '';

        try {
          const stateData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const tmuxPane = stateData.tmux_pane;

          // Delete if:
          // 1. File older than 7 days
          if (fileAge > sevenDaysMs) {
            shouldDelete = true;
            reason = 'older than 7 days';
          }
          // 2. Tmux pane specified but no longer exists
          else if (tmuxPane && tmuxPane !== 'none' && !activePanes.has(tmuxPane)) {
            shouldDelete = true;
            reason = 'tmux session ended';
          }
          // 3. Non-tmux session (pane: "none") not updated in last hour (likely stale)
          else if (tmuxPane === 'none') {
            const lastUpdated = stateData.last_updated ? new Date(stateData.last_updated).getTime() : 0;
            const hourAgo = now - (60 * 60 * 1000);
            if (lastUpdated < hourAgo || fileAge > oneDayMs) {
              shouldDelete = true;
              reason = 'non-tmux session inactive for 1+ hour';
            }
          }
        } catch (jsonErr) {
          // Invalid JSON - delete if older than 1 day
          if (fileAge > oneDayMs) {
            shouldDelete = true;
            reason = 'invalid JSON';
          }
        }

        if (shouldDelete) {
          fs.unlinkSync(filePath);
          removed++;
          console.log(`[API] Deleted state file ${file} (${reason})`);
        }
      } catch (err) {
        console.warn(`[API] Error processing ${file}:`, err.message);
      }
    }

    // Clean up debug directory (debug logs from hooks)
    let debugRemoved = 0;
    const debugDir = path.join(stateDir, 'debug');
    if (fs.existsSync(debugDir)) {
      try {
        const debugFiles = fs.readdirSync(debugDir);
        const oneHourMs = 60 * 60 * 1000; // 1 hour

        for (const file of debugFiles) {
          if (!file.endsWith('.json')) continue;

          try {
            const filePath = path.join(debugDir, file);
            const stats = fs.statSync(filePath);
            const fileAge = now - stats.mtimeMs;

            // Delete debug files older than 1 hour (they accumulate VERY quickly)
            // Debug files are only useful for active debugging anyway
            if (fileAge > oneHourMs) {
              fs.unlinkSync(filePath);
              debugRemoved++;
            }
          } catch (err) {
            console.warn(`[API] Error processing debug file ${file}:`, err.message);
          }
        }
        console.log(`[API] Deleted ${debugRemoved} debug files`);
      } catch (err) {
        console.warn('[API] Error cleaning debug directory:', err.message);
      }
    }

    // Clean up context files (from statusline script)
    // Delete if: parent state file doesn't exist OR older than 1 hour
    let contextRemoved = 0;
    const oneHourMs = 60 * 60 * 1000;
    const contextFiles = files.filter(f => f.endsWith('-context.json'));

    for (const file of contextFiles) {
      try {
        const filePath = path.join(stateDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;

        // Extract session ID from filename (e.g., "_30-context.json" -> "_30")
        const sessionId = file.replace('-context.json', '');
        const parentStateFile = path.join(stateDir, `${sessionId}.json`);

        // Delete if parent state file doesn't exist or context file is stale
        if (!fs.existsSync(parentStateFile) || fileAge > oneHourMs) {
          fs.unlinkSync(filePath);
          contextRemoved++;
          console.log(`[API] Deleted context file ${file} (${!fs.existsSync(parentStateFile) ? 'orphaned' : 'stale'})`);
        }
      } catch (err) {
        console.warn(`[API] Error processing context file ${file}:`, err.message);
      }
    }

    const totalRemoved = removed + debugRemoved + contextRemoved;
    const message = `Cleaned up ${removed} state, ${contextRemoved} context, ${debugRemoved} debug file(s)`;

    res.json({
      success: true,
      removed: totalRemoved,
      stateFilesRemoved: removed,
      contextFilesRemoved: contextRemoved,
      debugFilesRemoved: debugRemoved,
      message
    });
  } catch (err) {
    console.error('[API] Failed to clean up state files:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}));

// =============================================================================
// ORPHANED SESSIONS MANAGEMENT (Ghost Badge Feature)
// =============================================================================

/**
 * GET /api/tmux/orphaned-sessions - List orphaned ctt-* tmux sessions
 * Returns sessions that exist in tmux but are NOT in the terminal registry
 * These are "ghost" sessions that can be reattached or killed
 */
router.get('/tmux/orphaned-sessions', asyncHandler(async (req, res) => {
  const { execSync } = require('child_process');

  try {
    // Get all tmux sessions
    let tmuxSessions = [];
    try {
      const output = execSync('tmux list-sessions -F "#{session_name}" 2>/dev/null', { encoding: 'utf8' });
      tmuxSessions = output.trim().split('\n').filter(s => s.length > 0);
    } catch (err) {
      // tmux server not running or no sessions
      if (err.status !== 1) {
        throw err;
      }
    }

    // Filter to only ctt-* prefixed sessions (Chrome extension terminals)
    const cttSessions = tmuxSessions.filter(s => s.startsWith('ctt-'));

    // Get all terminal IDs currently in the registry
    const registeredIds = new Set(terminalRegistry.getAllTerminals().map(t => t.id));

    // Find orphaned sessions (in tmux but not in registry)
    const orphanedSessions = cttSessions.filter(session => !registeredIds.has(session));

    res.json({
      success: true,
      data: {
        orphanedSessions,
        count: orphanedSessions.length,
        totalTmuxSessions: tmuxSessions.length,
        totalCttSessions: cttSessions.length,
        registeredTerminals: registeredIds.size
      }
    });
  } catch (error) {
    console.error('[API] Failed to get orphaned sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

/**
 * POST /api/tmux/reattach - Reattach orphaned sessions to the terminal registry
 * Body: { sessions: string[] } - Array of tmux session names to reattach
 * This creates new terminal entries in the registry for orphaned tmux sessions
 */
router.post('/tmux/reattach', asyncHandler(async (req, res) => {
  const { sessions } = req.body;
  const { execSync } = require('child_process');

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'sessions array is required'
    });
  }

  const results = {
    success: [],
    failed: []
  };

  for (const sessionName of sessions) {
    // Validate session name (must be ctt-* prefix)
    if (!sessionName.startsWith('ctt-')) {
      results.failed.push({ session: sessionName, error: 'Invalid session name (must start with ctt-)' });
      continue;
    }

    // Check if session exists in tmux
    try {
      execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
    } catch {
      results.failed.push({ session: sessionName, error: 'Session does not exist in tmux' });
      continue;
    }

    // Check if already in registry
    const existingTerminal = terminalRegistry.getTerminal(sessionName);
    if (existingTerminal) {
      results.failed.push({ session: sessionName, error: 'Session already registered' });
      continue;
    }

    try {
      // Get session info from tmux for better naming
      let paneTitle = 'Recovered Session';
      let workingDir = process.env.HOME;
      try {
        const info = execSync(
          `tmux display-message -t "${sessionName}" -p "#{pane_title}|#{pane_current_path}"`,
          { encoding: 'utf-8' }
        ).trim();
        const [title, path] = info.split('|');
        if (title && title !== 'bash') paneTitle = title;
        if (path) workingDir = path;
      } catch (e) {
        // Use defaults if tmux info fails
      }

      // Extract profile name from session ID (ctt-ProfileName-shortId)
      const parts = sessionName.split('-');
      const profileName = parts.length >= 2 ? parts[1] : 'Recovered';
      const displayName = `${profileName} (recovered)`;

      // Register the terminal with the existing tmux session
      const terminal = await terminalRegistry.registerTerminal({
        id: sessionName,  // Use tmux session name as ID
        name: displayName,
        terminalType: 'bash',
        workingDir,
        useTmux: true,
        sessionName: sessionName,  // Attach to existing session
        isChrome: true,
      });

      results.success.push({
        session: sessionName,
        terminalId: terminal.id,
        name: terminal.name
      });

      // Broadcast to WebSocket clients so UI shows the new tab
      // IMPORTANT: Send the full terminal object (same as normal spawn in server.js:79)
      // This ensures profile, sessionName, ptyInfo etc are all included
      // Previously only sent a subset which caused missing profile settings on reattach
      const broadcast = req.app.get('broadcast');
      if (broadcast) {
        broadcast({ type: 'terminal-spawned', data: terminal });
      }
    } catch (error) {
      results.failed.push({ session: sessionName, error: error.message });
    }
  }

  res.json({
    success: true,
    data: results,
    message: `Reattached ${results.success.length} session(s), ${results.failed.length} failed`
  });
}));

/**
 * DELETE /api/tmux/sessions/bulk - Kill multiple tmux sessions
 * Body: { sessions: string[] } - Array of tmux session names to kill
 * WARNING: This is destructive and cannot be undone
 */
router.delete('/tmux/sessions/bulk', asyncHandler(async (req, res) => {
  const { sessions } = req.body;
  const { execSync } = require('child_process');

  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'sessions array is required'
    });
  }

  const results = {
    killed: [],
    failed: []
  };

  for (const sessionName of sessions) {
    try {
      execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`);
      results.killed.push(sessionName);

      // Broadcast to WebSocket clients so UI removes the tab (if it was registered)
      if (sessionName.startsWith('ctt-')) {
        const broadcast = req.app.get('broadcast');
        if (broadcast) {
          broadcast({ type: 'terminal-closed', data: { id: sessionName } });
        }
      }
    } catch (err) {
      results.failed.push({ session: sessionName, error: 'Session not found or already killed' });
    }
  }

  res.json({
    success: true,
    data: results,
    message: `Killed ${results.killed.length} session(s), ${results.failed.length} failed`
  });
}));

/**
 * POST /api/tmux/cleanup - Kill all tmux sessions matching a pattern
 * WARNING: This is destructive and cannot be undone
 */
router.post('/tmux/cleanup', asyncHandler(async (req, res) => {
  const { pattern } = req.body;

  if (!pattern || typeof pattern !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Pattern is required'
    });
  }

  try {
    const { execSync } = require('child_process');

    // List all sessions matching pattern
    const sessionsOutput = execSync('tmux ls -F "#{session_name}" 2>/dev/null || echo ""').toString().trim();
    const allSessions = sessionsOutput.split('\n').filter(s => s);

    // Filter by pattern (simple wildcard matching)
    const patternRegex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matchingSessions = allSessions.filter(s => patternRegex.test(s));

    // Kill each matching session
    let killed = 0;
    for (const session of matchingSessions) {
      try {
        execSync(`tmux kill-session -t "${session}" 2>/dev/null`);
        killed++;
      } catch (err) {
        console.warn(`[API] Failed to kill session ${session}:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `Killed ${killed} session(s) matching pattern "${pattern}"`,
      killed,
      sessions: matchingSessions
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
}));

/**
 * POST /api/console-log - Receive browser console logs
 * Claude-optimized: Structured, compact logs for tmux capture-pane debugging
 * Writes to logs/browser.log for separate viewing in logs window
 */
const browserLogPath = require('path').join(__dirname, '../logs/browser.log');
const browserLogDir = require('path').dirname(browserLogPath);

// Ensure logs directory exists
if (!require('fs').existsSync(browserLogDir)) {
  require('fs').mkdirSync(browserLogDir, { recursive: true });
}

// Create/clear browser log file on startup
require('fs').writeFileSync(browserLogPath, `--- Browser Console Log Started: ${new Date().toISOString()} ---\n`);

router.post('/console-log', asyncHandler(async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Expected logs array' });
  }

  const fs = require('fs');

  logs.forEach(({ level, message, source, timestamp }) => {
    // Format: [HH:MM:SS] [LEVEL] [source] message
    const time = new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
    const levelTag = level.toUpperCase().padEnd(5);
    const sourceTag = source ? `[${source}]` : '';
    const line = `[${time}] ${levelTag} ${sourceTag} ${message}\n`;

    // Append to browser log file
    fs.appendFileSync(browserLogPath, line);
  });

  res.json({ success: true, received: logs.length });
}));

// =============================================================================
// MCP CONFIG ENDPOINTS
// =============================================================================

const fs = require('fs').promises;
const configPath = require('path').join(__dirname, '../../mcp-config.json');

// Default MCP tools (individual tool IDs) - core tools always enabled
const CORE_TOOLS = ['tabz_list_tabs', 'tabz_switch_tab', 'tabz_rename_tab', 'tabz_get_page_info'];
const DEFAULT_ENABLED_TOOLS = [
  ...CORE_TOOLS,
  'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_open_url', 'tabz_get_console_logs'
];

/**
 * GET /api/mcp-config - Get MCP tool configuration
 * Returns enabled tools and URL settings
 */
router.get('/mcp-config', asyncHandler(async (req, res) => {
  let config = {
    enabledTools: DEFAULT_ENABLED_TOOLS,
    allowAllUrls: false,
    customDomains: ''
  };

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const savedConfig = JSON.parse(data);

    // Support both new (enabledTools) and legacy (enabledGroups) formats
    if (savedConfig.enabledTools) {
      config.enabledTools = savedConfig.enabledTools;
    } else if (savedConfig.enabledGroups) {
      // Legacy format - return defaults for migration
      console.log('[API] Legacy MCP config format detected, using defaults');
    }

    // URL settings
    if (savedConfig.allowAllUrls !== undefined) {
      config.allowAllUrls = savedConfig.allowAllUrls;
    }
    if (savedConfig.customDomains !== undefined) {
      config.customDomains = savedConfig.customDomains;
    }

    // Ensure core tools are always enabled
    for (const coreTool of CORE_TOOLS) {
      if (!config.enabledTools.includes(coreTool)) {
        config.enabledTools.unshift(coreTool);
      }
    }
  } catch (err) {
    // File doesn't exist, use defaults
    if (err.code !== 'ENOENT') {
      console.error('[API] Error reading MCP config:', err.message);
    }
  }

  res.json({
    success: true,
    enabledTools: config.enabledTools,
    allowAllUrls: config.allowAllUrls,
    customDomains: config.customDomains
  });
}));

/**
 * POST /api/mcp-config - Save MCP tool configuration
 * Body: { enabledTools: string[], allowAllUrls?: boolean, customDomains?: string }
 */
router.post('/mcp-config', asyncHandler(async (req, res) => {
  const { enabledTools, allowAllUrls, customDomains } = req.body;

  // Read existing config to preserve other settings
  let existingConfig = {};
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    existingConfig = JSON.parse(data);
  } catch (err) {
    // File doesn't exist, start fresh
  }

  // Build new config
  const config = {
    ...existingConfig,
    updatedAt: new Date().toISOString()
  };

  // Update enabledTools if provided
  if (Array.isArray(enabledTools)) {
    // Ensure core tools are always included
    const finalTools = [...enabledTools];
    for (const coreTool of CORE_TOOLS) {
      if (!finalTools.includes(coreTool)) {
        finalTools.unshift(coreTool);
      }
    }
    config.enabledTools = finalTools;
  }

  // Update URL settings if provided
  if (allowAllUrls !== undefined) {
    config.allowAllUrls = Boolean(allowAllUrls);
  }
  if (customDomains !== undefined) {
    config.customDomains = String(customDomains);
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  res.json({
    success: true,
    message: 'MCP config saved successfully. Restart Claude Code to apply changes.',
    enabledTools: config.enabledTools,
    allowAllUrls: config.allowAllUrls,
    customDomains: config.customDomains
  });
}));

// =============================================================================
// SETTINGS API - Sync between extension and dashboard
// =============================================================================

const fsSync = require('fs');
const settingsPath = require('path').join(__dirname, '../.settings.json');

// Load settings from disk
function loadSettings() {
  try {
    if (fsSync.existsSync(settingsPath)) {
      return JSON.parse(fsSync.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.error('[Settings] Failed to load:', e.message);
  }
  return { globalWorkingDir: '~', recentDirs: ['~', '~/projects'] };
}

// Save settings to disk
function saveSettings(settings) {
  try {
    fsSync.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    console.error('[Settings] Failed to save:', e.message);
    return false;
  }
}

// GET /api/settings/working-dir - Get current working directory settings
router.get('/settings/working-dir', asyncHandler(async (req, res) => {
  const settings = loadSettings();
  res.json({
    success: true,
    data: {
      globalWorkingDir: settings.globalWorkingDir || '~',
      recentDirs: settings.recentDirs || ['~', '~/projects']
    }
  });
}));

// POST /api/settings/working-dir - Update working directory settings
router.post('/settings/working-dir', asyncHandler(async (req, res) => {
  const { globalWorkingDir, recentDirs } = req.body;
  const settings = loadSettings();

  if (globalWorkingDir !== undefined) {
    settings.globalWorkingDir = globalWorkingDir;
  }
  if (recentDirs !== undefined && Array.isArray(recentDirs)) {
    settings.recentDirs = recentDirs.slice(0, 15); // Max 15 recent dirs
  }

  const saved = saveSettings(settings);
  res.json({
    success: saved,
    data: {
      globalWorkingDir: settings.globalWorkingDir,
      recentDirs: settings.recentDirs
    }
  });
}));

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Apply error handler
router.use(errorHandler);

module.exports = router;
