/**
 * History Management Tools
 *
 * Tools for searching and managing browser history
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";
// =====================================
// Input Schemas
// =====================================
const HistorySearchSchema = z.object({
    query: z.string()
        .describe("Search text to match against URLs and page titles. Use empty string to match all history."),
    startTime: z.number()
        .optional()
        .describe("Start of time range (milliseconds since epoch). Default: 24 hours ago."),
    endTime: z.number()
        .optional()
        .describe("End of time range (milliseconds since epoch). Default: now."),
    maxResults: z.number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum results to return (1-1000). Default: 100."),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
const HistoryVisitsSchema = z.object({
    url: z.string()
        .url()
        .describe("The exact URL to get visit details for"),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
const HistoryRecentSchema = z.object({
    maxResults: z.number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum results to return (1-1000). Default: 50."),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
const HistoryDeleteUrlSchema = z.object({
    url: z.string()
        .url()
        .describe("The exact URL to delete from history")
}).strict();
const HistoryDeleteRangeSchema = z.object({
    startTime: z.number()
        .describe("Start of time range to delete (milliseconds since epoch)"),
    endTime: z.number()
        .describe("End of time range to delete (milliseconds since epoch)")
}).strict();
// =====================================
// Helper Functions
// =====================================
function formatTimestamp(ms) {
    if (!ms)
        return 'Unknown';
    const date = new Date(ms);
    return date.toLocaleString();
}
function formatRelativeTime(ms) {
    if (!ms)
        return 'Unknown';
    const now = Date.now();
    const diff = now - ms;
    if (diff < 60000)
        return 'Just now';
    if (diff < 3600000)
        return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000)
        return `${Math.floor(diff / 3600000)} hours ago`;
    if (diff < 604800000)
        return `${Math.floor(diff / 86400000)} days ago`;
    return formatTimestamp(ms);
}
// =====================================
// API Functions
// =====================================
async function searchHistory(query, startTime, endTime, maxResults) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/history/search`, {
            query,
            startTime,
            endTime,
            maxResults
        }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            items: [],
            total: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
async function getHistoryVisits(url) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/history/visits`, {
            url
        }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            visits: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
async function getRecentHistory(maxResults) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/history/recent`, {
            params: { maxResults },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            items: [],
            total: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
async function deleteHistoryUrl(url) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/history/delete-url`, {
            url
        }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
async function deleteHistoryRange(startTime, endTime) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/history/delete-range`, {
            startTime,
            endTime
        }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
// =====================================
// Tool Registration
// =====================================
export function registerHistoryTools(server) {
    // Search history tool
    server.tool("tabz_history_search", `Search browsing history by keyword and date range.

Finds pages the user has visited that match the search query. Searches both
URLs and page titles.

Args:
  - query (required): Search text to match. Use empty string "" to match all.
  - startTime (optional): Start of date range in ms since epoch. Default: 24 hours ago.
  - endTime (optional): End of date range in ms since epoch. Default: now.
  - maxResults (optional): Max results to return (1-1000). Default: 100.
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "success": true,
    "total": 25,
    "items": [
      {
        "id": "123",
        "url": "https://example.com/page",
        "title": "Example Page",
        "lastVisitTime": 1703894400000,
        "visitCount": 5,
        "typedCount": 2
      }
    ]
  }

Key fields:
  - lastVisitTime: When the page was last visited (ms since epoch)
  - visitCount: Total number of times this URL was visited
  - typedCount: Times the URL was typed directly in the address bar

Examples:
  - Find GitHub pages from today: query="github"
  - Find all pages from last week: query="", startTime=<week_ago_ms>
  - Find specific site: query="stackoverflow.com"

Use tabz_history_visits to get detailed visit information for a specific URL.
Use tabz_history_recent for a quick view of recent browsing.

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running at localhost:8129
  - Empty results: No matching history in the specified time range`, HistorySearchSchema.shape, async (params) => {
        try {
            const result = await searchHistory(params.query, params.startTime, params.endTime, params.maxResults);
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    success: true,
                    total: result.total,
                    items: result.items
                }, null, 2);
            }
            else {
                if (result.items.length === 0) {
                    resultText = `# History Search Results

No matching history found for "${params.query}".

Try:
- Using a broader search term
- Expanding the date range with startTime/endTime
- Using tabz_history_recent to see all recent history`;
                }
                else {
                    const lines = [
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
    // Get visits for URL tool
    server.tool("tabz_history_visits", `Get detailed visit information for a specific URL.

Returns all recorded visits to a particular URL, including when each visit
occurred and how the user navigated to the page.

Args:
  - url (required): The exact URL to look up (must be a valid URL)
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "success": true,
    "url": "https://example.com/page",
    "total": 5,
    "visits": [
      {
        "id": "456",
        "visitId": "789",
        "visitTime": 1703894400000,
        "referringVisitId": "123",
        "transition": "link"
      }
    ]
  }

Transition types:
  - "link": Clicked a link on another page
  - "typed": Typed the URL directly
  - "auto_bookmark": Clicked a bookmark
  - "auto_subframe": Loaded in a subframe
  - "manual_subframe": User clicked in a subframe
  - "generated": Generated (e.g., form submission)
  - "start_page": Start page
  - "form_submit": Form submission
  - "reload": Page reload
  - "keyword": Omnibox keyword search
  - "keyword_generated": Generated from keyword

Examples:
  - Get visits: url="https://github.com/anthropics/claude-code"

Use tabz_history_search first to find URLs if you don't have the exact URL.

Error Handling:
  - "No visits found": URL not in history or never visited
  - Invalid URL format: Ensure the URL is complete with protocol`, HistoryVisitsSchema.shape, async (params) => {
        try {
            const result = await getHistoryVisits(params.url);
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    success: true,
                    url: result.url,
                    total: result.total,
                    visits: result.visits
                }, null, 2);
            }
            else {
                if (result.visits.length === 0) {
                    resultText = `# Visit Details

**URL:** ${params.url}

No visits recorded for this URL.

This could mean:
- The URL was never visited
- The history was cleared
- The URL format doesn't match exactly`;
                }
                else {
                    const lines = [
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
    // Get recent history tool
    server.tool("tabz_history_recent", `Get the most recently visited pages.

Returns browsing history sorted by most recent visit time. This is a quick
way to see what the user has been browsing without specifying search terms.

Args:
  - maxResults (optional): Max results to return (1-1000). Default: 50.
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "success": true,
    "total": 50,
    "items": [
      {
        "id": "123",
        "url": "https://example.com/page",
        "title": "Example Page",
        "lastVisitTime": 1703894400000,
        "visitCount": 5,
        "typedCount": 2
      }
    ]
  }

Examples:
  - Get last 10 pages: maxResults=10
  - Get last 100 pages: maxResults=100

Use tabz_history_search for keyword-based searching.

Error Handling:
  - Empty results: No browsing history (new profile or cleared)
  - "Cannot connect": Ensure TabzChrome backend is running`, HistoryRecentSchema.shape, async (params) => {
        try {
            const result = await getRecentHistory(params.maxResults);
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    success: true,
                    total: result.total,
                    items: result.items
                }, null, 2);
            }
            else {
                if (result.items.length === 0) {
                    resultText = `# Recent History

No browsing history found.

This could mean:
- This is a new browser profile
- History has been cleared
- Incognito/private browsing was used`;
                }
                else {
                    const lines = [
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
    // Delete URL from history tool
    server.tool("tabz_history_delete_url", `Remove a specific URL from browsing history.

Permanently deletes all visits to the specified URL from the browser's
history. This cannot be undone.

Args:
  - url (required): The exact URL to delete from history

Returns:
  - success: Whether the deletion was successful
  - url: The URL that was deleted
  - error: Error message if failed

Examples:
  - Delete a page: url="https://example.com/sensitive-page"

CAUTION: This action cannot be undone. The URL and all its visit records
will be permanently removed from history.

Use tabz_history_search first to find the exact URL if needed.

Error Handling:
  - Invalid URL format: Ensure URL is complete with protocol
  - "Cannot connect": Ensure TabzChrome backend is running`, HistoryDeleteUrlSchema.shape, async (params) => {
        try {
            const result = await deleteHistoryUrl(params.url);
            let resultText;
            if (result.success) {
                resultText = `## URL Deleted from History

Successfully removed from history:
**${params.url}**

All visit records for this URL have been permanently deleted.`;
            }
            else {
                resultText = `## Deletion Failed

**Error:** ${result.error}

URL: ${params.url}`;
            }
            return {
                content: [{ type: "text", text: resultText }],
                isError: !result.success
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
    // Delete history range tool
    server.tool("tabz_history_delete_range", `Remove all browsing history within a date range.

Permanently deletes all history entries between the specified start and end
times. This cannot be undone.

Args:
  - startTime (required): Start of range (milliseconds since epoch)
  - endTime (required): End of range (milliseconds since epoch)

Returns:
  - success: Whether the deletion was successful
  - startTime: Start of deleted range
  - endTime: End of deleted range
  - error: Error message if failed

Time helpers (JavaScript):
  - Now: Date.now()
  - 1 hour ago: Date.now() - 3600000
  - 24 hours ago: Date.now() - 86400000
  - 7 days ago: Date.now() - 604800000
  - Specific date: new Date('2024-01-15').getTime()

Examples:
  - Delete last hour: startTime=<hour_ago_ms>, endTime=<now_ms>
  - Delete today: startTime=<today_start_ms>, endTime=<now_ms>

CAUTION: This action cannot be undone. All history in the specified time
range will be permanently deleted.

Error Handling:
  - "startTime must be less than endTime": Check time values
  - "Cannot connect": Ensure TabzChrome backend is running`, HistoryDeleteRangeSchema.shape, async (params) => {
        try {
            const result = await deleteHistoryRange(params.startTime, params.endTime);
            let resultText;
            if (result.success) {
                resultText = `## History Range Deleted

Successfully deleted all history between:
- **From:** ${formatTimestamp(params.startTime)}
- **To:** ${formatTimestamp(params.endTime)}

All visit records in this time range have been permanently deleted.`;
            }
            else {
                resultText = `## Deletion Failed

**Error:** ${result.error}

Range: ${formatTimestamp(params.startTime)} to ${formatTimestamp(params.endTime)}`;
            }
            return {
                content: [{ type: "text", text: resultText }],
                isError: !result.success
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
//# sourceMappingURL=history.js.map