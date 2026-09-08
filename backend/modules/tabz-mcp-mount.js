/**
 * Synchronously register Tabz MCP routes while loading the ESM transport.
 * The placeholder keeps /mcp ahead of static middleware and returns JSON-RPC
 * 503 responses until the built handler is ready.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_DIST = path.join(__dirname, '..', '..', 'tabz-mcp-server', 'dist', 'http.js');
const DEFAULT_SETUP_HINT = 'run the Tabz /rebuild workflow, then restart the backend';
const DEFAULT_CLOSE_TIMEOUT_MS = 2000;

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function sendUnavailable(req, res, detail) {
  res.status(503).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: `Tabz MCP is unavailable: ${detail}` },
    id: req && req.body && req.body.id !== undefined ? req.body.id : null
  });
}

/**
 * @param {object} options
 * @param {{ all: Function }} options.app Express app
 * @param {{ info: Function, warn: Function, error: Function }} options.log
 * @param {string} [options.routePath='/mcp']
 * @param {string} [options.distPath]
 * @param {(specifier: string) => Promise<object>} [options.importModule]
 * @param {string} [options.backendUrl='http://127.0.0.1:8129']
 * @param {string} [options.setupHint]
 * @param {string} [options.publicUrl='http://localhost:8129/mcp']
 * @param {number} [options.closeTimeoutMs=2000]
 */
function mountTabzMcp({
  app,
  log,
  routePath = '/mcp',
  distPath = DEFAULT_DIST,
  importModule,
  backendUrl = 'http://127.0.0.1:8129',
  setupHint = DEFAULT_SETUP_HINT,
  publicUrl = `http://localhost:8129${routePath}`,
  closeTimeoutMs = DEFAULT_CLOSE_TIMEOUT_MS
} = {}) {
  if (!app || typeof app.all !== 'function') throw new TypeError('mountTabzMcp requires an Express app');
  if (!log) throw new TypeError('mountTabzMcp requires a logger');

  let handler = null;
  let closed = false;
  let closePromise = null;
  let unavailableReason = 'still loading';

  const closeHandler = async (instance) => {
    if (!instance || typeof instance.close !== 'function') return;

    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => instance.close()),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`close exceeded ${closeTimeoutMs}ms`)), closeTimeoutMs);
        })
      ]);
    } catch (error) {
      log.warn(`[MCP] Handler cleanup did not finish cleanly: ${errorMessage(error)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const failRequest = (req, res, error) => {
    log.error(`[MCP] Request failed: ${errorMessage(error)}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: req && req.body && req.body.id !== undefined ? req.body.id : null
      });
    }
  };

  const dispatch = (req, res) => {
    const activeHandler = handler;
    if (!activeHandler) {
      sendUnavailable(req, res, unavailableReason);
      return;
    }

    try {
      const pending = activeHandler.handle(req, res, req.body, {
        preset: req.params && req.params.preset
      });
      Promise.resolve(pending).catch(error => failRequest(req, res, error));
    } catch (error) {
      failRequest(req, res, error);
    }
  };

  app.all(routePath, dispatch);
  app.all(`${routePath}/:preset`, dispatch);

  const ready = (async () => {
    if (!fs.existsSync(distPath)) {
      unavailableReason = `${path.relative(process.cwd(), distPath)} is missing; ${setupHint}`;
      log.warn(`[MCP] Not mounted: ${unavailableReason}`);
      return false;
    }

    try {
      const doImport = importModule || (specifier => import(specifier));
      const mod = await doImport(pathToFileURL(distPath).href);
      if (closed) return false;
      if (typeof mod.createTabzMcpHandler !== 'function') {
        throw new Error('built http.js has no createTabzMcpHandler export; rebuild tabz-mcp-server');
      }

      const nextHandler = mod.createTabzMcpHandler({
        log: message => log.info(message),
        path: routePath,
        backendUrl
      });
      if (!nextHandler || typeof nextHandler.handle !== 'function' || typeof nextHandler.close !== 'function') {
        await closeHandler(nextHandler);
        throw new Error('createTabzMcpHandler returned an incomplete handler; rebuild tabz-mcp-server');
      }
      if (closed) {
        await closeHandler(nextHandler);
        return false;
      }

      handler = nextHandler;
      log.info(
        `[MCP] Streamable HTTP ready at ${routePath} and ${routePath}/<preset> ` +
        `(register: claude mcp add -s user --transport http tabz ${publicUrl})`
      );
      return true;
    } catch (error) {
      unavailableReason = `${errorMessage(error)}; ${setupHint}`;
      log.error(`[MCP] Not mounted: ${unavailableReason}`);
      return false;
    }
  })();

  return {
    ready,
    getHandler: () => handler,
    close: () => {
      if (closePromise) return closePromise;
      closed = true;
      unavailableReason = 'the backend is shutting down';
      const activeHandler = handler;
      handler = null;
      closePromise = closeHandler(activeHandler);
      return closePromise;
    }
  };
}

module.exports = {
  mountTabzMcp,
  DEFAULT_DIST,
  DEFAULT_SETUP_HINT,
  DEFAULT_CLOSE_TIMEOUT_MS
};
