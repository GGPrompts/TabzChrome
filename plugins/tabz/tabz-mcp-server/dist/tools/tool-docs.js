/**
 * Tool Documentation
 *
 * Detailed documentation for all tabz MCP tools, served by the tabz_docs tool.
 * This contains the full parameter constraints, behavioral limits, magic IDs,
 * security notes, error recovery, examples, and cross-references that were
 * trimmed from tool descriptions to reduce context size.
 */
export const TOOL_DOCS = {
    // ============================================================
    // AUDIO TOOLS
    // ============================================================
    tabz_speak: `## tabz_speak
Speak text aloud through the browser using neural text-to-speech.

Uses Microsoft Edge neural TTS voices for high-quality, natural speech.
The extension automatically applies the user's configured audio settings
(voice, rate, pitch, volume) unless you explicitly override them.

### Important Behavior
- Audio settings from the TabzChrome dashboard are respected
- If user has disabled audio, this tool will still work (direct invocation)
- User's preferred voice/rate/pitch are used by default
- Override parameters only when you need a specific effect

### Parameters
- **text** (required): The text to speak. Markdown is stripped automatically. Max 3000 chars.
- **voice** (optional): Override voice. See tabz_list_voices for options.
- **rate** (optional): Override speech rate (e.g., '+30%' faster, '-20%' slower)
- **pitch** (optional): Override pitch (e.g., '+50Hz' higher, '-100Hz' lower)
- **priority** (optional): 'high' interrupts current audio, 'low' (default) may be skipped

### Returns
- success: Whether the speech was initiated
- error: Error message if failed

### Examples
- Simple announcement: text="Task complete. Ready for next request."
- Urgent alert: text="Build failed with 3 errors", priority="high"
- Custom voice: text="Hello!", voice="en-GB-SoniaNeural"
- Fast reading: text="Summary of changes...", rate="+40%"

### Best Practices
- Keep text concise for status updates
- Use priority='high' sparingly (for errors, completion of long tasks)
- Let user settings control voice unless you have a specific reason to override

### Error Handling
- "Cannot connect": Backend not running at localhost:8129
- "TTS generation failed": edge-tts service issue (network/timeout)`,
    tabz_list_voices: `## tabz_list_voices
List available text-to-speech voices.

Returns the neural TTS voices available for use with tabz_speak.
All voices are high-quality Microsoft Edge neural voices.

### Returns
- List of voice codes with descriptions

### Usage
Use the voice code (e.g., 'en-US-AriaNeural') with tabz_speak's voice parameter.

### Cross-references
- tabz_speak: Use the voice codes returned here`,
    tabz_play_audio: `## tabz_play_audio
Play an audio file through the browser.

Plays MP3, WAV, OGG, or other browser-supported audio formats.
Useful for soundboards, notifications, alerts, or any audio feedback.

The backend can serve static audio files from its public directory,
or you can play any accessible URL.

### Parameters
- **url** (required): URL of the audio file to play
  - Local: http://localhost:8129/sounds/ding.mp3
  - Remote: https://example.com/sound.mp3
- **volume** (optional): 0.0 to 1.0 (uses user's setting if not specified)
- **priority** (optional): 'high' interrupts, 'low' (default) may be skipped

### Serving Audio Files
Place audio files in backend/public/sounds/ to serve them at:
http://localhost:8129/sounds/<filename>

### Examples
- Play notification: url="http://localhost:8129/sounds/notify.mp3"
- Play at half volume: url="...", volume=0.5
- Urgent sound: url="...", priority="high"

### Error Handling
- "Cannot connect": Backend not running
- Audio may not play if browser tab is not focused (browser limitation)`,
    // ============================================================
    // BOOKMARK TOOLS
    // ============================================================
    tabz_get_bookmark_tree: `## tabz_get_bookmark_tree
Get the Chrome bookmarks hierarchy.

Returns the bookmark tree structure showing folders and bookmarks.
Use this to explore your bookmarks and find folder IDs for organizing.

### Magic Folder IDs
- **"1"** = Bookmarks Bar (visible in browser toolbar)
- **"2"** = Other Bookmarks

### Parameters
- **folderId** (optional): Get children of specific folder. Omit for full tree.
- **maxDepth**: How deep to traverse (1-10, default: 3)
- **response_format**: 'markdown' (default) or 'json'

### Returns
Tree structure with:
- id: Bookmark/folder ID (use with other bookmark tools)
- title: Display name
- url: URL (only for bookmarks, not folders)
- children: Nested items (for folders)

### Examples
- Full tree: (no args)
- Bookmarks Bar only: folderId="1"
- Shallow view: maxDepth=1

### Cross-references
Use the returned IDs with tabz_save_bookmark, tabz_move_bookmark, tabz_delete_bookmark.`,
    tabz_search_bookmarks: `## tabz_search_bookmarks
Search Chrome bookmarks by title or URL.

Finds bookmarks matching your query. Searches both titles and URLs.

### Parameters
- **query** (required): Search text - matches titles and URLs
- **limit**: Max results (1-100, default: 20)
- **response_format**: 'markdown' (default) or 'json'

### Returns
List of matching bookmarks with:
- id: Bookmark ID (use with move/delete tools)
- title: Bookmark title
- url: Bookmark URL
- parentId: Parent folder ID

### Examples
- Find React docs: query="react"
- Find GitHub repos: query="github.com"
- Find by domain: query="stackoverflow.com"

### Cross-references
Use the returned IDs with tabz_move_bookmark or tabz_delete_bookmark.`,
    tabz_save_bookmark: `## tabz_save_bookmark
Save a URL as a Chrome bookmark.

Creates a new bookmark in the specified folder.

### Parameters
- **url** (required): URL to bookmark
- **title** (required): Bookmark title
- **parentId** (optional): Folder ID. Default: "1" (Bookmarks Bar)
  - "1" = Bookmarks Bar (visible in toolbar)
  - "2" = Other Bookmarks
  - Or use a folder ID from tabz_get_bookmark_tree
- **index** (optional): Position in folder (0 = first). Omit for end.

### Examples
- Save to Bookmarks Bar: url="https://github.com", title="GitHub"
- Save to Other Bookmarks: url="...", title="...", parentId="2"
- Save to custom folder: url="...", title="...", parentId="123"

### Cross-references
The bookmark ID can be used with tabz_move_bookmark or tabz_delete_bookmark.`,
    tabz_create_folder: `## tabz_create_folder
Create a new bookmark folder.

Creates a folder to organize bookmarks.

### Parameters
- **title** (required): Folder name
- **parentId** (optional): Parent folder ID. Default: "1" (Bookmarks Bar)
  - "1" = Bookmarks Bar
  - "2" = Other Bookmarks
  - Or a folder ID for nesting
- **index** (optional): Position in parent (0 = first). Omit for end.

### Examples
- New folder in Bookmarks Bar: title="Work Projects"
- Nested folder: title="React", parentId="456"
- In Other Bookmarks: title="Archive", parentId="2"

### Cross-references
Use the returned folder ID with tabz_save_bookmark to add bookmarks to it.`,
    tabz_move_bookmark: `## tabz_move_bookmark
Move a bookmark or folder to a different location.

Reorganize your bookmarks by moving them between folders.

### Parameters
- **id** (required): Bookmark or folder ID to move
- **parentId** (required): Destination folder ID
  - "1" = Bookmarks Bar
  - "2" = Other Bookmarks
  - Or any folder ID
- **index** (optional): Position in destination (0 = first). Omit for end.

### Examples
- Move to Bookmarks Bar: id="123", parentId="1"
- Move to folder: id="123", parentId="456"
- Move to first position: id="123", parentId="1", index=0

### Behavioral Limits
Cannot move the Bookmarks Bar or Other Bookmarks folders themselves.`,
    tabz_delete_bookmark: `## tabz_delete_bookmark
Delete a bookmark or folder.

Permanently removes a bookmark or folder from Chrome.

### Parameters
- **id** (required): Bookmark or folder ID to delete

### Destructive Side Effects
**WARNING:** Deleting a folder will also delete ALL bookmarks inside it!

### Behavioral Limits
- Cannot delete the Bookmarks Bar or Other Bookmarks folders
- This action cannot be undone through this tool

### Examples
- Delete bookmark: id="123"
- Delete folder (and contents): id="456"`,
    // ============================================================
    // CONSOLE TOOLS
    // ============================================================
    tabz_get_console_logs: `## tabz_get_console_logs
Get console logs from the browser (log, warn, error, info, debug).

Retrieves console output from web pages open in Chrome. Useful for:
- Debugging JavaScript errors
- Seeing application logs
- Monitoring API responses logged to console
- Finding React/Vue/Angular warnings

The logs are captured from ALL open tabs. Use tabId filter to focus on specific tab.

### Parameters
- **level**: Filter by log level ('all', 'log', 'info', 'warn', 'error', 'debug')
- **limit**: Max entries to return (1-1000, default: 100)
- **since**: Only logs after this timestamp (ms since epoch)
- **tabId**: Filter by browser tab ID
- **response_format**: 'markdown' (default) or 'json'

### Returns
Console log entries with timestamp, level, message, source URL, and stack traces for errors.

### Examples
- Get all errors: level="error"
- Get recent logs: since=Date.now()-60000 (last minute)
- Get specific tab: tabId=123

### Error Handling
- "Cannot connect to backend": Start TabzChrome backend (cd backend && npm start)
- "No logs captured": Open Chrome tabs and interact with pages`,
    // ============================================================
    // COOKIE TOOLS
    // ============================================================
    tabz_cookies_get: `## tabz_cookies_get
Get a specific browser cookie by name and URL.

Uses Chrome's cookies.get() API to retrieve a single cookie that matches
the given URL and name.

### Parameters
- **url** (required): URL to get cookie for (determines domain/path matching)
- **name** (required): Name of the cookie to retrieve

### Returns
- Cookie object with name, value, domain, path, flags, expiration
- null if cookie not found

### Examples
- Get session cookie: url="https://github.com", name="user_session"
- Get auth token: url="https://api.example.com", name="auth_token"

### Security Notes
Cookie values are shown in full. Be careful with auth tokens.

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running at localhost:8129
- null result: Cookie doesn't exist or URL doesn't match cookie's domain`,
    tabz_cookies_list: `## tabz_cookies_list
List browser cookies with optional filtering.

Uses Chrome's cookies.getAll() API to retrieve cookies matching the given criteria.
At least one filter (domain or url) should be provided for targeted results.

### Parameters
- **domain** (optional): Filter by domain (e.g., 'github.com')
- **url** (optional): Filter by URL (includes path matching)
- **name** (optional): Filter by cookie name
- **secure** (optional): Filter by secure flag
- **session** (optional): Filter session cookies only
- **response_format**: 'markdown' (default) or 'json'

### Examples
- List GitHub cookies: domain="github.com"
- List secure cookies: domain="example.com", secure=true
- List session cookies: domain="example.com", session=true

### Security Notes
Cookie values are truncated in markdown output.

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running
- Empty list: No cookies match the filter criteria`,
    tabz_cookies_set: `## tabz_cookies_set
Create or update a browser cookie.

Uses Chrome's cookies.set() API to create a new cookie or update an existing one.
The URL determines the default domain if not explicitly provided.

### Security Warning
**Modifying cookies can break authentication or cause unexpected behavior.
Use with caution, especially for auth-related cookies.**

### Parameters
- **url** (required): URL to associate cookie with
- **name** (required): Cookie name
- **value** (required): Cookie value
- **domain** (optional): Cookie domain (defaults to URL host)
- **path** (optional): Cookie path (defaults to '/')
- **secure** (optional): Secure flag (HTTPS only)
- **httpOnly** (optional): HttpOnly flag (not accessible to JS)
- **sameSite** (optional): 'no_restriction', 'lax', or 'strict'
- **expirationDate** (optional): Seconds since epoch (omit for session cookie)

### Examples
- Set session cookie: url="https://example.com", name="test", value="123"
- Set persistent cookie: url="https://example.com", name="pref", value="dark", expirationDate=1735689600
- Set secure cookie: url="https://example.com", name="token", value="abc", secure=true, httpOnly=true, sameSite="strict"

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running
- Failed set: Domain mismatch, invalid URL, or permission denied`,
    tabz_cookies_delete: `## tabz_cookies_delete
Delete a specific browser cookie.

Uses Chrome's cookies.remove() API to delete a cookie matching the given URL and name.

### Security Warning
**Deleting auth cookies will log the user out of websites. Use with caution.**

### Parameters
- **url** (required): URL the cookie is associated with
- **name** (required): Name of the cookie to delete

### Examples
- Delete tracking cookie: url="https://example.com", name="_ga"
- Clear session: url="https://github.com", name="user_session"

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running
- null result: Cookie doesn't exist or URL mismatch`,
    tabz_cookies_audit: `## tabz_cookies_audit
Audit cookies for the current page, categorizing them by type.

Analyzes all cookies associated with the current page and categorizes them:
- First-party vs third-party
- Session vs persistent
- Known trackers flagged

Useful for debugging authentication issues, identifying tracking cookies,
understanding cookie usage on a page, and privacy audits.

### Parameters
- **tabId** (optional): Tab ID to audit (defaults to active tab)
- **response_format**: 'markdown' (default) or 'json'

### Returns
- Page URL and domain
- List of all cookies categorized
- First-party cookies (same domain as page)
- Third-party cookies (different domain)
- Known trackers highlighted
- Session vs persistent breakdown

### Examples
- Audit current page: (no args needed)
- Audit specific tab: tabId=123456

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running
- "No active tab": No tab found or tab has no URL`,
    // ============================================================
    // DEBUGGER TOOLS
    // ============================================================
    tabz_get_dom_tree: `## tabz_get_dom_tree
Get the DOM tree structure of the current page using Chrome DevTools Protocol.

Uses chrome.debugger to attach to the page and extract the full DOM hierarchy.
This provides more detail than the scripting API, including shadow DOM.

### Important Behavior
The user will see a "debugging" banner in Chrome while this runs.
The debugger automatically detaches after the operation completes.

### Parameters
- **tabId** (optional): Chrome tab ID. Omit for active tab.
- **maxDepth**: How deep to traverse (1-10, default: 4)
- **selector** (optional): CSS selector to focus on a specific element
- **response_format**: 'markdown' (default) or 'json'

### Returns
- Simplified DOM tree with tag names, IDs, and classes
- Node count for the returned tree
- Child counts for truncated branches

### Examples
- Full document (shallow): maxDepth=2
- Navigation only: selector="nav"
- Deep inspection: maxDepth=8, selector="main"

### Best Practices
Use this tool when you need to understand the page structure deeply,
identify element hierarchies, or debug rendering issues.`,
    tabz_profile_performance: `## tabz_profile_performance
Profile the current page's performance metrics using Chrome DevTools Protocol.

Uses chrome.debugger to collect detailed performance data including:
- **Timing:** Task duration, script duration, layout time, etc.
- **Memory:** JS heap size, DOM size in memory
- **DOM:** Node counts, document counts, frame counts
- **Other:** Process-level metrics

### Important Behavior
The user will see a "debugging" banner in Chrome while this runs.
The debugger automatically detaches after metrics are collected.

### Parameters
- **tabId** (optional): Chrome tab ID. Omit for active tab.
- **response_format**: 'markdown' (default) or 'json'

### Returns
- Categorized performance metrics
- Timing values in milliseconds
- Memory values in megabytes
- Raw metric names and values

### Use Cases
- Check memory usage after interaction
- Identify slow pages (high TaskDuration)
- Count DOM nodes (Nodes metric)
- Diagnose performance issues, memory leaks, or DOM bloat`,
    tabz_get_coverage: `## tabz_get_coverage
Analyze JavaScript and/or CSS code coverage on the current page.

Uses chrome.debugger to track which code has been executed or which CSS rules have been applied.
This helps identify unused code that could be removed to improve performance.

### Important Behavior
The user will see a "debugging" banner in Chrome while this runs.
Coverage data reflects code used since page load - interact with the page for fuller coverage.

### Parameters
- **tabId** (optional): Chrome tab ID. Omit for active tab.
- **type**: 'js' (JavaScript only), 'css' (CSS only), or 'both' (default)
- **response_format**: 'markdown' (default) or 'json'

### Returns
- Per-file coverage data with used/total bytes and percentage
- Summary with overall usage across all files
- Files sorted by total size (largest first)

### Examples
- Find unused JavaScript: type='js'
- Audit CSS bundle: type='css'
- Full audit: type='both'

### Use Cases
- Identify opportunities for code splitting
- Find dead CSS rules
- Measure actual code usage vs bundle size`,
    // ============================================================
    // DOWNLOAD TOOLS
    // ============================================================
    tabz_download_file: `## tabz_download_file
Download a file from any URL using Chrome's download manager.

This tool downloads files via Chrome's built-in download API, which:
- Handles authentication (uses browser cookies/session)
- Shows in Chrome's download manager
- Saves to Chrome's configured Downloads folder

### WSL2 Path Handling
Returns BOTH paths for cross-platform compatibility:
- **windowsPath**: Original Windows path (e.g., "C:\\Users\\matt\\Downloads\\file.png")
- **wslPath**: Converted WSL path (e.g., "/mnt/c/Users/matt/Downloads/file.png")

Use the wslPath with Claude's Read tool to view downloaded images.

### Parameters
- **url** (required): URL of the file to download
- **filename** (optional): Custom filename (relative to Downloads folder)
- **conflictAction**: 'uniquify' (add number suffix), 'overwrite', or 'prompt' (default: uniquify)
- **response_format**: 'markdown' (default) or 'json'

### Workflow for images
1. tabz_download_file with image URL
2. Use Read tool with returned wslPath to view the image

### Examples
- Download image: url="https://example.com/image.png"
- Custom name: url="https://example.com/data.json", filename="my-data.json"
- Overwrite existing: url="...", conflictAction="overwrite"

### Error Handling
- "Download failed to start": Invalid URL or network error
- "Download interrupted": Connection lost or cancelled
- "Download timed out": File too large or slow connection (may still complete)`,
    tabz_get_downloads: `## tabz_get_downloads
List recent downloads from Chrome's download manager.

Returns information about recent downloads including their status, size, and file paths.

### Parameters
- **limit**: Maximum downloads to return (1-100, default: 20)
- **state**: Filter by state - 'in_progress', 'complete', 'interrupted', or 'all' (default)
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "downloads": [{
    "id": 123,
    "url": "...",
    "filename": "...",
    "state": "in_progress" | "complete" | "interrupted",
    "bytesReceived": 1024,
    "totalBytes": 2048,
    "windowsPath": "C:\\\\Users\\\\...",
    "wslPath": "/mnt/c/Users/..."
  }],
  "total": 5
}
\`\`\`

### Examples
- All recent: (no args)
- Only completed: state="complete"
- Check progress: state="in_progress"

### Cross-references
Use tabz_cancel_download with the download ID to cancel in-progress downloads.`,
    tabz_cancel_download: `## tabz_cancel_download
Cancel an in-progress download.

Use the download ID from tabz_get_downloads to cancel a download.
Only works for downloads that are still in progress.

### Parameters
- **downloadId** (required): The download ID to cancel (from tabz_get_downloads)

### Behavioral Limits
Cancelled downloads cannot be resumed. You'll need to start a new download.

### Examples
- Cancel download: downloadId=123`,
    tabz_save_page: `## tabz_save_page
Save the current browser tab as an MHTML file for offline analysis.

MHTML (MIME HTML) bundles the complete webpage into a single file:
- Full HTML content
- CSS stylesheets
- Images (embedded as base64)
- JavaScript files
- Fonts and other resources

### Use Cases
- Archiving documentation pages for offline reference
- Capturing dynamic/JS-rendered content that WebFetch can't fully get
- Preserving page state before it changes
- Saving pages that require authentication

### WSL2 Path Handling
Returns BOTH paths for cross-platform compatibility:
- **windowsPath**: Original Windows path
- **wslPath**: Converted WSL path

### Parameters
- **tabId** (optional): Tab ID to save. Defaults to active tab.
- **filename** (optional): Custom filename without extension. Defaults to page title + timestamp.
- **response_format**: 'markdown' (default) or 'json'

### Workflow
1. tabz_save_page to save the page
2. Use Read tool with returned wslPath to analyze the content

### Behavioral Limits
MHTML files can only be opened in a browser from the local filesystem.
For security, browsers won't load MHTML files from web origins.

### Examples
- Save current tab: (no args)
- Save specific tab: tabId=123456789
- Custom name: filename="react-docs-2024"`,
    // ============================================================
    // EMULATION TOOLS
    // ============================================================
    tabz_emulate_device: `## tabz_emulate_device
Emulate mobile or tablet device viewport using Chrome DevTools Protocol.

Changes the page viewport to match the selected device dimensions, pixel ratio, and mobile mode.
The debugger will remain attached while emulation is active.

### Important Behavior
Chrome will show a "debugging" banner while emulation is active.
Use tabz_emulate_clear to reset viewport and detach debugger.

### Parameters
- **device**: Preset name or 'custom' for manual dimensions
- **width/height**: Required if device='custom'
- **deviceScaleFactor**: Pixel ratio (default: from preset or 1)
- **mobile**: Enable mobile mode (default: true)
- **tabId**: Target tab (default: active tab)

### Available Presets
iPhone_12, iPhone_14, iPhone_14_Pro_Max, iPad, iPad_Pro, Pixel_5, Galaxy_S21,
Galaxy_Tab, Surface_Pro, and more. The full list is shown in the tool's description.

### Examples
- iPhone 14: device="iPhone_14"
- iPad Pro: device="iPad_Pro"
- Custom: device="custom", width=400, height=800, deviceScaleFactor=2`,
    tabz_emulate_clear: `## tabz_emulate_clear
Clear all emulation overrides and detach the Chrome debugger.

Resets device viewport, geolocation, network conditions, media features, and vision deficiency simulation.
Also detaches the debugger, removing the yellow debugging banner.

### Parameters
- **tabId**: Target tab (default: active tab)

### Best Practices
Use this tool after testing responsive designs or accessibility features.`,
    tabz_emulate_geolocation: `## tabz_emulate_geolocation
Override browser geolocation using Chrome DevTools Protocol.

Spoofs the GPS coordinates returned by the Geolocation API.
Useful for testing location-based features.

### Common Locations
- San Francisco: 37.7749, -122.4194
- New York: 40.7128, -74.0060
- London: 51.5074, -0.1278
- Tokyo: 35.6762, 139.6503
- Sydney: -33.8688, 151.2093

### Parameters
- **latitude**: Latitude in degrees (-90 to 90)
- **longitude**: Longitude in degrees (-180 to 180)
- **accuracy**: Accuracy in meters (default: 100)
- **clear**: Set to true to clear the override
- **tabId**: Target tab (default: active tab)

### Important Behavior
Chrome will show a "debugging" banner while override is active.

### Examples
- San Francisco: latitude=37.7749, longitude=-122.4194
- Clear override: clear=true`,
    tabz_emulate_network: `## tabz_emulate_network
Throttle network speed using Chrome DevTools Protocol.

Simulates slow network conditions like 3G or offline mode.
Useful for testing loading states and offline behavior.

### Available Presets
slow_3g, fast_3g, regular_4g, wifi, dsl, offline, no_throttle

### Important Behavior
Chrome will show a "debugging" banner while throttling is active.
Network throttling affects all requests from the tab.

### Parameters
- **preset**: Network preset name
- Or custom values: offline, downloadThroughput, uploadThroughput, latency
- **tabId**: Target tab (default: active tab)

### Examples
- Slow 3G: preset="slow_3g"
- Offline: preset="offline"
- Remove throttling: preset="no_throttle"`,
    tabz_emulate_media: `## tabz_emulate_media
Emulate CSS media type and features using Chrome DevTools Protocol.

Override media queries for testing responsive designs and accessibility preferences.

### Media Types
- screen: Normal display
- print: Print preview mode

### Media Features
- colorScheme: prefers-color-scheme (light/dark)
- reducedMotion: prefers-reduced-motion (reduce/no-preference)
- forcedColors: forced-colors (active/none for high contrast)

### Parameters
- **media**: CSS media type ('screen', 'print', or '' to clear)
- **colorScheme**: 'light', 'dark', or 'no-preference'
- **reducedMotion**: 'reduce' or 'no-preference'
- **forcedColors**: 'active' or 'none'
- **tabId**: Target tab (default: active tab)

### Important Behavior
Chrome will show a "debugging" banner while emulation is active.

### Examples
- Dark mode: colorScheme="dark"
- Print preview: media="print"
- Reduced motion: reducedMotion="reduce"`,
    tabz_emulate_vision: `## tabz_emulate_vision
Simulate vision deficiency using Chrome DevTools Protocol.

Applies color filters to simulate how the page appears to users with various vision conditions.
Useful for accessibility testing.

### Vision Types
- none: No simulation (clear)
- blurredVision: Blurred vision
- deuteranopia: Red-green color blindness (green-weak)
- protanopia: Red-green color blindness (red-weak)
- tritanopia: Blue-yellow color blindness
- achromatopsia: Complete color blindness

### Important Behavior
Chrome will show a "debugging" banner while simulation is active.
This affects the visual rendering only, not the underlying content.

### Parameters
- **type** (required): Vision deficiency type to simulate
- **tabId**: Target tab (default: active tab)

### Examples
- Red-green colorblindness: type="deuteranopia"
- Clear simulation: type="none"`,
    // ============================================================
    // HISTORY TOOLS
    // ============================================================
    tabz_history_search: `## tabz_history_search
Search browsing history by keyword and date range.

Finds pages the user has visited that match the search query. Searches both
URLs and page titles.

### Parameters
- **query** (required): Search text to match. Use empty string "" to match all.
- **startTime** (optional): Start of date range in ms since epoch. Default: 24 hours ago.
- **endTime** (optional): End of date range in ms since epoch. Default: now.
- **maxResults** (optional): Max results to return (1-1000). Default: 100.
- **response_format**: 'markdown' (default) or 'json'

### Key Return Fields
- lastVisitTime: When the page was last visited (ms since epoch)
- visitCount: Total number of times this URL was visited
- typedCount: Times the URL was typed directly in the address bar

### Examples
- Find GitHub pages from today: query="github"
- Find all pages from last week: query="", startTime=<week_ago_ms>
- Find specific site: query="stackoverflow.com"

### Cross-references
- tabz_history_visits: Get detailed visit information for a specific URL
- tabz_history_recent: Quick view of recent browsing

### Error Handling
- "Cannot connect": Ensure TabzChrome backend is running at localhost:8129
- Empty results: No matching history in the specified time range`,
    tabz_history_visits: `## tabz_history_visits
Get detailed visit information for a specific URL.

Returns all recorded visits to a particular URL, including when each visit
occurred and how the user navigated to the page.

### Parameters
- **url** (required): The exact URL to look up (must be a valid URL)
- **response_format**: 'markdown' (default) or 'json'

### Transition Types
- "link": Clicked a link on another page
- "typed": Typed the URL directly
- "auto_bookmark": Clicked a bookmark
- "auto_subframe": Loaded in a subframe
- "manual_subframe": User clicked in a subframe
- "generated": Generated (e.g., form submission)
- "start_page": Start page
- "form_submit": Form submission
- "reload": Page reload
- "keyword": Omnibox keyword search
- "keyword_generated": Generated from keyword

### Examples
- Get visits: url="https://github.com/anthropics/claude-code"

### Cross-references
Use tabz_history_search first to find URLs if you don't have the exact URL.

### Error Handling
- "No visits found": URL not in history or never visited
- Invalid URL format: Ensure the URL is complete with protocol`,
    tabz_history_recent: `## tabz_history_recent
Get the most recently visited pages.

Returns browsing history sorted by most recent visit time. This is a quick
way to see what the user has been browsing without specifying search terms.

### Parameters
- **maxResults** (optional): Max results to return (1-1000). Default: 50.
- **response_format**: 'markdown' (default) or 'json'

### Examples
- Get last 10 pages: maxResults=10
- Get last 100 pages: maxResults=100

### Cross-references
Use tabz_history_search for keyword-based searching.

### Error Handling
- Empty results: No browsing history (new profile or cleared)
- "Cannot connect": Ensure TabzChrome backend is running`,
    tabz_history_delete_url: `## tabz_history_delete_url
Remove a specific URL from browsing history.

Permanently deletes all visits to the specified URL from the browser's history.

### Parameters
- **url** (required): The exact URL to delete from history

### Destructive Side Effects
**This action cannot be undone.** The URL and all its visit records
will be permanently removed from history.

### Cross-references
Use tabz_history_search first to find the exact URL if needed.

### Error Handling
- Invalid URL format: Ensure URL is complete with protocol
- "Cannot connect": Ensure TabzChrome backend is running`,
    tabz_history_delete_range: `## tabz_history_delete_range
Remove all browsing history within a date range.

Permanently deletes all history entries between the specified start and end times.

### Parameters
- **startTime** (required): Start of range (milliseconds since epoch)
- **endTime** (required): End of range (milliseconds since epoch)

### Time Helpers (JavaScript)
- Now: Date.now()
- 1 hour ago: Date.now() - 3600000
- 24 hours ago: Date.now() - 86400000
- 7 days ago: Date.now() - 604800000
- Specific date: new Date('2024-01-15').getTime()

### Destructive Side Effects
**This action cannot be undone.** All history in the specified time
range will be permanently deleted.

### Examples
- Delete last hour: startTime=<hour_ago_ms>, endTime=<now_ms>
- Delete today: startTime=<today_start_ms>, endTime=<now_ms>

### Error Handling
- "startTime must be less than endTime": Check time values
- "Cannot connect": Ensure TabzChrome backend is running`,
    // ============================================================
    // INSPECTION TOOLS
    // ============================================================
    tabz_get_element: `## tabz_get_element
Get detailed information about a DOM element for CSS debugging or recreation.

Returns the element's HTML, computed styles, bounding box, and attributes.
Perfect for understanding how an element is styled or recreating it in another project.

### Parameters
- **selector** (required): CSS selector for the element
- **includeStyles** (optional): Include computed CSS styles (default: true)
- **styleProperties** (optional): Specific CSS properties to extract
- **response_format**: 'markdown' (default) or 'json'

### Returns
- tagName: Element tag (div, button, etc.)
- attributes: All HTML attributes (class, id, data-*, etc.)
- bounds: Position and dimensions (x, y, width, height)
- styles: Computed CSS styles (layout, typography, colors, etc.)
- outerHTML: Complete HTML including the element
- html: Inner HTML content
- innerText: Text content (first 500 chars)
- parentSelector: Selector hint for parent element
- childCount: Number of child elements

### Default Style Categories Extracted
- Layout: display, position, width, height, overflow
- Spacing: margin, padding
- Flexbox: flex-direction, justify-content, align-items, gap
- Grid: grid-template-columns, grid-template-rows
- Typography: font-family, font-size, font-weight, color, line-height
- Background: background-color, background-image
- Border: border, border-radius
- Effects: box-shadow, opacity, transform, transition

### Examples
- Inspect a card: selector=".card"
- Get button styles: selector="button.primary"
- Check header layout: selector="#main-header"
- Just HTML, no styles: selector=".modal", includeStyles=false

### Use Cases
- Debug CSS issues: Compare expected vs actual styles
- Recreate elements: Get all styles needed to rebuild in another project
- Understand layout: See flexbox/grid properties and dimensions

### Error Handling
- "Element not found": Selector doesn't match any element
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    // ============================================================
    // INTERACTION TOOLS
    // ============================================================
    tabz_click: `## tabz_click
Click an element on the page.

Waits for the element to appear (up to 5 seconds) then clicks it.
Works with buttons, links, checkboxes, and any clickable element.

### Parameters
- **selector** (required): CSS selector for the element to click
- **tabId** (optional): Target tab

### Common Selectors
- By ID: "#submit-button"
- By class: ".btn-primary"
- By tag: "button"
- By attribute: "button[type='submit']"
- Nested: ".modal .close-btn"

### Destructive Side Effects
**WARNING:** This tool can trigger actions. Use carefully.

### Examples
- Click submit: selector="button[type='submit']"
- Click link: selector="a.nav-link"
- Click checkbox: selector="input[type='checkbox']#agree"

### Error Handling
- "Element not found": Selector doesn't match any element within 5 seconds
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129

### Cross-references
After clicking, use tabz_get_page_info to check if page changed,
or tabz_execute_script to verify the result.`,
    tabz_fill: `## tabz_fill
Fill an input field with text.

Waits for the element to appear (up to 5 seconds), clears any existing value,
then types the new value. Works with text inputs, textareas, and other form fields.

### Parameters
- **selector** (required): CSS selector for the input field
- **value** (required): Text to type into the field
- **tabId** (optional): Target tab

### Common Selectors
- By ID: "#email"
- By name: "input[name='username']"
- By type: "input[type='password']"
- By placeholder: "input[placeholder='Enter email']"
- Textarea: "textarea#message"

### Destructive Side Effects
**WARNING:** This tool modifies form state. Use carefully.

### Examples
- Fill email: selector="input[type='email']", value="user@example.com"
- Fill password: selector="#password", value="secret123"
- Fill search: selector="input[name='q']", value="search query"

### Error Handling
- "Element not found": Selector doesn't match any input within 5 seconds
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129

### Cross-references
After filling, you may want to:
- Click a submit button: tabz_click with selector="button[type='submit']"
- Verify the value: tabz_execute_script with code="document.querySelector('selector').value"`,
    // ============================================================
    // NETWORK TOOLS
    // ============================================================
    tabz_enable_network_capture: `## tabz_enable_network_capture
Enable network request monitoring for the current browser tab.

You must call this tool BEFORE browsing to capture requests.
Network capture intercepts XHR, fetch, and other network requests in real-time.

### Parameters
- **tabId** (optional): Specific tab ID to enable capture for

### Workflow
1. Call tabz_enable_network_capture
2. Navigate or interact with the page to generate requests
3. Call tabz_get_network_requests to see captured requests

### Behavioral Limits
- Uses Chrome Extension API (no special Chrome flags needed)
- Capture persists until MCP server restarts
- Requests older than 5 minutes are automatically cleaned up
- Maximum 500 requests stored (oldest removed first)

### Error Handling
- "Extension API failed": Chrome extension may not be connected
- "No active page": No browser tab is open`,
    tabz_get_network_requests: `## tabz_get_network_requests
List captured network requests (XHR, fetch, etc.) from browser pages.

Returns information about network requests captured after calling tabz_enable_network_capture.
Requests are sorted by time (newest first).

### Parameters
- **urlPattern** (optional): Filter by URL pattern (regex or substring, e.g., "api/", "\\.json$")
- **method**: Filter by HTTP method ("all", "GET", "POST", "PUT", "DELETE", etc.)
- **statusMin** (optional): Minimum status code (e.g., 400 for errors only)
- **statusMax** (optional): Maximum status code (e.g., 299 for successful only)
- **resourceType**: Filter by type ("all", "XHR", "Fetch", "Document", "Script", etc.)
- **limit**: Max requests to return (1-200, default: 50)
- **offset**: Skip N requests for pagination (default: 0)
- **tabId** (optional): Filter by specific browser tab ID
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "total": 25,
  "captureActive": true,
  "hasMore": false,
  "requests": [{
    "requestId": "123",
    "url": "...",
    "method": "GET",
    "status": 200,
    "resourceType": "XHR",
    "responseTime": 150,
    "encodedDataLength": 1024
  }]
}
\`\`\`

### Examples
- All requests: (no args needed)
- API calls only: urlPattern="api/"
- Find errors: statusMin=400
- POST requests: method="POST"
- GraphQL: urlPattern="graphql", method="POST"
- Successful only: statusMin=200, statusMax=299

### Notes
- Uses Chrome Extension API (no special Chrome flags needed)
- Captures URL, headers, status, timing via chrome.webRequest

### Error Handling
- "Capture not active": Call tabz_enable_network_capture first`,
    tabz_clear_network_requests: `## tabz_clear_network_requests
Clear all captured network requests.

Removes all stored network requests from memory. Useful when you want to
start fresh or reduce memory usage.

### Behavioral Limits
Network capture remains active after clearing. New requests will continue to be captured.`,
    // ============================================================
    // NOTIFICATION TOOLS
    // ============================================================
    tabz_notification_show: `## tabz_notification_show
Display a Chrome desktop notification.

Shows a notification in the system tray/notification center.

### Parameters
- **title** (required): Notification title (max 100 chars)
- **message** (required): Body text (max 500 chars)
- **type**: 'basic' (default), 'image', 'list', or 'progress'
- **iconUrl**: Custom icon URL (uses extension icon if omitted)
- **imageUrl**: Image for 'image' type notifications
- **items**: List items for 'list' type [{title, message}, ...]
- **progress**: 0-100 for 'progress' type
- **buttons**: Up to 2 action buttons [{title, iconUrl?}, ...]
- **priority**: -2 (lowest) to 2 (highest), default 0
- **notificationId**: Custom ID for updates (auto-generated if omitted)
- **requireInteraction**: Keep visible until dismissed (default false)

### Returns
- success: Whether notification was shown
- notificationId: ID for updating/clearing this notification

### Examples
- Basic alert: { title: "Build Complete", message: "Your project built successfully" }
- Progress: { type: "progress", title: "Downloading", message: "file.zip", progress: 45 }
- With buttons: { title: "Deploy?", message: "Ready to deploy", buttons: [{title: "Deploy"}, {title: "Cancel"}] }

### Behavioral Limits
Button clicks display but are not yet connected to actions.

### Platform Differences
- Windows: Full support
- macOS: Some styles may differ
- Linux: Depends on notification daemon`,
    tabz_notification_update: `## tabz_notification_update
Update an existing notification.

Modifies a previously shown notification.

### Parameters
- **notificationId** (required): ID from tabz_notification_show
- **title**: New title
- **message**: New message
- **progress**: New progress (0-100)
- **type**: Change type (e.g., 'basic' to remove progress bar when done)

### Returns
- success: Whether update succeeded
- wasUpdated: Whether notification existed and was updated

### Example Workflow
1. Show: { type: "progress", title: "Processing", message: "Step 1", progress: 0 }
2. Update: { notificationId: "...", progress: 50, message: "Step 2" }
3. Complete: { notificationId: "...", type: "basic", title: "Done!", message: "Processing complete" }`,
    tabz_notification_clear: `## tabz_notification_clear
Dismiss a notification.

Removes a notification from the system tray/notification center.

### Parameters
- **notificationId** (required): ID from tabz_notification_show

### Returns
- success: Whether clear succeeded
- wasCleared: Whether notification existed and was cleared`,
    tabz_notification_list: `## tabz_notification_list
List all active notifications.

Returns all notifications that haven't been dismissed by the user or cleared programmatically.

### Returns
- success: Whether list succeeded
- count: Number of active notifications
- notifications: Object with notificationId keys and {type, title, message} values`,
    // ============================================================
    // OMNIBOX / NAVIGATION TOOLS
    // ============================================================
    tabz_open_url: `## tabz_open_url
Open a URL in the browser.

Opens URLs in a new or current browser tab.

### Smart Tab Reuse
By default, if the URL is already open in a tab, this tool switches to that
existing tab instead of opening a duplicate. This prevents tab accumulation
over time. Use reuseExisting=false to force a new tab.

### URL Policy
Configure in TabzChrome Dashboard > Settings > MCP Tools:
- "Allow All URLs" enabled: Any URL can be opened
- "Allow All URLs" disabled: Only whitelisted domains (dev-focused sites)

### Protocol Handling
- localhost/127.0.0.1: Defaults to http:// (local dev servers)
- Other domains: Defaults to https://
- Explicit protocol always honored: http://example.com or https://example.com

### Parameters
- **url** (required): URL to open (protocol optional, see above)
- **newTab**: Open in new tab (default: true) or replace current tab
- **background**: Open in background (default: false, opens in foreground)
- **reuseExisting**: If URL is already open, switch to it instead of new tab (default: true)

### Returns
- success: Whether the URL was opened
- url: The normalized URL that was opened
- tabId: The tab ID (for use with other tools)

### Examples
- Open any site: url="https://example.com"
- Open GitHub repo: url="github.com/user/repo" (auto https://)
- Open localhost: url="localhost:3000" (auto http://)
- Current tab: url="github.com/user/repo", newTab=false
- Background: url="example.com", background=true
- Force new tab: url="github.com/user/repo", reuseExisting=false

### Error Handling
- "URL not allowed": Domain not permitted (check Settings > MCP Tools)
- "Extension not available": Backend not running or extension not connected`,
    // ============================================================
    // PAGE TOOLS
    // ============================================================
    tabz_get_page_info: `## tabz_get_page_info
Get information about the current browser page.

Returns the URL, title, tab ID, and favicon of the active browser tab.
Syncs Claude's target to the user's ACTUAL focused tab (like tabz_list_tabs).

### Parameters
- **tabId**: Specific tab ID (default: active tab)
- **response_format**: 'markdown' (default) or 'json'

### Returns
- url: Full URL of the page
- title: Page title (from <title> tag)
- tabId: Chrome tab identifier (same IDs as tabz_list_tabs)
- favIconUrl: URL of the page favicon

### Cross-references
For reliable multi-tab operations, prefer tabz_list_tabs which shows
ALL tabs with their active status. Use tabz_get_page_info for quick single-page context.

### Examples
- Get current page: (no args needed)
- Get specific tab: tabId=1762556601

### Error Handling
- "No active tab": No browser window is focused
- "Cannot connect": Backend not running`,
    // ============================================================
    // PLUGIN TOOLS
    // ============================================================
    tabz_list_plugins: `## tabz_list_plugins
List installed Claude Code plugins with their status.

Returns plugins grouped by marketplace with enabled/disabled state,
version info, and component types (skills, agents, commands, hooks, mcp).

### Parameters
- **marketplace** (optional): Filter by marketplace name (e.g., "my-plugins")
- **enabled** (optional): Filter by enabled status (true/false)

### Returns (JSON format)
\`\`\`json
{
  "marketplaces": {
    "my-plugins": [{
      "id": "conductor@my-plugins",
      "name": "conductor",
      "enabled": true,
      "version": "1.0.0",
      "components": ["skill", "agent", "command"]
    }]
  },
  "totalPlugins": 5,
  "enabledCount": 4,
  "disabledCount": 1
}
\`\`\`

### Examples
- List all plugins: (no args)
- Filter by marketplace: marketplace="my-plugins"
- List disabled only: enabled=false

### Cross-references
- tabz_list_skills: See skills from enabled plugins
- tabz_toggle_plugin: Enable/disable plugins`,
    tabz_list_skills: `## tabz_list_skills
List available skills from enabled plugins.

Returns skills with their ID, name, description, and source plugin.
Skills can be invoked in Claude Code using /<plugin>:<skill> syntax.

### Parameters
- **plugin** (optional): Filter by plugin name (e.g., "conductor")
- **search** (optional): Search skills by name/description (case-insensitive)

### Returns (JSON format)
\`\`\`json
{
  "skills": [{
    "id": "/conductor:brainstorm",
    "name": "Brainstorm",
    "desc": "Brainstorm ideas and design workflows with a beads expert",
    "pluginName": "conductor",
    "marketplace": "my-plugins"
  }],
  "count": 15
}
\`\`\`

### Examples
- List all skills: (no args)
- Filter by plugin: plugin="conductor"
- Search for skills: search="browser"
- Combined: plugin="tabz", search="screenshot"

### Cross-references
Use the tabz_get_skill tool to read the full SKILL.md content for a specific skill.`,
    tabz_get_skill: `## tabz_get_skill
Get the full SKILL.md content for a specific plugin skill.

Reads and returns the complete skill documentation from the plugin's skill file.

### Parameters
- **skillId** (required): Skill ID in format "/pluginName:skillName"

### Cross-references
Use tabz_list_skills first to find available skill IDs.`,
    tabz_plugins_health: `## tabz_plugins_health
Check plugin health: outdated versions, cache size, marketplace status.

Compares installed plugin versions against their source repositories
to identify plugins that may need updates.

### Returns (JSON format)
\`\`\`json
{
  "outdatedPlugins": [{
    "pluginId": "conductor@my-plugins",
    "name": "conductor",
    "installedCommit": "abc123",
    "latestCommit": "def456",
    "hasChanges": true
  }],
  "cacheSize": {
    "bytes": 1048576,
    "formatted": "1.00 MB"
  },
  "marketplaceStatus": {
    "my-plugins": {
      "head": "def456",
      "path": "/home/user/.claude/plugins/cache/my-plugins",
      "reachable": true
    }
  }
}
\`\`\`

### Best Practices
Use this to check if plugins need updates.
Run /restart after updating plugins to apply changes.`,
    tabz_toggle_plugin: `## tabz_toggle_plugin
Enable or disable a Claude Code plugin.

Toggles a plugin's enabled status in Claude settings.
Requires running /restart for changes to take effect.

### Parameters
- **pluginId** (required): Plugin ID in format "pluginName@marketplace"
  (e.g., "conductor@my-plugins", "beads@anthropic")
- **enabled** (required): true to enable, false to disable

### Examples
- Disable plugin: pluginId="conductor@my-plugins", enabled=false
- Enable plugin: pluginId="beads@my-plugins", enabled=true

### Cross-references
Use tabz_list_plugins to see available plugin IDs.
Run /restart after toggling to apply changes.`,
    // ============================================================
    // PROFILE TOOLS
    // ============================================================
    tabz_list_profiles: `## tabz_list_profiles
List terminal profiles configured in TabzChrome.

Profiles define terminal appearance and behavior (theme, command, working directory).
Use this to discover available profiles before spawning terminals.

### Parameters
- **category**: Optional filter by category name (e.g., 'AI Assistants', 'Checkpoints')
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "total": 62,
  "filtered": 5,
  "defaultProfileId": "claude",
  "globalWorkingDir": "~/projects",
  "profiles": [{
    "id": "claude",
    "name": "Claude",
    "category": "AI Assistants",
    "command": "claude",
    "themeName": "matrix"
  }]
}
\`\`\`

### Examples
- List all profiles: (no args needed)
- Filter by category: category="AI Assistants"
- Filter checkpoints: category="Checkpoints"
- Get JSON: response_format="json"

### Cross-references
Use tabz_list_categories first to see available category names.

### Error Handling
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    tabz_list_categories: `## tabz_list_categories
List all profile categories in TabzChrome.

