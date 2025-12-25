# TabzChrome Architecture Audit

**Date:** 2025-12-25
**Scope:** Full codebase architecture analysis
**Files Analyzed:** 507 source files across extension/, backend/, tabz-mcp-server/

---

## 1. High-Level Architecture Assessment

### Current State

TabzChrome is a **Chrome Extension (Side Panel) + WebSocket backend** for managing bash terminals in the browser. The architecture follows a three-layer pattern:

```
Chrome Extension (React/TypeScript)
    ↕ WebSocket + Chrome Messages
Backend Server (Express + node-pty)
    ↕ HTTP + WebSocket
MCP Server (Claude integration)
```

### Architecture Quality: 6/10

**Strengths:**
- Clear separation between extension, backend, and MCP server
- Well-defined WebSocket protocol for terminal I/O
- Consistent terminal ID format (`ctt-{profile}-{uuid}`)
- Good use of Chrome storage for UI state persistence

**Weaknesses:**
- **Five-layer abstraction** for MCP operations (excessive)
- **Feature creep** in MCP tools (37 tools, many rarely used)
- **Duplication across layers** (types, handlers, tool lists)
- **Inconsistent patterns** for messaging, storage, error handling
- **Mega-components** (Terminal.tsx 1,068 LOC, SettingsModal.tsx 702 LOC)

---

## 2. Top 5 Complexity Hotspots

### Hotspot #1: Terminal State Reconciliation (CRITICAL)
**Location:** `extension/hooks/useTerminalSessions.ts` (450+ LOC)

**Problem:** Complex state reconciliation with 4+ magic refs and 50-line merge logic:
```typescript
const reconnectedTerminalsRef = useRef<Set<string>>(new Set())  // Dedup reconnects
const hasReceivedTerminalsRef = useRef(false)                    // Codex fix
const hasSentListTerminalsRef = useRef(false)                    // Prevent duplicate requests
const hasScheduledRefreshRef = useRef(false)                     // Prevent redraw storms
```

**Impact:**
- New developers need extensive context to understand reconciliation
- Adding features (e.g., terminal sorting) requires careful state management
- Magic 150ms/300ms delays discovered through trial-and-error

**Root Cause:** Edge cases discovered ad-hoc during debugging rather than designed upfront.

---

### ~~Hotspot #2: MCP Five-Layer Abstraction~~ ✅ FIXED (Wave 2)
**Location:** `tabz-mcp-server/` + `backend/routes/browser.js` + `extension/background/browserMcp/`

**Problem (RESOLVED):** ~~Simple operations traversed 5 layers.~~

**Completed in commit `9f255b4`:** Removed entire client/ directory (~1,300 LOC). Now 4 layers:
```
1. MCP tool wrapper (tools/*.ts)           → Input validation, output formatting
2. Backend REST API (routes/browser.js)    → HTTP → WebSocket bridge (boilerplate extracted in b2dcbea)
3. Browser handler (browserMcp/*.ts)       → Chrome API calls
4. Chrome Extension API                    → Actual browser operation
```

**Code Distribution (After Wave 2):**
| Layer | LOC | Purpose | Status |
|-------|-----|---------|--------|
| MCP Tools | 4,570 | Tool definitions | Unchanged |
| ~~Client Modules~~ | ~~1,347~~ | ~~HTTP wrappers~~ | **Removed** |
| Browser Routes | ~1,200 | REST endpoints | Refactored (boilerplate extracted) |
| Browser Handlers | 2,979 | Chrome API | Unchanged |
| **Total** | **~8,750** | Simple browser operations | **-2,300 LOC** |

**Impact:** Reduced from 5 to 4 layers. ~2,300 LOC removed across MCP client and WebSocket boilerplate.

---

### Hotspot #3: Messaging System Fragmentation (HIGH)
**Location:** `extension/shared/messaging.ts`, `extension/background/websocket.ts`, `extension/background/messageHandlers.ts`

**Problem:** Three overlapping message systems:
1. **Chrome Messages** - 55+ typed interfaces in messaging.ts
2. **WebSocket Messages** - Untyped JSON with snake_case names
3. **Broadcast Messages** - Mix of both, wrapped in `WS_MESSAGE`

