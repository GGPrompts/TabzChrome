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
| `tabz_list_groups` | "list groups", "tab groups", "show groups" | List all tab groups with their tabs |
| `tabz_create_group` | "create group", "group tabs", "new group" | Create a new tab group from specified tabs |
| `tabz_update_group` | "update group", "rename group", "change group color" | Update group title, color, or collapsed state |
| `tabz_add_to_group` | "add to group", "move to group" | Add tabs to an existing group |
| `tabz_ungroup_tabs` | "ungroup tabs", "remove from group" | Remove tabs from their groups |
| `tabz_claude_group_add` | "mark tab active", "highlight tab" | Add tab to Claude Active group (auto-creates purple group) |
| `tabz_claude_group_remove` | "unmark tab", "done with tab" | Remove tab from Claude Active group |
| `tabz_claude_group_status` | "claude group status", "active tabs" | Get status of Claude Active group |
| `tabz_list_windows` | "list windows", "what windows", "show windows" | List all Chrome windows with dimensions and state |
| `tabz_create_window` | "new window", "create window", "popup window" | Create new browser window (normal or popup) |
| `tabz_update_window` | "move window", "resize window", "maximize", "minimize" | Update window position, size, or state |
| `tabz_close_window` | "close window" | Close a browser window (and all its tabs) |
| `tabz_get_displays` | "monitors", "displays", "screens", "multi-monitor" | Get display/monitor info for multi-monitor layouts |
| `tabz_tile_windows` | "tile windows", "arrange windows", "split windows" | Auto-arrange windows in grid/split layouts |
| `tabz_popout_terminal` | "popout terminal", "terminal window", "detach terminal" | Pop out sidebar terminal to standalone popup window |
| `tabz_speak` | "say", "announce", "speak", "read aloud", "TTS" | Speak text aloud using neural TTS (respects user audio settings) |
| `tabz_list_voices` | "list voices", "TTS voices", "available voices" | List available neural TTS voices |
| `tabz_play_audio` | "play sound", "play audio", "soundboard", "notification sound" | Play audio file by URL (MP3, WAV, etc.) |

> **Note:** Most tools support a `tabId` parameter to target a specific tab. Get tab IDs from `tabz_list_tabs`.

---

## tabz_get_page_info

**Purpose:** Get information about the current browser page.

