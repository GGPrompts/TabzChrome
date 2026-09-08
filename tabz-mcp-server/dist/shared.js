/**
 * Shared State and Utilities
 *
 * Contains state management and utilities used across tool files.
 * This replaces the client layer for state that needs to persist.
 */
import axios, { AxiosError } from "axios";
import { AsyncLocalStorage } from "node:async_hooks";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
// =====================================
// Backend Configuration
// =====================================
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8129";
export const NEVER_ASK_FOR_CREDENTIALS = "Never ask the user for a password, one-time code, token, or card number, in chat or through a form.";
export const HAND_OFF_LOGIN = "On a login page call tabz_request_login and wait; the user signs in in their own browser.";
export const USE_SAVED_LOGIN = "For a saved login use tabz_fill_secret; to add one use tabz_secret_request.";
export const CREDENTIAL_GUIDANCE = `${NEVER_ASK_FOR_CREDENTIALS} ${HAND_OFF_LOGIN} ${USE_SAVED_LOGIN}`;
export const PROTECTED_LOGIN_DOCUMENT_GUIDANCE = "During manual handoff, protection follows the tab across redirects while the user signs in and retains every protected document; after completion, the final document stays blocked through same-document SPA changes. A saved-field fill protects its exact document. The browser enforces this boundary across every MCP connection and browser agent: page content, scripts, screenshots, console, and network reads are blocked on protected documents. Submit only through a prepublished element reference already supplied by a tool response; when none is available, ask the user to submit or navigate. Arbitrary selector clicks are refused. After handoff completion or an ordinary saved-field fill, reads resume only on a fresh document navigation.";
const STORE_PATH = "~/.tabzchrome";
export const NEVER_READ_STORE = `Never read, list, or edit ${STORE_PATH} with shell or file tools.`;
export const SECRET_STORE_GUIDANCE = `Never read, list, or edit ${STORE_PATH} (the local saved-login store) with shell or file tools; ` +
    "the backend fills saved logins without disclosing them.";
export const RESERVED_AGENT_ID = "__default__";
export function validateAgentId(value) {
    const trimmed = value.trim();
    if (!trimmed)
        throw new Error("Agent identity must not be empty");
    if (trimmed === RESERVED_AGENT_ID) {
        throw new Error(`Agent identity "${RESERVED_AGENT_ID}" is reserved for legacy unlabeled requests`);
    }
    return trimmed;
}
/** Optional human-readable label used for this connection's tab group. */
export const AGENT_LABEL = process.env.TABZ_AGENT_LABEL?.trim() || undefined;
/** Resolve a stable identity for this MCP process. */
export function deriveConnectionId(label, sourcesOrCreateId = {}, createId = randomUUID) {
    const sources = typeof sourcesOrCreateId === "function" ? {} : sourcesOrCreateId;
    const fallbackId = typeof sourcesOrCreateId === "function" ? sourcesOrCreateId : createId;
    const trimmed = label?.trim();
    if (trimmed)
        return validateAgentId(trimmed);
    const terminalId = sources.terminalId?.trim();
    if (terminalId)
        return `terminal:${terminalId}`;
    const tmuxPane = sources.tmuxPane?.trim();
    const tmuxSession = sources.tmuxSession?.trim();
    if (tmuxPane && tmuxSession)
        return `tmux:${tmuxSession}:${tmuxPane}`;
    return fallbackId().replace(/-/g, "").slice(0, 8);
}
function resolveTmuxSessionName(tmuxPane) {
    const pane = tmuxPane?.trim();
    if (!pane)
        return undefined;
    try {
        return execFileSync("tmux", ["display-message", "-p", "-t", pane, "#{session_name}"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 300
        }).trim() || undefined;
    }
    catch {
        return undefined;
    }
}
/** Avoid a subprocess unless TMUX_PANE is the only stable identity source. */
export function resolveConnectionIdentitySources(env = process.env, lookupTmuxSession = resolveTmuxSessionName) {
    const label = env.TABZ_AGENT_LABEL?.trim();
    const terminalId = env.TABZ_TERMINAL_ID?.trim();
    const tmuxPane = env.TMUX_PANE?.trim();
    if (label || terminalId || !tmuxPane)
        return { terminalId, tmuxPane };
    return { terminalId, tmuxPane, tmuxSession: lookupTmuxSession(tmuxPane) };
}
export const AGENT_ID = deriveConnectionId(AGENT_LABEL, resolveConnectionIdentitySources());
export function createConnectionState(agentId, agentLabel, backendUrl = BACKEND_URL) {
    const label = agentLabel?.trim();
    return {
        agentId: validateAgentId(agentId),
        agentLabel: label ? validateAgentId(label) : undefined,
        backendUrl,
        currentTabId: 1,
        customTabNamesByTabId: new Map(),
        customTabNamesByUrl: new Map(),
        extensionNetworkCaptureActive: false
    };
}
const connectionStorage = new AsyncLocalStorage();
const defaultConnectionState = createConnectionState(AGENT_ID, AGENT_LABEL);
export function getConnectionState() {
    return connectionStorage.getStore() ?? defaultConnectionState;
}
export function runWithConnectionState(state, fn) {
    return connectionStorage.run(state, fn);
}
export function getAgentId() {
    return getConnectionState().agentId;
}
export function getAgentLabel() {
    return getConnectionState().agentLabel;
}
export function getBackendUrl() {
    return getConnectionState().backendUrl;
}
function isBrowserBackendRequest(url, baseURL) {
    if (!url)
        return false;
    try {
        const requestUrl = new URL(url, baseURL || getBackendUrl());
        const backendUrl = new URL(getBackendUrl());
        return requestUrl.origin === backendUrl.origin && requestUrl.pathname.startsWith("/api/browser/");
    }
    catch {
        return false;
    }
}
/** Add this connection's identity to browser API requests only. */
export function addAgentToBrowserRequest(config, agent = getAgentId()) {
    if (config.url) {
        try {
            // Resolve relative URLs against their explicit Axios baseURL. This keeps
            // a foreign baseURL wholly outside the per-session backend rewrite.
            const requestUrl = new URL(config.url, config.baseURL || BACKEND_URL);
            const compiledBackend = new URL(BACKEND_URL);
            if (requestUrl.origin === compiledBackend.origin) {
                config.url = new URL(`${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`, getBackendUrl()).toString();
            }
        }
        catch {
            // Axios will report malformed URLs; the interceptor should not hide it.
        }
    }
    if (!isBrowserBackendRequest(config.url, config.baseURL))
        return config;
    if (config.method?.toLowerCase() === "post") {
        const data = config.data && typeof config.data === "object" && !Array.isArray(config.data)
            ? config.data
            : {};
        config.data = { ...data, agent };
    }
    else {
        const params = config.params && typeof config.params === "object"
            ? config.params
            : {};
        config.params = { ...params, agent };
    }
    return config;
}
axios.interceptors?.request?.use(config => addAgentToBrowserRequest(config));
/** Every MCP process owns a browser group by default. */
export function defaultAddToClaudeGroup() {
    return true;
}
// =====================================
// Tab State Management
// =====================================
/**
 * Get the current tab ID that Claude is targeting
 * This is set by switchTab() and used by default in screenshot, click, etc.
 */
