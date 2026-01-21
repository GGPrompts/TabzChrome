# Core & Interaction Tools

Essential tools for tab management, page interaction, and screenshots.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

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
