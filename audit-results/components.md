# Component Duplication Audit - TabzChrome

**Date:** 2025-12-25
**Scope:** `extension/sidepanel/`, `extension/components/`, `extension/dashboard/`, `extension/shared/`

## Executive Summary

The audit found **5 high-priority duplications** between the sidepanel and dashboard, **3 medium-priority cases**, and **no dead code**. The codebase has good shared utility organization (`extension/shared/`, `settings/types.ts`), but UI components and business logic are frequently reimplemented.

**Estimated consolidation effort:** Medium
**Risk:** Low (UI-only changes, no backend impact)

---

## 1. High-Priority Duplications

### 1.1 Profile Rendering & Selection

| Sidepanel | Dashboard |
|-----------|-----------|
| `ProfileDropdown.tsx` | `Profiles.tsx` + `ProfileCard` + `ProfileListItem` |

**Duplicate Logic:**
- Group profiles by category with collapsible headers
- Apply category colors (from same `CATEGORY_COLORS` constant)
- Full-text search across name, command, category, directory
- Default profile badge display
- Keyboard navigation (arrows, Home/End, Enter, Escape)
- Launch profile with working directory inheritance
- Emoji extraction from profile name

**Sidepanel-specific:**
- Compact dropdown format
- Single-click to spawn

**Dashboard-specific:**
- Grid/list view toggle
- Drag-and-drop reordering
- Edit profile action (opens settings modal)

**Recommendation:**
```
Extract: SharedProfileCard, ProfileGroupHeader, useProfileSearch, useProfileGrouping
Keep separate: ProfileDropdown (compact), ProfileGrid (full-page)
```

**Priority:** HIGH - Most visible duplication, affects user experience consistency

---

### 1.2 Working Directory Selector

| Sidepanel | Dashboard |
|-----------|-----------|
| `WorkingDirDropdown.tsx` | Inline in `App.tsx` |

**Duplicate Logic:**
- Current working directory display
- Recent directories list management
- Dropdown selection with keyboard navigation
- Remove from recent list
- Custom path input with Enter submission
- Tilde (~) expansion
- Backend sync for consistency

**Recommendation:**
```
Extract: SharedWorkingDirSelector component
Props: compact (dropdown) vs expanded (inline) mode
```

**Priority:** HIGH - Divergent behavior risks user confusion

---

### 1.3 MCP Tool Configuration

| Sidepanel | Dashboard |
|-----------|-----------|
| `McpToolsTab.tsx` (in SettingsModal) | `McpPlayground.tsx` |

**Duplicate Logic:**
- Fetch MCP config from `/api/mcp-config`
- Save config to `/api/mcp-config` (POST)
- Tool enable/disable checkboxes
- Category grouping with collapsible sections
- Core tools locked (always enabled)
- Token estimation display
- URL Settings section (Allow All URLs, custom domains)
- Preset buttons (Minimal, Standard, Full)

**Dashboard-specific:**
- MCP Inspector integration (start server, open tab)
- MCP CLI Mode toggle
- Search filtering
- Stats grid (Tools Enabled, Context Tokens)

**Recommendation:**
```
Extract: useMcpConfig hook (fetch/save/presets)
Extract: McpToolList component (checkbox grid by category)
Keep separate: McpPlayground (inspector, CLI mode), McpToolsTab (modal format)
```

**Priority:** HIGH - Config changes in one place don't reflect in other

---

### 1.4 Orphaned Session Management

| Sidepanel | Dashboard |
|-----------|-----------|
| `GhostBadgeDropdown.tsx` | `Terminals.tsx` (inline section) |

**Duplicate Logic:**
- Fetch orphaned sessions from `/api/tmux/orphaned-sessions`
- Multi-select with checkboxes
- Select All toggle
- Kill action with confirmation dialog
- Reattach action
- Session name parsing from `ctt-ProfileName-shortId` format
- Status message display (success/error)
- Keyboard navigation

**Sidepanel-specific:**
- Badge with count, dropdown on click
- Compact list format

**Dashboard-specific:**
- Full table with warning badge header
- Individual row actions

**Recommendation:**
```
Extract: useOrphanedSessions hook (exists, verify coverage)
Extract: OrphanedSessionsList component with compact/expanded prop
```

**Priority:** HIGH - Reattach/kill behavior must be consistent

---

### 1.5 Terminal Status Display

