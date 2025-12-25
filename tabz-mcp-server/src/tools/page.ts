/**
 * Page Information Tools
 *
 * Tool for getting current page URL, title, and metadata
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat, type PageInfo } from "../types.js";

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

type GetPageInfoInput = z.infer<typeof GetPageInfoSchema>;

/**
 * Get current page info from the browser via Extension API
 */
async function getPageInfo(tabId?: number): Promise<PageInfo> {
  try {
    const response = await axios.get<PageInfo>(
      `${BACKEND_URL}/api/browser/page-info`,
      {
        params: { tabId },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get page info");
  }
}

/**
 * Register page tools with the MCP server
 */
export function registerPageTools(server: McpServer, backendUrl: string): void {
  server.tool(
    "tabz_get_page_info",
    `Get information about the current browser page.

Returns the URL, title, tab ID, and favicon of the active browser tab.
Syncs Claude's target to the user's ACTUAL focused tab (like tabz_list_tabs).

Useful for:
- Understanding what page the user is looking at
- Getting context before executing scripts
- Identifying which site the user needs help with

Args:
  - tabId: Specific tab ID (default: active tab)
  - response_format: 'markdown' (default) or 'json'

Returns:
  - url: Full URL of the page
  - title: Page title (from <title> tag)
  - tabId: Chrome tab identifier (same IDs as tabz_list_tabs)
  - favIconUrl: URL of the page favicon

IMPORTANT: For reliable multi-tab operations, prefer tabz_list_tabs which shows
ALL tabs with their active status. Use tabz_get_page_info for quick single-page context.

Examples:
  - Get current page: (no args needed)
  - Get specific tab: tabId=1762556601

Error Handling:
  - "No active tab": No browser window is focused
  - "Cannot connect": Backend not running`,
    GetPageInfoSchema.shape,
    async (params: GetPageInfoInput) => {
      try {
        const pageInfo = await getPageInfo(params.tabId);

        let result: string;
        if (params.response_format === ResponseFormat.JSON) {
          result = JSON.stringify(pageInfo, null, 2);
        } else {
          result = `# Current Page

**Title:** ${pageInfo.title || "(no title)"}

**URL:** ${pageInfo.url || "(no URL)"}

**Tab ID:** ${pageInfo.tabId}

${pageInfo.favIconUrl ? `**Favicon:** ${pageInfo.favIconUrl}` : ""}`;
        }

        return {
          content: [{ type: "text", text: result }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
