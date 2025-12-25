/**
 * Console Log Tools
 *
 * Tool for retrieving browser console logs
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat, type ConsoleLogsResponse, type ConsoleLogEntry, type ConsoleLogLevel } from "../types.js";

// Input schema for tabz_get_console_logs
const GetConsoleLogsSchema = z.object({
  level: z.enum(["all", "log", "info", "warn", "error", "debug"])
    .default("all")
    .describe("Filter logs by level: 'all', 'log', 'info', 'warn', 'error', or 'debug'"),
  limit: z.number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe("Maximum number of log entries to return (1-1000, default: 100)"),
  since: z.number()
    .int()
    .min(0)
    .optional()
    .describe("Only return logs after this timestamp (milliseconds since epoch)"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Filter logs by specific browser tab ID"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type GetConsoleLogsInput = z.infer<typeof GetConsoleLogsSchema>;

/**
 * Get console logs from the browser via backend
 */
async function getConsoleLogs(options: {
  level?: ConsoleLogLevel | 'all';
  limit?: number;
  since?: number;
  tabId?: number;
}): Promise<ConsoleLogsResponse> {
  try {
    const response = await axios.get<ConsoleLogsResponse>(
      `${BACKEND_URL}/api/browser/console-logs`,
      {
        params: {
          level: options.level,
          limit: options.limit,
          since: options.since,
          tabId: options.tabId
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get console logs");
  }
}

/**
 * Format console logs as markdown
 */
function formatLogsAsMarkdown(logs: ConsoleLogEntry[], total: number): string {
  if (logs.length === 0) {
    return "# Console Logs\n\nNo console logs captured. Make sure:\n- Chrome is open with pages loaded\n- TabzChrome extension is installed and active\n- You've interacted with pages that log to console";
  }

  const lines: string[] = [];
  lines.push(`# Console Logs (${logs.length} of ${total} total)`);
  lines.push("");

  // Group by level
  const byLevel: Record<string, ConsoleLogEntry[]> = {
    error: [],
    warn: [],
    info: [],
    log: [],
    debug: []
  };

  for (const entry of logs) {
    byLevel[entry.level]?.push(entry);
  }

  // Show errors first (most important)
  if (byLevel.error.length > 0) {
    lines.push(`## Errors (${byLevel.error.length})`);
    lines.push("");
    for (const entry of byLevel.error) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`- **[${time}]** ${truncateMessage(entry.message, 200)}`);
      if (entry.stack) {
        lines.push(`  \`\`\`\n  ${entry.stack.split('\n').slice(0, 3).join('\n  ')}\n  \`\`\``);
      }
      lines.push(`  _Source: ${entry.url}_`);
      lines.push("");
    }
  }

  // Warnings
  if (byLevel.warn.length > 0) {
    lines.push(`## Warnings (${byLevel.warn.length})`);
    lines.push("");
    for (const entry of byLevel.warn) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`- **[${time}]** ${truncateMessage(entry.message, 200)}`);
      lines.push("");
    }
  }

  // Info and logs combined
  const infoLogs = [...byLevel.info, ...byLevel.log].sort((a, b) => a.timestamp - b.timestamp);
  if (infoLogs.length > 0) {
    lines.push(`## Logs (${infoLogs.length})`);
    lines.push("");
    for (const entry of infoLogs.slice(-20)) { // Show last 20
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const level = entry.level === 'info' ? 'ℹ️' : '📝';
      lines.push(`- ${level} **[${time}]** ${truncateMessage(entry.message, 150)}`);
    }
    if (infoLogs.length > 20) {
      lines.push(`\n_...and ${infoLogs.length - 20} more log entries_`);
    }
    lines.push("");
  }

  // Debug (only if specifically requested)
  if (byLevel.debug.length > 0) {
    lines.push(`## Debug (${byLevel.debug.length})`);
    lines.push("");
    for (const entry of byLevel.debug.slice(-10)) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`- 🔍 **[${time}]** ${truncateMessage(entry.message, 100)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Truncate message to max length
 */
function truncateMessage(msg: string, maxLen: number): string {
  const firstLine = msg.split('\n')[0];
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen - 3) + "...";
}

/**
 * Register console tools with the MCP server
 */
export function registerConsoleTools(server: McpServer, backendUrl: string): void {
  server.tool(
    "tabz_get_console_logs",
    `Get console logs from the browser (log, warn, error, info, debug).

This tool retrieves console output from web pages open in Chrome. Useful for:
- Debugging JavaScript errors
- Seeing application logs
- Monitoring API responses logged to console
- Finding React/Vue/Angular warnings

The logs are captured from ALL open tabs. Use tabId filter to focus on specific tab.

Args:
  - level: Filter by log level ('all', 'log', 'info', 'warn', 'error', 'debug')
  - limit: Max entries to return (1-1000, default: 100)
  - since: Only logs after this timestamp (ms since epoch)
  - tabId: Filter by browser tab ID
  - response_format: 'markdown' (default) or 'json'

Returns:
  Console log entries with timestamp, level, message, source URL, and stack traces for errors.

Examples:
  - Get all errors: level="error"
  - Get recent logs: since=Date.now()-60000 (last minute)
  - Get specific tab: tabId=123

Error Handling:
  - "Cannot connect to backend": Start TabzChrome backend (cd backend && npm start)
  - "No logs captured": Open Chrome tabs and interact with pages`,
    GetConsoleLogsSchema.shape,
    async (params: GetConsoleLogsInput) => {
      try {
        const response = await getConsoleLogs({
          level: params.level === 'all' ? undefined : params.level,
          limit: params.limit,
          since: params.since,
          tabId: params.tabId
        });

        let result: string;
        if (params.response_format === ResponseFormat.JSON) {
          result = JSON.stringify(response, null, 2);
        } else {
          result = formatLogsAsMarkdown(response.logs, response.total);
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
