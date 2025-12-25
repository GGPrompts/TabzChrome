# Backend & API Audit Report

**Date:** 2025-12-25
**Scope:** Backend server, API routes, MCP server, background service worker

---

## Executive Summary

The TabzChrome backend has **significant redundancy** in browser interaction APIs but **clean separation** between browser operations (MCP) and terminal management (REST). The primary issues are:

1. **12 categories of duplicate endpoints** between MCP and REST APIs
2. **~1,000 lines of boilerplate code** in browser.js that could be extracted
3. **Audio generation code duplicated** (~150 LOC) in server.js
4. **Critical bug** in tui-tools.js calling non-existent method

**Key Metrics:**
| Metric | Count |
|--------|-------|
| Total REST endpoints | ~82 |
| Total MCP tools | 44 |
| Duplicate endpoint categories | 12 |
| Boilerplate code instances | 50+ |
| Estimated redundant lines | ~1,500 |

---

## 1. Architecture Issues

### 1.1 MCP vs REST Overlap (CRITICAL)

Both MCP and REST APIs provide **identical functionality** for browser operations. All 44 MCP tools have corresponding REST endpoints:

| Category | MCP Tools | REST Endpoints | Status |
|----------|-----------|----------------|--------|
| Tab Management | 3 | 4 | DUPLICATE |
| Page Info | 1 | 1 | DUPLICATE |
| Interaction (click/fill) | 2 | 2 | DUPLICATE |
| Screenshots | 3 | 2 | DUPLICATE |
| Script Execution | 1 | 1 | DUPLICATE |
| Console Logs | 1 | 2 | DUPLICATE |
| Navigation | 1 | 1 | DUPLICATE |
| Network Monitoring | 3 | 3 | DUPLICATE |
| Downloads | 4 | 4 | DUPLICATE |
| Bookmarks | 6 | 6 | DUPLICATE |
| Element Inspection | 1 | 1 | DUPLICATE |
| Debugger Tools | 3 | 3 | DUPLICATE |
| Tab Groups | 8 | 8 | DUPLICATE |

**Both use identical path:** `Backend → WebSocket → Chrome Extension → Chrome API → Response`

**Recommendation:** Keep MCP as canonical interface, deprecate REST browser endpoints.

### 1.2 Terminal APIs NOT Exposed to MCP

Terminal management is **REST-only**:
- `/api/agents/*` - Terminal spawning, lifecycle
- `/api/tmux/*` - Session management (16 endpoints)
- `/api/claude-status` - Claude Code integration

**Gap:** No MCP tools for terminal operations.

---

## 2. Duplicate Endpoints

### 2.1 Tmux Session Listing (2 variants)

```
GET /api/tmux/sessions       (api.js:535)   - Simple list
GET /api/tmux/sessions/detailed (api.js:581) - Rich metadata
```

**Status:** DONE - Removed `/api/tmux/list` (was identical to `/sessions`).

### 2.2 File Content Reading (2 variants)

```
GET /api/files/read          (files.js:149)  - Read file by path
GET /api/files/content       (files.js:518)  - Identical logic
```

**Action:** Merge into single `/api/files/read`.

### 2.3 Spawn Options Saving (2 endpoints)

```
PUT  /api/spawn-options            (api.js:183)    - Primary
POST /api/files/write-spawn-options (files.js:648) - Duplicate
```

**Action:** Remove POST duplicate in files.js.

### 2.4 Session Killing (Redundant)

```
DELETE /api/tmux/sessions/:name  (api.js:880) - Single session
DELETE /api/tmux/sessions/bulk   (api.js:836) - Multiple sessions
```

**Status:** Keep both but consider unifying (accept array for single endpoint).

---

## 3. Over-Engineered Modules

### 3.1 ~~Audio Generation Duplication~~ ✅ DONE (Wave 2)

~~**Lines affected:** 210-527 (~150 LOC duplicated)~~

**Completed in commit `3f2cbac`:** Extracted shared audio generation to `backend/modules/audio-generator.js`:
- `stripMarkdown()` function
- VOICE_OPTIONS array
- Voice/rate/pitch validation
- Caching and TTS generation logic

