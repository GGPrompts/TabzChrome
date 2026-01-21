# Network Debugging

## Start Capture

```bash
mcp-cli info tabz/tabz_enable_network_capture  # Check schema first
mcp-cli call tabz/tabz_enable_network_capture '{"tabId": 123456}'
```

Must be called BEFORE the requests you want to capture occur.

## Get Requests

```bash
mcp-cli call tabz/tabz_get_network_requests '{"filter": "/api/", "tabId": 123456}'
```

Options:
- `filter`: String to filter URLs (e.g., "/api/", ".json")
- `statusMin`: Minimum status code (e.g., 400 for errors only)

Returns: Array of requests with URL, method, status, timing, headers, body.

## Clear Requests

```bash
mcp-cli call tabz/tabz_clear_network_requests '{"tabId": 123456}'
```

Reset for fresh capture session.

## Typical Workflow

```bash
# 1. Enable capture
mcp-cli call tabz/tabz_enable_network_capture '{"tabId": 123456}'

# 2. Trigger action (form submit, page load, button click)
mcp-cli call tabz/tabz_click '{"selector": "#submit", "tabId": 123456}'

# 3. Get requests (filter for API calls)
mcp-cli call tabz/tabz_get_network_requests '{"filter": "/api/", "tabId": 123456}'

# 4. Get only errors
mcp-cli call tabz/tabz_get_network_requests '{"statusMin": 400, "tabId": 123456}'

# 5. Check console for JS errors
mcp-cli call tabz/tabz_get_console_logs '{"level": "error", "tabId": 123456}'
```

## Auth/Session Debugging

Combine with cookies:

```bash
# List all cookies for a domain
mcp-cli call tabz/tabz_cookies_list '{"url": "https://example.com"}'

# Get specific cookie
mcp-cli call tabz/tabz_cookies_get '{"url": "https://example.com", "name": "session"}'
```
