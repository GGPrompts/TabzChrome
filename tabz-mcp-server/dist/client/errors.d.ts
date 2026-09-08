import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export type TabzExitCode = 1 | 2 | 3 | 4;
export declare class TabzClientError extends Error {
    readonly exitCode: TabzExitCode;
    constructor(message: string, exitCode: TabzExitCode, options?: ErrorOptions);
}
export declare class TabzToolError extends TabzClientError {
    readonly result: CallToolResult;
    constructor(message: string, result: CallToolResult);
}
export declare class TabzUsageError extends TabzClientError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class TabzTransportError extends TabzClientError {
    constructor(message: string, options?: ErrorOptions);
}
export declare class TabzUncertainMutationError extends TabzClientError {
    readonly toolName: string;
    constructor(message: string, toolName: string, options?: ErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map