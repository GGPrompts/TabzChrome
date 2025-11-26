# Browser MCP - Quick Tool Runner

Display this numbered menu and prompt for selection:

```
Browser MCP Tools:
───────────────────────────────────────
 1. Page Info      - Get URL & title of current tab
 2. Screenshot     - Capture page/element to disk
 3. Click          - Click element by CSS selector
 4. Fill           - Type text into input field
 5. Execute JS     - Run JavaScript in browser
 6. Console Logs   - View browser console output
 7. List Tabs      - Show all open tabs
 8. Switch Tab     - Focus a different tab
 9. Rename Tab     - Assign custom name to tab
10. Open URL       - Navigate (GitHub/Vercel/localhost)
11. Inspect Element - Get HTML/CSS for debugging
12. Download Image - Save image from page
───────────────────────────────────────
```

Use AskUserQuestion with a single question asking which tool (1-12). Use these options:
- "Quick actions (1-4)"
- "Advanced (5-12)"

The user will type the number via "Other".

## After Selection - Prompt for Parameters

Based on the number entered, prompt for required parameters:

| Tool | Required Params | Optional |
|------|-----------------|----------|
| 1. Page Info | (none) | tabId |
| 2. Screenshot | (none) | selector, fullPage, tabId |
| 3. Click | selector | tabId |
| 4. Fill | selector, value | tabId |
| 5. Execute JS | code | tabId |
| 6. Console Logs | (none) | level (error/warn/all), tabId |
| 7. List Tabs | (none) | - |
| 8. Switch Tab | tabId | - |
| 9. Rename Tab | tabId, name | - |
| 10. Open URL | url | newTab, background |
| 11. Inspect Element | selector | includeStyles, tabId |
| 12. Download Image | selector OR url | tabId |

For tools with required params, use AskUserQuestion with example options + "Other" for custom input.

**Selector examples:** `#id`, `.class`, `button`, `input[type="text"]`, `textarea`
**URL examples:** `github.com/user/repo`, `localhost:3000`, `my-app.vercel.app`

## Tool Execution

Execute the corresponding MCP tool:
- 1 → `mcp__browser__browser_get_page_info`
- 2 → `mcp__browser__browser_screenshot`
- 3 → `mcp__browser__browser_click`
- 4 → `mcp__browser__browser_fill`
- 5 → `mcp__browser__browser_execute_script`
- 6 → `mcp__browser__browser_get_console_logs`
- 7 → `mcp__browser__browser_list_tabs`
- 8 → `mcp__browser__browser_switch_tab`
- 9 → `mcp__browser__browser_rename_tab`
- 10 → `mcp__browser__browser_open_url`
- 11 → `mcp__browser__browser_get_element`
- 12 → `mcp__browser__browser_download_image`

## After Execution

1. Show results clearly (format nicely)
2. For screenshots: offer to view the file with Read tool
3. Ask: "Run another? (y/number/n)" - if they type a number, go directly to that tool

## Quick Reference

If user asks for help or types "help", show `browser-mcp-server/MCP_TOOLS.md`
