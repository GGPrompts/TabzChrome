# Browser MCP Dashboard Plan

**Date**: November 25, 2025
**Status**: Planning
**Priority**: Medium - Quality of Life improvement

## Overview

Build a web dashboard for the Browser MCP server that provides:
- Configuration UI (allowed URLs, settings)
- MCP tool tester / API playground
- Connection status monitoring
- Tool usage analytics

## Why Build This?

1. **Config without code** - Add/remove allowed URLs without editing source
2. **Debug MCP tools** - Interactive testing of `browser_click`, `browser_fill`, etc.
3. **Connection visibility** - See CDP/backend/extension status at a glance
4. **Reference for others** - Example of MCP dashboard implementation

## Template Sources

Located at: `/home/matt/projects/portfolio-style-guides/app/templates/`

| Template | Dashboard Section | Key Features to Reuse |
|----------|------------------|----------------------|
| `api-playground` | Tool Tester | Method selector, params/headers/body tabs, response viewer, code generation |
| `api-reference` | Tools Documentation | Sidebar navigation, endpoint cards, code examples, search |
| `status-page` | Connection Status | Service health cards, uptime charts, incident timeline |
| `ai-agent-dashboard` | Analytics | Live task stream, tool usage pie charts, cost tracking |

## Proposed Structure

```
/browser-mcp-dashboard (or integrate into existing extension UI)
├── /status          → Connection health (CDP, Backend, Extension)
├── /tools           → Interactive MCP tool tester
├── /docs            → All 11 browser tools documented
├── /config          → Allowed URLs, settings management
└── /analytics       → Tool usage logs, patterns (optional)
```

## Implementation Phases

### Phase 1: Config Panel (MVP)
- [ ] Allowed URLs list (add/remove domains)
- [ ] Store config in Chrome storage or backend
- [ ] Basic connection status indicator
- **Template**: Custom simple form

### Phase 2: Tool Tester
- [ ] Adapt `api-playground` template
- [ ] Replace fetch() with MCP tool calls via WebSocket
- [ ] Tool selector dropdown (all 11 browser tools)
- [ ] Parameter forms based on tool schema
- [ ] Response viewer with JSON formatting
- [ ] Code generation (show equivalent MCP call)

### Phase 3: Status Dashboard
- [ ] Adapt `status-page` template
- [ ] CDP connection status (is Chrome running with --remote-debugging-port?)
- [ ] Backend WebSocket status
- [ ] Extension service worker status
- [ ] Recent errors/warnings

### Phase 4: Documentation (Optional)
- [ ] Adapt `api-reference` template
- [ ] Auto-generate from MCP tool definitions
- [ ] Usage examples for each tool
- [ ] Link to existing MCP_TOOLS.md

### Phase 5: Analytics (Optional)
- [ ] Adapt `ai-agent-dashboard` template
- [ ] Tool call history
- [ ] Usage patterns (most used tools)
- [ ] Error rates

## Technical Decisions

### Where to Host?
Options:
1. **Separate localhost app** - React app on different port
2. **Extension popup/page** - Built into extension as chrome-extension:// page
3. **Vercel deployment** - Public dashboard (config stored in Chrome storage)

**Recommendation**: Extension page (chrome-extension://[id]/dashboard.html) - keeps everything together, can access Chrome storage directly.

### Communication with MCP
Options:
1. **Direct WebSocket** - Dashboard connects to ws://localhost:8129
2. **Via Extension** - Dashboard sends chrome.runtime messages, extension forwards to MCP
3. **REST API** - Add REST endpoints to backend for config/status

**Recommendation**: Direct WebSocket for tool testing, Chrome storage for config.

## MCP Tools to Support in Tester

All 11 current tools:
1. `browser_get_page_info` - No params
2. `browser_get_console_logs` - level, limit, since, tabId
3. `browser_execute_script` - code, tabId, allFrames
4. `browser_screenshot` - selector, fullPage, outputPath
5. `browser_download_image` - selector, url, outputPath
6. `browser_list_tabs` - (no params)
7. `browser_switch_tab` - tabId
8. `browser_rename_tab` - tabId, name
9. `browser_click` - selector
10. `browser_fill` - selector, value
11. `browser_get_element` - selector, includeStyles, styleProperties
12. `browser_open_url` - url, newTab, background

## Config Schema

```typescript
interface BrowserMCPConfig {
  allowedDomains: string[];  // ["github.com", "*.vercel.app", "localhost"]
  cdpPort: number;           // default: 9222
  screenshotDir: string;     // default: ~/ai-images/
  defaultTimeout: number;    // default: 5000ms
}
```

## UI/UX Notes

- Use existing glassmorphism style from templates
- Dark theme to match terminal aesthetic
- Framer Motion animations (already in templates)
- shadcn/ui components (already in templates)
- Responsive - should work in extension popup or full page

## Related Files

- Templates: `/home/matt/projects/portfolio-style-guides/app/templates/`
- Current MCP server: `/home/matt/projects/TabzChrome-simplified/browser-mcp-server/`
- MCP Tools docs: `/home/matt/projects/TabzChrome-simplified/browser-mcp-server/MCP_TOOLS.md`
- Chrome API possibilities: `/home/matt/projects/TabzChrome-simplified/docs/planning/CHROME_API_FEATURE_POSSIBILITIES.md`

## Advanced: Theme Config Capture for Template Customization

**Vision**: User customizes template theme in browser → Claude captures config → applies to source from GitHub.

**Simple workflow:**
```
1. User opens your template site, customizes theme via UI
2. browser_execute_script → extract theme config JSON
3. Claude reads source from GitHub (your public repo)
4. Apply captured config to generate customized version
```

**Implementation:**
```typescript
// Capture user's theme settings
browser_execute_script({
  code: "JSON.stringify(window.__THEME_CONFIG__ || localStorage.getItem('theme-settings'))"
})
// Returns: {"primaryColor":"#10b981","mode":"dark","radius":"0.5rem","font":"Inter"}
```

**Why this approach:**
- No DOM/CSS extraction needed (you own the source)
- Just captures user preferences
- Clean separation: source on GitHub, config from browser
- Avoids ethical issues of "clone any site"

**Note on scope:** This is specifically for YOUR templates where source is available.
Not intended as a general "website cloner" - that would enable copying copyrighted sites.

---

## Open Questions

1. Should this be a standalone app or integrated into the extension?
2. How to handle authentication if deployed publicly?
3. Should config sync across devices (Chrome sync storage)?
4. Worth adding a "record and replay" feature for MCP tool sequences?

## Next Steps

1. Decide on hosting approach (extension page vs standalone)
2. Copy relevant templates to project
3. Start with Phase 1 (Config Panel MVP)
4. Iterate based on actual usage
