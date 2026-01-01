// Chrome Extension Message Types
import type { Profile } from '../components/settings/types'

export type MessageType =
  | 'INITIAL_STATE'
  | 'OPEN_SESSION'
  | 'SPAWN_TERMINAL'
  | 'CLOSE_SESSION'
  | 'CLOSE_TERMINAL'
  | 'TERMINAL_INPUT'
  | 'TERMINAL_OUTPUT'
  | 'TERMINAL_RESIZE'
  | 'LIST_TERMINALS'
  | 'REFRESH_TERMINALS'
  | 'TERMINAL_RECONNECTED'
  | 'ADD_CONTEXT_MENU'
  | 'SHOW_ERROR_SUGGESTION'
  | 'UPDATE_BADGE'
  | 'PASTE_COMMAND'
  | 'WS_MESSAGE'
  | 'WS_CONNECTED'
  | 'WS_DISCONNECTED'
  | 'KEYBOARD_NEW_TAB'
  | 'KEYBOARD_CLOSE_TAB'
  | 'KEYBOARD_NEXT_TAB'
  | 'KEYBOARD_PREV_TAB'
  | 'KEYBOARD_SWITCH_TAB'
  | 'OMNIBOX_SPAWN_PROFILE'
  | 'OMNIBOX_RUN_COMMAND'
  | 'QUEUE_COMMAND'
  // Targeted pane send (for split layouts with Claude + TUI tools)
  | 'TARGETED_PANE_SEND'
  // Tmux session send (fallback when pane ID unavailable)
  | 'TMUX_SESSION_SEND'
  // Reconnect to terminal (register ownership for API-spawned terminals)
  | 'RECONNECT'
  // Open URL in new tab (content script FAB)
  | 'OPEN_TAB'
  // Dashboard -> Sidebar: Open settings modal to edit a specific profile
  | 'OPEN_SETTINGS_EDIT_PROFILE'
  // Dashboard -> Sidebar: Switch to a specific terminal tab
  | 'SWITCH_TO_TERMINAL'
  // Dashboard -> Background: Focus a popped out terminal window
  | 'FOCUS_POPOUT_TERMINAL'
  // Dashboard -> Background: Focus a 3D Focus tab
  | 'FOCUS_3D_TERMINAL'
  // Browser MCP - Console capture
  | 'CONSOLE_LOG'
  | 'GET_CONSOLE_LOGS'
  | 'CONSOLE_LOGS_RESPONSE'
  // Browser MCP - Script execution
  | 'BROWSER_EXECUTE_SCRIPT'
  | 'BROWSER_SCRIPT_RESULT'
  // Browser MCP - Page info
  | 'BROWSER_GET_PAGE_INFO'
  | 'BROWSER_PAGE_INFO'
  // 3D Focus Mode
  | 'FOCUS_IN_3D'
  | 'RETURN_FROM_3D'
  // Popout Mode
  | 'TERMINAL_POPPED_OUT'
  | 'TERMINAL_RETURNED_FROM_POPOUT'
  | 'UNTRACK_POPOUT_WINDOW'
  | 'GET_POPOUT_WINDOWS'
  | 'POPOUT_WINDOWS_RESPONSE'
  | 'REGISTER_POPOUT_WINDOW';

export interface BaseMessage {
  type: MessageType;
}

export interface OpenSessionMessage extends BaseMessage {
  type: 'OPEN_SESSION';
  sessionName: string;
}

export interface SpawnTerminalMessage extends BaseMessage {
  type: 'SPAWN_TERMINAL';
  command?: string;
  cwd?: string;
  workingDir?: string; // Working directory (can also come from profile)
  spawnOption?: string;
  useTmux?: boolean;
  name?: string; // Friendly name for the tab
  profile?: Profile; // Profile settings (fontSize, fontFamily, theme, workingDir)
  isDark?: boolean; // Global dark/light mode for COLORFGBG env var
  pasteOnly?: boolean; // If true, paste command without executing (no Enter)
}

