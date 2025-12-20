// Shared types and constants for Settings components

// MCP Tools configuration
export interface McpTool {
  id: string
  name: string
  desc: string
  tokens: number
  locked?: boolean  // Core tools that are always enabled
}

export const MCP_TOOLS: McpTool[] = [
  // Core tools (always enabled)
  { id: 'tabz_list_tabs', name: 'List Tabs', desc: 'List all open browser tabs', tokens: 974, locked: true },
  { id: 'tabz_switch_tab', name: 'Switch Tab', desc: 'Switch to a specific tab by ID', tokens: 940, locked: true },
  { id: 'tabz_rename_tab', name: 'Rename Tab', desc: 'Assign custom names to tabs', tokens: 1000, locked: true },
  { id: 'tabz_get_page_info', name: 'Page Info', desc: 'Get URL and title of current page', tokens: 885, locked: true },
  // Interaction tools
  { id: 'tabz_click', name: 'Click', desc: 'Click elements by CSS selector', tokens: 986 },
  { id: 'tabz_fill', name: 'Fill', desc: 'Fill form inputs with text', tokens: 1100 },
  { id: 'tabz_screenshot', name: 'Screenshot', desc: 'Capture viewport (visible area)', tokens: 995 },
  { id: 'tabz_screenshot_full', name: 'Screenshot Full', desc: 'Capture entire scrollable page', tokens: 1100 },
  { id: 'tabz_download_image', name: 'Download Image', desc: 'Download images from pages', tokens: 1000 },
  { id: 'tabz_get_element', name: 'Inspect Element', desc: 'Get HTML/CSS details of elements', tokens: 1300 },
  // Navigation
  { id: 'tabz_open_url', name: 'Open URL', desc: 'Open allowed URLs (GitHub, localhost, etc.)', tokens: 1600 },
  // Console/Script
  { id: 'tabz_get_console_logs', name: 'Console Logs', desc: 'View browser console output', tokens: 1100 },
  { id: 'tabz_execute_script', name: 'Execute Script', desc: 'Run JavaScript in browser tab', tokens: 1100 },
  // Network monitoring (CDP-based)
  { id: 'tabz_enable_network_capture', name: 'Enable Network', desc: 'Start capturing network requests', tokens: 950 },
  { id: 'tabz_get_network_requests', name: 'Network Requests', desc: 'List captured XHR/fetch requests', tokens: 1400 },
  { id: 'tabz_get_api_response', name: 'API Response', desc: 'Get response body for a request', tokens: 1100 },
  { id: 'tabz_clear_network_requests', name: 'Clear Network', desc: 'Clear captured requests', tokens: 400 },
  // Downloads (chrome.downloads API)
  { id: 'tabz_download_file', name: 'Download File', desc: 'Download any URL to disk', tokens: 1200 },
  { id: 'tabz_get_downloads', name: 'List Downloads', desc: 'List recent downloads with status', tokens: 1000 },
  { id: 'tabz_cancel_download', name: 'Cancel Download', desc: 'Cancel in-progress download', tokens: 500 },
]

// All tool IDs for reference
export const ALL_TOOL_IDS = MCP_TOOLS.map(t => t.id)
export const CORE_TOOL_IDS = MCP_TOOLS.filter(t => t.locked).map(t => t.id)

export const PRESETS = {
  minimal: CORE_TOOL_IDS,
  standard: [...CORE_TOOL_IDS, 'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_screenshot_full', 'tabz_open_url', 'tabz_get_console_logs', 'tabz_enable_network_capture', 'tabz_get_network_requests'],
  full: ALL_TOOL_IDS,
}

export type TabType = 'profiles' | 'mcp' | 'audio'

// Profile types
export interface Profile {
  id: string
  name: string
  workingDir: string
  command?: string  // Optional starting command
  fontSize: number
  fontFamily: string
  themeName: string  // Theme family name (high-contrast, dracula, ocean, etc.)
  audioOverrides?: ProfileAudioOverrides  // Optional per-profile audio settings
  category?: string  // Optional category for grouping (e.g., "Claude Code", "TUI Tools")
}

// Category settings stored separately from profiles
export interface CategorySettings {
  [categoryName: string]: {
    color: string       // Hex color (e.g., "#22c55e")
    collapsed?: boolean // UI state: is category collapsed in settings
    order?: number      // Sort order (lower = higher in list)
  }
}

