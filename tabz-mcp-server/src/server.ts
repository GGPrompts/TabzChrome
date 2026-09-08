/**
 * Transport-neutral Tabz MCP server factory.
 *
 * Provides tools for Claude to interact with browser console and pages
 * via the TabzChrome extension (Chrome Extension APIs).
 *
 * Tool Groups:
 * - core: tabz_list_tabs, tabz_switch_tab, tabz_close_tab, tabz_rename_tab, tabz_get_page_info
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
import { registerConsoleTools } from "./tools/console.js";
import { registerScriptTools } from "./tools/script.js";
import { registerPageTools } from "./tools/page.js";
import { registerScreenshotTools } from "./tools/screenshot.js";
import { registerTabTools } from "./tools/tabs.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerLoginTools } from "./tools/login.js";
import { registerSecretTools } from "./tools/secrets.js";
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
import { registerTerminalTools } from "./tools/terminals.js";
import { registerActTools } from "./tools/act.js";
import { registerReadPageTools } from "./tools/read-page.js";
import { registerBatchTools } from "./tools/batch.js";
import { TOOL_DOCS } from "./tools/tool-docs.js";
import { z } from "zod";
import {
  BACKEND_URL,
  CREDENTIAL_GUIDANCE,
  NEVER_ASK_FOR_CREDENTIALS,
  SECRET_STORE_GUIDANCE
} from "./shared.js";
import { registerTabzTool } from "./register.js";
import { GROUP_RULE_SUMMARY } from "./descriptions.js";

const CONFIG_FETCH_TIMEOUT_MS = 2_000;

// All tool IDs by group (used for defaults when backend is unreachable)
export const ALL_TOOL_IDS = [
  'tabz_list_tabs', 'tabz_switch_tab', 'tabz_close_tab', 'tabz_rename_tab', 'tabz_get_page_info',
  'tabz_click', 'tabz_fill', 'tabz_act', 'tabz_batch', 'tabz_request_login', 'tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret',
  'tabz_screenshot', 'tabz_screenshot_full', 'tabz_download_image', 'tabz_get_element', 'tabz_read_page',
  'tabz_open_url',
  'tabz_get_console_logs', 'tabz_execute_script',
  'tabz_enable_network_capture', 'tabz_get_network_requests', 'tabz_clear_network_requests',
  'tabz_enable_deep_capture', 'tabz_disable_deep_capture', 'tabz_get_response_body',
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
  'tabz_list_plugins', 'tabz_list_skills', 'tabz_get_skill', 'tabz_plugins_health', 'tabz_toggle_plugin',
  'tabz_list_terminals', 'tabz_send_keys', 'tabz_capture_terminal',
  'tabz_docs'
];

// Unknown preset names fail closed to the established Core surface.
export const CORE_TOOL_IDS = [
  'tabz_list_tabs', 'tabz_switch_tab', 'tabz_close_tab', 'tabz_rename_tab',
  'tabz_get_page_info', 'tabz_claude_group_status', 'tabz_docs'
];

// Tool group registration functions
// Maps group names to their registration functions
type ToolGroupRegistrar = (server: McpServer, backendUrl?: string) => void;

const TOOL_GROUPS: Record<string, ToolGroupRegistrar> = {
  // Core tools (always required)
  core: (server, backendUrl = BACKEND_URL) => {
    registerTabTools(server);        // tabz_list_tabs, tabz_switch_tab, tabz_close_tab, tabz_rename_tab
    registerPageTools(server, backendUrl); // tabz_get_page_info
  },
  // Interaction tools
  interaction: (server) => {
    registerActTools(server);         // tabz_act
    registerBatchTools(server);       // tabz_batch
    registerInteractionTools(server); // tabz_click, tabz_fill
    registerLoginTools(server);       // tabz_request_login
    registerSecretTools(server);      // tabz_secret_request, tabz_secret_status, tabz_fill_secret
    registerScreenshotTools(server);  // tabz_screenshot, tabz_download_image
    registerInspectionTools(server);  // tabz_get_element
    registerReadPageTools(server);    // tabz_read_page
  },
  // Navigation tools
  navigation: (server) => {
    registerOmniboxTools(server);     // tabz_open_url
  },
  // Console tools
  console: (server, backendUrl = BACKEND_URL) => {
    registerConsoleTools(server, backendUrl); // tabz_get_console_logs
    registerScriptTools(server, backendUrl);  // tabz_execute_script
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
    registerNotificationTools(server); // tabz_notification_show, tabz_notification_update, tabz_notification_clear, tabz_notification_list
  },
  // Profile tools (terminal profiles CRUD and spawning)
  profiles: (server) => {
    registerProfileTools(server);      // tabz_list_profiles, tabz_list_categories, tabz_spawn_profile, tabz_get_profile, tabz_create_profile, tabz_update_profile, tabz_delete_profile
  },
  // Plugins tools (Claude Code plugin management)
  plugins: (server) => {
    registerPluginTools(server);       // tabz_list_plugins, tabz_list_skills, tabz_get_skill, tabz_plugins_health, tabz_toggle_plugin
  },
  // Terminal tools (list, send-keys, capture)
  terminals: (server) => {
    registerTerminalTools(server);     // tabz_list_terminals, tabz_send_keys, tabz_capture_terminal
  },
};

/**
 * Fetch preset tools from backend
 * Returns null if preset not found
 */
