# Tabz MCP Workflow Patterns

Common multi-step workflows for browser automation tasks.

## Screenshot a Specific Tab

When user wants to capture a tab that isn't currently active:

```bash
# 1. List all tabs to find the target (returns Chrome tab IDs like 1762556601)
mcp-cli call tabz/tabz_list_tabs '{}'
# Look for "active: true" to see which tab user has focused
# Use the tabId (large number) for the tab you want

# 2. Switch to the target tab (use actual tabId from step 1)
mcp-cli call tabz/tabz_switch_tab '{"tabId": 1762556601}'

# 3. Take the screenshot
mcp-cli call tabz/tabz_screenshot '{}'

# 4. Display the image (use returned path)
# Use Read tool on the returned file path
```

## Fill and Submit a Form

Automate form completion:

```bash
# 1. Fill each field
mcp-cli call tabz/tabz_fill '{"selector": "#username", "value": "myuser"}'
mcp-cli call tabz/tabz_fill '{"selector": "#password", "value": "mypass"}'

# 2. Click submit
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]"}'

# 3. Optional: Screenshot the result
mcp-cli call tabz/tabz_screenshot '{}'
```

## Capture and Inspect API Calls

Monitor network requests to understand what APIs a page uses:

```bash
# 1. Enable network capture FIRST (before page makes requests)
mcp-cli call tabz/tabz_enable_network_capture '{}'

# 2. Navigate or interact with the page
# (user interaction or tabz_click/tabz_fill)

# 3. List captured requests (includes URL, method, status, timing)
mcp-cli call tabz/tabz_get_network_requests '{}'

# 4. Filter for specific patterns
mcp-cli call tabz/tabz_get_network_requests '{"filter": "api.github.com"}'
```

## Find Failed API Requests

Debug 4xx/5xx errors:

```bash
# 1. Enable capture
mcp-cli call tabz/tabz_enable_network_capture '{}'

# 2. Reproduce the issue (interact with page)

# 3. Filter for errors
mcp-cli call tabz/tabz_get_network_requests '{"statusFilter": "error"}'

# 4. Clear captured requests when done
mcp-cli call tabz/tabz_clear_network_requests '{}'
```

## Debug Page Errors

Investigate JavaScript errors:

```bash
# 1. Get console errors
mcp-cli call tabz/tabz_get_console_logs '{"level": "error"}'

# 2. Execute JS to inspect state
mcp-cli call tabz/tabz_execute_script '{"code": "window.myApp.state"}'

# 3. Get element details if needed
mcp-cli call tabz/tabz_get_element '{"selector": "#error-container", "includeStyles": true}'
```

## Download Generated Content

For AI tools that generate images (DALL-E, Midjourney, etc.):

```bash
# 1. Fill the prompt
mcp-cli call tabz/tabz_fill '{"selector": "textarea", "value": "a cat astronaut"}'

# 2. Click generate
mcp-cli call tabz/tabz_click '{"selector": "button.generate"}'

# 3. Wait for generation (may need to poll or wait)

# 4. Download the result image
mcp-cli call tabz/tabz_download_image '{"selector": "img.result"}'
```

## Download AI Images from ChatGPT/Copilot

AI image platforms use CDN URLs with auth tokens. The tool extracts full URLs automatically.

### Quick Download (Thumbnail Grid)

```bash
# ChatGPT images (library or chat)
mcp-cli call tabz/tabz_download_image '{"selector": "img[src*=\"oaiusercontent.com\"]"}'

# Generic CDN images
mcp-cli call tabz/tabz_download_image '{"selector": "img[src*=\"cdn\"]"}'
```

**Caveat:** `selector: "img"` alone often matches profile avatars first. Use specific selectors.

### Full-Resolution from Expanded View

When user clicks an image to expand it (modal view), the full-res version becomes available:

