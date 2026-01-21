# Form Automation

## Fill Input Field
```
mcp__tabz__tabz_fill
```
Options:
- `selector`: CSS selector for input
- `value`: Text to enter
- `tabId`: Target tab

## Click Element
```
mcp__tabz__tabz_click
```
Options:
- `selector`: CSS selector
- `tabId`: Target tab

Visual feedback: Elements glow when interacted with.

## Get Element Details
```
mcp__tabz__tabz_get_element
```
Returns text, attributes, bounding box.

## Execute JavaScript
```
mcp__tabz__tabz_execute_script
```
Run arbitrary JS in page context.

## Typical Form Workflow

```
1. tabz_fill selector="#email" value="user@example.com"
2. tabz_fill selector="#password" value="secret"
3. tabz_click selector="button[type=submit]"
4. tabz_screenshot to verify result
```

## Selector Tips

- ID: `#login-button`
- Class: `.submit-btn`
- Attribute: `button[type=submit]`
- Combined: `form.login input[name=email]`
