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
 * Make a browser request via WebSocket with timeout handling
 *
 * @param {Function} broadcast - The broadcast function from app context
 * @param {string} type - The message type (e.g., 'browser-list-tabs')
 * @param {Object} payload - Additional payload to send with the message
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @param {string} timeoutMessage - Custom timeout error message
 * @returns {Promise} - Resolves with the response data
 */
async function makeBrowserRequest(broadcast, type, payload = {}, timeout = 10000, timeoutMessage = 'Request timed out') {
  const requestId = `browser-${++requestIdCounter}`;

  const resultPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(timeoutMessage));
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
  });

  broadcast({ type, requestId, ...payload });
  return resultPromise;
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

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-execute-script',
      { code, tabId, allFrames },
      30000,
      'Request timed out - browser may not be responding'
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-get-page-info', { tabId });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-download-file',
      { url, filename, conflictAction: conflictAction || 'uniquify' },
      60000,
      'Download timed out - may still be in progress'
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-get-downloads', { limit, state });
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
    const result = await makeBrowserRequest(broadcast, 'browser-cancel-download', { downloadId });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-save-page',
      { tabId, filename },
      60000,
      'Page save timed out - large pages may take longer'
    );
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-capture-image',
      { selector, tabId, outputPath },
      30000,
      'Image capture timed out'
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-list-tabs', {});
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
    const result = await makeBrowserRequest(broadcast, 'browser-switch-tab', { tabId });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-open-url',
      {
        url,
        newTab: newTab !== false,
        background: background === true,
        reuseExisting: reuseExisting !== false
      },
      30000
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-get-active-tab', {});
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
    const result = await makeBrowserRequest(broadcast, 'browser-get-settings', {});
    res.json(result);
  } catch (error) {
    log.error('get-settings error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/profiles - Get all terminal profiles from Chrome storage
// Optional query params:
//   category: filter by category name (can be repeated for multiple categories)
router.get('/profiles', async (req, res) => {
  // Parse category filter - can be single string or array
  const category = req.query.category;
  const categories = category
    ? (Array.isArray(category) ? category : [category])
    : undefined;

  log.debug('GET /profiles', { categories });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-get-profiles', { categories });
    res.json(result);
  } catch (error) {
    log.error('get-profiles error:', error);
    res.json({ success: false, profiles: [], error: error.message });
  }
});

// GET /api/browser/categories - Get all unique category names from profiles
router.get('/categories', async (req, res) => {
  log.debug('GET /categories');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-get-categories', {});
    res.json(result);
  } catch (error) {
    log.error('get-categories error:', error);
    res.json({ success: false, categories: [], error: error.message });
  }
});

// POST /api/browser/profiles - Create a new terminal profile
router.post('/profiles', async (req, res) => {
  const { profile } = req.body;

  if (!profile || !profile.name) {
    return res.status(400).json({ success: false, error: 'profile.name is required' });
  }

  log.debug('POST /profiles', { name: profile.name, id: profile.id });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-create-profile', { profile });
    res.json(result);
  } catch (error) {
    log.error('create-profile error:', error);
    res.json({ success: false, error: error.message });
  }
});