export function getCurrentTabId() {
    return getConnectionState().currentTabId;
}
/**
 * Set the current tab ID that Claude is targeting
 * Used by tabz_open_url when opening/switching tabs
 */
export function setCurrentTabId(tabId) {
    getConnectionState().currentTabId = tabId;
}
/**
 * Get custom name for a URL
 */
export function getCustomTabName(url, tabId) {
    const { customTabNamesByTabId, customTabNamesByUrl } = getConnectionState();
    if (tabId !== undefined) {
        const byId = customTabNamesByTabId.get(tabId);
        if (byId !== undefined)
            return byId;
    }
    return customTabNamesByUrl.get(url);
}
/**
 * Set custom name for a URL
 */
export function setCustomTabName(url, name, tabId) {
    const { customTabNamesByTabId, customTabNamesByUrl } = getConnectionState();
    const trimmed = name.trim();
    if (tabId !== undefined) {
        if (trimmed === '')
            customTabNamesByTabId.delete(tabId);
        else
            customTabNamesByTabId.set(tabId, trimmed);
        return;
    }
    if (trimmed === '') {
        customTabNamesByUrl.delete(url);
    }
    else {
        customTabNamesByUrl.set(url, trimmed);
    }
}
// =====================================
// Network State Management
// =====================================
/**
 * Check if network capture is currently active
 */
export function isNetworkCaptureActive() {
    return getConnectionState().extensionNetworkCaptureActive;
}
/**
 * Set network capture active state
 */
export function setNetworkCaptureActive(active) {
    getConnectionState().extensionNetworkCaptureActive = active;
}
// =====================================
// Error Handling
// =====================================
/**
 * Handle API errors with helpful messages
 */
export function handleApiError(error, context) {
    if (error instanceof AxiosError) {
        if (error.code === "ECONNREFUSED") {
            return new Error(`${context}: Cannot connect to backend at ${error.config?.baseURL || "unknown"}. ` +
                "Make sure the TabzChrome backend is running (cd backend && npm start).");
        }
        if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
            return new Error(`${context}: Request timed out. The browser may not be responding. ` +
                "Check if Chrome is open and the TabzChrome extension is installed.");
        }
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error || error.response.statusText;
            return new Error(`${context}: ${status} - ${message}`);
        }
    }
    return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}
//# sourceMappingURL=shared.js.map