/**
 * Shared State and Utilities
 *
 * Contains state management and utilities used across tool files.
 * This replaces the client layer for state that needs to persist.
 */
import { AxiosError } from "axios";
// =====================================
// Backend Configuration
// =====================================
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8129";
// =====================================
// Tab State Management
// =====================================
// Track current tab after switching (for screenshot/other operations)
let currentTabId = 1;
// Storage for custom tab names (keyed by URL)
// Session-based - names persist while MCP server is running
const customTabNames = new Map();
/**
 * Get the current tab ID that Claude is targeting
 * This is set by switchTab() and used by default in screenshot, click, etc.
 */
export function getCurrentTabId() {
    return currentTabId;
}
/**
 * Set the current tab ID that Claude is targeting
 * Used by tabz_open_url when opening/switching tabs
 */
export function setCurrentTabId(tabId) {
    currentTabId = tabId;
}
/**
 * Get custom name for a URL
 */
export function getCustomTabName(url) {
    return customTabNames.get(url);
}
/**
 * Set custom name for a URL
 */
export function setCustomTabName(url, name) {
    if (name.trim() === '') {
        customTabNames.delete(url);
    }
    else {
        customTabNames.set(url, name.trim());
    }
}
// =====================================
// Network State Management
// =====================================
// Track if Extension API capture is active
let extensionNetworkCaptureActive = false;
/**
 * Check if network capture is currently active
 */
export function isNetworkCaptureActive() {
    return extensionNetworkCaptureActive;
}
/**
 * Set network capture active state
 */
export function setNetworkCaptureActive(active) {
    extensionNetworkCaptureActive = active;
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