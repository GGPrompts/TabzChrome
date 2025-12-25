# Hooks & State Management Audit

**Date:** 2025-12-25
**Scope:** `extension/hooks/`, `extension/dashboard/`, `extension/components/`, `extension/sidepanel/`

---

## Executive Summary

The TabzChrome codebase has **functional but complex** state management with several consolidation opportunities. Key findings:

| Metric | Value | Assessment |
|--------|-------|------------|
| Total hooks (extension) | 10 | Appropriate count |
| Total hooks (dashboard) | 2 | Minimal |
| Contexts | 1 (FilesContext) | Good |
| Very complex hooks (500+ lines) | 2 | Needs attention |
| Duplicate patterns found | 7+ | High priority |
| Component with 14+ useState | 1 | Refactor candidate |

**Top 3 Issues:**
1. ~~`useAudioNotifications.ts` (544 lines) - Too many concerns~~ ✅ Split in Wave 2 (544→85 LOC)
2. `useTerminalSessions.ts` (467 lines) - Complex reconciliation logic
3. ~~Duplicate close-on-outside-click pattern (7+ occurrences)~~ ✅ Fixed in Wave 1 (useOutsideClick)

---

## 1. Hook Complexity Analysis

### Extension Hooks (`extension/hooks/`)

| Hook | Lines | State | Refs | Complexity |
|------|-------|-------|------|------------|
| useCommandHistory | 107 | 3 | 0 | Simple |
| useTabDragDrop | 119 | 2 | 0 | Simple |
| useChatInput | 247 | 5 | 1 | Moderate |
| useKeyboardShortcuts | 193 | 0 | 3 | Moderate |
| useOrphanedSessions | 182 | 4 | 1 | Moderate |
| useWorkingDirectory | 161 | 3 | 2 | Moderate |
| useProfiles | 237 | 4 | 1 | Complex |
| useClaudeStatus | 483 | 2 | 3 | Complex |
| **useTerminalSessions** | 467 | 4 | 5 | **Very Complex** |
| **useAudioNotifications** | 544 | 3 | 8 | **Very Complex** |

### Dashboard Hooks (`extension/dashboard/hooks/`)

| File | Type | Purpose |
|------|------|---------|
| useDashboard.ts | Utility module | API wrappers (not a React hook) |
| useFileViewerSettings.ts | React hook | Font/display settings |

### Dashboard Contexts (`extension/dashboard/contexts/`)

| Context | Lines | State Vars | Assessment |
|---------|-------|------------|------------|
| FilesContext | 399 | 8 | Medium-High complexity |

---

## 2. Specific Duplication Instances

### 2.1 Close-on-Outside-Click Pattern (HIGH PRIORITY)

**7+ identical implementations** of this 11-line pattern:

```typescript
useEffect(() => {
  if (!showDropdown) return
  const handleClick = () => setShowDropdown(false)
  const timer = setTimeout(() => {
    document.addEventListener('click', handleClick)
  }, 100)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('click', handleClick)
  }
}, [showDropdown])
```

**Locations:**
- `extension/sidepanel/sidepanel.tsx:427-453` (showDirDropdown)
- `extension/sidepanel/sidepanel.tsx:440-453` (showGhostDropdown)
- `extension/sidepanel/sidepanel.tsx:456-472` (showProfileDropdown)
- `extension/sidepanel/sidepanel.tsx:475-490` (showEmptyStateDropdown)
- `extension/components/TerminalCustomizePopover.tsx:53-71`
- `extension/hooks/useChatInput.ts:60-70` (showTargetDropdown)
- `extension/hooks/useChatInput.ts:73-83` (showHistoryDropdown)

**Fix:** Extract `useOutsideClick(isOpen, onClose)` hook.

---

### 2.2 ~~Chrome Storage Listener Pattern~~ ✅ DONE (Wave 2)

~~**5+ hooks** repeat this pattern:~~

```typescript
useEffect(() => {
  chrome.storage.local.get([key], (result) => {
    setValue(result[key] || defaultValue)
  })
}, [])

useEffect(() => {
  chrome.storage.onChanged.addListener(handleStorageChange)
  return () => chrome.storage.onChanged.removeListener(handleStorageChange)
}, [])
```

**Completed in commit `b3bef41`:** Extracted `useChromeSetting<T>(key, defaultValue)` hook (~100 LOC saved).

---

### 2.3 Working Directory Inheritance (MEDIUM PRIORITY)

**4 occurrences** of this logic:

```typescript
const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
  ? profile.workingDir
  : globalWorkingDir
```

