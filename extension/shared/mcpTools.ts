/**
 * MCP Tools configuration
 * Shared between dashboard settings and chat bar autocomplete
 */

export interface McpTool {
  id: string
  name: string
  desc: string
  tokens: number
  locked?: boolean
  category?: string
}

/**
 * All available MCP tools with metadata
 */
export const MCP_TOOLS: McpTool[] = [
  // Core tools (always enabled)
  { id: 'tabz_list_tabs', name: 'List Tabs', desc: 'List all open browser tabs', tokens: 974, locked: true, category: 'Core' },
  { id: 'tabz_switch_tab', name: 'Switch Tab', desc: 'Switch to a specific tab by ID', tokens: 940, locked: true, category: 'Core' },
  { id: 'tabz_rename_tab', name: 'Rename Tab', desc: 'Assign custom names to tabs', tokens: 1000, locked: true, category: 'Core' },
  { id: 'tabz_get_page_info', name: 'Page Info', desc: 'Get URL and title of current page', tokens: 885, locked: true, category: 'Core' },
  // Interaction tools
  { id: 'tabz_click', name: 'Click', desc: 'Click elements by CSS selector', tokens: 986, category: 'Interaction' },
  { id: 'tabz_fill', name: 'Fill', desc: 'Fill form inputs with text', tokens: 1100, category: 'Interaction' },
  // Screenshot tools
  { id: 'tabz_screenshot', name: 'Screenshot', desc: 'Capture viewport (visible area)', tokens: 995, category: 'Screenshot' },
  { id: 'tabz_screenshot_full', name: 'Screenshot Full', desc: 'Capture entire scrollable page', tokens: 1100, category: 'Screenshot' },
  { id: 'tabz_download_image', name: 'Download Image', desc: 'Download images from pages', tokens: 1000, category: 'Screenshot' },
  { id: 'tabz_get_element', name: 'Inspect Element', desc: 'Get HTML/CSS details of elements', tokens: 1300, category: 'Inspection' },
  // Navigation
  { id: 'tabz_open_url', name: 'Open URL', desc: 'Open allowed URLs (GitHub, localhost, etc.)', tokens: 1600, category: 'Navigation' },
  // Console/Script
  { id: 'tabz_get_console_logs', name: 'Console Logs', desc: 'View browser console output', tokens: 1100, category: 'Console' },
  { id: 'tabz_execute_script', name: 'Execute Script', desc: 'Run JavaScript in browser tab', tokens: 1100, category: 'Console' },
  // Network monitoring
  { id: 'tabz_enable_network_capture', name: 'Enable Network', desc: 'Start capturing network requests', tokens: 950, category: 'Network' },
  { id: 'tabz_get_network_requests', name: 'Network Requests', desc: 'List captured XHR/fetch requests', tokens: 1400, category: 'Network' },
  { id: 'tabz_clear_network_requests', name: 'Clear Network', desc: 'Clear captured requests', tokens: 400, category: 'Network' },
  // Downloads
  { id: 'tabz_download_file', name: 'Download File', desc: 'Download any URL to disk', tokens: 1200, category: 'Downloads' },
  { id: 'tabz_get_downloads', name: 'List Downloads', desc: 'List recent downloads with status', tokens: 1000, category: 'Downloads' },
  { id: 'tabz_cancel_download', name: 'Cancel Download', desc: 'Cancel in-progress download', tokens: 500, category: 'Downloads' },
  { id: 'tabz_save_page', name: 'Save Page', desc: 'Save page as MHTML for offline analysis', tokens: 1300, category: 'Downloads' },
  // Bookmarks
  { id: 'tabz_get_bookmark_tree', name: 'Bookmark Tree', desc: 'Get bookmark folder hierarchy', tokens: 1200, category: 'Bookmarks' },
  { id: 'tabz_search_bookmarks', name: 'Search Bookmarks', desc: 'Find bookmarks by title/URL', tokens: 900, category: 'Bookmarks' },
  { id: 'tabz_save_bookmark', name: 'Save Bookmark', desc: 'Add URL to bookmarks', tokens: 1000, category: 'Bookmarks' },
  { id: 'tabz_create_folder', name: 'Create Folder', desc: 'Create bookmark folder', tokens: 800, category: 'Bookmarks' },
  { id: 'tabz_move_bookmark', name: 'Move Bookmark', desc: 'Move to different folder', tokens: 800, category: 'Bookmarks' },
  { id: 'tabz_delete_bookmark', name: 'Delete Bookmark', desc: 'Remove bookmark or folder', tokens: 600, category: 'Bookmarks' },
  // Debugger (chrome.debugger API - DevTools access)
  { id: 'tabz_get_dom_tree', name: 'DOM Tree', desc: 'Get full DOM structure via DevTools', tokens: 1400, category: 'Debugger' },
  { id: 'tabz_profile_performance', name: 'Performance', desc: 'Profile timing, memory, DOM metrics', tokens: 1300, category: 'Debugger' },
  { id: 'tabz_get_coverage', name: 'Coverage', desc: 'JS/CSS code coverage analysis', tokens: 1200, category: 'Debugger' },
  // Tab Groups (chrome.tabGroups API)
  { id: 'tabz_list_groups', name: 'List Groups', desc: 'List all tab groups with their tabs', tokens: 1000, category: 'Tab Groups' },
  { id: 'tabz_create_group', name: 'Create Group', desc: 'Group tabs with title and color', tokens: 1100, category: 'Tab Groups' },
  { id: 'tabz_update_group', name: 'Update Group', desc: 'Change group title, color, collapsed', tokens: 900, category: 'Tab Groups' },
  { id: 'tabz_add_to_group', name: 'Add to Group', desc: 'Add tabs to existing group', tokens: 800, category: 'Tab Groups' },
  { id: 'tabz_ungroup_tabs', name: 'Ungroup Tabs', desc: 'Remove tabs from their groups', tokens: 700, category: 'Tab Groups' },
  { id: 'tabz_claude_group_add', name: 'Claude Add', desc: 'Add tab to Claude Active group', tokens: 900, category: 'Tab Groups' },
  { id: 'tabz_claude_group_remove', name: 'Claude Remove', desc: 'Remove tab from Claude group', tokens: 700, category: 'Tab Groups' },
  { id: 'tabz_claude_group_status', name: 'Claude Status', desc: 'Check Claude Active group', tokens: 800, category: 'Tab Groups' },
  // Windows (chrome.windows API)
  { id: 'tabz_list_windows', name: 'List Windows', desc: 'List all browser windows with dimensions', tokens: 1000, category: 'Windows' },
  { id: 'tabz_create_window', name: 'Create Window', desc: 'Create new popup or normal window', tokens: 1200, category: 'Windows' },
  { id: 'tabz_update_window', name: 'Update Window', desc: 'Resize, move, minimize, maximize window', tokens: 1000, category: 'Windows' },
  { id: 'tabz_close_window', name: 'Close Window', desc: 'Close window and all its tabs', tokens: 600, category: 'Windows' },
  { id: 'tabz_get_displays', name: 'Get Displays', desc: 'Get monitor info for multi-monitor layouts', tokens: 1100, category: 'Windows' },
  { id: 'tabz_tile_windows', name: 'Tile Windows', desc: 'Auto-arrange windows in grid/splits', tokens: 1300, category: 'Windows' },
  { id: 'tabz_popout_terminal', name: 'Popout Terminal', desc: 'Pop sidebar to standalone popup window', tokens: 1000, category: 'Windows' },
  // Audio (TTS via edge-tts)
  { id: 'tabz_speak', name: 'Speak', desc: 'Text-to-speech announcement', tokens: 1200, category: 'Audio' },
  { id: 'tabz_list_voices', name: 'List Voices', desc: 'Show available TTS voices', tokens: 600, category: 'Audio' },
  { id: 'tabz_play_audio', name: 'Play Audio', desc: 'Play audio file by URL', tokens: 800, category: 'Audio' },
  // History tools (chrome.history API)
  { id: 'tabz_history_search', name: 'History Search', desc: 'Search browsing history by keyword', tokens: 1200, category: 'History' },
  { id: 'tabz_history_visits', name: 'History Visits', desc: 'Get visit details for a URL', tokens: 1000, category: 'History' },
  { id: 'tabz_history_recent', name: 'Recent History', desc: 'Get recent history entries', tokens: 1100, category: 'History' },
  { id: 'tabz_history_delete_url', name: 'Delete URL', desc: 'Remove URL from history', tokens: 800, category: 'History' },
  { id: 'tabz_history_delete_range', name: 'Delete Range', desc: 'Clear history date range', tokens: 900, category: 'History' },
  // Sessions tools (chrome.sessions API)
  { id: 'tabz_sessions_recently_closed', name: 'Recently Closed', desc: 'List recently closed tabs/windows', tokens: 1000, category: 'Sessions' },
  { id: 'tabz_sessions_restore', name: 'Restore Session', desc: 'Restore closed tab or window', tokens: 900, category: 'Sessions' },
  { id: 'tabz_sessions_devices', name: 'Synced Devices', desc: 'Tabs on other Chrome devices', tokens: 1100, category: 'Sessions' },
  // Cookies tools (chrome.cookies API)
  { id: 'tabz_cookies_get', name: 'Get Cookie', desc: 'Get specific cookie by name', tokens: 900, category: 'Cookies' },
  { id: 'tabz_cookies_list', name: 'List Cookies', desc: 'List cookies for a domain', tokens: 1000, category: 'Cookies' },
  { id: 'tabz_cookies_set', name: 'Set Cookie', desc: 'Create or update a cookie', tokens: 1100, category: 'Cookies' },
  { id: 'tabz_cookies_delete', name: 'Delete Cookie', desc: 'Remove a specific cookie', tokens: 800, category: 'Cookies' },
  { id: 'tabz_cookies_audit', name: 'Audit Cookies', desc: 'Analyze cookies, find trackers', tokens: 1300, category: 'Cookies' },
  // Emulation tools (CDP Emulation)
  { id: 'tabz_emulate_device', name: 'Emulate Device', desc: 'Mobile/tablet viewport simulation', tokens: 1200, category: 'Emulation' },
  { id: 'tabz_emulate_clear', name: 'Clear Emulation', desc: 'Reset all emulation overrides', tokens: 600, category: 'Emulation' },
  { id: 'tabz_emulate_geolocation', name: 'Spoof Location', desc: 'Fake GPS coordinates', tokens: 900, category: 'Emulation' },
  { id: 'tabz_emulate_network', name: 'Network Throttle', desc: 'Simulate 3G, offline, etc.', tokens: 1000, category: 'Emulation' },
  { id: 'tabz_emulate_media', name: 'Media Emulation', desc: 'Print mode, dark mode pref', tokens: 900, category: 'Emulation' },
  { id: 'tabz_emulate_vision', name: 'Vision Deficiency', desc: 'Colorblindness simulation', tokens: 900, category: 'Emulation' },
  // Notification tools (chrome.notifications API)
  { id: 'tabz_notification_show', name: 'Show Notification', desc: 'Desktop notification', tokens: 1000, category: 'Notifications' },
  { id: 'tabz_notification_update', name: 'Update Notification', desc: 'Modify existing notification', tokens: 800, category: 'Notifications' },
  { id: 'tabz_notification_progress', name: 'Progress Notification', desc: 'Show progress bar notification', tokens: 900, category: 'Notifications' },
  { id: 'tabz_notification_clear', name: 'Clear Notification', desc: 'Dismiss a notification', tokens: 600, category: 'Notifications' },
  { id: 'tabz_notification_list', name: 'List Notifications', desc: 'Get active notifications', tokens: 800, category: 'Notifications' },
]

/**
 * Core tool IDs that are always enabled
 */
export const CORE_TOOL_IDS = MCP_TOOLS.filter(t => t.locked).map(t => t.id)

/**
 * All tool IDs
 */
export const ALL_TOOL_IDS = MCP_TOOLS.map(t => t.id)

/**
 * Filter MCP tools by search query
 * Matches against id, name, and description
 */
export function filterMcpTools(query: string): McpTool[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()

  return MCP_TOOLS.filter(tool =>
    tool.id.toLowerCase().includes(lowerQuery) ||
    tool.name.toLowerCase().includes(lowerQuery) ||
    tool.desc.toLowerCase().includes(lowerQuery)
  )
}
