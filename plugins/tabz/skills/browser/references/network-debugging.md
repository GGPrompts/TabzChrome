# Network Debugging

## Start Capture

```bash
tabz_enable_network_capture({"tabId": 123456})
```

Must be called BEFORE the requests you want to capture occur.

## Get Requests

```bash
tabz_get_network_requests({"urlPattern": "/api/", "tabId": 123456})
```

Options:
- `urlPattern`: String to filter URLs (e.g., "/api/", ".json")
- `statusMin`: Minimum status code (e.g., 400 for errors only)

Returns: Array of requests with URL, method, status, timing, and redacted headers. Deep response bodies use `tabz_get_response_body`.

## Clear Requests

```bash
tabz_clear_network_requests({})
```

Reset for fresh capture session.

## Typical Workflow

```bash
# 1. Enable capture
tabz_enable_network_capture({"tabId": 123456})

# 2. Trigger action (form submit, page load, button click)
tabz_click({"selector": "#submit", "tabId": 123456})

# 3. Get requests (filter for API calls)
tabz_get_network_requests({"urlPattern": "/api/", "tabId": 123456})

# 4. Get only errors
tabz_get_network_requests({"statusMin": 400, "tabId": 123456})

# 5. Check console for JS errors
tabz_get_console_logs({"level": "error", "tabId": 123456})
```

## Auth/Session Debugging

Combine with cookies:

```bash
# List all cookies for a domain
tabz_cookies_list({"url": "https://example.com"})

# Get specific cookie
tabz_cookies_get({"url": "https://example.com", "name": "session"})
```

## Deep Capture

Use `tabz_enable_deep_capture({"tabId":123456})` before the requests of interest. List rows with `tabz_get_network_requests({"tabId":123456,"source":"deep"})`, then page through `tabz_get_response_body({"tabId":123456,"requestId":"the-returned-id","length":32000})`. Call `tabz_disable_deep_capture` when finished.

Capture excludes extension/backend self traffic by default and redacts before storage. Bodies, rows and stream buffers are bounded. Navigation or an ownership/protection change ends deep capture and removes its rows; explicitly re-enable on a fresh readable document. Protected login documents cannot be captured. Requests before trusted document admission may be absent.
