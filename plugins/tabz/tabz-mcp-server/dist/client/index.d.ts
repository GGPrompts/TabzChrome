import { type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
export * from "./errors.js";
export * from "./helpers.js";
export declare const DEFAULT_TABZ_ENDPOINT = "http://localhost:8129/mcp/page-agent";
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 60000;
export declare const DEFAULT_CLEANUP_TIMEOUT_MS = 2000;
export interface TabzClientOptions {
    endpoint?: string | URL;
    preset?: string;
    workflow: string;
    timeoutMs?: number;
    cleanupTimeoutMs?: number;
    fetch?: typeof globalThis.fetch;
}
export interface TabzCallOptions {
    timeoutMs?: number;
}
export interface TabzMutationUncertainty {
    toolName: string;
    message: string;
}
export declare function createAgentIdentity(workflow: string): string;
export declare function resolveEndpoint(endpoint?: string | URL, preset?: string): URL;
export declare function isMutationTool(name: string, input: Record<string, unknown>): boolean;
export declare class TabzClient {
    readonly endpoint: URL;
    readonly agentIdentity: string;
    private readonly timeoutMs;
    private readonly cleanupTimeoutMs;
    private readonly fetchFn;
    private readonly transport;
    private readonly sdkClient;
    private readonly validator;
    private tools?;
    private connected;
    private closing?;
    private uncertainty?;
    private fatal?;
    private activeMutation?;
    private callActive;
    private workflowTools?;
    private readonly ownedTabs;
    constructor(options: TabzClientOptions);
    get sessionId(): string | undefined;
    get mutationUncertainty(): TabzMutationUncertainty | undefined;
    get activeMutationTool(): string | undefined;
    markMutationUncertain(toolName: string, reason?: string): void;
    connect(): Promise<void>;
    discover(refresh?: boolean): Promise<Tool[]>;
    requireTools(names: readonly string[]): Promise<void>;
    bindWorkflowTools(names: readonly string[]): Promise<void>;
    callTool(name: string, input: Record<string, unknown>, options?: TabzCallOptions): Promise<CallToolResult>;
    closeOwnedTabAfterReconciliation(tabId: number): Promise<CallToolResult>;
    private callToolOnce;
    close(): Promise<void>;
    private closeOnce;
    private assertSessionUsable;
    private failSession;
    private assertToolAllowed;
    private recordOwnedTab;
}
//# sourceMappingURL=index.d.ts.map