**Savings:** ~250 LOC saved, single source of truth for audio generation.

### 3.2 Handler Pattern in unified-spawn.js

**Lines:** 23-152

Creates handler Map with validate/spawn methods for each terminal type, but each handler just calls `this.spawnTerminal()`. The abstraction adds no value.

**Simplification:** Replace with switch/case dispatch → ~20 LOC reduction

### 3.3 Name Counter Logic (terminal-registry.js)

**Lines:** 49, 58-86, 268, 598-599

Maintains counter state for terminal naming. Overcomplicated.

**Simplification:** Scan existing terminals at spawn time instead → ~30 LOC reduction

### 3.4 ~~WebSocket Boilerplate~~ ✅ DONE (Wave 2)

~~**Lines:** Repeated 30+ times throughout file~~

**Completed in commit `b2dcbea`:** Extracted `makeBrowserRequest()` helper function:

```javascript
async function makeBrowserRequest(type, payload, timeout = 10000) {
  const requestId = `browser-${++requestIdCounter}`;
  const resultPromise = createPromiseWithTimeout(requestId, timeout);
  broadcast({ type, requestId, ...payload });
  return resultPromise;
}
```

**Impact:** ~1,000 LOC saved. browser.js reduced from ~2,200 to ~1,200 lines.

### 3.5 Path Expansion Duplication

`expandTilde()` appears in both:
- `pty-handler.js:24-51`
- `terminal-registry.js:32-43`

**Action:** Extract to shared `pathUtils.js`

---

## 4. Critical Bugs

### 4.1 tui-tools.js Register Method (BROKEN)

**Location:** `backend/modules/tui-tools.js:154`

```javascript
this.terminalRegistry.register()  // NON-EXISTENT METHOD
```

Terminal-registry exports `registerTerminal()`, not `register()`. This code path would crash if executed.

**Status:** Either dead code or broken. Investigate and fix.

---

## 5. Potentially Unused Code

### 5.1 Offline Menu System

**Locations:**
- `terminal-registry.js:101-147` (~50 LOC)
- `unified-spawn.js:449-459` (~10 LOC)

Only triggered if `terminal.isOfflineMenu && data.includes('ACTION:')`. No evidence of active usage.

**Action:** Search codebase for usage. If unused, remove ~60 LOC.

### 5.2 loadAgentConfig() Dead Code

**Location:** `unified-spawn.js:507-519`

Loads config file but does nothing with it. Comments say "applied elsewhere" but unclear where.

**Action:** Remove if no consumers found.

### 5.3 Possibly Unused Endpoints

```
GET /api/tmux/info/:name         (api.js:978)  - Complex naming logic
POST /api/tmux/refresh/:name     (api.js:806)  - Sends empty keys
GET /api/browser/settings        (browser.js:719) - Lighter /profiles duplicate
POST /api/tmux/detach/:name      (api.js:909)  - Niche use case
```

**Action:** Audit frontend for actual callers.

---

## 6. Background Service Worker Issues

### 6.1 Duplicated Command Queue Logic

Commands reach sidebar through 3 different paths with repeated code:
- `keyboard.ts:77-111` and `113-148`
- `contextMenus.ts:121-167`
- `websocket.ts:280-301`

**Action:** Extract `queueCommandToSidebar()` helper → ~50 LOC reduction

### 6.2 Download Polling Pattern (4 locations)

Same `setTimeout(checkDownload, 100)` pattern repeated in:
- `utils.ts:75-110`
- `downloads.ts:73-111`
- `downloads.ts:283-325`
- `screenshots.ts:73-111`

**Action:** Extract `waitForDownloadCompletion()` helper

### 6.3 Browser MCP Handler Routing

**Location:** `websocket.ts:304-532`

36 separate if/else blocks for handler routing.

**Refactor:** Use handler map:
```typescript
const handlers = {
  'browser-list-tabs': handleBrowserListTabs,
  'browser-switch-tab': handleBrowserSwitchTab,
  // ...
};
```

**Impact:** Reduces websocket.ts from 540 to ~250 lines

---

