/**
 * Network Module
 *
 * Network request capture and monitoring functionality.
 */
import type { NetworkRequestsResponse } from "../types.js";
/**
 * Enable network monitoring via Extension API
 */
export declare function enableNetworkCapture(tabId?: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Check if network capture is currently active
 */
export declare function isNetworkCaptureActive(): boolean;
/**
 * Get captured network requests via Extension API
 */
export declare function getNetworkRequests(options: {
    urlPattern?: string;
    method?: string;
    statusMin?: number;
    statusMax?: number;
    resourceType?: string;
    limit?: number;
    offset?: number;
    tabId?: number;
}): Promise<NetworkRequestsResponse>;
/**
 * Clear all captured network requests via Extension API
 */
export declare function clearNetworkRequests(): void;
//# sourceMappingURL=network.d.ts.map