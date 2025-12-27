// CRITICAL: Load dotenv FIRST before ANY other imports
// This ensures LOG_LEVEL and other env vars are available when logger.js initializes
// (logger.js is loaded transitively via terminal-registry -> pty-handler -> logger)
// Use override:true so .env takes precedence over inherited shell env vars (like from tmux)
require('dotenv').config({ override: true });

// Global error handlers to prevent crashes from unhandled rejections/exceptions
// These are especially important for edge-tts network failures (ETIMEDOUT, ENETUNREACH)
process.on('unhandledRejection', (reason, promise) => {
  // Extract meaningful message from AggregateError or regular Error
  let message = 'Unknown rejection';
  if (reason instanceof Error) {
    message = reason.message;
    // AggregateError contains multiple errors - log first one
    if (reason.errors && reason.errors.length > 0) {
      message = `${reason.message}: ${reason.errors[0]?.message || reason.errors[0]}`;
    }
  } else if (reason) {
    message = String(reason);
  }
  // Suppress noisy network errors from edge-tts (TTS service timeouts are expected)
  if (message.includes('ETIMEDOUT') || message.includes('ENETUNREACH') || message.includes('edge-tts')) {
    // Silent - these are expected when TTS service is slow/unavailable
    return;
  }
  console.error('[Server] Unhandled Promise Rejection:', message);
});
process.on('uncaughtException', (err) => {
  // Only log, don't exit - allows server to keep running
  // Extract meaningful message from AggregateError or regular Error
  let message = 'Unknown error';
  if (err instanceof Error) {
    message = err.message;
    if (err.errors && err.errors.length > 0) {
      message = `${err.message}: ${err.errors[0]?.message || err.errors[0]}`;
    }
  } else if (err) {
    message = String(err);
  }
  // Suppress noisy network errors from edge-tts (TTS service timeouts are expected)
  if (message.includes('ETIMEDOUT') || message.includes('ENETUNREACH') || message.includes('edge-tts')) {
    // Silent - these are expected when TTS service is slow/unavailable
    return;
  }
  console.error('[Server] Uncaught Exception:', message);
});

/**
 * Tabz - Simplified Backend
 *
 * Core principles:
 * - Single source of truth for terminal state (terminalRegistry)
 * - Direct terminal type from agent config
 * - Minimal API surface
 * - Clean WebSocket communication
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createModuleLogger } = require('./modules/logger');

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

/**
 * Rate limiter for audio generation endpoint (POST /api/audio/generate)
 * Prevents abuse of the TTS service
 * 30 requests per minute per IP is reasonable for audio generation
 */
const audioRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 30, // 30 requests per minute
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    success: false,
    error: 'Rate limit exceeded',
    message: 'Too many audio generation requests. Maximum 30 per minute.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// =============================================================================
// WEBSOCKET AUTHENTICATION
// Generate a random token on startup to prevent unauthorized local processes
// from connecting to the WebSocket server (local privilege escalation mitigation)
// =============================================================================
const WS_AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
const WS_AUTH_TOKEN_FILE = '/tmp/tabz-auth-token';

// Write token to file so Chrome extension can read it
try {
  fs.writeFileSync(WS_AUTH_TOKEN_FILE, WS_AUTH_TOKEN, { mode: 0o600 }); // Owner read/write only
  console.log(`[Auth] WebSocket auth token written to ${WS_AUTH_TOKEN_FILE}`);
} catch (err) {
  console.error(`[Auth] Failed to write auth token file: ${err.message}`);
}

// Core modules
const terminalRegistry = require('./modules/terminal-registry');
const unifiedSpawn = require('./modules/unified-spawn');
const TUIToolsManager = require('./modules/tui-tools');
const ptyHandler = require('./modules/pty-handler');
const audioGenerator = require('./modules/audio-generator');
// Removed terminal-recovery.js - was causing duplicate terminals and conflicts
const apiRouter = require('./routes/api');
const filesRouter = require('./routes/files');
const browserRouter = require('./routes/browser');
const gitRouter = require('./routes/git');
// const workspaceRouter = require('./routes/workspace'); // Archived - workspace-manager removed

// Initialize services
const tuiTools = new TUIToolsManager(terminalRegistry);
const log = createModuleLogger('Server');

const app = express();
const server = http.createServer(app);

