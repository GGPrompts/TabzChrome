# Form Automation

## Fill Input Field

```bash
mcp-cli info tabz/tabz_fill  # Check schema first
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "user@example.com", "tabId": 123456}'
```

Options:
- `selector`: CSS selector for input
- `value`: Text to enter
- `tabId`: Target tab

## Click Element

```bash
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]", "tabId": 123456}'
```

Options:
- `selector`: CSS selector
- `tabId`: Target tab

Visual feedback: Elements glow when interacted with.

## Get Element Details

```bash
mcp-cli call tabz/tabz_get_element '{"selector": ".error-message", "tabId": 123456}'
```

Returns text, attributes, bounding box.

## Execute JavaScript

```bash
mcp-cli call tabz/tabz_execute_script '{"script": "document.querySelector(\"#custom\").click()", "tabId": 123456}'
```

Run arbitrary JS in page context.

## Typical Form Workflow

```bash
# 1. Fill fields
mcp-cli call tabz/tabz_fill '{"selector": "#email", "value": "user@example.com", "tabId": 123456}'
mcp-cli call tabz/tabz_fill '{"selector": "#password", "value": "secret", "tabId": 123456}'

# 2. Submit
mcp-cli call tabz/tabz_click '{"selector": "button[type=submit]", "tabId": 123456}'

# 3. Verify result
mcp-cli call tabz/tabz_screenshot '{"tabId": 123456}'
```

## Selector Tips

- ID: `#login-button`
- Class: `.submit-btn`
- Attribute: `button[type=submit]`
- Combined: `form.login input[name=email]`
