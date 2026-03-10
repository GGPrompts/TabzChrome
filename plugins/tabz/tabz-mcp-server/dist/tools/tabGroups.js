/**
 * Tab Groups Tools
 *
 * MCP tools for managing Chrome tab groups - list, create, update, and organize tabs into groups.
 * Includes auto-grouping feature to highlight tabs that Claude is actively working with.
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat } from "../types.js";
/**
 * List all tab groups via Extension API
 */
async function listTabGroups() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/tab-groups`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, groups: [], claudeActiveGroupId: null, error: handleApiError(error, "Failed to list groups").message };
    }
}
/**
 * Create a new tab group via Extension API
 */
async function createTabGroup(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/tab-groups`, options, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to create group").message };
    }
}
/**
 * Update a tab group via Extension API
 */
async function updateTabGroup(options) {
    try {
        const { groupId, ...updateProps } = options;
        const response = await axios.put(`${BACKEND_URL}/api/browser/tab-groups/${groupId}`, updateProps, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to update group").message };
    }
}
/**
 * Add tabs to an existing group via Extension API
 */
async function addToTabGroup(options) {
    try {
        const { groupId, tabIds } = options;
        const response = await axios.post(`${BACKEND_URL}/api/browser/tab-groups/${groupId}/tabs`, { tabIds }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to add to group").message };
    }
}
/**
 * Remove tabs from their groups via Extension API
 */
async function ungroupTabs(tabIds) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/ungroup-tabs`, { tabIds }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to ungroup tabs").message };
    }
}
/**
 * Add a tab to the Claude Active group via Extension API
 */
async function addToClaudeGroup(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/claude-group/add`, { tabId }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to add to Claude group").message };
    }
}
/**
 * Remove a tab from the Claude Active group via Extension API
 */
