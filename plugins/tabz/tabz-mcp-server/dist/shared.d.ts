/**
 * Shared State and Utilities
 *
 * Contains state management and utilities used across tool files.
 * This replaces the client layer for state that needs to persist.
 */
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
 * Get custom name for a URL
 */
export declare function getCustomTabName(url: string): string | undefined;
/**
 * Set custom name for a URL
 */
export declare function setCustomTabName(url: string, name: string): void;
/**
 * Check if network capture is currently active
 */
export declare function isNetworkCaptureActive(): boolean;
/**
 * Set network capture active state
 */
export declare function setNetworkCaptureActive(active: boolean): void;
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
export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan';
export interface TabGroupInfo {
    groupId: number;
    title: string;
    color: TabGroupColor;
    collapsed: boolean;
    windowId: number;
    tabCount: number;
    tabIds: number[];
}
export interface ListTabGroupsResult {
    success: boolean;
    groups: TabGroupInfo[];
    claudeActiveGroupId: number | null;
    error?: string;
}
export interface TabGroupResult {
    success: boolean;
    group?: {
        groupId: number;
        title: string;
        color: TabGroupColor;
        collapsed?: boolean;
        windowId?: number;
        tabCount?: number;
    };
    error?: string;
}
export interface UngroupResult {
    success: boolean;
    ungroupedCount?: number;
    error?: string;
}
export interface ClaudeGroupStatus {
    success: boolean;
    exists: boolean;
    groupId: number | null;
    group?: {
        groupId: number;
        title: string;
        color: TabGroupColor;
        collapsed: boolean;
    };
    tabCount: number;
    tabIds?: number[];
    error?: string;
}
export interface ElementInfo {
    success: boolean;
    error?: string;
    html?: string;
    outerHTML?: string;
    innerText?: string;
    tagName?: string;
    attributes?: Record<string, string>;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    styles?: Record<string, string>;
    parentSelector?: string;
    childCount?: number;
}
export interface ScreenshotResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
export interface DownloadImageResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
export interface CaptureImageResult {
    success: boolean;
    filePath?: string;
    windowsPath?: string;
    wslPath?: string;
    width?: number;
    height?: number;
    error?: string;
}
export type WindowState = 'normal' | 'minimized' | 'maximized' | 'fullscreen';
export type WindowType = 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
export type TileLayout = 'horizontal' | 'vertical' | 'grid';
export interface WindowInfo {
    windowId: number;
    focused: boolean;
    state: WindowState;
    type: WindowType;
    width?: number;
    height?: number;
    left?: number;
    top?: number;
    incognito: boolean;
    alwaysOnTop: boolean;
    tabCount: number;
}
export interface ListWindowsResult {
    success: boolean;
    windows: WindowInfo[];
    error?: string;
}
export interface WindowResult {
    success: boolean;
    window?: {
        windowId: number;
        focused?: boolean;
        state?: WindowState;
        type?: WindowType;
        width?: number;
        height?: number;
        left?: number;
        top?: number;
        incognito?: boolean;
        tabCount?: number;
    };
    error?: string;
}
export interface DisplayBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}
export interface DisplayInfo {
    id: string;
    name: string;
    isPrimary: boolean;
    isEnabled: boolean;
    isInternal: boolean;
    bounds: DisplayBounds;
    workArea: DisplayBounds;
    rotation: number;
    dpiX: number;
    dpiY: number;
}
export interface ListDisplaysResult {
    success: boolean;
    displays: DisplayInfo[];
    error?: string;
}
export interface TileWindowsResult {
    success: boolean;
    results?: Array<{
        windowId: number;
        success: boolean;
        error?: string;
    }>;
    layout?: TileLayout;
    displayId?: string;
    error?: string;
}
export interface PopoutTerminalResult {
    success: boolean;
    window?: {
        windowId: number;
        type?: WindowType;
        width?: number;
        height?: number;
        left?: number;
        top?: number;
    };
    terminalId?: string;
    error?: string;
}
//# sourceMappingURL=shared.d.ts.map