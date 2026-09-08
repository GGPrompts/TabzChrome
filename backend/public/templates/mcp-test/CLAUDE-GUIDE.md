# Claude's Guide to MCP Browser Automation

A practical guide for Claude to efficiently use tabz MCP tools for browser automation.

## Quick Start

```bash
# Open the test pages hub
tabz_open_url({ url: "localhost:8129/mcp-test/" })

# Take a screenshot to see the page
tabz_screenshot({})

# Click a navigation link
tabz_click({ selector: "#nav-forms" })
```

## Selector Strategy (Priority Order)

Always prefer selectors in this order for maximum reliability:

### 1. ID Selectors (Best)
```javascript
tabz_click({ selector: "#login-submit" })
tabz_fill({ selector: "#email-input", value: "test@example.com" })
```
- Unique per page
- Won't break with CSS changes
- Self-documenting

### 2. data-testid Attributes (Stable)
```javascript
tabz_click({ selector: "[data-testid='submit-button']" })
```
- Designed for testing
- Survives refactors
- Won't conflict with styling

### 3. data-action Attributes (Semantic)
```javascript
tabz_click({ selector: "[data-action='submit-login']" })
```
- Describes behavior
- Good for finding buttons by purpose

### 4. CSS Classes (Last Resort)
```javascript
tabz_click({ selector: ".btn-primary" })
```
- Can match multiple elements
- May break with styling changes
- Use with caution

## Common Workflows

### Form Filling
```javascript
// Fill a non-sensitive fixture field, submit once, then inspect its status.
tabz_fill({ selector: "#feedback-message", value: "Synthetic feedback for the test page." })
tabz_click({ selector: "#feedback-submit" })
tabz_get_element({ selector: "#feedback-status" })
```

For sign-in, use `tabz_request_login` for human entry or the saved-login workflow in [Saved logins](../../../../docs/saved-logins.md). Never put passwords or other credentials in tool arguments. Protected documents refuse element inspection and arbitrary-selector clicks; use human submission or an already published page ref when that tool is available. A missing login prompt alone does not prove authentication.

### Multi-Step Wizard
```javascript
// Step 1: Fill and proceed
tabz_fill({ selector: "#wizard-name", value: "John Doe" })
tabz_fill({ selector: "#wizard-company", value: "Acme Inc" })
tabz_click({ selector: "#wizard-next-1" })

// Step 2: Select option and proceed
tabz_click({ selector: "#wizard-theme" })  // Focus select
tabz_fill({ selector: "#wizard-theme", value: "dark" })
tabz_click({ selector: "#wizard-next-2" })

// Step 3: Confirm
tabz_click({ selector: "#wizard-complete" })
```

### Navigation with Verification
```javascript
// Click a tab
tabz_click({ selector: "#tab-settings" })

// Verify the content changed
tabz_get_element({ selector: "#tab-content-settings" })

// Or take a screenshot to see the result
tabz_screenshot({})
```

### Network Request Monitoring
```javascript
// 1. Enable capture BEFORE making requests
tabz_enable_network_capture({})

// 2. Click buttons that trigger API calls
tabz_click({ selector: "#btn-fetch-users" })

// 3. View captured requests
tabz_get_network_requests({})

// 4. Filter by method or status
tabz_get_network_requests({ method: "POST" })
tabz_get_network_requests({ statusMin: 400 })  // Errors only
```

## Best Practices

### 1. Always Screenshot First
Before interacting, take a screenshot to understand the page state:
```javascript
tabz_screenshot({})  // See what's on screen
```

### 2. Use the Selectors Panel
Every test page has a collapsible "Selectors Panel" in the bottom-right. It lists all important selectors for that page.

### 3. Check State Indicators
Test pages have status displays that show results:
- `#login-status` - Shows login result
- `#click-count` - Shows button click count
- `#active-tab` - Shows current tab
- `#modal-result` - Shows modal interaction result

### 4. Verify Before Proceeding
After actions, verify state before the next step:
```javascript
// Bad: Just click and hope
tabz_click({ selector: "#submit" })

// Good: Click, then verify
tabz_click({ selector: "#submit" })
tabz_get_element({ selector: "#success-message" })  // Confirm it worked
```

