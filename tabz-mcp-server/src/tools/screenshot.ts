/**
 * Screenshot Tools
 *
 * Tools for capturing screenshots and downloading images from browser pages
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { takeScreenshot, downloadImage } from "../client.js";

// Input schema for tabz_screenshot
const ScreenshotSchema = z.object({
  selector: z.string()
    .optional()
    .describe("CSS selector for element to screenshot. If not provided, captures the viewport or full page."),
  fullPage: z.boolean()
    .default(false)
    .describe("Capture the full scrollable page instead of just the viewport (default: false)"),
  outputPath: z.string()
    .optional()
    .describe("Custom output path for the screenshot. Default: ~/ai-images/screenshot-{timestamp}.png")
}).strict();

type ScreenshotInput = z.infer<typeof ScreenshotSchema>;

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
    .describe("Custom output path for the image. Default: ~/ai-images/image-{timestamp}.{ext}")
}).strict();

type DownloadImageInput = z.infer<typeof DownloadImageSchema>;

/**
 * Register screenshot tools with the MCP server
 */
export function registerScreenshotTools(server: McpServer): void {
  // Screenshot tool
  server.tool(
    "tabz_screenshot",
    `Capture a screenshot of the browser page and save to local disk.

This tool captures screenshots via Chrome DevTools Protocol (CDP). Screenshots are saved
to ~/ai-images/ by default, and the file path is returned so Claude can view it with the Read tool.

Args:
  - selector (optional): CSS selector to screenshot a specific element
  - fullPage (optional): If true, captures the entire scrollable page (default: false)
  - outputPath (optional): Custom save path (default: ~/ai-images/screenshot-{timestamp}.png)

Returns:
  - success: Whether the screenshot was captured
  - filePath: Path to the saved screenshot file (use Read tool to view)
  - error: Error message if failed

Examples:
  - Capture viewport: (no args needed)
  - Capture full page: fullPage=true
  - Capture element: selector="#main-content"
  - Custom path: outputPath="/tmp/screenshot.png"

Error Handling:
  - "CDP not available": Chrome not running with --remote-debugging-port=9222
  - "No active page": No browser tab is open
  - "Element not found": Selector doesn't match any element

After capturing, use the Read tool with the returned filePath to view the screenshot.`,
    ScreenshotSchema.shape,
    async (params: ScreenshotInput) => {
      try {
        const result = await takeScreenshot({
          selector: params.selector,
          fullPage: params.fullPage,
          outputPath: params.outputPath
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
- Ensure Chrome is running with: --remote-debugging-port=9222
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

  // Download image tool
  server.tool(
    "tabz_download_image",
    `Download an image from the browser page and save to local disk.

This tool extracts and downloads images via Chrome DevTools Protocol (CDP). It can download
images by CSS selector (from <img> tags or background-image) or by direct URL.

Args:
  - selector (optional): CSS selector for <img> element or element with background-image
  - url (optional): Direct URL of image to download (use selector OR url, not both)
  - outputPath (optional): Custom save path (default: ~/ai-images/image-{timestamp}.{ext})

Returns:
  - success: Whether the image was downloaded
  - filePath: Path to the saved image file (use Read tool to view)
  - error: Error message if failed

Examples:
  - Download by selector: selector="img.hero-image"
  - Download by URL: url="https://example.com/image.png"
  - First image on page: selector="img"
  - Custom path: outputPath="/tmp/downloaded.jpg"

Error Handling:
  - "CDP not available": Chrome not running with --remote-debugging-port=9222
  - "Could not find image URL": Selector doesn't point to an image element
  - "Either selector or url required": Must provide one parameter

After downloading, use the Read tool with the returned filePath to view the image.`,
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
- Ensure Chrome is running with: --remote-debugging-port=9222
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
