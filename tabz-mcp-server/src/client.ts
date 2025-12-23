/**
 * HTTP Client for Backend Communication
 *
 * Communicates with TabzChrome backend to access browser data via Chrome Extension APIs.
 * All browser interactions go through the extension - no CDP/Puppeteer required.
 */

import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import type { ConsoleLogsResponse, ScriptResult, PageInfo, ConsoleLogLevel } from "./types.js";

// Screenshot cleanup configuration
const SCREENSHOT_MAX_AGE_HOURS = 24;
const SCREENSHOT_MAX_FILES = 50;

// Track current tab after switching (for screenshot/other operations)
// Exported so tools can show which tab Claude is currently targeting
let currentTabId: number = 1;

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
 * Detect if running in WSL
 */
function isRunningInWSL(): boolean {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME) return true;

  // Fallback: check /proc/version for Microsoft
  try {
    const procVersion = fs.readFileSync('/proc/version', 'utf8');
    return procVersion.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

/**
 * Convert Windows path to WSL path if running in WSL
 * e.g., "C:\Users\marci\ai-images\..." -> "/mnt/c/Users/marci/..."
 */
function convertPathForWSL(windowsPath: string): string {
  if (!isRunningInWSL()) return windowsPath;

  // Check if it's a Windows-style path (C:\, D:\, etc.)
  const winDriveMatch = windowsPath.match(/^([A-Za-z]):\\(.*)$/);
  if (winDriveMatch) {
    const driveLetter = winDriveMatch[1].toLowerCase();
    const restOfPath = winDriveMatch[2].replace(/\\/g, '/');
    return `/mnt/${driveLetter}/${restOfPath}`;
  }

  return windowsPath;
}

/**
 * Clean up old screenshots from ai-images directory
 * - Deletes files older than SCREENSHOT_MAX_AGE_HOURS
 * - Keeps only SCREENSHOT_MAX_FILES most recent files
 */
async function cleanupScreenshots(): Promise<void> {
  try {
    const screenshotDir = path.join(os.homedir(), 'ai-images');

    if (!fs.existsSync(screenshotDir)) {
      return;
    }

    const files = fs.readdirSync(screenshotDir)
      .filter(f => f.startsWith('screenshot-') || f.startsWith('image-'))
      .map(f => ({
        name: f,
        path: path.join(screenshotDir, f),
        mtime: fs.statSync(path.join(screenshotDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    const now = Date.now();
    const maxAge = SCREENSHOT_MAX_AGE_HOURS * 60 * 60 * 1000;
    let deletedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const age = now - file.mtime;

      // Delete if older than max age OR beyond max file count
      if (age > maxAge || i >= SCREENSHOT_MAX_FILES) {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
        } catch {
          // Ignore deletion errors (file in use, etc.)
        }
      }
    }

    if (deletedCount > 0) {
      console.error(`[browser-mcp] Cleaned up ${deletedCount} old screenshot(s)`);
    }
  } catch {
    // Ignore cleanup errors - non-critical
  }
}

/**
 * Get console logs from the browser via backend
 */
export async function getConsoleLogs(
  backendUrl: string,
  options: {
    level?: ConsoleLogLevel | 'all';
    limit?: number;
    since?: number;
    tabId?: number;
  }
): Promise<ConsoleLogsResponse> {
  try {
    const response = await axios.get<ConsoleLogsResponse>(
      `${backendUrl}/api/browser/console-logs`,
      {
        params: {
          level: options.level,
          limit: options.limit,
          since: options.since,
          tabId: options.tabId
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get console logs");
  }
}

/**
 * Execute JavaScript in the browser via Extension API
 */
export async function executeScript(
  backendUrl: string,
  options: {
    code: string;
    tabId?: number;
    allFrames?: boolean;
  }
): Promise<ScriptResult> {
  try {
    const response = await axios.post<ScriptResult>(
      `${backendUrl}/api/browser/execute-script`,
      {
        code: options.code,
        tabId: options.tabId,
        allFrames: options.allFrames
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to execute script");
  }
}

/**
 * Get current page info from the browser via Extension API
 */
export async function getPageInfo(
  backendUrl: string,
  tabId?: number
): Promise<PageInfo> {
  try {
    const response = await axios.get<PageInfo>(
      `${backendUrl}/api/browser/page-info`,
      {
        params: { tabId },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get page info");
  }
}

/**
 * Handle API errors with helpful messages
 */
function handleApiError(error: unknown, context: string): Error {
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

/**
 * Screenshot result type
 */
export interface ScreenshotResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Take a screenshot via Chrome Extension API
 */
export async function takeScreenshot(options: {
  selector?: string;
  fullPage?: boolean;
  outputPath?: string;
  tabId?: number;
}): Promise<ScreenshotResult> {
  try {
    const endpoint = options.fullPage ? '/api/browser/screenshot-full' : '/api/browser/screenshot';
    const response = await axios.post<ScreenshotResult>(
      `${BACKEND_URL}${endpoint}`,
      {
        tabId: options.tabId,
        selector: options.selector
      },
      { timeout: options.fullPage ? 65000 : 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Download image result type
 */
export interface DownloadImageResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Download an image from the page via Extension API
 */
export async function downloadImage(options: {
  selector?: string;
  url?: string;
  outputPath?: string;
  tabId?: number;
}): Promise<DownloadImageResult> {
  let imageUrl = options.url;

  // If no URL provided but selector given, try to extract URL from the page
  if (!imageUrl && options.selector) {
    try {
      const extractResult = await executeScript(BACKEND_URL, {
        code: `(() => {
          const el = document.querySelector('${options.selector.replace(/'/g, "\\'")}');
          if (!el) return null;
          if (el.tagName === 'IMG') return el.src;
          const img = el.querySelector('img');
          return img ? img.src : null;
        })()`,
        tabId: options.tabId
      });
      if (extractResult.success && extractResult.result && typeof extractResult.result === 'string') {
        imageUrl = extractResult.result;
      }
    } catch {
      // Ignore extraction error, will try other methods
    }
  }

  // If still no URL, try to find the largest image on the page
  if (!imageUrl) {
    try {
      const extractResult = await executeScript(BACKEND_URL, {
        code: `(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const largest = imgs.reduce((best, img) => {
            const area = img.naturalWidth * img.naturalHeight;
            const bestArea = best ? best.naturalWidth * best.naturalHeight : 0;
            return area > bestArea && area > 40000 ? img : best;
          }, null);
          return largest ? largest.src : null;
        })()`,
        tabId: options.tabId
      });
      if (extractResult.success && extractResult.result && typeof extractResult.result === 'string') {
        imageUrl = extractResult.result;
      }
    } catch {
      // Ignore extraction error
    }
  }

  // If we have a regular HTTPS URL (not blob), use direct download
  if (imageUrl && imageUrl.startsWith('https://') && !imageUrl.startsWith('blob:')) {
    const filename = options.outputPath?.split(/[/\\]/).pop() ||
      `downloaded-image-${Date.now()}.png`;

    const downloadResult = await downloadFile({
      url: imageUrl,
      filename
    });

    if (downloadResult.success && downloadResult.wslPath) {
      return {
        success: true,
        filePath: downloadResult.wslPath
      };
    }
  }

  // For blob URLs or if download failed, try extension-based canvas capture
  const captureResult = await captureImage({
    selector: options.selector,
    tabId: options.tabId,
    outputPath: options.outputPath
  });

  if (captureResult.success && captureResult.filePath) {
    return {
      success: true,
      filePath: captureResult.filePath
    };
  }

  // Return the best error message
  return {
    success: false,
    error: captureResult.error || 'Failed to download image. The image may be cross-origin or inaccessible.'
  };
}

/**
 * Tab info type
 */
export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  customName?: string;  // User-assigned name (stored by URL)
  active: boolean;
}

/**
 * Storage for custom tab names (keyed by URL)
 * This is session-based - names persist while MCP server is running
 */
const customTabNames: Map<string, string> = new Map();

/**
 * Rename a tab (assign a custom name)
 * The name is stored by URL so it persists even if tab order changes
 */
export async function renameTab(tabId: number, name: string): Promise<{ success: boolean; error?: string }> {
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
    } else {
      customTabNames.set(tab.url, name.trim());
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * List all open browser tabs via Extension API
 */
export async function listTabs(): Promise<{ tabs: TabInfo[]; error?: string }> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/tabs`, { timeout: 5000 });
    if (response.data.success && response.data.tabs) {
      const tabs: TabInfo[] = response.data.tabs.map((tab: any) => ({
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
  } catch (error) {
    return { tabs: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Switch to a specific tab via Extension API
 * Also updates currentTabId so subsequent operations target this tab.
 */
export async function switchTab(tabId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/switch-tab`, { tabId }, { timeout: 5000 });
    if (response.data.success) {
      currentTabId = tabId;
      return { success: true };
    }
    return { success: false, error: response.data.error || 'Failed to switch tab' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get the currently active tab via Extension API
 * This is the REAL focused tab, not just what Claude last switched to.
 */
export async function getActiveTab(): Promise<{ tab?: { tabId: number; url: string; title: string }; error?: string }> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/active-tab`, { timeout: 5000 });
    if (response.data.success && response.data.tab) {
      currentTabId = response.data.tab.tabId;
      return { tab: response.data.tab };
    }
    return { error: response.data.error || 'Failed to get active tab' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Open URL result type
 */
export interface OpenUrlResult {
  success: boolean;
  tabId?: number;
  url?: string;
  reused?: boolean;
  error?: string;
}

/**
 * Open a URL via Chrome Extension API
 */
export async function openUrl(options: {
  url: string;
  newTab?: boolean;
  background?: boolean;
  reuseExisting?: boolean;
}): Promise<OpenUrlResult> {
  try {
    const response = await axios.post<OpenUrlResult>(
      `${BACKEND_URL}/api/browser/open-url`,
      {
        url: options.url,
        newTab: options.newTab !== false, // default true
        background: options.background === true, // default false
        reuseExisting: options.reuseExisting !== false // default true
      },
      { timeout: 30000 }
    );

    // Update current tab tracking if successful and not background
    if (response.data.success && response.data.tabId && !options.background) {
      currentTabId = response.data.tabId;
    }

    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to open URL").message };
  }
}

/**
 * Click an element via Chrome Extension API
 */
export async function clickElement(selector: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; tagName?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/click-element`,
      { selector, tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Fill an input field via Chrome Extension API
 */
export async function fillInput(selector: string, value: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; tagName?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/fill-input`,
      { selector, value, tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Element info result type
 */
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

// =====================================
// Network Monitoring
// =====================================

import type { NetworkRequest, NetworkRequestsResponse } from "./types.js";

// Track if Extension API capture is active
let extensionNetworkCaptureActive = false;

/**
 * Enable network monitoring via Extension API
 */
export async function enableNetworkCapture(tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; error?: string }>(
      `${BACKEND_URL}/api/browser/network-capture/enable`,
      { tabId },
      { timeout: 10000 }
    );

    if (response.data.success) {
      extensionNetworkCaptureActive = true;
      return { success: true };
    }

    return { success: false, error: response.data.error || 'Failed to enable network capture' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Check if network capture is currently active
 */
export function isNetworkCaptureActive(): boolean {
  return extensionNetworkCaptureActive;
}

/**
 * Get captured network requests via Extension API
 */
export async function getNetworkRequests(options: {
  urlPattern?: string;
  method?: string;
  statusMin?: number;
  statusMax?: number;
  resourceType?: string;
  limit?: number;
  offset?: number;
  tabId?: number;
}): Promise<NetworkRequestsResponse> {
  try {
    const response = await axios.post<NetworkRequestsResponse>(
      `${BACKEND_URL}/api/browser/network-requests`,
      {
        urlPattern: options.urlPattern,
        method: options.method,
        statusMin: options.statusMin,
        statusMax: options.statusMax,
        resourceType: options.resourceType,
        limit: options.limit,
        offset: options.offset,
        tabId: options.tabId
      },
      { timeout: 10000 }
    );

    return response.data;
  } catch (error) {
    return {
      requests: [],
      total: 0,
      hasMore: false,
      captureActive: extensionNetworkCaptureActive
    };
  }
}

/**
 * Clear all captured network requests via Extension API
 */
export function clearNetworkRequests(): void {
  axios.post(`${BACKEND_URL}/api/browser/network-requests/clear`, {}, { timeout: 5000 })
    .catch(() => { /* Ignore errors */ });
}

// =====================================
// Download Operations
// =====================================

import type { DownloadResult, DownloadListResponse, CancelDownloadResult, ConflictAction } from "./types.js";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8129";

/**
 * Download a file using Chrome's download API
 * Returns both Windows and WSL paths for cross-platform compatibility
 */
export async function downloadFile(options: {
  url: string;
  filename?: string;
  conflictAction?: ConflictAction;
}): Promise<DownloadResult> {
  try {
    const response = await axios.post<DownloadResult>(
      `${BACKEND_URL}/api/browser/download-file`,
      {
        url: options.url,
        filename: options.filename,
        conflictAction: options.conflictAction || 'uniquify'
      },
      { timeout: 65000 } // Slightly longer than backend timeout
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to download file").message };
  }
}

/**
 * List recent downloads from Chrome
 */
export async function getDownloads(options: {
  limit?: number;
  state?: 'in_progress' | 'complete' | 'interrupted' | 'all';
}): Promise<DownloadListResponse> {
  try {
    const response = await axios.get<DownloadListResponse>(
      `${BACKEND_URL}/api/browser/downloads`,
      {
        params: {
          limit: options.limit || 20,
          state: options.state || 'all'
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    return { downloads: [], total: 0 };
  }
}

/**
 * Cancel an in-progress download
 */
export async function cancelDownload(downloadId: number): Promise<CancelDownloadResult> {
  try {
    const response = await axios.post<CancelDownloadResult>(
      `${BACKEND_URL}/api/browser/cancel-download`,
      { downloadId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to cancel download").message };
  }
}

// =====================================
// Page Capture Operations
// =====================================

import type { SavePageResult } from "./types.js";

/**
 * Save the current page as MHTML
 * Uses Chrome's pageCapture API to bundle HTML + CSS + images into a single file
 */
export async function savePage(options: {
  tabId?: number;
  filename?: string;
}): Promise<SavePageResult> {
  try {
    const response = await axios.post<SavePageResult>(
      `${BACKEND_URL}/api/browser/save-page`,
      {
        tabId: options.tabId,
        filename: options.filename
      },
      { timeout: 60000 } // 60s timeout for large pages
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to save page").message };
  }
}

/**
 * Capture an image from the page via canvas (extension-based)
 * Works for blob URLs and AI-generated images (ChatGPT, Copilot, DALL-E, etc.)
 */
export interface CaptureImageResult {
  success: boolean;
  filePath?: string;
  windowsPath?: string;
  wslPath?: string;
  width?: number;
  height?: number;
  error?: string;
}

export async function captureImage(options: {
  selector?: string;
  tabId?: number;
  outputPath?: string;
}): Promise<CaptureImageResult> {
  try {
    const response = await axios.post<CaptureImageResult>(
      `${BACKEND_URL}/api/browser/capture-image`,
      {
        selector: options.selector,
        tabId: options.tabId,
        outputPath: options.outputPath
      },
      { timeout: 35000 } // 35s timeout (backend has 30s)
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to capture image").message };
  }
}

/**
 * Get detailed information about an element via Chrome Extension API
 */
export async function getElementInfo(
  selector: string,
  options: {
    includeStyles?: boolean;
    styleProperties?: string[];
    tabId?: number;
  } = {}
): Promise<ElementInfo> {
  try {
    const response = await axios.post<ElementInfo>(
      `${BACKEND_URL}/api/browser/get-element-info`,
      {
        selector,
        tabId: options.tabId,
        includeStyles: options.includeStyles,
        styleProperties: options.styleProperties
      },
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// =====================================
// Bookmark Operations
// =====================================

import type {
  BookmarkTreeResult,
  BookmarkSearchResult,
  BookmarkCreateResult,
  BookmarkFolderResult,
  BookmarkMoveResult,
  BookmarkDeleteResult
} from "./types.js";

/**
 * Get bookmark tree (full hierarchy or specific folder)
 */
export async function getBookmarkTree(options: {
  folderId?: string;
  maxDepth?: number;
}): Promise<BookmarkTreeResult> {
  try {
    const params = new URLSearchParams();
    if (options.folderId) params.append('folderId', options.folderId);
    if (options.maxDepth) params.append('maxDepth', String(options.maxDepth));

    const response = await axios.get<BookmarkTreeResult>(
      `${BACKEND_URL}/api/browser/bookmarks/tree?${params.toString()}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to get bookmark tree").message };
  }
}

/**
 * Search bookmarks by title or URL
 */
export async function searchBookmarks(options: {
  query: string;
  limit?: number;
}): Promise<BookmarkSearchResult> {
  try {
    const params = new URLSearchParams();
    params.append('query', options.query);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await axios.get<BookmarkSearchResult>(
      `${BACKEND_URL}/api/browser/bookmarks/search?${params.toString()}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to search bookmarks").message };
  }
}

/**
 * Create a new bookmark
 */
export async function createBookmark(options: {
  url: string;
  title: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkCreateResult> {
  try {
    const response = await axios.post<BookmarkCreateResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create`,
      {
        url: options.url,
        title: options.title,
        parentId: options.parentId || '1',  // Default to Bookmarks Bar
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create bookmark").message };
  }
}

/**
 * Create a new bookmark folder
 */
export async function createBookmarkFolder(options: {
  title: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkFolderResult> {
  try {
    const response = await axios.post<BookmarkFolderResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create-folder`,
      {
        title: options.title,
        parentId: options.parentId || '1',  // Default to Bookmarks Bar
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create folder").message };
  }
}

/**
 * Move a bookmark or folder to a new location
 */
export async function moveBookmark(options: {
  id: string;
  parentId: string;
  index?: number;
}): Promise<BookmarkMoveResult> {
  try {
    const response = await axios.post<BookmarkMoveResult>(
      `${BACKEND_URL}/api/browser/bookmarks/move`,
      {
        id: options.id,
        parentId: options.parentId,
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to move bookmark").message };
  }
}

/**
 * Delete a bookmark or folder
 */
export async function deleteBookmark(id: string): Promise<BookmarkDeleteResult> {
  try {
    const response = await axios.post<BookmarkDeleteResult>(
      `${BACKEND_URL}/api/browser/bookmarks/delete`,
      { id },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to delete bookmark").message };
  }
}

// =====================================
// Debugger Operations (DOM, Performance, Coverage)
// =====================================

import type { DOMTreeResult, PerformanceResult, CoverageResult } from "./types.js";

/**
 * Get DOM tree using Chrome DevTools Protocol via debugger
 */
export async function getDomTree(options: {
  tabId?: number;
  maxDepth?: number;
  selector?: string;
}): Promise<DOMTreeResult> {
  try {
    const response = await axios.post<DOMTreeResult>(
      `${BACKEND_URL}/api/browser/debugger/dom-tree`,
      {
        tabId: options.tabId,
        maxDepth: options.maxDepth || 4,
        selector: options.selector
      },
      { timeout: 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to get DOM tree").message };
  }
}

/**
 * Profile page performance using Chrome DevTools Protocol
 */
export async function profilePerformance(options: {
  tabId?: number;
}): Promise<PerformanceResult> {
  try {
    const response = await axios.post<PerformanceResult>(
      `${BACKEND_URL}/api/browser/debugger/performance`,
      { tabId: options.tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to profile performance").message };
  }
}

/**
 * Get JS/CSS code coverage using Chrome DevTools Protocol
 */
export async function getCoverage(options: {
  tabId?: number;
  type?: 'js' | 'css' | 'both';
}): Promise<CoverageResult> {
  try {
    const response = await axios.post<CoverageResult>(
      `${BACKEND_URL}/api/browser/debugger/coverage`,
      {
        tabId: options.tabId,
        type: options.type || 'both'
      },
      { timeout: 25000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to get coverage").message };
  }
}
