#!/usr/bin/env node
/**
 * Tabz MCP Server
 *
 * Provides tools for Claude to interact with browser console and pages
 * via the TabzChrome extension (Chrome Extension APIs).
 *
 * Tool Groups:
 * - core: tabz_list_tabs, tabz_switch_tab, tabz_rename_tab, tabz_get_page_info
 * - interaction: tabz_click, tabz_fill, tabz_screenshot, tabz_download_image, tabz_get_element
 * - navigation: tabz_open_url
 * - console: tabz_get_console_logs, tabz_execute_script
 * - network: tabz_enable_network_capture, tabz_get_network_requests, tabz_clear_network_requests
 * - downloads: tabz_download_file, tabz_get_downloads, tabz_cancel_download, tabz_save_page
 * - bookmarks: tabz_get_bookmark_tree, tabz_search_bookmarks, tabz_save_bookmark, tabz_create_folder, tabz_move_bookmark, tabz_delete_bookmark
 * - debugger: tabz_get_dom_tree, tabz_profile_performance, tabz_get_coverage
 * - tabgroups: tabz_list_groups, tabz_create_group, tabz_update_group, tabz_add_to_group, tabz_ungroup_tabs, tabz_claude_group_add, tabz_claude_group_remove, tabz_claude_group_status
 * - windows: tabz_list_windows, tabz_create_window, tabz_update_window, tabz_close_window, tabz_get_displays, tabz_tile_windows, tabz_popout_terminal
 * - audio: tabz_speak, tabz_list_voices, tabz_play_audio
 * - history: tabz_history_search, tabz_history_visits, tabz_history_recent, tabz_history_delete_url, tabz_history_delete_range
 * - cookies: (future) tabz_check_auth, tabz_get_cookies
 * - profiles: tabz_list_profiles, tabz_list_categories, tabz_spawn_profile, tabz_get_profile, tabz_create_profile, tabz_update_profile, tabz_delete_profile
 * - plugins: tabz_list_plugins, tabz_list_skills, tabz_get_skill, tabz_plugins_health, tabz_toggle_plugin
 *
 * Tool groups can be configured via the backend /api/mcp-config endpoint.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerConsoleTools } from "./tools/console.js";
import { registerScriptTools } from "./tools/script.js";
import { registerPageTools } from "./tools/page.js";
import { registerScreenshotTools } from "./tools/screenshot.js";
import { registerTabTools } from "./tools/tabs.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { registerOmniboxTools } from "./tools/omnibox.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerDownloadTools } from "./tools/downloads.js";
import { registerBookmarkTools } from "./tools/bookmarks.js";
import { registerDebuggerTools } from "./tools/debugger.js";
import { registerTabGroupTools } from "./tools/tabGroups.js";
import { registerWindowTools } from "./tools/windows.js";
import { registerAudioTools } from "./tools/audio.js";
import { registerHistoryTools } from "./tools/history.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerCookieTools } from "./tools/cookies.js";
import { registerEmulationTools } from "./tools/emulation.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerProfileTools } from "./tools/profiles.js";
import { registerPluginTools } from "./tools/plugins.js";

// Backend URL (TabzChrome backend running in WSL)
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8129";

// All tool IDs by group (used for defaults when backend is unreachable)
const ALL_TOOL_IDS = [
  'tabz_list_tabs', 'tabz_switch_tab', 'tabz_rename_tab', 'tabz_get_page_info',
  'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_screenshot_full', 'tabz_download_image', 'tabz_get_element',
  'tabz_open_url',
  'tabz_get_console_logs', 'tabz_execute_script',
  'tabz_enable_network_capture', 'tabz_get_network_requests', 'tabz_clear_network_requests',
  'tabz_download_file', 'tabz_get_downloads', 'tabz_cancel_download', 'tabz_save_page',
  'tabz_get_bookmark_tree', 'tabz_search_bookmarks', 'tabz_save_bookmark', 'tabz_create_folder', 'tabz_move_bookmark', 'tabz_delete_bookmark',
  'tabz_get_dom_tree', 'tabz_profile_performance', 'tabz_get_coverage',
  'tabz_list_groups', 'tabz_create_group', 'tabz_update_group', 'tabz_add_to_group', 'tabz_ungroup_tabs', 'tabz_claude_group_add', 'tabz_claude_group_remove', 'tabz_claude_group_status',
  'tabz_list_windows', 'tabz_create_window', 'tabz_update_window', 'tabz_close_window', 'tabz_get_displays', 'tabz_tile_windows', 'tabz_popout_terminal',
  'tabz_speak', 'tabz_list_voices', 'tabz_play_audio',
  'tabz_history_search', 'tabz_history_visits', 'tabz_history_recent', 'tabz_history_delete_url', 'tabz_history_delete_range',
  'tabz_sessions_recently_closed', 'tabz_sessions_restore', 'tabz_sessions_devices',
  'tabz_cookies_get', 'tabz_cookies_list', 'tabz_cookies_set', 'tabz_cookies_delete', 'tabz_cookies_audit',
  'tabz_emulate_device', 'tabz_emulate_clear', 'tabz_emulate_geolocation', 'tabz_emulate_network', 'tabz_emulate_media', 'tabz_emulate_vision',
  'tabz_notification_show', 'tabz_notification_update', 'tabz_notification_clear', 'tabz_notification_list',
  'tabz_list_profiles', 'tabz_list_categories', 'tabz_spawn_profile', 'tabz_get_profile', 'tabz_create_profile', 'tabz_update_profile', 'tabz_delete_profile',
  'tabz_list_plugins', 'tabz_list_skills', 'tabz_get_skill', 'tabz_plugins_health', 'tabz_toggle_plugin'
];

// Tool group registration functions
// Maps group names to their registration functions
type ToolGroupRegistrar = (server: McpServer, backendUrl?: string) => void;

const TOOL_GROUPS: Record<string, ToolGroupRegistrar> = {
  // Core tools (always required)
  core: (server) => {
    registerTabTools(server);        // tabz_list_tabs, tabz_switch_tab, tabz_rename_tab
    registerPageTools(server, BACKEND_URL); // tabz_get_page_info
  },
  // Interaction tools
  interaction: (server) => {
    registerInteractionTools(server); // tabz_click, tabz_fill
    registerScreenshotTools(server);  // tabz_screenshot, tabz_download_image
    registerInspectionTools(server);  // tabz_get_element
  },
  // Navigation tools
  navigation: (server) => {
    registerOmniboxTools(server);     // tabz_open_url
  },
  // Console tools
  console: (server) => {
    registerConsoleTools(server, BACKEND_URL); // tabz_get_console_logs
    registerScriptTools(server, BACKEND_URL);  // tabz_execute_script
  },
  // Network monitoring tools (chrome.webRequest API)
  network: (server) => {
    registerNetworkTools(server);     // tabz_enable_network_capture, tabz_get_network_requests, tabz_clear_network_requests
  },
  // Download tools (Chrome downloads + pageCapture API)
  downloads: (server) => {
    registerDownloadTools(server);    // tabz_download_file, tabz_get_downloads, tabz_cancel_download, tabz_save_page
  },
  // Bookmark tools (Chrome bookmarks API)
  bookmarks: (server) => {
    registerBookmarkTools(server);    // tabz_get_bookmark_tree, tabz_search_bookmarks, tabz_save_bookmark, tabz_create_folder, tabz_move_bookmark, tabz_delete_bookmark
  },
  // Debugger tools (Chrome debugger API - DevTools access)
  debugger: (server) => {
    registerDebuggerTools(server);    // tabz_get_dom_tree, tabz_profile_performance, tabz_get_coverage
  },
  // Tab Groups tools (Chrome tabGroups API)
  tabgroups: (server) => {
    registerTabGroupTools(server);    // tabz_list_groups, tabz_create_group, tabz_update_group, tabz_add_to_group, tabz_ungroup_tabs, tabz_claude_group_*
  },
  // Window management tools (Chrome windows API)
  windows: (server) => {
    registerWindowTools(server);      // tabz_list_windows, tabz_create_window, tabz_update_window, tabz_close_window, tabz_get_displays, tabz_tile_windows, tabz_popout_terminal
  },
  // Audio tools (TTS + playback)
  audio: (server) => {
    registerAudioTools(server);       // tabz_speak, tabz_list_voices, tabz_play_audio
  },
  // History tools (Chrome history API)
  history: (server) => {
    registerHistoryTools(server);     // tabz_history_search, tabz_history_visits, tabz_history_recent, tabz_history_delete_url, tabz_history_delete_range
  },
  // Sessions tools (Chrome sessions API)
  sessions: (server) => {
    registerSessionTools(server);    // tabz_sessions_recently_closed, tabz_sessions_restore, tabz_sessions_devices
  },
  // Cookies tools (Chrome cookies API)
  cookies: (server) => {
    registerCookieTools(server);     // tabz_cookies_get, tabz_cookies_list, tabz_cookies_set, tabz_cookies_delete, tabz_cookies_audit
  },
  // Emulation tools (Chrome debugger CDP)
  emulation: (server) => {
    registerEmulationTools(server);   // tabz_emulate_device, tabz_emulate_clear, tabz_emulate_geolocation, tabz_emulate_network, tabz_emulate_media, tabz_emulate_vision
  },
  // Notifications tools (Chrome notifications API)
  notifications: (server) => {
    registerNotificationTools(server); // tabz_notification_show, tabz_notification_update, tabz_notification_progress, tabz_notification_clear, tabz_notification_list
  },
  // Profile tools (terminal profiles CRUD and spawning)
  profiles: (server) => {
    registerProfileTools(server);      // tabz_list_profiles, tabz_list_categories, tabz_spawn_profile, tabz_get_profile, tabz_create_profile, tabz_update_profile, tabz_delete_profile
  },
  // Plugins tools (Claude Code plugin management)
  plugins: (server) => {
    registerPluginTools(server);       // tabz_list_plugins, tabz_list_skills, tabz_get_skill, tabz_plugins_health, tabz_toggle_plugin
  },
};

/**
 * Fetch preset tools from backend
 * Returns null if preset not found
 */
