/**
 * Browser MCP API Routes
 *
 * REST API endpoints for the browser-mcp-server to access browser data
 * via the TabzChrome extension.
 */

const express = require('express');
const nodePath = require('path');
const router = express.Router();
const { createModuleLogger } = require('../modules/logger');
const credentialStore = require('../modules/credential-store');
const terminalRegistryModule = require('../modules/terminal-registry');
const wsIdentity = require('../modules/ws-identity');

const log = createModuleLogger('BrowserAPI');

// Console log buffer (populated via WebSocket from extension)
// This is shared with server.js via module.exports
const consoleLogs = [];
const MAX_CONSOLE_LOGS = 1000;

// Pending requests for browser operations (WebSocket request/response)
const pendingRequests = new Map();
let requestIdCounter = 0;

function redactSubmittedValue(value, submittedValue) {
  if (typeof submittedValue !== 'string' || submittedValue.length === 0) return value;
  if (typeof value === 'string') return value.split(submittedValue).join('[redacted]');
  if (Array.isArray(value)) return value.map(item => redactSubmittedValue(item, submittedValue));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSubmittedValue(item, submittedValue)]));
  }
  return value;
}

/**
 * Keep an ordinary field's verified read-back. Protected documents return
 * only a boolean mutation verdict, and sensitive fields omit their value.
 * Error text is always scrubbed because browser errors can quote submitted data.
 */
function sanitizeFillResult(result, submittedValue) {
  const safe = redactSubmittedValue(result, submittedValue);
  if (result?.protected === true) {
    return {
      success: result.success === true,
      verified: result.verified === true,
      protected: true,
      ...(typeof result.selected === 'boolean' ? { selected: result.selected } : {}),
      ...(result.success === true ? {} : { error: 'Protected document fill was refused or could not be verified' })
    };
  }
  // Recursive redaction remains the default. Restore only the one field whose
  // explicit contract permits an echo: a confirmed ordinary read-back.
  if (result?.success === true && result.verified === true && result.sensitive === false && typeof result.actualValue === 'string') {
    safe.actualValue = result.actualValue;
  } else {
    delete safe.actualValue;
  }
  return safe;
}

const BROWSER_RESPONSE_RESERVE_MS = 1000;

/** Leave time for the extension response to cross the WebSocket before the relay expires. */
function requestTimeoutMs(relayTimeoutMs) {
  if (!Number.isFinite(relayTimeoutMs) || relayTimeoutMs <= BROWSER_RESPONSE_RESERVE_MS) {
    throw new Error(`Browser relay timeout must exceed the ${BROWSER_RESPONSE_RESERVE_MS}ms response reserve`);
  }
  return relayTimeoutMs - BROWSER_RESPONSE_RESERVE_MS;
}

/**
 * Add a console log entry (called from WebSocket handler)
 */
function addConsoleLog(entry) {
  const captured = Object.freeze({ ...entry });
  consoleLogs.push(captured);
  if (consoleLogs.length > MAX_CONSOLE_LOGS) {
    consoleLogs.shift();
  }
}

function removeConsoleLogsForTab(tabId) {
  let removed = 0;
  for (let index = consoleLogs.length - 1; index >= 0; index -= 1) {
    if (consoleLogs[index].tabId !== tabId) continue;
    consoleLogs.splice(index, 1);
    removed += 1;
  }
  return removed;
}

function filterLogsByPattern(entries, pattern, keep) {
  let test;
  try {
    const regex = new RegExp(pattern, 'i');
    test = url => regex.test(url);
  } catch {
    test = url => url.includes(pattern);
  }
  return entries.filter(entry => test(entry.url || '') === keep);
}

function firstStackFrame(stack) {
  if (typeof stack !== 'string') return '';
  const line = stack.split('\n').find(candidate => candidate.trim());
  return line ? line.trim() : '';
}

function duplicateLogKey(entry) {
  return JSON.stringify([entry.tabId, entry.level, entry.url, entry.source, entry.origin, entry.message, firstStackFrame(entry.stack)]);
}

function collapseDuplicateLogs(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = duplicateLogKey(entry);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...entry, count: 1 });
      continue;
    }
    seen.count += 1;
    seen.timestamp = entry.timestamp;
    if (entry.stack === undefined) delete seen.stack;
    else seen.stack = entry.stack;
    byKey.delete(key);
    byKey.set(key, seen);
  }
  return [...byKey.values()];
}

/**
 * Get console logs with filtering
 */
function getConsoleLogs(options = {}) {
  let filtered = [...consoleLogs];

  if (options.agent !== undefined) {
    filtered = filtered.filter(entry => entry.agent === options.agent);
  }

  if (options.groupId !== undefined) {
    filtered = filtered.filter(entry => entry.groupId === options.groupId);
  }

  if (options.level && options.level !== 'all') {
    const levels = String(options.level).split(',').map(level => level.trim()).filter(Boolean);
    if (levels.length) filtered = filtered.filter(entry => levels.includes(entry.level));
  }

  if (options.since) {
    filtered = filtered.filter(log => log.timestamp >= options.since);
  }

  if (options.tabId !== undefined) {
    filtered = filtered.filter(log => log.tabId === options.tabId);
  }

  if (options.urlPattern) filtered = filterLogsByPattern(filtered, options.urlPattern, true);
  if (options.excludePattern) filtered = filterLogsByPattern(filtered, options.excludePattern, false);

  const limit = options.limit || 100;
  const collapsed = collapseDuplicateLogs(filtered);
  const returned = collapsed.slice(-limit);
  const result = {
    logs: returned,
    total: filtered.length,
    duplicatesCollapsed: returned.reduce((sum, entry) => sum + ((entry.count || 1) - 1), 0),
    cleared: 0
  };

  if (options.clear && returned.length > 0) {
    const candidates = new Set(filtered);
    const returnedKeys = new Set(returned.map(duplicateLogKey));
    for (let index = consoleLogs.length - 1; index >= 0; index -= 1) {
      const entry = consoleLogs[index];
      if (!candidates.has(entry) || !returnedKeys.has(duplicateLogKey(entry))) continue;
      consoleLogs.splice(index, 1);
      result.cleared += 1;
    }
  }

  return result;
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
async function makeBrowserRequest(
  broadcast,
  type,
  payload = {},
  timeout = 10000,
  timeoutMessage = 'Request timed out',
  options = {}
) {
  const requestId = `browser-${++requestIdCounter}`;

  const resultPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(timeoutMessage));
    }, timeout);

    pendingRequests.set(requestId, {
      resolve: (data, sender) => {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        resolve(options.withSender ? { data, sender } : data);
      },
      reject: (error) => {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        reject(error);
      }
    });
  });

  // The request envelope is authoritative. Route data cannot redirect the
  // request or replace the identifier used to resolve it.
  let sent;
  try {
    sent = broadcast({ ...payload, type, requestId });
  } catch (error) {
    const pending = pendingRequests.get(requestId);
    if (pending) pending.reject(error);
    return resultPromise;
  }
  if (sent === 0) {
    const pending = pendingRequests.get(requestId);
    if (pending) pending.reject(new Error('Browser extension is not connected'));
  }
  return resultPromise;
}

function requestAgent(req) {
  const rawAgent = req.body?.agent ?? req.query?.agent;
  return typeof rawAgent === 'string' && rawAgent.trim() ? rawAgent.trim() : undefined;
}

/**
 * Browser requests go to the single identified extension connection. Attach
 * the caller identity after the route payload is built so a payload cannot
 * replace it, while preserving the existing WebSocket type and result names.
 */
function browserChannel(req) {
  const send = req.app.get('sendToExtension')
    || (process.env.NODE_ENV === 'test' ? req.app.get('broadcast') : undefined);
  if (!send) return undefined;
  const agent = requestAgent(req);
  return frame => send(agent ? { ...frame, agent } : frame);
}

/**
 * Resolve a pending request (called from WebSocket handler)
 */
function resolvePendingRequest(requestId, data, sender) {
  const pending = pendingRequests.get(requestId);
  if (pending) {
    pending.resolve(data, sender);
    return true;
  }
  return false;
}

