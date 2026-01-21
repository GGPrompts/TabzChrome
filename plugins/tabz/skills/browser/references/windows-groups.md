# Windows & Tab Groups

Tools for managing Chrome windows and tab groups.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

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
