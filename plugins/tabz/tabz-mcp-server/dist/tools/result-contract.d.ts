import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export type ReadFailureStatus = "not_found" | "refused" | "transport_error" | "failed";
export type MutationFailureStatus = "not_found" | "refused" | "unknown" | "failed";
export declare function readFailureStatus(error: string | undefined, transportError?: boolean): ReadFailureStatus;
export declare function mutationFailureStatus(error: string | undefined, transportError?: boolean): MutationFailureStatus;
export declare function structuredToolResult(text: string, status: string, fields: Record<string, unknown>, isError: boolean): CallToolResult;
//# sourceMappingURL=result-contract.d.ts.map