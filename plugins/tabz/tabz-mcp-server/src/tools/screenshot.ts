/**
 * Screenshot Tools
 *
 * Tools for capturing screenshots and downloading images from browser pages
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import {
  BACKEND_URL,
  handleApiError,
  type ScreenshotResult,
  type DownloadImageResult,
  type CaptureImageResult
} from "../shared.js";
import type { ScriptResult } from "../types.js";

// Input schema for tabz_screenshot (viewport only)
const ScreenshotViewportSchema = z.object({
  selector: z.string()
    .optional()
    .describe("CSS selector for element to screenshot. If not provided, captures the current viewport."),
  outputPath: z.string()
    .optional()
    .describe("Custom output path for the screenshot. Default: Downloads/tabz/screenshots/screenshot-{timestamp}.png"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target a specific tab by Chrome tab ID (from tabz_list_tabs). If not provided, uses the current tab.")
}).strict();

type ScreenshotViewportInput = z.infer<typeof ScreenshotViewportSchema>;

// Input schema for tabz_screenshot_full (entire scrollable page)
const ScreenshotFullSchema = z.object({
  outputPath: z.string()
    .optional()
    .describe("Custom output path for the screenshot. Default: Downloads/tabz/screenshots/screenshot-full-{timestamp}.png"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target a specific tab by Chrome tab ID (from tabz_list_tabs). If not provided, uses the current tab.")
}).strict();

type ScreenshotFullInput = z.infer<typeof ScreenshotFullSchema>;

// Input schema for tabz_download_image
const DownloadImageSchema = z.object({
  selector: z.string()
    .optional()
    .describe("CSS selector for an <img> element or element with background-image. Extracts the image URL automatically."),
  url: z.string()
    .url()
    .optional()
    .describe("Direct URL of the image to download. Use this OR selector, not both."),
  outputPath: z.string()
    .optional()
    .describe("Custom output path for the image. Default: Downloads/tabz/images/captured-image-{timestamp}.png")
}).strict();

type DownloadImageInput = z.infer<typeof DownloadImageSchema>;

/**
 * Take a screenshot via Chrome Extension API
 */
