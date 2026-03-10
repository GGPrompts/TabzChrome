/**
 * Page Information Tools
 *
 * Tool for getting current page URL, title, and metadata
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat } from "../types.js";
// Input schema for tabz_get_page_info
const GetPageInfoSchema = z.object({
    tabId: z.number()
        .int()
        .optional()
        .describe("Specific tab ID to get info for. If not specified, returns info for the active tab."),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
/**
 * Get current page info from the browser via Extension API
 */
async function getPageInfo(tabId) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/page-info`, {
            params: { tabId },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to get page info");
    }
}
/**
 * Register page tools with the MCP server
 */
export function registerPageTools(server, backendUrl) {
    server.tool("tabz_get_page_info", `Get URL, title, tab ID of the active browser page. Use tabz_list_tabs for multi-tab views.

Args: tabId (optional), response_format (optional)`, GetPageInfoSchema.shape, async (params) => {
        try {
            const pageInfo = await getPageInfo(params.tabId);
            let result;
            if (params.response_format === ResponseFormat.JSON) {
                result = JSON.stringify(pageInfo, null, 2);
            }
            else {
                result = `# Current Page

**Title:** ${pageInfo.title || "(no title)"}

**URL:** ${pageInfo.url || "(no URL)"}

**Tab ID:** ${pageInfo.tabId}

${pageInfo.favIconUrl ? `**Favicon:** ${pageInfo.favIconUrl}` : ""}`;
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
}
//# sourceMappingURL=page.js.map