## 7. Recommendations by Priority

### Priority 1: Critical Fixes
| Item | File | Action | Effort |
|------|------|--------|--------|
| tui-tools register bug | tui-tools.js:154 | Fix method name or remove | 5 min |
| Audit offline menu | multiple | Remove if unused | 30 min |

### Priority 2: Major Simplifications (>100 LOC each)
| Item | Files | Action | Savings | Status |
|------|-------|--------|---------|--------|
| Extract WebSocket helper | browser.js | Create `makeBrowserRequest()` | ~1,000 LOC | ✅ Wave 2 |
| Extract audio generation | server.js | Create `audioGenerator.js` | ~250 LOC | ✅ Wave 2 |
| Handler map routing | websocket.ts | Replace if/else chain | ~250 LOC | Pending |

### Priority 3: Consolidate Duplicates
| Item | Action | Savings |
|------|--------|---------|
| Tmux listing endpoints | DONE - Removed /tmux/list | ~40 LOC |
| File reading endpoints | Merge /files/content into /files/read | ~70 LOC |
| Spawn options endpoint | Remove POST duplicate | ~30 LOC |
| Path expansion | Extract to shared module | ~30 LOC |
| Command queue logic | Extract helper function | ~50 LOC |
| Download polling | Extract helper function | ~80 LOC |

### Priority 4: Deprecate REST Browser APIs
| Action | Impact |
|--------|--------|
| Mark browser.js endpoints deprecated | No LOC change |
| Add deprecation notices to docs | Documentation |
| Remove in v1.3.0 | ~2,200 LOC eventually |

---

## 8. Endpoints to Deprecate/Remove

### Immediate Removal
```
GET  /api/tmux/list              → REMOVED (was duplicate of /sessions)
GET  /api/files/content          → Use /api/files/read
POST /api/files/write-spawn-options → Use PUT /api/spawn-options
```

### Deprecate (Keep for Backwards Compatibility)
```
All /api/browser/* endpoints → Use MCP tools instead:
  tabz_list_tabs, tabz_switch_tab, tabz_screenshot, etc.
```

### Consider Removing (After Usage Audit)
```
POST /api/tmux/refresh/:name
POST /api/tmux/detach/:name
GET  /api/browser/settings
GET  /api/tmux/info/:name
```

---

## 9. Architecture Recommendation

### Current State
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ MCP Client  │────▶│  MCP Server │────▶│  Chrome Ext │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
┌─────────────┐     ┌─────────────┐           │
│ REST Client │────▶│   Backend   │───────────┘
└─────────────┘     └─────────────┘     (WebSocket)
```

Both MCP and REST route browser commands through same WebSocket to Chrome Extension.

### Recommended State
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ MCP Client  │────▶│  MCP Server │────▶│  Chrome Ext │
└─────────────┘     └─────────────┘     └─────────────┘
                                        (Browser only)

┌─────────────┐     ┌─────────────┐
│ REST Client │────▶│   Backend   │
└─────────────┘     └─────────────┘
                    (Terminal only)
```

**Clear separation:**
- MCP: All browser automation
- REST: Terminal spawning/management, settings, files

---

## 10. Summary

| Category | Issues Found | LOC Impact | Status |
|----------|-------------|------------|--------|
| Duplicate endpoints | 7 | ~150 | Pending |
| Over-engineered code | 5 | ~200 | Partial |
| Boilerplate duplication | 3 | ~1,200 | ✅ Done |
| Unused/dead code | 4 | ~120 | ✅ Done (Wave 1) |
| Critical bugs | 1 | - | ✅ Done (Wave 1) |
| **Total addressed** | - | **~1,520 LOC** | - |

### Wave 2 Completions

| Item | Commit | LOC Saved |
|------|--------|-----------|
| WebSocket boilerplate extraction | `b2dcbea` | ~1,000 |
| Audio generator extraction | `3f2cbac` | ~250 |

The backend has been significantly simplified. WebSocket boilerplate extracted in browser.js (~1,000 LOC saved), audio generation consolidated (~250 LOC saved). Remaining work: messaging unification and MCP vs REST decision.
