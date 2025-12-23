# Tabz MCP Tools Reference

Quick reference for the browser MCP tools available to Claude Code.

## Tools Overview

| Tool | Trigger Words | Description |
|------|---------------|-------------|
| `tabz_get_page_info` | "what page", "current tab", "what site", "looking at", "URL" | Get the current page's URL, title, and tab ID |
| `tabz_get_console_logs` | "console logs", "errors", "warnings", "debug", "browser logs" | Retrieve console output from browser tabs |
| `tabz_execute_script` | "run script", "execute", "DOM", "get element", "page data" | Execute JavaScript in the browser tab |
| `tabz_screenshot` | "screenshot my view", "what I see", "current viewport" | Capture viewport screenshot (what's visible) |
| `tabz_screenshot_full` | "screenshot this page", "full page", "entire page", "whole page" | Capture entire scrollable page in one image |
| `tabz_download_image` | "download image", "save image", "get picture" | Download images from pages to local disk |
| `tabz_list_tabs` | "list tabs", "what tabs", "open tabs", "show tabs" | List all open browser tabs |
| `tabz_switch_tab` | "switch tab", "go to tab", "change tab" | Switch to a specific tab |
| `tabz_rename_tab` | "rename tab", "name tab", "label tab" | Assign a custom name to a tab |
| `tabz_click` | "click", "press button", "click element" | Click an element on the page |
| `tabz_fill` | "fill", "type", "enter text", "fill form" | Fill an input field with text |
| `tabz_get_element` | "inspect element", "get styles", "element info", "css debug" | Get element HTML, styles, bounds for CSS debugging/recreation |
| `tabz_open_url` | "open URL", "navigate to", "open GitHub", "open localhost" | Open allowed URLs (GitHub, GitLab, Vercel, localhost) in browser tabs |
| `tabz_enable_network_capture` | "enable network", "start capture", "monitor requests" | Start capturing network requests (XHR, fetch, etc.) |
| `tabz_get_network_requests` | "network requests", "API calls", "what requests" | List captured network requests with filtering |
| `tabz_clear_network_requests` | "clear network", "reset requests" | Clear all captured network requests |
| `tabz_download_file` | "download file", "download URL", "save file" | Download any URL to disk (returns Windows + WSL paths) |
| `tabz_get_downloads` | "list downloads", "download status", "recent downloads" | List recent downloads with status and progress |
| `tabz_cancel_download` | "cancel download", "stop download" | Cancel an in-progress download |
| `tabz_save_page` | "save page", "archive page", "save as MHTML" | Save complete page as MHTML (HTML + CSS + images bundled) |
| `tabz_get_bookmark_tree` | "show bookmarks", "bookmark folders", "bookmark hierarchy" | Get bookmark folder structure |
| `tabz_search_bookmarks` | "find bookmark", "search bookmarks" | Find bookmarks by title or URL |
| `tabz_save_bookmark` | "save bookmark", "add bookmark", "bookmark this" | Save URL to bookmarks |
| `tabz_create_folder` | "create folder", "new bookmark folder" | Create bookmark folder |
| `tabz_move_bookmark` | "move bookmark", "organize bookmarks" | Move bookmark to different folder |
| `tabz_delete_bookmark` | "delete bookmark", "remove bookmark" | Delete bookmark or folder |
| `tabz_get_dom_tree` | "DOM tree", "page structure", "inspect DOM" | Get full DOM tree via chrome.debugger |
| `tabz_profile_performance` | "performance metrics", "page speed", "memory usage" | Profile timing, memory, and DOM metrics |
| `tabz_get_coverage` | "code coverage", "unused CSS", "unused JavaScript" | Get JS/CSS code coverage analysis |

> **Note:** Most tools support a `tabId` parameter to target a specific tab. Get tab IDs from `tabz_list_tabs`.

---

## tabz_get_page_info

**Purpose:** Get information about the current browser page.

**Trigger phrases:**
- "What page am I looking at?"
- "What's the current URL?"
- "What tab is open?"
- "What site am I on?"

**Parameters:**
- `tabId` (optional): Specific tab ID to query. Defaults to active tab.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `url`: Full URL of the page
- `title`: Page title
- `tabId`: Chrome tab identifier
- `favIconUrl`: Favicon URL

---

## tabz_get_console_logs

**Purpose:** Get console output (log, warn, error, info, debug) from browser tabs.

**Trigger phrases:**
- "Show me the console logs"
- "Are there any errors in the browser?"
- "Check for JavaScript errors"
- "What's in the console?"
- "Debug the page"

**Parameters:**
- `level`: Filter by level - `all`, `log`, `info`, `warn`, `error`, `debug`
- `limit`: Max entries to return (1-1000, default: 100)
- `since`: Only logs after this timestamp (ms since epoch)
- `tabId`: Filter by specific tab ID
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of console entries with timestamp, level, message, source URL
- Stack traces for errors

---

## tabz_execute_script

**Purpose:** Execute JavaScript code in the browser tab.

**Trigger phrases:**
- "Run this script in the browser"
- "Get the page title"
- "Click the button"
- "Extract data from the page"
- "Check if element exists"
- "Get the DOM"

**Parameters:**
- `code` (required): JavaScript code to execute
- `tabId` (optional): Target tab ID. Defaults to active tab.
- `allFrames` (optional): Run in all iframes too (default: false)

**Returns:**
- `success`: boolean
- `result`: Return value of the script
- `error`: Error message if failed

**Common Examples:**
```javascript
// Get page title
document.title

// Get all links
[...document.links].map(a => a.href)

// Check if logged in
!!document.querySelector('.user-avatar')

// Get form value
document.querySelector('input#email').value

// Click a button
document.querySelector('button.submit').click()

// Get localStorage
JSON.stringify(localStorage)
```

---

## tabz_screenshot

**Purpose:** Capture a screenshot of the current viewport (what's visible on screen).

**When to use:**
- "Screenshot my view"
- "What do I see right now"
- "Screenshot that button" (with selector)
- "Capture current viewport"

**When to use `tabz_screenshot_full` instead:**
- "Screenshot this page"
- "Capture the entire page"
- "Show me the whole page"

**Parameters:**
- `selector` (optional): CSS selector for a specific element to screenshot
- `outputPath` (optional): Custom save path (default: ~/ai-images/screenshot-{timestamp}.png)
- `tabId` (optional): Target a specific tab by Chrome tab ID (from `tabz_list_tabs`). Enables parallel operations.

**Returns:**
- `success`: Whether the screenshot was captured
- `filePath`: Path to the saved screenshot (use Read tool to view)

**Examples:**
```javascript
// Capture viewport (what's visible)
{}

// Capture specific element
{ selector: "#main-content" }

// Screenshot a background tab without switching
{ tabId: 1762559892 }

// Custom output path
{ outputPath: "/tmp/screenshot.png" }
```

---

## tabz_screenshot_full

**Purpose:** Capture the entire scrollable page in one image.

**When to use:**
- "Screenshot this page"
- "Capture the entire page"
- "Show me the whole page"
- "Take a full page screenshot"
- First-time page exploration (recommended - avoids scroll-and-screenshot)

**When to use `tabz_screenshot` instead:**
- "Screenshot my view"
- "What's visible right now"
- "Screenshot that button" (with selector)

**Parameters:**
- `outputPath` (optional): Custom save path (default: ~/ai-images/screenshot-{timestamp}.png)
- `tabId` (optional): Target a specific tab by Chrome tab ID (from `tabz_list_tabs`). Enables parallel operations.

**Returns:**
- `success`: Whether the screenshot was captured
- `filePath`: Path to the saved screenshot (use Read tool to view)

**Examples:**
```javascript
// Capture full scrollable page
{}

// Full page screenshot of a background tab
{ tabId: 1762559892 }

// Custom output path
{ outputPath: "/tmp/fullpage.png" }
```

**Note:** This is the recommended tool when exploring a webpage for the first time, as it captures all content without needing to scroll and take multiple screenshots.

---

## tabz_download_image

**Purpose:** Download an image from the browser page and save to local disk. Works with AI-generated images from ChatGPT, Copilot, DALL-E, and similar tools.

**Trigger phrases:**
- "Download that image"
- "Save the image"
- "Get the picture from the page"
- "Download the AI image"

**Parameters:**
- `selector` (optional): CSS selector for an `<img>` element or element with background-image
- `url` (optional): Direct URL of the image to download
- `outputPath` (optional): Custom save path (default: ~/ai-images/image-{timestamp}.{ext})

**Returns:**
- `success`: Whether the image was downloaded
- `filePath`: Path to the saved image (use Read tool to view)

**AI Image Support:**
The tool automatically extracts full image URLs (including auth tokens) from AI platforms:
- **ChatGPT**: Uses `oaiusercontent.com` CDN URLs
- **Copilot/DALL-E**: Similar CDN-based URLs
- Works by extracting the `src` attribute from the page, preserving auth tokens

**Examples:**
```javascript
// Download by selector
{ selector: "img.hero-image" }

// Download by URL
{ url: "https://example.com/image.png" }

// First image on page (may match avatars - use specific selectors)
{ selector: "img" }

// ChatGPT AI-generated images (recommended)
{ selector: "img[src*='oaiusercontent.com']" }

// Any AI image by CDN pattern
{ selector: "img[src*='cdn']" }
```

**Tips for AI platforms:**
- Use `tabz_execute_script` to inspect image elements first if unsure of selectors
- ChatGPT library page: `img[src*='oaiusercontent.com']` targets generated images
- Avoid `selector: "img"` alone - it often matches profile avatars first

---

## tabz_list_tabs

**Purpose:** List all open browser tabs with **accurate active tab detection**.

**Trigger phrases:**
- "What tabs are open?"
- "List all tabs"
- "Show me the open tabs"
- "Which tab am I on?"

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns (JSON format):**
```json
{
  "total": 3,
  "claudeCurrentTabId": 1762556601,
  "tabs": [
    {
      "tabId": 1762556600,
      "url": "https://github.com/...",
      "title": "GitHub - ...",
      "active": false
    },
    {
      "tabId": 1762556601,
      "url": "https://example.com",
      "title": "Example",
      "active": true    // ← USER'S ACTUAL FOCUSED TAB
    }
  ]
}
```

**Key fields:**
- `tabId`: Chrome's internal tab ID (large number like `1762556601`) - use this for `tabz_switch_tab`
- `active`: **THE USER'S ACTUAL FOCUSED TAB** - true on whichever tab they have selected in Chrome
- `claudeCurrentTabId`: Which tab Claude is currently targeting for operations (screenshots, clicks, etc.)
- `customName`: User-assigned name (if set via `tabz_rename_tab`)

**Understanding the two "active" concepts:**
1. `active: true` = The tab the USER has focused in Chrome right now
2. `claudeCurrentTabId` = The tab CLAUDE will target for operations

These are synced automatically: when you call `tabz_list_tabs`, Claude's target is updated to match the user's active tab.

**Active Tab Detection:**
Unlike CDP-only solutions, this tool uses the Chrome Extension API to detect the **real** focused tab. If you manually click a different tab in Chrome, Claude will know immediately.

**Markdown output shows:** `← CURRENT` marker indicates Claude's target tab (which matches user's active tab after listing).

---

## tabz_switch_tab

**Purpose:** Switch to a specific browser tab.

**Trigger phrases:**
- "Switch to tab 2"
- "Go to the other tab"
- "Change to that tab"

**Parameters:**
- `tabId` (required): The Chrome tab ID to switch to (from tabz_list_tabs)

**Returns:**
- `success`: Whether the switch was successful

**Important:** After switching, all subsequent tool calls (screenshot, click, fill, etc.) will automatically target that tab without needing to pass `tabId`. This enables workflows like:
1. `tabz_switch_tab(tabId: 123456789)`
2. `tabz_screenshot()` ← automatically captures that tab

**Note:** Tab IDs are real Chrome tab IDs (not simple indices). Get them from `tabz_list_tabs`.

---

## tabz_rename_tab

**Purpose:** Assign a custom name to a browser tab.

**Trigger phrases:**
- "Rename tab 0 to My App"
- "Name this tab"
- "Label the GitHub tab"

**Parameters:**
- `tabId` (required): The tab ID to rename (from tabz_list_tabs)
- `name` (required): Custom name for the tab. Empty string clears the custom name.

**Returns:**
- `success`: Whether the rename was successful

**Notes:**
- Custom names are stored by URL, so they persist even if tab order changes
- Names are session-based and reset when the MCP server restarts
- Custom names appear in `tabz_list_tabs` output for easier identification
- Does NOT change Chrome's visual tab bar (only affects MCP tool output)

**Examples:**
```javascript
// Name a tab
{ tabId: 0, name: "GitHub Trending" }

// Name dev server
{ tabId: 1, name: "My App (localhost)" }

// Clear custom name
{ tabId: 0, name: "" }
```

---

## tabz_click

**Purpose:** Click an element on the page.

**Trigger phrases:**
- "Click the submit button"
- "Press the login button"
- "Click on that link"

**Parameters:**
- `selector` (required): CSS selector for the element to click
- `tabId` (optional): Target a specific tab by Chrome tab ID (from `tabz_list_tabs`). Enables parallel operations.

**Common Selectors:**
```javascript
"#submit-button"        // By ID
".btn-primary"          // By class
"button[type='submit']" // By attribute
"a.nav-link"            // By tag and class
```

**Examples:**
```javascript
// Click on current tab
{ selector: "button.submit" }

// Click on a background tab without switching
{ selector: "#generate-btn", tabId: 1762559892 }
```

**Returns:**
- `success`: Whether the click was performed

---

## tabz_fill

**Purpose:** Fill an input field with text.

**Trigger phrases:**
- "Fill in the email field"
- "Type my username"
- "Enter text in the search box"

**Parameters:**
- `selector` (required): CSS selector for the input field
- `value` (required): Text to type into the field
- `tabId` (optional): Target a specific tab by Chrome tab ID (from `tabz_list_tabs`). Enables parallel operations.

**Common Selectors:**
```javascript
"#email"                    // By ID
"input[name='username']"    // By name attribute
"input[type='password']"    // By type
"textarea#message"          // Textarea by ID
```

**Examples:**
```javascript
// Fill on current tab
{ selector: "#prompt", value: "a cat astronaut" }

// Fill on a background tab (parallel image generation!)
{ selector: "#prompt", value: "a dog wizard", tabId: 1762559892 }
```

**Returns:**
- `success`: Whether the fill was performed

---

## tabz_get_element

**Purpose:** Get detailed information about a DOM element for CSS debugging or recreation.

**Trigger phrases:**
- "Inspect that element"
- "What styles does this have?"
- "Get the CSS for that card"
- "How is this element styled?"
- "I want to recreate this component"

**Parameters:**
- `selector` (required): CSS selector for the element
- `includeStyles` (optional): Include computed CSS styles (default: true)
- `styleProperties` (optional): Specific CSS properties to extract
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `tagName`: Element tag (div, button, etc.)
- `attributes`: All HTML attributes (class, id, data-*, etc.)
- `bounds`: Position and dimensions (x, y, width, height)
- `styles`: Computed CSS styles grouped by category
- `outerHTML`: Complete HTML including the element
- `html`: Inner HTML content
- `innerText`: Text content (first 500 chars)
- `parentSelector`: Selector hint for parent element
- `childCount`: Number of child elements

**Default Style Categories:**
- **Layout:** display, position, width, height, overflow
- **Spacing:** margin, padding
- **Flexbox:** flex-direction, justify-content, align-items, gap
- **Grid:** grid-template-columns, grid-template-rows
- **Typography:** font-family, font-size, font-weight, color
- **Background:** background-color, background-image
- **Border:** border, border-radius
- **Effects:** box-shadow, opacity, transform, transition

**Examples:**
```javascript
// Inspect a card component
{ selector: ".card" }

// Get button styles
{ selector: "button.primary" }

// Check header layout
{ selector: "#main-header" }

// Just HTML, no styles
{ selector: ".modal", includeStyles: false }

// Specific properties only
{ selector: ".nav", styleProperties: ["display", "flexDirection", "gap"] }
```

**Use Cases:**
- **Debug CSS issues:** Compare expected vs actual computed styles
- **Recreate elements:** Get all HTML + CSS needed to rebuild in another project
- **Understand layout:** See flexbox/grid properties and dimensions
- **Extract design tokens:** Get colors, fonts, spacing from existing components

---

## tabz_open_url

**Purpose:** Open a URL in the browser (supports allowed domains only).

**Trigger phrases:**
- "Open GitHub repo"
- "Navigate to localhost"
- "Open my Vercel app"
- "Go to that URL"

**Parameters:**
- `url` (required): URL to open (must be from allowed domains)
- `newTab` (optional, default: true): Open in new tab or replace current tab
- `background` (optional, default: false): Open in background or foreground

**Allowed Domains:**

| Category | Domains |
|----------|---------|
| Code hosting | github.com, gitlab.com, bitbucket.org |
| Local dev | localhost, 127.0.0.1 (any port) |
| Deployments | *.vercel.app, *.netlify.app, *.railway.app, *.onrender.com, *.pages.dev, *.fly.dev |
| Dev docs | developer.mozilla.org, devdocs.io, docs.github.com, stackoverflow.com, *.stackexchange.com |
| Packages | npmjs.com, pypi.org, crates.io, pkg.go.dev |
| Playgrounds | codepen.io, jsfiddle.net |
| AI Image | bing.com/images/create, chatgpt.com, ideogram.ai, leonardo.ai, tensor.art, playground.com, lexica.art |
| AI Chat | claude.ai, perplexity.ai, deepseek.com, phind.com, you.com, gemini.google.com, copilot.microsoft.com |
| AI/ML | huggingface.co, replicate.com, openrouter.ai |
| Design | figma.com, dribbble.com, unsplash.com, iconify.design |

**Returns:**
- `success`: Whether the URL was opened
- `url`: The normalized URL that was opened

**Examples:**
```javascript
// Open GitHub repo
{ url: "github.com/user/repo" }

// Open in background tab
{ url: "github.com/user/repo/pull/123", newTab: true, background: true }

// Open localhost dev server
{ url: "localhost:3000" }

// Open Vercel app
{ url: "my-app-abc123.vercel.app" }

// Replace current tab
{ url: "gitlab.com/project", newTab: false }
```

**Use Cases:**
- Navigate to documentation while coding
- Open pull requests/issues during git operations
- Test deployed apps on Vercel
- Quick access to development servers
- Automated browser navigation for AI tool interaction (e.g., Sora, DALL-E)

**Security:**
Only whitelisted domains can be opened to prevent abuse. Cannot open arbitrary websites, file:// URLs, or chrome:// pages.

---

## tabz_enable_network_capture

**Purpose:** Enable network request monitoring for the current browser tab.

**Trigger phrases:**
- "Start capturing network requests"
- "Enable network monitoring"
- "Monitor API calls"
- "Watch network traffic"

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
- "Show network requests"
- "What API calls were made?"
- "Find failed requests"
- "Show all XHR requests"

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
- "Clear network requests"
- "Reset captured requests"
- "Start fresh with network monitoring"

**Parameters:**
None

**Returns:**
Confirmation that requests were cleared.

**Note:** Network capture remains active after clearing. New requests will continue to be captured.

---

## tabz_download_file

**Purpose:** Download any URL to disk using Chrome's downloads API.

**Trigger phrases:**
- "Download this file"
- "Download URL to disk"
- "Save file from URL"

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
- "List downloads"
- "Show download status"
- "What files downloaded?"

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
- "Cancel download"
- "Stop downloading"

**Parameters:**
- `downloadId` (required): Download ID from `tabz_get_downloads`

**Returns:**
Confirmation of cancellation.

---

## tabz_save_page

**Purpose:** Save the current browser page as an MHTML file for offline analysis.

**Trigger phrases:**
- "Save this page"
- "Archive this documentation"
- "Save page for offline"
- "Capture page as MHTML"

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

## tabz_get_bookmark_tree

**Purpose:** Get the Chrome bookmarks hierarchy showing folders and bookmarks.

**Trigger phrases:**
- "Show my bookmarks"
- "What folders do I have?"
- "Bookmark structure"

**Parameters:**
- `folderId` (optional): Get children of specific folder. Omit for full tree.
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
- `maxDepth` (optional): Maximum depth to traverse (1-10, default: 3)
- `response_format`: `markdown` (default) or `json`

**Returns:**
Tree structure with:
- `id`: Bookmark/folder ID (use with other bookmark tools)
- `title`: Display name
- `url`: URL (only for bookmarks, not folders)
- `children`: Nested items (for folders)

**Examples:**
```javascript
// Full tree
{}

// Bookmarks Bar only
{ folderId: "1" }

// Shallow view (immediate children only)
{ maxDepth: 1 }
```

---

## tabz_search_bookmarks

**Purpose:** Search Chrome bookmarks by title or URL.

**Trigger phrases:**
- "Find my React bookmarks"
- "Search bookmarks for GitHub"
- "Do I have this bookmarked?"

**Parameters:**
- `query` (required): Search text - matches titles and URLs
- `limit` (optional): Max results (1-100, default: 20)
- `response_format`: `markdown` (default) or `json`

**Returns:**
List of matching bookmarks with ID, title, URL, and parent folder ID.

**Examples:**
```javascript
// Find by topic
{ query: "react" }

// Find by domain
{ query: "github.com" }

// Limit results
{ query: "docs", limit: 5 }
```

---

## tabz_save_bookmark

**Purpose:** Save a URL as a Chrome bookmark.

**Trigger phrases:**
- "Bookmark this page"
- "Save to bookmarks"
- "Add to Bookmarks Bar"

**Parameters:**
- `url` (required): URL to bookmark
- `title` (required): Bookmark title
- `parentId` (optional): Folder ID. Default: `"1"` (Bookmarks Bar)
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
  - Or use a folder ID from `tabz_get_bookmark_tree`
- `index` (optional): Position in folder (0 = first). Omit for end.

**Returns:**
The created bookmark with its ID.

**Examples:**
```javascript
// Save to Bookmarks Bar
{ url: "https://github.com/user/repo", title: "My Repo" }

// Save to Other Bookmarks
{ url: "https://example.com", title: "Example", parentId: "2" }

// Save to custom folder
{ url: "https://react.dev", title: "React Docs", parentId: "123" }
```

---

## tabz_create_folder

**Purpose:** Create a new bookmark folder.

**Trigger phrases:**
- "Create bookmark folder"
- "New folder in bookmarks"
- "Make a folder for these"

**Parameters:**
- `title` (required): Folder name
- `parentId` (optional): Parent folder ID. Default: `"1"` (Bookmarks Bar)
- `index` (optional): Position in parent (0 = first). Omit for end.

**Returns:**
The created folder with its ID. Use this ID as `parentId` in `tabz_save_bookmark`.

**Examples:**
```javascript
// Create in Bookmarks Bar
{ title: "Work Projects" }

// Create in Other Bookmarks
{ title: "Archive", parentId: "2" }

// Create nested folder
{ title: "React", parentId: "456" }
```

---

## tabz_move_bookmark

**Purpose:** Move a bookmark or folder to a different location.

**Trigger phrases:**
- "Move this bookmark"
- "Reorganize bookmarks"
- "Put bookmark in folder"

**Parameters:**
- `id` (required): Bookmark or folder ID to move
- `parentId` (required): Destination folder ID
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
- `index` (optional): Position in destination (0 = first). Omit for end.

**Returns:**
The moved bookmark with updated location.

**Examples:**
```javascript
// Move to Bookmarks Bar
{ id: "123", parentId: "1" }

// Move to specific folder
{ id: "123", parentId: "456" }

// Move to first position
{ id: "123", parentId: "1", index: 0 }
```

**Note:** Cannot move the Bookmarks Bar or Other Bookmarks folders themselves.

---

## tabz_delete_bookmark

**Purpose:** Delete a bookmark or folder.

**Trigger phrases:**
- "Delete this bookmark"
- "Remove bookmark"
- "Clean up bookmarks"

**Parameters:**
- `id` (required): Bookmark or folder ID to delete

**Returns:**
Confirmation of deletion.

**⚠️ Warning:** Deleting a folder will also delete ALL bookmarks inside it!

**Examples:**
```javascript
// Delete single bookmark
{ id: "123" }

// Delete folder (and all contents!)
{ id: "456" }
```

**Note:** Cannot delete the Bookmarks Bar or Other Bookmarks folders.

---

## tabz_get_dom_tree

**Purpose:** Get the full DOM tree structure of the current page using Chrome DevTools Protocol.

**Trigger phrases:**
- "Show me the DOM structure"
- "What's the page hierarchy?"
- "Inspect the DOM tree"
- "Get the HTML structure"

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `maxDepth` (optional): Maximum depth to traverse (1-10, default: 4). Higher values = more detail.
- `selector` (optional): CSS selector to focus on a specific subtree.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `tree`: Simplified DOM tree with tag names, IDs, and classes
- `nodeCount`: Total nodes in returned tree
- Child counts shown for truncated branches

**Examples:**
```javascript
// Full document (shallow)
{ maxDepth: 2 }

// Navigation only
{ selector: "nav" }

// Deep inspection of main content
{ maxDepth: 8, selector: "main" }

// Specific component
{ selector: "#app", maxDepth: 5 }
```

**Note:** The user will see a "debugging" banner in Chrome while this runs. The debugger automatically detaches after operation completes.

**Use cases:**
- Understand page structure for web scraping
- Debug complex layouts
- Find element hierarchies for automation
- Analyze shadow DOM content

---

## tabz_profile_performance

**Purpose:** Profile the current page's performance metrics using Chrome DevTools Protocol.

**Trigger phrases:**
- "Check page performance"
- "How much memory is this using?"
- "Profile this page"
- "Get performance metrics"

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- **Timing metrics (ms):** TaskDuration, ScriptDuration, LayoutDuration, etc.
- **Memory metrics (MB):** JSHeapUsedSize, JSHeapTotalSize, etc.
- **DOM metrics:** Nodes, Documents, Frames, LayoutCount
- **Other metrics:** Process-level stats

**Examples:**
```javascript
// Profile current tab
{}

// Profile specific tab
{ tabId: 1762559892 }

// JSON for programmatic analysis
{ response_format: "json" }
```

**Note:** The user will see a "debugging" banner in Chrome while metrics are collected.

**Key metrics to watch:**
- **TaskDuration** - High values indicate slow JavaScript
- **JSHeapUsedSize** - Memory usage, watch for leaks
- **Nodes** - DOM size, large numbers slow rendering
- **LayoutCount** - Frequent layouts cause jank

**Use cases:**
- Diagnose slow pages
- Identify memory leaks
- Monitor DOM bloat
- Performance optimization

---

## tabz_get_coverage

**Purpose:** Analyze JavaScript and/or CSS code coverage to find unused code.

**Trigger phrases:**
- "How much code is unused?"
- "Check CSS coverage"
- "Find unused JavaScript"
- "Code coverage analysis"

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `type` (optional): `'js'` (JavaScript only), `'css'` (CSS only), or `'both'` (default)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- **Per-file coverage:** URL, used bytes, total bytes, usage percentage
- **Summary:** Total files, bytes used/total, overall percentage
- Files sorted by total size (largest first)

**Examples:**
```javascript
// Full audit (JS + CSS)
{}

// JavaScript only
{ type: "js" }

// CSS only
{ type: "css" }

// JSON for analysis
{ type: "both", response_format: "json" }
```

**Note:** Coverage reflects code used since page load. Interact with the page for fuller coverage data.

**Interpreting results:**
- **Low usage %** = Opportunity for code splitting
- **Large unused files** = Consider lazy loading
- **CSS < 50%** = May have dead CSS rules

**Use cases:**
- Find code splitting opportunities
- Identify dead CSS
- Measure bundle efficiency
- Optimize page load time

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   EXTENSION-BASED TOOLS (Preferred)                  │
│   tabz_list_tabs, tabz_switch_tab - ACCURATE active tab detection    │
│   tabz_get_console_logs, tabz_download_file, tabz_get_downloads      │
│   tabz_cancel_download, tabz_download_image (hybrid)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Chrome Browser (Windows)                                            │
│         ↓ chrome.tabs API (knows REAL focused tab)                   │
│  Background Worker → WebSocket → Backend (WSL:8129)                  │
│                                          ↓                           │
│                              Tabz MCP Server (Windows node.exe)      │
│                                          ↓                           │
│                                    Claude Code (WSL2)                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      CDP-BASED TOOLS (Fallback)                      │
│  tabz_screenshot, tabz_screenshot_full, tabz_click, tabz_fill,       │
│  tabz_get_element, tabz_enable_network_capture, tabz_get_page_info   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Chrome (127.0.0.1:9222) ◀─── Tabz MCP Server (Windows node.exe)     │
│         ↑                              ↑                             │
│     CDP / WebSocket                    │ stdio                       │
│     (localhost only)                   ↓                             │
│                              Claude Code (WSL2)                      │
│                                                                      │
│  ⚠️ CDP cannot detect which tab user has focused - only extension can │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**
- Chrome binds to `127.0.0.1:9222` only (localhost - secure!)
- MCP server runs via `run-wsl.sh` (WSL2) or `run.sh` (native) using appropriate node
- Windows node.exe can access `localhost:9222` directly (no port proxy needed)
- Claude Code communicates with MCP server via stdio

## Claude Skill: `tabz-mcp`

Install the `tabz-mcp` skill for guided browser automation. The skill **dynamically discovers available tools** - never goes stale when tools are added.

**Location:** `~/.claude/skills/tabz-mcp/`

**How it works:**
- Dynamically lists tools via `mcp-cli tools tabz`
- Looks up schemas via `mcp-cli info tabz/<tool>`
- Provides workflow patterns for common tasks
- Includes selector tips and debugging guidance

**Usage:** Just ask naturally:
- "Take a screenshot of this page"
- "Click the submit button"
- "Fill the email field with test@example.com"
- "Capture network requests while I browse"

**Perfect for:**
- First-time users exploring MCP tools
- Complex multi-step browser automation
- Testing and debugging MCP functionality
- Controlling AI tools (Sora, DALL-E, etc.)

## Extension vs CDP Dependencies

All tools use **Chrome Extension APIs** - no CDP or `--remote-debugging-port=9222` flag required.

| Tool | Needs Extension? | Implementation |
|------|-----------------|----------------|
| `tabz_list_tabs` | ✅ Required | chrome.tabs API |
| `tabz_switch_tab` | ✅ Required | chrome.tabs API |
| `tabz_rename_tab` | ✅ Required | In-memory + chrome.tabs |
| `tabz_get_page_info` | ✅ Required | chrome.tabs API |
| `tabz_click` | ✅ Required | chrome.scripting.executeScript |
| `tabz_fill` | ✅ Required | chrome.scripting.executeScript |
| `tabz_screenshot` | ✅ Required | chrome.tabs.captureVisibleTab |
| `tabz_screenshot_full` | ✅ Required | Content script scroll + stitch |
| `tabz_download_image` | ✅ Required | chrome.scripting + downloads API |
| `tabz_get_element` | ✅ Required | chrome.scripting.executeScript |
| `tabz_open_url` | ✅ Required | chrome.tabs API |
| `tabz_execute_script` | ✅ Required | chrome.scripting.executeScript |
| `tabz_get_console_logs` | ✅ Required | Extension captures logs |
| `tabz_enable_network_capture` | ✅ Required | chrome.webRequest API |
| `tabz_get_network_requests` | ✅ Required | chrome.webRequest API |
| `tabz_clear_network_requests` | ✅ Required | chrome.webRequest API |
| `tabz_download_file` | ✅ Required | Chrome downloads API |
| `tabz_get_downloads` | ✅ Required | Chrome downloads API |
| `tabz_cancel_download` | ✅ Required | Chrome downloads API |
| `tabz_get_bookmark_tree` | ✅ Required | Chrome bookmarks API |
| `tabz_search_bookmarks` | ✅ Required | Chrome bookmarks API |
| `tabz_save_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_create_folder` | ✅ Required | Chrome bookmarks API |
| `tabz_move_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_delete_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_get_dom_tree` | ✅ Required | chrome.debugger API |
| `tabz_profile_performance` | ✅ Required | chrome.debugger API |
| `tabz_get_coverage` | ✅ Required | chrome.debugger API |

**Summary:**
- **All tools use Chrome Extension APIs** - no CDP required
- No need for `--remote-debugging-port=9222` flag
- Extension provides accurate active tab detection

## Requirements

1. **Backend running:** `cd backend && npm start`
2. **Chrome extension loaded:** At `chrome://extensions`

## Platform Setup (Quick Reference)

| Platform | Script | Notes |
|----------|--------|-------|
| WSL2 | `run-wsl.sh` | Backend in WSL, Chrome on Windows |
| Native Linux/macOS | `run.sh` | Uses native node |
| Auto-detect | `run-auto.sh` | Recommended - detects platform |

**Project `.mcp.json`:**
```json
{
  "mcpServers": {
    "browser": {
      "command": "/path/to/TabzChrome/tabz-mcp-server/run-auto.sh",
      "args": [],
      "env": { "BACKEND_URL": "http://localhost:8129" }
    }
  }
}
```

See [WSL2_SETUP.md](WSL2_SETUP.md) for full platform-specific setup instructions.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "CDP not available" | Use Chrome Debug shortcut, verify with `curl.exe http://localhost:9222/json/version` |
| "Cannot connect to backend" | Start backend: `cd backend && npm start` |
| "No logs captured" | Open Chrome tabs and interact with pages |
| "Request timed out" | Check Chrome is open with extension installed |
| Tools not showing | Restart Claude Code after updating `.mcp.json` |
| "No active page found" | Open a webpage (not chrome:// pages) |
| "Element not found" | Check selector matches an element on the page |
| Screenshots wrong location | Fixed! Paths auto-convert to WSL format (`/mnt/c/...`) |
| Browser window shrinking | Fixed - was caused by broken CDP connection |

### Quick Diagnostics

```bash
# Check Chrome CDP is available
powershell.exe -Command "curl.exe http://localhost:9222/json/version"

# Check what process owns port 9222 (should be chrome.exe)
powershell.exe -Command "Get-NetTCPConnection -LocalPort 9222 -State Listen | ForEach-Object { Get-Process -Id \$_.OwningProcess }"
```
