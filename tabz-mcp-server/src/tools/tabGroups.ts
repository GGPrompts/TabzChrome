/**
 * Tab Groups Tools
 *
 * MCP tools for managing Chrome tab groups - list, create, update, and organize tabs into groups.
 * Includes auto-grouping feature to highlight tabs that Claude is actively working with.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import {
  BACKEND_URL,
  handleApiError,
  type TabGroupColor,
  type TabGroupInfo,
  type ListTabGroupsResult,
  type TabGroupResult,
  type UngroupResult,
  type ClaudeGroupStatus
} from "../shared.js";
import { ResponseFormat } from "../types.js";

/**
 * List all tab groups via Extension API
 */
async function listTabGroups(): Promise<ListTabGroupsResult> {
  try {
    const response = await axios.get<ListTabGroupsResult>(
      `${BACKEND_URL}/api/browser/tab-groups`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, groups: [], claudeActiveGroupId: null, error: handleApiError(error, "Failed to list groups").message };
  }
}

/**
 * Create a new tab group via Extension API
 */
async function createTabGroup(options: {
  tabIds: number[];
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/create`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create group").message };
  }
}

/**
 * Update a tab group via Extension API
 */
async function updateTabGroup(options: {
  groupId: number;
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/update`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to update group").message };
  }
}

/**
 * Add tabs to an existing group via Extension API
 */
async function addToTabGroup(options: {
  groupId: number;
  tabIds: number[];
}): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/add`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to add to group").message };
  }
}

/**
 * Remove tabs from their groups via Extension API
 */
async function ungroupTabs(tabIds: number[]): Promise<UngroupResult> {
  try {
    const response = await axios.post<UngroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/ungroup`,
      { tabIds },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to ungroup tabs").message };
  }
}

/**
 * Add a tab to the Claude Active group via Extension API
 */
async function addToClaudeGroup(tabId: number): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/claude/add`,
      { tabId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to add to Claude group").message };
  }
}

/**
 * Remove a tab from the Claude Active group via Extension API
 */
async function removeFromClaudeGroup(tabId: number): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; message?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/tab-groups/claude/remove`,
      { tabId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to remove from Claude group").message };
  }
}

/**
 * Get status of the Claude Active group via Extension API
 */
async function getClaudeGroupStatus(): Promise<ClaudeGroupStatus> {
  try {
    const response = await axios.get<ClaudeGroupStatus>(
      `${BACKEND_URL}/api/browser/tab-groups/claude/status`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      exists: false,
      groupId: null,
      tabCount: 0,
      error: handleApiError(error, "Failed to get Claude group status").message
    };
  }
}

// Valid tab group colors
const TabGroupColorSchema = z.enum(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan']);

// Input schema for tabz_list_groups
const ListGroupsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ListGroupsInput = z.infer<typeof ListGroupsSchema>;

// Input schema for tabz_create_group
const CreateGroupSchema = z.object({
  tabIds: z.array(z.number().int().min(1))
    .min(1)
    .describe("Array of Chrome tab IDs to group together. Get IDs from tabz_list_tabs."),
  title: z.string()
    .max(50)
    .optional()
    .describe("Optional title for the group (displayed in tab bar)"),
  color: TabGroupColorSchema
    .optional()
    .describe("Optional color: grey, blue, red, yellow, green, pink, purple, or cyan"),
  collapsed: z.boolean()
    .optional()
    .describe("Whether the group should be collapsed (default: false)")
}).strict();

type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

// Input schema for tabz_update_group
const UpdateGroupSchema = z.object({
  groupId: z.number()
    .int()
    .min(0)
    .describe("The tab group ID to update. Get IDs from tabz_list_groups."),
  title: z.string()
    .max(50)
    .optional()
    .describe("New title for the group"),
  color: TabGroupColorSchema
    .optional()
    .describe("New color: grey, blue, red, yellow, green, pink, purple, or cyan"),
  collapsed: z.boolean()
    .optional()
    .describe("Whether the group should be collapsed")
}).strict();

type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

// Input schema for tabz_add_to_group
const AddToGroupSchema = z.object({
  groupId: z.number()
    .int()
    .min(0)
    .describe("The tab group ID to add tabs to. Get IDs from tabz_list_groups."),
  tabIds: z.array(z.number().int().min(1))
    .min(1)
    .describe("Array of Chrome tab IDs to add to the group. Get IDs from tabz_list_tabs.")
}).strict();

type AddToGroupInput = z.infer<typeof AddToGroupSchema>;

// Input schema for tabz_ungroup_tabs
const UngroupTabsSchema = z.object({
  tabIds: z.array(z.number().int().min(1))
    .min(1)
    .describe("Array of Chrome tab IDs to remove from their groups. Get IDs from tabz_list_tabs.")
}).strict();

type UngroupTabsInput = z.infer<typeof UngroupTabsSchema>;

// Input schema for tabz_claude_group_add
const ClaudeGroupAddSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
    .describe("Chrome tab ID to add to the Claude Active group. Get IDs from tabz_list_tabs.")
}).strict();

