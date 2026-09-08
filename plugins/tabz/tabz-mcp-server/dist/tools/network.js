/**
 * Network Monitoring Tools
 *
 * Tools for capturing and inspecting network requests (XHR, fetch, etc.)
 */
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, isNetworkCaptureActive, setNetworkCaptureActive } from "../shared.js";
import { ResponseFormat } from "../types.js";
import { formatBytes } from "../utils.js";
import { docsPointer } from "../descriptions.js";
// Input schema for tabz_enable_network_capture
const EnableNetworkCaptureSchema = z.object({
    tabId: z.number()
        .int()
        .positive()
        .optional(),
    includeSelf: z.boolean()
        .default(false)
        .describe("Include the extension's own backend traffic.")
}).strict();
const EnableDeepCaptureSchema = z.object({
    tabId: z.number()
        .int()
        .positive()
        .optional(),
    maxBodyBytes: z.number()
        .int()
        .min(1)
        .max(1000000)
        .default(64000)
        .describe("Stored bytes per response body."),
    includeSelf: z.boolean()
        .default(false)
        .describe("Include the extension's own backend traffic.")
}).strict();
const DisableDeepCaptureSchema = z.object({
    tabId: z.number()
        .int()
        .positive()
        .optional()
}).strict();
// Input schema for tabz_get_network_requests
const GetNetworkRequestsSchema = z.object({
    urlPattern: z.string()
        .optional()
        .describe("Keep URLs matching this regex; excludePattern drops them."),
    excludePattern: z.string()
        .optional(),
    // method, statusMin/statusMax, resourceType and offset publish their own
    // enums, bounds and defaults; a sentence would only restate them, and this
    // tool already spends about 930 chars on argument structure.
    method: z.enum(["all", "GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
        .default("all"),
    statusMin: z.number()
        .int()
        .min(100)
        .max(599)
        .optional()
        .describe("Lowest status to keep, e.g. 400 for errors."),
    statusMax: z.number()
        .int()
        .min(100)
        .max(599)
        .optional(),
    resourceType: z.enum(["all", "XHR", "Fetch", "Document", "Script", "Stylesheet", "Image", "Font", "WebSocket", "Other"])
        .default("all"),
    source: z.enum(["webrequest", "deep", "both"])
        .default("both")
        .describe("Capture layer; both merges them."),
    limit: z.number()
        .int()
        .min(1)
        .max(200)
        .default(50),
    offset: z.number()
        .int()
        .min(0)
        .default(0),
    tabId: z.number()
        .int()
        .positive()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
// Input schema for tabz_clear_network_requests
const ClearNetworkRequestsSchema = z.object({}).strict();
const GetResponseBodySchema = z.object({
    requestId: z.string()
        .min(1)
        .describe("Request ID from a deep row."),
    tabId: z.number()
        .int()
        .positive()
        .optional(),
    offset: z.number()
        .int()
        .min(0)
        .default(0)
        .describe("Character offset into the body or message list."),
    length: z.number()
        .int()
        .min(1)
        .max(32000)
        .default(16000),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
/**
 * Enable network monitoring via Extension API
 */
async function enableNetworkCapture(tabId, includeSelf = false) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-capture/enable`, { tabId, includeSelf }, { timeout: 20000 });
        if (response.data.success) {
            setNetworkCaptureActive(true);
            return { success: true, tabId: response.data.tabId, tabIds: response.data.tabIds };
        }
        return { success: false, error: response.data.error || 'Failed to enable network capture' };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function enableDeepCapture(tabId, maxBodyBytes = 64000, includeSelf = false) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-capture/deep/enable`, { tabId, maxBodyBytes, includeSelf }, { timeout: 20000 });
        if (response.data.success)
            setNetworkCaptureActive(true);
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function disableDeepCapture(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-capture/deep/disable`, { tabId }, { timeout: 20000 });
        return response.data;
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
            excludePattern: options.excludePattern,
            method: options.method,
            statusMin: options.statusMin,
            statusMax: options.statusMax,
            resourceType: options.resourceType,
            limit: options.limit,
            offset: options.offset,
            tabId: options.tabId,
            source: options.source
        }, { timeout: 20000 });
        return response.data;
    }
    catch (error) {
        return {
            requests: [],
            total: 0,
            hasMore: false,
            captureActive: isNetworkCaptureActive(),
            error: error instanceof Error ? error.message : 'Network request retrieval failed'
        };
    }
}
async function getResponseBody(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/network-response-body`, options, { timeout: 20000 });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            requestId: options.requestId,
            tabId: options.tabId,
            offset: options.offset ?? 0,
            length: 0,
            totalLength: 0,
            hasMore: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Clear all captured network requests via Extension API
 */
async function clearNetworkRequests() {
    const response = await axios.post(`${BACKEND_URL}/api/browser/network-requests/clear`, {}, { timeout: 20000 });
    if (response.data.success !== true)
        throw new Error(response.data.error || 'Capture clearing was not confirmed');
}
/**
 * Pure classifier for a single captured request row. Extracted so the
 * markdown formatter's sectioning can be unit tested without going through
 * axios or the extension.
 */
export function classifyNetworkRequestRow(req) {
    if (req.status === undefined)
        return "pending";
    if (req.status === 0)
        return "failed";
    if (req.status >= 400)
        return "error";
    if (req.status >= 300)
        return "redirect";
    if (req.status >= 200)
        return "success";
    return "pending"; // stray 1xx or otherwise unhandled status
}
/**
 * Format a single network request for markdown display
 */
function formatRequestMarkdown(req, index) {
    const lines = [];
    const time = new Date(req.timestamp).toLocaleTimeString();
    const status = req.status === 0 ? 'failed' : req.status ?? 'pending';
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
    if (req.redirectedTo) {
        lines.push(`- **Redirected To:** ${truncateUrl(req.redirectedTo, 60)}`);
    }
    if (req.redirectHop !== undefined) {
        lines.push(`- **Redirect Hop:** ${req.redirectHop}`);
    }
    lines.push(`- **Request ID:** \`${req.requestId}\``);
    if (req.deep) {
        lines.push(`- **Capture:** ${req.source || 'deep'} (response data available: ${req.bodyAvailable ? 'yes' : 'no'})`);
        if (req.streamCapture)
            lines.push(`- **Stream Capture:** ${req.streamCapture}`);
        if (req.streamCapture || (req.streamMessageCount || 0) > 0 || (req.droppedStreamMessages || 0) > 0) {
            lines.push(`- **Stream Messages:** ${req.streamMessageCount} retained, ${req.droppedStreamMessages || 0} dropped`);
        }
        if (req.resourceType === 'WebSocket' || (req.webSocketFrameCount || 0) > 0 || (req.droppedWebSocketFrames || 0) > 0) {
            lines.push(`- **WebSocket Frames:** ${req.webSocketFrameCount} retained (${req.webSocketFramesSent || 0} sent, ${req.webSocketFramesReceived || 0} received)`);
        }
        if (req.webRequestId)
            lines.push(`- **webRequest ID:** \`${req.webRequestId}\``);
    }
    lines.push("");
    return lines;
}
/**
 * Get status emoji for quick visual scanning
 */
function getStatusEmoji(status) {
    if (status === undefined)
        return "...";
    if (status === 0)
        return "\ud83d\udca5"; // collision: failed/blocked/aborted
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
 * Format network requests list as markdown. Exported for unit testing the
 * row-sectioning behavior (every counted row must appear in some section).
 */
export function formatNetworkRequestsMarkdown(response, params) {
    const lines = [];
    lines.push(`# Network Requests`);
    lines.push("");
    // Show filter info
    const filters = [];
    if (params.urlPattern)
        filters.push(`URL: "${params.urlPattern}"`);
    if (params.excludePattern)
        filters.push(`Excluding: "${params.excludePattern}"`);
    if (params.method !== 'all')
        filters.push(`Method: ${params.method}`);
    if (params.statusMin)
        filters.push(`Status \u2265 ${params.statusMin}`);
    if (params.statusMax)
        filters.push(`Status \u2264 ${params.statusMax}`);
    if (params.resourceType !== 'all')
        filters.push(`Type: ${params.resourceType}`);
    if (params.source !== 'both')
        filters.push(`Source: ${params.source}`);
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
    // Group by status category using the pure classifier, so every counted
    // row (including status 0 failures, which `r.status &&` checks used to
    // skip) lands in exactly one rendered section.
    const errors = response.requests.filter(r => classifyNetworkRequestRow(r) === 'error');
    const redirects = response.requests.filter(r => classifyNetworkRequestRow(r) === 'redirect');
    const success = response.requests.filter(r => classifyNetworkRequestRow(r) === 'success');
    const pendingOrFailed = response.requests.filter(r => {
        const category = classifyNetworkRequestRow(r);
        return category === 'pending' || category === 'failed';
    });
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
    // Pending / Failed (no status yet, or status 0 for a blocked/aborted request)
    if (pendingOrFailed.length > 0) {
        lines.push(`## ... Pending / Failed (${pendingOrFailed.length})`);
        lines.push("");
        for (let i = 0; i < Math.min(pendingOrFailed.length, 10); i++) {
            lines.push(...formatRequestMarkdown(pendingOrFailed[i], i));
        }
        if (pendingOrFailed.length > 10) {
            lines.push(`_...and ${pendingOrFailed.length - 10} more pending or failed requests_`);
            lines.push("");
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
export function formatResponseBodyMarkdown(response) {
    if (!response.success) {
        return `# Response Body Unavailable\n\n**Error:** ${response.error || 'Unknown error'}`;
    }
    const title = response.kind === 'event-stream'
        ? 'Event Stream Messages'
        : response.kind === 'websocket'
            ? 'WebSocket Frames'
            : 'Response Body';
    const lines = [
        `# ${title}`,
        '',
        `- **Request ID:** \`${response.requestId}\``,
        `- **Page:** characters ${response.offset}-${response.offset + response.length} of ${response.totalLength}`
    ];
    if (response.streamCapture)
        lines.push(`- **Stream Capture:** ${response.streamCapture}`);
    if (response.base64Encoded)
        lines.push('- **Encoding:** base64');
    if (response.truncated)
        lines.push('- **Stored Body:** truncated at the configured byte cap');
    if (response.redacted)
        lines.push('- **Stored Body:** redacted because the request URL is sensitive');
    if (response.dropped)
        lines.push(`- **Dropped Entries:** ${response.dropped}`);
    lines.push('', '```text', response.text || '', '```');
    if (response.hasMore) {
        lines.push('', `More data is available. Continue with \`offset: ${response.nextOffset}\`.`);
    }
    return lines.join('\n');
}
/**
 * Register network monitoring tools with the MCP server
 */
export function registerNetworkTools(server) {
    // Enable network capture tool
    registerTabzTool(server, "tabz_enable_network_capture", "Start recording request metadata (no bodies) for a tab; read it with tabz_get_network_requests. " +
        "Each call ADDS a tab, it never stops recording one.", EnableNetworkCaptureSchema, async (params) => {
        try {
            const result = await enableNetworkCapture(params.tabId, params.includeSelf);
            if (result.success) {
                const tabLine = result.tabIds && result.tabIds.length > 0
                    ? `Network monitoring is now active for tab${result.tabIds.length > 1 ? 's' : ''} ${result.tabIds.join(', ')}.`
                    : result.tabId !== undefined ? `Network monitoring is now active for tab ${result.tabId}.` : 'Network monitoring is now active.';
                return {
                    content: [{
                            type: "text",
                            text: `## Network Capture Enabled

${tabLine}

**Next steps:**
1. Navigate or interact with the page to generate network requests
2. Use \`tabz_get_network_requests\` to see captured requests

**Tips:**
- Filter by \`urlPattern\` to find specific API calls (e.g., "api/", "graphql")
- Filter by \`excludePattern\` to drop noisy requests (e.g., "claude-status")
- Filter by \`method: "POST"\` to see form submissions
- Filter by \`statusMin: 400\` to find errors
- The extension's own backend traffic is excluded by default; pass \`includeSelf: true\` to include it`
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
    registerTabzTool(server, "tabz_enable_deep_capture", "Start debugger capture for one tab: response bodies, server sent event messages, WebSocket frames. " +
        "Rule: only one debugger owns a tab, so disable it when done. " + docsPointer("tabz_enable_deep_capture"), EnableDeepCaptureSchema, async (params) => {
        const result = await enableDeepCapture(params.tabId, params.maxBodyBytes, params.includeSelf);
        if (!result.success) {
            return {
                content: [{ type: "text", text: `## Deep Capture Failed\n\n**Error:** ${result.error}` }],
                isError: true
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `## Deep Capture Enabled\n\nDebugger capture is active for tab ${result.tabId}. Bodies are capped at ${result.maxBodyBytes} bytes. Use \`tabz_get_network_requests\` with \`source: "deep"\`, then read payloads with \`tabz_get_response_body\`.`
                }]
        };
    });
    registerTabzTool(server, "tabz_disable_deep_capture", "Stop debugger capture for one tab, clear its deep rows, and release the debugger.", DisableDeepCaptureSchema, async (params) => {
        const result = await disableDeepCapture(params.tabId);
        if (!result.success) {
            return {
                content: [{ type: "text", text: `## Deep Capture Disable Failed\n\n**Error:** ${result.error}` }],
                isError: true
            };
        }
        return {
            content: [{ type: "text", text: `## Deep Capture Disabled\n\nDeep rows for tab ${result.tabId} were cleared.` }]
        };
    });
    // Get network requests tool
    registerTabzTool(server, "tabz_get_network_requests", "List captured requests, newest first. Enable capture first. " +
        docsPointer("tabz_get_network_requests"), GetNetworkRequestsSchema, async (params) => {
        try {
            const response = await getNetworkRequests({
                urlPattern: params.urlPattern,
                excludePattern: params.excludePattern,
                method: params.method,
                statusMin: params.statusMin,
                statusMax: params.statusMax,
                resourceType: params.resourceType,
                limit: params.limit,
                offset: params.offset,
                tabId: params.tabId,
                source: params.source
            });
            if (response.error)
                return { content: [{ type: "text", text: `Network request retrieval failed: ${response.error}` }], isError: true };
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
    registerTabzTool(server, "tabz_get_response_body", "Read one deep-capture row's body, server sent event messages, or WebSocket frames, a page at a time.", GetResponseBodySchema, async (params) => {
        const response = await getResponseBody({
            requestId: params.requestId,
            tabId: params.tabId,
            offset: params.offset,
            length: params.length
        });
        const text = params.response_format === ResponseFormat.JSON
            ? JSON.stringify(response, null, 2)
            : formatResponseBodyMarkdown(response);
        return {
            content: [{ type: "text", text }],
            isError: response.success ? undefined : true
        };
    });
    // Clear network requests tool
    registerTabzTool(server, "tabz_clear_network_requests", "Clear every captured request. Capture stays active.", ClearNetworkRequestsSchema, async () => {
        try {
            await clearNetworkRequests();
            return {
                content: [{
                        type: "text",
                        text: `## Network Requests Cleared

Captured network requests owned by this connection have been removed.

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