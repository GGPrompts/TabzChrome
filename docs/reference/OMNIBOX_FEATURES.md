# Omnibox Features

## Overview

The TabzChrome extension now supports Chrome omnibox commands (address bar) using the keyword `term`. This allows you to quickly spawn terminals, run commands, and **open allowed URLs** directly from the address bar.

## Usage

Type `term` in the Chrome address bar (omnibox), press **Space** or **Tab**, then enter your command.

## Features

### 1. Spawn New Terminal

**Command:** `term new`

Opens the terminal sidebar and spawns a new bash terminal with the default profile.

### 2. Run Bash Commands

**Command:** `term <your-command>`

**Examples:**
- `term git status`
- `term npm install`
- `term docker ps`

Opens the sidebar, spawns a new terminal, and runs the command.

### 3. Spawn Profile

**Command:** `term profile:<name>`

**Examples:**
- `term profile:Projects`
- `term profile:bash`

Opens the sidebar and spawns a terminal using the specified profile.

### 4. Open URLs (NEW! 🎉)

**Command:** `term <github-url>` or `term <allowed-url>`

**Allowed Domains:**
- github.com (any URL)
- gitlab.com (any URL)
- *.vercel.app (Vercel preview and production deployments)
- *.vercel.com (Vercel alternative domain)
- localhost (any port)
- 127.0.0.1 (any port)

**Examples:**
- `term github.com/user/repo`
- `term www.github.com` (with or without www)
- `term https://github.com/user/repo/pull/123`
- `term gitlab.com/project/name`
- `term www.gitlab.com`
- `term my-app-abc123.vercel.app` (Vercel preview deployment)
- `term my-app.vercel.app` (Vercel production)
- `term localhost:3000`
- `term 127.0.0.1:8080/api/docs`

**Behavior:**
- Opens URL in a **new foreground tab** by default
- Press **Alt+Enter** to open in **new background tab**
- Press **Enter** in current tab (replaces current page)
- URL validation happens automatically
- `https://` prefix added automatically if missing

### 5. Help

**Command:** `term help`

Shows a notification with available commands.

## Suggestions

As you type, the omnibox provides intelligent suggestions:

- **URLs** - When you type a GitHub/GitLab/localhost URL
- **Profiles** - When you type `profile:` or `p` or `pr`
- **Commands** - Common bash commands like `git status`, `npm install`, etc.
- **Built-ins** - `new` and `help` commands

## MCP Tool for Claude

### `tabz_open_url`

Claude can now programmatically open allowed URLs via the Browser MCP server.

**Usage in Claude Code:**
```typescript
// Open GitHub repo
mcp__tabz__tabz_open_url({
  url: "github.com/user/repo"
})

// Open in background tab
mcp__tabz__tabz_open_url({
  url: "github.com/user/repo/pull/123",
  newTab: true,
  background: true
})

// Open localhost dev server
mcp__tabz__tabz_open_url({
  url: "localhost:3000"
})
```

**Parameters:**
- `url` (required): URL to open (must be from allowed domains)
- `newTab` (optional, default: true): Open in new tab or replace current
- `background` (optional, default: false): Open in background or foreground

**Security:**
Only whitelisted domains (GitHub, GitLab, Vercel, localhost, 127.0.0.1) can be opened to prevent abuse.

## Security

### URL Whitelist

Only the following URL patterns are allowed:
- `https?://(www.)?github.com(\/.*)?`
- `https?://(www.)?gitlab.com(\/.*)?`
- `https?://[\w-]+\.vercel\.app(\/.*)?`
- `https?://[\w.-]+\.vercel\.com(\/.*)?`
- `https?://localhost(:\d+)?(\/.*)?`
- `https?://127.0.0.1(:\d+)?(\/.*)?`

This prevents malicious URLs from being opened and ensures the omnibox is only used for development-related navigation.

### Why These Domains?

- **GitHub/GitLab** - Code repositories, issues, PRs, documentation
- **Vercel** - Preview deployments, production apps, testing
- **localhost/127.0.0.1** - Local development servers, APIs, documentation

### Adding More Domains

To add more allowed domains, edit:
1. **Extension:** `extension/background/background.ts` - Update `ALLOWED_URL_PATTERNS`
2. **MCP Server:** `tabz-mcp-server/src/tools/omnibox.ts` - Update `ALLOWED_URL_PATTERNS`
3. Rebuild both:
   ```bash
   npm run build:extension
   cd tabz-mcp-server && npm run build
   ```

## How It Works

1. **User types in omnibox:** `term github.com/user/repo`
2. **Extension validates URL** against whitelist
3. **If allowed:** Opens in new tab via `chrome.tabs.create()`
4. **If not allowed:** Treats as bash command (spawns terminal and runs it)

## Implementation Details

### Files Modified

1. **extension/background/background.ts**
   - Added `ALLOWED_URL_PATTERNS` array
   - Added `isAllowedUrl()` function for validation
   - Updated `chrome.omnibox.onInputChanged` to suggest URLs
   - Updated `chrome.omnibox.onInputEntered` to handle URLs and dispositions

2. **tabz-mcp-server/src/tools/omnibox.ts** (NEW)
   - New MCP tool: `tabz_open_url`
   - URL validation (same whitelist as extension)
   - Opens URLs via Chrome DevTools Protocol (CDP)

3. **tabz-mcp-server/src/index.ts**
   - Registered `registerOmniboxTools(server)`

### Chrome Extension Manifest

The extension already had the `omnibox` permission configured:
```json
"omnibox": {
  "keyword": "term"
}
```

No manifest changes were needed!

## Testing

### Manual Testing (User)

1. Open Chrome
2. Type `term` in address bar
3. Press Space
4. Try these commands:
   - `new` - Should open sidebar and spawn terminal
   - `github.com/torvalds/linux` - Should open GitHub in new tab
   - `localhost:8129` - Should open backend server
   - `https://evil.com` - Should NOT open (not whitelisted, treated as command)

### MCP Testing (Claude)

```typescript
// Test 1: Open GitHub repo
const result = await mcp__tabz__tabz_open_url({
  url: "github.com/anthropics/claude-code"
})

// Test 2: Try forbidden domain (should fail)
const result = await mcp__tabz__tabz_open_url({
  url: "https://google.com"
})
// Expected: Error - "URL not allowed"

// Test 3: Open localhost
const result = await mcp__tabz__tabz_open_url({
  url: "localhost:8129"
})
```

## Next Steps

- Reload extension in Chrome (`chrome://extensions` → click reload)
- Test omnibox commands
- Try opening GitHub URLs
- Use MCP tool from Claude Code

## Troubleshooting

### URL doesn't open
- Check if domain is in whitelist
- Check Chrome DevTools console for errors
- Ensure you pressed Enter (not Tab)

### MCP tool fails
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check if WSL2 bridge is running (for WSL users)
- Verify MCP server is running

### Omnibox not working
- Check if extension is loaded
- Check if keyword is `term` in manifest
- Check service worker console for errors

### URL opens terminal instead of browser tab
**Fixed in latest version!** This was a bug where URLs like `www.github.com` or `github.com` (without a path) would open a terminal and run as a command instead of opening the URL.

**What was fixed:**
- Now supports `www.` prefix (e.g., `www.github.com`)
- Now supports domain-only URLs (e.g., `github.com` without `/repo/path`)
- Both extension and MCP server updated with matching patterns

**If you still see this issue:**
1. Make sure you reloaded the extension after updating
2. Check the service worker console for validation errors
3. Try with full URL: `term https://github.com`
