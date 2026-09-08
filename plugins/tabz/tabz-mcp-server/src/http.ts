/**
 * Streamable HTTP entry for the tabz MCP server.
 *
 * The Node backend mounts this on its Express app at /mcp so one long-running
 * process serves every local Claude Code session: an update is "restart the
 * backend", not "restart every session". One McpServer plus one
 * StreamableHTTPServerTransport per Mcp-Session-Id, torn down on DELETE or
 * transport close.
 *
 * Connection identity: the group enforcement keys browser requests by an
 * `agent` id. Over HTTP there is no per-client environment, so the id comes
 * from the X-Tabz-Agent request header when present (it also titles the tab
 * group), otherwise from the MCP session id.
 *
 * Tool set: MCP_PRESET is the backend process's own environment, not the
 * caller's, so an HTTP caller names its preset per session instead. Two forms
 * resolve the same way, path first: a `/mcp/<preset>` path segment (so one
 * `claude mcp add` entry pins a preset) and an X-Tabz-Preset header (for
 * spawned terminals and hand-rolled clients). Bare /mcp keeps the mcp-config
 * tool set, and an unknown preset fails closed to the Core tools. One
 * McpServer is built per Mcp-Session-Id, so the tool set is fixed when the
 * session is created: changing preset means a new session, not a new request.
 *
 * Local non-browser clients only: both the TCP peer and strict Host syntax
 * must be loopback, and every request carrying an Origin header is refused.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { createTabzServer, type CreateTabzServerOptions } from "./server.js";
import { createConnectionState, runWithConnectionState, validateAgentId, type ConnectionState } from "./shared.js";

export const AGENT_HEADER = "x-tabz-agent";
export const PRESET_HEADER = "x-tabz-preset";
export const SESSION_HEADER = "mcp-session-id";
export const DEFAULT_MCP_PATH = "/mcp";
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_SWEEP_INTERVAL_MS = 60 * 1000;
export const GROUP_RELEASE_TIMEOUT_MS = 750;
export const SESSION_CLOSE_TIMEOUT_MS = 750;
export const HANDLER_CLOSE_TIMEOUT_MS = 1_800;

export interface TabzMcpHttpOptions extends CreateTabzServerOptions {
  /** Express route path; defaults to /mcp. Also the base a /mcp/<preset> segment is read against. */
  path?: string;
  /** Log sink for lifecycle lines; defaults to console.error (stdout may be an MCP channel). */
  log?: (message: string) => void;
  /** Idle sweep frequency; production defaults to one minute. */
  sweepIntervalMs?: number;
}

/** Per-request overrides the mount layer already resolved (Express route params). */
export interface TabzMcpRequestOptions {
  /** Preset named by the route, e.g. the :preset param of /mcp/:preset. */
  preset?: string;
}

export interface TabzMcpSession {
  sessionId: string;
  agentId: string;
  agentLabel?: string;
  /** The preset asked for at session creation, if any. */
  preset?: string;
  /** Tool ids this session published; the preset's set, mcp-config's, or Core. */
  enabledTools: Set<string>;
  createdAt: number;
  lastSeen: number;
  state: ConnectionState;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  /** Dissolve this session's agent group while leaving its tabs open. */
  releaseAgentGroup(): Promise<void>;
  close(): Promise<void>;
}

export interface TabzMcpHandler {
  /** Handle one HTTP request; pass the pre-parsed body when body-parser ran. */
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
    requestOptions?: TabzMcpRequestOptions
  ): Promise<void>;
  /** Live sessions keyed by Mcp-Session-Id. */
  readonly sessions: ReadonlyMap<string, TabzMcpSession>;
  /** Close every session (backend shutdown). */
  close(): Promise<void>;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * True when a Host header names a loopback interface, with or without a port.
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  const host = hostHeader?.trim().toLowerCase();
  if (!host) return false;
  const match = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/.exec(host);
  if (!match) return false;
  return match[2] === undefined || Number(match[2]) <= 65_535;
}

/** The TCP peer must itself be loopback; Host alone is forgeable over a LAN. */
export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  return /^127(?:\.\d{1,3}){3}$/.test(ipv4) && ipv4.split(".").every(part => Number(part) <= 255);
}

/**
 * True only when no Origin was sent. Localhost web pages are separate trust
 * principals and cannot drive this endpoint through permissive backend CORS.
 */
export function isAllowedOrigin(originHeader: string | undefined): boolean {
  return originHeader === undefined;
}

/**
 * Connection identity for a new session: the X-Tabz-Agent header when present
 * (id and group title), otherwise the session id with no group title.
 */
