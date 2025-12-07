# Browser MCP Tools Reference

Quick reference for the browser MCP tools available to Claude Code.

## Tools Overview

| Tool | Trigger Words | Description |
|------|---------------|-------------|
| `browser_get_page_info` | "what page", "current tab", "what site", "looking at", "URL" | Get the current page's URL, title, and tab ID |
| `browser_get_console_logs` | "console logs", "errors", "warnings", "debug", "browser logs" | Retrieve console output from browser tabs |
| `browser_execute_script` | "run script", "execute", "DOM", "get element", "page data" | Execute JavaScript in the browser tab |
| `browser_screenshot` | "screenshot", "capture page", "take picture", "save screen" | Capture screenshots to local disk |
| `browser_download_image` | "download image", "save image", "get picture" | Download images from pages to local disk |
| `browser_list_tabs` | "list tabs", "what tabs", "open tabs", "show tabs" | List all open browser tabs |
| `browser_switch_tab` | "switch tab", "go to tab", "change tab" | Switch to a specific tab |
| `browser_rename_tab` | "rename tab", "name tab", "label tab" | Assign a custom name to a tab |
| `browser_click` | "click", "press button", "click element" | Click an element on the page |
| `browser_fill` | "fill", "type", "enter text", "fill form" | Fill an input field with text |
| `browser_get_element` | "inspect element", "get styles", "element info", "css debug" | Get element HTML, styles, bounds for CSS debugging/recreation |
| `browser_open_url` | "open URL", "navigate to", "open GitHub", "open localhost" | Open allowed URLs (GitHub, GitLab, Vercel, localhost) in browser tabs |

> **Note:** Most tools support a `tabId` parameter to target a specific tab. Get tab IDs from `browser_list_tabs`.

---

## browser_get_page_info

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

## browser_get_console_logs

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

## browser_execute_script

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

## browser_screenshot

**Purpose:** Capture a screenshot of the browser page and save to local disk.

**Trigger phrases:**
- "Take a screenshot of this page"
- "Capture the screen"
- "Save a picture of the page"
- "Screenshot the element"

**Parameters:**
- `selector` (optional): CSS selector for a specific element to screenshot
- `fullPage` (optional): If true, captures the entire scrollable page (default: false)
- `outputPath` (optional): Custom save path (default: ~/ai-images/screenshot-{timestamp}.png)

**Returns:**
- `success`: Whether the screenshot was captured
- `filePath`: Path to the saved screenshot (use Read tool to view)

**Examples:**
```javascript
// Capture viewport
{}

// Capture full page
{ fullPage: true }

// Capture specific element
{ selector: "#main-content" }

// Custom output path
{ outputPath: "/tmp/screenshot.png" }
```

---

## browser_download_image

**Purpose:** Download an image from the browser page and save to local disk.

**Trigger phrases:**
- "Download that image"
- "Save the image"
- "Get the picture from the page"

**Parameters:**
- `selector` (optional): CSS selector for an `<img>` element or element with background-image
- `url` (optional): Direct URL of the image to download
- `outputPath` (optional): Custom save path (default: ~/ai-images/image-{timestamp}.{ext})

**Returns:**
- `success`: Whether the image was downloaded
- `filePath`: Path to the saved image (use Read tool to view)

**Examples:**
```javascript
// Download by selector
{ selector: "img.hero-image" }

// Download by URL
{ url: "https://example.com/image.png" }

// First image on page
{ selector: "img" }
```

---

## browser_list_tabs

**Purpose:** List all open browser tabs.

**Trigger phrases:**
- "What tabs are open?"
- "List all tabs"
- "Show me the open tabs"

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
Array of tabs with:
- `tabId`: Numeric ID for use with other tools
- `url`: Full URL of the tab
- `title`: Page title (or custom name if set)
- `customName`: User-assigned name (if set via `browser_rename_tab`)
- `active`: Whether this tab is currently focused

---

## browser_switch_tab

**Purpose:** Switch to a specific browser tab.

**Trigger phrases:**
- "Switch to tab 2"
- "Go to the other tab"
- "Change to that tab"

**Parameters:**
- `tabId` (required): The numeric tab ID to switch to (from browser_list_tabs)

**Returns:**
- `success`: Whether the switch was successful

**Important:** After switching, all subsequent tool calls (screenshot, click, fill, etc.) will automatically target that tab without needing to pass `tabId`. This enables workflows like:
1. `browser_switch_tab(tabId: 2)`
2. `browser_screenshot()` ← automatically captures tab 2

---

## browser_rename_tab

