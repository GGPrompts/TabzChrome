/**
 * Tab Management Tools
 *
 * Tools for listing and switching between browser tabs
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTabs, switchTab, renameTab, getCurrentTabId } from "../client.js";
import { ResponseFormat } from "../types.js";

// Input schema for browser_list_tabs
const ListTabsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ListTabsInput = z.infer<typeof ListTabsSchema>;

// Input schema for browser_switch_tab
const SwitchTabSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
    .describe("The tab ID to switch to (1-based). Get available IDs from browser_list_tabs.")
}).strict();

type SwitchTabInput = z.infer<typeof SwitchTabSchema>;

// Input schema for browser_rename_tab
const RenameTabSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
    .describe("The tab ID to rename (1-based). Get available IDs from browser_list_tabs."),
  name: z.string()
    .describe("The custom name to assign to this tab. Empty string clears the custom name.")
}).strict();

type RenameTabInput = z.infer<typeof RenameTabSchema>;

/**
 * Register tab management tools with the MCP server
 */
export function registerTabTools(server: McpServer): void {
  // List tabs tool
  server.tool(
    "browser_list_tabs",
    `List all open browser tabs.

Returns information about all non-chrome:// tabs currently open in the browser.
Use this to discover available tabs before switching or targeting specific tabs.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns:
  Array of tabs with:
  - tabId: Numeric ID (1-based) for use with other tools
  - url: Full URL of the tab
  - title: Page title
  - customName: User-assigned name (if set)
  - claudeCurrentTabId: Which tab Claude is currently targeting (for screenshots, clicks, etc.)

The output shows which tab Claude is currently targeting with "← CURRENT" marker.
This helps verify which tab operations will affect.

Examples:
  - List all tabs: (no args needed)
  - Get JSON format: response_format="json"

Use browser_switch_tab with the tabId to switch to a specific tab.
Tab IDs start at 1 (not 0) for clarity.

IMPORTANT: Tab IDs can shift if tabs are closed! Use browser_rename_tab to assign
stable custom names before working with multiple tabs.

Error Handling:
  - "CDP not available": Chrome not running with --remote-debugging-port=9222
  - Empty list: No web pages open (only chrome:// pages)`,
    ListTabsSchema.shape,
    async (params: ListTabsInput) => {
      try {
        const result = await listTabs();

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
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
            lines.push(`**Claude's current target:** Tab ${claudeCurrentTab}`, "");

            for (const tab of result.tabs) {
              const displayName = tab.customName || tab.title || "(no title)";
              const isClaudeTarget = tab.tabId === claudeCurrentTab;

              // Show marker for Claude's current target tab
              const marker = isClaudeTarget ? " ← CURRENT" : "";
              lines.push(`## Tab ${tab.tabId}${marker}`);
              lines.push(`**Title:** ${displayName}`);
              if (tab.customName) {
                lines.push(`**Original Title:** ${tab.title || "(no title)"}`);
              }
              lines.push(`**URL:** ${tab.url}`);
              lines.push("");
            }
            lines.push("---");
            lines.push("- Use `browser_switch_tab` with tabId (1-based) to switch tabs.");
            lines.push("- Use `browser_rename_tab` to assign custom names for easy identification.");
            lines.push("- **Tip:** Rename tabs before switching to avoid confusion if tab order changes.");
            resultText = lines.join("\n");
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

  // Switch tab tool
  server.tool(
    "browser_switch_tab",
    `Switch to a specific browser tab.

Brings the specified tab to the front/focus and sets it as Claude's current target
for subsequent operations (screenshots, clicks, fills, etc.).

Use browser_list_tabs first to get available tab IDs. The "← CURRENT" marker shows
which tab Claude is currently targeting.

Args:
  - tabId (required): The numeric tab ID to switch to (1-based)

Returns:
  - success: Whether the switch was successful
  - error: Error message if failed

Examples:
  - Switch to first tab: tabId=1
  - Switch to third tab: tabId=3

After switching, use browser_get_page_info to confirm the current page.

BEST PRACTICE: Before switching between multiple tabs, use browser_rename_tab to
assign custom names (e.g., "GitHub PR", "Dev Server", "Docs"). Custom names are
stored by URL and won't be affected if tab order changes.

Error Handling:
  - "Invalid tab ID": tabId doesn't exist (use browser_list_tabs to see valid IDs)
  - "CDP not available": Chrome not running with --remote-debugging-port=9222`,
    SwitchTabSchema.shape,
    async (params: SwitchTabInput) => {
      try {
        const result = await switchTab(params.tabId);

        let resultText: string;
        if (result.success) {
          resultText = `## Tab Switched

Successfully switched to tab ${params.tabId}. This tab is now Claude's current target.

All subsequent operations (screenshot, click, fill, etc.) will target this tab by default.

Use \`browser_get_page_info\` to see the current page details, or \`browser_list_tabs\` to see all tabs with the "← CURRENT" marker.`;
        } else {
          resultText = `## Tab Switch Failed

**Error:** ${result.error}

Use \`browser_list_tabs\` to see available tab IDs and which one is currently targeted.`;
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

  // Rename tab tool
  server.tool(
    "browser_rename_tab",
    `Assign a custom name to a browser tab.

Custom names make it easier to identify tabs when working with multiple pages.
Names are stored by URL, so they persist even if tab order changes.
Names are session-based and reset when the MCP server restarts.

RECOMMENDED: When working with multiple tabs, rename them first! This provides:
1. Stable identification even if tabs are opened/closed (names stay with URLs)
2. Clear visual feedback about which tab you're targeting
3. Better communication with the user about which tab you're working on

Args:
  - tabId (required): The tab ID to rename (1-based, from browser_list_tabs)
  - name (required): Custom name for the tab. Empty string clears the custom name.

Returns:
  - success: Whether the rename was successful
  - error: Error message if failed

Examples:
  - Name a tab: tabId=1, name="GitHub PR"
  - Name dev server: tabId=2, name="Dev Server (localhost:3000)"
  - Name AI tool: tabId=3, name="ChatGPT"
  - Clear custom name: tabId=1, name=""

After renaming, use browser_list_tabs to see the updated names.

Error Handling:
  - "Invalid tab ID": tabId doesn't exist
  - "CDP not available": Chrome not running with --remote-debugging-port=9222`,
    RenameTabSchema.shape,
    async (params: RenameTabInput) => {
      try {
        const result = await renameTab(params.tabId, params.name);

        let resultText: string;
        if (result.success) {
          if (params.name.trim() === '') {
            resultText = `## Tab Name Cleared

Successfully cleared custom name for tab ${params.tabId}.

Use \`browser_list_tabs\` to see the updated tab list.`;
          } else {
            resultText = `## Tab Renamed

Successfully renamed tab ${params.tabId} to "${params.name}".

Use \`browser_list_tabs\` to see the updated tab list.`;
          }
        } else {
          resultText = `## Tab Rename Failed

**Error:** ${result.error}

Use \`browser_list_tabs\` to see available tab IDs.`;
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
