/**
 * Window Management Tools
 *
 * MCP tools for managing Chrome windows - list, create, update, close, and tile.
 * Also provides display/monitor information and terminal popout functionality.
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat } from "../types.js";
// Enums for Zod schemas
const WindowStateSchema = z.enum(['normal', 'minimized', 'maximized', 'fullscreen']);
const WindowTypeSchema = z.enum(['normal', 'popup']);
const TileLayoutSchema = z.enum(['horizontal', 'vertical', 'grid']);
/**
 * List all Chrome windows via Extension API
 */
async function listWindows() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/windows`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, windows: [], error: handleApiError(error, "Failed to list windows").message };
    }
}
/**
 * Create a new Chrome window via Extension API
 */
async function createWindow(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/windows`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to create window").message };
    }
}
/**
 * Update a Chrome window via Extension API
 */
async function updateWindow(options) {
    try {
        const response = await axios.put(`${BACKEND_URL}/api/browser/windows/${options.windowId}`, options, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to update window").message };
    }
}
/**
 * Close a Chrome window via Extension API
 */
async function closeWindow(windowId) {
    try {
        const response = await axios.delete(`${BACKEND_URL}/api/browser/windows/${windowId}`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to close window").message };
    }
}
/**
 * Get display/monitor information via Extension API
 */
async function getDisplays() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/displays`, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, displays: [], error: handleApiError(error, "Failed to get displays").message };
    }
}
/**
 * Tile windows in a layout via Extension API
 */
async function tileWindows(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/windows/tile`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to tile windows").message };
    }
}
/**
 * Pop out terminal to standalone window via Extension API
 */
async function popoutTerminal(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/popout-terminal`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to popout terminal").message };
    }
}
// Input schemas
const ListWindowsSchema = z.object({
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
const CreateWindowSchema = z.object({
    url: z.union([z.string(), z.array(z.string())])
        .optional()
        .describe("URL(s) to open. Use '/sidepanel/sidepanel.html' for extension page. Default: new tab page."),
    type: WindowTypeSchema
        .optional()
        .describe("Window type: 'normal' (full browser UI) or 'popup' (minimal UI). Default: 'normal'."),
    state: WindowStateSchema
        .optional()
        .describe("Initial state: 'normal', 'minimized', 'maximized', or 'fullscreen'. Default: 'normal'."),
    focused: z.boolean()
        .optional()
        .describe("Whether window should be focused on creation. Default: true."),
    width: z.number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .describe("Window width in pixels."),
    height: z.number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .describe("Window height in pixels."),
    left: z.number()
        .int()
        .optional()
        .describe("Window left position (for multi-monitor). Use tabz_get_displays to get monitor positions."),
    top: z.number()
        .int()
        .optional()
        .describe("Window top position."),
    incognito: z.boolean()
        .optional()
        .describe("Create incognito window. Default: false."),
    tabId: z.number()
        .int()
        .min(1)
        .optional()
        .describe("Move this tab to the new window instead of opening URLs.")
}).strict();
const UpdateWindowSchema = z.object({
    windowId: z.number()
        .int()
        .min(1)
        .describe("The window ID to update. Get IDs from tabz_list_windows."),
    state: WindowStateSchema
        .optional()
        .describe("New state: 'normal', 'minimized', 'maximized', or 'fullscreen'."),
    focused: z.boolean()
        .optional()
        .describe("Set to true to focus/bring window to front."),
    width: z.number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .describe("New width in pixels (ignored if maximized/fullscreen)."),
    height: z.number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .describe("New height in pixels (ignored if maximized/fullscreen)."),
    left: z.number()
        .int()
        .optional()
        .describe("New left position (for multi-monitor positioning)."),
    top: z.number()
        .int()
        .optional()
        .describe("New top position."),
    drawAttention: z.boolean()
        .optional()
        .describe("Flash/highlight the window to get user attention.")
}).strict();
const CloseWindowSchema = z.object({
    windowId: z.number()
        .int()
        .min(1)
        .describe("The window ID to close. Get IDs from tabz_list_windows. WARNING: Closes all tabs in the window!")
}).strict();
const GetDisplaysSchema = z.object({
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();
const TileWindowsSchema = z.object({
    windowIds: z.array(z.number().int().min(1))
        .min(1)
        .max(20)
        .describe("Array of window IDs to tile. Get IDs from tabz_list_windows."),
    layout: TileLayoutSchema
        .optional()
        .describe("Layout: 'horizontal' (side by side), 'vertical' (stacked), or 'grid' (auto grid). Default: 'horizontal'."),
    displayId: z.string()
        .optional()
        .describe("Target display ID from tabz_get_displays. Default: primary display."),
    gap: z.number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("Gap between windows in pixels. Default: 0.")
}).strict();
const PopoutTerminalSchema = z.object({
    terminalId: z.string()
        .optional()
        .describe("Terminal ID to focus in the new window. If omitted, shows all terminals."),
    width: z.number()
        .int()
        .min(200)
        .max(5000)
        .optional()
        .describe("Window width in pixels. Default: 500."),
    height: z.number()
        .int()
        .min(200)
        .max(5000)
        .optional()
        .describe("Window height in pixels. Default: 700."),
    left: z.number()
        .int()
        .optional()
        .describe("Window left position."),
    top: z.number()
        .int()
        .optional()
        .describe("Window top position.")
}).strict();
/**
 * Register window management tools with the MCP server
 */
export function registerWindowTools(server) {
    // List windows tool
    server.tool("tabz_list_windows", `List all Chrome windows with their properties.

Returns information about all open browser windows including dimensions, state,
and tab counts. Useful for window management and multi-monitor layouts.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "windows": [
      {
        "windowId": 123,
        "focused": true,
        "state": "normal",
        "type": "normal",
        "width": 1920,
        "height": 1080,
        "left": 0,
        "top": 0,
        "incognito": false,
        "tabCount": 5
      }
    ]
  }