export interface CloseSessionMessage extends BaseMessage {
  type: 'CLOSE_SESSION';
  sessionName: string;
}

export interface CloseTerminalMessage extends BaseMessage {
  type: 'CLOSE_TERMINAL';
  terminalId: string;
}

export interface TerminalInputMessage extends BaseMessage {
  type: 'TERMINAL_INPUT';
  terminalId: string;
  data: string;
}

export interface TerminalOutputMessage extends BaseMessage {
  type: 'TERMINAL_OUTPUT';
  terminalId: string;
  data: string;
}

export interface TerminalResizeMessage extends BaseMessage {
  type: 'TERMINAL_RESIZE';
  terminalId: string;
  cols: number;
  rows: number;
}

export interface ListTerminalsMessage extends BaseMessage {
  type: 'LIST_TERMINALS';
}

export interface RefreshTerminalsMessage extends BaseMessage {
  type: 'REFRESH_TERMINALS';
}

export interface TerminalReconnectedMessage extends BaseMessage {
  type: 'TERMINAL_RECONNECTED';
  terminalId: string;
}

export interface AddContextMenuMessage extends BaseMessage {
  type: 'ADD_CONTEXT_MENU';
  items: ContextMenuItem[];
}

export interface ContextMenuItem {
  id: string;
  title: string;
  action: () => void;
}

export interface ShowErrorSuggestionMessage extends BaseMessage {
  type: 'SHOW_ERROR_SUGGESTION';
  error: string;
  suggestion: string;
}

export interface UpdateBadgeMessage extends BaseMessage {
  type: 'UPDATE_BADGE';
  count: number;
}

export interface WSMessage extends BaseMessage {
  type: 'WS_MESSAGE';
  data: any;
}

export interface WSConnectedMessage extends BaseMessage {
  type: 'WS_CONNECTED';
}

export interface WSDisconnectedMessage extends BaseMessage {
  type: 'WS_DISCONNECTED';
}

export interface InitialStateMessage extends BaseMessage {
  type: 'INITIAL_STATE';
  wsConnected: boolean;
}

export interface PasteCommandMessage extends BaseMessage {
  type: 'PASTE_COMMAND';
  command: string;
}

export interface KeyboardNewTabMessage extends BaseMessage {
  type: 'KEYBOARD_NEW_TAB';
}

export interface KeyboardCloseTabMessage extends BaseMessage {
  type: 'KEYBOARD_CLOSE_TAB';
}

export interface KeyboardNextTabMessage extends BaseMessage {
  type: 'KEYBOARD_NEXT_TAB';
}

export interface KeyboardPrevTabMessage extends BaseMessage {
  type: 'KEYBOARD_PREV_TAB';
}

export interface KeyboardSwitchTabMessage extends BaseMessage {
  type: 'KEYBOARD_SWITCH_TAB';
  tabIndex: number;
}

export interface OmniboxSpawnProfileMessage extends BaseMessage {
  type: 'OMNIBOX_SPAWN_PROFILE';
  profile: Profile;
}

export interface OmniboxRunCommandMessage extends BaseMessage {
  type: 'OMNIBOX_RUN_COMMAND';
  command: string;
}

export interface QueueCommandMessage extends BaseMessage {
  type: 'QUEUE_COMMAND';
  command: string;
}

// Targeted pane send - for split layouts with Claude + TUI tools
// Sends directly to a specific tmux pane, bypassing PTY and focused pane
export interface TargetedPaneSendMessage extends BaseMessage {
  type: 'TARGETED_PANE_SEND';
  tmuxPane: string;  // Pane ID (e.g., '%42')
  text?: string;     // Text to send (literal, no interpretation)
  sendEnter?: boolean; // Whether to send Enter after text
}