### 5. Handle Dropdowns Carefully
Dropdowns require hover to open. For better results:
```javascript
// For select elements, use tabz_fill with the option value
tabz_fill({ selector: "#theme-select", value: "dark" })

// For custom dropdowns, click to open, then click option
tabz_click({ selector: "#dropdown-file" })  // Open menu
tabz_click({ selector: "#menu-save" })       // Click option
```

## Error Handling

### Element Not Found
If `tabz_click` fails with "Element not found":
1. Take a screenshot to see current page state
2. Use `tabz_get_dom_tree` to see page structure
3. Check if the element requires scrolling
4. Verify you're on the right page

### Wrong Tab
If interacting with wrong tab:
```javascript
// List tabs to see which is active
tabz_list_tabs({})

// Switch to correct tab
tabz_switch_tab({ tabId: 123456789 })
```

### Modal Blocking Interaction
If a modal is blocking:
```javascript
// Close the modal first
tabz_click({ selector: "#modal-close" })
// Or click the overlay
tabz_click({ selector: ".modal-overlay" })
```

## Tool Quick Reference

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `tabz_screenshot` | Capture viewport | `selector` (optional) |
| `tabz_screenshot_full` | Capture full page | - |
| `tabz_click` | Click element | `selector` (required) |
| `tabz_fill` | Fill input | `selector`, `value` |
| `tabz_get_element` | Inspect element | `selector`, `includeStyles` |
| `tabz_get_dom_tree` | Page structure | `maxDepth`, `selector` |
| `tabz_open_url` | Navigate | `url` |
| `tabz_list_tabs` | List tabs | - |
| `tabz_switch_tab` | Change tab | `tabId` |
| `tabz_execute_script` | Run JS | `code` |
| `tabz_enable_network_capture` | Start capture | - |
| `tabz_get_network_requests` | View requests | `method`, `statusMin` |

## Test Page Reference

| Page | URL | Purpose |
|------|-----|---------|
| Hub | `/mcp-test/` | Overview, links to all pages |
| Forms | `/mcp-test/forms.html` | Login, search, wizard, textarea |
| Buttons | `/mcp-test/buttons.html` | Clicks, toggles, states |
| Navigation | `/mcp-test/navigation.html` | Tabs, dropdowns, modals, pagination |
| Data | `/mcp-test/data.html` | Tables, lists, cards, tree view |
| Network | `/mcp-test/network.html` | API requests, network capture |

## Selector Naming Conventions

All test pages follow these patterns:

### Forms
- `#login-email`, `#login-password`, `#login-submit`
- `#search-input`, `#search-submit`
- `#wizard-name`, `#wizard-next-1`, `#wizard-complete`

### Buttons
- `#btn-primary`, `#btn-secondary`, `#btn-danger`
- `#btn-toggle-theme`, `#btn-toggle-notifications`
- `#btn-icon-home`, `#btn-icon-settings`

### Navigation
- `#tab-overview`, `#tab-settings`, `#tab-history`
- `#dropdown-file`, `#menu-save`, `#menu-exit`
- `#modal-open`, `#modal-confirm-ok`, `#modal-info-close`
- `#page-prev`, `#page-next`, `#page-1`

### Data
- `#data-table`, `#sort-by-name`
- `#list-item-1`, `#list-item-2-action`
- `#card-1`, `#card-2-buy`
- `#tree-toggle-src`, `#tree-file-app`

### Network
- `#btn-fetch-users`, `#btn-generate-audio`
- `#btn-404-error`, `#btn-slow-request`
- `#request-log`, `#response-body`

## Tips for Efficiency

1. **Parallel tab operations**: Use `tabId` parameter to interact with background tabs without switching
2. **Full page screenshots**: Use `tabz_screenshot_full` for first-time page exploration
3. **Check selectors panel**: Always visible in bottom-right corner
4. **Read status indicators**: Most interactions update visible status elements
5. **Use data attributes**: `[data-testid="x"]` is more stable than classes