Use tabz_create_window to create new windows.
Use tabz_update_window to resize, move, or change state.
Use tabz_tile_windows to auto-arrange windows.

Error Handling:
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running`, ListWindowsSchema.shape, async (params) => {
        try {
            const result = await listWindows();
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({ windows: result.windows }, null, 2);
            }
            else {
                if (result.windows.length === 0) {
                    resultText = `# Chrome Windows\n\nNo windows found.`;
                }
                else {
                    const lines = [`# Chrome Windows (${result.windows.length})`, ""];
                    for (const win of result.windows) {
                        const focusedMarker = win.focused ? " ← FOCUSED" : "";
                        lines.push(`## Window ${win.windowId}${focusedMarker}`);
                        lines.push(`- **Type:** ${win.type}`);
                        lines.push(`- **State:** ${win.state}`);
                        lines.push(`- **Size:** ${win.width}x${win.height}`);
                        lines.push(`- **Position:** (${win.left}, ${win.top})`);
                        lines.push(`- **Tabs:** ${win.tabCount}`);
                        if (win.incognito)
                            lines.push(`- **Incognito:** Yes`);
                        lines.push("");
                    }
                    lines.push("---");
                    lines.push("- Use `tabz_update_window` to resize, move, or change state");
                    lines.push("- Use `tabz_tile_windows` to auto-arrange windows");
                    lines.push("- Use `tabz_popout_terminal` to create terminal windows");
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
    // Create window tool
    server.tool("tabz_create_window", `Create a new Chrome browser window.

Opens a new window with optional URL(s), position, and size. Use type="popup"
for minimal UI (no address bar/toolbar) - ideal for terminal popouts.

IMPORTANT: Use '/sidepanel/sidepanel.html' as url to open the terminal sidebar
in a standalone popup window - this avoids duplicate extension issues!

Args:
  - url (optional): URL or array of URLs to open. Use '/sidepanel/sidepanel.html' for terminals.
  - type (optional): 'normal' (full UI) or 'popup' (minimal UI). Default: 'normal'.
  - state (optional): 'normal', 'minimized', 'maximized', 'fullscreen'. Default: 'normal'.
  - focused (optional): Focus window on creation. Default: true.
  - width, height (optional): Window dimensions in pixels.
  - left, top (optional): Window position (use tabz_get_displays for multi-monitor).
  - incognito (optional): Create incognito window.
  - tabId (optional): Move existing tab to new window instead of opening URLs.

Examples:
  - Popup terminal: url="/sidepanel/sidepanel.html", type="popup", width=500, height=700
  - Normal window: url="https://github.com", width=1200, height=800
  - On second monitor: left=1920, top=0, width=800, height=600

Returns:
  - windowId: New window ID for subsequent operations
  - Window properties (type, state, dimensions)

Error Handling:
  - Invalid URL: Check URL format
  - "Cannot create": Check browser permissions`, CreateWindowSchema.shape, async (params) => {
        try {
            const result = await createWindow({
                url: params.url,
                type: params.type,
                state: params.state,
                focused: params.focused,
                width: params.width,
                height: params.height,
                left: params.left,
                top: params.top,
                incognito: params.incognito,
                tabId: params.tabId
            });
            let resultText;
            if (result.success && result.window) {
                resultText = `## Window Created

**Window ID:** ${result.window.windowId}
**Type:** ${result.window.type}
**Size:** ${result.window.width}x${result.window.height}
**Position:** (${result.window.left}, ${result.window.top})
**Tabs:** ${result.window.tabCount}

Use this windowId with \`tabz_update_window\` to modify, or \`tabz_close_window\` to close.`;
            }
            else {
                resultText = `## Failed to Create Window

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
    // Update window tool
    server.tool("tabz_update_window", `Update a Chrome window's properties.

Resize, move, change state (minimize/maximize), or focus a window.
Get window IDs from tabz_list_windows.

Args:
  - windowId (required): Window ID to update
  - state (optional): 'normal', 'minimized', 'maximized', 'fullscreen'
  - focused (optional): true to bring window to front
  - width, height (optional): New dimensions (ignored if maximized/fullscreen)
  - left, top (optional): New position for multi-monitor placement
  - drawAttention (optional): Flash/highlight the window

Examples:
  - Focus window: windowId=123, focused=true
  - Maximize: windowId=123, state="maximized"
  - Resize & move: windowId=123, width=800, height=600, left=100, top=100
  - Minimize: windowId=123, state="minimized"

Error Handling:
  - Invalid window ID: Use tabz_list_windows to get valid IDs
  - "No update properties": Provide at least one property to change`, UpdateWindowSchema.shape, async (params) => {
        try {
            const result = await updateWindow({
                windowId: params.windowId,
                state: params.state,
                focused: params.focused,
                width: params.width,
                height: params.height,
                left: params.left,
                top: params.top,
                drawAttention: params.drawAttention
            });
            let resultText;
            if (result.success && result.window) {
                resultText = `## Window Updated

**Window ID:** ${result.window.windowId}
**State:** ${result.window.state}
**Size:** ${result.window.width}x${result.window.height}
**Position:** (${result.window.left}, ${result.window.top})`;
            }
            else {
                resultText = `## Failed to Update Window

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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
    // Close window tool
    server.tool("tabz_close_window", `Close a Chrome window.

WARNING: This closes the entire window including ALL tabs in it!
Use with caution. Get window IDs from tabz_list_windows.

Args:
  - windowId (required): Window ID to close

Error Handling:
  - Invalid window ID: Use tabz_list_windows to get valid IDs
  - Cannot close last window: Chrome requires at least one window`, CloseWindowSchema.shape, async (params) => {
        try {
            const result = await closeWindow(params.windowId);
            let resultText;
            if (result.success) {
                resultText = `## Window Closed

Successfully closed window ${params.windowId} and all its tabs.`;
            }
            else {
                resultText = `## Failed to Close Window

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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
    // Get displays tool
    server.tool("tabz_get_displays", `Get information about connected monitors/displays.

Returns detailed information about all displays including dimensions, positions,
and work areas (excluding taskbar). Essential for multi-monitor window placement.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "displays": [
      {
        "id": "0",
        "name": "Built-in Retina Display",
        "isPrimary": true,
        "bounds": { "left": 0, "top": 0, "width": 1920, "height": 1080 },
        "workArea": { "left": 0, "top": 0, "width": 1920, "height": 1040 }
      }
    ]
  }

Key concepts:
  - bounds: Full display area
  - workArea: Usable area excluding taskbar/dock
  - left/top: Position for multi-monitor setups (e.g., left=1920 for second monitor)

Use with tabz_create_window or tabz_tile_windows for multi-monitor layouts.`, GetDisplaysSchema.shape, async (params) => {
        try {
            const result = await getDisplays();
            if (!result.success) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({ displays: result.displays }, null, 2);
            }
            else {
                if (result.displays.length === 0) {
                    resultText = `# Displays\n\nNo displays found. This may indicate a permission issue.`;
                }
                else {
                    const lines = [`# Displays (${result.displays.length})`, ""];
                    for (const display of result.displays) {
                        const primaryMarker = display.isPrimary ? " (Primary)" : "";
                        lines.push(`## ${display.name}${primaryMarker}`);
                        lines.push(`- **ID:** ${display.id}`);
                        lines.push(`- **Full Size:** ${display.bounds.width}x${display.bounds.height}`);
                        lines.push(`- **Work Area:** ${display.workArea.width}x${display.workArea.height}`);
                        lines.push(`- **Position:** (${display.bounds.left}, ${display.bounds.top})`);
                        if (display.rotation !== 0)
                            lines.push(`- **Rotation:** ${display.rotation}°`);
                        lines.push("");
                    }
                    lines.push("---");
                    lines.push("Use display positions with `tabz_create_window` or `tabz_tile_windows`:");
                    lines.push("- Primary display usually starts at (0, 0)");
                    lines.push("- Second monitor might be at (1920, 0) or (-1920, 0)");
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
    // Tile windows tool
    server.tool("tabz_tile_windows", `Auto-arrange windows in a tiled layout.

Positions multiple windows side-by-side, stacked, or in a grid within a display's
work area. Perfect for setting up development layouts.

Args:
  - windowIds (required): Array of window IDs to tile (1-20 windows)
  - layout (optional): 'horizontal' (side by side), 'vertical' (stacked), 'grid' (auto). Default: 'horizontal'.
  - displayId (optional): Target display ID from tabz_get_displays. Default: primary.
  - gap (optional): Pixels between windows. Default: 0.

Layout examples:
  - horizontal (2 windows): [Left Half] [Right Half]
  - vertical (2 windows): [Top Half] / [Bottom Half]
  - grid (4 windows): [1][2] / [3][4]

Examples:
  - Side by side: windowIds=[123, 456], layout="horizontal"
  - Three-way split: windowIds=[123, 456, 789], layout="horizontal"
  - Grid with gap: windowIds=[1,2,3,4], layout="grid", gap=10
  - On second monitor: windowIds=[123, 456], displayId="1"

Returns:
  - Per-window success/error results
  - Applied layout and display info

Error Handling:
  - Invalid window IDs: Use tabz_list_windows to get valid IDs
  - Window minimized: Will be restored to normal state before tiling`, TileWindowsSchema.shape, async (params) => {
        try {
            const result = await tileWindows({
                windowIds: params.windowIds,
                layout: params.layout,
                displayId: params.displayId,
                gap: params.gap
            });
            let resultText;
            if (result.success) {
                const successCount = result.results?.filter(r => r.success).length || 0;
                const failCount = (result.results?.length || 0) - successCount;
                resultText = `## Windows Tiled

**Layout:** ${result.layout}
**Display:** ${result.displayId || "primary"}
**Success:** ${successCount} windows
${failCount > 0 ? `**Failed:** ${failCount} windows` : ""}`;
                if (result.results?.some(r => !r.success)) {
                    resultText += "\n\n**Errors:**";
                    for (const r of result.results) {
                        if (!r.success) {
                            resultText += `\n- Window ${r.windowId}: ${r.error}`;
                        }
                    }
                }
            }
            else {
                resultText = `## Failed to Tile Windows

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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
    // Popout terminal tool
    server.tool("tabz_popout_terminal", `Pop out the terminal sidebar to a standalone popup window.

Creates a new popup window containing the TabzChrome terminal UI. This allows
running terminals in multiple windows WITHOUT duplicate extension issues - all
windows share the same extension instance.

ADVANTAGES over duplicate extensions:
- Single WebSocket connection to backend
- No terminal session conflicts
- Shared state and settings
- Multiple terminal views in different windows

Args:
  - terminalId (optional): Focus specific terminal in new window
  - width (optional): Window width. Default: 500.
  - height (optional): Window height. Default: 700.
  - left, top (optional): Window position

Examples:
  - New terminal window: {} (no args)
  - Specific terminal: terminalId="ctt-default-abc123"
  - Positioned: width=600, height=800, left=100, top=100

Use Cases:
  - Multiple terminal views on different monitors
  - Keep terminals visible while browsing
  - Parallel terminal sessions without conflicts

Returns:
  - windowId: New window ID for management
  - terminalId: Which terminal is focused (if specified)`, PopoutTerminalSchema.shape, async (params) => {
        try {
            const result = await popoutTerminal({
                terminalId: params.terminalId,
                width: params.width,
                height: params.height,
                left: params.left,
                top: params.top
            });
            let resultText;
            if (result.success && result.window) {
                resultText = `## Terminal Popped Out

**Window ID:** ${result.window.windowId}
**Type:** ${result.window.type}
**Size:** ${result.window.width}x${result.window.height}
**Position:** (${result.window.left}, ${result.window.top})
${result.terminalId ? `**Terminal:** ${result.terminalId}` : ""}

The terminal is now in a standalone window. This window shares the same
extension instance as the sidebar - no duplicate extension issues!

Use \`tabz_update_window\` to resize/move, or \`tabz_tile_windows\` to arrange.`;
            }
            else {
                resultText = `## Failed to Pop Out Terminal

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
//# sourceMappingURL=windows.js.map