// PUT /api/browser/profiles/:id - Update an existing terminal profile
router.put('/profiles/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Profile ID is required' });
  }

  log.debug('PUT /profiles/:id', { id, updates: Object.keys(updates) });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-update-profile', { id, updates });
    res.json(result);
  } catch (error) {
    log.error('update-profile error:', error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/browser/profiles/:id - Delete a terminal profile
router.delete('/profiles/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Profile ID is required' });
  }

  log.debug('DELETE /profiles/:id', { id });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-delete-profile', { id });
    res.json(result);
  } catch (error) {
    log.error('delete-profile error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/profiles/import - Bulk import profiles from JSON
router.post('/profiles/import', async (req, res) => {
  const { profiles, mode } = req.body;

  if (!profiles || !Array.isArray(profiles)) {
    return res.status(400).json({ success: false, error: 'profiles array is required' });
  }

  // Validate each profile has a name
  for (let i = 0; i < profiles.length; i++) {
    if (!profiles[i].name) {
      return res.status(400).json({ success: false, error: `Profile at index ${i} is missing required 'name' field` });
    }
  }

  log.debug('POST /profiles/import', { count: profiles.length, mode: mode || 'merge' });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-import-profiles', { profiles, mode });
    res.json(result);
  } catch (error) {
    log.error('import-profiles error:', error);
    res.json({ success: false, error: error.message });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-click-element',
      { selector, tabId, waitTimeout: waitTimeout || 5000 },
      15000,
      'Click operation timed out - element may not exist'
    );
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-fill-input',
      { selector, value, tabId, waitTimeout: waitTimeout || 5000 },
      15000,
      'Fill operation timed out - element may not exist'
    );
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-get-element-info',
      {
        selector,
        tabId,
        includeStyles: includeStyles !== false,
        styleProperties: styleProperties || null
      }
    );
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
  const { tabId, selector, outputPath } = req.body;

  log.debug('POST /screenshot', { tabId, selector, outputPath });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-screenshot',
      { tabId, selector, fullPage: false, outputPath },
      30000,
      'Screenshot timed out'
    );
    res.json(result);
  } catch (error) {
    log.error('screenshot error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/screenshot-full - Capture full page screenshot (scroll + stitch)
router.post('/screenshot-full', async (req, res) => {
  const { tabId, outputPath } = req.body;

  log.debug('POST /screenshot-full', { tabId, outputPath });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-screenshot',
      { tabId, fullPage: true, outputPath },
      60000,
      'Full page screenshot timed out'
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-bookmarks-tree', { folderId, maxDepth });
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
    const result = await makeBrowserRequest(broadcast, 'browser-bookmarks-search', { query, limit });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-bookmarks-create',
      { url, title, parentId: parentId || '1', index }
    );
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-bookmarks-create-folder',
      { title, parentId: parentId || '1', index }
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-bookmarks-move', { id, parentId, index });
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
    const result = await makeBrowserRequest(broadcast, 'browser-bookmarks-delete', { id });
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
    const result = await makeBrowserRequest(broadcast, 'browser-enable-network-capture', { tabId });
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-get-network-requests',
      {
        urlPattern,
        method,
        statusMin,
        statusMax,
        resourceType,
        limit: limit || 50,
        offset: offset || 0,
        tabId
      }
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-clear-network-requests', {});
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-get-dom-tree',
      { tabId, maxDepth: maxDepth || 4, selector },
      30000,
      'Request timed out - debugger operation may still be in progress'
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-profile-performance', { tabId }, 15000);
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-get-coverage',
      { tabId, coverageType: type || 'both' },
      20000
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-list-tab-groups', {});
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-create-tab-group',
      { tabIds, title, color, collapsed }
    );
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
    const result = await makeBrowserRequest(
      broadcast,
      'browser-update-tab-group',
      { groupId, title, color, collapsed }
    );
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
    const result = await makeBrowserRequest(broadcast, 'browser-add-to-tab-group', { groupId, tabIds });
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
    const result = await makeBrowserRequest(broadcast, 'browser-ungroup-tabs', { tabIds });
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
    const result = await makeBrowserRequest(broadcast, 'browser-add-to-claude-group', { tabId });
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
    const result = await makeBrowserRequest(broadcast, 'browser-remove-from-claude-group', { tabId });
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
    const result = await makeBrowserRequest(broadcast, 'browser-get-claude-group-status', {});
    res.json(result);
  } catch (error) {
    log.error('get-claude-group-status error:', error);
    res.json({ success: false, exists: false, error: error.message });
  }
});

// ============================================
// WINDOW MANAGEMENT ROUTES
// ============================================

// GET /api/browser/windows - List all browser windows
router.get('/windows', async (req, res) => {
  log.debug('GET /windows');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-list-windows', {});
    res.json(result);
  } catch (error) {
    log.error('list-windows error:', error);
    res.json({ success: false, windows: [], error: error.message });
  }
});

