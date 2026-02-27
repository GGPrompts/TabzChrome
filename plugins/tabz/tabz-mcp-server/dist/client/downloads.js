/**
 * Downloads Module
 *
 * File download and page capture functionality.
 */
import axios from "axios";
import { BACKEND_URL, handleApiError } from "./core.js";
// =====================================
// File Downloads
// =====================================
/**
 * Download a file using Chrome's download API
 * Returns both Windows and WSL paths for cross-platform compatibility
 */
export async function downloadFile(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/download-file`, {
            url: options.url,
            filename: options.filename,
            conflictAction: options.conflictAction || 'uniquify'
        }, { timeout: 65000 } // Slightly longer than backend timeout
        );
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to download file").message };
    }
}
/**
 * List recent downloads from Chrome
 */
export async function getDownloads(options) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/downloads`, {
            params: {
                limit: options.limit || 20,
                state: options.state || 'all'
            },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        return { downloads: [], total: 0 };
    }
}
/**
 * Cancel an in-progress download
 */
export async function cancelDownload(downloadId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cancel-download`, { downloadId }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
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
export async function savePage(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/save-page`, {
            tabId: options.tabId,
            filename: options.filename
        }, { timeout: 60000 } // 60s timeout for large pages
        );
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to save page").message };
    }
}
//# sourceMappingURL=downloads.js.map