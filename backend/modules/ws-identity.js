/**
 * The shared token proves possession, not which browser surface connected.
 * Extension privileges are therefore anchored on the HTTP upgrade Origin;
 * a later `identify` frame can refine that identity but cannot grant it.
 * This protects against web pages. A process running as the same OS user can
 * set arbitrary headers and is outside this boundary.
 */
const EXTENSION_ORIGIN_PREFIX = 'chrome-extension://';
const EXTENSION_IDS_ENV = 'TABZ_EXTENSION_IDS';
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/([a-p]{32})$/;
const TERMINAL_MESSAGE_TYPES = new Set([
  'spawn',
  'command',
  'resize',
  'reconnect',
  'detach',
  'close',
  'update-embedded',
  'targeted-pane-send',
  'tmux-session-send'
]);
const SECRET_SPAWN_KEYS = ['secret', 'secretKeyPath'];

function parseExtensionIds(value) {
  if (typeof value !== 'string' || value.length === 0) return [];
  return [...new Set(value
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => EXTENSION_ID_PATTERN.test(entry)))];
}

function defaultExtensionIds(env = process.env) {
  return parseExtensionIds(env && env[EXTENSION_IDS_ENV]);
}

function extensionIdFromOrigin(origin) {
  if (typeof origin !== 'string') return '';
  return origin.match(EXTENSION_ORIGIN_PATTERN)?.[1] || '';
}

function isExtensionOrigin(origin) {
  return extensionIdFromOrigin(origin) !== '';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ORIGIN_KINDS = Object.freeze({
  EXTENSION: 'extension',
  EXTENSION_UNKNOWN: 'extension-unknown',
  NONE: 'none',
  SELF: 'self',
  ALLOWLISTED: 'allowlisted',
  LOCALHOST: 'localhost',
  PAGE: 'page'
});

function normalizeWebOrigin(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$/i.test(url.hostname)) return null;
  return url.origin.toLowerCase();
}

function isLoopbackWebOrigin(origin) {
  const normalized = normalizeWebOrigin(origin);
  return normalized ? LOOPBACK_HOSTS.has(new URL(normalized).hostname) : false;
}

function classifyOrigin(origin, policy = {}) {
  if (origin === undefined || origin === null || origin === '') {
    return { kind: ORIGIN_KINDS.NONE, origin: '', extensionId: '' };
  }
  if (typeof origin !== 'string') {
    return { kind: ORIGIN_KINDS.PAGE, origin: String(origin), extensionId: '' };
  }
  if (origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
    const extensionId = extensionIdFromOrigin(origin);
    const allowed = Array.isArray(policy.extensionIds) ? policy.extensionIds : defaultExtensionIds();
    const kind = extensionId && allowed.includes(extensionId)
      ? ORIGIN_KINDS.EXTENSION
      : ORIGIN_KINDS.EXTENSION_UNKNOWN;
    return { kind, origin, extensionId };
  }

  const normalized = normalizeWebOrigin(origin);
  if (!normalized) return { kind: ORIGIN_KINDS.PAGE, origin, extensionId: '' };

  const trusted = Array.isArray(policy.trustedOrigins) ? policy.trustedOrigins : [];
  if (trusted.some(entry => normalizeWebOrigin(entry) === normalized)) {
    return { kind: ORIGIN_KINDS.ALLOWLISTED, origin, extensionId: '' };
  }

  const url = new URL(normalized);
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    const selfPort = policy.selfPort === undefined || policy.selfPort === null ? '' : String(policy.selfPort);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    if (selfPort && url.protocol === 'http:' && port === selfPort) {
      return { kind: ORIGIN_KINDS.SELF, origin, extensionId: '' };
    }
    return { kind: ORIGIN_KINDS.LOCALHOST, origin, extensionId: '' };
  }
  return { kind: ORIGIN_KINDS.PAGE, origin, extensionId: '' };
}

function isTrustedExtensionOrigin(origin, policy = {}) {
  return classifyOrigin(origin, policy).kind === ORIGIN_KINDS.EXTENSION;
}

const PRIVILEGED_ORIGIN_KINDS = new Set([
  ORIGIN_KINDS.EXTENSION,
  ORIGIN_KINDS.NONE,
  ORIGIN_KINDS.SELF,
  ORIGIN_KINDS.ALLOWLISTED
]);
const CORS_ORIGIN_KINDS = new Set([
  ORIGIN_KINDS.EXTENSION,
  ORIGIN_KINDS.SELF,
  ORIGIN_KINDS.ALLOWLISTED,
  ORIGIN_KINDS.LOCALHOST
]);

function originOf(req) {
  return req && req.headers ? req.headers.origin : undefined;
}