async function getPresetTools(presetName: string): Promise<string[] | null> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/mcp-presets`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const preset = data.presets?.[presetName];
    if (preset?.tools) {
      console.error(`[MCP] Using preset "${presetName}" with ${preset.tools.length} tools`);
      return preset.tools;
    }
    console.error(`[MCP] Preset "${presetName}" not found`);
    return null;
  } catch {
    console.error(`[MCP] Failed to load preset "${presetName}"`);
    return null;
  }
}

/**
 * Fetch enabled tool IDs from the backend
 * Checks MCP_PRESET env var first, then falls back to mcp-config
 */
async function getEnabledTools(): Promise<Set<string>> {
  // Check for preset override via environment variable
  const presetName = process.env.MCP_PRESET;
  if (presetName) {
    const presetTools = await getPresetTools(presetName);
    if (presetTools) {
      return new Set(presetTools);
    }
    // Preset not found, fall through to default config
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/mcp-config`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = await response.json();
    const tools = config.enabledTools || ALL_TOOL_IDS;
    console.error(`[MCP] Loaded ${tools.length} enabled tools from backend`);
    return new Set(tools);
  } catch {
    console.error(`[MCP] Backend not reachable, enabling all ${ALL_TOOL_IDS.length} tools`);
    return new Set(ALL_TOOL_IDS);
  }
}