**Inconsistencies:**
- Chrome uses `SPAWN_TERMINAL`, WebSocket uses `spawn`
- Some messages unwrapped (TERMINAL_OUTPUT), others wrapped (WS_MESSAGE)
- Field mapping duplicated: `workingDir` vs `cwd` with fallback chains
- 50+ if statements in websocket.ts for routing

**Impact:** Adding new message types requires changes in 2-3 places. No compile-time safety for WebSocket layer.

---

### Hotspot #4: Settings/Profile Duplication (MEDIUM-HIGH)
**Location:** `extension/components/SettingsModal.tsx` + `extension/dashboard/sections/Profiles.tsx`

**Problem:** Same features implemented twice:
| Feature | SettingsModal | Dashboard Profiles |
|---------|---------------|-------------------|
| Profile CRUD | Yes | Yes |
| Drag reorder | Yes | Yes |
| Categories | Yes | Yes |
| Import/Export | Yes | No |
| Launch buttons | No | Yes |

**Code Duplication:**
- SettingsModal.tsx: 702 LOC
- Profiles.tsx (dashboard): 872 LOC
- ProfilesTab.tsx (settings): 1,219 LOC
- **Total:** 2,793 LOC for profile management

**Impact:** Edits in one location don't sync to the other. Maintenance burden doubles.

---

### ~~Hotspot #5: Chrome Storage Access Scatter~~ ✅ FIXED (Wave 2)
**Location:** 30+ direct `chrome.storage` calls throughout UI

**Problem (RESOLVED):** ~~Storage accessed directly instead of through typed helpers.~~

**Completed in commit `fed9f93`:** Expanded `StorageData` interface with all storage keys:
- `terminalSessions`, `currentTerminalId`
- `profiles`, `defaultProfile`, `categorySettings`
- `audioSettings`, `commandHistory`

**Additional fix in `b3bef41`:** Extracted `useChromeSetting<T>(key, default)` hook to replace duplicate storage listener patterns.

**Impact:** Full type safety for storage access. Common pattern extracted to reusable hook.

---

## 3. Recommended Simplifications

### 3.1 ~~Reduce MCP Abstraction Layers~~ ✅ DONE (Wave 2)

**Before:** 5 layers → **After:** 4 layers

**Completed in commit `9f255b4`:** Eliminated the HTTP client layer (tabz-mcp-server/src/client/). Tools now call backend directly.

```typescript
// BEFORE: tools/tabs.ts → client/core.ts → HTTP → backend → WebSocket → handler
// AFTER: tools/tabs.ts → HTTP → backend → WebSocket → handler ✓
```

**Savings:** ~1,347 LOC removed, simpler stack traces.

---

### 3.2 Consolidate Message Systems (HIGH PRIORITY)

**Action:** Create single message abstraction with typed transformations:

```typescript
// extension/shared/messageTypes.ts
type ChromeToWebSocket = {
  'SPAWN_TERMINAL': 'spawn',
  'CLOSE_SESSION': 'close',
  // ... complete mapping
}

// extension/background/messageRouter.ts
function routeMessage(msg: ExtensionMessage): WebSocketMessage {
  return transformers[msg.type](msg)
}
```

**Benefits:**
- Single source of truth for message mappings
- Compile-time type safety
- Remove 50+ if statements from websocket.ts

---

### 3.3 Extract Shared Profile Component (MEDIUM PRIORITY)

**Action:** Create single ProfileManager component used by both SettingsModal and Dashboard:

```typescript
// extension/components/profiles/ProfileManager.tsx
interface ProfileManagerProps {
  showLaunchButtons?: boolean  // Dashboard-only
  showImportExport?: boolean   // Settings-only
}
```

**Savings:** ~800 LOC removed through consolidation

---

### 3.4 ~~Expand StorageData Interface~~ ✅ DONE (Wave 2)

**Completed in commit `fed9f93`:** Added all storage keys to typed interface:

```typescript
interface StorageData {
  // All keys now typed
  recentSessions?: SyncedSession[]
  settings?: Settings
  terminalSessions?: TerminalSession[]
  currentTerminalId?: string
  profiles?: Profile[]
  defaultProfile?: string
  categorySettings?: CategorySettings
  audioSettings?: AudioSettings
  commandHistory?: string[]
}
```