Categories help organize profiles (e.g., 'AI Assistants', 'Dev Tools', 'TUI Apps').
Use this to discover available categories before filtering with tabz_list_profiles.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "total": 62,
  "categories": ["AI Assistants", "Checkpoints", "Dev Tools", "TUI Apps"]
}
\`\`\`

### Cross-references
After getting categories, use tabz_list_profiles with category filter.

### Error Handling
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    tabz_spawn_profile: `## tabz_spawn_profile
Spawn a terminal using a saved profile.

Profiles define terminal settings (command, theme, working directory, etc.).
Use tabz_list_profiles to discover available profiles first.

### Parameters
- **profileId** (required): Profile ID or name to spawn.
- **workingDir** (optional): Override the profile's default working directory.
- **name** (optional): Custom name for this terminal instance.
- **env** (optional): Additional environment variables (key-value object).

### Returns (JSON format)
\`\`\`json
{
  "success": true,
  "terminal": {
    "id": "ctt-claude-abc123",
    "name": "Claude Worker",
    "terminalType": "claude-code",
    "platform": "local",
    "state": "running",
    "createdAt": "2024-01-15T10:30:00Z",
    "profileId": "claude",
    "profileName": "Claude"
  }
}
\`\`\`

### Examples
- Spawn Claude: profileId="claude"
- Spawn with override: profileId="claude", workingDir="~/projects/myapp"
- Named instance: profileId="codex-reviewer", name="PR Review #123"

### Best Practices
The profile's command, theme, and other settings are automatically applied.
Use this for conductor workflows or spawning specialized AI assistants.

### Error Handling
- "Auth token not found": Backend not running or token file missing
- "Profile not found": Invalid profileId (use tabz_list_profiles to discover)
- "Rate limit exceeded": Too many spawn requests (max 10/minute)`,
    tabz_get_profile: `## tabz_get_profile
Get details of a specific terminal profile.

Retrieves all settings for a single profile including theme, command, working directory, etc.
Use this to inspect a profile before spawning or to check its configuration.

### Parameters
- **profileId** (required): Profile ID or name to retrieve.
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "id": "claude",
  "name": "Claude",
  "category": "AI Assistants",
  "command": "claude",
  "workingDir": "~/projects",
  "themeName": "matrix",
  "fontSize": 14,
  "fontFamily": "JetBrains Mono"
}
\`\`\`

### Examples
- Get by ID: profileId="claude"
- Get by name: profileId="Codex Reviewer"
- JSON output: profileId="claude", response_format="json"

### Error Handling
- "Profile not found": Invalid profileId (use tabz_list_profiles to discover)
- "Cannot connect": Backend not running at localhost:8129`,
    tabz_create_profile: `## tabz_create_profile
Create a new terminal profile.

Profiles define terminal settings that can be reused when spawning terminals.

### Parameters
- **name** (required): Display name for the profile (max 50 chars).
- **command** (optional): Command to run on terminal start (e.g., 'claude', 'npm start').
- **workingDir** (optional): Default working directory for terminals using this profile.
- **category** (optional): Category for organization (e.g., 'AI Assistants', 'Checkpoints').
- **themeName** (optional): Color theme (e.g., 'matrix', 'dracula', 'amber', 'ocean').
- **fontSize** (optional): Font size in pixels (8-32).
- **fontFamily** (optional): Font family (e.g., 'JetBrains Mono', 'Fira Code').

### Examples
- Basic: name="My Claude"
- With command: name="Codex Review", command="claude /codex-review", category="Checkpoints"
- Styled: name="Matrix Terminal", themeName="matrix", fontSize=16

### Notes
The profile ID is auto-generated from the name.

### Cross-references
Use tabz_spawn_profile to use the created profile.

### Error Handling
- "name is required": Missing required name field
- "Cannot connect": Backend not running at localhost:8129`,
    tabz_update_profile: `## tabz_update_profile
Update an existing terminal profile.

Modifies settings of a saved profile. Only specified fields are updated.

### Parameters
- **profileId** (required): ID of the profile to update.
- **updates**: Object with fields to update:
  - name: New display name (max 50 chars)
  - command: New startup command
  - workingDir: New default working directory
  - category: New category
  - themeName: New color theme
  - fontSize: New font size (8-32)
  - fontFamily: New font family

### Examples
- Change theme: profileId="claude", updates={themeName: "dracula"}
- Change command: profileId="my-worker", updates={command: "claude --agent codex-reviewer"}
- Multiple: profileId="dev", updates={category: "Checkpoints", themeName: "amber"}

### Error Handling
- "Profile not found": Invalid profileId
- "Cannot connect": Backend not running at localhost:8129`,
    tabz_delete_profile: `## tabz_delete_profile
Delete a terminal profile.

Permanently removes a profile from TabzChrome.

### Parameters
- **profileId** (required): ID of the profile to delete.

### Destructive Side Effects
**This cannot be undone.** Running terminals using this profile will continue
to work, but the profile will no longer be available for new terminals.

### Behavioral Limits
- Cannot delete the default profile
- Consider using tabz_update_profile to modify instead

### Error Handling
- "Profile not found": Invalid profileId
- "Cannot delete default profile": Default profile cannot be deleted
- "Cannot connect": Backend not running at localhost:8129`,
    // ============================================================
    // SCREENSHOT TOOLS
    // ============================================================
    tabz_screenshot: `## tabz_screenshot
Capture a screenshot of the current browser viewport (what's visible on screen).

Use this tool when you need to see "what I see", "my current view", or "the visible area".
For capturing an entire scrollable page, use tabz_screenshot_full instead.

Captures screenshots via Chrome Extension API (chrome.tabs.captureVisibleTab).
Screenshots are saved to Chrome's Downloads folder and the file path is returned so
Claude can view it with the Read tool.

### Parameters
- **selector** (optional): CSS selector to screenshot a specific element instead of the viewport
- **outputPath** (optional): Custom save path (default: Downloads/screenshot-{timestamp}.png)
- **tabId** (optional): Target tab

### Returns
- success: Whether the screenshot was captured
- filePath: Path to the saved screenshot file (use Read tool to view)

### When to Use
- "Screenshot my view" -> tabz_screenshot (no args)
- "Screenshot that button" -> tabz_screenshot with selector="button.submit"
- "What do I see right now" -> tabz_screenshot (no args)

### When to Use tabz_screenshot_full Instead
- "Screenshot this page" -> use tabz_screenshot_full
- "Capture the entire page" -> use tabz_screenshot_full
- "I want to see the whole page" -> use tabz_screenshot_full

### Error Handling
- "No active tab": No browser tab is open
- "Element not found": Selector doesn't match any element
- "Cannot capture chrome://": Cannot screenshot internal Chrome pages

### Best Practices
After capturing, use the Read tool with the returned filePath to view the screenshot.`,
    tabz_screenshot_full: `## tabz_screenshot_full
Capture a screenshot of the entire scrollable page in one image.

Use this tool when you need to see "the whole page", "entire page", "full page", or "this page".
This captures everything from top to bottom, even content below the fold.

This is the recommended tool when exploring a webpage for the first time, as it shows all content
without needing to scroll and take multiple screenshots.

Captures screenshots via Chrome Extension API by scrolling through the page and
stitching viewport captures together.

### Parameters
- **outputPath** (optional): Custom save path (default: Downloads/screenshot-full-{timestamp}.png)
- **tabId** (optional): Target tab

### When to Use
- "Screenshot this page" -> tabz_screenshot_full
- "Capture the entire page" -> tabz_screenshot_full
- "Show me the whole page" -> tabz_screenshot_full
- "Take a full page screenshot" -> tabz_screenshot_full

### When to Use tabz_screenshot Instead
- "Screenshot my view" -> use tabz_screenshot
- "What's visible right now" -> use tabz_screenshot
- "Screenshot that button" -> use tabz_screenshot with selector

### Error Handling
- "No active tab": No browser tab is open
- "Cannot capture chrome://": Cannot screenshot internal Chrome pages

### Best Practices
After capturing, use the Read tool with the returned filePath to view the screenshot.`,
    tabz_download_image: `## tabz_download_image
Download an image from the browser page and save to local disk.

Extracts and downloads images via Chrome Extension API. It can download
images by CSS selector (from <img> tags or background-image) or by direct URL.

### Parameters
- **selector** (optional): CSS selector for <img> element or element with background-image
- **url** (optional): Direct URL of image to download (use selector OR url, not both)
- **outputPath** (optional): Custom save path (default: ~/ai-images/image-{timestamp}.{ext})

### Returns
- success: Whether the image was downloaded
- filePath: Path to the saved image file (use Read tool to view)

### Examples
- Download by selector: selector="img.hero-image"
- Download by URL: url="https://example.com/image.png"
- First image on page: selector="img"
- Custom path: outputPath="/tmp/downloaded.jpg"

### Error Handling
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129
- "Could not find image URL": Selector doesn't point to an image element
- "Either selector or url required": Must provide one parameter

### Best Practices
After downloading, use the Read tool with the returned filePath to view the image.`,
    // ============================================================
    // SCRIPT TOOLS
    // ============================================================
    tabz_execute_script: `## tabz_execute_script
Execute JavaScript code in the browser tab.

The code runs in the page's JavaScript context with access to:
- document, window, localStorage, sessionStorage
- All page JavaScript (React state, Vue data, etc.)
- DOM manipulation

The return value of the last expression is captured and returned.

### Destructive Side Effects
**WARNING:** This tool can modify page state. Use carefully.

### Parameters
- **code** (required): JavaScript code to execute
- **tabId**: Specific tab to target (default: active tab)
- **allFrames**: Run in all iframes too (default: false)

### Returns
JSON with: success (boolean), result (any), error (string if failed)

### Common Use Cases
- Get page data: "document.title"
- Get form values: "document.querySelector('input').value"
- Get React state: "document.querySelector('[data-reactroot]')?.__reactFiber$"
- Click elements: "document.querySelector('button').click()"
- Read localStorage: "JSON.stringify(localStorage)"
- Get page HTML: "document.documentElement.outerHTML.slice(0, 5000)"

### Examples
- Get page title: code="document.title"
- Get all links: code="[...document.links].map(a => a.href)"
- Check if logged in: code="!!document.querySelector('.user-avatar')"

### Error Handling
- Syntax errors in code will be returned in the error field
- Permission errors occur on chrome:// pages
- Timeout errors if script takes too long

### CLI Quoting (mcp-cli)
When using mcp-cli with complex JS code containing quotes, use heredoc:
\`\`\`
mcp-cli call tabz/tabz_execute_script - <<'EOF'
{"code": "document.querySelector('button').click()"}
EOF
\`\`\`
The <<'EOF' syntax passes JSON literally without bash interpretation.`,
    // ============================================================
    // SESSION TOOLS
    // ============================================================
    tabz_sessions_recently_closed: `## tabz_sessions_recently_closed
List recently closed browser tabs and windows.

Retrieves up to 25 most recently closed tabs and windows that can be restored.
Each item includes a sessionId that can be used with tabz_sessions_restore.

### Parameters
- **maxResults**: Maximum number of sessions to return (1-25, default: 25)
- **response_format**: 'markdown' (default) or 'json'

### Session Types
- tab: A single closed tab with url, title, and sessionId
- window: A closed window with multiple tabs

### Use Cases
- User accidentally closed a tab: List recent closures and restore
- Find a tab closed earlier: Search through the list by title/URL
- Recover a window with multiple tabs: Restore the entire window

### Error Handling
- "Cannot connect": Backend not running at localhost:8129
- Empty list: No recently closed sessions (cleared by Chrome restart)`,
    tabz_sessions_restore: `## tabz_sessions_restore
Restore a recently closed tab or window.

Reopens a closed tab or window. If no sessionId is provided, restores the most
recently closed session.

### Parameters
- **sessionId** (optional): Session ID from tabz_sessions_recently_closed.
  If omitted, restores the most recently closed session.

### Behavior
- Restoring a tab: Opens the tab in the current window
- Restoring a window: Opens a new window with all its tabs
- Already restored: Returns error (session no longer available)

### Examples
- Restore most recent: (no args)
- Restore specific: sessionId="session_abc123"

### Cross-references
Use tabz_sessions_recently_closed to get available sessionIds.

### Error Handling
- "Invalid session ID": Session not found or already restored
- "Cannot connect": Backend not running at localhost:8129`,
    tabz_sessions_devices: `## tabz_sessions_devices
List tabs open on other synced Chrome devices.

Shows tabs from the user's other Chrome instances (phone, laptop, work computer, etc.)
that are signed into the same Google account with Chrome Sync enabled.

### Parameters
- **maxResults**: Maximum number of devices to return (1-10, default: 10)
- **response_format**: 'markdown' (default) or 'json'

### Requirements
- User must be signed into Chrome
- Chrome Sync must be enabled
- Other devices must also have Sync enabled

### Use Cases
- Continue reading on desktop what was open on phone
- Find that article you were reading on another computer
- See what tabs are open on work machine from home

### Behavioral Limits
This shows what's currently open on other devices, not browsing history.
Tabs shown here can be opened locally with tabz_open_url.

### Error Handling
- Empty list: Chrome Sync not enabled or no other signed-in devices
- "Cannot connect": Backend not running at localhost:8129`,
    // ============================================================
    // TAB GROUP TOOLS
    // ============================================================
    tabz_list_groups: `## tabz_list_groups
List all tab groups in the current browser window.

Returns information about all tab groups including their title, color, collapsed state,
and which tabs belong to each group.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "groups": [{
    "groupId": 12345,
    "title": "Research",
    "color": "blue",
    "collapsed": false,
    "tabCount": 3,
    "tabIds": [123, 456, 789]
  }],
  "claudeActiveGroupId": 67890
}
\`\`\`

### Cross-references
- tabz_create_group: Create new groups
- tabz_update_group: Change a group's title, color, or collapsed state

### Error Handling
- Returns empty list if no groups exist
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running`,
    tabz_create_group: `## tabz_create_group
Create a new tab group from specified tabs.

Groups tabs together with an optional title and color. Grouped tabs are visually
connected in Chrome's tab bar and can be collapsed to save space.

### Parameters
- **tabIds** (required): Array of Chrome tab IDs to group together
- **title** (optional): Title displayed on the group (max 50 chars)
- **color** (optional): grey, blue, red, yellow, green, pink, purple, or cyan
- **collapsed** (optional): Whether to collapse the group initially

### Returns
- groupId: The new group's ID (use with tabz_update_group, tabz_add_to_group)
- title, color, tabCount

### Examples
- Create a "Research" group: tabIds=[123, 456], title="Research", color="blue"
- Quick group without title: tabIds=[123, 456]

### Error Handling
- "At least one tabId is required": Provide at least one tab ID
- Invalid tab ID: Ensure tabs exist (use tabz_list_tabs to verify)`,
    tabz_update_group: `## tabz_update_group
Update an existing tab group's properties.

Change a group's title, color, or collapsed state.

### Parameters
- **groupId** (required): The tab group ID to update
- **title** (optional): New title for the group
- **color** (optional): New color: grey, blue, red, yellow, green, pink, purple, or cyan
- **collapsed** (optional): true to collapse, false to expand

### Examples
- Change color: groupId=12345, color="purple"
- Rename and collapse: groupId=12345, title="Done", collapsed=true

### Cross-references
Get group IDs from tabz_list_groups.

### Error Handling
- "No update properties provided": Must provide at least title, color, or collapsed
- Invalid group ID: Use tabz_list_groups to get valid IDs`,
    tabz_add_to_group: `## tabz_add_to_group
Add tabs to an existing tab group.

Moves specified tabs into an existing group.

### Parameters
- **groupId** (required): The tab group ID to add tabs to
- **tabIds** (required): Array of Chrome tab IDs to add to the group

### Examples
- Add one tab: groupId=12345, tabIds=[789]
- Add multiple tabs: groupId=12345, tabIds=[789, 101112]

### Cross-references
- Get group IDs from tabz_list_groups
- Get tab IDs from tabz_list_tabs

### Error Handling
- Invalid group ID: Use tabz_list_groups to get valid IDs
- Invalid tab IDs: Use tabz_list_tabs to get valid tab IDs`,
    tabz_ungroup_tabs: `## tabz_ungroup_tabs
Remove tabs from their groups (ungroup them).

Specified tabs are removed from whatever groups they're in. Empty groups are
automatically deleted by Chrome.

### Parameters
- **tabIds** (required): Array of Chrome tab IDs to remove from their groups

### Examples
- Ungroup one tab: tabIds=[123]
- Ungroup multiple tabs: tabIds=[123, 456, 789]

### Behavioral Limits
Tabs not in groups: No error, operation just has no effect.

### Error Handling
- Invalid tab IDs: Use tabz_list_tabs to get valid tab IDs`,
    tabz_claude_group_add: `## tabz_claude_group_add
Add a tab to the "Claude Active" group.

Automatically creates a purple "Claude" group if it doesn't exist, then adds
the specified tab to it. Use this to visually highlight tabs you're working with.

### Parameters
- **tabId** (required): Chrome tab ID to add to the Claude group

### Behavior
The Claude Active group has a distinctive purple color and "Claude" title,
making it easy to see which tabs are being worked on.

### Examples
- Mark a tab as active: tabId=123456789

### Cross-references
- tabz_claude_group_remove: When done with a tab
- tabz_claude_group_status: See all tabs in the Claude group`,
    tabz_claude_group_remove: `## tabz_claude_group_remove
Remove a tab from the "Claude Active" group.

Ungroups the specified tab from the Claude group. If this was the last tab
in the group, the group is automatically deleted.

### Parameters
- **tabId** (required): Chrome tab ID to remove from the Claude group

### Examples
- Unmark a tab: tabId=123456789`,
    tabz_claude_group_status: `## tabz_claude_group_status
Get the status of the "Claude Active" group.

Shows whether the Claude group exists and which tabs are in it.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns
- exists: Whether the Claude group exists
- groupId: The group ID (if exists)
- tabCount: Number of tabs in the group
- tabIds: Array of tab IDs in the group`,
    // ============================================================
    // TAB TOOLS
    // ============================================================
    tabz_list_tabs: `## tabz_list_tabs
List all open browser tabs with ACCURATE active tab detection.

Returns information about all non-chrome:// tabs currently open in the browser.
Uses Chrome Extension API to detect which tab the user actually has focused.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "total": 3,
  "claudeCurrentTabId": 1762556601,
  "tabs": [
    { "tabId": 1762556600, "url": "...", "title": "...", "active": false },
    { "tabId": 1762556601, "url": "...", "title": "...", "active": true }
  ]
}
\`\`\`

### Key Fields
- tabId: Chrome's internal tab ID (large number like 1762556601)
- active: TRUE on whichever tab the USER has focused in Chrome right now
- claudeCurrentTabId: Which tab Claude will target for operations

The "active" field shows the user's ACTUAL focused tab. After calling this tool,
Claude's target is synced to match the user's active tab.

### Cross-references
- tabz_switch_tab: Switch to a specific tab using the tabId
- tabz_rename_tab: Assign stable custom names for easier identification

### Error Handling
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129
- Empty list: No web pages open (only chrome:// pages)`,
    tabz_switch_tab: `## tabz_switch_tab
Switch to a specific browser tab.

Brings the specified tab to the front/focus and sets it as Claude's current target
for subsequent operations (screenshots, clicks, fills, etc.).

### Parameters
- **tabId** (required): Chrome tab ID from tabz_list_tabs (e.g., 1762556601)

### Best Practices
Before switching between multiple tabs, use tabz_rename_tab to assign custom names
(e.g., "GitHub PR", "Dev Server", "Docs"). Custom names are stored by URL and persist
even if tab IDs change.

### Cross-references
- Use tabz_list_tabs first to get available tab IDs
- After switching, use tabz_get_page_info to confirm the current page

### Error Handling
- "Invalid tab ID": tabId doesn't exist (use tabz_list_tabs to see valid IDs)
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    tabz_rename_tab: `## tabz_rename_tab
Assign a custom name to a browser tab.

