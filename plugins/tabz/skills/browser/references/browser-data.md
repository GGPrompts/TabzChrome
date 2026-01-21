# Browser Data Tools

Tools for bookmarks, history, sessions, and cookies.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

---

## tabz_get_bookmark_tree

**Purpose:** Get the Chrome bookmarks hierarchy showing folders and bookmarks.

**Trigger phrases:**
- [Show my bookmarks](tabz:paste?text=Show%20my%20bookmarks)
- [What folders do I have?](tabz:paste?text=What%20folders%20do%20I%20have%3F)
- [Bookmark structure](tabz:paste?text=Bookmark%20structure)

**Parameters:**
- `folderId` (optional): Get children of specific folder. Omit for full tree.
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
- `maxDepth` (optional): Maximum depth to traverse (1-10, default: 3)
- `response_format`: `markdown` (default) or `json`

**Returns:**
Tree structure with:
- `id`: Bookmark/folder ID (use with other bookmark tools)
- `title`: Display name
- `url`: URL (only for bookmarks, not folders)
- `children`: Nested items (for folders)

**Examples:**
```javascript
// Full tree
{}

// Bookmarks Bar only
{ folderId: "1" }

// Shallow view (immediate children only)
{ maxDepth: 1 }
```

---

## tabz_search_bookmarks

**Purpose:** Search Chrome bookmarks by title or URL.

**Trigger phrases:**
- [Find my React bookmarks](tabz:paste?text=Find%20my%20React%20bookmarks)
- [Search bookmarks for GitHub](tabz:paste?text=Search%20bookmarks%20for%20GitHub)
- [Do I have this bookmarked?](tabz:paste?text=Do%20I%20have%20this%20bookmarked%3F)

**Parameters:**
- `query` (required): Search text - matches titles and URLs
- `limit` (optional): Max results (1-100, default: 20)
- `response_format`: `markdown` (default) or `json`

**Returns:**
List of matching bookmarks with ID, title, URL, and parent folder ID.

**Examples:**
```javascript
// Find by topic
{ query: "react" }

// Find by domain
{ query: "github.com" }

// Limit results
{ query: "docs", limit: 5 }
```

---

## tabz_save_bookmark

**Purpose:** Save a URL as a Chrome bookmark.

**Trigger phrases:**
- [Bookmark this page](tabz:paste?text=Bookmark%20this%20page)
- [Save to bookmarks](tabz:paste?text=Save%20to%20bookmarks)
- [Add to Bookmarks Bar](tabz:paste?text=Add%20to%20Bookmarks%20Bar)

**Parameters:**
- `url` (required): URL to bookmark
- `title` (required): Bookmark title
- `parentId` (optional): Folder ID. Default: `"1"` (Bookmarks Bar)
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
  - Or use a folder ID from `tabz_get_bookmark_tree`
- `index` (optional): Position in folder (0 = first). Omit for end.

**Returns:**
The created bookmark with its ID.

**Examples:**
```javascript
// Save to Bookmarks Bar
{ url: "https://github.com/user/repo", title: "My Repo" }

// Save to Other Bookmarks
{ url: "https://example.com", title: "Example", parentId: "2" }

// Save to custom folder
{ url: "https://react.dev", title: "React Docs", parentId: "123" }
```

---

## tabz_create_folder

**Purpose:** Create a new bookmark folder.

**Trigger phrases:**
- [Create bookmark folder](tabz:paste?text=Create%20bookmark%20folder)
- [New folder in bookmarks](tabz:paste?text=New%20folder%20in%20bookmarks)
- [Make a folder for these](tabz:paste?text=Make%20a%20folder%20for%20these)

**Parameters:**
- `title` (required): Folder name
- `parentId` (optional): Parent folder ID. Default: `"1"` (Bookmarks Bar)
- `index` (optional): Position in parent (0 = first). Omit for end.

**Returns:**
The created folder with its ID. Use this ID as `parentId` in `tabz_save_bookmark`.

**Examples:**
```javascript
// Create in Bookmarks Bar
{ title: "Work Projects" }

// Create in Other Bookmarks
{ title: "Archive", parentId: "2" }

// Create nested folder
{ title: "React", parentId: "456" }
```

---

## tabz_move_bookmark

**Purpose:** Move a bookmark or folder to a different location.

**Trigger phrases:**
- [Move this bookmark](tabz:paste?text=Move%20this%20bookmark)
- [Reorganize bookmarks](tabz:paste?text=Reorganize%20bookmarks)
- [Put bookmark in folder](tabz:paste?text=Put%20bookmark%20in%20folder)

