/**
 * tmux Session Manager
 *
 * Provides comprehensive tmux session management for Tabz.
 * Inspired by tmuxplexer's architecture, adapted for Node.js backend.
 *
 * Features:
 * - List all tmux sessions with rich metadata
 * - Detect Claude Code/AI sessions and parse statuslines
 * - Capture pane content for previews
 * - Session operations: attach, kill, send commands
 * - Git branch detection
 * - Working directory tracking
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createModuleLogger } = require('./logger');
const { SECRET_TMUX_OPTION, secretFlagsForRecoveredSession } = require('./terminal-registry');

const TMUX_CONTROL_COMMANDS = new Set([
  'list-panes', 'list-windows', 'display-message',
  'split-window', 'new-window', 'kill-pane', 'kill-window', 'break-pane',
  'select-pane', 'select-window', 'select-layout', 'next-window', 'previous-window',
  'last-window', 'last-pane', 'rotate-window', 'swap-pane', 'resize-pane',
  'rename-window', 'respawn-pane', 'clear-history'
]);

function parseTmuxControlCommand(command) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return { error: 'Command is required' };
  }
  const [subcommand, ...args] = command.trim().split(/\s+/);
  if (!TMUX_CONTROL_COMMANDS.has(subcommand)) {
    return { error: `tmux command "${subcommand}" is not allowed here` };
  }
  for (const token of args) {
    if (token.includes(';')) return { error: 'Command may not contain a tmux command separator' };
    if (/^-[A-Za-z]*[tsST]/.test(token)) {
      return { error: `Flag "${token}" is not allowed: the route session is the only target` };
    }
  }
  return { argv: [subcommand, ...args] };
}

function runTmux(args, options = {}) {
  const result = spawnSync('tmux', args, { encoding: 'utf8', timeout: 5000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(String(result.stderr || '').trim() || `tmux exited ${result.status}`);
  }
  return String(result.stdout || '');
}

const log = createModuleLogger('Tmux');

class TmuxSessionManager {
  constructor() {
    this.claudeStateDir = '/tmp/claude-code-state';

    // AI tool detection patterns
    this.aiToolPatterns = {
      'claude-code': /claude|claude-code/i,
      'opencode': /opencode/i,
      'codex': /codex/i,
      'gemini': /gemini/i,
    };

    // Terminal type patterns from Tabz
    this.tabzPatterns = {
      'tui-tool': /^tui-tool-/,
      'claude-code': /^claude-code-/,
      'opencode': /^opencode-/,
      'codex': /^codex-/,
      'gemini': /^gemini-/,
      'bash': /^bash-/,
    };
  }

  /**
   * Check if tmux server is running
   */
  isTmuxRunning() {
    try {
      runTmux(['list-sessions']);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * List all tmux sessions with detailed metadata
   * Returns array of session objects with:
   * - Basic info (name, windows, attached)
   * - Working directory & git branch
   * - AI tool detection
   * - Claude Code statusline (if applicable)
   * - Tabz managed vs external
   */
  async listDetailedSessions() {
    if (!this.isTmuxRunning()) {
      return [];
    }

    try {
      // Get raw session data
      const output = runTmux([
        'list-sessions', '-F',
        `#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{${SECRET_TMUX_OPTION}}`
      ]);

      const lines = output.trim().split('\n').filter(l => l.length > 0);
      const sessions = [];

      // Load all Claude state files once (performance optimization)
      const stateCache = this.loadAllClaudeStates();

      for (const line of lines) {
        const [name, windows, attached, created, secretOption] = line.split('|');
        const secret = secretFlagsForRecoveredSession(name, secretOption).secret;

        const session = {
          name,
          windows: parseInt(windows, 10),
          attached: attached === '1',
          created,
          secret,
          workingDir: null,
          gitBranch: null,
          aiTool: null,
          tabzManaged: false,
          claudeState: null,
          paneCommand: null,
          paneCount: 1,
        };

        // Protected editors are classified from the one list-sessions call.
        // Do not inspect their pane title, command, working directory, or git state.
        if (secret) {
          sessions.push(session);
          continue;
        }

        // Detect if Opustrator-managed session
        session.tabzManaged = this.isTabzSession(name);

        // Get working directory and current command
        await this.enrichSessionMetadata(session);

        // Detect AI tool type
        session.aiTool = this.detectAITool(session);

        // Get Claude Code statusline if applicable
        if (session.aiTool === 'claude-code') {
          session.claudeState = await this.getClaudeState(session, stateCache);
        }

        sessions.push(session);
      }

      return sessions;
    } catch (error) {
      log.error(' Error listing sessions:', error.message);
      return [];
    }
  }

  listSessionNames() {
    try {
      const output = runTmux([
        'list-sessions', '-F', `#{session_name}|#{${SECRET_TMUX_OPTION}}`
      ]);
      return output.trim().split('\n').filter(Boolean).map(line => {
        const [name, secretOption] = line.split('|');
        return { name, secret: secretFlagsForRecoveredSession(name, secretOption).secret };
      });
    } catch {
      return [];
    }
  }

  /**
   * Check if session is managed by Tabz
   */
  isTabzSession(sessionName) {
    for (const pattern of Object.values(this.tabzPatterns)) {
      if (pattern.test(sessionName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Enrich session with metadata (working dir, git branch, command)
   */
  async enrichSessionMetadata(session) {
    try {
      // Get pane information including pane_title (use session name without window index - works with any base-index)
      const paneLines = runTmux([
        'list-panes', '-t', `=${session.name}`, '-F',
        '#{pane_id}|#{pane_current_path}|#{pane_current_command}|#{pane_title}'
      ]).trim().split('\n');
      session.paneCount = paneLines.length;
      const paneInfo = paneLines[0]; // Get first pane

      if (paneInfo) {
        const [paneId, workingDir, command, rawPaneTitle] = paneInfo.split('|');
        session.paneId = paneId;
        session.workingDir = workingDir;
        session.paneCommand = command;

        // Store paneTitle if it's meaningful (not hostname, shell name, or generic)
        // This is set by Claude Code for current todo, or by apps like PyRadio for current song
        const hostnamePattern = /^(localhost|[\w]+-?(desktop|laptop)|ip-[\d-]+)$/i;
        const genericShellPattern = /^(bash|zsh|sh|fish|python|node)$/i;
        if (rawPaneTitle &&
            !hostnamePattern.test(rawPaneTitle) &&
            !genericShellPattern.test(rawPaneTitle) &&
            !rawPaneTitle.startsWith('~') &&
            !rawPaneTitle.startsWith('/')) {
          session.paneTitle = rawPaneTitle;
        }

        // Get git branch if in a repo
        if (workingDir && fs.existsSync(workingDir)) {
          session.gitBranch = this.getGitBranch(workingDir);
        }
      }
    } catch (error) {
      // Session might have closed or no panes
      log.error(`Error enriching session ${session.name}:`, error.message);
    }
  }

  /**
   * Get git branch for a directory
   */
  getGitBranch(directory) {
    try {
      const result = spawnSync(
        'git', ['-C', directory, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8', timeout: 5000 }
      );
      if (result.error || result.status !== 0) return null;
      const branch = String(result.stdout || '').trim();
      return branch || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Detect AI tool type from session name and command
   */
  detectAITool(session) {
    // Check session name first
    for (const [tool, pattern] of Object.entries(this.aiToolPatterns)) {
      if (pattern.test(session.name)) {
        return tool;
      }
    }

    // Check running command
    if (session.paneCommand) {
      for (const [tool, pattern] of Object.entries(this.aiToolPatterns)) {
        if (pattern.test(session.paneCommand)) {
          return tool;
        }
      }
    }

    return null;
  }

  /**
   * Load all Claude state files into memory (called once per API request)
   * Performance: Scans directory once instead of per-session lookups
   */
  loadAllClaudeStates() {
    const startTime = Date.now();
    const states = [];

    try {
      if (!fs.existsSync(this.claudeStateDir)) {
        return states;
      }

      const files = fs.readdirSync(this.claudeStateDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Prioritize status files (start with _) over context files (UUIDs with -context suffix)
      // Status files have tmux_pane for matching, context files have context_pct
      const statusFiles = jsonFiles.filter(f => f.startsWith('_'));
      const contextFiles = jsonFiles.filter(f => f.includes('-context'));

      // Load all status files (usually just a few) + limited context files
      const filesToLoad = [...statusFiles, ...contextFiles.slice(0, 50)];

      for (const file of filesToLoad) {
        try {
          const filePath = path.join(this.claudeStateDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const state = JSON.parse(content);
          states.push(state);
        } catch (error) {
          // Skip invalid files
        }
      }

      const duration = Date.now() - startTime;
      if (duration > 10) {
        log.debug(` Loaded ${states.length} Claude state files in ${duration}ms`);
      }
    } catch (error) {
      log.error(' Error loading Claude states:', error.message);
    }

    return states;
  }

  /**
   * Find Claude state for a session by matching pane ID or working directory
   * Uses pre-loaded state cache for performance
   * Also looks up context_pct from context files via claude_session_id
   */
  findClaudeStateInCache(session, stateCache) {
    if (!stateCache || stateCache.length === 0) {
      return null;
    }

    let statusState = null;

    // Try to match by tmux pane ID (most reliable)
    if (session.paneId) {
      statusState = stateCache.find(state =>
        state.tmux_pane === session.paneId
      );
    }

    // Fallback: match by working directory
    if (!statusState && session.workingDir) {
      statusState = stateCache.find(state =>
        state.working_dir === session.workingDir
      );
    }

    if (!statusState) {
      return null;
    }

    // Look up context_pct from context file via claude_session_id
    if (statusState.claude_session_id) {
      const contextState = stateCache.find(state =>
        state.session_id === statusState.claude_session_id &&
        state.context_pct !== undefined
      );
      if (contextState) {
        statusState = {
          ...statusState,
          context_pct: contextState.context_pct,
        };
      }
    }

    return statusState;
  }

  /**
   * Get Claude Code state by parsing statusline
   * Uses pre-loaded state cache and tmux capture-pane
   */
  async getClaudeState(session, stateCache = null) {
    try {
      if (!session.paneId) {
        return null;
      }

      // Try to find state from pre-loaded cache
      if (stateCache) {
        const cachedState = this.findClaudeStateInCache(session, stateCache);
        if (cachedState) {
          // Format the state to match expected structure
          return {
            status: cachedState.status || 'unknown',
            currentTool: cachedState.current_tool || null,
            lastUpdated: cachedState.last_updated,
            context_pct: cachedState.context_pct,
            details: cachedState.details || null,
          };
        }
      }

      // Fallback: Parse statusline from terminal content
      const content = runTmux(
        ['capture-pane', '-p', '-S', '-100', '-t', session.paneId],
        { maxBuffer: 1024 * 1024 }
      );

      return this.parseClaudeStatusline(content);
    } catch (error) {
      log.error(`Error getting Claude state for ${session.name}:`, error.message);
      return null;
    }
  }

  /**
   * Parse Claude Code statusline from terminal content
   * Looks for Claude Code status indicators
   */
  parseClaudeStatusline(content) {
    const lines = content.split('\n');

    // Look for statusline in last 10 lines (usually at bottom)
    const statusLines = lines.slice(-10);

    const state = {
      status: 'unknown',
      currentTool: null,
      lastUpdated: new Date().toISOString(),
    };

    // Common Claude Code status patterns
    const patterns = {
      idle: /idle|ready|waiting/i,
      processing: /processing|thinking|analyzing/i,
      tool_use: /tool|executing|running/i,
      working: /working|busy/i,
      awaiting_input: /awaiting|input|waiting for|prompt/i,
    };

    // Search for status indicators
    for (const line of statusLines) {
      // Check for status keywords
      for (const [status, pattern] of Object.entries(patterns)) {
        if (pattern.test(line)) {
          state.status = status;
          break;
        }
      }

      // Try to extract current tool
      const toolMatch = line.match(/Tool:\s*([A-Za-z]+)/i);
      if (toolMatch) {
        state.currentTool = toolMatch[1];
      }
    }

    return state;
  }

  /**
   * Sanitize captured pane content to fix rendering issues
   * Handles box drawing characters, emojis, ANSI codes, and line width
   */
  sanitizePreviewContent(content, maxWidth = 120) {
    if (!content) return '';

    // Strip ANSI escape codes (colors, cursor movements, etc.)
    let sanitized = content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    // Remove other control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Split into lines for processing
    const lines = sanitized.split('\n');
    const processedLines = [];

    for (let line of lines) {
      // Limit line width to prevent overflow
      // Account for wide characters (emojis, CJK)
      let visualWidth = 0;
      let truncatedLine = '';

      for (const char of line) {
        // Estimate character width (crude but effective)
        const charWidth = this.getCharWidth(char);

        if (visualWidth + charWidth <= maxWidth) {
          truncatedLine += char;
          visualWidth += charWidth;
        } else {
          truncatedLine += '…'; // Add ellipsis if truncated
          break;
        }
      }

      processedLines.push(truncatedLine);
    }

    // Limit total number of lines to prevent excessive scrolling
    const maxLines = 100;
    if (processedLines.length > maxLines) {
      processedLines.splice(maxLines, processedLines.length - maxLines);
      processedLines.push('... (truncated)');
    }

    return processedLines.join('\n');
  }

  /**
   * Get estimated display width of a character
   * Emojis and wide chars (CJK) are typically 2 columns
   */
  getCharWidth(char) {
    const code = char.charCodeAt(0);

    // Emoji ranges (simplified - covers most common emojis)
    if (
      (code >= 0x1F300 && code <= 0x1F9FF) || // Misc symbols & pictographs
      (code >= 0x2600 && code <= 0x26FF) ||   // Misc symbols
      (code >= 0x2700 && code <= 0x27BF) ||   // Dingbats
      (code >= 0xFE00 && code <= 0xFE0F) ||   // Variation selectors
      (code >= 0x1F600 && code <= 0x1F64F)    // Emoticons
    ) {
      return 2;
    }

    // CJK ranges (Chinese, Japanese, Korean)
    if (
      (code >= 0x3000 && code <= 0x9FFF) ||   // CJK symbols and CJK unified ideographs
      (code >= 0xAC00 && code <= 0xD7AF) ||   // Hangul syllables
      (code >= 0xF900 && code <= 0xFAFF)      // CJK compatibility ideographs
    ) {
      return 2;
    }

    // Default to 1 for most characters
    return 1;
  }

  /**
   * Capture pane content for preview
   * @param {string} sessionName - Session name
   * @param {number} lines - Number of lines to capture (default: 100)
   * @param {number} windowIndex - Window index (default: 1, tmux windows start at 1)
   */
  async capturePanePreview(sessionName, lines = 100, windowIndex = 1) {
    try {
      // Get pane ID for the window
      const paneInfo = runTmux([
        'list-panes', '-t', `=${sessionName}:${windowIndex}`, '-F', '#{pane_id}'
      ]).trim().split('\n')[0];

      if (!paneInfo) {
        throw new Error('No pane found');
      }

      // Capture pane content
      // -e: preserve escape sequences for better handling
      // -p: print to stdout
      // -S -N: start N lines back from current position
      const rawContent = runTmux(
        ['capture-pane', '-p', '-e', '-S', `-${lines}`, '-t', paneInfo],
        { maxBuffer: 1024 * 1024 }
      );

      // Sanitize content to fix rendering issues
      const content = this.sanitizePreviewContent(rawContent);

      return {
        success: true,
        content,
        lines: content.split('\n').length,
        paneId: paneInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Capture full pane scrollback (for comprehensive previews)
   * WARNING: Can be slow for long sessions
   * @param {number} windowIndex - Window index (default: 1, tmux windows start at 1)
   */
  async captureFullScrollback(sessionName, windowIndex = 1) {
    try {
      const paneInfo = runTmux([
        'list-panes', '-t', `=${sessionName}:${windowIndex}`, '-F', '#{pane_id}'
      ]).trim().split('\n')[0];

      if (!paneInfo) {
        throw new Error('No pane found');
      }

      // Capture from beginning of scrollback
      const rawContent = runTmux(
        ['capture-pane', '-p', '-e', '-S', '-', '-t', paneInfo],
        { maxBuffer: 10 * 1024 * 1024 }
      );

      // Sanitize content to fix rendering issues
      const content = this.sanitizePreviewContent(rawContent);

      return {
        success: true,
        content,
        lines: content.split('\n').length,
        paneId: paneInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Kill a tmux session
   */
  async killSession(sessionName) {
    try {
      runTmux(['kill-session', '-t', `=${sessionName}`]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send command to tmux session
   * Simulates typing command and pressing Enter
   */
  async sendCommand(sessionName, command) {
    try {
      const { spawnSync } = require('child_process');
      // Use spawnSync with array args to bypass shell interpretation
      // This preserves $VAR, #, backticks, and other shell special characters
      runTmux(['send-keys', '-t', `=${sessionName}`, '-l', command]);

      // Wait a bit for command to be typed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send Enter
      runTmux(['send-keys', '-t', `=${sessionName}`, 'Enter']);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute tmux control command on session
   * Does NOT send keys to terminal - executes tmux command directly
   * Safe to use with TUI apps (won't corrupt vim, htop, Claude Code, etc.)
   */
  async executeTmuxCommand(sessionName, command) {
    try {
      const parsed = parseTmuxControlCommand(command);
      if (parsed.error) return { success: false, error: parsed.error, rejected: true };
      runTmux([...parsed.argv, '-t', `=${sessionName}`]);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List windows for a session
   */
  async listWindows(sessionName) {
    try {
      const output = runTmux([
        'list-windows', '-t', `=${sessionName}`, '-F',
        '#{window_index}|#{window_name}|#{window_panes}|#{window_active}'
      ]);

      const windows = output.trim().split('\n').map(line => {
        const [index, name, panes, active] = line.split('|');
        return {
          index: parseInt(index, 10),
          name,
          panes: parseInt(panes, 10),
          active: active === '1',
        };
      });

      return { success: true, windows };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List panes for a session
   * @param {string} sessionName - tmux session name
   * @returns {Array} Array of pane objects
   */
  async listPanes(sessionName) {
    try {
      const output = runTmux([
        'list-panes', '-t', `=${sessionName}`, '-F',
        '#{pane_id}|#{pane_index}|#{pane_current_command}|#{pane_title}|#{pane_active}|#{pane_current_path}'
      ]);

      return output.trim().split('\n').filter(l => l.length > 0).map(line => {
        const [paneId, index, command, title, active, currentPath] = line.split('|');
        return {
          paneId,
          index: parseInt(index, 10),
          command,
          title,
          active: active === '1',
          path: currentPath,
        };
      });
    } catch (error) {
      // Session not found or tmux not running
      return [];
    }
  }

  /**
   * Find session name by pane ID (e.g. %42)
   * Caches result for 5 seconds to avoid shelling out every request
   * @param {string} paneId - tmux pane ID (e.g. %42)
   * @returns {string|null} Session name or null
   */
  findSessionByPaneId(paneId) {
    const now = Date.now();

    // Refresh cache if stale (>5 seconds)
    if (!this._paneSessionCache || (now - this._paneSessionCacheTime) > 5000) {
      try {
        const output = runTmux([
          'list-panes', '-a', '-F', '#{session_name}|#{pane_id}'
        ]);

        this._paneSessionCache = new Map();
        output.trim().split('\n').filter(l => l.length > 0).forEach(line => {
          const [sessionName, pid] = line.split('|');
          this._paneSessionCache.set(pid, sessionName);
        });
        this._paneSessionCacheTime = now;
      } catch (error) {
        // tmux not running
        this._paneSessionCache = new Map();
        this._paneSessionCacheTime = now;
        return null;
      }
    }

    return this._paneSessionCache.get(paneId) || null;
  }

  /**
   * Get session status icon based on state
   * Matches tmuxplexer's status icons
   */
  getStatusIcon(session) {
    if (!session.aiTool) {
      return session.attached ? '●' : '○'; // Attached/detached
    }

    if (session.claudeState) {
      const { status } = session.claudeState;

      // Check if state is stale (>60 seconds old)
      if (session.claudeState.lastUpdated) {
        const age = Date.now() - new Date(session.claudeState.lastUpdated).getTime();
        if (age > 60000) {
          return '⚪'; // Stale
        }
      }

      switch (status) {
        case 'idle':
          return '🟢';
        case 'processing':
          return '🟡';
        case 'tool_use':
          return '🔧';
        case 'working':
          return '⚙️';
        case 'awaiting_input':
          return '⏸️';
        default:
          return '⚪'; // Unknown
      }
    }

    return '🤖'; // AI session but no state info
  }

  /**
   * Group sessions by type
   * Returns { tabz: [], claudeCode: [], external: [] }
   *
   * Priority: AI tool type > Tabz management
   * This ensures Claude Code sessions appear in "Claude Code Sessions"
   * regardless of whether they're Tabz-managed or external.
   */
  groupSessions(sessions) {
    const groups = {
      tabz: [],
      claudeCode: [],
      external: [],
    };

    for (const session of sessions) {
      // Prioritize AI tool detection over Tabz management
      // This ensures right-click spawned Claude sessions appear in Claude Code group
      if (session.aiTool === 'claude-code') {
        groups.claudeCode.push(session);
      } else if (session.tabzManaged) {
        groups.tabz.push(session);
      } else {
        groups.external.push(session);
      }
    }

    return groups;
  }
}

module.exports = new TmuxSessionManager();
module.exports.parseTmuxControlCommand = parseTmuxControlCommand;
