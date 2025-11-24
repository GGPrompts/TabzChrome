// Chrome Extension Message Types
import type { Profile } from '../components/SettingsModal'

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
  | 'KEYBOARD_SWITCH_TAB';

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
  | KeyboardSwitchTabMessage;

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