// Category color palette - designed for good contrast on dark backgrounds
export const CATEGORY_COLORS = [
  { name: 'Green', value: '#22c55e', text: '#000000' },   // Default/matrix green
  { name: 'Blue', value: '#3b82f6', text: '#ffffff' },    // Bright blue
  { name: 'Purple', value: '#a855f7', text: '#ffffff' },  // Purple
  { name: 'Orange', value: '#f97316', text: '#000000' },  // Orange
  { name: 'Red', value: '#ef4444', text: '#ffffff' },     // Red
  { name: 'Yellow', value: '#eab308', text: '#000000' },  // Yellow
  { name: 'Cyan', value: '#06b6d4', text: '#000000' },    // Cyan
  { name: 'Pink', value: '#ec4899', text: '#ffffff' },    // Pink
  { name: 'Gray', value: '#6b7280', text: '#ffffff' },    // Neutral gray
] as const

export const DEFAULT_CATEGORY_COLOR = '#6b7280'  // Gray for uncategorized

export const DEFAULT_PROFILE: Profile = {
  id: '',
  name: '',
  workingDir: '',  // Empty = inherit from header
  command: '',
  fontSize: 16,
  fontFamily: 'monospace',
  themeName: 'high-contrast',
}

// Platform detection for font filtering
export const isWindows = typeof navigator !== 'undefined' && navigator.platform?.startsWith('Win')

export const FONT_FAMILIES = [
  // Universal - work everywhere
  { label: 'Monospace (Default)', value: 'monospace' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  // Windows built-in
  { label: 'Consolas', value: 'Consolas, monospace', windowsOnly: true },
  { label: 'Cascadia Code', value: "'Cascadia Code', monospace", windowsOnly: true },
  { label: 'Cascadia Mono', value: "'Cascadia Mono', monospace", windowsOnly: true },
  // Nerd Fonts - bundled in fonts/ folder
  { label: 'JetBrains Mono NF', value: "'JetBrainsMono Nerd Font', 'JetBrainsMono NF', monospace" },
  { label: 'Fira Code NF', value: "'FiraCode Nerd Font', 'FiraCode NF', monospace" },
  { label: 'Caskaydia Cove NF', value: "'CaskaydiaCove Nerd Font', 'CaskaydiaCove NF', monospace" },
] as const

// Filtered font list based on platform
export const getAvailableFonts = () =>
  FONT_FAMILIES.filter(f => !('windowsOnly' in f) || f.windowsOnly === isWindows)

// Audio types
export const TTS_VOICES = [
  { label: 'Andrew (US Male)', value: 'en-US-AndrewMultilingualNeural' },
  { label: 'Emma (US Female)', value: 'en-US-EmmaMultilingualNeural' },
  { label: 'Brian (US Male)', value: 'en-US-BrianMultilingualNeural' },
  { label: 'Aria (US Female)', value: 'en-US-AriaNeural' },
  { label: 'Guy (US Male)', value: 'en-US-GuyNeural' },
  { label: 'Jenny (US Female)', value: 'en-US-JennyNeural' },
  { label: 'Sonia (UK Female)', value: 'en-GB-SoniaNeural' },
  { label: 'Ryan (UK Male)', value: 'en-GB-RyanNeural' },
  { label: 'Natasha (AU Female)', value: 'en-AU-NatashaNeural' },
  { label: 'William (AU Male)', value: 'en-AU-WilliamNeural' },
]

export interface AudioEventSettings {
  ready: boolean
  sessionStart: boolean
  tools: boolean
  toolDetails: boolean  // Announce file names for Read/Edit/Write, patterns for Grep/Glob
  subagents: boolean
  contextWarning: boolean   // Announce when context hits warning threshold (default 50%)
  contextCritical: boolean  // Announce when context hits critical threshold (default 75%)
}

export interface AudioSettings {
  enabled: boolean
  volume: number  // 0-1
  voice: string
  rate: string    // e.g., "+30%", "-10%"
  events: AudioEventSettings
  toolDebounceMs: number
}

export type AudioMode = 'default' | 'enabled' | 'disabled'

export interface ProfileAudioOverrides {
  mode?: AudioMode     // 'default' = follow global, 'enabled' = always on, 'disabled' = never
  voice?: string       // Override voice (undefined = use global default)
  rate?: string        // Override rate (undefined = use global default)
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: false,
  volume: 0.7,
  voice: 'en-US-AndrewMultilingualNeural',
  rate: '+0%',
  events: {
    ready: true,
    sessionStart: false,
    tools: false,
    toolDetails: false,
    subagents: false,
    contextWarning: false,
    contextCritical: false,
  },
  toolDebounceMs: 1000,
}