export function resolveHttpAgentIdentity(
  agentHeader: string | undefined,
  sessionId: string
): { agentId: string; agentLabel?: string } {
  const label = agentHeader?.trim();
  if (label) {
    const validated = validateAgentId(label);
    return { agentId: validated, agentLabel: validated };
  }
  return { agentId: sessionId };
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) resolve(false);
    }, timeoutMs);
    timer.unref();
    promise.then(value => {
      settled = true;
      clearTimeout(timer);
      void value;
      resolve(true);
    }, () => {
      settled = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Clean a caller-supplied preset name: printable ASCII only and short enough
 * to log. A name that is not a real preset slug simply fails to match and the
 * session falls closed to Core, so this only keeps log lines and comparisons
 * sane. Returns undefined for an empty value.
 */
export function sanitizePresetName(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 64);
  return cleaned ? cleaned : undefined;
}

/**
 * Read the preset from a request URL: the one path segment after the mount
 * path, so /mcp/page-agent asks for page-agent and bare /mcp asks for nothing.
 */
export function resolvePresetFromPath(
  url: string | undefined,
  basePath: string = DEFAULT_MCP_PATH
): string | undefined {
  if (!url) return undefined;
  let pathname: string;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    return undefined;
  }
  const base = basePath.replace(/\/+$/, "");
  if (!pathname.startsWith(`${base}/`)) return undefined;
  const segment = pathname.slice(base.length + 1).split("/")[0];
  if (!segment) return undefined;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape stays as written; it will not match a preset.
  }
  return sanitizePresetName(decoded);
}

/**
 * The preset for a new session. The path wins over the header (a registered
 * URL is the more deliberate of the two), and with neither the handler's own
 * explicit default applies. Bare HTTP passes null to the server factory and
 * never inherits the backend process's MCP_PRESET.
 */
export function resolveSessionPreset(sources: {
  routePreset?: string;
  pathPreset?: string;
  headerPreset?: string;
  defaultPreset?: string;
}): string | undefined {
  return (
    sanitizePresetName(sources.routePreset) ??
    sanitizePresetName(sources.pathPreset) ??
    sanitizePresetName(sources.headerPreset) ??
    sources.defaultPreset
  );
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Read and parse a JSON body when no body-parser middleware ran (plain
 * node:http servers). Resolves undefined for an empty body.
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : undefined;
}

function sendJsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

/**
 * Create the request handler that serves the tabz MCP over Streamable HTTP.
 * Framework-neutral: the backend mount wires it to Express, while tests can
 * call handle() from a plain node:http server.
 */
