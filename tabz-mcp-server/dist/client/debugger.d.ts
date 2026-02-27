/**
 * Debugger Module
 *
 * Chrome DevTools Protocol functionality: DOM tree, performance, coverage.
 */
import type { DOMTreeResult, PerformanceResult, CoverageResult } from "../types.js";
/**
 * Get DOM tree using Chrome DevTools Protocol via debugger
 */
export declare function getDomTree(options: {
    tabId?: number;
    maxDepth?: number;
    selector?: string;
}): Promise<DOMTreeResult>;
/**
 * Profile page performance using Chrome DevTools Protocol
 */
export declare function profilePerformance(options: {
    tabId?: number;
}): Promise<PerformanceResult>;
/**
 * Get JS/CSS code coverage using Chrome DevTools Protocol
 */
export declare function getCoverage(options: {
    tabId?: number;
    type?: 'js' | 'css' | 'both';
}): Promise<CoverageResult>;
//# sourceMappingURL=debugger.d.ts.map