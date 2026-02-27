/**
 * Interaction Module
 *
 * Element interaction (click, fill) and inspection functionality.
 */
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
/**
 * Click an element via Chrome Extension API
 */
export declare function clickElement(selector: string, tabId?: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Fill an input field via Chrome Extension API
 */
export declare function fillInput(selector: string, value: string, tabId?: number): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Get detailed information about an element via Chrome Extension API
 */
export declare function getElementInfo(selector: string, options?: {
    includeStyles?: boolean;
    styleProperties?: string[];
    tabId?: number;
}): Promise<ElementInfo>;
//# sourceMappingURL=interaction.d.ts.map