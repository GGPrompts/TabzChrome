/**
 * Global keyboard event handler for terminal shortcuts
 *
 * Prevents browser shortcuts from interfering with terminal operations:
 * - Ctrl+W (close tab) → tmux kill-pane
 * - Ctrl+T (new tab) → tmux new window
 * - Ctrl+R (refresh) → bash reverse search
 * - Ctrl+L (address bar) → bash clear screen
 * - Ctrl+1-9 (browser tabs) → tmux window switching
 * - Ctrl+N (new window) → various terminal uses
 * - Ctrl+Tab (browser tab switch) → tmux window cycling
 */

export function setupKeyboardHandler() {
  // List of shortcuts to intercept when terminal has focus
  const interceptedShortcuts = new Set([
    'Ctrl+W',      // Close tab → tmux kill-pane
    'Ctrl+T',      // New tab → tmux new window
    'Ctrl+R',      // Refresh → bash reverse search
    'Ctrl+L',      // Address bar → clear screen
    'Ctrl+N',      // New window → various terminal uses
    'Ctrl+K',      // Search bar → tmux kill to end of line
    'Ctrl+D',      // Bookmark → EOF/exit
    'Ctrl+1',      // Browser tab 1
    'Ctrl+2',      // Browser tab 2
    'Ctrl+3',      // Browser tab 3
    'Ctrl+4',      // Browser tab 4
    'Ctrl+5',      // Browser tab 5
    'Ctrl+6',      // Browser tab 6
    'Ctrl+7',      // Browser tab 7
    'Ctrl+8',      // Browser tab 8
    'Ctrl+9',      // Browser tab 9
    'Ctrl+Tab',    // Cycle browser tabs
    'Ctrl+Shift+Tab', // Cycle browser tabs backward
  ]);

  // Also support Cmd key on macOS
  const macShortcuts = new Set(
    Array.from(interceptedShortcuts).map(s => s.replace('Ctrl', 'Meta'))
  );

  const allShortcuts = new Set([...interceptedShortcuts, ...macShortcuts]);

  function getShortcutString(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Meta');
    if (event.shiftKey && event.key !== 'Shift') parts.push('Shift');
    if (event.altKey && event.key !== 'Alt') parts.push('Alt');

    // Normalize key name
    let key = event.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();

    parts.push(key);

    return parts.join('+');
  }

  function isTerminalFocused(): boolean {
    const activeElement = document.activeElement;

    // Check if focus is in xterm textarea
    if (activeElement?.classList.contains('xterm-helper-textarea')) {
      return true;
    }

    // Check if focus is within a terminal container
    const terminalContainer = activeElement?.closest('.terminal-container');
    if (terminalContainer) {
      return true;
    }

    return false;
  }

  // Global keydown handler
  const keydownHandler = (event: KeyboardEvent) => {
    // Only intercept if terminal is focused
    if (!isTerminalFocused()) {
      return;
    }

    const shortcut = getShortcutString(event);

    if (allShortcuts.has(shortcut)) {
      // Prevent browser from handling this shortcut
      event.preventDefault();
      // DON'T stopPropagation - let the event reach xterm.js!

      // Log for debugging (remove in production)
      if (import.meta.env.DEV) {
        console.log(`[KeyboardHandler] Intercepted: ${shortcut} - forwarding to terminal`);
      }

      // The event will now reach xterm.js naturally since we only prevented
      // the browser's default action, not the event propagation
    }
  };

  // Attach global handler
  document.addEventListener('keydown', keydownHandler, { capture: true });

  // Prevent context menu (right-click) in terminals
  const contextMenuHandler = (event: MouseEvent) => {
    // Check if right-click is inside a terminal
    const target = event.target as HTMLElement;
    const terminalContainer = target?.closest('.terminal-container');

    if (terminalContainer) {
      // Prevent browser context menu
      event.preventDefault();
      event.stopPropagation();

      if (import.meta.env.DEV) {
        console.log('[KeyboardHandler] Blocked browser context menu in terminal');
      }

      // The terminal (tmux/TUI apps) will handle right-click naturally
    }
  };

  document.addEventListener('contextmenu', contextMenuHandler, { capture: true });

  console.log('[KeyboardHandler] Initialized - terminal shortcuts will override browser shortcuts');
  console.log('[KeyboardHandler] Browser context menu disabled in terminals');

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', keydownHandler, { capture: true });
    document.removeEventListener('contextmenu', contextMenuHandler, { capture: true });
  };
}

/**
 * List of common terminal shortcuts that conflict with browsers
 * For documentation/user reference
 */
export const TERMINAL_SHORTCUTS = {
  bash: [
    { keys: 'Ctrl+R', description: 'Reverse search command history' },
    { keys: 'Ctrl+L', description: 'Clear screen' },
    { keys: 'Ctrl+D', description: 'EOF / Exit shell' },
    { keys: 'Ctrl+W', description: 'Delete word backward' },
    { keys: 'Ctrl+K', description: 'Kill line from cursor' },
    { keys: 'Ctrl+A', description: 'Move to start of line' },
    { keys: 'Ctrl+E', description: 'Move to end of line' },
  ],
  tmux: [
    { keys: 'Ctrl+B', description: 'Tmux prefix (default)' },
    { keys: 'Ctrl+B C', description: 'New window' },
    { keys: 'Ctrl+B %', description: 'Split pane vertically' },
    { keys: 'Ctrl+B "', description: 'Split pane horizontally' },
    { keys: 'Ctrl+B 0-9', description: 'Switch to window N' },
    { keys: 'Ctrl+B D', description: 'Detach session' },
    { keys: 'Ctrl+B [', description: 'Enter copy mode' },
  ],
  vim: [
    { keys: 'Ctrl+W', description: 'Window commands prefix' },
    { keys: 'Ctrl+D', description: 'Scroll down half page' },
    { keys: 'Ctrl+U', description: 'Scroll up half page' },
    { keys: 'Ctrl+F', description: 'Page down' },
    { keys: 'Ctrl+B', description: 'Page up' },
  ],
};
