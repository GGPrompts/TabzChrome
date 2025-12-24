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

// POST /api/browser/save-page - Save page as MHTML using pageCapture API
router.post('/save-page', async (req, res) => {
  const { tabId, filename } = req.body;

  log.debug('POST /save-page', { tabId, filename });

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
        reject(new Error('Page save timed out - large pages may take longer'));
      }, 60000); // 60 second timeout for large pages

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
      type: 'browser-save-page',
      requestId,
      tabId,
      filename
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('save-page error:', error);
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

// POST /api/browser/open-url - Open a URL in a new or existing tab
router.post('/open-url', async (req, res) => {
  const { url, newTab, background, reuseExisting } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  log.debug('POST /open-url', { url, newTab, background, reuseExisting });

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
      }, 30000); // 30s timeout for navigation

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
      type: 'browser-open-url',
      requestId,
      url,
      newTab: newTab !== false, // default true
      background: background === true, // default false
      reuseExisting: reuseExisting !== false // default true
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('open-url error:', error);
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

// ============================================
// INTERACTION ROUTES (Click, Fill, Get Element)
// ============================================

// POST /api/browser/click-element - Click an element by CSS selector
router.post('/click-element', async (req, res) => {
  const { selector, tabId, waitTimeout } = req.body;

  if (!selector) {
    return res.status(400).json({ success: false, error: 'selector is required' });
  }

  log.debug('POST /click-element', { selector, tabId, waitTimeout });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Click operation timed out - element may not exist'));
      }, 15000); // 15 second timeout

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
      type: 'browser-click-element',
      requestId,
      selector,
      tabId,
      waitTimeout: waitTimeout || 5000
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('click-element error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/fill-input - Fill an input field with text
router.post('/fill-input', async (req, res) => {
  const { selector, value, tabId, waitTimeout } = req.body;

  if (!selector) {
    return res.status(400).json({ success: false, error: 'selector is required' });
  }
  if (value === undefined) {
    return res.status(400).json({ success: false, error: 'value is required' });
  }

  log.debug('POST /fill-input', { selector, valueLength: value.length, tabId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Fill operation timed out - element may not exist'));
      }, 15000); // 15 second timeout

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
      type: 'browser-fill-input',
      requestId,
      selector,
      value,
      tabId,
      waitTimeout: waitTimeout || 5000
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('fill-input error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/get-element-info - Get detailed information about an element
router.post('/get-element-info', async (req, res) => {
  const { selector, tabId, includeStyles, styleProperties } = req.body;

  if (!selector) {
    return res.status(400).json({ success: false, error: 'selector is required' });
  }

  log.debug('POST /get-element-info', { selector, tabId, includeStyles });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Get element info timed out'));
      }, 10000); // 10 second timeout

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
      type: 'browser-get-element-info',
      requestId,
      selector,
      tabId,
      includeStyles: includeStyles !== false, // default true
      styleProperties: styleProperties || null
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-element-info error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// SCREENSHOT ROUTES
// ============================================

// POST /api/browser/screenshot - Capture screenshot of current viewport
router.post('/screenshot', async (req, res) => {
  const { tabId, selector } = req.body;

  log.debug('POST /screenshot', { tabId, selector });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Screenshot timed out'));
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

    broadcast({
      type: 'browser-screenshot',
      requestId,
      tabId,
      selector,
      fullPage: false
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('screenshot error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/screenshot-full - Capture full page screenshot (scroll + stitch)
router.post('/screenshot-full', async (req, res) => {
  const { tabId } = req.body;

  log.debug('POST /screenshot-full', { tabId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const requestId = `browser-${++requestIdCounter}`;

    const resultPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('Full page screenshot timed out'));
      }, 60000); // 60 second timeout for full page

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
      type: 'browser-screenshot',
      requestId,
      tabId,
      fullPage: true
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('screenshot-full error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// BOOKMARK ROUTES
// ============================================

// GET /api/browser/bookmarks/tree - Get bookmark tree
router.get('/bookmarks/tree', async (req, res) => {
  const folderId = req.query.folderId;
  const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth) : 3;

  log.debug('GET /bookmarks/tree', { folderId, maxDepth });

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
      type: 'browser-bookmarks-tree',
      requestId,
      folderId,
      maxDepth
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-tree error:', error);
    res.json({ success: false, tree: [], error: error.message });
  }
});

// GET /api/browser/bookmarks/search - Search bookmarks
router.get('/bookmarks/search', async (req, res) => {
  const query = req.query.query;
  const limit = req.query.limit ? parseInt(req.query.limit) : 20;

  if (!query) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }

  log.debug('GET /bookmarks/search', { query, limit });

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
      type: 'browser-bookmarks-search',
      requestId,
      query,
      limit
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-search error:', error);
    res.json({ success: false, bookmarks: [], error: error.message });
  }
});

// POST /api/browser/bookmarks/create - Create a bookmark
router.post('/bookmarks/create', async (req, res) => {
  const { url, title, parentId, index } = req.body;

  if (!url || !title) {
    return res.status(400).json({ success: false, error: 'url and title are required' });
  }

  log.debug('POST /bookmarks/create', { url, title, parentId, index });

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
      type: 'browser-bookmarks-create',
      requestId,
      url,
      title,
      parentId: parentId || '1',
      index
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-create error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/bookmarks/create-folder - Create a bookmark folder
router.post('/bookmarks/create-folder', async (req, res) => {
  const { title, parentId, index } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  log.debug('POST /bookmarks/create-folder', { title, parentId, index });

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
      type: 'browser-bookmarks-create-folder',
      requestId,
      title,
      parentId: parentId || '1',
      index
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-create-folder error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/bookmarks/move - Move a bookmark or folder
router.post('/bookmarks/move', async (req, res) => {
  const { id, parentId, index } = req.body;

  if (!id || !parentId) {
    return res.status(400).json({ success: false, error: 'id and parentId are required' });
  }

  log.debug('POST /bookmarks/move', { id, parentId, index });

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
      type: 'browser-bookmarks-move',
      requestId,
      id,
      parentId,
      index
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-move error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/bookmarks/delete - Delete a bookmark or folder
router.post('/bookmarks/delete', async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'id is required' });
  }

  log.debug('POST /bookmarks/delete', { id });

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
      type: 'browser-bookmarks-delete',
      requestId,
      id
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('bookmarks-delete error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// NETWORK CAPTURE ROUTES
// ============================================

// POST /api/browser/network-capture/enable - Enable network request monitoring
router.post('/network-capture/enable', async (req, res) => {
  const { tabId } = req.body;

  log.debug('POST /network-capture/enable', { tabId });

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
      type: 'browser-enable-network-capture',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('enable-network-capture error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/network-requests - Get captured network requests (with filtering)
router.post('/network-requests', async (req, res) => {
  const { urlPattern, method, statusMin, statusMax, resourceType, limit, offset, tabId } = req.body;

  log.debug('POST /network-requests', { urlPattern, method, statusMin, statusMax, resourceType, limit });

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
      type: 'browser-get-network-requests',
      requestId,
      urlPattern,
      method,
      statusMin,
      statusMax,
      resourceType,
      limit: limit || 50,
      offset: offset || 0,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-network-requests error:', error);
    res.json({ requests: [], total: 0, captureActive: false, error: error.message });
  }
});

// POST /api/browser/network-requests/clear - Clear all captured network requests
router.post('/network-requests/clear', async (req, res) => {
  log.debug('POST /network-requests/clear');

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
      type: 'browser-clear-network-requests',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('clear-network-requests error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// DEBUGGER ROUTES (DOM Tree, Performance, Coverage)
// ============================================

// POST /api/browser/debugger/dom-tree - Get DOM tree using chrome.debugger
router.post('/debugger/dom-tree', async (req, res) => {
  const { tabId, maxDepth, selector } = req.body;

  log.debug('POST /debugger/dom-tree', { tabId, maxDepth, selector });

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
        reject(new Error('Request timed out - debugger operation may still be in progress'));
      }, 30000); // 30s timeout for debugger operations

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
      type: 'browser-get-dom-tree',
      requestId,
      tabId,
      maxDepth: maxDepth || 4,
      selector
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('debugger/dom-tree error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/debugger/performance - Profile page performance
router.post('/debugger/performance', async (req, res) => {
  const { tabId } = req.body;

  log.debug('POST /debugger/performance', { tabId });

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
      }, 15000); // 15s timeout

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
      type: 'browser-profile-performance',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('debugger/performance error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/debugger/coverage - Get JS/CSS code coverage
router.post('/debugger/coverage', async (req, res) => {
  const { tabId, type } = req.body;

  log.debug('POST /debugger/coverage', { tabId, type });

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
      }, 20000); // 20s timeout for coverage

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
      type: 'browser-get-coverage',
      requestId,
      tabId,
      coverageType: type || 'both'
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('debugger/coverage error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// TAB GROUPS ROUTES
// ============================================

// GET /api/browser/tab-groups - List all tab groups
router.get('/tab-groups', async (req, res) => {
  log.debug('GET /tab-groups');

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
      type: 'browser-list-tab-groups',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('list-tab-groups error:', error);
    res.json({ success: false, groups: [], error: error.message });
  }
});

// POST /api/browser/tab-groups - Create a new tab group
router.post('/tab-groups', async (req, res) => {
  const { tabIds, title, color, collapsed } = req.body;

  if (!tabIds || !Array.isArray(tabIds) || tabIds.length === 0) {
    return res.status(400).json({ success: false, error: 'tabIds array is required' });
  }

  log.debug('POST /tab-groups', { tabIds, title, color, collapsed });

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
      type: 'browser-create-tab-group',
      requestId,
      tabIds,
      title,
      color,
      collapsed
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('create-tab-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// PUT /api/browser/tab-groups/:groupId - Update a tab group
router.put('/tab-groups/:groupId', async (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const { title, color, collapsed } = req.body;

  if (isNaN(groupId)) {
    return res.status(400).json({ success: false, error: 'Invalid groupId' });
  }

  log.debug('PUT /tab-groups/:groupId', { groupId, title, color, collapsed });

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
      type: 'browser-update-tab-group',
      requestId,
      groupId,
      title,
      color,
      collapsed
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('update-tab-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/tab-groups/:groupId/tabs - Add tabs to a group
router.post('/tab-groups/:groupId/tabs', async (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const { tabIds } = req.body;

  if (isNaN(groupId)) {
    return res.status(400).json({ success: false, error: 'Invalid groupId' });
  }

  if (!tabIds || !Array.isArray(tabIds) || tabIds.length === 0) {
    return res.status(400).json({ success: false, error: 'tabIds array is required' });
  }

  log.debug('POST /tab-groups/:groupId/tabs', { groupId, tabIds });

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
      type: 'browser-add-to-tab-group',
      requestId,
      groupId,
      tabIds
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('add-to-tab-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/ungroup-tabs - Remove tabs from their groups
router.post('/ungroup-tabs', async (req, res) => {
  const { tabIds } = req.body;

  if (!tabIds || !Array.isArray(tabIds) || tabIds.length === 0) {
    return res.status(400).json({ success: false, error: 'tabIds array is required' });
  }

  log.debug('POST /ungroup-tabs', { tabIds });

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
      type: 'browser-ungroup-tabs',
      requestId,
      tabIds
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('ungroup-tabs error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/claude-group/add - Add tab to Claude Active group
router.post('/claude-group/add', async (req, res) => {
  const { tabId } = req.body;

  if (tabId === undefined) {
    return res.status(400).json({ success: false, error: 'tabId is required' });
  }

  log.debug('POST /claude-group/add', { tabId });

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
      type: 'browser-add-to-claude-group',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('add-to-claude-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/claude-group/remove - Remove tab from Claude Active group
router.post('/claude-group/remove', async (req, res) => {
  const { tabId } = req.body;

  if (tabId === undefined) {
    return res.status(400).json({ success: false, error: 'tabId is required' });
  }

  log.debug('POST /claude-group/remove', { tabId });

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
      type: 'browser-remove-from-claude-group',
      requestId,
      tabId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('remove-from-claude-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/claude-group/status - Get Claude Active group status
router.get('/claude-group/status', async (req, res) => {
  log.debug('GET /claude-group/status');

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
      type: 'browser-get-claude-group-status',
      requestId
    });

    const result = await resultPromise;
    res.json(result);
  } catch (error) {
    log.error('get-claude-group-status error:', error);
    res.json({ success: false, exists: false, error: error.message });
  }
});

module.exports = router;
module.exports.addConsoleLog = addConsoleLog;
module.exports.getConsoleLogs = getConsoleLogs;
module.exports.resolvePendingRequest = resolvePendingRequest;
module.exports.pendingRequests = pendingRequests;