type ClaudeGroupAddInput = z.infer<typeof ClaudeGroupAddSchema>;

// Input schema for tabz_claude_group_remove
const ClaudeGroupRemoveSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
    .describe("Chrome tab ID to remove from the Claude Active group.")
}).strict();

type ClaudeGroupRemoveInput = z.infer<typeof ClaudeGroupRemoveSchema>;

// Input schema for tabz_claude_group_status
const ClaudeGroupStatusSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ClaudeGroupStatusInput = z.infer<typeof ClaudeGroupStatusSchema>;

/**
 * Register tab group management tools with the MCP server
 */
export function registerTabGroupTools(server: McpServer): void {
  // List tab groups tool
  server.tool(
    "tabz_list_groups",
    `List all tab groups in the current browser window.

Returns information about all tab groups including their title, color, collapsed state,
and which tabs belong to each group.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "groups": [
      {
        "groupId": 12345,
        "title": "Research",
        "color": "blue",
        "collapsed": false,
        "tabCount": 3,
        "tabIds": [123, 456, 789]
      }
    ],
    "claudeActiveGroupId": 67890  // ID of the Claude Active group, or null
  }

Use tabz_create_group to create new groups.
Use tabz_update_group to change a group's title, color, or collapsed state.

Error Handling:
  - Returns empty list if no groups exist
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running`,
    ListGroupsSchema.shape,
    async (params: ListGroupsInput) => {
      try {
        const result = await listTabGroups();

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            groups: result.groups,
            claudeActiveGroupId: result.claudeActiveGroupId
          }, null, 2);
        } else {
          if (result.groups.length === 0) {
            resultText = `# Tab Groups

No tab groups currently exist.

Use \`tabz_create_group\` to create a group from existing tabs.`;
          } else {
            const lines: string[] = [`# Tab Groups (${result.groups.length})`, ""];

            if (result.claudeActiveGroupId) {
              lines.push(`**Claude Active Group ID:** ${result.claudeActiveGroupId}`, "");
            }

            for (const group of result.groups) {
              const collapsedMarker = group.collapsed ? " (collapsed)" : "";
              lines.push(`## ${group.title || "(untitled)"} [${group.color}]${collapsedMarker}`);
              lines.push(`- **Group ID:** ${group.groupId}`);
              lines.push(`- **Tabs:** ${group.tabCount} (IDs: ${group.tabIds.join(", ")})`);
              lines.push("");
            }

            lines.push("---");
            lines.push("- Use `tabz_update_group` to change title, color, or collapsed state");
            lines.push("- Use `tabz_add_to_group` to add more tabs to a group");
            lines.push("- Use `tabz_ungroup_tabs` to remove tabs from groups");
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

  // Create tab group tool
  server.tool(
    "tabz_create_group",
    `Create a new tab group from specified tabs.

Groups tabs together with an optional title and color. Grouped tabs are visually
connected in Chrome's tab bar and can be collapsed to save space.

Args:
  - tabIds (required): Array of Chrome tab IDs to group together
  - title (optional): Title displayed on the group (max 50 chars)
  - color (optional): grey, blue, red, yellow, green, pink, purple, or cyan
  - collapsed (optional): Whether to collapse the group initially

Returns:
  - groupId: The new group's ID (use with tabz_update_group, tabz_add_to_group)
  - title, color, tabCount

Examples:
  - Create a "Research" group: tabIds=[123, 456], title="Research", color="blue"
  - Quick group without title: tabIds=[123, 456]

Error Handling:
  - "At least one tabId is required": Provide at least one tab ID
  - Invalid tab ID: Ensure tabs exist (use tabz_list_tabs to verify)`,
    CreateGroupSchema.shape,
    async (params: CreateGroupInput) => {
      try {
        const result = await createTabGroup({
          tabIds: params.tabIds,
          title: params.title,
          color: params.color as TabGroupColor | undefined,
          collapsed: params.collapsed
        });

        let resultText: string;
        if (result.success && result.group) {
          resultText = `## Tab Group Created

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Color:** ${result.group.color}
**Tabs:** ${result.group.tabCount}

Use \`tabz_add_to_group\` to add more tabs, or \`tabz_update_group\` to modify.`;
        } else {
          resultText = `## Failed to Create Group

**Error:** ${result.error}

Use \`tabz_list_tabs\` to get valid tab IDs.`;
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

  // Update tab group tool
  server.tool(
    "tabz_update_group",
    `Update an existing tab group's properties.

Change a group's title, color, or collapsed state. Get group IDs from tabz_list_groups.

Args:
  - groupId (required): The tab group ID to update
  - title (optional): New title for the group
  - color (optional): New color: grey, blue, red, yellow, green, pink, purple, or cyan
  - collapsed (optional): true to collapse, false to expand

Examples:
  - Change color: groupId=12345, color="purple"
  - Rename and collapse: groupId=12345, title="Done", collapsed=true

Error Handling:
  - "No update properties provided": Must provide at least title, color, or collapsed
  - Invalid group ID: Use tabz_list_groups to get valid IDs`,
    UpdateGroupSchema.shape,
    async (params: UpdateGroupInput) => {
      try {
        const result = await updateTabGroup({
          groupId: params.groupId,
          title: params.title,
          color: params.color as TabGroupColor | undefined,
          collapsed: params.collapsed
        });

        let resultText: string;
        if (result.success && result.group) {
          resultText = `## Tab Group Updated

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Color:** ${result.group.color}
**Collapsed:** ${result.group.collapsed}`;
        } else {
          resultText = `## Failed to Update Group

**Error:** ${result.error}

Use \`tabz_list_groups\` to get valid group IDs.`;
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

  // Add to group tool
  server.tool(
    "tabz_add_to_group",
    `Add tabs to an existing tab group.

Moves specified tabs into an existing group. Get group IDs from tabz_list_groups
and tab IDs from tabz_list_tabs.

Args:
  - groupId (required): The tab group ID to add tabs to
  - tabIds (required): Array of Chrome tab IDs to add to the group

Examples:
  - Add one tab: groupId=12345, tabIds=[789]
  - Add multiple tabs: groupId=12345, tabIds=[789, 101112]

Error Handling:
  - Invalid group ID: Use tabz_list_groups to get valid IDs
  - Invalid tab IDs: Use tabz_list_tabs to get valid tab IDs`,
    AddToGroupSchema.shape,
    async (params: AddToGroupInput) => {
      try {
        const result = await addToTabGroup({
          groupId: params.groupId,
          tabIds: params.tabIds
        });

        let resultText: string;
        if (result.success && result.group) {
          resultText = `## Tabs Added to Group

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Total Tabs:** ${result.group.tabCount}`;
        } else {
          resultText = `## Failed to Add Tabs

**Error:** ${result.error}

Use \`tabz_list_groups\` to verify the group exists.`;
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

  // Ungroup tabs tool
  server.tool(
    "tabz_ungroup_tabs",
    `Remove tabs from their groups (ungroup them).

Specified tabs are removed from whatever groups they're in. Empty groups are
automatically deleted by Chrome.

Args:
  - tabIds (required): Array of Chrome tab IDs to remove from their groups

Examples:
  - Ungroup one tab: tabIds=[123]
  - Ungroup multiple tabs: tabIds=[123, 456, 789]

Error Handling:
  - Invalid tab IDs: Use tabz_list_tabs to get valid tab IDs
  - Tabs not in groups: No error, operation just has no effect`,
    UngroupTabsSchema.shape,
    async (params: UngroupTabsInput) => {
      try {
        const result = await ungroupTabs(params.tabIds);

        let resultText: string;
        if (result.success) {
          resultText = `## Tabs Ungrouped

Successfully removed ${result.ungroupedCount || params.tabIds.length} tabs from their groups.

Note: Empty groups are automatically deleted by Chrome.`;
        } else {
          resultText = `## Failed to Ungroup Tabs

**Error:** ${result.error}`;
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

  // Claude group add tool
  server.tool(
    "tabz_claude_group_add",
    `Add a tab to the "Claude Active" group.

Automatically creates a purple "Claude" group if it doesn't exist, then adds
the specified tab to it. Use this to visually highlight tabs you're working with.

Args:
  - tabId (required): Chrome tab ID to add to the Claude group

The Claude Active group has a distinctive purple color and "Claude" title,
making it easy to see which tabs are being worked on.

Examples:
  - Mark a tab as active: tabId=123456789

Use tabz_claude_group_remove when done with a tab.
Use tabz_claude_group_status to see all tabs in the Claude group.`,
    ClaudeGroupAddSchema.shape,
    async (params: ClaudeGroupAddInput) => {
      try {
        const result = await addToClaudeGroup(params.tabId);

        let resultText: string;
        if (result.success && result.group) {
          resultText = `## Tab Added to Claude Group

Tab ${params.tabId} is now in the Claude Active group.

**Group:** ${result.group.title} [${result.group.color}]
**Total Tabs:** ${result.group.tabCount}

The tab is now visually highlighted in Chrome's tab bar.`;
        } else {
          resultText = `## Failed to Add Tab to Claude Group

**Error:** ${result.error}`;
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

  // Claude group remove tool
  server.tool(
    "tabz_claude_group_remove",
    `Remove a tab from the "Claude Active" group.

Ungroups the specified tab from the Claude group. If this was the last tab
in the group, the group is automatically deleted.

Args:
  - tabId (required): Chrome tab ID to remove from the Claude group

Examples:
  - Unmark a tab: tabId=123456789`,
    ClaudeGroupRemoveSchema.shape,
    async (params: ClaudeGroupRemoveInput) => {
      try {
        const result = await removeFromClaudeGroup(params.tabId);

        let resultText: string;
        if (result.success) {
          resultText = `## Tab Removed from Claude Group

Tab ${params.tabId} has been removed from the Claude Active group.

${result.message || ""}`;
        } else {
          resultText = `## Failed to Remove Tab from Claude Group

**Error:** ${result.error}`;
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

  // Claude group status tool
  server.tool(
    "tabz_claude_group_status",
    `Get the status of the "Claude Active" group.

Shows whether the Claude group exists and which tabs are in it.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns:
  - exists: Whether the Claude group exists
  - groupId: The group ID (if exists)
  - tabCount: Number of tabs in the group
  - tabIds: Array of tab IDs in the group`,
    ClaudeGroupStatusSchema.shape,
    async (params: ClaudeGroupStatusInput) => {
      try {
        const result = await getClaudeGroupStatus();

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            exists: result.exists,
            groupId: result.groupId,
            group: result.group,
            tabCount: result.tabCount,
            tabIds: result.tabIds
          }, null, 2);
        } else {
          if (!result.exists) {
            resultText = `# Claude Active Group

**Status:** Not created

No tabs are currently marked as "Claude Active".
Use \`tabz_claude_group_add\` to add a tab.`;
          } else {
            resultText = `# Claude Active Group

**Status:** Active
**Group ID:** ${result.groupId}
**Color:** ${result.group?.color || "purple"}
**Tabs:** ${result.tabCount}

**Tab IDs:** ${result.tabIds?.join(", ") || "none"}

Use \`tabz_claude_group_add\` to add more tabs.
Use \`tabz_claude_group_remove\` to remove tabs.`;
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
}