Custom names make it easier to identify tabs when working with multiple pages.
Names are stored by URL, so they persist even if tab order changes.
Names are session-based and reset when the MCP server restarts.

### Why Rename
1. Stable identification even if tabs are opened/closed (names stay with URLs)
2. Clear visual feedback about which tab you're targeting
3. Better communication with the user about which tab you're working on

### Parameters
- **tabId** (required): Chrome tab ID from tabz_list_tabs (e.g., 1762556601)
- **name** (required): Custom name for the tab. Empty string clears the custom name.

### Examples
- Name a tab: tabId=1762556601, name="GitHub PR"
- Name dev server: tabId=1762556602, name="Dev Server (localhost:3000)"
- Clear custom name: tabId=1762556601, name=""

### Cross-references
After renaming, use tabz_list_tabs to see the updated names.

### Error Handling
- "Invalid tab ID": tabId doesn't exist (use tabz_list_tabs to see valid IDs)`,
    // ============================================================
    // TERMINAL TOOLS
    // ============================================================
    tabz_list_terminals: `## tabz_list_terminals
List running terminals in TabzChrome.

Shows all terminal sessions managed by TabzChrome, including Claude workers,
bash terminals, and other processes spawned via profiles.

### Parameters
- **state**: Filter by state - 'active', 'disconnected', or 'all' (default)
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "total": 5,
  "terminals": [{
    "id": "ctt-vanilla-claude-abc123",
    "name": "BD-xyz",
    "terminalType": "claude-code",
    "state": "active",
    "workingDir": "~/projects/.worktrees/BD-xyz",
    "createdAt": "2024-01-15T10:30:00Z"
  }]
}
\`\`\`

### Examples
- List all terminals: (no args needed)
- Active only: state="active"
- JSON output: response_format="json"

### Cross-references
Use this to find terminal IDs/names for tabz_send_keys or tabz_capture_terminal.

### Error Handling
- "Cannot connect": Backend not running at localhost:8129 (run ./scripts/dev.sh)`,
    tabz_send_keys: `## tabz_send_keys
Send text/keys to a terminal.

Sends keystrokes to a running terminal, like typing in the terminal.
Uses tmux send-keys with configurable delay for Claude terminals.

### Parameters
- **terminal** (required): Terminal name or ID (use tabz_list_terminals to find).
- **text** (required): Text to send to the terminal.
- **execute**: Whether to press Enter after text (default: true).
- **delay**: Milliseconds to wait before Enter (default: 600ms).

### Delay Parameter
The delay parameter is important for Claude terminals - it prevents the Enter
from being processed before the full text is received. Default 600ms works for
most prompts; use 800-1000ms for very long prompts.

### Examples
- Send prompt to Claude: terminal="BD-xyz", text="Fix the bug in auth.ts"
- Paste without Enter: terminal="dev-server", text="npm install", execute=false
- Long prompt: terminal="worker-1", text="...", delay=500

### Error Handling
- "Terminal not found": Invalid name/ID (use tabz_list_terminals)
- "Auth token not found": Backend not running
- "Terminal not active": Terminal is disconnected`,
    tabz_capture_terminal: `## tabz_capture_terminal
Capture recent output from a terminal.

Gets the last N lines of output from a terminal's scrollback buffer.
Useful for checking what a Claude worker is doing or debugging issues.

### Parameters
- **terminal** (required): Terminal name or ID (use tabz_list_terminals to find).
- **lines**: Number of lines to capture (default: 50, max: 1000).

### Returns
Terminal output as plain text (scrollback content).

### Examples
- Check worker progress: terminal="BD-xyz"
- Get more context: terminal="dev-server", lines=200
- Recent activity: terminal="worker-1", lines=20

### Behavioral Limits
This uses tmux capture-pane under the hood. Only works for
terminals backed by tmux sessions (all TabzChrome terminals are).

### Error Handling
- "Terminal not found": Invalid name/ID
- "Capture failed": tmux session may have been killed externally`,
    // ============================================================
    // WINDOW TOOLS
    // ============================================================
    tabz_list_windows: `## tabz_list_windows
List all Chrome windows with their properties.

Returns information about all open browser windows including dimensions, state,
and tab counts.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "windows": [{
    "windowId": 123,
    "focused": true,
    "state": "normal",
    "type": "normal",
    "width": 1920,
    "height": 1080,
    "left": 0,
    "top": 0,
    "incognito": false,
    "tabCount": 5
  }]
}
\`\`\`

### Cross-references
- tabz_create_window: Create new windows
- tabz_update_window: Resize, move, or change state
- tabz_tile_windows: Auto-arrange windows

### Error Handling
- "Cannot connect": Ensure TabzChrome extension is installed and backend is running`,
    tabz_create_window: `## tabz_create_window
Create a new Chrome browser window.

Opens a new window with optional URL(s), position, and size. Use type="popup"
for minimal UI (no address bar/toolbar) - ideal for terminal popouts.

### Terminal Sidebar Popout
Use '/sidepanel/sidepanel.html' as url to open the terminal sidebar
in a standalone popup window - this avoids duplicate extension issues!

### Parameters
- **url** (optional): URL or array of URLs to open. Use '/sidepanel/sidepanel.html' for terminals.
- **type** (optional): 'normal' (full UI) or 'popup' (minimal UI). Default: 'normal'.
- **state** (optional): 'normal', 'minimized', 'maximized', 'fullscreen'. Default: 'normal'.
- **focused** (optional): Focus window on creation. Default: true.
- **width, height** (optional): Window dimensions in pixels.
- **left, top** (optional): Window position (use tabz_get_displays for multi-monitor).
- **incognito** (optional): Create incognito window.
- **tabId** (optional): Move existing tab to new window instead of opening URLs.

### Examples
- Popup terminal: url="/sidepanel/sidepanel.html", type="popup", width=500, height=700
- Normal window: url="https://github.com", width=1200, height=800
- On second monitor: left=1920, top=0, width=800, height=600

### Returns
- windowId: New window ID for subsequent operations
- Window properties (type, state, dimensions)

### Error Handling
- Invalid URL: Check URL format
- "Cannot create": Check browser permissions`,
    tabz_update_window: `## tabz_update_window
Update a Chrome window's properties.

Resize, move, change state (minimize/maximize), or focus a window.

### Parameters
- **windowId** (required): Window ID to update
- **state** (optional): 'normal', 'minimized', 'maximized', 'fullscreen'
- **focused** (optional): true to bring window to front
- **width, height** (optional): New dimensions (ignored if maximized/fullscreen)
- **left, top** (optional): New position for multi-monitor placement
- **drawAttention** (optional): Flash/highlight the window

### Examples
- Focus window: windowId=123, focused=true
- Maximize: windowId=123, state="maximized"
- Resize & move: windowId=123, width=800, height=600, left=100, top=100
- Minimize: windowId=123, state="minimized"

### Cross-references
Get window IDs from tabz_list_windows.

### Error Handling
- Invalid window ID: Use tabz_list_windows to get valid IDs
- "No update properties": Provide at least one property to change`,
    tabz_close_window: `## tabz_close_window
Close a Chrome window.

### Destructive Side Effects
**WARNING:** This closes the entire window including ALL tabs in it!
Use with caution.

### Parameters
- **windowId** (required): Window ID to close

### Cross-references
Get window IDs from tabz_list_windows.

### Error Handling
- Invalid window ID: Use tabz_list_windows to get valid IDs
- Cannot close last window: Chrome requires at least one window`,
    tabz_get_displays: `## tabz_get_displays
Get information about connected monitors/displays.

Returns detailed information about all displays including dimensions, positions,
and work areas (excluding taskbar). Essential for multi-monitor window placement.

### Parameters
- **response_format**: 'markdown' (default) or 'json'

### Returns (JSON format)
\`\`\`json
{
  "displays": [{
    "id": "0",
    "name": "Built-in Retina Display",
    "isPrimary": true,
    "bounds": { "left": 0, "top": 0, "width": 1920, "height": 1080 },
    "workArea": { "left": 0, "top": 0, "width": 1920, "height": 1040 }
  }]
}
\`\`\`

### Key Concepts
- bounds: Full display area
- workArea: Usable area excluding taskbar/dock
- left/top: Position for multi-monitor setups (e.g., left=1920 for second monitor)

### Cross-references
Use with tabz_create_window or tabz_tile_windows for multi-monitor layouts.`,
    tabz_tile_windows: `## tabz_tile_windows
Auto-arrange windows in a tiled layout.

Positions multiple windows side-by-side, stacked, or in a grid within a display's work area.

### Parameters
- **windowIds** (required): Array of window IDs to tile (1-20 windows)
- **layout** (optional): 'horizontal' (side by side), 'vertical' (stacked), 'grid' (auto). Default: 'horizontal'.
- **displayId** (optional): Target display ID from tabz_get_displays. Default: primary.
- **gap** (optional): Pixels between windows. Default: 0.

### Layout Examples
- horizontal (2 windows): [Left Half] [Right Half]
- vertical (2 windows): [Top Half] / [Bottom Half]
- grid (4 windows): [1][2] / [3][4]

### Examples
- Side by side: windowIds=[123, 456], layout="horizontal"
- Three-way split: windowIds=[123, 456, 789], layout="horizontal"
- Grid with gap: windowIds=[1,2,3,4], layout="grid", gap=10
- On second monitor: windowIds=[123, 456], displayId="1"

### Error Handling
- Invalid window IDs: Use tabz_list_windows to get valid IDs
- Window minimized: Will be restored to normal state before tiling`,
    tabz_popout_terminal: `## tabz_popout_terminal
Pop out the terminal sidebar to a standalone popup window.

Creates a new popup window containing the TabzChrome terminal UI. This allows
running terminals in multiple windows WITHOUT duplicate extension issues - all
windows share the same extension instance.

### Advantages Over Duplicate Extensions
- Single WebSocket connection to backend
- No terminal session conflicts
- Shared state and settings
- Multiple terminal views in different windows

### Parameters
- **terminalId** (optional): Focus specific terminal in new window
- **width** (optional): Window width. Default: 500.
- **height** (optional): Window height. Default: 700.
- **left, top** (optional): Window position

### Examples
- New terminal window: {} (no args)
- Specific terminal: terminalId="ctt-default-abc123"
- Positioned: width=600, height=800, left=100, top=100

### Use Cases
- Multiple terminal views on different monitors
- Keep terminals visible while browsing
- Parallel terminal sessions without conflicts

### Returns
- windowId: New window ID for management
- terminalId: Which terminal is focused (if specified)`,
};
//# sourceMappingURL=tool-docs.js.map