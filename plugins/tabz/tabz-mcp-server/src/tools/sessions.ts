/**
 * Chrome Sessions Tools
 *
 * Tools for recovering recently closed tabs/windows and viewing tabs on synced devices.
 * Uses chrome.sessions API via the TabzChrome extension.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";

// =====================================
// Input Schemas
// =====================================

const RecentlyClosedSchema = z.object({
  maxResults: z.number()
    .int()
    .min(1)
    .max(25)
    .default(25)
    .describe("Maximum sessions to return (Chrome limits to 25)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type RecentlyClosedInput = z.infer<typeof RecentlyClosedSchema>;

const RestoreSessionSchema = z.object({
  sessionId: z.string()
    .describe("Session ID from tabz_sessions_recently_closed. If omitted, restores the most recently closed session.")
    .optional()
}).strict();

type RestoreSessionInput = z.infer<typeof RestoreSessionSchema>;

const DevicesSchema = z.object({
  maxResults: z.number()
    .int()
    .min(1)
    .max(10)
    .default(10)
    .describe("Maximum devices to return"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type DevicesInput = z.infer<typeof DevicesSchema>;

// =====================================
// Response Types
// =====================================

interface SessionTab {
  sessionId: string;
  url: string;
  title: string;
  favIconUrl?: string;
}

interface SessionWindow {
  sessionId: string;
  tabCount: number;
  tabs: SessionTab[];
}

interface ClosedSession {
  lastModified: number;
  tab?: SessionTab;
  window?: SessionWindow;
}

interface RecentlyClosedResult {
  success: boolean;
  sessions?: ClosedSession[];
  error?: string;
}

interface RestoreResult {
  success: boolean;
  session?: ClosedSession;
  error?: string;
}

interface DeviceSession {
  deviceName: string;
  lastModifiedTime: number;
  sessions: ClosedSession[];
}

interface DevicesResult {
  success: boolean;
  devices?: DeviceSession[];
  error?: string;
}

// =====================================
// API Functions
// =====================================

/**
 * Get recently closed tabs and windows
 */
async function getRecentlyClosed(maxResults: number): Promise<RecentlyClosedResult> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/sessions/recent`, {
      params: { maxResults },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Restore a closed session
 */
async function restoreSession(sessionId?: string): Promise<RestoreResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/sessions/restore`, {
      sessionId
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get tabs from synced devices
 */
async function getDevices(maxResults: number): Promise<DevicesResult> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/sessions/devices`, {
      params: { maxResults },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// =====================================
// Formatting Helpers
// =====================================

function formatTimestamp(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatRecentlyClosedMarkdown(sessions: ClosedSession[]): string {
  if (sessions.length === 0) {
    return `# Recently Closed

No recently closed tabs or windows found.

Tabs/windows are tracked for recovery after being closed.`;
  }

  const lines: string[] = [
    `# Recently Closed (${sessions.length} items)`,
    "",
    "Use `tabz_sessions_restore` with the sessionId to reopen any item.",
    ""
  ];

  for (const session of sessions) {
    const time = formatTimestamp(session.lastModified);

    if (session.tab) {
      lines.push(`## Tab: ${session.tab.title || "(no title)"}`);
      lines.push(`- **Session ID:** \`${session.tab.sessionId}\``);
      lines.push(`- **URL:** ${session.tab.url}`);
      lines.push(`- **Closed:** ${time}`);
      lines.push("");
    } else if (session.window) {
      lines.push(`## Window (${session.window.tabCount} tabs)`);
      lines.push(`- **Session ID:** \`${session.window.sessionId}\``);
      lines.push(`- **Closed:** ${time}`);
      lines.push("- **Tabs:**");
      for (const tab of session.window.tabs.slice(0, 5)) {
        lines.push(`  - ${tab.title || "(no title)"}: ${tab.url}`);
      }
      if (session.window.tabs.length > 5) {
        lines.push(`  - ... and ${session.window.tabs.length - 5} more tabs`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function formatDevicesMarkdown(devices: DeviceSession[]): string {
  if (devices.length === 0) {
    return `# Synced Devices

No synced devices found.

**Note:** Chrome Sync must be enabled to see tabs from other devices.
Sign in to Chrome and enable Sync in Settings > You and Google > Sync.`;
  }

  const lines: string[] = [
    `# Synced Devices (${devices.length})`,
    "",
    "Tabs open on your other Chrome instances.",
    ""
  ];

  for (const device of devices) {
    const lastSeen = formatTimestamp(device.lastModifiedTime);
    lines.push(`## ${device.deviceName}`);
    lines.push(`Last active: ${lastSeen}`);
    lines.push("");

    if (device.sessions.length === 0) {
      lines.push("No open tabs on this device.");
      lines.push("");
      continue;
    }

    for (const session of device.sessions) {
      if (session.tab) {
        lines.push(`- ${session.tab.title || "(no title)"}`);
        lines.push(`  URL: ${session.tab.url}`);
      } else if (session.window) {
        lines.push(`- Window with ${session.window.tabCount} tabs:`);
        for (const tab of session.window.tabs.slice(0, 3)) {
          lines.push(`  - ${tab.title || "(no title)"}`);
        }
        if (session.window.tabs.length > 3) {
          lines.push(`  - ... and ${session.window.tabs.length - 3} more`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// =====================================
// Tool Registration
// =====================================

/**
 * Register Chrome Sessions tools with the MCP server
 */
export function registerSessionTools(server: McpServer): void {
  // Recently closed tabs/windows
  server.tool(
    "tabz_sessions_recently_closed",
    `List recently closed tabs and windows (up to 25). Returns sessionIds for use with tabz_sessions_restore. Use tabz_docs for detailed docs.`,
    RecentlyClosedSchema.shape,
    async (params: RecentlyClosedInput) => {
      try {
        const result = await getRecentlyClosed(params.maxResults);

        if (!result.success || result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error || 'Unknown error'}` }],
            isError: true
          };
        }

        const sessions = result.sessions || [];
        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            total: sessions.length,
            sessions
          }, null, 2);
        } else {
          resultText = formatRecentlyClosedMarkdown(sessions);
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

  // Restore closed session
  server.tool(
    "tabz_sessions_restore",
    `Restore a recently closed tab or window. Omit sessionId to restore the most recent. Get IDs from tabz_sessions_recently_closed. Use tabz_docs for detailed docs.`,
    RestoreSessionSchema.shape,
    async (params: RestoreSessionInput) => {
      try {
        const result = await restoreSession(params.sessionId);

        if (!result.success || result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error || 'Failed to restore session'}` }],
            isError: true
          };
        }

        let description: string;
        if (result.session?.tab) {
          description = `Restored tab: ${result.session.tab.title || result.session.tab.url}`;
        } else if (result.session?.window) {
          description = `Restored window with ${result.session.window.tabCount} tabs`;
        } else {
          description = "Session restored successfully";
        }

        const resultText = `## Session Restored

${description}

The tab/window is now open and active.`;

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

  // Synced devices
  server.tool(
    "tabz_sessions_devices",
    `List tabs open on other synced Chrome devices. Requires Chrome Sync enabled. Open found tabs with tabz_open_url. Use tabz_docs for detailed docs.`,
    DevicesSchema.shape,
    async (params: DevicesInput) => {
      try {
        const result = await getDevices(params.maxResults);

        if (!result.success || result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error || 'Unknown error'}` }],
            isError: true
          };
        }

        const devices = result.devices || [];
        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            total: devices.length,
            devices
          }, null, 2);
        } else {
          resultText = formatDevicesMarkdown(devices);
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
}
