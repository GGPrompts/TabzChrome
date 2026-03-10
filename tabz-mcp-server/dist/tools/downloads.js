/**
 * Download Tools
 *
 * Tools for downloading files via Chrome's download API
 * Returns both Windows and WSL paths for cross-platform compatibility
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat } from "../types.js";
import { formatBytes } from "../utils.js";
/**
 * Download a file using Chrome's download API
 */
async function downloadFile(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/download-file`, {
            url: options.url,
            filename: options.filename,
            conflictAction: options.conflictAction || 'uniquify'
        }, { timeout: 65000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to download file");
    }
}
/**
 * Get list of recent downloads
 */
async function getDownloads(options) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/downloads`, {
            params: {
                state: options.state,
                limit: options.limit
            },
            timeout: 10000
        });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to get downloads");
    }
}
/**
 * Cancel an in-progress download
 */
async function cancelDownload(downloadId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cancel-download`, { downloadId }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to cancel download");
    }
}
/**
 * Save current page to a file
 */
async function savePage(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/save-page`, {
            tabId: options.tabId,
            filename: options.filename
        }, { timeout: 30000 });
        return response.data;
    }
    catch (error) {
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
// Input schema for tabz_cancel_download
const CancelDownloadSchema = z.object({
    downloadId: z.number()
        .int()
        .describe("The download ID to cancel (from tabz_get_downloads)")
}).strict();
/**
 * Format download progress
 */
function formatProgress(bytesReceived, totalBytes) {
    if (totalBytes <= 0)
        return formatBytes(bytesReceived);
    const percent = Math.round((bytesReceived / totalBytes) * 100);
    return `${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)} (${percent}%)`;
}
/**
 * Format a download item for markdown display
 */
function formatDownloadMarkdown(download, index) {
    const lines = [];
    const stateEmoji = download.state === 'complete' ? '✅' :
        download.state === 'in_progress' ? '⏳' : '❌';
    lines.push(`### ${index + 1}. ${stateEmoji} ${download.filename}`);
    lines.push(`- **State:** ${download.state}`);
    if (download.state === 'in_progress') {
        lines.push(`- **Progress:** ${formatProgress(download.bytesReceived, download.totalBytes)}`);
    }
    else if (download.totalBytes > 0) {
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
export function registerDownloadTools(server) {
    // Download file tool
    server.tool("tabz_download_file", `Download a file via Chrome's download manager. Returns both Windows and WSL paths.

Args: url (required), filename (optional), conflictAction (optional: uniquify/overwrite/prompt)`, DownloadFileSchema.shape, async (params) => {
        try {
            const result = await downloadFile({
                url: params.url,
                filename: params.filename,
                conflictAction: params.conflictAction
            });
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
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
                }
                else {
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
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Get downloads list tool
    server.tool("tabz_get_downloads", `List recent Chrome downloads with status, size, and file paths.

Args: limit (optional, default 20), state (optional: in_progress/complete/interrupted/all)`, GetDownloadsSchema.shape, async (params) => {
        try {
            const result = await getDownloads({
                limit: params.limit,
                state: params.state
            });
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
                lines.push(`# Chrome Downloads`);
                lines.push("");
                if (params.state !== 'all') {
                    lines.push(`**Filter:** ${params.state}`);
                }
                lines.push(`**Total:** ${result.total} download(s)`);
                lines.push("");
                if (result.downloads.length === 0) {
                    lines.push("No downloads found matching the criteria.");
                }
                else {
                    for (let i = 0; i < result.downloads.length; i++) {
                        lines.push(...formatDownloadMarkdown(result.downloads[i], i));
                    }
                }
                resultText = lines.join("\n");
            }
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Cancel download tool
    server.tool("tabz_cancel_download", `Cancel an in-progress download. Get IDs from tabz_get_downloads.

Args: downloadId (required)`, CancelDownloadSchema.shape, async (params) => {
        try {
            const result = await cancelDownload(params.downloadId);
            let resultText;
            if (result.success) {
                resultText = `## Download Cancelled

Download ID ${params.downloadId} has been cancelled.`;
            }
            else {
                resultText = `## Cancel Failed

**Error:** ${result.error}

The download may have already completed or been cancelled.`;
            }
            return {
                content: [{ type: "text", text: resultText }],
                isError: !result.success
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
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
    server.tool("tabz_save_page", `Save current tab as MHTML file (complete page archive with CSS/images/JS). Returns both Windows and WSL paths.

Args: tabId (optional), filename (optional, no extension), response_format (optional)`, SavePageSchema.shape, async (params) => {
        try {
            const result = await savePage({
                tabId: params.tabId,
                filename: params.filename
            });
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
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
                }
                else {
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
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=downloads.js.map