// Middleware
// Handle Private Network Access (required for HTTPS sites like Vercel to access localhost)
// Chrome 94+ blocks requests from HTTPS to private networks without this header
app.use((req, res, next) => {
  // Handle preflight requests for Private Network Access
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
// CORS configuration - allow Chrome extension pages and localhost origins
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like curl, Postman, or same-origin)
    if (!origin) return callback(null, true);

    // Allow chrome-extension:// origins (dashboard page)
    if (origin.startsWith('chrome-extension://')) return callback(null, true);

    // Allow localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);

    // Allow all other origins for flexibility
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// API Routes
app.use('/api', apiRouter);
app.use('/api/files', filesRouter);
app.use('/api/browser', browserRouter);
app.use('/api/git', gitRouter);

// Auth token endpoint - needed for WebSocket auth (dashboard, extension)
// Note: External launchers (GitHub Pages) should use manual token input, not auto-fetch
// The UX improvement is that users consciously paste their token to authorize a site
app.get('/api/auth/token', (req, res) => {
  res.json({ token: WS_AUTH_TOKEN });
});

// Serve cached audio files from edge-tts
// Used by Chrome extension for audio playback (better Windows audio than WSL mpv)
app.use('/audio', express.static('/tmp/claude-audio-cache', {
  setHeaders: (res, path) => {
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
  }
}));

// Serve static files from public directory (launcher, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// AI Terminal Launcher page
app.get('/launcher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// List available cached audio files (for testing)
app.get('/api/audio/list', (req, res) => {
  const fs = require('fs');
  const audioDir = '/tmp/claude-audio-cache';

  try {
    const files = fs.readdirSync(audioDir)
      .filter(f => f.endsWith('.mp3'))
      .map(f => ({
        file: f,
        url: `http://localhost:8129/audio/${f}`,
        size: fs.statSync(path.join(audioDir, f)).size
      }));

    res.json({
      success: true,
      count: files.length,
      files: files.slice(0, 20) // Return first 20
    });
  } catch (err) {
    res.json({ success: false, error: err.message, files: [] });
  }
});

// Generate audio using edge-tts (with caching)
// POST /api/audio/generate { text: string, voice?: string, rate?: string, pitch?: string }
// Rate limited: 30 requests per minute per IP
app.post('/api/audio/generate', audioRateLimiter, async (req, res) => {
  const {
    text,
    voice = 'en-US-AndrewMultilingualNeural',
    rate = '+0%',
    pitch = '+0Hz'
  } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing text parameter' });
  }

  const result = await audioGenerator.generateAudio({ text, voice, rate, pitch });

  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// POST /api/audio/speak - Generate audio AND broadcast to extension to play it
// This allows CLI/slash commands to trigger audio playback through the browser
app.post('/api/audio/speak', async (req, res) => {
  const {
    text,
    voice = 'en-US-AndrewMultilingualNeural',
    rate = '+0%',
    pitch = '+0Hz',
    volume = 0.7,
    priority = 'low'  // 'high' for summaries/handoffs, 'low' for status updates
  } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing text parameter' });
  }

  // Generate audio with longer timeouts for speak endpoint (used for longer content)
  const result = await audioGenerator.generateAudio({
    text,
    voice,
    rate,
    pitch,
    baseTimeoutMs: 60000,
    timeoutPerKb: 30000,
    maxTimeoutMs: 300000,
  });

  if (!result.success) {
    return res.status(500).json(result);
  }

  // Broadcast to all WebSocket clients to play this audio
  // Priority: 'high' for summaries/handoffs (interrupts), 'low' for status updates (skipped if high playing)
  // Send full text so sidepanel can regenerate with user settings if needed
  broadcast({
    type: 'audio-speak',
    url: result.url,
    volume: Math.max(0, Math.min(1, volume)),
    priority: priority === 'high' ? 'high' : 'low',
    text: audioGenerator.stripMarkdown(text) // Full text for regeneration with user settings
  });

  res.json({
    success: true,
    message: 'Audio broadcast to extension',
    url: result.url
  });
});

// POST /api/audio/play - Play an audio file by URL (for soundboards, notifications, etc.)
// Broadcasts directly to extension without TTS generation
app.post('/api/audio/play', (req, res) => {
  const {
    url,
    volume = 0.7,
    priority = 'low'  // 'high' interrupts, 'low' can be skipped
  } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing url parameter' });
  }

  // Broadcast to all WebSocket clients to play this audio
  broadcast({
    type: 'audio-play',
    url: url,
    volume: Math.max(0, Math.min(1, volume)),
    priority: priority === 'high' ? 'high' : 'low'
  });

  res.json({
    success: true,
    message: 'Audio broadcast to extension',
    url: url
  });
});

// app.use('/api/workspace', workspaceRouter); // Archived - workspace-manager removed

// TUI Tools endpoints
app.get('/api/tui-tools', async (req, res) => {
  const tools = await tuiTools.getInstalledTools();
  res.json(tools);
});

app.post('/api/tui-tools/spawn', async (req, res) => {
  const { toolName, workingDir } = req.body;
  try {
    const terminal = await tuiTools.spawnTUITool(toolName, workingDir);
    res.json(terminal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple terminal spawn endpoint for Claude/automation
// POST /api/spawn { name, workingDir, command }
// Requires auth token (header X-Auth-Token or query param ?token=)
app.post('/api/spawn', async (req, res) => {
  // Require auth token to prevent malicious websites from spawning terminals
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token !== WS_AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized - valid token required' });
  }

  const { name, workingDir, command } = req.body;
  try {
    // registerTerminal creates the PTY internally with useTmux: true
    const terminal = await terminalRegistry.registerTerminal({
      name: name || 'Claude Terminal',
      workingDir: workingDir || process.env.HOME,
      command: command || null,
      terminalType: 'bash',
      isChrome: true,  // Use ctt- prefix
      useTmux: true,   // Enable tmux for persistence
    });

    // Broadcast to all WebSocket clients
    broadcast({ type: 'terminal-spawned', data: terminal });

    res.json({ success: true, terminal });
  } catch (error) {
    console.error('[API] Spawn error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle different startup modes based on environment variables
// FORCE_CLEANUP=true: Kill all PTY processes immediately (clean start)
// CLEANUP_ON_START defaults to false to preserve terminals across restarts
// Set CLEANUP_ON_START=true to clean up terminals on restart
const CLEANUP_ON_START = process.env.CLEANUP_ON_START === 'true'; // Default to false

// Intelligent cleanup function
async function intelligentCleanup() {
  const terminals = terminalRegistry.getAllTerminals();
  log.info(`Running intelligent cleanup on ${terminals.length} terminals`);

  // First, clean up duplicates
  terminalRegistry.cleanupDuplicates();

  // Then clean up any terminals that match common problematic names
  const problematicNames = ['pyradio', 'bottom', 'claude-code', 'opencode', 'gemini', 'codex'];
  terminals.forEach(terminal => {
    const baseName = terminal.name.split('-')[0];
    if (problematicNames.includes(baseName) && terminal.state === 'disconnected') {
      log.debug(`Cleaning up disconnected terminal: ${terminal.name}`);
      terminalRegistry.closeTerminal(terminal.id);
    }
  });
}

if (process.env.FORCE_CLEANUP === 'true') {
  // Force cleanup - immediately kill all terminals
  ptyHandler.cleanupWithGrace(true).then(() => {
    terminalRegistry.cleanup();
    log.warn('Force cleaned all terminals (FORCE_CLEANUP=true)');
  }).catch(err => {
    log.error('Error during force cleanup:', err);
  });
} else if (CLEANUP_ON_START) {
  // Clean start requested
  intelligentCleanup().then(() => {
    // Also do PTY cleanup for any orphaned processes
    return ptyHandler.cleanupWithGrace(false);
  }).then(() => {
    log.success('Completed intelligent cleanup (CLEANUP_ON_START=true)');
  }).catch(err => {
    log.error('Error during intelligent cleanup:', err);
  });
} else {
  log.info('Preserving existing terminals (normal start, CLEANUP_ON_START=false)');
}

// WebSocket server
const wss = new WebSocket.Server({ server });

// Track active WebSocket connections
const activeConnections = new Set();

// Track sidebar connections separately (for accurate "multiple browser windows" warning)
// Web pages (like docs site) sending QUEUE_COMMAND should NOT count as browser windows
const sidebarConnections = new Set();

// Track if session recovery is complete (prevents frontend from clearing Chrome storage too early)
let recoveryComplete = false;

// Track which connections own which terminals (for targeted output routing)
// terminalId -> Set<WebSocket>
const terminalOwners = new Map();

// Spawn deduplication - prevent same requestId from spawning twice
// This catches race conditions where the same spawn request is sent multiple times
const recentSpawnRequests = new Set();
const SPAWN_DEDUP_WINDOW_MS = 5000; // 5 second window

wss.on('connection', (ws, req) => {
  // ==========================================================================
  // WEBSOCKET AUTHENTICATION
  // Require valid token in query string to prevent unauthorized connections
  // ==========================================================================
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token || token !== WS_AUTH_TOKEN) {
    log.warn('WebSocket connection rejected: invalid or missing auth token');
    ws.close(1008, 'Unauthorized'); // 1008 = Policy Violation
    return;
  }

  log.success('WebSocket client connected (authenticated)');

  // Add to active connections
  activeConnections.add(ws);

  // Track terminals created by this connection
  const connectionTerminals = new Set();

  // Rate limiting for malformed messages
  const malformedMessageCount = { count: 0, lastReset: Date.now() };
  const MAX_MALFORMED_PER_MINUTE = 10;

  // NOTE: We no longer send terminals immediately on connect.
  // The frontend explicitly requests via LIST_TERMINALS after it's ready.
  // This prevents duplicate terminals messages and race conditions.
  // NOTE: We intentionally do NOT auto-register as owner of all terminals here.
  // The old code registered this connection as owner of ALL existing terminals,
  // which caused cross-contamination bugs:
  // - When backend restarts, all sidebars would receive output from ALL terminals
  // - Multiple browser windows would get duplicate output
  // - Spawning terminals via HTTP API would leak output to unrelated sidebars
  //
  // Instead, the frontend must explicitly send 'reconnect' messages for each
  // terminal it wants to receive output from. This happens in sidepanel.tsx
  // during session reconciliation.

  // Send immediate memory stats to new client
  const memUsage = process.memoryUsage();
  ws.send(JSON.stringify({
    type: 'memory-stats',
    data: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      activeConnections: activeConnections.size,
      terminals: terminalRegistry.getActiveTerminalCount()
    }
  }));

  // Create message handler
  const messageHandler = async (message) => {
    let data;
    try {
      data = JSON.parse(message);
      
      switch (data.type) {
        case 'identify':
          // Client type identification - sidebar vs web page
          // Only sidebar connections should count towards "multiple browser windows" warning
          if (data.clientType === 'sidebar') {
            sidebarConnections.add(ws);
            log.info(`[WS] Client identified as sidebar (${sidebarConnections.size} sidebar connections)`);
          } else {
            log.info(`[WS] Client identified as ${data.clientType || 'unknown'} (not counted as browser window)`);
          }
          break;

        case 'spawn':
          // Spawn deduplication - prevent same requestId from spawning twice
          // This catches race conditions, double-clicks, or duplicate WebSocket messages
          if (data.requestId && recentSpawnRequests.has(data.requestId)) {
            log.warn(`Duplicate spawn request ignored: ${data.requestId}`);
            break;
          }
          if (data.requestId) {
            recentSpawnRequests.add(data.requestId);
            // Clean up after dedup window
            setTimeout(() => recentSpawnRequests.delete(data.requestId), SPAWN_DEDUP_WINDOW_MS);
          }

          // Debug log for Gemini spawn issues
          if (data.config && data.config.terminalType === 'gemini') {
            log.debug('Spawning Gemini terminal with config:', data.config);
          }
          // Use UnifiedSpawn for better validation and rate limiting
          // Pass requestId from frontend if provided
          const result = await unifiedSpawn.spawn({
            ...data.config,
            requestId: data.requestId
          });
          if (result.success) {
            // Track this terminal for this connection
            connectionTerminals.add(result.terminal.id);

            // Register this connection as owner of this terminal
            if (!terminalOwners.has(result.terminal.id)) {
              terminalOwners.set(result.terminal.id, new Set());
            }
            const ownersSet = terminalOwners.get(result.terminal.id);
            const wasAlreadyOwned = ownersSet.has(ws);
            ownersSet.add(ws);

            log.success('Spawned terminal', {
              id: result.terminal.id,
              name: result.terminal.name,
              type: result.terminal.terminalType,
              platform: result.terminal.platform,
              sessionName: result.terminal.sessionName,
              owners: ownersSet.size,
              alreadyOwned: wasAlreadyOwned
            });
            // Include requestId if provided
            const spawnMessage = {
              type: 'terminal-spawned',
              data: result.terminal,
              requestId: data.requestId
            };
            console.log('[Server] 📤 Broadcasting terminal-spawned:', JSON.stringify(spawnMessage).slice(0, 200));
            broadcast(spawnMessage);
          } else {
            // Include requestId in error response for tracking
            ws.send(JSON.stringify({
              type: 'spawn-error',
              error: result.error,
              requestId: data.requestId,
              terminalType: data.config?.terminalType,
              terminalName: data.config?.name
            }));
          }
          break;
          
        case 'command':
          // CRITICAL: Do NOT log command data - it contains ANSI escape sequences that leak to host terminal!
          // These escape sequences (theme changes, cursor movements, etc.) will be interpreted by
          // the terminal running the backend, causing colors/themes to change in the host terminal.
          // Only log the command length and terminal ID (safe data only)
          const cmdLength = data.command?.length || 0;
          log.debug(`Command → terminal ${data.terminalId.slice(-8)}: ${cmdLength} bytes`);
          await terminalRegistry.sendCommand(data.terminalId, data.command);
          break;

        case 'targeted-pane-send':
          // Send text directly to a specific tmux pane (bypasses PTY, goes to exact pane)
          // Used for split layouts where Claude is in one pane and a TUI tool in another
          // This prevents corrupting TUI apps when user sends commands from chat bar
          {
            const { tmuxPane, text, sendEnter } = data;
            if (!tmuxPane) {
              log.warn(`targeted-pane-send missing tmuxPane`);
              break;
            }
            try {
              const { spawnSync } = require('child_process');
              if (text) {
                // Use spawnSync with array args to bypass shell interpretation
                // This preserves $VAR, backticks, and other shell special characters
                // The -l flag sends keys literally (without interpreting tmux special sequences)
                spawnSync('tmux', ['send-keys', '-t', tmuxPane, '-l', text], { timeout: 5000 });
                log.debug(`Targeted send → pane ${tmuxPane}: ${text.length} bytes`);
              }
              if (sendEnter) {
                // CRITICAL: 300ms delay before Enter for long prompts (matches /pmux pattern)
                // Without delay, Claude may interpret newline before full text loads
                await new Promise(resolve => setTimeout(resolve, 300));
                // Send Enter key (not literal, so tmux interprets it as Enter)
                spawnSync('tmux', ['send-keys', '-t', tmuxPane, 'Enter'], { timeout: 5000 });
                log.debug(`Targeted Enter → pane ${tmuxPane}`);
              }
            } catch (err) {
              log.error(`Failed to send to pane ${tmuxPane}:`, err.message);
            }
          }
          break;

        case 'tmux-session-send':
          // Send to tmux session by name (fallback when pane ID unavailable)
          // Sends to first pane of session - safer than PTY for Claude terminals
          {
            const { sessionName, text: sessionText, sendEnter: sessionSendEnter } = data;
            log.info(`[tmux-session-send] Received: session=${sessionName}, textLen=${sessionText?.length}, sendEnter=${sessionSendEnter}`);
            if (!sessionName) {
              log.warn(`tmux-session-send missing sessionName`);
              break;
            }
            try {
              const { spawnSync } = require('child_process');
              // Target the session directly (tmux will use current window/pane)
              const target = sessionName;
              if (sessionText) {
                // Use spawnSync with array args to bypass shell interpretation
                // This preserves $VAR, backticks, and other shell special characters
                spawnSync('tmux', ['send-keys', '-t', target, '-l', sessionText], { timeout: 5000 });
                log.debug(`Session send → ${target}: ${sessionText.length} bytes`);
              }
              if (sessionSendEnter) {
                // CRITICAL: 300ms delay before Enter for long prompts
                await new Promise(resolve => setTimeout(resolve, 300));
                spawnSync('tmux', ['send-keys', '-t', target, 'Enter'], { timeout: 5000 });
                log.debug(`Session Enter → ${target}`);
              }
            } catch (err) {
              log.error(`Failed to send to session ${sessionName}:`, err.message);
            }
          }
          break;

        case 'resize':
          // Register this connection as owner of the terminal (for API-spawned terminals)
          // This ensures data flows to the frontend even if terminal was spawned via HTTP
          if (!terminalOwners.has(data.terminalId)) {
            terminalOwners.set(data.terminalId, new Set());
          }
          terminalOwners.get(data.terminalId).add(ws);
          connectionTerminals.add(data.terminalId);

          // Gracefully handle resize for terminals that don't exist yet
          // This happens during backend restart before recovery completes
          try {
            await terminalRegistry.resizeTerminal(data.terminalId, data.cols, data.rows);
          } catch (resizeErr) {
            // Silent - terminal will be resized after recovery completes
          }

          // NOTE: Removed "send empty key on first resize" logic (was causing corruption)
          // SIGWINCH from resize already triggers tmux redraw - send-keys was redundant
          // and could cause issues during active output
          break;
          
        case 'detach':
          // Power off button: detach from tmux but keep session alive
          log.info(`Detaching from terminal ${data.terminalId.slice(-8)} (preserving tmux session)`);
          connectionTerminals.delete(data.terminalId);

          // Remove this connection from terminal owners
          if (terminalOwners.has(data.terminalId)) {
            terminalOwners.get(data.terminalId).delete(ws);
            // Clean up empty sets
            if (terminalOwners.get(data.terminalId).size === 0) {
              terminalOwners.delete(data.terminalId);
            }
          }

          await terminalRegistry.closeTerminal(data.terminalId, false); // Don't force - keep tmux session alive
          broadcast({ type: 'terminal-closed', data: { id: data.terminalId } });
          break;

        case 'close':
          // X button: force close and kill tmux session
          log.info(`Force closing terminal ${data.terminalId.slice(-8)} (killing tmux session)`);
          connectionTerminals.delete(data.terminalId);

          // Remove this connection from terminal owners
          if (terminalOwners.has(data.terminalId)) {
            terminalOwners.get(data.terminalId).delete(ws);
            // Clean up empty sets
            if (terminalOwners.get(data.terminalId).size === 0) {
              terminalOwners.delete(data.terminalId);
            }
          }

          await terminalRegistry.closeTerminal(data.terminalId, true); // Force close - kill tmux session
          broadcast({ type: 'terminal-closed', data: { id: data.terminalId } });
          break;

        case 'list-terminals':
          // List all active terminals in the registry, filtered to ctt- prefix only
          const allTerminals = terminalRegistry.getAllTerminals();
          const chromeTerminals = allTerminals.filter(t => t.id && t.id.startsWith('ctt-'));
          // connectionCount uses sidebarConnections, not activeConnections
          // This prevents web pages (like docs site) from triggering "multiple browser windows" warning
          log.info(`[WS] Listing ${chromeTerminals.length} Chrome terminals (${allTerminals.length} total), ${sidebarConnections.size} sidebar connections (${activeConnections.size} total), recoveryComplete=${recoveryComplete}`);
          ws.send(JSON.stringify({
            type: 'terminals',
            data: chromeTerminals,
            connectionCount: sidebarConnections.size,
            recoveryComplete: recoveryComplete
          }));
          break;

        case 'query-tmux-sessions':
          // Query for orphaned tmux sessions that can be reconnected
          log.info('Querying for orphaned tmux sessions');
          try {
            const { execSync } = require('child_process');
            const tmuxListOutput = execSync('tmux ls -F "#{session_name}" 2>/dev/null || echo ""').toString().trim();
            const allSessions = tmuxListOutput.split('\n').filter(s => s);

            // Filter for terminal-tabs sessions (all formats)
            // Old: terminal-tabs-terminal-1762...
            // Web app: tt-bash-xyz, tt-cc-abc, etc.
            // Chrome extension: ctt-uuid or ctt-custom-name
            const terminalTabsSessions = allSessions.filter(s =>
              s.startsWith('terminal-tabs-') || s.startsWith('tt-') || s.startsWith('ctt-')
            );

            log.info(`Found ${terminalTabsSessions.length} terminal-tabs tmux sessions`, terminalTabsSessions);

            ws.send(JSON.stringify({
              type: 'tmux-sessions-list',
              data: {
                sessions: terminalTabsSessions
              }
            }));
          } catch (error) {
            console.error('[WS] Error querying tmux sessions:', error);
            ws.send(JSON.stringify({
              type: 'tmux-sessions-list',
              data: {
                sessions: []
              }
            }));
          }
          break;

        case 'reconnect':
          // Attempt to reconnect to existing terminal
          const terminalId = data.data?.terminalId || data.terminalId;
          console.log(`[WS] Received reconnect request for terminal: ${terminalId}`);

          // First, cancel any pending disconnect for this terminal
          // This is critical - we need to stop the grace period timer immediately
          terminalRegistry.cancelDisconnect(terminalId);

          // Now attempt to reconnect
          const reconnected = await terminalRegistry.reconnectToTerminal(terminalId);
          if (reconnected) {
            // Add to this connection's terminal set
            connectionTerminals.add(terminalId);

            // Register this connection as owner of this terminal
            if (!terminalOwners.has(terminalId)) {
              terminalOwners.set(terminalId, new Set());
            }
            terminalOwners.get(terminalId).add(ws);

            console.log(`[WS] Successfully reconnected to terminal ${terminalId}`);
            ws.send(JSON.stringify({ type: 'terminal-reconnected', data: reconnected }));
          } else {
            console.log(`[WS] Failed to reconnect to terminal ${terminalId} - terminal not found in registry`);
            ws.send(JSON.stringify({ type: 'reconnect-failed', terminalId: terminalId }));
          }
          break;
          
        case 'update-embedded':
          // Update the embedded status of a terminal
          const terminal = terminalRegistry.getTerminal(data.terminalId);
          if (terminal) {
            terminal.embedded = data.embedded;
            log.debug(`Updated terminal ${data.terminalId.slice(-8)} embedded status to ${data.embedded}`);
          }
          break;

        // ============================================
        // BROWSER MCP - WebSocket message handlers
        // ============================================

        case 'browser-console-log':
          // Receive console log from Chrome extension
          if (data.entry) {
            browserRouter.addConsoleLog(data.entry);
            // Log to stdout for debugging visibility
            const entry = data.entry;
            const levelColors = { log: '', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' };
            const color = levelColors[entry.level] || '';
            const reset = '\x1b[0m';
            const source = entry.source ? `:${entry.source}` : '';
            log.info(`${color}[Browser${source}] ${entry.message}${reset}`);
          }
          break;

        case 'browser-script-result':
          // Receive script execution result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              result: data.result,
              error: data.error
            });
          }
          break;

        case 'browser-page-info':
          // Receive page info from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              url: data.url,
              title: data.title,
              tabId: data.tabId,
              favIconUrl: data.favIconUrl,
              error: data.error
            });
          }
          break;

        case 'browser-list-tabs-result':
          // Receive tab list from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tabs: data.tabs,
              error: data.error
            });
          }
          break;

        case 'browser-switch-tab-result':
          // Receive switch tab result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tabId: data.tabId,
              error: data.error
            });
          }
          break;

        case 'browser-get-active-tab-result':
          // Receive active tab info from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tab: data.tab,
              error: data.error
            });
          }
          break;

        case 'browser-open-url-result':
          // Receive open URL result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tabId: data.tabId,
              url: data.url,
              reused: data.reused,
              error: data.error
            });
          }
          break;

        case 'browser-profiles-result':
          // Receive profiles from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              profiles: data.profiles,
              defaultProfileId: data.defaultProfileId,
              globalWorkingDir: data.globalWorkingDir,
              error: data.error
            });
          }
          break;

        case 'browser-settings-result':
          // Receive settings from Chrome extension (lightweight endpoint for integrations)
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              globalWorkingDir: data.globalWorkingDir,
              defaultProfileName: data.defaultProfileName,
              error: data.error
            });
          }
          break;

        case 'browser-download-result':
          // Receive download result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              filename: data.filename,
              windowsPath: data.windowsPath,
              wslPath: data.wslPath,
              fileSize: data.fileSize,
              error: data.error
            });
          }
          break;

        case 'browser-downloads-list':
          // Receive downloads list from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              downloads: data.downloads,
              total: data.total,
              error: data.error
            });
          }
          break;

        case 'browser-cancel-download-result':
          // Receive cancel download result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              error: data.error
            });
          }
          break;

        case 'browser-save-page-result':
          // Receive save page (MHTML) result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              filename: data.filename,
              windowsPath: data.windowsPath,
              wslPath: data.wslPath,
              fileSize: data.fileSize,
              mimeType: data.mimeType,
              error: data.error
            });
          }
          break;

        case 'browser-capture-image-result':
          // Receive image capture result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              filePath: data.filePath,
              windowsPath: data.windowsPath,
              wslPath: data.wslPath,
              width: data.width,
              height: data.height,
              error: data.error
            });
          }
          break;

        case 'browser-screenshot-result':
          // Receive screenshot result from Chrome extension
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              filePath: data.filePath,
              windowsPath: data.windowsPath,
              wslPath: data.wslPath,
              error: data.error
            });
          }
          break;

        // ============================================
        // INTERACTION RESPONSES - From Chrome extension
        // ============================================
        case 'browser-click-element-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tagName: data.tagName,
              error: data.error
            });
          }
          break;

        case 'browser-fill-input-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tagName: data.tagName,
              error: data.error
            });
          }
          break;

        case 'browser-get-element-info-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              html: data.html,
              outerHTML: data.outerHTML,
              innerText: data.innerText,
              tagName: data.tagName,
              attributes: data.attributes,
              bounds: data.bounds,
              styles: data.styles,
              parentSelector: data.parentSelector,
              childCount: data.childCount,
              error: data.error
            });
          }
          break;

        // ============================================
        // BOOKMARK RESPONSES - From Chrome extension
        // ============================================
        case 'browser-bookmarks-tree-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tree: data.tree,
              error: data.error
            });
          }
          break;

        case 'browser-bookmarks-search-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              bookmarks: data.bookmarks,
              error: data.error
            });
          }
          break;

        case 'browser-bookmarks-create-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              bookmark: data.bookmark,
              error: data.error
            });
          }
          break;

        case 'browser-bookmarks-create-folder-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              folder: data.folder,
              error: data.error
            });
          }
          break;

        case 'browser-bookmarks-move-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              bookmark: data.bookmark,
              error: data.error
            });
          }
          break;

        case 'browser-bookmarks-delete-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              error: data.error
            });
          }
          break;

        // ============================================
        // NETWORK CAPTURE RESPONSES - From Chrome extension
        // ============================================
        case 'browser-enable-network-capture-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              error: data.error
            });
          }
          break;

        case 'browser-get-network-requests-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              requests: data.requests,
              total: data.total,
              hasMore: data.hasMore,
              nextOffset: data.nextOffset,
              captureActive: data.captureActive
            });
          }
          break;

        case 'browser-clear-network-requests-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              error: data.error
            });
          }
          break;

        // ============================================
        // DEBUGGER RESPONSES - From Chrome extension (DevTools access)
        // ============================================
        case 'browser-get-dom-tree-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              tree: data.tree,
              nodeCount: data.nodeCount,
              error: data.error
            });
          }
          break;

        case 'browser-profile-performance-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              timing: data.timing,
              memory: data.memory,
              dom: data.dom,
              other: data.other,
              rawMetrics: data.rawMetrics,
              error: data.error
            });
          }
          break;

        case 'browser-get-coverage-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              coverage: data.coverage,
              summary: data.summary,
              error: data.error
            });
          }
          break;

        // ============================================
        // TAB GROUPS - Result handlers
        // ============================================
        case 'browser-list-tab-groups-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              groups: data.groups,
              claudeActiveGroupId: data.claudeActiveGroupId,
              error: data.error
            });
          }
          break;

        case 'browser-create-tab-group-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              group: data.group,
              error: data.error
            });
          }
          break;

        case 'browser-update-tab-group-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              group: data.group,
              error: data.error
            });
          }
          break;

        case 'browser-add-to-tab-group-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              group: data.group,
              error: data.error
            });
          }
          break;

        case 'browser-ungroup-tabs-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              ungroupedCount: data.ungroupedCount,
              error: data.error
            });
          }
          break;

        case 'browser-add-to-claude-group-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              group: data.group,
              error: data.error
            });
          }
          break;

        case 'browser-remove-from-claude-group-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              message: data.message,
              error: data.error
            });
          }
          break;

        case 'browser-get-claude-group-status-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              exists: data.exists,
              groupId: data.groupId,
              group: data.group,
              tabCount: data.tabCount,
              tabIds: data.tabIds,
              error: data.error
            });
          }
          break;

        // ============================================
        // WINDOW MANAGEMENT - Result handlers
        // ============================================
        case 'browser-list-windows-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              windows: data.windows,
              error: data.error
            });
          }
          break;

        case 'browser-create-window-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              window: data.window,
              error: data.error
            });
          }
          break;

        case 'browser-update-window-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              window: data.window,
              error: data.error
            });
          }
          break;

        case 'browser-close-window-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              error: data.error
            });
          }
          break;

        case 'browser-get-displays-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              displays: data.displays,
              error: data.error
            });
          }
          break;

        case 'browser-tile-windows-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              results: data.results,
              layout: data.layout,
              displayId: data.displayId,
              error: data.error
            });
          }
          break;

        case 'browser-popout-terminal-result':
          if (data.requestId) {
            browserRouter.resolvePendingRequest(data.requestId, {
              success: data.success,
              window: data.window,
              terminalId: data.terminalId,
              error: data.error
            });
          }
          break;

        // ============================================
        // QUEUE_COMMAND - Forward to Chrome extension
        // ============================================
        case 'QUEUE_COMMAND':
          // Forward command to Chrome extension which broadcasts to sidepanel
          log.info('[Server] QUEUE_COMMAND received:', data.command?.slice(0, 50));
          broadcast({ type: 'QUEUE_COMMAND', command: data.command });
          break;

      }
    } catch (error) {
      console.error('WebSocket message error:', error);

      // Rate limit check for malformed messages
      const now = Date.now();
      if (now - malformedMessageCount.lastReset > 60000) {
        malformedMessageCount.count = 0;
        malformedMessageCount.lastReset = now;
      }
      malformedMessageCount.count++;

      // Terminate connection if too many malformed messages
      if (malformedMessageCount.count > MAX_MALFORMED_PER_MINUTE) {
        console.error('Too many malformed messages from client, terminating connection');
        ws.terminate();
        return;
      }

      // For JSON parse errors, terminate the connection immediately
      if (error instanceof SyntaxError) {
        console.error('Invalid JSON received, terminating connection');
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
        }
        ws.terminate();
        return;
      }

      // For other errors, send error message but keep connection
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    }
  };

  // Create close handler
  const closeHandler = () => {
    console.log('WebSocket client disconnected');
    // Disconnect terminals belonging to this connection (with grace period)
    for (const terminalId of connectionTerminals) {
      terminalRegistry.disconnectTerminal(terminalId);

      // Remove this connection from terminal owners
      if (terminalOwners.has(terminalId)) {
        terminalOwners.get(terminalId).delete(ws);
        // Clean up empty sets
        if (terminalOwners.get(terminalId).size === 0) {
          terminalOwners.delete(terminalId);
        }
      }
    }
    // Clear terminal references to free memory
    connectionTerminals.clear();

    // Remove from active connections and sidebar connections
    activeConnections.delete(ws);
    sidebarConnections.delete(ws);
    // Clean up event listeners
    ws.removeListener('message', messageHandler);
    ws.removeListener('close', closeHandler);
    ws.removeListener('error', errorHandler);
  };

  // Create error handler
  const errorHandler = (error) => {
    console.error('WebSocket error:', error);
    // Ensure cleanup happens and terminate the connection
    ws.terminate();
  };

  // Attach event listeners
  ws.on('message', messageHandler);
  ws.on('close', closeHandler);
  ws.on('error', errorHandler);
});

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  // Use activeConnections set instead of wss.clients for better memory management
  activeConnections.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (error) {
        // Remove dead connections
        log.error('Error broadcasting to client:', error);
        activeConnections.delete(client);
      }
    }
  });
}

