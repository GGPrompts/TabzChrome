/**
 * Screenshot Module
 *
 * Screenshot and image capture functionality.
 */

import axios from "axios";
import { BACKEND_URL, executeScript, handleApiError } from "./core.js";
import { downloadFile } from "./downloads.js";

// =====================================
// Types
// =====================================

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

// =====================================
// Screenshot Functions
// =====================================

/**
 * Take a screenshot via Chrome Extension API
 */
export async function takeScreenshot(options: {
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
        selector: options.selector
      },
      { timeout: options.fullPage ? 65000 : 35000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Capture an image from the page via canvas (extension-based)
 * Works for blob URLs and AI-generated images (ChatGPT, Copilot, DALL-E, etc.)
 */
export async function captureImage(options: {
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
      { timeout: 35000 } // 35s timeout (backend has 30s)
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to capture image").message };
  }
}

/**
 * Download an image from the page via Extension API
 */
export async function downloadImage(options: {
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
