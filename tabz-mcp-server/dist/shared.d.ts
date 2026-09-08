/**
 * Shared State and Utilities
 *
 * Contains state management and utilities used across tool files.
 * This replaces the client layer for state that needs to persist.
 */
import { type AxiosRequestConfig } from "axios";
export declare const BACKEND_URL: string;
export declare const NEVER_ASK_FOR_CREDENTIALS = "Never ask the user for a password, one-time code, token, or card number, in chat or through a form.";
export declare const HAND_OFF_LOGIN = "On a login page call tabz_request_login and wait; the user signs in in their own browser.";
export declare const USE_SAVED_LOGIN = "For a saved login use tabz_fill_secret; to add one use tabz_secret_request.";
export declare const CREDENTIAL_GUIDANCE = "Never ask the user for a password, one-time code, token, or card number, in chat or through a form. On a login page call tabz_request_login and wait; the user signs in in their own browser. For a saved login use tabz_fill_secret; to add one use tabz_secret_request.";
export declare const PROTECTED_LOGIN_DOCUMENT_GUIDANCE = "During manual handoff, protection follows the tab across redirects while the user signs in and retains every protected document; after completion, the final document stays blocked through same-document SPA changes. A saved-field fill protects its exact document. The browser enforces this boundary across every MCP connection and browser agent: page content, scripts, screenshots, console, and network reads are blocked on protected documents. Submit only through a prepublished element reference already supplied by a tool response; when none is available, ask the user to submit or navigate. Arbitrary selector clicks are refused. After handoff completion or an ordinary saved-field fill, reads resume only on a fresh document navigation.";
export declare const NEVER_READ_STORE = "Never read, list, or edit ~/.tabzchrome with shell or file tools.";
export declare const SECRET_STORE_GUIDANCE: string;
export declare const RESERVED_AGENT_ID = "__default__";
export declare function validateAgentId(value: string): string;
/** Optional human-readable label used for this connection's tab group. */
export declare const AGENT_LABEL: string | undefined;
export interface ConnectionIdentitySources {
    terminalId?: string;
    tmuxPane?: string;
    tmuxSession?: string;
}
/** Resolve a stable identity for this MCP process. */
export declare function deriveConnectionId(label: string | undefined, sourcesOrCreateId?: ConnectionIdentitySources | (() => string), createId?: () => string): string;
/** Avoid a subprocess unless TMUX_PANE is the only stable identity source. */
export declare function resolveConnectionIdentitySources(env?: NodeJS.ProcessEnv, lookupTmuxSession?: (pane: string) => string | undefined): ConnectionIdentitySources;
export declare const AGENT_ID: string;
export interface ConnectionState {
    agentId: string;
    agentLabel?: string;
    backendUrl: string;
    currentTabId: number;
    customTabNamesByTabId: Map<number, string>;
    customTabNamesByUrl: Map<string, string>;
    extensionNetworkCaptureActive: boolean;
}
export declare function createConnectionState(agentId: string, agentLabel?: string, backendUrl?: string): ConnectionState;
export declare function getConnectionState(): ConnectionState;
export declare function runWithConnectionState<T>(state: ConnectionState, fn: () => T): T;
export declare function getAgentId(): string;
export declare function getAgentLabel(): string | undefined;
export declare function getBackendUrl(): string;
/** Add this connection's identity to browser API requests only. */
export declare function addAgentToBrowserRequest<T extends AxiosRequestConfig>(config: T, agent?: string): T;
/** Every MCP process owns a browser group by default. */
export declare function defaultAddToClaudeGroup(): boolean;
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
export declare function getCustomTabName(url: string, tabId?: number): string | undefined;
/**
 * Set custom name for a URL
 */
export declare function setCustomTabName(url: string, name: string, tabId?: number): void;
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
    reusedExisting?: boolean;
    groupId?: number | null;
    inClaudeGroup?: boolean;
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
    tabId?: number;
    imageData?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    imageReencoded?: boolean;
    transportError?: boolean;
    filePath?: string;
    error?: string;
}
export interface DownloadImageResult extends ScreenshotResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
export interface CaptureImageResult extends ScreenshotResult {
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