// Tmux session send - fallback when pane ID unavailable
// Sends to the first pane of a tmux session (safer than PTY for Claude terminals)
export interface TmuxSessionSendMessage extends BaseMessage {
  type: 'TMUX_SESSION_SEND';
  sessionName: string;  // Tmux session name (e.g., 'ctt-amber-claude-abc123')
  text?: string;        // Text to send (literal, no interpretation)
  sendEnter?: boolean;  // Whether to send Enter after text
}

// Browser MCP - Console log entry
export type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  url: string;
  tabId: number;
  stack?: string;
}

export interface ConsoleLogMessage extends BaseMessage {
  type: 'CONSOLE_LOG';
  entry: ConsoleLogEntry;
}

export interface GetConsoleLogsMessage extends BaseMessage {
  type: 'GET_CONSOLE_LOGS';
  level?: ConsoleLogLevel | 'all';
  limit?: number;
  since?: number;
  tabId?: number;
}

export interface ConsoleLogsResponseMessage extends BaseMessage {
  type: 'CONSOLE_LOGS_RESPONSE';
  logs: ConsoleLogEntry[];
  total: number;
}

// Browser MCP - Script execution
export interface BrowserExecuteScriptMessage extends BaseMessage {
  type: 'BROWSER_EXECUTE_SCRIPT';
  code: string;
  tabId?: number;
  allFrames?: boolean;
}

export interface BrowserScriptResultMessage extends BaseMessage {
  type: 'BROWSER_SCRIPT_RESULT';
  success: boolean;
  result?: unknown;
  error?: string;
}

// Browser MCP - Page info
export interface BrowserGetPageInfoMessage extends BaseMessage {
  type: 'BROWSER_GET_PAGE_INFO';
  tabId?: number;
}

export interface BrowserPageInfoMessage extends BaseMessage {
  type: 'BROWSER_PAGE_INFO';
  url: string;
  title: string;
  tabId: number;
  favIconUrl?: string;
}

// Reconnect to terminal (for API-spawned terminals)
export interface ReconnectMessage extends BaseMessage {
  type: 'RECONNECT';
  terminalId: string;
}

// Open a URL in a new tab (used by content script FAB)
export interface OpenTabMessage extends BaseMessage {
  type: 'OPEN_TAB';
  url: string;
}

// Open settings modal to edit a specific profile (dashboard -> sidebar)
export interface OpenSettingsEditProfileMessage extends BaseMessage {
  type: 'OPEN_SETTINGS_EDIT_PROFILE';
  profileId: string;
}

// Switch to a specific terminal tab in the sidebar (dashboard -> sidebar)
export interface SwitchToTerminalMessage extends BaseMessage {
  type: 'SWITCH_TO_TERMINAL';
  terminalId: string;
}

// Focus a popped out terminal window (dashboard -> background)
export interface FocusPopoutTerminalMessage extends BaseMessage {
  type: 'FOCUS_POPOUT_TERMINAL';
  terminalId: string;
}

// Focus a 3D Focus tab (dashboard -> background)
export interface Focus3DTerminalMessage extends BaseMessage {
  type: 'FOCUS_3D_TERMINAL';
  terminalId: string;
}

// 3D Focus Mode - notify sidebar when opening in 3D view
export interface FocusIn3DMessage extends BaseMessage {
  type: 'FOCUS_IN_3D';
  terminalId: string;
}

// 3D Focus Mode - notify sidebar when returning from 3D view
export interface ReturnFrom3DMessage extends BaseMessage {
  type: 'RETURN_FROM_3D';
  terminalId: string;
}

// Popout Mode - notify sidebar when terminal is popped out to standalone window
export interface TerminalPoppedOutMessage extends BaseMessage {
  type: 'TERMINAL_POPPED_OUT';
  terminalId: string;
  windowId: number;
}

// Popout Mode - notify sidebar when returning from popout window
export interface TerminalReturnedFromPopoutMessage extends BaseMessage {
  type: 'TERMINAL_RETURNED_FROM_POPOUT';
  terminalId: string;
}