/** Fields accepted from a browser-fill-input-result frame. */
function fillInputResultFields(data) {
  if (data.protected === true) {
    return {
      success: data.success === true,
      verified: data.verified === true,
      protected: true,
      ...(typeof data.selected === 'boolean' ? { selected: data.selected } : {}),
      ...(data.success === true ? {} : { error: 'Protected document fill was refused or could not be verified' })
    };
  }
  return {
    success: data.success,
    tagName: data.tagName,
    inputType: data.inputType,
    sensitive: data.sensitive,
    selected: data.selected,
    host: data.host,
    protected: data.protected === true,
    verified: data.verified,
    verifyError: data.verifyError,
    actualLength: data.actualLength,
    actualValue: data.sensitive === true ? undefined : data.actualValue,
    error: data.error
  };
}

/** Preserve execution-path and timeout uncertainty metadata from script evaluation. */
function scriptResultFields(data) {
  return {
    success: data.success,
    result: data.result,
    executionPath: data.executionPath,
    resultTruncated: data.resultTruncated,
    warning: data.warning,
    timedOut: data.timedOut,
    uncertain: data.uncertain,
    terminationAttempted: data.terminationAttempted,
    terminationAcknowledged: data.terminationAcknowledged,
    error: data.error
  };
}

const PAGE_ACT_ACTIONS = Object.freeze([
  'click', 'right_click', 'double_click', 'triple_click', 'hover',
  'type', 'key', 'scroll', 'scroll_to', 'drag'
]);

function boundedString(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function actTargetFields(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return undefined;
  const projected = {
    description: boundedString(target.description, 500),
    tagName: boundedString(target.tagName, 80),
    x: finiteNumber(target.x),
    y: finiteNumber(target.y)
  };
  return Object.values(projected).some(value => value !== undefined) ? projected : undefined;
}

function actRecoveryFields(recovery) {
  if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery)) return undefined;
  const point = recovery.point && typeof recovery.point === 'object'
    ? { x: finiteNumber(recovery.point.x), y: finiteNumber(recovery.point.y) }
    : undefined;
  const covering = recovery.covering && typeof recovery.covering === 'object'
    ? {
        tag: boundedString(recovery.covering.tag, 80),
        description: boundedString(recovery.covering.description, 500)
      }
    : undefined;
  const suggestions = Array.isArray(recovery.suggestions)
    ? recovery.suggestions.slice(0, 20).map(suggestion => ({
        ref: boundedString(suggestion?.ref, 200),
        role: boundedString(suggestion?.role, 100),
        name: boundedString(suggestion?.name, 500),
        tag: boundedString(suggestion?.tag, 80)
      }))
    : undefined;
  const refs = Array.isArray(recovery.refs)
    ? recovery.refs.filter(ref => typeof ref === 'string').slice(0, 20).map(ref => ref.slice(0, 200))
    : undefined;
  const projected = {
    url: sanitizeLoginStateUrl(recovery.url),
    title: boundedString(recovery.title, 500),
    point: point && Object.values(point).some(value => value !== undefined) ? point : undefined,
    covering: covering && Object.values(covering).some(value => value !== undefined) ? covering : undefined,
    suggestions,
    refs
  };
  return Object.values(projected).some(value => value !== undefined && value !== '') ? projected : undefined;
}

const ACT_RESULT_STATUSES = new Set([
  'completed', 'verified', 'verification_failed', 'unverified',
  'failed', 'refused', 'unknown'
]);

function actResultStatus(value) {
  return ACT_RESULT_STATUSES.has(value) ? value : undefined;
}

/** Allowlist result fields accepted from browser-act-result. */
function actResultFields(data) {
  if (data?.protected === true) {
    const unknown = data.success === null || data.status === 'unknown';
    const verified = data.verified === true;
    const success = !unknown && data.success === true && verified;
    return {
      success: unknown ? null : success,
      status: unknown ? 'unknown' : actResultStatus(data.status),
      action: PAGE_ACT_ACTIONS.includes(data.action) ? data.action : undefined,
      trusted: typeof data.trusted === 'boolean' ? data.trusted : undefined,
      tabId: Number.isInteger(data.tabId) && data.tabId > 0 ? data.tabId : undefined,
      protected: true,
      verified,
      ...(success ? {} : {
        error: unknown
          ? 'Protected document action outcome is unknown; do not automatically retry'
          : 'Protected document action was refused or could not be verified'
      })
    };
  }

  const events = Array.isArray(data?.events)
    ? data.events.filter(event => typeof event === 'string').slice(0, 50).map(event => event.slice(0, 80))
    : undefined;
  const scroll = data?.scroll && typeof data.scroll === 'object'
    ? { x: finiteNumber(data.scroll.x), y: finiteNumber(data.scroll.y) }
    : undefined;
  return {
    success: data?.success === null ? null : data?.success === true,
    status: data?.success === null ? 'unknown' : actResultStatus(data?.status),
    action: PAGE_ACT_ACTIONS.includes(data?.action) ? data.action : undefined,
    trusted: typeof data?.trusted === 'boolean' ? data.trusted : undefined,
    tabId: Number.isInteger(data?.tabId) && data.tabId > 0 ? data.tabId : undefined,
    target: actTargetFields(data?.target),
    events,
    scroll: scroll && Object.values(scroll).some(value => value !== undefined) ? scroll : undefined,
    verified: typeof data?.verified === 'boolean' ? data.verified : undefined,
    sensitive: typeof data?.sensitive === 'boolean' ? data.sensitive : undefined,
    actualLength: Number.isInteger(data?.actualLength) && data.actualLength >= 0 ? data.actualLength : undefined,
    actualValue: data?.success === true && data?.verified === true && data?.sensitive === false ? boundedString(data.actualValue, 20000) : undefined,
    error: boundedString(data?.error, 2000),
    recovery: actRecoveryFields(data?.recovery),
    ...actObservationFields(data)
  };
}

function actObservationFields(data) {
  if (data?.protected === true || typeof data?.observed !== 'boolean') return {};
  const shot = screenshotResultFields({ ...data, success: data.observed });
  const observed = data.observed === true && !!shot.imageData;
  return {
    observed,
    ...(observed ? { imageData: shot.imageData, mimeType: shot.mimeType, width: shot.width, height: shot.height, bytes: shot.bytes } : { observationError: 'Viewport observation unavailable; the action was not replayed' })
  };
}

/** Redact submitted text from diagnostics while preserving an ordinary field read-back. */
function sanitizeActResult(result, submittedValue, request) {
  const safe = redactSubmittedValue(result, submittedValue);
  safe.action = request.action;
  safe.trusted = request.trusted === true;
  if (result?.protected === true) return safe;
  // Opaque image bytes are not diagnostic text; redacting typed substrings would corrupt them.
  Object.assign(safe, actObservationFields(result));
  if (result?.success === true && result?.verified === true && result?.sensitive === false && typeof result.actualValue === 'string') {
    safe.actualValue = result.actualValue;
  } else {
    delete safe.actualValue;
  }
  return safe;
}

/** Allowlist bounded browser-read-page output. Document protection is enforced in the extension. */
function readPageResultFields(data) {
  return {
    success: data?.success === true,
    tabId: Number.isInteger(data?.tabId) && data.tabId > 0 ? data.tabId : undefined,
    text: boundedString(data?.text, 20000),
    nodeCount: Number.isInteger(data?.nodeCount) && data.nodeCount >= 0 ? data.nodeCount : undefined,
    refCount: Number.isInteger(data?.refCount) && data.refCount >= 0 ? data.refCount : undefined,
    truncated: data?.truncated === true,
    title: boundedString(data?.title, 500),
    url: boundedString(data?.url, 4000),
    error: boundedString(data?.error, 2000)
  };
}

function emulateMediaResultFields(data) {
  return {
    success: data.success,
    media: data.media,
    features: data.features,
    colorScheme: data.colorScheme,
    reducedMotion: data.reducedMotion,
    forcedColors: data.forcedColors,
    message: data.message,
    error: data.error
  };
}

const GEOLOCATION_PERMISSION_STATES = new Set(['granted', 'prompt', 'denied', 'unknown']);

