/**
 * Screenshot Module
 *
 * Screenshot and image capture functionality.
 */
export interface ScreenshotResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
export interface DownloadImageResult {
    success: boolean;
    filePath?: string;
    error?: string;
}
export interface CaptureImageResult {
    success: boolean;
    filePath?: string;
    windowsPath?: string;
    wslPath?: string;
    width?: number;
    height?: number;
    error?: string;
}
/**
 * Take a screenshot via Chrome Extension API
 */
export declare function takeScreenshot(options: {
    selector?: string;
    fullPage?: boolean;
    outputPath?: string;
    tabId?: number;
}): Promise<ScreenshotResult>;
/**
 * Capture an image from the page via canvas (extension-based)
 * Works for blob URLs and AI-generated images (ChatGPT, Copilot, DALL-E, etc.)
 */
export declare function captureImage(options: {
    selector?: string;
    tabId?: number;
    outputPath?: string;
}): Promise<CaptureImageResult>;
/**
 * Download an image from the page via Extension API
 */
export declare function downloadImage(options: {
    selector?: string;
    url?: string;
    outputPath?: string;
    tabId?: number;
}): Promise<DownloadImageResult>;
//# sourceMappingURL=screenshot.d.ts.map