/**
 * MCP Tools configuration
 * Shared between dashboard settings and chat bar autocomplete
 */

import presetDefinitions from './mcpPresetDefinitions.json'

// Measured built tools/list and initialize payloads; see tool-overhead-verification.md.
export const MCP_INITIALIZE_INSTRUCTION_CHARS = 1168

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
  { id: 'tabz_list_tabs', name: 'List Tabs', desc: 'List tabs in this connection\'s group', tokens: 106, locked: true, category: 'Core',
    triggers: ['what tabs are open', 'show my tabs', 'list browser tabs', 'which tabs', 'all tabs'] },
  { id: 'tabz_switch_tab', name: 'Switch Tab', desc: 'Switch to a specific tab by ID', tokens: 86, locked: true, category: 'Core',
    triggers: ['go to tab', 'switch to tab', 'change tab', 'focus tab', 'activate tab'] },
  { id: 'tabz_close_tab', name: 'Close Tab', desc: 'Close owned tabs or this connection\'s group', tokens: 136, locked: true, category: 'Core',
    triggers: ['close tab', 'close these tabs', 'close my browser group'] },
  { id: 'tabz_rename_tab', name: 'Rename Tab', desc: 'Assign custom names to tabs', tokens: 127, locked: true, category: 'Core',
    triggers: ['name this tab', 'rename tab', 'label tab', 'set tab name'] },
  { id: 'tabz_get_page_info', name: 'Page Info', desc: 'Get URL and title of current page', tokens: 101, locked: true, category: 'Core',
    triggers: ['what page is this', 'current url', 'page url', 'what site', 'where am i'] },
  // Interaction tools
  // Display estimates use complete published entry characters divided by four.
  { id: 'tabz_act', name: 'Act', desc: 'Use refs, selectors, text or coordinates for page actions', tokens: 664, category: 'Interaction',
    triggers: ['act on page', 'use page ref', 'hover over', 'press enter', 'scroll down', 'drag element'] },
  { id: 'tabz_batch', name: 'Batch', desc: 'Run enabled tools sequentially and stop on the first failure', tokens: 196, category: 'Interaction',
    triggers: ['batch browser actions', 'run these steps', 'do several actions'] },
  { id: 'tabz_click', name: 'Click', desc: 'Click elements by CSS selector', tokens: 155, category: 'Legacy',
    triggers: ['click the button', 'click on', 'press the button', 'tap', 'click element'] },
  { id: 'tabz_fill', name: 'Fill', desc: 'Fill form inputs with text', tokens: 185, category: 'Interaction',
    triggers: ['fill the form', 'type in', 'enter text', 'fill input', 'type into', 'fill out'] },
  { id: 'tabz_request_login', name: 'Request Login', desc: 'Hand a tab to the user and observe whether a login prompt remains', tokens: 423, category: 'Interaction',
    triggers: ['sign in', 'log in', 'request login', 'wait for login', 'user login'] },
  { id: 'tabz_secret_request', name: 'Save Login', desc: 'Open Logins or a protected terminal so the user can save a login', tokens: 334, category: 'Interaction',
    triggers: ['save login', 'add saved login', 'store login', 'remember credentials'] },
  { id: 'tabz_secret_status', name: 'Saved Login Status', desc: 'Check saved-login readiness without opening another editor', tokens: 209, category: 'Interaction',
    triggers: ['saved login status', 'is login saved', 'check login', 'login ready'] },
  { id: 'tabz_fill_secret', name: 'Fill Saved Login', desc: 'Fill a saved field without disclosing its value', tokens: 566, category: 'Interaction',
    triggers: ['fill saved login', 'use saved password', 'fill secret', 'saved credentials'] },
  // Screenshot tools
  { id: 'tabz_screenshot', name: 'Screenshot', desc: 'Capture viewport (visible area)', tokens: 189, category: 'Legacy',
    triggers: ['take a screenshot', 'screenshot my view', 'capture screen', 'what do i see', 'show me the page', 'screenshot this'] },
  { id: 'tabz_screenshot_full', name: 'Screenshot Full', desc: 'Capture entire scrollable page', tokens: 160, category: 'Legacy',
    triggers: ['full page screenshot', 'capture entire page', 'screenshot whole page', 'show me everything', 'capture all'] },
  { id: 'tabz_download_image', name: 'Download Image', desc: 'Download images from pages', tokens: 135, category: 'Screenshot',
    triggers: ['download this image', 'save image', 'grab that picture', 'download photo', 'save that image'] },
  { id: 'tabz_get_element', name: 'Inspect Element', desc: 'Get HTML/CSS details of elements', tokens: 177, category: 'Inspection',
    triggers: ['inspect element', 'show html', 'get element details', 'examine element', 'element info'] },
  { id: 'tabz_read_page', name: 'Read Page', desc: 'Read visible page controls and their action refs', tokens: 161, category: 'Inspection',
    triggers: ['read page', 'show page elements', 'find controls', 'get element refs', 'what can i click'] },
  // Navigation
  { id: 'tabz_open_url', name: 'Open URL', desc: 'Open allowed URLs (GitHub, localhost, etc.)', tokens: 300, category: 'Navigation',
    triggers: ['open url', 'go to website', 'navigate to', 'open page', 'visit site', 'open link'] },
  // Console/Script
  { id: 'tabz_get_console_logs', name: 'Console Logs', desc: 'View browser console output', tokens: 194, category: 'Console',
    triggers: ['show console', 'console logs', 'browser errors', 'javascript errors', 'check console'] },
  { id: 'tabz_execute_script', name: 'Execute Script', desc: 'Run JavaScript in browser tab', tokens: 178, category: 'Console',
    triggers: ['run javascript', 'execute js', 'run script', 'run code in browser', 'inject script'] },
  // Network monitoring
  { id: 'tabz_enable_deep_capture', name: 'Enable Deep Capture', desc: 'Capture bounded response bodies and streams', tokens: 178, category: 'Network',
    triggers: ['capture response bodies', 'deep network capture'] },
  { id: 'tabz_disable_deep_capture', name: 'Disable Deep Capture', desc: 'Stop deep capture and clear its rows', tokens: 88, category: 'Network',
    triggers: ['stop deep capture', 'release network debugger'] },
  { id: 'tabz_get_response_body', name: 'Response Body', desc: 'Read a bounded deep response or stream page', tokens: 188, category: 'Network',
    triggers: ['read response body', 'inspect stream messages'] },
  { id: 'tabz_enable_network_capture', name: 'Enable Network', desc: 'Start capturing network requests', tokens: 132, category: 'Network',
    triggers: ['monitor network', 'capture requests', 'start network capture', 'watch api calls', 'track requests'] },
  { id: 'tabz_get_network_requests', name: 'Network Requests', desc: 'List captured XHR/fetch requests', tokens: 320, category: 'Network',
    triggers: ['show network requests', 'api calls', 'what requests', 'network traffic', 'http requests'] },
  { id: 'tabz_clear_network_requests', name: 'Clear Network', desc: 'Clear captured requests', tokens: 69, category: 'Network',
    triggers: ['clear network', 'reset network capture', 'clear requests'] },
  // Downloads
  { id: 'tabz_download_file', name: 'Download File', desc: 'Download any URL to disk', tokens: 177, category: 'Downloads',
    triggers: ['download file', 'save file', 'download from url', 'fetch file'] },
  { id: 'tabz_get_downloads', name: 'List Downloads', desc: 'List recent downloads with status', tokens: 130, category: 'Downloads',
    triggers: ['show downloads', 'recent downloads', 'download history', 'what downloaded'] },
  { id: 'tabz_cancel_download', name: 'Cancel Download', desc: 'Cancel in-progress download', tokens: 86, category: 'Downloads',
    triggers: ['cancel download', 'stop download', 'abort download'] },
  { id: 'tabz_save_page', name: 'Save Page', desc: 'Save page as MHTML for offline analysis', tokens: 125, category: 'Downloads',
    triggers: ['save page', 'save webpage', 'download page', 'save for offline'] },
  // Bookmarks
  { id: 'tabz_get_bookmark_tree', name: 'Bookmark Tree', desc: 'Get bookmark folder hierarchy', tokens: 131, category: 'Bookmarks',
    triggers: ['show bookmarks', 'bookmark folders', 'list bookmarks', 'my bookmarks'] },
  { id: 'tabz_search_bookmarks', name: 'Search Bookmarks', desc: 'Find bookmarks by title/URL', tokens: 127, category: 'Bookmarks',
    triggers: ['find bookmark', 'search bookmarks', 'look for bookmark'] },
  { id: 'tabz_save_bookmark', name: 'Save Bookmark', desc: 'Add URL to bookmarks', tokens: 134, category: 'Bookmarks',
    triggers: ['bookmark this', 'save bookmark', 'add bookmark', 'bookmark page'] },
  { id: 'tabz_create_folder', name: 'Create Folder', desc: 'Create bookmark folder', tokens: 132, category: 'Bookmarks',
    triggers: ['create bookmark folder', 'new folder', 'make folder'] },
  { id: 'tabz_move_bookmark', name: 'Move Bookmark', desc: 'Move to different folder', tokens: 108, category: 'Bookmarks',
    triggers: ['move bookmark', 'organize bookmark', 'relocate bookmark'] },
  { id: 'tabz_delete_bookmark', name: 'Delete Bookmark', desc: 'Remove bookmark or folder', tokens: 93, category: 'Bookmarks',
    triggers: ['delete bookmark', 'remove bookmark', 'unbookmark'] },
  // Debugger (chrome.debugger API - DevTools access)
  { id: 'tabz_get_dom_tree', name: 'DOM Tree', desc: 'Get full DOM structure via DevTools', tokens: 183, category: 'Debugger',
    triggers: ['show dom', 'dom structure', 'html tree', 'page structure'] },
  { id: 'tabz_profile_performance', name: 'Performance', desc: 'Profile timing, memory, DOM metrics', tokens: 100, category: 'Debugger',
    triggers: ['check performance', 'page speed', 'performance metrics', 'how fast', 'memory usage'] },
  { id: 'tabz_get_coverage', name: 'Coverage', desc: 'JS/CSS code coverage analysis', tokens: 129, category: 'Debugger',
    triggers: ['code coverage', 'unused code', 'coverage report', 'dead code'] },
  // Tab Groups (chrome.tabGroups API)
  { id: 'tabz_list_groups', name: 'List Groups', desc: 'List all tab groups with their tabs', tokens: 95, category: 'Tab Groups',
    triggers: ['show tab groups', 'list groups', 'my tab groups', 'grouped tabs'] },
  { id: 'tabz_create_group', name: 'Create Group', desc: 'Group tabs with title and color', tokens: 130, category: 'Tab Groups',
    triggers: ['create tab group', 'group these tabs', 'make a group', 'new tab group'] },
  { id: 'tabz_update_group', name: 'Update Group', desc: 'Change group title, color, collapsed', tokens: 125, category: 'Tab Groups',
    triggers: ['rename group', 'change group color', 'update group', 'collapse group'] },
  { id: 'tabz_add_to_group', name: 'Add to Group', desc: 'Add tabs to existing group', tokens: 100, category: 'Tab Groups',
    triggers: ['add to group', 'move to group', 'group this tab'] },
  { id: 'tabz_ungroup_tabs', name: 'Ungroup Tabs', desc: 'Remove tabs from their groups', tokens: 95, category: 'Tab Groups',
    triggers: ['ungroup tabs', 'remove from group', 'dissolve group'] },
  { id: 'tabz_claude_group_add', name: 'Claude Add', desc: 'Add tab to Claude Active group', tokens: 93, category: 'Tab Groups',
    triggers: ['add to claude group', 'mark as active', 'claude tracking'] },
  { id: 'tabz_claude_group_remove', name: 'Claude Remove', desc: 'Remove tab from Claude group', tokens: 81, category: 'Tab Groups',
    triggers: ['remove from claude group', 'stop tracking'] },
  { id: 'tabz_claude_group_status', name: 'Claude Status', desc: 'Check this connection\'s tab group', tokens: 141, locked: true, category: 'Core',
    triggers: ['claude group status', 'what is claude tracking', 'active tabs'] },
  // Windows (chrome.windows API)
  { id: 'tabz_list_windows', name: 'List Windows', desc: 'List all browser windows with dimensions', tokens: 91, category: 'Windows',
    triggers: ['show windows', 'list windows', 'browser windows', 'how many windows'] },
  { id: 'tabz_create_window', name: 'Create Window', desc: 'Create new popup or normal window', tokens: 221, category: 'Windows',
    triggers: ['new window', 'open window', 'create popup', 'open in new window'] },
  { id: 'tabz_update_window', name: 'Update Window', desc: 'Resize, move, minimize, maximize window', tokens: 180, category: 'Windows',
    triggers: ['resize window', 'move window', 'maximize', 'minimize', 'window size'] },
  { id: 'tabz_close_window', name: 'Close Window', desc: 'Close window and all its tabs', tokens: 102, category: 'Windows',
    triggers: ['close window', 'close browser window'] },
  { id: 'tabz_get_displays', name: 'Get Displays', desc: 'Get monitor info for multi-monitor layouts', tokens: 92, category: 'Windows',
    triggers: ['show displays', 'monitor info', 'screen info', 'which monitors'] },
  { id: 'tabz_tile_windows', name: 'Tile Windows', desc: 'Auto-arrange windows in grid/splits', tokens: 172, category: 'Windows',
    triggers: ['tile windows', 'arrange windows', 'split screen', 'window layout'] },
  { id: 'tabz_popout_terminal', name: 'Popout Terminal', desc: 'Pop sidebar to standalone popup window', tokens: 139, category: 'Windows',
    triggers: ['popout terminal', 'detach sidebar', 'pop out', 'separate window'] },
  // Audio (TTS via edge-tts)
  { id: 'tabz_speak', name: 'Speak', desc: 'Text-to-speech announcement', tokens: 287, category: 'Audio',
    triggers: ['say this', 'speak', 'read aloud', 'announce', 'text to speech', 'tts'] },
  { id: 'tabz_list_voices', name: 'List Voices', desc: 'Show available TTS voices', tokens: 72, category: 'Audio',
    triggers: ['show voices', 'available voices', 'tts voices', 'voice options'] },
  { id: 'tabz_play_audio', name: 'Play Audio', desc: 'Play audio file by URL', tokens: 156, category: 'Audio',
    triggers: ['play sound', 'play audio', 'play music', 'sound effect'] },
  // History tools (chrome.history API)
  { id: 'tabz_history_search', name: 'History Search', desc: 'Search browsing history by keyword', tokens: 181, category: 'History',
    triggers: ['search history', 'find in history', 'history search', 'when did i visit'] },
  { id: 'tabz_history_visits', name: 'History Visits', desc: 'Get visit details for a URL', tokens: 105, category: 'History',
    triggers: ['visit history', 'when visited', 'page visits'] },
  { id: 'tabz_history_recent', name: 'Recent History', desc: 'Get recent history entries', tokens: 106, category: 'History',
    triggers: ['recent history', 'recently visited', 'browsing history', 'where have i been'] },
  { id: 'tabz_history_delete_url', name: 'Delete URL', desc: 'Remove URL from history', tokens: 97, category: 'History',
    triggers: ['delete from history', 'remove from history', 'clear url history'] },
  { id: 'tabz_history_delete_range', name: 'Delete Range', desc: 'Clear history date range', tokens: 115, category: 'History',
    triggers: ['clear history', 'delete history range', 'erase history'] },
  // Sessions tools (chrome.sessions API)
  { id: 'tabz_sessions_recently_closed', name: 'Recently Closed', desc: 'List recently closed tabs/windows', tokens: 130, category: 'Sessions',
    triggers: ['recently closed', 'closed tabs', 'restore tab', 'what did i close'] },
  { id: 'tabz_sessions_restore', name: 'Restore Session', desc: 'Restore closed tab or window', tokens: 98, category: 'Sessions',
    triggers: ['restore tab', 'reopen tab', 'bring back tab', 'undo close'] },
  { id: 'tabz_sessions_devices', name: 'Synced Devices', desc: 'Tabs on other Chrome devices', tokens: 112, category: 'Sessions',
    triggers: ['other devices', 'synced tabs', 'phone tabs', 'other computer tabs'] },
  // Cookies tools (chrome.cookies API)
  { id: 'tabz_cookies_get', name: 'Get Cookie', desc: 'Get specific cookie by name', tokens: 158, category: 'Cookies',
    triggers: ['get cookie', 'read cookie', 'cookie value'] },
  { id: 'tabz_cookies_list', name: 'List Cookies', desc: 'List cookies for a domain', tokens: 172, category: 'Cookies',
    triggers: ['show cookies', 'list cookies', 'site cookies', 'all cookies'] },
  { id: 'tabz_cookies_set', name: 'Set Cookie', desc: 'Create or update a cookie', tokens: 243, category: 'Cookies',
    triggers: ['set cookie', 'create cookie', 'write cookie'] },
  { id: 'tabz_cookies_delete', name: 'Delete Cookie', desc: 'Remove a specific cookie', tokens: 92, category: 'Cookies',
    triggers: ['delete cookie', 'remove cookie', 'clear cookie'] },
  { id: 'tabz_cookies_audit', name: 'Audit Cookies', desc: 'Analyze cookies, find trackers', tokens: 110, category: 'Cookies',
    triggers: ['audit cookies', 'find trackers', 'cookie analysis', 'tracking cookies'] },
  // Emulation tools (CDP Emulation)
  { id: 'tabz_emulate_device', name: 'Emulate Device', desc: 'Mobile/tablet viewport simulation', tokens: 243, category: 'Emulation',
    triggers: ['emulate mobile', 'mobile view', 'tablet view', 'device mode', 'responsive test'] },
  { id: 'tabz_emulate_clear', name: 'Clear Emulation', desc: 'Reset all emulation overrides', tokens: 104, category: 'Emulation',
    triggers: ['clear emulation', 'reset device', 'stop emulating'] },
  { id: 'tabz_emulate_geolocation', name: 'Spoof Location', desc: 'Fake GPS coordinates', tokens: 199, category: 'Emulation',
    triggers: ['fake location', 'spoof gps', 'change location', 'pretend location'] },
  { id: 'tabz_emulate_network', name: 'Network Throttle', desc: 'Simulate 3G, offline, etc.', tokens: 220, category: 'Emulation',
    triggers: ['slow network', 'throttle network', 'simulate 3g', 'go offline', 'slow connection'] },
  { id: 'tabz_emulate_media', name: 'Media Emulation', desc: 'Print mode, dark mode pref', tokens: 211, category: 'Emulation',
    triggers: ['print preview', 'dark mode', 'force dark', 'media query'] },
  { id: 'tabz_emulate_vision', name: 'Vision Deficiency', desc: 'Colorblindness simulation', tokens: 134, category: 'Emulation',
    triggers: ['colorblind mode', 'vision test', 'accessibility check', 'color blindness'] },
  // Notification tools (chrome.notifications API)
  { id: 'tabz_notification_show', name: 'Show Notification', desc: 'Desktop notification', tokens: 350, category: 'Notifications',
    triggers: ['show notification', 'send notification', 'desktop alert', 'notify me'] },
  { id: 'tabz_notification_update', name: 'Update Notification', desc: 'Modify existing notification', tokens: 168, category: 'Notifications',
    triggers: ['update notification', 'change notification'] },
  { id: 'tabz_notification_clear', name: 'Clear Notification', desc: 'Dismiss a notification', tokens: 79, category: 'Notifications',
    triggers: ['clear notification', 'dismiss notification', 'close notification'] },
  { id: 'tabz_notification_list', name: 'List Notifications', desc: 'Get active notifications', tokens: 66, category: 'Notifications',
    triggers: ['list notifications', 'active notifications', 'show notifications'] },
  // Profiles tools
  { id: 'tabz_list_profiles', name: 'List Profiles', desc: 'List terminal profiles with optional category filter', tokens: 113, category: 'Profiles',
    triggers: ['list profiles', 'terminal profiles', 'available profiles', 'show profiles'] },
  { id: 'tabz_list_categories', name: 'List Categories', desc: 'List all profile categories', tokens: 91, category: 'Profiles',
    triggers: ['list categories', 'profile categories', 'category list'] },
  { id: 'tabz_spawn_profile', name: 'Spawn Profile', desc: 'Spawn terminal using a saved profile', tokens: 148, category: 'Profiles',
    triggers: ['spawn profile', 'start profile', 'launch profile', 'use profile'] },
  { id: 'tabz_get_profile', name: 'Get Profile', desc: 'Get details of a specific profile', tokens: 102, category: 'Profiles',
    triggers: ['get profile', 'profile details', 'show profile', 'profile info'] },
  { id: 'tabz_create_profile', name: 'Create Profile', desc: 'Create a new terminal profile', tokens: 149, category: 'Profiles',
    triggers: ['create profile', 'new profile', 'add profile', 'make profile'] },
  { id: 'tabz_update_profile', name: 'Update Profile', desc: 'Update an existing profile settings', tokens: 171, category: 'Profiles',
    triggers: ['update profile', 'edit profile', 'modify profile', 'change profile'] },
  { id: 'tabz_delete_profile', name: 'Delete Profile', desc: 'Delete a terminal profile', tokens: 89, category: 'Profiles',
    triggers: ['delete profile', 'remove profile', 'delete terminal profile'] },
  // Plugins tools
  { id: 'tabz_list_plugins', name: 'List Plugins', desc: 'List installed Claude Code plugins', tokens: 102, category: 'Plugins',
    triggers: ['list plugins', 'installed plugins', 'show plugins', 'what plugins'] },
  { id: 'tabz_list_skills', name: 'List Skills', desc: 'List skills from enabled plugins', tokens: 103, category: 'Plugins',
    triggers: ['list skills', 'available skills', 'find skill', 'what skills'] },
  { id: 'tabz_get_skill', name: 'Get Skill', desc: 'Get full SKILL.md content', tokens: 97, category: 'Plugins',
    triggers: ['get skill', 'skill details', 'show skill content'] },
  { id: 'tabz_plugins_health', name: 'Plugin Health', desc: 'Check plugin versions and cache', tokens: 74, category: 'Plugins',
    triggers: ['plugin health', 'outdated plugins', 'check plugins'] },
  { id: 'tabz_toggle_plugin', name: 'Toggle Plugin', desc: 'Enable or disable a plugin', tokens: 106, category: 'Plugins',
    triggers: ['enable plugin', 'disable plugin', 'toggle plugin'] },
  // Terminals tools
  { id: 'tabz_list_terminals', name: 'List Terminals', desc: 'List all terminal sessions', tokens: 117, category: 'Terminals',
    triggers: ['list terminals', 'show terminals', 'terminal sessions', 'what terminals'] },
  { id: 'tabz_send_keys', name: 'Send Keys', desc: 'Send keystrokes to a terminal', tokens: 176, category: 'Terminals',
    triggers: ['send keys', 'type in terminal', 'send to terminal', 'terminal input'] },
  { id: 'tabz_capture_terminal', name: 'Capture Terminal', desc: 'Capture terminal output', tokens: 114, category: 'Terminals',
    triggers: ['capture terminal', 'terminal output', 'read terminal', 'get terminal content'] },
  // Documentation is registered outside the server preset filter, so it is
  // represented as Core + locked here as well.
  { id: 'tabz_docs', name: 'Tool Docs', desc: 'Get detailed documentation for a Tabz MCP tool', tokens: 142, locked: true, category: 'Core',
    triggers: ['tool docs', 'tabz docs', 'how to use tool', 'tool documentation'] },
]

