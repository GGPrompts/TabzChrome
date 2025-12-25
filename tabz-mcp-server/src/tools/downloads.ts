/**
 * Download Tools
 *
 * Tools for downloading files via Chrome's download API
 * Returns both Windows and WSL paths for cross-platform compatibility
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import {
  ResponseFormat,
  type DownloadItem,
  type DownloadResult,
  type DownloadListResponse,
  type CancelDownloadResult,
  type SavePageResult,
  type ConflictAction
} from "../types.js";
import { formatBytes } from "../utils.js";

/**
 * Download a file using Chrome's download API
 */
async function downloadFile(options: {
  url: string;
  filename?: string;
  conflictAction?: ConflictAction;
}): Promise<DownloadResult> {
  try {
    const response = await axios.post<DownloadResult>(
      `${BACKEND_URL}/api/browser/download-file`,
      {
        url: options.url,
        filename: options.filename,
        conflictAction: options.conflictAction || 'uniquify'
      },
      { timeout: 65000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to download file");
  }
}

/**
 * Get list of recent downloads
 */
async function getDownloads(options: {
  state?: string;
  limit?: number;
}): Promise<DownloadListResponse> {
  try {
    const response = await axios.get<DownloadListResponse>(
      `${BACKEND_URL}/api/browser/downloads`,
      {
        params: {
          state: options.state,
          limit: options.limit
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get downloads");
  }
}

/**
 * Cancel an in-progress download
 */
async function cancelDownload(downloadId: number): Promise<CancelDownloadResult> {
  try {
    const response = await axios.post<CancelDownloadResult>(
      `${BACKEND_URL}/api/browser/cancel-download`,
      { downloadId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to cancel download");
  }
}

/**
 * Save current page to a file
 */
async function savePage(options: {
  tabId?: number;
  filename?: string;
}): Promise<SavePageResult> {
  try {
    const response = await axios.post<SavePageResult>(
      `${BACKEND_URL}/api/browser/save-page`,
      {
        tabId: options.tabId,
        filename: options.filename
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to save page");
  }
}

// Input schema for tabz_download_file
const DownloadFileSchema = z.object({
  url: z.string()
    .url()
    .describe("URL of the file to download. Must be a valid URL."),
  filename: z.string()
    .optional()
    .describe("Custom filename (relative to Chrome's Downloads folder). If not provided, uses URL filename."),
  conflictAction: z.enum(["uniquify", "overwrite", "prompt"])
    .default("uniquify")
    .describe("Action when file exists: 'uniquify' adds suffix (default), 'overwrite' replaces, 'prompt' asks user"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type DownloadFileInput = z.infer<typeof DownloadFileSchema>;

// Input schema for tabz_get_downloads
const GetDownloadsSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of downloads to return (1-100, default: 20)"),
  state: z.enum(["in_progress", "complete", "interrupted", "all"])
    .default("all")
    .describe("Filter by download state: 'in_progress', 'complete', 'interrupted', or 'all' (default)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type GetDownloadsInput = z.infer<typeof GetDownloadsSchema>;

// Input schema for tabz_cancel_download
const CancelDownloadSchema = z.object({
  downloadId: z.number()
    .int()
    .describe("The download ID to cancel (from tabz_get_downloads)")
}).strict();

type CancelDownloadInput = z.infer<typeof CancelDownloadSchema>;

/**
 * Format download progress
 */
function formatProgress(bytesReceived: number, totalBytes: number): string {
  if (totalBytes <= 0) return formatBytes(bytesReceived);
  const percent = Math.round((bytesReceived / totalBytes) * 100);
  return `${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)} (${percent}%)`;
}

/**
 * Format a download item for markdown display
 */
function formatDownloadMarkdown(download: DownloadItem, index: number): string[] {
  const lines: string[] = [];
  const stateEmoji = download.state === 'complete' ? '✅' :
                     download.state === 'in_progress' ? '⏳' : '❌';

  lines.push(`### ${index + 1}. ${stateEmoji} ${download.filename}`);
  lines.push(`- **State:** ${download.state}`);

  if (download.state === 'in_progress') {
    lines.push(`- **Progress:** ${formatProgress(download.bytesReceived, download.totalBytes)}`);
  } else if (download.totalBytes > 0) {
    lines.push(`- **Size:** ${formatBytes(download.totalBytes)}`);
  }

  if (download.mime) {
    lines.push(`- **Type:** ${download.mime}`);
  }

  lines.push(`- **Started:** ${new Date(download.startTime).toLocaleString()}`);

  if (download.endTime) {
    lines.push(`- **Completed:** ${new Date(download.endTime).toLocaleString()}`);
  }

  if (download.error) {
    lines.push(`- **Error:** ${download.error}`);
  }

  if (download.wslPath) {
    lines.push(`- **WSL Path:** \`${download.wslPath}\``);
  }

  if (download.windowsPath) {
    lines.push(`- **Windows Path:** \`${download.windowsPath}\``);
  }

  lines.push(`- **Download ID:** ${download.id}`);
  lines.push("");

  return lines;
}

/**
 * Register download tools with the MCP server
 */
export function registerDownloadTools(server: McpServer): void {

  // Download file tool
  server.tool(
    "tabz_download_file",
    `Download a file from any URL using Chrome's download manager.

This tool downloads files via Chrome's built-in download API, which:
- Handles authentication (uses browser cookies/session)
- Shows in Chrome's download manager
- Saves to Chrome's configured Downloads folder

IMPORTANT for WSL2 users: Returns BOTH paths for cross-platform compatibility:
- windowsPath: Original Windows path (e.g., "C:\\Users\\matt\\Downloads\\file.png")
- wslPath: Converted WSL path (e.g., "/mnt/c/Users/matt/Downloads/file.png")

Use the wslPath with Claude's Read tool to view downloaded images.

Args:
  - url (required): URL of the file to download
  - filename (optional): Custom filename (relative to Downloads folder)
  - conflictAction: 'uniquify' (add number suffix), 'overwrite', or 'prompt' (default: uniquify)
  - response_format: 'markdown' (default) or 'json'

Returns:
  For JSON format:
  {
    "success": boolean,
    "filename": string,         // Just the filename
    "windowsPath": string,      // Full Windows path
    "wslPath": string,          // Full WSL path (use with Read tool)
    "fileSize": number,         // Size in bytes
    "error": string             // If failed
  }

Examples:
  - Download image: url="https://example.com/image.png"
  - Custom name: url="https://example.com/data.json", filename="my-data.json"
  - Overwrite existing: url="...", conflictAction="overwrite"

Workflow for images:
  1. tabz_download_file with image URL
  2. Use Read tool with returned wslPath to view the image

Error Handling:
  - "Download failed to start": Invalid URL or network error
  - "Download interrupted": Connection lost or cancelled
  - "Download timed out": File too large or slow connection (may still complete)`,
    DownloadFileSchema.shape,
    async (params: DownloadFileInput) => {
      try {
        const result = await downloadFile({
          url: params.url,
          filename: params.filename,
          conflictAction: params.conflictAction
        });

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          if (result.success && result.wslPath) {
            resultText = `## Download Complete

**File:** ${result.filename}
**Size:** ${result.fileSize ? formatBytes(result.fileSize) : 'Unknown'}

### File Paths

**WSL Path (use with Read tool):**
\`\`\`
${result.wslPath}
\`\`\`

**Windows Path:**
\`\`\`
${result.windowsPath}
\`\`\`

To view the downloaded file, use the Read tool with the WSL path above.`;
          } else {
            resultText = `## Download Failed

**Error:** ${result.error}

**Troubleshooting:**
- Check that the URL is accessible in Chrome
- Verify the file exists and is downloadable
- Check Chrome's download settings aren't blocking this file type`;
          }
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

  // Get downloads list tool
  server.tool(
    "tabz_get_downloads",
    `List recent downloads from Chrome's download manager.

Returns information about recent downloads including their status, size, and file paths.
Useful for checking download progress or finding previously downloaded files.

Args:
  - limit: Maximum downloads to return (1-100, default: 20)
  - state: Filter by state - 'in_progress', 'complete', 'interrupted', or 'all' (default)
  - response_format: 'markdown' (default) or 'json'

Returns:
  For JSON format:
  {
    "downloads": [{
      "id": number,              // Use with tabz_cancel_download
      "url": string,
      "filename": string,
      "state": "in_progress" | "complete" | "interrupted",
      "bytesReceived": number,
      "totalBytes": number,
      "startTime": string,
      "endTime": string,
      "error": string,
      "mime": string,
      "windowsPath": string,
      "wslPath": string          // Use with Read tool
    }],
    "total": number
  }

Examples:
  - All recent: (no args)
  - Only completed: state="complete"
  - Check progress: state="in_progress"

Use tabz_cancel_download with the download ID to cancel in-progress downloads.`,
    GetDownloadsSchema.shape,
    async (params: GetDownloadsInput) => {
      try {
        const result = await getDownloads({
          limit: params.limit,
          state: params.state
        });

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          lines.push(`# Chrome Downloads`);
          lines.push("");

          if (params.state !== 'all') {
            lines.push(`**Filter:** ${params.state}`);
          }
          lines.push(`**Total:** ${result.total} download(s)`);
          lines.push("");

          if (result.downloads.length === 0) {
            lines.push("No downloads found matching the criteria.");
          } else {
            for (let i = 0; i < result.downloads.length; i++) {
              lines.push(...formatDownloadMarkdown(result.downloads[i], i));
            }
          }

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Cancel download tool
  server.tool(
    "tabz_cancel_download",
    `Cancel an in-progress download.

Use the download ID from tabz_get_downloads to cancel a download.
Only works for downloads that are still in progress.

Args:
  - downloadId (required): The download ID to cancel (from tabz_get_downloads)

Returns:
  - success: Whether the download was cancelled
  - error: Error message if failed

Examples:
  - Cancel download: downloadId=123

Note: Cancelled downloads cannot be resumed. You'll need to start a new download.`,
    CancelDownloadSchema.shape,
    async (params: CancelDownloadInput) => {
      try {
        const result = await cancelDownload(params.downloadId);

        let resultText: string;
        if (result.success) {
          resultText = `## Download Cancelled

Download ID ${params.downloadId} has been cancelled.`;
        } else {
          resultText = `## Cancel Failed

**Error:** ${result.error}

The download may have already completed or been cancelled.`;
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

  // Save page as MHTML tool
  const SavePageSchema = z.object({
    tabId: z.number()
      .int()
      .optional()
      .describe("Tab ID to save. If not specified, saves the currently active tab."),
    filename: z.string()
      .optional()
      .describe("Custom filename (without extension). Defaults to page title + timestamp. Extension will be .mhtml."),
    response_format: z.nativeEnum(ResponseFormat)
      .default(ResponseFormat.MARKDOWN)
      .describe("Output format: 'markdown' (default) or 'json'")
  }).strict();

  type SavePageInput = z.infer<typeof SavePageSchema>;

  server.tool(
    "tabz_save_page",
    `Save the current browser tab as an MHTML file for offline analysis.

MHTML (MIME HTML) bundles the complete webpage into a single file:
- Full HTML content
- CSS stylesheets
- Images (embedded as base64)
- JavaScript files
- Fonts and other resources

This is useful for:
- Archiving documentation pages for offline reference
- Capturing dynamic/JS-rendered content that WebFetch can't fully get
- Preserving page state before it changes
- Saving pages that require authentication

IMPORTANT for WSL2 users: Returns BOTH paths for cross-platform compatibility:
- windowsPath: Original Windows path (e.g., "C:\\Users\\matt\\Downloads\\page.mhtml")
- wslPath: Converted WSL path (e.g., "/mnt/c/Users/matt/Downloads/page.mhtml")

Use the wslPath with Claude's Read tool to analyze the saved page.

Args:
  - tabId (optional): Tab ID to save. Defaults to active tab.
  - filename (optional): Custom filename without extension. Defaults to page title + timestamp.
  - response_format: 'markdown' (default) or 'json'

Returns:
  For JSON format:
  {
    "success": boolean,
    "filename": string,
    "windowsPath": string,
    "wslPath": string,
    "fileSize": number,
    "mimeType": "multipart/related",
    "error": string
  }

Examples:
  - Save current tab: (no args)
  - Save specific tab: tabId=123456789
  - Custom name: filename="react-docs-2024"

Workflow:
  1. tabz_save_page to save the page
  2. Use Read tool with returned wslPath to analyze the content

Note: MHTML files can only be opened in a browser from the local filesystem.
For security, browsers won't load MHTML files from web origins.`,
    SavePageSchema.shape,
    async (params: SavePageInput) => {
      try {
        const result = await savePage({
          tabId: params.tabId,
          filename: params.filename
        });

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          if (result.success && result.wslPath) {
            resultText = `## Page Saved

**File:** ${result.filename}
**Size:** ${result.fileSize ? formatBytes(result.fileSize) : 'Unknown'}
**Format:** MHTML (complete page archive)

### File Paths

**WSL Path (use with Read tool):**
\`\`\`
${result.wslPath}
\`\`\`

**Windows Path:**
\`\`\`
${result.windowsPath}
\`\`\`

To analyze the saved page, use the Read tool with the WSL path above.
The MHTML file contains the complete page content including embedded images and styles.`;
          } else {
            resultText = `## Save Failed

**Error:** ${result.error}

**Troubleshooting:**
- Ensure the tab is not a chrome:// or chrome-extension:// page
- Check that Chrome has permission to save to the Downloads folder
- Try saving a different tab`;
          }
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