**Parameters:**
- `id` (required): Bookmark or folder ID to move
- `parentId` (required): Destination folder ID
  - `"1"` = Bookmarks Bar
  - `"2"` = Other Bookmarks
- `index` (optional): Position in destination (0 = first). Omit for end.

**Returns:**
The moved bookmark with updated location.

**Examples:**
```javascript
// Move to Bookmarks Bar
{ id: "123", parentId: "1" }

// Move to specific folder
{ id: "123", parentId: "456" }

// Move to first position
{ id: "123", parentId: "1", index: 0 }
```

**Note:** Cannot move the Bookmarks Bar or Other Bookmarks folders themselves.

---

## tabz_delete_bookmark

**Purpose:** Delete a bookmark or folder.

**Trigger phrases:**
- [Delete this bookmark](tabz:paste?text=Delete%20this%20bookmark)
- [Remove bookmark](tabz:paste?text=Remove%20bookmark)
- [Clean up bookmarks](tabz:paste?text=Clean%20up%20bookmarks)

**Parameters:**
- `id` (required): Bookmark or folder ID to delete

**Returns:**
Confirmation of deletion.

**⚠️ Warning:** Deleting a folder will also delete ALL bookmarks inside it!

**Examples:**
```javascript
// Delete single bookmark
{ id: "123" }

// Delete folder (and all contents!)
{ id: "456" }
```

**Note:** Cannot delete the Bookmarks Bar or Other Bookmarks folders.

---

## tabz_history_search

**Purpose:** Search browsing history by keyword and date range.

**Trigger phrases:**
- [Search my history](tabz:paste?text=Search%20my%20history)
- [Find pages I visited](tabz:paste?text=Find%20pages%20I%20visited)
- [History search](tabz:paste?text=History%20search)

**Parameters:**
- `query` (required): Search text - matches titles and URLs
- `startTime` (optional): Start of date range (ms since epoch or ISO string)
- `endTime` (optional): End of date range (ms since epoch or ISO string)
- `maxResults` (optional): Max results (1-1000, default: 100)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of history entries with URL, title, visit count, last visit time

**Examples:**
```javascript
// Search by keyword
{ query: "github" }

// Last week's visits
{ query: "react", startTime: Date.now() - 7*24*60*60*1000 }
```

---

## tabz_history_visits

**Purpose:** Get detailed visit information for a specific URL.

**Trigger phrases:**
- [When did I visit this URL?](tabz:paste?text=When%20did%20I%20visit%20this%20URL%3F)
- [History visits for URL](tabz:paste?text=History%20visits%20for%20URL)

**Parameters:**
- `url` (required): The URL to get visit details for
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of visits with timestamp, transition type (link, typed, reload, etc.)

---

## tabz_history_recent

**Purpose:** Get the most recent N history entries.

**Trigger phrases:**
- [Show recent history](tabz:paste?text=Show%20recent%20history)
- [What did I browse?](tabz:paste?text=What%20did%20I%20browse%3F)
- [Recent pages](tabz:paste?text=Recent%20pages)

**Parameters:**
- `maxResults` (optional): Number of entries (1-1000, default: 50)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of recent history entries sorted by most recent visit

---

## tabz_history_delete_url

**Purpose:** Remove a specific URL from browsing history.

**Trigger phrases:**
- [Delete this from history](tabz:paste?text=Delete%20this%20from%20history)
- [Remove URL from history](tabz:paste?text=Remove%20URL%20from%20history)

**Parameters:**
- `url` (required): The URL to delete from history

**Returns:**
- Confirmation of deletion

**Note:** This permanently removes the URL and all associated visits.

---

## tabz_history_delete_range

**Purpose:** Remove all history entries within a date range.

**Trigger phrases:**
- [Clear history for this week](tabz:paste?text=Clear%20history%20for%20this%20week)
- [Delete history range](tabz:paste?text=Delete%20history%20range)

**Parameters:**
- `startTime` (required): Start of range (ms since epoch or ISO string)
- `endTime` (required): End of range (ms since epoch or ISO string)

**Returns:**
- Confirmation of deletion

**Warning:** This permanently deletes all history in the specified range.

---

## tabz_sessions_recently_closed

**Purpose:** List recently closed tabs and windows (up to 25).

**Trigger phrases:**
- [Show recently closed tabs](tabz:paste?text=Show%20recently%20closed%20tabs)
- [What did I close?](tabz:paste?text=What%20did%20I%20close%3F)
- [Closed tabs](tabz:paste?text=Closed%20tabs)

