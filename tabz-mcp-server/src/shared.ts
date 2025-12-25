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
let currentTabId: number = 1;

// Storage for custom tab names (keyed by URL)
// Session-based - names persist while MCP server is running
const customTabNames: Map<string, string> = new Map();

/**
 * Get the current tab ID that Claude is targeting
 * This is set by switchTab() and used by default in screenshot, click, etc.
 */
export function getCurrentTabId(): number {
  return currentTabId;
}

/**
 * Set the current tab ID that Claude is targeting
 * Used by tabz_open_url when opening/switching tabs
 */
export function setCurrentTabId(tabId: number): void {
  currentTabId = tabId;
}

/**
 * Get custom name for a URL
 */
export function getCustomTabName(url: string): string | undefined {
  return customTabNames.get(url);
}

/**
 * Set custom name for a URL
 */
export function setCustomTabName(url: string, name: string): void {
  if (name.trim() === '') {
    customTabNames.delete(url);
  } else {
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
export function isNetworkCaptureActive(): boolean {
  return extensionNetworkCaptureActive;
}

/**
 * Set network capture active state
 */
export function setNetworkCaptureActive(active: boolean): void {
  extensionNetworkCaptureActive = active;
}

// =====================================
// Error Handling
// =====================================

/**
 * Handle API errors with helpful messages
 */
export function handleApiError(error: unknown, context: string): Error {
  if (error instanceof AxiosError) {
    if (error.code === "ECONNREFUSED") {
      return new Error(
        `${context}: Cannot connect to backend at ${error.config?.baseURL || "unknown"}. ` +
        "Make sure the TabzChrome backend is running (cd backend && npm start)."
      );
    }
    if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      return new Error(
        `${context}: Request timed out. The browser may not be responding. ` +
        "Check if Chrome is open and the TabzChrome extension is installed."
      );
    }
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.statusText;
      return new Error(`${context}: ${status} - ${message}`);
    }
  }
  return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

// =====================================
// Types (re-exported for convenience)
// =====================================

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

// Tab group types
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

// Element types
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

// Screenshot types
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