**Trigger phrases:**
- [What page am I looking at?](tabz:paste?text=What%20page%20am%20I%20looking%20at%3F)
- [What's the current URL?](tabz:paste?text=What%27s%20the%20current%20URL%3F)
- [What tab is open?](tabz:paste?text=What%20tab%20is%20open%3F)
- [What site am I on?](tabz:paste?text=What%20site%20am%20I%20on%3F)

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
- [Show me the console logs](tabz:paste?text=Show%20me%20the%20console%20logs)
- [Are there any errors in the browser?](tabz:paste?text=Are%20there%20any%20errors%20in%20the%20browser%3F)
- [Check for JavaScript errors](tabz:paste?text=Check%20for%20JavaScript%20errors)
- [What's in the console?](tabz:paste?text=What%27s%20in%20the%20console%3F)
- [Debug the page](tabz:paste?text=Debug%20the%20page)

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
- [Run this script in the browser](tabz:paste?text=Run%20this%20script%20in%20the%20browser)
- [Get the page title](tabz:paste?text=Get%20the%20page%20title)
- [Click the button](tabz:paste?text=Click%20the%20button)
- [Extract data from the page](tabz:paste?text=Extract%20data%20from%20the%20page)
- [Check if element exists](tabz:paste?text=Check%20if%20element%20exists)
- [Get the DOM](tabz:paste?text=Get%20the%20DOM)

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
- [Screenshot my view](tabz:paste?text=Screenshot%20my%20view)
- [What do I see right now](tabz:paste?text=What%20do%20I%20see%20right%20now)
- [Screenshot that button](tabz:paste?text=Screenshot%20that%20button) (with selector)
- [Capture current viewport](tabz:paste?text=Capture%20current%20viewport)

**When to use `tabz_screenshot_full` instead:**
- [Screenshot this page](tabz:paste?text=Screenshot%20this%20page)
- [Capture the entire page](tabz:paste?text=Capture%20the%20entire%20page)
- [Show me the whole page](tabz:paste?text=Show%20me%20the%20whole%20page)

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
- [Screenshot this page](tabz:paste?text=Screenshot%20this%20page)
- [Capture the entire page](tabz:paste?text=Capture%20the%20entire%20page)
- [Show me the whole page](tabz:paste?text=Show%20me%20the%20whole%20page)
- [Take a full page screenshot](tabz:paste?text=Take%20a%20full%20page%20screenshot)
- First-time page exploration (recommended - avoids scroll-and-screenshot)

**When to use `tabz_screenshot` instead:**
- [Screenshot my view](tabz:paste?text=Screenshot%20my%20view)
- [What's visible right now](tabz:paste?text=What%27s%20visible%20right%20now)
- [Screenshot that button](tabz:paste?text=Screenshot%20that%20button) (with selector)

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
- [Download that image](tabz:paste?text=Download%20that%20image)
- [Save the image](tabz:paste?text=Save%20the%20image)
- [Get the picture from the page](tabz:paste?text=Get%20the%20picture%20from%20the%20page)
- [Download the AI image](tabz:paste?text=Download%20the%20AI%20image)

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
- [What tabs are open?](tabz:paste?text=What%20tabs%20are%20open%3F)
- [List all tabs](tabz:paste?text=List%20all%20tabs)
- [Show me the open tabs](tabz:paste?text=Show%20me%20the%20open%20tabs)
- [Which tab am I on?](tabz:paste?text=Which%20tab%20am%20I%20on%3F)

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
- [Switch to tab 2](tabz:paste?text=Switch%20to%20tab%202)
- [Go to the other tab](tabz:paste?text=Go%20to%20the%20other%20tab)
- [Change to that tab](tabz:paste?text=Change%20to%20that%20tab)

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
- [Rename tab 0 to My App](tabz:paste?text=Rename%20tab%200%20to%20My%20App)
- [Name this tab](tabz:paste?text=Name%20this%20tab)
- [Label the GitHub tab](tabz:paste?text=Label%20the%20GitHub%20tab)

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
- [Click the submit button](tabz:paste?text=Click%20the%20submit%20button)
- [Press the login button](tabz:paste?text=Press%20the%20login%20button)
- [Click on that link](tabz:paste?text=Click%20on%20that%20link)

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
- [Fill in the email field](tabz:paste?text=Fill%20in%20the%20email%20field)
- [Type my username](tabz:paste?text=Type%20my%20username)
- [Enter text in the search box](tabz:paste?text=Enter%20text%20in%20the%20search%20box)

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
- [Inspect that element](tabz:paste?text=Inspect%20that%20element)
- [What styles does this have?](tabz:paste?text=What%20styles%20does%20this%20have%3F)
- [Get the CSS for that card](tabz:paste?text=Get%20the%20CSS%20for%20that%20card)
- [How is this element styled?](tabz:paste?text=How%20is%20this%20element%20styled%3F)
- [I want to recreate this component](tabz:paste?text=I%20want%20to%20recreate%20this%20component)

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
- [Open GitHub repo](tabz:paste?text=Open%20GitHub%20repo)
- [Navigate to localhost](tabz:paste?text=Navigate%20to%20localhost)
- [Open my Vercel app](tabz:paste?text=Open%20my%20Vercel%20app)
- [Go to that URL](tabz:paste?text=Go%20to%20that%20URL)

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

## tabz_get_bookmark_tree

**Purpose:** Get the Chrome bookmarks hierarchy showing folders and bookmarks.

**Trigger phrases:**
- [Show my bookmarks](tabz:paste?text=Show%20my%20bookmarks)
- [What folders do I have?](tabz:paste?text=What%20folders%20do%20I%20have%3F)
- [Bookmark structure](tabz:paste?text=Bookmark%20structure)

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
- [Find my React bookmarks](tabz:paste?text=Find%20my%20React%20bookmarks)
- [Search bookmarks for GitHub](tabz:paste?text=Search%20bookmarks%20for%20GitHub)
- [Do I have this bookmarked?](tabz:paste?text=Do%20I%20have%20this%20bookmarked%3F)

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
- [Bookmark this page](tabz:paste?text=Bookmark%20this%20page)
- [Save to bookmarks](tabz:paste?text=Save%20to%20bookmarks)
- [Add to Bookmarks Bar](tabz:paste?text=Add%20to%20Bookmarks%20Bar)

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
- [Create bookmark folder](tabz:paste?text=Create%20bookmark%20folder)
- [New folder in bookmarks](tabz:paste?text=New%20folder%20in%20bookmarks)
- [Make a folder for these](tabz:paste?text=Make%20a%20folder%20for%20these)

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
- [Move this bookmark](tabz:paste?text=Move%20this%20bookmark)
- [Reorganize bookmarks](tabz:paste?text=Reorganize%20bookmarks)
- [Put bookmark in folder](tabz:paste?text=Put%20bookmark%20in%20folder)

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
- [Delete this bookmark](tabz:paste?text=Delete%20this%20bookmark)
- [Remove bookmark](tabz:paste?text=Remove%20bookmark)
- [Clean up bookmarks](tabz:paste?text=Clean%20up%20bookmarks)

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
- [Show me the DOM structure](tabz:paste?text=Show%20me%20the%20DOM%20structure)
- [What's the page hierarchy?](tabz:paste?text=What%27s%20the%20page%20hierarchy%3F)
- [Inspect the DOM tree](tabz:paste?text=Inspect%20the%20DOM%20tree)
- [Get the HTML structure](tabz:paste?text=Get%20the%20HTML%20structure)

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
- [Check page performance](tabz:paste?text=Check%20page%20performance)
- [How much memory is this using?](tabz:paste?text=How%20much%20memory%20is%20this%20using%3F)
- [Profile this page](tabz:paste?text=Profile%20this%20page)
- [Get performance metrics](tabz:paste?text=Get%20performance%20metrics)

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
- [How much code is unused?](tabz:paste?text=How%20much%20code%20is%20unused%3F)
- [Check CSS coverage](tabz:paste?text=Check%20CSS%20coverage)
- [Find unused JavaScript](tabz:paste?text=Find%20unused%20JavaScript)
- [Code coverage analysis](tabz:paste?text=Code%20coverage%20analysis)

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

## tabz_list_groups

**Purpose:** List all tab groups in the current browser window.

**Trigger phrases:**
- [Show me tab groups](tabz:paste?text=Show%20me%20tab%20groups)
- [What groups are open?](tabz:paste?text=What%20groups%20are%20open%3F)
- [List all groups](tabz:paste?text=List%20all%20groups)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `groups`: Array of tab groups with groupId, title, color, collapsed, tabCount, tabIds
- `claudeActiveGroupId`: ID of the Claude Active group (if it exists)

**Examples:**
```javascript
// List all groups
{}

// Get JSON for programmatic use
{ response_format: "json" }
```

---

## tabz_create_group

**Purpose:** Create a new tab group from specified tabs.

**Trigger phrases:**
- [Group these tabs](tabz:paste?text=Group%20these%20tabs)
- [Create a new group](tabz:paste?text=Create%20a%20new%20group)
- [Put tabs in a group](tabz:paste?text=Put%20tabs%20in%20a%20group)

**Parameters:**
- `tabIds` (required): Array of Chrome tab IDs to group
- `title` (optional): Group title (max 50 chars)
- `color` (optional): grey, blue, red, yellow, green, pink, purple, or cyan
- `collapsed` (optional): Whether to collapse the group (default: false)

**Returns:**
- `groupId`: New group's ID
- `title`, `color`, `tabCount`

**Examples:**
```javascript
// Create a research group
{ tabIds: [123, 456], title: "Research", color: "blue" }

// Quick group without title
{ tabIds: [789, 101112] }

// Create collapsed group
{ tabIds: [123], title: "Done", color: "grey", collapsed: true }
```

---

## tabz_update_group

**Purpose:** Update an existing tab group's properties.

**Trigger phrases:**
- [Rename the group](tabz:paste?text=Rename%20the%20group)
- [Change group color](tabz:paste?text=Change%20group%20color)
- [Collapse the group](tabz:paste?text=Collapse%20the%20group)

**Parameters:**
- `groupId` (required): The tab group ID to update
- `title` (optional): New title
- `color` (optional): New color
- `collapsed` (optional): true to collapse, false to expand

**Examples:**
```javascript
// Rename a group
{ groupId: 12345, title: "Work" }

// Change color to red
{ groupId: 12345, color: "red" }

// Collapse finished work
{ groupId: 12345, collapsed: true }
```

---

## tabz_add_to_group

**Purpose:** Add tabs to an existing tab group.

**Trigger phrases:**
- [Add tab to group](tabz:paste?text=Add%20tab%20to%20group)
- [Move this to the research group](tabz:paste?text=Move%20this%20to%20the%20research%20group)

**Parameters:**
- `groupId` (required): The group ID to add tabs to
- `tabIds` (required): Array of tab IDs to add

**Examples:**
```javascript
// Add one tab
{ groupId: 12345, tabIds: [789] }

// Add multiple tabs
{ groupId: 12345, tabIds: [789, 101112, 131415] }
```

---

## tabz_ungroup_tabs

**Purpose:** Remove tabs from their groups (ungroup them).

**Trigger phrases:**
- [Ungroup this tab](tabz:paste?text=Ungroup%20this%20tab)
- [Remove from group](tabz:paste?text=Remove%20from%20group)

**Parameters:**
- `tabIds` (required): Array of tab IDs to ungroup

**Returns:**
- `ungroupedCount`: Number of tabs ungrouped

**Note:** Empty groups are automatically deleted by Chrome.

**Examples:**
```javascript
// Ungroup one tab
{ tabIds: [123] }

// Ungroup multiple
{ tabIds: [123, 456, 789] }
```

---

## tabz_claude_group_add

**Purpose:** Add a tab to the "Claude Active" group. Creates the group if it doesn't exist.

This is the **recommended way to highlight tabs Claude is working with**. The Claude group has a distinctive purple color and "Claude" title.

**Trigger phrases:**
- [Mark this tab as active](tabz:paste?text=Mark%20this%20tab%20as%20active)
- [Highlight this tab](tabz:paste?text=Highlight%20this%20tab)
- [Add to Claude group](tabz:paste?text=Add%20to%20Claude%20group)

**Parameters:**
- `tabId` (required): Chrome tab ID to add

**Returns:**
- Group info with groupId, title, color, tabCount

**Example:**
```javascript
{ tabId: 123456789 }
```

**Use case:**
When Claude starts working with a browser tab (e.g., taking screenshots, clicking elements), call this tool to visually mark it. The user will see a purple "Claude" group in their tab bar.

---

## tabz_claude_group_remove

**Purpose:** Remove a tab from the "Claude Active" group.

**Trigger phrases:**
- [Done with this tab](tabz:paste?text=Done%20with%20this%20tab)
- [Unmark this tab](tabz:paste?text=Unmark%20this%20tab)
- [Remove from Claude group](tabz:paste?text=Remove%20from%20Claude%20group)

**Parameters:**
- `tabId` (required): Chrome tab ID to remove

**Example:**
```javascript
{ tabId: 123456789 }
```

**Note:** If this was the last tab in the Claude group, the group is automatically deleted.

---

## tabz_claude_group_status

**Purpose:** Get the status of the "Claude Active" group.

**Trigger phrases:**
- [What tabs am I working with?](tabz:paste?text=What%20tabs%20am%20I%20working%20with%3F)
- [Show Claude active tabs](tabz:paste?text=Show%20Claude%20active%20tabs)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `exists`: Whether the Claude group exists
- `groupId`: The group ID (if exists)
- `tabCount`: Number of tabs in the group
- `tabIds`: Array of tab IDs in the group

**Example:**
```javascript
// Check status
{}
```

---

## tabz_list_windows

**Purpose:** List all Chrome windows with their properties.

**Trigger phrases:**
- [What windows are open?](tabz:paste?text=What%20windows%20are%20open%3F)
- [List browser windows](tabz:paste?text=List%20browser%20windows)
- [Show all windows](tabz:paste?text=Show%20all%20windows)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of windows with:
  - `windowId`: Chrome window identifier
  - `focused`: Whether window is focused
  - `state`: `normal`, `minimized`, `maximized`, or `fullscreen`
  - `type`: `normal` or `popup`
  - `width`, `height`, `left`, `top`: Window dimensions and position
  - `tabCount`: Number of tabs in window

**Example:**
```javascript
{}
```

---

## tabz_create_window

**Purpose:** Create a new Chrome browser window.

**Trigger phrases:**
- [Create a new window](tabz:paste?text=Create%20a%20new%20window)
- [Open a popup window](tabz:paste?text=Open%20a%20popup%20window)
- [New browser window](tabz:paste?text=New%20browser%20window)
- [Pop out to new window](tabz:paste?text=Pop%20out%20to%20new%20window)

**Parameters:**
- `url` (optional): URL or array of URLs to open. Use `/sidepanel/sidepanel.html` for terminal popout.
- `type` (optional): `normal` (full browser UI) or `popup` (minimal UI). Default: `normal`.
- `state` (optional): `normal`, `minimized`, `maximized`, or `fullscreen`. Default: `normal`.
- `focused` (optional): Focus window on creation. Default: true.
- `width`, `height` (optional): Window dimensions in pixels.
- `left`, `top` (optional): Window position (for multi-monitor placement).
- `incognito` (optional): Create incognito window.
- `tabId` (optional): Move existing tab to new window.

**Returns:**
- `windowId`: New window's ID
- Window properties (type, state, dimensions)

**Examples:**
```javascript
// Create a popup terminal window
{ url: "/sidepanel/sidepanel.html", type: "popup", width: 500, height: 700 }

// Create window on second monitor
{ url: "https://github.com", left: 1920, top: 0, width: 800, height: 600 }
```

**Key use case:** Use `url: "/sidepanel/sidepanel.html"` with `type: "popup"` to pop out terminals to standalone windows WITHOUT duplicate extension issues - all windows share the same extension instance.

---

## tabz_update_window

**Purpose:** Update a window's properties (resize, move, change state, focus).

**Trigger phrases:**
- [Resize the window](tabz:paste?text=Resize%20the%20window)
- [Move window to...](tabz:paste?text=Move%20window%20to%E2%80%A6)
- [Maximize the window](tabz:paste?text=Maximize%20the%20window)
- [Minimize that window](tabz:paste?text=Minimize%20that%20window)
- [Bring window to front](tabz:paste?text=Bring%20window%20to%20front)

**Parameters:**
- `windowId` (required): Window ID from `tabz_list_windows`
- `state` (optional): `normal`, `minimized`, `maximized`, or `fullscreen`
- `focused` (optional): Set true to bring window to front
- `width`, `height` (optional): New dimensions (ignored if maximized/fullscreen)
- `left`, `top` (optional): New position for multi-monitor placement
- `drawAttention` (optional): Flash/highlight the window

**Examples:**
```javascript
// Maximize a window
{ windowId: 123, state: "maximized" }

// Move and resize
{ windowId: 123, width: 800, height: 600, left: 100, top: 100 }

// Focus a window
{ windowId: 123, focused: true }
```

---

## tabz_close_window

**Purpose:** Close a Chrome window.

**Trigger phrases:**
- [Close that window](tabz:paste?text=Close%20that%20window)
- [Close window 123](tabz:paste?text=Close%20window%20123)

**Parameters:**
- `windowId` (required): Window ID to close

**Warning:** This closes the entire window including ALL tabs in it!

**Example:**
```javascript
{ windowId: 123 }
```

---

## tabz_get_displays

**Purpose:** Get information about connected monitors/displays.

**Trigger phrases:**
- [What monitors do I have?](tabz:paste?text=What%20monitors%20do%20I%20have%3F)
- [Show display info](tabz:paste?text=Show%20display%20info)
- [Multi-monitor setup](tabz:paste?text=Multi-monitor%20setup)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of displays with:
  - `id`: Display identifier
  - `name`: Display name
  - `isPrimary`: Whether primary display
  - `bounds`: Full display area (`left`, `top`, `width`, `height`)
  - `workArea`: Usable area excluding taskbar

**Example:**
```javascript
{}
```

**Key insight:** Use display positions with `tabz_create_window` or `tabz_tile_windows`:
- Primary display usually starts at (0, 0)
- Second monitor might be at (1920, 0) or (-1920, 0)

---

## tabz_tile_windows

**Purpose:** Auto-arrange windows in a tiled layout.

**Trigger phrases:**
- [Tile my windows](tabz:paste?text=Tile%20my%20windows)
- [Arrange windows side by side](tabz:paste?text=Arrange%20windows%20side%20by%20side)
- [Split windows](tabz:paste?text=Split%20windows)
- [Grid layout](tabz:paste?text=Grid%20layout)

**Parameters:**
- `windowIds` (required): Array of window IDs to tile
- `layout` (optional): `horizontal` (side by side), `vertical` (stacked), or `grid` (auto). Default: `horizontal`.
- `displayId` (optional): Target display ID from `tabz_get_displays`. Default: primary.
- `gap` (optional): Pixels between windows. Default: 0.

**Examples:**
```javascript
// Side by side
{ windowIds: [123, 456], layout: "horizontal" }

// Grid layout with gaps
{ windowIds: [1, 2, 3, 4], layout: "grid", gap: 10 }

// On second monitor
{ windowIds: [123, 456], displayId: "1" }
```

**Layout examples:**
- `horizontal` (2 windows): `[Left Half] [Right Half]`
- `vertical` (2 windows): `[Top Half] / [Bottom Half]`
- `grid` (4 windows): `[1][2] / [3][4]`

---

## tabz_popout_terminal

**Purpose:** Pop out the terminal sidebar to a standalone popup window.

**Trigger phrases:**
- [Pop out the terminal](tabz:paste?text=Pop%20out%20the%20terminal)
- [Detach terminal to window](tabz:paste?text=Detach%20terminal%20to%20window)
- [Terminal in new window](tabz:paste?text=Terminal%20in%20new%20window)

**Parameters:**
- `terminalId` (optional): Focus specific terminal in new window
- `width` (optional): Window width. Default: 500.
- `height` (optional): Window height. Default: 700.
- `left`, `top` (optional): Window position

**Example:**
```javascript
// Pop out with default settings
{}

// Pop out specific terminal
{ terminalId: "ctt-default-abc123", width: 600, height: 800 }
```

**Key advantages over duplicate extensions:**
- Single WebSocket connection to backend
- No terminal session conflicts
- Shared state and settings
- Multiple terminal views in different windows

---

## tabz_speak

**Purpose:** Speak text aloud using neural text-to-speech.

**Trigger phrases:**
- [Say this out loud](tabz:paste?text=Say%20this%20out%20loud)
- [Announce...](tabz:paste?text=Announce%E2%80%A6)
- [Read this to me](tabz:paste?text=Read%20this%20to%20me)
- [Speak...](tabz:paste?text=Speak%E2%80%A6)

**Parameters:**
- `text` (required): The text to speak (max 3000 chars, markdown stripped automatically)
- `voice` (optional): TTS voice (e.g., `en-US-AriaNeural`). Uses user's configured voice if not specified.
- `rate` (optional): Speech rate (e.g., `+30%` faster, `-20%` slower)
- `pitch` (optional): Voice pitch (e.g., `+50Hz` higher, `-100Hz` lower)
- `priority` (optional): `high` interrupts current audio, `low` (default) may be skipped

**Returns:**
- Success confirmation with text preview

**Example:**
```javascript
// Simple announcement
{ text: "Build complete. Ready for next task." }

// Urgent alert with custom settings
{ text: "Error: 3 tests failed", priority: "high", pitch: "+50Hz" }

// Use specific voice
{ text: "Hello!", voice: "en-GB-SoniaNeural" }
```

**Notes:**
- Uses Microsoft Edge neural TTS (high-quality voices)
- Respects user's audio settings from TabzChrome dashboard
- Audio plays through the browser sidebar

---

## tabz_list_voices

**Purpose:** List available neural TTS voices for use with `tabz_speak`.

**Trigger phrases:**
- [What voices are available?](tabz:paste?text=What%20voices%20are%20available%3F)
- [List TTS voices](tabz:paste?text=List%20TTS%20voices)
- [Show available voices](tabz:paste?text=Show%20available%20voices)

**Parameters:** None

**Returns:**
- List of voice codes with descriptions organized by region (US, UK, AU)

**Available voices include:**
- `en-US-AndrewMultilingualNeural` - US Male, warm and confident
- `en-US-EmmaMultilingualNeural` - US Female, cheerful and clear
- `en-US-AriaNeural` - US Female, confident news-style
- `en-GB-SoniaNeural` - UK Female, friendly
- `en-GB-RyanNeural` - UK Male, friendly
- `en-AU-NatashaNeural` - AU Female, friendly

---

## tabz_play_audio

**Purpose:** Play an audio file through the browser.

**Trigger phrases:**
- [Play this sound](tabz:paste?text=Play%20this%20sound)
- [Play audio file](tabz:paste?text=Play%20audio%20file)
- [Trigger notification sound](tabz:paste?text=Trigger%20notification%20sound)
- [Soundboard](tabz:paste?text=Soundboard)

**Parameters:**
- `url` (required): URL of the audio file (MP3, WAV, OGG, etc.)
  - Local: `http://localhost:8129/sounds/ding.mp3`
  - Remote: `https://example.com/sound.mp3`
- `volume` (optional): 0.0 to 1.0. Uses user's configured volume if not specified.
- `priority` (optional): `high` interrupts current audio, `low` (default) may be skipped

**Returns:**
- Success confirmation with URL and volume info

**Example:**
```javascript
// Play local sound
{ url: "http://localhost:8129/sounds/success.mp3" }

// Play at half volume
{ url: "http://localhost:8129/sounds/notify.mp3", volume: 0.5 }

// Urgent notification
{ url: "http://localhost:8129/sounds/alert.mp3", priority: "high" }
```

**Serving audio files:**
Place audio files in `backend/public/sounds/` to serve them at `http://localhost:8129/sounds/<filename>`

**Use cases:**
- Soundboards with custom sound effects
- Notification sounds for task completion
- Alert sounds for errors or warnings
- Ambient sounds or music playback

---

## tabz_history_search

**Purpose:** Search browsing history by keyword and date range.

**Trigger phrases:**
- [Search my history](tabz:paste?text=Search%20my%20history)
- [Find pages I visited](tabz:paste?text=Find%20pages%20I%20visited)
- [History search](tabz:paste?text=History%20search)

**Parameters:**
- `query` (required): Search text - matches titles and URLs
- `startTime` (optional): Start of date range (ms since epoch or ISO string)
- `endTime` (optional): End of date range (ms since epoch or ISO string)
- `maxResults` (optional): Max results (1-1000, default: 100)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of history entries with URL, title, visit count, last visit time

**Examples:**
```javascript
// Search by keyword
{ query: "github" }

// Last week's visits
{ query: "react", startTime: Date.now() - 7*24*60*60*1000 }
```

---

## tabz_history_visits

**Purpose:** Get detailed visit information for a specific URL.

**Trigger phrases:**
- [When did I visit this URL?](tabz:paste?text=When%20did%20I%20visit%20this%20URL%3F)
- [History visits for URL](tabz:paste?text=History%20visits%20for%20URL)

**Parameters:**
- `url` (required): The URL to get visit details for
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of visits with timestamp, transition type (link, typed, reload, etc.)

---

## tabz_history_recent

**Purpose:** Get the most recent N history entries.

**Trigger phrases:**
- [Show recent history](tabz:paste?text=Show%20recent%20history)
- [What did I browse?](tabz:paste?text=What%20did%20I%20browse%3F)
- [Recent pages](tabz:paste?text=Recent%20pages)

**Parameters:**
- `maxResults` (optional): Number of entries (1-1000, default: 50)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of recent history entries sorted by most recent visit

---

## tabz_history_delete_url

**Purpose:** Remove a specific URL from browsing history.

**Trigger phrases:**
- [Delete this from history](tabz:paste?text=Delete%20this%20from%20history)
- [Remove URL from history](tabz:paste?text=Remove%20URL%20from%20history)

**Parameters:**
- `url` (required): The URL to delete from history

**Returns:**
- Confirmation of deletion

**Note:** This permanently removes the URL and all associated visits.

---

## tabz_history_delete_range

**Purpose:** Remove all history entries within a date range.

**Trigger phrases:**
- [Clear history for this week](tabz:paste?text=Clear%20history%20for%20this%20week)
- [Delete history range](tabz:paste?text=Delete%20history%20range)

**Parameters:**
- `startTime` (required): Start of range (ms since epoch or ISO string)
- `endTime` (required): End of range (ms since epoch or ISO string)

**Returns:**
- Confirmation of deletion

**Warning:** This permanently deletes all history in the specified range.

---

## tabz_sessions_recently_closed

**Purpose:** List recently closed tabs and windows (up to 25).

**Trigger phrases:**
- [Show recently closed tabs](tabz:paste?text=Show%20recently%20closed%20tabs)
- [What did I close?](tabz:paste?text=What%20did%20I%20close%3F)
- [Closed tabs](tabz:paste?text=Closed%20tabs)

**Parameters:**
- `maxResults` (optional): Number of entries (1-25, default: 25)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of closed sessions with sessionId, lastModified, type (tab/window)
- For tabs: URL, title, favIconUrl
- For windows: List of tabs that were in the window

**Note:** Use the `sessionId` with `tabz_sessions_restore` to reopen.

---

## tabz_sessions_restore

**Purpose:** Restore a closed tab or window by sessionId.

**Trigger phrases:**
- [Restore that tab](tabz:paste?text=Restore%20that%20tab)
- [Reopen closed tab](tabz:paste?text=Reopen%20closed%20tab)

**Parameters:**
- `sessionId` (required): Session ID from `tabz_sessions_recently_closed`

**Returns:**
- The restored tab or window information

---

## tabz_sessions_devices

**Purpose:** List tabs open on other synced Chrome devices.

**Trigger phrases:**
- [Show tabs from my phone](tabz:paste?text=Show%20tabs%20from%20my%20phone)
- [Other device tabs](tabz:paste?text=Other%20device%20tabs)
- [Synced devices](tabz:paste?text=Synced%20devices)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of devices with:
  - `deviceName`: Device name
  - `sessions`: Windows/tabs open on that device

**Note:** Requires Chrome sync to be enabled and logged in on multiple devices.

---

## tabz_cookies_get

**Purpose:** Get a specific cookie by name and URL.

**Trigger phrases:**
- [Get cookie value](tabz:paste?text=Get%20cookie%20value)
- [Check session cookie](tabz:paste?text=Check%20session%20cookie)

**Parameters:**
- `url` (required): URL the cookie is associated with
- `name` (required): Name of the cookie
- `storeId` (optional): Cookie store ID (for different profiles)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Cookie details: name, value, domain, path, expiration, httpOnly, secure, sameSite

---

## tabz_cookies_list

**Purpose:** List cookies for a domain with optional filters.

**Trigger phrases:**
- [Show cookies for this site](tabz:paste?text=Show%20cookies%20for%20this%20site)
- [List all cookies](tabz:paste?text=List%20all%20cookies)

**Parameters:**
- `domain` (optional): Filter by domain
- `url` (optional): Filter by URL
- `name` (optional): Filter by cookie name pattern
- `session` (optional): `true` for session-only, `false` for persistent-only
- `secure` (optional): `true` for secure-only, `false` for non-secure only
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of matching cookies with full details

---

## tabz_cookies_set

**Purpose:** Create or update a cookie.

**Trigger phrases:**
- [Set cookie](tabz:paste?text=Set%20cookie)
- [Create auth cookie](tabz:paste?text=Create%20auth%20cookie)

**Parameters:**
- `url` (required): URL to associate cookie with
- `name` (required): Cookie name
- `value` (required): Cookie value
- `domain` (optional): Cookie domain
- `path` (optional): Cookie path (default: "/")
- `secure` (optional): HTTPS only (default: true for https URLs)
- `httpOnly` (optional): Not accessible via JavaScript
- `sameSite` (optional): `strict`, `lax`, or `no_restriction`
- `expirationDate` (optional): Unix timestamp for expiration

**Returns:**
- The created/updated cookie

---

## tabz_cookies_delete

**Purpose:** Remove a specific cookie.

**Trigger phrases:**
- [Delete cookie](tabz:paste?text=Delete%20cookie)
- [Remove auth cookie](tabz:paste?text=Remove%20auth%20cookie)

**Parameters:**
- `url` (required): URL the cookie is associated with
- `name` (required): Name of the cookie to delete

**Returns:**
- Confirmation of deletion

---

## tabz_cookies_audit

**Purpose:** Analyze cookies for a page, identifying trackers and first/third-party cookies.

**Trigger phrases:**
- [Audit cookies](tabz:paste?text=Audit%20cookies)
- [Find tracking cookies](tabz:paste?text=Find%20tracking%20cookies)
- [Cookie analysis](tabz:paste?text=Cookie%20analysis)

**Parameters:**
- `url` (optional): URL to audit (defaults to active tab)
- `tabId` (optional): Target tab ID
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Summary: total, first-party, third-party, trackers counts
- Categorized cookies with tracker identification
- Known tracker domains flagged

**Use cases:**
- Privacy auditing
- Debug authentication issues
- Understand cookie landscape before testing

---

## tabz_emulate_device

**Purpose:** Emulate a mobile or tablet viewport with device presets.

**Trigger phrases:**
- [Test on iPhone](tabz:paste?text=Test%20on%20iPhone)
- [Mobile view](tabz:paste?text=Mobile%20view)
- [Emulate tablet](tabz:paste?text=Emulate%20tablet)

**Parameters:**
- `preset` (optional): Device preset name:
  - `iPhone 14 Pro`, `iPhone 14 Pro Max`, `iPhone SE`
  - `Pixel 7`, `Pixel 7 Pro`, `Samsung Galaxy S23`
  - `iPad`, `iPad Pro 12.9`, `iPad Mini`
  - `Surface Pro`, `Kindle Fire HDX`
- `width` (optional): Custom viewport width (if no preset)
- `height` (optional): Custom viewport height (if no preset)
- `deviceScaleFactor` (optional): DPR (default: 2 for mobile, 1 for desktop)
- `mobile` (optional): Enable mobile mode (default: true for mobile presets)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied viewport settings

**Examples:**
```javascript
// Use preset
{ preset: "iPhone 14 Pro" }

// Custom dimensions
{ width: 375, height: 812, mobile: true, deviceScaleFactor: 3 }
```

---

## tabz_emulate_clear

**Purpose:** Clear all emulation overrides and reset to normal browser state.

**Trigger phrases:**
- [Clear emulation](tabz:paste?text=Clear%20emulation)
- [Reset viewport](tabz:paste?text=Reset%20viewport)
- [Stop emulating](tabz:paste?text=Stop%20emulating)

**Parameters:**
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation that all emulation was cleared

---

## tabz_emulate_geolocation

**Purpose:** Spoof the browser's geolocation.

**Trigger phrases:**
- [Set location to Paris](tabz:paste?text=Set%20location%20to%20Paris)
- [Fake GPS](tabz:paste?text=Fake%20GPS)
- [Spoof location](tabz:paste?text=Spoof%20location)

**Parameters:**
- `latitude` (required): Latitude coordinate
- `longitude` (required): Longitude coordinate
- `accuracy` (optional): Accuracy in meters (default: 100)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with coordinates set

**Examples:**
```javascript
// Paris
{ latitude: 48.8566, longitude: 2.3522 }

// New York
{ latitude: 40.7128, longitude: -74.0060 }
```

---

## tabz_emulate_network

**Purpose:** Throttle network speed to simulate different connection types.

**Trigger phrases:**
- [Test on slow 3G](tabz:paste?text=Test%20on%20slow%203G)
- [Simulate offline](tabz:paste?text=Simulate%20offline)
- [Throttle network](tabz:paste?text=Throttle%20network)

**Parameters:**
- `preset` (optional): Network preset:
  - `offline` - No connection
  - `GPRS` - 50 Kbps
  - `Slow 3G` - 500 Kbps
  - `Fast 3G` - 1.5 Mbps
  - `4G` - 4 Mbps
  - `WiFi` - 30 Mbps
- `downloadThroughput` (optional): Download speed in bytes/sec (if no preset)
- `uploadThroughput` (optional): Upload speed in bytes/sec
- `latency` (optional): Additional latency in ms
- `offline` (optional): Simulate offline (true/false)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied network conditions

**Examples:**
```javascript
// Use preset
{ preset: "Slow 3G" }

// Go offline
{ offline: true }

// Custom throttle
{ downloadThroughput: 100000, latency: 200 }
```

---

## tabz_emulate_media

**Purpose:** Set media type and features for CSS testing.

**Trigger phrases:**
- [Print preview](tabz:paste?text=Print%20preview)
- [Test dark mode preference](tabz:paste?text=Test%20dark%20mode%20preference)
- [Force light mode](tabz:paste?text=Force%20light%20mode)

**Parameters:**
- `type` (optional): Media type: `screen` or `print`
- `colorScheme` (optional): `light` or `dark` preference
- `reducedMotion` (optional): `reduce` or `no-preference`
- `forcedColors` (optional): `active` or `none`
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied media settings

**Examples:**
```javascript
// Print preview mode
{ type: "print" }

// Force dark mode preference
{ colorScheme: "dark" }

// Reduce motion
{ reducedMotion: "reduce" }
```

---

## tabz_emulate_vision

**Purpose:** Simulate vision deficiencies for accessibility testing.

**Trigger phrases:**
- [Test for colorblindness](tabz:paste?text=Test%20for%20colorblindness)
- [Simulate deuteranopia](tabz:paste?text=Simulate%20deuteranopia)
- [Vision accessibility test](tabz:paste?text=Vision%20accessibility%20test)

**Parameters:**
- `type` (required): Vision deficiency type:
  - `none` - Clear emulation
  - `blurredVision` - Blurred vision
  - `protanopia` - Red-blind
  - `deuteranopia` - Green-blind (most common)
  - `tritanopia` - Blue-blind
  - `achromatopsia` - Total color blindness
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied vision emulation

**Use cases:**
- Accessibility testing for color contrast
- Ensure UI works for colorblind users
- WCAG compliance testing

---

## tabz_notification_show

**Purpose:** Display a Chrome desktop notification.

**Trigger phrases:**
- [Show notification](tabz:paste?text=Show%20notification)
- [Alert me when done](tabz:paste?text=Alert%20me%20when%20done)
- [Desktop notification](tabz:paste?text=Desktop%20notification)

**Parameters:**
- `title` (required): Notification title (max 100 chars)
- `message` (required): Notification body (max 500 chars)
- `type` (optional): `basic` (default), `image`, `list`, or `progress`
- `iconUrl` (optional): Custom icon URL (uses extension icon if omitted)
- `imageUrl` (optional): Image URL for `image` type
- `items` (optional): List items for `list` type: `[{title, message}, ...]`
- `progress` (optional): 0-100 for `progress` type
- `buttons` (optional): Up to 2 buttons: `[{title, iconUrl?}, ...]`
- `priority` (optional): -2 (lowest) to 2 (highest), default 0
- `notificationId` (optional): Custom ID for updates (auto-generated if omitted)
- `requireInteraction` (optional): Keep visible until dismissed (default: false)

**Returns:**
- `notificationId`: ID for updating or clearing this notification

**Examples:**
```javascript
// Basic notification
{ title: "Build Complete", message: "Ready for testing" }

// Progress notification
{ type: "progress", title: "Downloading", message: "file.zip", progress: 45 }

// With buttons
{ title: "Deploy?", message: "Ready to deploy", buttons: [{title: "Yes"}, {title: "No"}] }
```

**Note:** Button clicks display but are not yet connected to callback actions.

---

## tabz_notification_update

**Purpose:** Update an existing notification.

**Trigger phrases:**
- [Update notification](tabz:paste?text=Update%20notification)
- [Change progress](tabz:paste?text=Change%20progress)

**Parameters:**
- `notificationId` (required): ID from `tabz_notification_show`
- `title` (optional): New title
- `message` (optional): New message
- `progress` (optional): New progress (0-100)
- `type` (optional): Change type (e.g., `basic` to remove progress bar when done)

**Returns:**
- `wasUpdated`: Whether notification existed and was updated

**Example workflow:**
```javascript
// 1. Create progress notification
{ type: "progress", title: "Processing", message: "Step 1", progress: 0 }

// 2. Update progress
{ notificationId: "...", progress: 50, message: "Step 2" }

// 3. Mark complete
{ notificationId: "...", type: "basic", title: "Done!", message: "Finished" }
```

---

## tabz_notification_progress

**Purpose:** Show or update a progress notification (convenience wrapper).

**Trigger phrases:**
- [Show progress](tabz:paste?text=Show%20progress)
- [Update progress bar](tabz:paste?text=Update%20progress%20bar)

**Parameters:**
- `title` (required): Notification title
- `message` (required): Status message
- `progress` (required): 0-100 percentage
- `notificationId` (optional): ID for updates (creates new if omitted)

**Returns:**
- `notificationId`: ID for further updates

---

## tabz_notification_clear

**Purpose:** Dismiss a notification.

**Trigger phrases:**
- [Clear notification](tabz:paste?text=Clear%20notification)
- [Dismiss alert](tabz:paste?text=Dismiss%20alert)

**Parameters:**
- `notificationId` (required): ID from `tabz_notification_show`

**Returns:**
- `wasCleared`: Whether notification existed and was cleared

---

## tabz_notification_list

**Purpose:** Get all active notifications.

**Trigger phrases:**
- [List notifications](tabz:paste?text=List%20notifications)
- [Active notifications](tabz:paste?text=Active%20notifications)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Count and list of active notification IDs with their type, title, and message

---

## tabz_list_plugins

**Purpose:** List installed Claude Code plugins with their status.

**Trigger phrases:**
- [List plugins](tabz:paste?text=List%20plugins)
- [Show installed plugins](tabz:paste?text=Show%20installed%20plugins)
- [What plugins are enabled?](tabz:paste?text=What%20plugins%20are%20enabled%3F)

**Parameters:**
- `marketplace` (optional): Filter by marketplace name (e.g., "my-plugins")
- `enabled` (optional): Filter by enabled status (true/false)

**Returns:**
- Plugins grouped by marketplace with enabled status, version, and components

---

## tabz_list_skills

**Purpose:** List available skills from enabled plugins.

**Trigger phrases:**
- [List skills](tabz:paste?text=List%20skills)
- [What skills are available?](tabz:paste?text=What%20skills%20are%20available%3F)
- [Find browser skills](tabz:paste?text=Find%20browser%20skills)

**Parameters:**
- `plugin` (optional): Filter by plugin name (e.g., "conductor")
- `search` (optional): Search skills by name/description

**Returns:**
- Skills with ID, name, description, and source plugin

---

## tabz_get_skill

**Purpose:** Get full details and SKILL.md content for a specific skill.

**Trigger phrases:**
- [Show skill details](tabz:paste?text=Show%20skill%20details)
- [Get conductor:brainstorm skill](tabz:paste?text=Get%20conductor%3Abrainstorm%20skill)

**Parameters:**
- `skillId` (required): Skill ID in format "/pluginName:skillName"

**Returns:**
- Skill metadata and full SKILL.md content

---

## tabz_plugins_health

**Purpose:** Check plugin health: outdated versions, cache size, marketplace status.

**Trigger phrases:**
- [Check plugin health](tabz:paste?text=Check%20plugin%20health)
- [Are any plugins outdated?](tabz:paste?text=Are%20any%20plugins%20outdated%3F)

**Parameters:** None

**Returns:**
- List of outdated plugins, cache size, and marketplace connectivity

---

## tabz_toggle_plugin

**Purpose:** Enable or disable a Claude Code plugin.

**Trigger phrases:**
- [Disable plugin](tabz:paste?text=Disable%20plugin)
- [Enable conductor plugin](tabz:paste?text=Enable%20conductor%20plugin)

**Parameters:**
- `pluginId` (required): Plugin ID in format "pluginName@marketplace"
- `enabled` (required): true to enable, false to disable

**Returns:**
- Success/failure with message to run /restart

---

## Architecture

All 76 MCP tools use **Chrome Extension APIs** exclusively (no CDP required since v1.2.0).

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTENSION-BASED ARCHITECTURE                     │
│   All 71 tools: tabs, screenshots, clicks, network, windows, etc.    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Chrome Browser                                                      │
│         │                                                            │
│         ↓ Chrome Extension APIs                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  TabzChrome Extension (Background Worker)                    │    │
│  │  - chrome.tabs, chrome.scripting, chrome.tabGroups           │    │
│  │  - chrome.downloads, chrome.bookmarks, chrome.debugger       │    │
│  │  - chrome.webRequest, chrome.windows, chrome.system.display  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ WebSocket                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Backend (localhost:8129)                                    │    │
│  │  - Routes browser requests to extension                      │    │
│  │  - Terminal management (tmux sessions)                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ HTTP                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tabz MCP Server (stdio)                                     │    │
│  │  - Tools call backend directly (no client layer)             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                           │
│                          ↓ stdio                                     │
│                    Claude Code                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**
- All tools use Chrome Extension APIs - no `--remote-debugging-port` flag needed
- MCP server runs via `run-wsl.sh` (WSL2) or `run.sh` (native)
- Tools call backend directly (client layer removed in v1.2.19)
- Extension provides accurate active tab detection

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

## Extension API Reference

All 71 tools use **Chrome Extension APIs** - no CDP or `--remote-debugging-port=9222` flag required.

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
| `tabz_save_page` | ✅ Required | chrome.pageCapture API |
| `tabz_get_bookmark_tree` | ✅ Required | Chrome bookmarks API |
| `tabz_search_bookmarks` | ✅ Required | Chrome bookmarks API |
| `tabz_save_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_create_folder` | ✅ Required | Chrome bookmarks API |
| `tabz_move_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_delete_bookmark` | ✅ Required | Chrome bookmarks API |
| `tabz_get_dom_tree` | ✅ Required | chrome.debugger API |
| `tabz_profile_performance` | ✅ Required | chrome.debugger API |
| `tabz_get_coverage` | ✅ Required | chrome.debugger API |
| `tabz_list_groups` | ✅ Required | chrome.tabGroups API |
| `tabz_create_group` | ✅ Required | chrome.tabs.group + tabGroups |
| `tabz_update_group` | ✅ Required | chrome.tabGroups.update |
| `tabz_add_to_group` | ✅ Required | chrome.tabs.group |
| `tabz_ungroup_tabs` | ✅ Required | chrome.tabs.ungroup |
| `tabz_claude_group_add` | ✅ Required | chrome.tabs.group + tabGroups |
| `tabz_claude_group_remove` | ✅ Required | chrome.tabs.ungroup |
| `tabz_claude_group_status` | ✅ Required | chrome.tabGroups API |
| `tabz_list_windows` | ✅ Required | chrome.windows API |
| `tabz_create_window` | ✅ Required | chrome.windows.create |
| `tabz_update_window` | ✅ Required | chrome.windows.update |
| `tabz_close_window` | ✅ Required | chrome.windows.remove |
| `tabz_get_displays` | ✅ Required | chrome.system.display API |
| `tabz_tile_windows` | ✅ Required | chrome.windows + system.display |
| `tabz_popout_terminal` | ✅ Required | chrome.windows.create |
| `tabz_speak` | ✅ Required | edge-tts via backend |
| `tabz_list_voices` | ✅ Required | edge-tts via backend |
| `tabz_play_audio` | ✅ Required | Audio API via backend |
| `tabz_history_search` | ✅ Required | chrome.history API |
| `tabz_history_visits` | ✅ Required | chrome.history API |
| `tabz_history_recent` | ✅ Required | chrome.history API |
| `tabz_history_delete_url` | ✅ Required | chrome.history API |
| `tabz_history_delete_range` | ✅ Required | chrome.history API |
| `tabz_sessions_recently_closed` | ✅ Required | chrome.sessions API |
| `tabz_sessions_restore` | ✅ Required | chrome.sessions API |
| `tabz_sessions_devices` | ✅ Required | chrome.sessions API |
| `tabz_cookies_get` | ✅ Required | chrome.cookies API |
| `tabz_cookies_list` | ✅ Required | chrome.cookies API |
| `tabz_cookies_set` | ✅ Required | chrome.cookies API |
| `tabz_cookies_delete` | ✅ Required | chrome.cookies API |
| `tabz_cookies_audit` | ✅ Required | chrome.cookies API |
| `tabz_emulate_device` | ✅ Required | chrome.debugger (CDP) |
| `tabz_emulate_clear` | ✅ Required | chrome.debugger (CDP) |
| `tabz_emulate_geolocation` | ✅ Required | chrome.debugger (CDP) |
| `tabz_emulate_network` | ✅ Required | chrome.debugger (CDP) |
| `tabz_emulate_media` | ✅ Required | chrome.debugger (CDP) |
| `tabz_emulate_vision` | ✅ Required | chrome.debugger (CDP) |
| `tabz_notification_show` | ✅ Required | chrome.notifications API |
| `tabz_notification_update` | ✅ Required | chrome.notifications API |
| `tabz_notification_progress` | ✅ Required | chrome.notifications API |
| `tabz_notification_clear` | ✅ Required | chrome.notifications API |
| `tabz_notification_list` | ✅ Required | chrome.notifications API |

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
| "Cannot connect to backend" | Start backend: `cd backend && npm start` |
| "No logs captured" | Open Chrome tabs and interact with pages |
| "Request timed out" | Check Chrome is open with extension installed |
| Tools not showing | Restart Claude Code after updating `.mcp.json` |
| "No active page found" | Open a webpage (not chrome:// pages) |
| "Element not found" | Check selector matches an element on the page |
| Screenshots wrong location | Fixed! Paths auto-convert to WSL format (`/mnt/c/...`) |

### Quick Diagnostics

```bash
# Check backend is running
curl http://localhost:8129/api/health

# Check extension is connected (look for WebSocket clients)
curl http://localhost:8129/api/health | grep -o '"wsClients":[0-9]*'

# List MCP tools available
mcp-cli tools tabz
```
