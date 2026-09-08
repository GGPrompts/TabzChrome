/**
 * Console Log Tools
 *
 * Tool for retrieving browser console logs
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConsoleLogEntry } from "../types.js";
/**
 * Format console logs as markdown
 */
export declare function formatLogsAsMarkdown(logs: ConsoleLogEntry[], total: number): string;
/**
 * Register console tools with the MCP server
 */
export declare function registerConsoleTools(server: McpServer, backendUrl: string): void;
//# sourceMappingURL=console.d.ts.map