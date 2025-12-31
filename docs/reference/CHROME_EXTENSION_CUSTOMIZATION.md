# Chrome Extension Customization Capabilities

What Chrome extensions can and cannot customize (Manifest V3, as of December 2025).

---

## Customizable Chrome UI

| Area | API/Method | What You Can Do |
|------|------------|-----------------|
| **New Tab Page** | `chrome_url_overrides.newtab` | Completely replace with custom HTML |
| **History Page** | `chrome_url_overrides.history` | Completely replace with custom HTML |
| **Bookmarks Page** | `chrome_url_overrides.bookmarks` | Completely replace with custom HTML |
| **Side Panel** | `chrome.sidePanel` | Host custom content in browser sidebar |
| **Toolbar Icon** | `chrome.action` | Add icon button, badges, popups |
| **Context Menus** | `chrome.contextMenus` | Add right-click menu items |
| **DevTools Panels** | `chrome.devtools.panels` | Add custom panels/sidebars to DevTools |
| **Omnibox** | `chrome.omnibox` | Add keyword triggers with suggestions |
| **Notifications** | `chrome.notifications` | Show system notifications |

### Page Override Example

```json
{
  "manifest_version": 3,
  "name": "My Custom New Tab",
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  }
}
```

**Restrictions:**
- Only one extension can override each page at a time
- Cannot override New Tab in incognito mode
- Address bar always gets focus first on new tab (cannot change)
- Must use official API - other override methods are policy violations

---

## Customizable Browser Behavior

### Tabs & Windows

| Area | API | Capabilities |
|------|-----|--------------|
| **Tabs** | `chrome.tabs` | Create, close, move, group, query, reload, duplicate |
| **Tab Groups** | `chrome.tabGroups` | Create/modify groups, set colors, titles |
| **Windows** | `chrome.windows` | Create, resize, position, minimize, maximize |

### Page Content

| Area | API | Capabilities |
|------|-----|--------------|
| **DOM Injection** | `chrome.scripting` | Inject CSS/JS into web pages |
| **Per-Site Settings** | `chrome.contentSettings` | Control cookies, JS, images, plugins per-site |
| **Network Requests** | `chrome.declarativeNetRequest` | Block, redirect, modify headers |

### User Data

| Area | API | Capabilities |
|------|-----|--------------|
| **Storage** | `chrome.storage` | Store extension data (local, sync, session) |
| **Bookmarks** | `chrome.bookmarks` | Full CRUD operations |
| **History** | `chrome.history` | Read, search, delete entries |
| **Cookies** | `chrome.cookies` | Query, modify, delete cookies |
| **Downloads** | `chrome.downloads` | Manage download queue |

### Themes (Separate Extension Type)

Themes can customize:
- Frame color (`theme_frame`)
- Toolbar tint (`theme_toolbar`)
- New tab background (`theme_ntp_background`)
- Button colors
- Tab colors

---

## NOT Customizable (Hard Limitations)

These cannot be modified by extensions for security/architecture reasons:

| Element | Reason |
|---------|--------|
| **Address bar appearance** | Security - prevents URL spoofing |
| **Browser chrome/frame** | Native UI (requires building Chromium from source) |
| **Back/Forward/Refresh buttons** | Native toolbar elements |
| **Tab bar design** | Native UI |
| **Extension icon area layout** | Only your own icon is controllable |
| **Chrome internal pages** | `chrome://` URLs are protected |
| **Other extensions' content** | Sandboxed isolation |
| **PDF viewer UI** | Built-in viewer is protected |
| **Chrome sidebar frame** | Can use it, cannot style the container |
| **Browser window title bar** | OS-level, not browser-controlled |

---

## Manifest V3 Restrictions

| Restriction | Impact |
|-------------|--------|
| **No remote code** | All JS must be bundled in extension package |
| **No `eval()` or `new Function()`** | Cannot execute dynamic code |
| **Service worker lifecycle** | Background scripts shut down when idle |
| **Network rule limits** | Max 100 static rulesets, 50 enabled |
| **CSP restrictions** | Cannot relax `extension_pages` policy |

---

## User Action Required

Some features require explicit user consent:

| Feature | Requirement |
|---------|-------------|
| `file://` URL access | User enables in extension settings |
| Incognito mode | User allows per-extension |
| Host permissions | User grants per-site or all-sites |
| `chrome.permissions.request()` | Must be from user click |
| `chrome.management.setEnabled()` | Must be from user click |
| `chrome.sidePanel.open()` | Must be from user gesture |

---

## TabzChrome-Specific Notes

TabzChrome uses the **side panel** (`chrome.sidePanel`), which offers full control over rendered content but:

- Cannot change the panel's frame/header
- Cannot modify how Chrome shows/hides the panel
- Cannot style the panel toggle button
- Cannot capture screenshots of Chrome UI (Chrome limitation)

---

## Sources

- [Chrome Extension API Reference](https://developer.chrome.com/docs/extensions/reference/api)
- [Manifest V3 Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Override Chrome Pages](https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages)
- [User Interface Components](https://developer.chrome.com/docs/extensions/develop/ui)
- [Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Omnibox API](https://developer.chrome.com/docs/extensions/reference/api/omnibox)
