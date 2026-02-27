/**
 * Interaction Module
 *
 * Element interaction (click, fill) and inspection functionality.
 */
import axios from "axios";
import { BACKEND_URL } from "./core.js";
// =====================================
// Element Interaction
// =====================================
/**
 * Click an element via Chrome Extension API
 */
export async function clickElement(selector, tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/click-element`, { selector, tabId }, { timeout: 20000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Fill an input field via Chrome Extension API
 */
export async function fillInput(selector, value, tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/fill-input`, { selector, value, tabId }, { timeout: 20000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
// =====================================
// Element Inspection
// =====================================
/**
 * Get detailed information about an element via Chrome Extension API
 */
export async function getElementInfo(selector, options = {}) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/get-element-info`, {
            selector,
            tabId: options.tabId,
            includeStyles: options.includeStyles,
            styleProperties: options.styleProperties
        }, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
//# sourceMappingURL=interaction.js.map