async function takeScreenshot(options: {
  selector?: string;
  fullPage?: boolean;
  outputPath?: string;
  tabId?: number;
}): Promise<ScreenshotResult> {
  try {
    const endpoint = options.fullPage ? '/api/browser/screenshot-full' : '/api/browser/screenshot';
    const response = await axios.post<ScreenshotResult>(
      `${BACKEND_URL}${endpoint}`,
      {
        tabId: options.tabId,
        selector: options.selector,
        outputPath: options.outputPath
      },
      { timeout: options.fullPage ? 65000 : 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Execute JavaScript in the browser via Extension API
 */
async function executeScript(options: {
  code: string;
  tabId?: number;
}): Promise<ScriptResult> {
  try {
    const response = await axios.post<ScriptResult>(
      `${BACKEND_URL}/api/browser/execute-script`,
      {
        code: options.code,
        tabId: options.tabId
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to execute script");
  }
}

/**
 * Download a file using Chrome's download API
 */
async function downloadFile(options: {
  url: string;
  filename?: string;
}): Promise<{ success: boolean; wslPath?: string; error?: string }> {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/browser/download-file`,
      {
        url: options.url,
        filename: options.filename,
        conflictAction: 'uniquify'
      },
      { timeout: 65000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to download file").message };
  }
}

/**
 * Capture an image from the page via canvas (extension-based)
 */
async function captureImage(options: {
  selector?: string;
  tabId?: number;
  outputPath?: string;
}): Promise<CaptureImageResult> {
  try {
    const response = await axios.post<CaptureImageResult>(
      `${BACKEND_URL}/api/browser/capture-image`,
      {
        selector: options.selector,
        tabId: options.tabId,
        outputPath: options.outputPath
      },
      { timeout: 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to capture image").message };
  }
}

/**
 * Download an image from the page via Extension API
 */
async function downloadImage(options: {
  selector?: string;
  url?: string;
  outputPath?: string;
  tabId?: number;
}): Promise<DownloadImageResult> {
  let imageUrl = options.url;

  // If no URL provided but selector given, try to extract URL from the page
  if (!imageUrl && options.selector) {
    try {
      const extractResult = await executeScript({
        code: `(() => {
          const el = document.querySelector('${options.selector.replace(/'/g, "\\'")}');
          if (!el) return null;
          if (el.tagName === 'IMG') return el.src;
          const img = el.querySelector('img');
          return img ? img.src : null;
        })()`,
        tabId: options.tabId
      });
      if (extractResult.success && extractResult.result && typeof extractResult.result === 'string') {
        imageUrl = extractResult.result;
      }
    } catch {
      // Ignore extraction error, will try other methods
    }
  }

  // If still no URL, try to find the largest image on the page
  if (!imageUrl) {
    try {
      const extractResult = await executeScript({
        code: `(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          const largest = imgs.reduce((best, img) => {
            const area = img.naturalWidth * img.naturalHeight;
            const bestArea = best ? best.naturalWidth * best.naturalHeight : 0;
            return area > bestArea && area > 40000 ? img : best;
          }, null);
          return largest ? largest.src : null;
        })()`,
        tabId: options.tabId
      });
      if (extractResult.success && extractResult.result && typeof extractResult.result === 'string') {
        imageUrl = extractResult.result;
      }
    } catch {
      // Ignore extraction error
    }
  }

  // If we have a regular HTTPS URL (not blob), use direct download
  if (imageUrl && imageUrl.startsWith('https://') && !imageUrl.startsWith('blob:')) {
    const filename = options.outputPath?.split(/[/\\]/).pop() ||
      `downloaded-image-${Date.now()}.png`;

    const downloadResult = await downloadFile({
      url: imageUrl,
      filename
    });

    if (downloadResult.success && downloadResult.wslPath) {
      return {
        success: true,
        filePath: downloadResult.wslPath
      };
    }
  }

  // For blob URLs or if download failed, try extension-based canvas capture
  const captureResult = await captureImage({
    selector: options.selector,
    tabId: options.tabId,
    outputPath: options.outputPath
  });

  if (captureResult.success && captureResult.filePath) {
    return {
      success: true,
      filePath: captureResult.filePath
    };
  }

  // Return the best error message
  return {
    success: false,
    error: captureResult.error || 'Failed to download image. The image may be cross-origin or inaccessible.'
  };
}

/**
 * Register screenshot tools with the MCP server
 */
export function registerScreenshotTools(server: McpServer): void {
  // Screenshot viewport tool - captures what's currently visible
  server.tool(
    "tabz_screenshot",
    `Screenshot the visible viewport. Use tabz_screenshot_full for entire scrollable page. Returns filePath for Read tool.

Args: selector (optional, for element screenshot), outputPath (optional), tabId (optional)`,
    ScreenshotViewportSchema.shape,
    async (params: ScreenshotViewportInput) => {
      try {
        const result = await takeScreenshot({
          selector: params.selector,
          fullPage: false,
          outputPath: params.outputPath,
          tabId: params.tabId
        });

        let resultText: string;
        if (result.success && result.filePath) {
          resultText = `## Screenshot Captured

**File saved to:** ${result.filePath}

Use the Read tool to view the screenshot:
\`\`\`
Read file: ${result.filePath}
\`\`\``;
        } else {
          resultText = `## Screenshot Failed

**Error:** ${result.error}

Troubleshooting:
- Ensure TabzChrome extension is installed and backend is running at localhost:8129
- Check that a webpage (not chrome://) is open
- Verify the selector matches an element on the page`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Screenshot full page tool - captures entire scrollable page
  server.tool(
    "tabz_screenshot_full",
    `Screenshot the entire scrollable page (top to bottom). Recommended for first-time page exploration.

Args: outputPath (optional), tabId (optional)`,
    ScreenshotFullSchema.shape,
    async (params: ScreenshotFullInput) => {
      try {
        const result = await takeScreenshot({
          fullPage: true,
          outputPath: params.outputPath,
          tabId: params.tabId
        });

        let resultText: string;
        if (result.success && result.filePath) {
          resultText = `## Full Page Screenshot Captured

**File saved to:** ${result.filePath}

Use the Read tool to view the screenshot:
\`\`\`
Read file: ${result.filePath}
\`\`\``;
        } else {
          resultText = `## Full Page Screenshot Failed

**Error:** ${result.error}

Troubleshooting:
- Ensure TabzChrome extension is installed and backend is running at localhost:8129
- Check that a webpage (not chrome://) is open`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Download image tool
  server.tool(
    "tabz_download_image",
    `Download an image from the page by CSS selector or direct URL. Returns filePath for Read tool.

Args: selector (optional) OR url (optional), outputPath (optional)`,
    DownloadImageSchema.shape,
    async (params: DownloadImageInput) => {
      try {
        const result = await downloadImage({
          selector: params.selector,
          url: params.url,
          outputPath: params.outputPath
        });

        let resultText: string;
        if (result.success && result.filePath) {
          resultText = `## Image Downloaded

**File saved to:** ${result.filePath}

Use the Read tool to view the image:
\`\`\`
Read file: ${result.filePath}
\`\`\``;
        } else {
          resultText = `## Image Download Failed

**Error:** ${result.error}

Troubleshooting:
- Ensure TabzChrome extension is installed and backend is running at localhost:8129
- Check that the selector points to an <img> element or element with background-image
- Verify the image URL is accessible`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
