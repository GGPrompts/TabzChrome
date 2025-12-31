/**
 * TabzChrome Dashboard - Shared JavaScript
 * WebSocket connection, API helpers, and shared state management
 */

const Dashboard = (function() {
    'use strict';

    // ==========================================================================
    // Configuration
    // ==========================================================================
    const API_BASE = 'http://localhost:8129';
    const WS_URL = 'ws://localhost:8129';

    // ==========================================================================
    // State
    // ==========================================================================
    let ws = null;
    let wsConnected = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const RECONNECT_DELAY = 2000;

    const state = {
        terminals: [],
        health: null,
        lastUpdate: null,
        authToken: null,
        claudeStatuses: new Map(),  // Map of terminal ID -> Claude status
        paneTitles: new Map(),      // Map of terminal ID -> pane title (for non-Claude)
    };

    const listeners = {
        connection: [],
        terminals: [],
        health: [],
        message: [],
        claudeStatuses: [],
        paneTitles: [],
    };

    // ==========================================================================
    // Event System
    // ==========================================================================
    function on(event, callback) {
        if (listeners[event]) {
            listeners[event].push(callback);
        }
        return () => off(event, callback);
    }

    function off(event, callback) {
        if (listeners[event]) {
            listeners[event] = listeners[event].filter(cb => cb !== callback);
        }
    }

    function emit(event, data) {
        if (listeners[event]) {
            listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`[Dashboard] Error in ${event} listener:`, err);
                }
            });
        }
    }

    // ==========================================================================
    // WebSocket Connection
    // ==========================================================================
    async function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        // Fetch auth token before connecting
        let wsUrl = WS_URL;
        try {
            const tokenResponse = await fetch('/api/auth/token');
            if (tokenResponse.ok) {
                const { token } = await tokenResponse.json();
                if (token) {
                    wsUrl = `${WS_URL}?token=${token}`;
                    console.log('[Dashboard] Got auth token for WebSocket');
                }
            }
        } catch (e) {
            console.log('[Dashboard] No auth token available, connecting without authentication');
        }

        console.log('[Dashboard] Connecting to WebSocket...');
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[Dashboard] WebSocket connected');
            wsConnected = true;
            reconnectAttempts = 0;
            emit('connection', { connected: true });
            updateConnectionUI(true);

            // Fetch initial data
            fetchTerminals();
            fetchHealth();
        };

        ws.onclose = () => {
            console.log('[Dashboard] WebSocket disconnected');
            wsConnected = false;
            emit('connection', { connected: false });
            updateConnectionUI(false);

            // Auto-reconnect
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`[Dashboard] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(connectWebSocket, RECONNECT_DELAY);
            }
        };

        ws.onerror = (error) => {
            console.error('[Dashboard] WebSocket error:', error);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (err) {
                console.error('[Dashboard] Error parsing WebSocket message:', err);
            }
        };
    }

    function handleWebSocketMessage(message) {
        emit('message', message);

        switch (message.type) {
            case 'terminal-spawned':
                // Add new terminal to state
                if (message.data && !state.terminals.find(t => t.id === message.data.id)) {
                    state.terminals.push(message.data);
                    emit('terminals', state.terminals);
                }
                break;

            case 'terminal-closed':
                // Remove terminal from state
                if (message.data && message.data.id) {
                    state.terminals = state.terminals.filter(t => t.id !== message.data.id);
                    emit('terminals', state.terminals);
                }
                break;

            case 'terminal-output':
                // Terminal output (handled by individual terminal views if needed)
                break;

            default:
                // Unknown message type
                break;
        }
    }

    function updateConnectionUI(connected) {
        // Update any connection indicators on the page
        const indicators = document.querySelectorAll('.status-indicator');
        indicators.forEach(el => {
            el.classList.toggle('connected', connected);
        });

        const statusTexts = document.querySelectorAll('.status-text');
        statusTexts.forEach(el => {
            el.textContent = connected ? 'Connected' : 'Disconnected';
        });
    }

    // ==========================================================================
    // API Helpers
    // ==========================================================================
    async function getAuthToken() {
        if (state.authToken) return state.authToken;
        try {
            const res = await fetch(`${API_BASE}/api/auth/token`);
            const data = await res.json();
            state.authToken = data.token;
            return state.authToken;
        } catch (err) {
            console.error('[Dashboard] Failed to get auth token:', err);
            return null;
        }
    }

    async function apiRequest(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
        };

        // Add auth token for protected endpoints
        if (endpoint === '/api/spawn') {
            const token = await getAuthToken();
            if (token) {
                headers['X-Auth-Token'] = token;
            }
        }

        const defaultOptions = { headers };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json();
            return { success: response.ok, data, status: response.status };
        } catch (error) {
            console.error(`[Dashboard] API error (${endpoint}):`, error);
            return { success: false, error: error.message };
        }
    }

    async function fetchTerminals() {
        const result = await apiRequest('/api/agents');
        if (result.success && result.data.data) {
            state.terminals = result.data.data;
            state.lastUpdate = new Date();
            emit('terminals', state.terminals);
        }
        return result;
    }

    async function fetchHealth() {
        const result = await apiRequest('/api/health');
        if (result.success && result.data.data) {
            state.health = result.data.data;
            emit('health', state.health);
        }
        return result;
    }

    async function fetchOrphanedSessions() {
        return await apiRequest('/api/tmux/orphaned-sessions');
    }

    async function fetchTmuxSessions() {
        return await apiRequest('/api/tmux/sessions/detailed');
    }

    async function killTerminal(terminalId, force = true) {
        const result = await apiRequest(`/api/agents/${terminalId}?force=${force}`, {
            method: 'DELETE',
        });

        if (result.success) {
            // Update local state
            state.terminals = state.terminals.filter(t => t.id !== terminalId);
            emit('terminals', state.terminals);
        }

        return result;
    }

    async function killTmuxSession(sessionName) {
        return await apiRequest(`/api/tmux/sessions/${sessionName}`, {
            method: 'DELETE',
        });
    }

    async function reattachSessions(sessions) {
        return await apiRequest('/api/tmux/reattach', {
            method: 'POST',
            body: JSON.stringify({ sessions }),
        });
    }

    async function killOrphanedSessions(sessions) {
        return await apiRequest('/api/tmux/sessions/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ sessions }),
        });
    }

    async function spawnTerminal(config) {
        return await apiRequest('/api/spawn', {
            method: 'POST',
            body: JSON.stringify(config),
        });
    }

    /**
     * Fetch Claude status for all terminals that have Claude profiles
     * Returns a Map of terminal ID -> status object
     */
    async function fetchClaudeStatuses() {
        // Filter terminals that have Claude in their profile command
        const claudeTerminals = state.terminals.filter(t =>
            t.workingDir &&
            (t.profile?.command?.toLowerCase().includes('claude') ||
             t.terminalType?.toLowerCase().includes('claude'))
        );

        if (claudeTerminals.length === 0) {
            return;
        }

        const results = await Promise.all(
            claudeTerminals.map(async (terminal) => {
                try {
                    const encodedDir = encodeURIComponent(terminal.workingDir);
                    // Use session name (id for ctt- terminals) for precise matching
                    const sessionName = terminal.id?.startsWith('ctt-') ? terminal.id : null;
                    const sessionParam = sessionName
                        ? `&sessionName=${encodeURIComponent(sessionName)}`
                        : '';

                    const response = await fetch(
                        `${API_BASE}/api/claude-status?dir=${encodedDir}${sessionParam}`
                    );
                    const result = await response.json();

                    if (result.success && result.status !== 'unknown') {
                        return {
                            id: terminal.id,
                            status: result.status,
                            current_tool: result.current_tool,
                            pane_title: result.pane_title,
                            context_pct: result.context_window?.context_pct,
                            subagent_count: result.subagent_count || 0,
                        };
                    }
                    return { id: terminal.id, status: null };
                } catch (err) {
                    return { id: terminal.id, status: null };
                }
            })
        );

        // Update state
        let changed = false;
        for (const result of results) {
            if (result.status) {
                const prev = state.claudeStatuses.get(result.id);
                if (!prev || prev.status !== result.status || prev.pane_title !== result.pane_title) {
                    changed = true;
                }
                state.claudeStatuses.set(result.id, result);
            }
        }

        if (changed) {
            emit('claudeStatuses', state.claudeStatuses);
        }
    }

    /**
     * Get Claude status display text for a terminal
     * Shows pane_title when idle, tool info when working
     */
    function getClaudeStatusText(terminalId, fallbackName) {
        const status = state.claudeStatuses.get(terminalId);
        if (!status) return null;

        if (status.status === 'idle' || status.status === 'awaiting_input') {
            return {
                text: status.pane_title || fallbackName,
                isIdle: true,
            };
        }

        // Working state - show tool
        const toolEmojis = {
            'Read': '📖', 'Write': '📝', 'Edit': '✏️', 'Bash': '🔺',
            'Glob': '🔍', 'Grep': '🔎', 'Task': '🤖', 'WebFetch': '🌐',
            'WebSearch': '🔍', 'TodoWrite': '📋', 'NotebookEdit': '📓',
        };
        const emoji = status.current_tool ? (toolEmojis[status.current_tool] || '🔧') : '⏳';
        return {
            text: `${emoji} ${status.current_tool || 'Working'}`,
            isIdle: false,
        };
    }

    /**
     * Clean pane_title for display - strips " @ path" suffix
     */
    function cleanPaneTitle(paneTitle) {
        if (!paneTitle) return '';
        const atIndex = paneTitle.lastIndexOf(' @ ');
        if (atIndex > 0) {
            const afterAt = paneTitle.slice(atIndex + 3);
            if (afterAt.startsWith('/') || afterAt.startsWith('~')) {
                return paneTitle.slice(0, atIndex);
            }
        }
        return paneTitle;
    }

    /**
     * Check if pane_title is generic (hostname, shell name, path)
     */
    function isGenericPaneTitle(paneTitle) {
        if (!paneTitle) return true;
        const clean = cleanPaneTitle(paneTitle);
        // Hostname patterns
        if (/^(localhost|[\w]+-?(desktop|laptop)|ip-[\d-]+)$/i.test(clean)) return true;
        // Generic shell names
        if (/^(bash|zsh|sh|fish|python|node)$/i.test(clean)) return true;
        // Path-like
        if (clean.startsWith('~') || clean.startsWith('/')) return true;
        return false;
    }

    /**
     * Fetch pane titles for all tmux terminals (for non-Claude terminals like PyRadio)
     */
    async function fetchPaneTitles() {
        const tmuxTerminals = state.terminals.filter(t => t.id?.startsWith('ctt-'));
        if (tmuxTerminals.length === 0) return;

        const results = await Promise.all(
            tmuxTerminals.map(async (terminal) => {
                try {
                    const response = await fetch(`${API_BASE}/api/tmux/info/${encodeURIComponent(terminal.id)}`);
                    const result = await response.json();
                    if (result.success && result.paneTitle) {
                        return { id: terminal.id, paneTitle: result.paneTitle };
                    }
                    return { id: terminal.id, paneTitle: null };
                } catch (err) {
                    return { id: terminal.id, paneTitle: null };
                }
            })
        );

        let changed = false;
        for (const result of results) {
            if (result.paneTitle) {
                const prev = state.paneTitles?.get(result.id);
                if (prev !== result.paneTitle) changed = true;
                if (!state.paneTitles) state.paneTitles = new Map();
                state.paneTitles.set(result.id, result.paneTitle);
            }
        }
        if (changed) {
            emit('paneTitles', state.paneTitles);
        }
    }

    /**
     * Get display name for a terminal (handles both Claude and non-Claude)
     */
    function getTerminalDisplayName(terminal) {
        // Check Claude status first
        const claudeStatus = getClaudeStatusText(terminal.id, terminal.name || 'Unnamed');
        if (claudeStatus) {
            return claudeStatus;
        }

        // Check pane title for non-Claude terminals
        const paneTitle = state.paneTitles?.get(terminal.id);
        if (paneTitle && !isGenericPaneTitle(paneTitle)) {
            return {
                text: cleanPaneTitle(paneTitle),
                isIdle: true,  // Treat as "idle" for display purposes
            };
        }

        return null;
    }

    // ==========================================================================
    // Utility Functions
    // ==========================================================================
    function formatUptime(seconds) {
        if (seconds < 60) return `${Math.floor(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
        return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
    }

    function formatMemory(bytes) {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    }

    function formatTime(date) {
        if (!date) return '-';
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', { hour12: false });
    }

    function formatRelativeTime(date) {
        if (!date) return '-';
        const d = new Date(date);
        const now = new Date();
        const diff = (now - d) / 1000; // seconds

        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    function shortenPath(path, maxLen = 40) {
        if (!path || path.length <= maxLen) return path;

        // Replace home dir with ~
        const home = '~';
        path = path.replace(/^\/home\/[^/]+/, home);

        if (path.length <= maxLen) return path;

        // Truncate middle
        const start = path.substring(0, Math.floor(maxLen / 2) - 2);
        const end = path.substring(path.length - Math.floor(maxLen / 2) + 2);
        return `${start}...${end}`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================================================
    // DOM Helpers
    // ==========================================================================
    function $(selector) {
        return document.querySelector(selector);
    }

    function $$(selector) {
        return document.querySelectorAll(selector);
    }

    function createElement(tag, className, innerHTML) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (innerHTML) el.innerHTML = innerHTML;
        return el;
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================
    function init() {
        console.log('[Dashboard] Initializing...');

        // Connect WebSocket
        connectWebSocket();

        // Set up periodic refresh
        setInterval(() => {
            if (wsConnected) {
                fetchHealth();
            }
        }, 10000); // Refresh health every 10 seconds

        // Poll Claude status every 2 seconds (matches extension polling rate)
        setInterval(() => {
            if (wsConnected && state.terminals.length > 0) {
                fetchClaudeStatuses();
            }
        }, 2000);

        // Poll pane titles every 3 seconds (for non-Claude terminals like PyRadio)
        setInterval(() => {
            if (wsConnected && state.terminals.length > 0) {
                fetchPaneTitles();
            }
        }, 3000);

        console.log('[Dashboard] Initialized');
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==========================================================================
    // Public API
    // ==========================================================================
    return {
        // State
        get state() { return state; },
        get connected() { return wsConnected; },
        get claudeStatuses() { return state.claudeStatuses; },

        // Events
        on,
        off,

        // API Methods
        fetchTerminals,
        fetchHealth,
        fetchOrphanedSessions,
        fetchTmuxSessions,
        fetchClaudeStatuses,
        killTerminal,
        killTmuxSession,
        reattachSessions,
        killOrphanedSessions,
        spawnTerminal,

        // Claude Status & Pane Titles
        getClaudeStatusText,
        getTerminalDisplayName,
        cleanPaneTitle,
        isGenericPaneTitle,
        fetchPaneTitles,

        // Utilities
        formatUptime,
        formatMemory,
        formatTime,
        formatRelativeTime,
        shortenPath,
        escapeHtml,
        $,
        $$,
        createElement,

        // Manual control
        connect: connectWebSocket,
        refresh: fetchTerminals,
    };
})();

// Make available globally
window.Dashboard = Dashboard;
