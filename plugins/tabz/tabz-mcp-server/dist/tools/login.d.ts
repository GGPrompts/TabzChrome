/**
 * Manual login handoff without exposing credentials or page content.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare const DEFAULT_LOGIN_TIMEOUT_MS = 45000;
export declare const MAX_LOGIN_TIMEOUT_MS = 50000;
export declare const DEFAULT_LOGIN_POLL_INTERVAL_MS = 1500;
export type LoginWaitStatus = "signed_in" | "still_on_login" | "pending";
interface LoginStateResult {
    success: boolean;
    tabId?: number;
    tabStatus?: string;
    probed?: boolean;
    url?: string;
    host?: string;
    authUrl?: boolean;
    hasPasswordField?: boolean;
    hasLoginForm?: boolean;
    protected?: boolean;
    error?: string;
}
export interface RegisterLoginToolsOptions {
    pollIntervalMs?: number;
}
export declare function isOnLogin(state: LoginStateResult): boolean;
/** Only a completed, successfully probed page can count as prompt-free evidence. */
export declare function isClearLoginObservation(state: LoginStateResult): boolean;
export declare function registerLoginTools(server: McpServer, options?: RegisterLoginToolsOptions): void;
export {};
//# sourceMappingURL=login.d.ts.map