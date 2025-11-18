# Spawn Options: JSON vs Hardcoded Analysis

## Current State

### Chrome Extension (Hardcoded)
**Location**: `extension/components/QuickCommandsPanel.tsx`

```typescript
const defaultCommands: Command[] = [
  { label: 'Claude Code', command: 'claude-code', ... },
  { label: 'Bash Terminal', command: 'bash', ... },
  { label: 'TFE', command: 'tfe', ... },
  // ... ~25 commands
]
```

**Pros:**
- ✅ No file loading complexity
- ✅ Type-safe at compile time
- ✅ Fast (no HTTP fetch, already in bundle)
- ✅ Works offline immediately
- ✅ Simpler architecture

**Cons:**
- ❌ Requires rebuild to add/modify commands
- ❌ Users cannot customize without editing source
- ❌ Duplicates spawn options (also in public/spawn-options.json)

### Web App (JSON File)
**Location**: `public/spawn-options.json`

```json
{
  "globalDefaults": {
    "workingDirectory": "/home/matt/projects/terminal-tabs",
    "useTmux": true
  },
  "spawnOptions": [
    { "label": "Bash", "terminalType": "bash", ... },
    // ... ~25 options
  ]
}
```

**Pros:**
- ✅ Users can edit JSON without rebuilding
- ✅ Centralized configuration
- ✅ Can be fetched dynamically
- ✅ Power users can customize easily

**Cons:**
- ❌ Requires HTTP fetch (Chrome extension restrictions)
- ❌ Adds complexity (loading states, error handling)
- ❌ Still needs rebuild to update bundled file

---

## Decision Analysis

### Can Chrome Extensions Load JSON Files?

**Yes, but with caveats:**

1. **Bundled in extension** (via Vite):
   - JSON file copied to `dist-extension/` during build
   - Accessed via `chrome.runtime.getURL('spawn-options.json')`
   - Fetched with `fetch()` API
   - **Still requires rebuild to update** (defeats main benefit)

2. **From external URL**:
   - Requires `host_permissions` in manifest
   - Security concerns (CORS, untrusted sources)
   - Not practical for local configuration

3. **Chrome Storage API**:
   - Could store spawn options in `chrome.storage.local`
   - Editable via settings UI
   - Survives extension updates
   - **Best option for user customization**

---

## Recommendation

### **Option 1: Keep Hardcoded + Add Settings UI (Recommended)**

**Implementation:**
1. Keep default commands hardcoded in `QuickCommandsPanel.tsx`
2. Add "Edit Spawn Options" in Settings modal
3. Store custom spawn options in Chrome storage
4. Merge defaults + custom at runtime

**Why this wins:**
- ✅ Simplest for 95% of users (defaults work out of box)
- ✅ Power users can customize via UI (no JSON editing)
- ✅ No file loading complexity
- ✅ Custom options persist across extension updates
- ✅ No rebuilding required for user customization

**Trade-offs:**
- Developer still edits hardcoded defaults for new releases
- Slightly more UI code for spawn option editor

---

### **Option 2: Use JSON File (Not Recommended)**

**Implementation:**
1. Bundle `spawn-options.json` in `dist-extension/`
2. Load via `fetch(chrome.runtime.getURL('spawn-options.json'))`
3. Parse and use in QuickCommandsPanel

**Why this doesn't win:**
- ❌ Still requires rebuild to update bundled JSON
- ❌ Adds loading complexity (async, error handling)
- ❌ Users can't easily edit bundled extension files
- ❌ No real benefit over hardcoded approach

---

### **Option 3: Hybrid Approach (Future Enhancement)**

**Implementation:**
1. Hardcoded defaults (fast, reliable)
2. Optional JSON import/export in settings
3. Store overrides in Chrome storage

**User workflow:**
1. Extension ships with hardcoded defaults
2. User clicks "Customize Spawn Options"
3. Export current options as JSON → Edit locally → Import
4. Or use visual editor in settings UI

**Benefits:**
- ✅ Best of both worlds
- ✅ Portability (can share spawn configs)
- ✅ No rebuild required for users
- ✅ Fallback to defaults if JSON invalid

---

## Implementation Plan (Option 1)

### Phase 1: Keep Current Hardcoded Approach
- **Status**: ✅ Already implemented
- No changes needed to `QuickCommandsPanel.tsx`

### Phase 2: Add Custom Spawn Options (Future)
1. Update `CommandEditorModal` to support "Spawn Option" commands
2. Store in Chrome storage as `customSpawnOptions`
3. Merge with hardcoded defaults:
   ```typescript
   const allCommands = [...defaultCommands, ...customSpawnOptions]
   ```

### Phase 3: Advanced Features (Optional)
- Import/Export JSON for portability
- Reorder commands (drag-and-drop)
- Disable built-in commands
- Per-project spawn option profiles

---

## Conclusion

**Decision: Keep Hardcoded Approach**

**Rationale:**
1. Chrome extensions make JSON loading complex without real benefits
2. Rebuilding is required either way (hardcoded OR bundled JSON)
3. User customization better served by Chrome storage + UI
4. Simpler architecture = fewer bugs, faster load times

**Next Steps:**
1. ✅ Document current approach in CLAUDE.md
2. ⏭️ Add to PLAN.md: "Phase 2 - Custom Spawn Options UI"
3. ⏭️ Consider hybrid approach for power users (import/export)

---

## Files Modified

- **No changes required** - Current hardcoded approach is optimal
- Future enhancement tracked in PLAN.md

---

**Date**: November 17, 2025
**Decision**: Keep Hardcoded + Plan Settings UI Enhancement
**Status**: Analysis Complete