// Make broadcast available to routes (for browser MCP)
app.set('broadcast', broadcast);

// Terminal output streaming - remove any existing listeners first
terminalRegistry.removeAllListeners('output');
terminalRegistry.on('output', (terminalId, data) => {
  // CRITICAL: Only send output to connections that own this terminal
  // This prevents cross-window contamination and escape sequence corruption
  const owners = terminalOwners.get(terminalId);
  if (owners && owners.size > 0) {
    // Debug: Log if multiple owners exist (shouldn't happen!)
    if (owners.size > 1) {
      log.warn(`⚠️ Terminal ${terminalId.slice(-8)} has ${owners.size} owners! This may cause escape sequence leaks.`);
    }

    const message = JSON.stringify({
      type: 'terminal-output',
      terminalId,
      data
    });

    // Clean up dead connections while sending (prevents escape sequence leaks)
    const deadConnections = [];
    owners.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          log.error('Error sending terminal output to client:', error);
          deadConnections.push(client);
        }
      } else {
        // Connection is not OPEN (CONNECTING, CLOSING, or CLOSED) - mark for removal
        deadConnections.push(client);
      }
    });

    // Remove dead connections from owners map
    deadConnections.forEach(client => {
      owners.delete(client);
      activeConnections.delete(client);
    });

    // Clean up empty owner sets
    if (owners.size === 0) {
      terminalOwners.delete(terminalId);
    }
  }
});