**Locations:**
- `extension/sidepanel/sidepanel.tsx:547-566` (handleSpawnProfile)
- `extension/sidepanel/sidepanel.tsx:500-545` (handleSpawnDefaultProfile)
- `extension/dashboard/sections/Profiles.tsx:123-138` (launchProfile)
- `extension/hooks/useKeyboardShortcuts.ts:63-66, 140-143, 166-169`

**Fix:** Extract `getEffectiveWorkingDir(profile, globalDir)` utility.

---

### 2.4 API Endpoint Definitions (LOW PRIORITY)

Duplicated between `useDashboard.ts` and `useOrphanedSessions.ts`:
- `/api/tmux/orphaned-sessions`
- `/api/tmux/reattach`
- `/api/tmux/sessions/bulk`

**Fix:** Create centralized API client module.

---

### 2.5 ~~Drag-and-Drop State Pattern~~ ✅ DONE (Wave 2)

~~**Identical pattern** in 2 places:~~

```typescript
const [draggedItem, setDraggedItem] = useState<T | null>(null)
const [dragOverItem, setDragOverItem] = useState<T | null>(null)
const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
```

**Completed in commit `da04357`:** Extracted `useDragDrop<T>()` hook (~50 LOC saved).

---

## 3. Recommended Consolidation

### Priority 1: Extract Common Hooks (HIGH IMPACT) ✅ DONE

| New Hook | Replaces | Lines Saved | Status |
|----------|----------|-------------|--------|
| `useOutsideClick(isOpen, onClose)` | 7 duplicate useEffects | ~70 lines | ✅ Wave 1 |
| `useChromeSetting<T>(key, default)` | 5 duplicate patterns | ~100 lines | ✅ Wave 2 |
| `useDragDrop<T>()` | 3 duplicate patterns | ~50 lines | ✅ Wave 2 |

**Completed:** All three hooks extracted. ~220 lines removed across codebase.

---

### Priority 2: Split useAudioNotifications (HIGH IMPACT) ✅ DONE (Wave 2)

~~Current: 544 lines, 8 refs, 5 effects~~

**Completed in commit `bf5ac5e`:** Split into focused modules:
| New Hook/Module | Purpose | Actual Lines |
|-----------------|---------|--------------|
| `useAudioNotifications.ts` | Main hook (orchestrator) | 85 |
| `useAudioPlayback.ts` | Audio API, debouncing | ~80 |
| `useStatusTransitions.ts` | Status change detection | ~100 |
| `useToolAnnouncements.ts` | Tool announcement logic | ~80 |
| `constants/audioVoices.ts` | VOICE_POOL, thresholds | ~50 |
| `utils/textFormatting.ts` | stripEmojis, etc. | ~20 |

**Result:** 544 LOC → 85 LOC main hook + 5 focused modules.

---

### Priority 3: Reduce useTerminalSessions (MEDIUM IMPACT)

Current: 467 lines with 120-line reconciliation block

**Extract:**
| Module | Purpose | Est. Lines |
|--------|---------|------------|
| `reconcileTerminals()` | Session/backend merge | ~80 |
| `matchProfileByName()` | Profile recovery logic | ~40 |
| `utils/sessionHelpers.ts` | Sanitization, timing | ~30 |

---

### Priority 4: Simplify Sidepanel Component (MEDIUM IMPACT)

Current: `sidepanel.tsx` has 14 useState hooks

**Group into:**
```typescript
// Before: 14 separate useState calls
const [showDirDropdown, setShowDirDropdown] = useState(false)
const [showProfileDropdown, setShowProfileDropdown] = useState(false)
// ... 12 more

// After: Logical groupings
const dropdowns = useDropdowns(['dir', 'profile', 'ghost', 'emptyState'])
const menus = useMenus(['context', 'customize'])
const tooltips = useTooltip(400, 150)
```

---

### Priority 5: FilesContext Split (LOW-MEDIUM IMPACT)

Current: 399 lines handling files + filtering + favorites

**Split into:**
| New Context | Purpose |
|-------------|---------|
| FileUIContext | openFiles, activeFileId, pinned |
| FileFilterContext | activeFilter, filteredFiles |
| FileFavoritesContext | favorites, toggleFavorite |

---

## 4. Simplification Opportunities

### 4.1 Derived State Not Memoized

**Issue:** Computed values recalculated on every render

**Locations:**
- `sidepanel.tsx:1204-1206` - defaultProfileId from profiles
- `sidepanel.tsx:1198-1206` - effectiveProfile computation
- `sidepanel.tsx:1393-1395` - workingDir tooltip value

**Fix:** Wrap in `useMemo()`:
```typescript
const effectiveProfile = useMemo(() =>
  profiles.find(p => p.id === session.profile?.id) || defaultProfile,
  [profiles, session.profile?.id, defaultProfile]
)
```