function emulateGeolocationResultFields(data) {
  return {
    success: data?.success === true,
    latitude: finiteNumber(data?.latitude),
    longitude: finiteNumber(data?.longitude),
    accuracy: finiteNumber(data?.accuracy),
    permissionGranted: typeof data?.permissionGranted === 'boolean' ? data.permissionGranted : undefined,
    permissionState: GEOLOCATION_PERMISSION_STATES.has(data?.permissionState) ? data.permissionState : undefined,
    permissionNote: boundedString(data?.permissionNote, 2000),
    message: boundedString(data?.message, 1000),
    error: boundedString(data?.error, 2000)
  };
}

function sanitizeLoginStateUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/** Allowlist the value-free fields accepted from a login-state result frame. */
function loginStateResultFields(data) {
  const url = sanitizeLoginStateUrl(data.url);
  return {
    success: data.success === true,
    tabId: Number.isInteger(data.tabId) ? data.tabId : undefined,
    tabStatus: typeof data.tabStatus === 'string' ? data.tabStatus : 'unknown',
    probed: data.probed === true,
    url,
    host: hostnameOfUrl(url),
    authUrl: data.authUrl === true,
    hasPasswordField: data.hasPasswordField === true,
    hasLoginForm: data.hasLoginForm === true,
    protected: data.protected === true,
    error: typeof data.error === 'string' ? data.error : undefined
  };
}

/** Allowlist the extension dashboard location returned to a human handoff. */
function openLoginsPageResultFields(data) {
  let url = '';
  try {
    const parsed = new URL(data.url);
    if (parsed.protocol === 'chrome-extension:' &&
        parsed.pathname.endsWith('/dashboard/index.html') &&
        parsed.hash.startsWith('#/logins?host=')) {
      url = parsed.href;
    }
  } catch {
    // Keep the invalid URL out of the response.
  }
  return {
    success: data.success === true,
    url,
    tabId: Number.isInteger(data.tabId) ? data.tabId : undefined,
    error: typeof data.error === 'string' ? data.error : undefined
  };
}

