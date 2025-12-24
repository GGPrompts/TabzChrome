/**
 * Client Module Index
 *
 * Re-exports all client functionality for backward compatibility.
 * Import from this file to get the same interface as the old client.ts.
 */

// Core: Tab management, state, utilities
export {
  BACKEND_URL,
  getCurrentTabId,
  setCurrentTabId,
  handleApiError,
  listTabs,
  switchTab,
  renameTab,
  getActiveTab,
  openUrl,
  getPageInfo,
  getConsoleLogs,
  executeScript,
  type TabInfo,
  type OpenUrlResult
} from "./core.js";

// Screenshots & Image Capture
export {
  takeScreenshot,
  captureImage,
  downloadImage,
  type ScreenshotResult,
  type DownloadImageResult,
  type CaptureImageResult
} from "./screenshot.js";

// Element Interaction & Inspection
export {
  clickElement,
  fillInput,
  getElementInfo,
  type ElementInfo
} from "./interaction.js";

// Network Monitoring
export {
  enableNetworkCapture,
  isNetworkCaptureActive,
  getNetworkRequests,
  clearNetworkRequests
} from "./network.js";

// Downloads & Page Capture
export {
  downloadFile,
  getDownloads,
  cancelDownload,
  savePage
} from "./downloads.js";

// Bookmarks
export {
  getBookmarkTree,
  searchBookmarks,
  createBookmark,
  createBookmarkFolder,
  moveBookmark,
  deleteBookmark
} from "./bookmarks.js";

// DevTools Protocol (DOM, Performance, Coverage)
export {
  getDomTree,
  profilePerformance,
  getCoverage
} from "./debugger.js";

// Tab Groups
export {
  listTabGroups,
  createTabGroup,
  updateTabGroup,
  addToTabGroup,
  ungroupTabs,
  addToClaudeGroup,
  removeFromClaudeGroup,
  getClaudeGroupStatus,
  type TabGroupColor,
  type TabGroupInfo,
  type ListTabGroupsResult,
  type TabGroupResult,
  type UngroupResult,
  type ClaudeGroupStatus
} from "./tabGroups.js";
