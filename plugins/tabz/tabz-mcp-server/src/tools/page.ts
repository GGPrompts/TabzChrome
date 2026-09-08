/**
 * Page Information Tools
 *
 * Tool for getting current page URL, title, and metadata
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat, type PageInfo } from "../types.js";
import { readFailureStatus, structuredToolResult } from "./result-contract.js";

// Input schema for tabz_get_page_info
const GetPageInfoSchema = z.object({
  tabId: z.number()
    .int()
    .optional(),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
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
  registerTabzTool(server,
    "tabz_get_page_info",
    "Get the URL, title, and tab ID of one page; tabz_list_tabs covers your group.",
    GetPageInfoSchema,
    async (params: GetPageInfoInput) => {
      try {
        const pageInfo = await getPageInfo(params.tabId);
        if (pageInfo.error || !Number.isInteger(pageInfo.tabId) || pageInfo.tabId <= 0) {
          const error = pageInfo.error ?? "The browser returned an invalid tab ID";
          const text = `Error: ${error}`;
          return structuredToolResult(text, readFailureStatus(error), {
            found: false,
            tabId: Number.isInteger(pageInfo.tabId) && pageInfo.tabId > 0 ? pageInfo.tabId : null,
            url: pageInfo.url || null,
            title: pageInfo.title || null,
            error
          }, true);
        }

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

        return structuredToolResult(result, "found", {
          found: true,
          tabId: pageInfo.tabId,
          url: pageInfo.url,
          title: pageInfo.title,
          favIconUrl: pageInfo.favIconUrl ?? null
        }, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return structuredToolResult(`Error: ${message}`, readFailureStatus(message), {
          found: false,
          tabId: params.tabId ?? null,
          url: null,
          title: null,
          error: message
        }, true);
      }
    }
  );
}
