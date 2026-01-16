---
name: discovering-mcp-tools
description: "Lists and inspects available TabzChrome MCP tools. Use when the user asks 'what tabz tools are available', 'list MCP tools', 'find browser automation tools', or needs to discover tool schemas before using them."
---

# MCP Discovery

Discover and inspect available TabzChrome MCP tools.

## List All Tabz Tools

```bash
mcp-cli tools tabz
```

## Search Tools

```bash
mcp-cli grep "screenshot"
mcp-cli grep "download"
mcp-cli grep "audio"
```

## Inspect Tool Schema

**Always check schema before using a tool:**

```bash
mcp-cli info tabz/tabz_screenshot
mcp-cli info tabz/tabz_click
mcp-cli info tabz/tabz_speak
```

## Tool Categories (70 Tools)

### Tabs & Navigation (5)
`tabz_list_tabs`, `tabz_switch_tab`, `tabz_rename_tab`, `tabz_get_page_info`, `tabz_open_url`

### Tab Groups (8)
`tabz_list_groups`, `tabz_create_group`, `tabz_update_group`, `tabz_add_to_group`, `tabz_ungroup_tabs`, `tabz_claude_group_add`, `tabz_claude_group_remove`, `tabz_claude_group_status`

### Windows & Displays (7)
`tabz_list_windows`, `tabz_create_window`, `tabz_update_window`, `tabz_close_window`, `tabz_get_displays`, `tabz_tile_windows`, `tabz_popout_terminal`

### Screenshots (2)
`tabz_screenshot`, `tabz_screenshot_full`

### Interaction (4)
`tabz_click`, `tabz_fill`, `tabz_get_element`, `tabz_execute_script`

### DOM & Debugging (4)
`tabz_get_dom_tree`, `tabz_get_console_logs`, `tabz_profile_performance`, `tabz_get_coverage`

### Network (3)
`tabz_enable_network_capture`, `tabz_get_network_requests`, `tabz_clear_network_requests`

### Downloads (5)
`tabz_download_image`, `tabz_download_file`, `tabz_get_downloads`, `tabz_cancel_download`, `tabz_save_page`

### Bookmarks (6)
`tabz_get_bookmark_tree`, `tabz_search_bookmarks`, `tabz_save_bookmark`, `tabz_create_folder`, `tabz_move_bookmark`, `tabz_delete_bookmark`

### Audio/TTS (3)
`tabz_speak`, `tabz_list_voices`, `tabz_play_audio`

### History (5)
`tabz_history_search`, `tabz_history_visits`, `tabz_history_recent`, `tabz_history_delete_url`, `tabz_history_delete_range`

### Sessions (3)
`tabz_sessions_recently_closed`, `tabz_sessions_restore`, `tabz_sessions_devices`

### Cookies (5)
`tabz_cookies_get`, `tabz_cookies_list`, `tabz_cookies_set`, `tabz_cookies_delete`, `tabz_cookies_audit`

### Emulation (6)
`tabz_emulate_device`, `tabz_emulate_clear`, `tabz_emulate_geolocation`, `tabz_emulate_network`, `tabz_emulate_media`, `tabz_emulate_vision`

### Notifications (4)
`tabz_notification_show`, `tabz_notification_update`, `tabz_notification_clear`, `tabz_notification_list`