| Sidepanel | Dashboard |
|-----------|-----------|
| Tab emoji in `sidepanel.tsx` | `ActiveTerminalsList.tsx` |

**Shared:** Both use `useClaudeStatus` hook and its exported functions:
- `getStatusEmoji()`, `getStatusText()`, `getFullStatusText()`
- `getToolEmoji()`, `getContextColor()`
- `getRobotEmojis()` for subagent display

**Duplicate Logic:**
- Context percentage color coding (green→yellow→orange→red)
- Status emoji selection
- AI tool badge display

**Dashboard-specific:**
- Status history tracking (last 12 entries)
- Rich hover tooltip with details
- Resizable column headers

**Gap:** Status history is computed in `ActiveTerminalsList` but could be useful in sidepanel hover states.

**Recommendation:**
```
Already good: useClaudeStatus is well-shared
Opportunity: Move status history tracking into hook
```

**Priority:** HIGH - Core feature, must behave identically

---

## 2. Medium-Priority Duplications

### 2.1 Context Menu Actions

| Sidepanel | Dashboard |
|-----------|-----------|
| `SessionContextMenu.tsx` | Inline in `ActiveTerminalsList.tsx` |

**Overlapping Actions:**
- Copy Session ID
- Open in 3D Focus
- View as Text
- Kill Session

**Sidepanel-only:**
- Customize appearance
- Edit Profile
- Open Reference
- Rename Tab
- Detach Session

**Recommendation:**
```
Extract: TerminalContextMenu component with action prop filter
```

**Priority:** MEDIUM - Affects consistency but less user-facing

---

### 2.2 Path Formatting

**Locations:**
- `Terminals.tsx:72` - `compactPath()` inline function
- `ActiveTerminalsList.tsx:234` - Similar inline logic
- `WorkingDirDropdown.tsx:45` - Tilde expansion
- `FileTree.tsx` - Path display logic

**Duplicate Pattern:**
```typescript
const compactPath = (p: string) => p.replace(/^\/home\/[^/]+/, '~');
```

**Recommendation:**
```
Add to extension/shared/utils.ts:
  - compactPath(path: string): string
  - expandPath(path: string): string
```

**Priority:** MEDIUM - Easy win, low effort

---

### 2.3 Relative Time Formatting

**Locations:**
- `extension/shared/utils.ts` - `formatTimestamp()` (exported)
- `ActiveTerminalsList.tsx:270` - `formatRelativeTime()` inline

**Issue:** Dashboard reimplements instead of using shared utility.

**Recommendation:**
```
Replace ActiveTerminalsList.formatRelativeTime with shared formatTimestamp
```

**Priority:** MEDIUM - Already solved, just not used

---

## 3. Well-Organized (No Action Needed)

### 3.1 Profile Types
`extension/components/settings/types.ts` exports:
- `Profile`, `CategorySettings`, `AudioSettings`, `McpTool`
- Used by both sidepanel and dashboard

### 3.2 Messaging
`extension/shared/messaging.ts` - 18 imports across codebase

### 3.3 Storage
`extension/shared/storage.ts` - Session persistence

### 3.4 Claude Status Hook
`extension/hooks/useClaudeStatus.ts` - Well-shared with utility functions

### 3.5 File Browser Components
Dashboard-only (`FileTree`, `FilteredFileList`, `PromptyViewer`) - No sidepanel equivalent

### 3.6 Terminal Component
Sidepanel-only (`Terminal.tsx`) - Dashboard only lists terminals, doesn't render them

---

## 4. Dead Code Analysis

**Finding:** No dead code detected.

All components are actively used:
- Sidepanel: All 11 main components + 5 settings tabs in use
- Dashboard: All 23 component files in use
- Shared: All utilities have active imports

**Note:** Some settings sub-components (`ProfilesTab.tsx`, `AudioTab.tsx`) were not fully analyzed but are referenced from `SettingsModal.tsx`.

---

## 5. Consolidation Strategy

### Phase 1: Quick Wins (Low Risk)
1. **Path utilities** - Add `compactPath`/`expandPath` to `shared/utils.ts`
2. **Use existing formatTimestamp** - Replace inline `formatRelativeTime` in dashboard
3. **Move status history** - Into `useClaudeStatus` hook