**Impact:** Full type safety for all storage access.

---

### 3.5 Extract Dropdown Base Component (LOW PRIORITY)

**Problem:** Three dropdowns (Profile, GhostBadge, WorkingDir) share 80% of code.

**Action:** Create `<DropdownBase>`:
```typescript
interface DropdownBaseProps {
  items: Array<{id: string, label: string}>
  onSelect: (item) => void
  searchable?: boolean
  keyboardNav?: boolean
}
```

**Savings:** ~200 LOC removed

---

## 4. What to Remove vs Refactor

### Remove Entirely

| Item | Location | Reason | LOC |
|------|----------|--------|-----|
| @dnd-kit packages | package.json | Zero imports found | 50 KB bundle |
| jsdom | package.json | happy-dom included with vitest | 27 MB node_modules |
| Backend archive | backend/archive/ | Already archived, YAGNI | 1,052 |
| jest.config.js | backend/ | vitest preferred, duplicate | - |
| Duplicate docs | docs/archive/, docs/archived/ | Consolidate to one | - |

### Refactor (Don't Remove)

| Item | Current State | Target State | Status |
|------|--------------|--------------|--------|
| Terminal.tsx | 1,068 LOC, justified | Keep - complexity inherent to xterm.js | Keep |
| SettingsModal.tsx | 702 LOC, monolithic | Split into tab components | ✅ SettingsContext extracted |
| browser.js | 2,212 LOC, all routes | Split by domain (tabs, screenshots, etc.) | ✅ Boilerplate extracted |
| useTerminalSessions.ts | 450 LOC, complex | Extract reconciliation to pure function | Pending |
| ~~MCP client layer~~ | ~~1,347 LOC~~ | ~~Remove - call backend directly~~ | ✅ **Removed** |

### Consider Removing (Feature Creep)

| MCP Tool Group | Tools | LOC | Usage |
|----------------|-------|-----|-------|
| Tab Groups | 8 tools | 450 | Low - Chrome already has UI |
| Debugger | 3 tools | 400 | Niche - code coverage rarely used |
| Network Monitoring | 3 tools | 400 | Over-parameterized (8 filter options) |

---

## 5. Priority Ranking

### P0 - Critical (Do First)
1. **Consolidate messaging systems** - Prevents bugs, enables type safety
2. ~~**Reduce MCP layers** - Major simplification, 1,300+ LOC removed~~ ✅ Wave 2

### P1 - High Priority
3. ~~**Expand StorageData interface** - Type safety for all storage access~~ ✅ Wave 2
4. **Extract terminal reconciliation** - Make testable, document edge cases
5. ~~**Split SettingsModal** - Reduce component complexity~~ ✅ Wave 2 (SettingsContext)

### P2 - Medium Priority
6. **Extract ProfileManager** - Remove duplication
7. ~~**Remove unused dependencies** - jsdom, @dnd-kit~~ ✅ Wave 1
8. ~~**Split browser.js routes** - Better organization~~ ✅ Wave 2 (boilerplate extracted)

### P3 - Low Priority
9. **Extract DropdownBase** - Nice to have
10. **Consolidate test directories** - Cleanup
11. **Document magic numbers** - 150ms, 300ms delays

---

## Appendix: Code Metrics

### Lines of Code by Layer

| Layer | Files | LOC | Complexity |
|-------|-------|-----|------------|
| Extension Components | 16 | 6,057 | High |
| Extension Hooks | 10 | 5,175 | High |
| Background Workers | 10 | 3,743 | Medium |
| Dashboard | 15 | 7,376 | Medium |
| Backend Routes | 3 | 5,063 | Medium |
| MCP Server | 35 | ~14,500 | High |
| **Total** | **89+** | **~42,000** | - |

### Type Safety Metrics

| Metric | Value |
|--------|-------|
| Exported types | 133 (93 extension + 40 MCP) |
| `any` usages | 38 instances |
| Duplicate types | 3-5 definitions |
| Missing StorageData keys | 10+ |

### Duplication Estimate

| Pattern | Instances | Duplication % |
|---------|-----------|---------------|
| Dropdowns | 3 | 80% shared code |
| Profile forms | 2 | 70% shared code |
| Result types | 6+ | No base type |
| Storage listeners | 30+ | Same pattern |
