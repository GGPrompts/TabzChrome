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

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

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
      execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf8' });
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
      const output = execSync(
        'tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_attached}|#{session_created}"',
        { encoding: 'utf8' }
      );

      const lines = output.trim().split('\n').filter(l => l.length > 0);
      const sessions = [];

      // Load all Claude state files once (performance optimization)
      const stateCache = this.loadAllClaudeStates();

      for (const line of lines) {
        const [name, windows, attached, created] = line.split('|');

        const session = {
          name,
          windows: parseInt(windows, 10),
          attached: attached === '1',
          created,
          workingDir: null,
          gitBranch: null,
          aiTool: null,
          tabzManaged: false,
          claudeState: null,
          paneCommand: null,
        };

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
      console.error('[TmuxSessionManager] Error listing sessions:', error.message);
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
      // Get pane information for first window
      const paneInfo = execSync(
        `tmux list-panes -t "${session.name}:0" -F "#{pane_id}|#{pane_current_path}|#{pane_current_command}"`,
        { encoding: 'utf8' }
      ).trim().split('\n')[0]; // Get first pane

      if (paneInfo) {
        const [paneId, workingDir, command] = paneInfo.split('|');
        session.paneId = paneId;
        session.workingDir = workingDir;
        session.paneCommand = command;

        // Get git branch if in a repo
        if (workingDir && fs.existsSync(workingDir)) {
          session.gitBranch = this.getGitBranch(workingDir);
        }
      }
    } catch (error) {
      // Session might have closed or no panes
      console.error(`[TmuxSessionManager] Error enriching session ${session.name}:`, error.message);
    }
  }

  /**
   * Get git branch for a directory
   */
  getGitBranch(directory) {
    try {
      const branch = execSync(`git -C "${directory}" rev-parse --abbrev-ref HEAD 2>/dev/null`, {
        encoding: 'utf8'
      }).trim();
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
      const jsonFiles = files.filter(f => f.endsWith('.json')).slice(0, 50); // Safety limit

      for (const file of jsonFiles) {
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
        console.log(`[TmuxSessionManager] Loaded ${states.length} Claude state files in ${duration}ms`);
      }
    } catch (error) {
      console.error('[TmuxSessionManager] Error loading Claude states:', error.message);
    }

    return states;
  }

  /**
   * Find Claude state for a session by matching pane ID or working directory
   * Uses pre-loaded state cache for performance
   */
  findClaudeStateInCache(session, stateCache) {
    if (!stateCache || stateCache.length === 0) {
      return null;
    }

    // Try to match by tmux pane ID (most reliable)
    if (session.paneId) {
      const byPane = stateCache.find(state =>
        state.tmux_pane === session.paneId
      );
      if (byPane) {
        return byPane;
      }
    }

    // Fallback: match by working directory
    if (session.workingDir) {
      const byWorkingDir = stateCache.find(state =>
        state.working_dir === session.workingDir
      );
      if (byWorkingDir) {
        return byWorkingDir;
      }
    }

    return null;
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
          };
        }
      }

      // Fallback: Parse statusline from terminal content
      const content = execSync(
        `tmux capture-pane -p -S -100 -t "${session.paneId}"`,
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
      );

      return this.parseClaudeStatusline(content);
    } catch (error) {
      console.error(`[TmuxSessionManager] Error getting Claude state for ${session.name}:`, error.message);
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
   * @param {number} windowIndex - Window index (default: 0)
   */
  async capturePanePreview(sessionName, lines = 100, windowIndex = 0) {
    try {
      // Get pane ID for the window
      const paneInfo = execSync(
        `tmux list-panes -t "${sessionName}:${windowIndex}" -F "#{pane_id}"`,
        { encoding: 'utf8' }
      ).trim().split('\n')[0];

      if (!paneInfo) {
        throw new Error('No pane found');
      }

      // Capture pane content
      // -e: preserve escape sequences for better handling
      // -p: print to stdout
      // -S -N: start N lines back from current position
      const rawContent = execSync(
        `tmux capture-pane -p -e -S -${lines} -t "${paneInfo}"`,
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }
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
   */
  async captureFullScrollback(sessionName, windowIndex = 0) {
    try {
      const paneInfo = execSync(
        `tmux list-panes -t "${sessionName}:${windowIndex}" -F "#{pane_id}"`,
        { encoding: 'utf8' }
      ).trim().split('\n')[0];

      if (!paneInfo) {
        throw new Error('No pane found');
      }

      // Capture from beginning of scrollback
      const rawContent = execSync(
        `tmux capture-pane -p -e -S - -t "${paneInfo}"`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 } // 10MB limit
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
      execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`);
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
      spawnSync('tmux', ['send-keys', '-t', sessionName, '-l', command], { timeout: 5000 });

      // Wait a bit for command to be typed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send Enter
      spawnSync('tmux', ['send-keys', '-t', sessionName, 'Enter'], { timeout: 5000 });

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
      // Execute tmux command directly on the session
      // Example: tmux split-window -t "sessionName" -h
      execSync(`tmux ${command} -t "${sessionName}"`, { encoding: 'utf8' });

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
      const output = execSync(
        `tmux list-windows -t "${sessionName}" -F "#{window_index}|#{window_name}|#{window_panes}|#{window_active}"`,
        { encoding: 'utf8' }
      );

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