// GET /api/browser/console-logs - Get console logs
router.get('/console-logs', async (req, res) => {
  log.debug('GET /console-logs', req.query);

  const levelDefaulted = !req.query.level;
  const level = req.query.level || 'warn,error';
  const options = {
    level,
    limit: req.query.limit ? parseInt(req.query.limit) : 100,
    since: req.query.since ? parseInt(req.query.since) : undefined,
    tabId: req.query.tabId ? parseInt(req.query.tabId) : undefined,
    urlPattern: req.query.urlPattern,
    excludePattern: req.query.excludePattern,
    clear: req.query.clear === 'true'
  };

  const agent = requestAgent(req) || '__default__';
  const emptyResult = { logs: [], total: 0, duplicatesCollapsed: 0, cleared: 0, levelDefaulted, level };
  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({
      ...emptyResult,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  if (options.tabId !== undefined) {
    const result = getConsoleLogs({ ...options, agent });
    return res.json({ ...result, levelDefaulted, level, scope: 'tab' });
  }

  let status;
  try {
    status = await makeBrowserRequest(broadcast, 'browser-get-claude-group-status', {});
  } catch (error) {
    return res.json({
      ...emptyResult,
      scope: 'group',
      error: `Could not reach the extension to resolve this connection's tab group, so no logs were read: ${error.message}`
    });
  }

  if (!status || status.success === false) {
    return res.json({
      ...emptyResult,
      scope: 'group',
      error: `Could not resolve this connection's tab group, so no logs were read: ${(status && status.error) || 'the extension returned no group status'}`
    });
  }

  if (!status.exists || !Number.isInteger(status.groupId) || status.tabCount === 0) {
    return res.json({
      ...emptyResult,
      scope: 'group',
      groupId: status.groupId ?? null,
      note: 'This connection has no tabs yet, so it has no console logs. Open a tab with tabz_open_url first, or pass a tabId from your own group.'
    });
  }

  const result = getConsoleLogs({ ...options, agent, groupId: status.groupId });
  res.json({ ...result, levelDefaulted, level, scope: 'group', groupId: status.groupId });
});

// POST /api/browser/execute-script - Execute script in browser
router.post('/execute-script', async (req, res) => {
  const { code, tabId, allFrames } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  log.debug('POST /execute-script', { codeLength: code.length, tabId, allFrames });

  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const relayTimeoutMs = 30000;
    const result = await makeBrowserRequest(
      broadcast,
      'browser-execute-script',
      { code, tabId, allFrames, requestTimeoutMs: requestTimeoutMs(relayTimeoutMs) },
      relayTimeoutMs,
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

  const broadcast = browserChannel(req);
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

// POST /api/browser/login-state - Value-free manual login prompt probe
router.post('/login-state', async (req, res) => {
  const { tabId, beginHandoff, completeHandoff, requestTimeoutMs: requestedTimeoutMs } = req.body || {};
  if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) {
    return res.status(400).json({ success: false, error: 'tabId must be a positive integer' });
  }
  if (beginHandoff !== undefined && typeof beginHandoff !== 'boolean') {
    return res.status(400).json({ success: false, error: 'beginHandoff must be a boolean' });
  }
  if (completeHandoff !== undefined && typeof completeHandoff !== 'boolean') {
    return res.status(400).json({ success: false, error: 'completeHandoff must be a boolean' });
  }
  if (beginHandoff === true && completeHandoff === true) {
    return res.status(400).json({ success: false, error: 'beginHandoff and completeHandoff are mutually exclusive' });
  }
  const lifecycleRequest = beginHandoff === true || completeHandoff === true;
  if (lifecycleRequest && (!Number.isFinite(requestedTimeoutMs) || requestedTimeoutMs <= 0)) {
    return res.status(400).json({ success: false, error: 'requestTimeoutMs must be a positive remaining duration for login handoff changes' });
  }
  const lifecycleTimeoutMs = lifecycleRequest
    ? Math.min(Math.floor(requestedTimeoutMs), requestTimeoutMs(10000))
    : undefined;
  const send = browserChannel(req);
  if (!send) return res.status(503).json({ success: false, error: 'Browser extension is not connected' });
  try {
    const result = await makeBrowserRequest(
      send,
      'browser-login-state',
      {
        tabId,
        ...(beginHandoff === true ? { beginHandoff: true } : {}),
        ...(completeHandoff === true ? { completeHandoff: true } : {}),
        ...(lifecycleTimeoutMs !== undefined ? { requestTimeoutMs: lifecycleTimeoutMs } : {})
      },
      10000,
      'Login state check timed out'
    );
    res.json(result);
  } catch (error) {
    log.error('login-state error:', error);
    res.status(503).json({ success: false, error: error.message });
  }
});

// POST /api/browser/open-logins-page - Open the human-owned extension dashboard
router.post('/open-logins-page', async (req, res) => {
  const { host, reason } = req.body || {};
  let normalizedHost;
  try {
    normalizedHost = credentialStore.normalizeHost(host);
    if (!credentialStore.isValidHostname(normalizedHost)) throw new Error('A valid host is required');
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  const send = browserChannel(req);
  if (!send) return res.status(503).json({ success: false, error: 'Browser extension is not connected' });
  try {
    const result = await makeBrowserRequest(
      send,
      'browser-open-logins-page',
      { host: normalizedHost, reason: typeof reason === 'string' ? reason.slice(0, 200) : '' },
      10000,
      'The extension did not open the Logins page in time'
    );
    res.json(result);
  } catch (error) {
    log.error('open-logins-page error:', error);
    res.status(503).json({ success: false, error: error.message });
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

// POST /api/browser/close-tab - Close tabs by id, or every tab in a group
router.post('/close-tab', async (req, res) => {
  const { tabIds, groupId, force } = req.body;
  log.debug('POST /close-tab', { tabIds, groupId, force });

  if (requestAgent(req) && force === true) {
    return res.status(400).json({
      success: false,
      error: 'Agent-scoped callers cannot force-close tabs outside their group'
    });
  }

  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-close-tab', { tabIds, groupId, force: force === true });
    res.json(result);
  } catch (error) {
    log.error('close-tab error:', error);
    res.json({ success: false, error: error.message });
  }
});

// POST /api/browser/open-url - Open a URL in a new or existing tab
router.post('/open-url', async (req, res) => {
  const { url, newTab, background, reuseExisting, tabId, groupId, addToClaudeGroup, claudeGroupTitle } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }

  log.debug('POST /open-url', { url, newTab, background, reuseExisting, tabId, groupId, addToClaudeGroup });

  const broadcast = browserChannel(req);
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
        reuseExisting: reuseExisting !== false,
        tabId,
        groupId,
        addToClaudeGroup: addToClaudeGroup === true,
        claudeGroupTitle
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const relayTimeoutMs = 15000;
    const result = await makeBrowserRequest(
      broadcast,
      'browser-click-element',
      { selector, tabId, waitTimeout: waitTimeout || 5000, requestTimeoutMs: requestTimeoutMs(relayTimeoutMs) },
      relayTimeoutMs,
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
  if (typeof value !== 'string' && typeof value !== 'boolean') {
    return res.status(400).json({ success: false, error: 'value must be a string or boolean' });
  }

  log.debug('POST /fill-input', {
    selector,
    valueType: typeof value,
    ...(typeof value === 'string' ? { valueLength: value.length } : {}),
    tabId
  });

  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({
      success: false,
      error: 'WebSocket broadcast not available - backend not fully initialized'
    });
  }

  try {
    const relayTimeoutMs = 15000;
    const result = await makeBrowserRequest(
      broadcast,
      'browser-fill-input',
      { selector, value, tabId, waitTimeout: waitTimeout || 5000, requestTimeoutMs: requestTimeoutMs(relayTimeoutMs) },
      relayTimeoutMs,
      'Fill operation timed out - element may not exist'
    );
    res.json(sanitizeFillResult(result, value));
  } catch (error) {
    const safeError = redactSubmittedValue(error?.message || String(error), value);
    log.error('fill-input error:', safeError);
    res.json({ success: false, error: safeError });
  }
});

// POST /api/browser/get-element-info - Get detailed information about an element
// ============================================
// CREDENTIAL STORE ROUTES
// ============================================

const LOGIN_PROMPT_SCRIPT = nodePath.join(__dirname, '../scripts/login-prompt.js');
const SECRET_SURFACES = new Set(['page', 'terminal', 'editor']);
const LOGINS_PAGE_ROUTE = '#/logins';
const FILL_RELAY_TIMEOUT_MS = 15000;
const DEFAULT_FILL_WAIT_MS = 5000;
const MIN_FILL_WAIT_MS = 100;
const MAX_FILL_WAIT_MS = 10000;
// Covers the await gap before a spawned/reconnected terminal reaches the
// registry. Store mutations see this as a live protected editor.
const pendingSecretEditors = new Set();

/** Metadata routes are private to the configured Tabz extension page. */
function refuseUnlessExtension(req, res) {
  if (wsIdentity.isTrustedExtensionOrigin(req.headers.origin)) return false;
  res.status(403).json({
    success: false,
    error: 'This route is for the configured Tabz extension Logins page only'
  });
  return true;
}

function extensionConnected(req) {
  const probe = req.app.get('extensionConnected');
  try {
    return typeof probe === 'function' && probe() === true;
  } catch {
    return false;
  }
}

function resolveSpawner(req) {
  const spawner = req.app.get('unifiedSpawn');
  if (!spawner || typeof spawner.spawn !== 'function') {
    throw new Error('Protected terminal spawner is unavailable');
  }
  return spawner;
}

function resolveRegistry(req) {
  const registry = req.app.get('terminalRegistry') || terminalRegistryModule;
  if (!registry) throw new Error('Protected terminal registry is unavailable');
  return registry;
}

function secretEditorLive(registry) {
  if (pendingSecretEditors.size > 0) return true;
  if (typeof registry.hasLiveSecretEditor !== 'function') {
    throw new Error('Protected terminal registry cannot verify editor state');
  }
  return registry.hasLiveSecretEditor() === true;
}

function clientSecretTerminal(terminal) {
  return {
    id: terminal.id,
    name: terminal.name,
    terminalType: terminal.terminalType,
    state: terminal.state,
    secret: true
  };
}

function announceSecretTerminal(req, terminal) {
  const send = req.app.get('sendToAllExtensions') || req.app.get('sendToExtension');
  if (!send) return 0;
  return send({ type: 'terminal-spawned', data: clientSecretTerminal(terminal) });
}

function storeErrorStatus(error) {
  if (!(error instanceof credentialStore.CredentialStoreError)) return 500;
  return ['BAD_HOST', 'BAD_FIELD', 'UNKNOWN_FIELD', 'BAD_USER', 'BAD_VALUE', 'HOST_MISMATCH']
    .includes(error.code) ? 400 : 409;
}

function routeError(res, error, fallback, response = { success: false }, status = storeErrorStatus(error)) {
  const known = error instanceof credentialStore.CredentialStoreError;
  log.error(fallback, { name: error?.name, code: error?.code });
  return res.status(status).json({
    ...response,
    error: known ? error.message : fallback
  });
}

function statusBody(state, extra = {}) {
  return {
    success: true,
    status: state.status || (state.ready ? 'ready' : 'pending'),
    host: state.host,
    hasUsername: state.hasUsername === true,
    patterns: Array.isArray(state.patterns) ? state.patterns : [],
    fields: Array.isArray(state.fields) ? state.fields : [],
    secretFiles: Array.isArray(state.secretFiles) ? state.secretFiles : [],
    ...(Array.isArray(state.nearMiss) && state.nearMiss.length > 0 ? { nearMiss: state.nearMiss } : {}),
    ...(state.fix ? { fix: state.fix, keyMode: state.keyMode } : {}),
    ...extra
  };
}

function hostnameOfUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function makeAgentBrowserRequest(req, send, type, payload, timeout, timeoutMessage, options) {
  const agent = requestAgent(req);
  return makeBrowserRequest(
    send,
    type,
    agent ? { ...payload, agent } : payload,
    timeout,
    timeoutMessage,
    options
  );
}

function secretTerminalCommand(surface, entry, store) {
  if (surface === 'terminal') {
    return `node ${credentialStore.shellQuote(LOGIN_PROMPT_SCRIPT)} --host ${credentialStore.shellQuote(entry.host)} --store ${credentialStore.shellQuote(store.storeDir)}`;
  }
  const files = [entry.keyPath, store.configPath]
    .filter(value => typeof value === 'string' && value.length > 0);
  return `"\${EDITOR:-nano}" ${files.map(credentialStore.shellQuote).join(' ')}`;
}

async function spawnSecretTerminal(req, entry, store, surface) {
  const registry = resolveRegistry(req);
  if (typeof registry.findSecretTerminalByKeyPath !== 'function') {
    throw new Error('Protected terminal registry cannot find existing editors');
  }
  if (!entry.keyPath) throw new Error('Protected login entry has no key file');
  if (pendingSecretEditors.has(entry.keyPath)) {
    throw new Error('A protected login terminal is already opening');
  }

  pendingSecretEditors.add(entry.keyPath);
  try {
    const existing = registry.findSecretTerminalByKeyPath(entry.keyPath);
    if (existing) {
      if (existing.state === 'disconnected') {
        if (typeof registry.reconnectToTerminal !== 'function' || typeof registry.closeTerminal !== 'function') {
          throw new Error('Protected terminal registry cannot safely reconnect editors');
        }
        const reconnected = await registry.reconnectToTerminal(existing.id);
        if (reconnected) {
          announceSecretTerminal(req, reconnected);
          return { terminal: reconnected, reused: true, reattached: true };
        }
        await registry.closeTerminal(existing.id, true);
      } else {
        return { terminal: existing, reused: true, reattached: false };
      }
    }

    const result = await resolveSpawner(req).spawn({
      name: `Secret: ${entry.host}`.slice(0, 50),
      terminalType: 'bash',
      command: secretTerminalCommand(surface, entry, store),
      workingDir: store.storeDir,
      isChrome: true,
      useTmux: true,
      [terminalRegistryModule.SECRET_SPAWN]: true,
      secret: true,
      secretKeyPath: entry.keyPath
    });
    if (!result?.success || !result.terminal) {
      throw new Error('Could not open the protected login terminal');
    }
    announceSecretTerminal(req, result.terminal);
    return { terminal: result.terminal, reused: false, reattached: false };
  } finally {
    pendingSecretEditors.delete(entry.keyPath);
  }
}

function parseFillWait(value) {
  if (value === undefined || value === null) return { waitTimeout: DEFAULT_FILL_WAIT_MS };
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return { error: `waitTimeout must be a positive integer of milliseconds (max ${MAX_FILL_WAIT_MS})` };
  }
  return { waitTimeout: Math.min(Math.max(value, MIN_FILL_WAIT_MS), MAX_FILL_WAIT_MS) };
}

const READ_PAGE_BODY_FIELDS = new Set(['tabId', 'maxChars', 'agent']);
const ACT_BODY_FIELDS = new Set([
  'action', 'ref', 'selector', 'text', 'x', 'y', 'value', 'key', 'repeat',
  'modifiers', 'direction', 'ticks', 'toX', 'toY', 'toSelector', 'trusted',
  'tabId', 'waitTimeout', 'agent', 'observe'
]);
const TARGETED_ACT_ACTIONS = new Set(['click', 'right_click', 'double_click', 'triple_click', 'hover']);

function requestObject(req) {
  if (req.body === undefined) return {};
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
}

function unknownBodyField(body, allowed) {
  return Object.keys(body).find(key => !allowed.has(key));
}

function optionalBoundedString(body, key, maxLength, allowEmpty = false) {
  if (body[key] === undefined) return null;
  if (typeof body[key] !== 'string' || (!allowEmpty && body[key].length === 0) || body[key].length > maxLength) {
    return `${key} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${maxLength} characters`;
  }
  return null;
}

function validateActBody(body) {
  const unknown = unknownBodyField(body, ACT_BODY_FIELDS);
  if (unknown) return `unknown field: ${unknown}`;
  if (!PAGE_ACT_ACTIONS.includes(body.action)) {
    return `action must be one of: ${PAGE_ACT_ACTIONS.join(', ')}`;
  }
  if (body.tabId !== undefined && (!Number.isInteger(body.tabId) || body.tabId <= 0)) {
    return 'tabId must be a positive integer';
  }
  for (const [key, maxLength, allowEmpty] of [
    ['ref', 200, false], ['selector', 2000, false], ['text', 1000, false],
    ['value', 4000, true], ['key', 500, true], ['modifiers', 200, true],
    ['toSelector', 2000, false], ['agent', 200, false]
  ]) {
    const error = optionalBoundedString(body, key, maxLength, allowEmpty);
    if (error) return error;
  }
  for (const key of ['x', 'y', 'toX', 'toY']) {
    if (body[key] !== undefined && finiteNumber(body[key]) === undefined) return `${key} must be a finite number`;
  }
  if ((body.x === undefined) !== (body.y === undefined)) return 'x and y go together';
  if ((body.toX === undefined) !== (body.toY === undefined)) return 'toX and toY go together';
  const targetModes = Number(body.ref !== undefined) + Number(body.selector !== undefined) +
    Number(body.text !== undefined) + Number(body.x !== undefined && body.y !== undefined);
  if (targetModes > 1) return 'choose one target: ref, selector, text, or x and y';
  if (body.toSelector !== undefined && body.toX !== undefined) {
    return 'choose one drag end: toSelector or toX and toY';
  }
  if (body.repeat !== undefined && (!Number.isInteger(body.repeat) || body.repeat < 1 || body.repeat > 100)) {
    return 'repeat must be an integer from 1 to 100';
  }
  if (body.ticks !== undefined && (!Number.isInteger(body.ticks) || body.ticks < 1 || body.ticks > 10)) {
    return 'ticks must be an integer from 1 to 10';
  }
  if (body.direction !== undefined && !['up', 'down', 'left', 'right'].includes(body.direction)) {
    return 'direction must be up, down, left, or right';
  }
  if (body.trusted !== undefined && typeof body.trusted !== 'boolean') return 'trusted must be a boolean';
  if (body.observe !== undefined && typeof body.observe !== 'boolean') return 'observe must be a boolean';

  const hasTarget = targetModes === 1;
  if (TARGETED_ACT_ACTIONS.has(body.action) && !hasTarget) {
    return `${body.action} needs a target: ref, selector, text, or x and y`;
  }
  if (body.action === 'type' && body.value === undefined) return 'type needs value';
  if (body.action === 'key' && (body.key === undefined || body.key.trim() === '')) {
    return 'key needs key (space-separated key names)';
  }
  if (body.action === 'drag') {
    if (!hasTarget) return 'drag needs a start target: ref, selector, text, or x and y';
    if (body.toSelector === undefined && body.toX === undefined) return 'drag needs an end: toX and toY, or toSelector';
  }
  return null;
}

// POST /api/browser/read-page - Compact visible interactive-element outline.
router.post('/read-page', async (req, res) => {
  const body = requestObject(req);
  if (!body) return res.status(400).json({ success: false, error: 'request body must be a JSON object' });
  const unknown = unknownBodyField(body, READ_PAGE_BODY_FIELDS);
  if (unknown) return res.status(400).json({ success: false, error: `unknown field: ${unknown}` });
  if (body.tabId !== undefined && (!Number.isInteger(body.tabId) || body.tabId <= 0)) {
    return res.status(400).json({ success: false, error: 'tabId must be a positive integer' });
  }
  if (body.agent !== undefined && (typeof body.agent !== 'string' || !body.agent.trim() || body.agent.length > 200)) {
    return res.status(400).json({ success: false, error: 'agent must be a non-empty string of at most 200 characters' });
  }
  const maxChars = body.maxChars ?? 6000;
  if (!Number.isInteger(maxChars) || maxChars < 500 || maxChars > 20000) {
    return res.status(400).json({ success: false, error: 'maxChars must be an integer from 500 to 20000' });
  }

  log.debug('POST /read-page', { tabId: body.tabId, maxChars });
  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({ success: false, error: 'WebSocket broadcast not available - backend not fully initialized' });
  }

  const relayTimeoutMs = 15000;
  try {
    const relayed = await makeAgentBrowserRequest(
      req,
      broadcast,
      'browser-read-page',
      { tabId: body.tabId, maxChars, requestTimeoutMs: requestTimeoutMs(relayTimeoutMs) },
      relayTimeoutMs,
      'Page read timed out - the page may be busy',
      { withSender: true }
    );
    if (!relayed?.sender) {
      return res.status(503).json({ success: false, error: 'The answering extension connection is unavailable' });
    }
    const result = readPageResultFields(relayed.data);
    if (result.success && (!result.tabId || (body.tabId !== undefined && result.tabId !== body.tabId))) {
      return res.status(409).json({ success: false, error: 'The extension did not confirm the requested tab safely' });
    }
    return res.json(result);
  } catch (error) {
    const unavailable = error?.message === 'Browser extension is not connected';
    log.error('read-page relay failed', { unavailable, timedOut: !unavailable });
    return res.status(unavailable ? 503 : 504).json({
      success: false,
      error: unavailable ? 'The configured Tabz extension is not connected' : 'Page read timed out - the page may be busy'
    });
  }
});

// POST /api/browser/act - One compact page action. It never reads the credential store.
router.post('/act', async (req, res) => {
  const body = requestObject(req);
  if (!body) return res.status(400).json({ success: false, error: 'request body must be a JSON object' });
  const validationError = validateActBody(body);
  if (validationError) return res.status(400).json({ success: false, error: validationError });
  const wait = parseFillWait(body.waitTimeout);
  if (wait.error) return res.status(400).json({ success: false, error: wait.error });

  const trusted = body.trusted === true;
  log.debug('POST /act', {
    action: body.action,
    tabId: body.tabId,
    trusted,
    hasRef: body.ref !== undefined,
    hasSelector: body.selector !== undefined,
    hasText: body.text !== undefined,
    hasCoordinates: body.x !== undefined,
    waitTimeout: wait.waitTimeout
  });
  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({ success: false, error: 'WebSocket broadcast not available - backend not fully initialized' });
  }

  const relayTimeoutMs = trusted ? 25000 : 15000;
  const payload = {
    action: body.action,
    ref: body.ref,
    selector: body.selector,
    text: body.text,
    x: body.x,
    y: body.y,
    value: body.value,
    key: body.key,
    repeat: body.repeat,
    modifiers: body.modifiers,
    direction: body.direction,
    ticks: body.ticks,
    toX: body.toX,
    toY: body.toY,
    toSelector: body.toSelector,
    trusted,
    observe: body.observe,
    tabId: body.tabId,
    waitTimeout: wait.waitTimeout,
    requestTimeoutMs: requestTimeoutMs(relayTimeoutMs)
  };
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  try {
    const relayed = await makeAgentBrowserRequest(
      req,
      broadcast,
      'browser-act',
      payload,
      relayTimeoutMs,
      'Action outcome is unknown because the browser relay timed out',
      { withSender: true }
    );
    if (!relayed?.sender) {
      return res.json({
        success: null,
        status: 'unknown',
        action: body.action,
        trusted,
        uncertain: true,
        error: 'Action outcome is unknown because the answering extension connection was not identified; do not automatically retry'
      });
    }
    if (relayed.data?.action !== body.action || relayed.data?.trusted !== trusted) {
      return res.json({
        success: null,
        status: 'unknown',
        action: body.action,
        trusted,
        uncertain: true,
        error: 'Action outcome is unknown because the extension response did not match the request; do not automatically retry'
      });
    }
    const result = sanitizeActResult(relayed.data, body.value, { action: body.action, trusted });
    if ((result.success === true || result.success === null) &&
        (!result.tabId || (body.tabId !== undefined && result.tabId !== body.tabId))) {
      return res.json({
        success: null,
        status: 'unknown',
        action: body.action,
        trusted,
        uncertain: true,
        error: 'Action outcome is unknown because the extension did not confirm the requested tab; do not automatically retry'
      });
    }
    return res.json(result);
  } catch (error) {
    if (error?.message === 'Browser extension is not connected') {
      return res.status(503).json({ success: false, error: 'The configured Tabz extension is not connected' });
    }
    log.error('act relay outcome unknown', { action: body.action, trusted });
    return res.json({
      success: null,
      status: 'unknown',
      action: body.action,
      trusted,
      transportError: true,
      uncertain: true,
      error: 'Action outcome is unknown because the browser relay failed; do not automatically retry'
    });
  }
});

router.get('/secrets', (req, res) => {
  // Keep this check before getDefaultStore: an untrusted request must cause no
  // credential-store construction or filesystem access.
  if (refuseUnlessExtension(req, res)) return;
  try {
    const store = credentialStore.getDefaultStore();
    res.json({ success: true, storeDir: store.storeDir, entries: store.listEntries() });
  } catch (error) {
    routeError(res, error, 'Saved login metadata is unavailable');
  }
});

router.post('/secrets', (req, res) => {
  if (refuseUnlessExtension(req, res)) return;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const host = typeof body.host === 'string' ? credentialStore.normalizeHost(body.host) : '';
  if (!host || host.length > 253 || /[\s/]/.test(host)) {
    return res.status(400).json({ success: false, error: 'host must be a hostname such as app.example.com' });
  }
  log.debug('POST /secrets', { host });
  try {
    if (secretEditorLive(resolveRegistry(req))) {
      return res.status(409).json({
        success: false,
        error: 'A protected login terminal is open; finish or close it, then save again'
      });
    }
    const result = credentialStore.getDefaultStore().saveEntry({
      host: body.host,
      user: body.user,
      password: body.password,
      fields: body.fields,
      secretFiles: body.secretFiles
    });
    res.json(statusBody(result, { created: result.created === true }));
  } catch (error) {
    routeError(res, error, 'Saved login could not be saved');
  }
});

router.delete('/secrets/:host', (req, res) => {
  if (refuseUnlessExtension(req, res)) return;
  const pattern = typeof req.params.host === 'string' ? req.params.host : '';
  if (!pattern || pattern.length > 253 || /[\s/]/.test(pattern)) {
    return res.status(400).json({ success: false, error: 'host must be a Host pattern spelled as in the config' });
  }
  log.debug('DELETE /secrets', { pattern });
  try {
    if (secretEditorLive(resolveRegistry(req))) {
      return res.status(409).json({
        success: false,
        error: 'A protected login terminal is open; finish or close it, then try again'
      });
    }
    res.json({ success: true, ...credentialStore.getDefaultStore().deleteEntry(pattern) });
  } catch (error) {
    routeError(
      res,
      error,
      'Saved login could not be deleted',
      { success: false },
      error instanceof credentialStore.CredentialStoreError && error.code === 'NO_MATCH'
        ? 404
        : storeErrorStatus(error)
    );
  }
});

router.post('/secret-request', async (req, res) => {
  const { host, reason, surface: requestedSurface } = req.body || {};
  if (!credentialStore.isValidHostname(host)) {
    return res.status(400).json({ success: false, error: 'host must be a hostname such as app.example.com' });
  }
  if (requestedSurface !== undefined && !SECRET_SURFACES.has(requestedSurface)) {
    return res.status(400).json({ success: false, error: 'surface must be page, terminal, or editor' });
  }
  log.debug('POST /secret-request', {
    host: credentialStore.normalizeHost(host),
    hasReason: typeof reason === 'string' && reason.length > 0,
    surface: requestedSurface || 'page'
  });

  try {
    const store = credentialStore.getDefaultStore();
    const registry = resolveRegistry(req);
    const connected = extensionConnected(req);
    const wantedSurface = requestedSurface || 'page';
    const surface = wantedSurface === 'page' && !connected ? 'terminal' : wantedSurface;
    const editorLive = secretEditorLive(registry);
    const entry = surface === 'page'
      ? { created: false, ...store.isReady(host), keyPath: '' }
      : store.ensureEntry(host, { deferConfigEdit: editorLive });

    if (entry.configEditDeferred) {
      return res.json(statusBody(entry, {
        created: false,
        configEditDeferred: true,
        message: 'A protected login terminal is open; finish and close it, then call again.'
      }));
    }

    const state = store.isReady(entry.host);
    if (state.ready || state.status === 'bad_mode') {
      return res.json(statusBody(state, { created: state.ready ? false : entry.created === true }));
    }

    if (pendingSecretEditors.size > 0) {
      return res.json(statusBody(state, {
        created: false,
        surface,
        configEditDeferred: true,
        message: 'A protected login terminal is opening; wait for it to appear, then finish or close it.'
      }));
    }

    if (surface === 'page') {
      if (editorLive) {
        return res.json(statusBody(state, {
          created: false,
          surface,
          configEditDeferred: true,
          message: 'A protected login terminal is open; finish and close it, then call again.'
        }));
      }
      const sendToExtension = req.app.get('sendToExtension');
      if (!sendToExtension) {
        return res.status(503).json({ success: false, error: 'The configured Tabz extension is not connected' });
      }
      const opened = await makeAgentBrowserRequest(
        req,
        sendToExtension,
        'browser-open-logins-page',
        { host: entry.host, reason: typeof reason === 'string' ? reason.slice(0, 200) : '' },
        10000,
        'The extension did not open the Logins page in time'
      );
      if (!opened?.success) {
        return res.status(503).json({ success: false, error: 'Could not open the Logins page' });
      }
      return res.json(statusBody(state, {
        created: false,
        surface,
        loginsUrl: typeof opened.url === 'string' ? opened.url : '',
        loginsRoute: `${LOGINS_PAGE_ROUTE}?host=${encodeURIComponent(entry.host)}`
      }));
    }

    const result = await spawnSecretTerminal(req, entry, store, surface);
    res.json(statusBody(state, {
      created: entry.created === true,
      surface,
      terminalId: result.terminal.id,
      editorReused: result.reused,
      ...(result.reattached ? { editorReattached: true } : {})
    }));
  } catch (error) {
    routeError(res, error, 'Saved login request failed');
  }
});

router.post('/secret-status', (req, res) => {
  const { host } = req.body || {};
  if (!credentialStore.isValidHostname(host)) {
    return res.status(400).json({ success: false, error: 'host must be a hostname such as app.example.com' });
  }
  try {
    const store = credentialStore.getDefaultStore();
    let state = store.isReady(host);
    if (state.keyStatus === 'no_key' && !secretEditorLive(resolveRegistry(req))) {
      store.ensureEntry(state.host);
      state = store.isReady(host);
    }
    res.json(statusBody(state));
  } catch (error) {
    routeError(res, error, 'Saved login status is unavailable');
  }
});

router.post('/fill-secret', async (req, res) => {
  const { selector, field, host, tabId, trusted } = req.body || {};
  if (typeof selector !== 'string' || !selector) {
    return res.status(400).json({ filled: false, error: 'selector is required' });
  }
  if (!credentialStore.isValidFieldName(field)) {
    return res.status(400).json({
      filled: false,
      error: 'field must be username, password, or a saved Field or SecretFile name'
    });
  }
  if (host !== undefined && !credentialStore.isValidHostname(host)) {
    return res.status(400).json({ filled: false, error: 'host must be a hostname' });
  }
  if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) {
    return res.status(400).json({ filled: false, error: 'tabId must be a positive integer' });
  }
  const wait = parseFillWait(req.body?.waitTimeout);
  if (wait.error) return res.status(400).json({ filled: false, error: wait.error });

  log.debug('POST /fill-secret', {
    field,
    hasSelector: true,
    tabId,
    waitTimeout: wait.waitTimeout,
    trusted: trusted === true
  });
  const sendToExtension = req.app.get('sendToExtension');
  const sendToClient = req.app.get('sendToClient');
  if (!sendToExtension || !sendToClient) {
    return res.status(500).json({ filled: false, error: 'Extension channel is unavailable' });
  }

  try {
    // Resolve the tab and its answering socket before constructing the store
    // or reading any credential. A preferred host can only narrow the store
    // match after the actual tab hostname is known.
    const probe = await makeAgentBrowserRequest(
      req,
      sendToExtension,
      'browser-get-page-info',
      { tabId },
      10000,
      'Page info timed out',
      { withSender: true }
    );
    const page = probe?.data || {};
    if (page.error || !page.url) {
      return res.status(409).json({ filled: false, error: 'Could not read the tab URL' });
    }
    if (!probe.sender) {
      return res.status(503).json({ filled: false, error: 'The answering extension connection is unavailable' });
    }
    if (page.protectedFillVersion !== 1) {
      return res.status(409).json({
        filled: false,
        error: 'The connected Tabz extension must be reloaded before saved fields can be filled safely'
      });
    }
    if (!Number.isInteger(page.tabId) || page.tabId <= 0 || (tabId !== undefined && page.tabId !== tabId)) {
      return res.status(409).json({ filled: false, error: 'The extension did not confirm the requested tab safely' });
    }
    const tabHost = hostnameOfUrl(page.url);
    if (!tabHost) return res.status(409).json({ filled: false, error: 'The tab URL has no hostname' });
    const targetTabId = page.tabId;
    const resolved = credentialStore.getDefaultStore().fillSecretInto(tabHost, field, { host });

    const result = await makeAgentBrowserRequest(
      req,
      frame => sendToClient(probe.sender, frame) ? 1 : 0,
      'browser-fill-input',
      {
        selector,
        value: resolved.value,
        tabId: targetTabId,
        waitTimeout: wait.waitTimeout,
        requestTimeoutMs: requestTimeoutMs(FILL_RELAY_TIMEOUT_MS),
        expectedHost: tabHost,
        requireInput: true,
        allowSelect: resolved.kind === 'field',
        requirePasswordType: resolved.kind === 'password' || resolved.kind === 'secretfile',
        trusted: trusted === true
      },
      FILL_RELAY_TIMEOUT_MS,
      'Fill operation timed out'
    );

    if (!result?.success || result.verified !== true || result.protected !== true) {
      return res.status(409).json({
        filled: false,
        verified: false,
        host: resolved.host,
        hasUsername: typeof resolved.user === 'string' && resolved.user.length > 0,
        error: 'Saved field fill was refused or could not be verified'
      });
    }
    res.json({
      filled: true,
      verified: true,
      protected: true,
      host: typeof result.host === 'string' && result.host ? result.host : resolved.host,
      hasUsername: typeof resolved.user === 'string' && resolved.user.length > 0,
      field,
      kind: resolved.kind,
      ...(result.selected ? { selected: true } : {}),
      ...(resolved.normalized ? { normalized: true } : {})
    });
  } catch (error) {
    routeError(res, error, 'Saved field fill failed', { filled: false });
  }
});

router.post('/get-element-info', async (req, res) => {
  const { selector, tabId, includeStyles, styleProperties } = req.body;

  if (!selector) {
    return res.status(400).json({ success: false, error: 'selector is required' });
  }

  log.debug('POST /get-element-info', { selector, tabId, includeStyles });

  const broadcast = browserChannel(req);
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

function validateScreenshotBody(body, fullPageRoute = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Expected a screenshot object';
  const allowed = new Set(['agent', 'tabId', 'ref', 'selector', 'outputPath', 'inlineOnly', 'clip', 'fullPage']);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'Unknown screenshot field';
  if (body.tabId !== undefined && (!Number.isInteger(body.tabId) || body.tabId <= 0)) return 'tabId must be a positive integer';
  for (const key of ['ref', 'selector', 'outputPath']) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || !body[key].length || body[key].length > 4096)) return `${key} must be a nonempty bounded string`;
  }
  for (const key of ['inlineOnly', 'fullPage']) if (body[key] !== undefined && typeof body[key] !== 'boolean') return `${key} must be boolean`;
  if (body.inlineOnly && body.outputPath !== undefined) return 'inlineOnly cannot save an outputPath';
  const targets = Number(body.ref !== undefined) + Number(body.selector !== undefined) + Number(body.clip !== undefined);
  if (targets > 1) return 'Choose one screenshot target: ref, selector or clip';
  if ((fullPageRoute || body.fullPage) && targets) return 'Full-page capture cannot also crop a target';
  if (body.clip !== undefined) {
    const clip = body.clip;
    if (!clip || typeof clip !== 'object' || Array.isArray(clip) || Object.keys(clip).some(key => !['x0','y0','x1','y1'].includes(key))) return 'Invalid clip';
    if (['x0','y0','x1','y1'].some(key => !Number.isFinite(clip[key]) || clip[key] < 0 || clip[key] > 100000)) return 'Clip coordinates must be finite nonnegative CSS pixels';
    if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0) return 'Clip must have positive width and height';
  }
  return null;
}