// Listen for terminal lifecycle close events (natural exit) and broadcast to clients
terminalRegistry.removeAllListeners('closed');
terminalRegistry.on('closed', (terminalId) => {
  broadcast({ type: 'terminal-closed', data: { id: terminalId } });
});

// Periodic memory monitoring and leak prevention - clean up dead connections
setInterval(() => {
  // Remove dead WebSocket connections
  const deadConnections = [];
  activeConnections.forEach(ws => {
    if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
      deadConnections.push(ws);
    }
  });

  deadConnections.forEach(ws => {
    log.debug('Removing dead WebSocket connection');
    activeConnections.delete(ws);
    sidebarConnections.delete(ws);
    try {
      ws.terminate();
    } catch (e) {
      // Ignore errors
    }
  });

  // Clean up dead connections from terminalOwners map (prevents escape sequence leaks)
  let cleanedCount = 0;
  terminalOwners.forEach((owners, terminalId) => {
    const deadOwners = [];
    owners.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) {
        deadOwners.push(client);
      }
    });
    deadOwners.forEach(client => {
      owners.delete(client);
      cleanedCount++;
    });
    // Clean up empty owner sets
    if (owners.size === 0) {
      terminalOwners.delete(terminalId);
    }
  });
  if (cleanedCount > 0) {
    log.debug(`Cleaned up ${cleanedCount} dead connections from terminalOwners map`);
  }

  // Collect memory stats (broadcast to clients, don't spam console)
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rss = Math.round(memUsage.rss / 1024 / 1024);

  // Broadcast memory stats to all connected clients
  broadcast({
    type: 'memory-stats',
    data: {
      heapUsed,
      heapTotal,
      rss, // Resident Set Size - total memory allocated
      external: Math.round(memUsage.external / 1024 / 1024),
      activeConnections: activeConnections.size,
      terminals: terminalRegistry.getActiveTerminalCount()
    }
  });
}, 5000); // Run every 5 seconds

