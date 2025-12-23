/**
 * Network Module
 *
 * Network request capture and monitoring functionality.
 */

import axios from "axios";
import { BACKEND_URL } from "./core.js";
import type { NetworkRequestsResponse } from "../types.js";

// =====================================
// State
// =====================================

// Track if Extension API capture is active
let extensionNetworkCaptureActive = false;

// =====================================
// Network Capture Functions
// =====================================

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
