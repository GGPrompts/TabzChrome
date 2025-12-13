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
    };

    const listeners = {
        connection: [],
        terminals: [],
        health: [],
        message: [],
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
    async function apiRequest(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

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

        // Events
        on,
        off,

        // API Methods
        fetchTerminals,
        fetchHealth,
        fetchOrphanedSessions,
        fetchTmuxSessions,
        killTerminal,
        killTmuxSession,
        reattachSessions,
        killOrphanedSessions,
        spawnTerminal,

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
