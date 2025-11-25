# TerminalTabz Browser MCP - Interactive Tool Runner

Present an interactive menu of Browser MCP tools and execute them based on user selection.

## Workflow

1. **Show tool categories** and use AskUserQuestion to let user select a tool:
   - **Navigation**: Open URLs, switch tabs, list tabs
   - **Interaction**: Click elements, fill forms
   - **Inspection**: Get page info, inspect elements, console logs
   - **Capture**: Screenshots, download images
   - **Scripting**: Execute JavaScript

2. **After user selects a tool**, prompt for required parameters using AskUserQuestion

3. **Execute the selected MCP tool** with provided parameters

4. **Show results** in a clear, formatted way

5. **Offer to run another command** or exit

## Available Tools by Category

### Navigation
- **browser_open_url**: Open allowed URLs (GitHub, GitLab, Vercel, localhost)
  - Params: url (required), newTab (optional), background (optional)
- **browser_list_tabs**: List all open browser tabs
  - Params: response_format (optional: markdown/json)
- **browser_switch_tab**: Switch to a specific tab
  - Params: tabId (required)

### Interaction
- **browser_click**: Click an element on the page
  - Params: selector (required CSS selector)
- **browser_fill**: Fill an input field with text
  - Params: selector (required), value (required)

### Inspection
- **browser_get_page_info**: Get current page URL and title
  - Params: tabId (optional)
- **browser_get_element**: Get element HTML, styles, bounds for CSS debugging
  - Params: selector (required), includeStyles (optional), styleProperties (optional)
- **browser_get_console_logs**: Get console logs from browser
  - Params: level (optional: all/log/info/warn/error), limit (optional), since (optional), tabId (optional)

### Capture
- **browser_screenshot**: Capture screenshot to local disk
  - Params: selector (optional), fullPage (optional), outputPath (optional)
- **browser_download_image**: Download image from page
  - Params: selector (optional), url (optional), outputPath (optional)

### Scripting
- **browser_execute_script**: Execute JavaScript in browser tab
  - Params: code (required), tabId (optional), allFrames (optional)

## Implementation Notes

- Use AskUserQuestion with clear option labels and descriptions
- For text inputs (URLs, selectors, code), use "Other" to get custom input
- Show examples in option descriptions
- Format results nicely (use markdown formatting)
- Handle errors gracefully with clear messages
- After executing, ask if user wants to run another MCP command

## Example Flow

```
User runs: /ttmcp

Claude asks: "What would you like to do?"
Options:
- Open URL (Navigate to GitHub, Vercel, localhost)
- Take Screenshot (Capture page or element)
- Click Element (Click button or link)
- Fill Form (Enter text in input field)
- Get Page Info (See current URL and title)
- ... more options

User selects: "Open URL"

Claude asks: "Which URL?"
- github.com/user/repo
- localhost:3000
- my-app.vercel.app
- Other (custom URL)

User types: "github.com/GGPrompts/TabzChrome"

Claude executes: mcp__browser__browser_open_url({ url: "github.com/GGPrompts/TabzChrome" })

Claude shows result: "✅ Opened https://github.com/GGPrompts/TabzChrome in new tab"

Claude asks: "Run another MCP command?"
```

IMPORTANT: Be helpful and educational - explain what each tool does and show examples!
