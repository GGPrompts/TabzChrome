/**
 * Tab Management Tools
 *
 * Tools for listing and switching between browser tabs
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import {
  BACKEND_URL,
  getCurrentTabId,
  setCurrentTabId,
  getCustomTabName,
  setCustomTabName,
  type TabInfo
} from "../shared.js";
import { ResponseFormat } from "../types.js";
import { mutationFailureStatus, readFailureStatus, structuredToolResult } from "./result-contract.js";
import { docsPointer, TAB_ID_DESC, GROUP_RULE_SUMMARY } from "../descriptions.js";

// Input schema for tabz_list_tabs
const ListTabsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type ListTabsInput = z.infer<typeof ListTabsSchema>;

// Input schema for tabz_switch_tab
const SwitchTabSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
}).strict();

type SwitchTabInput = z.infer<typeof SwitchTabSchema>;

// Input schema for tabz_rename_tab
const RenameTabSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
    .describe(TAB_ID_DESC),
  name: z.string()
    .describe("The name to assign; an empty string clears it.")
}).strict();

type RenameTabInput = z.infer<typeof RenameTabSchema>;

const CloseTabSchema = z.object({
  tabIds: z.array(z.number().int().min(1)).min(1).optional(),
  groupId: z.number().int().min(0).optional()
    .describe("Close a whole group instead of naming tabIds.")
}).strict();

type CloseTabInput = z.infer<typeof CloseTabSchema>;

interface CloseTabResult {
  success: boolean;
  closed?: number[];
  refused?: Array<{ tabId: number; reason: string }>;
  missing?: number[];
  groupId?: number | null;
  error?: string;
  transportError?: boolean;
}

async function closeTabs(params: CloseTabInput): Promise<CloseTabResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/close-tab`, {
      tabIds: params.tabIds,
      groupId: params.groupId
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    return { success: false, transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatCloseTabResult(result: CloseTabResult): string {
  if (!result.success) return `## Close Tab Failed\n\n**Error:** ${result.error}`;
  const lines = ["## Tabs Closed", ""];
  const closed = result.closed ?? [];
  lines.push(closed.length ? `**Closed:** ${closed.join(", ")}` : "**Closed:** none");
  if (result.refused?.length) {
    lines.push("", "**Refused** (outside this connection's group):");
    for (const item of result.refused) lines.push(`- ${item.tabId}: ${item.reason}`);
  }
  if (result.missing?.length) lines.push("", `**Not found:** ${result.missing.join(", ")}`);
  return lines.join("\n");
}

/**
 * List all open browser tabs via Extension API
 */
