/**
 * Client Module Index
 *
 * Re-exports all client functionality for backward compatibility.
 * Import from this file to get the same interface as the old client.ts.
 */
export { BACKEND_URL, getCurrentTabId, setCurrentTabId, handleApiError, listTabs, switchTab, renameTab, getActiveTab, openUrl, getPageInfo, getConsoleLogs, executeScript, type TabInfo, type OpenUrlResult } from "./core.js";
export { takeScreenshot, captureImage, downloadImage, type ScreenshotResult, type DownloadImageResult, type CaptureImageResult } from "./screenshot.js";
export { clickElement, fillInput, getElementInfo, type ElementInfo } from "./interaction.js";
export { enableNetworkCapture, isNetworkCaptureActive, getNetworkRequests, clearNetworkRequests } from "./network.js";
export { downloadFile, getDownloads, cancelDownload, savePage } from "./downloads.js";
export { getBookmarkTree, searchBookmarks, createBookmark, createBookmarkFolder, moveBookmark, deleteBookmark } from "./bookmarks.js";
export { getDomTree, profilePerformance, getCoverage } from "./debugger.js";
export { listTabGroups, createTabGroup, updateTabGroup, addToTabGroup, ungroupTabs, addToClaudeGroup, removeFromClaudeGroup, getClaudeGroupStatus, type TabGroupColor, type TabGroupInfo, type ListTabGroupsResult, type TabGroupResult, type UngroupResult, type ClaudeGroupStatus } from "./tabGroups.js";
//# sourceMappingURL=index.d.ts.map