### Phase 2: Shared Components
1. **WorkingDirSelector** - Extract with compact/expanded mode
2. **ProfileCard** - Shared component used by both dropdown and grid
3. **OrphanedSessionsList** - Extract with compact/expanded mode
4. **TerminalContextMenu** - Shared with action filter prop

### Phase 3: Shared Hooks
1. **useMcpConfig** - Fetch, save, presets, URL settings
2. **useProfileGrouping** - Category sorting, search filtering
3. **Verify useOrphanedSessions** - Ensure full feature parity

### Phase 4: Consistency Audit
1. Verify keyboard navigation matches in all components
2. Verify action behaviors (kill, reattach) are identical
3. Add integration tests for cross-component consistency

---

## 6. File Reference

### Sidepanel Components (11 main + 5 settings)
| File | Lines | Purpose |
|------|-------|---------|
| `sidepanel/sidepanel.tsx` | ~600 | Root orchestrator |
| `components/Terminal.tsx` | ~500 | xterm.js terminal |
| `components/SettingsModal.tsx` | ~400 | Settings interface |
| `components/ProfileDropdown.tsx` | ~200 | Profile selection |
| `components/WorkingDirDropdown.tsx` | ~180 | Directory selection |
| `components/ChatInputBar.tsx` | ~250 | Multi-target commands |
| `components/SessionContextMenu.tsx` | ~100 | Tab context menu |
| `components/TerminalCustomizePopover.tsx` | ~350 | Per-session appearance |
| `components/GhostBadgeDropdown.tsx` | ~250 | Orphaned sessions |
| `components/ErrorBoundary.tsx` | ~150 | Error handling |

### Dashboard Components (23 files)
| File | Lines | Purpose |
|------|-------|---------|
| `dashboard/App.tsx` | ~400 | Main container + sidebar |
| `dashboard/sections/Home.tsx` | ~200 | Overview stats |
| `dashboard/sections/Profiles.tsx` | ~500 | Profile management |
| `dashboard/sections/Terminals.tsx` | ~400 | Terminal lifecycle |
| `dashboard/sections/Files.tsx` | ~700 | File browser |
| `dashboard/sections/Settings.tsx` | ~200 | Configuration |
| `dashboard/sections/ApiPlayground.tsx` | ~350 | REST API testing |
| `dashboard/sections/McpPlayground.tsx` | ~500 | MCP configuration |
| `dashboard/components/ActiveTerminalsList.tsx` | ~450 | Terminal table |
| `dashboard/components/CaptureViewer.tsx` | ~150 | Output viewer |
| `dashboard/components/files/*.tsx` | ~1200 | File browser components |
| `dashboard/contexts/FilesContext.tsx` | ~300 | File state |

### Shared Utilities
| File | Imports | Purpose |
|------|---------|---------|
| `shared/messaging.ts` | 18 | Chrome extension messaging |
| `shared/storage.ts` | 2 | Chrome storage wrappers |
| `shared/utils.ts` | 8+ | Formatting utilities |
| `components/settings/types.ts` | 10+ | Type definitions |
| `hooks/useClaudeStatus.ts` | 5+ | Status tracking |

---

## 7. Appendix: Import Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         SHARED LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  shared/messaging.ts ←── sidepanel, dashboard, background       │
│  shared/storage.ts   ←── popup, hooks                           │
│  shared/utils.ts     ←── sidepanel, dashboard                   │
│  settings/types.ts   ←── sidepanel, dashboard                   │
│  hooks/useClaudeStatus.ts ←── sidepanel, dashboard              │
└─────────────────────────────────────────────────────────────────┘
                              ↑
          ┌───────────────────┴───────────────────┐
          │                                       │
┌─────────────────────┐               ┌─────────────────────┐
│     SIDEPANEL       │               │     DASHBOARD       │
├─────────────────────┤               ├─────────────────────┤
│ sidepanel.tsx       │               │ App.tsx             │
│ Terminal.tsx        │               │ sections/*.tsx      │
│ SettingsModal.tsx   │               │ components/*.tsx    │
│ ProfileDropdown.tsx │  ← OVERLAP →  │ Profiles.tsx        │
│ WorkingDirDropdown  │  ← OVERLAP →  │ (inline in App)     │
│ GhostBadgeDropdown  │  ← OVERLAP →  │ Terminals.tsx       │
│ SessionContextMenu  │  ← OVERLAP →  │ ActiveTerminalsList │
└─────────────────────┘               └─────────────────────┘
```

---

*Generated by component duplication audit*
