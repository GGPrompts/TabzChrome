/**
 * History Management Tools
 *
 * Tools for searching and managing browser history
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";

// =====================================
// Types
// =====================================

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  lastVisitTime?: number;
  visitCount: number;
  typedCount: number;
}

interface VisitItem {
  id: string;
  visitId: string;
  visitTime?: number;
  referringVisitId: string;
  transition: string;
}

interface HistorySearchResult {
  success: boolean;
  items: HistoryItem[];
  total: number;
  error?: string;
}

interface HistoryVisitsResult {
  success: boolean;
  url?: string;
  visits: VisitItem[];
  total?: number;
  error?: string;
}

interface HistoryDeleteResult {
  success: boolean;
  url?: string;
  startTime?: number;
  endTime?: number;
  error?: string;
}

// =====================================
// Input Schemas
// =====================================

const HistorySearchSchema = z.object({
  query: z.string()
    .describe("Text to match in URLs and titles; empty matches all."),
  startTime: z.number()
    .optional()
    .describe("Range start, ms since epoch."),
  endTime: z.number()
    .optional()
    .describe("Range end, ms since epoch; now by default."),
  maxResults: z.number()
    .int()
    .min(1)
    .max(1000)
    .default(100),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type HistorySearchInput = z.infer<typeof HistorySearchSchema>;

const HistoryVisitsSchema = z.object({
  url: z.string()
    .url(),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type HistoryVisitsInput = z.infer<typeof HistoryVisitsSchema>;

const HistoryRecentSchema = z.object({
  maxResults: z.number()
    .int()
    .min(1)
    .max(1000)
    .default(50),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type HistoryRecentInput = z.infer<typeof HistoryRecentSchema>;

const HistoryDeleteUrlSchema = z.object({
  url: z.string()
    .url()
    .describe("The exact URL to delete.")
}).strict();

type HistoryDeleteUrlInput = z.infer<typeof HistoryDeleteUrlSchema>;

const HistoryDeleteRangeSchema = z.object({
  startTime: z.number()
    .describe("Range start, ms since epoch."),
  endTime: z.number()
    .describe("Range end, ms since epoch.")
}).strict();

type HistoryDeleteRangeInput = z.infer<typeof HistoryDeleteRangeSchema>;

// =====================================
// Helper Functions
// =====================================

function formatTimestamp(ms: number | undefined): string {
  if (!ms) return 'Unknown';
  const date = new Date(ms);
  return date.toLocaleString();
}

function formatRelativeTime(ms: number | undefined): string {
  if (!ms) return 'Unknown';
  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

  return formatTimestamp(ms);
}

// =====================================
// API Functions
// =====================================

async function searchHistory(
  query: string,
  startTime?: number,
  endTime?: number,
  maxResults?: number
): Promise<HistorySearchResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/history/search`, {
      query,
      startTime,
      endTime,
      maxResults
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return {
      success: false,
      items: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getHistoryVisits(url: string): Promise<HistoryVisitsResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/history/visits`, {
      url
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return {
      success: false,
      visits: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getRecentHistory(maxResults?: number): Promise<HistorySearchResult> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/history/recent`, {
      params: { maxResults },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      items: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function deleteHistoryUrl(url: string): Promise<HistoryDeleteResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/history/delete-url`, {
      url
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function deleteHistoryRange(startTime: number, endTime: number): Promise<HistoryDeleteResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/history/delete-range`, {
      startTime,
      endTime
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// =====================================
// Tool Registration
// =====================================

export function registerHistoryTools(server: McpServer): void {
  // Search history tool
  registerTabzTool(server,
    "tabz_history_search",
    "Search the user's browsing history by keyword, over URLs and page titles.",
    HistorySearchSchema,
    async (params: HistorySearchInput) => {
      try {
        const result = await searchHistory(
          params.query,
          params.startTime,
          params.endTime,
          params.maxResults
        );

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            success: true,
            total: result.total,
            items: result.items
          }, null, 2);
        } else {
          if (result.items.length === 0) {
            resultText = `# History Search Results

No matching history found for "${params.query}".

Try:
- Using a broader search term
- Expanding the date range with startTime/endTime
- Using tabz_history_recent to see all recent history`;
          } else {
            const lines: string[] = [
              `# History Search Results`,
              ``,
              `**Query:** "${params.query}"`,
              `**Found:** ${result.total} entries`,
              ``
            ];

            for (const item of result.items) {
              lines.push(`## ${item.title || '(no title)'}`);
              lines.push(`**URL:** ${item.url}`);
              lines.push(`**Last visited:** ${formatRelativeTime(item.lastVisitTime)}`);
              lines.push(`**Visits:** ${item.visitCount} total (${item.typedCount} typed)`);
              lines.push(``);
            }

            lines.push(`---`);
            lines.push(`Use \`tabz_history_visits\` with a URL to see detailed visit history.`);
            resultText = lines.join('\n');
          }
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Get visits for URL tool
  registerTabzTool(server,
    "tabz_history_visits",
    "Get one URL's visits: timestamps and navigation transitions.",
    HistoryVisitsSchema,
    async (params: HistoryVisitsInput) => {
      try {
        const result = await getHistoryVisits(params.url);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            success: true,
            url: result.url,
            total: result.total,
            visits: result.visits
          }, null, 2);
        } else {
          if (result.visits.length === 0) {
            resultText = `# Visit Details

**URL:** ${params.url}

No visits recorded for this URL.

This could mean:
- The URL was never visited
- The history was cleared
- The URL format doesn't match exactly`;
          } else {
            const lines: string[] = [
              `# Visit Details`,
              ``,
              `**URL:** ${result.url}`,
              `**Total visits:** ${result.total}`,
              ``,
              `## Visit History`,
              ``
            ];

            for (const visit of result.visits) {
              lines.push(`- **${formatTimestamp(visit.visitTime)}** via ${visit.transition}`);
            }

            resultText = lines.join('\n');
          }
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Get recent history tool
  registerTabzTool(server,
    "tabz_history_recent",
    "List the most recently visited pages, newest first.",
    HistoryRecentSchema,
    async (params: HistoryRecentInput) => {
      try {
        const result = await getRecentHistory(params.maxResults);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            success: true,
            total: result.total,
            items: result.items
          }, null, 2);
        } else {
          if (result.items.length === 0) {
            resultText = `# Recent History

No browsing history found.

This could mean:
- This is a new browser profile
- History has been cleared
- Incognito/private browsing was used`;
          } else {
            const lines: string[] = [
              `# Recent History`,
              ``,
              `**Showing:** ${result.total} most recent entries`,
              ``
            ];

            for (const item of result.items) {
              const title = item.title || '(no title)';
              const shortUrl = item.url.length > 60 ? item.url.slice(0, 60) + '...' : item.url;
              lines.push(`- **${formatRelativeTime(item.lastVisitTime)}**: ${title}`);
              lines.push(`  ${shortUrl}`);
            }

            lines.push(``);
            lines.push(`---`);
            lines.push(`Use \`tabz_history_search\` to search for specific pages.`);
            resultText = lines.join('\n');
          }
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Delete URL from history tool
  registerTabzTool(server,
    "tabz_history_delete_url",
    "Delete one URL and all its visits from history. This cannot be undone.",
    HistoryDeleteUrlSchema,
    async (params: HistoryDeleteUrlInput) => {
      try {
        const result = await deleteHistoryUrl(params.url);

        let resultText: string;
        if (result.success) {
          resultText = `## URL Deleted from History

Successfully removed from history:
**${params.url}**

All visit records for this URL have been permanently deleted.`;
        } else {
          resultText = `## Deletion Failed

**Error:** ${result.error}

URL: ${params.url}`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
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

  // Delete history range tool
  registerTabzTool(server,
    "tabz_history_delete_range",
    "Delete all history in a time range. This cannot be undone.",
    HistoryDeleteRangeSchema,
    async (params: HistoryDeleteRangeInput) => {
      try {
        const result = await deleteHistoryRange(params.startTime, params.endTime);

        let resultText: string;
        if (result.success) {
          resultText = `## History Range Deleted

Successfully deleted all history between:
- **From:** ${formatTimestamp(params.startTime)}
- **To:** ${formatTimestamp(params.endTime)}

All visit records in this time range have been permanently deleted.`;
        } else {
          resultText = `## Deletion Failed

**Error:** ${result.error}

Range: ${formatTimestamp(params.startTime)} to ${formatTimestamp(params.endTime)}`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
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