**Purpose:** Assign a custom name to a browser tab.

**Trigger phrases:**
- "Rename tab 0 to My App"
- "Name this tab"
- "Label the GitHub tab"

**Parameters:**
- `tabId` (required): The tab ID to rename (from browser_list_tabs)
- `name` (required): Custom name for the tab. Empty string clears the custom name.

**Returns:**
- `success`: Whether the rename was successful

**Notes:**
- Custom names are stored by URL, so they persist even if tab order changes
- Names are session-based and reset when the MCP server restarts
- Custom names appear in `browser_list_tabs` output for easier identification
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

## browser_click

**Purpose:** Click an element on the page.

**Trigger phrases:**
- "Click the submit button"
- "Press the login button"
- "Click on that link"

**Parameters:**
- `selector` (required): CSS selector for the element to click

**Common Selectors:**
```javascript
"#submit-button"        // By ID
".btn-primary"          // By class
"button[type='submit']" // By attribute
"a.nav-link"            // By tag and class
```

**Returns:**
- `success`: Whether the click was performed

---

## browser_fill

**Purpose:** Fill an input field with text.

**Trigger phrases:**
- "Fill in the email field"
- "Type my username"
- "Enter text in the search box"

**Parameters:**
- `selector` (required): CSS selector for the input field
- `value` (required): Text to type into the field

**Common Selectors:**
```javascript
"#email"                    // By ID
"input[name='username']"    // By name attribute
"input[type='password']"    // By type
"textarea#message"          // Textarea by ID
```

**Returns:**
- `success`: Whether the fill was performed

---

## browser_get_element

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

## browser_open_url

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTENSION-BASED TOOLS                        │
│         (browser_get_page_info, browser_get_console_logs,           │
│                      browser_execute_script)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Chrome Browser (Windows)                                            │
│         ↓ console.log, etc.                                          │
│  Content Script → Background Worker → WebSocket → Backend (WSL:8129) │
│                                                          ↓           │
│                                              Browser MCP Server      │
│                                              (Windows node.exe)      │
│                                                          ↓           │
│                                                    Claude Code       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                           CDP-BASED TOOLS                            │
│    (browser_screenshot, browser_click, browser_fill, browser_*_tab, │
│              browser_download_image, browser_get_element)            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  WINDOWS:                                                            │
│  Chrome (127.0.0.1:9222) ◀─── Browser MCP Server                    │
│         ↑                      (Windows node.exe)                    │
│     CDP / WebSocket                   ↑                              │
│     (localhost only)                  │ stdio                        │
│                                       ↓                              │
│                              Claude Code (WSL2)                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Key insights:**
- Chrome binds to `127.0.0.1:9222` only (localhost - secure!)
- MCP server runs via `run-windows.sh` using Windows `node.exe`
- Windows node.exe can access `localhost:9222` directly (no port proxy needed)
- Claude Code communicates with MCP server via stdio

## Interactive Command Runner: `/ttmcp`

The `/ttmcp` slash command provides an interactive menu-driven interface to all Browser MCP tools.

**Usage:**
```bash
/ttmcp
```

**Features:**
- Interactive tool selection via `AskUserQuestion`
- Guided parameter prompts
- Real-time execution and results
- Screenshot verification
- Option to chain multiple commands

**Example Workflow:**
1. Type `/ttmcp` in Claude Code
2. Select category: "Interaction"
3. Select tool: "Fill Form Field"
4. Provide selector: "textarea"
5. Provide value: "Your text here"
6. Claude executes and shows results
7. Option to run another command

**Location:** `.claude/commands/ttmcp.md`

**Perfect for:**
- First-time users exploring MCP tools
- Complex multi-step browser automation
- Testing and debugging MCP functionality
- Controlling AI tools (Sora, DALL-E, etc.)
- Quick access without remembering exact tool names

## Requirements

1. **Chrome with remote debugging:** Use the "Chrome (Claude Debug)" desktop shortcut
2. **Backend running:** `cd backend && npm start` (in WSL2)
3. **Chrome extension loaded:** Reload at `chrome://extensions` (for console logs)

## WSL2 Setup (Quick Reference)

The project uses `run-windows.sh` which executes via Windows `node.exe`:

**Project `.mcp.json`:**
```json
{
  "mcpServers": {
    "browser": {
      "command": "/home/matt/projects/TabzChrome/browser-mcp-server/run-windows.sh",
      "args": [],
      "env": { "BACKEND_URL": "http://localhost:8129" }
    }
  }
}
```

See [WSL2_SETUP.md](WSL2_SETUP.md) for full setup instructions.

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
