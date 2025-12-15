/**
 * Console Forwarder - Pipes browser console logs to backend terminal
 * Optimized for Claude Code debugging via tmux capture-pane
 *
 * Logs are sent to the backend which outputs them with [Browser] prefix.
 * This allows Claude to capture browser logs via: tmux capture-pane -t tabzchrome:backend -p -S -100
 */

const BACKEND_URL = 'http://localhost:8129';
let logBuffer: Array<{ level: string; message: string; timestamp: number; source?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isEnabled = true;

// Extract source file/line from stack trace
function getSource(): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Get first non-forwarder line from stack
    const lines = stack.split('\n');
    const relevantLine = lines.find(line =>
      (line.includes('.tsx') || line.includes('.ts')) &&
      !line.includes('consoleForwarder')
    );

    if (relevantLine) {
      // Extract filename:line from stack (e.g., "SimpleTerminalApp.tsx:123")
      const match = relevantLine.match(/([^/\\]+\.tsx?):(\d+)/);
      if (match) return `${match[1]}:${match[2]}`;
    }
  } catch {
    // Silent fail
  }
  return undefined;
}

// Strip emojis and problematic unicode characters for clean terminal output
function stripEmojis(str: string): string {
  return str
    // Remove emoji characters (wide unicode ranges)
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // Remove other symbol blocks that cause issues
    .replace(/[\u{2600}-\u{26FF}]/gu, '')  // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')  // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')  // Variation selectors
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '') // Mahjong
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '') // Playing cards
    // Clean up any resulting double spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Format args for compact, readable output
function formatArgs(args: unknown[]): string {
  const formatted = args.map(arg => {
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';

    // For objects, try to make compact
    try {
      if (arg instanceof Error) {
        return `Error: ${arg.message}`;
      }

      // Small objects - inline
      const json = JSON.stringify(arg);
      if (json.length < 80) return json;

      // Large objects - just type/keys
      if (Array.isArray(arg)) {
        return `Array(${arg.length})`;
      }

      const keys = Object.keys(arg as object);
      return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    } catch {
      return '[Object]';
    }
  }).join(' ');

  // Strip emojis from final output to prevent terminal issues
  return stripEmojis(formatted);
}

// Send logs in batches (reduces network overhead)
function flushLogs() {
  if (logBuffer.length === 0 || !isEnabled) return;

  const batch = [...logBuffer];
  logBuffer = [];

  fetch(`${BACKEND_URL}/api/console-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs: batch })
  }).catch(() => {
    // Silent fail - backend might not be running
  });
}

function queueLog(level: string, args: unknown[]) {
  if (!isEnabled) return;

  const message = formatArgs(args);

  // Skip empty messages
  if (!message) return;

  const source = getSource();

  logBuffer.push({
    level,
    message,
    timestamp: Date.now(),
    ...(source && { source })
  });

  // Flush after 100ms (batch multiple logs)
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushLogs, 100);
}

export function setupConsoleForwarding() {
  // Store originals
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  // Override console methods
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    queueLog('log', args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    queueLog('error', args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    queueLog('warn', args);
  };

  console.info = (...args: unknown[]) => {
    originalInfo(...args);
    queueLog('info', args);
  };

  console.debug = (...args: unknown[]) => {
    originalDebug(...args);
    queueLog('debug', args);
  };

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    flushLogs();
  });

  originalLog('[ConsoleForwarder] Browser logs forwarding to backend terminal');
}

// Allow disabling at runtime (useful if causing issues)
export function disableConsoleForwarding() {
  isEnabled = false;
  console.log('[ConsoleForwarder] Disabled');
}

export function enableConsoleForwarding() {
  isEnabled = true;
  console.log('[ConsoleForwarder] Enabled');
}