function screenshotResultFields(data) {
  const success = data?.success === true;
  const imageData = typeof data?.imageData === 'string' && data.imageData.length <= 8_000_000 && /^[A-Za-z0-9+/]*={0,2}$/.test(data.imageData) ? data.imageData : undefined;
  const mimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(data?.mimeType) ? data.mimeType : undefined;
  const dimension = value => Number.isInteger(value) && value > 0 && value <= 100000 ? value : undefined;
  return {
    success,
    tabId: Number.isInteger(data?.tabId) && data.tabId > 0 ? data.tabId : undefined,
    filePath: success ? boundedString(data.filePath, 4096) : undefined,
    windowsPath: success ? boundedString(data.windowsPath, 4096) : undefined,
    wslPath: success ? boundedString(data.wslPath, 4096) : undefined,
    ...(success && imageData && mimeType ? { imageData, mimeType } : {}),
    width: success ? dimension(data.width) : undefined,
    height: success ? dimension(data.height) : undefined,
    bytes: success && Number.isInteger(data.bytes) && data.bytes > 0 ? data.bytes : undefined,
    imageReencoded: success && data.imageReencoded === true,
    error: boundedString(data?.error, 2000)
  };
}

for (const [route, fullPageRoute] of [['/screenshot', false], ['/screenshot-full', true]]) {
  router.post(route, async (req, res) => {
    const invalid = validateScreenshotBody(req.body, fullPageRoute);
    if (invalid) return res.status(400).json({ success: false, error: invalid });
    const { tabId, ref, selector, outputPath, inlineOnly, clip } = req.body;
    const fullPage = fullPageRoute || req.body.fullPage === true;
    const timeout = fullPage ? 60000 : 30000;
    const broadcast = browserChannel(req);
    if (!broadcast) return res.status(503).json({ success: false, error: 'Browser extension is not connected' });
    try {
      const result = await makeBrowserRequest(broadcast, 'browser-screenshot', {
        tabId, ref, selector, outputPath, inlineOnly, clip, fullPage, requestTimeoutMs: requestTimeoutMs(timeout)
      }, timeout, 'Screenshot timed out');
      res.json(screenshotResultFields(result));
    } catch (error) {
      res.json({ success: false, error: error.message });
    }
  });
}

