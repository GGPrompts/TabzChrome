/**
 * Window Management Tools
 *
 * MCP tools for managing Chrome windows - list, create, update, close, and tile.
 * Also provides display/monitor information and terminal popout functionality.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import {
  BACKEND_URL,
  handleApiError,
  type WindowState,
  type WindowType,
  type TileLayout,
  type ListWindowsResult,
  type WindowResult,
  type ListDisplaysResult,
  type TileWindowsResult,
  type PopoutTerminalResult
} from "../shared.js";
import { ResponseFormat } from "../types.js";

// Enums for Zod schemas
const WindowStateSchema = z.enum(['normal', 'minimized', 'maximized', 'fullscreen']);
const WindowTypeSchema = z.enum(['normal', 'popup']);
const TileLayoutSchema = z.enum(['horizontal', 'vertical', 'grid']);

/**
 * List all Chrome windows via Extension API
 */
async function listWindows(): Promise<ListWindowsResult> {
  try {
    const response = await axios.get<ListWindowsResult>(
      `${BACKEND_URL}/api/browser/windows`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, windows: [], error: handleApiError(error, "Failed to list windows").message };
  }
}

/**
 * Create a new Chrome window via Extension API
 */
async function createWindow(options: {
  url?: string | string[];
  type?: WindowType;
  state?: WindowState;
  focused?: boolean;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  incognito?: boolean;
  tabId?: number;
}): Promise<WindowResult> {
  try {
    const response = await axios.post<WindowResult>(
      `${BACKEND_URL}/api/browser/windows`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create window").message };
  }
}

/**
 * Update a Chrome window via Extension API
 */
async function updateWindow(options: {
  windowId: number;
  state?: WindowState;
  focused?: boolean;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  drawAttention?: boolean;
}): Promise<WindowResult> {
  try {
    const response = await axios.put<WindowResult>(
      `${BACKEND_URL}/api/browser/windows/${options.windowId}`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to update window").message };
  }
}

/**
 * Close a Chrome window via Extension API
 */
async function closeWindow(windowId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.delete<{ success: boolean; error?: string }>(
      `${BACKEND_URL}/api/browser/windows/${windowId}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to close window").message };
  }
}

/**
 * Get display/monitor information via Extension API
 */
async function getDisplays(): Promise<ListDisplaysResult> {
  try {
    const response = await axios.get<ListDisplaysResult>(
      `${BACKEND_URL}/api/browser/displays`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, displays: [], error: handleApiError(error, "Failed to get displays").message };
  }
}

/**
 * Tile windows in a layout via Extension API
 */
async function tileWindows(options: {
  windowIds: number[];
  layout?: TileLayout;
  displayId?: string;
  gap?: number;
}): Promise<TileWindowsResult> {
  try {
    const response = await axios.post<TileWindowsResult>(
      `${BACKEND_URL}/api/browser/windows/tile`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to tile windows").message };
  }
}

/**
 * Pop out terminal to standalone window via Extension API
 */
async function popoutTerminal(options: {
  terminalId?: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}): Promise<PopoutTerminalResult> {
  try {
    const response = await axios.post<PopoutTerminalResult>(
      `${BACKEND_URL}/api/browser/popout-terminal`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to popout terminal").message };
  }
}

// Input schemas

const ListWindowsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type ListWindowsInput = z.infer<typeof ListWindowsSchema>;

const CreateWindowSchema = z.object({
  url: z.union([z.string(), z.array(z.string())])
    .optional(),
  type: WindowTypeSchema
    .optional(),
  state: WindowStateSchema
    .optional(),
  focused: z.boolean()
    .optional(),
  width: z.number()
    .int()
    .min(100)
    .max(10000)
    .optional(),
  height: z.number()
    .int()
    .min(100)
    .max(10000)
    .optional(),
  left: z.number()
    .int()
    .optional()
    .describe("Left position; see tabz_get_displays."),
  top: z.number()
    .int()
    .optional(),
  incognito: z.boolean()
    .optional(),
  tabId: z.number()
    .int()
    .min(1)
    .optional()
    .describe("Move this tab in instead of opening URLs.")
}).strict();

type CreateWindowInput = z.infer<typeof CreateWindowSchema>;

const UpdateWindowSchema = z.object({
  windowId: z.number()
    .int()
    .min(1),
  state: WindowStateSchema
    .optional(),
  focused: z.boolean()
    .optional(),
  width: z.number()
    .int()
    .min(100)
    .max(10000)
    .optional()
    .describe("New width; ignored when maximized."),
  height: z.number()
    .int()
    .min(100)
    .max(10000)
    .optional(),
  left: z.number()
    .int()
    .optional(),
  top: z.number()
    .int()
    .optional(),
  drawAttention: z.boolean()
    .optional()
}).strict();

type UpdateWindowInput = z.infer<typeof UpdateWindowSchema>;

const CloseWindowSchema = z.object({
  windowId: z.number()
    .int()
    .min(1)
    .describe("Window to close; all its tabs go with it.")
}).strict();

type CloseWindowInput = z.infer<typeof CloseWindowSchema>;

const GetDisplaysSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type GetDisplaysInput = z.infer<typeof GetDisplaysSchema>;

const TileWindowsSchema = z.object({
  windowIds: z.array(z.number().int().min(1))
    .min(1)
    .max(20),
  layout: TileLayoutSchema
    .optional()
    .describe("Side by side, stacked, or an automatic grid."),
  displayId: z.string()
    .optional()
    .describe("Display from tabz_get_displays; primary by default."),
  gap: z.number()
    .int()
    .min(0)
    .max(100)
    .optional()
}).strict();

type TileWindowsInput = z.infer<typeof TileWindowsSchema>;

const PopoutTerminalSchema = z.object({
  terminalId: z.string()
    .optional()
    .describe("Terminal to focus; omit to show all of them."),
  width: z.number()
    .int()
    .min(200)
    .max(5000)
    .optional(),
  height: z.number()
    .int()
    .min(200)
    .max(5000)
    .optional(),
  left: z.number()
    .int()
    .optional(),
  top: z.number()
    .int()
    .optional()
}).strict();

type PopoutTerminalInput = z.infer<typeof PopoutTerminalSchema>;

/**
 * Register window management tools with the MCP server
 */
export function registerWindowTools(server: McpServer): void {
  // List windows tool
  registerTabzTool(server,
    "tabz_list_windows",
    "List every Chrome window with its dimensions, state, and tab count.",
    ListWindowsSchema,
    async (params: ListWindowsInput) => {
      try {
        const result = await listWindows();

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({ windows: result.windows }, null, 2);
        } else {
          if (result.windows.length === 0) {
            resultText = `# Chrome Windows\n\nNo windows found.`;
          } else {
            const lines: string[] = [`# Chrome Windows (${result.windows.length})`, ""];

            for (const win of result.windows) {
              const focusedMarker = win.focused ? " ← FOCUSED" : "";
              lines.push(`## Window ${win.windowId}${focusedMarker}`);
              lines.push(`- **Type:** ${win.type}`);
              lines.push(`- **State:** ${win.state}`);
              lines.push(`- **Size:** ${win.width}x${win.height}`);
              lines.push(`- **Position:** (${win.left}, ${win.top})`);
              lines.push(`- **Tabs:** ${win.tabCount}`);
              if (win.incognito) lines.push(`- **Incognito:** Yes`);
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

  // Create window tool
  registerTabzTool(server,
    "tabz_create_window",
    "Create a Chrome window; url \"/sidepanel/sidepanel.html\" gives a terminal popout.",
    CreateWindowSchema,
    async (params: CreateWindowInput) => {
      try {
        const result = await createWindow({
          url: params.url,
          type: params.type as WindowType | undefined,
          state: params.state as WindowState | undefined,
          focused: params.focused,
          width: params.width,
          height: params.height,
          left: params.left,
          top: params.top,
          incognito: params.incognito,
          tabId: params.tabId
        });

        let resultText: string;
        if (result.success && result.window) {
          resultText = `## Window Created

**Window ID:** ${result.window.windowId}
**Type:** ${result.window.type}
**Size:** ${result.window.width}x${result.window.height}
**Position:** (${result.window.left}, ${result.window.top})
**Tabs:** ${result.window.tabCount}

Use this windowId with \`tabz_update_window\` to modify, or \`tabz_close_window\` to close.`;
        } else {
          resultText = `## Failed to Create Window

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

  // Update window tool
  registerTabzTool(server,
    "tabz_update_window",
    "Resize, move, focus, or restate a Chrome window (IDs from tabz_list_windows).",
    UpdateWindowSchema,
    async (params: UpdateWindowInput) => {
      try {
        const result = await updateWindow({
          windowId: params.windowId,
          state: params.state as WindowState | undefined,
          focused: params.focused,
          width: params.width,
          height: params.height,
          left: params.left,
          top: params.top,
          drawAttention: params.drawAttention
        });

        let resultText: string;
        if (result.success && result.window) {
          resultText = `## Window Updated

**Window ID:** ${result.window.windowId}
**State:** ${result.window.state}
**Size:** ${result.window.width}x${result.window.height}
**Position:** (${result.window.left}, ${result.window.top})`;
        } else {
          resultText = `## Failed to Update Window

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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

  // Close window tool
  registerTabzTool(server,
    "tabz_close_window",
    "Close a Chrome window and ALL of its tabs (IDs from tabz_list_windows).",
    CloseWindowSchema,
    async (params: CloseWindowInput) => {
      try {
        const result = await closeWindow(params.windowId);

        let resultText: string;
        if (result.success) {
          resultText = `## Window Closed

Successfully closed window ${params.windowId} and all its tabs.`;
        } else {
          resultText = `## Failed to Close Window

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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

  // Get displays tool
  registerTabzTool(server,
    "tabz_get_displays",
    "List the connected displays with dimensions, positions, and work areas.",
    GetDisplaysSchema,
    async (params: GetDisplaysInput) => {
      try {
        const result = await getDisplays();

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({ displays: result.displays }, null, 2);
        } else {
          if (result.displays.length === 0) {
            resultText = `# Displays\n\nNo displays found. This may indicate a permission issue.`;
          } else {
            const lines: string[] = [`# Displays (${result.displays.length})`, ""];

            for (const display of result.displays) {
              const primaryMarker = display.isPrimary ? " (Primary)" : "";
              lines.push(`## ${display.name}${primaryMarker}`);
              lines.push(`- **ID:** ${display.id}`);
              lines.push(`- **Full Size:** ${display.bounds.width}x${display.bounds.height}`);
              lines.push(`- **Work Area:** ${display.workArea.width}x${display.workArea.height}`);
              lines.push(`- **Position:** (${display.bounds.left}, ${display.bounds.top})`);
              if (display.rotation !== 0) lines.push(`- **Rotation:** ${display.rotation}°`);
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

  // Tile windows tool
  registerTabzTool(server,
    "tabz_tile_windows",
    "Arrange the named windows side by side, stacked, or in a grid on one display.",
    TileWindowsSchema,
    async (params: TileWindowsInput) => {
      try {
        const result = await tileWindows({
          windowIds: params.windowIds,
          layout: params.layout as TileLayout | undefined,
          displayId: params.displayId,
          gap: params.gap
        });

        let resultText: string;
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
        } else {
          resultText = `## Failed to Tile Windows

**Error:** ${result.error}

Use \`tabz_list_windows\` to get valid window IDs.`;
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

  // Popout terminal tool
  registerTabzTool(server,
    "tabz_popout_terminal",
    "Pop the terminal sidebar out into its own window; it shares the extension instance.",
    PopoutTerminalSchema,
    async (params: PopoutTerminalInput) => {
      try {
        const result = await popoutTerminal({
          terminalId: params.terminalId,
          width: params.width,
          height: params.height,
          left: params.left,
          top: params.top
        });

        let resultText: string;
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
        } else {
          resultText = `## Failed to Pop Out Terminal

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
}
