# Tabz MCP - Quick Tool Runner

Display this menu and ask user to pick a tool:

```
Tabz MCP Tools:
───────────────────────────────────────
 1. Page Info       - URL & title of current tab
 2. Screenshot      - Capture page to ~/ai-images/
 3. Click           - Click element (CSS selector)
 4. Fill            - Type into input field
 5. Execute JS      - Run JavaScript in browser
 6. Console Logs    - Browser console output
 7. List Tabs       - Show all open tabs
 8. Switch Tab      - Focus different tab (*)
 9. Rename Tab      - Custom name for tab listing
10. Open URL        - GitHub/Vercel/localhost only
11. Inspect Element - HTML/CSS for debugging
12. Download Image  - Save image from page
───────────────────────────────────────
(*) After switching, all tools auto-target that tab
```

Use AskUserQuestion with options:
- "Page/Screenshot (1-2)"
- "Interact (3-4)"
- "Debug (5-6)"
- "Tabs (7-9)"
- "Other (10-12)"

User types the number via "Other" or you infer from category.

## After Selection - Prompt for Parameters

Based on the number entered, prompt for required parameters:

| Tool | Required | Optional | Notes |
|------|----------|----------|-------|
| 1. Page Info | - | tabId | |
| 2. Screenshot | - | selector, fullPage | Returns WSL path |
| 3. Click | selector | - | Waits up to 5s |
| 4. Fill | selector, value | - | Clears field first |
| 5. Execute JS | code | allFrames | Return value captured |
| 6. Console Logs | - | level, limit | level: error/warn/all |
| 7. List Tabs | - | - | Shows custom names |
| 8. Switch Tab | tabId | - | **Sets current tab** |
| 9. Rename Tab | tabId, name | - | MCP-only, not Chrome UI |
| 10. Open URL | url | newTab, background | Allowed domains only |
| 11. Inspect Element | selector | includeStyles | Full CSS computed |
| 12. Download Image | selector OR url | - | Returns WSL path |

**Important:** After `Switch Tab`, all subsequent tools auto-target that tab (no need to pass tabId).

For required params, use AskUserQuestion with example options + "Other" for custom input.

**Selector examples:** `#id`, `.class`, `button`, `input[type="text"]`, `textarea`
**URL examples:** `github.com/user/repo`, `localhost:3000`, `my-app.vercel.app`

## Tool Execution

Execute the corresponding MCP tool:
- 1 → `mcp__tabz__tabz_get_page_info`
- 2 → `mcp__tabz__tabz_screenshot`
- 3 → `mcp__tabz__tabz_click`
- 4 → `mcp__tabz__tabz_fill`
- 5 → `mcp__tabz__tabz_execute_script`
- 6 → `mcp__tabz__tabz_get_console_logs`
- 7 → `mcp__tabz__tabz_list_tabs`
- 8 → `mcp__tabz__tabz_switch_tab`
- 9 → `mcp__tabz__tabz_rename_tab`
- 10 → `mcp__tabz__tabz_open_url`
- 11 → `mcp__tabz__tabz_get_element`
- 12 → `mcp__tabz__tabz_download_image`

## After Execution

1. Show results clearly (format output nicely)
2. For screenshots/images: **automatically use Read tool** to display the image
3. Ask: "Run another? (y/number/n)" - if number, go directly to that tool

## Common Workflows

**Screenshot a specific tab:**
1. List Tabs (7) → find tabId
2. Switch Tab (8) → focus it
3. Screenshot (2) → captures that tab

**Fill and submit a form:**
1. Fill (4) → enter text
2. Click (3) → submit button

**Debug page errors:**
1. Console Logs (6) with level=error
2. Execute JS (5) to inspect state

## Quick Reference

If user asks for help, show `tabz-mcp-server/MCP_TOOLS.md`
