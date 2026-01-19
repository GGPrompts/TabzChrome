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
  triggers?: string[]  // Natural language phrases that should match this tool
}

export interface PluginSkill {
  id: string
  name: string
  desc: string
  pluginId: string
  pluginName: string
  marketplace: string
  category: 'Plugin'
}

export type AutocompleteSuggestion = McpTool | PluginSkill

/**
 * Check if suggestion is a plugin skill
 */
export function isPluginSkill(suggestion: AutocompleteSuggestion): suggestion is PluginSkill {
  return 'pluginId' in suggestion
}

/**
 * All available MCP tools with metadata and natural language triggers
 */
export const MCP_TOOLS: McpTool[] = [
  // Core tools (always enabled)
  { id: 'tabz_list_tabs', name: 'List Tabs', desc: 'List all open browser tabs', tokens: 974, locked: true, category: 'Core',
    triggers: ['what tabs are open', 'show my tabs', 'list browser tabs', 'which tabs', 'all tabs'] },
  { id: 'tabz_switch_tab', name: 'Switch Tab', desc: 'Switch to a specific tab by ID', tokens: 940, locked: true, category: 'Core',
    triggers: ['go to tab', 'switch to tab', 'change tab', 'focus tab', 'activate tab'] },
  { id: 'tabz_rename_tab', name: 'Rename Tab', desc: 'Assign custom names to tabs', tokens: 1000, locked: true, category: 'Core',
    triggers: ['name this tab', 'rename tab', 'label tab', 'set tab name'] },
  { id: 'tabz_get_page_info', name: 'Page Info', desc: 'Get URL and title of current page', tokens: 885, locked: true, category: 'Core',
    triggers: ['what page is this', 'current url', 'page url', 'what site', 'where am i'] },
  // Interaction tools
  { id: 'tabz_click', name: 'Click', desc: 'Click elements by CSS selector', tokens: 986, category: 'Interaction',
    triggers: ['click the button', 'click on', 'press the button', 'tap', 'click element'] },
  { id: 'tabz_fill', name: 'Fill', desc: 'Fill form inputs with text', tokens: 1100, category: 'Interaction',
    triggers: ['fill the form', 'type in', 'enter text', 'fill input', 'type into', 'fill out'] },
  // Screenshot tools
  { id: 'tabz_screenshot', name: 'Screenshot', desc: 'Capture viewport (visible area)', tokens: 995, category: 'Screenshot',
    triggers: ['take a screenshot', 'screenshot my view', 'capture screen', 'what do i see', 'show me the page', 'screenshot this'] },
  { id: 'tabz_screenshot_full', name: 'Screenshot Full', desc: 'Capture entire scrollable page', tokens: 1100, category: 'Screenshot',
    triggers: ['full page screenshot', 'capture entire page', 'screenshot whole page', 'show me everything', 'capture all'] },
  { id: 'tabz_download_image', name: 'Download Image', desc: 'Download images from pages', tokens: 1000, category: 'Screenshot',
    triggers: ['download this image', 'save image', 'grab that picture', 'download photo', 'save that image'] },
  { id: 'tabz_get_element', name: 'Inspect Element', desc: 'Get HTML/CSS details of elements', tokens: 1300, category: 'Inspection',
    triggers: ['inspect element', 'show html', 'get element details', 'examine element', 'element info'] },
  // Navigation
  { id: 'tabz_open_url', name: 'Open URL', desc: 'Open allowed URLs (GitHub, localhost, etc.)', tokens: 1600, category: 'Navigation',
    triggers: ['open url', 'go to website', 'navigate to', 'open page', 'visit site', 'open link'] },
  // Console/Script
  { id: 'tabz_get_console_logs', name: 'Console Logs', desc: 'View browser console output', tokens: 1100, category: 'Console',
    triggers: ['show console', 'console logs', 'browser errors', 'javascript errors', 'check console'] },
  { id: 'tabz_execute_script', name: 'Execute Script', desc: 'Run JavaScript in browser tab', tokens: 1100, category: 'Console',
    triggers: ['run javascript', 'execute js', 'run script', 'run code in browser', 'inject script'] },
  // Network monitoring
  { id: 'tabz_enable_network_capture', name: 'Enable Network', desc: 'Start capturing network requests', tokens: 950, category: 'Network',
    triggers: ['monitor network', 'capture requests', 'start network capture', 'watch api calls', 'track requests'] },
  { id: 'tabz_get_network_requests', name: 'Network Requests', desc: 'List captured XHR/fetch requests', tokens: 1400, category: 'Network',
    triggers: ['show network requests', 'api calls', 'what requests', 'network traffic', 'http requests'] },
  { id: 'tabz_clear_network_requests', name: 'Clear Network', desc: 'Clear captured requests', tokens: 400, category: 'Network',
    triggers: ['clear network', 'reset network capture', 'clear requests'] },
  // Downloads
  { id: 'tabz_download_file', name: 'Download File', desc: 'Download any URL to disk', tokens: 1200, category: 'Downloads',
    triggers: ['download file', 'save file', 'download from url', 'fetch file'] },
  { id: 'tabz_get_downloads', name: 'List Downloads', desc: 'List recent downloads with status', tokens: 1000, category: 'Downloads',
    triggers: ['show downloads', 'recent downloads', 'download history', 'what downloaded'] },
  { id: 'tabz_cancel_download', name: 'Cancel Download', desc: 'Cancel in-progress download', tokens: 500, category: 'Downloads',
    triggers: ['cancel download', 'stop download', 'abort download'] },
  { id: 'tabz_save_page', name: 'Save Page', desc: 'Save page as MHTML for offline analysis', tokens: 1300, category: 'Downloads',
    triggers: ['save page', 'save webpage', 'download page', 'save for offline'] },
  // Bookmarks
  { id: 'tabz_get_bookmark_tree', name: 'Bookmark Tree', desc: 'Get bookmark folder hierarchy', tokens: 1200, category: 'Bookmarks',
    triggers: ['show bookmarks', 'bookmark folders', 'list bookmarks', 'my bookmarks'] },
  { id: 'tabz_search_bookmarks', name: 'Search Bookmarks', desc: 'Find bookmarks by title/URL', tokens: 900, category: 'Bookmarks',
    triggers: ['find bookmark', 'search bookmarks', 'look for bookmark'] },
  { id: 'tabz_save_bookmark', name: 'Save Bookmark', desc: 'Add URL to bookmarks', tokens: 1000, category: 'Bookmarks',
    triggers: ['bookmark this', 'save bookmark', 'add bookmark', 'bookmark page'] },
  { id: 'tabz_create_folder', name: 'Create Folder', desc: 'Create bookmark folder', tokens: 800, category: 'Bookmarks',
    triggers: ['create bookmark folder', 'new folder', 'make folder'] },
  { id: 'tabz_move_bookmark', name: 'Move Bookmark', desc: 'Move to different folder', tokens: 800, category: 'Bookmarks',
    triggers: ['move bookmark', 'organize bookmark', 'relocate bookmark'] },
  { id: 'tabz_delete_bookmark', name: 'Delete Bookmark', desc: 'Remove bookmark or folder', tokens: 600, category: 'Bookmarks',
    triggers: ['delete bookmark', 'remove bookmark', 'unbookmark'] },
  // Debugger (chrome.debugger API - DevTools access)
  { id: 'tabz_get_dom_tree', name: 'DOM Tree', desc: 'Get full DOM structure via DevTools', tokens: 1400, category: 'Debugger',
    triggers: ['show dom', 'dom structure', 'html tree', 'page structure'] },
  { id: 'tabz_profile_performance', name: 'Performance', desc: 'Profile timing, memory, DOM metrics', tokens: 1300, category: 'Debugger',
    triggers: ['check performance', 'page speed', 'performance metrics', 'how fast', 'memory usage'] },
  { id: 'tabz_get_coverage', name: 'Coverage', desc: 'JS/CSS code coverage analysis', tokens: 1200, category: 'Debugger',
    triggers: ['code coverage', 'unused code', 'coverage report', 'dead code'] },
  // Tab Groups (chrome.tabGroups API)
  { id: 'tabz_list_groups', name: 'List Groups', desc: 'List all tab groups with their tabs', tokens: 1000, category: 'Tab Groups',
    triggers: ['show tab groups', 'list groups', 'my tab groups', 'grouped tabs'] },
  { id: 'tabz_create_group', name: 'Create Group', desc: 'Group tabs with title and color', tokens: 1100, category: 'Tab Groups',
    triggers: ['create tab group', 'group these tabs', 'make a group', 'new tab group'] },
  { id: 'tabz_update_group', name: 'Update Group', desc: 'Change group title, color, collapsed', tokens: 900, category: 'Tab Groups',
    triggers: ['rename group', 'change group color', 'update group', 'collapse group'] },
  { id: 'tabz_add_to_group', name: 'Add to Group', desc: 'Add tabs to existing group', tokens: 800, category: 'Tab Groups',
    triggers: ['add to group', 'move to group', 'group this tab'] },
  { id: 'tabz_ungroup_tabs', name: 'Ungroup Tabs', desc: 'Remove tabs from their groups', tokens: 700, category: 'Tab Groups',
    triggers: ['ungroup tabs', 'remove from group', 'dissolve group'] },
  { id: 'tabz_claude_group_add', name: 'Claude Add', desc: 'Add tab to Claude Active group', tokens: 900, category: 'Tab Groups',
    triggers: ['add to claude group', 'mark as active', 'claude tracking'] },
  { id: 'tabz_claude_group_remove', name: 'Claude Remove', desc: 'Remove tab from Claude group', tokens: 700, category: 'Tab Groups',
    triggers: ['remove from claude group', 'stop tracking'] },
  { id: 'tabz_claude_group_status', name: 'Claude Status', desc: 'Check Claude Active group', tokens: 800, category: 'Tab Groups',
    triggers: ['claude group status', 'what is claude tracking', 'active tabs'] },
  // Windows (chrome.windows API)
  { id: 'tabz_list_windows', name: 'List Windows', desc: 'List all browser windows with dimensions', tokens: 1000, category: 'Windows',
    triggers: ['show windows', 'list windows', 'browser windows', 'how many windows'] },
  { id: 'tabz_create_window', name: 'Create Window', desc: 'Create new popup or normal window', tokens: 1200, category: 'Windows',
    triggers: ['new window', 'open window', 'create popup', 'open in new window'] },
  { id: 'tabz_update_window', name: 'Update Window', desc: 'Resize, move, minimize, maximize window', tokens: 1000, category: 'Windows',
    triggers: ['resize window', 'move window', 'maximize', 'minimize', 'window size'] },
  { id: 'tabz_close_window', name: 'Close Window', desc: 'Close window and all its tabs', tokens: 600, category: 'Windows',
    triggers: ['close window', 'close browser window'] },
  { id: 'tabz_get_displays', name: 'Get Displays', desc: 'Get monitor info for multi-monitor layouts', tokens: 1100, category: 'Windows',
    triggers: ['show displays', 'monitor info', 'screen info', 'which monitors'] },
  { id: 'tabz_tile_windows', name: 'Tile Windows', desc: 'Auto-arrange windows in grid/splits', tokens: 1300, category: 'Windows',
    triggers: ['tile windows', 'arrange windows', 'split screen', 'window layout'] },
  { id: 'tabz_popout_terminal', name: 'Popout Terminal', desc: 'Pop sidebar to standalone popup window', tokens: 1000, category: 'Windows',
    triggers: ['popout terminal', 'detach sidebar', 'pop out', 'separate window'] },
  // Audio (TTS via edge-tts)
  { id: 'tabz_speak', name: 'Speak', desc: 'Text-to-speech announcement', tokens: 1200, category: 'Audio',
    triggers: ['say this', 'speak', 'read aloud', 'announce', 'text to speech', 'tts'] },
  { id: 'tabz_list_voices', name: 'List Voices', desc: 'Show available TTS voices', tokens: 600, category: 'Audio',
    triggers: ['show voices', 'available voices', 'tts voices', 'voice options'] },
  { id: 'tabz_play_audio', name: 'Play Audio', desc: 'Play audio file by URL', tokens: 800, category: 'Audio',
    triggers: ['play sound', 'play audio', 'play music', 'sound effect'] },
  // History tools (chrome.history API)
  { id: 'tabz_history_search', name: 'History Search', desc: 'Search browsing history by keyword', tokens: 1200, category: 'History',
    triggers: ['search history', 'find in history', 'history search', 'when did i visit'] },
  { id: 'tabz_history_visits', name: 'History Visits', desc: 'Get visit details for a URL', tokens: 1000, category: 'History',
    triggers: ['visit history', 'when visited', 'page visits'] },
  { id: 'tabz_history_recent', name: 'Recent History', desc: 'Get recent history entries', tokens: 1100, category: 'History',
    triggers: ['recent history', 'recently visited', 'browsing history', 'where have i been'] },
  { id: 'tabz_history_delete_url', name: 'Delete URL', desc: 'Remove URL from history', tokens: 800, category: 'History',
    triggers: ['delete from history', 'remove from history', 'clear url history'] },
  { id: 'tabz_history_delete_range', name: 'Delete Range', desc: 'Clear history date range', tokens: 900, category: 'History',
    triggers: ['clear history', 'delete history range', 'erase history'] },
  // Sessions tools (chrome.sessions API)
  { id: 'tabz_sessions_recently_closed', name: 'Recently Closed', desc: 'List recently closed tabs/windows', tokens: 1000, category: 'Sessions',
    triggers: ['recently closed', 'closed tabs', 'restore tab', 'what did i close'] },
  { id: 'tabz_sessions_restore', name: 'Restore Session', desc: 'Restore closed tab or window', tokens: 900, category: 'Sessions',
    triggers: ['restore tab', 'reopen tab', 'bring back tab', 'undo close'] },
  { id: 'tabz_sessions_devices', name: 'Synced Devices', desc: 'Tabs on other Chrome devices', tokens: 1100, category: 'Sessions',
    triggers: ['other devices', 'synced tabs', 'phone tabs', 'other computer tabs'] },
  // Cookies tools (chrome.cookies API)
  { id: 'tabz_cookies_get', name: 'Get Cookie', desc: 'Get specific cookie by name', tokens: 900, category: 'Cookies',
    triggers: ['get cookie', 'read cookie', 'cookie value'] },
  { id: 'tabz_cookies_list', name: 'List Cookies', desc: 'List cookies for a domain', tokens: 1000, category: 'Cookies',
    triggers: ['show cookies', 'list cookies', 'site cookies', 'all cookies'] },
  { id: 'tabz_cookies_set', name: 'Set Cookie', desc: 'Create or update a cookie', tokens: 1100, category: 'Cookies',
    triggers: ['set cookie', 'create cookie', 'write cookie'] },
  { id: 'tabz_cookies_delete', name: 'Delete Cookie', desc: 'Remove a specific cookie', tokens: 800, category: 'Cookies',
    triggers: ['delete cookie', 'remove cookie', 'clear cookie'] },
  { id: 'tabz_cookies_audit', name: 'Audit Cookies', desc: 'Analyze cookies, find trackers', tokens: 1300, category: 'Cookies',
    triggers: ['audit cookies', 'find trackers', 'cookie analysis', 'tracking cookies'] },
  // Emulation tools (CDP Emulation)
  { id: 'tabz_emulate_device', name: 'Emulate Device', desc: 'Mobile/tablet viewport simulation', tokens: 1200, category: 'Emulation',
    triggers: ['emulate mobile', 'mobile view', 'tablet view', 'device mode', 'responsive test'] },
  { id: 'tabz_emulate_clear', name: 'Clear Emulation', desc: 'Reset all emulation overrides', tokens: 600, category: 'Emulation',
    triggers: ['clear emulation', 'reset device', 'stop emulating'] },
  { id: 'tabz_emulate_geolocation', name: 'Spoof Location', desc: 'Fake GPS coordinates', tokens: 900, category: 'Emulation',
    triggers: ['fake location', 'spoof gps', 'change location', 'pretend location'] },
  { id: 'tabz_emulate_network', name: 'Network Throttle', desc: 'Simulate 3G, offline, etc.', tokens: 1000, category: 'Emulation',
    triggers: ['slow network', 'throttle network', 'simulate 3g', 'go offline', 'slow connection'] },
  { id: 'tabz_emulate_media', name: 'Media Emulation', desc: 'Print mode, dark mode pref', tokens: 900, category: 'Emulation',
    triggers: ['print preview', 'dark mode', 'force dark', 'media query'] },
  { id: 'tabz_emulate_vision', name: 'Vision Deficiency', desc: 'Colorblindness simulation', tokens: 900, category: 'Emulation',
    triggers: ['colorblind mode', 'vision test', 'accessibility check', 'color blindness'] },
  // Notification tools (chrome.notifications API)
  { id: 'tabz_notification_show', name: 'Show Notification', desc: 'Desktop notification', tokens: 1000, category: 'Notifications',
    triggers: ['show notification', 'send notification', 'desktop alert', 'notify me'] },
  { id: 'tabz_notification_update', name: 'Update Notification', desc: 'Modify existing notification', tokens: 800, category: 'Notifications',
    triggers: ['update notification', 'change notification'] },
  { id: 'tabz_notification_progress', name: 'Progress Notification', desc: 'Show progress bar notification', tokens: 900, category: 'Notifications',
    triggers: ['progress notification', 'show progress', 'progress bar'] },
  { id: 'tabz_notification_clear', name: 'Clear Notification', desc: 'Dismiss a notification', tokens: 600, category: 'Notifications',
    triggers: ['clear notification', 'dismiss notification', 'close notification'] },
  { id: 'tabz_notification_list', name: 'List Notifications', desc: 'Get active notifications', tokens: 800, category: 'Notifications',
    triggers: ['list notifications', 'active notifications', 'show notifications'] },
  // Profiles tools
  { id: 'tabz_list_profiles', name: 'List Profiles', desc: 'List terminal profiles with optional category filter', tokens: 1200, category: 'Profiles',
    triggers: ['list profiles', 'terminal profiles', 'available profiles', 'show profiles'] },
  { id: 'tabz_list_categories', name: 'List Categories', desc: 'List all profile categories', tokens: 800, category: 'Profiles',
    triggers: ['list categories', 'profile categories', 'category list'] },
  // Plugins tools
  { id: 'tabz_list_plugins', name: 'List Plugins', desc: 'List installed Claude Code plugins', tokens: 1500, category: 'Plugins',
    triggers: ['list plugins', 'installed plugins', 'show plugins', 'what plugins'] },
  { id: 'tabz_list_skills', name: 'List Skills', desc: 'List skills from enabled plugins', tokens: 1200, category: 'Plugins',
    triggers: ['list skills', 'available skills', 'find skill', 'what skills'] },
  { id: 'tabz_get_skill', name: 'Get Skill', desc: 'Get full SKILL.md content', tokens: 1000, category: 'Plugins',
    triggers: ['get skill', 'skill details', 'show skill content'] },
  { id: 'tabz_plugins_health', name: 'Plugin Health', desc: 'Check plugin versions and cache', tokens: 1000, category: 'Plugins',
    triggers: ['plugin health', 'outdated plugins', 'check plugins'] },
  { id: 'tabz_toggle_plugin', name: 'Toggle Plugin', desc: 'Enable or disable a plugin', tokens: 800, category: 'Plugins',
    triggers: ['enable plugin', 'disable plugin', 'toggle plugin'] },
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
 * Matches against id, name, description, and trigger phrases
 */
export function filterMcpTools(query: string): McpTool[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()

  return MCP_TOOLS.filter(tool =>
    tool.id.toLowerCase().includes(lowerQuery) ||
    tool.name.toLowerCase().includes(lowerQuery) ||
    tool.desc.toLowerCase().includes(lowerQuery) ||
    tool.triggers?.some(t => t.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Fetch plugin skills from the backend
 */
export async function fetchPluginSkills(): Promise<PluginSkill[]> {
  try {
    const response = await fetch('http://localhost:8129/api/plugins/skills')
    if (!response.ok) return []
    const data = await response.json()
    return data.skills || []
  } catch {
    return []
  }
}

/**
 * Filter combined suggestions (MCP tools + plugin skills) by search query
 */
export function filterSuggestions(
  query: string,
  pluginSkills: PluginSkill[]
): AutocompleteSuggestion[] {
  if (!query.trim()) return []

  const lowerQuery = query.toLowerCase()

  // Filter MCP tools - now includes trigger phrase matching
  const mcpResults = MCP_TOOLS.filter(tool =>
    tool.id.toLowerCase().includes(lowerQuery) ||
    tool.name.toLowerCase().includes(lowerQuery) ||
    tool.desc.toLowerCase().includes(lowerQuery) ||
    tool.triggers?.some(t => t.toLowerCase().includes(lowerQuery))
  )

  // Filter plugin skills - also match if query starts with /
  const skillResults = pluginSkills.filter(skill =>
    skill.id.toLowerCase().includes(lowerQuery) ||
    skill.name.toLowerCase().includes(lowerQuery) ||
    skill.desc.toLowerCase().includes(lowerQuery)
  )

  // If query starts with /, prioritize skills
  if (query.startsWith('/')) {
    return [...skillResults, ...mcpResults]
  }

  // Otherwise, mix them together (MCP first since they're the base feature)
  return [...mcpResults, ...skillResults]
}