---

### 4.2 ~~SettingsModal Prop Drilling~~ ✅ DONE (Wave 2)

~~**Issue:** Modal passes 10+ props to each tab component~~

**Completed in commit `8570f66`:** Created `SettingsContext` to reduce prop drilling. Extracted `ModalUI` component.

---

### 4.3 ~~Hardcoded API URLs~~ ✅ DONE (Wave 1)

~~**Issue:** `http://localhost:8129` appears 10+ times~~

**Completed:** Extracted `API_BASE` to `extension/shared/utils.ts` and replaced all occurrences.

---

### 4.4 Magic Numbers

**Issue:** Timeout values scattered without explanation

**Examples:**
- 30000ms ready announcement cooldown (`useAudioNotifications.ts`)
- 3000ms audio debounce
- 5000ms tool announcement window
- 150ms reconnection stagger
- 100ms dropdown close delay

**Fix:** Extract to named constants:
```typescript
const READY_ANNOUNCEMENT_COOLDOWN = 30000
const AUDIO_DEBOUNCE_MS = 3000
const RECONNECTION_STAGGER_MS = 150
```

---

## 5. Priority Ranking

| Priority | Task | Impact | Effort | Files Affected | Status |
|----------|------|--------|--------|----------------|--------|
| **P1** | Extract `useOutsideClick` | High | Low | 7 files | ✅ Wave 1 |
| **P1** | Extract `useChromeSetting` | High | Medium | 5 hooks | ✅ Wave 2 |
| **P2** | Split `useAudioNotifications` | High | High | 1 hook → 5 modules | ✅ Wave 2 |
| **P2** | Create API constants | Medium | Low | 10+ files | ✅ Wave 1 |
| **P3** | Extract `getEffectiveWorkingDir` | Medium | Low | 4 files | ✅ Wave 1 |
| **P3** | Reduce `useTerminalSessions` | Medium | Medium | 1 hook → 3 modules | Pending |
| **P4** | Simplify sidepanel useState | Medium | Medium | 1 file | Pending |
| **P4** | Split FilesContext | Low-Med | Medium | 1 context → 3 | Pending |
| **P5** | Extract magic numbers | Low | Low | 5+ files | Pending |
| **P5** | SettingsModal context | Low | Medium | 1 file | ✅ Wave 2 |

---

## 6. Risk Assessment

### High Risk (Careful Testing Required)

| Hook | Risk | Reason |
|------|------|--------|
| useTerminalSessions | Breaking WebSocket | Protocol handling, dedup refs |
| useAudioNotifications | Audio timing bugs | Debounce, hysteresis logic |
| useProfiles | Migration breaks | Profile schema handling |

### Low Risk (Safe to Refactor)

| Hook | Reason |
|------|--------|
| useCommandHistory | Self-contained, simple |
| useTabDragDrop | Pure UI state |
| useFileViewerSettings | Simple storage sync |

---

## 7. Quick Wins

These changes can be made immediately with minimal risk:

1. **Extract API_BASE constant** - 10 minutes, no behavior change
2. **Extract `getEffectiveWorkingDir`** - 15 minutes, pure function
3. **Add useMemo to derived state** - 20 minutes, performance only
4. **Document magic numbers** - 10 minutes, comments only

---

## Appendix: Files Analyzed

### Extension Hooks
- `/home/matt/projects/TabzChrome/extension/hooks/useCommandHistory.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useTabDragDrop.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useChatInput.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useKeyboardShortcuts.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useOrphanedSessions.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useWorkingDirectory.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useProfiles.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useClaudeStatus.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useTerminalSessions.ts`
- `/home/matt/projects/TabzChrome/extension/hooks/useAudioNotifications.ts`

### Dashboard
- `/home/matt/projects/TabzChrome/extension/dashboard/hooks/useDashboard.ts`
- `/home/matt/projects/TabzChrome/extension/dashboard/hooks/useFileViewerSettings.ts`
- `/home/matt/projects/TabzChrome/extension/dashboard/contexts/FilesContext.tsx`

### Components
- `/home/matt/projects/TabzChrome/extension/sidepanel/sidepanel.tsx`
- `/home/matt/projects/TabzChrome/extension/components/SettingsModal.tsx`
- `/home/matt/projects/TabzChrome/extension/components/TerminalCustomizePopover.tsx`
- `/home/matt/projects/TabzChrome/extension/dashboard/sections/Files.tsx`
- `/home/matt/projects/TabzChrome/extension/dashboard/sections/Profiles.tsx`
- `/home/matt/projects/TabzChrome/extension/dashboard/components/files/FileTree.tsx`
