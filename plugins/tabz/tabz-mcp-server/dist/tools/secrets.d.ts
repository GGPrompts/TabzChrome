/**
 * Credential store tools
 *
 * The backend keeps a local, ssh-style credential store (~/.tabzchrome:
 * a Host-matched config plus 0600 key files) and plays the ssh-agent role: it
 * uses a secret when asked and never discloses it. These two tools are the
 * whole agent-facing surface:
 *
 *   tabz_secret_request  ask the user to save a login for a host (the
 *                        dashboard Logins page by default, a terminal prompt
 *                        when no Chrome is connected, the raw editor on
 *                        request), then wait a short while
 *   tabz_secret_status   read-only: is that entry filled in yet? spawns nothing
 *   tabz_fill_secret     type a saved field (username, password, or any named
 *                        Field / SecretFile) into the page
 *
 * No result ever carries a saved value: status, host, hasUsername, and field
 * NAMES only.
 * The user's typing happens on the Logins page or in a TabzChrome terminal pane
 * the model is not reading.
 *
 * WAIT WINDOW. One call uses a bounded budget (45 s by default, 50 s at most)
 * and returns pending when the user still has the editor open. The caller can
 * poll with tabz_secret_status or call again; the surface stays open.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/** Default overall budget for one tool call. */
export declare const DEFAULT_SECRET_TIMEOUT_MS = 45000;
/** Hard cap on one call. Keep waiting by calling again. */
export declare const MAX_SECRET_TIMEOUT_MS = 50000;
export declare const DEFAULT_SECRET_POLL_INTERVAL_MS = 1500;
export type SecretRequestStatus = "ready" | "pending" | "bad_mode" | "deferred";
export type SecretSurface = "page" | "terminal" | "editor";
export interface RegisterSecretToolsOptions {
    /** Poll interval between key-file checks; tests shrink it. */
    pollIntervalMs?: number;
}
/**
 * Register the credential store tools with the MCP server
 */
export declare function registerSecretTools(server: McpServer, options?: RegisterSecretToolsOptions): void;
//# sourceMappingURL=secrets.d.ts.map