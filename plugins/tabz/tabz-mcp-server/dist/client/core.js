/**
 * Core Client Module
 *
 * Tab management, state tracking, and shared utilities.
 * All browser interactions go through the TabzChrome backend.
 */
import axios, { AxiosError } from "axios";
// Backend URL (configurable via environment)
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8129";
// =====================================
// Tab State Management
// =====================================
// Track current tab after switching (for screenshot/other operations)
let currentTabId = 1;
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
// Storage for custom tab names (keyed by URL)
// Session-based - names persist while MCP server is running
const customTabNames = new Map();
// =====================================
// Tab Management
// =====================================
/**
 * Rename a tab (assign a custom name)
 * The name is stored by URL so it persists even if tab order changes
 */
export async function renameTab(tabId, name) {
    try {
        // Get the tab list to find the URL for this tabId
        const tabsResult = await listTabs();
        const tab = tabsResult.tabs.find(t => t.tabId === tabId);
        if (!tab) {
            const availableIds = tabsResult.tabs.map(t => t.tabId);
            const idsStr = availableIds.length > 0
                ? `Available tab IDs: ${availableIds.join(', ')}`
                : 'No tabs found';
            return { success: false, error: `Invalid tab ID: ${tabId}. ${idsStr}` };
        }
        if (name.trim() === '') {
            // Empty name clears the custom name
            customTabNames.delete(tab.url);
        }
        else {
            customTabNames.set(tab.url, name.trim());
        }
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * List all open browser tabs via Extension API
 */
export async function listTabs() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/tabs`, { timeout: 5000 });
        if (response.data.success && response.data.tabs) {
            const tabs = response.data.tabs.map((tab) => ({
                tabId: tab.tabId,
                url: tab.url,
                title: tab.title,
                customName: customTabNames.get(tab.url),
                active: tab.active
            }));
            // Update currentTabId to the actually active tab
            const activeTab = tabs.find(t => t.active);
            if (activeTab) {
                currentTabId = activeTab.tabId;
            }
            return { tabs };
        }
        return { tabs: [], error: response.data.error || 'Failed to list tabs' };
    }
    catch (error) {
        return { tabs: [], error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Switch to a specific tab via Extension API
 * Also updates currentTabId so subsequent operations target this tab.
 */
export async function switchTab(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/switch-tab`, { tabId }, { timeout: 5000 });
        if (response.data.success) {
            currentTabId = tabId;
            return { success: true };
        }
        return { success: false, error: response.data.error || 'Failed to switch tab' };
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Get the currently active tab via Extension API
 * This is the REAL focused tab, not just what Claude last switched to.
 */
export async function getActiveTab() {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/active-tab`, { timeout: 5000 });
        if (response.data.success && response.data.tab) {
            currentTabId = response.data.tab.tabId;
            return { tab: response.data.tab };
        }
        return { error: response.data.error || 'Failed to get active tab' };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Open a URL via Chrome Extension API
 */
export async function openUrl(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/open-url`, {
            url: options.url,
            newTab: options.newTab !== false, // default true
            background: options.background === true, // default false
            reuseExisting: options.reuseExisting !== false // default true
        }, { timeout: 30000 });
        // Update current tab tracking if successful and not background
        if (response.data.success && response.data.tabId && !options.background) {
            currentTabId = response.data.tabId;
        }
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to open URL").message };
    }
}
// =====================================
// Page Info & Script Execution
// =====================================
/**
 * Get current page info from the browser via Extension API
 */
export async function getPageInfo(tabId) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/page-info`, {
            params: { tabId },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to get page info");
    }
}
/**
 * Get console logs from the browser via backend
 */
export async function getConsoleLogs(options) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/console-logs`, {
            params: {
                level: options.level,
                limit: options.limit,
                since: options.since,
                tabId: options.tabId
            },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to get console logs");
    }
}
/**
 * Execute JavaScript in the browser via Extension API
 */
export async function executeScript(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/execute-script`, {
            code: options.code,
            tabId: options.tabId,
            allFrames: options.allFrames
        }, { timeout: 30000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to execute script");
    }
}
//# sourceMappingURL=core.js.map