// Popout Mode - tell background to stop tracking a popout window (for "Return to Sidebar")
export interface UntrackPopoutWindowMessage extends BaseMessage {
  type: 'UNTRACK_POPOUT_WINDOW';
  windowId: number;
}

// Popout Mode - query which windows are currently tracked as popouts
export interface GetPopoutWindowsMessage extends BaseMessage {
  type: 'GET_POPOUT_WINDOWS';
}

// Popout Mode - response with currently tracked popout windows
export interface PopoutWindowsResponseMessage extends BaseMessage {
  type: 'POPOUT_WINDOWS_RESPONSE';
  popouts: Array<{ windowId: number; terminalId: string }>;
}

// Popout Mode - re-register a popout window (handles service worker restart)
export interface RegisterPopoutWindowMessage extends BaseMessage {
  type: 'REGISTER_POPOUT_WINDOW';
  windowId: number;
  terminalId: string;
}

export type ExtensionMessage =
  | InitialStateMessage
  | OpenSessionMessage
  | SpawnTerminalMessage
  | CloseSessionMessage
  | CloseTerminalMessage
  | TerminalInputMessage
  | TerminalOutputMessage
  | TerminalResizeMessage
  | ListTerminalsMessage
  | RefreshTerminalsMessage
  | TerminalReconnectedMessage
  | AddContextMenuMessage
  | ShowErrorSuggestionMessage
  | UpdateBadgeMessage
  | PasteCommandMessage
  | WSMessage
  | WSConnectedMessage
  | WSDisconnectedMessage
  | KeyboardNewTabMessage
  | KeyboardCloseTabMessage
  | KeyboardNextTabMessage
  | KeyboardPrevTabMessage
  | KeyboardSwitchTabMessage
  | OmniboxSpawnProfileMessage
  | OmniboxRunCommandMessage
  | QueueCommandMessage
  | TargetedPaneSendMessage
  | TmuxSessionSendMessage
  | ReconnectMessage
  | OpenTabMessage
  | OpenSettingsEditProfileMessage
  | SwitchToTerminalMessage
  | FocusPopoutTerminalMessage
  | Focus3DTerminalMessage
  // Browser MCP messages
  | ConsoleLogMessage
  | GetConsoleLogsMessage
  | ConsoleLogsResponseMessage
  | BrowserExecuteScriptMessage
  | BrowserScriptResultMessage
  | BrowserGetPageInfoMessage
  | BrowserPageInfoMessage
  // 3D Focus Mode
  | FocusIn3DMessage
  | ReturnFrom3DMessage
  // Popout Mode
  | TerminalPoppedOutMessage
  | TerminalReturnedFromPopoutMessage
  | UntrackPopoutWindowMessage
  | GetPopoutWindowsMessage
  | PopoutWindowsResponseMessage
  | RegisterPopoutWindowMessage;

// Helper function to send messages
export function sendMessage(message: ExtensionMessage): Promise<any> {
  return chrome.runtime.sendMessage(message).catch((error) => {
    // Handle "Receiving end does not exist" errors gracefully
    if (error.message?.includes('Receiving end does not exist')) {
      console.warn('[Messaging] Background worker not ready, message dropped:', message.type)
    } else {
      console.error('[Messaging] Error sending message:', error, message)
    }
    return null // Return null instead of propagating error
  });
}

// Helper function to listen to messages (one-time messaging)
export function onMessage(
  callback: (message: ExtensionMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => void
) {
  chrome.runtime.onMessage.addListener(callback);
}

// Helper function to connect via port and listen to messages (long-lived connection)
// Use this for components that need to receive broadcasts from background worker
export function connectToBackground(
  name: string,
  onMessageCallback: (message: ExtensionMessage) => void
): chrome.runtime.Port {
  const port = chrome.runtime.connect({ name });

  port.onMessage.addListener((message: ExtensionMessage) => {
    onMessageCallback(message);
  });

  port.onDisconnect.addListener(() => {
    // Port disconnected
  });

  return port;
}
