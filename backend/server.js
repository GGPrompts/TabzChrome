/**
 * Tabz - Simplified Backend
 * 
 * Core principles:
 * - Single source of truth for terminal state (terminalRegistry)
 * - Direct terminal type from agent config
 * - Minimal API surface
 * - Clean WebSocket communication
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { createModuleLogger } = require('./modules/logger');

// Core modules
const terminalRegistry = require('./modules/terminal-registry');
const unifiedSpawn = require('./modules/unified-spawn');
const TUIToolsManager = require('./modules/tui-tools');
const ptyHandler = require('./modules/pty-handler');
// Removed terminal-recovery.js - was causing duplicate terminals and conflicts
const apiRouter = require('./routes/api');
const filesRouter = require('./routes/files');
// const workspaceRouter = require('./routes/workspace'); // Archived - workspace-manager removed

// Initialize services
const tuiTools = new TUIToolsManager(terminalRegistry);
const log = createModuleLogger('Server');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', apiRouter);
app.use('/api/files', filesRouter);
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

// Track which connections own which terminals (for targeted output routing)
// terminalId -> Set<WebSocket>
const terminalOwners = new Map();

wss.on('connection', (ws) => {
  log.success('WebSocket client connected');

  // Add to active connections
  activeConnections.add(ws);

  // Track terminals created by this connection
  const connectionTerminals = new Set();

  // Rate limiting for malformed messages
  const malformedMessageCount = { count: 0, lastReset: Date.now() };
  const MAX_MALFORMED_PER_MINUTE = 10;

  // Send initial terminal state
  const existingTerminals = terminalRegistry.getAllTerminals();
  ws.send(JSON.stringify({
    type: 'terminals',
    data: existingTerminals
  }));

  // CRITICAL: Register this connection as an owner of all existing terminals
  // This ensures reconnected clients receive output from restored terminals
  existingTerminals.forEach(terminal => {
    if (!terminalOwners.has(terminal.id)) {
      terminalOwners.set(terminal.id, new Set());
    }
    terminalOwners.get(terminal.id).add(ws);
    connectionTerminals.add(terminal.id);
    log.debug(`Registered connection as owner of existing terminal: ${terminal.id.slice(-8)}`);
  });

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
        case 'spawn':
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
          
        case 'resize':
          await terminalRegistry.resizeTerminal(data.terminalId, data.cols, data.rows);
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

        case 'query-tmux-sessions':
          // Query for orphaned tmux sessions that can be reconnected
          log.info('Querying for orphaned tmux sessions');
          try {
            const { execSync } = require('child_process');
            const tmuxListOutput = execSync('tmux ls -F "#{session_name}" 2>/dev/null || echo ""').toString().trim();
            const allSessions = tmuxListOutput.split('\n').filter(s => s);

            // Filter for terminal-tabs sessions (both old and new format)
            // Old: terminal-tabs-terminal-1762...
            // New: tt-bash-xyz, tt-cc-abc, etc.
            const terminalTabsSessions = allSessions.filter(s =>
              s.startsWith('terminal-tabs-') || s.startsWith('tt-')
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
          const reconnected = terminalRegistry.reconnectToTerminal(terminalId);
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

    // Remove from active connections
    activeConnections.delete(ws);
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

  // Log memory usage for monitoring
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rss = Math.round(memUsage.rss / 1024 / 1024);
  console.log(`[Server] Memory: ${heapUsed}MB / ${heapTotal}MB, Active WS: ${activeConnections.size}, Terminals: ${terminalRegistry.getActiveTerminalCount()}`);

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
server.listen(PORT, async () => {
  log.ready('');
  log.ready('╔════════════════════════════════════════╗');
  log.ready('║     Terminal Tabs Backend Server      ║');
  log.ready('╚════════════════════════════════════════╝');
  log.ready('');
  log.info(`🚀 HTTP Server listening on port ${PORT}`);
  log.info(`⚡ WebSocket Server ready`);
  log.info(`📁 Working directory: ${process.cwd()}`);
  log.info(`🔧 Log level: ${process.env.LOG_LEVEL || 'info (default)'}`);
  if (process.env.CLEANUP_ON_START === 'true') log.warn('⚠️  Cleanup on start: ENABLED');
  log.ready('');

  // Initialize note persistence service

  // Attempt to recover any existing terminals
  // TODO: Terminal recovery module needs to be implemented
  // if (process.env.RECOVER_TERMINALS !== 'false') {
  //   setTimeout(async () => {
  //     console.log('[Server] Checking for recoverable terminals...');
  //     const recovered = await terminalRecovery.recoverTerminals();
  //     if (recovered.length > 0) {
  //       console.log(`[Server] Recovered ${recovered.length} terminals`);
  //       // Notify any connected clients about recovered terminals
  //       broadcast({
  //         type: 'terminals-recovered',
  //         data: recovered
  //       });
  //     }
  //   }, 2000); // Wait 2 seconds for system to stabilize
  // }
});