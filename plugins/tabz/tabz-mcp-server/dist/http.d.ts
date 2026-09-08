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
import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type CreateTabzServerOptions } from "./server.js";
import { type ConnectionState } from "./shared.js";
export declare const AGENT_HEADER = "x-tabz-agent";
export declare const PRESET_HEADER = "x-tabz-preset";
export declare const SESSION_HEADER = "mcp-session-id";
export declare const DEFAULT_MCP_PATH = "/mcp";
export declare const SESSION_IDLE_TIMEOUT_MS: number;
export declare const SESSION_SWEEP_INTERVAL_MS: number;
export declare const GROUP_RELEASE_TIMEOUT_MS = 750;
export declare const SESSION_CLOSE_TIMEOUT_MS = 750;
export declare const HANDLER_CLOSE_TIMEOUT_MS = 1800;
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
    handle(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown, requestOptions?: TabzMcpRequestOptions): Promise<void>;
    /** Live sessions keyed by Mcp-Session-Id. */
    readonly sessions: ReadonlyMap<string, TabzMcpSession>;
    /** Close every session (backend shutdown). */
    close(): Promise<void>;
}
/**
 * True when a Host header names a loopback interface, with or without a port.
 */
export declare function isLoopbackHost(hostHeader: string | undefined): boolean;
/** The TCP peer must itself be loopback; Host alone is forgeable over a LAN. */
export declare function isLoopbackRemoteAddress(address: string | undefined): boolean;
/**
 * True only when no Origin was sent. Localhost web pages are separate trust
 * principals and cannot drive this endpoint through permissive backend CORS.
 */
export declare function isAllowedOrigin(originHeader: string | undefined): boolean;
/**
 * Connection identity for a new session: the X-Tabz-Agent header when present
 * (id and group title), otherwise the session id with no group title.
 */
export declare function resolveHttpAgentIdentity(agentHeader: string | undefined, sessionId: string): {
    agentId: string;
    agentLabel?: string;
};
/**
 * Clean a caller-supplied preset name: printable ASCII only and short enough
 * to log. A name that is not a real preset slug simply fails to match and the
 * session falls closed to Core, so this only keeps log lines and comparisons
 * sane. Returns undefined for an empty value.
 */
export declare function sanitizePresetName(value: string | undefined): string | undefined;
/**
 * Read the preset from a request URL: the one path segment after the mount
 * path, so /mcp/page-agent asks for page-agent and bare /mcp asks for nothing.
 */
export declare function resolvePresetFromPath(url: string | undefined, basePath?: string): string | undefined;
/**
 * The preset for a new session. The path wins over the header (a registered
 * URL is the more deliberate of the two), and with neither the handler's own
 * explicit default applies. Bare HTTP passes null to the server factory and
 * never inherits the backend process's MCP_PRESET.
 */
export declare function resolveSessionPreset(sources: {
    routePreset?: string;
    pathPreset?: string;
    headerPreset?: string;
    defaultPreset?: string;
}): string | undefined;
/**
 * Create the request handler that serves the tabz MCP over Streamable HTTP.
 * Framework-neutral: the backend mount wires it to Express, while tests can
 * call handle() from a plain node:http server.
 */
export declare function createTabzMcpHandler(options?: TabzMcpHttpOptions): TabzMcpHandler;
//# sourceMappingURL=http.d.ts.map