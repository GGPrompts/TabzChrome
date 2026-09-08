/**
 * Tab Management Tools
 *
 * Tools for listing and switching between browser tabs
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
interface CloseTabResult {
    success: boolean;
    closed?: number[];
    refused?: Array<{
        tabId: number;
        reason: string;
    }>;
    missing?: number[];
    groupId?: number | null;
    error?: string;
    transportError?: boolean;
}
export declare function formatCloseTabResult(result: CloseTabResult): string;
/**
 * Register tab management tools with the MCP server
 */
export declare function registerTabTools(server: McpServer): void;
export {};
//# sourceMappingURL=tabs.d.ts.map