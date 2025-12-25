# TabzChrome Architecture Audit - Executive Summary

**Date:** 2025-12-25

---

## Overall Assessment

| Category | Score | Notes |
|----------|-------|-------|
| **Organization** | 7/10 | Clear layer separation, MCP simplified ✓ |
| **Maintainability** | 6/10 | Audio refactored ✓, settings improved ✓ |
| **Type Safety** | 8/10 | StorageData expanded ✓, strict mode |
| **Code Reuse** | 7/10 | Common hooks extracted ✓ |
| **Build System** | 8/10 | Unused deps removed ✓ |

**Bottom Line:** Wave 2 addressed major issues. MCP layer removed (~1,300 LOC), audio system refactored (544→85 LOC), WebSocket boilerplate extracted (~1,000 LOC), and common hooks consolidated.

---

## Top 5 Simplification Opportunities

### 1. ~~Eliminate MCP Client Layer~~ ✅ DONE (Wave 2)
**Impact:** HIGH | **Effort:** Medium | **LOC Saved:** ~1,300

~~The HTTP client layer (`tabz-mcp-server/src/client/*.ts`) is pure boilerplate. Tools can call the backend directly.~~

**Completed in commit `9f255b4`:** Removed entire client/ directory. Tools now call backend directly.

```
BEFORE: Tool → Client → HTTP → Backend → WebSocket → Handler (5 layers)
AFTER:  Tool → HTTP → Backend → WebSocket → Handler (4 layers) ✓
```

### 2. Unify Messaging Systems
**Impact:** HIGH | **Effort:** Medium | **Bugs Prevented:** Many

Three message systems (Chrome, WebSocket, Broadcast) with inconsistent naming and no type safety at boundaries. Create single transformation layer.

### 3. Consolidate Profile Management
**Impact:** MEDIUM-HIGH | **Effort:** Low | **LOC Saved:** ~800

Same profile CRUD implemented in SettingsModal AND Dashboard. Extract to shared component.

### 4. ~~Type Storage Access~~ ✅ DONE (Wave 2)
**Impact:** MEDIUM | **Effort:** Low | **Benefit:** Type Safety

~~30+ direct `chrome.storage` calls bypass typed helpers. Expand `StorageData` interface and enforce usage.~~

**Completed in commit `fed9f93`:** StorageData interface now includes all storage keys.

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
- [x] Remove MCP client layer - call backend directly ✅ Wave 2

### Do Soon (P1)
- [x] Expand StorageData interface with all keys ✅ Wave 2
- [ ] Extract terminal reconciliation to testable pure function
- [x] Split SettingsModal into tab components ✅ Wave 2 (SettingsContext extracted)

### Do Later (P2)
- [ ] Extract shared ProfileManager component
- [x] Remove jsdom, @dnd-kit dependencies ✅ Wave 1
- [x] Split browser.js into domain-specific route files ✅ Wave 2 (WebSocket boilerplate extracted)

### Nice to Have (P3)
- [ ] Extract DropdownBase component
- [ ] Consolidate test directories to single location
- [ ] Document magic timing values (150ms, 300ms)

---

## Estimated Impact

| Action | LOC Removed | LOC Refactored | Type Safety | Maintainability | Status |
|--------|-------------|----------------|-------------|-----------------|--------|
| Remove MCP client | 1,300 | 0 | - | ++ | ✅ Done |
| Unify messaging | 0 | 500 | +++ | ++ | Pending |
| Consolidate profiles | 800 | 400 | - | ++ | Pending |
| Type storage | 0 | 200 | +++ | + | ✅ Done |
| Remove unused deps | 0 | 0 | - | + | ✅ Done |
| Split useAudioNotifications | 459 | 85 | + | +++ | ✅ Done |
| Extract WebSocket boilerplate | 1,000 | 200 | - | ++ | ✅ Done |
| Extract useChromeSetting | 100 | 50 | + | + | ✅ Done |
| Extract useDragDrop | 50 | 30 | + | + | ✅ Done |
| SettingsContext | 0 | 100 | + | ++ | ✅ Done |
| **Total Completed** | **~2,900** | **~665** | **+++** | **+++** | - |

---

## Files Reference

Detailed analysis available in:
- `audit-results/architecture.md` - Full findings with code examples

Key files to examine:
- `extension/hooks/useTerminalSessions.ts` - State reconciliation complexity
- `extension/shared/messaging.ts` - Message type definitions
- ~~`tabz-mcp-server/src/client/`~~ - **Removed in Wave 2**
- `extension/components/SettingsModal.tsx` - SettingsContext extracted in Wave 2

### Wave 2 Changes Summary

| Change | Commit | Impact |
|--------|--------|--------|
| MCP client removed | `9f255b4` | -1,300 LOC |
| Audio refactored | `bf5ac5e` | 544→85 LOC |
| Audio generator extracted | `3f2cbac` | -250 LOC |
| WebSocket boilerplate | `b2dcbea` | -1,000 LOC |
| useChromeSetting | `b3bef41` | -100 LOC |
| useDragDrop | `da04357` | -50 LOC |
| StorageData expanded | `fed9f93` | Type safety |
| SettingsContext | `8570f66` | Reduced prop drilling |