async function listTabs(): Promise<{ tabs: TabInfo[]; error?: string; transportError?: boolean }> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/tabs`, { timeout: 5000 });
    if (response.data.success && response.data.tabs) {
      const tabs: TabInfo[] = response.data.tabs.map((tab: any) => ({
        tabId: tab.tabId,
        url: tab.url,
        title: tab.title,
        customName: getCustomTabName(tab.url, tab.tabId),
        active: tab.active,
        inClaudeGroup: tab.inClaudeGroup === true
      }));

      // Update currentTabId to the actually active tab
      const activeTab = tabs.find(t => t.active);
      if (activeTab) {
        setCurrentTabId(activeTab.tabId);
      }

      return { tabs };
    }
    return { tabs: [], error: response.data.error || 'Failed to list tabs' };
  } catch (error) {
    return { tabs: [], transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Switch to a specific tab via Extension API
 */
async function switchTab(tabId: number): Promise<{ success: boolean; error?: string; transportError?: boolean }> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/switch-tab`, { tabId }, { timeout: 5000 });
    if (response.data.success) {
      setCurrentTabId(tabId);
      return { success: true };
    }
    return { success: false, error: response.data.error || 'Failed to switch tab' };
  } catch (error) {
    return { success: false, transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Rename a tab (assign a custom name)
 */
async function renameTab(tabId: number, name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const validation = await axios.get(`${BACKEND_URL}/api/browser/page-info`, {
      params: { tabId },
      timeout: 5000
    });
    if (validation.data.error) return { success: false, error: validation.data.error };

    // Get the tab list to find the URL for this tabId
    const tabsResult = await listTabs();
    const tab = tabsResult.tabs.find(t => t.tabId === tabId);

    if (!tab) {
      const availableIds = tabsResult.tabs.map(t => t.tabId);
      const idsStr = availableIds.length > 0
        ? `Available tab IDs: ${availableIds.join(', ')}`
        : 'No tabs found';
      return { success: false, error: `Invalid tab ID: ${tabId}. ${idsStr}` };
    }

    setCustomTabName(tab.url, name, tabId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Register tab management tools with the MCP server
 */
export function registerTabTools(server: McpServer): void {
  // List tabs tool
  registerTabzTool(server,
    "tabz_list_tabs",
    "List tabs. " + GROUP_RULE_SUMMARY,
    ListTabsSchema,
    async (params: ListTabsInput) => {
      try {
        const result = await listTabs();

        if (result.error) {
          const text = `Error: ${result.error}`;
          return structuredToolResult(text, readFailureStatus(result.error, result.transportError === true), {
            total: 0,
            claudeCurrentTabId: getCurrentTabId() || null,
            tabs: [],
            error: result.error
          }, true);
        }

        // Get Claude's current target tab
        const claudeCurrentTab = getCurrentTabId();

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            total: result.tabs.length,
            claudeCurrentTabId: claudeCurrentTab,
            tabs: result.tabs
          }, null, 2);
        } else {
          if (result.tabs.length === 0) {
            resultText = `# Browser Tabs

No web pages currently open.
Only chrome:// or extension pages are present.`;
          } else {
            const lines: string[] = [`# Browser Tabs (${result.tabs.length} open)`, ""];

            // Find the user's actual focused tab (from Chrome extension API)
            const userActiveTab = result.tabs.find(t => t.active);
            if (userActiveTab) {
              lines.push(`**User's focused tab:** ${userActiveTab.tabId} (${userActiveTab.customName || userActiveTab.title})`, "");
            }

            for (const tab of result.tabs) {
              const displayName = tab.customName || tab.title || "(no title)";

              // Show marker for user's ACTUAL focused tab (from Chrome extension)
              const marker = tab.active ? " ← ACTIVE" : "";
              lines.push(`## Tab ${tab.tabId}${marker}`);
              lines.push(`**Title:** ${displayName}`);
              if (tab.customName) {
                lines.push(`**Original Title:** ${tab.title || "(no title)"}`);
              }
              lines.push(`**URL:** ${tab.url}`);
              lines.push("");
            }
            lines.push("---");
            lines.push("- Use `tabz_switch_tab` with tabId (1-based) to switch tabs.");
            lines.push("- Use `tabz_rename_tab` to assign custom names for easy identification.");
            lines.push("- **Tip:** Rename tabs before switching to avoid confusion if tab order changes.");
            resultText = lines.join("\n");
          }
        }

        return structuredToolResult(resultText, "found", {
          total: result.tabs.length,
          claudeCurrentTabId: claudeCurrentTab || null,
          tabs: result.tabs
        }, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return structuredToolResult(`Error: ${message}`, "transport_error", {
          total: 0,
          claudeCurrentTabId: getCurrentTabId() || null,
          tabs: [],
          error: message
        }, true);
      }
    }
  );

  // Switch tab tool
  registerTabzTool(server,
    "tabz_switch_tab",
    "Switch to a tab by ID, making it the default target for later page tools.",
    SwitchTabSchema,
    async (params: SwitchTabInput) => {
      try {
        const result = await switchTab(params.tabId);

        let resultText: string;
        if (result.success) {
          resultText = `## Tab Switched

Successfully switched to tab ${params.tabId}. This tab is now Claude's current target.

All subsequent operations (screenshot, click, fill, etc.) will target this tab by default.

Use \`tabz_get_page_info\` to see the current page details, or \`tabz_list_tabs\` to see all tabs with the "← CURRENT" marker.`;
        } else {
          resultText = `## Tab Switch Failed

**Error:** ${result.error}

Use \`tabz_list_tabs\` to see available tab IDs and which one is currently targeted.`;
        }

        const status = result.success ? "switched" : mutationFailureStatus(result.error, result.transportError === true);
        return structuredToolResult(resultText, status, {
          switched: result.success ? true : status === "unknown" ? null : false,
          tabId: params.tabId,
          ...(result.error ? { error: result.error } : {})
        }, !result.success);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return structuredToolResult(`Error: ${message}`, "unknown", {
          switched: null,
          tabId: params.tabId,
          error: message
        }, true);
      }
    }
  );

  registerTabzTool(server,
    "tabz_close_tab",
    "Close owned tabs by ID, or close this connection's whole group. Tabs and groups outside this connection are refused. " + docsPointer("tabz_close_tab"),
    CloseTabSchema,
    async (params: CloseTabInput) => {
      if (!params.tabIds && params.groupId === undefined) {
        return structuredToolResult("Error: pass tabIds or groupId", "refused", {
          closed: [], refused: [], missing: [], groupId: null, error: "pass tabIds or groupId"
        }, true);
      }
      const result = await closeTabs(params);
      const closed = result.closed ?? [];
      const refused = result.refused ?? [];
      const missing = result.missing ?? [];
      if (closed.includes(getCurrentTabId())) setCurrentTabId(0);
      const status = !result.success
        ? mutationFailureStatus(result.error, result.transportError === true)
        : refused.length > 0 && closed.length === 0 && missing.length === 0
          ? "refused"
          : missing.length > 0 && closed.length === 0 && refused.length === 0
            ? "not_found"
            : refused.length > 0 || missing.length > 0
              ? "partial"
              : "closed";
      return structuredToolResult(formatCloseTabResult(result), status, {
        closed: status === "unknown" ? null : closed,
        refused,
        missing,
        groupId: result.groupId ?? params.groupId ?? null,
        ...(result.error ? { error: result.error } : {})
      }, status !== "closed");
    }
  );

  // Rename tab tool
  registerTabzTool(server,
    "tabz_rename_tab",
    "Give a tab a custom name for this session, keyed by tab ID; an empty name clears it.",
    RenameTabSchema,
    async (params: RenameTabInput) => {
      try {
        const result = await renameTab(params.tabId, params.name);

        let resultText: string;
        if (result.success) {
          if (params.name.trim() === '') {
            resultText = `## Tab Name Cleared

Successfully cleared custom name for tab ${params.tabId}.

Use \`tabz_list_tabs\` to see the updated tab list.`;
          } else {
            resultText = `## Tab Renamed

Successfully renamed tab ${params.tabId} to "${params.name}".

Use \`tabz_list_tabs\` to see the updated tab list.`;
          }
        } else {
          resultText = `## Tab Rename Failed

**Error:** ${result.error}

Use \`tabz_list_tabs\` to see available tab IDs.`;
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