async function getPresetTools(presetName: string, backendUrl: string): Promise<string[] | null> {
  try {
    const response = await fetch(`${backendUrl}/api/mcp-presets`, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.error(`[MCP] Failed to fetch presets: HTTP ${response.status}`);
      return null;
    }
    const data = await response.json();
    const preset = data.presets?.[presetName];
    if (Array.isArray(preset?.tools) && preset.tools.length > 0) {
      const registered = new Set(ALL_TOOL_IDS);
      const tools = preset.tools.filter((id: unknown): id is string => typeof id === "string" && registered.has(id));
      if (tools.length === 0) {
        console.error(`[MCP] Preset "${presetName}" contains no tools registered by this build`);
        return null;
      }
      console.error(`[MCP] Using preset "${presetName}" with ${tools.length} registered tools`);
      return tools;
    }
    console.error(`[MCP] Preset "${presetName}" not found in saved presets`);
    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[MCP] Network error loading preset "${presetName}": ${errorMsg}`);
    return null;
  }
}

/**
 * Resolve a named preset or the saved enabled-tool configuration. Unknown
 * named presets fail closed to Core instead of falling through to mcp-config.
 */
export type PresetStatus = 'none' | 'applied' | 'unknown';

export interface EnabledToolsResult {
  tools: Set<string>;
  preset?: string;
  presetStatus: PresetStatus;
}

export async function resolveEnabledTools(
  presetName: string | undefined = process.env.MCP_PRESET,
  backendUrl: string = BACKEND_URL
): Promise<EnabledToolsResult> {
  if (presetName) {
    const presetTools = await getPresetTools(presetName, backendUrl);
    if (presetTools) {
      return { tools: new Set(presetTools), preset: presetName, presetStatus: 'applied' };
    }
    console.error(`[MCP] Preset "${presetName}" is unknown; restricting to ${CORE_TOOL_IDS.length} core tools`);
    return { tools: new Set(CORE_TOOL_IDS), preset: presetName, presetStatus: 'unknown' };
  }

  try {
    const response = await fetch(`${backendUrl}/api/mcp-config`, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = await response.json();
    const registered = new Set(ALL_TOOL_IDS);
    const configured: string[] = Array.isArray(config.enabledTools)
      ? config.enabledTools.filter((id: unknown): id is string => typeof id === "string" && registered.has(id))
      : ALL_TOOL_IDS;
    const enabled = new Set<string>(configured);
    console.error(`[MCP] Loaded ${enabled.size} enabled tools from backend`);

    // knownTools is the catalog snapshot from the user's last save. A current
    // tool absent from both lists is newly introduced and should be enabled;
    // known tools omitted from enabledTools are explicit disables and stay off.
    if (Array.isArray(config.knownTools)) {
      const known = new Set(config.knownTools.filter((id: unknown): id is string => typeof id === "string"));
      for (const id of ALL_TOOL_IDS) {
        if (!enabled.has(id) && !known.has(id)) enabled.add(id);
      }
    }
    return { tools: enabled, presetStatus: 'none' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[MCP] Failed to fetch mcp-config from ${backendUrl}: ${errorMsg}`);
    console.error(`[MCP] Falling back to all ${ALL_TOOL_IDS.length} tools`);
    return { tools: new Set(ALL_TOOL_IDS), presetStatus: 'none' };
  }
}

export async function getEnabledTools(
  presetName: string | undefined = process.env.MCP_PRESET,
  backendUrl: string = BACKEND_URL
): Promise<Set<string>> {
  return (await resolveEnabledTools(presetName, backendUrl)).tools;
}

/**
 * Create a filtered McpServer wrapper that only registers enabled tools
 *
 * Every current tool uses registerTabzTool/registerTool. server.tool remains
 * intercepted so a future accidental deprecated registration cannot bypass
 * preset filtering.
 */