// ============================================
// BOOKMARK ROUTES
// ============================================

// GET /api/browser/bookmarks/tree - Get bookmark tree
router.get('/bookmarks/tree', async (req, res) => {
  const folderId = req.query.folderId;
  const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth) : 3;

  log.debug('GET /bookmarks/tree', { folderId, maxDepth });

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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
function validateCaptureBody(body, kind) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Expected a capture object';
  const fields = {
    enable: ['includeSelf'], deep: ['includeSelf', 'maxBodyBytes'], disable: [], clear: [],
    list: ['urlPattern', 'excludePattern', 'method', 'statusMin', 'statusMax', 'resourceType', 'limit', 'offset', 'source'],
    body: ['requestId', 'offset', 'length']
  }[kind];
  const allowed = new Set(['agent', 'tabId', ...fields]);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'Unknown capture field';
  if (body.tabId !== undefined && (!Number.isInteger(body.tabId) || body.tabId <= 0)) return 'tabId must be a positive integer';
  if (body.includeSelf !== undefined && typeof body.includeSelf !== 'boolean') return 'includeSelf must be boolean';
  for (const [key, min, max] of [['maxBodyBytes',1,1000000], ['limit',1,200], ['offset',0,Number.MAX_SAFE_INTEGER], ['length',1,32000], ['statusMin',100,599], ['statusMax',100,599]]) {
    if (body[key] !== undefined && (!Number.isSafeInteger(body[key]) || body[key] < min || body[key] > max)) return `${key} is out of range`;
  }
  if (body.statusMin !== undefined && body.statusMax !== undefined && body.statusMin > body.statusMax) return 'statusMin exceeds statusMax';
  for (const key of ['urlPattern', 'excludePattern', 'requestId']) if (body[key] !== undefined && (typeof body[key] !== 'string' || !body[key].length || body[key].length > 1000)) return `${key} must be a bounded string`;
  if (kind === 'body' && !body.requestId) return 'requestId is required';
  if (body.source !== undefined && !['webrequest','deep','both'].includes(body.source)) return 'Invalid capture source';
  if (body.method !== undefined && !['all','GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'].includes(body.method)) return 'Invalid method';
  if (body.resourceType !== undefined && !['all','XHR','Fetch','Document','Script','Stylesheet','Image','Font','WebSocket','Other'].includes(body.resourceType)) return 'Invalid resourceType';
  return null;
}

