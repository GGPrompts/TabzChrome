/**
 * Core Client Module
 *
 * Tab management, state tracking, and shared utilities.
 * All browser interactions go through the TabzChrome backend.
 */
import type { ConsoleLogsResponse, ScriptResult, PageInfo, ConsoleLogLevel } from "../types.js";
export declare const BACKEND_URL: string;
/**
 * Get the current tab ID that Claude is targeting
 * This is set by switchTab() and used by default in screenshot, click, etc.
 */
export declare function getCurrentTabId(): number;
/**
 * Set the current tab ID that Claude is targeting
 * Used by tabz_open_url when opening/switching tabs
 */
export declare function setCurrentTabId(tabId: number): void;
/**
 * Handle API errors with helpful messages
 */
export declare function handleApiError(error: unknown, context: string): Error;
export interface TabInfo {
    tabId: number;
    url: string;
    title: string;
    customName?: string;
    active: boolean;
}
export interface OpenUrlResult {
    success: boolean;
    tabId?: number;
    url?: string;
    reused?: boolean;
    error?: string;
}
/**
 * Rename a tab (assign a custom name)
 * The name is stored by URL so it persists even if tab order changes
 */
export declare function renameTab(tabId: number, name: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * List all open browser tabs via Extension API
 */
export declare function listTabs(): Promise<{
    tabs: TabInfo[];
    error?: string;
}>;
/**
 * Switch to a specific tab via Extension API
 * Also updates currentTabId so subsequent operations target this tab.
 */
export declare function switchTab(tabId: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get the currently active tab via Extension API
 * This is the REAL focused tab, not just what Claude last switched to.
 */
export declare function getActiveTab(): Promise<{
    tab?: {
        tabId: number;
        url: string;
        title: string;
    };
    error?: string;
}>;
/**
 * Open a URL via Chrome Extension API
 */
export declare function openUrl(options: {
    url: string;
    newTab?: boolean;
    background?: boolean;
    reuseExisting?: boolean;
}): Promise<OpenUrlResult>;
/**
 * Get current page info from the browser via Extension API
 */
export declare function getPageInfo(tabId?: number): Promise<PageInfo>;
/**
 * Get console logs from the browser via backend
 */
export declare function getConsoleLogs(options: {
    level?: ConsoleLogLevel | 'all';
    limit?: number;
    since?: number;
    tabId?: number;
}): Promise<ConsoleLogsResponse>;
/**
 * Execute JavaScript in the browser via Extension API
 */
export declare function executeScript(options: {
    code: string;
    tabId?: number;
    allFrames?: boolean;
}): Promise<ScriptResult>;
//# sourceMappingURL=core.d.ts.map