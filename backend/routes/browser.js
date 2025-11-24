/**
 * Browser MCP API Routes
 *
 * REST API endpoints for the browser-mcp-server to access browser data
 * via the TabzChrome extension.
 */

const express = require('express');
const router = express.Router();
const { createModuleLogger } = require('../modules/logger');

const log = createModuleLogger('BrowserAPI');

// Console log buffer (populated via WebSocket from extension)
// This is shared with server.js via module.exports
const consoleLogs = [];
const MAX_CONSOLE_LOGS = 1000;

// Pending requests for browser operations (WebSocket request/response)
const pendingRequests = new Map();
let requestIdCounter = 0;

/**
 * Add a console log entry (called from WebSocket handler)
 */
function addConsoleLog(entry) {
  consoleLogs.push(entry);
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
}

/**
 * Get console logs with filtering
 */
function getConsoleLogs(options = {}) {
  let filtered = [...consoleLogs];

  if (options.level && options.level !== 'all') {
    filtered = filtered.filter(log => log.level === options.level);
  }

  if (options.since) {
    filtered = filtered.filter(log => log.timestamp >= options.since);
  }

  if (options.tabId) {
    filtered = filtered.filter(log => log.tabId === options.tabId);
  }

  const limit = options.limit || 100;
  return {
    logs: filtered.slice(-limit),
    total: consoleLogs.length
  };
}

/**
 * Create a pending request for browser operation
 */
function createPendingRequest(timeout = 30000) {
  const requestId = `browser-${++requestIdCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timed out - browser may not be responding'));
    }, timeout);

    pendingRequests.set(requestId, {
      resolve: (data) => {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        resolve(data);
      },
      reject: (error) => {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }).then(result => ({ requestId, result }));
}

/**
 * Resolve a pending request (called from WebSocket handler)
 */
function resolvePendingRequest(requestId, data) {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    pending.resolve(data);
    return true;
  }
  return false;
}

// GET /api/browser/console-logs - Get console logs
router.get('/console-logs', (req, res) => {
  log.debug('GET /console-logs', req.query);

  const options = {
    level: req.query.level,
    limit: req.query.limit ? parseInt(req.query.limit) : 100,
    since: req.query.since ? parseInt(req.query.since) : undefined,
    tabId: req.query.tabId ? parseInt(req.query.tabId) : undefined
  };

  const result = getConsoleLogs(options);
  res.json(result);
});

// POST /api/browser/execute-script - Execute script in browser
router.post('/execute-script', async (req, res) => {
  const { code, tabId, allFrames } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  log.debug('POST /execute-script', { codeLength: code.length, tabId, allFrames });

  // Get the broadcast function from server.js
  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    // Create promise that will be resolved by WebSocket response
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out - browser may not be responding'));
      }, 30000);

      pendingRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          reject(error);
        }
      });
    });

    // Send request to extension via WebSocket
    broadcast({
      type: 'browser-execute-script',
      requestId,
      code,
      tabId,
      allFrames
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('execute-script error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/page-info - Get current page info
router.get('/page-info', async (req, res) => {
  const tabId = req.query.tabId ? parseInt(req.query.tabId) : undefined;

  log.debug('GET /page-info', { tabId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    // Create promise that will be resolved by WebSocket response
    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Request timed out'));
      }, 10000);

      pendingRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          reject(error);
        }
      });
    });

    // Send request to extension via WebSocket
    broadcast({
      type: 'browser-get-page-info',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('page-info error:', error);
    res.json({ url: '', title: '', tabId: -1, error: error.message });
  }
});

module.exports = router;
module.exports.addConsoleLog = addConsoleLog;
module.exports.getConsoleLogs = getConsoleLogs;
module.exports.resolvePendingRequest = resolvePendingRequest;
module.exports.pendingRequests = pendingRequests;
