# Form Automation

## Read and Target the Current Document

```javascript
tabz_read_page({"tabId": 123456})
```

The response publishes opaque refs for actionable elements. A ref belongs to the current MCP caller, owned tab, document, and publication generation. Reread after navigation and never reuse refs after a reread or ownership change.

## Ordinary, Non-Sensitive Forms

```javascript
tabz_act({"action": "type", "ref": "<email ref from tabz_read_page>", "value": "user@example.com", "tabId": 123456})
tabz_act({"action": "click", "ref": "<submit ref from tabz_read_page>", "tabId": 123456})
```

Check each result's `structuredContent.status`. Continue only after `verified`; stop on `mismatch` or `unknown`. An unknown mutation may already have changed the page, so do not replay it. Reconcile with `tabz_read_page` when the document remains readable.

## Credentials and Login Pages

Never put passwords or saved credential values in `tabz_fill`, `tabz_act`, scripts, prompts, or logs. Use `tabz_request_login` for a manual handoff or the saved-login tools described in repository `docs/saved-logins.md`. Protected login documents block content reads, screenshots, and arbitrary-selector interaction. Submit with a ref published before protection when available; otherwise ask the user to submit or navigate.

## Legacy Selector Tools

`tabz_fill`, `tabz_click`, `tabz_get_element`, and `tabz_execute_script` remain available for compatible, non-sensitive workflows. Prefer `tabz_read_page` plus `tabz_act` so targeting and result status are explicit.

Selector examples:

- ID: `#login-button`
- Class: `.submit-btn`
- Attribute: `button[type=submit]`
- Combined: `form.login input[name=email]`