// Graceful shutdown handler
const gracefulShutdown = async () => {
  log.warn('\nShutting down gracefully...');
  
  // Close all WebSocket connections
  activeConnections.forEach(ws => {
    try {
      ws.close(1000, 'Server shutting down');
    } catch (e) {
      // Ignore errors during shutdown
    }
  });
  activeConnections.clear();
  sidebarConnections.clear();
  
  // Close WebSocket server
  wss.close(() => {
    log.info('WebSocket server closed');
  });

  // Clean up terminal registry listeners
  terminalRegistry.removeAllListeners();

  // Clean up all terminals
  await terminalRegistry.cleanup();

  // Note persistence was removed in v3.10 (manual save system)
  // log.info('Saving all pending notes...');
  // notePersistence.shutdown();

  // Close HTTP server
  server.close(() => {
    log.success('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 8129;
server.listen(PORT, '127.0.0.1', async () => {
  log.ready('');
  log.ready('╔════════════════════════════════════════╗');
  log.ready('║     Terminal Tabs Backend Server      ║');
  log.ready('╚════════════════════════════════════════╝');
  log.ready('');
  log.info(`🚀 HTTP Server listening on 127.0.0.1:${PORT}`);
  log.info(`⚡ WebSocket Server ready`);
  log.info(`📁 Working directory: ${process.cwd()}`);
  log.info(`🔧 Log level: ${process.env.LOG_LEVEL || 'info (default)'}`);
  if (process.env.CLEANUP_ON_START === 'true') log.warn('⚠️  Cleanup on start: ENABLED');
  log.ready('');

  // Initialize note persistence service

  // Recover existing ctt- tmux sessions on startup
  // Use a Set to track sessions being recovered to prevent duplicates
  const recoveringSessionsSet = new Set();

  if (process.env.CLEANUP_ON_START !== 'true') {
    // Delay recovery to 2500ms to ensure frontend terminals have finished initializing
    // (Frontend has 1000ms init guard + 1000ms resize debounce + buffer)
    setTimeout(async () => {
      try {
        const { execSync } = require('child_process');
        const tmuxOutput = execSync('tmux ls -F "#{session_name}" 2>/dev/null || echo ""').toString().trim();
        const sessions = tmuxOutput.split('\n').filter(s => s && s.startsWith('ctt-'));

        if (sessions.length > 0) {
          log.info(`🔄 Recovering ${sessions.length} ctt- sessions...`);
          for (const sessionName of sessions) {
            // Check if already registered in terminal registry
            const existing = terminalRegistry.getAllTerminals().find(t => t.sessionName === sessionName || t.id === sessionName);
            if (existing) {
              log.debug(`Session ${sessionName} already registered in terminal registry`);
              continue;
            }

            // Check if already being recovered (prevents race conditions)
            if (recoveringSessionsSet.has(sessionName)) {
              log.debug(`Session ${sessionName} already being recovered`);
              continue;
            }

            // Check if PTY already exists for this session (another guard against duplicates)
            const existingPty = ptyHandler.getProcessBySession(sessionName);
            if (existingPty) {
              log.debug(`Session ${sessionName} already has a PTY attached`);
              continue;
            }

            recoveringSessionsSet.add(sessionName);

            // Extract profile name from session name (format: ctt-{profile-name}-{shortId})
            // The shortId is the last 8 chars, profile name is everything between 'ctt-' and the last segment
            const withoutPrefix = sessionName.replace('ctt-', '');
            const segments = withoutPrefix.split('-');
            let displayName;
            if (segments.length >= 2) {
              // New format: ctt-amber-claude-abc12345 → "Amber Claude"
              const profileSegments = segments.slice(0, -1); // Everything except last segment (shortId)
              const profileName = profileSegments
                .map(s => s.charAt(0).toUpperCase() + s.slice(1)) // Capitalize each word
                .join(' ');
              displayName = profileName || `Bash (${segments[segments.length - 1].substring(0, 8)})`;
            } else {
              // Old format: ctt-abc12345 → "Bash (abc12345)"
              displayName = `Bash (${withoutPrefix.substring(0, 8)})`;
            }

            try {
              // Get the current working directory from the tmux session
              let workingDir;
              try {
                workingDir = execSync(`tmux display-message -p -t "${sessionName}" "#{pane_current_path}" 2>/dev/null`).toString().trim();
                log.info(`[Recovery] Got workingDir from tmux for ${sessionName}: ${workingDir}`);
              } catch (e) {
                log.debug(`Could not get working dir for ${sessionName}: ${e.message}`);
              }

              // Register the terminal with useTmux - registerTerminal creates PTY internally
              await terminalRegistry.registerTerminal({
                name: displayName,
                sessionName: sessionName,  // Existing tmux session to reconnect to
                terminalType: 'bash',
                isChrome: true,
                useTmux: true,  // Enable tmux reconnection
                workingDir: workingDir,  // Pass the actual working directory from tmux
              });

              log.success(`✅ Recovered: ${sessionName}`);
            } catch (regError) {
              log.warn(`Failed to recover ${sessionName}:`, regError.message);
            } finally {
              recoveringSessionsSet.delete(sessionName);
            }
          }

          // Broadcast updated terminal list to all connected clients
          const allTerminals = terminalRegistry.getAllTerminals();
          const chromeTerminals = allTerminals.filter(t => t.id && t.id.startsWith('ctt-'));
          recoveryComplete = true;
          log.info(`[WS] Broadcasting ${chromeTerminals.length} recovered terminals to ${activeConnections.size} clients (${sidebarConnections.size} sidebars, recoveryComplete=true)`);
          broadcast({
            type: 'terminals',
            data: chromeTerminals,
            connectionCount: sidebarConnections.size,
            recoveryComplete: true
          });
        } else {
          // No ctt- sessions to recover - mark recovery as complete
          recoveryComplete = true;
          log.info('No ctt- sessions to recover, recoveryComplete=true');
        }
      } catch (error) {
        log.warn('Recovery check failed (tmux not running?):', error.message);
        // Even on error, mark recovery as complete so frontend doesn't wait forever
        recoveryComplete = true;
      }
    }, 2500);
  } else {
    // CLEANUP_ON_START=true means no recovery to do
    recoveryComplete = true;
    log.info('CLEANUP_ON_START=true, recoveryComplete=true (no recovery needed)');
  }
});