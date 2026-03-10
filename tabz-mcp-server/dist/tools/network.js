/**
 * Network Monitoring Tools
 *
 * Tools for capturing and inspecting network requests (XHR, fetch, etc.)
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, isNetworkCaptureActive, setNetworkCaptureActive } from "../shared.js";
import { ResponseFormat } from "../types.js";
import { formatBytes } from "../utils.js";
// Input schema for tabz_enable_network_capture
const EnableNetworkCaptureSchema = z.object({
    tabId: z.number()
        .int()
        .optional()
        .describe("Specific tab ID to enable capture for. If not specified, uses current tab.")
}).strict();
// Input schema for tabz_get_network_requests
const GetNetworkRequestsSchema = z.object({
    urlPattern: z.string()
        .optional()
        .describe("Filter by URL pattern (regex or substring). E.g., 'api/', '\\.json$', 'graphql'"),
    method: z.enum(["all", "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
        .default("all")
        .describe("Filter by HTTP method"),
    statusMin: z.number()
        .int()
        .min(100)
        .max(599)
        .optional()
        .describe("Minimum status code (e.g., 400 for errors only)"),
    statusMax: z.number()
        .int()
        .min(100)
        .max(599)
        .optional()
        .describe("Maximum status code (e.g., 299 for successful only)"),
    resourceType: z.enum(["all", "XHR", "Fetch", "Document", "Script", "Stylesheet", "Image", "Font", "Other"])
        .default("all")
        .describe("Filter by resource type"),
    limit: z.number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe("Maximum number of requests to return (1-200, default: 50)"),
    offset: z.number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of requests to skip for pagination"),
    tabId: z.number()
        .int()
        .optional()
        .describe("Filter by specific browser tab ID"),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
// Input schema for tabz_clear_network_requests
const ClearNetworkRequestsSchema = z.object({}).strict();
/**
 * Enable network monitoring via Extension API
 */
async function enableNetworkCapture(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-capture/enable`, { tabId }, { timeout: 10000 });
        if (response.data.success) {
            setNetworkCaptureActive(true);
            return { success: true };
        }
        return { success: false, error: response.data.error || 'Failed to enable network capture' };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Get captured network requests via Extension API
 */
async function getNetworkRequests(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-requests`, {
            urlPattern: options.urlPattern,
            method: options.method,
            statusMin: options.statusMin,
            statusMax: options.statusMax,
            resourceType: options.resourceType,
            limit: options.limit,
            offset: options.offset,
            tabId: options.tabId
        }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return {
            requests: [],
            total: 0,
            hasMore: false,
            captureActive: isNetworkCaptureActive()
        };
    }
}
/**
 * Clear all captured network requests via Extension API
 */
function clearNetworkRequests() {
    axios.post(`${BACKEND_URL}/api/browser/network-requests/clear`, {}, { timeout: 5000 })
        .catch(() => { });
}
/**
 * Format a single network request for markdown display
 */
function formatRequestMarkdown(req, index) {
    const lines = [];
    const time = new Date(req.timestamp).toLocaleTimeString();
    const status = req.status ?? 'pending';
    const statusEmoji = getStatusEmoji(req.status);
    lines.push(`### ${index + 1}. ${statusEmoji} \`${req.method}\` ${truncateUrl(req.url, 60)}`);
    lines.push(`- **Status:** ${status} ${req.statusText || ''}`);
    lines.push(`- **Type:** ${req.resourceType}`);
    lines.push(`- **Time:** ${time}`);
    if (req.responseTime !== undefined) {
        lines.push(`- **Duration:** ${req.responseTime}ms`);
    }
    if (req.mimeType) {
        lines.push(`- **MIME:** ${req.mimeType}`);
    }
    if (req.encodedDataLength !== undefined) {
        lines.push(`- **Size:** ${formatBytes(req.encodedDataLength)}`);
    }
    lines.push(`- **Request ID:** \`${req.requestId}\``);
    lines.push("");
    return lines;
}
/**
 * Get status emoji for quick visual scanning
 */
function getStatusEmoji(status) {
    if (status === undefined)
        return "...";
    if (status >= 200 && status < 300)
        return "\u2705"; // green check
    if (status >= 300 && status < 400)
        return "\u27a1\ufe0f"; // redirect arrow
    if (status >= 400 && status < 500)
        return "\u26a0\ufe0f"; // warning
    if (status >= 500)
        return "\u274c"; // red x
    return "\u2753"; // question mark
}
/**
 * Truncate URL for display
 */
function truncateUrl(url, maxLen) {
    if (url.length <= maxLen)
        return url;
    return url.slice(0, maxLen - 3) + "...";
}
/**
 * Format network requests list as markdown
 */
