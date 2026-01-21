# Screenshot Workflows

## Viewport Screenshot (what's visible)
```
mcp__tabz__tabz_screenshot
```
Options:
- `selector`: CSS selector for specific element
- `tabId`: Target specific tab
- `outputPath`: Custom save path

## Full Page Screenshot (entire scrollable page)
```
mcp__tabz__tabz_screenshot_full
```
Captures everything from top to bottom by stitching viewport captures.

## Download Image from Page
```
mcp__tabz__tabz_download_image
```
Options:
- `selector`: CSS selector for img element
- `url`: Direct image URL

## Best Practices

1. Always list tabs first to get valid tabId
2. Use explicit tabId to avoid capturing wrong tab
3. Screenshots saved to Downloads folder
4. Use Read tool with returned filePath to view
