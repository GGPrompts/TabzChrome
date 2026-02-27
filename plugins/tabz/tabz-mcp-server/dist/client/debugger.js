/**
 * Debugger Module
 *
 * Chrome DevTools Protocol functionality: DOM tree, performance, coverage.
 */
import axios from "axios";
import { BACKEND_URL, handleApiError } from "./core.js";
// =====================================
// DevTools Protocol Functions
// =====================================
/**
 * Get DOM tree using Chrome DevTools Protocol via debugger
 */
export async function getDomTree(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/debugger/dom-tree`, {
            tabId: options.tabId,
            maxDepth: options.maxDepth || 4,
            selector: options.selector
        }, { timeout: 35000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to get DOM tree").message };
    }
}
/**
 * Profile page performance using Chrome DevTools Protocol
 */
export async function profilePerformance(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/debugger/performance`, { tabId: options.tabId }, { timeout: 20000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to profile performance").message };
    }
}
/**
 * Get JS/CSS code coverage using Chrome DevTools Protocol
 */
export async function getCoverage(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/debugger/coverage`, {
            tabId: options.tabId,
            type: options.type || 'both'
        }, { timeout: 25000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: handleApiError(error, "Failed to get coverage").message };
    }
}
//# sourceMappingURL=debugger.js.map