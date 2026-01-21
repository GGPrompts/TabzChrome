# Network & Downloads

Tools for network monitoring and file downloads.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

---

## tabz_enable_network_capture

**Purpose:** Enable network request monitoring for the current browser tab.

**Trigger phrases:**
- [Start capturing network requests](tabz:paste?text=Start%20capturing%20network%20requests)
- [Enable network monitoring](tabz:paste?text=Enable%20network%20monitoring)
- [Monitor API calls](tabz:paste?text=Monitor%20API%20calls)
- [Watch network traffic](tabz:paste?text=Watch%20network%20traffic)

**Parameters:**
- `tabId` (optional): Specific tab ID to enable capture for. Defaults to current tab.

**Returns:**
- `success`: Whether capture was enabled
- `error`: Error message if failed

**Important:** You must call this **before** navigating to pages you want to monitor. Requests are captured in real-time after enabling.

**Examples:**
```javascript
// Enable for current tab
{}

// Enable for specific tab
{ tabId: 2 }
```

---

## tabz_get_network_requests

**Purpose:** List captured network requests (XHR, fetch, etc.) from browser pages.

**Trigger phrases:**
- [Show network requests](tabz:paste?text=Show%20network%20requests)
- [What API calls were made?](tabz:paste?text=What%20API%20calls%20were%20made%3F)
- [Find failed requests](tabz:paste?text=Find%20failed%20requests)
- [Show all XHR requests](tabz:paste?text=Show%20all%20XHR%20requests)

**Parameters:**
- `urlPattern` (optional): Filter by URL pattern (regex or substring). Examples: `"api/"`, `"\\.json$"`, `"graphql"`
- `method`: Filter by HTTP method - `all`, `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`
- `statusMin` (optional): Minimum status code (e.g., 400 for errors only)
- `statusMax` (optional): Maximum status code (e.g., 299 for successful only)
- `resourceType`: Filter by type - `all`, `XHR`, `Fetch`, `Document`, `Script`, `Stylesheet`, `Image`, `Font`, `Other`
- `limit`: Max requests to return (1-200, default: 50)
- `offset`: Skip N requests for pagination (default: 0)
- `tabId` (optional): Filter by specific browser tab ID
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `requests`: Array of captured requests with URL, method, status, timing, etc.
- `total`: Total matching requests
- `hasMore`: Whether more requests are available
- `captureActive`: Whether network capture is currently enabled

**Examples:**
```javascript
// All requests
{}

// API calls only
{ urlPattern: "api/" }

// Find errors
{ statusMin: 400 }

// POST requests
{ method: "POST" }

// GraphQL requests
{ urlPattern: "graphql", method: "POST" }

// Successful only
{ statusMin: 200, statusMax: 299 }
```

---

## tabz_clear_network_requests

**Purpose:** Clear all captured network requests.

**Trigger phrases:**
- [Clear network requests](tabz:paste?text=Clear%20network%20requests)
- [Reset captured requests](tabz:paste?text=Reset%20captured%20requests)
- [Start fresh with network monitoring](tabz:paste?text=Start%20fresh%20with%20network%20monitoring)

**Parameters:**
None

**Returns:**
Confirmation that requests were cleared.

**Note:** Network capture remains active after clearing. New requests will continue to be captured.

---

## tabz_download_file

**Purpose:** Download any URL to disk using Chrome's downloads API.

**Trigger phrases:**
- [Download this file](tabz:paste?text=Download%20this%20file)
- [Download URL to disk](tabz:paste?text=Download%20URL%20to%20disk)
- [Save file from URL](tabz:paste?text=Save%20file%20from%20URL)

**Parameters:**
- `url` (required): URL of the file to download
- `filename` (optional): Custom filename (relative to Chrome's Downloads folder)
- `conflictAction` (optional): Action when file exists - "uniquify" (default), "overwrite", or "prompt"
- `response_format` (optional): "markdown" (default) or "json"

**Returns:**
Both Windows and WSL paths for cross-platform compatibility:
```json
{
  "success": true,
  "windowsPath": "C:\\Users\\matt\\Downloads\\image.png",
  "wslPath": "/mnt/c/Users/matt/Downloads/image.png",
  "filename": "image.png",
  "fileSize": 12345
}
```

**Use cases:**
- Download AI-generated images from DALL-E, Midjourney, Sora
- Save PDFs and documents
- Download any file Claude needs to work with

---

## tabz_get_downloads

**Purpose:** List recent downloads with status and progress.

**Trigger phrases:**
- [List downloads](tabz:paste?text=List%20downloads)
- [Show download status](tabz:paste?text=Show%20download%20status)
- [What files downloaded?](tabz:paste?text=What%20files%20downloaded%3F)

**Parameters:**
- `limit` (optional): Max results (1-100, default: 20)
- `state` (optional): Filter by state - "in_progress", "complete", "interrupted", or "all" (default)
- `response_format` (optional): "markdown" (default) or "json"

**Returns:**
List of downloads with ID, filename, status, size, and paths.

---

## tabz_cancel_download

**Purpose:** Cancel an in-progress download.

**Trigger phrases:**
- [Cancel download](tabz:paste?text=Cancel%20download)
- [Stop downloading](tabz:paste?text=Stop%20downloading)

**Parameters:**
- `downloadId` (required): Download ID from `tabz_get_downloads`

**Returns:**
Confirmation of cancellation.

---

## tabz_save_page

**Purpose:** Save the current browser page as an MHTML file for offline analysis.

**Trigger phrases:**
- [Save this page](tabz:paste?text=Save%20this%20page)
- [Archive this documentation](tabz:paste?text=Archive%20this%20documentation)
- [Save page for offline](tabz:paste?text=Save%20page%20for%20offline)
- [Capture page as MHTML](tabz:paste?text=Capture%20page%20as%20MHTML)

**Parameters:**
- `tabId` (optional): Tab ID to save. Defaults to active tab.
- `filename` (optional): Custom filename without extension. Defaults to page title + timestamp.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `filename`: Name of saved file
- `windowsPath`: Full Windows path to saved file
- `wslPath`: WSL-compatible path (use with Read tool)
- `fileSize`: File size in bytes
- `mimeType`: `multipart/related` (MHTML format)

**What is MHTML?**
MHTML (MIME HTML) bundles the complete webpage into a single file:
- Full HTML content
- CSS stylesheets (embedded)
- Images (embedded as base64)
- JavaScript files
- Fonts and other resources

**Use cases:**
- Archive documentation for offline reference
- Capture dynamic/JS-rendered content that WebFetch can't fully get
- Preserve page state before it changes
- Save pages that require authentication

**Workflow:**
```
1. tabz_save_page → saves page, returns paths
2. Read tool with wslPath → analyze the MHTML content
```

**Limitations:**
- Cannot capture `chrome://` or `chrome-extension://` pages
- MHTML files can only be opened in a browser from the local filesystem

---