**Parameters:**
- `maxResults` (optional): Number of entries (1-25, default: 25)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of closed sessions with sessionId, lastModified, type (tab/window)
- For tabs: URL, title, favIconUrl
- For windows: List of tabs that were in the window

**Note:** Use the `sessionId` with `tabz_sessions_restore` to reopen.

---

## tabz_sessions_restore

**Purpose:** Restore a closed tab or window by sessionId.

**Trigger phrases:**
- [Restore that tab](tabz:paste?text=Restore%20that%20tab)
- [Reopen closed tab](tabz:paste?text=Reopen%20closed%20tab)

**Parameters:**
- `sessionId` (required): Session ID from `tabz_sessions_recently_closed`

**Returns:**
- The restored tab or window information

---

## tabz_sessions_devices

**Purpose:** List tabs open on other synced Chrome devices.

**Trigger phrases:**
- [Show tabs from my phone](tabz:paste?text=Show%20tabs%20from%20my%20phone)
- [Other device tabs](tabz:paste?text=Other%20device%20tabs)
- [Synced devices](tabz:paste?text=Synced%20devices)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of devices with:
  - `deviceName`: Device name
  - `sessions`: Windows/tabs open on that device

**Note:** Requires Chrome sync to be enabled and logged in on multiple devices.

---

## tabz_cookies_get

**Purpose:** Get a specific cookie by name and URL.

**Trigger phrases:**
- [Get cookie value](tabz:paste?text=Get%20cookie%20value)
- [Check session cookie](tabz:paste?text=Check%20session%20cookie)

**Parameters:**
- `url` (required): URL the cookie is associated with
- `name` (required): Name of the cookie
- `storeId` (optional): Cookie store ID (for different profiles)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Cookie details: name, value, domain, path, expiration, httpOnly, secure, sameSite

---

## tabz_cookies_list

**Purpose:** List cookies for a domain with optional filters.

**Trigger phrases:**
- [Show cookies for this site](tabz:paste?text=Show%20cookies%20for%20this%20site)
- [List all cookies](tabz:paste?text=List%20all%20cookies)

**Parameters:**
- `domain` (optional): Filter by domain
- `url` (optional): Filter by URL
- `name` (optional): Filter by cookie name pattern
- `session` (optional): `true` for session-only, `false` for persistent-only
- `secure` (optional): `true` for secure-only, `false` for non-secure only
- `response_format`: `markdown` (default) or `json`

**Returns:**
- List of matching cookies with full details

---

## tabz_cookies_set

**Purpose:** Create or update a cookie.

**Trigger phrases:**
- [Set cookie](tabz:paste?text=Set%20cookie)
- [Create auth cookie](tabz:paste?text=Create%20auth%20cookie)

**Parameters:**
- `url` (required): URL to associate cookie with
- `name` (required): Cookie name
- `value` (required): Cookie value
- `domain` (optional): Cookie domain
- `path` (optional): Cookie path (default: "/")
- `secure` (optional): HTTPS only (default: true for https URLs)
- `httpOnly` (optional): Not accessible via JavaScript
- `sameSite` (optional): `strict`, `lax`, or `no_restriction`
- `expirationDate` (optional): Unix timestamp for expiration

**Returns:**
- The created/updated cookie

---

## tabz_cookies_delete

**Purpose:** Remove a specific cookie.

**Trigger phrases:**
- [Delete cookie](tabz:paste?text=Delete%20cookie)
- [Remove auth cookie](tabz:paste?text=Remove%20auth%20cookie)

**Parameters:**
- `url` (required): URL the cookie is associated with
- `name` (required): Name of the cookie to delete

**Returns:**
- Confirmation of deletion

---

## tabz_cookies_audit

**Purpose:** Analyze cookies for a page, identifying trackers and first/third-party cookies.

**Trigger phrases:**
- [Audit cookies](tabz:paste?text=Audit%20cookies)
- [Find tracking cookies](tabz:paste?text=Find%20tracking%20cookies)
- [Cookie analysis](tabz:paste?text=Cookie%20analysis)

**Parameters:**
- `url` (optional): URL to audit (defaults to active tab)
- `tabId` (optional): Target tab ID
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Summary: total, first-party, third-party, trackers counts
- Categorized cookies with tracker identification
- Known tracker domains flagged

**Use cases:**
- Privacy auditing
- Debug authentication issues
- Understand cookie landscape before testing

---
