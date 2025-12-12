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

// ============================================
// DOWNLOAD ROUTES
// ============================================

// POST /api/browser/download-file - Download a file via Chrome downloads API
router.post('/download-file', async (req, res) => {
  const { url, filename, conflictAction } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  log.debug('POST /download-file', { url, filename, conflictAction });

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
        reject(new Error('Download timed out - may still be in progress'));
      }, 60000); // 60 second timeout for downloads

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
      type: 'browser-download-file',
      requestId,
      url,
      filename,
      conflictAction: conflictAction || 'uniquify'
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('download-file error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/downloads - List recent downloads
router.get('/downloads', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;
  const state = req.query.state || 'all';

  log.debug('GET /downloads', { limit, state });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-get-downloads',
      requestId,
      limit,
      state
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-downloads error:', error);
    res.json({ downloads: [], total: 0, error: error.message });
  }
});

// POST /api/browser/cancel-download - Cancel an in-progress download
router.post('/cancel-download', async (req, res) => {
  const { downloadId } = req.body;

  if (downloadId === undefined) {
    return res.status(400).json({ success: false, error: 'downloadId is required' });
  }

  log.debug('POST /cancel-download', { downloadId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-cancel-download',
      requestId,
      downloadId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('cancel-download error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/capture-image - Capture image via canvas (works for blob URLs)
// This is the preferred method for AI-generated images (ChatGPT, Copilot, DALL-E, etc.)
router.post('/capture-image', async (req, res) => {
  const { selector, tabId, outputPath } = req.body;

  log.debug('POST /capture-image', { selector, tabId, outputPath });

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
        reject(new Error('Image capture timed out'));
      }, 30000); // 30 second timeout

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
      type: 'browser-capture-image',
      requestId,
      selector,
      tabId,
      outputPath
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('capture-image error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// Tab Management Routes (Extension-based)
// ============================================

// GET /api/browser/tabs - List all tabs with accurate active state
router.get('/tabs', async (req, res) => {
  log.debug('GET /tabs');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-list-tabs',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('list-tabs error:', error);
    res.json({ success: false, tabs: [], error: error.message });
  }
});

// POST /api/browser/switch-tab - Switch to a specific tab
router.post('/switch-tab', async (req, res) => {
  const { tabId } = req.body;

  if (tabId === undefined) {
    return res.status(400).json({ success: false, error: 'tabId is required' });
  }

  log.debug('POST /switch-tab', { tabId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-switch-tab',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('switch-tab error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/active-tab - Get the currently active tab
router.get('/active-tab', async (req, res) => {
  log.debug('GET /active-tab');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-get-active-tab',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-active-tab error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/settings - Get essential settings for external integrations
// Lighter than /profiles - just returns what integrations need
router.get('/settings', async (req, res) => {
  log.debug('GET /settings');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-get-settings',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-settings error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/profiles - Get all terminal profiles from Chrome storage
router.get('/profiles', async (req, res) => {
  log.debug('GET /profiles');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

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

    broadcast({
      type: 'browser-get-profiles',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-profiles error:', error);
    res.json({ success: false, profiles: [], error: error.message });
  }
});

module.exports = router;
module.exports.addConsoleLog = addConsoleLog;
module.exports.getConsoleLogs = getConsoleLogs;
module.exports.resolvePendingRequest = resolvePendingRequest;
module.exports.pendingRequests = pendingRequests;