```bash
# Step 1: User clicks image to open modal/expanded view

# Step 2: Find the modal image with execute_script
mcp-cli call tabz/tabz_execute_script - <<'EOF'
{"code": "const img = document.querySelector('[role=\"dialog\"] img[src*=\"oaiusercontent\"]'); img ? {src: img.src, w: img.naturalWidth, h: img.naturalHeight} : null"}
EOF

# Step 3: Download using the extracted URL
mcp-cli call tabz/tabz_download_file '{"url": "<url-from-step-2>", "filename": "my-image.png"}'
```

### Find Largest Image on Page

When multiple images exist, find the highest resolution:

```bash
mcp-cli call tabz/tabz_execute_script - <<'EOF'
{"code": "const imgs = Array.from(document.querySelectorAll('img[src*=\"oaiusercontent\"]')).map(i => ({src: i.src, w: i.naturalWidth, h: i.naturalHeight})).filter(i => i.w > 500).sort((a,b) => b.w - a.w); imgs[0]"}
EOF
```

### Platform-Specific Selectors

| Platform | Selector | Notes |
|----------|----------|-------|
| ChatGPT | `img[src*="oaiusercontent.com"]` | Both library and chat |
| ChatGPT Modal | `[role="dialog"] img[src*="oaiusercontent"]` | Expanded full-res view |
| Copilot/DALL-E | `img[src*="bing.com"]` | May vary |
| Generic CDN | `img[src*="cdn"]` | Fallback pattern |

### Workflow: Download All Images from ChatGPT Library

```bash
# 1. Get all image URLs
mcp-cli call tabz/tabz_execute_script - <<'EOF'
{"code": "Array.from(document.querySelectorAll('img[src*=\"oaiusercontent\"]')).filter(i => i.naturalWidth > 200).map(i => i.src)"}
EOF

# 2. Download each URL using tabz_download_file
# (iterate through returned URLs)
```

## Monitor Long-Running Downloads

Track download progress:

```bash
# 1. Start a download
mcp-cli call tabz/tabz_download_file '{"url": "https://example.com/large-file.zip"}'

# 2. Check download status
mcp-cli call tabz/tabz_get_downloads '{}'

# 3. Cancel if needed
mcp-cli call tabz/tabz_cancel_download '{"downloadId": 12345}'
```

## Rename Tabs for Easy Reference

When working with multiple similar tabs:

```bash
# 1. List tabs (get actual Chrome tab IDs)
mcp-cli call tabz/tabz_list_tabs '{}'

# 2. Rename for clarity using actual tabIds (persists by URL)
mcp-cli call tabz/tabz_rename_tab '{"tabId": 1762556600, "name": "Prod Dashboard"}'
mcp-cli call tabz/tabz_rename_tab '{"tabId": 1762556601, "name": "Staging Dashboard"}'

# 3. Now list shows custom names
mcp-cli call tabz/tabz_list_tabs '{}'
```

## Organize Tabs into Groups

**Always group related tabs** when working with multiple pages. This keeps the browser organized.

### Claim Your Own Group (Parallel Workers)

**CRITICAL:** When multiple Claude workers run in parallel, each must create their own unique named group. The shared Claude Active group will cause conflicts.

```bash
# 1. List tabs to get IDs
mcp-cli call tabz/tabz_list_tabs '{}'

# 2. Create a group with YOUR unique identifier (issue ID, worker name, etc.)
mcp-cli call tabz/tabz_create_group '{"tabIds": [1762556600, 1762556601], "title": "TabzChrome-abc: Docs", "color": "blue"}'

# 3. Note the groupId from response (e.g., 67890) for adding more tabs later
mcp-cli call tabz/tabz_add_to_group '{"groupId": 67890, "tabIds": [1762556602]}'

# 4. When done, ungroup to clean up
mcp-cli call tabz/tabz_ungroup_tabs '{"tabIds": [1762556600, 1762556601, 1762556602]}'
```

### Claude Active Group (Single Worker Only)

Only use this when you're the ONLY Claude session running:

