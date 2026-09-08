/**
 * Screenshot Tools
 *
 * Tools for capturing screenshots and downloading images from browser pages
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
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
import { docsPointer, OUTPUT_PATH_DESC } from "../descriptions.js";

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
    .describe("An <img> or background-image element."),
  url: z.string()
    .url()
    .optional()
    .describe("Image URL, instead of selector."),
  outputPath: z.string()
    .optional()
    .describe(OUTPUT_PATH_DESC)
}).strict();

type DownloadImageInput = z.infer<typeof DownloadImageSchema>;

/**
 * Take a screenshot via Chrome Extension API
 */
export async function takeScreenshot(options: {
  ref?: string;
  inlineOnly?: boolean;
  clip?: { x0: number; y0: number; x1: number; y1: number };
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
        ref: options.ref,
        inlineOnly: options.inlineOnly,
        clip: options.clip,
        fullPage: options.fullPage,
        outputPath: options.outputPath
      },
      { timeout: options.fullPage ? 65000 : 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Keep delivery evidence explicit: inline-only needs an image; saved captures need a path. */
export function screenshotToolResult(result: ScreenshotResult, options: { inlineOnly?: boolean; action?: string; tabId?: number } = {}): CallToolResult {
  const validTab = options.tabId === undefined || result.tabId === options.tabId;
  const hasImage = result.success === true && validTab &&
    typeof result.imageData === "string" && result.imageData.length > 0 && result.imageData.length <= 8_000_000 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(result.imageData) &&
    ["image/png", "image/jpeg", "image/webp"].includes(result.mimeType ?? "");
  const path = typeof result.filePath === "string" && result.filePath.length > 0 ? result.filePath : null;
  const complete = result.success === true && validTab && (options.inlineOnly ? hasImage : path !== null);
  const error = result.error || (!validTab ? "Screenshot came from a different tab" : options.inlineOnly ? "Inline image data was not returned" : "The saved screenshot path was not returned");
  const text = complete
    ? `## Screenshot Captured\n\n${path ? `**File saved to:** ${path}\n\n` : ""}${result.width && result.height ? `${result.width} × ${result.height}px. ` : ""}${hasImage ? `Image included inline as ${result.mimeType}.` : "Use the saved file to view the capture."}`
    : `## Screenshot Failed\n\n**Error:** ${error}`;
  const content: CallToolResult["content"] = [{ type: "text", text }];
  if (complete && hasImage) content.push({ type: "image", data: result.imageData!, mimeType: result.mimeType! });
  return {
    content,
    structuredContent: {
      status: complete ? "completed" : result.transportError ? "transport_error" : "failed",
      success: complete,
      ...(options.action ? { action: options.action } : {}),
      tabId: result.tabId ?? null,
      path: complete ? path : null,
      mimeType: complete ? result.mimeType ?? null : null,
      width: complete ? result.width ?? null : null,
      height: complete ? result.height ?? null : null,
      bytes: complete ? result.bytes ?? null : null,
      inline: complete && hasImage,
      text,
      ...(!complete ? { error } : {})
    },
    isError: !complete
  };
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
      filePath: captureResult.filePath,
      tabId: captureResult.tabId,
      imageData: captureResult.imageData,
      mimeType: captureResult.mimeType,
      width: captureResult.width,
      height: captureResult.height,
      bytes: captureResult.bytes,
      imageReencoded: captureResult.imageReencoded
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
  registerTabzTool(server,
    "tabz_screenshot",
    "LEGACY: prefer tabz_act action \"screenshot\". Capture the viewport or one element. " + docsPointer("tabz_screenshot"),
    ScreenshotViewportSchema,
    async (params: ScreenshotViewportInput) => {
      try {
        const result = await takeScreenshot({
          selector: params.selector,
          fullPage: false,
          outputPath: params.outputPath,
          tabId: params.tabId
        });

        return screenshotToolResult(result, { tabId: params.tabId });
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
  registerTabzTool(server,
    "tabz_screenshot_full",
    "LEGACY: prefer tabz_act action \"screenshot\" with fullPage. Capture the full page. " + docsPointer("tabz_screenshot_full"),
    ScreenshotFullSchema,
    async (params: ScreenshotFullInput) => {
      try {
        const result = await takeScreenshot({
          fullPage: true,
          outputPath: params.outputPath,
          tabId: params.tabId
        });

        return screenshotToolResult(result, { tabId: params.tabId });
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
  registerTabzTool(server,
    "tabz_download_image",
    "Download one image from the page, by CSS selector or direct URL.",
    DownloadImageSchema,
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

        const output = screenshotToolResult(result);
        output.content[0] = { type: "text", text: resultText };
        output.structuredContent = { ...output.structuredContent, text: resultText };
        return output;
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