// POST /api/browser/windows - Create a new browser window
router.post('/windows', async (req, res) => {
  const { url, type, state, focused, width, height, left, top, incognito, tabId } = req.body;

  log.debug('POST /windows', { url, type, state, width, height });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-create-window',
      { url, type, state, focused, width, height, left, top, incognito, tabId },
      15000,
      'Window creation timed out'
    );
    res.json(result);
  } catch (error) {
    log.error('create-window error:', error);
    res.json({ success: false, error: error.message });
  }
});

// PUT /api/browser/windows/:windowId - Update a window's properties
router.put('/windows/:windowId', async (req, res) => {
  const windowId = parseInt(req.params.windowId);
  const { state, focused, width, height, left, top, drawAttention } = req.body;

  if (isNaN(windowId)) {
    return res.status(400).json({ success: false, error: 'Invalid windowId' });
  }

  log.debug('PUT /windows/:windowId', { windowId, state, focused, width, height, left, top });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-update-window',
      { windowId, state, focused, width, height, left, top, drawAttention }
    );
    res.json(result);
  } catch (error) {
    log.error('update-window error:', error);
    res.json({ success: false, error: error.message });
  }
});

// DELETE /api/browser/windows/:windowId - Close a window
router.delete('/windows/:windowId', async (req, res) => {
  const windowId = parseInt(req.params.windowId);

  if (isNaN(windowId)) {
    return res.status(400).json({ success: false, error: 'Invalid windowId' });
  }

  log.debug('DELETE /windows/:windowId', { windowId });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-close-window', { windowId });
    res.json(result);
  } catch (error) {
    log.error('close-window error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/displays - Get display/monitor information
router.get('/displays', async (req, res) => {
  log.debug('GET /displays');

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-get-displays', {});
    res.json(result);
  } catch (error) {
    log.error('get-displays error:', error);
    res.json({ success: false, displays: [], error: error.message });
  }
});

// POST /api/browser/windows/tile - Tile windows in a grid layout
router.post('/windows/tile', async (req, res) => {
  const { windowIds, layout, displayId, gap } = req.body;

  if (!windowIds || !Array.isArray(windowIds) || windowIds.length === 0) {
    return res.status(400).json({ success: false, error: 'windowIds array is required' });
  }

  log.debug('POST /windows/tile', { windowIds, layout, displayId, gap });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-tile-windows',
      { windowIds, layout, displayId, gap }
    );
    res.json(result);
  } catch (error) {
    log.error('tile-windows error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/popout-terminal - Pop out sidepanel to standalone window
router.post('/popout-terminal', async (req, res) => {
  const { terminalId, width, height, left, top } = req.body;

  log.debug('POST /popout-terminal', { terminalId, width, height, left, top });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-popout-terminal',
      { terminalId, width, height, left, top }
    );
    res.json(result);
  } catch (error) {
    log.error('popout-terminal error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// HISTORY ROUTES
// ============================================

// POST /api/browser/history/search - Search browsing history
router.post('/history/search', async (req, res) => {
  const { query, startTime, endTime, maxResults } = req.body;

  if (query === undefined) {
    return res.status(400).json({ success: false, error: 'query is required' });
  }

  log.debug('POST /history/search', { query, startTime, endTime, maxResults });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-history-search',
      { query, startTime, endTime, maxResults: maxResults || 100 }
    );
    res.json(result);
  } catch (error) {
    log.error('history-search error:', error);
    res.json({ success: false, items: [], total: 0, error: error.message });
  }
});

// POST /api/browser/history/visits - Get visit details for a URL
router.post('/history/visits', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  log.debug('POST /history/visits', { url });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-history-visits', { url });
    res.json(result);
  } catch (error) {
    log.error('history-visits error:', error);
    res.json({ success: false, visits: [], error: error.message });
  }
});

// GET /api/browser/history/recent - Get most recent history entries
router.get('/history/recent', async (req, res) => {
  const maxResults = req.query.maxResults ? parseInt(req.query.maxResults) : 50;

  log.debug('GET /history/recent', { maxResults });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-history-recent', { maxResults });
    res.json(result);
  } catch (error) {
    log.error('history-recent error:', error);
    res.json({ success: false, items: [], total: 0, error: error.message });
  }
});

// POST /api/browser/history/delete-url - Delete a specific URL from history
router.post('/history/delete-url', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  log.debug('POST /history/delete-url', { url });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-history-delete-url', { url });
    res.json(result);
  } catch (error) {
    log.error('history-delete-url error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/history/delete-range - Delete history within a date range
router.post('/history/delete-range', async (req, res) => {
  const { startTime, endTime } = req.body;

  if (startTime === undefined || endTime === undefined) {
    return res.status(400).json({ success: false, error: 'startTime and endTime are required' });
  }

  log.debug('POST /history/delete-range', { startTime, endTime });

  const broadcast = req.app.get('broadcast');
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available'
    });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-history-delete-range', { startTime, endTime });
    res.json(result);
  } catch (error) {
    log.error('history-delete-range error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// SESSIONS ROUTES (Recently closed, synced devices)
// ============================================

router.get('/sessions/recent', async (req, res) => {
  const maxResults = req.query.maxResults ? parseInt(req.query.maxResults) : 25;
  log.debug('GET /sessions/recent', { maxResults });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-sessions-recent', { maxResults });
    res.json(result);
  } catch (error) {
    log.error('sessions-recent error:', error);
    res.json({ success: false, sessions: [], error: error.message });
  }
});

router.post('/sessions/restore', async (req, res) => {
  const { sessionId } = req.body;
  log.debug('POST /sessions/restore', { sessionId });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-sessions-restore', { sessionId });
    res.json(result);
  } catch (error) {
    log.error('sessions-restore error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.get('/sessions/devices', async (req, res) => {
  const maxResults = req.query.maxResults ? parseInt(req.query.maxResults) : 10;
  log.debug('GET /sessions/devices', { maxResults });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-sessions-devices', { maxResults });
    res.json(result);
  } catch (error) {
    log.error('sessions-devices error:', error);
    res.json({ success: false, devices: [], error: error.message });
  }
});

// ============================================
// COOKIE ROUTES
// ============================================

router.post('/cookies/get', async (req, res) => {
  const { url, name } = req.body;
  if (!url || !name) return res.status(400).json({ success: false, error: 'url and name are required' });
  log.debug('POST /cookies/get', { url, name });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-cookies-get', { url, name });
    res.json(result);
  } catch (error) {
    log.error('cookies-get error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/cookies/list', async (req, res) => {
  const { domain, url } = req.body;
  log.debug('POST /cookies/list', { domain, url });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-cookies-list', { domain, url });
    res.json(result);
  } catch (error) {
    log.error('cookies-list error:', error);
    res.json({ success: false, cookies: [], error: error.message });
  }
});

router.post('/cookies/set', async (req, res) => {
  const cookie = req.body;
  log.debug('POST /cookies/set', { name: cookie.name, domain: cookie.domain });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-cookies-set', cookie);
    res.json(result);
  } catch (error) {
    log.error('cookies-set error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/cookies/delete', async (req, res) => {
  const { url, name } = req.body;
  if (!url || !name) return res.status(400).json({ success: false, error: 'url and name are required' });
  log.debug('POST /cookies/delete', { url, name });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-cookies-delete', { url, name });
    res.json(result);
  } catch (error) {
    log.error('cookies-delete error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/cookies/audit', async (req, res) => {
  const { tabId } = req.body;
  log.debug('POST /cookies/audit', { tabId });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-cookies-audit', { tabId });
    res.json(result);
  } catch (error) {
    log.error('cookies-audit error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// EMULATION ROUTES (CDP)
// ============================================

router.post('/emulate/device', async (req, res) => {
  const { tabId, device, width, height, deviceScaleFactor, mobile } = req.body;
  log.debug('POST /emulate/device', { device, width, height });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-device', { tabId, device, width, height, deviceScaleFactor, mobile });
    res.json(result);
  } catch (error) {
    log.error('emulate-device error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/clear', async (req, res) => {
  const { tabId } = req.body;
  log.debug('POST /emulate/clear', { tabId });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-clear', { tabId });
    res.json(result);
  } catch (error) {
    log.error('emulate-clear error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/geolocation', async (req, res) => {
  const { tabId, latitude, longitude, accuracy } = req.body;
  log.debug('POST /emulate/geolocation', { latitude, longitude });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-geolocation', { tabId, latitude, longitude, accuracy });
    res.json(result);
  } catch (error) {
    log.error('emulate-geolocation error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/network', async (req, res) => {
  const { tabId, preset, offline, latency, downloadThroughput, uploadThroughput } = req.body;
  log.debug('POST /emulate/network', { preset, offline });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-network', { tabId, preset, offline, latency, downloadThroughput, uploadThroughput });
    res.json(result);
  } catch (error) {
    log.error('emulate-network error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/media', async (req, res) => {
  const { tabId, type, features } = req.body;
  log.debug('POST /emulate/media', { type, features });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-media', { tabId, type, features });
    res.json(result);
  } catch (error) {
    log.error('emulate-media error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/vision', async (req, res) => {
  const { tabId, type } = req.body;
  log.debug('POST /emulate/vision', { type });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-vision', { tabId, type });
    res.json(result);
  } catch (error) {
    log.error('emulate-vision error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// NOTIFICATION ROUTES
// ============================================

router.post('/notification/show', async (req, res) => {
  const { title, message, type, iconUrl, imageUrl, items, progress, buttons, priority, notificationId } = req.body;
  if (!title || !message) return res.status(400).json({ success: false, error: 'title and message are required' });
  log.debug('POST /notification/show', { title, type });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    // Use notificationType to avoid collision with WebSocket message 'type' field
    const result = await makeBrowserRequest(broadcast, 'browser-notification-show', { title, message, notificationType: type, iconUrl, imageUrl, items, progress, buttons, priority, notificationId });
    res.json(result);
  } catch (error) {
    log.error('notification-show error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/notification/update', async (req, res) => {
  const { notificationId, title, message, type, progress } = req.body;
  if (!notificationId) return res.status(400).json({ success: false, error: 'notificationId is required' });
  log.debug('POST /notification/update', { notificationId });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    // Use notificationType to avoid collision with WebSocket message 'type' field
    const result = await makeBrowserRequest(broadcast, 'browser-notification-update', { notificationId, title, message, notificationType: type, progress });
    res.json(result);
  } catch (error) {
    log.error('notification-update error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/notification/progress', async (req, res) => {
  const { notificationId, title, message, progress } = req.body;
  log.debug('POST /notification/progress', { notificationId, progress });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-notification-progress', { notificationId, title, message, progress });
    res.json(result);
  } catch (error) {
    log.error('notification-progress error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/notification/clear', async (req, res) => {
  const { notificationId } = req.body;
  if (!notificationId) return res.status(400).json({ success: false, error: 'notificationId is required' });
  log.debug('POST /notification/clear', { notificationId });
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-notification-clear', { notificationId });
    res.json(result);
  } catch (error) {
    log.error('notification-clear error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.get('/notification/list', async (req, res) => {
  log.debug('GET /notification/list');
  const broadcast = req.app.get('broadcast');
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-notification-list', {});
    res.json(result);
  } catch (error) {
    log.error('notification-list error:', error);
    res.json({ success: false, notifications: [], error: error.message });
  }
});

module.exports = router;
module.exports.addConsoleLog = addConsoleLog;
module.exports.getConsoleLogs = getConsoleLogs;
module.exports.resolvePendingRequest = resolvePendingRequest;
module.exports.pendingRequests = pendingRequests;
module.exports.makeBrowserRequest = makeBrowserRequest;
