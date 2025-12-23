/**
 * Downloads Module
 *
 * File download and page capture functionality.
 */

import axios from "axios";
import { BACKEND_URL, handleApiError } from "./core.js";
import type { DownloadResult, DownloadListResponse, CancelDownloadResult, ConflictAction, SavePageResult } from "../types.js";

// =====================================
// File Downloads
// =====================================

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
// Page Capture
// =====================================

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
