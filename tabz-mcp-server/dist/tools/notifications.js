/**
 * Notification Tools
 *
 * Tools for displaying Chrome desktop notifications
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
// =====================================
// Input Schemas
// =====================================
// List item for 'list' type notifications
const NotificationItemSchema = z.object({
    title: z.string().describe("Item title"),
    message: z.string().describe("Item message")
});
// Button for notifications (max 2)
const NotificationButtonSchema = z.object({
    title: z.string().max(32).describe("Button title (max 32 chars)"),
    iconUrl: z.string().url().optional().describe("URL to button icon")
});
// Show notification schema
const ShowNotificationSchema = z.object({
    title: z.string()
        .min(1)
        .max(100)
        .describe("Notification title"),
    message: z.string()
        .min(1)
        .max(500)
        .describe("Notification body text"),
    type: z.enum(['basic', 'image', 'list', 'progress'])
        .default('basic')
        .describe("Notification template type: 'basic' (default), 'image', 'list', or 'progress'"),
    iconUrl: z.string()
        .url()
        .optional()
        .describe("URL to notification icon (48x48 recommended). Uses extension icon if omitted."),
    imageUrl: z.string()
        .url()
        .optional()
        .describe("Image URL for 'image' type notifications"),
    items: z.array(NotificationItemSchema)
        .optional()
        .describe("List items for 'list' type notifications"),
    progress: z.number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("Progress percentage (0-100) for 'progress' type"),
    buttons: z.array(NotificationButtonSchema)
        .max(2)
        .optional()
        .describe("Action buttons (max 2). Note: button clicks are not yet handled."),
    priority: z.number()
        .int()
        .min(-2)
        .max(2)
        .default(0)
        .describe("Priority: -2 (lowest) to 2 (highest). Default 0."),
    notificationId: z.string()
        .optional()
        .describe("Custom ID for this notification. Auto-generated if omitted. Use for updates."),
    requireInteraction: z.boolean()
        .default(false)
        .describe("Keep notification visible until user dismisses it")
}).strict();
// Update notification schema
const UpdateNotificationSchema = z.object({
    notificationId: z.string()
        .describe("ID of notification to update"),
    title: z.string()
        .max(100)
        .optional()
        .describe("New title"),
    message: z.string()
        .max(500)
        .optional()
        .describe("New message"),
    progress: z.number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("New progress percentage (0-100)"),
    type: z.enum(['basic', 'image', 'list', 'progress'])
        .optional()
        .describe("Change notification type (e.g., progress -> basic when complete)")
}).strict();
// Clear notification schema
const ClearNotificationSchema = z.object({
    notificationId: z.string()
        .describe("ID of notification to dismiss")
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
    server.tool("tabz_notification_show", `Show a Chrome desktop notification. Types: basic, image, list, progress. Returns notificationId for updates.

Args: title (required), message (required), type/iconUrl/progress/buttons/priority/notificationId/requireInteraction (optional)`, ShowNotificationSchema.shape, async (params) => {
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
    server.tool("tabz_notification_update", `Update an existing notification (title, message, progress, or type).

Args: notificationId (required), title/message/progress/type (optional)`, UpdateNotificationSchema.shape, async (params) => {
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
    server.tool("tabz_notification_clear", `Dismiss a notification by ID.

Args: notificationId (required)`, ClearNotificationSchema.shape, async (params) => {
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
    server.tool("tabz_notification_list", `List all active (undismissed) notifications.`, ListNotificationsSchema.shape, async () => {
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