/**
 * Create a filtered McpServer wrapper that only registers enabled tools
 */
function createFilteredServer(server: McpServer, enabledTools: Set<string>): McpServer {
  const originalTool = server.tool.bind(server);

  // Override server.tool to filter based on enabledTools
  server.tool = function(name: string, ...args: Parameters<typeof server.tool> extends [string, ...infer R] ? R : never) {
    if (enabledTools.has(name)) {
      return originalTool(name, ...args);
    } else {
      console.error(`[MCP] Skipping disabled tool: ${name}`);
      return undefined as unknown as ReturnType<typeof server.tool>;
    }
  } as typeof server.tool;

  return server;
}

/**
 * Register all tool groups (filtering happens in createFilteredServer)
 */
function registerAllTools(server: McpServer): void {
  let registeredGroups = 0;

  for (const [groupName, registrar] of Object.entries(TOOL_GROUPS)) {
    registrar(server, BACKEND_URL);
    registeredGroups++;
    console.error(`[MCP] Processing tool group: ${groupName}`);
  }

  console.error(`[MCP] Processed ${registeredGroups} tool groups`);
}

// Create MCP server instance
const server = new McpServer({
  name: "tabz-mcp-server",
  version: "1.0.0"
});

// Main function
async function main() {
  // Fetch enabled tools from backend (or use all tools)
  const enabledTools = await getEnabledTools();

  // Create filtered server that only registers enabled tools
  const filteredServer = createFilteredServer(server, enabledTools);

  // Register all tool groups (filtering happens automatically)
  registerAllTools(filteredServer);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log to stderr (stdout is used for MCP protocol)
  console.error("Tabz MCP server running via stdio");
  console.error(`Backend URL: ${BACKEND_URL}`);
  console.error(`Enabled tools: ${enabledTools.size} of ${ALL_TOOL_IDS.length}`);
}

// Run the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
