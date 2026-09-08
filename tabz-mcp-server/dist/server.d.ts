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
export declare const ALL_TOOL_IDS: string[];
export declare const CORE_TOOL_IDS: string[];
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
export declare function resolveEnabledTools(presetName?: string | undefined, backendUrl?: string): Promise<EnabledToolsResult>;
export declare function getEnabledTools(presetName?: string | undefined, backendUrl?: string): Promise<Set<string>>;
export declare const SERVER_INSTRUCTIONS: string;
export declare const TABZ_DOCS_DESCRIPTION: string;
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
export declare function createTabzServer(options?: CreateTabzServerOptions): Promise<TabzServer>;
//# sourceMappingURL=server.d.ts.map