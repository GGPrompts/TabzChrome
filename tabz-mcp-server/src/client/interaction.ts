/**
 * Interaction Module
 *
 * Element interaction (click, fill) and inspection functionality.
 */

import axios from "axios";
import { BACKEND_URL } from "./core.js";

// =====================================
// Types
// =====================================

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
// Element Interaction
// =====================================

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

// =====================================
// Element Inspection
// =====================================

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