export function createTabzMcpHandler(options: TabzMcpHttpOptions = {}): TabzMcpHandler {
  const log = options.log ?? ((message: string) => console.error(message));
  const sessions = new Map<string, TabzMcpSession>();
  const basePath = options.path ?? DEFAULT_MCP_PATH;
  const initializations = new Set<Promise<TabzMcpSession>>();
  let closing = false;

  async function createSession(
    agentHeader: string | undefined,
    preset: string | undefined
  ): Promise<TabzMcpSession> {
    const sessionId = randomUUID();
    const { agentId, agentLabel } = resolveHttpAgentIdentity(agentHeader, sessionId);
    const state = createConnectionState(agentId, agentLabel, options.backendUrl);
    const { server, enabledTools, presetStatus } = await createTabzServer({
      preset: preset ?? null,
      backendUrl: options.backendUrl
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      enableJsonResponse: true,
      onsessionclosed: () => {
        sessions.delete(sessionId);
        log(`[MCP] Session ${sessionId} closed by client (agent ${agentId})`);
      }
    });

    let releasePromise: Promise<void> | undefined;
    const releaseAgentGroup = () => {
      if (!releasePromise) {
        releasePromise = axios.post(
          `${state.backendUrl}/api/browser/claude-group/release`,
          { agent: agentId },
          { timeout: GROUP_RELEASE_TIMEOUT_MS }
        ).then(response => {
          if (response.data?.success !== true) {
            throw new Error(response.data?.error || "browser did not release the group");
          }
        }).catch(error => {
          log(`[MCP] Could not release agent group for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      return releasePromise;
    };

    let closePromise: Promise<void> | undefined;
    const close = () => {
      if (!closePromise) {
        closePromise = (async () => {
          sessions.delete(sessionId);
          await releaseAgentGroup();
          const serverClose = server.close().catch(error => {
            log(`[MCP] Error closing session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
          });
          const closed = await settleWithin(serverClose, SESSION_CLOSE_TIMEOUT_MS);
          if (!closed) log(`[MCP] Timed out closing session ${sessionId}`);
        })();
      }
      return closePromise;
    };
    transport.onclose = () => {
      void releaseAgentGroup();
      if (sessions.delete(sessionId)) {
        log(`[MCP] Session ${sessionId} transport closed (agent ${agentId})`);
      }
    };

    try {
      await server.connect(transport);
    } catch (error) {
      await settleWithin(server.close(), SESSION_CLOSE_TIMEOUT_MS);
      throw error;
    }

    const session: TabzMcpSession = {
      sessionId,
      agentId,
      agentLabel,
      preset,
      enabledTools,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      state,
      server,
      transport,
      releaseAgentGroup,
      close
    };
    sessions.set(sessionId, session);
    if (closing) {
      await session.close();
      throw new Error("MCP handler is closing");
    }
    // One line per session, so an unknown preset is visible in the backend log
    // instead of only on the MCP server's own stderr.
    if (presetStatus === 'unknown') {
      log(
        `[MCP] Session ${sessionId} asked for preset "${preset}", which is not a known preset; ` +
        `serving the ${enabledTools.size} core tools only`
      );
    } else if (presetStatus === 'applied') {
      log(`[MCP] Session ${sessionId} opened for agent ${agentId} (preset ${preset}, ${enabledTools.size} tools)`);
    } else {
      log(`[MCP] Session ${sessionId} opened for agent ${agentId} (${enabledTools.size} tools)`);
    }
    return session;
  }

  async function sweepIdleSessions(): Promise<void> {
    const now = Date.now();
    await Promise.all([...sessions.values()].map(async session => {
      const idleAge = now - session.lastSeen;
      if (idleAge <= SESSION_IDLE_TIMEOUT_MS) return;
      log(`[MCP] Evicting idle session ${session.sessionId} after ${idleAge}ms idle`);
      await session.close();
    }));
  }

  const idleSweepTimer = setInterval(() => {
    void sweepIdleSessions();
  }, options.sweepIntervalMs ?? SESSION_SWEEP_INTERVAL_MS);
  idleSweepTimer.unref();

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
    requestOptions?: TabzMcpRequestOptions
  ): Promise<void> {
    if (closing) {
      sendJsonRpcError(res, 503, -32000, "Service Unavailable: the tabz MCP endpoint is shutting down");
      return;
    }
    if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
      sendJsonRpcError(res, 403, -32000, "Forbidden: the tabz MCP endpoint accepts loopback connections only");
      return;
    }
    if (!isLoopbackHost(headerValue(req.headers.host))) {
      sendJsonRpcError(res, 403, -32000, "Forbidden: the tabz MCP endpoint answers loopback hosts only");
      return;
    }
    if (!isAllowedOrigin(headerValue(req.headers.origin))) {
      sendJsonRpcError(res, 403, -32000, "Forbidden: the tabz MCP endpoint accepts non-browser clients only");
      return;
    }

    let body = parsedBody;
    if (req.method === "POST" && body === undefined) {
      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJsonRpcError(res, 400, -32700, `Parse error: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }

    const sessionId = headerValue(req.headers[SESSION_HEADER])?.trim();
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        sendJsonRpcError(res, 404, -32001, "Session not found");
        return;
      }
      session.lastSeen = Date.now();
      if (req.method === "DELETE") {
        await session.releaseAgentGroup();
        try {
          await runWithConnectionState(session.state, () => session.transport.handleRequest(req, res, body));
        } finally {
          await session.close();
        }
        return;
      }
      await runWithConnectionState(session.state, () => session.transport.handleRequest(req, res, body));
      return;
    }

    if (req.method === "POST" && isInitializeRequest(body)) {
      const preset = resolveSessionPreset({
        routePreset: requestOptions?.preset,
        pathPreset: resolvePresetFromPath(req.url, basePath),
        headerPreset: headerValue(req.headers[PRESET_HEADER]),
        defaultPreset: options.preset ?? undefined
      });
      let creation: Promise<TabzMcpSession>;
      try {
        // Validate before any preset fetch or server creation has side effects.
        resolveHttpAgentIdentity(headerValue(req.headers[AGENT_HEADER]), "pending");
        creation = createSession(headerValue(req.headers[AGENT_HEADER]), preset);
      } catch (error) {
        sendJsonRpcError(res, 400, -32602, error instanceof Error ? error.message : String(error));
        return;
      }
      initializations.add(creation);
      creation.finally(() => initializations.delete(creation)).catch(() => undefined);
      let session: TabzMcpSession;
      try {
        session = await creation;
      } catch (error) {
        sendJsonRpcError(res, closing ? 503 : 500, -32603, error instanceof Error ? error.message : String(error));
        return;
      }
      try {
        await runWithConnectionState(session.state, () => session.transport.handleRequest(req, res, body));
      } catch (error) {
        await session.close();
        sendJsonRpcError(res, 500, -32603, error instanceof Error ? error.message : String(error));
        return;
      }
      if (res.statusCode >= 400 || session.transport.sessionId !== session.sessionId) {
        await session.close();
      }
      return;
    }

    sendJsonRpcError(res, 400, -32000, "Bad Request: No valid session ID provided");
  }

  let handlerClosePromise: Promise<void> | undefined;
  function close(): Promise<void> {
    if (!handlerClosePromise) {
      handlerClosePromise = (async () => {
        closing = true;
        clearInterval(idleSweepTimer);
        const cleanup = Promise.allSettled([
          ...[...sessions.values()].map(session => session.close()),
          ...[...initializations].map(async creation => {
            const session = await creation;
            await session.close();
          })
        ]);
        await settleWithin(cleanup, HANDLER_CLOSE_TIMEOUT_MS);
      })();
    }
    return handlerClosePromise;
  }

  return { handle, sessions, close };
}