```bash
# Single worker can use shared Claude group
mcp-cli call tabz/tabz_claude_group_add '{"tabId": 1762556600}'
mcp-cli call tabz/tabz_claude_group_status '{}'
mcp-cli call tabz/tabz_claude_group_remove '{"tabId": 1762556600}'
```

### Create Named Groups for Research

For research tasks or comparing multiple pages:

```bash
# 1. List tabs to get IDs
mcp-cli call tabz/tabz_list_tabs '{}'

# 2. Group related tabs with descriptive name
mcp-cli call tabz/tabz_create_group '{"tabIds": [1762556600, 1762556601, 1762556602], "title": "API Docs Research", "color": "blue"}'

# 3. Add more tabs later as you find them
mcp-cli call tabz/tabz_add_to_group '{"groupId": 12345, "tabIds": [1762556603]}'

# 4. Collapse group to save space when not actively using
mcp-cli call tabz/tabz_update_group '{"groupId": 12345, "collapsed": true}'

# 5. Expand when you need it again
mcp-cli call tabz/tabz_update_group '{"groupId": 12345, "collapsed": false}'
```

### Compare Two Implementations

When comparing similar pages side by side:

```bash
# Group the comparison tabs
mcp-cli call tabz/tabz_create_group '{"tabIds": [1762556600, 1762556601], "title": "Compare: v1 vs v2", "color": "green"}'

# Screenshot both for side-by-side analysis
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762556600}'
mcp-cli call tabz/tabz_screenshot '{"tabId": 1762556601}'
```

### Clean Up After Task

When finishing a task:

```bash
# Option 1: Ungroup tabs (leaves them open)
mcp-cli call tabz/tabz_ungroup_tabs '{"tabIds": [1762556600, 1762556601]}'

# Option 2: Just remove from Claude group if using that
mcp-cli call tabz/tabz_claude_group_status '{}'
# Then remove each tab ID returned
```

## Selector Tips

Common CSS selector patterns:

| Pattern | Example | Matches |
|---------|---------|---------|
| ID | `#submit-btn` | `<button id="submit-btn">` |
| Class | `.nav-link` | `<a class="nav-link">` |
| Tag | `textarea` | All `<textarea>` elements |
| Attribute | `input[type="email"]` | `<input type="email">` |
| Descendant | `.form input` | Inputs inside `.form` |
| First match | `button` | First button on page |
| Nth child | `li:nth-child(2)` | Second list item |
| Contains text | `button:contains("Submit")` | Button with "Submit" text |

**Finding selectors:**
1. Use `tabz_get_element` with a broad selector to inspect structure
2. Right-click in Chrome DevTools > Copy > Copy selector
3. Use `tabz_execute_script` to query: `document.querySelectorAll('.my-class').length`

## Demo/Presentation Helpers

### Smooth Auto-Scroll (for recordings)

Scroll the entire page smoothly over a set duration - great for demo videos:

```bash
# Scroll entire page over 8 seconds
mcp-cli call tabz/tabz_execute_script '{"script": "(async () => { const h = document.body.scrollHeight; const d = 8000; const s = performance.now(); const f = () => { const p = Math.min((performance.now() - s) / d, 1); window.scrollTo(0, h * p); if (p < 1) requestAnimationFrame(f); }; f(); })()"}'

# Faster scroll (4 seconds)
mcp-cli call tabz/tabz_execute_script '{"script": "(async () => { const h = document.body.scrollHeight; const d = 4000; const s = performance.now(); const f = () => { const p = Math.min((performance.now() - s) / d, 1); window.scrollTo(0, h * p); if (p < 1) requestAnimationFrame(f); }; f(); })()"}'

# Scroll back to top
mcp-cli call tabz/tabz_execute_script '{"script": "window.scrollTo({top: 0, behavior: \"smooth\"})"}'
```

### Scroll to Specific Section

```bash
# Scroll to element smoothly
mcp-cli call tabz/tabz_execute_script '{"script": "document.querySelector(\"#features\").scrollIntoView({behavior: \"smooth\"})"}'
```