function createFilteredServer(server: McpServer, enabledTools: Set<string>): McpServer {
  // Use 'any' casts to work around complex MCP SDK type signatures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverAny = server as any;

  // Intercept deprecated server.tool() as a defensive compatibility seam.
  const originalTool = serverAny.tool.bind(server);
  serverAny.tool = function(...allArgs: unknown[]) {
    const name = allArgs[0] as string;
    if (enabledTools.has(name)) {
      return originalTool(...allArgs);
    } else {
      console.error(`[MCP] Skipping disabled tool: ${name}`);
      return undefined;
    }
  };

  // Also intercept registerTool() for future compatibility
  if (serverAny.registerTool) {
    const originalRegisterTool = serverAny.registerTool.bind(server);
    serverAny.registerTool = function(...allArgs: unknown[]) {
      const name = allArgs[0] as string;
      if (enabledTools.has(name)) {
        return originalRegisterTool(...allArgs);
      } else {
        console.error(`[MCP] Skipping disabled tool: ${name}`);
        return undefined;
      }
    };
  }

  return server;
}

/**
 * Register all tool groups (filtering happens in createFilteredServer)
 */
function registerAllTools(server: McpServer, backendUrl: string): void {
  let registeredGroups = 0;

  for (const [groupName, registrar] of Object.entries(TOOL_GROUPS)) {
    registrar(server, backendUrl);
    registeredGroups++;
    console.error(`[MCP] Processing tool group: ${groupName}`);
  }

  console.error(`[MCP] Processed ${registeredGroups} tool groups`);
}

export const SERVER_INSTRUCTIONS =
  "You are sharing the user's real Chrome. Each MCP connection has its own enforced tab group, " +
  "titled with TABZ_AGENT_LABEL over stdio or X-Tabz-Agent over HTTP when set. " +
  "Call tabz_claude_group_status first. The first tab you open creates the group, and later browser " +
  "actions reject tab IDs outside it. Leave the user's other tabs and other connections' groups alone. " +
  "Close only tabs owned by this connection when done. Read compact page refs with tabz_read_page and use tabz_act for one action; refs expire after re-read, navigation, removal, or ownership change. " +
  "tabz_batch runs enabled tools sequentially and stops at the first error. Never automatically replay an uncertain mutation. Filter console output by level and network output by URL pattern. " +
  CREDENTIAL_GUIDANCE + " " + SECRET_STORE_GUIDANCE;

export const TABZ_DOCS_DESCRIPTION =
  "Get full documentation for one tabz tool. " +
  GROUP_RULE_SUMMARY + " " + NEVER_ASK_FOR_CREDENTIALS;

export interface CreateTabzServerOptions {
  /** null explicitly selects mcp-config without inheriting MCP_PRESET. */
  preset?: string | null;
  backendUrl?: string;
}

export interface TabzServer {
  server: McpServer;
  enabledTools: Set<string>;
  preset?: string;
  presetStatus: PresetStatus;
}

/** Build a server instance that can be connected to any MCP transport. */
export async function createTabzServer(options: CreateTabzServerOptions = {}): Promise<TabzServer> {
  const backendUrl = options.backendUrl ?? BACKEND_URL;
  const server = new McpServer(
    { name: "tabz-mcp-server", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );

  // Register tabz_docs tool directly (always available, not gated by TOOL_GROUPS)
  registerTabzTool(server,
    'tabz_docs',
    TABZ_DOCS_DESCRIPTION,
    z.object({ tool_name: z.string().describe('Tool name, e.g. "tabz_act".') }).strict(),
    async ({ tool_name }) => {
      const doc = TOOL_DOCS[tool_name];
      if (!doc) {
        const available = Object.keys(TOOL_DOCS).sort().join(', ');
        return { content: [{ type: 'text' as const, text: `Unknown tool: ${tool_name}.\n\nAvailable tools with docs:\n${available}` }] };
      }
      return { content: [{ type: 'text' as const, text: doc }] };
    }
  );

  // Fetch enabled tools from backend (or use all tools)
  const presetName = options.preset === null ? "" : options.preset ?? process.env.MCP_PRESET;
  const { tools: enabledTools, preset, presetStatus } = await resolveEnabledTools(presetName, backendUrl);

  // Create filtered server that only registers enabled tools
  const filteredServer = createFilteredServer(server, enabledTools);

  // Register all tool groups (filtering happens automatically)
  registerAllTools(filteredServer, backendUrl);

  return { server, enabledTools, preset, presetStatus };
}
