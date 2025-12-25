# TabzChrome Architecture Audit - Executive Summary

**Date:** 2025-12-25

---

## Overall Assessment

| Category | Score | Notes |
|----------|-------|-------|
| **Organization** | 6/10 | Clear layer separation, but feature creep |
| **Maintainability** | 5/10 | Mega-components, scattered state |
| **Type Safety** | 7/10 | Strict mode, but 38 `any` usages |
| **Code Reuse** | 5/10 | Significant duplication |
| **Build System** | 7/10 | Clean Vite config, some unused deps |

**Bottom Line:** Functional codebase showing signs of organic growth. Main issues are **over-abstraction** (MCP 5-layer stack), **duplication** (settings/profiles), and **scattered patterns** (messaging, storage).

---

## Top 5 Simplification Opportunities

### 1. Eliminate MCP Client Layer
**Impact:** HIGH | **Effort:** Medium | **LOC Saved:** ~1,300

The HTTP client layer (`tabz-mcp-server/src/client/*.ts`) is pure boilerplate. Tools can call the backend directly.

```
BEFORE: Tool → Client → HTTP → Backend → WebSocket → Handler (5 layers)
AFTER:  Tool → HTTP → Backend → WebSocket → Handler (4 layers)
```

### 2. Unify Messaging Systems
**Impact:** HIGH | **Effort:** Medium | **Bugs Prevented:** Many

Three message systems (Chrome, WebSocket, Broadcast) with inconsistent naming and no type safety at boundaries. Create single transformation layer.

### 3. Consolidate Profile Management
**Impact:** MEDIUM-HIGH | **Effort:** Low | **LOC Saved:** ~800

Same profile CRUD implemented in SettingsModal AND Dashboard. Extract to shared component.

### 4. Type Storage Access
**Impact:** MEDIUM | **Effort:** Low | **Benefit:** Type Safety

30+ direct `chrome.storage` calls bypass typed helpers. Expand `StorageData` interface and enforce usage.

### 5. Remove Unused Dependencies
**Impact:** LOW | **Effort:** Minimal | **Savings:** 27 MB + 50 KB

- `jsdom` - vitest includes happy-dom
- `@dnd-kit/*` - zero imports found
- Backend jest config - vitest preferred

---

## Complexity Hotspots

| Location | LOC | Issue | Action |
|----------|-----|-------|--------|
| `useTerminalSessions.ts` | 450 | 4 magic refs, 50-line merge | Extract to pure function |
| `Terminal.tsx` | 1,068 | xterm.js integration | Keep - justified |
| `SettingsModal.tsx` | 702 | 4 concerns in 1 component | Split into tab components |
| `browser.js` | 2,212 | All MCP routes in one file | Split by domain |
| MCP tools layer | 4,570 | 37 tools, verbose | Consider removing niche tools |

---

## Feature Creep Candidates

These MCP tools may not justify their maintenance cost:

| Tool Group | Tools | LOC | Concern |
|------------|-------|-----|---------|
| Tab Groups | 8 | 450 | Chrome already has native UI |
| Debugger | 3 | 400 | Code coverage rarely used |
| Network | 3 | 400 | Over-parameterized (8 filters) |

**Consider:** Making these tools optional/loadable vs always-on.

---

## Duplication Map

```
Profile Management
├── extension/components/SettingsModal.tsx (702 LOC)
├── extension/components/settings/ProfilesTab.tsx (1,219 LOC)
└── extension/dashboard/sections/Profiles.tsx (872 LOC)
    = 2,793 LOC for same feature

Dropdown Components
├── ProfileDropdown.tsx (321 LOC)
├── GhostBadgeDropdown.tsx (325 LOC)
└── WorkingDirDropdown.tsx (219 LOC)
    = 80% shared code, no base component

MCP Tool List
├── tabz-mcp-server/src/index.ts (registry)
├── dashboard/sections/McpPlayground.tsx (hardcoded)
└── Backend API config
    = 3 places to update when adding tools
```

---

## Priority Action Items

### Do Now (P0)
- [ ] Create message transformation layer with type safety
- [ ] Remove MCP client layer - call backend directly

### Do Soon (P1)
- [ ] Expand StorageData interface with all keys
- [ ] Extract terminal reconciliation to testable pure function
- [ ] Split SettingsModal into tab components

### Do Later (P2)
- [ ] Extract shared ProfileManager component
- [ ] Remove jsdom, @dnd-kit dependencies
- [ ] Split browser.js into domain-specific route files

### Nice to Have (P3)
- [ ] Extract DropdownBase component
- [ ] Consolidate test directories to single location
- [ ] Document magic timing values (150ms, 300ms)

---

## Estimated Impact

| Action | LOC Removed | LOC Refactored | Type Safety | Maintainability |
|--------|-------------|----------------|-------------|-----------------|
| Remove MCP client | 1,300 | 0 | - | ++ |
| Unify messaging | 0 | 500 | +++ | ++ |
| Consolidate profiles | 800 | 400 | - | ++ |
| Type storage | 0 | 200 | +++ | + |
| Remove unused deps | 0 | 0 | - | + |
| **Total** | **~2,100** | **~1,100** | **+++** | **+++** |

---

## Files Reference

Detailed analysis available in:
- `audit-results/architecture.md` - Full findings with code examples

Key files to examine:
- `extension/hooks/useTerminalSessions.ts` - State reconciliation complexity
- `extension/shared/messaging.ts` - Message type definitions
- `tabz-mcp-server/src/client/` - Candidate for removal
- `extension/components/SettingsModal.tsx` - Candidate for splitting