for (const [route, type, kind] of [
  ['/network-capture/enable', 'browser-enable-network-capture', 'enable'],
  ['/network-capture/deep/enable', 'browser-enable-deep-capture', 'deep'],
  ['/network-capture/deep/disable', 'browser-disable-deep-capture', 'disable'],
  ['/network-requests', 'browser-get-network-requests', 'list'],
  ['/network-response-body', 'browser-get-response-body', 'body'],
  ['/network-requests/clear', 'browser-clear-network-requests', 'clear']
]) {
  router.post(route, async (req, res) => {
    const invalid = validateCaptureBody(req.body, kind);
    if (invalid) return res.status(400).json({ success: false, error: invalid });
    const broadcast = browserChannel(req);
    if (!broadcast) return res.status(503).json({ success: false, error: 'Browser extension is not connected' });
    const payload = { ...req.body };
    delete payload.agent;
    if (kind === 'body') { payload.networkRequestId = payload.requestId; delete payload.requestId; }
    if (kind === 'deep') payload.maxBodyBytes ??= 64000;
    if (kind === 'enable' || kind === 'deep') payload.includeSelf ??= false;
    if (kind === 'list') { payload.limit ??= 50; payload.offset ??= 0; payload.source ??= 'both'; }
    if (kind === 'body') { payload.offset ??= 0; payload.length ??= 32000; }
    payload.requestTimeoutMs = requestTimeoutMs(15000);
    try {
      res.json(await makeBrowserRequest(broadcast, type, payload, 15000, 'Capture operation timed out'));
    } catch (error) {
      res.json({ success: false, error: error.message, ...(kind === 'list' ? { requests: [], total: 0, hasMore: false, captureActive: false } : {}) });
    }
  });
}