/**
 * Core tool IDs that are always enabled
 */
export const CORE_TOOL_IDS = MCP_TOOLS.filter(t => t.locked).map(t => t.id)

/**
 * All tool IDs
 */
export const ALL_TOOL_IDS = MCP_TOOLS.map(t => t.id)

export interface McpPreset {
  name: string
  description: string
  categories?: string[]
  tools: string[]
  builtIn: true
  readOnly: true
}

/**
 * Build role presets from the shared definitions and the available catalog.
 * Category-derived presets automatically gain later tools in those categories;
 * explicit presets can stay deliberately small.
 */
export function deriveBuiltInMcpPresets(tools: McpTool[] = MCP_TOOLS): Record<string, McpPreset> {
  const definitions = presetDefinitions as Record<string, {
    name: string
    description: string
    categories?: string[]
    tools?: string[]
  }>

  return Object.fromEntries(
    Object.entries(definitions).map(([slug, definition]) => [
      slug,
      {
        ...definition,
        tools: definition.tools
          ? [...definition.tools]
          : tools
              .filter(tool => definition.categories?.includes(tool.category || 'Other'))
              .map(tool => tool.id),
        builtIn: true as const,
        readOnly: true as const,
      },
    ])
  )
}

export const BUILT_IN_MCP_PRESETS = deriveBuiltInMcpPresets()

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
