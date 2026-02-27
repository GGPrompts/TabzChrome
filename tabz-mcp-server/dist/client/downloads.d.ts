/**
 * Downloads Module
 *
 * File download and page capture functionality.
 */
import type { DownloadResult, DownloadListResponse, CancelDownloadResult, ConflictAction, SavePageResult } from "../types.js";
/**
 * Download a file using Chrome's download API
 * Returns both Windows and WSL paths for cross-platform compatibility
 */
export declare function downloadFile(options: {
    url: string;
    filename?: string;
    conflictAction?: ConflictAction;
}): Promise<DownloadResult>;
/**
 * List recent downloads from Chrome
 */
export declare function getDownloads(options: {
    limit?: number;
    state?: 'in_progress' | 'complete' | 'interrupted' | 'all';
}): Promise<DownloadListResponse>;
/**
 * Cancel an in-progress download
 */
export declare function cancelDownload(downloadId: number): Promise<CancelDownloadResult>;
/**
 * Save the current page as MHTML
 * Uses Chrome's pageCapture API to bundle HTML + CSS + images into a single file
 */
export declare function savePage(options: {
    tabId?: number;
    filename?: string;
}): Promise<SavePageResult>;
//# sourceMappingURL=downloads.d.ts.map