function formatNetworkRequestsMarkdown(response, params) {
    const lines = [];
    lines.push(`# Network Requests`);
    lines.push("");
    // Show filter info
    const filters = [];
    if (params.urlPattern)
        filters.push(`URL: "${params.urlPattern}"`);
    if (params.method !== 'all')
        filters.push(`Method: ${params.method}`);
    if (params.statusMin)
        filters.push(`Status \u2265 ${params.statusMin}`);
    if (params.statusMax)
        filters.push(`Status \u2264 ${params.statusMax}`);
    if (params.resourceType !== 'all')
        filters.push(`Type: ${params.resourceType}`);
    if (filters.length > 0) {
        lines.push(`**Filters:** ${filters.join(", ")}`);
    }
    lines.push(`**Found:** ${response.total} requests${response.hasMore ? ` (showing ${response.requests.length})` : ""}`);
    lines.push("");
    if (response.requests.length === 0) {
        lines.push("No matching requests found.");
        lines.push("");
        lines.push("**Tips:**");
        lines.push("- Make sure network capture is enabled (`tabz_enable_network_capture`)");
        lines.push("- Interact with the page to generate requests");
        lines.push("- Try removing or adjusting filters");
        return lines.join("\n");
    }
    // Group by status category
    const errors = response.requests.filter(r => r.status && r.status >= 400);
    const redirects = response.requests.filter(r => r.status && r.status >= 300 && r.status < 400);
    const success = response.requests.filter(r => r.status && r.status >= 200 && r.status < 300);
    const pending = response.requests.filter(r => r.status === undefined);
    // Show errors first
    if (errors.length > 0) {
        lines.push(`## \u274c Errors (${errors.length})`);
        lines.push("");
        for (let i = 0; i < Math.min(errors.length, 10); i++) {
            lines.push(...formatRequestMarkdown(errors[i], i));
        }
        if (errors.length > 10) {
            lines.push(`_...and ${errors.length - 10} more errors_`);
            lines.push("");
        }
    }
    // Then successful requests
    if (success.length > 0) {
        lines.push(`## \u2705 Successful (${success.length})`);
        lines.push("");
        for (let i = 0; i < Math.min(success.length, 15); i++) {
            lines.push(...formatRequestMarkdown(success[i], i));
        }
        if (success.length > 15) {
            lines.push(`_...and ${success.length - 15} more successful requests_`);
            lines.push("");
        }
    }
    // Redirects
    if (redirects.length > 0) {
        lines.push(`## \u27a1\ufe0f Redirects (${redirects.length})`);
        lines.push("");
        for (let i = 0; i < Math.min(redirects.length, 5); i++) {
            lines.push(...formatRequestMarkdown(redirects[i], i));
        }
        if (redirects.length > 5) {
            lines.push(`_...and ${redirects.length - 5} more redirects_`);
            lines.push("");
        }
    }
    // Pending
    if (pending.length > 0) {
        lines.push(`## ... Pending (${pending.length})`);
        lines.push("");
        for (let i = 0; i < Math.min(pending.length, 5); i++) {
            lines.push(...formatRequestMarkdown(pending[i], i));
        }
        lines.push("");
    }
    // Pagination info
    if (response.hasMore) {
        lines.push("---");
        lines.push(`**More results available.** Use \`offset: ${response.nextOffset}\` to see next page.`);
    }
    return lines.join("\n");
}
/**
 * Register network monitoring tools with the MCP server
 */
export function registerNetworkTools(server) {
    // Enable network capture tool
    server.tool("tabz_enable_network_capture", `Enable network request monitoring. Call BEFORE browsing, then use tabz_get_network_requests to inspect.

Args: tabId (optional)`, EnableNetworkCaptureSchema.shape, async (params) => {
        try {
            const result = await enableNetworkCapture(params.tabId);
            if (result.success) {
                return {
                    content: [{
                            type: "text",
                            text: `## Network Capture Enabled

Network monitoring is now active for the current tab.

**Next steps:**
1. Navigate or interact with the page to generate network requests
2. Use \`tabz_get_network_requests\` to see captured requests

**Tips:**
- Filter by \`urlPattern\` to find specific API calls (e.g., "api/", "graphql")
- Filter by \`method: "POST"\` to see form submissions
- Filter by \`statusMin: 400\` to find errors`
                        }]
                };
            }
            else {
                return {
                    content: [{
                            type: "text",
                            text: `## Network Capture Failed

**Error:** ${result.error}

Make sure the Chrome extension is installed and connected.`
                        }],
                    isError: true
                };
            }
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Get network requests tool
    server.tool("tabz_get_network_requests", `List captured network requests. Call tabz_enable_network_capture first.

Args: urlPattern (optional), method (optional), statusMin/statusMax (optional), resourceType/limit/offset/tabId (optional)`, GetNetworkRequestsSchema.shape, async (params) => {
        try {
            // Check if capture is active
            if (!isNetworkCaptureActive()) {
                return {
                    content: [{
                            type: "text",
                            text: `## Network Capture Not Active

No network requests have been captured yet.

**To start capturing:**
1. Call \`tabz_enable_network_capture\` first
2. Navigate or interact with the page
3. Call this tool again to see captured requests`
                        }],
                    isError: true
                };
            }
            const response = await getNetworkRequests({
                urlPattern: params.urlPattern,
                method: params.method,
                statusMin: params.statusMin,
                statusMax: params.statusMax,
                resourceType: params.resourceType,
                limit: params.limit,
                offset: params.offset,
                tabId: params.tabId
            });
            let result;
            if (params.response_format === ResponseFormat.JSON) {
                result = JSON.stringify(response, null, 2);
            }
            else {
                result = formatNetworkRequestsMarkdown(response, params);
            }
            return {
                content: [{ type: "text", text: result }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Clear network requests tool
    server.tool("tabz_clear_network_requests", `Clear all captured network requests. Capture remains active after clearing.`, ClearNetworkRequestsSchema.shape, async () => {
        try {
            clearNetworkRequests();
            return {
                content: [{
                        type: "text",
                        text: `## Network Requests Cleared

All captured network requests have been removed.

Network capture is still active - new requests will continue to be captured.`
                    }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=network.js.map