function createOriginPolicy({ selfPort, getTrustedOrigins, getExtensionIds, log } = {}) {
  const readTrusted = typeof getTrustedOrigins === 'function' ? getTrustedOrigins : () => [];
  const readExtensionIds = typeof getExtensionIds === 'function' ? getExtensionIds : () => defaultExtensionIds();
  const loggedUnknownIds = new Set();
  const policyFor = () => {
    let trustedOrigins = [];
    try {
      trustedOrigins = readTrusted() || [];
    } catch (error) {
      if (log?.warn) log.warn(`[Origin] trusted origins unreadable: ${error.message}`);
    }
    return { selfPort, trustedOrigins, extensionIds: readExtensionIds() || [] };
  };

  const classify = origin => {
    const result = classifyOrigin(origin, policyFor());
    if (result.kind === ORIGIN_KINDS.EXTENSION_UNKNOWN && !loggedUnknownIds.has(result.origin)) {
      loggedUnknownIds.add(result.origin);
      if (log?.warn) {
        log.warn(`[Origin] Refusing unconfigured extension origin ${result.origin}; add its id to ${EXTENSION_IDS_ENV}`);
      }
    }
    return result;
  };

  function corsOrigin(origin, callback) {
    callback(null, CORS_ORIGIN_KINDS.has(classify(origin).kind));
  }

  function refusalFor(req, message) {
    const { kind, origin } = classify(originOf(req));
    if (PRIVILEGED_ORIGIN_KINDS.has(kind)) return null;
    return { status: 403, kind, origin, message };
  }

  function tokenRefusal(req) {
    return refusalFor(req, 'The auth token is served to configured extensions, local tools, and allowlisted origins only');
  }

  function upgradeRefusal(req) {
    return refusalFor(req, 'WebSocket clients must be a configured extension, a local tool, or an allowlisted origin');
  }

  function installUpgradeGuard(server, wss) {
    server.on('upgrade', (req, socket, head) => {
      const refusal = upgradeRefusal(req);
      if (refusal) {
        if (log?.warn) log.warn(`[WS] Refused upgrade from ${refusal.kind} origin ${refusal.origin || '(none)'}`);
        const body = refusal.message;
        socket.write(
          `HTTP/1.1 ${refusal.status} Forbidden\r\n` +
          'Connection: close\r\n' +
          'Content-Type: text/plain\r\n' +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          '\r\n' + body
        );
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    });
  }

  return { classify, corsOrigin, tokenRefusal, upgradeRefusal, installUpgradeGuard, policyFor };
}

function classifyConnection(req, policy = {}) {
  const origin = originOf(req);
  const classified = classifyOrigin(origin, policy);
  const isExtension = classified.kind === ORIGIN_KINDS.EXTENSION;
  return {
    isExtension,
    extensionId: isExtension ? classified.extensionId : '',
    origin: typeof origin === 'string' ? origin : '',
    originKind: classified.kind,
    originTrusted: PRIVILEGED_ORIGIN_KINDS.has(classified.kind)
  };
}

function markConnection(ws, req, policy = {}) {
  const info = classifyConnection(req, policy);
  Object.assign(ws, info);
  return info;
}

let identifySequence = 0;
function applyIdentify(ws, data, sidebarConnections) {
  const clientType = data && typeof data.clientType === 'string' ? data.clientType : 'unknown';
  if (clientType !== 'sidebar') return { member: false, reason: `client type ${clientType} is not the sidebar` };
  if (!ws.isExtension) return { member: false, reason: 'upgrade origin is not a configured extension' };
  const claimed = data && typeof data.extensionId === 'string' ? data.extensionId : '';
  if (claimed && claimed !== ws.extensionId) {
    return { member: false, reason: `identify claims extension ${claimed} but the origin is ${ws.extensionId}` };
  }
  sidebarConnections.add(ws);
  identifySequence += 1;
  ws.identifiedAt = identifySequence;
  return { member: true, reason: '' };
}

function openExtensionSockets(sidebarConnections) {
  return Array.from(sidebarConnections)
    .filter(client => client.readyState === 1 && client.isExtension === true)
    .sort((a, b) => (a.identifiedAt || 0) - (b.identifiedAt || 0));
}

function pickExtensionRecipient(sidebarConnections) {
  const open = openExtensionSockets(sidebarConnections);
  return open.length ? open[open.length - 1] : null;
}

function createExtensionChannel(sidebarConnections, { activeConnections, log } = {}) {
  function drop(client, error) {
    if (log?.error) log.error('Error sending to extension client:', error);
    sidebarConnections.delete(client);
    if (activeConnections) activeConnections.delete(client);
  }
  function sendToOne(message) {
    const data = JSON.stringify(message);
    const client = pickExtensionRecipient(sidebarConnections);
    if (!client) return 0;
    try {
      client.send(data);
      return 1;
    } catch (error) {
      // A thrown send can still leave delivery uncertain. Do not replay the
      // request onto an older socket; the caller must reconcile or retry.
      drop(client, error);
      return 0;
    }
  }
  function sendToAll(message) {
    const data = JSON.stringify(message);
    let sent = 0;
    for (const client of openExtensionSockets(sidebarConnections)) {
      try {
        client.send(data);
        sent += 1;
      } catch (error) {
        drop(client, error);
      }
    }
    return sent;
  }
  return {
    sendToOne,
    sendToAll,
    connected: () => openExtensionSockets(sidebarConnections).length > 0,
    countFor: extensionId => openExtensionSockets(sidebarConnections).filter(client => client.extensionId === extensionId).length
  };
}

function acceptsBrowserFrame(ws, data) {
  return !data || typeof data.type !== 'string' || !data.type.startsWith('browser-') || ws.isExtension === true;
}

function browserFrameRefusal(data) {
  return {
    type: 'error',
    requestType: data && data.type,
    requestId: data && data.requestId,
    message: 'browser-* frames are accepted from the configured extension only'
  };
}

function terminalTargetOf(data) {
  if (!data || typeof data !== 'object') return '';
  switch (data.type) {
    case 'spawn': {
      const config = data.config && typeof data.config === 'object' ? data.config : {};
      return (typeof config.sessionName === 'string' && config.sessionName) ||
        (typeof config.sessionId === 'string' && config.sessionId) || '';
    }
    case 'reconnect':
      return (data.data && data.data.terminalId) || data.terminalId || '';
    case 'targeted-pane-send': {
      const pane = typeof data.tmuxPane === 'string' ? data.tmuxPane : '';
      return pane.match(/^([^:]+)/)?.[1] || '';
    }
    case 'tmux-session-send':
      return typeof data.sessionName === 'string' ? data.sessionName : '';
    default:
      return typeof data.terminalId === 'string' ? data.terminalId : '';
  }
}

function secretTerminalRefusal(ws, data, registry) {
  if (!data || !TERMINAL_MESSAGE_TYPES.has(data.type) || ws.isExtension === true) return null;
  const target = terminalTargetOf(data);
  if (!target || !registry.isSecretTerminal(target)) return null;
  return {
    type: 'terminal-error',
    terminalId: target,
    requestType: data.type,
    error: 'Secret editor terminal',
    message: 'This terminal is a protected credential editor; only the configured extension may address it.'
  };
}

function isProtectedTerminalReference(registry, idOrSession) {
  if (typeof idOrSession !== 'string' || idOrSession.length === 0) return false;
  const prefix = typeof registry?.SECRET_SESSION_PREFIX === 'string'
    ? registry.SECRET_SESSION_PREFIX
    : 'ctt-secret-';
  return idOrSession.startsWith(prefix) || registry?.isSecretInRegistry?.(idOrSession) === true;
}

function clientTerminalRecord(terminal) {
  if (!terminal || terminal.secret !== true) return terminal;
  return {
    id: terminal.id,
    name: terminal.name,
    terminalType: terminal.terminalType,
    state: terminal.state,
    secret: true
  };
}

function visibleTerminals(ws, terminals) {
  if (ws.isExtension === true) return terminals.map(clientTerminalRecord);
  return terminals.filter(terminal => terminal.secret !== true);
}

function stripSecretSpawnKeys(config) {
  const source = config && typeof config === 'object' ? config : {};
  const rejected = SECRET_SPAWN_KEYS.filter(key => Object.prototype.hasOwnProperty.call(source, key));
  const clean = { ...source };
  for (const key of rejected) delete clean[key];
  return { config: clean, rejected };
}

function exactTmuxTarget(target, sessionNames) {
  if (typeof target !== 'string' || target.length === 0) return null;
  const match = target.match(/^([^:]+)(:.*)?$/);
  if (!match) return null;
  const [, session, rest = ''] = match;
  const known = sessionNames instanceof Set
    ? sessionNames.has(session)
    : Array.from(sessionNames || []).includes(session);
  return known ? `=${session}${rest}` : null;
}

module.exports = {
  EXTENSION_ORIGIN_PREFIX,
  EXTENSION_IDS_ENV,
  TERMINAL_MESSAGE_TYPES,
  SECRET_SPAWN_KEYS,
  parseExtensionIds,
  defaultExtensionIds,
  LOOPBACK_HOSTS,
  ORIGIN_KINDS,
  PRIVILEGED_ORIGIN_KINDS,
  CORS_ORIGIN_KINDS,
  normalizeWebOrigin,
  isLoopbackWebOrigin,
  classifyOrigin,
  createOriginPolicy,
  isExtensionOrigin,
  isTrustedExtensionOrigin,
  extensionIdFromOrigin,
  classifyConnection,
  markConnection,
  applyIdentify,
  openExtensionSockets,
  pickExtensionRecipient,
  createExtensionChannel,
  acceptsBrowserFrame,
  browserFrameRefusal,
  terminalTargetOf,
  secretTerminalRefusal,
  isProtectedTerminalReference,
  clientTerminalRecord,
  visibleTerminals,
  stripSecretSpawnKeys,
  exactTmuxTarget
};