// ============================================
// DEBUGGER ROUTES (DOM Tree, Performance, Coverage)
// ============================================

// POST /api/browser/debugger/dom-tree - Get DOM tree using chrome.debugger
router.post('/debugger/dom-tree', async (req, res) => {
  const { tabId, maxDepth, selector } = req.body;

  log.debug('POST /debugger/dom-tree', { tabId, maxDepth, selector });

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

// POST /api/browser/claude-group/release - Dissolve this agent's group without closing its tabs
router.post('/claude-group/release', async (req, res) => {
  log.debug('POST /claude-group/release');

  const broadcast = browserChannel(req);
  if (!broadcast) {
    return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  }

  try {
    const result = await makeBrowserRequest(broadcast, 'browser-release-claude-group', {});
    res.json(result);
  } catch (error) {
    log.error('release-claude-group error:', error);
    res.json({ success: false, error: error.message });
  }
});

// GET /api/browser/claude-group/status - Get Claude Active group status
router.get('/claude-group/status', async (req, res) => {
  log.debug('GET /claude-group/status');

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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
  const { url, type, state, focused, width, height, left, top, incognito, tabId, addToClaudeGroup, claudeGroupTitle } = req.body;

  log.debug('POST /windows', { url, type, state, width, height });

  const broadcast = browserChannel(req);
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
      { url, windowType: type, state, focused, width, height, left, top, incognito, tabId, addToClaudeGroup, claudeGroupTitle },
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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

  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const { tabId, latitude, longitude, accuracy, clear } = req.body;
  log.debug('POST /emulate/geolocation', { latitude, longitude, clear });
  const broadcast = browserChannel(req);
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-geolocation', { tabId, latitude, longitude, accuracy, clear });
    res.json(result);
  } catch (error) {
    log.error('emulate-geolocation error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/network', async (req, res) => {
  const { tabId, preset, offline, latency, downloadThroughput, uploadThroughput } = req.body;
  log.debug('POST /emulate/network', { preset, offline });
  const broadcast = browserChannel(req);
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
  const { tabId, media, colorScheme, reducedMotion, forcedColors } = req.body;
  log.debug('POST /emulate/media', { media, colorScheme, reducedMotion, forcedColors });
  const broadcast = browserChannel(req);
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(
      broadcast,
      'browser-emulate-media',
      { tabId, media, colorScheme, reducedMotion, forcedColors }
    );
    res.json(result);
  } catch (error) {
    log.error('emulate-media error:', error);
    res.json({ success: false, error: error.message });
  }
});

router.post('/emulate/vision', async (req, res) => {
  const { tabId, type } = req.body;
  log.debug('POST /emulate/vision', { type });
  const broadcast = browserChannel(req);
  if (!broadcast) return res.status(500).json({ success: false, error: 'WebSocket broadcast not available' });
  try {
    const result = await makeBrowserRequest(broadcast, 'browser-emulate-vision', { tabId, visionType: type });
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
  const broadcast = browserChannel(req);
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
module.exports.removeConsoleLogsForTab = removeConsoleLogsForTab;
module.exports.getConsoleLogs = getConsoleLogs;
module.exports.resolvePendingRequest = resolvePendingRequest;
module.exports.pendingRequests = pendingRequests;
module.exports.makeBrowserRequest = makeBrowserRequest;
module.exports.redactSubmittedValue = redactSubmittedValue;
module.exports.sanitizeFillResult = sanitizeFillResult;
module.exports.fillInputResultFields = fillInputResultFields;
module.exports.actResultFields = actResultFields;
module.exports.sanitizeActResult = sanitizeActResult;
module.exports.readPageResultFields = readPageResultFields;
module.exports.validateActBody = validateActBody;
module.exports.scriptResultFields = scriptResultFields;
module.exports.emulateMediaResultFields = emulateMediaResultFields;
module.exports.emulateGeolocationResultFields = emulateGeolocationResultFields;
module.exports.loginStateResultFields = loginStateResultFields;
module.exports.openLoginsPageResultFields = openLoginsPageResultFields;
module.exports.requestTimeoutMs = requestTimeoutMs;

module.exports.screenshotResultFields = screenshotResultFields;
module.exports.validateScreenshotBody = validateScreenshotBody;

module.exports.validateCaptureBody = validateCaptureBody;
