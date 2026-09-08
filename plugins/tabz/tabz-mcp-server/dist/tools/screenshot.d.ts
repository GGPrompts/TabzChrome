/**
 * Screenshot Tools
 *
 * Tools for capturing screenshots and downloading images from browser pages
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ScreenshotResult } from "../shared.js";
/**
 * Take a screenshot via Chrome Extension API
 */
export declare function takeScreenshot(options: {
    ref?: string;
    inlineOnly?: boolean;
    clip?: {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    };
    selector?: string;
    fullPage?: boolean;
    outputPath?: string;
    tabId?: number;
}): Promise<ScreenshotResult>;
/** Keep delivery evidence explicit: inline-only needs an image; saved captures need a path. */
export declare function screenshotToolResult(result: ScreenshotResult, options?: {
    inlineOnly?: boolean;
    action?: string;
    tabId?: number;
}): CallToolResult;
/**
 * Register screenshot tools with the MCP server
 */
export declare function registerScreenshotTools(server: McpServer): void;
//# sourceMappingURL=screenshot.d.ts.map