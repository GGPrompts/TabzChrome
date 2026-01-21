# Network Debugging

## Start Capture
```
mcp__tabz__tabz_enable_network_capture
```
Must be called BEFORE the requests you want to capture occur.

## Get Requests
```
mcp__tabz__tabz_get_network_requests
```
Options:
- `filter`: String to filter URLs (e.g., "/api/", ".json")

Returns: Array of requests with URL, method, status, timing, headers, body.

## Clear Requests
```
mcp__tabz__tabz_clear_network_requests
```
Reset for fresh capture session.

## Typical Workflow

1. Enable capture
2. Trigger action (form submit, page load, button click)
3. Get requests with filter
4. Analyze status codes, response times, payloads
5. Check console logs for JS errors

## Auth/Session Debugging

Combine with cookies:
```
mcp__tabz__tabz_cookies_list with url
mcp__tabz__tabz_cookies_get with url and name
```
