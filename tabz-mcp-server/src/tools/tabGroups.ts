/**
 * Tab Groups Tools
 *
 * MCP tools for managing Chrome tab groups - list, create, update, and organize tabs into groups.
 * Includes auto-grouping feature to highlight tabs that Claude is actively working with.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
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
import { readFailureStatus, structuredToolResult } from "./result-contract.js";
import { docsPointer } from "../descriptions.js";

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
      `${BACKEND_URL}/api/browser/tab-groups`,
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
    const { groupId, ...updateProps } = options;
    const response = await axios.put<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/${groupId}`,
      updateProps,
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
    const { groupId, tabIds } = options;
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/${groupId}/tabs`,
      { tabIds },
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
      `${BACKEND_URL}/api/browser/ungroup-tabs`,
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
      `${BACKEND_URL}/api/browser/claude-group/add`,
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
      `${BACKEND_URL}/api/browser/claude-group/remove`,
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
async function getClaudeGroupStatus(): Promise<ClaudeGroupStatus & { transportError?: boolean }> {
  try {
    const response = await axios.get<ClaudeGroupStatus>(
      `${BACKEND_URL}/api/browser/claude-group/status`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      exists: false,
      groupId: null,
      tabCount: 0,
      transportError: true,
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
}).strict();

type ListGroupsInput = z.infer<typeof ListGroupsSchema>;

// Input schema for tabz_create_group
const CreateGroupSchema = z.object({
  tabIds: z.array(z.number().int().min(1))
    .min(1),
  title: z.string()
    .max(50)
    .optional(),
  color: TabGroupColorSchema
    .optional(),
  collapsed: z.boolean()
    .optional()
}).strict();

type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

// Input schema for tabz_update_group
const UpdateGroupSchema = z.object({
  groupId: z.number()
    .int()
    .min(0),
  title: z.string()
    .max(50)
    .optional(),
  color: TabGroupColorSchema
    .optional(),
  collapsed: z.boolean()
    .optional()
}).strict();

type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

// Input schema for tabz_add_to_group
const AddToGroupSchema = z.object({
  groupId: z.number()
    .int()
    .min(0),
  tabIds: z.array(z.number().int().min(1))
    .min(1)
}).strict();

type AddToGroupInput = z.infer<typeof AddToGroupSchema>;

// Input schema for tabz_ungroup_tabs
const UngroupTabsSchema = z.object({
  tabIds: z.array(z.number().int().min(1))
    .min(1)
}).strict();

type UngroupTabsInput = z.infer<typeof UngroupTabsSchema>;

// Input schema for tabz_claude_group_add
const ClaudeGroupAddSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
}).strict();

type ClaudeGroupAddInput = z.infer<typeof ClaudeGroupAddSchema>;

// Input schema for tabz_claude_group_remove
const ClaudeGroupRemoveSchema = z.object({
  tabId: z.number()
    .int()
    .min(1)
}).strict();

type ClaudeGroupRemoveInput = z.infer<typeof ClaudeGroupRemoveSchema>;

// Input schema for tabz_claude_group_status
const ClaudeGroupStatusSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type ClaudeGroupStatusInput = z.infer<typeof ClaudeGroupStatusSchema>;

/**
 * Register tab group management tools with the MCP server
 */
export function registerTabGroupTools(server: McpServer): void {
  // List tab groups tool
  registerTabzTool(server,
    "tabz_list_groups",
    "List every tab group with its title, colour, collapsed state, and member tab IDs.",
    ListGroupsSchema,
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
  registerTabzTool(server,
    "tabz_create_group",
    "Create a tab group from the named tabs.",
    CreateGroupSchema,
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
  registerTabzTool(server,
    "tabz_update_group",
    "Change a tab group's title, colour, or collapsed state.",
    UpdateGroupSchema,
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
  registerTabzTool(server,
    "tabz_add_to_group",
    "Add tabs to an existing tab group.",
    AddToGroupSchema,
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
  registerTabzTool(server,
    "tabz_ungroup_tabs",
    "Remove tabs from their groups; Chrome deletes a group that empties.",
    UngroupTabsSchema,
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
  registerTabzTool(server,
    "tabz_claude_group_add",
    "Add a tab to your own enforced group, creating the group with your label and colour if needed.",
    ClaudeGroupAddSchema,
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
  registerTabzTool(server,
    "tabz_claude_group_remove",
    "Remove a tab from your own enforced group.",
    ClaudeGroupRemoveSchema,
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
  registerTabzTool(server,
    "tabz_claude_group_status",
    "Get this connection's enforced tab group: exists, groupId, tabCount, tabIds. Call this first. Each connection has its own group; outside tabs are refused. Leave the user's tabs and other connections' groups alone. " + docsPointer("tabz_claude_group_status"),
    ClaudeGroupStatusSchema,
    async (params: ClaudeGroupStatusInput) => {
      try {
        const result = await getClaudeGroupStatus();

        if (!result.success) {
          const text = `Error: ${result.error}`;
          return structuredToolResult(text, readFailureStatus(result.error, result.transportError === true), {
            exists: false,
            groupId: null,
            group: null,
            tabCount: 0,
            tabIds: [],
            error: result.error
          }, true);
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

        return structuredToolResult(resultText, result.exists ? "active" : "not_created", {
          exists: result.exists,
          groupId: result.groupId,
          group: result.group ?? null,
          tabCount: result.tabCount,
          tabIds: result.tabIds ?? []
        }, false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return structuredToolResult(`Error: ${message}`, "transport_error", {
          exists: false,
          groupId: null,
          group: null,
          tabCount: 0,
          tabIds: [],
          error: message
        }, true);
      }
    }
  );
}
