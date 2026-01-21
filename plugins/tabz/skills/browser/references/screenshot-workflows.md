# Screenshot Workflows

## Viewport Screenshot (what's visible)

```bash
mcp-cli info tabz/tabz_screenshot  # Check schema first
mcp-cli call tabz/tabz_screenshot '{"tabId": 123456}'
```

Options:
- `selector`: CSS selector for specific element
- `tabId`: Target specific tab (REQUIRED - don't rely on active tab)
- `outputPath`: Custom save path

## Full Page Screenshot (entire scrollable page)

```bash
mcp-cli call tabz/tabz_screenshot_full '{"tabId": 123456}'
```

Captures everything from top to bottom by stitching viewport captures.

## Download Image from Page

```bash
mcp-cli call tabz/tabz_download_image '{"selector": "img.hero", "tabId": 123456}'
```

Options:
- `selector`: CSS selector for img element
- `url`: Direct image URL

## Best Practices

1. Always list tabs first: `mcp-cli call tabz/tabz_list_tabs '{}'`
2. Use explicit tabId to avoid capturing wrong tab
3. Screenshots saved to Downloads folder
4. Use Read tool with returned filePath to view