async function removeFromClaudeGroup(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/claude-group/remove`, { tabId }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to remove from Claude group").message };
    }
}
/**
 * Get status of the Claude Active group via Extension API
 */
async function getClaudeGroupStatus() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/claude-group/status`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
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
// Input schema for tabz_ungroup_tabs
const UngroupTabsSchema = z.object({
    tabIds: z.array(z.number().int().min(1))
        .min(1)
        .describe("Array of Chrome tab IDs to remove from their groups. Get IDs from tabz_list_tabs.")
}).strict();
// Input schema for tabz_claude_group_add
const ClaudeGroupAddSchema = z.object({
    tabId: z.number()
        .int()
        .min(1)
        .describe("Chrome tab ID to add to the Claude Active group. Get IDs from tabz_list_tabs.")
}).strict();
// Input schema for tabz_claude_group_remove
const ClaudeGroupRemoveSchema = z.object({
    tabId: z.number()
        .int()
        .min(1)
        .describe("Chrome tab ID to remove from the Claude Active group.")
}).strict();
// Input schema for tabz_claude_group_status
const ClaudeGroupStatusSchema = z.object({
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
/**
 * Register tab group management tools with the MCP server
 */
export function registerTabGroupTools(server) {
    // List tab groups tool
    server.tool("tabz_list_groups", `List all tab groups with title, color, collapsed state, and member tab IDs.

Args: response_format (optional)`, ListGroupsSchema.shape, async (params) => {
        try {
            const result = await listTabGroups();
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    groups: result.groups,
                    claudeActiveGroupId: result.claudeActiveGroupId
                }, null, 2);
            }
            else {
                if (result.groups.length === 0) {
                    resultText = `# Tab Groups

No tab groups currently exist.

Use \`tabz_create_group\` to create a group from existing tabs.`;
                }
                else {
                    const lines = [`# Tab Groups (${result.groups.length})`, ""];
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
    // Create tab group tool
    server.tool("tabz_create_group", `Create a tab group from specified tabs with optional title and color.

Args: tabIds (required array), title (optional), color (optional), collapsed (optional)`, CreateGroupSchema.shape, async (params) => {
        try {
            const result = await createTabGroup({
                tabIds: params.tabIds,
                title: params.title,
                color: params.color,
                collapsed: params.collapsed
            });
            let resultText;
            if (result.success && result.group) {
                resultText = `## Tab Group Created

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Color:** ${result.group.color}
**Tabs:** ${result.group.tabCount}

Use \`tabz_add_to_group\` to add more tabs, or \`tabz_update_group\` to modify.`;
            }
            else {
                resultText = `## Failed to Create Group

**Error:** ${result.error}

Use \`tabz_list_tabs\` to get valid tab IDs.`;
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
    // Update tab group tool
    server.tool("tabz_update_group", `Update a tab group's title, color, or collapsed state. Get IDs from tabz_list_groups.

Args: groupId (required), title/color/collapsed (optional)`, UpdateGroupSchema.shape, async (params) => {
        try {
            const result = await updateTabGroup({
                groupId: params.groupId,
                title: params.title,
                color: params.color,
                collapsed: params.collapsed
            });
            let resultText;
            if (result.success && result.group) {
                resultText = `## Tab Group Updated

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Color:** ${result.group.color}
**Collapsed:** ${result.group.collapsed}`;
            }
            else {
                resultText = `## Failed to Update Group

**Error:** ${result.error}

Use \`tabz_list_groups\` to get valid group IDs.`;
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
    // Add to group tool
    server.tool("tabz_add_to_group", `Add tabs to an existing tab group.

Args: groupId (required), tabIds (required array)`, AddToGroupSchema.shape, async (params) => {
        try {
            const result = await addToTabGroup({
                groupId: params.groupId,
                tabIds: params.tabIds
            });
            let resultText;
            if (result.success && result.group) {
                resultText = `## Tabs Added to Group

**Group ID:** ${result.group.groupId}
**Title:** ${result.group.title || "(untitled)"}
**Total Tabs:** ${result.group.tabCount}`;
            }
            else {
                resultText = `## Failed to Add Tabs

**Error:** ${result.error}

Use \`tabz_list_groups\` to verify the group exists.`;
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
    // Ungroup tabs tool
    server.tool("tabz_ungroup_tabs", `Remove tabs from their groups. Empty groups are auto-deleted by Chrome.

Args: tabIds (required array)`, UngroupTabsSchema.shape, async (params) => {
        try {
            const result = await ungroupTabs(params.tabIds);
            let resultText;
            if (result.success) {
                resultText = `## Tabs Ungrouped

Successfully removed ${result.ungroupedCount || params.tabIds.length} tabs from their groups.

Note: Empty groups are automatically deleted by Chrome.`;
            }
            else {
                resultText = `## Failed to Ungroup Tabs

**Error:** ${result.error}`;
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
    // Claude group add tool
    server.tool("tabz_claude_group_add", `Add a tab to the purple "Claude Active" group. Auto-creates group if needed.

Args: tabId (required)`, ClaudeGroupAddSchema.shape, async (params) => {
        try {
            const result = await addToClaudeGroup(params.tabId);
            let resultText;
            if (result.success && result.group) {
                resultText = `## Tab Added to Claude Group

Tab ${params.tabId} is now in the Claude Active group.

**Group:** ${result.group.title} [${result.group.color}]
**Total Tabs:** ${result.group.tabCount}

The tab is now visually highlighted in Chrome's tab bar.`;
            }
            else {
                resultText = `## Failed to Add Tab to Claude Group

**Error:** ${result.error}`;
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
    // Claude group remove tool
    server.tool("tabz_claude_group_remove", `Remove a tab from the "Claude Active" group.

Args: tabId (required)`, ClaudeGroupRemoveSchema.shape, async (params) => {
        try {
            const result = await removeFromClaudeGroup(params.tabId);
            let resultText;
            if (result.success) {
                resultText = `## Tab Removed from Claude Group

Tab ${params.tabId} has been removed from the Claude Active group.

${result.message || ""}`;
            }
            else {
                resultText = `## Failed to Remove Tab from Claude Group

**Error:** ${result.error}`;
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
    // Claude group status tool
    server.tool("tabz_claude_group_status", `Get status of the "Claude Active" group -- exists, groupId, tabCount, tabIds.

Args: response_format (optional)`, ClaudeGroupStatusSchema.shape, async (params) => {
        try {
            const result = await getClaudeGroupStatus();
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    exists: result.exists,
                    groupId: result.groupId,
                    group: result.group,
                    tabCount: result.tabCount,
                    tabIds: result.tabIds
                }, null, 2);
            }
            else {
                if (!result.exists) {
                    resultText = `# Claude Active Group

**Status:** Not created

No tabs are currently marked as "Claude Active".
Use \`tabz_claude_group_add\` to add a tab.`;
                }
                else {
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
//# sourceMappingURL=tabGroups.js.map