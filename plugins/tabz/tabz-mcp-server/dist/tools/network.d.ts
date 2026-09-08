/**
 * Network Monitoring Tools
 *
 * Tools for capturing and inspecting network requests (XHR, fetch, etc.)
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResponseFormat, type NetworkRequest, type NetworkRequestsResponse, type NetworkResponseBodyPage } from "../types.js";
declare const GetNetworkRequestsSchema: z.ZodObject<{
    urlPattern: z.ZodOptional<z.ZodString>;
    excludePattern: z.ZodOptional<z.ZodString>;
    method: z.ZodDefault<z.ZodEnum<["all", "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]>>;
    statusMin: z.ZodOptional<z.ZodNumber>;
    statusMax: z.ZodOptional<z.ZodNumber>;
    resourceType: z.ZodDefault<z.ZodEnum<["all", "XHR", "Fetch", "Document", "Script", "Stylesheet", "Image", "Font", "WebSocket", "Other"]>>;
    source: z.ZodDefault<z.ZodEnum<["webrequest", "deep", "both"]>>;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
    tabId: z.ZodOptional<z.ZodNumber>;
    response_format: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
}, "strict", z.ZodTypeAny, {
    method: "GET" | "DELETE" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "all";
    limit: number;
    response_format: ResponseFormat;
    resourceType: "all" | "XHR" | "Fetch" | "Document" | "Script" | "Stylesheet" | "Image" | "Font" | "WebSocket" | "Other";
    source: "webrequest" | "deep" | "both";
    offset: number;
    tabId?: number | undefined;
    urlPattern?: string | undefined;
    excludePattern?: string | undefined;
    statusMin?: number | undefined;
    statusMax?: number | undefined;
}, {
    method?: "GET" | "DELETE" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "all" | undefined;
    limit?: number | undefined;
    tabId?: number | undefined;
    response_format?: ResponseFormat | undefined;
    urlPattern?: string | undefined;
    excludePattern?: string | undefined;
    statusMin?: number | undefined;
    statusMax?: number | undefined;
    resourceType?: "all" | "XHR" | "Fetch" | "Document" | "Script" | "Stylesheet" | "Image" | "Font" | "WebSocket" | "Other" | undefined;
    source?: "webrequest" | "deep" | "both" | undefined;
    offset?: number | undefined;
}>;
export type GetNetworkRequestsInput = z.infer<typeof GetNetworkRequestsSchema>;
/**
 * Categories a captured network request row can fall into for markdown
 * rendering. 'failed' covers requests whose status is stored as 0
 * (extension/background/networkCapture.ts onErrorOccurred, e.g. blocked or
 * aborted requests); 'pending' covers requests with no status yet (in
 * flight, or a redirect hop retired without a completion). Every request
 * falls into exactly one category, so rendering all five always accounts
 * for the full row count.
 */
export type NetworkRowCategory = "error" | "redirect" | "success" | "pending" | "failed";
/**
 * Pure classifier for a single captured request row. Extracted so the
 * markdown formatter's sectioning can be unit tested without going through
 * axios or the extension.
 */
export declare function classifyNetworkRequestRow(req: Pick<NetworkRequest, "status">): NetworkRowCategory;
/**
 * Format network requests list as markdown. Exported for unit testing the
 * row-sectioning behavior (every counted row must appear in some section).
 */
export declare function formatNetworkRequestsMarkdown(response: NetworkRequestsResponse, params: GetNetworkRequestsInput): string;
export declare function formatResponseBodyMarkdown(response: NetworkResponseBodyPage): string;
/**
 * Register network monitoring tools with the MCP server
 */
export declare function registerNetworkTools(server: McpServer): void;
export {};
//# sourceMappingURL=network.d.ts.map