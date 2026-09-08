/**
 * DOM Interaction Tools
 *
 * Tools for clicking elements and filling input fields
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
interface FillResult {
    success: boolean;
    tagName?: string;
    inputType?: string;
    sensitive?: boolean;
    selected?: boolean;
    host?: string;
    /** True only when the extension read the field back and it matched. */
    verified?: boolean;
    verifyError?: string;
    actualLength?: number;
    /** Never present for a sensitive field. */
    actualValue?: string | boolean;
    error?: string;
    transportError?: boolean;
}
type FillValue = string | boolean;
/** Render only a confirmed read-back as success. */
export declare function describeFillResult(selector: string, requested: FillValue, result: FillResult): {
    text: string;
    isError: boolean;
};
/**
 * Register DOM interaction tools with the MCP server
 */
export declare function registerInteractionTools(server: McpServer): void;
export {};
//# sourceMappingURL=interaction.d.ts.map