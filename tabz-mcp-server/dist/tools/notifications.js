/**
 * Notification Tools
 *
 * Tools for displaying Chrome desktop notifications
 */
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
// =====================================
// Input Schemas
// =====================================
// List item for 'list' type notifications
const NotificationItemSchema = z.object({
    title: z.string(),
    message: z.string()
});
// Button for notifications (max 2)
const NotificationButtonSchema = z.object({
    title: z.string().max(32),
    iconUrl: z.string().url().optional()
});
// Show notification schema
const ShowNotificationSchema = z.object({
    title: z.string()
        .min(1)
        .max(100),
    message: z.string()
        .min(1)
        .max(500),
    type: z.enum(['basic', 'image', 'list', 'progress'])
        .default('basic'),
    iconUrl: z.string()
        .url()
        .optional()
        .describe("48x48; extension icon if omitted."),
    imageUrl: z.string()
        .url()
        .optional(),
    items: z.array(NotificationItemSchema)
        .optional(),
    progress: z.number()
        .int()
        .min(0)
        .max(100)
        .optional(),
    buttons: z.array(NotificationButtonSchema)
        .max(2)
        .optional()
        .describe("Max 2; clicks are not handled yet."),
    priority: z.number()
        .int()
        .min(-2)
        .max(2)
        .default(0)
        .describe("-2 (lowest) to 2 (highest)."),
    notificationId: z.string()
        .optional()
        .describe("Custom ID; auto-generated."),
    requireInteraction: z.boolean()
        .default(false)
}).strict();
// Update notification schema
const UpdateNotificationSchema = z.object({
    notificationId: z.string(),
    title: z.string()
        .max(100)
        .optional(),
    message: z.string()
        .max(500)
        .optional(),
    progress: z.number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("New percentage, 0-100."),
    type: z.enum(['basic', 'image', 'list', 'progress'])
        .optional()
        .describe("Switch template, e.g. progress to basic when done.")
}).strict();
// Clear notification schema
const ClearNotificationSchema = z.object({
    notificationId: z.string()
}).strict();
// List notifications schema (no parameters needed)
const ListNotificationsSchema = z.object({}).strict();
/**
 * Show a notification
 */
async function showNotification(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/notification/show`, params, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Update an existing notification
 */
async function updateNotification(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/notification/update`, params, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Clear a notification
 */
async function clearNotification(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/notification/clear`, params, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * List all active notifications
 */
async function listNotifications() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/notification/list`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
// =====================================
// Tool Registration
// =====================================
/**
 * Register notification tools with the MCP server
 */
export function registerNotificationTools(server) {
    // Show notification tool
    registerTabzTool(server, "tabz_notification_show", "Show a Chrome desktop notification and answer its notificationId.", ShowNotificationSchema, async (params) => {
        try {
            const result = await showNotification(params);
            let resultText;
            if (result.success) {
                resultText = `## Notification Shown

**ID:** \`${result.notificationId}\`

Use this ID with \`tabz_notification_update\` or \`tabz_notification_clear\`.`;
            }
            else {
                resultText = `## Notification Failed

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
    // Update notification tool
    registerTabzTool(server, "tabz_notification_update", "Update an existing notification's title, message, progress, or type.", UpdateNotificationSchema, async (params) => {
        try {
            const result = await updateNotification(params);
            let resultText;
            if (result.success) {
                if (result.wasUpdated) {
                    resultText = `## Notification Updated

Successfully updated notification \`${params.notificationId}\`.`;
                }
                else {
                    resultText = `## Notification Not Found

Notification \`${params.notificationId}\` does not exist or was already dismissed.`;
                }
            }
            else {
                resultText = `## Update Failed

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
    // Clear notification tool
    registerTabzTool(server, "tabz_notification_clear", "Dismiss a notification by ID.", ClearNotificationSchema, async (params) => {
        try {
            const result = await clearNotification(params);
            let resultText;
            if (result.success) {
                if (result.wasCleared) {
                    resultText = `## Notification Cleared

Successfully dismissed notification \`${params.notificationId}\`.`;
                }
                else {
                    resultText = `## Notification Not Found

Notification \`${params.notificationId}\` does not exist or was already dismissed.`;
                }
            }
            else {
                resultText = `## Clear Failed

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
    // List notifications tool
    registerTabzTool(server, "tabz_notification_list", `List all active (undismissed) notifications.`, ListNotificationsSchema, async () => {
        try {
            const result = await listNotifications();
            let resultText;
            if (result.success) {
                if (result.count === 0) {
                    resultText = `## Active Notifications

No active notifications.`;
                }
                else {
                    const lines = [`## Active Notifications (${result.count})`, ""];
                    for (const [id, info] of Object.entries(result.notifications || {})) {
                        lines.push(`### \`${id}\``);
                        lines.push(`- **Type:** ${info.type}`);
                        lines.push(`- **Title:** ${info.title}`);
                        lines.push(`- **Message:** ${info.message}`);
                        lines.push("");
                    }
                    resultText = lines.join("\n");
                }
            }
            else {
                resultText = `## List Failed

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
}
//# sourceMappingURL=notifications.js.map